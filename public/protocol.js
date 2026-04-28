const MESSAGE = {
  INPUT: 1,
  STATE: 2,
  FX: 3
};

const PHASES = ["waiting", "countdown", "playing", "point", "paused", "gameover"];
const FX_KINDS = ["hit", "wall", "score", "victory"];
const MAX_PUCKS = 2;

export function encodeInputPacket({ inputSeq, clientTick, playerIndex, x, y }) {
  const packet = new Uint8Array(10);
  const view = new DataView(packet.buffer);
  packet[0] = MESSAGE.INPUT;
  view.setUint16(1, inputSeq & 0xffff);
  view.setUint16(3, clientTick & 0xffff);
  packet[5] = clampByte(playerIndex);
  view.setUint16(6, clampUint16(x));
  view.setUint16(8, clampUint16(y));
  return packet;
}

export function decodeInputPacket(packet) {
  const bytes = ensureUint8Array(packet);
  if (bytes.length < 10 || bytes[0] !== MESSAGE.INPUT) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    type: "input",
    inputSeq: view.getUint16(1),
    clientTick: view.getUint16(3),
    playerIndex: bytes[5],
    x: view.getUint16(6),
    y: view.getUint16(8)
  };
}

export function encodeStatePacket(state, options = {}) {
  const packet = new Uint8Array(45);
  const view = new DataView(packet.buffer);
  const phaseIndex = Math.max(0, PHASES.indexOf(state.phase));
  const phaseEndsInMs = clampUint16(options.phaseEndsInMs || 0);
  const ackInputSeq = clampUint16(options.ackInputSeq || 0);
  const pucks = Array.isArray(state.pucks) ? state.pucks.slice(0, MAX_PUCKS) : [];
  let puckMask = 0;

  packet[0] = MESSAGE.STATE;
  view.setUint16(1, clampUint16(options.serverTick || 0));
  view.setUint16(3, ackInputSeq);
  packet[5] = phaseIndex;
  view.setUint16(6, phaseEndsInMs);
  packet[8] = clampByte(state.scores?.[0] || 0);
  packet[9] = clampByte(state.scores?.[1] || 0);
  packet[10] = clampIndex(state.lastScorer);
  packet[11] = clampIndex(state.winner);

  for (let index = 0; index < pucks.length; index += 1) {
    puckMask |= 1 << index;
  }
  packet[12] = puckMask;

  let offset = 13;
  for (let index = 0; index < 2; index += 1) {
    writeBody(view, offset, state.mallets?.[index]);
    offset += 8;
  }

  for (let index = 0; index < MAX_PUCKS; index += 1) {
    writeBody(view, offset, pucks[index]);
    offset += 8;
  }

  return packet;
}

export function decodeStatePacket(packet, now = Date.now()) {
  const bytes = ensureUint8Array(packet);
  if (bytes.length < 45 || bytes[0] !== MESSAGE.STATE) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const phaseEndsInMs = view.getUint16(6);
  const puckMask = bytes[12];
  let offset = 13;

  const mallets = [];
  for (let index = 0; index < 2; index += 1) {
    mallets.push(readBody(view, offset));
    offset += 8;
  }

  const pucks = [];
  for (let index = 0; index < MAX_PUCKS; index += 1) {
    const body = readBody(view, offset);
    if (puckMask & (1 << index)) {
      body.id = `p${index}`;
      pucks.push(body);
    }
    offset += 8;
  }

  const phase = PHASES[bytes[5]] || "waiting";
  return {
    type: "state",
    now,
    ackInputSeq: view.getUint16(3),
    state: {
      phase,
      phaseEndsInMs,
      phaseEndsAt: phaseEndsInMs ? now + phaseEndsInMs : 0,
      scores: [bytes[8], bytes[9]],
      lastScorer: decodeIndex(bytes[10]),
      winner: decodeIndex(bytes[11]),
      mallets,
      pucks
    },
    serverTick: view.getUint16(1)
  };
}

export function encodeFxPacket(kind, intensity = 0.5) {
  const packet = new Uint8Array(3);
  packet[0] = MESSAGE.FX;
  packet[1] = Math.max(0, FX_KINDS.indexOf(kind));
  packet[2] = clampByte(Math.round(clamp(intensity, 0, 1) * 255));
  return packet;
}

export function decodeFxPacket(packet) {
  const bytes = ensureUint8Array(packet);
  if (bytes.length < 3 || bytes[0] !== MESSAGE.FX) return null;
  return {
    type: "fx",
    kind: FX_KINDS[bytes[1]] || "hit",
    intensity: bytes[2] / 255
  };
}

export function decodeRealtimePacket(packet, now = Date.now()) {
  const bytes = ensureUint8Array(packet);
  switch (bytes[0]) {
    case MESSAGE.INPUT:
      return decodeInputPacket(bytes);
    case MESSAGE.STATE:
      return decodeStatePacket(bytes, now);
    case MESSAGE.FX:
      return decodeFxPacket(bytes);
    default:
      return null;
  }
}

function writeBody(view, offset, body) {
  view.setInt16(offset, clampInt16(body?.x || 0));
  view.setInt16(offset + 2, clampInt16(body?.y || 0));
  view.setInt16(offset + 4, clampInt16(body?.vx || 0));
  view.setInt16(offset + 6, clampInt16(body?.vy || 0));
}

function readBody(view, offset) {
  return {
    x: view.getInt16(offset),
    y: view.getInt16(offset + 2),
    vx: view.getInt16(offset + 4),
    vy: view.getInt16(offset + 6)
  };
}

function decodeIndex(value) {
  return value > 0 ? value - 1 : null;
}

function clampIndex(value) {
  return value === 0 || value === 1 ? value + 1 : 0;
}

function clampUint16(value) {
  return Math.max(0, Math.min(0xffff, Math.round(Number(value) || 0)));
}

function clampInt16(value) {
  return Math.max(-0x8000, Math.min(0x7fff, Math.round(Number(value) || 0)));
}

function clampByte(value) {
  return Math.max(0, Math.min(0xff, Math.round(Number(value) || 0)));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function ensureUint8Array(packet) {
  if (packet instanceof Uint8Array) return packet;
  if (packet instanceof ArrayBuffer) return new Uint8Array(packet);
  if (ArrayBuffer.isView(packet)) {
    return new Uint8Array(packet.buffer, packet.byteOffset, packet.byteLength);
  }
  return new Uint8Array(0);
}
