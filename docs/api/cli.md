# CLI

The `@bizhub/cli` package provides a terminal interface for managing your marketplace.

## Installation

```bash
# Run without install
npx @bizhub/cli <command>

# Install globally
npm install -g @bizhub/cli

# Use via MCP server (recommended for AI agents)
npx @bizhub/mcp-server
```

## Commands

### `products`

Manage products in the marketplace.

```bash
# List all products
npx @bizhub/cli products list
npx @bizhub/cli products list --category electronics
npx @bizhub/cli products list --limit 20 --sort price_asc

# Get a single product
npx @bizhub/cli products get wireless-headphones

# Create a product
npx @bizhub/cli products create \
  --name "Wireless Headphones" \
  --price 79.99 \
  --category "electronics" \
  --inventory 50

# Update a product
npx @bizhub/cli products update \
  wireless-headphones \
  --price 69.99 \
  --inventory 100

# Delete a product
npx @bizhub/cli products delete wireless-headphones --force
```

### `orders`

View and manage orders.

```bash
# List orders
npx @bizhub/cli orders list
npx @bizhub/cli orders list --status pending

# Get order details
npx @bizhub/cli orders get order-uuid-here

# Update order status
npx @bizhub/cli orders update-status \
  order-uuid-here \
  --status completed
```

### `inventory`

Monitor and update inventory levels.

```bash
# View all inventory
npx @bizhub/cli inventory list

# Show only low stock items
npx @bizhub/cli inventory list --low-stock

# Update stock count
npx @bizhub/cli inventory update wireless-headphones --stock 150
```

### `discounts`

Manage product discounts and sales.

```bash
# Apply a discount
npx @bizhub/cli discounts apply wireless-headphones --percent 20

# Remove a discount
npx @bizhub/cli discounts remove wireless-headphones

# List all active discounts
npx @bizhub/cli discounts list
```

### `analytics`

View store performance metrics.

```bash
# Show analytics dashboard
npx @bizhub/cli analytics show

# Show customer data
npx @bizhub/cli analytics customers
```

### `data`

Browse reference data.

```bash
# List all categories
npx @bizhub/cli data categories

# List all stores
npx @bizhub/cli data stores
```

### `config`

View current configuration.

```bash
npx @bizhub/cli config
```

## Output Formats

### Table (default)

All commands output colored tables by default:

```
┌─────────┬──────────────────────┬────────┬────────┐
│ Name    │ Category             │ Price  │ Stock  │
├─────────┼──────────────────────┼────────┼────────┤
│ Headph. │ electronics          │ $79.99 │   150  │
│ Wallet  │ accessories          │ $49.99 │     5  │
│ Shirt   │ clothing             │ $29.99 │    20  │
└─────────┴──────────────────────┴────────┴────────┘
```

### JSON

Append `--json` for machine-readable output:

```bash
npx @bizhub/cli products list --json
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

### JSON mode properties

- Always includes `success` boolean
- `data` contains the response payload
- `error` string present on failure
- Exit codes: 0 (success), 1 (error)

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Error (invalid args, API error, auth failure) |

## Environment Variables

See [Configuration guide](../guides/configuration.md) for setup details.
