# Air Hockey Online

[English](./README.md) | [中文](./README.zh-CN.md)

<p align="center">
  <a href="https://discord.gg/W6eQPazqe">
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

Online mode supports remote play through room creation and room join flows. Players can create a room, share the room code, reconnect, leave, and return to the same session flow with server-authoritative state sync.

## Features

- Single-player practice mode with an upgraded AI opponent that can defend, change tempo, and attack different lanes.
- Same-device two-player mode with multi-touch control support.
- Wireless two-player mode for devices on the same network.
- Online two-player matchmaking with quick match, room creation, room codes, reconnect, restart, and leave flows.
- One-puck and two-puck match options.
- Server-authoritative puck, mallet, scoring, and match-state logic.
- Fast collision response tuned for competitive play, including stuck-puck rescue and safer serve placement.
- Local visual and audio feedback for hits while final online state remains server-owned.
- First-to-7 scoring with pause, goal, game-over, restart, and return-to-menu states.
- Procedural Web Audio sound effects with an iOS canvas sound gate for mobile audio unlock.
- Touch-friendly gameplay with browser-based instant play.

## Technology

- Node.js HTTP server with a lightweight WebSocket implementation.
- Server-authoritative WebSocket realtime path tuned for free Render deployment.
- Canvas rendering for the rink, puck, mallets, overlays, and menus.
- Shared game rules between server and browser through `public/offline-physics.js`.
- Matter.js-powered local/offline physics stepping and local puck prediction helpers.
- SAT circle collision checks on the server for robust puck and mallet contact resolution.
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

## License

This project is licensed under the [MIT License](./LICENSE).

Some visual or design-reference elements may be subject to additional
non-commercial restrictions. See [NOTICE](./NOTICE).
