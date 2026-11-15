export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'reconnecting'
  | 'failed';

export interface LaserPointerState {
  x: number; // Normalized coordinate 0.0 to 1.0 within video content
  y: number; // Normalized coordinate 0.0 to 1.0 within video content
  active: boolean;
}

export interface RoomInfo {
  roomId: string;
  isHost: boolean;
  hostToken?: string;
  isSharing: boolean;
  isHostConnected: boolean;
  viewerCount: number;
}

export interface RenderedVideoRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
