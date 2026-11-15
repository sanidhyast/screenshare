import React, { useState } from 'react';
import {
  MonitorUp,
  MonitorOff,
  Link,
  Check,
  LogOut,
  Maximize2,
  Minimize2,
  Copy,
  ZoomIn,
  ZoomOut
} from 'lucide-react';

interface FloatingToolbarProps {
  isHost: boolean;
  isSharing: boolean;
  roomId: string;
  fitMode?: 'contain' | 'cover';
  onToggleFitMode?: () => void;
  onToggleSharing: () => void;
  onEndRoom: () => void;
  onLeaveRoom: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
}

export const FloatingToolbar: React.FC<FloatingToolbarProps> = ({
  isHost,
  isSharing,
  roomId,
  fitMode = 'contain',
  onToggleFitMode,
  onToggleSharing,
  onEndRoom,
  onLeaveRoom,
  isFullscreen,
  onToggleFullscreen
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);

  const inviteUrl = `${window.location.origin}/?room=${roomId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <>
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40">
        <div className="glass-toolbar px-3 py-2 rounded-2xl flex items-center gap-1.5 sm:gap-2 shadow-2xl border border-surface-border">
          {/* HOST CONTROLS */}
          {isHost ? (
            <>
              {/* Start / Stop Sharing */}
              <button
                onClick={onToggleSharing}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all duration-200 ${
                  isSharing
                    ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30'
                    : 'bg-accent hover:bg-accent-hover text-white shadow-md shadow-accent/25'
                }`}
                title={isSharing ? 'Stop Sharing' : 'Start Sharing'}
              >
                {isSharing ? (
                  <>
                    <MonitorOff className="w-4 h-4" />
                    <span>Stop Sharing</span>
                  </>
                ) : (
                  <>
                    <MonitorUp className="w-4 h-4" />
                    <span>Share Screen</span>
                  </>
                )}
              </button>

              <div className="w-[1px] h-6 bg-surface-border mx-1" />

              {/* Copy Link */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium hover:bg-surface-hover text-content-secondary hover:text-content-primary transition-colors"
                title="Copy shareable invite link"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Link className="w-4 h-4" />
                    <span className="hidden md:inline">Invite Link</span>
                  </>
                )}
              </button>

              {/* Copy Room Code */}
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium hover:bg-surface-hover text-content-secondary hover:text-content-primary transition-colors"
                title="Copy room code"
              >
                {copiedCode ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="font-mono text-xs">{roomId}</span>
              </button>

              <div className="w-[1px] h-6 bg-surface-border mx-1" />

              {/* Fit / Fill Toggle */}
              {onToggleFitMode && (
                <button
                  onClick={onToggleFitMode}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                  title={fitMode === 'contain' ? 'Fill Screen (Zoom)' : 'Fit to Screen'}
                >
                  {fitMode === 'contain' ? (
                    <>
                      <ZoomIn className="w-4 h-4 text-accent" />
                      <span className="hidden sm:inline">Fill</span>
                    </>
                  ) : (
                    <>
                      <ZoomOut className="w-4 h-4 text-accent" />
                      <span className="hidden sm:inline">Fit</span>
                    </>
                  )}
                </button>
              )}

              {/* Fullscreen Toggle */}
              <button
                onClick={onToggleFullscreen}
                className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {/* End Room */}
              <button
                onClick={() => setShowEndConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                title="End room for everyone"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">End Room</span>
              </button>
            </>
          ) : (
            /* VIEWER CONTROLS */
            <>
              {/* Room Code Display & Copy */}
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium hover:bg-surface-hover text-content-secondary hover:text-content-primary transition-colors"
                title="Copy room code"
              >
                {copiedCode ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="font-mono text-xs">{roomId}</span>
              </button>

              {/* Copy Invite Link */}
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium hover:bg-surface-hover text-content-secondary hover:text-content-primary transition-colors"
                title="Copy shareable invite link"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-medium">Copied!</span>
                  </>
                ) : (
                  <>
                    <Link className="w-4 h-4" />
                    <span className="hidden sm:inline">Share Link</span>
                  </>
                )}
              </button>

              <div className="w-[1px] h-6 bg-surface-border mx-1" />

              {/* Fit / Fill Screen Toggle for Viewers */}
              {onToggleFitMode && (
                <button
                  onClick={onToggleFitMode}
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl text-xs sm:text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                  title={fitMode === 'contain' ? 'Fill Screen (Zoom)' : 'Fit to Screen'}
                >
                  {fitMode === 'contain' ? (
                    <>
                      <ZoomIn className="w-4 h-4 text-accent" />
                      <span className="hidden sm:inline">Fill</span>
                    </>
                  ) : (
                    <>
                      <ZoomOut className="w-4 h-4 text-accent" />
                      <span className="hidden sm:inline">Fit</span>
                    </>
                  )}
                </button>
              )}

              {/* Fullscreen Toggle */}
              <button
                onClick={onToggleFullscreen}
                className="p-2 rounded-xl text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {/* Leave Room */}
              <button
                onClick={onLeaveRoom}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
                title="Leave room"
              >
                <LogOut className="w-4 h-4" />
                <span>Leave</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* End Room Confirmation Modal for Host */}
      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="glass-panel p-6 rounded-2xl max-w-sm w-full border border-surface-border shadow-2xl">
            <h4 className="text-lg font-semibold text-content-primary mb-2">End Room Session?</h4>
            <p className="text-sm text-content-secondary mb-6 leading-relaxed">
              This will immediately disconnect all viewers and terminate the room for everyone.
            </p>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowEndConfirm(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-content-secondary hover:text-content-primary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowEndConfirm(false);
                  onEndRoom();
                }}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors shadow-lg shadow-red-600/25"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
