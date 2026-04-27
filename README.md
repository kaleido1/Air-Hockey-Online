# Air Hockey Online

Play here:

https://air-hockey-online-kaleido1.onrender.com/

GitHub Pages mirror:

https://kaleido1.github.io/Air-Hockey-Online/

Air Hockey Online is a browser air hockey game with single-player, local two-player, and online multiplayer modes.

## Online Play

The Render link runs the full Node/WebSocket game server, so single-player, local two-player, and wireless multiplayer all work from the browser.

The GitHub Pages mirror is static, but it connects to the Render WebSocket server automatically.

On Render's free plan, the first visit after inactivity can take a short moment to wake up.

## Run Full Server Locally

```sh
npm run dev
```

Open `http://127.0.0.1:3100`.

For LAN testing on another device:

```sh
HOSTNAME=0.0.0.0 PORT=3100 npm run dev
```

Then open the computer's LAN IP from the other device.

Environment variables:

- `HOSTNAME` defaults to `127.0.0.1`
- `PORT` defaults to `3100`

## Features

- Fast air hockey physics with wall banks, mallet strikes, and first-to-7 scoring.
- One-puck and two-puck games.
- Quick match, private room codes, and practice against a bot.
- Server-authoritative WebSocket sync, so both players share the same puck state.
