export interface ViewerInfo {
  socketId: string;
  joinedAt: number;
}

export interface Room {
  id: string;
  hostSocketId: string;
  hostToken: string;
  viewers: Map<string, ViewerInfo>;
  createdAt: number;
  isSharing: boolean;
  status: 'active' | 'ended';
  lastActivity: number;
  hostDisconnectedAt: number | null;
}

export interface LaserPointerState {
  x: number; // 0.0 to 1.0 (relative to shared screen content)
  y: number; // 0.0 to 1.0
  active: boolean;
}

export interface SignalingOfferPayload {
  targetSocketId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalingAnswerPayload {
  targetSocketId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface SignalingIcePayload {
  targetSocketId: string;
  candidate: RTCIceCandidateInit;
}
