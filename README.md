<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/bizhub/brand/main/logo-dark.svg">
  <img alt="BizHub" src="https://raw.githubusercontent.com/bizhub/brand/main/logo-light.svg" width="200">
</picture>

# BizHub Agent Framework

**Build AI agents that control your entire marketplace.** Manage products, orders, inventory, customers, discounts, and analytics through natural language or code.

```bash
npm install @biz-hub/agent-kit
```

[![npm version](https://img.shields.io/npm/v/@biz-hub/agent-kit)](https://www.npmjs.com/package/@biz-hub/agent-kit)
[![npm downloads](https://img.shields.io/npm/dm/@biz-hub/agent-kit)](https://www.npmjs.com/package/@biz-hub/agent-kit)
[![License](https://img.shields.io/badge/license-proprietary-blue)](LICENSE)

---

## Packages

| Package | Version | Description |
|---------|---------|-------------|
| [`@biz-hub/agent-kit`](./packages/agent-kit) | [1.2.0](https://www.npmjs.com/package/@biz-hub/agent-kit) | Core SDK — build AI agents with tools, middleware, memory, graph engine, and provider adapters |
| [`@biz-hub/mcp-server`](./packages/mcp-server) | [1.3.0](https://www.npmjs.com/package/@biz-hub/mcp-server) | MCP server — connect Claude Desktop, Cursor, Copilot, and any MCP client (stdio + HTTP) |
| [`@biz-hub/cli`](./packages/cli) | [1.3.0](https://www.npmjs.com/package/@biz-hub/cli) | Enterprise CLI — manage your marketplace from the terminal |

## Quick Start

### 1. Install

```bash
npm install @biz-hub/agent-kit
```

### 2. Configure

```bash
export BIZHUB_API_URL=https://your-marketplace.com
export BIZHUB_AUTH_COOKIE="your-session-token"
```

### 3. Build an Agent

```typescript
import { BizHubAgent } from "@biz-hub/agent-kit";

const agent = new BizHubAgent({ name: "store-manager" });
agent.loadDefaultTools();

// List pending orders
const orders = await agent.execute("orders_list", { status: "pending" });
console.log(orders.data);

// Get analytics
const analytics = await agent.execute("analytics_get", {});
console.log(`Revenue: $${analytics.data.totalRevenue}`);

// Apply a discount
await agent.execute("discounts_apply", { slug: "wireless-headphones", percent: 20 });
```

### 4. Use with an LLM

**OpenAI:**

```typescript
const response = await openai.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Show my revenue" }],
  tools: agent.getOpenAITools(),
  tool_choice: "auto",
});
```

**Anthropic Claude:**

```typescript
const response = await anthropic.messages.create({
  model: "claude-sonnet-4-20250514",
  max_tokens: 1024,
  messages: [{ role: "user", content: "Show my revenue" }],
  tools: agent.getAnthropicTools(),
});
```

### 5. Connect Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bizhub": {
      "command": "npx",
      "args": ["-y", "@biz-hub/mcp-server"],
      "env": {
        "BIZHUB_API_URL": "https://your-marketplace.com",
        "BIZHUB_AUTH_COOKIE": "your-session-token"
      }
    }
  }
}
```

Now ask Claude things like *"Apply 20% off to all electronics"* or *"Which products are low on stock?"*

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │          AI Agent / CLI             │
                    │   (Claude, GPT, Custom, CLI)        │
                    └──────┬──────────────────┬───────────┘
                           │                  │
                     ┌─────▼─────┐      ┌─────▼──────────┐
                     │ @biz-hub  │      │ @biz-hub       │
                     │ /cli      │      │ /mcp-server    │
                     │ Terminal  │      │ stdio | HTTP   │
                     └─────┬─────┘      └─────┬──────────┘
                           │                  │
                           └────────┬─────────┘
                                    ▼
                    ┌─────────────────────────────────────┐
                    │          @biz-hub/agent-kit          │
                    │                                      │
                    │  ┌──────────┐ ┌───────────────────┐  │
                    │  │  Tools   │ │   Middleware       │  │
                    │  │  (18)    │ │ Auth, Logging      │  │
                    │  │          │ │ Rate Limit, Retry  │  │
                    │  └──────────┘ │ Audit, OTel        │  │
                    │               │ Auto-Chart         │  │
                    │               └───────────────────┘  │
                    │                                      │
                    │  ┌────────────────────────────────┐  │
                    │  │  Graph Engine (StateGraph)      │  │
                    │  │  ReAct Loop · Pregel Parallel   │  │
                    │  │  Checkpoint · ReducerMap        │  │
                    │  └────────────────────────────────┘  │
                    │                                      │
                    │  ┌──────────┐ ┌───────────────────┐  │
                    │  │ Memory   │ │ Orchestration      │  │
                    │  │ Vector   │ │ Supervisor Pattern │  │
                    │  │ ChromaDB │ │ Agent Delegation   │  │
                    │  └──────────┘ └───────────────────┘  │
                    │                                      │
                    │  ┌────────────────────────────────┐  │
                    │  │     BizHubClient (REST API)    │  │
                    │  └──────────┬─────────────────────┘  │
                    └─────────────┼────────────────────────┘
                                  │ HTTP
                                  ▼
                    ┌──────────────────────────────────────┐
                    │       BizHub Marketplace API          │
                    │       (Your Store)                    │
                    └──────────────────────────────────────┘
```

## 17 Built-in Tools

| Category | Tools | Permissions |
|----------|-------|-------------|
| **Products** | `list`, `get`, `create`, `update`, `delete` | `products:write`, `products:delete` |
| **Orders** | `list`, `get`, `update_status` | `orders:write` |
| **Inventory** | `list`, `update` | `inventory:write` |
| **Discounts** | `apply`, `remove`, `list` | `discounts:write` |
| **Analytics** | `get`, `customers_list` | — |
| **Charts** | `charts_create` | — |
| **Data** | `categories_list`, `stores_list` | — |

Complete reference: [docs/](./docs/)

## Enterprise Features

- **Type-Safe Tools** — Every tool has a Zod schema for input validation and TypeScript types
- **Middleware Pipeline** — Compose logging, audit trails, rate limiting, retry, timeout, permission checks, OpenTelemetry tracing/metrics, and auto-charting
- **Provider Adapters** — OpenAI function calling, Anthropic tool use (extensible interface)
- **Graph Engine** — StateGraph builder with conditional edges, parallel fan-out (Pregel), checkpoint/resume, ReducerMap, and built-in ReAct loop
- **Flint Chart Integration** — `charts_create` tool generates ECharts/Chart.js specs from analytics data; auto-chart middleware wraps tool results with chart specs
- **HTTP MCP Transport** — Run the MCP server over HTTP with session management (in addition to stdio)
- **OpenTelemetry** — Tracing (GenAI semantic conventions) and metrics middleware, zero deps at runtime (graceful fallback)
- **Memory System** — Pluggable memory with ChromaDB vector store, short-term/long-term/episodic/procedural types, semantic search, and pruning
- **Multi-Agent Orchestration** — Supervisor pattern with `delegate_to_agent` tool, agent registry, and orchestrator-worker graph
- **Memory Providers** — Pluggable memory (in-memory by default, ChromaDB, Postgres/Redis checkpointing)
- **Observability** — Structured audit logs with duration tracking, request IDs, and agent context; OpenTelemetry traces and metrics
- **Rate Limiting** — Per-tool, per-agent rate limits with configurable windows
- **Authentication** — Auth cookie or API key, permission-based access control, role enforcement
- **MCP Protocol** — Connect any MCP-compatible client via stdio or HTTP (Claude Desktop, Cursor, VS Code Copilot)
- **CLI** — Full terminal UI with colored tables and JSON output for scripting

## Custom Tools

```typescript
import { z } from "zod";
import type { ToolDefinition } from "@biz-hub/agent-kit";

const restockTool: ToolDefinition = {
  name: "inventory_restock",
  description: "Order restock from supplier",
  schema: z.object({
    slug: z.string(),
    quantity: z.number().int().positive(),
  }),
  handler: async ({ slug, quantity }) => {
    // Supplier API integration
    return { success: true, data: { eta: "3 days" } };
  },
  permissions: ["inventory:write"],
};

agent.use(restockTool);
```

## Custom Middleware

```typescript
import { audit, rateLimit, retry } from "@biz-hub/agent-kit";

const agent = new BizHubAgent({ name: "production-agent" });
agent
  .middleware(audit({ persist: true }))
  .middleware(rateLimit({ maxRequests: 60, windowMs: 60000 }))
  .middleware(retry(3, 1000))
  .loadDefaultTools();
```

## Documentation

Full documentation is in the [`docs/`](./docs/) directory:

- [Quick Start Guide](./docs/guides/quick-start.md)
- [Core Concepts](./docs/guides/core-concepts.md)
- [Configuration](./docs/guides/configuration.md)
- [API Reference](./docs/api/agent.md)
- [Built-in Tools Reference](./docs/api/tools.md)
- [Middleware API](./docs/api/middleware.md)
- [Provider Adapters](./docs/api/providers.md)
- [OpenAI Examples](./docs/examples/openai.md)
- [Anthropic Examples](./docs/examples/anthropic.md)
- [MCP Examples](./docs/examples/mcp.md)

## Requirements

- Node.js >= 18
- TypeScript >= 5.0 (recommended for agent-kit)
- A BizHub marketplace instance (self-hosted or cloud)

## License

Proprietary. Copyright 2026 BizHub.
