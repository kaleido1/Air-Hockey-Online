export function getMalletStart(table, index, offset) {
  return {
    x: table.width / 2,
    y: index === 0 ? table.height - offset : offset
  };
}

export function getServeAnchorY(table, server) {
  return server === 0 ? table.height * 0.61 : table.height * 0.39;
}

export function applyPuckInertia(puck, config = {}, dt = 0) {
  const elapsed = Math.max(0, dt);
  const speed = Math.hypot(puck.vx || 0, puck.vy || 0);
  if (speed <= 0.001) {
    puck.vx = 0;
    puck.vy = 0;
    return;
  }

  const frictionPerSecond = clamp(
    Number.isFinite(config.frictionPerSecond) ? config.frictionPerSecond : 1,
    0,
    1
  );
  const linearFriction = Math.max(0, config.linearFriction || 0);
  const stopSpeed = Math.max(0, config.stopSpeed || 0);
  const dampedSpeed = speed * Math.pow(frictionPerSecond, elapsed);
  const nextSpeed = Math.max(0, dampedSpeed - linearFriction * elapsed);

  if (nextSpeed <= stopSpeed) {
    puck.vx = 0;
    puck.vy = 0;
    return;
  }

  const scale = nextSpeed / speed;
  puck.vx *= scale;
  puck.vy *= scale;
}

export function limitPointStep(fromX, fromY, toX, toY, maxDistance) {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const distance = Math.hypot(dx, dy);
  const limit = Math.max(0, maxDistance);
  if (distance <= limit || distance <= 0.001) {
    return { x: toX, y: toY };
  }
  const scale = limit / distance;
  return {
    x: fromX + dx * scale,
    y: fromY + dy * scale
  };
}

export function chooseSafeServePosition(table, config, state, preferredX, preferredY, server) {
  const r = table.puckRadius;
  const top = server === 0 ? table.height / 2 + r + 12 : r + 12;
  const bottom = server === 0 ? table.height - r - 12 : table.height / 2 - r - 12;
  const safeDistance = table.malletRadius + table.puckRadius + config.contactSeparation + 12;
  const puckDistance = table.puckRadius * 2 + 16;
  const centerX = table.width / 2;
  const laneStep = 54;
  const rowStep = 46;
  const candidates = [];

  for (const row of [0, 1, -1, 2, -2, 3, -3, 4, -4]) {
    for (const lane of [0, -1, 1, -2, 2, -3, 3, -4, 4]) {
      candidates.push({
        x: clamp(preferredX + lane * laneStep, r + 12, table.width - r - 12),
        y: clamp(preferredY + row * rowStep, top, bottom)
      });
    }
  }

  const valid = candidates.find((candidate) =>
    isSafeServeCandidate(candidate, state, safeDistance, puckDistance)
  );
  if (valid) return valid;

  let fallback = {
    x: clamp(preferredX, r + 12, table.width - r - 12),
    y: clamp(preferredY, top, bottom)
  };
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
        x: clamp(mallet.x + (dx / distance) * safeDistance, r + 12, table.width - r - 12),
        y: clamp(mallet.y + (dy / distance) * safeDistance, top, bottom)
      };
    }
  }
  return fallback;
}

export function detectGoalCrossing(table, puck) {
  const goalLeft = table.width / 2 - table.goalWidth / 2;
  const goalRight = table.width / 2 + table.goalWidth / 2;
  const prevX = Number.isFinite(puck.prevX) ? puck.prevX : puck.x;
  const prevY = Number.isFinite(puck.prevY) ? puck.prevY : puck.y;

  if (crossedGoalLine(prevX, prevY, puck.x, puck.y, 0, goalLeft, goalRight, -1)) return 0;
  if (crossedGoalLine(prevX, prevY, puck.x, puck.y, table.height, goalLeft, goalRight, 1)) return 1;

  if (puck.x > goalLeft && puck.x < goalRight) {
    if (puck.y < -table.puckRadius * 0.25 || (puck.y < table.puckRadius * 0.45 && puck.vy < -180)) return 0;
    if (
      puck.y > table.height + table.puckRadius * 0.25 ||
      (puck.y > table.height - table.puckRadius * 0.45 && puck.vy > 180)
    ) {
      return 1;
    }
  }
  return null;
}

export function resolveSweptPuckMalletContact(table, config, puck, mallet, index, now) {
  const minDistance = table.malletRadius + table.puckRadius;
  const puckStartX = Number.isFinite(puck.prevX) ? puck.prevX : puck.x;
  const puckStartY = Number.isFinite(puck.prevY) ? puck.prevY : puck.y;
  const malletStartX = Number.isFinite(mallet.physicsPrevX) ? mallet.physicsPrevX : mallet.x;
  const malletStartY = Number.isFinite(mallet.physicsPrevY) ? mallet.physicsPrevY : mallet.y;
  const puckDeltaX = puck.x - puckStartX;
  const puckDeltaY = puck.y - puckStartY;
  const malletDeltaX = mallet.x - malletStartX;
  const malletDeltaY = mallet.y - malletStartY;
  const relativeStartX = puckStartX - malletStartX;
  const relativeStartY = puckStartY - malletStartY;
  const relativeDeltaX = puckDeltaX - malletDeltaX;
  const relativeDeltaY = puckDeltaY - malletDeltaY;
  const endDx = puck.x - mallet.x;
  const endDy = puck.y - mallet.y;
  const endDistance = Math.hypot(endDx, endDy);
  const recentSameMallet =
    puck.lastMalletHitIndex === index && now - (puck.lastMalletHitAt || 0) < config.rehitSuppressionMs;
  let hitT = null;

  if (Math.hypot(relativeStartX, relativeStartY) <= minDistance + config.contactSlop) {
    hitT = 0;
  } else {
    hitT = findEarliestSweepContact(
      relativeStartX,
      relativeStartY,
      relativeDeltaX,
      relativeDeltaY,
      minDistance,
      config.contactSlop
    );
  }

  if (hitT === null && endDistance <= minDistance + config.contactSlop) {
    hitT = 1;
  }
  if (hitT === null) return null;
  if (recentSameMallet && endDistance >= minDistance - 0.5) return null;

  const contactPuckX = puckStartX + puckDeltaX * hitT;
  const contactPuckY = puckStartY + puckDeltaY * hitT;
  const contactMalletX = malletStartX + malletDeltaX * hitT;
  const contactMalletY = malletStartY + malletDeltaY * hitT;
  let nx = contactPuckX - contactMalletX;
  let ny = contactPuckY - contactMalletY;
  let length = Math.hypot(nx, ny);
  if (length <= 0.001) {
    nx = relativeDeltaX || (puck.vx || 0) - (mallet.vx || 0) || 1;
    ny = relativeDeltaY || (puck.vy || 0) - (mallet.vy || 0) || 0;
    length = Math.hypot(nx, ny) || 1;
  }
  nx /= length;
  ny /= length;

  let vx = puck.vx || 0;
  let vy = puck.vy || 0;
  const relativeNormalSpeed = (vx - (mallet.vx || 0)) * nx + (vy - (mallet.vy || 0)) * ny;
  if (relativeNormalSpeed < 0) {
    const impulse = -(1 + config.restitution) * relativeNormalSpeed;
    vx += nx * impulse;
    vy += ny * impulse;
  }

  const malletNormalSpeed = Math.max(0, (mallet.vx || 0) * nx + (mallet.vy || 0) * ny);
  const targetNormalSpeed = Math.max(config.blockReleaseSpeed, malletNormalSpeed * config.malletTransfer);
  const puckNormalSpeed = vx * nx + vy * ny;
  if (puckNormalSpeed < targetNormalSpeed) {
    const carry = targetNormalSpeed - puckNormalSpeed;
    vx += nx * carry;
    vy += ny * carry;
  }

  return {
    x: mallet.x + nx * (minDistance + config.hardContactSeparation),
    y: mallet.y + ny * (minDistance + config.hardContactSeparation),
    vx,
    vy,
    hitT,
    nx,
    ny
  };
}

function crossedGoalLine(prevX, prevY, x, y, lineY, goalLeft, goalRight, direction) {
  const movedTowardGoal = direction < 0 ? y <= lineY && prevY >= lineY : y >= lineY && prevY <= lineY;
  if (!movedTowardGoal) return false;
  const dy = y - prevY;
  const t = Math.abs(dy) <= 0.000001 ? 1 : clamp((lineY - prevY) / dy, 0, 1);
  const xAtLine = prevX + (x - prevX) * t;
  return xAtLine > goalLeft && xAtLine < goalRight;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
