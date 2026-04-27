import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const HOST = process.env.HOST || process.env.HOSTNAME || "127.0.0.1";
const PORT = Number(process.env.PORT || 3100);

const TABLE = {
  width: 590,
  height: 1024,
  centerY: 512,
  goalWidth: 178,
  malletRadius: 54,
  puckRadius: 29,
  firstTo: 7
};

const PHYSICS_HZ = 120;
const SNAPSHOT_HZ = 60;
const DT = 1 / PHYSICS_HZ;
const MALLET_MAX_SPEED = 5200;
const HUMAN_MALLET_MAX_SPEED = 6800;
const BOT_MIN_SPEED = 2100;
const BOT_MAX_SPEED = 4550;
const PUCK_MAX_SPEED = 5500;
const PUCK_MIN_SERVE_SPEED = 520;
const PUCK_MIN_LIVE_SPEED = 120;
const WALL_RESTITUTION = 0.92;
const PUCK_RESTITUTION = 0.90;
const MALLET_RESTITUTION = 0.92;
const PUCK_SUBSTEPS = 16;
const FRICTION_PER_SECOND = 0.988;
const STUCK_SPEED = 95;
const STUCK_SECONDS = 0.38;

const rooms = new Map();
const clients = new Map();
const quickQueue = [];

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".ico", "image/x-icon"]
]);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || HOST}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(publicDir, pathname));
  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": mimeTypes.get(ext) || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

server.on("upgrade", (req, socket) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || HOST}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto
    .createHash("sha1")
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${accept}`,
      "\r\n"
    ].join("\r\n")
  );

  const client = {
    id: crypto.randomUUID(),
    playerKey: null,
    socket,
    buffer: Buffer.alloc(0),
    roomCode: null,
    playerIndex: null,
    queued: false,
    lastPongAt: Date.now()
  };

  socket.setNoDelay(true);
  clients.set(client.id, client);
  send(client, { type: "hello", clientId: client.id, table: TABLE });

  socket.on("data", (chunk) => readFrames(client, chunk));
  socket.on("end", () => disconnect(client));
  socket.on("error", () => disconnect(client));
  socket.on("close", () => disconnect(client));
});

server.listen(PORT, HOST, () => {
  console.log(`Online Air Hockey running at http://${HOST}:${PORT}`);
});

setInterval(tickRooms, 1000 / PHYSICS_HZ);
setInterval(sendSnapshots, 1000 / SNAPSHOT_HZ);
setInterval(cleanupRooms, 10_000);

function readFrames(client, chunk) {
  client.buffer = Buffer.concat([client.buffer, chunk]);

  while (client.buffer.length >= 2) {
    const first = client.buffer[0];
    const second = client.buffer[1];
    const opcode = first & 0x0f;
    const isMasked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (client.buffer.length < offset + 2) return;
      length = client.buffer.readUInt16BE(offset);
      offset += 2;
    } else if (length === 127) {
      if (client.buffer.length < offset + 8) return;
      const longLength = client.buffer.readBigUInt64BE(offset);
      if (longLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        client.socket.destroy();
        return;
      }
      length = Number(longLength);
      offset += 8;
    }

    const maskOffset = offset;
    if (isMasked) offset += 4;
    if (client.buffer.length < offset + length) return;

    let payload = client.buffer.subarray(offset, offset + length);
    if (isMasked) {
      const mask = client.buffer.subarray(maskOffset, maskOffset + 4);
      const unmasked = Buffer.allocUnsafe(payload.length);
      for (let index = 0; index < payload.length; index += 1) {
        unmasked[index] = payload[index] ^ mask[index % 4];
      }
      payload = unmasked;
    }

    client.buffer = client.buffer.subarray(offset + length);

    if (opcode === 0x8) {
      client.socket.end();
      disconnect(client);
      return;
    }

    if (opcode === 0x9) {
      sendFrame(client, payload, 0xA);
      continue;
    }

    if (opcode === 0xA) {
      client.lastPongAt = Date.now();
      continue;
    }

    if (opcode !== 0x1) continue;

    try {
      const message = JSON.parse(payload.toString("utf8"));
      handleMessage(client, message);
    } catch {
      send(client, { type: "error", message: "Bad message" });
    }
  }
}

function handleMessage(client, message) {
  if (!message || typeof message.type !== "string") return;

  switch (message.type) {
    case "quick":
      bindClientKey(client, message.key);
      quickMatch(client, normalizePuckCount(message.puckCount));
      break;
    case "create":
      bindClientKey(client, message.key);
      createRoomFor(client, {
        puckCount: normalizePuckCount(message.puckCount),
        bot: Boolean(message.bot)
      });
      break;
    case "local":
      bindClientKey(client, message.key);
      createLocalRoom(client, normalizePuckCount(message.puckCount));
      break;
    case "join":
      bindClientKey(client, message.key);
      joinRoom(
        client,
        String(message.code || "").trim().toUpperCase(),
        Number.isInteger(message.preferredIndex) ? message.preferredIndex : null
      );
      break;
    case "lan":
      bindClientKey(client, message.key);
      joinLanRoom(client, normalizePuckCount(message.puckCount));
      break;
    case "input":
      updateInput(client, message);
      break;
    case "restart":
      restartRoom(client);
      break;
    case "pause":
      togglePause(client);
      break;
    case "leave":
      leaveRoom(client, false);
      break;
    case "leaveToMenu":
      leaveRoom(client, false);
      send(client, { type: "left" });
      break;
    case "ping":
      send(client, { type: "pong", at: message.at || Date.now() });
      break;
    default:
      send(client, { type: "error", message: "Unknown message" });
  }
}

function quickMatch(client, puckCount) {
  leaveRoom(client, false);
  removeFromQueue(client);

  const matchIndex = quickQueue.findIndex(
    (entry) => entry.client.socket.writable && entry.puckCount === puckCount
  );

  if (matchIndex >= 0) {
    const [entry] = quickQueue.splice(matchIndex, 1);
    entry.client.queued = false;
    const room = makeRoom({ puckCount, quick: true });
    addPlayer(room, entry.client, 0);
    addPlayer(room, client, 1);
    startRoom(room);
    return;
  }

  client.queued = true;
  quickQueue.push({ client, puckCount, createdAt: Date.now() });
  send(client, { type: "queued", puckCount });
}

function createRoomFor(client, options = {}) {
  leaveRoom(client, false);
  removeFromQueue(client);

  const room = makeRoom({
    puckCount: options.puckCount || 1,
    bot: Boolean(options.bot)
  });

  addPlayer(room, client, 0);
  if (options.bot) {
    room.players[1] = {
      id: "bot",
      name: "Bot",
      bot: true,
      connected: true
    };
    startRoom(room);
  }
}

function createLocalRoom(client, puckCount) {
  leaveRoom(client, false);
  removeFromQueue(client);

  const room = makeRoom({
    puckCount,
    local: true
  });

  addPlayer(room, client, 0);
  room.players[1] = {
    id: client.id,
    key: client.playerKey,
    name: "Player 2",
    bot: false,
    local: true,
    connected: true
  };
  startRoom(room);
}

function joinLanRoom(client, puckCount) {
  leaveRoom(client, false);
  removeFromQueue(client);

  const reconnectRoom = findLanReconnectRoom(client);
  const room = reconnectRoom || findOpenLanRoom(puckCount) || makeRoom({ puckCount, lan: true });

  const reconnectSlot = room.players.findIndex(
    (player) =>
      player &&
      !player.bot &&
      ((client.playerKey && player.key === client.playerKey) || player.id === client.id)
  );
  const slot = reconnectSlot >= 0 ? reconnectSlot : room.players[0] ? 1 : 0;
  addPlayer(room, client, slot);
  if (canStartRoom(room)) startRoom(room);
}

function findLanReconnectRoom(client) {
  for (const room of rooms.values()) {
    if (!room.settings.lan) continue;
    const slot = room.players.findIndex(
      (player) =>
        player &&
        !player.bot &&
        ((client.playerKey && player.key === client.playerKey) || player.id === client.id)
    );
    if (slot >= 0) return room;
  }
  return null;
}

function findOpenLanRoom(puckCount) {
  let oldestRoom = null;
  for (const room of rooms.values()) {
    if (!room.settings.lan) continue;
    if (room.state.phase !== "waiting") continue;
    if (room.settings.puckCount !== puckCount) continue;
    const humans = room.players.filter((player) => player && !player.bot);
    if (humans.length >= 2) continue;
    if (!oldestRoom || room.createdAt < oldestRoom.createdAt) oldestRoom = room;
  }
  return oldestRoom;
}

function joinRoom(client, code, preferredIndex = null) {
  if (!/^[A-Z0-9]{4,6}$/.test(code)) {
    send(client, { type: "error", message: "Enter a valid room code" });
    return;
  }

  const room = rooms.get(code);
  if (!room) {
    send(client, { type: "error", message: "Room not found" });
    return;
  }

  if (room.settings.lan || room.settings.local) {
    send(client, { type: "error", message: "Room not found" });
    return;
  }

  if (room.players[1]?.bot) {
    room.players[1] = null;
  }

  const reconnectSlot = room.players.findIndex(
    (player) =>
      player &&
      !player.bot &&
      ((client.playerKey && player.key === client.playerKey) || player.id === client.id)
  );
  const preferredSlot =
    preferredIndex === 0 || preferredIndex === 1
      ? room.players[preferredIndex]
        ? -1
        : preferredIndex
      : -1;
  const slot =
    reconnectSlot >= 0
      ? reconnectSlot
      : preferredSlot >= 0
        ? preferredSlot
      : room.players[0]
        ? room.players[1]
          ? -1
          : 1
        : 0;

  if (slot === -1) {
    send(client, { type: "error", message: "Room is full" });
    return;
  }

  leaveRoom(client, false);
  removeFromQueue(client);
  addPlayer(room, client, slot);
  if (canStartRoom(room)) startRoom(room);
}

function addPlayer(room, client, playerIndex) {
  room.players[playerIndex] = {
    id: client.id,
    key: client.playerKey,
    name: `Player ${playerIndex + 1}`,
    bot: false,
    connected: true
  };
  client.roomCode = room.code;
  client.playerIndex = playerIndex;
  room.state.mallets[playerIndex].targetX = room.state.mallets[playerIndex].x;
  room.state.mallets[playerIndex].targetY = room.state.mallets[playerIndex].y;

  send(client, {
    type: "joined",
    code: room.code,
    playerIndex,
    settings: room.settings,
    table: TABLE
  });
  broadcastRoom(room, {
    type: "room",
    code: room.code,
    players: publicPlayers(room),
    settings: room.settings
  });
}

function makeRoom(options = {}) {
  const code = makeRoomCode();
  const room = {
    code,
    players: [null, null],
    settings: {
      puckCount: normalizePuckCount(options.puckCount),
      firstTo: TABLE.firstTo,
      quick: Boolean(options.quick),
      lan: Boolean(options.lan),
      local: Boolean(options.local),
      bot: Boolean(options.bot)
    },
    state: initialState(normalizePuckCount(options.puckCount)),
    phaseStartedAt: Date.now(),
    lastSnapshotAt: 0,
    lastFxAt: new Map(),
    botBrain: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  rooms.set(code, room);
  return room;
}

function startRoom(room) {
  if (!canStartRoom(room)) {
    room.state.phase = "waiting";
    room.state.phaseEndsAt = 0;
    return;
  }

  centerMallets(room.state);
  resetPucks(room, null);
  room.botBrain = null;
  room.state.phase = "countdown";
  room.state.phaseEndsAt = Date.now() + 1200;
  room.phaseStartedAt = Date.now();
  room.updatedAt = Date.now();
  broadcastRoom(room, { type: "started", code: room.code });
}

function restartRoom(client) {
  const room = currentRoom(client);
  if (!room) return;
  room.state = initialState(room.settings.puckCount);
  startRoom(room);
}

function togglePause(client) {
  const room = currentRoom(client);
  if (!room || !canStartRoom(room)) return;

  if (room.state.phase === "playing") {
    room.state.phase = "paused";
    room.state.phaseEndsAt = 0;
    room.updatedAt = Date.now();
    broadcastRoom(room, { type: "paused" });
  } else if (room.state.phase === "paused") {
    room.state.phase = "countdown";
    room.state.phaseEndsAt = Date.now() + 700;
    room.updatedAt = Date.now();
    broadcastRoom(room, { type: "resumed" });
  }
}

function leaveRoom(client, notify = true) {
  removeFromQueue(client);

  const room = currentRoom(client);
  if (!room) {
    client.roomCode = null;
    client.playerIndex = null;
    return;
  }

  const playerIndex = client.playerIndex;
  if (playerIndex !== null && room.players[playerIndex]?.id === client.id) {
    room.players[playerIndex] = null;
  }
  if (room.settings.local) {
    for (let index = 0; index < room.players.length; index += 1) {
      if (room.players[index]?.id === client.id) room.players[index] = null;
    }
  }

  client.roomCode = null;
  client.playerIndex = null;
  room.updatedAt = Date.now();

  if (notify) {
    broadcastRoom(room, {
      type: "notice",
      message: "Opponent left the room"
    });
  }

  if (!room.players[0] && !room.players[1]) {
    rooms.delete(room.code);
    return;
  }

  if (
    room.state.phase === "playing" ||
    room.state.phase === "countdown" ||
    room.state.phase === "paused"
  ) {
    room.state.phase = "waiting";
    room.state.phaseEndsAt = 0;
  }

  broadcastRoom(room, {
    type: "room",
    code: room.code,
    players: publicPlayers(room),
    settings: room.settings
  });
}

function disconnect(client) {
  if (!clients.has(client.id)) return;
  clients.delete(client.id);
  leaveRoom(client, true);
  if (!client.socket.destroyed) client.socket.destroy();
}

function bindClientKey(client, key) {
  if (typeof key !== "string") return;
  const normalized = key.trim();
  if (/^[a-f0-9-]{16,80}$/i.test(normalized)) {
    client.playerKey = normalized;
  }
}

function removeFromQueue(client) {
  client.queued = false;
  for (let index = quickQueue.length - 1; index >= 0; index -= 1) {
    if (quickQueue[index].client === client || !quickQueue[index].client.socket.writable) {
      quickQueue.splice(index, 1);
    }
  }
}

function updateInput(client, message) {
  const room = currentRoom(client);
  if (!room || client.playerIndex === null) return;
  const requestedIndex = Number(message.playerIndex);
  const playerIndex =
    room.settings.local &&
    room.players[0]?.id === client.id &&
    (requestedIndex === 0 || requestedIndex === 1)
      ? requestedIndex
      : client.playerIndex;
  const mallet = room.state.mallets[playerIndex];
  const x = clamp(Number(message.x), TABLE.malletRadius, TABLE.width - TABLE.malletRadius);
  const y = clamp(Number(message.y), TABLE.malletRadius, TABLE.height - TABLE.malletRadius);
  const constrained = constrainMallet(playerIndex, x, y);
  const previousX = mallet.x;
  const previousY = mallet.y;
  const dx = constrained.x - previousX;
  const dy = constrained.y - previousY;
  const speed = Math.hypot(dx, dy) * PHYSICS_HZ;
  const velocityScale = speed > HUMAN_MALLET_MAX_SPEED ? HUMAN_MALLET_MAX_SPEED / speed : 1;
  const keepExistingSweep =
    Number.isFinite(mallet.sweepFromX) &&
    Number.isFinite(mallet.sweepFromY) &&
    mallet.directInputUntil &&
    Date.now() < mallet.directInputUntil;
  if (!keepExistingSweep) {
    mallet.sweepFromX = previousX;
    mallet.sweepFromY = previousY;
  }
  mallet.x = constrained.x;
  mallet.y = constrained.y;
  mallet.targetX = constrained.x;
  mallet.targetY = constrained.y;
  mallet.vx = dx * PHYSICS_HZ * velocityScale;
  mallet.vy = dy * PHYSICS_HZ * velocityScale;
  mallet.directInputUntil = Date.now() + 90;
  room.updatedAt = Date.now();
}

function tickRooms() {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (!canStartRoom(room) && room.state.phase !== "waiting") {
      room.state.phase = "waiting";
      room.state.phaseEndsAt = 0;
      room.updatedAt = now;
    }

    if (room.state.phase === "waiting") continue;
    if (room.state.phase === "paused") continue;

    if (room.players[1]?.bot) updateBot(room);

    moveMallets(room.state, DT);

    if (room.state.phase === "countdown" && now >= room.state.phaseEndsAt) {
      room.state.phase = "playing";
      room.state.phaseEndsAt = 0;
    }

    if (room.state.phase === "point" && now >= room.state.phaseEndsAt) {
      resetPucks(room, room.state.lastScorer);
      room.state.phase = "countdown";
      room.state.phaseEndsAt = now + 900;
    }

    if (room.state.phase === "playing") {
      for (let substep = 0; substep < PUCK_SUBSTEPS && room.state.phase === "playing"; substep += 1) {
        stepPucks(room, DT / PUCK_SUBSTEPS);
      }
    }

    finalizeMalletSweeps(room.state);
  }
}

function finalizeMalletSweeps(state) {
  for (const mallet of state.mallets) {
    mallet.sweepFromX = mallet.x;
    mallet.sweepFromY = mallet.y;
  }
}

function moveMallets(state, dt) {
  for (let index = 0; index < state.mallets.length; index += 1) {
    const mallet = state.mallets[index];
    if (mallet.directInputUntil && Date.now() < mallet.directInputUntil) continue;
    const target = constrainMallet(index, mallet.targetX, mallet.targetY);
    const dx = target.x - mallet.x;
    const dy = target.y - mallet.y;
    const distance = Math.hypot(dx, dy);
    const speedLimit = mallet.maxSpeed || MALLET_MAX_SPEED;
    const maxMove = speedLimit * dt;
    const previousX = mallet.x;
    const previousY = mallet.y;
    mallet.sweepFromX = previousX;
    mallet.sweepFromY = previousY;

    if (distance > maxMove && distance > 0.001) {
      mallet.x += (dx / distance) * maxMove;
      mallet.y += (dy / distance) * maxMove;
    } else {
      mallet.x = target.x;
      mallet.y = target.y;
    }

    mallet.vx = (mallet.x - previousX) / dt;
    mallet.vy = (mallet.y - previousY) / dt;
  }
}

function stepPucks(room, dt) {
  const state = room.state;
  const scored = [];
  const activePucks = [];

  for (const puck of state.pucks) {
    puck.prevX = puck.x;
    puck.prevY = puck.y;
    puck.vx *= Math.pow(FRICTION_PER_SECOND, dt);
    puck.vy *= Math.pow(FRICTION_PER_SECOND, dt);

    puck.x += puck.vx * dt;
    puck.y += puck.vy * dt;

    collidePuckWithWalls(room, puck);
    const hitA = collidePuckWithMallet(room, puck, state.mallets[0]);
    if (hitA) emitFx(room, "hit", false, hitA);
    const hitB = collidePuckWithMallet(room, puck, state.mallets[1]);
    if (hitB) emitFx(room, "hit", false, hitB);
    collidePuckWithWalls(room, puck);
    rescueStuckPuck(room, puck, dt);
    capPuckSpeed(puck);

    const scorer = detectGoal(puck);
    if (scorer !== null) {
      scored.push(scorer);
    } else {
      activePucks.push(puck);
    }
  }

  state.pucks = activePucks;

  if (state.pucks.length > 1) {
    for (let a = 0; a < state.pucks.length; a += 1) {
      for (let b = a + 1; b < state.pucks.length; b += 1) {
        const puckHit = collidePucks(state.pucks[a], state.pucks[b]);
        if (puckHit) emitFx(room, "hit", false, puckHit);
        collidePuckWithWalls(room, state.pucks[a]);
        collidePuckWithWalls(room, state.pucks[b]);
      }
    }
  }

  if (scored.length > 0) awardScoredPucks(room, scored);
}

function collidePuckWithWalls(room, puck) {
  const r = TABLE.puckRadius;
  const goalLeft = TABLE.width / 2 - TABLE.goalWidth / 2;
  const goalRight = TABLE.width / 2 + TABLE.goalWidth / 2;
  let bounced = false;
  let intensity = 0;

  if (puck.x < r) {
    intensity = Math.max(intensity, Math.abs(puck.vx) / PUCK_MAX_SPEED);
    puck.x = r;
    puck.vx = Math.abs(puck.vx) * WALL_RESTITUTION;
    bounced = true;
  } else if (puck.x > TABLE.width - r) {
    intensity = Math.max(intensity, Math.abs(puck.vx) / PUCK_MAX_SPEED);
    puck.x = TABLE.width - r;
    puck.vx = -Math.abs(puck.vx) * WALL_RESTITUTION;
    bounced = true;
  }

  const insideGoal = puck.x > goalLeft && puck.x < goalRight;

  if (puck.y < r && !insideGoal) {
    intensity = Math.max(intensity, Math.abs(puck.vy) / PUCK_MAX_SPEED);
    puck.y = r;
    puck.vy = Math.abs(puck.vy) * WALL_RESTITUTION;
    bounced = true;
  } else if (puck.y > TABLE.height - r && !insideGoal) {
    intensity = Math.max(intensity, Math.abs(puck.vy) / PUCK_MAX_SPEED);
    puck.y = TABLE.height - r;
    puck.vy = -Math.abs(puck.vy) * WALL_RESTITUTION;
    bounced = true;
  }

  if (bounced) emitFx(room, "wall", false, clamp(intensity, 0.12, 0.88));
}

function rescueStuckPuck(room, puck, dt) {
  const r = TABLE.puckRadius;
  const speed = Math.hypot(puck.vx, puck.vy);
  const nearLeft = puck.x <= r + 9;
  const nearRight = puck.x >= TABLE.width - r - 9;
  const nearTop = puck.y <= r + 9;
  const nearBottom = puck.y >= TABLE.height - r - 9;
  const inCorner = (nearLeft || nearRight) && (nearTop || nearBottom);
  const againstRail = nearLeft || nearRight || nearTop || nearBottom;

  if (!againstRail || speed > STUCK_SPEED) {
    puck.stuckFor = 0;
    return;
  }

  puck.stuckFor = (puck.stuckFor || 0) + dt;
  if (!inCorner && puck.stuckFor < STUCK_SECONDS * 1.6) return;
  if (inCorner && puck.stuckFor < STUCK_SECONDS) return;

  const awayX = nearLeft ? 1 : nearRight ? -1 : puck.x < TABLE.width / 2 ? 0.55 : -0.55;
  const awayY = nearTop ? 1 : nearBottom ? -1 : puck.y < TABLE.height / 2 ? 0.55 : -0.55;
  const length = Math.hypot(awayX, awayY) || 1;
  const kick = inCorner ? 430 : 280;

  puck.x = clamp(puck.x + (awayX / length) * 18, r + 2, TABLE.width - r - 2);
  puck.y = clamp(puck.y + (awayY / length) * 18, r + 2, TABLE.height - r - 2);
  puck.vx = (awayX / length) * Math.max(kick, Math.abs(puck.vx), PUCK_MIN_LIVE_SPEED);
  puck.vy = (awayY / length) * Math.max(kick, Math.abs(puck.vy), PUCK_MIN_LIVE_SPEED);
  puck.stuckFor = 0;
  room.updatedAt = Date.now();
  emitFx(room, "wall", true, 0.28);
}

function collidePuckWithMallet(room, puck, mallet) {
  const minDistance = TABLE.puckRadius + TABLE.malletRadius;
  const startX = Number.isFinite(mallet.sweepFromX) ? mallet.sweepFromX : mallet.x;
  const startY = Number.isFinite(mallet.sweepFromY) ? mallet.sweepFromY : mallet.y;
  const puckStartX = Number.isFinite(puck.prevX) ? puck.prevX : puck.x;
  const puckStartY = Number.isFinite(puck.prevY) ? puck.prevY : puck.y;
  const sweepX = mallet.x - startX;
  const sweepY = mallet.y - startY;
  const puckDeltaX = puck.x - puckStartX;
  const puckDeltaY = puck.y - puckStartY;
  const relativeStartX = puckStartX - startX;
  const relativeStartY = puckStartY - startY;
  const relativeDeltaX = puckDeltaX - sweepX;
  const relativeDeltaY = puckDeltaY - sweepY;
  let hitT = 1;
  let contactX = mallet.x;
  let contactY = mallet.y;
  let probeX = puck.x;
  let probeY = puck.y;
  let dx = probeX - contactX;
  let dy = probeY - contactY;
  let distance = Math.hypot(dx, dy);

  if (distance >= minDistance) {
    const a = relativeDeltaX * relativeDeltaX + relativeDeltaY * relativeDeltaY;
    const b = 2 * (relativeStartX * relativeDeltaX + relativeStartY * relativeDeltaY);
    const c = relativeStartX * relativeStartX + relativeStartY * relativeStartY - minDistance * minDistance;

    let hit = false;
    if (c <= 0) {
      hit = true;
      hitT = 0;
    } else if (a > 0.000001) {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        const t0 = (-b - root) / (2 * a);
        const t1 = (-b + root) / (2 * a);
        if (t0 >= -0.05 && t0 <= 1.05) {
          hit = true;
          hitT = clamp(t0, 0, 1);
        } else if (t1 >= -0.05 && t1 <= 1.05) {
          hit = true;
          hitT = clamp(t1, 0, 1);
        }
      }
    }

    if (hit) {
      probeX = puckStartX + puckDeltaX * hitT;
      probeY = puckStartY + puckDeltaY * hitT;
      contactX = startX + sweepX * hitT;
      contactY = startY + sweepY * hitT;
      dx = probeX - contactX;
      dy = probeY - contactY;
      distance = Math.hypot(dx, dy);
    }
  }

  if (distance >= minDistance) return false;

  if (distance <= 0.001) {
    dx = puck.x - mallet.x;
    dy = puck.y - mallet.y;
    distance = Math.hypot(dx, dy);
    if (distance <= 0.001) {
      dx = 0;
      dy = -1;
      distance = 1;
    }
  }

  const nx = dx / distance;
  const ny = dy / distance;

  // Push puck out of mallet with extra separation to prevent re-overlap
  const separation = minDistance - distance + 1.5;
  puck.x = puck.x + nx * separation;
  puck.y = puck.y + ny * separation;
  puck.prevX = puck.x;
  puck.prevY = puck.y;

  // Relative velocity along the contact normal
  const rvx = puck.vx - mallet.vx;
  const rvy = puck.vy - mallet.vy;
  const relativeNormalSpeed = rvx * nx + rvy * ny;
  const strikeSpeed = Math.max(0, mallet.vx * nx + mallet.vy * ny);

  if (relativeNormalSpeed < 0) {
    // Approaching: apply elastic impulse (mallet = infinite mass)
    const impulse = -(1 + MALLET_RESTITUTION) * relativeNormalSpeed;
    puck.vx += nx * impulse;
    puck.vy += ny * impulse;
  } else {
    // Overlapping but not approaching: push puck away to prevent sticking
    const pushSpeed = Math.max(strikeSpeed * (1 + MALLET_RESTITUTION), 400);
    const puckNormalSpeed = puck.vx * nx + puck.vy * ny;
    if (puckNormalSpeed < pushSpeed) {
      puck.vx += nx * (pushSpeed - puckNormalSpeed);
      puck.vy += ny * (pushSpeed - puckNormalSpeed);
    }
  }

  // Ensure puck bounces away with minimum speed to escape the mallet
  const postNormalSpeed = puck.vx * nx + puck.vy * ny;
  const minBounce = Math.max(350, strikeSpeed * 0.5);
  if (postNormalSpeed < minBounce) {
    puck.vx += nx * (minBounce - postNormalSpeed);
    puck.vy += ny * (minBounce - postNormalSpeed);
  }

  const impactSpeed = Math.max(0, -relativeNormalSpeed);
  const intensity = clamp((impactSpeed + strikeSpeed * 0.34) / 3500, 0.14, 0.86);

  capPuckSpeed(puck);
  room.updatedAt = Date.now();
  return intensity;
}

function collidePucks(a, b) {
  const minDistance = TABLE.puckRadius * 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distance = Math.hypot(dx, dy);
  if (distance >= minDistance || distance <= 0.001) return false;

  const nx = dx / distance;
  const ny = dy / distance;
  const overlap = (minDistance - distance) / 2 + 0.5;
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;

  const dvx = b.vx - a.vx;
  const dvy = b.vy - a.vy;
  const impact = dvx * nx + dvy * ny;
  if (impact > 0) return 0;
  const intensity = clamp(Math.abs(impact) / 2400, 0.12, 0.82);

  // Equal mass elastic collision: each puck gets half the impulse
  const impulse = -(1 + PUCK_RESTITUTION) * impact * 0.5;
  a.vx -= impulse * nx;
  a.vy -= impulse * ny;
  b.vx += impulse * nx;
  b.vy += impulse * ny;
  capPuckSpeed(a);
  capPuckSpeed(b);
  return intensity;
}

function detectGoal(puck) {
  const goalLeft = TABLE.width / 2 - TABLE.goalWidth / 2;
  const goalRight = TABLE.width / 2 + TABLE.goalWidth / 2;
  const inGoal = puck.x > goalLeft && puck.x < goalRight;
  if (!inGoal) return null;
  if (puck.y < -TABLE.puckRadius) return 0;
  if (puck.y > TABLE.height + TABLE.puckRadius) return 1;
  return null;
}

function awardScoredPucks(room, scorers) {
  const state = room.state;
  if (state.phase === "gameover") return;

  let lastScorer = null;
  for (const scorer of scorers) {
    state.scores[scorer] = Math.min(TABLE.firstTo, state.scores[scorer] + 1);
    state.lastScorer = scorer;
    lastScorer = scorer;

    if (state.scores[scorer] >= TABLE.firstTo) {
      state.phase = "gameover";
      state.phaseEndsAt = 0;
      state.winner = scorer;
      break;
    }
  }

  if (state.phase !== "gameover" && state.pucks.length === 0) {
    state.phase = "point";
    state.phaseEndsAt = Date.now() + 1100;
  }

  room.updatedAt = Date.now();
  broadcastRoom(room, {
    type: "score",
    scorer: lastScorer,
    scores: state.scores,
    phase: state.phase
  });
}

function updateBot(room) {
  const now = Date.now();
  const mallet = room.state.mallets[1];
  const brain = updateBotBrain(room, now);
  const defensiveX = TABLE.width / 2;
  const defensiveY = TABLE.height * 0.22;
  let target = { x: defensiveX, y: defensiveY };
  let speed = brain.mode === "strike" ? 4300 : brain.mode === "bait" ? 2450 : 3200;

  const servePuck = room.state.pucks.find(
    (puck) => puck.y < TABLE.height / 2 && Math.hypot(puck.vx, puck.vy) < 8
  );
  if (servePuck) {
    const windup = Math.sin(now / 260) * 18;
    mallet.maxSpeed = 3400;
    mallet.targetX = clamp(servePuck.x + windup, TABLE.malletRadius, TABLE.width - TABLE.malletRadius);
    mallet.targetY = clamp(
      servePuck.y - (TABLE.malletRadius + TABLE.puckRadius - 12),
      TABLE.malletRadius,
      TABLE.height / 2 - TABLE.malletRadius - 8
    );
    return;
  }

  const threats = room.state.pucks
    .filter((puck) => puck.y < TABLE.height * 0.62 || puck.vy < -80)
    .sort((a, b) => a.y - b.y);

  if (threats.length > 0) {
    const puck = threats[0];
    const puckSpeed = Math.hypot(puck.vx, puck.vy);
    const interceptBias = puck.vy < 0 ? 0.14 : 0.06;
    const laneOffset =
      brain.mode === "bait" ? brain.side * 76 : brain.mode === "strike" ? brain.side * 34 : 0;
    const attackY =
      brain.mode === "strike" && puck.y < TABLE.height * 0.49 && puck.vy > -180
        ? puck.y + 24
        : puck.y - 86;

    target = {
      x: clamp(
        puck.x + puck.vx * interceptBias + laneOffset,
        TABLE.malletRadius,
        TABLE.width - TABLE.malletRadius
      ),
      y: clamp(attackY, TABLE.malletRadius, TABLE.height / 2 - TABLE.malletRadius - 8)
    };
    speed =
      brain.mode === "strike"
        ? clamp(3100 + puckSpeed * 0.58, 3300, BOT_MAX_SPEED)
        : brain.mode === "bait"
          ? clamp(2050 + puckSpeed * 0.22, BOT_MIN_SPEED, 2850)
          : clamp(2550 + puckSpeed * 0.35, 2600, 3700);
  } else if (brain.mode === "bait") {
    target = {
      x: clamp(defensiveX + brain.side * 96, TABLE.malletRadius, TABLE.width - TABLE.malletRadius),
      y: TABLE.height * 0.25
    };
  }

  target.x += Math.sin(now / 420 + brain.side) * (brain.mode === "strike" ? 8 : 18);
  target.y += Math.cos(now / 520) * (brain.mode === "bait" ? 10 : 5);
  mallet.maxSpeed = speed;
  mallet.targetX = target.x;
  mallet.targetY = target.y;
}

function updateBotBrain(room, now) {
  if (!room.botBrain || now >= room.botBrain.nextDecisionAt) {
    const roll = Math.random();
    const mode = roll > 0.78 ? "strike" : roll > 0.48 ? "bait" : "guard";
    room.botBrain = {
      mode,
      side: Math.random() > 0.5 ? 1 : -1,
      nextDecisionAt: now + 650 + Math.random() * 950
    };
  }
  return room.botBrain;
}

function resetPucks(room, scorer) {
  const count = room.settings.puckCount;
  const server =
    scorer === 0 ? 1 : scorer === 1 ? 0 : Math.random() > 0.5 ? 0 : 1;
  const serveY = server === 0 ? TABLE.height * 0.64 : TABLE.height * 0.36;
  room.state.pucks = [];
  for (let index = 0; index < count; index += 1) {
    const offset = count === 1 ? 0 : index === 0 ? -58 : 58;
    room.state.pucks.push({
      id: `p${index}`,
      x: TABLE.width / 2 + offset,
      y: serveY + (count === 1 ? 0 : index === 0 ? -18 : 18),
      vx: 0,
      vy: 0,
      stuckFor: 0
    });
  }
}

function initialState(puckCount = 1) {
  const state = {
    phase: "waiting",
    phaseEndsAt: 0,
    scores: [0, 0],
    lastScorer: null,
    winner: null,
    mallets: [
      {
        x: TABLE.width / 2,
        y: TABLE.height * 0.78,
        targetX: TABLE.width / 2,
        targetY: TABLE.height * 0.78,
        sweepFromX: TABLE.width / 2,
        sweepFromY: TABLE.height * 0.78,
        vx: 0,
        vy: 0
      },
      {
        x: TABLE.width / 2,
        y: TABLE.height * 0.22,
        targetX: TABLE.width / 2,
        targetY: TABLE.height * 0.22,
        sweepFromX: TABLE.width / 2,
        sweepFromY: TABLE.height * 0.22,
        vx: 0,
        vy: 0
      }
    ],
    pucks: []
  };

  const mockRoom = {
    settings: { puckCount: normalizePuckCount(puckCount) },
    state
  };
  resetPucks(mockRoom, null);
  return state;
}

function centerMallets(state) {
  const starts = [
    { x: TABLE.width / 2, y: TABLE.height * 0.78 },
    { x: TABLE.width / 2, y: TABLE.height * 0.22 }
  ];

  state.mallets.forEach((mallet, index) => {
    mallet.x = starts[index].x;
    mallet.y = starts[index].y;
    mallet.targetX = starts[index].x;
    mallet.targetY = starts[index].y;
    mallet.sweepFromX = starts[index].x;
    mallet.sweepFromY = starts[index].y;
    mallet.vx = 0;
    mallet.vy = 0;
  });
}

function sendSnapshots() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.lastSnapshotAt < 1000 / SNAPSHOT_HZ - 1) continue;
    room.lastSnapshotAt = now;
    broadcastRoom(room, {
      type: "state",
      now,
      code: room.code,
      players: publicPlayers(room),
      settings: room.settings,
      state: publicState(room.state)
    });
  }
}

function cleanupRooms() {
  const now = Date.now();

  for (let index = quickQueue.length - 1; index >= 0; index -= 1) {
    const entry = quickQueue[index];
    if (!clients.has(entry.client.id) || now - entry.createdAt > 120_000) {
      entry.client.queued = false;
      quickQueue.splice(index, 1);
      if (clients.has(entry.client.id)) {
        send(entry.client, { type: "notice", message: "Still searching. Try again when ready." });
      }
    }
  }

  for (const [code, room] of rooms.entries()) {
    const hasConnectedHuman = room.players.some(
      (player) => player && !player.bot && clients.has(player.id)
    );
    if (!hasConnectedHuman && now - room.updatedAt > 30_000) {
      rooms.delete(code);
    }
  }
}

function emitFx(room, kind, force = false, intensity = 0.5) {
  const now = Date.now();
  const key = kind;
  const lastAt = room.lastFxAt.get(key) || 0;
  const minGap = kind === "wall" ? 75 : kind === "hit" ? 55 : 0;
  if (!force && now - lastAt < minGap) return;
  room.lastFxAt.set(key, now);
  broadcastRoom(room, { type: "fx", kind, intensity: round(clamp(intensity, 0, 1)) });
}

function broadcastRoom(room, message) {
  const sent = new Set();
  for (const player of room.players) {
    if (!player || player.bot) continue;
    const client = clients.get(player.id);
    if (client && !sent.has(client.id)) {
      sent.add(client.id);
      send(client, message);
    }
  }
}

function send(client, message) {
  sendFrame(client, Buffer.from(JSON.stringify(message), "utf8"), 0x1);
}

function sendFrame(client, payload, opcode = 0x1) {
  if (!client.socket.writable) return;

  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  client.socket.write(Buffer.concat([header, payload]));
}

function publicPlayers(room) {
  return room.players.map((player, index) => ({
    index,
    connected: Boolean(player),
    bot: Boolean(player?.bot),
    local: Boolean(player?.local)
  }));
}

function publicState(state) {
  const now = Date.now();
  return {
    phase: state.phase,
    phaseEndsAt: state.phaseEndsAt,
    phaseEndsInMs: state.phaseEndsAt ? Math.max(0, state.phaseEndsAt - now) : 0,
    scores: state.scores,
    lastScorer: state.lastScorer,
    winner: state.winner ?? null,
    mallets: state.mallets.map((mallet) => ({
      x: round(mallet.x),
      y: round(mallet.y),
      vx: round(mallet.vx),
      vy: round(mallet.vy)
    })),
    pucks: state.pucks.map((puck) => ({
      id: puck.id,
      x: round(puck.x),
      y: round(puck.y),
      vx: round(puck.vx),
      vy: round(puck.vy)
    }))
  };
}

function currentRoom(client) {
  if (!client.roomCode) return null;
  return rooms.get(client.roomCode) || null;
}

function canStartRoom(room) {
  if (room.settings.local) {
    return Boolean(room.players[0] && room.players[1] && clients.has(room.players[0].id));
  }

  return Boolean(
    room.players[0] &&
      room.players[1] &&
      (room.players[1].bot || clients.has(room.players[1].id)) &&
      (room.players[0].bot || clients.has(room.players[0].id))
  );
}

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt += 1) {
    let code = "";
    for (let index = 0; index < 5; index += 1) {
      code += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return crypto.randomBytes(3).toString("hex").toUpperCase();
}

function normalizePuckCount(value) {
  return Number(value) === 2 ? 2 : 1;
}

function constrainMallet(index, x, y) {
  const r = TABLE.malletRadius;
  const top = index === 0 ? TABLE.height / 2 + r * 0.28 : r;
  const bottom = index === 0 ? TABLE.height - r : TABLE.height / 2 - r * 0.28;
  return {
    x: clamp(x, r, TABLE.width - r),
    y: clamp(y, top, bottom)
  };
}

function capPuckSpeed(puck) {
  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > PUCK_MAX_SPEED) {
    puck.vx = (puck.vx / speed) * PUCK_MAX_SPEED;
    puck.vy = (puck.vy / speed) * PUCK_MAX_SPEED;
  } else if (speed > 0 && speed < PUCK_MIN_LIVE_SPEED * 0.3) {
    // Let very slow pucks come to rest naturally
    puck.vx = 0;
    puck.vy = 0;
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
