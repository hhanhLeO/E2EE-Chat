// ─── Domain Types ─────────────────────────────────────────────────────────────

export interface Identity {
  publicKey: CryptoKey;
  privateKey: CryptoKey;
  publicKeyRaw: string; // base64url exported ECDH public key
}

export interface Channel {
  channelId: string;
  peerPublicKeyRaw: string; // base64url
  sharedKey: CryptoKey;
  createdAt: number;
}

export interface Message {
  id: string;
  channelId: string;
  sender: 'me' | 'peer';
  content: string;       // plaintext (decrypted)
  timestamp: number;
  status: 'sending' | 'sent' | 'delivered' | 'failed';
}

// ─── Socket Payloads ──────────────────────────────────────────────────────────

export interface EncryptedPayload {
  id: string;
  channelId: string;
  sender: string;        // publicKeyRaw of sender
  ciphertext: string;    // base64
  iv: string;            // base64
  timestamp: number;
}

export interface JoinPayload {
  channelId: string;
  publicKey: string;     // base64url
}

export interface PeerKeyPayload {
  channelId: string;
  publicKey: string;
}

export interface TypingPayload {
  channelId: string;
  ciphertext: string;    // encrypted boolean
  iv: string;
}

// ─── UI State ─────────────────────────────────────────────────────────────────

export type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error';

export type PeerState = 'waiting' | 'online' | 'offline';

export interface RoomState {
  channelId: string;
  messages: Message[];
  peerState: PeerState;
  peerFingerprint: string | null;
  isTyping: boolean;
  connectionState: ConnectionState;
}