# Free Render Deployment

This project currently uses a free-first, server-authoritative realtime setup:

- Render Free Web Service hosts the page, room flow, and WebSocket realtime transport.
- The browser sends local input immediately to Render while also showing local hit feedback for the controlling player.
- Render remains authoritative for puck physics, scoring, pause, reset, and final correction.
- WebRTC peer gameplay prediction is disabled in production because it can make the puck react to non-authoritative remote hints and create non-physical motion.

## Render

`render.yaml` keeps the service on the free plan:

```yaml
plan: free
region: singapore
```

The service exposes:

- `/` for the game
- `/ws` for authoritative WebSocket realtime
- `/runtime-config.js` for browser runtime config
- `/healthz` for optional uptime checks

## Runtime Behavior

The code path is intentionally WebSocket-first on Render Free. This keeps all multiplayer modes using the same server-owned physics result instead of mixing authoritative state with peer-to-peer prediction.

## Optional Free Keepalive

Render Free web services spin down after idle time. If you want fewer cold starts during testing, point a free uptime monitor at:

```text
https://air-hockey-online-kaleido1.onrender.com/healthz
```

Use an interval longer than 10 minutes and keep an eye on Render's free instance-hour and bandwidth limits.

## Current Transport Behavior

All inputs go to Render over WebSocket. The local player still gets immediate visual/audio hit feedback, but puck ownership, collisions, goals, reset, pause, and final corrections all come back from the authoritative server.
