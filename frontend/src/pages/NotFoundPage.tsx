import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] px-4">
      <p className="font-mono text-7xl font-bold text-cipher-500/30 mb-4">
        404
      </p>
      <h1 className="font-display text-2xl font-700 text-zinc-900 dark:text-white mb-2">
        Room not found
      </h1>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-8">
        This room may have expired or the link is incorrect.
      </p>
      <Link
        to="/"
        className="px-6 py-2.5 rounded-xl bg-cipher-600 hover:bg-cipher-500 text-white text-sm font-medium transition-colors"
      >
        Back to home
      </Link>
    </div>
  );
}
