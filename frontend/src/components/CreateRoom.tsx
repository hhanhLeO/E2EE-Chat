import { useNavigate } from 'react-router-dom';

export default function CreateRoom() {
  const navigate = useNavigate();

  const handleCreate = () => {
    const channelId = crypto.randomUUID();
    navigate(`/room/${channelId}`);
  };

  return (
    <div>
      <p className="text-xs font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
        Start a new conversation
      </p>
      <button
        onClick={handleCreate}
        className="w-full py-3 rounded-xl bg-cipher-600 hover:bg-cipher-500 active:scale-[0.98]
                   text-white font-medium text-sm transition-all flex items-center justify-center gap-2"
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
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        Create encrypted room
      </button>
    </div>
  );
}
