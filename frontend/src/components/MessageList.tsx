import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import type { Message } from '../types';

interface Props {
  messages: Message[];
  isTyping: boolean;
}

function TypingIndicator() {
  return (
    <div className="flex justify-start animate-fade-up">
      <div className="bg-white dark:bg-zinc-800 border border-zinc-100 dark:border-zinc-700
                      rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-zinc-400 dark:bg-zinc-500 inline-block animate-pulse-dot"
            style={{ animationDelay: `${i * 0.18}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function DateSeparator({ date }: { date: string }) {
  return (
    <div className="flex items-center gap-3 my-4">
      <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
      <span className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-wider">
        {date}
      </span>
      <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
    </div>
  );
}

function groupByDate(messages: Message[]) {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = '';

  for (const msg of messages) {
    const d = new Date(msg.timestamp).toLocaleDateString([], {
      weekday: 'long', month: 'short', day: 'numeric',
    });
    if (d !== currentDate) {
      currentDate = d;
      groups.push({ date: d, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
}

export default function MessageList({ messages, isTyping }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isTyping]);

  const groups = groupByDate(messages);

  return (
    <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-2">
      {messages.length === 0 && !isTyping && (
        <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
          <div className="w-14 h-14 rounded-2xl bg-cipher-500/10 border border-cipher-500/20
                          flex items-center justify-center">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
                 className="text-cipher-500">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Encrypted channel ready
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-600 mt-1">
              Messages are encrypted end-to-end. Say hello!
            </p>
          </div>
        </div>
      )}

      {groups.map((group) => (
        <div key={group.date}>
          <DateSeparator date={group.date} />
          <div className="space-y-1.5">
            {group.messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}
          </div>
        </div>
      ))}

      {isTyping && <TypingIndicator />}

      <div ref={bottomRef} />
    </div>
  );
}