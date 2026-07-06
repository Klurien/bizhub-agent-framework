# MCP Server

The `@bizhub/mcp-server` package runs a [Model Context Protocol](https://modelcontextprotocol.io) server that exposes all BizHub marketplace tools to MCP-compatible clients (Claude Desktop, Cursor, Copilot, etc.).

## Usage

### Direct (npx)

```bash
npx @bizhub/mcp-server
```

### With environment variables

```bash
BIZHUB_API_URL=https://your-marketplace.com \
BIZHUB_AUTH_COOKIE="your-session" \
npx @bizhub/mcp-server
```

## Claude Desktop Integration

Add to `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`):

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

Restart Claude Desktop. You can now ask Claude:

> *"List my pending orders"*
> *"Which products are low on stock?"*
> *"Apply 15% off to the leather wallet"*
> *"Show me my revenue analytics"*
> *"Find the electronics category slug"*

## Architecture

```
┌─────────────────┐     MCP Protocol      ┌──────────────────┐
│  Claude Desktop  │ ◄───── stdio ──────► │  @bizhub/mcp-server │
│  (MCP Client)    │                      │                    │
└─────────────────┘                      │  ToolRegistry      │
                                          │  BizHubClient     │
                                          └────────┬──────────┘
                                                   │ HTTP
                                                   ▼
                                          ┌──────────────────┐
                                          │  Marketplace API  │
                                          │  (your store)     │
                                          └──────────────────┘
```

## Available Tools

All 17 tools from `@bizhub/agent-kit` are automatically registered:

- **Products**: list, get, create, update, delete
- **Orders**: list, get, update_status
- **Inventory**: list, update
- **Discounts**: apply, remove, list
- **Analytics**: get, customers_list
- **Data**: categories_list, stores_list

## Configuration

The server reads the same configuration as `@bizhub/agent-kit`:

| Env Variable | Default | Required |
|-------------|---------|----------|
| `BIZHUB_API_URL` | `http://localhost:3001` | No |
| `BIZHUB_AUTH_COOKIE` | — | Yes (or API key) |
| `BIZHUB_API_KEY` | — | No |

## Security

- Runs via stdio — no open ports; only the parent process can communicate
- No network listeners, no HTTP endpoints
- All API credentials passed via environment variables
- Follows the principle of least privilege — tools require auth context for destructive operations

## Example Session

```
User: Show me my analytics
Claude: [calls analytics_get] Here are your store analytics:
  - Total Orders: 145
  - Completed Orders: 120
  - Total Revenue: $25,430
  - Avg Order Value: $175.38

User: Apply 20% off to products in electronics
Claude: [calls categories_list → products_list → discounts_apply × N]
  Applied 20% off to 8 electronics products successfully.
```

## Troubleshooting

### Server not starting

```bash
npx @bizhub/mcp-server --log debug
```

Check that env vars are set correctly and the API URL is reachable.

### Tools not showing up in Claude

Make sure `claude_desktop_config.json` is valid JSON and restart Claude Desktop completely.

### Tool execution errors

Errors are returned as MCP error messages. Check that:
- The marketplace API is running
- Your auth cookie / API key is valid
- You have the required permissions for the tool
