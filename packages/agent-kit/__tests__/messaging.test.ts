import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  SendMessageSchema,
  ConversationSchema,
  MessageSchema,
  CreateConversationSchema,
} from "../src/messaging/types.js";

describe("messaging schemas", () => {
  it("defaults encrypt to false so E2E is explicit opt-in", () => {
    const parsed = SendMessageSchema.parse({
      conversationId: "c1",
      text: "hello",
    });
    assert.equal(parsed.encrypt, false);
  });

  it("honours an explicit encrypt:true request", () => {
    const parsed = SendMessageSchema.parse({
      conversationId: "c1",
      text: "hello",
      encrypt: true,
    });
    assert.equal(parsed.encrypt, true);
  });

  it("rejects empty and oversized message bodies", () => {
    assert.throws(() => SendMessageSchema.parse({ conversationId: "c1", text: "" }));
    assert.throws(() =>
      SendMessageSchema.parse({ conversationId: "c1", text: "x".repeat(10001) })
    );
  });

  it("requires at least one participant when creating a conversation", () => {
    assert.throws(() =>
      CreateConversationSchema.parse({ type: "direct", participantIds: [] })
    );
    const ok = CreateConversationSchema.parse({
      type: "direct",
      participantIds: ["u1", "u2"],
    });
    assert.equal(ok.type, "direct");
  });

  it("validates a conversation with participants and unread count", () => {
    const conv = ConversationSchema.parse({
      id: "c1",
      type: "group",
      title: "Order 123",
      participants: [
        {
          userId: "u1",
          name: "Buyer",
          role: "member",
          joinedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      unreadCount: 2,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      encrypted: false,
    });
    assert.equal(conv.participants.length, 1);
    assert.equal(conv.unreadCount, 2);
  });

  it("accepts encrypted message content", () => {
    const msg = MessageSchema.parse({
      id: "m1",
      conversationId: "c1",
      senderId: "u1",
      senderName: "Buyer",
      content: { type: "encrypted", ciphertext: "abc", nonce: "n" },
      timestamp: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(msg.content.type, "encrypted");
  });

  it("rejects a message with no recognisable content shape", () => {
    assert.throws(() =>
      MessageSchema.parse({
        id: "m1",
        conversationId: "c1",
        senderId: "u1",
        senderName: "Buyer",
        content: { type: "bogus" },
        timestamp: "2026-01-01T00:00:00.000Z",
      })
    );
  });
});