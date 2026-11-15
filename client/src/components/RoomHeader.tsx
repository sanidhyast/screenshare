import React, { useState } from 'react';
import { ConnectionStatus } from '../types';
import { ConnectionBadge } from './ConnectionBadge';
import { ScreenShare, Copy, Check, Shield, Eye } from 'lucide-react';

interface RoomHeaderProps {
  roomId: string;
  isHost: boolean;
  isSharing: boolean;
  status: ConnectionStatus;
  isHostConnected: boolean;
  onGoHome: () => void;
}

export const RoomHeader: React.FC<RoomHeaderProps> = ({
  roomId,
  isHost,
  isSharing,
  status,
  isHostConnected,
  onGoHome
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <header className="w-full flex items-center justify-between px-3 sm:px-6 py-2.5 border-b border-surface-border/60 bg-surface/40 backdrop-blur-md z-30 select-none">
      {/* Brand & Room Info (TOP LEFT) */}
      <div className="flex items-center gap-2.5 sm:gap-3.5 flex-wrap">
        <button
          onClick={onGoHome}
          className="flex items-center gap-2 text-content-primary hover:text-white transition-opacity group"
          title="Go to Homepage"
        >
          <div className="w-8 h-8 rounded-xl bg-accent/15 border border-accent/30 flex items-center justify-center text-accent group-hover:scale-105 transition-transform">
            <ScreenShare className="w-4 h-4" />
          </div>
          <span className="font-semibold text-sm tracking-tight hidden sm:inline">ScreenShare</span>
        </button>

        <div className="h-4 w-[1px] bg-surface-border hidden sm:block" />

        {/* Room Code Badge */}
        <button
          onClick={handleCopyCode}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-hover border border-surface-border text-xs font-mono text-content-secondary hover:text-content-primary transition-all group"
          title="Click to copy Room Code"
        >
          <span>{roomId}</span>
          {copied ? (
            <Check className="w-3 h-3 text-emerald-400" />
          ) : (
            <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100" />
          )}
        </button>

        {/* Live Stream Status Indicator */}
        {isSharing && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold tracking-wider uppercase bg-red-500/10 text-red-400 border border-red-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
            LIVE
          </span>
        )}
      </div>

      {/* Role Badge and Connection Badge (TOP RIGHT) */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Role Pill */}
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            isHost
              ? 'bg-accent/10 text-accent-light border-accent/25'
              : 'bg-surface text-content-secondary border-surface-border'
          }`}
        >
          {isHost ? (
            <>
              <Shield className="w-3 h-3 text-accent" />
              <span>Host</span>
            </>
          ) : (
            <>
              <Eye className="w-3 h-3 text-content-muted" />
              <span>Viewer</span>
            </>
          )}
        </div>

        {/* Connection status */}
        <ConnectionBadge status={status} isHostConnected={isHostConnected} />
      </div>
    </header>
  );
};
