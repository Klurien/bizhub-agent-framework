import type {
  MessagingConfig,
  Conversation,
  Message,
  MessageDelivery,
  CreateConversationInput,
  SendMessageInput,
} from "./types.js";
import { keyStore, encryptMessage, decryptMessage } from "./crypto.js";

type MessageHandler = (message: Message) => void;
type DeliveryHandler = (delivery: MessageDelivery) => void;
type StatusHandler = (status: { type: string; conversationId: string }) => void;

export class MessagingClient {
  private config: MessagingConfig;
  private headers: Record<string, string>;
  private ws: WebSocket | null = null;
  private wsConnected = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setTimeout> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private messageHandlers = new Set<MessageHandler>();
  private deliveryHandlers = new Set<DeliveryHandler>();
  private statusHandlers = new Set<StatusHandler>();
  private userId: string = "";

  constructor(config: MessagingConfig) {
    this.config = config;
    this.headers = { "Content-Type": "application/json" };
    if (config.jwt) {
      this.headers["Authorization"] = `Bearer ${config.jwt}`;
    } else if (config.apiKey) {
      this.headers["X-API-Key"] = config.apiKey;
    }
  }

  setAuth(jwt: string): void {
    this.headers["Authorization"] = `Bearer ${jwt}`;
  }

  setUserId(userId: string): void {
    this.userId = userId;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.config.apiUrl}/api${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Request failed" }));
      throw new Error(`Messaging API error ${res.status}: ${err.message}`);
    }
    return res.json() as Promise<T>;
  }

  // ─── Conversations ──────────────────────────────────────────

  async listConversations(): Promise<Conversation[]> {
    const data = await this.request<{ items: Conversation[] }>(
      "GET",
      "/conversations"
    );
    return data.items;
  }

  async getConversation(id: string): Promise<Conversation> {
    return this.request<Conversation>("GET", `/conversations/${id}`);
  }

  async createConversation(input: CreateConversationInput): Promise<Conversation> {
    return this.request<Conversation>("POST", "/conversations", input);
  }

  async deleteConversation(id: string): Promise<void> {
    return this.request("DELETE", `/conversations/${id}`);
  }

  // ─── Messages ───────────────────────────────────────────────

  async listMessages(
    conversationId: string,
    params?: { limit?: number; before?: string }
  ): Promise<Message[]> {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set("limit", String(params.limit));
    if (params?.before) qs.set("before", params.before);
    const data = await this.request<{ items: Message[] }>(
      "GET",
      `/conversations/${conversationId}/messages?${qs}`
    );
    return data.items;
  }

  async sendMessage(input: SendMessageInput): Promise<Message> {
    const { conversationId, text, replyTo, encrypt: shouldEncrypt } = input;

    if (shouldEncrypt) {
      const conv = await this.getConversation(conversationId);
      const peers = conv.participants.filter((p) => p.userId !== this.userId && p.publicKey);

      if (peers.length > 0) {
        const myKeys = keyStore.getKeyPair(this.userId);
        if (!myKeys) {
          return this.request<Message>("POST", `/conversations/${conversationId}/messages`, {
            text,
            replyTo,
          });
        }

        const encryptedPerPeer = await Promise.all(
          peers.map(async (peer) => {
            const sharedSecret = await keyStore.getOrCreateSharedSecret(
              this.userId,
              conversationId,
              peer.publicKey!
            );
            return encryptMessage(text, sharedSecret);
          })
        );

        return this.request<Message>("POST", `/conversations/${conversationId}/messages`, {
          encryptedPayloads: encryptedPerPeer,
          replyTo,
          encrypted: true,
          senderPublicKey: myKeys.publicKey,
        });
      }
    }

    return this.request<Message>("POST", `/conversations/${conversationId}/messages`, {
      text,
      replyTo,
    });
  }

  async deleteMessage(conversationId: string, messageId: string): Promise<void> {
    return this.request(
      "DELETE",
      `/conversations/${conversationId}/messages/${messageId}`
    );
  }

  async markAsRead(conversationId: string): Promise<void> {
    return this.request("POST", `/conversations/${conversationId}/read`);
  }

  // ─── Real-time (WebSocket) ──────────────────────────────────

  connect(): void {
    if (this.wsConnected) return;

    const wsUrl =
      this.config.wsUrl ||
      this.config.apiUrl.replace(/^http/, "ws") + "/ws";

    try {
      this.ws = new WebSocket(wsUrl);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.wsConnected = true;
      this.startHeartbeat();
      if (this.headers["Authorization"]) {
        this.ws?.send(
          JSON.stringify({
            type: "auth",
            token: this.headers["Authorization"].replace("Bearer ", ""),
          })
        );
      }
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "pong") {
          if (this.pongTimer) {
            clearTimeout(this.pongTimer);
            this.pongTimer = null;
          }
          return;
        }
        this.handleWsMessage(data);
      } catch {
        // ignore malformed messages
      }
    };

    this.ws.onclose = () => {
      this.wsConnected = false;
      this.stopHeartbeat();
      this.ws = null;
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopHeartbeat();
    this.wsConnected = false;
    this.ws?.close();
    this.ws = null;
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.wsConnected) {
        this.ws?.send(JSON.stringify({ type: "ping" }));
        this.pongTimer = setTimeout(() => {
          this.ws?.close();
        }, 10000);
      }
    }, 30000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 5000);
  }

  private handleWsMessage(data: Record<string, unknown>): void {
    switch (data.type) {
      case "new_message": {
        const msg = data.message as Message;
        this.messageHandlers.forEach((h) => h(msg));
        break;
      }
      case "delivery": {
        const delivery = data.delivery as MessageDelivery;
        this.deliveryHandlers.forEach((h) => h(delivery));
        break;
      }
      case "typing":
      case "presence":
        this.statusHandlers.forEach((h) =>
          h(data as { type: string; conversationId: string })
        );
        break;
    }
  }

  // ─── Event Subscriptions ────────────────────────────────────

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDelivery(handler: DeliveryHandler): () => void {
    this.deliveryHandlers.add(handler);
    return () => this.deliveryHandlers.delete(handler);
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  // ─── Typing Indicators ──────────────────────────────────────

  sendTyping(conversationId: string): void {
    if (this.wsConnected) {
      this.ws?.send(
        JSON.stringify({ type: "typing", conversationId })
      );
    }
  }

  // ─── Key Management ─────────────────────────────────────────

  async registerKeys(userId: string): Promise<string> {
    this.userId = userId;
    const keyPair = await keyStore.registerIdentity(userId);
    await this.request("PUT", "/keys", {
      publicKey: keyPair.publicKey,
    });
    return keyPair.publicKey;
  }

  async fetchPublicKeys(userIds: string[]): Promise<Map<string, string>> {
    const data = await this.request<{ keys: { userId: string; publicKey: string }[] }>(
      "POST",
      "/keys/batch",
      { userIds }
    );
    const map = new Map<string, string>();
    for (const entry of data.keys) {
      map.set(entry.userId, entry.publicKey);
    }
    return map;
  }

  isConnected(): boolean {
    return this.wsConnected;
  }
}
