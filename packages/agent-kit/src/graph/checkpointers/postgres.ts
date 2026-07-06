import type { Checkpointer } from "../types.js";

export class PostgresCheckpointer implements Checkpointer {
  private pool: unknown;
  private tableName: string;
  private connectionString: string;
  private initialized = false;

  constructor(connectionString: string, tableName = "agent_checkpoints") {
    this.connectionString = connectionString;
    this.tableName = tableName;
  }

  private async getPool(): Promise<unknown> {
    if (!this.pool) {
      const pg = await import("pg");
      this.pool = new pg.Pool({ connectionString: this.connectionString });
    }
    return this.pool;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const pool = (await this.getPool()) as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    };
    await pool.query(
      `CREATE TABLE IF NOT EXISTS ${this.tableName} (
        namespace VARCHAR(255) NOT NULL,
        key VARCHAR(255) NOT NULL,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (namespace, key)
      )`
    );
    this.initialized = true;
  }

  async save(namespace: string, key: string, state: unknown): Promise<void> {
    if (!this.initialized) await this.initialize();
    const pool = (await this.getPool()) as {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    };
    await pool.query(
      `INSERT INTO ${this.tableName} (namespace, key, state, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (namespace, key)
       DO UPDATE SET state = $3, updated_at = NOW()`,
      [namespace, key, JSON.stringify(state)]
    );
  }

  async load(namespace: string, key: string): Promise<unknown | null> {
    if (!this.initialized) await this.initialize();
    const pool = (await this.getPool()) as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: { state: unknown }[] }>;
    };
    const result = await pool.query(
      `SELECT state FROM ${this.tableName} WHERE namespace = $1 AND key = $2`,
      [namespace, key]
    );
    return result.rows[0]?.state || null;
  }

  async list(
    namespace: string
  ): Promise<{ key: string; state: unknown }[]> {
    if (!this.initialized) await this.initialize();
    const pool = (await this.getPool()) as {
      query: (sql: string, params?: unknown[]) => Promise<{ rows: { key: string; state: unknown }[] }>;
    };
    const result = await pool.query(
      `SELECT key, state FROM ${this.tableName}
       WHERE namespace = $1 ORDER BY updated_at DESC`,
      [namespace]
    );
    return result.rows.map((r) => ({ key: r.key, state: r.state }));
  }

  async cleanup(olderThan: Date): Promise<number> {
    if (!this.initialized) await this.initialize();
    const pool = (await this.getPool()) as {
      query: (sql: string, params?: unknown[]) => Promise<{ rowCount: number | null }>;
    };
    const result = await pool.query(
      `DELETE FROM ${this.tableName} WHERE updated_at < $1`,
      [olderThan]
    );
    return result.rowCount || 0;
  }

  async close(): Promise<void> {
    if (this.pool) {
      const pool = this.pool as { end: () => Promise<void> };
      await pool.end();
      this.pool = null;
    }
  }
}
