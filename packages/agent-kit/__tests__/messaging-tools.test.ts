import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { messagingTools } from "../src/tools/messaging.js";

const byName = new Map(messagingTools.map((t) => [t.name, t]));

describe("messaging tool registry", () => {
  it("registers every conversation and message tool", () => {
    for (const name of [
      "conversations_list",
      "conversations_get",
      "conversations_create",
      "conversations_update",
      "conversations_delete",
      "messages_list",
      "messages_send",
      "messages_delete",
      "messages_mark_read",
    ]) {
      assert.ok(byName.has(name), `missing tool: ${name}`);
    }
  });

  it("registers exactly the tools it exports, with no duplicates", () => {
    const names = messagingTools.map((t) => t.name);
    assert.equal(new Set(names).size, names.length, "duplicate tool names");
    assert.equal(messagingTools.length, 9);
  });

  it("exposes conversations_update, which conversations_create references", () => {
    // Regression guard: conversations_create tells the agent to call
    // conversations_update when a group has no title. That tool must exist.
    assert.ok(byName.has("conversations_update"));
  });

  it("every tool has a schema, handler, description and version", () => {
    for (const tool of messagingTools) {
      assert.ok(tool.description?.length, `${tool.name} missing description`);
      assert.equal(typeof tool.handler, "function", `${tool.name} missing handler`);
      assert.ok(tool.schema, `${tool.name} missing schema`);
      assert.ok(tool.version, `${tool.name} missing version`);
    }
  });

  it("every write tool requires messages:write", () => {
    const writeTools = messagingTools.filter((t) =>
      t.name.startsWith("conversations_create") ||
      t.name.startsWith("conversations_update") ||
      t.name.startsWith("conversations_delete") ||
      t.name.startsWith("messages_send") ||
      t.name.startsWith("messages_delete")
    );
    assert.ok(writeTools.length >= 5);
    for (const tool of writeTools) {
      assert.ok(
        tool.permissions?.includes("messages:write"),
        `${tool.name} should require messages:write`
      );
    }
  });

  it("every tool has a rate limit", () => {
    for (const tool of messagingTools) {
      assert.ok(tool.rateLimit, `${tool.name} missing rateLimit`);
      assert.ok(tool.rateLimit.maxRequests > 0);
      assert.ok(tool.rateLimit.windowMs > 0);
    }
  });
});