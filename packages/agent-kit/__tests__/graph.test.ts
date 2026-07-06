import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import {
  StateGraph,
  InMemoryCheckpointer,
  PregelEngine,
  addReducer,
  appendReducer,
  replaceReducer,
} from "../src/graph/index.js";

const testSchema = z.object({
  value: z.number().default(0),
  items: z.array(z.string()).default([]),
  label: z.string().optional(),
  status: z.string().optional(),
});

type TestState = z.output<typeof testSchema>;

void describe("StateGraph", () => {
  void it("should run a simple linear graph", async () => {
    const graph = new StateGraph(testSchema);

    graph.addNode({
      name: "add_one",
      execute: async (state: TestState) => ({
        value: state.value + 1,
      }),
    });

    graph.addNode({
      name: "double",
      execute: async (state: TestState) => ({
        value: state.value * 2,
      }),
    });

    graph.addEdge({ from: "__start__", to: "add_one" });
    graph.addEdge({ from: "add_one", to: "double" });
    graph.addEdge({ from: "double", to: "__end__" });

    const result = await graph.run({ value: 5 } as TestState);
    assert.equal(result.finalState.value, 12);
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[0].node, "add_one");
    assert.equal(result.steps[1].node, "double");
  });

  void it("should support conditional edges", async () => {
    const graph = new StateGraph(testSchema);

    graph.addNode({
      name: "check",
      execute: async (state: TestState) => ({
        status: state.value > 10 ? "high" : "low",
      }),
    });

    graph.addNode({
      name: "high_handler",
      execute: async (state: TestState) => ({
        value: state.value * 2,
        label: "handled_high",
      }),
    });

    graph.addNode({
      name: "low_handler",
      execute: async (state: TestState) => ({
        value: state.value + 100,
        label: "handled_low",
      }),
    });

    graph.addEdge({ from: "__start__", to: "check" });
    graph.addEdge({
      from: "check",
      to: (state: TestState) =>
        state.value > 10 ? "high_handler" : "low_handler",
    });
    graph.addEdge({ from: "high_handler", to: "__end__" });
    graph.addEdge({ from: "low_handler", to: "__end__" });

    const highResult = await graph.run({ value: 20 } as TestState);
    assert.equal(highResult.finalState.value, 40);
    assert.equal(highResult.finalState.label, "handled_high");

    const lowResult = await graph.run({ value: 5 } as TestState);
    assert.equal(lowResult.finalState.value, 105);
    assert.equal(lowResult.finalState.label, "handled_low");
  });

  void it("should throw on unknown node", async () => {
    const graph = new StateGraph(testSchema);

    graph.addNode({
      name: "exists",
      execute: async (state: TestState) => state,
    });

    graph.addEdge({ from: "__start__", to: "exists" });
    graph.addEdge({ from: "exists", to: "nonexistent" });

    await assert.rejects(
      () => graph.run({} as TestState),
      /Node 'nonexistent' not found/
    );
  });

  void it("should enforce max steps", async () => {
    const graph = new StateGraph(testSchema);

    graph.addNode({
      name: "loop",
      execute: async (state: TestState) => ({
        value: state.value + 1,
      }),
    });

    graph.addEdge({ from: "__start__", to: "loop" });
    graph.addEdge({ from: "loop", to: "loop" });

    await assert.rejects(
      () => graph.run({ value: 0 } as TestState, { maxSteps: 5 }),
      /exceeded maximum steps/
    );
  });

  void it("should support reducers", async () => {
    const graph = new StateGraph(testSchema, {
      reducers: {
        value: addReducer<number>(),
        items: appendReducer<string>(),
      },
    });

    graph.addNode({
      name: "add_a",
      execute: async () => ({ value: 1, items: ["a"] }),
    });

    graph.addNode({
      name: "add_b",
      execute: async () => ({ value: 2, items: ["b"] }),
    });

    graph.addEdge({ from: "__start__", to: "add_a" });
    graph.addEdge({ from: "add_a", to: "add_b" });
    graph.addEdge({ from: "add_b", to: "__end__" });

    const result = await graph.run({ value: 0, items: [] } as TestState);
    assert.equal(result.finalState.value, 3);
    assert.deepEqual(result.finalState.items, ["a", "b"]);
  });

  void it("should checkpoint and resume", async () => {
    const checkpointer = new InMemoryCheckpointer();
    const graph = new StateGraph(testSchema);

    graph.setCheckpointer(checkpointer);

    let stepCount = 0;
    graph.addNode({
      name: "step",
      execute: async (state: TestState) => {
        stepCount++;
        return { value: state.value + 1, status: `step_${stepCount}` };
      },
    });

    graph.addEdge({ from: "__start__", to: "step" });
    graph.addEdge({
      from: "step",
      to: (state: TestState) =>
        state.value >= 3 ? "__end__" : "step",
    });

    const result = await graph.run(
      { value: 0 } as TestState,
      { threadId: "test-thread-1" }
    );
    assert.equal(result.finalState.value, 3);

    const checkpoint = await checkpointer.load("graph", "test-thread-1");
    assert.ok(checkpoint);
    assert.equal(
      (checkpoint as { state: TestState }).state.value,
      3
    );
  });
});

void describe("InMemoryCheckpointer", () => {
  void it("should save and load state", async () => {
    const cp = new InMemoryCheckpointer();
    await cp.save("ns1", "key1", { hello: "world" });
    const loaded = await cp.load("ns1", "key1");
    assert.deepEqual(loaded, { hello: "world" });
  });

  void it("should return null for missing key", async () => {
    const cp = new InMemoryCheckpointer();
    const loaded = await cp.load("ns1", "nonexistent");
    assert.equal(loaded, null);
  });

  void it("should list all keys in namespace", async () => {
    const cp = new InMemoryCheckpointer();
    await cp.save("ns1", "a", { v: 1 });
    await cp.save("ns1", "b", { v: 2 });
    await cp.save("ns2", "c", { v: 3 });
    const items = await cp.list("ns1");
    assert.equal(items.length, 2);
    assert.deepEqual(items.find((i) => i.key === "a")?.state, { v: 1 });
  });
});

void describe("PregelEngine", () => {
  void it("should execute nodes in parallel", async () => {
    const engine = new PregelEngine({ maxConcurrency: 4 });
    const nodes = [
      {
        name: "add_10",
        execute: async (state: TestState) => ({ value: state.value + 10 }),
        metadata: {},
      },
      {
        name: "add_20",
        execute: async (state: TestState) => ({ value: state.value + 20 }),
        metadata: {},
      },
    ];

    const result = await engine.executeFanOut(
      nodes,
      { value: 5 } as TestState
    );
    assert.equal(result.partials.length, 2);
    assert.equal(result.steps.length, 2);
    const val0 = (result.partials[0] as { value?: number }).value ?? 0;
    const val1 = (result.partials[1] as { value?: number }).value ?? 0;
    assert.equal(val0, 15);
    assert.equal(val1, 25);
  });

  void it("should handle errors in parallel execution", async () => {
    const engine = new PregelEngine({ maxConcurrency: 2 });
    const nodes = [
      {
        name: "good",
        execute: async (state: TestState) => ({ value: state.value + 1 }),
        metadata: {},
      },
      {
        name: "bad",
        execute: async () => {
          throw new Error("boom");
        },
        metadata: {},
      },
    ];

    const result = await engine.executeFanOut(
      nodes,
      { value: 0 } as TestState
    );
    assert.equal(result.steps.length, 2);
    assert.equal(result.steps[1].output?.error, "Error: boom");
  });
});

void describe("Reducer functions", () => {
  void it("addReducer should sum numbers", () => {
    const r = addReducer<number>();
    assert.equal(r(1, 2), 3);
    assert.equal(r(5, 3), 8);
  });

  void it("replaceReducer should replace values", () => {
    const r = replaceReducer<string>();
    assert.equal(r("old", "new"), "new");
  });

  void it("appendReducer should concatenate arrays", () => {
    const r = appendReducer<string>();
    assert.deepEqual(r(["a"], ["b", "c"]), ["a", "b", "c"]);
  });
});
