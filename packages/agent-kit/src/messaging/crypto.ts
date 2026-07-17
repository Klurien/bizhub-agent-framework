import type { KeyPair, EncryptedPayload, IKeyStoreAdapter } from "./types.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlEncode(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function base64UrlDecode(str: string): Uint8Array {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  sharedSecret: ArrayBuffer,
  salt: Uint8Array
): Promise<CryptoKey> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    { name: "HKDF" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: salt.buffer as ArrayBuffer,
      info: encoder.encode("bizhub-e2e-messaging-v1"),
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function generateKeyPair(): Promise<KeyPair> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "X25519" },
    true,
    ["deriveBits", "deriveKey"]
  ) as CryptoKeyPair;

  const [pubKey, privKey] = await Promise.all([
    crypto.subtle.exportKey("raw", keyPair.publicKey),
    crypto.subtle.exportKey("raw", keyPair.privateKey),
  ]);

  return {
    publicKey: base64UrlEncode(pubKey as ArrayBuffer),
    secretKey: base64UrlEncode(privKey as ArrayBuffer),
  };
}

export async function importPublicKey(publicKeyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64UrlDecode(publicKeyBase64) as BufferSource,
    { name: "X25519" },
    true,
    []
  );
}

async function importPrivateKey(privateKeyBase64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    base64UrlDecode(privateKeyBase64) as BufferSource,
    { name: "X25519" },
    true,
    ["deriveBits"]
  );
}

export async function computeSharedSecret(
  myPrivateKey: string,
  theirPublicKey: string
): Promise<ArrayBuffer> {
  const privateKey = await importPrivateKey(myPrivateKey);
  const publicKey = await importPublicKey(theirPublicKey);

  return crypto.subtle.deriveBits(
    { name: "X25519", public: publicKey },
    privateKey,
    256
  );
}

export async function encryptMessage(
  plaintext: string,
  sharedSecret: ArrayBuffer
): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(32));
  const key = await deriveKey(sharedSecret, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: encoder.encode("bizhub-msg"),
    },
    key,
    encoded as BufferSource
  );

  return {
    ciphertext: base64UrlEncode(ciphertext as ArrayBuffer),
    nonce: base64UrlEncode(iv.buffer as ArrayBuffer),
    salt: base64UrlEncode(salt.buffer as ArrayBuffer),
  };
}

export async function decryptMessage(
  payload: EncryptedPayload,
  sharedSecret: ArrayBuffer
): Promise<string> {
  if (!payload.salt) {
    throw new Error("Missing salt in encrypted payload");
  }
  const salt = base64UrlDecode(payload.salt);
  const iv = base64UrlDecode(payload.nonce);
  const ciphertext = base64UrlDecode(payload.ciphertext);

  const key = await deriveKey(sharedSecret, salt);

  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: encoder.encode("bizhub-msg"),
    },
    key,
    ciphertext as BufferSource
  );

  return decoder.decode(decrypted);
}

export async function encryptForMultipleRecipients(
  plaintext: string,
  myPrivateKey: string,
  recipientPublicKeys: string[]
): Promise<{
  ciphertext: string;
  nonce: string;
  encryptedKeys: { publicKey: string; encryptedKey: string }[];
}> {
  const encryptionKey = crypto.getRandomValues(new Uint8Array(32));
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encryptionKey as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"]
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = encoder.encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv as BufferSource,
      additionalData: encoder.encode("bizhub-group-msg"),
    },
    cryptoKey,
    encoded as BufferSource
  );

  const encryptedKeys = await Promise.all(
    recipientPublicKeys.map(async (pubKey) => {
      const sharedSecret = await computeSharedSecret(myPrivateKey, pubKey);
      const salt = crypto.getRandomValues(new Uint8Array(32));
      const wrapKey = await deriveKey(sharedSecret, salt);
      const wrapIv = crypto.getRandomValues(new Uint8Array(12));
      const wrappedKey = await crypto.subtle.wrapKey(
        "raw",
        cryptoKey,
        wrapKey,
        { name: "AES-GCM", iv: wrapIv as BufferSource }
      );
      return {
        publicKey: pubKey,
        encryptedKey: base64UrlEncode(wrappedKey as ArrayBuffer),
      };
    })
  );

  return {
    ciphertext: base64UrlEncode(ciphertext as ArrayBuffer),
    nonce: base64UrlEncode(iv.buffer as ArrayBuffer),
    encryptedKeys,
  };
}

type KeyStoreEntry = {
  keyPair: KeyPair;
  conversations: Map<string, ArrayBuffer>;
  loaded: boolean;
};

class KeyStore {
  private store = new Map<string, KeyStoreEntry>();
  private adapter: IKeyStoreAdapter | null = null;

  setAdapter(adapter: IKeyStoreAdapter): void {
    this.adapter = adapter;
  }

  async registerIdentity(userId: string): Promise<KeyPair> {
    const existing = this.store.get(userId);
    if (existing?.loaded && existing.keyPair) return existing.keyPair;

    if (this.adapter) {
      const stored = await this.adapter.loadIdentity(userId);
      if (stored) {
        this.store.set(userId, {
          keyPair: stored,
          conversations: new Map(),
          loaded: true,
        });
        return stored;
      }
    }

    const keyPair = await generateKeyPair();
    this.store.set(userId, {
      keyPair,
      conversations: new Map(),
      loaded: true,
    });

    if (this.adapter) {
      await this.adapter.saveIdentity(userId, keyPair);
    }

    return keyPair;
  }

  getKeyPair(userId: string): KeyPair | undefined {
    return this.store.get(userId)?.keyPair;
  }

  async getOrCreateSharedSecret(
    userId: string,
    conversationId: string,
    peerPublicKey: string
  ): Promise<ArrayBuffer> {
    const entry = this.store.get(userId);
    if (!entry) throw new Error(`Identity not found for user: ${userId}`);

    const existing = entry.conversations.get(conversationId);
    if (existing) return existing;

    if (this.adapter) {
      const stored = await this.adapter.loadConversationKey(userId, conversationId);
      if (stored) {
        entry.conversations.set(conversationId, stored);
        return stored;
      }
    }

    const sharedSecret = await computeSharedSecret(
      entry.keyPair.secretKey,
      peerPublicKey
    );
    entry.conversations.set(conversationId, sharedSecret);

    if (this.adapter) {
      await this.adapter.saveConversationKey(userId, conversationId, sharedSecret);
    }

    return sharedSecret;
  }

  clearConversationKey(userId: string, conversationId: string): void {
    this.store.get(userId)?.conversations.delete(conversationId);
    this.adapter?.removeConversationKey(userId, conversationId);
  }
}

export const keyStore = new KeyStore();
