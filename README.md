<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/bizhub/brand/main/logo-dark.svg">
  <img alt="BizHub" src="https://raw.githubusercontent.com/bizhub/brand/main/logo-light.svg" width="200">
</picture>

# BizHub Agent Framework

**The official SDK for building AI agents that manage your marketplace.**

BizHub Agent Framework provides everything you need to build, deploy, and scale AI agents that interact with your BizHub marketplace — managing products, orders, inventory, customers, discounts, and analytics through natural language or programmatic APIs.

```bash
npm install @bizhub/agent-kit
```

---

## Packages

| Package | Description | Status |
|---------|-------------|--------|
| [`@bizhub/agent-kit`](./packages/agent-kit) | Core SDK — build AI agents with composable tools, middleware, memory, and provider adapters | ✅ |
| [`@bizhub/mcp-server`](./packages/mcp-server) | MCP server — connect Claude Desktop, Cursor, Copilot, and any MCP-compatible AI | ✅ |
| [`@bizhub/cli`](./packages/cli) | Enterprise CLI — manage your marketplace from the terminal | ✅ |

## Quick Start

### 1. Install

```bash
npm install @bizhub/agent-kit
```

### 2. Configure

```bash
# Set your marketplace API URL and auth
export BIZHUB_API_URL=https://your-marketplace.com
export BIZHUB_AUTH_COOKIE="your-session-token"
```

### 3. Build an Agent

```typescript
import { BizHubAgent } from "@bizhub/agent-kit";

const agent = new BizHubAgent({ name: "store-manager" });
agent.loadDefaultTools();

// Execute a tool directly
const products = await agent.execute("products_list", {
  category: "electronics",
  limit: 10,
});

// Or integrate with any LLM provider
const openaiTools = agent.getOpenAITools();
const anthropicTools = agent.getAnthropicTools();
```

### 4. Connect Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bizhub": {
      "command": "npx",
      "args": ["-y", "@bizhub/mcp-server"],
      "env": {
        "BIZHUB_API_URL": "https://your-marketplace.com",
        "BIZHUB_AUTH_COOKIE": "your-session-token"
      }
    }
  }
}
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   AI Agent                          │
│  (Claude, GPT, Custom, or CLI)                     │
└──────────┬──────────────────────────┬──────────────┘
           │                          │
           ▼                          ▼
┌──────────────────┐    ┌──────────────────────────┐
│   @bizhub/cli    │    │  @bizhub/mcp-server      │
│  Terminal UI     │    │  MCP Protocol (stdio/SSE) │
└──────┬───────────┘    └────────┬─────────────────┘
       │                         │
       └─────────┬───────────────┘
                 ▼
┌─────────────────────────────────────────────────────┐
│               @bizhub/agent-kit                     │
│                                                     │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐ │
│  │  Tools   │  │Middleware │  │   Providers      │ │
│  │  Registry│  │  Auth     │  │  OpenAI adapter  │ │
│  │  Schema  │  │  Logging  │  │  Anthropic adapt │ │
│  │  Val.    │  │  Rate Lim │  │  Google adapt    │ │
│  │  Retry   │  │  Audit    │  │                  │ │
│  └──────────┘  └───────────┘  └──────────────────┘ │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │            API Client (BizHubClient)          │  │
│  └──────────────────┬───────────────────────────┘  │
└─────────────────────┼─────────────────────────────┘
                      ▼
            ┌──────────────────┐
            │  BizHub API      │
            │  (REST)          │
            └──────────────────┘
```

## Enterprise Features

- **Tool Registry** — Composable, type-safe tool definitions with Zod validation
- **Middleware Pipeline** — Auth, audit logging, rate limiting, retry, timeout
- **Provider Adapters** — OpenAI function calling, Anthropic tool use, with more coming
- **Observability** — OpenTelemetry-ready, structured audit logs, duration tracking
- **Security** — API key auth, permission scoping, payload sanitization
- **Memory** — Built-in in-memory store with pluggable interface for Redis, Postgres, etc.
- **Rate Limiting** — Per-tool, per-agent rate limits with configurable windows
- **Multi-Transport** — MCP supports stdio (local), SSE, WebSocket

## Available Tools

### Products
| Tool | Description | Permissions |
|------|-------------|-------------|
| `products_list` | List products with filters | — |
| `products_get` | Get product detail by slug | — |
| `products_create` | Create new product | `products:write` |
| `products_update` | Update price, stock, status | `products:write` |
| `products_delete` | Permanently delete product | `products:delete` |

### Orders
| Tool | Description | Permissions |
|------|-------------|-------------|
| `orders_list` | List orders with status filter | — |
| `orders_get` | Get order detail | — |
| `orders_update_status` | Mark completed/refunded/cancelled | `orders:write` |

### Inventory
| Tool | Description | Permissions |
|------|-------------|-------------|
| `inventory_list` | View stock with low-stock alert | — |
| `inventory_update` | Update stock count | `inventory:write` |

### Discounts & Promotions
| Tool | Description | Permissions |
|------|-------------|-------------|
| `discounts_apply` | Apply % discount | `discounts:write` |
| `discounts_remove` | Remove discount | `discounts:write` |
| `discounts_list` | List active sales | — |

### Analytics & Customers
| Tool | Description |
|------|-------------|
| `analytics_get` | Revenue, orders, AOV, customers |
| `customers_list` | Customer list with LTV |

### Data
| Tool | Description |
|------|-------------|
| `categories_list` | Available categories |
| `stores_list` | Marketplace stores |

## Custom Middleware

```typescript
import { BizHubAgent, rateLimit, retry, audit } from "@bizhub/agent-kit";

const agent = new BizHubAgent({ name: "custom-agent" });
agent
  .use(rateLimit({ maxRequests: 10, windowMs: 60000 }))
  .use(retry(3, 2000))
  .loadDefaultTools();
```

## Custom Tools

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
    // ... batch update logic
    return { success: true, data: { updated: updates.length } };
  },
  permissions: ["products:write"],
  rateLimit: { maxRequests: 10, windowMs: 60000 },
};

agent.use(bulkPriceUpdate);
```

## API Client

```typescript
import { BizHubClient } from "@bizhub/agent-kit";

const client = new BizHubClient();
const { product } = await client.getProduct("wireless-headphones");
const { items } = await client.listOrders({ status: "pending" });
const analytics = await client.getAnalytics();
```

---

Built for [BizHub](https://bizhub.dev) — The Social Commerce Platform.
