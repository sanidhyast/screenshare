import { useState, useRef, useCallback, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import * as mediasoupClient from 'mediasoup-client';

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};

// Low-latency SDP optimization
function boostSdpBitrate(sdp: string, maxBitrateKbps: number = 5000): string {
  let modified = sdp.replace(/b=AS:\d+\r?\n/g, '');
  modified = modified.replace(/b=TIAS:\d+\r?\n/g, '');
  modified = modified.replace(
    /(m=video[^\r\n]*\r?\n)/,
    `$1b=AS:${maxBitrateKbps}\r\nb=TIAS:${maxBitrateKbps * 1000}\r\n`
  );
  modified = modified.replace(
    /(a=fmtp:\d+ [^\r\n]*)/g,
    `$1;x-google-min-bitrate=1500;x-google-max-bitrate=${maxBitrateKbps};x-google-start-bitrate=3500`
  );
  return modified;
}

function emitWithPromise<T = any>(socket: Socket, event: string, data?: any): Promise<T> {
  return new Promise((resolve, reject) => {
    socket.emit(event, data, (response: any) => {
      if (response && response.success === false) {
        reject(new Error(response.error || `Socket event ${event} failed`));
      } else {
        resolve(response);
      }
    });
  });
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

  // --- MEDIASOUP SFU REFS (1-to-many relay for 60+ viewers) ---
  const sfuDeviceRef = useRef<mediasoupClient.Device | null>(null);
  const sendTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const producerRef = useRef<mediasoupClient.types.Producer | null>(null);
  const recvTransportRef = useRef<mediasoupClient.types.Transport | null>(null);
  const consumerRef = useRef<mediasoupClient.types.Consumer | null>(null);
  const usingSfuRef = useRef<boolean>(false);

  // --- P2P FALLBACK REFS ---
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const hostIceQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const viewerPeerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const viewerIceQueueRef = useRef<RTCIceCandidateInit[]>([]);

  const localStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Clean up all host P2P connections
  const closeAllHostPeerConnections = useCallback(() => {
    peerConnectionsRef.current.forEach((pc) => pc.close());
    peerConnectionsRef.current.clear();
    hostIceQueuesRef.current.clear();
  }, []);

  // Clean up viewer P2P connection
  const closeViewerPeerConnection = useCallback(() => {
    if (viewerPeerConnectionRef.current) {
      viewerPeerConnectionRef.current.close();
      viewerPeerConnectionRef.current = null;
    }
    viewerIceQueueRef.current = [];
    setRemoteStream(null);
  }, []);

  // Clean up SFU resources
  const closeSfuResources = useCallback(() => {
    if (producerRef.current) {
      producerRef.current.close();
      producerRef.current = null;
    }
    if (sendTransportRef.current) {
      sendTransportRef.current.close();
      sendTransportRef.current = null;
    }
    if (consumerRef.current) {
      consumerRef.current.close();
      consumerRef.current = null;
    }
    if (recvTransportRef.current) {
      recvTransportRef.current.close();
      recvTransportRef.current = null;
    }
    sfuDeviceRef.current = null;
    usingSfuRef.current = false;
  }, []);

  // HOST: Create P2P peer connection for a specific viewer (fallback)
  const createHostPeerConnection = useCallback(
    async (viewerSocketId: string, stream: MediaStream) => {
      if (!socket || usingSfuRef.current) return null;

      const existing = peerConnectionsRef.current.get(viewerSocketId);
      if (existing) existing.close();

      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnectionsRef.current.set(viewerSocketId, pc);
      hostIceQueuesRef.current.set(viewerSocketId, []);

      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        try {
          const params = sender.getParameters();
          if (!params.encodings || params.encodings.length === 0) {
            params.encodings = [{}];
          }
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
        } catch {}
      });

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
      } catch {}

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit('webrtc-ice-candidate', {
            targetSocketId: viewerSocketId,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peerConnectionsRef.current.delete(viewerSocketId);
          hostIceQueuesRef.current.delete(viewerSocketId);
        }
      };

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

  // VIEWER: Consume from Mediasoup SFU
  const consumeFromSfu = useCallback(async () => {
    if (!socket || isHost) return;

    try {
      console.log('[SFU Viewer] Connecting to Mediasoup SFU router...');
      // 1. Get router RTP capabilities
      const rtpRes = await emitWithPromise(socket, 'sfu-get-rtp-capabilities', { roomId });
      const device = new mediasoupClient.Device();
      await device.load({ routerRtpCapabilities: rtpRes.rtpCapabilities });
      sfuDeviceRef.current = device;

      // 2. Create recv transport
      const transportRes = await emitWithPromise(socket, 'sfu-create-transport', { roomId });
      const recvTransport = device.createRecvTransport(transportRes.params);
      recvTransportRef.current = recvTransport;

      recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          await emitWithPromise(socket, 'sfu-connect-transport', {
            transportId: recvTransport.id,
            dtlsParameters
          });
          callback();
        } catch (err: any) {
          errback(err);
        }
      });

      // 3. Consume video
      const consumeRes = await emitWithPromise(socket, 'sfu-consume', {
        roomId,
        transportId: recvTransport.id,
        rtpCapabilities: device.rtpCapabilities
      });

      const consumer = await recvTransport.consume(consumeRes.params);
      consumerRef.current = consumer;

      // Set zero jitter buffer delay
      const track = consumer.track;
      const stream = new MediaStream([track]);

      setRemoteStream(stream);
      setIsSharing(true);
      usingSfuRef.current = true;
      console.log('[SFU Viewer] SFU track receiving at 60 FPS!');
    } catch (err) {
      console.warn('[SFU Viewer] SFU consume failed, falling back to P2P if available:', err);
      usingSfuRef.current = false;
      socket.emit('request-stream', { roomId });
    }
  }, [socket, isHost, roomId]);

  // HOST: Stop screen sharing
  const stopSharing = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      setLocalStream(null);
      localStreamRef.current = null;
    }

    closeSfuResources();
    closeAllHostPeerConnections();
    setIsSharing(false);

    if (socket && roomId) {
      socket.emit('host-stopped-sharing', { roomId });
    }

    onShareEndedByHost?.();
  }, [socket, roomId, closeSfuResources, closeAllHostPeerConnections, onShareEndedByHost]);

  // HOST: Start screen sharing
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

      // --- Try publishing via Mediasoup SFU (1 stream for 60+ viewers) ---
      let sfuSuccess = false;
      try {
        console.log('[SFU Host] Initializing Mediasoup broadcast...');
        const rtpRes = await emitWithPromise(socket, 'sfu-get-rtp-capabilities', { roomId });
        const device = new mediasoupClient.Device();
        await device.load({ routerRtpCapabilities: rtpRes.rtpCapabilities });
        sfuDeviceRef.current = device;

        const transportRes = await emitWithPromise(socket, 'sfu-create-transport', { roomId });
        const sendTransport = device.createSendTransport(transportRes.params);
        sendTransportRef.current = sendTransport;

        sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await emitWithPromise(socket, 'sfu-connect-transport', {
              transportId: sendTransport.id,
              dtlsParameters
            });
            callback();
          } catch (err: any) {
            errback(err);
          }
        });

        sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
          try {
            const prodRes = await emitWithPromise(socket, 'sfu-produce', {
              roomId,
              transportId: sendTransport.id,
              kind,
              rtpParameters
            });
            callback({ id: prodRes.id });
          } catch (err: any) {
            errback(err);
          }
        });

        const producer = await sendTransport.produce({
          track: videoTrack,
          encodings: [
            {
              maxBitrate: 5000000,
              maxFramerate: 60,
              scaleResolutionDownBy: 1.0,
              priority: 'high',
              networkPriority: 'high'
            }
          ]
        });
        producerRef.current = producer;
        usingSfuRef.current = true;
        sfuSuccess = true;
        console.log('[SFU Host] Successfully publishing single stream to SFU (supports 60+ viewers with 0 host strain)!');
      } catch (sfuErr) {
        console.warn('[SFU Host] SFU publish failed, activating P2P mesh fallback:', sfuErr);
        usingSfuRef.current = false;
      }

      // If SFU did not activate, fall back to P2P
      if (!sfuSuccess) {
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
      }
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

  // Signalling listeners for WebRTC and SFU
  useEffect(() => {
    if (!socket) return;

    if (isHost) {
      // HOST EVENTS
      const handleViewerJoined = ({ viewerSocketId }: { viewerSocketId: string }) => {
        // If not using SFU, connect via P2P
        if (!usingSfuRef.current && localStreamRef.current) {
          createHostPeerConnection(viewerSocketId, localStreamRef.current);
        }
      };

      const handleViewerRequestStream = ({ viewerSocketId }: { viewerSocketId: string }) => {
        if (!usingSfuRef.current && localStreamRef.current) {
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
      const handleSfuNewProducer = () => {
        consumeFromSfu();
      };

      const handleWebRTCOffer = async ({
        senderSocketId,
        sdp
      }: {
        senderSocketId: string;
        sdp: RTCSessionDescriptionInit;
      }) => {
        closeViewerPeerConnection();

        const pc = new RTCPeerConnection(ICE_SERVERS);
        viewerPeerConnectionRef.current = pc;

        pc.ontrack = (event) => {
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

        pc.onicecandidate = (event) => {
          if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
              targetSocketId: senderSocketId,
              candidate: event.candidate
            });
          }
        };

        try {
          await pc.setRemoteDescription(new RTCSessionDescription(sdp));
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
        if (!candidate || !pc) return;
        if (!pc.remoteDescription) {
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
        closeSfuResources();
        closeViewerPeerConnection();
        setIsSharing(false);
      };

      socket.on('sfu-new-producer', handleSfuNewProducer);
      socket.on('webrtc-offer', handleWebRTCOffer);
      socket.on('webrtc-ice-candidate', handleViewerIceCandidate);
      socket.on('host-stopped-sharing', handleHostStoppedSharing);

      // On join, check if an SFU producer is already streaming
      socket.emit('sfu-check-producer', { roomId }, (res: { hasProducer: boolean }) => {
        if (res?.hasProducer) {
          consumeFromSfu();
        } else {
          socket.emit('request-stream', { roomId });
        }
      });

      return () => {
        socket.off('sfu-new-producer', handleSfuNewProducer);
        socket.off('webrtc-offer', handleWebRTCOffer);
        socket.off('webrtc-ice-candidate', handleViewerIceCandidate);
        socket.off('host-stopped-sharing', handleHostStoppedSharing);
      };
    }
  }, [socket, isHost, roomId, createHostPeerConnection, closeViewerPeerConnection, consumeFromSfu, closeSfuResources]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (isHost) {
        stopSharing();
      } else {
        closeSfuResources();
        closeViewerPeerConnection();
      }
    };
  }, [isHost, stopSharing, closeSfuResources, closeViewerPeerConnection]);

  return {
    localStream,
    remoteStream,
    isSharing,
    streamError,
    startSharing,
    stopSharing
  };
}
