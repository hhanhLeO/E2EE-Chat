/**
 * roomManager.ts
 * In-memory room store.
 *
 * Improvements:
 *  - Rooms expire after ROOM_TTL_MS of inactivity (default 24 h).
 *  - A sweep runs every hour to clean up stale rooms.
 *  - Per-room message rate limiting: max RATE_LIMIT messages per RATE_WINDOW_MS.
 */

import type { Room } from './types';

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;        // 24 hours
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;         // 1 hour
const RATE_LIMIT = 60;                             // messages per window
const RATE_WINDOW_MS = 60 * 1000;                 // 1 minute

const rooms = new Map<string, Room>();

// Per-socket message timestamps for rate limiting
const rateLimitMap = new Map<string, number[]>();

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export function createRoom(channelId: string): Room {
  const room: Room = {
    channelId,
    createdAt: Date.now(),
    lastActivity: Date.now(),
  };
  rooms.set(channelId, room);
  return room;
}

export function getRoom(channelId: string): Room | undefined {
  return rooms.get(channelId);
}

export function touchRoom(channelId: string): void {
  const room = rooms.get(channelId);
  if (room) room.lastActivity = Date.now();
}

export function deleteRoom(channelId: string): void {
  rooms.delete(channelId);
}

export function roomExists(channelId: string): boolean {
  return rooms.has(channelId);
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

/**
 * Returns true if the socket is within rate limit.
 */
export function checkRateLimit(socketId: string): boolean {
  const now = Date.now();
  const timestamps = rateLimitMap.get(socketId) ?? [];
  const windowStart = now - RATE_WINDOW_MS;
  const recent = timestamps.filter((t) => t > windowStart);
  if (recent.length >= RATE_LIMIT) return false;
  recent.push(now);
  rateLimitMap.set(socketId, recent);
  return true;
}

export function clearRateLimit(socketId: string): void {
  rateLimitMap.delete(socketId);
}

// ─── Expiry Sweep ─────────────────────────────────────────────────────────────

function sweep() {
  const now = Date.now();
  for (const [id, room] of rooms.entries()) {
    if (now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(id);
      console.log(`[sweep] Expired room ${id}`);
    }
  }
}

setInterval(sweep, SWEEP_INTERVAL_MS);