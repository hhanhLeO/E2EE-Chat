import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  loadAllChannels,
  loadLastMessage,
  deleteChannel,
  type ChannelRecord,
} from '../lib/db';
import type { Message } from '../types';

interface ChannelItem {
  channel: ChannelRecord;
  lastMessage?: Message;
}

export default function ChannelList() {
  const navigate = useNavigate();
  const [items, setItems] = useState<ChannelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Load channels + last message preview
  useEffect(() => {
    (async () => {
      const channels = await loadAllChannels();
      const loaded: ChannelItem[] = await Promise.all(
        channels.map(async (channel) => {
          const lastMessage = await loadLastMessage(channel.channelId);
          return { channel, lastMessage };
        }),
      );
      // Sort by last activity: channels with recent messages first,
      // then by creation date
      loaded.sort((a, b) => {
        const aTime = a.lastMessage?.timestamp ?? a.channel.createdAt;
        const bTime = b.lastMessage?.timestamp ?? b.channel.createdAt;
        return bTime - aTime;
      });
      setItems(loaded);
      setLoading(false);
    })();
  }, []);

  const handleDelete = async (channelId: string) => {
    await deleteChannel(channelId);
    setItems((prev) => prev.filter((i) => i.channel.channelId !== channelId));
    setConfirmDelete(null);
  };

  if (loading || items.length === 0) return null;

  return (
    <div
      className="glass rounded-2xl p-6 shadow-xl shadow-black/5 dark:shadow-black/20 animate-fade-up"
      style={{ animationDelay: '240ms' }}
    >
      <p className="text-xs font-mono uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
        Recent conversations
      </p>

      <div className="space-y-1">
        {items.map(({ channel, lastMessage }) => (
          <div key={channel.channelId} className="group relative">
            {/* Channel row */}
            <button
              onClick={() => navigate(`/room/${channel.channelId}`)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left
                         hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition-colors"
            >
              {/* Icon */}
              <div
                className="w-9 h-9 flex-shrink-0 flex items-center justify-center rounded-xl
                              bg-cipher-500/10 border border-cipher-500/20"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-cipher-500"
                >
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-600 text-zinc-900 dark:text-white truncate">
                  {channel.nickname || channel.channelId.slice(0, 8) + '…'}
                </p>
                {lastMessage ? (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                    {lastMessage.sender === 'me' ? 'You: ' : ''}
                    {lastMessage.content}
                  </p>
                ) : (
                  <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                    No messages yet
                  </p>
                )}
              </div>

              {/* Timestamp */}
              <span className="flex-shrink-0 text-[10px] font-mono text-zinc-400 dark:text-zinc-600">
                {formatTime(lastMessage?.timestamp ?? channel.createdAt)}
              </span>
            </button>

            {/* Delete button — visible on hover */}
            {confirmDelete === channel.channelId ? (
              <div
                className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5
                              bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-zinc-200
                              dark:border-zinc-700 px-2 py-1.5 z-10"
              >
                <span className="text-xs text-zinc-500 dark:text-zinc-400 mr-1">
                  Delete?
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(channel.channelId);
                  }}
                  className="text-xs px-2 py-0.5 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
                >
                  Yes
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(null);
                  }}
                  className="text-xs px-2 py-0.5 rounded-md bg-zinc-200 dark:bg-zinc-700
                             text-zinc-600 dark:text-zinc-300 hover:bg-zinc-300 dark:hover:bg-zinc-600 transition-colors"
                >
                  No
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmDelete(channel.channelId);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg
                           text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400
                           hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100"
                aria-label="Delete channel"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                  <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (minutes < 1) return 'now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
