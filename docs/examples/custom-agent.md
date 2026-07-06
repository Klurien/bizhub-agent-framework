# Custom Agent

Build a specialized marketplace agent with custom tools, middleware, and memory.

## Example: Inventory Alert Agent

This agent monitors inventory and sends alerts when stock runs low.

```typescript
import { BizHubAgent, type ToolDefinition, z } from "@bizhub/agent-kit";

// 1. Define custom tools
const notifyTool: ToolDefinition = {
  name: "notify_send",
  description: "Send a notification alert",
  schema: z.object({
    channel: z.enum(["email", "slack", "sms"]),
    message: z.string().min(1).max(500),
  }),
  handler: async ({ channel, message }) => {
    // In production, integrate with Slack/Email/SMS APIs
    console.log(`[${channel.toUpperCase()}] ${message}`);
    return { success: true, data: { sent: true, channel } };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
};

const scheduleTool: ToolDefinition = {
  name: "schedule_restock",
  description: "Schedule a restock order with a supplier",
  schema: z.object({
    slug: z.string(),
    quantity: z.number().int().positive(),
    supplier: z.string(),
  }),
  handler: async ({ slug, quantity, supplier }) => {
    // In production, integrate with supplier API
    return {
      success: true,
      data: { scheduled: true, slug, quantity, supplier, eta: "3-5 days" },
    };
  },
  permissions: ["inventory:write"],
};

// 2. Create agent with custom middleware
const agent = new BizHubAgent({
  name: "inventory-alert-agent",
  version: "1.0.0",
});

// 3. Load default tools + custom tools
agent.loadDefaultTools();
agent.useMany([notifyTool, scheduleTool]);

// 4. Add alert-specific middleware
import { audit, rateLimit } from "@bizhub/agent-kit";

agent.middleware(audit({ persist: true }));
agent.middleware(rateLimit({ maxRequests: 100, windowMs: 60000 }));

// 5. Run the agent
async function checkAndAlert() {
  const inventory = await agent.execute("inventory_list", { lowStock: true });

  if (!inventory.success || !inventory.data.products.length) {
    console.log("All stock levels are healthy");
    return;
  }

  console.log(`Found ${inventory.data.products.length} low-stock products`);

  // Notify about each low-stock item
  for (const product of inventory.data.products) {
    await agent.execute("notify_send", {
      channel: "slack",
      message: `⚠️ Low stock: ${product.name} (${product.stock} remaining)`,
    });
  }

  // Auto-restock critically low items (stock <= 2)
  const criticalItems = inventory.data.products.filter(
    (p: { stock: number }) => p.stock <= 2
  );

  for (const item of criticalItems) {
    await agent.execute("schedule_restock", {
      slug: item.slug,
      quantity: 50,
      supplier: "default-supplier",
    });
    console.log(`Auto-restocked ${item.name}`);
  }
}

checkAndAlert().catch(console.error);
```

## Example: Multi-Store Manager

Manage multiple stores with role-based access control.

```typescript
const storeAgent = new BizHubAgent({
  name: "multi-store-manager",
  version: "2.0.0",
});

storeAgent.loadDefaultTools();

// Add role enforcement middleware
import { requireRole } from "@bizhub/agent-kit";
storeAgent.middleware(requireRole("admin", "manager"));

// Execute as admin
await storeAgent.execute("products_create", {
  name: "Premium T-Shirt",
  price: 39.99,
  category: "clothing",
}, {
  roles: ["admin"],
});

// Execute as viewer (will be rejected)
const result = await storeAgent.execute("products_delete", {
  slug: "premium-t-shirt",
}, {
  roles: ["viewer"],
});
// result.success === false, result.error === "Insufficient permissions"
```

## Example: Custom Memory

```typescript
import type { MemoryProvider } from "@bizhub/agent-kit";

// Redis-backed memory provider
class RedisMemoryProvider implements MemoryProvider {
  constructor(private client: Redis) {}

  async get(key: string) {
    const val = await this.client.get(`bizhub:${key}`);
    return val ? JSON.parse(val) : null;
  }

  async set(key: string, value: unknown, ttl?: number) {
    const serialized = JSON.stringify(value);
    if (ttl) {
      await this.client.setex(`bizhub:${key}`, ttl, serialized);
    } else {
      await this.client.set(`bizhub:${key}`, serialized);
    }
  }

  async delete(key: string) {
    await this.client.del(`bizhub:${key}`);
  }

  async list(prefix: string) {
    const keys = await this.client.keys(`bizhub:${prefix}*`);
    const entries = await Promise.all(
      keys.map(async (key: string) => {
        const value = JSON.parse(await this.client.get(key) ?? "null");
        return { key: key.replace("bizhub:", ""), value };
      })
    );
    return entries;
  }
}

// Use it
const agent = new BizHubAgent({
  name: "persistent-agent",
  memory: new RedisMemoryProvider(redisClient),
});
```
