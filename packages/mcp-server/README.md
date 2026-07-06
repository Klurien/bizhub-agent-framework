# @biz-hub/mcp-server

**Model Context Protocol server for the BizHub marketplace.** Connect AI assistants (Claude Desktop, Cursor, Copilot, and any MCP-compatible client) to manage your marketplace in real time.

```bash
# Run directly
npx @biz-hub/mcp-server

# Or install globally
npm install -g @biz-hub/mcp-server
bizhub-server
```

---

## Quick Start

### Claude Desktop

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

Restart Claude Desktop. Ask anything:

> *"List my pending orders"*
> *"Which products are low on stock?"*
> *"Apply 20% off to all electronics"*
> *"Show me revenue analytics"*

### Cursor

Add to `~/.cursor/mcp.json`:

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

## Configuration

| Env Variable | Required | Default | Description |
|-------------|----------|---------|-------------|
| `BIZHUB_API_URL` | No | `http://localhost:3001` | Marketplace API URL |
| `BIZHUB_AUTH_COOKIE` | Yes* | — | Session auth cookie |
| `BIZHUB_API_KEY` | No | — | API key (alternative to cookie) |
| `MCP_TRANSPORT` | No | `stdio` | Transport mode: `stdio` (local) or `http` (remote) |
| `MCP_PORT` | No | `3100` | HTTP server port (when `MCP_TRANSPORT=http`) |

\* Either `BIZHUB_AUTH_COOKIE` or `BIZHUB_API_KEY` must be set.

### Transport Modes

**stdio** (default) — Used for local MCP clients like Claude Desktop, Cursor, VS Code Copilot. No network ports.

**HTTP** — Runs a Streamable HTTP server for remote clients:

```bash
export MCP_TRANSPORT=http
export MCP_PORT=3100
npx @biz-hub/mcp-server
# Server listening on http://localhost:3100
```

The HTTP transport supports:
- Session-based state management (auto-generated session IDs)
- SSE streaming for tool calls
- JSON responses for simple queries
- CORS for cross-origin clients
- Session lifecycle callbacks

## Available Tools

The server auto-registers all 18 tools from `@biz-hub/agent-kit`:

| Category | Tools |
|----------|-------|
| **Products** | `products_list`, `products_get`, `products_create`, `products_update`, `products_delete` |
| **Orders** | `orders_list`, `orders_get`, `orders_update_status` |
| **Inventory** | `inventory_list`, `inventory_update` |
| **Discounts** | `discounts_apply`, `discounts_remove`, `discounts_list` |
| **Analytics** | `analytics_get`, `customers_list` |
| **Charts** | `charts_create` |
| **Data** | `categories_list`, `stores_list` |

## Architecture

```
┌─────────────────┐                  ┌──────────────────────┐
│  Claude Desktop │ ◄── stdio ────── │                      │
│  (MCP Client)   │                  │                      │
└─────────────────┘                  │                      │
                                     │   @biz-hub/mcp-server │
┌─────────────────┐                  │                      │
│  Remote Client  │ ◄── HTTP/SSE ─── │  BizHubAgent         │
│  (MCP over      │                  │  18 tools            │
│   Streamable    │                  │  Middleware chain     │
│   HTTP)         │                  │  Session management   │
└─────────────────┘                  │  BizHubClient        │
                                     └──────────┬───────────┘
                                                │ HTTP
                                                ▼
                                     ┌──────────────────────┐
                                     │  Marketplace API      │
                                     │  (your store)         │
                                     └──────────────────────┘
```

## Security

- stdio mode — no open ports, no network listeners
- HTTP mode — session-based auth with configurable CORS
- All credentials passed via environment variables
- Tools respect permission scopes (destructive operations require auth)
- Follows MCP protocol security model

## Development

```bash
# Install from source
git clone https://github.com/Klurien/bizhub-agent-framework.git
cd bizhub-agent-framework
npm install

# Build all packages
npx tsc -b packages/agent-kit packages/mcp-server packages/cli

# Run the MCP server directly
BIZHUB_API_URL=http://localhost:3001 BIZHUB_AUTH_COOKIE=your-token npx tsx packages/mcp-server/src/index.ts
```

## Requirements

- Node.js >= 18

## Related Packages

- [`@biz-hub/agent-kit`](https://www.npmjs.com/package/@biz-hub/agent-kit) — Core SDK for building custom agents
- [`@biz-hub/cli`](https://www.npmjs.com/package/@biz-hub/cli) — Terminal-based marketplace management

## License

Proprietary — see LICENSE
