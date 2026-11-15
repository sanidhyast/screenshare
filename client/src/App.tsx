import { useState, useEffect } from 'react';
import { useSocket } from './hooks/useSocket';
import { HomePage } from './pages/HomePage';
import { RoomPage } from './pages/RoomPage';

export function App() {
  const { socket, status } = useSocket();
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState<boolean>(false);
  const [hostToken, setHostToken] = useState<string | undefined>(undefined);
  const [initialError, setInitialError] = useState<string | null>(null);

  // Check URL parameters for direct invite links (e.g., ?room=xyz or /room/xyz)
  useEffect(() => {
    const parseUrlForRoom = () => {
      const urlParams = new URLSearchParams(window.location.search);
      let roomFromUrl = urlParams.get('room');

      if (!roomFromUrl && window.location.pathname.startsWith('/room/')) {
        roomFromUrl = window.location.pathname.replace('/room/', '').trim();
      }

      if (roomFromUrl) {
        const cleanRoom = roomFromUrl.toLowerCase().trim();
        const savedToken = localStorage.getItem(`host_token_${cleanRoom}`) || undefined;
        setActiveRoomId(cleanRoom);
        setIsHost(Boolean(savedToken));
        setHostToken(savedToken);
      }
    };

    parseUrlForRoom();

    const handlePopState = () => {
      parseUrlForRoom();
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Join or Create room transition
  const handleJoinRoom = (roomId: string, token?: string) => {
    const cleanRoom = roomId.toLowerCase().trim();
    setActiveRoomId(cleanRoom);
    setIsHost(Boolean(token));
    setHostToken(token);
    setInitialError(null);

    // Update URL cleanly without full reload
    const newUrl = `${window.location.origin}/?room=${cleanRoom}`;
    window.history.pushState({ room: cleanRoom }, '', newUrl);
  };

  // Leave room transition
  const handleLeaveRoom = () => {
    setActiveRoomId(null);
    setIsHost(false);
    setHostToken(undefined);
    setInitialError(null);

    // Clean URL
    window.history.pushState({}, '', window.location.origin);
  };

  return (
    <div className="w-full min-h-screen bg-background text-content-primary">
      {activeRoomId ? (
        <RoomPage
          socket={socket}
          status={status}
          roomId={activeRoomId}
          initialIsHost={isHost}
          hostToken={hostToken}
          onLeaveRoom={handleLeaveRoom}
        />
      ) : (
        <HomePage
          socket={socket}
          onJoinRoom={handleJoinRoom}
          initialError={initialError}
        />
      )}
    </div>
  );
}

export default App;
