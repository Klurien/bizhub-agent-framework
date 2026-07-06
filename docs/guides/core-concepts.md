# Core Concepts

## BizHubAgent

The `BizHubAgent` is the central orchestrator. It manages tool registration, middleware execution, and provider formatting.

```typescript
const agent = new BizHubAgent({
  name: "my-agent",           // Required: agent identifier
  version: "1.0.0",           // Optional: agent version
  middleware: [],              // Optional: custom middleware
  provider: {                  // Optional: LLM provider config
    model: "gpt-4o",
    temperature: 0.7,
  },
});
```

### Lifecycle

1. **Create** — `new BizHubAgent(config)`
2. **Configure** — `agent.loadDefaultTools()`, `agent.use(customTool)`, `agent.middleware(fn)`
3. **Execute** — `await agent.execute("tool_name", args)`
4. **Format** — `agent.getOpenAITools()`, `agent.getAnthropicTools()`

## Tools

A tool is a typed, validated function that an agent can call. Every tool has:

```typescript
interface ToolDefinition {
  name: string;                    // Unique identifier like "products_list"
  description: string;             // Description for LLM understanding
  schema: z.ZodTypeAny;            // Zod schema for argument validation
  handler: (args, ctx) => Promise<ToolResult>;  // Implementation
  permissions?: string[];          // Required permissions
  rateLimit?: RateLimitConfig;     // Rate limiting
  version?: string;                // Semantic version
  deprecated?: boolean;            // Deprecation flag
}
```

### Built-in Tools (17 total)

| Category | Tools |
|----------|-------|
| Products | `products_list`, `products_get`, `products_create`, `products_update`, `products_delete` |
| Orders | `orders_list`, `orders_get`, `orders_update_status` |
| Inventory | `inventory_list`, `inventory_update` |
| Discounts | `discounts_apply`, `discounts_remove`, `discounts_list` |
| Analytics | `analytics_get`, `customers_list` |
| Data | `categories_list`, `stores_list` |

### Custom Tools

```typescript
import { z } from "zod";
import type { ToolDefinition } from "@bizhub/agent-kit";

const bulkPriceUpdate: ToolDefinition = {
  name: "products_bulk_update_prices",
  description: "Update prices for multiple products at once",
  schema: z.object({
    updates: z.array(z.object({
      slug: z.string(),
      price: z.number().positive(),
    })).min(1).max(100),
  }),
  handler: async ({ updates }) => {
    // Batch update logic here
    return { success: true, data: { updated: updates.length } };
  },
  permissions: ["products:write"],
  rateLimit: { maxRequests: 10, windowMs: 60000 },
};

agent.use(bulkPriceUpdate);
```

## Middleware

Middleware runs before and after every tool execution, forming a pipeline:

```
Request → [Auth] → [Rate Limit] → [Logging] → [Retry] → Handler → Response
```

### Built-in Middleware

| Middleware | Description |
|-----------|-------------|
| `logging()` | Structured JSON logging of all tool executions |
| `audit()` | Audit trail with request ID, args, duration, success/failure |
| `rateLimit({ maxRequests, windowMs }) | Per-tool, per-agent rate limiting |
| `retry(maxRetries, delayMs)` | Automatic retry on failure with exponential backoff |
| `timeout(ms)` | Abort tool execution after a timeout |
| `requirePermission(perm)` | Reject if agent lacks specific permission |
| `requireRole(...roles)` | Reject if agent doesn't have required role |

### Custom Middleware

```typescript
import type { MiddlewareFn } from "@bizhub/agent-kit";

const myMiddleware: MiddlewareFn = async (tool, args, ctx, next) => {
  console.log(`[${tool.name}] Starting with args:`, args);
  const result = await next();
  console.log(`[${tool.name}] Completed:`, result.success);
  return result;
};

agent.middleware(myMiddleware);
```

## Provider Adapters

Provider adapters convert BizHub tools into the format expected by different LLM providers.

### OpenAI

```typescript
const openaiTools = agent.getOpenAITools();
// Returns: [{ type: "function", function: { name, description, parameters } }]
```

### Anthropic

```typescript
const anthropicTools = agent.getAnthropicTools();
// Returns: [{ name, description, input_schema }]
```

## Tool Registry

The `ToolRegistry` is the underlying engine that manages tool registration, middleware execution, and event emission.

```typescript
import { ToolRegistry } from "@bizhub/agent-kit";

const registry = new ToolRegistry();
registry.register(toolDefinition);
registry.use(middlewareFn);
registry.on("tool:executed", async (event) => {
  console.log("Tool executed:", event);
});
const result = await registry.execute("tool_name", args, context);
```

## Memory Provider

Agents can persist state between executions:

```typescript
interface MemoryProvider {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<{ key: string; value: unknown }[]>;
}
```

Built-in: `InMemoryProvider` (default). For production, implement the interface with Redis, Postgres, or your preferred store.
