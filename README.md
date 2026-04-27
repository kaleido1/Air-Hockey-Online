# Online Air Hockey

A no-dependency browser air hockey prototype with authoritative server physics and online rooms.

## Run

```sh
npm run dev
```

Open `http://127.0.0.1:3100` in two browser windows, create a room in one window, and join the room code from the other.

Environment variables:

- `HOSTNAME` defaults to `127.0.0.1`
- `PORT` defaults to `3100`

## Features

- Fast air hockey physics with wall banks, mallet strikes, and first-to-7 scoring.
- One-puck and two-puck games.
- Quick match, private room codes, and practice against a bot.
- Server-authoritative WebSocket sync, so both players share the same puck state.
