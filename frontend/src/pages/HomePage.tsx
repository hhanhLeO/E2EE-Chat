import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useIdentity } from '../context/IdentityContext';
import CreateRoom from '../components/CreateRoom';

export default function HomePage() {
  const { identity, isLoading } = useIdentity();
  const navigate = useNavigate();
  const [joinId, setJoinId] = useState('');

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
      {/* Hero */}
      <div className="text-center mb-14 animate-fade-up">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono
                        bg-cipher-500/10 text-cipher-600 dark:text-cipher-400 border border-cipher-500/20 mb-6">
          <span className="w-1.5 h-1.5 rounded-full bg-cipher-500 animate-pulse" />
          End-to-End Encrypted · Zero Knowledge · No Accounts
        </div>

        <h1 className="font-display text-5xl md:text-6xl font-800 tracking-tight
                       text-zinc-900 dark:text-white mb-4 leading-tight">
          Private by<br />
          <span className="text-cipher-500">design</span>
        </h1>

        <p className="text-zinc-500 dark:text-zinc-400 text-lg max-w-md mx-auto leading-relaxed">
          Create a room, share the link. Messages are encrypted in your browser — the server
          only relays ciphertext it can never read.
        </p>
      </div>

      {/* Cards */}
      <div className="w-full max-w-lg space-y-4">
        {/* Create room */}
        <div className="glass rounded-2xl p-6 shadow-xl shadow-black/5 dark:shadow-black/20 animate-fade-up"
             style={{ animationDelay: '80ms' }}>
          <CreateRoom identity={identity!} />
        </div>

        {/* Join by ID */}
        <div className="glass rounded-2xl p-6 shadow-xl shadow-black/5 dark:shadow-black/20 animate-fade-up"
             style={{ animationDelay: '160ms' }}>
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
        <p className="mt-10 text-xs font-mono text-zinc-400 dark:text-zinc-600 animate-fade-up"
           style={{ animationDelay: '240ms' }}>
          Your key: {identity.publicKeyRaw.slice(0, 20)}…
        </p>
      )}
    </div>
  );
}