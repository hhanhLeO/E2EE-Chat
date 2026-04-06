/**
 * index.ts (Version 2 — minimised relay)
 *
 * The server is a "dumb pipe": it stores nothing (no room registry, no
 * message history, no user accounts). Room IDs are generated client-side
 * (crypto.randomUUID) and the server only uses Socket.io's built-in
 * adapter to track live room membership.
 *
 * Security measures:
 *   - Room ID must be valid UUIDv4 format (122-bit entropy).
 *   - Join rate limit: max 5 join attempts per socket per 60 seconds.
 *   - Message rate limit: max 60 messages per socket per 60 seconds.
 *   - Room capacity: 2 sockets max (checked via adapter).
 *   - Payload size cap: 64 KB (Socket.io maxHttpBufferSize).
 *   - No data ever written to disk or database.
 */

import express from 'express';
import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';
import cors from 'cors';
import type {
  EncryptedPayload,
  JoinPayload,
  PeerKeyPayload,
  TypingPayload,
} from './types';

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const ROOM_CAPACITY = 2;

// ─── Validation ──────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidRoomId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

interface RateLimitConfig {
  max: number;
  windowMs: number;
}

const JOIN_LIMIT: RateLimitConfig = { max: 5, windowMs: 60_000 };
const MSG_LIMIT: RateLimitConfig = { max: 60, windowMs: 60_000 };

// socketId → timestamps[]
const joinTimestamps = new Map<string, number[]>();
const msgTimestamps = new Map<string, number[]>();

function checkRate(
  map: Map<string, number[]>,
  socketId: string,
  config: RateLimitConfig,
): boolean {
  const now = Date.now();
  const cutoff = now - config.windowMs;
  const recent = (map.get(socketId) ?? []).filter((t) => t > cutoff);
  if (recent.length >= config.max) return false;
  recent.push(now);
  map.set(socketId, recent);
  return true;
}

function clearRates(socketId: string): void {
  joinTimestamps.delete(socketId);
  msgTimestamps.delete(socketId);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Returns the number of sockets currently in a room (via adapter). */
function roomSize(roomId: string): number {
  return io.sockets.adapter.rooms.get(roomId)?.size ?? 0;
}

/**
 * Returns the channel room this socket has joined (if any).
 * socket.rooms always contains socket.id itself; we find the first
 * entry that is NOT the socket id.
 */
function getSocketRoom(socket: Socket): string | undefined {
  for (const room of socket.rooms) {
    if (room !== socket.id) return room;
  }
  return undefined;
}

// ─── Express (health check only) ─────────────────────────────────────────────

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? '*' }));

app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Socket.io ───────────────────────────────────────────────────────────────

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_ORIGIN ?? '*' },
  maxHttpBufferSize: 64 * 1024, // 64 KB payload cap
});

io.on('connection', (socket: Socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── Join room ────────────────────────────────────────────────────────────
  socket.on('join', ({ channelId, publicKey }: JoinPayload) => {
    if (!isValidRoomId(channelId)) {
      socket.emit('error', {
        code: 'INVALID_ROOM_ID',
        message: 'Room ID must be a valid UUIDv4.',
      });
      return;
    }
    if (!publicKey || typeof publicKey !== 'string') {
      socket.emit('error', {
        code: 'INVALID_PUBLIC_KEY',
        message: 'Missing public key.',
      });
      return;
    }

    // Already in this room (reconnect / duplicate join) — re-announce key
    if (socket.rooms.has(channelId)) {
      socket.to(channelId).emit('peer-key', { channelId, publicKey });
      return;
    }

    // Join rate limit
    if (!checkRate(joinTimestamps, socket.id, JOIN_LIMIT)) {
      socket.emit('error', {
        code: 'JOIN_RATE_LIMITED',
        message: 'Too many join attempts. Try again later.',
      });
      return;
    }

    // Capacity check via adapter
    if (roomSize(channelId) >= ROOM_CAPACITY) {
      socket.emit('error', {
        code: 'ROOM_FULL',
        message: `Room already has ${ROOM_CAPACITY} participants.`,
      });
      return;
    }

    socket.join(channelId);

    const occupancy = roomSize(channelId);
    console.log(
      `[join] ${socket.id} → room ${channelId} (occupancy: ${occupancy}/${ROOM_CAPACITY})`,
    );

    // Announce public key to peer already in the room (if any)
    socket.to(channelId).emit('peer-key', { channelId, publicKey });
  });

  // ── Peer key response ──────────────────────────────────────────────────
  socket.on('peer-key', ({ channelId, publicKey }: PeerKeyPayload) => {
    if (!channelId || !publicKey) return;
    if (getSocketRoom(socket) !== channelId) return;

    socket.to(channelId).emit('peer-key', { channelId, publicKey });
  });

  // ── Encrypted message relay ────────────────────────────────────────────
  socket.on('message', (payload: EncryptedPayload) => {
    const { channelId } = payload;
    if (!channelId) return;
    if (getSocketRoom(socket) !== channelId) return;

    if (!checkRate(msgTimestamps, socket.id, MSG_LIMIT)) {
      socket.emit('error', {
        code: 'FLOOD_LIMIT',
        message: 'Sending too fast.',
      });
      return;
    }

    socket.to(channelId).emit('message', payload);
    console.log(
      `[msg] ${socket.id} → ${channelId} (${payload.ciphertext.length}b)`,
    );
  });

  // ── Delivery acknowledgement ───────────────────────────────────────────
  socket.on(
    'delivered',
    ({ id, channelId }: { id: string; channelId: string }) => {
      if (getSocketRoom(socket) !== channelId) return;
      socket.to(channelId).emit('delivered', { id });
    },
  );

  // ── Encrypted typing indicator ─────────────────────────────────────────
  socket.on('typing', ({ channelId, ciphertext, iv }: TypingPayload) => {
    if (!channelId) return;
    if (getSocketRoom(socket) !== channelId) return;
    socket.to(channelId).emit('typing', { ciphertext, iv });
  });

  // ── Leave room ─────────────────────────────────────────────────────────
  socket.on('leave', ({ channelId }: { channelId: string }) => {
    socket.leave(channelId);
    // socket has left, so use io.to() to reach remaining peer
    io.to(channelId).emit('peer-left');
    clearRates(socket.id);
    console.log(`[leave] ${socket.id} left room ${channelId}`);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────
  // Cleanup rate-limit entries. Peer notification is handled by the
  // adapter 'leave-room' event below (socket.rooms is already empty here).
  socket.on('disconnect', () => {
    clearRates(socket.id);
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });
});

// ── Notify peer on any room departure (disconnect or explicit leave) ─────
// When a socket leaves a room for ANY reason (disconnect, explicit leave),
// the adapter emits 'leave-room'.  We use this to reliably notify the
// remaining peer, avoiding the socket.to() bug where socket.rooms is
// already empty during the 'disconnect' event.
io.sockets.adapter.on('leave-room', (roomId: string, socketId: string) => {
  // Ignore the default room (every socket auto-joins a room named after
  // its own id — we only care about channel rooms).
  if (roomId === socketId) return;
  io.to(roomId).emit('peer-left');
});

// ─── Start ───────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`✓ CipherChat v2 server listening on port ${PORT}`);
});
