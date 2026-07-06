# Agent Framework Improvement Research

Date: 2026-07-06
Scope: BizHub agent-kit, MCP server, agentic loop, chart rendering

---

## 1. Current State Assessment

### 1.1 What We Have

- **`@biz-hub/agent-kit`** (v1.2.0): Core SDK with ToolRegistry, middleware pipeline, 17 built-in marketplace tools, provider adapters (OpenAI/Anthropic), BizHubClient REST client, config management
- **`@biz-hub/mcp-server`** (v1.3.0): Thin MCP wrapper using stdio transport, exposes all 17 tools via @modelcontextprotocol/sdk
- **`@biz-hub/cli`** (v1.3.0): Commander-based terminal CLI with colored tables

### 1.2 Current Architecture Gaps

| Area | Current State | Industry Best Practice |
|------|--------------|----------------------|
| **Agentic Loop** | Single-pass `execute()` - no ReAct loop, no multi-step reasoning | ReAct (Thought→Action→Observation), Plan-Execute, Reflexion patterns |
| **State Management** | In-memory with TTL, no persistence, no checkpointing | Durable state, checkpoint/resume, time-travel debugging (LangGraph) |
| **Orchestration** | Simple middleware chain (onion pattern) | State machine graphs, conditional branching, parallel execution, sub-agent delegation |
| **MCP Transport** | Stdio only | Streamable HTTP, SSE, WebSocket transports |
| **Chart Rendering** | Not supported | Flint (Microsoft), Vega-Lite, ECharts, Chart.js integration |
| **Observability** | Console JSON logging | LangSmith, OpenTelemetry, structured tracing |
| **Error Recovery** | Basic retry middleware | Durable execution, dead-letter queues, human-in-the-loop |
| **Multi-Provider** | OpenAI + Anthropic formatters | Provider-agnostic adapter with 10+ providers |
| **Authentication** | Cookie/API key | OAuth 2.0, JWT, API key rotation |

---

## 2. Agentic Loop Improvements

### 2.1 The ReAct Pattern (Foundation)

The core pattern used by every major framework in 2026:

```
while not done:
    thought = model.reason(context)
    if thought.has_tool_call():
        observation = execute_tool(thought.tool_call)
        context += observation
    else:
        done = True
        response = thought.text
```

**Implementation Plan - New file: `packages/agent-kit/src/agentic-loop.ts`**

```typescript
import { z } from "zod";

export interface AgenticLoopConfig {
  model: (messages: Message[], tools: ToolDefinition[]) => Promise<LLMResponse>;
  tools: ToolDefinition[];
  maxSteps?: number;
  maxTokens?: number;
  stopConditions?: StopCondition[];
}

export interface StopCondition {
  name: string;
  check: (state: LoopState) => boolean;
}

export interface LoopState {
  steps: StepRecord[];
  tokensUsed: number;
  startTime: number;
  messages: Message[];
}

export interface StepRecord {
  thought: string;
  toolCall?: { name: string; args: unknown };
  observation?: unknown;
  duration: number;
}

// Built-in stop conditions
export const maxStepsReached = (n: number): StopCondition => ({
  name: "max_steps",
  check: (state) => state.steps.length >= n,
});

export const toolCalled = (toolName: string): StopCondition => ({
  name: "tool_called",
  check: (state) => state.steps.some((s) => s.toolCall?.name === toolName),
});
```

### 2.2 ReAct vs Plan-Execute vs Reflexion

| Pattern | When to Use | Token Cost | Complexity |
|---------|------------|-----------|------------|
| **ReAct** | Simple Q&A, single-tool chains | Low | Low |
| **Plan-Execute** | Multi-step workflows, known decomposition | Medium | Medium |
| **Reflexion** | Code generation, writing, quality-critical output | High | High |
| **Tree of Thoughts** | Research, exploration, strategy | Very High | Very High |

**Plan-Execute** is the most practical next step for BizHub:
```
Plan: Agent decomposes "apply 20% off to all electronics" into subtasks
  1. List products in electronics category
  2. For each, call discounts_apply
  3. Report results
Execute: Run each subtask, collecting results
Reflect: Summarize what was done
```

### 2.3 Vercel AI SDK Agent Loop (Reference)

The Vercel AI SDK 6 (released Jan 2026) provides `ToolLoopAgent` with:
- `generateText()` with `tools` and `maxSteps`
- `stopWhen` conditions (`stepCountIs`, custom)
- `onStepFinish` callback for observability
- `parallelToolExecution` for concurrent tool calls
- State persistence across steps

This is the gold standard for TypeScript agent loops in 2026.

---

## 3. MCP Server Improvements

### 3.1 Transport Options

| Transport | Use Case | Status in 2026 |
|-----------|----------|----------------|
| **Stdio** | Local Claude Desktop, Cursor | Current (works) |
| **Streamable HTTP** | Serverless, edge deployment | Recommended upgrade |
| **SSE (Server-Sent Events)** | Real-time streaming | Available |
| **WebSocket** | Bidirectional, low-latency | Available |

### 3.2 Recommended MCP Features to Add

1. **Streamable HTTP Transport**: Allow cloud deployment of the MCP server (currently only stdio)
2. **Sampling Support**: Let the host LLM request samples from the server
3. **Roots (File System Access)**: Allow agents to specify working directories
4. **Capability Negotiation**: Proper initialization handshake with versioning
5. **OAuth 2.0 Authentication**: For production deployments
6. **Logging Notifications**: Server-side structured log streaming

### 3.3 Implementation - New Transport

```typescript
// packages/mcp-server/src/transports/http.ts
import { Server } from "node:http";

export function createHttpServer(port: number) {
  // Streamable HTTP transport implementation
  // Uses SSE for streaming responses
  // Supports session resumption via sessionId
}
```

### 3.4 MCP 2026 Roadmap Considerations

From the official MCP roadmap (June 2026):
- **Stateless Streamable HTTP**: No sticky sessions, horizontal scaling
- **Server Discovery**: Lightweight metadata endpoint (no live connection needed)
- **Audit Trails**: Built-in logging specification
- **SSO Integration**: Enterprise auth

---

## 4. Chart Rendering for AI Agents

### 4.1 Best-in-Class: Microsoft Flint

**Flint** is a Microsoft Research project specifically designed for AI-generated charts.

Key features:
- **46 chart types** (bar, line, scatter, heatmap, donut, radar, streamgraph, boxplot, sankey, treemap, etc.)
- **Semantic types** (70+ like `Rank`, `Temperature`, `Price`, `Country`) - maps data meaning to visual encoding
- **Automatic layout** - derives sizing, spacing, labels from data cardinality
- **Multi-backend** - compiles to Vega-Lite, ECharts, or Chart.js from one spec
- **MCP Server** - `flint-chart-mcp` lets agents create/validate/render charts

```typescript
// One spec, three backends
import { assembleVegaLite, assembleECharts, assembleChartjs } from "flint-chart";

const spec = assembleVegaLite({
  data: { values: salesData },
  semantic_types: {
    period: "YearMonth",
    revenue: "Currency",
    region: "Country",
  },
  chart_spec: {
    chartType: "Grouped Bar Chart",
    encodings: { x: "period", y: "revenue", color: "region" },
    baseSize: { width: 400, height: 300 },
  },
});
```

### 4.2 Alternative Chart Libraries

| Library | TypeScript | Bundle | Best For |
|---------|-----------|--------|----------|
| **Apache ECharts** | First-party | ~66K gzip | 30+ chart types, enterprise dashboards |
| **Chart.js** | First-party | ~92K gzip | Simple charts, smallest bundle |
| **Recharts** | React-native | ~200K | React/Next.js dashboard UIs |
| **Vega-Lite** | Good | ~150K | Declarative grammar, academic |
| **Flint** | First-party | ~100K | AI-generated charts (semantic types) |

### 4.3 Integration Plan

**Phase 1 - Tool-based charting:**
```typescript
// New tool: charts_create
{
  name: "charts_create",
  description: "Generate a chart visualization from marketplace data",
  schema: z.object({
    chartType: z.enum(["bar", "line", "pie", "area", "scatter"]),
    title: z.string(),
    data: z.array(z.record(z.string(), z.unknown())),
    xField: z.string(),
    yField: z.string(),
    groupField: z.string().optional(),
  }),
  handler: async (args) => {
    // Use Flint to compile the chart spec
    // Return the spec for frontend rendering
    return { success: true, data: { spec } };
  },
}
```

**Phase 2 - MCP-based charting (Flint MCP integration):**
- Bundle `flint-chart-mcp` alongside BizHub MCP server for agent-driven visualizations
- Agents can generate charts of marketplace analytics directly in chat

**Phase 3 - Chart middleware for analytics tools:**
- Wrap analytics_get and customers_list with auto-chart generation
- Return both data and visualization spec

---

## 5. Agent Framework Architecture Upgrades

### 5.1 From Middleware Chain to State Machine Graph

Current: Linear middleware pipeline
```
Request → [Auth] → [Rate Limit] → [Logging] → [Handler] → Response
```

Proposed: State machine graph (LangGraph pattern)
```
                    ┌─────────────────┐
                    │   Input Router   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │   Plan Agent    │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
       ┌──────▼──────┐ ┌────▼─────┐ ┌──────▼──────┐
       │ Product Ops  │ │Order Ops│ │ Analytics    │
       └──────┬──────┘ └────┬─────┘ └──────┬──────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────▼────────┐
                    │  Synthesizer    │
                    └─────────────────┘
```

### 5.2 Durable Execution

Current state: No persistence, all state in-memory, lost on restart.

In 2026, frameworks handle this via:
1. **Checkpointing**: Save state after each step to resume on crash
2. **Durable execution**: Temporal.io or workflow engines for long-running agents
3. **Human-in-the-loop**: Pause execution, wait for human approval, resume

### 5.3 What LangGraph Gets Right (reference)

LangGraph is the production standard in 2026:
- **Nodes** = functions that process state
- **Edges** = conditional transitions between nodes
- **State** = Typed schema flowing through the graph
- **Checkpointing** = Built-in persistence for crash recovery
- **Time-travel** = Replay past executions for debugging
- **Interrupts** = Pause for human approval at decision points

### 5.4 What CrewAI Gets Right (reference)

- **Role-based agents**: Define agent roles, goals, backstories
- **Fast prototyping**: Multi-agent in ~35 lines
- **Task delegation**: Manager agent delegates to specialists

---

## 6. Concrete Recommendations (Priority Order)

### P0 - High Impact, Low Effort

| # | Improvement | Effort | Impact | Files |
|---|-------------|--------|--------|-------|
| 1 | **Add Flint chart tool** to agent-kit | 2 days | High | New tool + dep |
| 2 | **Implement plan-execute pattern** in agent-kit | 3 days | High | New `plan-execute.ts` |
| 3 | **Add Streamable HTTP transport** to MCP server | 2 days | Medium | New transport file |
| 4 | **Add stop conditions** to ToolRegistry.execute() | 1 day | Medium | Modify tool-registry.ts |

### P1 - Medium Impact

| # | Improvement | Effort | Impact |
|---|-------------|--------|--------|
| 5 | **Session checkpointing** for agent state | 5 days | High |
| 6 | **Reflexion pattern** for quality-critical tools | 3 days | Medium |
| 7 | **OAuth 2.0 support** in MCP server | 4 days | Medium |
| 8 | **Parallel tool execution** (fan-out) | 2 days | Medium |
| 9 | **OpenTelemetry tracing** in middleware | 3 days | Medium |

### P2 - Strategic

| # | Improvement | Effort | Impact |
|---|-------------|--------|--------|
| 10 | **Graph-based orchestration** (LangGraph-style) | 3 weeks | Very High |
| 11 | **Durable execution** via workflow engine | 4 weeks | Very High |
| 12 | **Multi-agent sub-agent delegation** | 3 weeks | High |
| 13 | **Agent marketplace** for sharing custom tools | Ongoing | Brand |

---

## 7. Key Libraries & Versions (Verified 2026-07)

| Package | Version | Purpose |
|---------|---------|---------|
| `flint-chart` | Latest | AI chart generation (Microsoft) |
| `flint-chart-mcp` | Latest | MCP server for Flint |
| `@modelcontextprotocol/sdk` | ^1.9.0 | MCP protocol (current) |
| `@ai-sdk/openai` | Latest | Vercel AI SDK provider |
| `@ai-sdk/anthropic` | Latest | Vercel AI SDK provider |
| `ai` (Vercel) | ^6.0.0 | Agent loop + tool calling |
| `@opentelemetry/instrumentation` | Latest | Tracing |
| `graphology` | Latest | Graph data structure for orchestration |
| `temporalio` | Latest | Durable execution engine |

---

## 8. Research Sources

- LangGraph v1.0 production patterns (2026): state machine graphs, checkpointing, time-travel
- CrewAI multi-agent: role-based teams, task delegation, fast prototyping
- Vercel AI SDK 6: ToolLoopAgent, stop conditions, parallel execution
- Microsoft Flint: semantic chart specs, MCP integration, 46 chart types
- MCP 2026 Roadmap: Streamable HTTP, stateless sessions, discovery
- Anthropic Building Effective Agents: simple composable patterns over frameworks
- Agentic Design Patterns (2026): ReAct, Plan-Execute, Reflexion, Orchestrator-Worker
