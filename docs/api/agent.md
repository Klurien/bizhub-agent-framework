# BizHubAgent API

The `BizHubAgent` class is the main entry point for building AI agents.

## Constructor

```typescript
new BizHubAgent(config?: AgentConfig)
```

### AgentConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | `string` | `"bizhub-agent"` | Agent identifier used in logs and audit trails |
| `version` | `string` | `"1.0.0"` | Agent version |
| `description` | `string` | — | Human-readable description |
| `middleware` | `MiddlewareFn[]` | `[]` | Custom middleware functions |
| `memory` | `MemoryProvider` | `InMemoryProvider` | State persistence provider |
| `provider` | `ProviderConfig` | — | LLM provider configuration |

### ProviderConfig

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `apiKey` | `string` | — | LLM API key |
| `model` | `string` | `"gpt-4o"` | Model identifier |
| `temperature` | `number` | `0.7` | Response randomness |
| `maxTokens` | `number` | `4096` | Max response tokens |

## Methods

### `loadDefaultTools()`

Loads all 17 built-in marketplace tools into the agent.

```typescript
const agent = new BizHubAgent({ name: "store-manager" });
agent.loadDefaultTools();
```

**Returns:** `this` (for chaining)

### `use(tool: ToolDefinition)`

Register a single custom tool.

```typescript
agent.use(myCustomTool);
```

**Returns:** `this`

### `useMany(tools: ToolDefinition[])`

Register multiple tools at once.

```typescript
agent.useMany([tool1, tool2, tool3]);
```

**Returns:** `this`

### `middleware(fn: MiddlewareFn)`

Add a middleware function to the execution pipeline.

```typescript
agent.middleware(async (tool, args, ctx, next) => {
  const result = await next();
  return result;
});
```

**Returns:** `this`

### `execute(toolName, args?, ctx?)`

Execute a tool by name with validated arguments.

```typescript
const result = await agent.execute("products_list", {
  category: "electronics",
  limit: 10,
});
```

**Parameters:**
- `toolName: string` — Name of the registered tool
- `args: Record<string, unknown>` — Arguments validated against the tool's schema
- `ctx: { agentId?: string; metadata?: Record<string, unknown> }` — Execution context

**Returns:** `Promise<ToolResult>`

### `getToolDefinitions()`

Get all registered tool definitions.

```typescript
const tools = agent.getToolDefinitions();
// ToolDefinition[] with full schemas
```

### `getOpenAITools()`

Get tools formatted for OpenAI function calling.

```typescript
const openaiTools = agent.getOpenAITools();
// [{ type: "function", function: { name, description, parameters } }]
```

### `getAnthropicTools()`

Get tools formatted for Anthropic tool use.

```typescript
const anthropicTools = agent.getAnthropicTools();
// [{ name, description, input_schema }]
```

## ToolResult

```typescript
interface ToolResult {
  success: boolean;           // Whether execution succeeded
  data?: unknown;             // Response data
  error?: string;             // Error message if failed
  duration?: number;          // Execution time in ms
  warnings?: string[];        // Non-fatal warnings
  metadata?: Record<string, unknown>;  // Additional info
}
```

## Example

```typescript
import { BizHubAgent } from "@bizhub/agent-kit";

const agent = new BizHubAgent({
  name: "inventory-manager",
  version: "1.0.0",
});

agent.loadDefaultTools();

// Check low stock
const inventory = await agent.execute("inventory_list", {
  lowStock: true,
});

if (inventory.success && inventory.data.products.length > 0) {
  console.log(`Restock needed for ${inventory.data.products.length} products`);
}
```
