import { randomUUID } from "node:crypto";

export interface Session {
  id: string;
  createdAt: number;
  lastActive: number;
  metadata: Record<string, unknown>;
}

export class McpSessionStore {
  private sessions = new Map<string, Session>();
  private readonly TTL_MS = 30 * 60 * 1000;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  create(metadata?: Record<string, unknown>): Session {
    const id = randomUUID();
    const session: Session = {
      id,
      createdAt: Date.now(),
      lastActive: Date.now(),
      metadata: metadata || {},
    };
    this.sessions.set(id, session);
    this.ensureCleanup();
    return session;
  }

  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) {
      session.lastActive = Date.now();
    }
    return session;
  }

  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  list(): Session[] {
    return Array.from(this.sessions.values());
  }

  async cleanup(olderThan?: Date): Promise<number> {
    const cutoff = olderThan || new Date(Date.now() - this.TTL_MS);
    let removed = 0;
    for (const [id, session] of this.sessions) {
      if (session.lastActive < cutoff.getTime()) {
        this.sessions.delete(id);
        removed++;
      }
    }
    return removed;
  }

  private ensureCleanup(): void {
    if (!this.cleanupTimer) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup().catch(() => {});
      }, 60_000);
      this.cleanupTimer.unref();
    }
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.sessions.clear();
  }
}
