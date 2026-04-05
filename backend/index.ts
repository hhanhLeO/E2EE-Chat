/**
 * index.ts (Version 1 — fixed)
 *
 * Critical bug fixed: Person B (invitee) always got ROOM_FULL / ROOM_NOT_FOUND
 * and was rejected. Person A briefly showed "Connected" then "Offline".
 *
 * Root cause: two guards in the join handler both relied on the rooms/roomSockets
 * Maps being pre-populated by POST /api/rooms:
 *
 *   1. roomExists(channelId) → false for person B (they never called POST /api/rooms)
 *      → emitted ROOM_NOT_FOUND → socket disconnected → A saw peer-left
 *
 *   2. tryAddSocket() → roomSockets had no entry → returned false
 *      → emitted ROOM_FULL (same observable effect)
 *
 * Fix (in roomManager.ts):
 *   - ensureRoom() lazily creates both Maps entries on first socket join
 *   - tryAddSocket() calls ensureRoom() before checking capacity
 *   - The roomExists() guard in the join handler is removed; tryAddSocket()
 *     is now the single gate that handles both "first join creates room" and
 *     "reject if at capacity"
 *
 * The REST GET /api/rooms/:id still uses roomExists() correctly — it should
 * return 404 for rooms that were never created via the API.
 */

import express from 'express';
import { createServer } from 'http';
import { Server, type Socket } from 'socket.io';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import {
  createRoom,
  getRoom,
  touchRoom,
  checkRateLimit,
  clearRateLimit,
  tryAddSocket,
  removeSocket,
  getRoomSize,
  ROOM_CAPACITY,
} from './roomManager';
import type {
  EncryptedPayload,
  JoinPayload,
  PeerKeyPayload,
  TypingPayload,
} from './types';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ─── Express ──────────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? '*' }));
app.use(express.json());

app.post('/api/rooms', (_req, res) => {
  const channelId = uuidv4();
  const room = createRoom(channelId);
  res.json({ channelId, createdAt: room.createdAt });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ channelId: room.channelId, createdAt: room.createdAt });
});

app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Socket.io ────────────────────────────────────────────────────────────────

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_ORIGIN ?? '*' },
  maxHttpBufferSize: 64 * 1024,
});

// Maps socketId → channelId for disconnect cleanup
const socketRoom = new Map<string, string>();

io.on('connection', (socket: Socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── Join room ──────────────────────────────────────────────────────────────
  socket.on('join', ({ channelId, publicKey }: JoinPayload) => {
    if (!channelId || !publicKey) return;

    // NOTE: No roomExists() check here — that was the bug.
    // tryAddSocket() handles all three cases atomically:
    //   1. Room doesn't exist yet  → creates it lazily, adds socket (size becomes 1)
    //   2. Room exists, has 1 slot → adds socket (size becomes 2)
    //   3. Room exists, at capacity → rejects with ROOM_FULL
    if (!tryAddSocket(channelId, socket.id)) {
      socket.emit('error', {
        code: 'ROOM_FULL',
        message: `Room already has ${ROOM_CAPACITY} participants.`,
      });
      return;
    }

    socket.join(channelId);
    socketRoom.set(socket.id, channelId);
    touchRoom(channelId);

    const occupancy = getRoomSize(channelId);
    console.log(
      `[join] ${socket.id} → room ${channelId} (occupancy: ${occupancy}/${ROOM_CAPACITY})`,
    );

    // Announce our public key to the peer already in the room (if any).
    // With capacity=2 enforced, socket.to() is always point-to-point here.
    socket.to(channelId).emit('peer-key', { channelId, publicKey });
  });

  // ── Peer key response ──────────────────────────────────────────────────────
  socket.on('peer-key', ({ channelId, publicKey }: PeerKeyPayload) => {
    if (!channelId || !publicKey) return;
    if (socketRoom.get(socket.id) !== channelId) return;

    socket.to(channelId).emit('peer-key', { channelId, publicKey });
  });

  // ── Encrypted message relay ───────────────────────────────────────────────
  socket.on('message', (payload: EncryptedPayload) => {
    const { channelId } = payload;
    if (!channelId) return;
    if (socketRoom.get(socket.id) !== channelId) return;

    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { code: 'RATE_LIMITED' });
      return;
    }

    touchRoom(channelId);
    socket.to(channelId).emit('message', payload);
    console.log(
      `[msg] ${socket.id} → ${channelId} (${payload.ciphertext.length}b)`,
    );
  });

  // ── Delivery acknowledgement ──────────────────────────────────────────────
  socket.on(
    'delivered',
    ({ id, channelId }: { id: string; channelId: string }) => {
      if (socketRoom.get(socket.id) !== channelId) return;
      socket.to(channelId).emit('delivered', { id });
    },
  );

  // ── Encrypted typing indicator ────────────────────────────────────────────
  socket.on('typing', ({ channelId, ciphertext, iv }: TypingPayload) => {
    if (!channelId) return;
    if (socketRoom.get(socket.id) !== channelId) return;
    socket.to(channelId).emit('typing', { ciphertext, iv });
  });

  // ── Leave room ────────────────────────────────────────────────────────────
  socket.on('leave', ({ channelId }: { channelId: string }) => {
    socket.leave(channelId);
    removeSocket(channelId, socket.id);
    socketRoom.delete(socket.id);
    socket.to(channelId).emit('peer-left');
    clearRateLimit(socket.id);
    console.log(`[leave] ${socket.id} left room ${channelId}`);
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const channelId = socketRoom.get(socket.id);
    if (channelId) {
      removeSocket(channelId, socket.id);
      socket.to(channelId).emit('peer-left');
      socketRoom.delete(socket.id);
    }
    clearRateLimit(socket.id);
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`✓ CipherChat v1 server listening on port ${PORT}`);
});
