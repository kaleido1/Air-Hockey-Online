import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Matter from "matter-js";
import SAT from "sat";
import {
  decodeInputPacket,
  decodeRealtimePacket,
  encodeInputPacket,
  encodeFxPacket,
  encodeStatePacket
} from "./public/protocol.js";
import {
  applyPuckInertia,
  detectGoalCrossing,
  limitPointStep,
  separatePuckFromMallet
} from "./public/offline-physics.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");

const HOST = process.env.HOST || process.env.HOSTNAME || "127.0.0.1";
const PORT = Number(process.env.PORT || 3100);
const PROTOCOL_VERSION = 3;
const ENABLE_SERVER_LISTEN = process.env.AIR_HOCKEY_NO_LISTEN !== "1";

const TABLE = {
  width: 590,
  height: 1024,
  centerY: 512,
  goalWidth: 178,
  malletRadius: 54,
  puckRadius: 29,
  firstTo: 7
};

const PHYSICS_HZ = readTickHz("AIR_HOCKEY_PHYSICS_HZ", 360, 240, 480);
const SNAPSHOT_HZ = readTickHz("AIR_HOCKEY_SNAPSHOT_HZ", 180, 120, Math.min(240, PHYSICS_HZ));
const DT = 1 / PHYSICS_HZ;
const HUMAN_MALLET_BASE_SPEED = 4200;
const HUMAN_MALLET_INPUT_SPEED_SCALE = 1.15;
const HUMAN_MALLET_SPEED_HOLD_MS = 120;
const BOT_MIN_SPEED = 1700;
const BOT_MAX_SPEED = 3400;
const PUCK_REFERENCE_SPEED = 2550;
const PUCK_MIN_SERVE_SPEED = 520;
const PUCK_MIN_LIVE_SPEED = 120;
const WALL_RESTITUTION = 0.91;
const PUCK_RESTITUTION = 0.78;
const MALLET_RESTITUTION = 0.72;
const MALLET_STRIKE_TRANSFER = 0.56;
const MALLET_HIT_COOLDOWN_MS = 68;
const CONTACT_SEPARATION = 0.2;
const HARD_CONTACT_SEPARATION = 1.4;
const CONTACT_SLOP = 0.12;
const STATIC_PUCK_SPEED = 70;
const STATIC_STRIKE_MIN_SPEED = 500;
const STATIC_SWEEP_MIN_SPEED = 440;
const EDGE_BLOCK_RESPONSE_SPEED = 36;
const STRONG_STRIKE_MIN_SPEED = 160;
const STRIKE_ESCAPE_TRANSFER = 0.38;
const STRONG_SWEEP_TANGENTIAL_TRANSFER = 0.08;
const STRONG_SWEEP_TANGENTIAL_MAX = 180;
const MATTER_MALLET_MASS = 1200;
const MATTER_MALLET_SYNC_EPSILON = 0.001;
const MATTER_MALLET_CONTACT_ADVANCE = 1.6;
const MATTER_SWEEP_SAMPLES = 12;
const MATTER_SWEEP_BINARY_STEPS = 12;
const PUCK_SUBSTEPS = 14;
const IMMEDIATE_HIT_STATE_GAP_MS = 6;
const INPUT_STATE_GAP_MS = 8;
const MALLET_RELEASE_LOCK_MS = 72;
const FRICTION_PER_SECOND = 0.985;
const PUCK_LINEAR_FRICTION = 18;
const PUCK_STOP_SPEED = 0;
const PUCK_INERTIA = {
  frictionPerSecond: FRICTION_PER_SECOND,
  linearFriction: PUCK_LINEAR_FRICTION,
  stopSpeed: PUCK_STOP_SPEED
};
const STUCK_SPEED = 95;
const STUCK_SECONDS = 0.38;
const RECONNECT_GRACE_MS = 180_000;

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

  if (pathname === "/runtime-config.js") {
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(
      [
        `window.AIR_HOCKEY_SERVER_URL = ${JSON.stringify(String(process.env.AIR_HOCKEY_SERVER_URL || "").trim())};`,
        "window.AIR_HOCKEY_REALTIME_MODE = 'server-authoritative-websocket';",
        `window.AIR_HOCKEY_PHYSICS_HZ = ${PHYSICS_HZ};`,
        `window.AIR_HOCKEY_SNAPSHOT_HZ = ${SNAPSHOT_HZ};`
      ].join("\n")
    );
    return;
  }

  if (pathname === "/healthz") {
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    });
    res.end(JSON.stringify({ ok: true, mode: "server-authoritative-websocket" }));
    return;
  }

  if (pathname === "/vendor/matter.min.js") {
    const matterPath = path.join(__dirname, "node_modules", "matter-js", "build", "matter.min.js");
    fs.readFile(matterPath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store"
      });
      res.end(data);
    });
    return;
  }

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
    networkKey: getClientNetworkKey(req),
    queued: false,
    lastPongAt: Date.now(),
    displayRefreshHz: SNAPSHOT_HZ,
    snapshotIntervalMs: 1000 / SNAPSHOT_HZ,
    lastSnapshotAt: 0,
    lastInputSeq: 0
  };

  socket.setNoDelay(true);
  clients.set(client.id, client);
  send(client, {
    type: "hello",
    clientId: client.id,
    table: TABLE,
    protocolVersion: PROTOCOL_VERSION,
    realtimeMode: "binary-websocket",
    physicsHz: PHYSICS_HZ,
    snapshotHz: SNAPSHOT_HZ
  });

  socket.on("data", (chunk) => readFrames(client, chunk));
  socket.on("end", () => disconnect(client));
  socket.on("error", () => disconnect(client));
  socket.on("close", () => disconnect(client));
});

if (ENABLE_SERVER_LISTEN) {
  server.listen(PORT, HOST, () => {
    console.log(`Online Air Hockey running at http://${HOST}:${PORT}`);
  });

  setInterval(tickRooms, 1000 / PHYSICS_HZ);
  setInterval(sendSnapshots, 1000 / SNAPSHOT_HZ);
  setInterval(cleanupRooms, 10_000);
}

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

    if (opcode === 0x2) {
      handleRealtimePacket(client, payload);
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

function handleRealtimePacket(client, payload) {
  const packet = decodeRealtimePacket(payload, Date.now());
  if (!packet) return;
  if (packet.type === "input") {
    updateInput(client, packet);
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
      leaveToMenu(client);
      break;
    case "ping":
      send(client, { type: "pong", at: message.at || Date.now() });
      break;
    case "display":
      updateClientDisplay(client, message);
      break;
    default:
      send(client, { type: "error", message: "Unknown message" });
  }
}

function updateClientDisplay(client, message) {
  const refreshHz = clamp(Math.round(Number(message.refreshHz) || SNAPSHOT_HZ), 60, SNAPSHOT_HZ);
  client.displayRefreshHz = refreshHz;
  client.snapshotIntervalMs = 1000 / refreshHz;
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
  if (reconnectRoom) {
    const reconnectSlot = reconnectRoom.players.findIndex(
      (player) =>
        player &&
        !player.bot &&
        ((client.playerKey && player.key === client.playerKey) || player.id === client.id)
    );
    const slot = reconnectSlot >= 0 ? reconnectSlot : reconnectRoom.players[0] ? 1 : 0;
    addPlayer(reconnectRoom, client, slot);
    if (canStartRoom(reconnectRoom)) startRoom(reconnectRoom);
    return;
  }

  const room =
    findOpenLanRoom(puckCount, client.networkKey) ||
    makeRoom({ puckCount, lan: true, lanNetworkKey: client.networkKey });

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
    if (room.lanNetworkKey && room.lanNetworkKey !== client.networkKey) continue;
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

function findOpenLanRoom(puckCount, networkKey) {
  let oldestRoom = null;
  for (const room of rooms.values()) {
    if (!room.settings.lan) continue;
    if (room.lanNetworkKey && room.lanNetworkKey !== networkKey) continue;
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
    connected: true,
    disconnectedAt: 0
  };
  client.roomCode = room.code;
  client.playerIndex = playerIndex;
  client.lastInputSeq = 0;
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
    lanNetworkKey: options.lanNetworkKey || null,
    settings: {
      puckCount: normalizePuckCount(options.puckCount),
      firstTo: TABLE.firstTo,
      quick: Boolean(options.quick),
      lan: Boolean(options.lan),
      local: Boolean(options.local),
      bot: Boolean(options.bot)
    },
    state: initialState(normalizePuckCount(options.puckCount)),
    serverTick: 0,
    phaseStartedAt: Date.now(),
    lastSnapshotAt: 0,
    lastHitStateAt: 0,
    lastInputStateAt: 0,
    lastFxAt: new Map(),
    botBrain: null,
    matter: null,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  room.matter = createMatterSimulation();
  resetMatterWorld(room);
  syncMatterPuckBodies(room);
  rooms.set(code, room);
  return room;
}

function createMatterSimulation() {
  const engine = Matter.Engine.create({ enableSleeping: false });
  engine.gravity.x = 0;
  engine.gravity.y = 0;
  const simulation = {
    engine,
    puckBodies: new Map(),
    malletBodies: [],
    wallBodies: [],
    collisions: []
  };
  Matter.Events.on(engine, "collisionStart", (event) => {
    for (const pair of event.pairs || []) {
      simulation.collisions.push({ bodyA: pair.bodyA, bodyB: pair.bodyB });
    }
  });
  Matter.Events.on(engine, "collisionActive", (event) => {
    for (const pair of event.pairs || []) {
      simulation.collisions.push({ bodyA: pair.bodyA, bodyB: pair.bodyB });
    }
  });
  return simulation;
}

function resetMatterWorld(room) {
  if (!room) return;
  if (!room.matter) room.matter = createMatterSimulation();
  const matter = room.matter;
  Matter.Composite.clear(matter.engine.world, false);
  matter.puckBodies.clear();
  matter.wallBodies = createMatterWallBodies();
  matter.malletBodies = room.state.mallets.map((mallet, index) => createMatterMalletBody(mallet, index));
  Matter.Composite.add(matter.engine.world, [...matter.wallBodies, ...matter.malletBodies]);
}

function createMatterWallBodies() {
  const t = 90;
  const goalLeft = TABLE.width / 2 - TABLE.goalWidth / 2;
  const goalRight = TABLE.width / 2 + TABLE.goalWidth / 2;
  const wallOptions = {
    isStatic: true,
    restitution: WALL_RESTITUTION,
    friction: 0,
    frictionStatic: 0,
    frictionAir: 0,
    label: "wall"
  };
  return [
    Matter.Bodies.rectangle(-t / 2, TABLE.height / 2, t, TABLE.height + t * 2, wallOptions),
    Matter.Bodies.rectangle(TABLE.width + t / 2, TABLE.height / 2, t, TABLE.height + t * 2, wallOptions),
    Matter.Bodies.rectangle(goalLeft / 2, -t / 2, goalLeft, t, wallOptions),
    Matter.Bodies.rectangle(goalRight + (TABLE.width - goalRight) / 2, -t / 2, TABLE.width - goalRight, t, wallOptions),
    Matter.Bodies.rectangle(goalLeft / 2, TABLE.height + t / 2, goalLeft, t, wallOptions),
    Matter.Bodies.rectangle(
      goalRight + (TABLE.width - goalRight) / 2,
      TABLE.height + t / 2,
      TABLE.width - goalRight,
      t,
      wallOptions
    )
  ];
}

function createMatterMalletBody(mallet, index) {
  const body = Matter.Bodies.circle(mallet.x, mallet.y, TABLE.malletRadius, {
    restitution: MALLET_RESTITUTION,
    friction: 0,
    frictionStatic: 0,
    frictionAir: 0,
    label: `mallet-${index}`
  });
  Matter.Body.setMass(body, MATTER_MALLET_MASS);
  Matter.Body.setInertia(body, Infinity);
  Matter.Body.setVelocity(body, { x: (mallet.vx || 0) / 60, y: (mallet.vy || 0) / 60 });
  return body;
}

function createMatterPuckBody(puck) {
  const body = Matter.Bodies.circle(puck.x, puck.y, TABLE.puckRadius, {
    restitution: PUCK_RESTITUTION,
    friction: 0,
    frictionStatic: 0,
    frictionAir: 0,
    label: puck.id
  });
  Matter.Body.setVelocity(body, { x: (puck.vx || 0) / 60, y: (puck.vy || 0) / 60 });
  return body;
}

function syncMatterPuckBodies(room) {
  if (!room?.matter) return;
  const wanted = new Set((room.state.pucks || []).map((puck) => puck.id));
  for (const [id, body] of room.matter.puckBodies) {
    if (wanted.has(id)) continue;
    Matter.Composite.remove(room.matter.engine.world, body);
    room.matter.puckBodies.delete(id);
  }
  for (const puck of room.state.pucks || []) {
    if (room.matter.puckBodies.has(puck.id)) continue;
    const body = createMatterPuckBody(puck);
    room.matter.puckBodies.set(puck.id, body);
    Matter.Composite.add(room.matter.engine.world, body);
  }
}

function removeMatterPuckBody(room, puck) {
  const body = room?.matter?.puckBodies?.get(puck.id);
  if (!body) return;
  Matter.Composite.remove(room.matter.engine.world, body);
  room.matter.puckBodies.delete(puck.id);
}

function syncMatterPuckBody(room, puck) {
  if (!room?.matter) return;
  let body = room.matter.puckBodies.get(puck.id);
  if (!body) {
    syncMatterPuckBodies(room);
    body = room.matter.puckBodies.get(puck.id);
  }
  if (!body) return;
  Matter.Body.setPosition(body, { x: puck.x, y: puck.y });
  Matter.Body.setVelocity(body, { x: (puck.vx || 0) / 60, y: (puck.vy || 0) / 60 });
}

function syncPuckFromMatterBody(room, puck) {
  const body = room?.matter?.puckBodies?.get(puck.id);
  if (!body) return;
  puck.x = body.position.x;
  puck.y = body.position.y;
  puck.vx = body.velocity.x * 60;
  puck.vy = body.velocity.y * 60;
}

function ensureMatterMalletBodies(room) {
  if (!room?.matter) return;
  if (room.matter.malletBodies.length !== room.state.mallets.length) {
    resetMatterWorld(room);
    syncMatterPuckBodies(room);
  }
}

function syncMatterMalletBody(room, index, { snap = false } = {}) {
  ensureMatterMalletBodies(room);
  const mallet = room?.state?.mallets?.[index];
  const body = room?.matter?.malletBodies?.[index];
  if (!mallet || !body) return;
  if (snap) {
    Matter.Body.setPosition(body, { x: mallet.x, y: mallet.y });
  }
  const driveVx = Number.isFinite(mallet.matterDriveVx) ? mallet.matterDriveVx : 0;
  const driveVy = Number.isFinite(mallet.matterDriveVy) ? mallet.matterDriveVy : 0;
  Matter.Body.setVelocity(body, { x: driveVx / 60, y: driveVy / 60 });
  Matter.Body.setAngularVelocity(body, 0);
}

function driveMatterMalletBodies(room) {
  ensureMatterMalletBodies(room);
  for (let index = 0; index < room.state.mallets.length; index += 1) {
    syncMatterMalletBody(room, index);
  }
}

function syncMalletsFromMatterBodies(room) {
  ensureMatterMalletBodies(room);
  for (let index = 0; index < room.state.mallets.length; index += 1) {
    const mallet = room.state.mallets[index];
    const body = room.matter.malletBodies[index];
    if (!body) continue;

    const constrained = constrainMallet(index, body.position.x, body.position.y);
    const clampedX = Math.abs(constrained.x - body.position.x) > MATTER_MALLET_SYNC_EPSILON;
    const clampedY = Math.abs(constrained.y - body.position.y) > MATTER_MALLET_SYNC_EPSILON;
    if (clampedX || clampedY) {
      Matter.Body.setPosition(body, constrained);
      Matter.Body.setVelocity(body, {
        x: clampedX ? 0 : body.velocity.x,
        y: clampedY ? 0 : body.velocity.y
      });
      Matter.Body.setAngularVelocity(body, 0);
    }

    mallet.x = constrained.x;
    mallet.y = constrained.y;
    mallet.vx = body.velocity.x * 60;
    mallet.vy = body.velocity.y * 60;
  }
}

function processMatterCollisionEvents(room) {
  const events = room?.matter?.collisions || [];
  const now = Date.now();
  const pucksById = new Map((room.state.pucks || []).map((puck) => [puck.id, puck]));
  const handled = new Set();

  for (const event of events) {
    const match = matterMalletPuckCollision(event.bodyA, event.bodyB, pucksById);
    if (!match) continue;
    handled.add(`${match.malletIndex}:${match.puck.id}`);
    markMatterMalletContact(room, match, now, true);
  }

  for (let malletIndex = 0; malletIndex < (room.matter?.malletBodies?.length || 0); malletIndex += 1) {
    const malletBody = room.matter.malletBodies[malletIndex];
    if (!malletBody) continue;
    for (const [puckId, puckBody] of room.matter.puckBodies) {
      const puck = pucksById.get(puckId);
      if (!puck || handled.has(`${malletIndex}:${puck.id}`)) continue;
      const distance = Math.hypot(
        puckBody.position.x - malletBody.position.x,
        puckBody.position.y - malletBody.position.y
      );
      if (distance > TABLE.malletRadius + TABLE.puckRadius + HARD_CONTACT_SEPARATION + CONTACT_SLOP) continue;
      const match = { malletIndex, malletBody, puckBody, puck };
      if (isMatterMalletDrivingPuck(match)) {
        markMatterMalletContact(room, match, now, false);
      }
    }
  }
}

function isMatterMalletDrivingPuck({ malletIndex, malletBody, puckBody }) {
  const normal = matterContactNormal(malletBody, puckBody, malletIndex);
  const malletVx = malletBody.velocity.x * 60;
  const malletVy = malletBody.velocity.y * 60;
  const puckVx = puckBody.velocity.x * 60;
  const puckVy = puckBody.velocity.y * 60;
  const malletSpeed = Math.hypot(malletVx, malletVy);
  const strikeSpeed = Math.max(0, malletVx * normal.nx + malletVy * normal.ny);
  const relativeNormalSpeed = (puckVx - malletVx) * normal.nx + (puckVy - malletVy) * normal.ny;
  return strikeSpeed > 90 || malletSpeed > 320 || relativeNormalSpeed < -30;
}

function markMatterMalletContact(room, { malletIndex, malletBody, puck, puckBody }, now, force) {
  const recentSameHit =
    puck.lastMalletHitIndex === malletIndex && now - (puck.lastMalletHitAt || 0) < MALLET_HIT_COOLDOWN_MS;
  if (recentSameHit) return false;

  const normal = matterContactNormal(malletBody, puckBody, malletIndex);
  const { nx, ny } = normal;
  const malletVx = malletBody.velocity.x * 60;
  const malletVy = malletBody.velocity.y * 60;
  const puckVx = puckBody.velocity.x * 60;
  const puckVy = puckBody.velocity.y * 60;
  const malletSpeed = Math.hypot(malletVx, malletVy);
  const strikeSpeed = Math.max(0, malletVx * nx + malletVy * ny);
  const puckNormalSpeed = puckVx * nx + puckVy * ny;
  const targetNormalSpeed = Math.max(
    force ? PUCK_MIN_LIVE_SPEED : 0,
    strikeSpeed * MALLET_STRIKE_TRANSFER,
    malletSpeed > 320 ? STATIC_SWEEP_MIN_SPEED : 0
  );
  if (puckNormalSpeed < targetNormalSpeed) {
    const carry = targetNormalSpeed - puckNormalSpeed;
    Matter.Body.setVelocity(puckBody, {
      x: (puckVx + nx * carry) / 60,
      y: (puckVy + ny * carry) / 60
    });
  }

  puck.lastMalletHitIndex = malletIndex;
  puck.lastMalletHitAt = now;
  puck.hitSerial = ((puck.hitSerial || 0) + 1) & 0xff;
  rememberMalletRelease(puck, malletIndex, nx, ny, now);
  emitFx(room, "hit", false, clamp((Math.max(strikeSpeed, malletSpeed * 0.4) || 1) / 3500, 0.14, 0.86));
  return true;
}

function matterContactNormal(malletBody, puckBody, malletIndex) {
  let nx = puckBody.position.x - malletBody.position.x;
  let ny = puckBody.position.y - malletBody.position.y;
  let distance = Math.hypot(nx, ny);
  if (distance <= 0.001) {
    nx = puckBody.velocity.x - malletBody.velocity.x;
    ny = puckBody.velocity.y - malletBody.velocity.y;
    distance = Math.hypot(nx, ny);
  }
  if (distance <= 0.001) {
    nx = 0;
    ny = malletIndex === 0 ? -1 : 1;
    distance = 1;
  }
  return {
    nx: nx / distance,
    ny: ny / distance
  };
}

function matterMalletPuckCollision(bodyA, bodyB, pucksById) {
  const aMalletIndex = matterMalletIndex(bodyA);
  const bMalletIndex = matterMalletIndex(bodyB);
  if (aMalletIndex !== null && pucksById.has(bodyB.label)) {
    return {
      malletIndex: aMalletIndex,
      malletBody: bodyA,
      puckBody: bodyB,
      puck: pucksById.get(bodyB.label)
    };
  }
  if (bMalletIndex !== null && pucksById.has(bodyA.label)) {
    return {
      malletIndex: bMalletIndex,
      malletBody: bodyB,
      puckBody: bodyA,
      puck: pucksById.get(bodyA.label)
    };
  }
  return null;
}

function matterMalletIndex(body) {
  const match = /^mallet-(\d+)$/.exec(body?.label || "");
  return match ? Number(match[1]) : null;
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
  room.serverTick = 0;
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

function leaveToMenu(client) {
  const room = currentRoom(client);
  if (room?.state.phase === "gameover") {
    closeFinishedRoom(room);
    return;
  }

  leaveRoom(client, false);
  send(client, { type: "left" });
}

function closeFinishedRoom(room) {
  for (const player of room.players) {
    if (!player || player.bot) continue;
    const client = clients.get(player.id);
    if (!client) continue;
    client.roomCode = null;
    client.playerIndex = null;
    send(client, { type: "left" });
  }
  rooms.delete(room.code);
}

function reserveDisconnectedPlayer(client) {
  const room = currentRoom(client);
  if (!room || client.playerIndex === null || room.settings.local) return false;

  const player = room.players[client.playerIndex];
  if (!player || player.id !== client.id) return false;

  player.connected = false;
  player.disconnectedAt = Date.now();
  room.updatedAt = Date.now();
  if (room.state.phase === "playing" || room.state.phase === "countdown" || room.state.phase === "paused") {
    room.state.phase = "waiting";
    room.state.phaseEndsAt = 0;
  }

  broadcastRoom(room, {
    type: "room",
    code: room.code,
    players: publicPlayers(room),
    settings: room.settings
  });
  return true;
}

function shouldCloseRoomOnActiveDisconnect(room) {
  return Boolean(
    room &&
      !room.settings.local &&
      !room.settings.bot &&
      ["countdown", "playing", "paused", "point"].includes(room.state.phase)
  );
}

function closeRoomForDisconnectedPlayer(room, disconnectedClient) {
  const notified = new Set();
  for (const player of room.players) {
    if (!player || player.bot || player.id === disconnectedClient.id || notified.has(player.id)) continue;
    const client = clients.get(player.id);
    if (!client) continue;
    notified.add(player.id);
    client.roomCode = null;
    client.playerIndex = null;
    send(client, {
      type: "notice",
      message: "Opponent left the room"
    });
  }

  disconnectedClient.roomCode = null;
  disconnectedClient.playerIndex = null;
  rooms.delete(room.code);
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
  const room = currentRoom(client);
  clients.delete(client.id);
  if (shouldCloseRoomOnActiveDisconnect(room)) {
    closeRoomForDisconnectedPlayer(room, client);
  } else if (!reserveDisconnectedPlayer(client)) {
    leaveRoom(client, true);
  }
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
  const now = Date.now();
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
  let constrained = constrainMallet(playerIndex, x, y);
  if (room.state.phase !== "playing") {
    constrained = constrainMalletAwayFromPucks(playerIndex, constrained.x, constrained.y, room.state.pucks);
  }
  ensureMatterMalletBodies(room);
  const body = room.matter?.malletBodies?.[playerIndex];
  const previousX = body?.position.x ?? mallet.x;
  const previousY = body?.position.y ?? mallet.y;
  mallet.x = previousX;
  mallet.y = previousY;
  const elapsed = mallet.lastInputAt ? (now - mallet.lastInputAt) / 1000 : 1 / PHYSICS_HZ;
  const inputDt = clamp(elapsed, 1 / 300, 1 / 24);
  const requestedSpeed = normalizedHumanInputSpeed(message, previousX, previousY, constrained.x, constrained.y, inputDt);
  mallet.inputSpeedLimit = requestedSpeed;
  mallet.inputSpeedUntil = now + HUMAN_MALLET_SPEED_HOLD_MS;
  const limited = constrained;
  const dx = limited.x - previousX;
  const dy = limited.y - previousY;
  const baseVx = dx / inputDt;
  const baseVy = dy / inputDt;
  if (!mallet.hasPendingSweep) {
    mallet.sweepFromX = previousX;
    mallet.sweepFromY = previousY;
    mallet.sweepStartedAt = mallet.lastInputAt || now - inputDt * 1000;
    mallet.hasPendingSweep = true;
  }
  if (room.state.phase !== "playing") {
    mallet.x = limited.x;
    mallet.y = limited.y;
    syncMatterMalletBody(room, playerIndex, { snap: true });
  }
  mallet.targetX = constrained.x;
  mallet.targetY = constrained.y;
  mallet.vx = baseVx;
  mallet.vy = baseVy;
  mallet.matterDriveVx = 0;
  mallet.matterDriveVy = 0;
  mallet.lastInputAt = now;
  client.lastInputSeq = Number(message.inputSeq) || client.lastInputSeq || 0;

  room.updatedAt = now;
}

function normalizedHumanInputSpeed(message, fromX, fromY, targetX, targetY, dt) {
  const measuredSpeed = Math.hypot(targetX - fromX, targetY - fromY) / Math.max(dt, 1 / 300);
  const clientSpeed = Math.max(0, Number(message.inputSpeed) || 0);
  const requested = Math.max(HUMAN_MALLET_BASE_SPEED, measuredSpeed, clientSpeed * HUMAN_MALLET_INPUT_SPEED_SCALE);
  return requested;
}

function applyDirectInputSweep(room, mallet, malletIndex, targetX, targetY, inputDt, now, baseVx, baseVy) {
  const startX = mallet.x;
  const startY = mallet.y;
  const guarded = guardMalletSweepWithMatter(room, malletIndex, startX, startY, targetX, targetY);
  const sweepDt = guarded.blocked
    ? Math.max(1 / 300, inputDt * Math.max(guarded.t, 0.001))
    : inputDt;
  mallet.sweepFromX = startX;
  mallet.sweepFromY = startY;
  mallet.sweepStartedAt = now - sweepDt * 1000;
  mallet.hasPendingSweep = true;
  mallet.x = guarded.x;
  mallet.y = guarded.y;
  mallet.vx = baseVx;
  mallet.vy = baseVy;
  mallet.matterDriveVx = 0;
  mallet.matterDriveVy = 0;
  syncMatterMalletBody(room, malletIndex, { snap: true });

  const anyHit = resolveInputHits(room, mallet, malletIndex, sweepDt, false);

  for (const puck of room.state.pucks) {
    forceSeparatePuckFromAllMallets(room, puck);
    collidePuckWithWalls(room, puck);
    stopVerySlowPuck(puck);
    syncMatterPuckBody(room, puck);
  }

  if (anyHit) sendImmediateHitState(room, now);
  sendInputState(room, now);
}

function guardMalletSweepWithMatter(room, malletIndex, startX, startY, targetX, targetY) {
  const sweepX = targetX - startX;
  const sweepY = targetY - startY;
  const distance = Math.hypot(sweepX, sweepY);
  if (distance <= 0.001 || !room?.state?.pucks?.length) {
    return { x: targetX, y: targetY, t: 1, blocked: false, puck: null };
  }

  let earliest = 1;
  let blockingPuck = null;
  for (const puck of room.state.pucks) {
    const contact = findMatterMalletSweepContact(startX, startY, targetX, targetY, puck);
    if (!contact || contact.t >= earliest) continue;
    earliest = contact.t;
    blockingPuck = puck;
  }

  if (!blockingPuck || earliest >= 1) {
    return { x: targetX, y: targetY, t: 1, blocked: false, puck: null };
  }

  const t = clamp(earliest, 0, 1);
  return {
    x: startX + sweepX * t,
    y: startY + sweepY * t,
    t,
    blocked: true,
    puck: blockingPuck
  };
}

function findMatterMalletSweepContact(startX, startY, targetX, targetY, puck) {
  const sweepX = targetX - startX;
  const sweepY = targetY - startY;
  const minDistance = TABLE.malletRadius + TABLE.puckRadius;
  const relativeStartX = puck.x - startX;
  const relativeStartY = puck.y - startY;
  const startDistance = Math.hypot(relativeStartX, relativeStartY);
  const movingTowardPuck = sweepX * relativeStartX + sweepY * relativeStartY > 0;
  if (startDistance <= minDistance + CONTACT_SLOP && !movingTowardPuck) return null;
  const analyticT = findEarliestSweepContact(
    relativeStartX,
    relativeStartY,
    -sweepX,
    -sweepY,
    minDistance,
    CONTACT_SLOP
  );
  const matterT = findMatterSweepCollisionT(startX, startY, targetX, targetY, puck);

  if (analyticT === null && matterT === null) return null;
  return { t: clamp(analyticT ?? matterT, 0, 1), matterT };
}

function findMatterSweepCollisionT(startX, startY, targetX, targetY, puck) {
  const sweepX = targetX - startX;
  const sweepY = targetY - startY;
  const malletBody = makeMatterCircle(startX, startY, TABLE.malletRadius);
  const puckBody = makeMatterCircle(puck.x, puck.y, TABLE.puckRadius + CONTACT_SLOP);

  if (matterCirclesCollideAt(malletBody, puckBody, startX, startY)) return 0;
  if (!matterCirclesCollideAt(malletBody, puckBody, targetX, targetY)) {
    let previousT = 0;
    let hitT = null;
    for (let sample = 1; sample <= MATTER_SWEEP_SAMPLES; sample += 1) {
      const t = sample / MATTER_SWEEP_SAMPLES;
      const x = startX + sweepX * t;
      const y = startY + sweepY * t;
      if (matterCirclesCollideAt(malletBody, puckBody, x, y)) {
        hitT = t;
        break;
      }
      previousT = t;
    }
    if (hitT === null) return null;
    return refineMatterSweepCollisionT(malletBody, puckBody, startX, startY, sweepX, sweepY, previousT, hitT);
  }

  return refineMatterSweepCollisionT(malletBody, puckBody, startX, startY, sweepX, sweepY, 0, 1);
}

function refineMatterSweepCollisionT(malletBody, puckBody, startX, startY, sweepX, sweepY, low, high) {
  let lo = low;
  let hi = high;
  for (let step = 0; step < MATTER_SWEEP_BINARY_STEPS; step += 1) {
    const mid = (lo + hi) / 2;
    const x = startX + sweepX * mid;
    const y = startY + sweepY * mid;
    if (matterCirclesCollideAt(malletBody, puckBody, x, y)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }
  return hi;
}

function makeMatterCircle(x, y, radius) {
  return Matter.Bodies.circle(x, y, radius, {
    isStatic: true,
    friction: 0,
    frictionAir: 0,
    restitution: 1
  });
}

function matterCirclesCollideAt(malletBody, puckBody, x, y) {
  Matter.Body.setPosition(malletBody, { x, y });
  return Boolean(Matter.Collision.collides(malletBody, puckBody)?.collided);
}

function tickRooms() {
  const now = Date.now();

  for (const room of rooms.values()) {
    room.serverTick = (room.serverTick + 1) & 0xffff;
    if (!canStartRoom(room) && room.state.phase !== "waiting") {
      room.state.phase = "waiting";
      room.state.phaseEndsAt = 0;
      room.updatedAt = now;
    }

    if (room.state.phase === "waiting") continue;
    if (room.state.phase === "paused") continue;

    if (room.players[1]?.bot) updateBot(room);

    moveMallets(room, DT);
    if (room.state.phase === "playing") settlePuckMalletOverlaps(room);

    if (room.state.phase === "countdown" && now >= room.state.phaseEndsAt) {
      room.state.phase = "playing";
      room.state.phaseEndsAt = 0;
    }

    if (room.state.phase === "point" && now >= room.state.phaseEndsAt) {
      resetPucks(room, room.state.nextServeScorer);
      room.state.phase = "playing";
      room.state.phaseEndsAt = 0;
    }

    if (room.state.phase === "playing") {
      for (let substep = 0; substep < PUCK_SUBSTEPS && room.state.phase === "playing"; substep += 1) {
        stepPucks(room, DT / PUCK_SUBSTEPS);
      }
    }

    for (const mallet of room.state.mallets) {
      mallet.sweepFromX = mallet.x;
      mallet.sweepFromY = mallet.y;
      mallet.sweepStartedAt = 0;
      mallet.hasPendingSweep = false;
      mallet.matterDriveVx = 0;
      mallet.matterDriveVy = 0;
    }
  }
}


function moveMallets(room, dt) {
  const state = room.state;
  ensureMatterMalletBodies(room);
  for (let index = 0; index < state.mallets.length; index += 1) {
    const mallet = state.mallets[index];
    const body = room.matter?.malletBodies?.[index];
    const previousX = body?.position.x ?? mallet.x;
    const previousY = body?.position.y ?? mallet.y;
    mallet.x = previousX;
    mallet.y = previousY;

    const target = constrainMallet(index, mallet.targetX, mallet.targetY);
    const dx = target.x - mallet.x;
    const dy = target.y - mallet.y;
    const distance = Math.hypot(dx, dy);
    const maxMove = mallet.maxSpeed ? mallet.maxSpeed * dt : Infinity;
    mallet.sweepFromX = previousX;
    mallet.sweepFromY = previousY;

    const desired =
      mallet.maxSpeed && distance > maxMove && distance > 0.001
        ? {
            x: mallet.x + (dx / distance) * maxMove,
            y: mallet.y + (dy / distance) * maxMove
          }
        : target;
    if (state.phase !== "playing") {
      mallet.x = desired.x;
      mallet.y = desired.y;
      mallet.vx = (mallet.x - previousX) / dt;
      mallet.vy = (mallet.y - previousY) / dt;
      mallet.matterDriveVx = 0;
      mallet.matterDriveVy = 0;
      syncMatterMalletBody(room, index, { snap: true });
      continue;
    }

    const guarded =
      state.phase === "playing"
        ? guardMalletSweepWithMatter(room, index, previousX, previousY, desired.x, desired.y)
        : { x: desired.x, y: desired.y };
    const driveTarget =
      guarded.blocked && distance > 0.001
        ? constrainMallet(
            index,
            guarded.x + (dx / distance) * MATTER_MALLET_CONTACT_ADVANCE,
            guarded.y + (dy / distance) * MATTER_MALLET_CONTACT_ADVANCE
          )
        : guarded;

    const driveVx = (driveTarget.x - previousX) / dt;
    const driveVy = (driveTarget.y - previousY) / dt;
    mallet.vx = driveVx;
    mallet.vy = driveVy;
    mallet.matterDriveVx = driveVx;
    mallet.matterDriveVy = driveVy;
  }
}

function resolveInputHits(room, mallet, malletIndex, dt, emitState = true) {
  let anyHit = false;
  for (const puck of room.state.pucks) {
    const hit = collidePuckWithMallet(room, puck, mallet, malletIndex, dt);
    if (!hit) continue;
    anyHit = true;
    forceSeparatePuckFromAllMallets(room, puck);
    collidePuckWithWalls(room, puck);
    stopVerySlowPuck(puck);
    syncMatterPuckBody(room, puck);
    emitFx(room, "hit", false, hit);
  }
  if (anyHit && emitState) sendImmediateHitState(room, Date.now());
  return anyHit;
}

function settlePuckMalletOverlaps(room) {
  if (!room?.state?.pucks?.length) return;
  for (const puck of room.state.pucks) {
    forceSeparatePuckFromAllMallets(room, puck);
    collidePuckWithWalls(room, puck);
    stopVerySlowPuck(puck);
    syncMatterPuckBody(room, puck);
  }
}

function stepPucks(room, dt) {
  const state = room.state;
  const scored = [];
  const activePucks = [];

  syncMatterPuckBodies(room);
  driveMatterMalletBodies(room);
  for (const puck of state.pucks) {
    puck.prevX = puck.x;
    puck.prevY = puck.y;
    applyPuckInertia(puck, PUCK_INERTIA, dt);
    stopVerySlowPuck(puck);
    syncMatterPuckBody(room, puck);
  }

  room.matter.collisions.length = 0;
  Matter.Engine.update(room.matter.engine, dt * 1000);
  processMatterCollisionEvents(room);
  syncMalletsFromMatterBodies(room);

  for (const puck of state.pucks) {
    syncPuckFromMatterBody(room, puck);
    stopVerySlowPuck(puck);
    syncMatterPuckBody(room, puck);

    const scorer = detectGoalCrossing(TABLE, puck) ?? detectGoal(puck);
    if (scorer !== null) {
      scored.push(scorer);
      removeMatterPuckBody(room, puck);
      continue;
    }

    forceSeparatePuckFromAllMallets(room, puck);
    stopVerySlowPuck(puck);
    rescueStuckPuck(room, puck, dt);
    stopVerySlowPuck(puck);
    syncMatterPuckBody(room, puck);
    activePucks.push(puck);
  }

  state.pucks = activePucks;
  if (scored.length > 0) awardScoredPucks(room, scored);
}

function collidePuckWithWalls(room, puck) {
  const r = TABLE.puckRadius;
  const goalLeft = TABLE.width / 2 - TABLE.goalWidth / 2;
  const goalRight = TABLE.width / 2 + TABLE.goalWidth / 2;
  let bounced = false;
  let intensity = 0;

  if (puck.x < r) {
    intensity = Math.max(intensity, Math.abs(puck.vx) / PUCK_REFERENCE_SPEED);
    puck.x = r;
    puck.vx = Math.abs(puck.vx) * WALL_RESTITUTION;
    bounced = true;
  } else if (puck.x > TABLE.width - r) {
    intensity = Math.max(intensity, Math.abs(puck.vx) / PUCK_REFERENCE_SPEED);
    puck.x = TABLE.width - r;
    puck.vx = -Math.abs(puck.vx) * WALL_RESTITUTION;
    bounced = true;
  }

  const insideGoal = puck.x > goalLeft && puck.x < goalRight;

  if (puck.y < r && !insideGoal) {
    intensity = Math.max(intensity, Math.abs(puck.vy) / PUCK_REFERENCE_SPEED);
    puck.y = r;
    puck.vy = Math.abs(puck.vy) * WALL_RESTITUTION;
    bounced = true;
  } else if (puck.y > TABLE.height - r && !insideGoal) {
    intensity = Math.max(intensity, Math.abs(puck.vy) / PUCK_REFERENCE_SPEED);
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

function forceSeparatePuckFromMallet(room, puck, mallet, malletIndex = null) {
  const release = getActiveMalletRelease(puck, malletIndex);
  if (release) {
    maintainMalletLeavingState(room, puck, mallet, release);
    return;
  }

  const separation = separatePuckFromMallet(TABLE, physicsContactConfig(), puck, mallet, malletIndex);
  if (!separation) return;

  const { nx, ny, overlap } = separation;

  const relativeNormalSpeed = (puck.vx - mallet.vx) * nx + (puck.vy - mallet.vy) * ny;
  const strikeSpeed = Math.max(0, mallet.vx * nx + mallet.vy * ny);
  const escapeSpeed = Math.max(
    EDGE_BLOCK_RESPONSE_SPEED,
    strikeSpeed * STRIKE_ESCAPE_TRANSFER,
    overlap > 3 ? PUCK_MIN_LIVE_SPEED * 0.9 : 0
  );
  if (relativeNormalSpeed < escapeSpeed) {
    const correction = escapeSpeed - relativeNormalSpeed;
    puck.vx += nx * correction;
    puck.vy += ny * correction;
    stopVerySlowPuck(puck);
  }
}

function physicsContactConfig() {
  return {
    contactSeparation: CONTACT_SEPARATION,
    hardContactSeparation: HARD_CONTACT_SEPARATION
  };
}

function forceSeparatePuckFromAllMallets(room, puck) {
  for (let pass = 0; pass < 2; pass += 1) {
    for (let index = 0; index < room.state.mallets.length; index += 1) {
      forceSeparatePuckFromMallet(room, puck, room.state.mallets[index], index);
    }
  }
  syncPuckHistory(puck);
}

function syncPuckHistory(puck) {
  puck.prevX = puck.x;
  puck.prevY = puck.y;
}

function getActiveMalletRelease(puck, malletIndex, now = Date.now()) {
  if (malletIndex === null || puck.releaseMalletIndex !== malletIndex) return null;
  if (!puck.releaseUntil || now >= puck.releaseUntil) return null;
  const length = Math.hypot(puck.releaseNx || 0, puck.releaseNy || 0);
  if (length <= 0.001) return null;
  return {
    nx: puck.releaseNx / length,
    ny: puck.releaseNy / length
  };
}

function maintainMalletLeavingState(room, puck, mallet, release) {
  const minDistance = TABLE.puckRadius + TABLE.malletRadius;
  const targetDistance = minDistance + HARD_CONTACT_SEPARATION;
  const projectedDistance = (puck.x - mallet.x) * release.nx + (puck.y - mallet.y) * release.ny;
  if (projectedDistance < targetDistance) {
    const correction = targetDistance - projectedDistance;
    puck.x += release.nx * correction;
    puck.y += release.ny * correction;
  }

  const normalSpeed = puck.vx * release.nx + puck.vy * release.ny;
  const malletReleaseSpeed = Math.max(0, mallet.vx * release.nx + mallet.vy * release.ny);
  const escapeSpeed = Math.max(EDGE_BLOCK_RESPONSE_SPEED, malletReleaseSpeed * MALLET_STRIKE_TRANSFER);
  if (normalSpeed < escapeSpeed) {
    const correction = escapeSpeed - normalSpeed;
    puck.vx += release.nx * correction;
    puck.vy += release.ny * correction;
    stopVerySlowPuck(puck);
  }

  puck.prevX = puck.x;
  puck.prevY = puck.y;
  if (room) room.updatedAt = Date.now();
}

function rememberMalletRelease(puck, malletIndex, nx, ny, now = Date.now()) {
  const length = Math.hypot(nx, ny);
  if (length <= 0.001) return;
  puck.releaseMalletIndex = malletIndex;
  puck.releaseNx = nx / length;
  puck.releaseNy = ny / length;
  puck.releaseUntil = now + MALLET_RELEASE_LOCK_MS;
}

function collidePuckWithMallet(room, puck, mallet, malletIndex, dt) {
  const minDistance = TABLE.puckRadius + TABLE.malletRadius;
  const now = Date.now();
  const activeRelease = getActiveMalletRelease(puck, malletIndex, now);
  if (activeRelease) {
    maintainMalletLeavingState(room, puck, mallet, activeRelease);
    return false;
  }

  const startX = Number.isFinite(mallet.sweepFromX) ? mallet.sweepFromX : mallet.x;
  const startY = Number.isFinite(mallet.sweepFromY) ? mallet.sweepFromY : mallet.y;
  const puckStartX = Number.isFinite(puck.prevX) ? puck.prevX : puck.x;
  const puckStartY = Number.isFinite(puck.prevY) ? puck.prevY : puck.y;
  const sweepX = mallet.x - startX;
  const sweepY = mallet.y - startY;
  const sweepElapsed = mallet.sweepStartedAt ? (now - mallet.sweepStartedAt) / 1000 : dt;
  const sweepDt = clamp(sweepElapsed, 1 / 240, 1 / 12);
  const pathVx = sweepX / sweepDt;
  const pathVy = sweepY / sweepDt;
  const strikeVx = Number.isFinite(pathVx) && Math.hypot(sweepX, sweepY) > 0.001 ? pathVx : mallet.vx;
  const strikeVy = Number.isFinite(pathVy) && Math.hypot(sweepX, sweepY) > 0.001 ? pathVy : mallet.vy;
  const puckDeltaX = puck.x - puckStartX;
  const puckDeltaY = puck.y - puckStartY;
  const relativeStartX = puckStartX - startX;
  const relativeStartY = puckStartY - startY;
  const relativeStartDistance = Math.hypot(relativeStartX, relativeStartY);
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
  let sweptHit = false;
  const startedInContact = relativeStartDistance <= minDistance + CONTACT_SLOP;

  if (!startedInContact) {
    hitT = findEarliestSweepContact(
      relativeStartX,
      relativeStartY,
      relativeDeltaX,
      relativeDeltaY,
      minDistance,
      CONTACT_SLOP
    );

    if (hitT !== null) {
      sweptHit = true;
      probeX = puckStartX + puckDeltaX * hitT;
      probeY = puckStartY + puckDeltaY * hitT;
      contactX = startX + sweepX * hitT;
      contactY = startY + sweepY * hitT;
      dx = probeX - contactX;
      dy = probeY - contactY;
      distance = Math.hypot(dx, dy);
    }
  } else if (startedInContact) {
    sweptHit = true;
    hitT = 0;
    probeX = puckStartX;
    probeY = puckStartY;
    contactX = startX;
    contactY = startY;
    dx = probeX - contactX;
    dy = probeY - contactY;
    distance = Math.hypot(dx, dy);
  }

  if (!sweptHit) return false;

  if (distance <= 0.001) {
    if (sweptHit) {
      dx = -relativeDeltaX;
      dy = -relativeDeltaY;
    } else {
      dx = puck.x - mallet.x;
      dy = puck.y - mallet.y;
    }
    distance = Math.hypot(dx, dy);
    if (distance <= 0.001) {
      dx = strikeVx || sweepX || 0;
      dy = strikeVy || sweepY || (malletIndex === 1 ? 1 : -1);
      distance = 1;
    }
  }

  let nx = dx / distance;
  let ny = dy / distance;
  puck.x = contactX + nx * (minDistance + HARD_CONTACT_SEPARATION);
  puck.y = contactY + ny * (minDistance + HARD_CONTACT_SEPARATION);

  const rvx = puck.vx - strikeVx;
  const rvy = puck.vy - strikeVy;
  const relativeNormalSpeed = rvx * nx + rvy * ny;
  const strikeSpeed = Math.max(0, strikeVx * nx + strikeVy * ny);
  const malletSpeed = Math.hypot(strikeVx, strikeVy);
  const strongDrive = strikeSpeed >= STRONG_STRIKE_MIN_SPEED || malletSpeed >= 520;
  const sweepDriveSpeed =
    sweptHit && malletSpeed > 0.001 ? Math.max(strikeSpeed, malletSpeed * 0.42) : strikeSpeed;
  const moveX = malletSpeed > 0.001 ? strikeVx / malletSpeed : nx;
  const moveY = malletSpeed > 0.001 ? strikeVy / malletSpeed : ny;
  const puckSpeed = Math.hypot(puck.vx, puck.vy);
  const activeStaticPush =
    puckSpeed < STATIC_PUCK_SPEED &&
    malletSpeed > 90 &&
    (sweptHit || distance <= minDistance + CONTACT_SEPARATION);
  let exitX = nx;
  let exitY = ny;
  if (activeStaticPush && malletSpeed > 260) {
    let blendedX = nx * 0.55 + moveX * 0.82;
    let blendedY = ny * 0.55 + moveY * 0.82;
    if (blendedX * nx + blendedY * ny < 0.25) {
      blendedX += nx * 0.75;
      blendedY += ny * 0.75;
    }
    const blendedLength = Math.hypot(blendedX, blendedY) || 1;
    exitX = blendedX / blendedLength;
    exitY = blendedY / blendedLength;
    const anchorX = sweptHit ? contactX : mallet.x;
    const anchorY = sweptHit ? contactY : mallet.y;
    puck.x = anchorX + exitX * (minDistance + HARD_CONTACT_SEPARATION);
    puck.y = anchorY + exitY * (minDistance + HARD_CONTACT_SEPARATION);
  }
  if (!sweptHit && distance > minDistance && relativeNormalSpeed >= -15 && !strongDrive) {
    return false;
  }
  const repeatedContact =
    !activeStaticPush &&
    !strongDrive &&
    puck.lastMalletHitIndex === malletIndex &&
    now - (puck.lastMalletHitAt || 0) < MALLET_HIT_COOLDOWN_MS &&
    relativeNormalSpeed > -80;

  if (repeatedContact) {
    const puckNormalSpeed = puck.vx * nx + puck.vy * ny;
    const escapeSpeed = Math.max(EDGE_BLOCK_RESPONSE_SPEED, strikeSpeed > 80 ? strikeSpeed * 0.28 : 0);
    const alreadyReleased =
      distance >= minDistance + CONTACT_SEPARATION &&
      puckNormalSpeed >= escapeSpeed &&
      relativeNormalSpeed >= escapeSpeed * 0.5;

    if (alreadyReleased) {
      puck.prevX = puck.x;
      puck.prevY = puck.y;
      return false;
    }
  }

  if (relativeNormalSpeed < 0) {
    const impulse = -(1 + MALLET_RESTITUTION) * relativeNormalSpeed;
    puck.vx += nx * impulse;
    puck.vy += ny * impulse;
  }

  if (strikeSpeed > 90 || strongDrive || repeatedContact) {
    const puckNormalSpeed = puck.vx * nx + puck.vy * ny;
    const targetNormalSpeed = Math.max(
      PUCK_MIN_LIVE_SPEED,
      repeatedContact ? EDGE_BLOCK_RESPONSE_SPEED : 0,
      activeStaticPush ? STATIC_STRIKE_MIN_SPEED : 0,
      sweepDriveSpeed * MALLET_STRIKE_TRANSFER
    );
    if (puckNormalSpeed < targetNormalSpeed) {
      const carry = targetNormalSpeed - puckNormalSpeed;
      puck.vx += nx * carry;
      puck.vy += ny * carry;
    }
  }

  if (sweptHit && malletSpeed > 320) {
    const puckTravelAlongMove = puck.vx * moveX + puck.vy * moveY;
    const minimumTravel = Math.max(180, malletSpeed * 0.2);
    if (puckTravelAlongMove < minimumTravel) {
      const carry = minimumTravel - puckTravelAlongMove;
      puck.vx += moveX * carry;
      puck.vy += moveY * carry;
    }
  }

  if (activeStaticPush && malletSpeed > 260) {
    const puckExitSpeed = puck.vx * exitX + puck.vy * exitY;
    if (puckExitSpeed < STATIC_STRIKE_MIN_SPEED) {
      const carry = STATIC_STRIKE_MIN_SPEED - puckExitSpeed;
      puck.vx += exitX * carry;
      puck.vy += exitY * carry;
    }

    const puckMoveSpeed = puck.vx * moveX + puck.vy * moveY;
    const targetMoveSpeed = Math.max(STATIC_SWEEP_MIN_SPEED, malletSpeed * 0.14);
    if (puckMoveSpeed < targetMoveSpeed) {
      const carry = targetMoveSpeed - puckMoveSpeed;
      puck.vx += moveX * carry;
      puck.vy += moveY * carry;
    }
  }

  if (sweptHit && strongDrive && malletSpeed > 650) {
    const tangentX = -ny;
    const tangentY = nx;
    const tangentSpeed = strikeVx * tangentX + strikeVy * tangentY;
    const tangentCarry = clamp(
      tangentSpeed * STRONG_SWEEP_TANGENTIAL_TRANSFER,
      -STRONG_SWEEP_TANGENTIAL_MAX,
      STRONG_SWEEP_TANGENTIAL_MAX
    );
    puck.vx += tangentX * tangentCarry;
    puck.vy += tangentY * tangentCarry;
  }

  stopVerySlowPuck(puck);

  if (sweptHit && hitT < 1) {
    const remaining = dt * (1 - hitT);
    puck.x += puck.vx * remaining;
    puck.y += puck.vy * remaining;
  }

  puck.prevX = puck.x;
  puck.prevY = puck.y;
  puck.lastMalletHitIndex = malletIndex;
  puck.lastMalletHitAt = now;
  puck.hitSerial = ((puck.hitSerial || 0) + 1) & 0xff;
  rememberMalletRelease(puck, malletIndex, exitX, exitY, now);

  const impactSpeed = Math.max(0, -relativeNormalSpeed);
  const intensity = clamp((impactSpeed + strikeSpeed * 0.34) / 3500, 0.14, 0.86);

  room.updatedAt = Date.now();
  return intensity;
}

function getSatCircleContact(ax, ay, ar, bx, by, br) {
  const a = new SAT.Circle(new SAT.Vector(ax, ay), ar);
  const b = new SAT.Circle(new SAT.Vector(bx, by), br);
  const response = new SAT.Response();
  if (!SAT.testCircleCircle(a, b, response)) return null;
  const length = Math.hypot(response.overlapN.x, response.overlapN.y) || 1;
  return {
    nx: response.overlapN.x / length,
    ny: response.overlapN.y / length,
    overlap: response.overlap
  };
}

function findEarliestSweepContact(startX, startY, deltaX, deltaY, radius, epsilon = 0) {
  const a = deltaX * deltaX + deltaY * deltaY;
  if (a <= 0.000001) return null;

  const b = 2 * (startX * deltaX + startY * deltaY);
  const c = startX * startX + startY * startY - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant >= 0) {
    const root = Math.sqrt(discriminant);
    const t0 = (-b - root) / (2 * a);
    if (t0 >= 0 && t0 <= 1) return t0;
  }

  const toward = -(startX * deltaX + startY * deltaY);
  if (toward <= 0) return null;

  const tClosest = clamp(toward / a, 0, 1);
  const closestX = startX + deltaX * tClosest;
  const closestY = startY + deltaY * tClosest;
  const radiusWithEpsilon = radius + epsilon;
  const closestDistanceSq = closestX * closestX + closestY * closestY;
  if (closestDistanceSq > radiusWithEpsilon * radiusWithEpsilon) return null;

  const deltaLength = Math.sqrt(a);
  const rewind = Math.sqrt(Math.max(0, radiusWithEpsilon * radiusWithEpsilon - closestDistanceSq)) / deltaLength;
  return clamp(tClosest - rewind, 0, 1);
}

function getClientNetworkKey(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const rawAddress = forwardedFor || req.socket.remoteAddress || "unknown";
  const address = rawAddress.startsWith("::ffff:") ? rawAddress.slice(7) : rawAddress;

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(address)) {
    const parts = address.split(".");
    const isPrivate =
      parts[0] === "10" ||
      (parts[0] === "172" && Number(parts[1]) >= 16 && Number(parts[1]) <= 31) ||
      (parts[0] === "192" && parts[1] === "168");
    return isPrivate ? `${parts[0]}.${parts[1]}.${parts[2]}.0/24` : address;
  }

  if (address.includes(":")) {
    return `${address.split(":").slice(0, 4).join(":")}::/64`;
  }

  return address;
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
  stopVerySlowPuck(a);
  stopVerySlowPuck(b);
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

  if (!Array.isArray(state.roundScorers)) state.roundScorers = [0, 0];
  let lastScorer = null;
  for (const scorer of scorers) {
    state.scores[scorer] = Math.min(TABLE.firstTo, state.scores[scorer] + 1);
    state.roundScorers[scorer] = (state.roundScorers[scorer] || 0) + 1;
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
    state.nextServeScorer = nextServeScorerFromRound(state.roundScorers);
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

function nextServeScorerFromRound(roundScorers) {
  const bottomScored = roundScorers?.[0] || 0;
  const topScored = roundScorers?.[1] || 0;
  if (bottomScored === topScored) return null;
  return bottomScored > topScored ? 0 : 1;
}

function updateBot(room) {
  const now = Date.now();
  const mallet = room.state.mallets[1];
  const opponent = room.state.mallets[0];
  const brain = updateBotBrain(room, now);
  const defensiveX = TABLE.width / 2;
  const defensiveY = TABLE.height * 0.18;
  const goalLeft = TABLE.width / 2 - TABLE.goalWidth / 2 + TABLE.malletRadius * 0.32;
  const goalRight = TABLE.width / 2 + TABLE.goalWidth / 2 - TABLE.malletRadius * 0.32;
  let target = { x: defensiveX, y: defensiveY };
  let speed = brain.mode === "ambush" ? BOT_MAX_SPEED : brain.mode === "bait" ? 2100 : 2850;

  const servePuck = room.state.pucks.find(
    (puck) => puck.y < TABLE.height / 2 && Math.hypot(puck.vx, puck.vy) < 8
  );
  if (servePuck) {
    const windup = Math.sin(now / 220) * (brain.mode === "ambush" ? 28 : 14);
    const fakePause = brain.mode === "bait" && now < brain.nextDecisionAt - 220;
    mallet.maxSpeed = fakePause ? 1600 : brain.mode === "ambush" ? BOT_MAX_SPEED : 3000;
    mallet.targetX = clamp(
      servePuck.x + windup + brain.side * (brain.mode === "ambush" ? 18 : 8),
      TABLE.malletRadius,
      TABLE.width - TABLE.malletRadius
    );
    mallet.targetY = clamp(
      servePuck.y - (TABLE.malletRadius + TABLE.puckRadius - (brain.mode === "ambush" ? 30 : 14)),
      TABLE.malletRadius,
      TABLE.height / 2 - TABLE.malletRadius - 8
    );
    return;
  }

  const threats = room.state.pucks
    .filter((puck) => puck.y < TABLE.height * 0.66 || puck.vy < -70)
    .map((puck) => {
      const timeToGuardLine =
        puck.vy < -40 ? clamp((puck.y - TABLE.height * 0.18) / -puck.vy, 0, 0.92) : 0.36;
      const timeToGoalLine =
        puck.vy < -40 ? clamp((puck.y - (TABLE.puckRadius + 18)) / -puck.vy, 0, 0.92) : 0.36;
      const predictedGuardX = predictPuckXAtY(puck, TABLE.height * 0.18);
      const predictedGoalX = predictPuckXAtY(puck, TABLE.puckRadius + 28);
      const danger =
        (puck.vy < -90 ? 3 : 0) +
        (puck.y < TABLE.height * 0.38 ? 2 : 0) +
        (predictedGoalX > goalLeft - 34 && predictedGoalX < goalRight + 34 ? 3 : 0) +
        (Math.abs(predictedGoalX - defensiveX) < 86 ? 1.1 : 0) +
        Math.max(0, 1 - timeToGoalLine) * 2;
      return { puck, predictedGuardX, predictedGoalX, danger, timeToGuardLine, timeToGoalLine };
    })
    .sort((a, b) => b.danger - a.danger || a.puck.y - b.puck.y);

  if (threats.length > 0) {
    const threat = threats[0];
    const puck = threat.puck;
    const puckSpeed = Math.hypot(puck.vx, puck.vy);
    const mustGuard =
      threat.danger > 4.4 || puck.y < TABLE.height * 0.34 || puck.vy < -240 || threat.timeToGoalLine < 0.33;
    const interceptBias = puck.vy < 0 ? clamp(threat.timeToGuardLine * 0.36, 0.06, 0.24) : 0.04;
    const surpriseLane = brain.mode === "ambush" && !mustGuard ? brain.side * (52 + Math.sin(now / 160) * 18) : 0;

    if (mustGuard) {
      const guardX = clamp(
        lerp(threat.predictedGuardX, threat.predictedGoalX, threat.timeToGoalLine < 0.22 ? 0.8 : 0.42) +
          puck.vx * 0.04,
        goalLeft,
        goalRight
      );
      target = {
        x: guardX,
        y: clamp(
          TABLE.height * (threat.timeToGoalLine < 0.2 ? 0.11 : 0.145) +
            Math.abs(guardX - defensiveX) * 0.05,
          TABLE.malletRadius,
          TABLE.height * 0.24
        )
      };
      speed = clamp(2900 + puckSpeed * 0.62, 3000, BOT_MAX_SPEED);
    } else {
      const attackPlan = chooseBotAttackTarget(puck, opponent, brain, now, interceptBias, surpriseLane);
      target = attackPlan.target;
      speed = attackPlan.speedBase + clamp(puckSpeed * attackPlan.speedScale, 0, 1200);
    }
  } else if (brain.mode === "bait") {
    target = {
      x: clamp(defensiveX + brain.side * 88, goalLeft, goalRight),
      y: TABLE.height * 0.2
    };
  } else if (brain.mode === "ambush") {
    target = {
      x: clamp(defensiveX + brain.side * 122, TABLE.malletRadius, TABLE.width - TABLE.malletRadius),
      y: TABLE.height * 0.28
    };
  }

  target.x += Math.sin(now / brain.tempo + brain.side) * (brain.mode === "ambush" ? 12 : 5);
  target.y += Math.cos(now / (brain.tempo * 1.22)) * (brain.mode === "bait" ? 5 : 3);
  target.x = clamp(target.x, TABLE.malletRadius, TABLE.width - TABLE.malletRadius);
  target.y = clamp(target.y, TABLE.malletRadius, TABLE.height / 2 - TABLE.malletRadius - 8);
  mallet.maxSpeed = speed;
  mallet.targetX = target.x;
  mallet.targetY = target.y;
}

function updateBotBrain(room, now) {
  if (!room.botBrain || now >= room.botBrain.nextDecisionAt) {
    const roll = Math.random();
    const mode = roll > 0.64 ? "ambush" : roll > 0.34 ? "bait" : "guard";
    room.botBrain = {
      mode,
      side: Math.random() > 0.5 ? 1 : -1,
      tempo: 180 + Math.random() * 420,
      nextDecisionAt: now + (mode === "ambush" ? 420 : 680) + Math.random() * (mode === "ambush" ? 420 : 860)
    };
  }
  return room.botBrain;
}

function chooseBotAttackTarget(puck, opponent, brain, now, interceptBias, surpriseLane) {
  const opponentBias = opponent.x < TABLE.width / 2 ? 1 : -1;
  const openSide = clamp(
    opponent.x + opponentBias * (TABLE.malletRadius * 1.2 + 36),
    TABLE.malletRadius,
    TABLE.width - TABLE.malletRadius
  );
  const cutbackSide = clamp(
    opponent.x - opponentBias * (TABLE.malletRadius * 0.95 + 18),
    TABLE.malletRadius,
    TABLE.width - TABLE.malletRadius
  );
  const laneX =
    brain.mode === "ambush"
      ? openSide
      : brain.mode === "bait"
        ? cutbackSide
        : lerp(openSide, puck.x, 0.45);
  const laneLead = brain.mode === "ambush" ? 0.26 : brain.mode === "bait" ? -0.05 : 0.14;
  const attackY =
    brain.mode === "ambush" && puck.vy > -180
      ? puck.y + 44
      : puck.y - (brain.mode === "bait" ? 128 : 92);

  return {
    target: {
      x: clamp(
        lerp(puck.x + puck.vx * interceptBias, laneX, 0.42) + surpriseLane + Math.sin(now / 210) * 6,
        TABLE.malletRadius,
        TABLE.width - TABLE.malletRadius
      ),
      y: clamp(
        attackY + puck.vy * laneLead,
        TABLE.malletRadius,
        TABLE.height / 2 - TABLE.malletRadius - 8
      )
    },
    speedBase:
      brain.mode === "ambush"
        ? 3100
        : brain.mode === "bait"
          ? 2050
          : 2650,
    speedScale: brain.mode === "ambush" ? 0.55 : brain.mode === "bait" ? 0.18 : 0.38
  };
}

function predictPuckXAtY(puck, targetY) {
  if (Math.abs(puck.vy) < 0.001) return puck.x;
  const t = (targetY - puck.y) / puck.vy;
  if (t < 0) return puck.x;
  let x = puck.x + puck.vx * t;
  const minX = TABLE.puckRadius;
  const maxX = TABLE.width - TABLE.puckRadius;
  const span = maxX - minX;
  if (span <= 0) return clamp(x, minX, maxX);
  x = minX + Math.abs((((x - minX) % (span * 2)) + span * 2) % (span * 2));
  return x > maxX ? maxX - (x - maxX) : x;
}

function resetPucks(room, scorer) {
  const count = room.settings.puckCount;
  const server =
    scorer === 0 ? 1 : scorer === 1 ? 0 : Math.random() > 0.5 ? 0 : 1;
  const serveY = getServeAnchorY(server);
  if (room.matter) resetMatterWorld(room);
  room.state.roundScorers = [0, 0];
  room.state.nextServeScorer = null;
  room.state.pucks = [];
  for (let index = 0; index < count; index += 1) {
    const offset = count === 1 ? 0 : index === 0 ? -58 : 58;
    const position = chooseSafeServePosition(
      room.state,
      TABLE.width / 2 + offset,
      serveY + (count === 1 ? 0 : index === 0 ? -18 : 18),
      server
    );
    room.state.pucks.push({
      id: `p${index}`,
      x: position.x,
      y: position.y,
      vx: 0,
      vy: 0,
      stuckFor: 0,
      lastMalletHitIndex: null,
      lastMalletHitAt: 0,
      hitSerial: 0
    });
  }
  syncMatterPuckBodies(room);
}

function chooseSafeServePosition(state, preferredX, preferredY, server) {
  const r = TABLE.puckRadius;
  const top = server === 0 ? TABLE.height / 2 + r + 12 : r + 12;
  const bottom = server === 0 ? TABLE.height - r - 12 : TABLE.height / 2 - r - 12;
  const safeDistance = TABLE.malletRadius + TABLE.puckRadius + CONTACT_SEPARATION + 12;
  const puckDistance = TABLE.puckRadius * 2 + 16;
  const centerX = TABLE.width / 2;
  const laneStep = 54;
  const rowStep = 46;
  const candidates = [];

  for (const row of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
    for (const lane of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      candidates.push({
        x: clamp(preferredX + lane * laneStep, r + 12, TABLE.width - r - 12),
        y: clamp(preferredY + row * rowStep, top, bottom)
      });
    }
  }

  const valid = candidates.find((candidate) =>
    isSafeServeCandidate(candidate, state, safeDistance, puckDistance)
  );
  if (valid) return valid;

  let fallback = { x: clamp(preferredX, r + 12, TABLE.width - r - 12), y: clamp(preferredY, top, bottom) };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    for (const mallet of state.mallets || []) {
      let dx = fallback.x - mallet.x;
      let dy = fallback.y - mallet.y;
      let distance = Math.hypot(dx, dy);
      if (distance >= safeDistance) continue;
      if (distance <= 0.001) {
        dx = fallback.x < centerX ? -0.55 : 0.55;
        dy = server === 0 ? 1 : -1;
        distance = Math.hypot(dx, dy);
      }
      fallback = {
        x: clamp(mallet.x + (dx / distance) * safeDistance, r + 12, TABLE.width - r - 12),
        y: clamp(mallet.y + (dy / distance) * safeDistance, top, bottom)
      };
    }
  }
  return fallback;
}

function isSafeServeCandidate(candidate, state, malletDistance, puckDistance) {
  for (const mallet of state.mallets || []) {
    if (Math.hypot(candidate.x - mallet.x, candidate.y - mallet.y) < malletDistance) return false;
  }
  for (const puck of state.pucks || []) {
    if (Math.hypot(candidate.x - puck.x, candidate.y - puck.y) < puckDistance) return false;
  }
  return true;
}

function initialState(puckCount = 1) {
  const bottomStart = getMalletStart(0);
  const topStart = getMalletStart(1);
  const state = {
    phase: "waiting",
    phaseEndsAt: 0,
    scores: [0, 0],
    lastScorer: null,
    roundScorers: [0, 0],
    nextServeScorer: null,
    winner: null,
    mallets: [
      {
        x: bottomStart.x,
        y: bottomStart.y,
        targetX: bottomStart.x,
        targetY: bottomStart.y,
        sweepFromX: bottomStart.x,
        sweepFromY: bottomStart.y,
        vx: 0,
        vy: 0,
        matterDriveVx: 0,
        matterDriveVy: 0,
        inputSpeedLimit: HUMAN_MALLET_BASE_SPEED,
        inputSpeedUntil: 0,
        lastInputAt: 0,
        sweepStartedAt: 0,
        hasPendingSweep: false
      },
      {
        x: topStart.x,
        y: topStart.y,
        targetX: topStart.x,
        targetY: topStart.y,
        sweepFromX: topStart.x,
        sweepFromY: topStart.y,
        vx: 0,
        vy: 0,
        matterDriveVx: 0,
        matterDriveVy: 0,
        inputSpeedLimit: HUMAN_MALLET_BASE_SPEED,
        inputSpeedUntil: 0,
        lastInputAt: 0,
        sweepStartedAt: 0,
        hasPendingSweep: false
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
  const starts = [getMalletStart(0), getMalletStart(1)];

  state.mallets.forEach((mallet, index) => {
    mallet.x = starts[index].x;
    mallet.y = starts[index].y;
    mallet.targetX = starts[index].x;
    mallet.targetY = starts[index].y;
    mallet.sweepFromX = starts[index].x;
    mallet.sweepFromY = starts[index].y;
    mallet.vx = 0;
    mallet.vy = 0;
    mallet.matterDriveVx = 0;
    mallet.matterDriveVy = 0;
    mallet.inputSpeedLimit = HUMAN_MALLET_BASE_SPEED;
    mallet.inputSpeedUntil = 0;
    mallet.lastInputAt = 0;
    mallet.sweepStartedAt = 0;
    mallet.hasPendingSweep = false;
  });
}

function getMalletStart(index) {
  const goalFrontOffset = TABLE.malletRadius + 34;
  return {
    x: TABLE.width / 2,
    y: index === 0 ? TABLE.height - goalFrontOffset : goalFrontOffset
  };
}

function getServeAnchorY(server) {
  return server === 0 ? TABLE.height * 0.61 : TABLE.height * 0.39;
}

function sendSnapshots() {
  const now = Date.now();
  for (const room of rooms.values()) {
    sendRoomState(room, now, false);
  }
}

function sendRoomState(room, now = Date.now(), force = false) {
  if (room.state.phase === "playing") settlePuckMalletOverlaps(room);
  const state = publicState(room.state);
  const sent = new Set();
  for (const player of room.players) {
    if (!player || player.bot) continue;
    const client = clients.get(player.id);
    if (!client || sent.has(client.id)) continue;
    if (!force && now - client.lastSnapshotAt < client.snapshotIntervalMs - 1) continue;
    sent.add(client.id);
    client.lastSnapshotAt = now;
    sendRealtime(
      client,
      encodeStatePacket(state, {
        serverTick: room.serverTick,
        ackInputSeq: client.lastInputSeq,
        phaseEndsInMs: state.phaseEndsInMs
      })
    );
  }
}

function sendImmediateHitState(room, now = Date.now()) {
  if (now - (room.lastHitStateAt || 0) < IMMEDIATE_HIT_STATE_GAP_MS) return;
  room.lastHitStateAt = now;
  sendRoomState(room, now, true);
}

function sendInputState(room, now = Date.now()) {
  if (now - (room.lastInputStateAt || 0) < INPUT_STATE_GAP_MS) return;
  room.lastInputStateAt = now;
  sendRoomState(room, now, true);
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
    pruneExpiredDisconnectedPlayers(room, now);
    const hasRetainedHuman = room.players.some((player) => {
      if (!player || player.bot) return false;
      if (player.connected && clients.has(player.id)) return true;
      return Boolean(player.disconnectedAt && now - player.disconnectedAt < RECONNECT_GRACE_MS);
    });
    if (!hasRetainedHuman && now - room.updatedAt > 30_000) {
      rooms.delete(code);
    }
  }
}

function pruneExpiredDisconnectedPlayers(room, now = Date.now()) {
  let changed = false;
  for (let index = 0; index < room.players.length; index += 1) {
    const player = room.players[index];
    if (!player || player.bot) continue;
    if (player.connected) continue;
    if (!player.disconnectedAt || now - player.disconnectedAt < RECONNECT_GRACE_MS) continue;
    room.players[index] = null;
    changed = true;
  }

  if (!changed) return;
  room.updatedAt = now;
  broadcastRoom(room, {
    type: "room",
    code: room.code,
    players: publicPlayers(room),
    settings: room.settings
  });
}

function emitFx(room, kind, force = false, intensity = 0.5) {
  const now = Date.now();
  const key = kind;
  const lastAt = room.lastFxAt.get(key) || 0;
  const minGap = kind === "wall" ? 75 : kind === "hit" ? 55 : 0;
  if (!force && now - lastAt < minGap) return;
  room.lastFxAt.set(key, now);
  broadcastRealtime(room, encodeFxPacket(kind, round(clamp(intensity, 0, 1))));
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

function sendRealtime(client, payload) {
  sendFrame(client, Buffer.from(payload), 0x2);
}

function broadcastRealtime(room, payload) {
  const sent = new Set();
  for (const player of room.players) {
    if (!player || player.bot) continue;
    const client = clients.get(player.id);
    if (client && !sent.has(client.id)) {
      sent.add(client.id);
      sendRealtime(client, payload);
    }
  }
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
    connected: Boolean(player && (player.bot || (player.connected && clients.has(player.id)))),
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
      vy: round(puck.vy),
      lastMalletHitIndex: puck.lastMalletHitIndex,
      hitSerial: puck.hitSerial || 0
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

function makeSelfTestSocket() {
  return {
    writable: true,
    destroyed: false,
    messages: [],
    write(frame) {
      const message = decodeSelfTestTextFrame(frame);
      if (message) this.messages.push(message);
      return true;
    },
    destroy() {
      this.destroyed = true;
      this.writable = false;
    },
    end() {
      this.destroy();
    }
  };
}

function decodeSelfTestTextFrame(frame) {
  const opcode = frame[0] & 0x0f;
  if (opcode !== 0x1) return null;

  let length = frame[1] & 0x7f;
  let offset = 2;
  if (length === 126) {
    length = frame.readUInt16BE(offset);
    offset += 2;
  } else if (length === 127) {
    length = Number(frame.readBigUInt64BE(offset));
    offset += 8;
  }

  try {
    return JSON.parse(frame.subarray(offset, offset + length).toString("utf8"));
  } catch {
    return null;
  }
}

function makeSelfTestClient(id) {
  return {
    id,
    socket: makeSelfTestSocket(),
    buffer: Buffer.alloc(0),
    roomCode: null,
    playerIndex: null,
    playerKey: id,
    queued: false,
    lastInputSeq: 0,
    lastSnapshotAt: 0,
    snapshotIntervalMs: 1000 / SNAPSHOT_HZ,
    displayRefreshHz: SNAPSHOT_HZ,
    networkKey: "self-test-network"
  };
}

export function runActiveDisconnectSelfTest() {
  const suffix = crypto.randomBytes(4).toString("hex");
  const clientA = makeSelfTestClient(`disconnect-a-${suffix}`);
  const clientB = makeSelfTestClient(`disconnect-b-${suffix}`);
  let room = null;

  try {
    clients.set(clientA.id, clientA);
    clients.set(clientB.id, clientB);
    room = makeRoom({ puckCount: 1, lan: true });
    addPlayer(room, clientA, 0);
    addPlayer(room, clientB, 1);
    startRoom(room);
    room.state.phase = "playing";

    const code = room.code;
    disconnect(clientA);

    const noticeSent = clientB.socket.messages.some(
      (message) => message.type === "notice" && message.message === "Opponent left the room"
    );
    const roomRemoved = !rooms.has(code);
    const remainingCleared = clientB.roomCode === null && clientB.playerIndex === null;
    const disconnectedRemoved = !clients.has(clientA.id);
    const disconnectedCleared = clientA.roomCode === null && clientA.playerIndex === null;

    return {
      noticeSent,
      roomRemoved,
      remainingCleared,
      disconnectedRemoved,
      disconnectedCleared,
      passed: noticeSent && roomRemoved && remainingCleared && disconnectedRemoved && disconnectedCleared
    };
  } finally {
    clients.delete(clientA.id);
    clients.delete(clientB.id);
    if (room) rooms.delete(room.code);
  }
}

export function runSlowPuckNoHardStopSelfTest() {
  const puck = { vx: 9, vy: 5 };
  stopVerySlowPuck(puck);
  const speedAfterStopHook = Math.hypot(puck.vx, puck.vy);
  applyPuckInertia(puck, PUCK_INERTIA, 1 / PHYSICS_HZ);
  const speedAfterInertia = Math.hypot(puck.vx, puck.vy);

  return {
    speedAfterStopHook,
    speedAfterInertia,
    passed: speedAfterStopHook > 0 && speedAfterInertia > 0 && speedAfterInertia < speedAfterStopHook
  };
}

export function runPhysicsSelfTest() {
  const room = makeRoom({ puckCount: 1, local: true });
  room.players = [null, null];
  room.state.phase = "playing";
  room.state.pucks = [
    {
      id: "p0",
      x: TABLE.width / 2,
      y: TABLE.height * 0.72,
      prevX: TABLE.width / 2,
      prevY: TABLE.height * 0.72,
      vx: 0,
      vy: 0,
      stuckFor: 0,
      lastMalletHitIndex: null,
      lastMalletHitAt: 0
    }
  ];

  const mallet = room.state.mallets[0];
  mallet.x = TABLE.width / 2 - 150;
  mallet.y = TABLE.height * 0.72;
  mallet.targetX = mallet.x;
  mallet.targetY = mallet.y;
  mallet.lastInputAt = Date.now() - 16;
  mallet.sweepFromX = mallet.x;
  mallet.sweepFromY = mallet.y;
  mallet.sweepStartedAt = mallet.lastInputAt;
  mallet.hasPendingSweep = true;

  const targetX = TABLE.width / 2 + 150;
  const targetY = TABLE.height * 0.72;
  const inputDt = 1 / 60;
  const baseVx = (targetX - mallet.x) / inputDt;
  const baseVy = 0;
  applyDirectInputSweep(room, mallet, 0, targetX, targetY, inputDt, Date.now(), baseVx, baseVy);

  const puck = room.state.pucks[0];
  const distance = Math.hypot(puck.x - mallet.x, puck.y - mallet.y);
  const targetDistance = TABLE.malletRadius + TABLE.puckRadius + HARD_CONTACT_SEPARATION;
  const speed = Math.hypot(puck.vx, puck.vy);
  rooms.delete(room.code);

  return {
    mallet,
    distance,
    targetDistance,
    speed,
    puck,
    passed:
      speed >= 520 &&
      distance >= targetDistance - 0.001 &&
      mallet.x < TABLE.width / 2 - TABLE.puckRadius
  };
}

export function runSatCollisionSelfTest() {
  const touching = getSatCircleContact(0, 0, 10, 15, 0, 10);
  const separate = getSatCircleContact(0, 0, 10, 22, 0, 10);
  return {
    touching,
    separate,
    passed:
      Boolean(touching) &&
      Math.abs(touching.overlap - 5) < 0.001 &&
      touching.nx > 0.99 &&
      separate === null
  };
}

export function runHighSpeedStaticStrikeSelfTest() {
  const room = {
    state: {
      pucks: [],
      mallets: []
    },
    players: [],
    lastFxAt: new Map(),
    updatedAt: Date.now()
  };
  const mallet = {
    x: 110,
    y: 760,
    vx: 0,
    vy: 0,
    targetX: 290,
    targetY: 760,
    sweepFromX: 110,
    sweepFromY: 760,
    sweepStartedAt: Date.now() - 8,
    hasPendingSweep: false
  };
  const puck = {
    id: "static-strike",
    x: 222,
    y: 760,
    prevX: 222,
    prevY: 760,
    vx: 0,
    vy: 0,
    stuckFor: 0,
    lastMalletHitIndex: null,
    lastMalletHitAt: 0
  };
  room.state.mallets = [mallet];
  room.state.pucks = [puck];

  applyDirectInputSweep(room, mallet, 0, 290, 760, 1 / 120, Date.now(), 2600, 0);
  const distance = Math.hypot(puck.x - mallet.x, puck.y - mallet.y);
  const minDistance = TABLE.malletRadius + TABLE.puckRadius;
  const hit = puck.lastMalletHitIndex === 0 || Math.hypot(puck.vx, puck.vy) > 0;
  return {
    hit,
    distance,
    minDistance,
    vx: puck.vx,
    vy: puck.vy,
    passed: Boolean(hit) && distance >= minDistance && Math.hypot(puck.vx, puck.vy) >= PUCK_MIN_LIVE_SPEED
  };
}

export function runRepeatedContactReleaseSelfTest() {
  const now = Date.now();
  const room = {
    state: {
      pucks: [],
      mallets: []
    },
    players: [],
    lastFxAt: new Map(),
    updatedAt: now
  };
  const mallet = {
    x: 200,
    y: 760,
    vx: 80,
    vy: 0,
    targetX: 200,
    targetY: 760,
    sweepFromX: 199.36,
    sweepFromY: 760,
    sweepStartedAt: now - 8,
    hasPendingSweep: true
  };
  const puck = {
    id: "repeated-contact",
    x: 282.75,
    y: 760,
    prevX: 282.75,
    prevY: 760,
    vx: 20,
    vy: 0,
    stuckFor: 0,
    lastMalletHitIndex: 0,
    lastMalletHitAt: now - 8
  };
  room.state.mallets = [mallet];
  room.state.pucks = [puck];

  const hit = collidePuckWithMallet(room, puck, mallet, 0, 1 / PHYSICS_HZ);
  const speedAfterFirst = Math.hypot(puck.vx, puck.vy);
  forceSeparatePuckFromAllMallets(room, puck);
  const secondHit = collidePuckWithMallet(room, puck, mallet, 0, 1 / PHYSICS_HZ);
  const speedAfterSecond = Math.hypot(puck.vx, puck.vy);
  const distance = Math.hypot(puck.x - mallet.x, puck.y - mallet.y);
  const targetDistance = TABLE.malletRadius + TABLE.puckRadius + HARD_CONTACT_SEPARATION;
  return {
    hit: Boolean(hit),
    secondHit: Boolean(secondHit),
    distance,
    targetDistance,
    vx: puck.vx,
    vy: puck.vy,
    speed: speedAfterSecond,
    speedAfterFirst,
    speedAfterSecond,
    passed:
      Boolean(hit) &&
      !secondHit &&
      puck.vx >= PUCK_MIN_LIVE_SPEED &&
      speedAfterSecond <= speedAfterFirst + 1 &&
      distance >= targetDistance - 0.001
  };
}

function stepMatterSelfTestRoom(room, frames = 1) {
  for (let frame = 0; frame < frames; frame += 1) {
    moveMallets(room, DT);
    if (room.state.phase === "playing") settlePuckMalletOverlaps(room);
    for (let substep = 0; substep < PUCK_SUBSTEPS && room.state.phase === "playing"; substep += 1) {
      stepPucks(room, DT / PUCK_SUBSTEPS);
    }
    for (const mallet of room.state.mallets) {
      mallet.sweepFromX = mallet.x;
      mallet.sweepFromY = mallet.y;
      mallet.sweepStartedAt = 0;
      mallet.hasPendingSweep = false;
      mallet.matterDriveVx = 0;
      mallet.matterDriveVy = 0;
    }
  }
}

export function runDirectInputNoSwallowSelfTest() {
  const now = Date.now();
  const initialPuckX = TABLE.width / 2;
  const room = makeRoom({ puckCount: 1, lan: true });
  room.players = [null, null];
  room.state.phase = "playing";
  room.state.pucks = [
    {
      id: "direct-input-no-swallow",
      x: initialPuckX,
      y: TABLE.height * 0.72,
      prevX: initialPuckX,
      prevY: TABLE.height * 0.72,
      vx: 0,
      vy: 0,
      stuckFor: 0,
      lastMalletHitIndex: null,
      lastMalletHitAt: 0,
      hitSerial: 0
    }
  ];

  const mallet = room.state.mallets[0];
  mallet.x = TABLE.width / 2 - 110;
  mallet.y = TABLE.height * 0.72;
  mallet.targetX = mallet.x;
  mallet.targetY = mallet.y;
  mallet.vx = 0;
  mallet.vy = 0;
  mallet.lastInputAt = now - 40;
  mallet.sweepFromX = mallet.x;
  mallet.sweepFromY = mallet.y;
  mallet.sweepStartedAt = mallet.lastInputAt;
  mallet.hasPendingSweep = true;
  resetMatterWorld(room);
  syncMatterPuckBodies(room);

  const client = {
    id: "self-test-client",
    roomCode: room.code,
    playerIndex: 0,
    lastInputSeq: 0
  };
  updateInput(client, {
    playerIndex: 0,
    x: TABLE.width / 2 + 110,
    y: TABLE.height * 0.72,
    inputSeq: 1
  });
  stepMatterSelfTestRoom(room, 3);
  sendRoomState(room, now, true);

  const snapshot = publicState(room.state);
  const puck = snapshot.pucks[0];
  const publicMallet = snapshot.mallets[0];
  const distance = Math.hypot(puck.x - publicMallet.x, puck.y - publicMallet.y);
  const targetDistance = TABLE.malletRadius + TABLE.puckRadius + HARD_CONTACT_SEPARATION;
  const speed = Math.hypot(puck.vx, puck.vy);
  const malletStayedOnImpactSide =
    publicMallet.x <= puck.x - TABLE.malletRadius - TABLE.puckRadius + HARD_CONTACT_SEPARATION + 0.02;
  rooms.delete(room.code);

  return {
    distance,
    targetDistance,
    malletStayedOnImpactSide,
    speed,
    puck,
    mallet: publicMallet,
    passed:
      distance >= targetDistance - 0.02 &&
      malletStayedOnImpactSide &&
      puck.lastMalletHitIndex === 0 &&
      puck.hitSerial > 0 &&
      speed >= PUCK_MIN_LIVE_SPEED &&
      puck.x !== publicMallet.x
  };
}

export function runDynamicMalletMatterSelfTest() {
  const cases = [0, 1].map((malletIndex) => {
    const room = makeRoom({ puckCount: 1, lan: true });
    room.players = [null, null];
    room.state.phase = "playing";
    const direction = malletIndex === 0 ? 1 : -1;
    const puckY = malletIndex === 0 ? TABLE.height * 0.72 : TABLE.height * 0.28;
    const initialPuck = {
      id: `dynamic-mallet-${malletIndex}`,
      x: TABLE.width / 2,
      y: puckY,
      prevX: TABLE.width / 2,
      prevY: puckY,
      vx: 0,
      vy: 0,
      stuckFor: 0,
      lastMalletHitIndex: null,
      lastMalletHitAt: 0,
      hitSerial: 0
    };
    room.state.pucks = [initialPuck];
    const mallet = room.state.mallets[malletIndex];
    mallet.x = TABLE.width / 2;
    mallet.y = puckY + direction * 100;
    mallet.targetX = mallet.x;
    mallet.targetY = mallet.y;
    mallet.vx = 0;
    mallet.vy = 0;
    mallet.matterDriveVx = 0;
    mallet.matterDriveVy = 0;
    mallet.lastInputAt = Date.now() - 12;
    mallet.sweepFromX = mallet.x;
    mallet.sweepFromY = mallet.y;
    mallet.sweepStartedAt = mallet.lastInputAt;
    mallet.hasPendingSweep = true;
    resetMatterWorld(room);
    syncMatterPuckBodies(room);

    const client = {
      id: `dynamic-mallet-client-${malletIndex}`,
      roomCode: room.code,
      playerIndex: malletIndex,
      lastInputSeq: 0
    };
    updateInput(client, {
      playerIndex: malletIndex,
      x: TABLE.width / 2,
      y: puckY - direction * 100,
      inputSeq: 1
    });
    stepMatterSelfTestRoom(room, 3);

    const puck = room.state.pucks[0];
    const body = room.matter.malletBodies[malletIndex];
    const distance = Math.hypot(puck.x - mallet.x, puck.y - mallet.y);
    const minDistance = TABLE.malletRadius + TABLE.puckRadius + HARD_CONTACT_SEPARATION;
    const speed = Math.hypot(puck.vx, puck.vy);
    const stayedOnContactSide =
      malletIndex === 0
        ? mallet.y >= puck.y + TABLE.malletRadius + TABLE.puckRadius - 1.5
        : mallet.y <= puck.y - TABLE.malletRadius - TABLE.puckRadius + 1.5;
    const bodySynced =
      body &&
      !body.isStatic &&
      body.mass >= MATTER_MALLET_MASS * 0.99 &&
      Math.abs(body.position.x - mallet.x) < 0.001 &&
      Math.abs(body.position.y - mallet.y) < 0.001;
    rooms.delete(room.code);

    return {
      malletIndex,
      distance,
      minDistance,
      speed,
      stayedOnContactSide,
      bodySynced,
      puck,
      mallet,
      passed:
        bodySynced &&
        stayedOnContactSide &&
        distance >= minDistance - 0.02 &&
        puck.lastMalletHitIndex === malletIndex &&
        puck.hitSerial > 0 &&
        speed >= PUCK_MIN_LIVE_SPEED
    };
  });

  return {
    cases,
    passed: cases.every((entry) => entry.passed)
  };
}

export function runMatterMalletSweepGuardSelfTest() {
  const room = makeRoom({ puckCount: 1, lan: true });
  room.players = [null, null];
  room.state.phase = "playing";
  const puck = {
    id: "matter-sweep-guard",
    x: TABLE.width / 2,
    y: TABLE.height * 0.72,
    prevX: TABLE.width / 2,
    prevY: TABLE.height * 0.72,
    vx: 0,
    vy: 0,
    stuckFor: 0,
    lastMalletHitIndex: null,
    lastMalletHitAt: 0
  };
  room.state.pucks = [puck];
  const mallet = room.state.mallets[0];
  const startX = TABLE.width / 2 - 130;
  const targetX = TABLE.width / 2 + 130;
  mallet.x = startX;
  mallet.y = puck.y;

  const guarded = guardMalletSweepWithMatter(room, 0, mallet.x, mallet.y, targetX, puck.y);
  const contactX = puck.x - TABLE.malletRadius - TABLE.puckRadius;
  const movingAway = guardMalletSweepWithMatter(room, 0, contactX, puck.y, contactX - 40, puck.y);
  rooms.delete(room.code);

  return {
    guarded,
    movingAway,
    passed:
      guarded.blocked &&
      guarded.x <= puck.x - TABLE.malletRadius - TABLE.puckRadius + 0.001 &&
      guarded.t > 0 &&
      guarded.t < 1 &&
      !movingAway.blocked
  };
}

export function runServerMatterWorldSelfTest() {
  const room = makeRoom({ puckCount: 2, lan: true });
  room.players = [null, null];
  room.state.phase = "playing";
  room.state.pucks = [
    {
      id: "matter-wall",
      x: TABLE.width - TABLE.puckRadius - 2,
      y: TABLE.height * 0.7,
      prevX: TABLE.width - TABLE.puckRadius - 2,
      prevY: TABLE.height * 0.7,
      vx: 900,
      vy: 0,
      stuckFor: 0,
      lastMalletHitIndex: null,
      lastMalletHitAt: 0,
      hitSerial: 0
    },
    {
      id: "matter-peer",
      x: TABLE.width / 2,
      y: TABLE.height * 0.7,
      prevX: TABLE.width / 2,
      prevY: TABLE.height * 0.7,
      vx: 0,
      vy: 0,
      stuckFor: 0,
      lastMalletHitIndex: null,
      lastMalletHitAt: 0,
      hitSerial: 0
    }
  ];
  resetMatterWorld(room);
  syncMatterPuckBodies(room);

  stepPucks(room, 1 / PHYSICS_HZ);

  const puck = room.state.pucks.find((entry) => entry.id === "matter-wall");
  const body = room.matter.puckBodies.get("matter-wall");
  const synced =
    puck &&
    body &&
    Math.abs(puck.x - body.position.x) < 0.001 &&
    Math.abs(puck.y - body.position.y) < 0.001;
  const bounced = puck?.vx < 0 && puck.x <= TABLE.width - TABLE.puckRadius + 0.5;
  const matterActive =
    room.matter.engine.world.bodies.includes(body) &&
    room.matter.engine.world.bodies.some((entry) => entry.label === "wall") &&
    room.matter.engine.world.bodies.some((entry) => entry.label === "mallet-0");
  const malletBody = room.matter.malletBodies[0];
  const dynamicMallet =
    malletBody &&
    !malletBody.isStatic &&
    malletBody.mass >= MATTER_MALLET_MASS * 0.99 &&
    Number.isFinite(malletBody.inverseMass) &&
    malletBody.inverseMass > 0;
  rooms.delete(room.code);

  return {
    puck,
    synced,
    bounced,
    matterActive,
    dynamicMallet,
    passed: Boolean(synced && bounced && matterActive && dynamicMallet)
  };
}

export function runTickConfigSelfTest() {
  return {
    physicsHz: PHYSICS_HZ,
    snapshotHz: SNAPSHOT_HZ,
    passed:
      PHYSICS_HZ >= 240 &&
      PHYSICS_HZ <= 480 &&
      SNAPSHOT_HZ >= 120 &&
      SNAPSHOT_HZ <= Math.min(240, PHYSICS_HZ)
  };
}

export function runInputProtocolSelfTest() {
  const packet = encodeInputPacket({
    inputSeq: 7,
    clientTick: 9,
    playerIndex: 1,
    x: 123,
    y: 456,
    inputSpeed: 8765
  });
  const decoded = decodeInputPacket(packet);
  const legacy = decodeInputPacket(packet.slice(0, 10));
  return {
    packetLength: packet.length,
    decoded,
    legacyInputSpeed: legacy?.inputSpeed,
    passed:
      packet.length === 12 &&
      decoded?.inputSpeed === 8765 &&
      decoded?.x === 123 &&
      decoded?.y === 456 &&
      legacy?.inputSpeed === 0
  };
}

export function runInputSpeedBudgetSelfTest() {
  const now = Date.now();
  const room = makeRoom({ puckCount: 1, lan: true });
  room.players = [null, null];
  room.state.phase = "playing";
  room.state.pucks = [];

  const mallet = room.state.mallets[0];
  const startX = TABLE.width / 2 - 180;
  const startY = TABLE.height * 0.76;
  mallet.x = startX;
  mallet.y = startY;
  mallet.targetX = startX;
  mallet.targetY = startY;
  mallet.vx = 0;
  mallet.vy = 0;
  mallet.lastInputAt = now - 16;
  mallet.inputSpeedLimit = HUMAN_MALLET_BASE_SPEED;
  mallet.inputSpeedUntil = 0;
  resetMatterWorld(room);

  const client = {
    id: "input-speed-client",
    roomCode: room.code,
    playerIndex: 0,
    lastInputSeq: 0
  };
  updateInput(client, {
    playerIndex: 0,
    x: startX + 260,
    y: startY,
    inputSeq: 1,
    inputSpeed: 9000
  });
  const requestedSpeed = mallet.inputSpeedLimit;
  stepMatterSelfTestRoom(room, 1);
  const fastMove = Math.hypot(mallet.x - startX, mallet.y - startY);

  const legacyStartX = TABLE.width / 2 - 180;
  mallet.x = legacyStartX;
  mallet.y = startY;
  mallet.targetX = legacyStartX;
  mallet.targetY = startY;
  mallet.vx = 0;
  mallet.vy = 0;
  mallet.lastInputAt = Date.now() - 16;
  mallet.inputSpeedLimit = HUMAN_MALLET_BASE_SPEED;
  mallet.inputSpeedUntil = 0;
  resetMatterWorld(room);
  updateInput(client, {
    playerIndex: 0,
    x: legacyStartX + 40,
    y: startY,
    inputSeq: 2
  });
  const legacyRequestedSpeed = mallet.inputSpeedLimit;
  rooms.delete(room.code);

  return {
    requestedSpeed,
    legacyRequestedSpeed,
    fastMove,
    baseMovePerTick: HUMAN_MALLET_BASE_SPEED / PHYSICS_HZ,
    passed:
      requestedSpeed > HUMAN_MALLET_BASE_SPEED &&
      legacyRequestedSpeed >= HUMAN_MALLET_BASE_SPEED &&
      fastMove > HUMAN_MALLET_BASE_SPEED / PHYSICS_HZ &&
      fastMove >= 259.9
  };
}

export function runMalletReleaseLockSelfTest() {
  const now = Date.now();
  const room = {
    state: {
      pucks: [],
      mallets: []
    },
    players: [],
    lastFxAt: new Map(),
    updatedAt: now
  };
  const mallet = {
    x: 300,
    y: 760,
    vx: 480,
    vy: 0
  };
  const puck = {
    id: "release-lock",
    x: 250,
    y: 760,
    prevX: 250,
    prevY: 760,
    vx: 0,
    vy: 0,
    stuckFor: 0,
    releaseMalletIndex: 0,
    releaseNx: -1,
    releaseNy: 0,
    releaseUntil: now + MALLET_RELEASE_LOCK_MS
  };
  room.state.mallets = [mallet];
  room.state.pucks = [puck];

  forceSeparatePuckFromMallet(room, puck, mallet, 0);
  const releaseDistance = (puck.x - mallet.x) * puck.releaseNx + (puck.y - mallet.y) * puck.releaseNy;
  const releaseSpeed = puck.vx * puck.releaseNx + puck.vy * puck.releaseNy;
  return {
    x: puck.x,
    y: puck.y,
    releaseDistance,
    releaseSpeed,
    passed:
      releaseDistance >= TABLE.malletRadius + TABLE.puckRadius + CONTACT_SEPARATION &&
      releaseSpeed >= EDGE_BLOCK_RESPONSE_SPEED
  };
}

export function runDoubleHitDebounceSelfTest() {
  const now = Date.now();
  const room = {
    state: {
      pucks: [],
      mallets: []
    },
    players: [],
    lastFxAt: new Map(),
    updatedAt: now
  };
  const mallet = {
    x: 290,
    y: 760,
    vx: 2600,
    vy: 0,
    targetX: 290,
    targetY: 760,
    sweepFromX: 110,
    sweepFromY: 760,
    sweepStartedAt: now - 8,
    hasPendingSweep: true
  };
  const puck = {
    id: "double-hit",
    x: 222,
    y: 760,
    prevX: 222,
    prevY: 760,
    vx: 0,
    vy: 0,
    stuckFor: 0,
    lastMalletHitIndex: null,
    lastMalletHitAt: 0
  };
  room.state.mallets = [mallet];
  room.state.pucks = [puck];

  const firstHit = collidePuckWithMallet(room, puck, mallet, 0, 1 / PHYSICS_HZ);
  const speedAfterFirst = Math.hypot(puck.vx, puck.vy);
  const secondHit = collidePuckWithMallet(room, puck, mallet, 0, 1 / PHYSICS_HZ);
  const speedAfterSecond = Math.hypot(puck.vx, puck.vy);
  const distance = Math.hypot(puck.x - mallet.x, puck.y - mallet.y);
  const minDistance = TABLE.malletRadius + TABLE.puckRadius;

  return {
    firstHit: Boolean(firstHit),
    secondHit: Boolean(secondHit),
    speedAfterFirst,
    speedAfterSecond,
    distance,
    passed:
      Boolean(firstHit) &&
      !secondHit &&
      speedAfterSecond <= speedAfterFirst + 1 &&
      distance >= minDistance + HARD_CONTACT_SEPARATION - 0.001
  };
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

function constrainMalletAwayFromPucks(index, x, y, pucks) {
  let point = constrainMallet(index, x, y);
  const minDistance = TABLE.malletRadius + TABLE.puckRadius + CONTACT_SEPARATION;
  for (const puck of pucks || []) {
    let dx = point.x - puck.x;
    let dy = point.y - puck.y;
    let distance = Math.hypot(dx, dy);
    if (distance >= minDistance) continue;

    if (distance <= 0.001) {
      const homeY = index === 0 ? 1 : -1;
      dx = 0;
      dy = homeY;
      distance = 1;
    }

    point = constrainMallet(
      index,
      puck.x + (dx / distance) * minDistance,
      puck.y + (dy / distance) * minDistance
    );
  }
  return point;
}

function stopVerySlowPuck(puck) {
  const speed = Math.hypot(puck.vx, puck.vy);
  if (speed > 0 && speed < 0.001) {
    puck.vx = 0;
    puck.vy = 0;
  }
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return (min + max) / 2;
  return Math.max(min, Math.min(max, value));
}

function readTickHz(name, fallback, min, max) {
  return Math.round(clamp(Number(process.env[name]) || fallback, min, max));
}

function lerp(from, to, alpha) {
  return from + (to - from) * alpha;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function round(value) {
  return Math.round(value * 100) / 100;
}
