const { io } = require('socket.io-client');

async function testSignaling() {
  console.log('--- Starting WebRTC & Socket.IO Signaling Integration Test ---');

  const serverUrl = 'http://localhost:4000';

  // 1. Connect Host
  const hostSocket = io(serverUrl, { transports: ['websocket'] });
  await new Promise((resolve) => hostSocket.on('connect', resolve));
  console.log('✓ Host connected to Socket.IO server (ID:', hostSocket.id, ')');

  // 2. Host creates room
  const createRes = await new Promise((resolve) => {
    hostSocket.emit('create-room', resolve);
  });
  console.log('✓ Host created room:', createRes);
  if (!createRes.success || !createRes.roomId || !createRes.hostToken) {
    throw new Error('Create room failed');
  }
  const roomId = createRes.roomId;
  const hostToken = createRes.hostToken;

  // 3. Connect Viewer
  const viewerSocket = io(serverUrl, { transports: ['websocket'] });
  await new Promise((resolve) => viewerSocket.on('connect', resolve));
  console.log('✓ Viewer connected to Socket.IO server (ID:', viewerSocket.id, ')');

  // 4. Viewer validates room
  const validateRes = await new Promise((resolve) => {
    viewerSocket.emit('validate-room', { roomId }, resolve);
  });
  console.log('✓ Viewer validated room:', validateRes);
  if (!validateRes.exists) throw new Error('Room validation failed');

  // 5. Setup Host listener for new viewer
  const viewerJoinedPromise = new Promise((resolve) => {
    hostSocket.on('viewer-joined', (data) => {
      console.log('✓ Host received viewer-joined event:', data);
      resolve(data);
    });
  });

  // 6. Viewer joins room
  const joinRes = await new Promise((resolve) => {
    viewerSocket.emit('join-room', { roomId }, resolve);
  });
  console.log('✓ Viewer joined room response:', joinRes);
  if (!joinRes.success || joinRes.isHost !== false) {
    throw new Error('Viewer join-room failed');
  }

  await viewerJoinedPromise;

  // 7. Host starts sharing
  const viewerSharingPromise = new Promise((resolve) => {
    viewerSocket.on('host-started-sharing', () => {
      console.log('✓ Viewer received host-started-sharing notification');
      resolve(true);
    });
  });

  const shareRes = await new Promise((resolve) => {
    hostSocket.emit('host-started-sharing', { roomId, hostToken }, resolve);
  });
  console.log('✓ Host started sharing response:', shareRes);
  if (!shareRes.success || !shareRes.viewers.includes(viewerSocket.id)) {
    throw new Error('Host start sharing failed');
  }

  await viewerSharingPromise;

  // 8. Laser pointer synchronization test
  const laserPromise = new Promise((resolve) => {
    viewerSocket.on('laser-pointer-update', (data) => {
      console.log('✓ Viewer received real-time laser update:', data);
      resolve(data);
    });
  });

  hostSocket.emit('laser-pointer-update', {
    roomId,
    x: 0.42,
    y: 0.68,
    active: true
  });

  const laserData = await laserPromise;
  if (laserData.x !== 0.42 || laserData.y !== 0.68 || !laserData.active) {
    throw new Error('Laser pointer coordinate sync failed');
  }

  // 9. WebRTC SDP Offer / Answer forwarding test
  const offerPromise = new Promise((resolve) => {
    viewerSocket.on('webrtc-offer', (data) => {
      console.log('✓ Viewer received webrtc-offer from host:', data.sdp.type);
      resolve(data);
    });
  });

  hostSocket.emit('webrtc-offer', {
    targetSocketId: viewerSocket.id,
    sdp: { type: 'offer', sdp: 'v=0\r\ntest-offer' }
  });

  await offerPromise;

  const answerPromise = new Promise((resolve) => {
    hostSocket.on('webrtc-answer', (data) => {
      console.log('✓ Host received webrtc-answer from viewer:', data.sdp.type);
      resolve(data);
    });
  });

  viewerSocket.emit('webrtc-answer', {
    targetSocketId: hostSocket.id,
    sdp: { type: 'answer', sdp: 'v=0\r\ntest-answer' }
  });

  await answerPromise;

  // 10. Host ends room
  const roomEndedPromise = new Promise((resolve) => {
    viewerSocket.on('room-ended', (data) => {
      console.log('✓ Viewer received room-ended event:', data.reason);
      resolve(data);
    });
  });

  const endRes = await new Promise((resolve) => {
    hostSocket.emit('end-room', { roomId, hostToken }, resolve);
  });
  console.log('✓ Host end-room response:', endRes);

  await roomEndedPromise;

  // Disconnect sockets
  hostSocket.disconnect();
  viewerSocket.disconnect();

  console.log('🎉 ALL INTEGRATION TESTS PASSED PERFECTLY!');
  process.exit(0);
}

testSignaling().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
