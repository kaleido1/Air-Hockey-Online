# Air Hockey Online

[English](./README.md) | [中文](./README.zh-CN.md)

<p align="center">
  <a href="https://discord.gg/PVx9PXAZyb">
    <img src="https://img.shields.io/badge/Discord-Join%20the%20community-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Join the Air Hockey Online Discord server">
  </a>
</p>

Air Hockey Online is a browser-based arcade air hockey game built for fast, competitive play across phones, tablets, and desktop browsers. It supports single-player practice, same-device two-player play, wireless LAN play, and full online multiplayer.

Play now:

https://air-hockey-online-kaleido1.onrender.com/

## How to Play

> Quick Controls
>
> - Double tap the center area on touch devices to pause or resume.
> - Press `Space` on desktop to pause or resume.
> - In same-device two-player mode, press `C` to switch control between the bottom and top mallet.
> - On iOS, tap the in-game sound prompt once to start the session and unlock game audio.

## Multi-Device Support

- Mobile, tablet, and desktop browser support with touch-first controls.
- Responsive canvas rendering tuned for different refresh rates and screen densities.
- Same ruleset and synchronized game flow across local, LAN, and online sessions.
- Chinese and English UI with built-in language switching.
- iOS-friendly audio activation flow for Safari and installed web-app sessions.

## Multiplayer

### Wireless Two Players

Wireless mode is designed for players on the same local network. Two nearby devices can join quickly and start a match without sharing a public room link.

### Online Two Players

Online mode supports remote play through room creation and room join flows. Players can create a room, share the room code, reconnect, leave, and return to the same session flow. The Node server keeps matchmaking and signaling on WebSocket, while active gameplay uses WebRTC DataChannel with TURN support for NAT traversal.

## Features

- Single-player practice mode with an upgraded AI opponent that can defend, change tempo, and attack different lanes.
- Same-device two-player mode with multi-touch control support.
- Wireless two-player mode for devices on the same network.
- Online two-player matchmaking with quick match, room creation, room codes, reconnect, restart, and leave flows.
- One-puck and two-puck match options.
- WebRTC DataChannel realtime play with a host-authoritative browser physics loop.
- Fast collision response tuned for competitive play, including stuck-puck rescue and safer serve placement.
- WebSocket signaling for rooms, matchmaking, reconnects, WebRTC offers/answers, and ICE candidates.
- First-to-7 scoring with pause, goal, game-over, restart, and return-to-menu states.
- Procedural Web Audio sound effects with an iOS canvas sound gate for mobile audio unlock.
- Touch-friendly gameplay with browser-based instant play.

## Technology

- Node.js HTTP server with a lightweight WebSocket implementation.
- WebRTC DataChannel transport for online and wireless multiplayer, with WebSocket kept for room signaling.
- TURN credential loading through `AIR_HOCKEY_TURN_CREDENTIALS_URL`, including Metered ICE server responses.
- Canvas rendering for the rink, puck, mallets, overlays, and menus.
- Shared browser physics helpers through `public/offline-physics.js`.
- Matter.js-powered local/offline physics stepping and local puck prediction helpers.
- SAT circle collision helpers for robust puck and mallet contact resolution.
- Procedural Web Audio effects, audio session recovery, and iOS inline-media unlock support.
- Bilingual interface, browser-based room management, and persistent language/audio preferences.

## Development

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3100/`.

Useful checks:

```bash
npm run check
npm test
```

See [Free Render Deployment](./docs/free-webrtc-render.md) for the free deployment configuration.

## WebRTC, TURN, And Metered

Online and wireless multiplayer use WebRTC DataChannel for realtime gameplay. The Node server still hosts the page and `/ws` signaling channel, but it does not need to proxy every gameplay packet once peers connect.

For reliable connections across NATs and mobile networks, configure a TURN credential URL:

```bash
AIR_HOCKEY_TURN_CREDENTIALS_URL="https://<appname>.metered.live/api/v1/turn/credentials?apiKey=<credential-api-key>"
```

With Metered, create a TURN credential in the dashboard, copy the credential API key, and replace `<appname>` with your Metered app name. Render should store this value as an environment variable, not in the repository.

Deployment checks:

```bash
curl -s https://<your-render-service>.onrender.com/healthz
```

Expected TURN-ready fields:

```json
{"turnConfigured":true,"turnFetchOk":true,"iceServerCount":5}
```

The browser fetches `/turn-credentials`, which returns only normalized ICE servers. The original Metered URL is kept server-side.

## License

This project is licensed under the [MIT License](./LICENSE).

Some visual or design-reference elements may be subject to additional
non-commercial restrictions. See [NOTICE](./NOTICE).
