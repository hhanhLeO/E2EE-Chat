export interface Room {
  channelId: string;
  createdAt: number;
  lastActivity: number;
}

export interface EncryptedPayload {
  id: string;
  channelId: string;
  sender: string;
  ciphertext: string;
  iv: string;
  timestamp: number;
}

export interface JoinPayload {
  channelId: string;
  publicKey: string;
}

export interface PeerKeyPayload {
  channelId: string;
  publicKey: string;
}

export interface TypingPayload {
  channelId: string;
  ciphertext: string;
  iv: string;
}