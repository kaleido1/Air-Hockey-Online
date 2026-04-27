# Air Hockey Online

Air Hockey Online is a browser-based air hockey game with polished arcade-style visuals, responsive touch controls, AI practice, same-device multiplayer, and wireless online multiplayer.

Play now:

https://air-hockey-online-kaleido1.onrender.com/

> Render free services may take a short moment to wake up after inactivity.

## Features

- Single-player mode with rhythm-based AI behavior.
- Same-device two-player mode with multi-touch support.
- Wireless two-player mode powered by WebSocket room sync.
- One-puck and two-puck match options.
- First-to-7 scoring with animated goal, win, and loss states.
- Touch-friendly controls, keyboard pause support, and smooth canvas rendering.
- Chinese and English interface with automatic language detection.

## Technology

- Node.js HTTP server with a lightweight WebSocket implementation.
- Canvas-based rendering for the game table, mallets, pucks, menus, and overlays.
- Server-authoritative game physics for synchronized multiplayer state.
- Render deployment via `render.yaml`.

## Deployment

The production build runs as a Render Web Service:

- Build command: `npm install`
- Start command: `npm start`
- Runtime: Node.js
- Required host binding: `HOST=0.0.0.0`

The live URL is:

https://air-hockey-online-kaleido1.onrender.com/
