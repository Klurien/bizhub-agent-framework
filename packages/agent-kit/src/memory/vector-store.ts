import type { MemoryEntry, MemoryStore, MemoryType } from "./types.js";

let chromadbModule: unknown = null;

const CHROMADB_PKG = "chromadb";

async function getChromaClient(path: string) {
  if (!chromadbModule) {
    chromadbModule = await import(/* @vite-ignore */ CHROMADB_PKG).catch(() => null);
  }
  if (!chromadbModule) return null;
  const mod = chromadbModule as { ChromaClient: new (opts: { path: string }) => unknown };
  return new mod.ChromaClient({ path });
}

async function getOrCreateCollection(client: unknown, name: string) {
  const c = client as {
    getOrCreateCollection: (opts: {
      name: string;
    }) => Promise<{
      get: (opts?: Record<string, unknown>) => Promise<{
        ids: string[];
        metadatas: (Record<string, unknown> | null)[] | null;
      }>;
      add: (opts: {
        ids: string[];
        embeddings?: number[][];
        metadatas?: Record<string, unknown>[];
      }) => Promise<void>;
      delete: (opts: { where: Record<string, unknown> }) => Promise<void>;
      query: (opts: Record<string, unknown>) => Promise<{
        ids: string[][];
        metadatas: (Record<string, unknown> | null)[][] | null;
      }>;
    }>;
  };
  return c.getOrCreateCollection({ name });
}

function generateEmbedding(text: string): number[] {
  const chars = text.split("").map((c) => c.charCodeAt(0));
  const embedding = new Array(128).fill(0);
  for (let i = 0; i < chars.length; i++) {
    embedding[i % 128] += chars[i] / 255;
  }
  const magnitude = Math.sqrt(embedding.reduce((s, v) => s + v * v, 0));
  if (magnitude > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= magnitude;
    }
  }
  return embedding;
}

export function createVectorMemoryStore(
  path: string,
  collectionName?: string
): MemoryStore {
  const colName = collectionName || "agent_memories";

  return {
    async get(key: string) {
      const client = await getChromaClient(path);
      if (!client) {
        return null;
      }
      try {
        const collection = await getOrCreateCollection(client, colName);
        const results = await collection.get({
          where: { key },
          limit: 1,
        });
        if (results.metadatas?.[0]) {
          const meta = results.metadatas[0] as Record<string, string>;
          return JSON.parse(meta.value || "null");
        }
        return null;
      } catch {
        return null;
      }
    },

    async set(key: string, value: unknown, ttl?: number) {
      const client = await getChromaClient(path);
      if (!client) return;
      try {
        const collection = await getOrCreateCollection(client, colName);
        const valueStr = JSON.stringify(value);
        await collection.add({
          ids: [key],
          embeddings: [generateEmbedding(valueStr)],
          metadatas: [
            {
              key,
              value: valueStr,
              ttl: ttl ? String(ttl) : "",
              created: new Date().toISOString(),
              lastAccessed: new Date().toISOString(),
              accessCount: "0",
              importance: "0.5",
            },
          ],
        });
      } catch {
        // ChromaDB not available
      }
    },

    async delete(key: string) {
      const client = await getChromaClient(path);
      if (!client) return;
      try {
        const collection = await getOrCreateCollection(client, colName);
        await collection.delete({ where: { key } });
      } catch {
        // ChromaDB not available
      }
    },

    async list(prefix: string) {
      const client = await getChromaClient(path);
      if (!client) return [];
      try {
        const collection = await getOrCreateCollection(client, colName);
        const all = await collection.get();
        const results: { key: string; value: unknown }[] = [];
        for (let i = 0; i < all.ids.length; i++) {
          const meta = all.metadatas?.[i];
          if (!meta) continue;
          const key = meta.key as string;
          if (key.startsWith(prefix)) {
            results.push({
              key,
              value: JSON.parse((meta.value as string) || "null"),
            });
          }
        }
        return results;
      } catch {
        return [];
      }
    },

    async search(query: string, limit = 10) {
      const client = await getChromaClient(path);
      if (!client) return [];
      try {
        const collection = await getOrCreateCollection(client, colName);
        const queryEmbedding = generateEmbedding(query);
        const results = await collection.query({
          queryEmbeddings: [queryEmbedding],
          nResults: limit,
        });
        const entries: MemoryEntry[] = [];
        const metadatas = results.metadatas?.[0] || [];
        for (let i = 0; i < metadatas.length; i++) {
          const m = metadatas[i];
          if (!m) continue;
          const meta = m as Record<string, string>;
          entries.push({
            id: meta.key,
            type: (meta.type || "short_term") as MemoryType,
            key: meta.key,
            value: JSON.parse(meta.value || "null"),
            metadata: {
              agentId: meta.agentId || "unknown",
              importance: parseFloat(meta.importance || "0.5"),
              created: new Date(meta.created || Date.now()),
              lastAccessed: new Date(meta.lastAccessed || Date.now()),
              accessCount: parseInt(meta.accessCount || "0", 10),
            },
          });
        }
        return entries;
      } catch {
        return [];
      }
    },

    async prune(type?: MemoryType) {
      const client = await getChromaClient(path);
      if (!client) return 0;
      try {
        const collection = await getOrCreateCollection(client, colName);
        const all = await collection.get();
        let removed = 0;
        for (let i = 0; i < all.ids.length; i++) {
          const meta = all.metadatas?.[i];
          if (!meta) continue;
          const m = meta as Record<string, string>;
          if (type && m.type !== type) continue;
          const ttl = m.ttl ? parseInt(m.ttl, 10) : null;
          const created = new Date(m.created || 0).getTime();
          const importance = parseFloat(m.importance || "0");
          if ((ttl && Date.now() - created > ttl) || importance < 0.1) {
            await collection.delete({ where: { key: m.key } });
            removed++;
          }
        }
        return removed;
      } catch {
        return 0;
      }
    },

    async stats() {
      const client = await getChromaClient(path);
      if (!client) return { total: 0, byType: {} };
      try {
        const collection = await getOrCreateCollection(client, colName);
        const all = await collection.get();
        const byType: Record<string, number> = {};
        for (const meta of all.metadatas || []) {
          if (!meta) continue;
          const type = (meta as Record<string, string>).type || "unknown";
          byType[type] = (byType[type] || 0) + 1;
        }
        return { total: all.ids.length, byType };
      } catch {
        return { total: 0, byType: {} };
      }
    },
  };
}
