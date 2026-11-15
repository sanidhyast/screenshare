import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { ConnectionStatus } from '../types';

export function useSocket() {
  const socketRef = useRef<Socket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    // In dev: Vite proxies /socket.io to backend (port 4000)
    // In prod: Express serves static files and socket.io on the same origin
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setStatus('connected');
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') {
        setStatus('idle');
      } else {
        setStatus('disconnected');
      }
    });

    socket.on('connect_error', () => {
      setStatus('reconnecting');
    });

    socket.on('reconnect_attempt', () => {
      setStatus('reconnecting');
    });

    socket.on('reconnect', () => {
      setStatus('connected');
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return {
    socket: socketRef.current,
    status
  };
}
