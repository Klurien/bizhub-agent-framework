export { MessagingClient } from "./client.js";
export { encryptMessage, decryptMessage, generateKeyPair, computeSharedSecret, keyStore } from "./crypto.js";
export type { MessagingConfig, Conversation, Message, Participant, KeyPair, EncryptedPayload } from "./types.js";
export { CreateConversationSchema, SendMessageSchema, ConversationSchema, MessageSchema } from "./types.js";
