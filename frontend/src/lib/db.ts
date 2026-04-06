/**
 * db.ts
 * IndexedDB persistence for Identity, Channels, and Messages.
 * Uses the `idb` library for a Promise-based API.
 *
 * v2: Added `nickname` field to channels + helper functions for
 *     channel listing, renaming, and deletion.
 */

import { openDB, type IDBPDatabase } from 'idb';
import type { Message } from '../types';

// ─── Schema ───────────────────────────────────────────────────────────────────

interface IdentityRecord {
  id: 'singleton';
  publicKeyRaw: string;
  privateKeyJwk: string;
}

export interface ChannelRecord {
  channelId: string;
  peerPublicKeyRaw: string;
  sharedKeyJwk: string;
  createdAt: number;
  nickname: string; // user-assigned label, defaults to ''
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

/** Load all saved channels, sorted by most recently created first. */
export async function loadAllChannels(): Promise<ChannelRecord[]> {
  const db = await getDB();
  const all = await db.getAll('channels');
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

/** Update only the nickname of an existing channel. */
export async function updateChannelNickname(
  channelId: string,
  nickname: string,
): Promise<void> {
  const db = await getDB();
  const existing = await db.get('channels', channelId);
  if (existing) {
    await db.put('channels', { ...existing, nickname });
  }
}

/** Delete a channel record and all its messages from IndexedDB. */
export async function deleteChannel(channelId: string): Promise<void> {
  const db = await getDB();
  // Delete all messages for this channel
  const msgKeys = await db.getAllKeysFromIndex(
    'messages',
    'by-channel',
    channelId,
  );
  const tx = db.transaction(['channels', 'messages'], 'readwrite');
  for (const key of msgKeys) {
    tx.objectStore('messages').delete(key);
  }
  tx.objectStore('channels').delete(channelId);
  await tx.done;
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

/** Load the most recent message for a given channel (for preview). */
export async function loadLastMessage(
  channelId: string,
): Promise<Message | undefined> {
  const db = await getDB();
  const records = await db.getAllFromIndex('messages', 'by-channel', channelId);
  if (records.length === 0) return undefined;
  records.sort((a, b) => b.timestamp - a.timestamp);
  const r = records[0];
  return { ...r, status: r.status as Message['status'] };
}
