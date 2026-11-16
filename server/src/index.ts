import express from 'express';
import http from 'http';
import { Server, Socket } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { RoomManager } from './roomManager';
import { SFUManager } from './sfuManager';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST']
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), timestamp: Date.now() });
});

// Serve client build if client/dist exists (production ready)
let clientBuildPath = path.resolve(__dirname, '../../client/dist');
if (!fs.existsSync(clientBuildPath)) {
  clientBuildPath = path.resolve(__dirname, '../client/dist');
}
app.use(express.static(clientBuildPath));

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingInterval: 10000,
  pingTimeout: 5000
});

const roomManager = new RoomManager();
const sfuManager = new SFUManager();

io.on('connection', (socket: Socket) => {
  const clientIp = socket.handshake.address || socket.conn.remoteAddress || 'unknown';

  // 1. Create Room
  socket.on('create-room', (callback) => {
    if (!roomManager.checkRateLimit(clientIp, 10, 60000)) {
      return callback?.({ success: false, error: 'Too many requests. Please try again shortly.' });
    }

    const { roomId, hostToken } = roomManager.createRoom(socket.id);
    socket.join(roomId);

    callback?.({
      success: true,
      roomId,
      hostToken
    });
  });

  // 2. Validate Room
  socket.on('validate-room', ({ roomId }: { roomId: string }, callback) => {
    if (!roomId) {
      return callback?.({ exists: false, error: 'Room ID is required.' });
    }
    const cleanId = roomId.toLowerCase().trim();
    const room = roomManager.getRoom(cleanId);
    if (!room || room.status !== 'active') {
      return callback?.({ exists: false, error: 'Room does not exist or has ended.' });
    }

    callback?.({
      exists: true,
      isSharing: room.isSharing,
      isHostConnected: room.hostDisconnectedAt === null,
      viewerCount: room.viewers.size
    });
  });

  // 3. Join Room
  socket.on('join-room', ({ roomId, hostToken }: { roomId: string; hostToken?: string }, callback) => {
    if (!roomManager.checkRateLimit(clientIp, 30, 60000)) {
      return callback?.({ success: false, error: 'Rate limit exceeded. Please wait a moment.' });
    }

    if (!roomId) {
      return callback?.({ success: false, error: 'Room ID is required.' });
    }

    const cleanId = roomId.toLowerCase().trim();
    const room = roomManager.getRoom(cleanId);

    if (!room || room.status !== 'active') {
      return callback?.({ success: false, error: 'Room does not exist or has already ended.' });
    }

    // Host reconnection check
    if (hostToken && room.hostToken === hostToken) {
      const reclaimed = roomManager.reclaimHost(cleanId, socket.id, hostToken);
      if (reclaimed) {
        socket.join(cleanId);
        socket.to(cleanId).emit('host-reconnected');
        return callback?.({
          success: true,
          isHost: true,
          isSharing: room.isSharing,
          viewerCount: room.viewers.size,
          existingViewers: Array.from(room.viewers.keys())
        });
      }
    }

    // Otherwise join as a viewer
    const added = roomManager.addViewer(cleanId, socket.id);
    if (!added) {
      return callback?.({ success: false, error: 'Failed to join room.' });
    }

    socket.join(cleanId);

    // Notify room of updated viewer count
    io.to(cleanId).emit('viewer-count-updated', { count: room.viewers.size });

    // Notify host that a new viewer joined so host can initiate WebRTC peer connection
    if (room.hostSocketId) {
      io.to(room.hostSocketId).emit('viewer-joined', {
        viewerSocketId: socket.id
      });
    }

    callback?.({
      success: true,
      isHost: false,
      isSharing: room.isSharing,
      isHostConnected: room.hostDisconnectedAt === null,
      viewerCount: room.viewers.size
    });
  });

  // 4. Host Screen Sharing Lifecycle
  socket.on('host-started-sharing', ({ roomId }: { roomId: string }, callback) => {
    const cleanId = roomId?.toLowerCase().trim();
    const room = roomManager.getRoom(cleanId);
    if (!room || room.hostSocketId !== socket.id) {
      return callback?.({ success: false, error: 'Unauthorized. Only host can share.' });
    }

    roomManager.setScreenSharing(cleanId, true);
    // Broadcast to viewers that host started sharing
    socket.to(cleanId).emit('host-started-sharing');

    // Return the list of connected viewer socket IDs to host so host can initiate connections
    const viewerSocketIds = Array.from(room.viewers.keys());
    callback?.({ success: true, viewers: viewerSocketIds });
  });

  socket.on('host-stopped-sharing', ({ roomId }: { roomId: string }) => {
    const cleanId = roomId?.toLowerCase().trim();
    const room = roomManager.getRoom(cleanId);
    if (!room || room.hostSocketId !== socket.id) return;

    roomManager.setScreenSharing(cleanId, false);
    sfuManager.closeProducer(cleanId);
    socket.to(cleanId).emit('host-stopped-sharing');
  });

  // --- MEDIASOUP SFU ENDPOINTS (1-to-Many Video Relay for 60+ Viewers) ---
  socket.on('sfu-get-rtp-capabilities', async ({ roomId }: { roomId: string }, callback) => {
    try {
      const cleanId = roomId?.toLowerCase().trim();
      const rtpCapabilities = await sfuManager.getRtpCapabilities(cleanId);
      callback?.({ success: true, rtpCapabilities });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('sfu-create-transport', async ({ roomId }: { roomId: string }, callback) => {
    try {
      const cleanId = roomId?.toLowerCase().trim();
      const params = await sfuManager.createTransport(cleanId, socket.id);
      callback?.({ success: true, params });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('sfu-connect-transport', async ({ transportId, dtlsParameters }: { transportId: string; dtlsParameters: any }, callback) => {
    try {
      await sfuManager.connectTransport(transportId, dtlsParameters);
      callback?.({ success: true });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('sfu-produce', async ({
    roomId,
    transportId,
    kind,
    rtpParameters
  }: {
    roomId: string;
    transportId: string;
    kind: any;
    rtpParameters: any;
  }, callback) => {
    try {
      const cleanId = roomId?.toLowerCase().trim();
      const room = roomManager.getRoom(cleanId);
      if (!room || room.hostSocketId !== socket.id) {
        return callback?.({ success: false, error: 'Unauthorized. Only host can produce stream.' });
      }

      const result = await sfuManager.produce(cleanId, transportId, kind, rtpParameters);
      roomManager.setScreenSharing(cleanId, true);

      // Broadcast to all viewers in the room that the SFU video feed is ready
      socket.to(cleanId).emit('sfu-new-producer');
      callback?.({ success: true, id: result.id });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  socket.on('sfu-check-producer', ({ roomId }: { roomId: string }, callback) => {
    const cleanId = roomId?.toLowerCase().trim();
    const hasProd = sfuManager.hasProducer(cleanId);
    callback?.({ hasProducer: hasProd });
  });

  socket.on('sfu-consume', async ({
    roomId,
    transportId,
    rtpCapabilities
  }: {
    roomId: string;
    transportId: string;
    rtpCapabilities: any;
  }, callback) => {
    try {
      const cleanId = roomId?.toLowerCase().trim();
      const params = await sfuManager.consume(cleanId, transportId, rtpCapabilities);
      callback?.({ success: true, params });
    } catch (err: any) {
      callback?.({ success: false, error: err.message });
    }
  });

  // Viewer requests stream from host (e.g. on page refresh or after re-connecting)
  socket.on('request-stream', ({ roomId }: { roomId: string }) => {
    const cleanId = roomId?.toLowerCase().trim();
    const room = roomManager.getRoom(cleanId);
    if (room && room.hostSocketId) {
      io.to(room.hostSocketId).emit('request-stream', {
        viewerSocketId: socket.id
      });
    }
  });

  // 5. WebRTC Signaling Exchanges
  socket.on('webrtc-offer', ({ targetSocketId, sdp }: { targetSocketId: string; sdp: any }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;
    // Security check: only host can send offers to viewers
    if (room.hostSocketId !== socket.id) return;

    io.to(targetSocketId).emit('webrtc-offer', {
      senderSocketId: socket.id,
      sdp
    });
  });

  socket.on('webrtc-answer', ({ targetSocketId, sdp }: { targetSocketId: string; sdp: any }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;
    // Security check: answer should target host
    if (targetSocketId !== room.hostSocketId) return;

    io.to(targetSocketId).emit('webrtc-answer', {
      senderSocketId: socket.id,
      sdp
    });
  });

  socket.on('webrtc-ice-candidate', ({ targetSocketId, candidate }: { targetSocketId: string; candidate: any }) => {
    const room = roomManager.getRoomBySocket(socket.id);
    if (!room) return;
    if (!targetSocketId) return;

    io.to(targetSocketId).emit('webrtc-ice-candidate', {
      senderSocketId: socket.id,
      candidate
    });
  });

  // 6. Laser Pointer Position Sync
  socket.on('laser-pointer-update', ({
    roomId,
    x,
    y,
    active
  }: {
    roomId: string;
    x: number;
    y: number;
    active: boolean;
  }) => {
    const cleanId = roomId?.toLowerCase().trim();
    const room = roomManager.getRoom(cleanId);
    // Security check: verify this socket is indeed the host
    if (!room || room.hostSocketId !== socket.id) return;

    // Clamp coordinates safely between 0 and 1
    const clampedX = Math.max(0, Math.min(1, typeof x === 'number' ? x : 0));
    const clampedY = Math.max(0, Math.min(1, typeof y === 'number' ? y : 0));

    // Broadcast in real-time to viewers
    socket.to(cleanId).emit('laser-pointer-update', {
      x: clampedX,
      y: clampedY,
      active: Boolean(active)
    });
  });

  // 7. End Room by Host
  socket.on('end-room', ({ roomId, hostToken }: { roomId: string; hostToken: string }, callback) => {
    const cleanId = roomId?.toLowerCase().trim();
    const room = roomManager.getRoom(cleanId);
    if (!room || (room.hostSocketId !== socket.id && room.hostToken !== hostToken)) {
      return callback?.({ success: false, error: 'Unauthorized to end room.' });
    }

    io.to(cleanId).emit('room-ended', { reason: 'The host has ended this room session.' });
    roomManager.endRoom(cleanId);
    sfuManager.closeRoom(cleanId);
    callback?.({ success: true });
  });

  // 8. Disconnection Handling
  socket.on('disconnect', () => {
    sfuManager.closeSocket(socket.id);
    const result = roomManager.removeSocket(socket.id);
    if (!result.roomId) return;

    const roomId = result.roomId;

    if (result.wasHost) {
      // Host temporarily disconnected: notify viewers
      socket.to(roomId).emit('host-disconnected', {
        message: 'The host was disconnected. Waiting for host to reconnect...',
        gracePeriodMs: 45000
      });

      // Schedule room termination if host does not reconnect
      setTimeout(() => {
        const room = roomManager.getRoom(roomId);
        if (room && room.hostDisconnectedAt !== null) {
          io.to(roomId).emit('room-ended', { reason: 'The host has left and the session has ended.' });
          roomManager.endRoom(roomId);
          sfuManager.closeRoom(roomId);
        }
      }, 45000);
    } else {
      // Viewer disconnected: update viewer count and notify host
      io.to(roomId).emit('viewer-count-updated', { count: result.viewerCount });
      const room = roomManager.getRoom(roomId);
      if (room && room.hostSocketId) {
        io.to(room.hostSocketId).emit('viewer-left', { viewerSocketId: socket.id });
      }
    }
  });
});

// Fallback to client index.html for SPA client-side routing
app.get('*', (_req, res) => {
  const indexPath = path.join(clientBuildPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      res.status(404).send('Minimal Screen Share API Server running.');
    }
  });
});

// Initialize SFU Media Worker and Start Server
sfuManager.init().then(() => {
  server.listen(PORT, () => {
    console.log(`[Server] Minimal Screen Sharing backend (with SFU Media Relay) listening on port ${PORT}`);
  });
}).catch((err) => {
  console.error('[Server] SFU initialization failed, starting fallback signaling server:', err);
  server.listen(PORT, () => {
    console.log(`[Server] Minimal Screen Sharing backend listening on port ${PORT}`);
  });
});
