import { z } from "zod";

export interface MessagingConfig {
  apiUrl: string;
  jwt?: string;
  apiKey?: string;
  wsUrl?: string;
}

export interface KeyPair {
  publicKey: string;
  secretKey: string;
}

export interface EncryptedPayload {
  ciphertext: string;
  nonce: string;
  salt: string;
}

export interface IKeyStoreAdapter {
  loadIdentity(userId: string): Promise<KeyPair | null>;
  saveIdentity(userId: string, keyPair: KeyPair): Promise<void>;
  loadConversationKey(userId: string, conversationId: string): Promise<ArrayBuffer | null>;
  saveConversationKey(userId: string, conversationId: string, key: ArrayBuffer): Promise<void>;
  removeConversationKey(userId: string, conversationId: string): Promise<void>;
}

export interface SignedPreKey {
  key: string;
  signature: string;
  id: number;
}

export const ConversationType = {
  DIRECT: "direct",
  GROUP: "group",
} as const;

export type ConversationType = (typeof ConversationType)[keyof typeof ConversationType];

export interface Conversation {
  id: string;
  type: ConversationType;
  title?: string;
  participants: Participant[];
  lastMessage?: MessageSummary;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
  encrypted: boolean;
}

export interface Participant {
  userId: string;
  name: string;
  publicKey?: string;
  signedPreKey?: SignedPreKey;
  role: "admin" | "member";
  joinedAt: string;
  lastReadAt?: string;
}

export interface MessageSummary {
  id: string;
  senderId: string;
  senderName: string;
  preview: string;
  timestamp: string;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  content: MessageContent;
  timestamp: string;
  editedAt?: string;
  replyTo?: string;
}

export type MessageContent =
  | { type: "text"; text: string }
  | { type: "encrypted"; ciphertext: string; nonce: string }
  | { type: "system"; text: string };

export interface MessageDelivery {
  messageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp: string;
}

export const CreateConversationSchema = z.object({
  type: z.enum(["direct", "group"]),
  title: z.string().max(200).optional(),
  participantIds: z.array(z.string()).min(1).max(256),
});

export const SendMessageSchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1).max(10000),
  replyTo: z.string().optional(),
  encrypt: z.boolean().default(true),
});

export type CreateConversationInput = z.infer<typeof CreateConversationSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;

export const ConversationSchema = z.object({
  id: z.string(),
  type: z.enum(["direct", "group"]),
  title: z.string().optional(),
  participants: z.array(
    z.object({
      userId: z.string(),
      name: z.string(),
      publicKey: z.string().optional(),
      role: z.enum(["admin", "member"]),
      joinedAt: z.string(),
      lastReadAt: z.string().optional(),
    })
  ),
  lastMessage: z
    .object({
      id: z.string(),
      senderId: z.string(),
      senderName: z.string(),
      preview: z.string(),
      timestamp: z.string(),
    })
    .optional(),
  unreadCount: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  encrypted: z.boolean(),
});

export const MessageSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  senderId: z.string(),
  senderName: z.string(),
  content: z.union([
    z.object({ type: z.literal("text"), text: z.string() }),
    z.object({ type: z.literal("encrypted"), ciphertext: z.string(), nonce: z.string() }),
    z.object({ type: z.literal("system"), text: z.string() }),
  ]),
  timestamp: z.string(),
  editedAt: z.string().optional(),
  replyTo: z.string().optional(),
});
