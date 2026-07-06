# Deep Dive: Technical Advancements for BizHub Agent Framework

Date: 2026-07-06
Previous doc: agent-framework-improvement-research.md
Scope: Implementation-level architecture, production patterns, code design

---

## 1. Agentic Loop Engine: From Middleware Chain to State Machine

### 1.1 Current Limitation

The `ToolRegistry` uses a linear middleware chain with recursive composition:

```
middleware[0] → middleware[1] → ... → middleware[n] → handler
```

This is fine for pre/post processing (auth, logging, rate limiting) but cannot express:
- Conditional branching (if tool A fails, try tool B)
- Parallel execution (fan-out research to 3 agents simultaneously)
- Loops (retry with different parameters)
- State machine transitions (pending → approved → executed)

### 1.2 Target Architecture: State Machine Graph

Modeled after LangGraph's proven pattern with three primitives:

```
Graph
  ├── Nodes:    Functions that process state and emit transitions
  ├── Edges:    Conditional or unconditional transitions between nodes
  └── State:    Typed schema flowing through the graph with reducers
```

**Implementation Concept:**

`packages/agent-kit/src/graph/`

```
graph/
  ├── index.ts          # Public API: StateGraph, Node, Edge
  ├── state-graph.ts    # StateGraph builder + compiler
  ├── pregel.ts         # Pregel runtime engine (parallel execution)
  ├── checkpoint.ts     # Checkpointing for durable execution
  ├── reducers.ts       # Built-in reducer functions (add, replace, merge)
  └── types.ts          # Graph types
```

**Core Types:**

```typescript
// types.ts
export interface GraphState {
  [key: string]: unknown;
}

export interface GraphNode<S extends GraphState> {
  name: string;
  execute: (state: S) => Promise<Partial<S>>;
  metadata?: {
    runIn?: "activity" | "workflow";  // For durable execution
    timeout?: number;
    retries?: number;
  };
}

export interface Edge<S extends GraphState> {
  from: string;
  to: string | ((state: S) => string);  // Conditional edge
}

export interface StateGraphConfig<S extends GraphState> {
  schema: z.ZodType<S>;          // Typed state schema
  nodes: GraphNode<S>[];
  edges: Edge<S>[];
}

export interface Checkpointer {
  save(namespace: string, key: string, state: unknown): Promise<void>;
  load(namespace: string, key: string): Promise<unknown | null>;
  list(namespace: string): Promise<{ key: string; state: unknown }[]>;
}
```

**StateGraph Builder:**

```typescript
// state-graph.ts
export class StateGraph<S extends GraphState> {
  private nodes = new Map<string, GraphNode<S>>();
  private edges: Edge<S>[] = [];
  private schema: z.ZodType<S>;
  private checkpointer?: Checkpointer;

  constructor(config: StateGraphConfig<S>) {
    this.schema = config.schema;
    for (const node of config.nodes) this.addNode(node);
    this.edges = config.edges;
  }

  addNode(node: GraphNode<S>): this { ... }
  addEdge(edge: Edge<S>): this { ... }
  setCheckpointer(cp: Checkpointer): this { ... }

  async run(
    initialState: S,
    options?: { threadId?: string; maxSteps?: number }
  ): Promise<{ finalState: S; steps: StepRecord[] }> {
    const threadId = options?.threadId || randomUUID();
    let state = { ...initialState };
    const steps: StepRecord[] = [];
    let current = "__start__";
    let stepCount = 0;

    while (current !== "__end__" && stepCount < (options?.maxSteps || 100)) {
      stepCount++;
      
      if (current === "__start__") {
        current = this.edges[0].from; // First node
      }

      const node = this.nodes.get(current);
      if (!node) throw new Error(`Node '${current}' not found`);

      const stepStart = performance.now();
      const partial = await node.execute(state);
      state = { ...state, ...partial };
      const duration = Math.round(performance.now() - stepStart);

      // Validate state against schema
      state = this.schema.parse(state) as S;

      // Checkpoint
      if (this.checkpointer) {
        await this.checkpointer.save("graph", threadId, {
          state,
          currentNode: current,
          stepCount,
        });
      }

      // Find next node via edges
      const edge = this.edges.find(e => e.from === current);
      if (!edge) {
        current = "__end__";
      } else if (typeof edge.to === "function") {
        current = edge.to(state);
      } else {
        current = edge.to;
      }

      steps.push({ node: current, duration });
    }

    return { finalState: state, steps };
  }

  async resume(threadId: string): Promise<{ finalState: S; steps: StepRecord[] }> {
    const checkpoint = await this.checkpointer?.load("graph", threadId);
    if (!checkpoint) throw new Error(`No checkpoint found for thread ${threadId}`);
    return this.run(checkpoint.state as S, { threadId });
  }
}
```

### 1.3 ReAct Loop as a Graph

The ReAct pattern maps directly to a state graph:

```
                    ┌──────────────┐
                    │   __start__   │
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │    think     │ ← LLM call: decide tool or respond
                    └──────┬───────┘
                           │
                    ┌──────▼───────┐
              ┌─────│   router     │─────┐
              │     └──────────────┘     │
         (has tool)                 (has answer)
              │                          │
        ┌─────▼──────┐           ┌──────▼───────┐
        │  execute   │           │  __end__      │
        │  tool      │           └──────────────┘
        └─────┬──────┘
              │
              └──────────→ back to think
```

```typescript
// ReAct graph builder
function createReActGraph(tools: ToolDefinition[], llm: LLMInterface) {
  const stateSchema = z.object({
    messages: z.array(z.any()),
    toolResults: z.array(z.any()).optional(),
    stepCount: z.number().default(0),
  });

  return new StateGraph({
    schema: stateSchema,
    nodes: [
      {
        name: "think",
        execute: async (state) => {
          const response = await llm.generate({
            messages: state.messages,
            tools: formatToolsForLLM(tools),
          });
          return {
            messages: [...state.messages, response.message],
            stepCount: state.stepCount + 1,
          };
        },
      },
      {
        name: "execute_tool",
        execute: async (state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          const toolCall = extractToolCall(lastMsg);
          const tool = tools.find(t => t.name === toolCall.name);
          const result = await tool!.handler(toolCall.args, createContext());
          return {
            messages: [...state.messages, { role: "tool", content: result }],
            toolResults: [...(state.toolResults || []), result],
          };
        },
      },
    ],
    edges: [
      { from: "__start__", to: "think" },
      {
        from: "think",
        to: (state) => {
          const lastMsg = state.messages[state.messages.length - 1];
          return hasToolCall(lastMsg) ? "execute_tool" : "__end__";
        },
      },
      { from: "execute_tool", to: "think" },
    ],
  });
}
```

### 1.4 Parallel Fan-Out Execution

For analytics and multi-agent patterns:

```typescript
// Parallel fan-out node
const fanOutNode: GraphNode<AnalyticsState> = {
  name: "analyze_all",
  execute: async (state) => {
    const [revenue, customers, products] = await Promise.all([
      agent.execute("analytics_get", {}),
      agent.execute("customers_list", {}),
      agent.execute("products_list", { limit: 5 }),
    ]);

    return {
      revenue: revenue.data,
      topCustomers: customers.data?.customers?.slice(0, 5),
      topProducts: products.data?.products?.slice(0, 5),
    };
  },
};
```

---

## 2. Flint Integration: AI Chart Rendering Pipeline

### 2.1 Flint Architecture Deep Dive

Flint is a semantic intermediate language for visualization. The compiler flow:

```
Agent Prompt ─→ Flint Spec ─→ Flint Compiler ─→ Backend Spec ─→ Rendered Chart
"show revenue     { data,          flint-chart      { Vega-Lite,      📊
 by category"      semantic_types,                    ECharts,
                   chart_spec }                       Chart.js }
```

**Semantic Types** (70+ in Flint 2026):

| Category | Types |
|----------|-------|
| Temporal | `Year`, `YearMonth`, `Quarter`, `Date`, `DateTime`, `Time` |
| Quantitative | `Quantity`, `Count`, `Currency`, `Percentage`, `Rate`, `Temperature`, `Distance`, `Area`, `Volume`, `Mass`, `Profit`, `Delta` |
| Categorical | `Category`, `Country`, `City`, `Region`, `Language`, `Product`, `Brand`, `Gender`, `AgeGroup`, `Segment` |
| Hierarchical | `Rank`, `Ordinal`, `Tier`, `Level`, `Stage` |
| Identifier | `ID`, `Name`, `Title`, `Username`, `Email`, `URL`, `Phone` |
| Financial | `Price`, `Cost`, `Revenue`, `Expense`, `Budget`, `Forecast` |
| Geographical | `Latitude`, `Longitude`, `Coordinate`, `Address`, `PostalCode` |

Semantic types determine:
- Scale type (linear, log, time, ordinal)
- Axis formatting (currency → $X.XX, date → "Jan 2026")
- Color scheme (diverging for Profit, sequential for Count)
- Aggregation defaults (sum for Revenue, count for Customers)

### 2.2 Flint MCP Server Integration

The `flint-chart-mcp` package lets agents create charts from conversation:

```json
{
  "mcpServers": {
    "flint": {
      "command": "npx",
      "args": ["-y", "flint-chart-mcp"]
    }
  }
}
```

MCP tools exposed by Flint:
- `chart_create` — Create a chart from data + semantic types + chart spec
- `chart_validate` — Validate a chart spec without rendering
- `chart_edit` — Interactive chart editing workflow
- `chart_render` — Return static PNG/SVG/image of chart

### 2.3 Implementation Plan: BizHub + Flint

**Phase 1 — New agent-kit tool: `charts_create`**

```typescript
// packages/agent-kit/src/tools/charts.ts
import { z } from "zod";
import { assembleECharts, assembleChartjs } from "flint-chart";
import type { ToolDefinition } from "../types.js";

export const createChart: ToolDefinition = {
  name: "charts_create",
  description: "Generate a chart visualization from marketplace analytics data. " +
    "Automatically determines chart type from the data semantics. " +
    "Returns a chart spec that can be rendered with ECharts or Chart.js.",
  schema: z.object({
    data: z.array(z.record(z.string(), z.unknown())).describe("Array of data objects"),
    semanticTypes: z.record(z.string(), z.string()).describe(
      "Map of field names to semantic types. " +
      "Common types: Currency, Quantity, Count, Percentage, YearMonth, Category, Country. " +
      "Example: { \"revenue\": \"Currency\", \"month\": \"YearMonth\", \"region\": \"Country\" }"
    ),
    chartType: z.enum([
      "bar", "line", "pie", "area", "scatter", "heatmap", "donut",
      "radar", "boxplot", "treemap", "sankey", "streamgraph",
    ]).optional().describe("Chart type. If omitted, Flint auto-selects"),
    title: z.string().optional().describe("Chart title"),
    xField: z.string().optional().describe("Field name for X axis"),
    yField: z.string().optional().describe("Field name for Y axis"),
    colorField: z.string().optional().describe("Field name for color/grouping"),
    backend: z.enum(["echarts", "chartjs"]).optional().default("echarts"),
    width: z.number().min(200).max(2000).optional().default(600),
    height: z.number().min(200).max(2000).optional().default(400),
  }),
  handler: async (args) => {
    const encoder = args.backend === "chartjs" ? assembleChartjs : assembleECharts;
    
    const spec = encoder({
      data: { values: args.data as Record<string, unknown>[] },
      semantic_types: args.semanticTypes,
      chart_spec: {
        chartType: args.chartType || inferChartType(args.semanticTypes),
        encodings: {
          ...(args.xField && { x: { field: args.xField } }),
          ...(args.yField && { y: { field: args.yField } }),
          ...(args.colorField && { color: { field: args.colorField } }),
        },
        title: args.title,
        baseSize: { width: args.width, height: args.height },
      },
    });

    return {
      success: true,
      data: {
        spec,
        backend: args.backend,
        html: `<div id="chart" style="width:${args.width}px;height:${args.height}px"></div>`,
      },
    };
  },
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

function inferChartType(semanticTypes: Record<string, string>): string {
  const types = Object.values(semanticTypes);
  // Simple heuristic fallback when chartType isn't specified
  if (types.includes("Category") && types.some(t => 
    ["Currency", "Quantity", "Count", "Revenue"].includes(t))) return "bar";
  if (types.includes("YearMonth") || types.includes("Year")) return "line";
  if (types.includes("Country") || types.includes("Region")) return "bar";
  return "bar";
}
```

**Phase 2 — Auto-chart middleware for analytics:**

```typescript
// packages/agent-kit/src/middleware/auto-chart.ts
import type { MiddlewareFn } from "../types.js";

export function autoChart(): MiddlewareFn {
  return async (tool, args, ctx, next) => {
    const result = await next();
    
    if (result.success && (tool.name === "analytics_get" || tool.name === "customers_list")) {
      try {
        const { assembleECharts } = await import("flint-chart");
        const data = result.data;
        
        // Auto-generate chart spec from analytics data
        const spec = assembleECharts({
          data: { values: data },
          semantic_types: inferAnalyticsSemantics(data),
          chart_spec: {
            chartType: "bar",
            encodings: { x: "name", y: "value" },
          },
        });
        
        return { ...result, metadata: { ...result.metadata, chartSpec: spec } };
      } catch {
        // Chart generation is optional; don't fail the tool
      }
    }
    
    return result;
  };
}
```

### 2.4 Rendering in Frontend

The chart spec returned by Flint can be rendered in the commerce_app frontend:

```tsx
// commerce_app/src/components/ChartRenderer.tsx
import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface ChartRendererProps {
  spec: Record<string, unknown>;
  backend: "echarts" | "chartjs";
}

export function ChartRenderer({ spec, backend }: ChartRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    if (backend === "echarts") {
      chartRef.current = echarts.init(containerRef.current);
      chartRef.current.setOption(spec);
    }
    
    return () => {
      chartRef.current?.dispose();
    };
  }, [spec, backend]);

  return <div ref={containerRef} className="w-full h-full min-h-[300px]" />;
}
```

---

## 3. Streamable HTTP MCP Transport

### 3.1 Architecture

Current: stdio transport (local subprocess only)
Target: Streamable HTTP transport (remote, scalable, load-balanced)

MCP Streamable HTTP uses a **single endpoint** for all communication:

```
Client                                     Server
  │                                          │
  ├── POST /mcp ──────────────────────────→  │  (initialize request)
  │  Headers: Content-Type: application/json │
  │  Body: { jsonrpc: "2.0", method: ... }  │
  │                                          │
  │  ←── 200 Response ──────────────────────┤  (response)
  │     Headers: Mcp-Session-Id: abc123      │
  │     Body: { jsonrpc: "2.0", result: ... }│
  │                                          │
  ├── POST /mcp ──────────────────────────→  │  (tools/list)
  │     Mcp-Session-Id: abc123               │
  │                                          │
  │  ←── SSE Stream ────────────────────────┤  (streaming response)
  │     data: { jsonrpc: "2.0", result: ... }│
  │     data: { jsonrpc: "2.0", ... }        │
  │                                          │
  ├── GET /mcp ───────────────────────────→  │  (keep SSE alive)
  │     Mcp-Session-Id: abc123               │
  │     Accept: text/event-stream            │
```

### 3.2 Implementation

```typescript
// packages/mcp-server/src/transports/http.ts
import http from "node:http";
import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  McpSessionStore,
  type Session,
} from "./session-store.js";

interface HttpTransportConfig {
  port: number;
  server: Server;
  sessions?: McpSessionStore;
}

export function createHttpTransport(config: HttpTransportConfig) {
  const sessions = config.sessions || new McpSessionStore();

  const httpServer = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", 
      "Content-Type, Mcp-Session-Id, Accept, Last-Event-ID");
    
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    switch (req.method) {
      case "POST":
        return handlePost(req, res, sessionId);
      case "GET":
        return handleGet(req, res, sessionId);
      case "DELETE":
        return handleDelete(res, sessionId);
      default:
        res.writeHead(405);
        res.end();
    }
  });

  return {
    start: () => new Promise<void>((resolve) => httpServer.listen(config.port, resolve)),
    stop: () => new Promise<void>((resolve) => httpServer.close(() => resolve())),
  };
}

async function handlePost(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  sessionId?: string
) {
  const body = await readBody(req);
  const message = JSON.parse(body);

  // If this is an initialize, create a new session
  if (message.method === "initialize") {
    sessionId = randomUUID();
  }

  if (!sessionId) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: "Missing session ID" }));
    return;
  }

  // Session management
  const needsStreaming = message.method === "tools/call" || 
    message.method === "resources/read";

  if (needsStreaming) {
    // SSE streaming response
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Mcp-Session-Id": sessionId,
    });

    // Process and stream results
    const result = await processMcpMessage(message, sessionId);
    res.write(`event: message\ndata: ${JSON.stringify(result)}\n\n`);
    res.end();
  } else {
    // Immediate response
    const result = await processMcpMessage(message, sessionId);
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Mcp-Session-Id": sessionId,
    });
    res.end(JSON.stringify(result));
  }
}
```

### 3.3 Session Store

```typescript
// packages/mcp-server/src/transports/session-store.ts
export class McpSessionStore {
  private sessions = new Map<string, Session>();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 min

  create(): Session {
    const id = randomUUID();
    const session: Session = {
      id,
      createdAt: Date.now(),
      lastActive: Date.now(),
      transport: new SSEClientTransport(),
    };
    this.sessions.set(id, session);
    this.startCleanupTimer();
    return session;
  }

  get(id: string): Session | undefined {
    const session = this.sessions.get(id);
    if (session) session.lastActive = Date.now();
    return session;
  }

  delete(id: string): void {
    this.sessions.delete(id);
  }

  private startCleanupTimer(): void {
    setInterval(() => {
      const now = Date.now();
      for (const [id, session] of this.sessions) {
        if (now - session.lastActive > this.TTL_MS) {
          this.sessions.delete(id);
        }
      }
    }, 60_000);
  }
}

interface Session {
  id: string;
  createdAt: number;
  lastActive: number;
  transport: SSEClientTransport;
}
```

### 3.4 MCP Server Entry Point Update

```typescript
// packages/mcp-server/src/index.ts (updated)
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createHttpTransport } from "./transports/http.js";

const PORT = parseInt(process.env.MCP_PORT || "3100", 10);
const TRANSPORT = process.env.MCP_TRANSPORT || "stdio";

async function main() {
  const server = new McpServer({ name: "BizHub Marketplace", version: "1.3.0" });
  
  // Register all tools
  const agent = new BizHubAgent({ name: "bizhub-mcp" });
  agent.loadDefaultTools();
  registerToolsWithMcpServer(server, agent);

  if (TRANSPORT === "http") {
    const transport = createHttpTransport({ port: PORT, server });
    await transport.start();
    console.error(`BizHub MCP server running on http://localhost:${PORT}/mcp`);
  } else {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}
```

---

## 4. Durable Execution via Checkpointing

### 4.1 PostgreSQL Checkpointer

LangGraph production pattern: PostgreSQL for ACID checkpointing.

```typescript
// packages/agent-kit/src/graph/checkpointers/postgres.ts
import pg from "pg";
import type { Checkpointer } from "../types.js";

export class PostgresCheckpointer implements Checkpointer {
  private pool: pg.Pool;
  private tableName: string;

  constructor(connectionString: string, tableName = "agent_checkpoints") {
    this.pool = new pg.Pool({ connectionString });
    this.tableName = tableName;
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        namespace VARCHAR(255) NOT NULL,
        key VARCHAR(255) NOT NULL,
        state JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (namespace, key)
      )
    `);
  }

  async save(namespace: string, key: string, state: unknown): Promise<void> {
    await this.pool.query(
      `INSERT INTO ${this.tableName} (namespace, key, state, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (namespace, key)
       DO UPDATE SET state = $3, updated_at = NOW()`,
      [namespace, key, JSON.stringify(state)]
    );
  }

  async load(namespace: string, key: string): Promise<unknown | null> {
    const result = await this.pool.query(
      `SELECT state FROM ${this.tableName} WHERE namespace = $1 AND key = $2`,
      [namespace, key]
    );
    return result.rows[0]?.state || null;
  }

  async list(namespace: string): Promise<{ key: string; state: unknown }[]> {
    const result = await this.pool.query(
      `SELECT key, state FROM ${this.tableName}
       WHERE namespace = $1 ORDER BY updated_at DESC`,
      [namespace]
    );
    return result.rows.map(r => ({ key: r.key, state: r.state }));
  }

  async cleanup(olderThan: Date): Promise<number> {
    const result = await this.pool.query(
      `DELETE FROM ${this.tableName} WHERE updated_at < $1`,
      [olderThan]
    );
    return result.rowCount || 0;
  }
}
```

### 4.2 Redis Checkpointer (Low Latency)

```typescript
// packages/agent-kit/src/graph/checkpointers/redis.ts
import { createClient } from "redis";

export class RedisCheckpointer implements Checkpointer {
  private client: ReturnType<typeof createClient>;
  private prefix: string;

  constructor(url: string, prefix = "ckpt:") {
    this.client = createClient({ url });
    this.prefix = prefix;
  }

  async save(namespace: string, key: string, state: unknown): Promise<void> {
    await this.client.set(
      `${this.prefix}${namespace}:${key}`,
      JSON.stringify(state),
      { EX: 86400 } // 24h TTL
    );
  }

  async load(namespace: string, key: string): Promise<unknown | null> {
    const data = await this.client.get(`${this.prefix}${namespace}:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async list(namespace: string): Promise<{ key: string; state: unknown }[]> {
    const keys = await this.client.keys(`${this.prefix}${namespace}:*`);
    const results = await Promise.all(
      keys.map(async (k) => {
        const data = await this.client.get(k);
        const key = k.replace(`${this.prefix}${namespace}:`, "");
        return { key, state: data ? JSON.parse(data) : null };
      })
    );
    return results.filter(r => r.state !== null);
  }
}
```

---

## 5. Observability: OpenTelemetry Instrumentation

### 5.1 OpenTelemetry Middleware for agent-kit

```typescript
// packages/agent-kit/src/middleware/opentelemetry.ts
import { trace, Span, SpanStatusCode, context } from "@opentelemetry/api";
import type { MiddlewareFn } from "../types.js";

const tracer = trace.getTracer("@biz-hub/agent-kit", "1.2.0");

export function openTelemetryTracing(): MiddlewareFn {
  return async (tool, args, ctx, next) => {
    const span = tracer.startSpan(`tool.${tool.name}`, {
      attributes: {
        "gen_ai.agent.name": ctx.agentId,
        "gen_ai.tool.name": tool.name,
        "gen_ai.request.id": ctx.requestId,
        "gen_ai.tool.version": tool.version || "unknown",
        "gen_ai.session.id": ctx.session.userId,
      },
    });

    return context.with(trace.setSpan(context.active(), span), async () => {
      try {
        const result = await next();
        
        span.setAttributes({
          "gen_ai.tool.success": result.success,
          "gen_ai.tool.duration_ms": result.duration || 0,
        });
        
        if (result.error) {
          span.setStatus({ code: SpanStatusCode.ERROR, message: result.error });
        }
        
        span.end();
        return result;
      } catch (error) {
        span.setStatus({ 
          code: SpanStatusCode.ERROR, 
          message: error instanceof Error ? error.message : "Unknown error" 
        });
        span.end();
        throw error;
      }
    });
  };
}
```

### 5.2 Metrics Middleware

```typescript
// packages/agent-kit/src/middleware/metrics.ts
import { metrics } from "@opentelemetry/api";
import type { MiddlewareFn } from "../types.js";

const meter = metrics.getMeter("@biz-hub/agent-kit", "1.2.0");
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

export function openTelemetryMetrics(): MiddlewareFn {
  return async (tool, args, ctx, next) => {
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

    // Estimate token usage from JSON serialization size
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
```

### 5.3 Exporting Traces

```typescript
// Example setup in consumer application
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { BizHubAgent } from "@biz-hub/agent-kit";
import { openTelemetryTracing, openTelemetryMetrics } from "@biz-hub/agent-kit/middleware";

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || "http://localhost:4318/v1/traces",
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({}),
    exportIntervalMillis: 10000,
  }),
  serviceName: "bizhub-agent",
});

await sdk.start();

const agent = new BizHubAgent({ name: "production-agent" });
agent
  .middleware(openTelemetryTracing())
  .middleware(openTelemetryMetrics())
  .loadDefaultTools();
```

---

## 6. Memory System Architecture

### 6.1 Memory Provider Types

```typescript
// packages/agent-kit/src/memory/types.ts
export enum MemoryType {
  /** Current conversation context (working memory) */
  SHORT_TERM = "short_term",
  /** Facts and knowledge accumulated over time */
  LONG_TERM = "long_term",
  /** Past decisions, outcomes, and patterns */
  EPISODIC = "episodic",
  /** Learned procedures and workflows */
  PROCEDURAL = "procedural",
}

export interface MemoryEntry {
  id: string;
  type: MemoryType;
  key: string;
  value: unknown;
  metadata: {
    agentId: string;
    userId?: string;
    sessionId?: string;
    importance: number;  // 0-1, used for retention decisions
    created: Date;
    lastAccessed: Date;
    accessCount: number;
    ttl?: number;
  };
}

export interface MemoryStore extends MemoryProvider {
  search(query: string, limit?: number): Promise<MemoryEntry[]>;
  prune(type?: MemoryType): Promise<number>;  // Remove expired/low-importance entries
  stats(): Promise<{ total: number; byType: Record<string, number> }>;
}
```

### 6.2 Vector Memory Store (ChromaDB/Postgres)

```typescript
// packages/agent-kit/src/memory/vector-store.ts
import { ChromaClient } from "chromadb";
import type { MemoryEntry, MemoryType } from "./types.js";

export class VectorMemoryStore implements MemoryStore {
  private client: ChromaClient;
  private collectionName: string;

  constructor(path: string, collection = "agent_memories") {
    this.client = new ChromaClient({ path });
    this.collectionName = collection;
  }

  async initialize(): Promise<void> {
    try {
      await this.client.getOrCreateCollection({ name: this.collectionName });
    } catch {
      await this.client.createCollection({ name: this.collectionName });
    }
  }

  async get(key: string): Promise<unknown | null> {
    const collection = await this.client.getCollection({ name: this.collectionName });
    const results = await collection.get({
      where: { key },
      limit: 1,
    });
    return results?.metadatas?.[0] || null;
  }

  async set(key: string, value: unknown, ttl?: number): Promise<void> {
    const collection = await this.client.getCollection({ name: this.collectionName });
    await collection.add({
      ids: [key],
      embeddings: [await this.embed(JSON.stringify(value))],
      metadatas: [{ key, value: JSON.stringify(value), ttl: ttl || null }],
    });
  }

  async delete(key: string): Promise<void> {
    const collection = await this.client.getCollection({ name: this.collectionName });
    await collection.delete({ where: { key } });
  }

  async list(prefix: string): Promise<{ key: string; value: unknown }[]> {
    const collection = await this.client.getCollection({ name: this.collectionName });
    const results = await collection.get({
      where: { key: { $starts_with: prefix } },
    });
    return results?.metadatas?.map((m: Record<string, unknown>) => ({
      key: m.key as string,
      value: JSON.parse(m.value as string),
    })) || [];
  }

  async search(query: string, limit = 10): Promise<MemoryEntry[]> {
    const collection = await this.client.getCollection({ name: this.collectionName });
    const results = await collection.query({
      queryEmbeddings: [await this.embed(query)],
      nResults: limit,
    });
    return (results?.metadatas?.[0] || []).map((m: Record<string, unknown>) => ({
      id: m.key as string,
      type: m.type as MemoryType,
      key: m.key as string,
      value: JSON.parse(m.value as string),
      metadata: {
        agentId: m.agentId as string,
        importance: (m.importance as number) || 0.5,
        created: new Date(m.created as string),
        lastAccessed: new Date(m.lastAccessed as string),
        accessCount: (m.accessCount as number) || 0,
      },
    }));
  }

  async prune(type?: MemoryType): Promise<number> {
    // Remove entries older than TTL or with importance < 0.1
    const collection = await this.client.getCollection({ name: this.collectionName });
    const all = await collection.get();
    let removed = 0;
    
    for (const meta of all.metadatas || []) {
      const m = meta as Record<string, unknown>;
      const entryType = m.type as MemoryType;
      if (type && entryType !== type) continue;
      
      const ttl = m.ttl as number | null;
      const created = new Date(m.created as string).getTime();
      const importance = (m.importance as number) || 0;
      
      if ((ttl && Date.now() - created > ttl) || importance < 0.1) {
        await collection.delete({ where: { key: m.key } });
        removed++;
      }
    }
    return removed;
  }

  async stats(): Promise<{ total: number; byType: Record<string, number> }> {
    const collection = await this.client.getCollection({ name: this.collectionName });
    const all = await this.list("");
    const byType: Record<string, number> = {};
    for (const entry of all) {
      // Type is embedded in value metadata
      byType[entry.key] = (byType[entry.key] || 0) + 1;
    }
    return { total: all.length, byType };
  }

  private async embed(text: string): Promise<number[]> {
    // Use a local embedding model or API
    // For production, use OpenAI/text-embedding-3-small or similar
    throw new Error("Embedding function must be provided");
  }
}
```

---

## 7. Multi-Agent Orchestration: Supervisor Pattern

### 7.1 Agent Handoff Mechanism

```typescript
// packages/agent-kit/src/orchestration/supervisor.ts
import { z } from "zod";
import type { ToolDefinition, ToolResult } from "../types.js";

export interface SubAgent {
  name: string;
  description: string;
  tools: ToolDefinition[];
  systemPrompt: string;
}

export class SupervisorAgent {
  private agents: Map<string, SubAgent> = new Map();
  private orchestrator: BizHubAgent;

  constructor(orchestrator: BizHubAgent) {
    this.orchestrator = orchestrator;
  }

  registerAgent(agent: SubAgent): this {
    this.agents.set(agent.name, agent);
    return this;
  }

  buildSupervisorTool(): ToolDefinition {
    const agentNames = Array.from(this.agents.keys());

    return {
      name: "delegate_to_agent",
      description: `Delegate a task to a specialized sub-agent. ` +
        `Available agents: ${agentNames.join(", ")}. ` +
        `The sub-agent will execute the task using its own tools and return results.`,
      schema: z.object({
        agent: z.enum(agentNames as [string, ...string[]])
          .describe("Name of the specialized agent to delegate to"),
        task: z.string().describe("Detailed description of the task to execute"),
        context: z.record(z.string(), z.unknown()).optional()
          .describe("Optional context to pass to the sub-agent"),
      }),
      handler: async ({ agent: agentName, task, context }) => {
        const agent = this.agents.get(agentName);
        if (!agent) {
          return { success: false, error: `Agent '${agentName}' not found` };
        }

        // Create sub-agent instance with isolated state
        const subAgent = new BizHubAgent({
          name: agentName,
          description: agent.description,
        });
        subAgent.useMany(agent.tools);

        // Execute with timeout
        const result = await subAgent.execute("process_task", {
          task,
          context: context || {},
        }, {
          agentId: agentName,
          metadata: { delegatedBy: this.orchestrator.config.name },
        });

        return result;
      },
    };
  }
}
```

### 7.2 Orchestrator-Worker Pattern in Practice

```
User: "Analyze our Q1 2026 sales performance and create a dashboard"

Orchestrator Agent:
  ├── Tool: delegate_to_agent("analytics_agent", "Calculate Q1 2026 revenue, orders, customers...")
  │   └── Analytics Agent:
  │       ├── analytics_get()
  │       ├── customers_list()
  │       └── returns { revenue: 1.2M, orders: 3400, ... }
  │
  ├── Tool: delegate_to_agent("chart_agent", "Create revenue trend chart...")
  │   └── Chart Agent:
  │       ├── charts_create({ data: revenueData, chartType: "line", ... })
  │       └── returns { spec: {...} }
  │
  └── Synthesizes final response with data + chart spec
```

---

## 8. Key Technology Stack (Verified 2026-07)

| Component | Package | Purpose | Install |
|-----------|---------|---------|---------|
| **Chart Engine** | `flint-chart` ^1.0 | Semantic chart spec compiler | `npm i flint-chart` |
| **Chart MCP** | `flint-chart-mcp` ^1.0 | MCP server for agent charting | `npx flint-chart-mcp` |
| **MCP SDK** | `@modelcontextprotocol/sdk` ^1.9 | MCP protocol | `npm i @modelcontextprotocol/sdk` |
| **State Graphs** | `graphology` ^0.25 | Graph data structure | `npm i graphology` |
| **OTel Tracing** | `@opentelemetry/api` ^1.9 | Tracing API | `npm i @opentelemetry/api` |
| **OTel SDK** | `@opentelemetry/sdk-node` ^0.56 | Tracing SDK | `npm i @opentelemetry/sdk-node` |
| **OTel GenAI** | `@opentelemetry/semantic-conventions` | GenAI attribute standard | Included |
| **Postgres** | `pg` ^8.13 | Checkpointing store | `npm i pg` |
| **Redis** | `redis` ^4.7 | Low-latency checkpointing | `npm i redis` |
| **ChromaDB** | `chromadb` ^2.0 | Vector memory store | `npm i chromadb` |
| **ECharts** | `echarts` ^5.6 | Chart rendering (browser) | `npm i echarts` |
| **Temporal** | `temporalio` | Durable execution engine | `npm i temporalio` |

---

## 9. Implementation Roadmap

```
Week 1-2:  ReAct graph engine + checkpointing
           └── StateGraph builder, Pregel runtime, PostgresCheckpointer

Week 3-4:  Flint chart integration
           └── charts_create tool, auto-chart middleware, ECharts renderer component

Week 5-6:  Streamable HTTP MCP transport
           └── HTTP handler, session store, server entry update, config

Week 7-8:  OpenTelemetry observability
           └── Tracing middleware, metrics middleware, structured logging

Week 9-10: Memory system
           └── Vector store, short/long-term/episodic memory, pruning

Week 11-12: Multi-agent supervisor pattern
           └── SubAgent registry, delegation tool, orchestration framework
```
