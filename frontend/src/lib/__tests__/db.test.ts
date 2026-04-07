/**
 * db.test.ts
 *
 * Unit tests for IndexedDB persistence layer.
 * Uses fake-indexeddb to provide a real IndexedDB implementation in Node.js.
 *
 * Each test gets a fresh database by clearing stores in beforeEach, ensuring
 * complete isolation between tests.
 */

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveIdentity,
  loadIdentity,
  saveChannel,
  loadChannel,
  loadAllChannels,
  updateChannelNickname,
  deleteChannel,
  saveMessage,
  loadMessages,
  updateMessageStatus,
  loadLastMessage,
  resetDB,
  type ChannelRecord,
} from '../db';
import type { Message } from '../../types';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeChannel(overrides: Partial<ChannelRecord> = {}): ChannelRecord {
  return {
    channelId: crypto.randomUUID(),
    peerPublicKeyRaw: 'test-peer-pubkey-' + Math.random(),
    sharedKeyJwk: '',
    createdAt: Date.now(),
    nickname: '',
    ...overrides,
  };
}

function makeMessage(
  channelId: string,
  overrides: Partial<Message> = {},
): Message {
  return {
    id: crypto.randomUUID(),
    channelId,
    sender: 'me',
    content: 'Hello',
    timestamp: Date.now(),
    status: 'sent',
    ...overrides,
  };
}

// ─── Reset DB between tests ─────────────────────────────────────────────────

beforeEach(async () => {
  // Close the cached connection so deleteDatabase can proceed
  await resetDB();
  // Wipe all databases for full test isolation
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name) indexedDB.deleteDatabase(db.name);
  }
});

// ─── Identity ────────────────────────────────────────────────────────────────

describe('Identity (saveIdentity / loadIdentity)', () => {
  it('should return undefined when no identity is saved', async () => {
    const result = await loadIdentity();
    expect(result).toBeUndefined();
  });

  it('should save and load an identity', async () => {
    await saveIdentity('pub-key-abc', 'priv-jwk-123');
    const loaded = await loadIdentity();

    expect(loaded).toBeDefined();
    expect(loaded!.publicKeyRaw).toBe('pub-key-abc');
    expect(loaded!.privateKeyJwk).toBe('priv-jwk-123');
  });

  it('should overwrite existing identity (singleton)', async () => {
    await saveIdentity('pub-1', 'priv-1');
    await saveIdentity('pub-2', 'priv-2');

    const loaded = await loadIdentity();
    expect(loaded!.publicKeyRaw).toBe('pub-2');
    expect(loaded!.privateKeyJwk).toBe('priv-2');
  });
});

// ─── Channels ────────────────────────────────────────────────────────────────

describe('Channels (saveChannel / loadChannel)', () => {
  it('should return undefined for a non-existent channel', async () => {
    const result = await loadChannel('non-existent-id');
    expect(result).toBeUndefined();
  });

  it('should save and load a channel', async () => {
    const ch = makeChannel({ channelId: 'room-1', nickname: 'Alice' });
    await saveChannel(ch);

    const loaded = await loadChannel('room-1');
    expect(loaded).toBeDefined();
    expect(loaded!.channelId).toBe('room-1');
    expect(loaded!.nickname).toBe('Alice');
    expect(loaded!.peerPublicKeyRaw).toBe(ch.peerPublicKeyRaw);
  });

  it('should overwrite an existing channel with the same id', async () => {
    await saveChannel(makeChannel({ channelId: 'room-1', nickname: 'Old' }));
    await saveChannel(makeChannel({ channelId: 'room-1', nickname: 'New' }));

    const loaded = await loadChannel('room-1');
    expect(loaded!.nickname).toBe('New');
  });
});

describe('loadAllChannels', () => {
  it('should return empty array when no channels exist', async () => {
    const all = await loadAllChannels();
    expect(all).toEqual([]);
  });

  it('should return all channels sorted by createdAt descending', async () => {
    const ch1 = makeChannel({ channelId: 'a', createdAt: 1000 });
    const ch2 = makeChannel({ channelId: 'b', createdAt: 3000 });
    const ch3 = makeChannel({ channelId: 'c', createdAt: 2000 });

    await saveChannel(ch1);
    await saveChannel(ch2);
    await saveChannel(ch3);

    const all = await loadAllChannels();
    expect(all).toHaveLength(3);
    expect(all[0].channelId).toBe('b'); // newest first
    expect(all[1].channelId).toBe('c');
    expect(all[2].channelId).toBe('a'); // oldest last
  });
});

describe('updateChannelNickname', () => {
  it('should update the nickname of an existing channel', async () => {
    await saveChannel(makeChannel({ channelId: 'room-1', nickname: '' }));
    await updateChannelNickname('room-1', 'My Chat');

    const loaded = await loadChannel('room-1');
    expect(loaded!.nickname).toBe('My Chat');
  });

  it('should preserve other fields when updating nickname', async () => {
    const ch = makeChannel({
      channelId: 'room-1',
      peerPublicKeyRaw: 'peer-key-xyz',
      createdAt: 12345,
      nickname: 'Old',
    });
    await saveChannel(ch);
    await updateChannelNickname('room-1', 'New');

    const loaded = await loadChannel('room-1');
    expect(loaded!.nickname).toBe('New');
    expect(loaded!.peerPublicKeyRaw).toBe('peer-key-xyz');
    expect(loaded!.createdAt).toBe(12345);
  });

  it('should do nothing for a non-existent channel', async () => {
    // Should not throw
    await updateChannelNickname('non-existent', 'test');
    const loaded = await loadChannel('non-existent');
    expect(loaded).toBeUndefined();
  });
});

// ─── Messages ────────────────────────────────────────────────────────────────

describe('Messages (saveMessage / loadMessages)', () => {
  it('should return empty array for a channel with no messages', async () => {
    const msgs = await loadMessages('empty-room');
    expect(msgs).toEqual([]);
  });

  it('should save and load messages for a channel', async () => {
    const msg = makeMessage('room-1', { content: 'Hello!' });
    await saveMessage(msg);

    const loaded = await loadMessages('room-1');
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe('Hello!');
    expect(loaded[0].channelId).toBe('room-1');
  });

  it('should only load messages belonging to the specified channel', async () => {
    await saveMessage(makeMessage('room-1', { content: 'A' }));
    await saveMessage(makeMessage('room-2', { content: 'B' }));
    await saveMessage(makeMessage('room-1', { content: 'C' }));

    const room1Msgs = await loadMessages('room-1');
    const room2Msgs = await loadMessages('room-2');

    expect(room1Msgs).toHaveLength(2);
    expect(room2Msgs).toHaveLength(1);
    expect(room2Msgs[0].content).toBe('B');
  });

  it('should return messages sorted by timestamp ascending', async () => {
    await saveMessage(
      makeMessage('room-1', { content: 'Third', timestamp: 3000 }),
    );
    await saveMessage(
      makeMessage('room-1', { content: 'First', timestamp: 1000 }),
    );
    await saveMessage(
      makeMessage('room-1', { content: 'Second', timestamp: 2000 }),
    );

    const msgs = await loadMessages('room-1');
    expect(msgs[0].content).toBe('First');
    expect(msgs[1].content).toBe('Second');
    expect(msgs[2].content).toBe('Third');
  });

  it('should preserve message status correctly', async () => {
    await saveMessage(makeMessage('room-1', { status: 'sending' }));
    await saveMessage(makeMessage('room-1', { status: 'delivered' }));
    await saveMessage(makeMessage('room-1', { status: 'failed' }));

    const msgs = await loadMessages('room-1');
    const statuses = msgs.map((m) => m.status);
    expect(statuses).toContain('sending');
    expect(statuses).toContain('delivered');
    expect(statuses).toContain('failed');
  });
});

describe('updateMessageStatus', () => {
  it('should update the status of an existing message', async () => {
    const msg = makeMessage('room-1', { status: 'sending' });
    await saveMessage(msg);

    await updateMessageStatus(msg.id, 'delivered');

    const msgs = await loadMessages('room-1');
    expect(msgs[0].status).toBe('delivered');
  });

  it('should preserve other fields when updating status', async () => {
    const msg = makeMessage('room-1', {
      content: 'keep this',
      sender: 'peer',
      status: 'sent',
    });
    await saveMessage(msg);

    await updateMessageStatus(msg.id, 'delivered');

    const msgs = await loadMessages('room-1');
    expect(msgs[0].content).toBe('keep this');
    expect(msgs[0].sender).toBe('peer');
    expect(msgs[0].status).toBe('delivered');
  });

  it('should do nothing for a non-existent message id', async () => {
    // Should not throw
    await updateMessageStatus('non-existent-id', 'delivered');
  });
});

describe('loadLastMessage', () => {
  it('should return undefined when no messages exist', async () => {
    const result = await loadLastMessage('empty-room');
    expect(result).toBeUndefined();
  });

  it('should return the most recent message by timestamp', async () => {
    await saveMessage(
      makeMessage('room-1', { content: 'Old', timestamp: 1000 }),
    );
    await saveMessage(
      makeMessage('room-1', { content: 'Newest', timestamp: 3000 }),
    );
    await saveMessage(
      makeMessage('room-1', { content: 'Middle', timestamp: 2000 }),
    );

    const last = await loadLastMessage('room-1');
    expect(last).toBeDefined();
    expect(last!.content).toBe('Newest');
    expect(last!.timestamp).toBe(3000);
  });

  it('should only consider messages from the specified channel', async () => {
    await saveMessage(
      makeMessage('room-1', { content: 'Room 1', timestamp: 1000 }),
    );
    await saveMessage(
      makeMessage('room-2', { content: 'Room 2', timestamp: 2000 }),
    );

    const last = await loadLastMessage('room-1');
    expect(last!.content).toBe('Room 1');
  });
});

// ─── Channel Deletion ────────────────────────────────────────────────────────

describe('deleteChannel', () => {
  it('should delete a channel and all its messages', async () => {
    const ch = makeChannel({ channelId: 'room-delete' });
    await saveChannel(ch);
    await saveMessage(makeMessage('room-delete', { content: 'msg 1' }));
    await saveMessage(makeMessage('room-delete', { content: 'msg 2' }));
    await saveMessage(makeMessage('room-delete', { content: 'msg 3' }));

    // Verify data exists
    expect(await loadChannel('room-delete')).toBeDefined();
    expect(await loadMessages('room-delete')).toHaveLength(3);

    // Delete
    await deleteChannel('room-delete');

    // Verify everything is gone
    expect(await loadChannel('room-delete')).toBeUndefined();
    expect(await loadMessages('room-delete')).toHaveLength(0);
  });

  it('should not affect other channels or their messages', async () => {
    await saveChannel(makeChannel({ channelId: 'keep' }));
    await saveChannel(makeChannel({ channelId: 'remove' }));
    await saveMessage(makeMessage('keep', { content: 'survivor' }));
    await saveMessage(makeMessage('remove', { content: 'doomed' }));

    await deleteChannel('remove');

    // 'keep' channel and messages should be untouched
    expect(await loadChannel('keep')).toBeDefined();
    const keepMsgs = await loadMessages('keep');
    expect(keepMsgs).toHaveLength(1);
    expect(keepMsgs[0].content).toBe('survivor');

    // 'remove' channel should be gone
    expect(await loadChannel('remove')).toBeUndefined();
    expect(await loadMessages('remove')).toHaveLength(0);
  });

  it('should handle deleting a channel with no messages', async () => {
    await saveChannel(makeChannel({ channelId: 'empty-room' }));
    await deleteChannel('empty-room');
    expect(await loadChannel('empty-room')).toBeUndefined();
  });

  it('should handle deleting a non-existent channel without error', async () => {
    // Should not throw
    await deleteChannel('does-not-exist');
  });
});
