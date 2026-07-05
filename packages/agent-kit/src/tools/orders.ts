import { z } from "zod";
import { api } from "../client.js";
import type { ToolDefinition } from "../types.js";

export const listOrders: ToolDefinition = {
  name: "orders_list",
  description:
    "List orders from your store. Optionally filter by status (pending, completed, refunded, cancelled). Returns order ID, amount, quantity, status, product name, and buyer info.",
  schema: z.object({
    status: z
      .enum(["pending", "completed", "refunded", "cancelled"])
      .optional()
      .describe("Filter orders by status"),
    limit: z
      .number()
      .min(1)
      .max(500)
      .optional()
      .default(50)
      .describe("Maximum orders to return"),
  }),
  handler: async ({ status, limit }) => {
    const data = await api.listOrders({ status, limit });
    return {
      success: true,
      data: {
        count: data.total,
        orders: data.items.map((o) => ({
          id: o.id,
          amount: o.amount,
          quantity: o.quantity,
          status: o.status,
          createdAt: o.createdAt,
          product: {
            id: o.product?.id,
            name: o.product?.name,
            slug: o.product?.slug,
          },
          buyer: {
            id: o.buyer?.id,
            name: o.buyer?.name,
            email: o.buyer?.email,
          },
        })),
        summary: {
          pending: data.items.filter((o) => o.status === "pending").length,
          completed: data.items.filter((o) => o.status === "completed").length,
          refunded: data.items.filter((o) => o.status === "refunded").length,
          cancelled: data.items.filter((o) => o.status === "cancelled").length,
        },
      },
    };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const getOrder: ToolDefinition = {
  name: "orders_get",
  description:
    "Get detailed information about a specific order by its ID. Returns full order details including product, buyer, amount, quantity, status, and timeline.",
  schema: z.object({
    id: z.string().describe("Order ID (usually a UUID)"),
  }),
  handler: async ({ id }) => {
    const data = await api.getOrder(id);
    return { success: true, data: data.order };
  },
  rateLimit: { maxRequests: 120, windowMs: 60000 },
  version: "1.0.0",
};

export const updateOrderStatus: ToolDefinition = {
  name: "orders_update_status",
  description:
    "Update the status of an order. Use this to mark orders as completed (fulfilled), refunded, or cancelled. Cannot revert a completed/refunded/cancelled order back to pending.",
  schema: z.object({
    id: z.string().describe("Order ID to update"),
    status: z
      .enum(["pending", "completed", "refunded", "cancelled"])
      .describe(
        "New status: completed = fulfilled, refunded = money returned, cancelled = order voided"
      ),
    reason: z
      .string()
      .max(500)
      .optional()
      .describe("Optional reason for the status change (e.g., refund reason)"),
  }),
  handler: async ({ id, status }) => {
    const { order } = await api.updateOrderStatus(id, status);
    return { success: true, data: order };
  },
  permissions: ["orders:write"],
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

export const orderTools: ToolDefinition[] = [
  listOrders,
  getOrder,
  updateOrderStatus,
];
