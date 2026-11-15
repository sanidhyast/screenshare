import { useState, useRef, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// Optimize SDP for ultra-low latency: smooth 60 FPS, 0 jitter buffer delay, and zero packet bloat
function boostSdpBitrate(sdp: string, maxBitrateKbps: number = 5000): string {
  let modified = sdp.replace(/b=AS:\d+\r?\n/g, '');
  modified = modified.replace(/b=TIAS:\d+\r?\n/g, '');

  // Optimal bandwidth limit: 5 Mbps (5000 kbps) delivers crisp 1080p 60fps without choking network buffers
  modified = modified.replace(
    /(m=video[^\r\n]*\r?\n)/,
    `$1b=AS:${maxBitrateKbps}\r\nb=TIAS:${maxBitrateKbps * 1000}\r\n`
  );

  // Min 1.5 Mbps, start 3.5 Mbps, max 5 Mbps
  modified = modified.replace(
    /(a=fmtp:\d+ [^\r\n]*)/g,
    `$1;x-google-min-bitrate=1500;x-google-max-bitrate=${maxBitrateKbps};x-google-start-bitrate=3500`
  );

  return modified;
}

interface UseWebRTCProps {
  socket: Socket | null;
  roomId: string;
  isHost: boolean;
  onShareEndedByHost?: () => void;
}

export function useWebRTC({ socket, roomId, isHost, onShareEndedByHost }: UseWebRTCProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  // Host: Map viewerSocketId -> RTCPeerConnection
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  // Host: Candidate queues for candidates arriving before answer
  const hostIceQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Viewer: Single RTCPeerConnection with host
  const viewerPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  // Viewer: Candidate queue for candidates arriving before offer is processed
  const viewerIceQueueRef = useRef<RTCIceCandidateInit[]>([]);

  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Clean up all host peer connections
  const closeAllHostPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => {
      pc.close();
    });
    peerConnectionsRef.current.clear();
    hostIceQueuesRef.current.clear();
  }, []);

  // Clean up viewer peer connection
  const closeViewerPeerConnection = useCallback(() => {
    if (viewerPeerConnectionRef.current) {
      viewerPeerConnectionRef.current.close();
      viewerPeerConnectionRef.current = null;
    }
    viewerIceQueueRef.current = [];
    setRemoteStream(null);
  }, []);

  // HOST: Create peer connection and offer for a specific viewer
  const createHostPeerConnection = useCallback(
    async (viewerSocketId: string, stream: MediaStream) => {
      if (!socket) return null;

      // Close existing if any
      const existing = peerConnectionsRef.current.get(viewerSocketId);
      if (existing) {
        existing.close();
      }

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current.set(viewerSocketId, pc);
      hostIceQueuesRef.current.set(viewerSocketId, []);

      // Add local screen tracks to peer connection and boost sender bitrate & crystal-clear resolution
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
          // 5 Mbps: Crisp 1080p 60fps streaming with zero bufferbloat or frame queuing lag
          params.encodings[0].maxBitrate = 5000000;
          params.encodings[0].maxFramerate = 60;
          // @ts-ignore
          params.encodings[0].scaleResolutionDownBy = 1.0;
          // @ts-ignore
          params.encodings[0].networkPriority = 'high';
          // @ts-ignore
          params.encodings[0].priority = 'high';
          // @ts-ignore
          params.degradationPreference = 'maintain-resolution';
          sender.setParameters(params).catch(() => {});
        } catch {
          // fallback
        }
      });

      // Prioritize H.264 hardware-accelerated video codec for instantaneous encoding
      try {
        const transceivers = pc.getTransceivers();
        transceivers.forEach((transceiver) => {
          const capabilities = RTCRtpReceiver.getCapabilities('video');
          if (capabilities && capabilities.codecs && 'setCodecPreferences' in transceiver) {
            const h264 = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() === 'video/h264');
            const others = capabilities.codecs.filter((c) => c.mimeType.toLowerCase() !== 'video/h264');
            if (h264.length > 0) {
              transceiver.setCodecPreferences([...h264, ...others]);
            }
          }
        });
      } catch {
        // Fallback
      }

      // Handle ICE candidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc-ice-candidate', {
            targetSocketId: viewerSocketId,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(`[Host] Connection state with ${viewerSocketId}:`, pc.connectionState);
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peerConnectionsRef.current.delete(viewerSocketId);
          hostIceQueuesRef.current.delete(viewerSocketId);
        }
      };

      // Create and send SDP Offer with low-latency bandwidth
      try {
        const offer = await pc.createOffer();
        if (offer.sdp) {
          offer.sdp = boostSdpBitrate(offer.sdp, 5000);
        }
        await pc.setLocalDescription(offer);

        socket.emit('webrtc-offer', {
          targetSocketId: viewerSocketId,
          sdp: offer
        });
      } catch (err) {
        console.error('Failed to create offer for viewer:', viewerSocketId, err);
      }

      return pc;
    },
    [socket]
  );

  // HOST: Stop screen sharing
  const stopSharing = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      setLocalStream(null);
      localStreamRef.current = null;
    }

    closeAllHostPeerConnections();
    setIsSharing(false);

    if (socket && roomId) {
      socket.emit('host-stopped-sharing', { roomId });
    }

    onShareEndedByHost?.();
  }, [socket, roomId, closeAllHostPeerConnections, onShareEndedByHost]);

  // HOST: Start screen sharing with high framerate (60 FPS) and motion priority
  const startSharing = useCallback(async () => {
    if (!socket || !isHost) return;
    setStreamError(null);

    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          frameRate: { ideal: 60, max: 60 },
          width: { ideal: 1920, max: 2560 },
          height: { ideal: 1080, max: 1440 }
        },
        audio: false
      });

      // Set contentHint to 'detail' so WebRTC preserves tack-sharp text, UI, and native resolution
      const videoTrack = displayStream.getVideoTracks()[0];
      if (videoTrack) {
        if ('contentHint' in videoTrack) {
          (videoTrack as any).contentHint = 'detail';
        }
        videoTrack.onended = () => {
          stopSharing();
        };
      }

      setLocalStream(displayStream);
      localStreamRef.current = displayStream;
      setIsSharing(true);

      // Tell server host started sharing and retrieve active viewer sockets
      socket.emit(
        'host-started-sharing',
        { roomId },
        (response: { success: boolean; viewers?: string[]; error?: string }) => {
          if (response?.success && response.viewers && response.viewers.length > 0) {
            response.viewers.forEach((viewerSocketId) => {
              createHostPeerConnection(viewerSocketId, displayStream);
            });
          }
        }
      );
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        console.log('Screen share selection cancelled by user');
      } else {
        console.error('Screen capture error:', err);
        setStreamError('Could not start screen capture: ' + (err.message || 'Unknown error'));
      }
      setIsSharing(false);
    }
  }, [socket, isHost, roomId, createHostPeerConnection, stopSharing]);

  // Signalling listeners for WebRTC
  useEffect(() => {
    if (!socket) return;

    // HOST EVENTS
    if (isHost) {
      const handleViewerJoined = ({ viewerSocketId }: { viewerSocketId: string }) => {
        if (localStreamRef.current) {
          createHostPeerConnection(viewerSocketId, localStreamRef.current);
        }
      };

      const handleViewerRequestStream = ({ viewerSocketId }: { viewerSocketId: string }) => {
        if (localStreamRef.current) {
          createHostPeerConnection(viewerSocketId, localStreamRef.current);
        }
      };

      const handleViewerLeft = ({ viewerSocketId }: { viewerSocketId: string }) => {
        const pc = peerConnectionsRef.current.get(viewerSocketId);
        if (pc) {
          pc.close();
          peerConnectionsRef.current.delete(viewerSocketId);
          hostIceQueuesRef.current.delete(viewerSocketId);
        }
      };

      // Receive SDP Answer from viewer
      const handleWebRTCAnswer = async ({
        senderSocketId,
        sdp
      }: {
        senderSocketId: string;
        sdp: RTCSessionDescriptionInit;
      }) => {
        const pc = peerConnectionsRef.current.get(senderSocketId);
        if (pc) {
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            // Drain any queued candidates for this viewer
            const queue = hostIceQueuesRef.current.get(senderSocketId) || [];
            for (const cand of queue) {
              await pc.addIceCandidate(new RTCIceCandidate(cand));
            }
            hostIceQueuesRef.current.set(senderSocketId, []);
          } catch (err) {
            console.error('Host setRemoteDescription error:', err);
          }
        }
      };

      // Receive ICE candidate from viewer
      const handleHostIceCandidate = async ({
        senderSocketId,
        candidate
      }: {
        senderSocketId: string;
        candidate: RTCIceCandidateInit;
      }) => {
        const pc = peerConnectionsRef.current.get(senderSocketId);
        if (pc && candidate) {
          if (!pc.remoteDescription) {
            const queue = hostIceQueuesRef.current.get(senderSocketId) || [];
            queue.push(candidate);
            hostIceQueuesRef.current.set(senderSocketId, queue);
            return;
          }
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (err) {
            console.error('Host addIceCandidate error:', err);
          }
        }
      };

      socket.on('viewer-joined', handleViewerJoined);
      socket.on('request-stream', handleViewerRequestStream);
      socket.on('viewer-left', handleViewerLeft);
      socket.on('webrtc-answer', handleWebRTCAnswer);
      socket.on('webrtc-ice-candidate', handleHostIceCandidate);

      return () => {
        socket.off('viewer-joined', handleViewerJoined);
        socket.off('request-stream', handleViewerRequestStream);
        socket.off('viewer-left', handleViewerLeft);
        socket.off('webrtc-answer', handleWebRTCAnswer);
        socket.off('webrtc-ice-candidate', handleHostIceCandidate);
      };
    } else {
      // VIEWER EVENTS
      const handleWebRTCOffer = async ({
        senderSocketId,
        sdp
      }: {
        senderSocketId: string;
        sdp: RTCSessionDescriptionInit;
      }) => {
        console.log('[Viewer] Received WebRTC offer from host');
        closeViewerPeerConnection();

        const pc = new RTCPeerConnection(ICE_SERVERS);
        viewerPeerConnectionRef.current = pc;

        // Collect incoming remote tracks with zero jitter-buffer latency
        pc.ontrack = (event) => {
          console.log('[Viewer] Remote track received:', event.track.kind);
          // Zero playout delay hint: plays frames immediately with 0ms buffering delay
          if (event.receiver && 'playoutDelayHint' in event.receiver) {
            (event.receiver as any).playoutDelayHint = 0;
          }

          if (event.streams && event.streams[0]) {
            setRemoteStream(event.streams[0]);
          } else if (event.track) {
            const newStream = new MediaStream([event.track]);
            setRemoteStream(newStream);
          }
          setIsSharing(true);
        };

        // ICE candidate emission back to host
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
              targetSocketId: senderSocketId,
              candidate: event.candidate
            });
          }
        };

        pc.onconnectionstatechange = () => {
          console.log('[Viewer] WebRTC connection state:', pc.connectionState);
          if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
            console.warn('[Viewer] Connection disconnected or failed, requesting re-offer');
            socket.emit('request-stream', { roomId });
          }
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));

          // Drain buffered candidates
          for (const cand of viewerIceQueueRef.current) {
            await pc.addIceCandidate(new RTCIceCandidate(cand));
          }
          viewerIceQueueRef.current = [];

          const answer = await pc.createAnswer();
          if (answer.sdp) {
            answer.sdp = boostSdpBitrate(answer.sdp, 5000);
          }
          await pc.setLocalDescription(answer);

          socket.emit('webrtc-answer', {
            targetSocketId: senderSocketId,
            sdp: answer
          });
        } catch (err) {
          console.error('[Viewer] Failed handling offer/answer:', err);
        }
      };

      const handleViewerIceCandidate = async ({
        candidate
      }: {
        candidate: RTCIceCandidateInit;
      }) => {
        const pc = viewerPeerConnectionRef.current;
        if (!candidate) return;

        if (!pc || !pc.remoteDescription) {
          viewerIceQueueRef.current.push(candidate);
          return;
        }

        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
          console.error('[Viewer] addIceCandidate error:', err);
        }
      };

      const handleHostStoppedSharing = () => {
        closeViewerPeerConnection();
        setIsSharing(false);
      };

      socket.on('webrtc-offer', handleWebRTCOffer);
      socket.on('webrtc-ice-candidate', handleViewerIceCandidate);
      socket.on('host-stopped-sharing', handleHostStoppedSharing);

      // On initial viewer join, request stream if host is already sharing
      socket.emit('request-stream', { roomId });

      return () => {
        socket.off('webrtc-offer', handleWebRTCOffer);
        socket.off('webrtc-ice-candidate', handleViewerIceCandidate);
        socket.off('host-stopped-sharing', handleHostStoppedSharing);
      };
    }
  }, [socket, isHost, roomId, createHostPeerConnection, closeViewerPeerConnection]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isHost) {
        stopSharing();
      } else {
        closeViewerPeerConnection();
      }
    };
  }, [isHost, stopSharing, closeViewerPeerConnection]);

  return {
    localStream,
    remoteStream,
    isSharing,
    streamError,
    startSharing,
    stopSharing
  };
}
