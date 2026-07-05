import { z } from "zod";

// ─── Core Types ───────────────────────────────────────────────

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny> {
  name: string;
  description: string;
  schema: TSchema;
  handler: (args: z.infer<TSchema>, ctx: ToolContext) => Promise<ToolResult>;
  permissions?: string[];
  rateLimit?: RateLimitConfig;
  version?: string;
  deprecated?: boolean;
}

export interface ToolContext {
  requestId: string;
  agentId: string;
  session: SessionInfo;
  metadata: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface SessionInfo {
  userId: string;
  storeId?: string;
  role: "admin" | "seller" | "viewer";
  permissions: string[];
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration?: number;
  warnings?: string[];
  metadata?: Record<string, unknown>;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
}

export interface AgentConfig {
  name: string;
  version: string;
  description?: string;
  tools?: string[];
  middleware?: MiddlewareFn[];
  memory?: MemoryProvider;
  provider?: ProviderConfig;
}

export interface ProviderConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// ─── Middleware ────────────────────────────────────────────────

export type MiddlewareFn = (
  tool: ToolDefinition,
  args: unknown,
  ctx: ToolContext,
  next: () => Promise<ToolResult>
) => Promise<ToolResult>;

export interface ProviderAdapter {
  formatTools(tools: ToolDefinition[]): unknown[];
  parseResult(result: unknown): { toolName: string; args: Record<string, unknown> } | null;
}

// ─── Memory ───────────────────────────────────────────────────

export interface MemoryProvider {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown, ttl?: number): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix: string): Promise<{ key: string; value: unknown }[]>;
}

// ─── Events ───────────────────────────────────────────────────

export interface AgentEvent {
  type: string;
  agentId: string;
  timestamp: Date;
  payload: Record<string, unknown>;
}

export interface EventHandler {
  (event: AgentEvent): Promise<void>;
}

// ─── API Response Types (from BizHub backend) ─────────────────

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  originalPrice: number | null;
  inventory: number;
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  images: string[];
  category: { id: string; name: string; slug: string };
  badge: string | null;
  views: number;
  createdAt: string;
  store?: { id: string; name: string; slug: string } | null;
}

export interface Order {
  id: string;
  amount: number;
  quantity: number;
  status: "pending" | "completed" | "refunded" | "cancelled";
  createdAt: string;
  product: { id: string; name: string; slug: string; price: number };
  buyer: { id: string; name: string; email: string };
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  orders: number;
  totalSpent: number;
  lastOrder: string;
}

export interface Analytics {
  totalOrders: number;
  completedOrders: number;
  totalRevenue: number;
  avgOrderValue: number;
  uniqueCustomers: number;
  pendingOrders: number;
}
