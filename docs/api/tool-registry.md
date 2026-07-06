# ToolRegistry API

The `ToolRegistry` is the underlying engine that manages tool registration, validation, middleware execution, and event emission. `BizHubAgent` wraps this class.

## Constructor

```typescript
import { ToolRegistry } from "@bizhub/agent-kit";

const registry = new ToolRegistry();
```

## Methods

### `register(tool: ToolDefinition)`

Register a single tool definition.

```typescript
registry.register({
  name: "hello_world",
  description: "A simple hello world tool",
  schema: z.object({ name: z.string() }),
  handler: async ({ name }) => ({ success: true, data: { message: `Hello, ${name}!` } }),
});
```

**Throws:** If a tool with the same name is already registered.

### `registerMany(tools: ToolDefinition[])`

Register multiple tools at once.

```typescript
registry.registerMany([tool1, tool2, tool3]);
```

### `get(name: string)`

Retrieve a tool definition by name.

```typescript
const tool = registry.get("products_list");
```

**Returns:** `ToolDefinition | undefined`

### `has(name: string)`

Check if a tool is registered.

```typescript
if (registry.has("analytics_get")) {
  // Tool exists
}
```

### `list()`

Get all registered tool definitions.

```typescript
const allTools = registry.list();
```

### `execute(name: string, args: unknown, ctx?: ToolContext)`

Execute a tool by name with validation and middleware.

```typescript
const result = await registry.execute("products_list", { category: "electronics", limit: 10 }, {
  agentId: "agent-123",
  permissions: ["products:read"],
  metadata: { requestId: "req-abc" },
});
```

**Throws:** If tool is not found or schema validation fails.

### `use(fn: MiddlewareFn)`

Add middleware to the execution pipeline.

```typescript
registry.use(async (tool, args, ctx, next) => {
  console.log(`Executing ${tool.name}`);
  return next();
});
```

### `on(event: string, handler: Function)`

Subscribe to registry events.

```typescript
registry.on("tool:registered", ({ name }) => {
  console.log(`Tool registered: ${name}`);
});

registry.on("tool:executed", ({ tool, args, duration, success }) => {
  console.log(`${tool.name} ${success ? "succeeded" : "failed"} in ${duration}ms`);
});

registry.on("error", ({ toolName, error }) => {
  console.error(`Error in ${toolName}:`, error.message);
});
```

### `off(event: string, handler: Function)`

Unsubscribe from an event.

### `clear()`

Remove all registered tools and middleware.

## ToolContext

```typescript
interface ToolContext {
  agentId?: string;
  permissions?: string[];
  roles?: string[];
  metadata?: Record<string, unknown>;
}
```

## Events

| Event | Payload | Description |
|-------|---------|-------------|
| `tool:registered` | `{ name: string, tool: ToolDefinition }` | A new tool was registered |
| `tool:executed` | `{ tool: ToolDefinition, args: unknown, duration: number, success: boolean }` | Tool execution completed |
| `error` | `{ toolName: string, error: Error }` | An error occurred during execution |
