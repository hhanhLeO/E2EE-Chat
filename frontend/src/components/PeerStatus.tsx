import type { PeerState } from '../types';

interface Props {
  peerState: PeerState;
  fingerprint: string | null;
}

const STATE_CONFIG = {
  waiting: {
    dot: 'bg-zinc-400',
    label: 'Waiting',
    textColor: 'text-zinc-500 dark:text-zinc-400',
  },
  online: {
    dot: 'bg-emerald-400',
    label: 'Connected',
    textColor: 'text-emerald-600 dark:text-emerald-400',
  },
  offline: {
    dot: 'bg-red-400',
    label: 'Offline',
    textColor: 'text-red-500 dark:text-red-400',
  },
};

export default function PeerStatus({ peerState, fingerprint }: Props) {
  const cfg = STATE_CONFIG[peerState];

  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-1.5">
        <span className={`w-2 h-2 rounded-full ${cfg.dot} ${peerState === 'online' ? 'animate-pulse' : ''}`} />
        <span className={`text-xs font-mono ${cfg.textColor}`}>{cfg.label}</span>
      </div>
      {fingerprint && peerState === 'online' && (
        <p
          title="Peer key fingerprint — verify out-of-band to prevent MITM"
          className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 cursor-help mt-0.5"
        >
          🔑 {fingerprint}
        </p>
      )}
    </div>
  );
}