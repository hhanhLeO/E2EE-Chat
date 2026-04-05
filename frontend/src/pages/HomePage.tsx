import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useIdentity } from '../context/IdentityContext';
import CreateRoom from '../components/CreateRoom';

export default function HomePage() {
  const { identity, isLoading } = useIdentity();
  const navigate = useNavigate();
  const location = useLocation();
  const [joinId, setJoinId] = useState('');

  // Received when ChatPage redirects here after a ROOM_FULL error
  const roomFull =
    (location.state as { roomFull?: boolean } | null)?.roomFull === true;

  // Dismiss the notification and clear location state so a manual refresh
  // or back-navigation doesn't re-show the banner.
  const [showRoomFull, setShowRoomFull] = useState(roomFull);
  useEffect(() => {
    if (roomFull) {
      setShowRoomFull(true);
      // Replace state so the banner won't reappear on refresh
      window.history.replaceState({}, '');
    }
  }, [roomFull]);

  const handleJoin = () => {
    const id = joinId.trim();
    if (id) navigate(`/room/${id}`);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-cipher-500 border-t-transparent animate-spin" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">
            Generating identity keys…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4 py-16">
      {/* ── Room full notification ───────────────────────────────────────────── */}
      {showRoomFull && (
        <div className="w-full max-w-lg mb-6 animate-fade-up">
          <div
            className="relative flex items-start gap-4 px-5 py-4 rounded-2xl
                          bg-red-500/10 border border-red-500/20 text-left"
          >
            {/* Icon */}
            <div
              className="mt-0.5 w-9 h-9 flex-shrink-0 flex items-center justify-center
                            rounded-xl bg-red-500/15 border border-red-500/20"
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
                className="text-red-500"
              >
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>

            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="font-display font-700 text-sm text-red-600 dark:text-red-400 mb-0.5">
                Room is full
              </p>
              <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                That room already has 2 participants. Create a new private room
                and share the fresh link with your contact.
              </p>
            </div>

            {/* Dismiss */}
            <button
              onClick={() => setShowRoomFull(false)}
              aria-label="Dismiss"
              className="flex-shrink-0 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300
                         transition-colors mt-0.5"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Hero ─────────────────────────────────────────────────────────────── */}
      <div className="text-center mb-14 animate-fade-up">
        <div
          className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono
                        bg-cipher-500/10 text-cipher-600 dark:text-cipher-400 border border-cipher-500/20 mb-6"
        >
          <span className="w-1.5 h-1.5 rounded-full bg-cipher-500 animate-pulse" />
          End-to-End Encrypted · Zero Knowledge · No Accounts
        </div>

        <h1
          className="font-display text-5xl md:text-6xl font-800 tracking-tight
                       text-zinc-900 dark:text-white mb-4 leading-tight"
        >
          Private by
          <br />
          <span className="text-cipher-500">design</span>
        </h1>

        <p className="text-zinc-500 dark:text-zinc-400 text-lg max-w-md mx-auto leading-relaxed">
          Create a room, share the link. Messages are encrypted in your browser
          — the server only relays ciphertext it can never read.
        </p>
      </div>

      {/* ── Cards ────────────────────────────────────────────────────────────── */}
      <div className="w-full max-w-lg space-y-4">
        {/* Create room — highlighted with a subtle ring when roomFull is showing */}
        <div
          className={`glass rounded-2xl p-6 shadow-xl shadow-black/5 dark:shadow-black/20 animate-fade-up
                         transition-all duration-300
                         ${showRoomFull ? 'ring-2 ring-cipher-500/40' : ''}`}
          style={{ animationDelay: '80ms' }}
        >
          {showRoomFull && (
            <p className="text-xs font-mono text-cipher-500 dark:text-cipher-400 mb-3 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-cipher-500" />
              Create a new room below
            </p>
          )}
          <CreateRoom />
        </div>

        {/* Join by ID */}
        <div
          className="glass rounded-2xl p-6 shadow-xl shadow-black/5 dark:shadow-black/20 animate-fade-up"
          style={{ animationDelay: '160ms' }}
        >
          <p className="text-xs font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
            Join by Room ID
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
              placeholder="Paste Room ID…"
              className="flex-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl px-4 py-2.5 text-sm
                         text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-600
                         outline-none focus:ring-2 focus:ring-cipher-500/40 transition"
            />
            <button
              onClick={handleJoin}
              disabled={!joinId.trim()}
              className="px-5 py-2.5 rounded-xl bg-cipher-600 hover:bg-cipher-500 text-white text-sm
                         font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Join
            </button>
          </div>
        </div>
      </div>

      {/* Key fingerprint footer */}
      {identity && (
        <p
          className="mt-10 text-xs font-mono text-zinc-400 dark:text-zinc-600 animate-fade-up"
          style={{ animationDelay: '240ms' }}
        >
          Your key: {identity.publicKeyRaw.slice(0, 20)}…
        </p>
      )}
    </div>
  );
}
