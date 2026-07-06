import type { Checkpointer } from "../types.js";

export class RedisCheckpointer implements Checkpointer {
  private client: unknown;
  private prefix: string;
  private url: string;
  private initialized = false;

  constructor(url: string, prefix = "ckpt:") {
    this.url = url;
    this.prefix = prefix;
  }

  private async getClient(): Promise<unknown> {
    if (!this.client) {
      const redis = await import("redis");
      this.client = redis.createClient({ url: this.url });
      await (this.client as { connect: () => Promise<void> }).connect();
    }
    return this.client;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.getClient();
    this.initialized = true;
  }

  async save(namespace: string, key: string, state: unknown): Promise<void> {
    if (!this.initialized) await this.initialize();
    const client = (await this.getClient()) as {
      set: (k: string, v: string, opts: { EX: number }) => Promise<unknown>;
    };
    await client.set(
      `${this.prefix}${namespace}:${key}`,
      JSON.stringify(state),
      { EX: 86400 }
    );
  }

  async load(namespace: string, key: string): Promise<unknown | null> {
    if (!this.initialized) await this.initialize();
    const client = (await this.getClient()) as {
      get: (k: string) => Promise<string | null>;
    };
    const data = await client.get(`${this.prefix}${namespace}:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async list(
    namespace: string
  ): Promise<{ key: string; state: unknown }[]> {
    if (!this.initialized) await this.initialize();
    const client = (await this.getClient()) as {
      keys: (pattern: string) => Promise<string[]>;
      get: (k: string) => Promise<string | null>;
    };
    const keys = await client.keys(`${this.prefix}${namespace}:*`);
    const results = await Promise.all(
      keys.map(async (k: string) => {
        const data = await client.get(k);
        const key = (k as string).replace(
          `${this.prefix}${namespace}:`,
          ""
        );
        return { key, state: data ? JSON.parse(data) : null };
      })
    );
    return results.filter((r) => r.state !== null);
  }

  async clear(namespace: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    const client = (await this.getClient()) as {
      keys: (pattern: string) => Promise<string[]>;
      del: (...keys: string[]) => Promise<number>;
    };
    const keys = await client.keys(`${this.prefix}${namespace}:*`);
    if (keys.length > 0) {
      await client.del(...keys);
    }
  }

  async close(): Promise<void> {
    if (this.client) {
      const client = this.client as { disconnect: () => Promise<void> };
      await client.disconnect();
      this.client = null;
    }
  }
}
