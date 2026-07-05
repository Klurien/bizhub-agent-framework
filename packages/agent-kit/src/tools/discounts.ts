import { z } from "zod";
import { api } from "../client.js";
import type { ToolDefinition } from "../types.js";

export const applyDiscount: ToolDefinition = {
  name: "discounts_apply",
  description:
    "Apply a percentage discount to a product. Calculates the sale price automatically and preserves the original price. Use this for sales, promotions, and seasonal discounts.",
  schema: z.object({
    slug: z.string().describe("Product slug to apply discount to"),
    percent: z
      .number()
      .min(1)
      .max(99)
      .describe("Discount percentage (e.g., 20 for 20% off)"),
    label: z
      .string()
      .max(50)
      .optional()
      .describe("Optional label for the sale (e.g., 'Summer Sale')"),
  }),
  handler: async ({ slug, percent }) => {
    const { product } = await api.getProduct(slug);
    const discounted = +(product.price * (1 - percent / 100)).toFixed(2);
    const result = await api.applyDiscount(product.id, discounted, product.price);
    const updated = result.product;

    return {
      success: true,
      data: {
        product: updated.name,
        slug: updated.slug,
        originalPrice: product.price,
        salePrice: discounted,
        savings: +(product.price - discounted).toFixed(2),
        percentOff: percent,
      },
    };
  },
  permissions: ["discounts:write"],
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

export const removeDiscount: ToolDefinition = {
  name: "discounts_remove",
  description:
    "Remove the sale price from a product, restoring it to its original price. Use this when a promotion ends.",
  schema: z.object({
    slug: z.string().describe("Product slug to remove discount from"),
  }),
  handler: async ({ slug }) => {
    const { product } = await api.getProduct(slug);
    const original = product.originalPrice || product.price;
    const result = await api.applyDiscount(product.id, original, 0);
    return {
      success: true,
      data: {
        product: result.product?.name || slug,
        price: original,
        discountRemoved: true,
      },
    };
  },
  permissions: ["discounts:write"],
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

export const listDiscounts: ToolDefinition = {
  name: "discounts_list",
  description:
    "List all products that currently have active discounts or sale prices. Shows original price, current sale price, and percentage off.",
  schema: z.object({}),
  handler: async () => {
    const data = await api.listProducts({ limit: 200 });
    const discounted = data.items.filter(
      (p) => p.originalPrice && p.originalPrice > p.price
    );

    return {
      success: true,
      data: {
        count: discounted.length,
        discounts: discounted.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          originalPrice: p.originalPrice,
          currentPrice: p.price,
          percentOff: Math.round((1 - p.price / p.originalPrice!) * 100),
        })),
      },
    };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const discountTools: ToolDefinition[] = [
  applyDiscount,
  removeDiscount,
  listDiscounts,
];
