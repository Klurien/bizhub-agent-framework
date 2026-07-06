import { z } from "zod";
import { BizHubAgent } from "../agent.js";
import { StateGraph } from "../graph/state-graph.js";
import type { ToolDefinition, ToolContext } from "../types.js";

export interface SubAgent {
  name: string;
  description: string;
  tools: ToolDefinition[];
  systemPrompt?: string;
}

export class Supervisor {
  private agents = new Map<string, SubAgent>();
  private orchestrator: BizHubAgent;
  private defaultAgentId: string;

  constructor(
    orchestrator: BizHubAgent,
    defaultAgentId = "supervisor"
  ) {
    this.orchestrator = orchestrator;
    this.defaultAgentId = defaultAgentId;
  }

  registerAgent(agent: SubAgent): this {
    if (this.agents.has(agent.name)) {
      throw new Error(`Agent '${agent.name}' is already registered`);
    }
    this.agents.set(agent.name, agent);
    return this;
  }

  registerAgents(agents: SubAgent[]): this {
    for (const agent of agents) {
      this.registerAgent(agent);
    }
    return this;
  }

  getRegisteredAgents(): SubAgent[] {
    return Array.from(this.agents.values());
  }

  buildDelegationTool(): ToolDefinition {
    const agentNames = Array.from(this.agents.keys()) as [string, ...string[]];

    return {
      name: "delegate_to_agent",
      description:
        `Delegate a task to a specialized sub-agent. ` +
        `Available agents: ${agentNames.join(", ")}. ` +
        `The sub-agent will execute the task using its own tools and return results.`,
      schema: z.object({
        agent: z
          .enum(agentNames)
          .describe("Name of the specialized agent to delegate to"),
        task: z
          .string()
          .describe("Detailed description of the task to execute"),
        context: z
          .record(z.string(), z.unknown())
          .optional()
          .describe("Optional context to pass to the sub-agent"),
      }),
      handler: async (
        { agent: agentName, task, context },
        ctx: ToolContext
      ) => {
        const agent = this.agents.get(agentName);
        if (!agent) {
          return {
            success: false,
            error: `Agent '${agentName}' not found`,
          };
        }

        const subAgent = new BizHubAgent({
          name: agentName,
          version: "1.0.0",
          description: agent.description,
          provider: {
            model: this.orchestrator.config.provider.model,
          },
        });
        subAgent.useMany(agent.tools);

        const result = await subAgent.execute(
          "process_task",
          {
            task,
            context: context || {},
          },
          {
            agentId: agentName,
            metadata: {
              delegatedBy: this.defaultAgentId,
              delegator: this.orchestrator.config.name,
            },
          }
        );

        return result;
      },
      version: "1.0.0",
    };
  }

  buildSupervisorGraph() {
    const schema = z.object({
      messages: z.array(z.any()),
      currentAgent: z.string().optional(),
      task: z.string().optional(),
      results: z.record(z.string(), z.unknown()).default({}),
      stepCount: z.number().default(0),
    });

    type S = z.output<typeof schema>;
    const agentNames = Array.from(this.agents.keys());

    const graph = new StateGraph<S>(schema as z.ZodType<S>, {
      reducers: {
        stepCount: (existing: number, incoming: number) => existing + incoming,
      },
    });

    graph.addNode({
      name: "route",
      execute: async (state: S) => {
        const pending = agentNames.filter(
          (name) => !(name in state.results)
        );
        if (pending.length === 0) {
          return { currentAgent: undefined } as Partial<S>;
        }
        return { currentAgent: pending[0] } as Partial<S>;
      },
    });

    graph.addNode({
      name: "execute_agent",
      execute: async (state: S) => {
        const agentName = state.currentAgent;
        if (!agentName) return {} as Partial<S>;

        const agent = this.agents.get(agentName);
        if (!agent) return {} as Partial<S>;

        const subAgent = new BizHubAgent({
          name: agentName,
          version: "1.0.0",
          description: agent.description,
        });
        subAgent.useMany(agent.tools);

        const result = await subAgent.execute(
          "process_task",
          {
            task: state.task || "Execute your specialized function",
            context: { results: state.results },
          },
          {
            agentId: agentName,
            metadata: {
              delegatedBy: this.defaultAgentId,
              step: state.stepCount,
            },
          }
        );

        return {
          results: {
            ...state.results,
            [agentName]: result,
          },
          stepCount: state.stepCount + 1,
        } as Partial<S>;
      },
    });

    graph.addNode({
      name: "synthesize",
      execute: async (state: S) => {
        return {
          messages: [
            {
              role: "system",
              content: "Synthesize results from all sub-agents",
            },
            {
              role: "user",
              content: JSON.stringify(state.results, null, 2),
            },
          ],
        } as Partial<S>;
      },
    });

    graph.addEdge({ from: "__start__", to: "route" });
    graph.addEdge({
      from: "route",
      to: (state: S) => {
        return state.currentAgent ? "execute_agent" : "synthesize";
      },
    });
    graph.addEdge({ from: "execute_agent", to: "route" });
    graph.addEdge({ from: "synthesize", to: "__end__" });

    return graph;
  }
}
