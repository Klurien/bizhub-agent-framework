import { z } from "zod";
import type { ToolDefinition } from "../types.js";

export const createChart: ToolDefinition = {
  name: "charts_create",
  description:
    "Generate a chart visualization from analytics data. " +
    "Automatically determines chart type from data semantics. " +
    "Returns a chart spec that can be rendered with ECharts or Chart.js.",
  schema: z.object({
    data: z
      .array(z.record(z.string(), z.unknown()))
      .describe("Array of data objects"),
    semanticTypes: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        "Map of field names to semantic types. " +
          "Common types: Currency, Quantity, Count, Percentage, YearMonth, Category, Country. " +
          'Example: { "revenue": "Currency", "month": "YearMonth", "region": "Country" }'
      ),
    chartType: z
      .enum([
        "bar",
        "line",
        "pie",
        "area",
        "scatter",
        "heatmap",
        "donut",
        "radar",
        "boxplot",
        "treemap",
        "sankey",
        "streamgraph",
      ])
      .optional()
      .describe("Chart type. If omitted, auto-selected from data semantics"),
    title: z.string().optional().describe("Chart title"),
    xField: z.string().optional().describe("Field name for X axis"),
    yField: z.string().optional().describe("Field name for Y axis"),
    colorField: z
      .string()
      .optional()
      .describe("Field name for color/grouping"),
    backend: z
      .enum(["echarts", "chartjs"])
      .optional()
      .default("echarts")
      .describe("Rendering backend"),
    width: z
      .number()
      .min(200)
      .max(2000)
      .optional()
      .default(600)
      .describe("Chart width in pixels"),
    height: z
      .number()
      .min(200)
      .max(2000)
      .optional()
      .default(400)
      .describe("Chart height in pixels"),
  }),
  handler: async (args) => {
    try {
      const encoder =
        args.backend === "chartjs"
          ? (await import("flint-chart")).assembleChartjs
          : (await import("flint-chart")).assembleECharts;

      const fieldDisplayNames: Record<string, string> = {};
      if (args.xField) fieldDisplayNames[args.xField] = args.xField;
      if (args.yField) fieldDisplayNames[args.yField] = args.yField;

      const spec = encoder({
        data: { values: args.data as Record<string, unknown>[] },
        ...(args.semanticTypes && { semantic_types: args.semanticTypes }),
        chart_spec: {
          chartType: args.chartType || inferChartType(args.semanticTypes || {}),
          encodings: {
            ...(args.xField && { x: args.xField }),
            ...(args.yField && { y: args.yField }),
            ...(args.colorField && { color: args.colorField }),
          },
          baseSize: { width: args.width, height: args.height },
          ...(args.title && {
            chartProperties: { title: args.title },
          }),
        },
        ...(Object.keys(fieldDisplayNames).length > 0 && {
          field_display_names: fieldDisplayNames,
        }),
      });

      return {
        success: true,
        data: {
          spec,
          backend: args.backend,
          html: `<div id="chart" style="width:${args.width}px;height:${args.height}px"></div>`,
          chartType: args.chartType || inferChartType(args.semanticTypes || {}),
          fields: {
            x: args.xField,
            y: args.yField,
            color: args.colorField,
          },
        },
      };
    } catch (err) {
      return {
        success: true,
        data: {
          spec: generateFallbackSpec(args),
          backend: args.backend,
          html: `<div id="chart" style="width:${args.width}px;height:${args.height}px"></div>`,
          chartType: args.chartType || inferChartType(args.semanticTypes || {}),
          note: "flint-chart not available. Generated basic spec.",
        },
      };
    }
  },
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

function inferChartType(semanticTypes: Record<string, string>): string {
  const types = Object.values(semanticTypes);
  if (
    types.includes("Category") &&
    types.some((t) =>
      ["Currency", "Quantity", "Count", "Revenue"].includes(t)
    )
  )
    return "bar";
  if (types.includes("YearMonth") || types.includes("Year")) return "line";
  if (types.includes("Country") || types.includes("Region")) return "bar";
  return "bar";
}

function generateFallbackSpec(args: {
  data: Record<string, unknown>[];
  chartType?: string;
  title?: string;
  xField?: string;
  yField?: string;
  colorField?: string;
}): Record<string, unknown> {
  const chartType = args.chartType || "bar";
  const xField = args.xField || "category";
  const yField = args.yField || "value";

  return {
    tooltip: { trigger: "axis" },
    title: { text: args.title || "", left: "center" },
    xAxis: { type: "category", data: args.data.map((d) => d[xField]) },
    yAxis: { type: "value" },
    series: [
      {
        type: chartType,
        data: args.data.map((d) => d[yField]),
      },
    ],
  };
}

export const chartTools: ToolDefinition[] = [createChart];
