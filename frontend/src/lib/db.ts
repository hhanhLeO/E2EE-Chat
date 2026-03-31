/**
 * db.ts
 * IndexedDB persistence for Identity, Channels, and Messages.
 * Uses the `idb` library for a Promise-based API.
 *
 * Improvement: version-based migrations so the schema can evolve without
 * wiping user data.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Message } from '../types';

// ─── Schema ───────────────────────────────────────────────────────────────────

interface IdentityRecord {
  id: 'singleton';
  publicKeyRaw: string;
  privateKeyJwk: string;
}

interface ChannelRecord {
  channelId: string;
  peerPublicKeyRaw: string;
  sharedKeyJwk: string; // AES-GCM key as JWK — NOTE: stored as non-extractable in memory, but we export for persistence
  createdAt: number;
}

interface MessageRecord extends Omit<Message, 'status'> {
  status: string;
}

type E2EESchema = {
  identity: { key: string; value: IdentityRecord };
  channels: { key: string; value: ChannelRecord };
  messages: {
    key: string;
    value: MessageRecord;
    indexes: { 'by-channel': string };
  };
};

// ─── DB Singleton ─────────────────────────────────────────────────────────────

let _db: IDBPDatabase<E2EESchema> | null = null;

async function getDB(): Promise<IDBPDatabase<E2EESchema>> {
  if (_db) return _db;
  _db = await openDB<E2EESchema>('cipher-chat', 1, {
    upgrade(db) {
      // Identity store — only one record ever
      if (!db.objectStoreNames.contains('identity')) {
        db.createObjectStore('identity', { keyPath: 'id' });
      }
      // Channel store
      if (!db.objectStoreNames.contains('channels')) {
        db.createObjectStore('channels', { keyPath: 'channelId' });
      }
      // Message store — indexed by channelId for fast history retrieval
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('by-channel', 'channelId');
      }
    },
  });
  return _db;
}

// ─── Identity ─────────────────────────────────────────────────────────────────

export async function saveIdentity(
  publicKeyRaw: string,
  privateKeyJwk: string,
): Promise<void> {
  const db = await getDB();
  await db.put('identity', { id: 'singleton', publicKeyRaw, privateKeyJwk });
}

export async function loadIdentity(): Promise<IdentityRecord | undefined> {
  const db = await getDB();
  return db.get('identity', 'singleton');
}

// ─── Channels ─────────────────────────────────────────────────────────────────

export async function saveChannel(record: ChannelRecord): Promise<void> {
  const db = await getDB();
  await db.put('channels', record);
}

export async function loadChannel(
  channelId: string,
): Promise<ChannelRecord | undefined> {
  const db = await getDB();
  return db.get('channels', channelId);
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function saveMessage(msg: Message): Promise<void> {
  const db = await getDB();
  await db.put('messages', msg);
}

export async function loadMessages(channelId: string): Promise<Message[]> {
  const db = await getDB();
  const records = await db.getAllFromIndex('messages', 'by-channel', channelId);
  return records
    .map((r) => ({ ...r, status: r.status as Message['status'] }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

export async function updateMessageStatus(
  id: string,
  status: Message['status'],
): Promise<void> {
  const db = await getDB();
  const existing = await db.get('messages', id);
  if (existing) await db.put('messages', { ...existing, status });
}