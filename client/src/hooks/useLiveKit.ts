import { useState, useRef, useCallback, useEffect } from 'react';
import { Room, RoomEvent, Track, RemoteTrack, TrackPublication } from 'livekit-client';

interface UseLiveKitProps {
  livekitInfo?: { url: string; token: string } | null;
  isHost: boolean;
  onShareEndedByHost?: () => void;
}

export function useLiveKit({ livekitInfo, isHost, onShareEndedByHost }: UseLiveKitProps) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [streamError, setStreamError] = useState<string | null>(null);

  const roomRef = useRef<Room | null>(null);

  // Connect to LiveKit Room
  useEffect(() => {
    if (!livekitInfo?.url || !livekitInfo?.token) return;

    let isSubscribed = true;
    const room = new Room({
      adaptiveStream: true,
      dynacast: true
    });
    roomRef.current = room;

    const handleTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video && track.mediaStreamTrack) {
        const stream = new MediaStream([track.mediaStreamTrack]);
        setRemoteStream(stream);
        setIsSharing(true);
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Video) {
        setRemoteStream(null);
        setIsSharing(false);
      }
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);

    room.connect(livekitInfo.url, livekitInfo.token).then(() => {
      if (!isSubscribed) return;
      // If room already has existing active remote tracks
      room.remoteParticipants.forEach((participant) => {
        participant.trackPublications.forEach((pub: TrackPublication) => {
          if (pub.track && pub.track.kind === Track.Kind.Video && pub.track.mediaStreamTrack) {
            setRemoteStream(new MediaStream([pub.track.mediaStreamTrack]));
            setIsSharing(true);
          }
        });
      });
    }).catch((err) => {
      console.error('[LiveKit] Connection error:', err);
      setStreamError('Could not connect to broadcast server: ' + (err.message || 'Error'));
    });

    return () => {
      isSubscribed = false;
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
      room.disconnect();
      roomRef.current = null;
    };
  }, [livekitInfo?.url, livekitInfo?.token]);

  // HOST: Start screen sharing
  const startSharing = useCallback(async () => {
    const room = roomRef.current;
    if (!room || !isHost) return;
    setStreamError(null);

    try {
      const pub = await room.localParticipant.setScreenShareEnabled(true, {
        audio: false,
        resolution: { width: 1920, height: 1080, frameRate: 60 },
        contentHint: 'detail'
      });

      if (pub && pub.track && pub.track.mediaStreamTrack) {
        const ms = new MediaStream([pub.track.mediaStreamTrack]);
        setLocalStream(ms);
        setIsSharing(true);

        pub.track.mediaStreamTrack.onended = () => {
          stopSharing();
        };
      }
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        console.log('Screen share cancelled by user');
      } else {
        console.error('[LiveKit] Screen share error:', err);
        setStreamError('Failed to start screen share: ' + (err.message || 'Unknown error'));
      }
      setIsSharing(false);
    }
  }, [isHost]);

  // HOST: Stop screen sharing
  const stopSharing = useCallback(async () => {
    const room = roomRef.current;
    if (room && isHost) {
      try {
        await room.localParticipant.setScreenShareEnabled(false);
      } catch (err) {
        console.warn('[LiveKit] Error disabling screen share:', err);
      }
    }

    if (localStream) {
      localStream.getTracks().forEach((t) => t.stop());
    }
    setLocalStream(null);
    setIsSharing(false);
    onShareEndedByHost?.();
  }, [isHost, localStream, onShareEndedByHost]);

  return {
    localStream,
    remoteStream,
    isSharing,
    streamError,
    startSharing,
    stopSharing
  };
}
