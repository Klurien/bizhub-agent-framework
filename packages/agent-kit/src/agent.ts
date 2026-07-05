import { ToolRegistry } from "./tool-registry.js";
import { allTools } from "./tools/index.js";
import { logging, audit } from "./middleware/index.js";
import type {
  AgentConfig,
  ToolDefinition,
  MiddlewareFn,
  MemoryProvider,
  ToolResult,
} from "./types.js";

export class BizHubAgent {
  public readonly tools: ToolRegistry;
  public readonly config: Required<AgentConfig>;

  constructor(config?: AgentConfig) {
    this.config = {
      name: config?.name || "bizhub-agent",
      version: config?.version || "1.0.0",
      description: config?.description || "BizHub Marketplace Agent",
      tools: config?.tools || [],
      middleware: config?.middleware || [],
      memory: config?.memory || new InMemoryProvider(),
      provider: {
        apiKey: config?.provider?.apiKey,
        model: config?.provider?.model || "gpt-4o",
        temperature: config?.provider?.temperature ?? 0.7,
        maxTokens: config?.provider?.maxTokens ?? 4096,
      },
    };

    this.tools = new ToolRegistry();

    // Register enterprise middleware
    this.tools.use(logging());
    this.tools.use(audit({ persist: true }));

    // Register user-provided middleware
    for (const mw of this.config.middleware) {
      this.tools.use(mw);
    }
  }

  /**
   * Register a single tool
   */
  use(tool: ToolDefinition): this {
    this.tools.register(tool);
    return this;
  }

  /**
   * Register multiple tools at once
   */
  useMany(tools: ToolDefinition[]): this {
    this.tools.registerMany(tools);
    return this;
  }

  /**
   * Add middleware
   */
  middleware(fn: MiddlewareFn): this {
    this.tools.use(fn);
    return this;
  }

  /**
   * Load all built-in marketplace tools
   */
  loadDefaultTools(): this {
    this.tools.registerMany(allTools);
    return this;
  }

  /**
   * Execute a tool by name with arguments
   */
  async execute(
    toolName: string,
    args: Record<string, unknown> = {},
    ctx?: { agentId?: string; metadata?: Record<string, unknown> }
  ): Promise<ToolResult> {
    return this.tools.execute(toolName, args, {
      agentId: ctx?.agentId || this.config.name,
      metadata: ctx?.metadata || {},
    });
  }

  /**
   * Get tool definitions formatted for LLM function calling
   * Compatible with OpenAI, Anthropic, and Google AI
   */
  getToolDefinitions(): ToolDefinition[] {
    return this.tools.list();
  }

  /**
   * Get tools formatted for OpenAI function calling
   */
  getOpenAITools() {
    return this.getToolDefinitions().map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.schema,
      },
    }));
  }

  /**
   * Get tools formatted for Anthropic tool use
   */
  getAnthropicTools() {
    return this.getToolDefinitions().map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.schema,
    }));
  }

  /**
   * Middleware access for chaining
   */
  get middlewareChain() {
    return this.tools;
  }
}

// ─── In-Memory Provider (default) ────────────────────────────

class InMemoryProvider implements MemoryProvider {
  private store = new Map<string, { value: unknown; expiresAt: number | null }>();

  async get(key: string): Promise<unknown | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttl ? Date.now() + ttl : null,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(prefix: string): Promise<{ key: string; value: unknown }[]> {
    return Array.from(this.store.entries())
      .filter(([key]) => key.startsWith(prefix))
      .map(([key, entry]) => ({ key, value: entry.value }));
  }
}
