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
export { chartTools } from "./tools/charts.js";

// Middleware
export {
  logging,
  audit,
  rateLimit,
  retry,
  timeout,
  requirePermission,
  requireRole,
  autoChart,
  openTelemetryTracing,
  openTelemetryMetrics,
} from "./middleware/index.js";

// Provider adapters
export { openAIAdapter, anthropicAdapter } from "./providers/index.js";

// Graph engine
export {
  StateGraph,
  PregelEngine,
  InMemoryCheckpointer,
  createReActGraph,
  createReActAgent,
  formatToolsForOpenAI,
  addReducer,
  replaceReducer,
  mergeReducer,
  appendReducer,
  concatReducer,
} from "./graph/index.js";

// Memory
export { MemoryType, createVectorMemoryStore } from "./memory/index.js";

// Orchestration
export { Supervisor } from "./orchestration/index.js";
export type { SubAgent } from "./orchestration/index.js";

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

// Graph types
export type {
  GraphState,
  GraphNode,
  Edge,
  Checkpointer,
  StepRecord,
  GraphRunResult,
  Reducer,
  ReducerMap,
  LLMInterface,
  ReActConfig,
} from "./graph/index.js";
