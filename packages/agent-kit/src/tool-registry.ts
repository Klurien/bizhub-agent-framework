import type { ToolDefinition, MiddlewareFn, ToolContext, ToolResult } from "./types.js";
import { randomUUID } from "node:crypto";

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();
  private middleware: MiddlewareFn[] = [];
  private eventHandlers = new Map<string, Set<(event: unknown) => Promise<void>>>();

  register(tool: ToolDefinition): this {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  registerMany(tools: ToolDefinition[]): this {
    for (const tool of tools) {
      this.register(tool);
    }
    return this;
  }

  use(fn: MiddlewareFn): this {
    this.middleware.push(fn);
    return this;
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  listByPermission(permissions: string[]): ToolDefinition[] {
    return this.list().filter(
      (t) =>
        !t.permissions ||
        t.permissions.length === 0 ||
        t.permissions.some((p) => permissions.includes(p))
    );
  }

  async execute(
    name: string,
    args: Record<string, unknown>,
    ctx?: Partial<ToolContext>
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { success: false, error: `Tool '${name}' not found` };
    }

    if (tool.deprecated) {
      console.warn(`[bizhub] Warning: tool '${name}' is deprecated`);
    }

    const context: ToolContext = {
      requestId: randomUUID(),
      agentId: ctx?.agentId || "unknown",
      session: ctx?.session || {
        userId: "anonymous",
        role: "viewer",
        permissions: [],
      },
      metadata: ctx?.metadata || {},
      signal: ctx?.signal,
    };

    const start = performance.now();

    const executeTool = async (): Promise<ToolResult> => {
      try {
        const parsed = tool.schema.parse(args);
        const result = await tool.handler(parsed, context);
        return {
          ...result,
          duration: Math.round(performance.now() - start),
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        return {
          success: false,
          error: message,
          duration: Math.round(performance.now() - start),
        };
      }
    };

    // Apply middleware chain
    const runMiddleware = async (index: number): Promise<ToolResult> => {
      if (index < this.middleware.length) {
        return this.middleware[index](tool, args, context, () =>
          runMiddleware(index + 1)
        );
      }
      return executeTool();
    };

    const result = await runMiddleware(0);

    // Emit tool execution event
    await this.emit("tool:executed", {
      tool: name,
      success: result.success,
      duration: result.duration,
      error: result.error,
    });

    return result;
  }

  // ─── Events ────────────────────────────────────────────────

  on(event: string, handler: (event: unknown) => Promise<void>): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  private async emit(event: string, payload: unknown): Promise<void> {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      await Promise.all(
        Array.from(handlers).map((h) =>
          h(payload).catch((err) =>
            console.error(`[bizhub] Event handler error:`, err)
          )
        )
      );
    }
  }
}
