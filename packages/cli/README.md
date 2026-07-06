# @biz-hub/cli

**Enterprise CLI for the BizHub marketplace.** Manage products, orders, inventory, discounts, and analytics — all from your terminal. Built for developers, DevOps, and automation workflows.

```bash
npx @biz-hub/cli
```

---

## Quick Start

```bash
# Set your credentials
export BIZHUB_API_URL=https://your-marketplace.com
export BIZHUB_AUTH_COOKIE="your-session-token"

# Show config
npx @biz-hub/cli config

# List products
npx @biz-hub/cli products list

# View pending orders
npx @biz-hub/cli orders list --status pending

# Check low stock
npx @biz-hub/cli inventory list --low-stock
```

## Commands

### `products`

```bash
# List all products
npx @biz-hub/cli products list
npx @biz-hub/cli products list --category electronics --limit 20 --sort price_asc

# Get single product
npx @biz-hub/cli products get wireless-headphones

# Create product
npx @biz-hub/cli products create \
  --name "Wireless Headphones" \
  --price 79.99 \
  --category electronics \
  --inventory 50

# Update product
npx @biz-hub/cli products update wireless-headphones \
  --price 69.99 --inventory 100

# Delete product
npx @biz-hub/cli products delete wireless-headphones --force
```

### `orders`

```bash
# List orders
npx @biz-hub/cli orders list
npx @biz-hub/cli orders list --status pending

# Get order details
npx @biz-hub/cli orders get order-uuid-here

# Update order status
npx @biz-hub/cli orders update-status order-uuid-here --status completed
```

### `inventory`

```bash
# View all inventory
npx @biz-hub/cli inventory list

# Show only low-stock items
npx @biz-hub/cli inventory list --low-stock

# Update stock count
npx @biz-hub/cli inventory update wireless-headphones --stock 150
```

### `discounts`

```bash
# Apply discount
npx @biz-hub/cli discounts apply wireless-headphones --percent 20

# Remove discount
npx @biz-hub/cli discounts remove wireless-headphones

# List active discounts
npx @biz-hub/cli discounts list
```

### `analytics`

```bash
# Show analytics dashboard
npx @biz-hub/cli analytics show

# Show customer data with LTV
npx @biz-hub/cli analytics customers
```

### `data`

```bash
# List categories
npx @biz-hub/cli data categories

# List stores
npx @biz-hub/cli data stores
```

### `config`

```bash
# Show current configuration
npx @biz-hub/cli config
```

## Output Formats

### Table (default)

Colored, formatted tables:

```
┌────────────────┬──────────────┬────────┬────────┐
│ Name           │ Category     │ Price  │ Stock  │
├────────────────┼──────────────┼────────┼────────┤
│ Headphones     │ electronics  │ $79.99 │  150   │
│ Leather Wallet │ accessories  │ $49.99 │   5    │
│ Cotton Shirt   │ clothing     │ $29.99 │   20   │
└────────────────┴──────────────┴────────┴────────┘
```

### JSON

```bash
npx @biz-hub/cli products list --json
```

```json
{
  "success": true,
  "data": {
    "count": 42,
    "products": [...]
  }
}
```

### Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (invalid args, API error, auth failure) |

## Configuration

| Env Variable | Default | Description |
|-------------|---------|-------------|
| `BIZHUB_API_URL` | `http://localhost:3001` | Marketplace API base URL |
| `BIZHUB_AUTH_COOKIE` | — | Session auth cookie |
| `BIZHUB_API_KEY` | — | API key (takes precedence) |

Config file: `~/.bizhub/config.json`

## MCP Server

For AI agent integration (Claude Desktop, Cursor, Copilot), use the [MCP server](https://www.npmjs.com/package/@biz-hub/mcp-server) instead:

```bash
npx @biz-hub/mcp-server
```

## Development

```bash
# Install from source
git clone https://github.com/Klurien/bizhub-agent-framework.git
cd bizhub-agent-framework
npm install

# Build all packages
npx tsc -b packages/agent-kit packages/mcp-server packages/cli

# Run CLI directly
npx tsx packages/cli/src/index.ts products list
```

## Requirements

- Node.js >= 18

## Related Packages

- [`@biz-hub/agent-kit`](https://www.npmjs.com/package/@biz-hub/agent-kit) — Core SDK for building custom AI agents
- [`@biz-hub/mcp-server`](https://www.npmjs.com/package/@biz-hub/mcp-server) — MCP server for Claude/Cursor/Copilot

## License

Proprietary — see LICENSE
