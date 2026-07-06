# MCP Configuration

Configure the BizHub MCP server for different MCP-compatible clients.

## Claude Desktop

**Config file location:**
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`

**Add the server:**

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

## Cursor

**Config file:** `~/.cursor/mcp.json`

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

## VS Code (Copilot)

Add to VS Code's MCP configuration:

```json
{
  "mcp.servers": {
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

## Environment Variables

All three clients support the same env vars:

| Variable | Required | Description |
|----------|----------|-------------|
| `BIZHUB_API_URL` | No | Marketplace API URL (default: `http://localhost:3001`) |
| `BIZHUB_AUTH_COOKIE` | Yes* | Session auth cookie |
| `BIZHUB_API_KEY` | No | Alternative to auth cookie |

\* Either `BIZHUB_AUTH_COOKIE` or `BIZHUB_API_KEY` must be set.

## Troubleshooting

See the [MCP Examples](../examples/mcp.md) page for troubleshooting steps.
