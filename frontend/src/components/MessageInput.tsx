import { useState, useRef, useCallback } from 'react';

interface Props {
  onSend: (content: string) => void;
  onTyping: (isTyping: boolean) => void;
  disabled?: boolean;
}

export default function MessageInput({ onSend, onTyping, disabled }: Props) {
  const [text, setText] = useState('');
  const typingRef = useRef(false);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    // Stop typing
    if (typingRef.current) {
      onTyping(false);
      typingRef.current = false;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
  }, [text, disabled, onSend, onTyping]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);

    // Typing indicator
    if (!typingRef.current) {
      onTyping(true);
      typingRef.current = true;
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => {
      onTyping(false);
      typingRef.current = false;
    }, 1500);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="px-4 md:px-8 py-4 border-t border-zinc-200 dark:border-zinc-800
                    bg-white/80 dark:bg-zinc-900/80 backdrop-blur-sm">
      <div className="flex items-end gap-3 max-w-4xl mx-auto">
        {/* Lock icon — signals encryption */}
        <div className="mb-2 text-cipher-500/60" aria-label="End-to-end encrypted">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>

        <textarea
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? 'Waiting for peer to reconnect…' : 'Type a message… (Enter to send)'}
          rows={1}
          className="flex-1 resize-none rounded-2xl px-4 py-3 text-sm
                     bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white
                     placeholder-zinc-400 dark:placeholder-zinc-600
                     outline-none focus:ring-2 focus:ring-cipher-500/40
                     disabled:opacity-40 disabled:cursor-not-allowed
                     transition max-h-40 overflow-y-auto"
          style={{ lineHeight: '1.5' }}
          aria-label="Message input"
        />

        <button
          onClick={handleSend}
          disabled={!text.trim() || disabled}
          className="mb-1 w-10 h-10 flex items-center justify-center rounded-full
                     bg-cipher-600 hover:bg-cipher-500 active:scale-90
                     text-white disabled:opacity-30 disabled:cursor-not-allowed
                     transition-all shadow-md shadow-cipher-600/30"
          aria-label="Send message"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>

      <p className="text-center text-[10px] font-mono text-zinc-300 dark:text-zinc-700 mt-2">
        AES-256-GCM · ECDH P-256 · Messages never leave your browser unencrypted
      </p>
    </div>
  );
}