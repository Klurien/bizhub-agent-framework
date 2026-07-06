# @biz-hub/agent-kit

**Enterprise Agent SDK for the BizHub marketplace.** Build AI agents that manage products, orders, inventory, discounts, customers, and analytics — with composable tools, middleware pipeline, provider adapters, and type-safe schema validation.

```bash
npm install @biz-hub/agent-kit
```

---

## Quick Start

```typescript
import { BizHubAgent } from "@biz-hub/agent-kit";

const agent = new BizHubAgent({ name: "store-manager" });
agent.loadDefaultTools();

const orders = await agent.execute("orders_list", { status: "pending" });
console.log(`${orders.data.count} pending orders`);
```

## What's Inside

### BizHubAgent

The main class that orchestrates tools, middleware, and provider formatting.

```typescript
const agent = new BizHubAgent({
  name: "my-agent",
  middleware: [],
  memory: new InMemoryProvider(),
  provider: { model: "gpt-4o", temperature: 0.7 },
});
```

**Methods:**
| Method | Description |
|--------|-------------|
| `loadDefaultTools()` | Load all 17 built-in marketplace tools |
| `use(tool)` | Register a custom tool |
| `useMany(tools)` | Register multiple tools |
| `middleware(fn)` | Add middleware to the pipeline |
| `execute(name, args, ctx?)` | Execute a tool with validation |
| `getOpenAITools()` | Format tools for OpenAI function calling |
| `getAnthropicTools()` | Format tools for Anthropic tool use |

### 17 Built-in Tools

**Products** — `products_list`, `products_get`, `products_create`, `products_update`, `products_delete`
**Orders** — `orders_list`, `orders_get`, `orders_update_status`
**Inventory** — `inventory_list`, `inventory_update`
**Discounts** — `discounts_apply`, `discounts_remove`, `discounts_list`
**Analytics** — `analytics_get`, `customers_list`
**Data** — `categories_list`, `stores_list`

### Middleware

Built-in middleware functions that can be composed:

```typescript
import { logging, audit, rateLimit, retry, timeout, requirePermission } from "@biz-hub/agent-kit";

agent
  .middleware(logging())
  .middleware(audit({ persist: true }))
  .middleware(rateLimit({ maxRequests: 30, windowMs: 60000 }))
  .middleware(retry(3, 1000))
  .middleware(timeout(30000))
  .middleware(requirePermission("products:write"));
```

### Provider Adapters

#### OpenAI

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "List pending orders" }],
  tools: agent.getOpenAITools(),
  tool_choice: "auto",
});
```

#### Anthropic

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Show analytics" }],
  tools: agent.getAnthropicTools(),
});
```

### Custom Tools

```typescript
import { z } from "zod";
import type { ToolDefinition } from "@biz-hub/agent-kit";

const notifyTool: ToolDefinition = {
  name: "notify_slack",
  description: "Send a Slack notification to the team",
  schema: z.object({
    message: z.string().min(1).max(2000),
    channel: z.string().default("general"),
  }),
  handler: async ({ message, channel }) => {
    // Integration code here
    return { success: true, data: { sent: true } };
  },
  permissions: ["notify:write"],
};

agent.use(notifyTool);
```

### Charts (`charts_create`)

Generate chart visualizations from analytics data using Flint or a fallback ECharts spec:

```typescript
import { chartTools } from "@biz-hub/agent-kit/tools";
// charts_create is also auto-loaded via loadDefaultTools()

const chart = await agent.execute("charts_create", {
  data: [
    { month: "Jan", revenue: 12000 },
    { month: "Feb", revenue: 15000 },
  ],
  semanticTypes: { month: "YearMonth", revenue: "Currency" },
  chartType: "bar",
  title: "Monthly Revenue",
  xField: "month",
  yField: "revenue",
  backend: "echarts", // or "chartjs"
});
// chart.data.spec — ready for ECharts/Chart.js rendering
```

The `autoChart()` middleware auto-generates chart specs from analytics and customer tool results.

### Graph Engine

Build state machines, agentic loops, and parallel execution flows with `StateGraph`:

```typescript
import { StateGraph, PregelEngine, createReActGraph, addReducer, appendReducer, InMemoryCheckpointer } from "@biz-hub/agent-kit/graph";
import { z } from "zod";

const schema = z.object({ value: z.number().default(0), items: z.array(z.string()).default([]) });
type State = z.output<typeof schema>;

const graph = new StateGraph<State>(schema as z.ZodType<State>);
graph.addNode({ name: "increment", execute: async (s) => ({ value: s.value + 1 }) });
graph.addNode({ name: "double", execute: async (s) => ({ value: s.value * 2 }) });
graph.addEdge({ from: "__start__", to: "increment" });
graph.addEdge({ from: "increment", to: "double" });
graph.addEdge({ from: "double", to: "__end__" });

const result = await graph.run({ value: 5 } as State);
// result.finalState.value === 12
```

**ReAct Loop** — The built-in `createReActGraph()` maps the standard agentic loop to a state graph with `think` → `execute_tool` → `think` → ... → `__end__`.

**Parallel Execution** — `PregelEngine` fans out nodes with configurable concurrency.

**Checkpointing** — `InMemoryCheckpointer`, `PostgresCheckpointer`, and `RedisCheckpointer` for durable execution and resume.

### OpenTelemetry

Instrument tools with tracing and metrics (zero runtime deps — graceful fallback if `@opentelemetry/api` is not installed):

```typescript
import { openTelemetryTracing, openTelemetryMetrics } from "@biz-hub/agent-kit/middleware";

const agent = new BizHubAgent({ name: "production-agent" });
agent
  .middleware(openTelemetryTracing())
  .middleware(openTelemetryMetrics())
  .loadDefaultTools();
```

### Memory System

Vector-based memory store using ChromaDB with semantic search, pruning, and stats:

```typescript
import { MemoryType, createVectorMemoryStore } from "@biz-hub/agent-kit/memory";

const store = createVectorMemoryStore("http://localhost:8000");
await store.set("user:preference", { theme: "dark", currency: "USD" });
const results = await store.search("user preferences", 10);
```

### Multi-Agent Orchestration

Supervisor pattern with agent delegation:

```typescript
import { Supervisor } from "@biz-hub/agent-kit/orchestration";
import type { SubAgent } from "@biz-hub/agent-kit/orchestration";

const supervisor = new Supervisor(agent);
supervisor.registerAgent({
  name: "analytics_agent",
  description: "Handles analytics and reporting",
  tools: analyticsTools,
});

const delegateTool = supervisor.buildDelegationTool();
agent.use(delegateTool);
// Now the agent can call delegate_to_agent({ agent: "analytics_agent", task: "Calculate Q1 revenue" })
```

### API Client

```typescript
import { BizHubClient } from "@biz-hub/agent-kit";

const client = new BizHubClient({
  baseUrl: "https://your-marketplace.com",
  authCookie: "session-token",
});

const products = await client.get("/api/products", { category: "electronics" });
const created = await client.post("/api/products", { name: "New Product", price: 29.99 });
```

### Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `BIZHUB_API_URL` | `http://localhost:3001` | Marketplace API URL |
| `BIZHUB_AUTH_COOKIE` | — | Session auth cookie |
| `BIZHUB_API_KEY` | — | API key (takes precedence) |

Or create `~/.bizhub/config.json`:

```json
{
  "apiUrl": "https://your-marketplace.com",
  "authCookie": "your-session-token",
  "apiKey": "your-api-key"
}
```

### ToolResult

Every tool returns:

```typescript
interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration?: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}
```

## Exports

```typescript
// Core
import { BizHubAgent, ToolRegistry, BizHubClient } from "@biz-hub/agent-kit";

// Types
import type { ToolDefinition, MiddlewareFn, ToolResult, MemoryProvider } from "@biz-hub/agent-kit";

// Middleware
import { logging, audit, rateLimit, retry, timeout, requirePermission, requireRole, autoChart, openTelemetryTracing, openTelemetryMetrics } from "@biz-hub/agent-kit/middleware";

// Providers
import { openAIAdapter, anthropicAdapter } from "@biz-hub/agent-kit/providers";

// Tools (direct access)
import { productTools, orderTools, inventoryTools, discountTools, analyticsTools, storeTools, chartTools } from "@biz-hub/agent-kit/tools";

// Graph Engine
import { StateGraph, PregelEngine, InMemoryCheckpointer, createReActGraph, createReActAgent, addReducer, appendReducer, replaceReducer, mergeReducer } from "@biz-hub/agent-kit/graph";
import type { GraphState, GraphNode, Edge, Checkpointer, StepRecord, ReducerMap } from "@biz-hub/agent-kit/graph";

// Memory
import { MemoryType, createVectorMemoryStore } from "@biz-hub/agent-kit/memory";
import type { MemoryEntry, MemoryStore } from "@biz-hub/agent-kit/memory";

// Orchestration
import { Supervisor } from "@biz-hub/agent-kit/orchestration";
import type { SubAgent } from "@biz-hub/agent-kit/orchestration";

// Utilities
import { getConfig, type ClientConfig } from "@biz-hub/agent-kit";
```

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (recommended, not required)

## License

Proprietary — see LICENSE
