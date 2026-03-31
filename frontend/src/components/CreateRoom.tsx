import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Identity } from '../types';

interface Props {
  identity: Identity;
}

export default function CreateRoom({ identity }: Props) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error('Server error');
      const { channelId } = (await res.json()) as { channelId: string };
      navigate(`/room/${channelId}`);
    } catch (err) {
      setError('Could not reach server. Is the backend running?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <p className="text-xs font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
        Start a new conversation
      </p>
      <button
        onClick={handleCreate}
        disabled={loading}
        className="w-full py-3 rounded-xl bg-cipher-600 hover:bg-cipher-500 active:scale-[0.98]
                   text-white font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed
                   transition-all flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
            Creating room…
          </>
        ) : (
          <>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Create encrypted room
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-400 font-mono">{error}</p>
      )}
    </div>
  );
}