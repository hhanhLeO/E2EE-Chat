/**
 * socket.ts
 * Socket.io client singleton. Import `socket` wherever you need it.
 * The connection is lazy — it connects only when first imported.
 *
 * Improvement: auto-reconnection is enabled with exponential back-off.
 * When reconnection succeeds, consumers should re-emit their join payload.
 */

import { io, type Socket } from 'socket.io-client';

const BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL ?? window.location.origin;

export const socket: Socket = io(BACKEND_URL, {
  autoConnect: false,      // connect explicitly when entering a room
  reconnection: true,
  reconnectionAttempts: Infinity,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 15_000,
  randomizationFactor: 0.5,
  transports: ['websocket', 'polling'],
});