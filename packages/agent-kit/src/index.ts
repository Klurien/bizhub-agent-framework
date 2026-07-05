// ═══════════════════════════════════════════════════════════════
//  @bizhub/agent-kit — Enterprise Agent SDK
//  Build AI agents that manage your marketplace
// ═══════════════════════════════════════════════════════════════

export { BizHubAgent } from "./agent.js";
export { ToolRegistry } from "./tool-registry.js";
export { api, ApiError, BizHubClient } from "./client.js";
export { getConfig } from "./config.js";

// Tools
export { allTools } from "./tools/index.js";
export { productTools } from "./tools/products.js";
export { orderTools } from "./tools/orders.js";
export { inventoryTools } from "./tools/inventory.js";
export { discountTools } from "./tools/discounts.js";
export { analyticsTools } from "./tools/analytics.js";
export { storeTools } from "./tools/stores.js";

// Middleware
export {
  logging,
  audit,
  rateLimit,
  retry,
  timeout,
  requirePermission,
  requireRole,
} from "./middleware/index.js";

// Provider adapters
export { openAIAdapter, anthropicAdapter } from "./providers/index.js";

// Types
export type {
  ToolDefinition,
  ToolContext,
  ToolResult,
  SessionInfo,
  AgentConfig,
  MiddlewareFn,
  MemoryProvider,
  RateLimitConfig,
  ProviderConfig,
  Product,
  Order,
  Customer,
  Analytics,
} from "./types.js";
