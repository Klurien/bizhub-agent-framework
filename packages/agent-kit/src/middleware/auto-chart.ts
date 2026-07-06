import type { MiddlewareFn } from "../types.js";

const CHARTABLE_TOOLS = new Set([
  "analytics_get",
  "customers_list",
  "inventory_list",
  "products_list",
  "orders_list",
]);

export function autoChart(): MiddlewareFn {
  return async (tool, args, ctx, next) => {
    const result = await next();

    if (
      result.success &&
      result.data &&
      CHARTABLE_TOOLS.has(tool.name) &&
      ctx.metadata?.autoChart !== false
    ) {
      try {
        const chartData = extractChartData(tool.name, result.data);
        if (chartData) {
          const { createChart } = await import("../tools/charts.js");
          const chartResult = await createChart.handler(
            {
              data: chartData.values,
              semanticTypes: chartData.semanticTypes,
              chartType: chartData.recommendedType,
              title: chartData.title,
              xField: chartData.xField,
              yField: chartData.yField,
              backend: "echarts",
              width: 600,
              height: 400,
            },
            ctx
          );

          if (chartResult.success) {
            return {
              ...result,
              metadata: {
                ...result.metadata,
                chartSpec: chartResult.data,
              },
            };
          }
        }
      } catch {
        // Chart generation is optional; don't fail the tool
      }
    }

    return result;
  };
}

function extractChartData(
  toolName: string,
  data: unknown
): {
  values: Record<string, unknown>[];
  semanticTypes: Record<string, string>;
  recommendedType: string;
  title: string;
  xField: string;
  yField: string;
} | null {
  if (toolName === "analytics_get" && typeof data === "object" && data !== null) {
    const d = data as Record<string, unknown>;
    const values = [
      { metric: "Total Orders", value: d.totalOrders ?? 0 },
      { metric: "Completed", value: d.completedOrders ?? 0 },
      { metric: "Revenue", value: d.totalRevenue ?? 0 },
      { metric: "Avg Order Value", value: d.avgOrderValue ?? 0 },
      { metric: "Unique Customers", value: d.uniqueCustomers ?? 0 },
      { metric: "Pending", value: d.pendingOrders ?? 0 },
    ];
    return {
      values,
      semanticTypes: { metric: "Category", value: "Count" },
      recommendedType: "bar",
      title: "Store Analytics Overview",
      xField: "metric",
      yField: "value",
    };
  }

  if (
    toolName === "customers_list" &&
    typeof data === "object" &&
    data !== null
  ) {
    const d = data as { customers?: Array<Record<string, unknown>> };
    const customers = d.customers;
    if (Array.isArray(customers) && customers.length > 0) {
      return {
        values: customers.slice(0, 20),
        semanticTypes: { name: "Category", totalSpent: "Currency", orders: "Count" },
        recommendedType: "bar",
        title: "Top Customers by Lifetime Value",
        xField: "name",
        yField: "totalSpent",
      };
    }
  }

  if (
    toolName === "products_list" &&
    typeof data === "object" &&
    data !== null
  ) {
    const d = data as { items?: Array<Record<string, unknown>> };
    const items = d.items;
    if (Array.isArray(items) && items.length > 0) {
      return {
        values: items.slice(0, 20),
        semanticTypes: { name: "Category", price: "Currency", inventory: "Count" },
        recommendedType: "bar",
        title: "Product Inventory & Pricing",
        xField: "name",
        yField: "price",
      };
    }
  }

  if (
    toolName === "orders_list" &&
    typeof data === "object" &&
    data !== null
  ) {
    const d = data as { items?: Array<Record<string, unknown>> };
    const items = d.items;
    if (Array.isArray(items) && items.length > 0) {
      return {
        values: items.slice(0, 30),
        semanticTypes: {
          status: "Category",
          amount: "Currency",
          createdAt: "YearMonth",
        },
        recommendedType: "bar",
        title: "Recent Orders",
        xField: "status",
        yField: "amount",
      };
    }
  }

  if (
    toolName === "inventory_list" &&
    typeof data === "object" &&
    data !== null
  ) {
    const d = data as { items?: Array<Record<string, unknown>> };
    const items = d.items;
    if (Array.isArray(items) && items.length > 0) {
      return {
        values: items.slice(0, 20),
        semanticTypes: { name: "Category", inventory: "Count" },
        recommendedType: "bar",
        title: "Inventory Levels",
        xField: "name",
        yField: "inventory",
      };
    }
  }

  return null;
}
