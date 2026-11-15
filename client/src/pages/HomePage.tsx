import React, { useState } from 'react';
import { Socket } from 'socket.io-client';
import { AlertCircle } from 'lucide-react';

interface HomePageProps {
  socket: Socket | null;
  onJoinRoom: (roomId: string, hostToken?: string) => void;
  initialError?: string | null;
}

export const HomePage: React.FC<HomePageProps> = ({
  socket,
  onJoinRoom,
  initialError
}) => {
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(initialError || null);

  // Handle Create Room
  const handleCreateRoom = () => {
    if (!socket) {
      setErrorMessage('Connecting to signaling server. Please try again in a second.');
      return;
    }

    setErrorMessage(null);
    setIsCreating(true);

    socket.emit(
      'create-room',
      (response: { success: boolean; roomId?: string; hostToken?: string; error?: string }) => {
        setIsCreating(false);
        if (response.success && response.roomId && response.hostToken) {
          localStorage.setItem(`host_token_${response.roomId}`, response.hostToken);
          onJoinRoom(response.roomId, response.hostToken);
        } else {
          setErrorMessage(response.error || 'Failed to create room. Please try again.');
        }
      }
    );
  };

  // Handle Join Room
  const handleJoinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanCode = joinCode.trim().toLowerCase();
    if (!cleanCode) {
      setErrorMessage('Please enter a room code.');
      return;
    }

    if (!socket) {
      setErrorMessage('Connecting to server. Please try again.');
      return;
    }

    setErrorMessage(null);
    setIsJoining(true);

    socket.emit(
      'validate-room',
      { roomId: cleanCode },
      (res: { exists: boolean; error?: string }) => {
        setIsJoining(false);
        if (res.exists) {
          const savedToken = localStorage.getItem(`host_token_${cleanCode}`) || undefined;
          onJoinRoom(cleanCode, savedToken);
        } else {
          setErrorMessage(res.error || 'This room does not exist or has ended.');
        }
      }
    );
  };

  return (
    <div className="min-h-[100dvh] w-screen bg-background flex flex-col items-center justify-center p-4 relative overflow-hidden select-none">
      {/* Subtle ambient glow */}
      <div className="absolute w-[320px] sm:w-[400px] h-[300px] bg-accent/10 rounded-full blur-[130px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-[320px] sm:max-w-sm flex flex-col items-center gap-3.5 sm:gap-4 z-10 px-2 sm:px-0">
        {/* Error notification banner if any */}
        {errorMessage && (
          <div className="w-full p-3 rounded-xl bg-red-500/10 border border-red-500/25 flex items-center gap-2.5 text-red-400 text-xs sm:text-sm animate-in fade-in duration-200">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">{errorMessage}</span>
          </div>
        )}

        {/* Create Room Button */}
        <button
          onClick={handleCreateRoom}
          disabled={isCreating}
          className="w-full min-h-[48px] py-3.5 px-6 rounded-2xl font-medium text-base bg-accent hover:bg-accent-hover active:bg-accent-hover text-white transition-all shadow-lg shadow-accent/25 active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
        >
          <span>{isCreating ? 'Creating Room...' : 'Create Room'}</span>
        </button>

        {/* Divider */}
        <div className="w-full flex items-center gap-3 my-0.5">
          <div className="flex-1 h-[1px] bg-surface-border" />
          <span className="text-xs text-content-muted uppercase tracking-wider font-medium">or</span>
          <div className="flex-1 h-[1px] bg-surface-border" />
        </div>

        {/* Join Room Form */}
        <form onSubmit={handleJoinSubmit} className="w-full flex flex-col gap-2.5">
          <input
            type="text"
            placeholder="Enter Room Code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="w-full min-h-[48px] px-4 py-3 rounded-2xl bg-surface border border-surface-border text-content-primary placeholder:text-content-muted focus:outline-none focus:border-accent transition-colors text-base sm:text-sm font-mono text-center tracking-wider"
          />
          <button
            type="submit"
            disabled={isJoining}
            className="w-full min-h-[48px] py-3 px-6 rounded-2xl font-medium text-sm sm:text-base bg-surface hover:bg-surface-hover active:bg-surface-hover text-content-primary border border-surface-border transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center"
          >
            <span>{isJoining ? 'Joining...' : 'Join Room'}</span>
          </button>
        </form>
      </div>
    </div>
  );
};
