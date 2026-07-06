import type { MiddlewareFn } from "../types.js";

export function openTelemetryTracing(): MiddlewareFn {
  return async (tool, args, ctx, next) => {
    let api: typeof import("@opentelemetry/api") | null = null;
    try {
      api = await import("@opentelemetry/api");
    } catch {
      return next();
    }

    const tracer = api.trace.getTracer("@biz-hub/agent-kit", "1.2.0");
    const span = tracer.startSpan(`tool.${tool.name}`, {
      attributes: {
        "gen_ai.agent.name": ctx.agentId,
        "gen_ai.tool.name": tool.name,
        "gen_ai.request.id": ctx.requestId,
        "gen_ai.tool.version": tool.version || "unknown",
        "gen_ai.session.id": ctx.session.userId,
      },
    });

    return api.context.with(
      api.trace.setSpan(api.context.active(), span),
      async () => {
        try {
          const result = await next();

          span.setAttributes({
            "gen_ai.tool.success": result.success,
            "gen_ai.tool.duration_ms": result.duration || 0,
          });

          if (result.error) {
            span.setStatus({
              code: api!.SpanStatusCode.ERROR,
              message: result.error,
            });
          }

          span.end();
          return result;
        } catch (error) {
          span.setStatus({
            code: api!.SpanStatusCode.ERROR,
            message:
              error instanceof Error ? error.message : "Unknown error",
          });
          span.end();
          throw error;
        }
      }
    );
  };
}
