import { z } from "zod";
import { api } from "../client.js";
import type { ToolDefinition } from "../types.js";

export const getAnalytics: ToolDefinition = {
  name: "analytics_get",
  description:
    "Get store performance analytics including total orders, completed orders, total revenue, average order value, unique customers, and pending orders. This is your store's health overview.",
  schema: z.object({}),
  handler: async () => {
    const analytics = await api.getAnalytics();
    return { success: true, data: analytics };
  },
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

export const listCustomers: ToolDefinition = {
  name: "customers_list",
  description:
    "List all customers who have purchased from your store, along with their order count, lifetime total spend, and last order date. Sorted by total spend descending.",
  schema: z.object({}),
  handler: async () => {
    const customers = await api.listCustomers();
    return {
      success: true,
      data: {
        count: customers.length,
        totalRevenue: customers.reduce((s, c) => s + c.totalSpent, 0),
        avgLifetimeValue:
          customers.length > 0
            ? +(customers.reduce((s, c) => s + c.totalSpent, 0) / customers.length).toFixed(2)
            : 0,
        customers,
      },
    };
  },
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

export const analyticsTools: ToolDefinition[] = [getAnalytics, listCustomers];
