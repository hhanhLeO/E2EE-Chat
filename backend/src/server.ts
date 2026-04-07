/**
 * server.ts
 *
 * Core server logic extracted into createApp() so it can be imported
 * by both index.ts (production entry) and tests without auto-listening.
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

// ─── Validation ──────────────────────────────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidRoomId(id: unknown): id is string {
  return typeof id === 'string' && UUID_RE.test(id);
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

export const JOIN_LIMIT: RateLimitConfig = { max: 5, windowMs: 60_000 };
export const MSG_LIMIT: RateLimitConfig = { max: 60, windowMs: 60_000 };

export function checkRate(
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

export function clearRates(socketId: string): void {
  joinTimestamps.delete(socketId);
  msgTimestamps.delete(socketId);
}

// socketId → timestamps[]
const joinTimestamps = new Map<string, number[]>();
const msgTimestamps = new Map<string, number[]>();

export const ROOM_CAPACITY = 2;

// ─── Server Factory ──────────────────────────────────────────────────────────

export function createApp() {
  const app = express();
  app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? '*' }));

  app.get('/health', (_req, res) => res.json({ ok: true }));

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_ORIGIN ?? '*' },
    maxHttpBufferSize: 64 * 1024,
  });

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

  io.on('connection', (socket: Socket) => {
    // ── Join room ──────────────────────────────────────────────────────────
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

      // Announce public key to peer already in the room (if any)
      socket.to(channelId).emit('peer-key', { channelId, publicKey });
    });

    // ── Peer key response ────────────────────────────────────────────────
    socket.on('peer-key', ({ channelId, publicKey }: PeerKeyPayload) => {
      if (!channelId || !publicKey) return;
      if (getSocketRoom(socket) !== channelId) return;

      socket.to(channelId).emit('peer-key', { channelId, publicKey });
    });

    // ── Encrypted message relay ──────────────────────────────────────────
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
    });

    // ── Delivery acknowledgement ─────────────────────────────────────────
    socket.on(
      'delivered',
      ({ id, channelId }: { id: string; channelId: string }) => {
        if (getSocketRoom(socket) !== channelId) return;
        socket.to(channelId).emit('delivered', { id });
      },
    );

    // ── Encrypted typing indicator ───────────────────────────────────────
    socket.on('typing', ({ channelId, ciphertext, iv }: TypingPayload) => {
      if (!channelId) return;
      if (getSocketRoom(socket) !== channelId) return;
      socket.to(channelId).emit('typing', { ciphertext, iv });
    });

    // ── Leave room ───────────────────────────────────────────────────────
    socket.on('leave', ({ channelId }: { channelId: string }) => {
      socket.leave(channelId);
      io.to(channelId).emit('peer-left');
      clearRates(socket.id);
    });

    // ── Disconnect ───────────────────────────────────────────────────────
    socket.on('disconnect', () => {
      clearRates(socket.id);
    });
  });

  // ── Notify peer on any room departure (disconnect or explicit leave) ───
  io.sockets.adapter.on('leave-room', (roomId: string, socketId: string) => {
    if (roomId === socketId) return;
    io.to(roomId).emit('peer-left');
  });

  return { app, httpServer, io };
}
