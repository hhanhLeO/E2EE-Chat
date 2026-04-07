/**
 * socket.test.ts
 *
 * Integration tests for the Socket.io server.
 * Spins up a real server on a random port and uses socket.io-client
 * to simulate two users interacting.
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { type Server as HttpServer } from 'http';
import { type Server as IOServer } from 'socket.io';
import { io as ioClient, type Socket as ClientSocket } from 'socket.io-client';
import { createApp } from '../server';

// ─── Test Setup ──────────────────────────────────────────────────────────────

let httpServer: HttpServer;
let io: IOServer;
let port: number;
const clients: ClientSocket[] = [];

/** Create a connected client socket. Tracked for automatic cleanup. */
function createClient(): Promise<ClientSocket> {
  return new Promise((resolve) => {
    const client = ioClient(`http://localhost:${port}`, {
      transports: ['websocket'],
      autoConnect: true,
    });
    clients.push(client);
    client.on('connect', () => resolve(client));
  });
}

/** Wait for a specific event on a socket, with a timeout. */
function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 2000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for event: ${event}`)),
      timeoutMs,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Assert that an event does NOT fire within a given window. */
function expectNoEvent(
  socket: ClientSocket,
  event: string,
  windowMs = 500,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, windowMs);
    const handler = () => {
      clearTimeout(timer);
      reject(new Error(`Unexpected event received: ${event}`));
    };
    socket.on(event, handler);
  });
}

const ROOM_ID = '550e8400-e29b-41d4-a716-446655440000';
const ROOM_ID_2 = '660e8400-e29b-41d4-a716-446655440000';

beforeAll(
  () =>
    new Promise<void>((resolve) => {
      const app = createApp();
      httpServer = app.httpServer;
      io = app.io;
      // Listen on port 0 → OS assigns a random available port
      httpServer.listen(0, () => {
        const addr = httpServer.address();
        port = typeof addr === 'object' && addr ? addr.port : 0;
        resolve();
      });
    }),
);

afterEach(() => {
  // Disconnect all clients created during the test
  for (const c of clients) {
    if (c.connected) c.disconnect();
  }
  clients.length = 0;
});

afterAll(() => {
  io.close();
  httpServer.close();
});

// ─── Health Endpoint ─────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('should return { ok: true }', async () => {
    const res = await fetch(`http://localhost:${port}/health`);
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });
});

// ─── Join & Validation ───────────────────────────────────────────────────────

describe('join room', () => {
  it('should allow joining a valid room', async () => {
    const client = await createClient();
    client.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });

    // No error should be received
    await expectNoEvent(client, 'error', 300);
  });

  it('should reject an invalid room ID', async () => {
    const client = await createClient();
    client.emit('join', { channelId: 'not-a-uuid', publicKey: 'pk-alice' });

    const err = await waitForEvent<{ code: string }>(client, 'error');
    expect(err.code).toBe('INVALID_ROOM_ID');
  });

  it('should reject a missing public key', async () => {
    const client = await createClient();
    client.emit('join', { channelId: ROOM_ID, publicKey: '' });

    const err = await waitForEvent<{ code: string }>(client, 'error');
    expect(err.code).toBe('INVALID_PUBLIC_KEY');
  });

  it('should reject a third participant (room full)', async () => {
    const alice = await createClient();
    const bob = await createClient();
    const charlie = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    // Small delay to ensure join is processed
    await new Promise((r) => setTimeout(r, 50));

    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    charlie.emit('join', { channelId: ROOM_ID, publicKey: 'pk-charlie' });

    const err = await waitForEvent<{ code: string }>(charlie, 'error');
    expect(err.code).toBe('ROOM_FULL');
  });

  it('should allow the same socket to re-join (duplicate join)', async () => {
    const client = await createClient();
    client.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));

    // Join again — should not error
    client.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await expectNoEvent(client, 'error', 300);
  });
});

// ─── Key Exchange ────────────────────────────────────────────────────────────

describe('key exchange', () => {
  it('should relay public key to the peer when joining', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));

    // When Bob joins, Alice should receive Bob's key
    const peerKeyPromise = waitForEvent<{
      channelId: string;
      publicKey: string;
    }>(alice, 'peer-key');

    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });

    const received = await peerKeyPromise;
    expect(received.channelId).toBe(ROOM_ID);
    expect(received.publicKey).toBe('pk-bob');
  });

  it('should relay peer-key response back to the other peer', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    // Bob sends peer-key response → Alice should receive it
    const peerKeyPromise = waitForEvent<{ publicKey: string }>(
      alice,
      'peer-key',
    );
    bob.emit('peer-key', { channelId: ROOM_ID, publicKey: 'pk-bob-v2' });

    const received = await peerKeyPromise;
    expect(received.publicKey).toBe('pk-bob-v2');
  });
});

// ─── Message Relay ───────────────────────────────────────────────────────────

describe('message relay', () => {
  it('should forward encrypted message to the peer', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    const payload = {
      id: 'msg-1',
      channelId: ROOM_ID,
      sender: 'pk-alice',
      ciphertext: 'encrypted-data',
      iv: 'random-iv',
      timestamp: Date.now(),
    };

    const msgPromise = waitForEvent<typeof payload>(bob, 'message');
    alice.emit('message', payload);

    const received = await msgPromise;
    expect(received.id).toBe('msg-1');
    expect(received.ciphertext).toBe('encrypted-data');
    expect(received.sender).toBe('pk-alice');
  });

  it('should not leak messages to sockets in different rooms', async () => {
    const alice = await createClient();
    const bob = await createClient();
    const charlie = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    charlie.emit('join', { channelId: ROOM_ID_2, publicKey: 'pk-charlie' });
    await new Promise((r) => setTimeout(r, 50));

    const payload = {
      id: 'msg-2',
      channelId: ROOM_ID,
      sender: 'pk-alice',
      ciphertext: 'secret',
      iv: 'iv',
      timestamp: Date.now(),
    };

    alice.emit('message', payload);

    // Charlie (different room) should NOT receive the message
    await expectNoEvent(charlie, 'message', 500);
  });
});

// ─── Delivery Acknowledgement ────────────────────────────────────────────────

describe('delivery acknowledgement', () => {
  it('should relay delivered event to the sender', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    const deliveredPromise = waitForEvent<{ id: string }>(alice, 'delivered');
    bob.emit('delivered', { id: 'msg-1', channelId: ROOM_ID });

    const received = await deliveredPromise;
    expect(received.id).toBe('msg-1');
  });
});

// ─── Typing Indicator ────────────────────────────────────────────────────────

describe('typing indicator', () => {
  it('should relay encrypted typing event to the peer', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    const typingPromise = waitForEvent<{ ciphertext: string; iv: string }>(
      alice,
      'typing',
    );
    bob.emit('typing', {
      channelId: ROOM_ID,
      ciphertext: 'enc-typing',
      iv: 'enc-iv',
    });

    const received = await typingPromise;
    expect(received.ciphertext).toBe('enc-typing');
    expect(received.iv).toBe('enc-iv');
  });
});

// ─── Peer Left ───────────────────────────────────────────────────────────────

describe('peer-left notification', () => {
  it('should notify peer when socket explicitly leaves', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    const peerLeftPromise = waitForEvent(alice, 'peer-left');
    bob.emit('leave', { channelId: ROOM_ID });

    await peerLeftPromise; // should resolve without timeout
  });

  it('should notify peer when socket disconnects (tab close)', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    const peerLeftPromise = waitForEvent(alice, 'peer-left');
    bob.disconnect();

    await peerLeftPromise; // should resolve — this was the original bug
  });

  it('should allow a new user to join after peer leaves', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    // Bob leaves
    bob.emit('leave', { channelId: ROOM_ID });
    await new Promise((r) => setTimeout(r, 100));

    // Charlie should be able to join (room is no longer full)
    const charlie = await createClient();
    charlie.emit('join', { channelId: ROOM_ID, publicKey: 'pk-charlie' });

    await expectNoEvent(charlie, 'error', 300);
  });

  it('should allow a new user to join after peer disconnects', async () => {
    const alice = await createClient();
    const bob = await createClient();

    alice.emit('join', { channelId: ROOM_ID, publicKey: 'pk-alice' });
    await new Promise((r) => setTimeout(r, 50));
    bob.emit('join', { channelId: ROOM_ID, publicKey: 'pk-bob' });
    await new Promise((r) => setTimeout(r, 50));

    // Bob disconnects abruptly
    bob.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    // Charlie should be able to join
    const charlie = await createClient();
    charlie.emit('join', { channelId: ROOM_ID, publicKey: 'pk-charlie' });

    await expectNoEvent(charlie, 'error', 300);
  });
});

// ─── Rate Limiting (Integration) ─────────────────────────────────────────────

describe('join rate limiting', () => {
  it('should reject the 6th join attempt within 60 seconds', async () => {
    const client = await createClient();

    // Join 5 different rooms (each is a unique room so capacity is never hit)
    for (let i = 0; i < 5; i++) {
      const roomId = crypto.randomUUID();
      client.emit('join', { channelId: roomId, publicKey: 'pk-test' });
      await new Promise((r) => setTimeout(r, 30));
    }

    // 6th attempt should be rate limited
    const roomId6 = crypto.randomUUID();
    client.emit('join', { channelId: roomId6, publicKey: 'pk-test' });

    const err = await waitForEvent<{ code: string }>(client, 'error');
    expect(err.code).toBe('JOIN_RATE_LIMITED');
  });
});
