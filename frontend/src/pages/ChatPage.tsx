import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useRoom } from '../hooks/useRoom';
import { useIdentity } from '../context/IdentityContext';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import PeerStatus from '../components/PeerStatus';
import { useClipboard } from '../hooks/useClipboard';

export default function ChatPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { identity, isLoading } = useIdentity();

  // The peer's pubkey may arrive via the join URL
  const peerPubkeyFromUrl = searchParams.get('pubkey');

  const { state, sendMessage, sendTyping } = useRoom(
    channelId!,
    peerPubkeyFromUrl,
  );
  const { copied, copy } = useClipboard();

  // Redirect home when the server rejects us because the room is full.
  // Pass { roomFull: true } in location state so HomePage can show a notification.
  // Socket cleanup (leave + disconnect) runs automatically on unmount.
  useEffect(() => {
    if (state.serverError === 'ROOM_FULL') {
      navigate('/', { state: { roomFull: true }, replace: true });
    }
  }, [state.serverError, navigate]);

  // Build the invitation link to share with peer
  const inviteLink = `${window.location.origin}/join?room=${channelId}&pubkey=${identity?.publicKeyRaw ?? ''}`;

  const handleCopyLink = () => copy(inviteLink);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="w-6 h-6 rounded-full border-2 border-cipher-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      {/* Room header */}
      <div
        className="flex items-center justify-between px-4 md:px-6 py-3 border-b
                      border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
            aria-label="Back to home"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 5l-7 7 7 7" />
            </svg>
          </button>
          <div>
            <p className="text-xs font-mono text-zinc-400 dark:text-zinc-500">
              Room
            </p>
            <p className="font-display font-600 text-sm text-zinc-900 dark:text-white tracking-tight">
              {channelId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <PeerStatus
            peerState={state.peerState}
            fingerprint={state.peerFingerprint}
          />

          {/* Share / copy link — shown when peer hasn't joined yet */}
          {state.peerState === 'waiting' && (
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg
                         bg-cipher-500/10 hover:bg-cipher-500/20 text-cipher-600 dark:text-cipher-400
                         border border-cipher-500/20 transition-colors font-mono"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {copied ? 'Copied!' : 'Copy invite'}
            </button>
          )}
        </div>
      </div>

      {/* ── OOB Key Mismatch Warning ─────────────────────────────────────────── */}
      {state.keyMismatch && (
        <div
          className="flex items-start gap-3 px-4 md:px-6 py-3 bg-red-500/10
                        border-b border-red-500/20 text-left"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-red-500 flex-shrink-0 mt-0.5"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div>
            <p className="text-sm font-display font-700 text-red-600 dark:text-red-400">
              Key mismatch — possible MITM attack
            </p>
            <p className="text-xs text-zinc-600 dark:text-zinc-400 mt-0.5 leading-relaxed">
              The peer's public key received over WebSocket does not match the
              key embedded in the invite link. This could mean the server or a
              third party is intercepting the connection. Verify the peer's
              fingerprint out-of-band before continuing.
            </p>
          </div>
        </div>
      )}

      {/* Waiting state — show invite panel */}
      {state.peerState === 'waiting' && (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-cipher-500/10 flex items-center justify-center mx-auto mb-4 border border-cipher-500/20">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-cipher-500"
              >
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </div>
            <h2 className="font-display font-700 text-xl text-zinc-900 dark:text-white mb-2">
              Waiting for peer
            </h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 leading-relaxed">
              Share the invite link with the person you want to chat with. The
              key exchange happens automatically when they join.
            </p>
            <div className="bg-zinc-100 dark:bg-zinc-800 rounded-xl p-3 text-left">
              <p className="text-xs font-mono text-zinc-500 dark:text-zinc-400 break-all leading-relaxed">
                {inviteLink}
              </p>
            </div>
            <button
              onClick={handleCopyLink}
              className="mt-4 w-full py-2.5 rounded-xl bg-cipher-600 hover:bg-cipher-500
                         text-white text-sm font-medium transition-colors"
            >
              {copied ? '✓ Copied!' : 'Copy invite link'}
            </button>
          </div>
        </div>
      )}

      {/* Chat area */}
      {state.peerState !== 'waiting' && (
        <>
          <MessageList messages={state.messages} isTyping={state.isTyping} />
          <MessageInput
            onSend={sendMessage}
            onTyping={sendTyping}
            disabled={
              state.peerState === 'offline' ||
              state.connectionState !== 'connected'
            }
          />
        </>
      )}

      {/* Connection banner */}
      {state.connectionState === 'disconnected' && !state.serverError && (
        <div className="px-4 py-2 text-center text-xs font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 border-t border-amber-500/20">
          Reconnecting…
        </div>
      )}

      {/* Non-fatal server error banner (anything other than ROOM_FULL which redirects) */}
      {state.serverError && state.serverError !== 'ROOM_FULL' && (
        <div className="px-4 py-3 text-center text-xs font-mono bg-red-500/10 text-red-600 dark:text-red-400 border-t border-red-500/20">
          {SERVER_ERROR_MESSAGES[state.serverError] ?? 'An error occurred.'}
        </div>
      )}
    </div>
  );
}

const SERVER_ERROR_MESSAGES: Record<string, string> = {
  JOIN_RATE_LIMITED:
    '⏳ Too many join attempts. Please wait 60 seconds before trying again.',
  FLOOD_LIMIT: '⚠️ Sending too fast. Please slow down.',
  ALREADY_IN_ROOM:
    '⚠️ Already in a room. Open a new tab to join a different room.',
  INVALID_ROOM_ID: '❌ Invalid room ID format.',
  INVALID_PUBLIC_KEY: '❌ Invalid key format. Try refreshing the page.',
  ORIGIN_NOT_ALLOWED: '❌ Connection rejected by server (origin mismatch).',
};
