import { z } from "zod";
import { api } from "../client.js";
import type { ToolDefinition } from "../types.js";

export const conversationsList: ToolDefinition = {
  name: "conversations_list",
  description:
    "List all conversations for the current user. Returns conversation ID, type (direct/group), title, participants, last message preview, and unread count.",
  schema: z.object({}),
  handler: async () => {
    const data = await api.request("GET", "/conversations");
    return { success: true, data };
  },
  rateLimit: { maxRequests: 30, windowMs: 60000 },
  version: "1.0.0",
};

export const conversationsGet: ToolDefinition = {
  name: "conversations_get",
  description:
    "Get detailed information about a specific conversation including all participants and their roles.",
  schema: z.object({
    conversationId: z.string().describe("The conversation ID"),
  }),
  handler: async ({ conversationId }) => {
    const data = await api.request("GET", `/conversations/${conversationId}`);
    return { success: true, data };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const conversationsCreate: ToolDefinition = {
  name: "conversations_create",
  description:
    "Create a new conversation. Use 'direct' for 1-on-1 chats or 'group' for multi-participant conversations. Requires participant user IDs.",
  schema: z.object({
    type: z.enum(["direct", "group"]).describe("direct for 1-on-1, group for multi-participant"),
    title: z
      .string()
      .max(200)
      .optional()
      .describe("Conversation title (required for group, optional for direct)"),
    participantIds: z
      .array(z.string())
      .min(1)
      .max(256)
      .describe("Array of user IDs to add to the conversation"),
  }),
  handler: async ({ type, title, participantIds }) => {
    const data = await api.request("POST", "/conversations", {
      type,
      title,
      participantIds,
    });
    return {
      success: true,
      data,
      warnings: [
        !title && type === "group"
          ? "Group conversation created without a title — set one via conversations_update"
          : undefined,
      ].filter((w): w is string => Boolean(w)),
    };
  },
  permissions: ["messages:write"],
  rateLimit: { maxRequests: 20, windowMs: 60000 },
  version: "1.0.0",
};

export const conversationsDelete: ToolDefinition = {
  name: "conversations_delete",
  description:
    "Permanently delete a conversation and all its messages. This action cannot be undone.",
  schema: z.object({
    conversationId: z.string().describe("The conversation ID to delete"),
  }),
  handler: async ({ conversationId }) => {
    await api.request("DELETE", `/conversations/${conversationId}`);
    return {
      success: true,
      data: { deleted: conversationId },
    };
  },
  permissions: ["messages:write"],
  rateLimit: { maxRequests: 10, windowMs: 60000 },
  version: "1.0.0",
};

export const messagesList: ToolDefinition = {
  name: "messages_list",
  description:
    "List messages in a conversation with optional pagination. Returns message ID, sender, content preview, and timestamp.",
  schema: z.object({
    conversationId: z.string().describe("The conversation ID"),
    limit: z
      .number()
      .min(1)
      .max(200)
      .optional()
      .default(50)
      .describe("Maximum number of messages to return"),
    before: z
      .string()
      .optional()
      .describe("Return messages before this ID (for pagination)"),
  }),
  handler: async ({ conversationId, limit, before }) => {
    const qs = new URLSearchParams({ limit: String(limit || 50) });
    if (before) qs.set("before", before);
    const data = await api.request(
      "GET",
      `/conversations/${conversationId}/messages?${qs}`
    );
    return { success: true, data };
  },
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const messagesSend: ToolDefinition = {
  name: "messages_send",
  description:
    "Send a message to a conversation. The message will be encrypted end-to-end if the conversation has encryption enabled.",
  schema: z.object({
    conversationId: z.string().describe("The conversation ID to send to"),
    text: z
      .string()
      .min(1)
      .max(10000)
      .describe("Message text content"),
    replyTo: z
      .string()
      .optional()
      .describe("Message ID to reply to (for threads)"),
  }),
  handler: async ({ conversationId, text, replyTo }) => {
    const data = await api.request(
      "POST",
      `/conversations/${conversationId}/messages`,
      { text, replyTo }
    );
    return { success: true, data };
  },
  permissions: ["messages:write"],
  rateLimit: { maxRequests: 60, windowMs: 60000 },
  version: "1.0.0",
};

export const messagesDelete: ToolDefinition = {
  name: "messages_delete",
  description:
    "Delete a specific message from a conversation. Can only delete your own messages.",
  schema: z.object({
    conversationId: z.string().describe("The conversation ID"),
    messageId: z.string().describe("The message ID to delete"),
  }),
  handler: async ({ conversationId, messageId }) => {
    await api.request(
      "DELETE",
      `/conversations/${conversationId}/messages/${messageId}`
    );
    return { success: true, data: { deleted: messageId } };
  },
  permissions: ["messages:write"],
  rateLimit: { maxRequests: 20, windowMs: 60000 },
  version: "1.0.0",
};

export const messagesMarkRead: ToolDefinition = {
  name: "messages_mark_read",
  description:
    "Mark all messages in a conversation as read. Updates the read timestamp for the current user.",
  schema: z.object({
    conversationId: z.string().describe("The conversation ID"),
  }),
  handler: async ({ conversationId }) => {
    await api.request("POST", `/conversations/${conversationId}/read`);
    return { success: true, data: { conversationId, status: "read" } };
  },
  rateLimit: { maxRequests: 120, windowMs: 60000 },
  version: "1.0.0",
};

export const messagingTools: ToolDefinition[] = [
  conversationsList,
  conversationsGet,
  conversationsCreate,
  conversationsDelete,
  messagesList,
  messagesSend,
  messagesDelete,
  messagesMarkRead,
];
