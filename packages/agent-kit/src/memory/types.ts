export enum MemoryType {
  SHORT_TERM = "short_term",
  LONG_TERM = "long_term",
  EPISODIC = "episodic",
  PROCEDURAL = "procedural",
}

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  key: string;
  value: unknown;
  metadata: {
    agentId: string;
    userId?: string;
    sessionId?: string;
    importance: number;
    created: Date;
    lastAccessed: Date;
    accessCount: number;
    ttl?: number;
  };
}

export interface MemoryStore {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<{ key: string; value: unknown }[]>;
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  prune(type?: MemoryType): Promise<number>;
  stats(): Promise<{ total: number; byType: Record<string, number> }>;
}
