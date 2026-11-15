import { useState, useEffect, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { LaserPointerState } from '../types';

interface UseLaserPointerProps {
  socket: Socket | null;
  roomId: string;
  isHost: boolean;
}

export function useLaserPointer({ socket, roomId, isHost }: UseLaserPointerProps) {
  // Laser mode enabled (host only toggle)
  const [isLaserEnabled, setIsLaserEnabled] = useState<boolean>(false);

  // Laser state in normalized coords (0..1)
  const [laserState, setLaserState] = useState<LaserPointerState>({
    x: 0.5,
    y: 0.5,
    active: false
  });

  const lastEmitTimeRef = useRef<number>(0);
  const pendingUpdateRef = useRef<LaserPointerState | null>(null);

  // Host mouse move handler: takes any mouse event and its target/container bounding rect
  const handleHostMouseMove = useCallback(
    (clientX: number, clientY: number, containerRect: DOMRect) => {
      if (!isHost || !isLaserEnabled || !socket) return;
      if (!containerRect || containerRect.width === 0 || containerRect.height === 0) return;

      const normX = Math.max(0, Math.min(1, (clientX - containerRect.left) / containerRect.width));
      const normY = Math.max(0, Math.min(1, (clientY - containerRect.top) / containerRect.height));

      const newState: LaserPointerState = {
        x: normX,
        y: normY,
        active: true
      };

      setLaserState(newState);

      // Send to server (throttled to ~30-40fps for high responsiveness and light network)
      const now = performance.now();
      if (now - lastEmitTimeRef.current > 20) {
        lastEmitTimeRef.current = now;
        socket.emit('laser-pointer-update', {
          roomId,
          x: newState.x,
          y: newState.y,
          active: true
        });
      } else {
        pendingUpdateRef.current = newState;
      }
    },
    [isHost, isLaserEnabled, socket, roomId]
  );

  // Flush any pending throttled update
  useEffect(() => {
    if (!isHost || !socket) return;
    const interval = setInterval(() => {
      if (pendingUpdateRef.current) {
        socket.emit('laser-pointer-update', {
          roomId,
          x: pendingUpdateRef.current.x,
          y: pendingUpdateRef.current.y,
          active: true
        });
        pendingUpdateRef.current = null;
      }
    }, 20);
    return () => clearInterval(interval);
  }, [isHost, socket, roomId]);

  // Toggle laser mode for Host
  const toggleLaser = useCallback(() => {
    if (!isHost) return;
    setIsLaserEnabled((prev) => {
      const next = !prev;
      setLaserState((s) => ({ ...s, active: next }));

      if (socket) {
        socket.emit('laser-pointer-update', {
          roomId,
          x: laserState.x,
          y: laserState.y,
          active: next
        });
      }
      return next;
    });
  }, [isHost, socket, roomId, laserState.x, laserState.y]);

  // Viewer: listen for laser-pointer-update from server
  useEffect(() => {
    if (!socket || isHost) return;

    const handleLaserUpdate = (data: LaserPointerState) => {
      setLaserState({
        x: data.x,
        y: data.y,
        active: Boolean(data.active)
      });
    };

    socket.on('laser-pointer-update', handleLaserUpdate);

    return () => {
      socket.off('laser-pointer-update', handleLaserUpdate);
    };
  }, [socket, isHost]);

  return {
    isLaserEnabled,
    toggleLaser,
    laserState,
    handleHostMouseMove
  };
}
