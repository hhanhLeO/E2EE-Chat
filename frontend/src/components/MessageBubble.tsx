import type { Message } from '../types';

interface Props {
  message: Message;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function StatusTick({ status }: { status: Message['status'] }) {
  if (status === 'sending') {
    return <span className="text-zinc-400 text-[10px]">○</span>;
  }
  if (status === 'failed') {
    return <span className="text-red-400 text-[10px]">✕</span>;
  }
  // sent = single tick, delivered = double tick
  return (
    <span className={`text-[10px] ${status === 'delivered' ? 'text-cipher-400' : 'text-zinc-400'}`}>
      {status === 'delivered' ? '✓✓' : '✓'}
    </span>
  );
}

export default function MessageBubble({ message }: Props) {
  const isMe = message.sender === 'me';

  return (
    <div
      className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-fade-up`}
    >
      <div
        className={`
          max-w-[75%] md:max-w-[60%] rounded-2xl px-4 py-2.5 shadow-sm
          ${isMe
            ? 'bg-cipher-600 text-white rounded-br-sm'
            : 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-bl-sm border border-zinc-100 dark:border-zinc-700'
          }
        `}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
          {message.content}
        </p>
        <div className={`flex items-center justify-end gap-1 mt-1 ${isMe ? 'opacity-80' : 'opacity-60'}`}>
          <span className="text-[10px] font-mono">{formatTime(message.timestamp)}</span>
          {isMe && <StatusTick status={message.status} />}
        </div>
      </div>
    </div>
  );
}