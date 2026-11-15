import React from 'react';
import { ConnectionStatus } from '../types';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';

interface ConnectionBadgeProps {
  status: ConnectionStatus;
  isHostConnected?: boolean;
}

export const ConnectionBadge: React.FC<ConnectionBadgeProps> = ({
  status,
  isHostConnected = true
}) => {
  if (!isHostConnected) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
        Host Disconnected
      </div>
    );
  }

  switch (status) {
    case 'connected':
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Connected
        </div>
      );
    case 'connecting':
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
          <RefreshCw className="w-3 h-3 animate-spin text-blue-400" />
          Connecting
        </div>
      );
    case 'reconnecting':
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
          Reconnecting
        </div>
      );
    case 'disconnected':
    case 'failed':
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
          <WifiOff className="w-3 h-3 text-red-400" />
          Disconnected
        </div>
      );
    default:
      return (
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface text-content-muted border border-surface-border">
          <Wifi className="w-3 h-3" />
          Idle
        </div>
      );
  }
};
