import { z } from "zod";
import { api } from "../client.js";
import type { ToolDefinition } from "../types.js";

const CategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

export const listProducts: ToolDefinition = {
  name: "products_list",
  description:
    "List products in the marketplace with optional filters by category, seller, sort order, and pagination. Returns product name, price, stock, status, and category.",
  schema: z.object({
    category: z
      .string()
      .optional()
      .describe("Filter by category slug (use categories_list to find slugs)"),
    seller: z.string().optional().describe("Filter by seller user ID"),
    sort: z
      .enum(["newest", "price_asc", "price_desc"])
      .optional()
      .describe("Sort order for results"),
    limit: z
      .number()
      .min(1)
      .max(200)
      .optional()
      .default(50)
      .describe("Maximum number of products to return"),
  }),
  handler: async ({ category, seller, sort, limit }) => {
    const params = new URLSearchParams({ limit: String(limit || 50) });
    if (category) params.set("category", category);
    if (seller) params.set("sellerId", seller);
    if (sort) params.set("sort", sort);

    const data = await api.listProducts({
      category,
      sellerId: seller,
      sort,
      limit,
    });

    return {
      success: true,
      data: {
        count: data.total,
        products: data.items.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          price: p.price,
          originalPrice: p.originalPrice,
          inventory: p.inventory,
          status: p.status,
          category: p.category?.name,
          badge: p.badge,
          views: p.views,
          createdAt: p.createdAt,
        })),
      },
    };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const getProduct: ToolDefinition = {
  name: "products_get",
  description:
    "Get detailed information about a specific product by its URL slug. Returns full product details including description, images, pricing, stock, seller info, and category.",
  schema: z.object({
    slug: z.string().describe("Product slug (the URL-friendly identifier)"),
  }),
  handler: async ({ slug }) => {
    const { product } = await api.getProduct(slug);
    return { success: true, data: product };
  },
  rateLimit: { maxRequests: 120, windowMs: 60000 },
  version: "1.0.0",
};

export const createProduct: ToolDefinition = {
  name: "products_create",
  description:
    "Create a new product in the marketplace. Requires name, description, price, and category ID (use categories_list to find available categories). Optionally accepts store, inventory count, badge, and images.",
  schema: z.object({
    name: z.string().min(1).max(200).describe("Product name"),
    description: z
      .string()
      .min(1)
      .max(5000)
      .describe("Product description"),
    price: z
      .number()
      .positive()
      .describe("Product price in USD (e.g., 29.99)"),
    category: z.string().describe("Category ID (use categories_list to find)"),
    store: z.string().optional().describe("Store ID to associate the product with"),
    inventory: z
      .number()
      .int()
      .min(0)
      .optional()
      .default(1)
      .describe("Initial stock count"),
    badge: z
      .enum(["hot", "trending", "sale", "new"])
      .optional()
      .describe("Optional product badge"),
    images: z
      .array(z.string().url())
      .optional()
      .describe("Array of image URLs"),
  }),
  handler: async ({
    name,
    description,
    price,
    category,
    store,
    inventory,
    badge,
    images,
  }) => {
    const { product } = await api.createProduct({
      name,
      description,
      price: String(price),
      categoryId: category,
      storeId: store,
      inventory: inventory || 1,
      badge: badge || undefined,
      images,
    });

    return {
      success: true,
      data: product,
      warnings: [
        !store ? "Product not linked to a store — set one via stores_list" : undefined,
      ].filter((w): w is string => Boolean(w)),
    };
  },
  permissions: ["products:write"],
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

export const updateProduct: ToolDefinition = {
  name: "products_update",
  description:
    "Update an existing product's price, inventory count, or status. Provide only the fields you want to change.",
  schema: z.object({
    slug: z.string().describe("Product slug to update"),
    price: z.number().positive().optional().describe("New price"),
    inventory: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("New stock count"),
    status: z
      .enum(["ACTIVE", "DRAFT"])
      .optional()
      .describe("Set to DRAFT to hide, ACTIVE to list"),
  }),
  handler: async ({ slug, price, inventory, status }) => {
    const data: Record<string, unknown> = {};
    if (price !== undefined) data.price = String(price);
    if (inventory !== undefined) data.inventory = inventory;
    if (status) data.status = status;

    const { product } = await api.updateProduct(slug, data);
    return { success: true, data: product };
  },
  permissions: ["products:write"],
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const deleteProduct: ToolDefinition = {
  name: "products_delete",
  description:
    "Permanently delete a product from the marketplace by its slug. This action cannot be undone.",
  schema: z.object({
    slug: z.string().describe("Product slug to delete"),
  }),
  handler: async ({ slug }) => {
    await api.deleteProduct(slug);
    return {
      success: true,
      data: { deleted: slug, message: "Product permanently deleted" },
    };
  },
  permissions: ["products:delete"],
  rateLimit: { maxRequests: 20, windowMs: 60000 },
  version: "1.0.0",
};

export const productTools: ToolDefinition[] = [
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
];
