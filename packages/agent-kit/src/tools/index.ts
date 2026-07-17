import { productTools } from "./products.js";
import { orderTools } from "./orders.js";
import { inventoryTools } from "./inventory.js";
import { discountTools } from "./discounts.js";
import { analyticsTools } from "./analytics.js";
import { storeTools } from "./stores.js";
import { chartTools } from "./charts.js";
import { messagingTools } from "./messaging.js";
import type { ToolDefinition } from "../types.js";

export const allTools: ToolDefinition[] = [
  ...productTools,
  ...orderTools,
  ...inventoryTools,
  ...discountTools,
  ...analyticsTools,
  ...storeTools,
  ...chartTools,
  ...messagingTools,
];

export { productTools } from "./products.js";
export { orderTools } from "./orders.js";
export { inventoryTools } from "./inventory.js";
export { discountTools } from "./discounts.js";
export { analyticsTools } from "./analytics.js";
export { storeTools } from "./stores.js";
export { chartTools } from "./charts.js";
export { messagingTools } from "./messaging.js";
