const { io } = require('socket.io-client');

async function testHostReconnect() {
  console.log('--- Starting Host Reconnection & Stream Recovery Test ---');
  const SERVER_URL = 'http://localhost:4000';

  let hostSocket = io(SERVER_URL, { transports: ['websocket'] });

  await new Promise((resolve) => hostSocket.on('connect', resolve));
  console.log('1. Initial host connected:', hostSocket.id);

  const roomData = await new Promise((resolve) => {
    hostSocket.emit('create-room', resolve);
  });
  console.log('2. Room created:', roomData.roomId);

  const viewerSocket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((resolve) => viewerSocket.on('connect', resolve));
  console.log('3. Viewer connected:', viewerSocket.id);

  const joinRes = await new Promise((resolve) => {
    viewerSocket.emit('join-room', { roomId: roomData.roomId }, resolve);
  });
  console.log('4. Viewer joined room:', joinRes.success, 'isHostConnected:', joinRes.isHostConnected);

  // Now simulate host disconnecting (e.g. page reload or network drop)
  const hostDisconnectedPromise = new Promise((resolve) => {
    viewerSocket.on('host-disconnected', (data) => {
      console.log('5. Viewer received host-disconnected event:', data.message);
      resolve(data);
    });
  });

  hostSocket.disconnect();
  await hostDisconnectedPromise;

  // Now simulate host reconnecting with a fresh socket and hostToken
  const reconnectedHostSocket = io(SERVER_URL, { transports: ['websocket'] });
  await new Promise((resolve) => reconnectedHostSocket.on('connect', resolve));
  console.log('6. Host reconnected with new socket ID:', reconnectedHostSocket.id);

  const hostReconnectedPromise = new Promise((resolve) => {
    viewerSocket.on('host-reconnected', () => {
      console.log('7. Viewer received host-reconnected broadcast!');
      resolve();
    });
  });

  const reclaimRes = await new Promise((resolve) => {
    reconnectedHostSocket.emit(
      'join-room',
      { roomId: roomData.roomId, hostToken: roomData.hostToken },
      resolve
    );
  });
  console.log('8. Host reclaim response:', reclaimRes.success, 'isHost:', reclaimRes.isHost);
  await hostReconnectedPromise;

  // Now host starts sharing with hostToken
  const streamRequestPromise = new Promise((resolve) => {
    reconnectedHostSocket.on('request-stream', (data) => {
      console.log('9. Host received request-stream from viewer:', data.viewerSocketId);
      resolve(data);
    });
  });

  const shareRes = await new Promise((resolve) => {
    reconnectedHostSocket.emit(
      'host-started-sharing',
      { roomId: roomData.roomId, hostToken: roomData.hostToken },
      resolve
    );
  });
  console.log('10. Host started sharing successfully:', shareRes.success, 'viewers:', shareRes.viewers);

  // Simulate viewer requesting stream
  viewerSocket.emit('request-stream', { roomId: roomData.roomId });
  await streamRequestPromise;

  // Host sends offer to viewer
  const offerPromise = new Promise((resolve) => {
    viewerSocket.on('webrtc-offer', (data) => {
      console.log('11. Viewer received webrtc-offer from reconnected host!');
      resolve(data);
    });
  });

  reconnectedHostSocket.emit('webrtc-offer', {
    targetSocketId: viewerSocket.id,
    sdp: { type: 'offer', sdp: 'v=0...' }
  });
  await offerPromise;

  console.log('🎉 RECONNECTION & RE-STREAMING TEST PASSED FLAWLESSLY!');

  reconnectedHostSocket.disconnect();
  viewerSocket.disconnect();
  process.exit(0);
}

testHostReconnect().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
