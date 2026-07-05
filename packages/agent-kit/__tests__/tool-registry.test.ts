import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { ToolRegistry } from "../src/tool-registry.js";
import { allTools } from "../src/tools/index.js";
import { BizHubAgent } from "../src/agent.js";
import { rateLimit, retry } from "../src/middleware/index.js";
import type { ToolDefinition } from "../src/types.js";

void describe("ToolRegistry", () => {
  void it("should register a single tool", () => {
    const registry = new ToolRegistry();
    const tool: ToolDefinition = {
      name: "test_tool",
      description: "A test tool",
      schema: { parse: (x: unknown) => x } as any,
      handler: async () => ({ success: true, data: "ok" }),
    };
    registry.register(tool);
    assert.equal(registry.list().length, 1);
    assert.equal(registry.get("test_tool")?.name, "test_tool");
  });

  void it("should register multiple tools", () => {
    const registry = new ToolRegistry();
    registry.registerMany(allTools);
    assert.equal(registry.list().length, allTools.length);
  });

  void it("should throw on duplicate registration", () => {
    const registry = new ToolRegistry();
    const tool: ToolDefinition = {
      name: "dup",
      description: "dup",
      schema: { parse: (x: unknown) => x } as any,
      handler: async () => ({ success: true }),
    };
    registry.register(tool);
    assert.throws(() => registry.register(tool), /already registered/);
  });

  void it("should execute a tool and return result", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "echoes args",
      schema: { parse: (x: unknown) => x } as any,
      handler: async (args) => ({ success: true, data: args }),
    });
    const result = await registry.execute("echo", { hello: "world" });
    assert.equal(result.success, true);
    assert.deepEqual(result.data, { hello: "world" });
  });

  void it("should return error for unknown tool", async () => {
    const registry = new ToolRegistry();
    const result = await registry.execute("nonexistent", {});
    assert.equal(result.success, false);
    assert.ok(result.error?.includes("not found"));
  });

  void it("should run middleware in order", async () => {
    const registry = new ToolRegistry();
    const order: number[] = [];

    registry.use(async (_tool, _args, _ctx, next) => {
      order.push(1);
      const result = await next();
      order.push(4);
      return result;
    });
    registry.use(async (_tool, _args, _ctx, next) => {
      order.push(2);
      const result = await next();
      order.push(3);
      return result;
    });

    registry.register({
      name: "mid_test",
      description: "test",
      schema: { parse: (x: unknown) => x } as any,
      handler: async () => {
        return { success: true, data: "done" };
      },
    });

    await registry.execute("mid_test", {});
    assert.deepEqual(order, [1, 2, 3, 4]);
  });

  void it("should filter tools by permissions", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "admin_only",
      description: "admin",
      schema: { parse: (x: unknown) => x } as any,
      handler: async () => ({ success: true }),
      permissions: ["admin"],
    });
    registry.register({
      name: "public",
      description: "public",
      schema: { parse: (x: unknown) => x } as any,
      handler: async () => ({ success: true }),
    });
    const adminTools = registry.listByPermission(["admin"]);
    assert.equal(adminTools.length, 2);
    const userTools = registry.listByPermission(["user"]);
    assert.equal(userTools.length, 1);
    assert.equal(userTools[0].name, "public");
  });

  void it("should include duration in result", async () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "slow",
      description: "slow tool",
      schema: { parse: (x: unknown) => x } as any,
      handler: async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { success: true };
      },
    });
    const result = await registry.execute("slow", {});
    assert.equal(result.success, true);
    assert.ok(typeof result.duration === "number");
    assert.ok(result.duration! >= 10);
  });
});

void describe("All Tools", () => {
  void it("should have unique names", () => {
    const names = allTools.map((t) => t.name);
    const unique = new Set(names);
    assert.equal(names.length, unique.size, "Tool names must be unique");
  });

  void it("should have descriptions on every tool", () => {
    for (const tool of allTools) {
      assert.ok(tool.description?.length > 0, `Tool ${tool.name} missing description`);
    }
  });

  void it("should have handlers on every tool", () => {
    for (const tool of allTools) {
      assert.equal(typeof tool.handler, "function", `Tool ${tool.name} missing handler`);
    }
  });

  void it("should parse schema properties", () => {
    for (const tool of allTools) {
      const schema = tool.schema;
      assert.ok(schema._def?.shape, `Tool ${tool.name} schema has no shape`);
      const shape = schema._def.shape();
      assert.ok(Object.keys(shape).length >= 0);
    }
  });
});

import { BizHubAgent } from "../src/agent.js";
import { rateLimit, retry } from "../src/middleware/index.js";

void describe("BizHubAgent", () => {
  void it("should create agent with default tools", () => {
    const agent = new BizHubAgent({ name: "test" });
    agent.loadDefaultTools();
    const tools = agent.getToolDefinitions();
    assert.ok(tools.length > 0);
  });

  void it("should get OpenAI-compatible tool definitions", () => {
    const agent = new BizHubAgent({ name: "test" });
    agent.loadDefaultTools();
    const openaiTools = agent.getOpenAITools();
    assert.ok(openaiTools.length > 0);
    assert.equal(openaiTools[0].type, "function");
    assert.ok(openaiTools[0].function?.name);
  });

  void it("should get Anthropic-compatible tool definitions", () => {
    const agent = new BizHubAgent({ name: "test" });
    agent.loadDefaultTools();
    const anthropicTools = agent.getAnthropicTools();
    assert.ok(anthropicTools.length > 0);
    assert.ok(anthropicTools[0].name);
    assert.ok(anthropicTools[0].input_schema);
  });
});

void describe("Middleware", () => {
  void it("should rate limit properly", async () => {
    const registry = new ToolRegistry();
    registry.use(rateLimit({ maxRequests: 2, windowMs: 60000 }));
    registry.register({
      name: "limited",
      description: "rate limited",
      schema: { parse: (x: unknown) => x } as any,
      handler: async () => ({ success: true }),
    });
    assert.equal((await registry.execute("limited", {})).success, true);
    assert.equal((await registry.execute("limited", {})).success, true);
    assert.equal((await registry.execute("limited", {})).success, false);
  });

  void it("should retry on failure", async () => {
    const registry = new ToolRegistry();
    let attempts = 0;
    registry.use(retry(2, 10));
    registry.register({
      name: "flaky",
      description: "flaky tool",
      schema: { parse: (x: unknown) => x } as any,
      handler: async () => {
        attempts++;
        if (attempts < 3) return { success: false, error: "not yet" };
        return { success: true };
      },
    });
    const result = await registry.execute("flaky", {});
    assert.equal(result.success, true);
    assert.equal(attempts, 3);
  });
});
