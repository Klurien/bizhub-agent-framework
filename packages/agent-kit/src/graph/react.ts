import { z } from "zod";
import { randomUUID } from "node:crypto";
import { StateGraph } from "./state-graph.js";
import type { ToolDefinition, ToolContext } from "../types.js";

export interface LLMInterface {
  generate(params: {
    messages: unknown[];
    tools?: unknown[];
  }): Promise<{ message: unknown }>;
}

export interface ReActConfig {
  tools: ToolDefinition[];
  llm: LLMInterface;
  systemPrompt?: string;
  maxSteps?: number;
  createContext?: () => ToolContext;
  formatToolsForLLM?: (tools: ToolDefinition[]) => unknown[];
  extractToolCall?: (message: unknown) => { name: string; args: Record<string, unknown> } | null;
  hasToolCall?: (message: unknown) => boolean;
}

export function formatToolsForOpenAI(tools: ToolDefinition[]): unknown[] {
  return tools.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema,
    },
  }));
}

export function hasToolCall(message: unknown): boolean {
  const msg = message as Record<string, unknown>;
  return !!(msg?.tool_calls || (msg?.content && typeof msg.content === "object"));
}

export function extractToolCall(
  message: unknown
): { name: string; args: Record<string, unknown> } | null {
  const msg = message as Record<string, unknown>;
  const toolCalls = msg?.tool_calls as
    | Array<{ function: { name: string; arguments: string } }>
    | undefined;
  if (toolCalls && toolCalls.length > 0) {
    const call = toolCalls[0];
    return {
      name: call.function.name,
      args: JSON.parse(call.function.arguments),
    };
  }
  return null;
}

const stateSchema = z.object({
  messages: z.array(z.any()),
  toolResults: z.array(z.any()).default([]),
  stepCount: z.number().default(0),
  systemPrompt: z.string().optional(),
  finalAnswer: z.string().optional(),
});

export function createReActGraph(config: ReActConfig) {
  const {
    tools,
    llm,
    systemPrompt,
    maxSteps = 50,
    createContext = () =>
      ({
        requestId: "react-" + randomUUID(),
        agentId: "react-agent",
        session: { userId: "system", role: "viewer", permissions: [] },
        metadata: {},
      }) as ToolContext,
    formatToolsForLLM: formatFn = formatToolsForOpenAI,
    extractToolCall: extractFn = extractToolCall,
    hasToolCall: hasToolCallFn = hasToolCall,
  } = config;

  const toolMap = new Map(tools.map((t) => [t.name, t]));

  type S = z.output<typeof stateSchema>;

  const graph = new StateGraph<S>(stateSchema as z.ZodType<S>, {
    reducers: {
      stepCount: (existing: number, incoming: number) => existing + incoming,
    },
  });

  graph.addNode({
    name: "think",
    execute: async (state: S) => {
      const response = await llm.generate({
        messages: [
          ...(systemPrompt || state.systemPrompt
            ? [{ role: "system", content: systemPrompt || state.systemPrompt }]
            : []),
          ...state.messages,
        ],
        tools: formatFn(tools),
      });
      return {
        messages: [...state.messages, response.message],
        stepCount: state.stepCount + 1,
      } as Partial<S>;
    },
    metadata: { runIn: "workflow" },
  });

  graph.addNode({
    name: "execute_tool",
    execute: async (state: S) => {
      const lastMsg = state.messages[state.messages.length - 1];
      const toolCall = extractFn(lastMsg);
      if (!toolCall) {
        return { messages: [...state.messages] } as Partial<S>;
      }

      const tool = toolMap.get(toolCall.name);
      if (!tool) {
        return {
          messages: [
            ...state.messages,
            {
              role: "tool",
              tool_call_id: toolCall.name,
              content: JSON.stringify({
                error: `Tool '${toolCall.name}' not found`,
              }),
            },
          ],
          toolResults: [
            ...state.toolResults,
            { tool: toolCall.name, error: "Tool not found" },
          ],
        } as Partial<S>;
      }

      const ctx = createContext();
      const result = await tool.handler(toolCall.args, ctx);

      return {
        messages: [
          ...state.messages,
          {
            role: "tool",
            tool_call_id: toolCall.name,
            content: JSON.stringify(result.data ?? result),
          },
        ],
        toolResults: [...state.toolResults, result],
      } as Partial<S>;
    },
    metadata: { runIn: "activity" },
  });

  graph.addEdge({ from: "__start__", to: "think" });
  graph.addEdge({
    from: "think",
    to: (state) => {
      const lastMsg = state.messages[state.messages.length - 1];
      if (state.finalAnswer) return "__end__";
      if (state.stepCount >= maxSteps) return "__end__";
      return hasToolCallFn(lastMsg) ? "execute_tool" : "__end__";
    },
  });
  graph.addEdge({ from: "execute_tool", to: "think" });

  return graph;
}

export function createReActAgent(config: ReActConfig) {
  const graph = createReActGraph(config);
  return {
    graph,
    async run(input: string, options?: { threadId?: string; maxSteps?: number }) {
      return graph.run(
        stateSchema.parse({
          messages: [{ role: "user", content: input }],
          toolResults: [],
          stepCount: 0,
          systemPrompt: config.systemPrompt,
        }),
        { threadId: options?.threadId, maxSteps: options?.maxSteps }
      );
    },
  };
}
