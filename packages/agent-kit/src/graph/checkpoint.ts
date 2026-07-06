import type { Checkpointer } from "./types.js";

export class InMemoryCheckpointer implements Checkpointer {
  private store = new Map<string, { state: unknown; updatedAt: number }>();

  async save(namespace: string, key: string, state: unknown): Promise<void> {
    this.store.set(`${namespace}:${key}`, {
      state,
      updatedAt: Date.now(),
    });
  }

  async load(namespace: string, key: string): Promise<unknown | null> {
    const entry = this.store.get(`${namespace}:${key}`);
    return entry?.state ?? null;
  }

  async list(
    namespace: string
  ): Promise<{ key: string; state: unknown }[]> {
    const results: { key: string; state: unknown }[] = [];
    for (const [fullKey, entry] of this.store) {
      if (fullKey.startsWith(`${namespace}:`)) {
        results.push({
          key: fullKey.slice(namespace.length + 1),
          state: entry.state,
        });
      }
    }
    return results;
  }

  async cleanup(olderThan: Date): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (entry.updatedAt < olderThan.getTime()) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  clear(): void {
    this.store.clear();
  }
}
