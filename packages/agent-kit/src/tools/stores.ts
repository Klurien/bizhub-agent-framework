import { z } from "zod";
import { api } from "../client.js";
import type { ToolDefinition } from "../types.js";

export const listStores: ToolDefinition = {
  name: "stores_list",
  description:
    "List all stores in the marketplace with their name, rating, product count, and verification status.",
  schema: z.object({}),
  handler: async () => {
    const data = await api.listStores();
    const items = (data as { stores?: unknown[] }).stores || [];
    return { success: true, data: items };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const listCategories: ToolDefinition = {
  name: "categories_list",
  description:
    "List all product categories available in the marketplace. Use this to find category slugs and IDs for filtering products or creating new products.",
  schema: z.object({}),
  handler: async () => {
    const data = await api.listCategories();
    const items = (data as { categories?: unknown[] }).categories || [];
    return { success: true, data: items };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const storeTools: ToolDefinition[] = [listStores, listCategories];
