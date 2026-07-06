# MCP Server Examples

## Claude Desktop

### Setup

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "bizhub": {
      "command": "npx",
      "args": ["-y", "@bizhub/mcp-server"],
      "env": {
        "BIZHUB_API_URL": "https://your-marketplace.com",
        "BIZHUB_AUTH_COOKIE": "your-session-cookie-value"
      }
    }
  }
}
```

### Example Conversations

**Inventory Management:**
```
User: Which products are low on stock?
Claude: Here are your low-stock products:
  - Leather Wallet (5 left)
  - Denim Jacket (2 left)
  - Canvas Sneakers (3 left)

  Would you like me to restock any of these?
```

**Order Processing:**
```
User: Show me my pending orders
Claude: You have 12 pending orders totaling $2,450:
  1. #ord-123 - Wireless Headphones - $79.99 - John D.
  2. #ord-124 - Leather Wallet - $49.99 - Sarah M.
  ...

User: Mark order #ord-123 as completed
Claude: Done. Order #ord-123 (Wireless Headphones) has been marked as completed.
```

**Promotional Campaign:**
```
User: Apply a summer sale — 20% off all electronics
Claude: I'll look up the electronics category and apply the discount.
  ✓ Applied 20% off to Wireless Headphones ($79.99 → $63.99)
  ✓ Applied 20% off to Bluetooth Speaker ($49.99 → $39.99)
  ✓ Applied 20% off to USB-C Hub ($34.99 → $27.99)
  ...
  Summer sale is live on 8 electronics products!
```

**Analytics:**
```
User: How's the business doing?
Claude: 📊 Store Analytics
  • Revenue: $25,430 (+12% vs last month)
  • Orders: 145 (120 completed)
  • Avg Order Value: $175.38
  • Top Seller: Wireless Headphones (42 units)
  • Issue: 5 products low on stock
```

## Cursor Integration

Add to Cursor's MCP configuration:

```json
{
  "mcpServers": {
    "bizhub": {
      "command": "npx",
      "args": ["-y", "@bizhub/mcp-server"],
      "env": {
        "BIZHUB_API_URL": "https://your-marketplace.com",
        "BIZHUB_AUTH_COOKIE": "your-session"
      }
    }
  }
}
```

Now you can manage your marketplace from within Cursor's AI chat.

## Custom MCP Client

```typescript
import { spawn } from "child_process";

const server = spawn("npx", ["@bizhub/mcp-server"], {
  env: {
    BIZHUB_API_URL: "https://your-marketplace.com",
    BIZHUB_AUTH_COOKIE: "your-session",
  },
});

// Send a tool call
const request = {
  jsonrpc: "2.0",
  id: "1",
  method: "tools/call",
  params: {
    name: "analytics_get",
    arguments: {},
  },
};

server.stdin.write(JSON.stringify(request) + "\n");

server.stdout.on("data", (data) => {
  const response = JSON.parse(data.toString());
  console.log("Analytics:", response.result);
});
```

## Troubleshooting MCP

### Can't connect to server

```bash
# Test the server starts correctly
npx @bizhub/mcp-server --log debug

# Check environment
echo $BIZHUB_AUTH_COOKIE  # Should not be empty
```

### Tools not showing up

1. Validate your config file:
   ```bash
   python3 -m json.tool claude_desktop_config.json
   ```
2. Restart Claude Desktop completely (Cmd+Q)
3. Check Claude's MCP logs: `~/Library/Logs/Claude/mcp*.log`

### Permission denied errors

Make sure your auth token has the required permissions. Contact your marketplace admin to upgrade your role.
