import { z } from "zod";
import { randomUUID } from "node:crypto";
import type {
  GraphState,
  GraphNode,
  Edge,
  Checkpointer,
  StepRecord,
  GraphRunResult,
  ReducerMap,
} from "./types.js";

export class StateGraph<S extends GraphState> {
  private nodes = new Map<string, GraphNode<S>>();
  private edges: Edge<S>[] = [];
  private schema: z.ZodType<S>;
  private checkpointer?: Checkpointer;
  private reducers: ReducerMap<S> = {};

  constructor(
    schema: z.ZodType<S>,
    config?: { reducers?: ReducerMap<S> }
  ) {
    this.schema = schema;
    if (config?.reducers) {
      this.reducers = config.reducers;
    }
  }

  addNode(node: GraphNode<S>): this {
    if (this.nodes.has(node.name)) {
      throw new Error(`Node '${node.name}' is already registered`);
    }
    this.nodes.set(node.name, node);
    return this;
  }

  addEdge(edge: Edge<S>): this {
    this.edges.push(edge);
    return this;
  }

  setCheckpointer(cp: Checkpointer): this {
    this.checkpointer = cp;
    return this;
  }

  private applyReducers(state: S, partial: Partial<S>): S {
    const next = { ...state } as Record<string, unknown>;
    for (const [key, value] of Object.entries(partial as Record<string, unknown>)) {
      const reducer = this.reducers[key as keyof S];
      if (reducer) {
        next[key] = reducer(state[key as keyof S] as never, value as never);
      } else {
        next[key] = value;
      }
    }
    return next as S;
  }

  async run(
    initialState: S,
    options?: { threadId?: string; maxSteps?: number }
  ): Promise<GraphRunResult<S>> {
    const threadId = options?.threadId || randomUUID();
    let state = this.schema.parse(initialState) as S;
    const steps: StepRecord[] = [];
    let current: string | null = "__start__";
    let stepCount = 0;
    const maxSteps = options?.maxSteps ?? 100;

    while (current !== "__end__" && stepCount < maxSteps) {
      stepCount++;

      if (current === "__start__") {
        const firstEdge = this.edges.find(
          (e) => e.from === "__start__"
        );
        if (!firstEdge) {
          current =
            this.nodes.size > 0
              ? this.nodes.keys().next().value!
              : "__end__";
        } else {
          current =
            typeof firstEdge.to === "function"
              ? firstEdge.to(state)
              : firstEdge.to;
        }
        if (current === "__end__") break;
      }

      const node = this.nodes.get(current);
      if (!node) {
        throw new Error(
          `Node '${current}' not found. Available nodes: ${Array.from(this.nodes.keys()).join(", ")}`
        );
      }

      if (node.metadata?.retries) {
        let lastError: Error | null = null;
        for (let attempt = 0; attempt <= node.metadata.retries; attempt++) {
          try {
            const stepStart = performance.now();
            const partial = await node.execute(state);
            const duration = Math.round(performance.now() - stepStart);

            state = this.applyReducers(state, partial);
            state = this.schema.parse(state) as S;

            if (this.checkpointer) {
              await this.checkpointer.save("graph", threadId, {
                state,
                currentNode: current,
                stepCount,
              });
            }

            const edge = this.findOutgoingEdge(current);
            const nextNode =
              edge === undefined
                ? "__end__"
                : typeof edge.to === "function"
                  ? edge.to(state)
                  : edge.to;

            steps.push({
              node: current,
              duration,
              input: partial,
              output: { [current]: state[current] },
            });

            current = nextNode;
            lastError = null;
            break;
          } catch (error) {
            lastError =
              error instanceof Error ? error : new Error(String(error));
            if (attempt < node.metadata.retries) {
              const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
              await new Promise((r) => setTimeout(r, delay));
            }
          }
        }
        if (lastError) {
          throw new Error(
            `Node '${current}' failed after ${node.metadata.retries} retries: ${lastError.message}`
          );
        }
      } else {
        const stepStart = performance.now();
        const partial = await node.execute(state);
        const duration = Math.round(performance.now() - stepStart);

        state = this.applyReducers(state, partial);
        state = this.schema.parse(state) as S;

        if (this.checkpointer) {
          await this.checkpointer.save("graph", threadId, {
            state,
            currentNode: current,
            stepCount,
          });
        }

        const edge = this.findOutgoingEdge(current);
        const nextNode =
          edge === undefined
            ? "__end__"
            : typeof edge.to === "function"
              ? edge.to(state)
              : edge.to;

        steps.push({
          node: current,
          duration,
          input: partial,
          output: { [current]: state[current] },
        });

        current = nextNode;
      }
    }

    if (stepCount >= maxSteps && current !== "__end__") {
      throw new Error(
        `Graph exceeded maximum steps (${maxSteps}) without reaching __end__`
      );
    }

    return { finalState: state, steps };
  }

  async resume(
    threadId: string,
    options?: { maxSteps?: number }
  ): Promise<GraphRunResult<S>> {
    if (!this.checkpointer) {
      throw new Error("No checkpointer configured for graph resumption");
    }
    const checkpoint = await this.checkpointer.load("graph", threadId);
    if (!checkpoint) {
      throw new Error(`No checkpoint found for thread '${threadId}'`);
    }
    const { state } = checkpoint as { state: S };
    return this.run(state, { threadId, maxSteps: options?.maxSteps });
  }

  private findOutgoingEdge(nodeName: string): Edge<S> | undefined {
    return this.edges.find((e) => e.from === nodeName);
  }

  getNodes(): GraphNode<S>[] {
    return Array.from(this.nodes.values());
  }

  getEdges(): Edge<S>[] {
    return [...this.edges];
  }

  hasNode(name: string): boolean {
    return this.nodes.has(name);
  }
}
