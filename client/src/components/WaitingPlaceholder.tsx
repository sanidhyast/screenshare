import React from 'react';
import { MonitorPlay, Radio } from 'lucide-react';

interface WaitingPlaceholderProps {
  isHost: boolean;
  onStartSharing?: () => void;
  isHostConnected?: boolean;
}

export const WaitingPlaceholder: React.FC<WaitingPlaceholderProps> = ({
  isHost,
  onStartSharing,
  isHostConnected = true
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto my-auto select-none animate-in fade-in duration-300">
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-surface border border-surface-border flex items-center justify-center shadow-xl relative z-10">
          <MonitorPlay className="w-10 h-10 text-accent" />
        </div>
        {/* Animated aura */}
        <div className="absolute inset-0 bg-accent/20 rounded-2xl blur-xl animate-pulse" />
      </div>

      {!isHost && (
        <>
          <h3 className="text-xl font-semibold text-content-primary mb-2">
            {!isHostConnected
              ? 'Host temporarily disconnected'
              : 'Waiting for host to share their screen'}
          </h3>

          <p className="text-sm text-content-secondary leading-relaxed mb-6">
            {!isHostConnected
              ? 'The host connection was interrupted. Please hold on while they reconnect...'
              : 'The host has not started streaming yet. The screen will automatically appear here once they start.'}
          </p>
        </>
      )}

      {isHost && onStartSharing && (
        <button
          onClick={onStartSharing}
          className="inline-flex items-center gap-2.5 px-6 py-3 rounded-xl font-medium bg-accent hover:bg-accent-hover text-white transition-all duration-200 shadow-lg shadow-accent/25 hover:shadow-accent/40 active:scale-[0.98]"
        >
          <Radio className="w-4 h-4 animate-pulse" />
          Start Screen Sharing
        </button>
      )}
    </div>
  );
};
