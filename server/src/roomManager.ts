import { Room, ViewerInfo } from './types';
import crypto from 'crypto';

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  // Map socketId -> roomId
  private socketToRoom: Map<string, string> = new Map();
  // Rate limiting map: ip -> timestamps
  private rateLimits: Map<string, number[]> = new Map();

  // Host reconnect grace period: 3 minutes (allows host to refresh or reconnect without losing room)
  private readonly HOST_RECONNECT_GRACE_MS = 3 * 60 * 1000;

  constructor() {
    // Periodic check for abandoned rooms where host closed browser and didn't reconnect
    setInterval(() => this.cleanupExpiredRooms(), 60000);
  }

  /**
   * Generates a readable, unguessable room ID (e.g., 'm7k-9px')
   */
  public generateRoomId(): string {
    const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // removed easily confused characters: 0, 1, o, l, i
    let id = '';
    do {
      let part1 = '';
      let part2 = '';
      const bytes = crypto.randomBytes(6);
      for (let i = 0; i < 3; i++) {
        part1 += chars[bytes[i] % chars.length];
        part2 += chars[bytes[i + 3] % chars.length];
      }
      id = `${part1}-${part2}`;
    } while (this.rooms.has(id));

    return id;
  }

  public generateHostToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Simple rate limiter: max `limit` requests within `windowMs`
   */
  public checkRateLimit(ip: string, limit: number = 20, windowMs: number = 60000): boolean {
    const now = Date.now();
    const timestamps = (this.rateLimits.get(ip) || []).filter(t => now - t < windowMs);
    if (timestamps.length >= limit) {
      this.rateLimits.set(ip, timestamps);
      return false;
    }
    timestamps.push(now);
    this.rateLimits.set(ip, timestamps);
    return true;
  }

  public createRoom(hostSocketId: string): { roomId: string; hostToken: string } {
    const roomId = this.generateRoomId();
    const hostToken = this.generateHostToken();

    const room: Room = {
      id: roomId,
      hostSocketId,
      hostToken,
      viewers: new Map<string, ViewerInfo>(),
      createdAt: Date.now(),
      isSharing: false,
      status: 'active',
      lastActivity: Date.now(),
      hostDisconnectedAt: null
    };

    this.rooms.set(roomId, room);
    this.socketToRoom.set(hostSocketId, roomId);
    return { roomId, hostToken };
  }

  public getRoom(roomId: string): Room | undefined {
    return this.rooms.get(roomId.toLowerCase().trim());
  }

  public validateHost(roomId: string, socketIdOrToken: string): boolean {
    const room = this.getRoom(roomId);
    if (!room || room.status !== 'active') return false;
    return room.hostSocketId === socketIdOrToken || room.hostToken === socketIdOrToken;
  }

  public reclaimHost(roomId: string, newSocketId: string, hostToken: string): boolean {
    const room = this.getRoom(roomId);
    if (!room || room.status !== 'active') return false;
    if (room.hostToken !== hostToken) return false;

    // Remove old host socket mapping
    if (room.hostSocketId) {
      this.socketToRoom.delete(room.hostSocketId);
    }

    room.hostSocketId = newSocketId;
    room.hostDisconnectedAt = null;
    room.lastActivity = Date.now();
    this.socketToRoom.set(newSocketId, room.id);
    return true;
  }

  public addViewer(roomId: string, socketId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room || room.status !== 'active') return false;

    room.viewers.set(socketId, {
      socketId,
      joinedAt: Date.now()
    });
    room.lastActivity = Date.now();
    this.socketToRoom.set(socketId, room.id);
    return true;
  }

  public removeSocket(socketId: string): {
    roomId?: string;
    wasHost: boolean;
    viewerCount: number;
    roomEnded: boolean;
  } {
    const roomId = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);

    if (!roomId) {
      return { wasHost: false, viewerCount: 0, roomEnded: false };
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return { wasHost: false, viewerCount: 0, roomEnded: false };
    }

    if (room.hostSocketId === socketId) {
      room.hostDisconnectedAt = Date.now();
      room.isSharing = false;
      return {
        roomId,
        wasHost: true,
        viewerCount: room.viewers.size,
        roomEnded: false
      };
    } else {
      room.viewers.delete(socketId);
      return {
        roomId,
        wasHost: false,
        viewerCount: room.viewers.size,
        roomEnded: false
      };
    }
  }

  public setScreenSharing(roomId: string, isSharing: boolean): boolean {
    const room = this.getRoom(roomId);
    if (!room) return false;
    room.isSharing = isSharing;
    room.lastActivity = Date.now();
    return true;
  }

  public endRoom(roomId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) return false;
    room.status = 'ended';

    // Cleanup mappings
    if (room.hostSocketId) {
      this.socketToRoom.delete(room.hostSocketId);
    }
    for (const [viewerSocketId] of room.viewers) {
      this.socketToRoom.delete(viewerSocketId);
    }

    this.rooms.delete(room.id);
    return true;
  }

  public getRoomBySocket(socketId: string): Room | undefined {
    const roomId = this.socketToRoom.get(socketId);
    if (!roomId) return undefined;
    return this.rooms.get(roomId);
  }

  private cleanupExpiredRooms(): void {
    const now = Date.now();
    for (const [id, room] of this.rooms.entries()) {
      // Keep rooms alive indefinitely until explicitly ended by user; 7-day safety retention
      if (now - room.createdAt > 7 * 24 * 60 * 60 * 1000) {
        this.endRoom(id);
      }
    }
  }
}
