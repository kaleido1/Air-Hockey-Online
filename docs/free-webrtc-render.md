# Free WebRTC + Render Deployment

This project now uses a free-first realtime setup:

- Render Free Web Service hosts the page, room flow, WebSocket fallback, and WebRTC signaling.
- Browser-to-browser WebRTC DataChannel carries low-latency peer input hints when two remote humans are in the same room.
- Existing WebSocket server-authoritative sync remains the fallback and correction path.

## Render

`render.yaml` keeps the service on the free plan:

```yaml
plan: free
region: singapore
```

The service exposes:

- `/` for the game
- `/ws` for WebSocket signaling and fallback realtime
- `/runtime-config.js` for browser runtime transport config
- `/healthz` for optional uptime checks

## Free ICE Configuration

The default ICE config is STUN-only:

```json
[
  {
    "urls": ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"]
  }
]
```

This is fully free and works for many home/mobile networks. It does not include TURN relay. If two players are both behind strict NATs and cannot establish P2P, the game automatically keeps using the existing WebSocket path.

## Runtime Environment Variables

```text
AIR_HOCKEY_WEBRTC_SIGNALING=1
AIR_HOCKEY_WEBRTC_ICE_SERVERS=[{"urls":["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"]}]
```

To disable WebRTC without changing code:

```text
AIR_HOCKEY_WEBRTC_SIGNALING=0
```

## Optional Free Keepalive

Render Free web services spin down after idle time. If you want fewer cold starts during testing, point a free uptime monitor at:

```text
https://air-hockey-online-kaleido1.onrender.com/healthz
```

Use an interval longer than 10 minutes and keep an eye on Render's free instance-hour and bandwidth limits.

## Current Transport Behavior

The game still sends authoritative input to Render over WebSocket so scoring, reset, pause, and final correction remain consistent.

When WebRTC succeeds, each browser also sends its local input directly to the other browser over an unordered, zero-retransmit DataChannel. The receiving browser uses that direct input for faster opponent mallet and puck prediction, which reduces perceived multiplayer delay while preserving the existing fallback.
