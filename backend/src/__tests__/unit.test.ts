/**
 * unit.test.ts
 *
 * Unit tests for standalone utility functions: UUID validation,
 * rate limiting, and the health endpoint.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { isValidRoomId, checkRate, type RateLimitConfig } from '../server';

// ─── UUID Validation ─────────────────────────────────────────────────────────

describe('isValidRoomId', () => {
  it('should accept a valid UUIDv4', () => {
    expect(isValidRoomId('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('should accept UUIDv4 with uppercase hex', () => {
    expect(isValidRoomId('550E8400-E29B-41D4-A716-446655440000')).toBe(true);
  });

  it('should accept crypto.randomUUID() output', () => {
    const id = crypto.randomUUID();
    expect(isValidRoomId(id)).toBe(true);
  });

  it('should reject a UUIDv1 (wrong version digit)', () => {
    // Version digit is 1, not 4
    expect(isValidRoomId('550e8400-e29b-11d4-a716-446655440000')).toBe(false);
  });

  it('should reject a UUID with invalid variant bits', () => {
    // Variant digit must be 8, 9, a, or b — using 0 here
    expect(isValidRoomId('550e8400-e29b-41d4-0716-446655440000')).toBe(false);
  });

  it('should reject an empty string', () => {
    expect(isValidRoomId('')).toBe(false);
  });

  it('should reject a random string', () => {
    expect(isValidRoomId('not-a-uuid-at-all')).toBe(false);
  });

  it('should reject a UUID missing a section', () => {
    expect(isValidRoomId('550e8400-e29b-41d4-a716')).toBe(false);
  });

  it('should reject a UUID with non-hex characters', () => {
    expect(isValidRoomId('550e8400-e29b-41d4-a716-44665544zzzz')).toBe(false);
  });

  it('should reject null', () => {
    expect(isValidRoomId(null)).toBe(false);
  });

  it('should reject undefined', () => {
    expect(isValidRoomId(undefined)).toBe(false);
  });

  it('should reject a number', () => {
    expect(isValidRoomId(12345)).toBe(false);
  });

  it('should reject a UUID with extra characters', () => {
    expect(isValidRoomId('550e8400-e29b-41d4-a716-446655440000x')).toBe(false);
  });

  it('should reject a UUID without dashes', () => {
    expect(isValidRoomId('550e8400e29b41d4a716446655440000')).toBe(false);
  });
});

// ─── Rate Limiting ───────────────────────────────────────────────────────────

describe('checkRate', () => {
  let map: Map<string, number[]>;
  const config: RateLimitConfig = { max: 3, windowMs: 60_000 };

  beforeEach(() => {
    map = new Map();
  });

  it('should allow requests up to the limit', () => {
    expect(checkRate(map, 'socket-1', config)).toBe(true);
    expect(checkRate(map, 'socket-1', config)).toBe(true);
    expect(checkRate(map, 'socket-1', config)).toBe(true);
  });

  it('should reject the request exceeding the limit', () => {
    checkRate(map, 'socket-1', config);
    checkRate(map, 'socket-1', config);
    checkRate(map, 'socket-1', config);
    expect(checkRate(map, 'socket-1', config)).toBe(false);
  });

  it('should track different sockets independently', () => {
    // Fill up socket-1
    checkRate(map, 'socket-1', config);
    checkRate(map, 'socket-1', config);
    checkRate(map, 'socket-1', config);
    expect(checkRate(map, 'socket-1', config)).toBe(false);

    // socket-2 should still be allowed
    expect(checkRate(map, 'socket-2', config)).toBe(true);
  });

  it('should allow requests again after the window expires', () => {
    // Pre-fill with old timestamps (well beyond the window)
    const oldTime = Date.now() - 120_000; // 2 minutes ago
    map.set('socket-1', [oldTime, oldTime, oldTime]);

    // These old entries should be expired, so new requests are allowed
    expect(checkRate(map, 'socket-1', config)).toBe(true);
  });

  it('should work with a fresh socket (no prior entries)', () => {
    expect(checkRate(map, 'brand-new', config)).toBe(true);
  });

  it('should store timestamps in the map', () => {
    checkRate(map, 'socket-1', config);
    const timestamps = map.get('socket-1');
    expect(timestamps).toBeDefined();
    expect(timestamps).toHaveLength(1);
  });
});
