import * as mediasoup from 'mediasoup';
import {
  Worker,
  Router,
  WebRtcTransport,
  Producer,
  Consumer,
  RtpCodecCapability,
  RtpParameters,
  MediaKind,
  DtlsParameters,
  RtpCapabilities
} from 'mediasoup/node/lib/types';
import https from 'https';

const MEDIA_CODECS: RtpCodecCapability[] = [
  {
    kind: 'video',
    mimeType: 'video/H264',
    preferredPayloadType: 101,
    clockRate: 90000,
    parameters: {
      'packetization-mode': 1,
      'profile-level-id': '42e01f',
      'level-asymmetry-allowed': 1,
      'x-google-start-bitrate': 3500,
      'x-google-max-bitrate': 5000,
      'x-google-min-bitrate': 1500
    }
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    preferredPayloadType: 102,
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 3500,
      'x-google-max-bitrate': 5000,
      'x-google-min-bitrate': 1500
    }
  }
];

function fetchPublicIp(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get('https://api.ipify.org', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve(data.trim() || null);
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

export class SFUManager {
  private worker: Worker | null = null;
  private routers: Map<string, Router> = new Map();
  private transports: Map<string, WebRtcTransport> = new Map();
  private producers: Map<string, Producer> = new Map();
  private consumers: Map<string, Consumer> = new Map();
  private socketTransports: Map<string, Set<string>> = new Map();
  private announcedIp: string | null = null;

  public async init(): Promise<void> {
    try {
      // 1. Determine public/announced IP
      if (process.env.MEDIASOUP_ANNOUNCED_IP) {
        this.announcedIp = process.env.MEDIASOUP_ANNOUNCED_IP;
      } else {
        const publicIp = await fetchPublicIp();
        this.announcedIp = publicIp || '127.0.0.1';
      }
      console.log(`[SFU] Mediasoup announced IP configured as: ${this.announcedIp}`);

      // 2. Create worker
      this.worker = await mediasoup.createWorker({
        logLevel: 'warn',
        rtcMinPort: 40000,
        rtcMaxPort: 40100
      });

      this.worker.on('died', () => {
        console.error('[SFU] Mediasoup worker died, exiting...');
        setTimeout(() => process.exit(1), 2000);
      });

      console.log(`[SFU] Mediasoup worker successfully spawned (PID: ${this.worker.pid})`);
    } catch (err) {
      console.error('[SFU] Failed to initialize Mediasoup worker:', err);
    }
  }

  public async getOrCreateRouter(roomId: string): Promise<Router> {
    if (!this.worker) {
      throw new Error('SFU Worker is not initialized');
    }

    let router = this.routers.get(roomId);
    if (!router) {
      router = await this.worker.createRouter({ mediaCodecs: MEDIA_CODECS });
      this.routers.set(roomId, router);
    }
    return router;
  }

  public async getRtpCapabilities(roomId: string): Promise<RtpCapabilities> {
    const router = await this.getOrCreateRouter(roomId);
    return router.rtpCapabilities;
  }

  public async createTransport(
    roomId: string,
    socketId: string
  ): Promise<{
    id: string;
    iceParameters: any;
    iceCandidates: any[];
    dtlsParameters: any;
  }> {
    const router = await this.getOrCreateRouter(roomId);
    const transport = await router.createWebRtcTransport({
      listenIps: [
        {
          ip: '0.0.0.0',
          announcedIp: this.announcedIp || undefined
        }
      ],
      enableUdp: true,
      enableTcp: true,
      preferUdp: true,
      initialAvailableOutgoingBitrate: 3500000
    });

    this.transports.set(transport.id, transport);

    let userTransports = this.socketTransports.get(socketId);
    if (!userTransports) {
      userTransports = new Set();
      this.socketTransports.set(socketId, userTransports);
    }
    userTransports.add(transport.id);

    return {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters
    };
  }

  public async connectTransport(transportId: string, dtlsParameters: DtlsParameters): Promise<void> {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);
    await transport.connect({ dtlsParameters });
  }

  public async produce(
    roomId: string,
    transportId: string,
    kind: MediaKind,
    rtpParameters: RtpParameters
  ): Promise<{ id: string }> {
    const transport = this.transports.get(transportId);
    if (!transport) throw new Error(`Transport ${transportId} not found`);

    // Clean up previous producer in this room if any
    const oldProducer = this.producers.get(roomId);
    if (oldProducer) {
      oldProducer.close();
      this.producers.delete(roomId);
    }

    const producer = await transport.produce({ kind, rtpParameters });
    this.producers.set(roomId, producer);

    producer.on('transportclose', () => {
      this.producers.delete(roomId);
    });

    return { id: producer.id };
  }

  public hasProducer(roomId: string): boolean {
    return this.producers.has(roomId);
  }

  public getProducer(roomId: string): Producer | undefined {
    return this.producers.get(roomId);
  }

  public async consume(
    roomId: string,
    transportId: string,
    rtpCapabilities: RtpCapabilities
  ): Promise<{
    id: string;
    producerId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
  }> {
    const router = this.routers.get(roomId);
    const producer = this.producers.get(roomId);
    const transport = this.transports.get(transportId);

    if (!router || !producer || !transport) {
      throw new Error('SFU Router, Producer or Transport unavailable for room');
    }

    if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
      throw new Error('Client cannot consume producer with given RTP capabilities');
    }

    const consumer = await transport.consume({
      producerId: producer.id,
      rtpCapabilities,
      paused: true
    });

    this.consumers.set(consumer.id, consumer);

    consumer.on('transportclose', () => {
      this.consumers.delete(consumer.id);
    });
    consumer.on('producerclose', () => {
      this.consumers.delete(consumer.id);
    });

    await consumer.resume();

    return {
      id: consumer.id,
      producerId: producer.id,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters
    };
  }

  public closeProducer(roomId: string): void {
    const producer = this.producers.get(roomId);
    if (producer) {
      producer.close();
      this.producers.delete(roomId);
    }
  }

  public closeSocket(socketId: string): void {
    const transportIds = this.socketTransports.get(socketId);
    if (transportIds) {
      for (const tid of transportIds) {
        const transport = this.transports.get(tid);
        if (transport) {
          transport.close();
          this.transports.delete(tid);
        }
      }
      this.socketTransports.delete(socketId);
    }
  }

  public closeRoom(roomId: string): void {
    this.closeProducer(roomId);
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
    }
  }
}
