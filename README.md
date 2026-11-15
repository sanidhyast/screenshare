# Minimal Screen Sharing Platform

A modern, lightweight, real-time screen-sharing website where one person (Host) can share their screen with multiple viewers through a private room, complete with a synchronized laser pointer.

Built with **React**, **TypeScript**, **Tailwind CSS**, **WebRTC**, **Socket.IO**, and **Node.js**.

---

## Features

- **No Accounts or Logins Required:** Instant room creation with unguessable, readable room codes (e.g. `kue-wqa`).
- **Role-Based Permissions:**
  - **Host:** Creates the room, initiates WebRTC screen sharing using `navigator.mediaDevices.getDisplayMedia`, controls the live laser pointer, and manages the room session.
  - **Viewer:** Read-only access to the host's screen stream. Viewers cannot share their screen, speak, or control the laser pointer.
- **Synchronized Laser Pointer:**
  - Host moves mouse over the screen; a glowing red laser pointer synchronizes in real time to all viewers.
  - Normalized relative coordinate mapping ($0.0 \dots 1.0$) ensures pixel-accurate alignment across different window sizes, device displays, and video letterboxing.
- **WebRTC Peer-to-Peer Streaming:** Direct, low-latency screen streaming with native STUN server negotiation.
- **Socket.IO Signaling & Lifecycle:**
  - WebRTC SDP offer/answer and ICE candidate exchange.
  - Real-time viewer count tracking.
  - Automatic host disconnection detection and reconnection grace period.
  - Graceful room termination notifications for all viewers.
- **Minimalist Dark UI/UX:**
  - Dark theme palette (`#0B0D12` background, `#151922` surface, `#6366F1` accent, `#F8FAFC` text).
  - Floating translucent glassmorphism toolbar.
  - Fullscreen viewing support.
  - Responsive across desktop, tablet, and mobile browsers.

---

## Project Structure

```text
minimal-screenshare/
├── client/                     # Frontend (React 18, Vite, TypeScript, Tailwind CSS)
│   ├── src/
│   │   ├── components/
│   │   │   ├── ConnectionBadge.tsx     # Live WebRTC / Socket status pill
│   │   │   ├── FloatingToolbar.tsx     # Minimalist glassmorphic action bar
│   │   │   ├── LaserPointer.tsx        # Glowing red laser dot overlay
│   │   │   ├── RoomHeader.tsx          # Brand, room code, and role status
│   │   │   └── WaitingPlaceholder.tsx  # Sleek waiting state placeholder
│   │   ├── hooks/
│   │   │   ├── useLaserPointer.ts      # Coordinate throttling & sync hook
│   │   │   ├── useSocket.ts            # Socket.IO connection manager
│   │   │   └── useWebRTC.ts            # 1-to-N WebRTC screen share hook
│   │   ├── pages/
│   │   │   ├── HomePage.tsx            # Clean hero landing page
│   │   │   └── RoomPage.tsx            # Host & Viewer presentation room
│   │   ├── utils/
│   │   │   └── coordinateHelper.ts     # Aspect-ratio & letterbox aware normalizer
│   │   ├── App.tsx
│   │   ├── index.css
│   │   └── main.tsx
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
├── server/                     # Backend (Node.js, Express, Socket.IO, TypeScript)
│   ├── src/
│   │   ├── index.ts            # Express server, Socket.IO signaling, SPA fallback
│   │   ├── roomManager.ts      # Room state, token validation, rate-limiter, cleanup
│   │   └── types.ts            # TypeScript interfaces
│   ├── test/
│   │   └── test_signaling.js   # Automated integration test suite
│   ├── package.json
│   └── tsconfig.json
├── package.json                # Root package with monorepo scripts
└── README.md
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [npm](https://www.npmjs.com/) (v9 or higher)

### Installation

From the project root:

```bash
npm run install:all
```

This installs dependencies for both the `server` and `client`.

### Running in Development

In two separate terminals:

1. **Start the backend signaling server** (runs on `http://localhost:4000`):
   ```bash
   npm run dev:server
   ```

2. **Start the Vite frontend development server** (runs on `http://localhost:3000` with proxying to backend):
   ```bash
   npm run dev:client
   ```

Open `http://localhost:3000` in your web browser.

### Building & Running for Production

1. Build both client and server:
   ```bash
   npm run build
   ```

2. Start the production server:
   ```bash
   npm start
   ```

The Express server serves the optimized React SPA and WebSocket signaling server together on `http://localhost:4000`.

---

## Running the Automated Test Suite

To run the signaling, room lifecycle, WebRTC negotiation, and laser pointer sync integration tests:

```bash
node server/test/test_signaling.js
```

---

## Security & Privacy

- **No Personal Data Collected:** No emails, passwords, cookies, or tracking.
- **Unguessable Rooms:** Randomly generated cryptographically secure room identifiers.
- **Host Token Security:** Only the original room creator receives a private `hostToken`, ensuring viewers cannot spoof host commands or end sessions.
- **Strict Media Permissions:** Only the host can capture display media. Audio, camera, microphone, and file sharing permissions are never requested.
