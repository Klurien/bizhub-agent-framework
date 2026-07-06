import type { MiddlewareFn } from "../types.js";

export function openTelemetryMetrics(): MiddlewareFn {
  return async (tool, args, ctx, next) => {
    let api: typeof import("@opentelemetry/api") | null = null;
    try {
      api = await import("@opentelemetry/api");
    } catch {
      return next();
    }

    const meter = api.metrics.getMeter("@biz-hub/agent-kit", "1.2.0");
    const toolExecutions = meter.createCounter("agent.tool.executions", {
      description: "Count of tool executions",
    });
    const toolDuration = meter.createHistogram("agent.tool.duration", {
      description: "Tool execution duration",
      unit: "ms",
    });
    const tokenUsage = meter.createCounter("agent.tool.tokens", {
      description: "Estimated token usage",
    });

    const start = performance.now();
    const result = await next();
    const duration = Math.round(performance.now() - start);

    toolExecutions.add(1, {
      tool: tool.name,
      success: String(result.success),
      agent: ctx.agentId,
    });

    toolDuration.record(duration, {
      tool: tool.name,
      success: String(result.success),
    });

    const estimatedTokens = Math.ceil(
      (JSON.stringify(args).length + JSON.stringify(result).length) / 4
    );
    tokenUsage.add(estimatedTokens, {
      tool: tool.name,
      agent: ctx.agentId,
    });

    return result;
  };
}
