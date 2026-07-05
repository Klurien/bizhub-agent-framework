import { getConfig } from "./config.js";
import type { Product, Order, Analytics, Customer } from "./types.js";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export class BizHubClient {
  private baseUrl: string;
  private headers: Record<string, string>;

  constructor() {
    const cfg = getConfig();
    this.baseUrl = cfg.apiUrl;
    this.headers = { "Content-Type": "application/json" };

    if (cfg.apiKey) {
      this.headers["X-API-Key"] = cfg.apiKey;
    }
    if (cfg.authCookie) {
      this.headers["Cookie"] = `auth=${cfg.authCookie}`;
      this.headers["Authorization"] = `Bearer ${cfg.authCookie}`;
    }
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}/api${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new ApiError(
        res.status,
        data.message || `Request failed`,
        data.code
      );
    }

    return data as T;
  }

  // ─── Products ──────────────────────────────────────────────

  async listProducts(params?: {
    category?: string;
    sellerId?: string;
    sort?: string;
    limit?: number;
  }): Promise<{ items: Product[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.category) qs.set("category", params.category);
    if (params?.sellerId) qs.set("sellerId", params.sellerId);
    if (params?.sort) qs.set("sort", params.sort);
    if (params?.limit) qs.set("limit", String(params.limit));
    return this.request("GET", `/products?${qs}`);
  }

  async getProduct(slug: string): Promise<{ product: Product }> {
    return this.request("GET", `/products/${slug}`);
  }

  async createProduct(data: {
    name: string;
    description: string;
    price: string;
    categoryId: string;
    storeId?: string;
    inventory?: number;
    badge?: string;
    images?: string[];
  }): Promise<{ product: Product }> {
    return this.request("POST", "/products", data);
  }

  async updateProduct(
    slug: string,
    data: Partial<{
      price: string;
      inventory: number;
      status: string;
    }>
  ): Promise<{ product: Product }> {
    return this.request("PATCH", `/products/${slug}`, data);
  }

  async deleteProduct(slug: string): Promise<void> {
    return this.request("DELETE", `/products/${slug}`);
  }

  async applyDiscount(
    productId: string,
    price: number,
    originalPrice: number
  ): Promise<{ product: Product }> {
    return this.request("PATCH", "/products", {
      id: productId,
      price,
      originalPrice,
    });
  }

  // ─── Orders ────────────────────────────────────────────────

  async listOrders(params?: {
    status?: string;
    limit?: number;
  }): Promise<{ items: Order[]; total: number }> {
    const qs = new URLSearchParams();
    if (params?.status) qs.set("status", params.status);
    if (params?.limit) qs.set("limit", String(params.limit));
    return this.request("GET", `/orders?${qs}`);
  }

  async getOrder(id: string): Promise<{ order: Order }> {
    return this.request("GET", `/orders/${id}`);
  }

  async updateOrderStatus(
    id: string,
    status: string
  ): Promise<{ order: Order }> {
    return this.request("PATCH", "/orders", { id, status });
  }

  // ─── Analytics ─────────────────────────────────────────────

  async getAnalytics(): Promise<Analytics> {
    const data = await this.request<{ items: Order[] }>(
      "GET",
      "/orders?limit=500"
    );
    const orders = data.items || [];
    const completed = orders.filter((o) => o.status === "completed");
    const revenue = completed.reduce((s, o) => s + o.amount, 0);
    const buyers = new Set(orders.map((o) => o.buyer?.id).filter(Boolean));

    return {
      totalOrders: orders.length,
      completedOrders: completed.length,
      totalRevenue: revenue,
      avgOrderValue: completed.length > 0 ? +(revenue / completed.length).toFixed(2) : 0,
      uniqueCustomers: buyers.size,
      pendingOrders: orders.filter((o) => o.status === "pending").length,
    };
  }

  // ─── Customers ─────────────────────────────────────────────

  async listCustomers(): Promise<Customer[]> {
    const data = await this.request<{ items: Order[] }>(
      "GET",
      "/orders?limit=500"
    );
    const orders = data.items || [];
    const map = new Map<string, Customer>();

    for (const o of orders) {
      if (o.buyer) {
        const existing = map.get(o.buyer.id);
        if (existing) {
          existing.orders++;
          existing.totalSpent += o.amount;
        } else {
          map.set(o.buyer.id, {
            id: o.buyer.id,
            name: o.buyer.name,
            email: o.buyer.email,
            orders: 1,
            totalSpent: o.amount,
            lastOrder: o.createdAt,
          });
        }
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => b.totalSpent - a.totalSpent
    );
  }

  // ─── Categories ────────────────────────────────────────────

  async listCategories(): Promise<{ categories: unknown[] }> {
    return this.request("GET", "/categories");
  }

  // ─── Stores ────────────────────────────────────────────────

  async listStores(): Promise<{ stores: unknown[] }> {
    return this.request("GET", "/stores");
  }
}

export const api = new BizHubClient();
