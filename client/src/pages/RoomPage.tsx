import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { ConnectionStatus } from '../types';
import { FloatingToolbar } from '../components/FloatingToolbar';
import { WaitingPlaceholder } from '../components/WaitingPlaceholder';
import { useWebRTC } from '../hooks/useWebRTC';
import { AlertCircle, Home, LogOut } from 'lucide-react';

interface RoomPageProps {
  socket: Socket | null;
  status?: ConnectionStatus;
  roomId: string;
  initialIsHost: boolean;
  hostToken?: string;
  onLeaveRoom: () => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({
  socket,
  roomId,
  initialIsHost,
  hostToken,
  onLeaveRoom
}) => {
  const [isHost, setIsHost] = useState<boolean>(initialIsHost);
  const [isHostConnected, setIsHostConnected] = useState<boolean>(true);
  const [roomEndedMessage, setRoomEndedMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [fitMode, setFitMode] = useState<'contain' | 'cover'>('contain');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // WebRTC hook
  const {
    localStream,
    remoteStream,
    isSharing,
    streamError,
    startSharing,
    stopSharing
  } = useWebRTC({
    socket,
    roomId,
    isHost
  });

  // Attach local or remote media stream to the <video> element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const streamToPlay = isHost ? localStream : remoteStream;

    if (streamToPlay) {
      video.srcObject = streamToPlay;
      video.muted = true;
      video.play().catch((err) => {
        console.warn('Autoplay prevented or interrupted:', err);
      });
    } else {
      video.srcObject = null;
    }
  }, [isHost, localStream, remoteStream]);

  // Handle Fullscreen
  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.warn('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch((err) => {
        console.warn('Exit fullscreen failed:', err);
      });
    }
  };

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  // Room lifecycle socket events
  useEffect(() => {
    if (!socket) return;

    // Join room event initialization
    socket.emit(
      'join-room',
      { roomId, hostToken },
      (response: {
        success: boolean;
        isHost?: boolean;
        isSharing?: boolean;
        isHostConnected?: boolean;
        viewerCount?: number;
        error?: string;
      }) => {
        if (response?.success) {
          if (typeof response.isHost === 'boolean') {
            setIsHost(response.isHost);
          }
          if (typeof response.isHostConnected === 'boolean') {
            setIsHostConnected(response.isHostConnected);
          }
        } else {
          setRoomEndedMessage(response?.error || 'Failed to join this room.');
        }
      }
    );

    // Room Ended
    const handleRoomEnded = ({ reason }: { reason: string }) => {
      setRoomEndedMessage(reason || 'This room session has ended.');
    };

    // Host Disconnected (temporary)
    const handleHostDisconnected = ({ message }: { message: string }) => {
      setIsHostConnected(false);
      setToastMessage(message || 'Host disconnected.');
    };

    // Host Reconnected
    const handleHostReconnected = () => {
      setIsHostConnected(true);
      setToastMessage('Host has reconnected.');
      setTimeout(() => setToastMessage(null), 3000);
    };

    socket.on('room-ended', handleRoomEnded);
    socket.on('host-disconnected', handleHostDisconnected);
    socket.on('host-reconnected', handleHostReconnected);

    return () => {
      socket.off('room-ended', handleRoomEnded);
      socket.off('host-disconnected', handleHostDisconnected);
      socket.off('host-reconnected', handleHostReconnected);
    };
  }, [socket, roomId, hostToken]);

  // Host End Room
  const handleHostEndRoom = () => {
    if (!socket || !isHost) return;
    socket.emit('end-room', { roomId, hostToken }, () => {
      onLeaveRoom();
    });
  };

  const hasActiveStream = isHost ? Boolean(localStream) : Boolean(remoteStream);

  return (
    <div
      ref={containerRef}
      className="relative flex flex-col h-screen w-screen bg-background overflow-hidden select-none"
    >
      {/* Main Central View Area (Full Screen) */}
      <main className="relative flex-1 flex items-center justify-center p-0 overflow-hidden bg-background">
        {/* Toast / Notification banner */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-surface-elevated/90 border border-surface-border backdrop-blur-md shadow-xl text-xs sm:text-sm font-medium text-amber-300 animate-in fade-in slide-in-from-top-2 duration-200">
            {toastMessage}
          </div>
        )}

        {/* Stream Error Banner */}
        {streamError && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 backdrop-blur-md shadow-xl text-xs sm:text-sm text-red-400 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{streamError}</span>
          </div>
        )}

        {/* Screen Presentation Container */}
        {hasActiveStream ? (
          <div
            className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black cursor-pointer"
            onDoubleClick={() => setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'))}
            title="Double-click to toggle Fit / Fill Screen"
          >
            {/* The Video Element - scales up to 100% of viewer screen */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              onLoadedMetadata={(e) => {
                e.currentTarget.play().catch(() => {});
              }}
              className={`w-full h-full transition-all duration-150 ${
                fitMode === 'cover' ? 'object-cover' : 'object-contain'
              }`}
            />
          </div>
        ) : (
          <WaitingPlaceholder
            isHost={isHost}
            onStartSharing={startSharing}
            isHostConnected={isHostConnected}
          />
        )}
      </main>

      {/* Floating Bottom Toolbar */}
      <FloatingToolbar
        isHost={isHost}
        isSharing={isSharing}
        roomId={roomId}
        fitMode={fitMode}
        onToggleFitMode={() => setFitMode((prev) => (prev === 'contain' ? 'cover' : 'contain'))}
        onToggleSharing={isSharing ? stopSharing : startSharing}
        onEndRoom={handleHostEndRoom}
        onLeaveRoom={onLeaveRoom}
        isFullscreen={isFullscreen}
        onToggleFullscreen={handleToggleFullscreen}
      />

      {/* Room Ended Modal */}
      {roomEndedMessage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="glass-panel p-6 sm:p-8 rounded-2xl max-w-sm w-full text-center border border-surface-border shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-surface border border-surface-border flex items-center justify-center mx-auto mb-4 text-content-muted">
              <LogOut className="w-6 h-6" />
            </div>
            <h3 className="text-xl font-bold text-content-primary mb-2">Room Session Ended</h3>
            <p className="text-sm text-content-secondary leading-relaxed mb-6">
              {roomEndedMessage}
            </p>
            <button
              onClick={onLeaveRoom}
              className="w-full flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium bg-accent hover:bg-accent-hover text-white transition-all shadow-md shadow-accent/25"
            >
              <Home className="w-4 h-4" />
              <span>Back to Home</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
