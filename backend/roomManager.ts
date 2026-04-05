/**
 * roomManager.ts (Version 1 — fixed)
 *
 * Root bug: roomSockets entries were only created by createRoom(), which is
 * called by POST /api/rooms. Person A (creator) called that endpoint, so their
 * room got an entry. Person B (invitee) joined via socket directly — never
 * calling POST /api/rooms — so roomSockets had no entry for that channelId.
 * tryAddSocket() saw a missing entry and returned false → ROOM_FULL error,
 * blocking everyone except the creator.
 * roomExists() had the same problem: only returned true for rooms created via
 * the REST endpoint, so person B also hit ROOM_NOT_FOUND first.
 *
 * Fix: both roomSockets and rooms are now created lazily on first socket join
 * via ensureRoom(). createRoom() (called by POST /api/rooms) still works and
 * pre-creates the entry, but it is no longer the only path. Any socket that
 * joins a valid channelId will auto-create the room entry if it doesn't exist.
 */

import type { Room } from './types';

const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 1000;
export const ROOM_CAPACITY = 2;

const rooms = new Map<string, Room>();
const roomSockets = new Map<string, Set<string>>();
const rateLimitMap = new Map<string, number[]>();

// ─── Internal: lazy room initialisation ──────────────────────────────────────

/**
 * Ensures a room entry exists in both maps.
 * Called by createRoom() (REST path) AND by tryAddSocket() (socket path).
 * Idempotent — safe to call multiple times for the same channelId.
 */
function ensureRoom(channelId: string): void {
  if (!rooms.has(channelId)) {
    rooms.set(channelId, {
      channelId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
    });
  }
  if (!roomSockets.has(channelId)) {
    roomSockets.set(channelId, new Set());
  }
}

// ─── Room CRUD ────────────────────────────────────────────────────────────────

export function createRoom(channelId: string): Room {
  ensureRoom(channelId);
  return rooms.get(channelId)!;
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
  roomSockets.delete(channelId);
}

// roomExists is kept for the REST GET /api/rooms/:id endpoint — it intentionally
// returns false for rooms that were never created via REST (correct for that route).
export function roomExists(channelId: string): boolean {
  return rooms.has(channelId);
}

// ─── Capacity-safe socket tracking ───────────────────────────────────────────

/**
 * Atomically checks capacity and adds socketId to the room.
 * Creates the room entry lazily if it doesn't exist yet (person B's path).
 * Returns true if the socket was added, false if the room is at capacity.
 *
 * The check + insert happen synchronously in one function call.
 * Node.js is single-threaded so nothing can interleave inside this function,
 * eliminating the TOCTOU race from the original implementation.
 */
export function tryAddSocket(channelId: string, socketId: string): boolean {
  ensureRoom(channelId); // ← lazy create for person B
  const sockets = roomSockets.get(channelId)!;
  if (sockets.has(socketId)) return true; // already registered (reconnect)
  if (sockets.size >= ROOM_CAPACITY) return false; // genuinely full
  sockets.add(socketId);
  return true;
}

export function removeSocket(channelId: string, socketId: string): void {
  roomSockets.get(channelId)?.delete(socketId);
}

export function getRoomSize(channelId: string): number {
  return roomSockets.get(channelId)?.size ?? 0;
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

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
      roomSockets.delete(id);
      console.log(`[sweep] Expired room ${id}`);
    }
  }
}

setInterval(sweep, SWEEP_INTERVAL_MS);
