# Air Hockey Online

[English](./README.md) | [中文](./README.zh-CN.md)

Air Hockey Online is a browser-based arcade air hockey game built for fast, competitive play across phones, tablets, and desktop browsers. It supports local play, wireless LAN play, and full online multiplayer play.

Play now:

https://air-hockey-online-kaleido1.onrender.com/

## Multi-Device Support

- Mobile, tablet, and desktop browser support with touch-first controls.
- Responsive canvas rendering tuned for different refresh rates and screen densities.
- Same ruleset and synchronized game flow across local, LAN, and online sessions.
- Chinese and English UI with built-in language switching.

## Multiplayer

### Wireless Two Players

Wireless mode is designed for players on the same local network. Two nearby devices can join quickly and start a match without sharing a public room link.

### Online Two Players

Online mode supports remote play through room creation and room join flows. Players can create a room, share the room code, reconnect, leave, and return to the same session flow with server-authoritative state sync.

## Features

- Single-player mode with an upgraded AI opponent that can defend, change tempo, and attack different lanes.
- Same-device two-player mode with multi-touch control support.
- Wireless two-player mode for devices on the same network.
- Online two-player matchmaking with room codes and synchronized multiplayer state.
- One-puck and two-puck match options.
- Server-authoritative puck, mallet, scoring, and match-state logic.
- Fast collision response tuned for competitive play.
- First-to-7 scoring with pause, goal, and game-over states.
- Touch-friendly gameplay with browser-based instant play.

## Technology

- Node.js HTTP server with a lightweight WebSocket implementation.
- Canvas rendering for the rink, puck, mallets, overlays, and menus.
- Server-authoritative physics and multiplayer synchronization.
- Bilingual interface and browser-based multiplayer session management.
