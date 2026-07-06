# Built-in Tools Reference

All 17 tools available in `@bizhub/agent-kit`. Load them via `agent.loadDefaultTools()`.

---

## Products

### `products_list`

List products with optional filters.

```typescript
agent.execute("products_list", {
  category?: "electronics",     // Filter by category slug
  seller?: "user-id-123",      // Filter by seller ID
  sort?: "newest" | "price_asc" | "price_desc",
  limit?: 50,                   // Max results (default: 50, max: 200)
});
```

**Response:** `{ count, products: [{ id, name, slug, price, inventory, status, category, badge, views }] }`

### `products_get`

Get detailed information about a specific product.

```typescript
agent.execute("products_get", {
  slug: "wireless-headphones",  // Product URL slug (required)
});
```

**Response:** Full product object with description, images, seller info, reviews.

### `products_create`

Create a new product in the marketplace.

```typescript
agent.execute("products_create", {
  name: "Wireless Headphones",       // Required
  description: "Premium noise-cancelling...",  // Required
  price: 79.99,                       // Required, positive number
  category: "cat-id-456",            // Required, use categories_list
  store?: "store-id-789",            // Store to link
  inventory?: 50,                    // Stock count (default: 1)
  badge?: "new" | "hot" | "trending" | "sale",
  images?: ["https://..."],          // Array of image URLs
});
```

**Permissions:** `products:write`
**Rate limit:** 30 req/min

### `products_update`

Update an existing product.

```typescript
agent.execute("products_update", {
  slug: "wireless-headphones",  // Required
  price?: 69.99,                // New price
  inventory?: 100,              // New stock count
  status?: "ACTIVE" | "DRAFT",  // Change listing status
});
```

**Permissions:** `products:write`

### `products_delete`

Permanently delete a product.

```typescript
agent.execute("products_delete", {
  slug: "wireless-headphones",  // Required
});
```

**Permissions:** `products:delete`
**Rate limit:** 20 req/min

---

## Orders

### `orders_list`

List orders from your store.

```typescript
agent.execute("orders_list", {
  status?: "pending" | "completed" | "refunded" | "cancelled",
  limit?: 50,  // Max results (default: 50, max: 500)
});
```

**Response:** `{ count, orders: [{ id, amount, quantity, status, product, buyer }], summary: { pending, completed, refunded, cancelled } }`

### `orders_get`

Get detailed information about a specific order.

```typescript
agent.execute("orders_get", {
  id: "order-uuid-here",  // Order UUID (required)
});
```

### `orders_update_status`

Update the status of an order.

```typescript
agent.execute("orders_update_status", {
  id: "order-uuid-here",       // Required
  status: "completed",          // pending | completed | refunded | cancelled
  reason?: "Customer requested refund",  // Optional reason
});
```

**Permissions:** `orders:write`
**Rate limit:** 30 req/min

---

## Inventory

### `inventory_list`

View inventory levels across all products.

```typescript
agent.execute("inventory_list", {
  lowStock?: true,  // Only show items with stock ≤ 5
});
```

**Response:** `{ summary: { total, inStock, lowStock, outOfStock, totalUnits }, products: [...] }`

### `inventory_update`

Update stock count for a product.

```typescript
agent.execute("inventory_update", {
  slug: "wireless-headphones",  // Required
  stock: 150,                    // Required, min 0
});
```

**Permissions:** `inventory:write`

---

## Discounts

### `discounts_apply`

Apply a percentage discount to a product.

```typescript
agent.execute("discounts_apply", {
  slug: "wireless-headphones",  // Required
  percent: 20,                   // Required, 1-99
  label?: "Summer Sale",         // Optional label
});
```

**Response:** `{ product, originalPrice, salePrice, savings, percentOff }`
**Permissions:** `discounts:write`
**Rate limit:** 30 req/min

### `discounts_remove`

Remove the sale price from a product.

```typescript
agent.execute("discounts_remove", {
  slug: "wireless-headphones",  // Required
});
```

**Permissions:** `discounts:write`

### `discounts_list`

List all products with active discounts.

```typescript
agent.execute("discounts_list", {});
```

**Response:** `{ count, discounts: [{ name, slug, originalPrice, currentPrice, percentOff }] }`

---

## Analytics

### `analytics_get`

Get store performance analytics.

```typescript
agent.execute("analytics_get", {});
```

**Response:** `{ totalOrders, completedOrders, totalRevenue, avgOrderValue, uniqueCustomers, pendingOrders }`

### `customers_list`

List customers with purchase history.

```typescript
agent.execute("customers_list", {});
```

**Response:** `{ count, totalRevenue, avgLifetimeValue, customers: [{ name, email, orders, totalSpent, lastOrder }] }`

---

## Data

### `categories_list`

List all product categories.

```typescript
agent.execute("categories_list", {});
```

### `stores_list`

List all stores in the marketplace.

```typescript
agent.execute("stores_list", {});
```

## Tool Listing Summary

| Tool | Permissions | Rate Limit | Version |
|------|-------------|------------|---------|
| `products_list` | — | 60/min | 1.0.0 |
| `products_get` | — | 120/min | 1.0.0 |
| `products_create` | `products:write` | 30/min | 1.0.0 |
| `products_update` | `products:write` | 60/min | 1.0.0 |
| `products_delete` | `products:delete` | 20/min | 1.0.0 |
| `orders_list` | — | 60/min | 1.0.0 |
| `orders_get` | — | 120/min | 1.0.0 |
| `orders_update_status` | `orders:write` | 30/min | 1.0.0 |
| `inventory_list` | — | 60/min | 1.0.0 |
| `inventory_update` | `inventory:write` | 60/min | 1.0.0 |
| `discounts_apply` | `discounts:write` | 30/min | 1.0.0 |
| `discounts_remove` | `discounts:write` | 30/min | 1.0.0 |
| `discounts_list` | — | 60/min | 1.0.0 |
| `analytics_get` | — | 30/min | 1.0.0 |
| `customers_list` | — | 30/min | 1.0.0 |
| `categories_list` | — | 60/min | 1.0.0 |
| `stores_list` | — | 60/min | 1.0.0 |
