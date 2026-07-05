import { z } from "zod";
import { api } from "../client.js";
import type { ToolDefinition } from "../types.js";

export const listInventory: ToolDefinition = {
  name: "inventory_list",
  description:
    "View inventory levels across all products. Shows stock count, price, and status. Use lowStock=true to filter for products with stock at or below 5 units that may need restocking.",
  schema: z.object({
    lowStock: z
      .boolean()
      .optional()
      .default(false)
      .describe("If true, only show products with stock ≤ 5"),
  }),
  handler: async ({ lowStock }) => {
    const data = await api.listProducts({ limit: 200 });
    let items = data.items.filter((p) => p.status === "ACTIVE");

    if (lowStock) {
      items = items.filter((p) => p.inventory > 0 && p.inventory <= 5);
    }

    return {
      success: true,
      data: {
        summary: {
          total: items.length,
          inStock: items.filter((p) => p.inventory > 5).length,
          lowStock: items.filter((p) => p.inventory > 0 && p.inventory <= 5).length,
          outOfStock: items.filter((p) => p.inventory === 0).length,
          totalUnits: items.reduce((s, p) => s + p.inventory, 0),
        },
        products: items.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          inventory: p.inventory,
          price: p.price,
          status: p.inventory === 0 ? "out_of_stock" : p.inventory <= 5 ? "low" : "ok",
        })),
      },
    };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const updateInventory: ToolDefinition = {
  name: "inventory_update",
  description:
    "Update the stock count for a specific product by slug. Use this to restock items, adjust inventory after physical counts, or correct stock levels.",
  schema: z.object({
    slug: z.string().describe("Product slug to update stock for"),
    stock: z
      .number()
      .int()
      .min(0)
      .describe("New stock count (0 = out of stock)"),
  }),
  handler: async ({ slug, stock }) => {
    const { product } = await api.updateProduct(slug, {
      inventory: stock,
    });
    return {
      success: true,
      data: {
        product: product.name,
        slug: product.slug,
        previousInventory: product.inventory,
        newInventory: stock,
      },
    };
  },
  permissions: ["inventory:write"],
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const inventoryTools: ToolDefinition[] = [listInventory, updateInventory];
