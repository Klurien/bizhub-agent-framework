import type { MiddlewareFn, RateLimitConfig } from "../types.js";

// ─── Logging Middleware ───────────────────────────────────────

export function logging(options?: {
  level?: "debug" | "info" | "warn";
}): MiddlewareFn {
  return async (tool, args, ctx, next) => {
    const start = performance.now();
    const result = await next();
    const duration = Math.round(performance.now() - start);

    if (options?.level !== "debug" || result.success) {
      console.log(
        JSON.stringify({
          level: options?.level || "info",
          tool: tool.name,
          success: result.success,
          duration,
          agentId: ctx.agentId,
          requestId: ctx.requestId,
          timestamp: new Date().toISOString(),
        })
      );
    }

    return result;
  };
}

// ─── Auth Middleware ──────────────────────────────────────────

export function requirePermission(permission: string): MiddlewareFn {
  return async (tool, _args, ctx, next) => {
    if (tool.permissions && tool.permissions.length > 0) {
      if (!ctx.session.permissions.includes(permission)) {
        return {
          success: false,
          error: `Missing required permission: ${permission}`,
        };
      }
    }
    return next();
  };
}

export function requireRole(...roles: string[]): MiddlewareFn {
  return async (_tool, _args, ctx, next) => {
    if (!roles.includes(ctx.session.role)) {
      return {
        success: false,
        error: `Required role: ${roles.join(" or ")}, got: ${ctx.session.role}`,
      };
    }
    return next();
  };
}

// ─── Rate Limiting Middleware ─────────────────────────────────

interface RateLimitStore {
  [key: string]: { count: number; resetAt: number };
}

const store: RateLimitStore = {};

export function rateLimit(config: RateLimitConfig): MiddlewareFn {
  return async (tool, _args, ctx, next) => {
    const key = `${tool.name}:${ctx.agentId}`;
    const now = Date.now();

    if (!store[key] || store[key].resetAt < now) {
      store[key] = { count: 0, resetAt: now + config.windowMs };
    }

    store[key].count++;

    if (store[key].count > config.maxRequests) {
      const retryAfter = Math.ceil(
        (store[key].resetAt - now) / 1000
      );
      return {
        success: false,
        error: `Rate limit exceeded. Try again in ${retryAfter}s`,
        metadata: { retryAfter, limit: config.maxRequests, windowMs: config.windowMs },
      };
    }

    return next();
  };
}

// ─── Retry Middleware ─────────────────────────────────────────

export function retry(maxRetries = 3, delayMs = 1000): MiddlewareFn {
  return async (tool, args, ctx, next) => {
    let lastError: string | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, delayMs * attempt));
      }

      const result = await next();
      if (result.success) return result;

      lastError = result.error;
    }

    return {
      success: false,
      error: `Failed after ${maxRetries} retries: ${lastError}`,
      metadata: { maxRetries, lastError },
    };
  };
}

// ─── Timeout Middleware ───────────────────────────────────────

export function timeout(ms: number): MiddlewareFn {
  return async (_tool, _args, ctx, next) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);

    try {
      const result = await next();
      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        return { success: false, error: `Tool execution timed out after ${ms}ms` };
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };
}

// ─── Audit Middleware ─────────────────────────────────────────

export function audit(options?: { persist?: boolean }): MiddlewareFn {
  return async (tool, args, ctx, next) => {
    const start = performance.now();
    const result = await next();
    const duration = Math.round(performance.now() - start);

    const entry = {
      timestamp: new Date().toISOString(),
      agentId: ctx.agentId,
      requestId: ctx.requestId,
      tool: tool.name,
      userId: ctx.session.userId,
      args: sanitizeArgs(args as Record<string, unknown>),
      success: result.success,
      duration,
      error: result.error,
    };

    console.log(`[bizhub:audit] ${JSON.stringify(entry)}`);

    if (options?.persist) {
      // In production, write to database or log aggregator
      await Promise.resolve();
    }

    return result;
  };
}

function sanitizeArgs(
  args: Record<string, unknown>
): Record<string, unknown> {
  const sensitive = ["password", "token", "secret", "key", "auth"];
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    sanitized[key] = sensitive.some((s) => key.toLowerCase().includes(s))
      ? "[REDACTED]"
      : value;
  }
  return sanitized;
}
