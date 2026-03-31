/**
 * useRoom.ts
 * Core hook that manages:
 *  - Joining a room and broadcasting our public key
 *  - Receiving the peer's public key and deriving the shared AES key
 *  - Sending and receiving encrypted messages
 *  - Encrypted typing indicators
 *  - Session recovery from IndexedDB
 *  - Reconnection handling (re-sends join payload automatically)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  importPublicKey,
  deriveSharedKey,
  encryptMessage,
  decryptMessage,
  exportPublicKey,
  keyFingerprint,
} from '../lib/crypto';
import {
  saveChannel,
  loadChannel,
  saveMessage,
  loadMessages,
  updateMessageStatus,
} from '../lib/db';
import { socket } from '../lib/socket';
import { useIdentity } from '../context/IdentityContext';
import type {
  Message,
  RoomState,
  EncryptedPayload,
  PeerKeyPayload,
} from '../types';

const TYPING_DEBOUNCE_MS = 1500;

export function useRoom(channelId: string) {
  const { identity } = useIdentity();
  const sharedKeyRef = useRef<CryptoKey | null>(null);

  const [state, setState] = useState<RoomState>({
    channelId,
    messages: [],
    peerState: 'waiting',
    peerFingerprint: null,
    isTyping: false,
    connectionState: 'connecting',
  });

  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function addMessage(msg: Message) {
    setState((s) => ({
      ...s,
      messages: [...s.messages, msg],
    }));
  }

  function updateStatus(id: string, status: Message['status']) {
    setState((s) => ({
      ...s,
      messages: s.messages.map((m) => (m.id === id ? { ...m, status } : m)),
    }));
    updateMessageStatus(id, status);
  }

  // ─── Join & Key Exchange ─────────────────────────────────────────────────────

  const joinRoom = useCallback(async () => {
    if (!identity) return;
    socket.emit('join', { channelId, publicKey: identity.publicKeyRaw });
  }, [channelId, identity]);

  // ─── Load from IndexedDB ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!identity) return;

    (async () => {
      // Restore prior channel if it exists
      const stored = await loadChannel(channelId);
      if (stored) {
        // Re-derive the shared key (it's non-extractable, so we re-derive)
        const peerPubKey = await importPublicKey(stored.peerPublicKeyRaw);
        const sharedKey = await deriveSharedKey(identity.privateKey, peerPubKey);
        sharedKeyRef.current = sharedKey;

        const fp = await keyFingerprint(stored.peerPublicKeyRaw);
        const history = await loadMessages(channelId);

        setState((s) => ({
          ...s,
          peerFingerprint: fp,
          peerState: 'offline', // assume offline until socket confirms
          messages: history,
        }));
      }

      // Connect socket
      socket.connect();
      joinRoom();
    })();

    return () => {
      socket.emit('leave', { channelId });
      socket.disconnect();
      sharedKeyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, identity]);

  // ─── Socket Listeners ────────────────────────────────────────────────────────

  useEffect(() => {
    if (!identity) return;

    const onConnect = () => {
      setState((s) => ({ ...s, connectionState: 'connected' }));
      joinRoom(); // re-join on reconnect
    };

    const onDisconnect = () => {
      setState((s) => ({
        ...s,
        connectionState: 'disconnected',
        peerState: s.peerState === 'online' ? 'offline' : s.peerState,
      }));
    };

    const onConnectError = () => {
      setState((s) => ({ ...s, connectionState: 'error' }));
    };

    // Peer joined and sent their public key
    const onPeerKey = async ({ publicKey }: PeerKeyPayload) => {
      if (!identity) return;
      try {
        const peerPub = await importPublicKey(publicKey);
        const sharedKey = await deriveSharedKey(identity.privateKey, peerPub);
        sharedKeyRef.current = sharedKey;

        const fp = await keyFingerprint(publicKey);

        // Persist channel for session recovery
        await saveChannel({
          channelId,
          peerPublicKeyRaw: publicKey,
          sharedKeyJwk: '', // non-extractable; we store peerPublicKeyRaw to re-derive
          createdAt: Date.now(),
        });

        setState((s) => ({
          ...s,
          peerState: 'online',
          peerFingerprint: fp,
        }));

        // Respond with our own key so the peer can also derive
        socket.emit('peer-key', { channelId, publicKey: identity.publicKeyRaw });
      } catch (err) {
        console.error('Key exchange failed:', err);
      }
    };

    const onPeerLeft = () => {
      setState((s) => ({ ...s, peerState: 'offline' }));
    };

    // Incoming encrypted message
    const onMessage = async (payload: EncryptedPayload) => {
      if (!sharedKeyRef.current) return;
      // Ignore echoes of our own messages (server shouldn't send these, but guard anyway)
      if (payload.sender === identity.publicKeyRaw) return;

      try {
        const content = await decryptMessage(
          sharedKeyRef.current,
          payload.ciphertext,
          payload.iv,
        );
        const msg: Message = {
          id: payload.id,
          channelId,
          sender: 'peer',
          content,
          timestamp: payload.timestamp,
          status: 'delivered',
        };
        addMessage(msg);
        await saveMessage(msg);

        // Acknowledge delivery
        socket.emit('delivered', { id: payload.id, channelId });
      } catch (err) {
        console.error('Decryption failed:', err);
      }
    };

    // Our message was delivered to peer
    const onDelivered = ({ id }: { id: string }) => {
      updateStatus(id, 'delivered');
    };

    // Encrypted typing indicator
    const onTyping = async ({ ciphertext, iv }: { ciphertext: string; iv: string }) => {
      if (!sharedKeyRef.current) return;
      try {
        const raw = await decryptMessage(sharedKeyRef.current, ciphertext, iv);
        const isTyping = raw === 'typing';
        setState((s) => ({ ...s, isTyping }));

        if (isTyping) {
          // Auto-clear after 3s in case stop event is missed
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => {
            setState((s) => ({ ...s, isTyping: false }));
          }, 3000);
        }
      } catch {
        // ignore
      }
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', onConnectError);
    socket.on('peer-key', onPeerKey);
    socket.on('peer-left', onPeerLeft);
    socket.on('message', onMessage);
    socket.on('delivered', onDelivered);
    socket.on('typing', onTyping);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('connect_error', onConnectError);
      socket.off('peer-key', onPeerKey);
      socket.off('peer-left', onPeerLeft);
      socket.off('message', onMessage);
      socket.off('delivered', onDelivered);
      socket.off('typing', onTyping);
    };
  }, [channelId, identity, joinRoom]);

  // ─── Send Message ────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    async (content: string) => {
      if (!sharedKeyRef.current || !identity) return;

      const id = crypto.randomUUID();
      const timestamp = Date.now();

      const msg: Message = {
        id,
        channelId,
        sender: 'me',
        content,
        timestamp,
        status: 'sending',
      };
      addMessage(msg);
      await saveMessage(msg);

      try {
        const { ciphertext, iv } = await encryptMessage(sharedKeyRef.current, content);
        socket.emit('message', {
          id,
          channelId,
          sender: identity.publicKeyRaw,
          ciphertext,
          iv,
          timestamp,
        } satisfies EncryptedPayload);
        updateStatus(id, 'sent');
      } catch (err) {
        console.error('Encryption failed:', err);
        updateStatus(id, 'failed');
      }
    },
    [channelId, identity],
  );

  // ─── Typing Indicator ────────────────────────────────────────────────────────

  const sendTyping = useCallback(
    async (isTyping: boolean) => {
      if (!sharedKeyRef.current) return;
      try {
        const { ciphertext, iv } = await encryptMessage(
          sharedKeyRef.current,
          isTyping ? 'typing' : 'stop',
        );
        socket.emit('typing', { channelId, ciphertext, iv });
      } catch {
        // non-critical
      }
    },
    [channelId],
  );

  return { state, sendMessage, sendTyping };
}