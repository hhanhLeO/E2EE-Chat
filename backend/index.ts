/**
 * index.ts
 * Main server entry point.
 *
 * Responsibilities:
 *  - REST: POST /api/rooms  → create a room, return channelId
 *  - REST: GET  /api/rooms/:id → check if room exists
 *  - WebSocket: relay encrypted payloads between two peers in a room
 *
 * The server is ZERO-KNOWLEDGE:
 *  - It never stores messages.
 *  - It never sees plaintext.
 *  - It only relays ciphertext + IV blobs.
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
  roomExists,
  checkRateLimit,
  clearRateLimit,
} from './roomManager';
import type {
  EncryptedPayload,
  JoinPayload,
  PeerKeyPayload,
  TypingPayload,
} from './types';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: process.env.FRONTEND_ORIGIN ?? '*' }));
app.use(express.json());

// Create a room
app.post('/api/rooms', (_req, res) => {
  const channelId = uuidv4();
  const room = createRoom(channelId);
  res.json({ channelId, createdAt: room.createdAt });
});

// Check if a room exists
app.get('/api/rooms/:id', (req, res) => {
  const room = getRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ channelId: room.channelId, createdAt: room.createdAt });
});

// Health check
app.get('/health', (_req, res) => res.json({ ok: true }));

// ─── Socket.io ────────────────────────────────────────────────────────────────

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: process.env.FRONTEND_ORIGIN ?? '*' },
  // Limit per-message payload to 64 KB to prevent abuse
  maxHttpBufferSize: 64 * 1024,
});

// Track which room each socket is in
const socketRoom = new Map<string, string>();

io.on('connection', (socket: Socket) => {
  console.log(`[+] Socket connected: ${socket.id}`);

  // ── Join room ──────────────────────────────────────────────────────────────
  socket.on('join', ({ channelId, publicKey }: JoinPayload) => {
    if (!channelId || !publicKey) return;
    if (!roomExists(channelId)) {
      socket.emit('error', { code: 'ROOM_NOT_FOUND' });
      return;
    }

    socket.join(channelId);
    socketRoom.set(socket.id, channelId);
    touchRoom(channelId);

    // Broadcast our public key to everyone else in the room
    socket.to(channelId).emit('peer-key', { channelId, publicKey });

    console.log(`[join] ${socket.id} → room ${channelId}`);
  });

  // ── Peer sends back their public key ──────────────────────────────────────
  socket.on('peer-key', ({ channelId, publicKey }: PeerKeyPayload) => {
    if (!channelId || !publicKey) return;
    socket.to(channelId).emit('peer-key', { channelId, publicKey });
  });

  // ── Encrypted message relay ───────────────────────────────────────────────
  socket.on('message', (payload: EncryptedPayload) => {
    const { channelId } = payload;
    if (!channelId || !roomExists(channelId)) return;

    // Rate limit check
    if (!checkRateLimit(socket.id)) {
      socket.emit('error', { code: 'RATE_LIMITED' });
      return;
    }

    touchRoom(channelId);

    // Relay ciphertext only — server never decrypts
    socket.to(channelId).emit('message', payload);
    console.log(`[msg] ${socket.id} → ${channelId} (${payload.ciphertext.length} bytes ciphertext)`);
  });

  // ── Delivery acknowledgement ──────────────────────────────────────────────
  socket.on('delivered', ({ id, channelId }: { id: string; channelId: string }) => {
    socket.to(channelId).emit('delivered', { id });
  });

  // ── Typing indicator relay ────────────────────────────────────────────────
  socket.on('typing', ({ channelId, ciphertext, iv }: TypingPayload) => {
    if (!channelId) return;
    socket.to(channelId).emit('typing', { ciphertext, iv });
  });

  // ── Leave room ────────────────────────────────────────────────────────────
  socket.on('leave', ({ channelId }: { channelId: string }) => {
    socket.leave(channelId);
    socketRoom.delete(socket.id);
    socket.to(channelId).emit('peer-left');
    clearRateLimit(socket.id);
    console.log(`[leave] ${socket.id} left room ${channelId}`);
  });

  // ── Disconnect ────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const channelId = socketRoom.get(socket.id);
    if (channelId) {
      socket.to(channelId).emit('peer-left');
      socketRoom.delete(socket.id);
    }
    clearRateLimit(socket.id);
    console.log(`[-] Socket disconnected: ${socket.id}`);
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────

httpServer.listen(PORT, () => {
  console.log(`✓ CipherChat server listening on port ${PORT}`);
});