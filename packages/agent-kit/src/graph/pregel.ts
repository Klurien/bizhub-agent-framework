import type { GraphState, GraphNode, StepRecord } from "./types.js";

export interface PregelChannel {
  name: string;
  value: unknown;
}

export interface PregelConfig {
  maxConcurrency?: number;
}

export class PregelEngine<S extends GraphState> {
  private maxConcurrency: number;

  constructor(config?: PregelConfig) {
    this.maxConcurrency = config?.maxConcurrency ?? 4;
  }

  async executeFanOut(
    nodes: GraphNode<S>[],
    state: S
  ): Promise<{ partials: Partial<S>[]; steps: StepRecord[] }> {
    const batches: GraphNode<S>[][] = [];
    for (let i = 0; i < nodes.length; i += this.maxConcurrency) {
      batches.push(nodes.slice(i, i + this.maxConcurrency));
    }

    const allPartials: Partial<S>[] = [];
    const allSteps: StepRecord[] = [];

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map(async (node) => {
          const start = performance.now();
          try {
            const partial = await node.execute(state);
            const duration = Math.round(performance.now() - start);
            return {
              partial,
              step: { node: node.name, duration, output: partial },
            };
          } catch (error) {
            const duration = Math.round(performance.now() - start);
            return {
              partial: {} as Partial<S>,
              step: {
                node: node.name,
                duration,
                output: { error: String(error) },
              },
            };
          }
        })
      );

      for (const r of results) {
        allPartials.push(r.partial);
        allSteps.push(r.step as StepRecord);
      }
    }

    return { partials: allPartials, steps: allSteps };
  }

  async executeWithRetry(
    node: GraphNode<S>,
    state: S,
    retries = 0
  ): Promise<{ partial: Partial<S>; step: StepRecord }> {
    const start = performance.now();
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const partial = await Promise.race([
          node.execute(state),
          ...(node.metadata?.timeout
            ? [
                new Promise<never>((_, reject) =>
                  setTimeout(
                    () => reject(new Error(`Timeout after ${node.metadata!.timeout}ms`)),
                    node.metadata!.timeout
                  )
                ),
              ]
            : []),
        ]) as Partial<S>;
        const duration = Math.round(performance.now() - start);
        return {
          partial,
          step: { node: node.name, duration, output: partial },
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < retries) {
          const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }

    const duration = Math.round(performance.now() - start);
    return {
      partial: {} as Partial<S>,
      step: {
        node: node.name,
        duration,
        output: { error: lastError?.message ?? "Unknown error" },
      },
    };
  }

  async mapReduce<T>(
    items: T[],
    mapper: (item: T, index: number) => Promise<Partial<S>>,
    reducer: (partials: Partial<S>[]) => S
  ): Promise<{ state: S; steps: StepRecord[] }> {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += this.maxConcurrency) {
      batches.push(items.slice(i, i + this.maxConcurrency));
    }

    const partials: Partial<S>[] = [];
    const steps: StepRecord[] = [];

    for (const batch of batches) {
      const results = await Promise.all(
        batch.map(async (item, idx) => {
          const start = performance.now();
          try {
            const partial = await mapper(item, idx);
            const duration = Math.round(performance.now() - start);
            return { partial, step: { node: `mapper[${idx}]`, duration } };
          } catch (error) {
            const duration = Math.round(performance.now() - start);
            return {
              partial: {} as Partial<S>,
              step: {
                node: `mapper[${idx}]`,
                duration,
                output: { error: String(error) },
              },
            };
          }
        })
      );

      for (const r of results) {
        partials.push(r.partial);
        steps.push(r.step);
      }
    }

    return { state: reducer(partials), steps };
  }
}
