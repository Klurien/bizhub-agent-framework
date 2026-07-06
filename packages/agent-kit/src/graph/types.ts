import { z } from "zod";

export interface GraphState {
  [key: string]: unknown;
}

export type GraphNode<S extends GraphState> = {
  name: string;
  execute: (state: S) => Promise<Partial<S>>;
  metadata?: {
    runIn?: "activity" | "workflow";
    timeout?: number;
    retries?: number;
  };
};

export interface Edge<S extends GraphState> {
  from: string;
  to: string | ((state: S) => string);
}

export interface Checkpointer {
  save(namespace: string, key: string, state: unknown): Promise<void>;
  load(namespace: string, key: string): Promise<unknown | null>;
  list(namespace: string): Promise<{ key: string; state: unknown }[]>;
}

export interface StepRecord {
  node: string;
  duration: number;
  input?: Partial<GraphState>;
  output?: Partial<GraphState>;
}

export interface GraphRunResult<S extends GraphState> {
  finalState: S;
  steps: StepRecord[];
}

export type Reducer<T> = (existing: T, incoming: T) => T;

export type ReducerMap<S extends GraphState> = {
  [K in keyof S]?: Reducer<S[K]>;
};
