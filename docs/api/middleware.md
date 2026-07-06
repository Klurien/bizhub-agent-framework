# Middleware API

Middleware functions run before and after every tool execution, enabling cross-cutting concerns like authentication, logging, rate limiting, and error handling.

## Execution Order

Middleware executes in registration order, forming a pipeline:

```
Incoming Request
    │
    ▼
┌─────────────┐
│ Middleware 1 │  (first registered)
│  ┌───────────┐
│  │ Midware 2 │
│  │  ┌─────────┐
│  │  │ Midware 3│
│  │  │   ...    │
│  │  │ Handler  │
│  │  └─────────┘
│  └───────────┘
└─────────────┘
    │
    ▼
   Response
```

Each middleware calls `next()` to pass control to the next in chain. Pre-processing happens before `next()`, post-processing after.

## Built-in Middleware

### `logging()`

Structured JSON logging of every tool execution.

```typescript
import { logging } from "@bizhub/agent-kit";

agent.middleware(logging());
// Output: {"level":"info","tool":"products_list","success":true,"duration":42,"agentId":"...","requestId":"..."}
```

### `audit({ persist })`

Comprehensive audit trail with argument sanitization.

```typescript
import { audit } from "@bizhub/agent-kit";

agent.middleware(audit({ persist: true }));
// Output: [bizhub:audit] {"timestamp":"...","tool":"orders_update_status","success":true,"duration":120,"args":{"id":"...","status":"completed"}}
```

Sensitive fields (password, token, secret, key, auth) are automatically redacted.

### `rateLimit({ maxRequests, windowMs })`

Per-tool, per-agent rate limiting with sliding window.

```typescript
import { rateLimit } from "@bizhub/agent-kit";

agent.middleware(rateLimit({
  maxRequests: 30,    // Max requests in the window
  windowMs: 60000,    // Window duration in ms (1 minute)
}));

// When exceeded: { success: false, error: "Rate limit exceeded. Try again in 30s" }
```

### `retry(maxRetries, delayMs)`

Automatic retry on failure with linear backoff.

```typescript
import { retry } from "@bizhub/agent-kit";

agent.middleware(retry(
  3,        // Max retry attempts
  1000,     // Initial delay in ms (multiplied by attempt number)
));

// After all retries exhausted: { success: false, error: "Failed after 3 retries: ..." }
```

### `timeout(ms)`

Abort tool execution that takes too long.

```typescript
import { timeout } from "@bizhub/agent-kit";

agent.middleware(timeout(30000));  // 30 second timeout
```

### `requirePermission(permission)`

Reject execution if the agent session lacks a specific permission.

```typescript
import { requirePermission } from "@bizhub/agent-kit";

agent.middleware(requirePermission("products:write"));
```

### `requireRole(...roles)`

Reject execution if the agent session doesn't have one of the required roles.

```typescript
import { requireRole } from "@bizhub/agent-kit";

agent.middleware(requireRole("admin", "seller"));
```

## Custom Middleware

```typescript
import type { MiddlewareFn } from "@bizhub/agent-kit";

const metricsMiddleware: MiddlewareFn = async (tool, args, ctx, next) => {
  const start = performance.now();

  // Pre-processing
  console.log(`Executing ${tool.name}...`);

  const result = await next();

  // Post-processing
  const duration = performance.now() - start;
  console.log(`${tool.name} completed in ${duration.toFixed(0)}ms`);

  // Enrich result
  return {
    ...result,
    metadata: {
      ...result.metadata,
      toolVersion: tool.version,
      duration,
    },
  };
};

agent.middleware(metricsMiddleware);
```

## Middleware Type

```typescript
type MiddlewareFn = (
  tool: ToolDefinition,     // The tool being executed
  args: unknown,            // Raw arguments (pre-validation)
  ctx: ToolContext,         // Execution context with session info
  next: () => Promise<ToolResult>  // Call to continue pipeline
) => Promise<ToolResult>;
```

## Default Middleware

When you create a `BizHubAgent`, these middleware are registered by default:

1. `logging()` — Structured logging
2. `audit({ persist: true })` — Audit trail

Custom middleware added via `agent.middleware()` runs after the defaults.
