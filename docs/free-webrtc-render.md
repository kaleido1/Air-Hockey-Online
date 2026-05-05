# Free Render WebRTC Deployment

This project uses a free-first WebRTC setup:

- Render Free Web Service hosts the page, room flow, and WebSocket signaling.
- WebSocket handles matchmaking, room codes, reconnects, WebRTC offers/answers, and ICE candidates.
- Realtime gameplay runs over WebRTC DataChannel once peers connect.
- The room host browser runs the authoritative physics loop and sends state snapshots to the peer.
- TURN credentials are fetched server-side from `AIR_HOCKEY_TURN_CREDENTIALS_URL`.

## Render

`render.yaml` keeps the service on the free plan:

```yaml
plan: free
region: singapore
```

The service exposes:

- `/` for the game
- `/ws` for room and WebRTC signaling
- `/turn-credentials` for normalized browser ICE servers
- `/runtime-config.js` for browser runtime config
- `/healthz` for deployment and TURN checks

## Metered TURN

Metered's Get TURN Credential endpoint returns an ICE servers array that can be used by `RTCPeerConnection`.

Create a TURN credential in the Metered dashboard, then set this Render environment variable:

```bash
AIR_HOCKEY_TURN_CREDENTIALS_URL="https://<appname>.metered.live/api/v1/turn/credentials?apiKey=<credential-api-key>"
```

Replace `<appname>` with your Metered app name. Keep the full URL in Render environment variables only; do not commit it to the repository.

The server accepts common TURN response shapes:

- an ICE servers array
- `{ "iceServers": [...] }`
- a single `{ "urls": "...", "username": "...", "credential": "..." }` server object

## Deployment Checks

After deploying, verify Render can read the environment variable and fetch TURN credentials:

```bash
curl -s https://air-hockey-online-kaleido1.onrender.com/healthz
```

A healthy TURN-backed deployment should include:

```json
{
  "turnConfigured": true,
  "turnFetchOk": true,
  "iceServerCount": 5
}
```

You can also inspect the normalized browser-facing ICE servers:

```bash
curl -s https://air-hockey-online-kaleido1.onrender.com/turn-credentials
```

This endpoint intentionally does not expose `AIR_HOCKEY_TURN_CREDENTIALS_URL`; it only returns the ICE server data that WebRTC needs.

## Optional Free Keepalive

Render Free web services spin down after idle time. If you want fewer cold starts during testing, point a free uptime monitor at:

```text
https://air-hockey-online-kaleido1.onrender.com/healthz
```

Use an interval longer than 10 minutes and keep an eye on Render's free instance-hour and bandwidth limits.

## Current Transport Behavior

All multiplayer room setup still starts through Render over WebSocket. After both players join and the WebRTC DataChannel opens, gameplay input and state snapshots move peer-to-peer through WebRTC. TURN relays traffic only when a direct peer path is unavailable.
