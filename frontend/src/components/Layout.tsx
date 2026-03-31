import { Outlet, Link } from 'react-router-dom';
import { useTheme } from '../context/ThemeContext';

export default function Layout() {
  const { theme, toggle } = useTheme();

  return (
    <div className="min-h-screen cipher-bg bg-zinc-50 dark:bg-zinc-950 transition-colors duration-300">
      {/* Top bar */}
      <header className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center justify-between px-6
                         glass border-b border-white/10 dark:border-zinc-800">
        <Link
          to="/"
          className="flex items-center gap-2 font-display text-lg font-700 tracking-tight
                     text-zinc-900 dark:text-white hover:text-cipher-500 dark:hover:text-cipher-400
                     transition-colors"
        >
          <ShieldIcon />
          CipherChat
        </Link>

        <button
          onClick={toggle}
          aria-label="Toggle theme"
          className="w-9 h-9 flex items-center justify-center rounded-full
                     hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors"
        >
          {theme === 'dark' ? (
            <SunIcon className="text-cipher-400" />
          ) : (
            <MoonIcon className="text-zinc-600" />
          )}
        </button>
      </header>

      <main className="pt-14 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         className="text-cipher-500">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
         strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}