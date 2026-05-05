import assert from "node:assert/strict";
import {
  advanceDisplayPuck,
  applyPuckInertia,
  chooseSafeServePosition,
  detectGoalCrossing,
  getMalletStart,
  getServeAnchorY,
  limitPointStep,
  resolveDirectMalletSweep,
  resolveSweptPuckMalletContact,
  separatePuckFromMallet
} from "../public/offline-physics.js";
import { decodeRealtimePacket, encodeStatePacket } from "../public/protocol.js";

const TABLE = {
  width: 590,
  height: 1024,
  goalWidth: 256,
  malletRadius: 54,
  puckRadius: 29,
  firstTo: 7
};

const CONFIG = {
  blockReleaseSpeed: 165,
  contactSeparation: 0.2,
  contactSlop: 0.7,
  frictionPerSecond: 0.985,
  hardContactSeparation: 1.4,
  linearFriction: 18,
  malletTransfer: 0.56,
  rehitSuppressionMs: 68,
  restitution: 0.72,
  wallRestitution: 0.91,
  stopSpeed: 0
};
const PRE_OFFENSE_PUCK_MAX_SPEED = 2400;

function testMalletStartsNearOwnGoals() {
  const offset = TABLE.malletRadius + 34;
  const bottom = getMalletStart(TABLE, 0, offset);
  const top = getMalletStart(TABLE, 1, offset);

  assert.equal(bottom.x, TABLE.width / 2);
  assert.equal(top.x, TABLE.width / 2);
  assert.ok(bottom.y > TABLE.height - TABLE.malletRadius - 45);
  assert.ok(top.y < TABLE.malletRadius + 45);
}

function testServeAvoidsMallets() {
  const offset = TABLE.malletRadius + 34;
  const state = {
    mallets: [getMalletStart(TABLE, 0, offset), getMalletStart(TABLE, 1, offset)],
    pucks: []
  };
  const server = 0;
  const position = chooseSafeServePosition(
    TABLE,
    CONFIG,
    state,
    TABLE.width / 2,
    getServeAnchorY(TABLE, server),
    server
  );
  const minDistance = TABLE.malletRadius + TABLE.puckRadius + CONFIG.contactSeparation + 12;

  for (const mallet of state.mallets) {
    assert.ok(Math.hypot(position.x - mallet.x, position.y - mallet.y) >= minDistance);
  }
}

function testStatePacketPreservesPuckMasks() {
  const baseState = {
    phase: "countdown",
    scores: [0, 0],
    lastScorer: null,
    winner: null,
    mallets: [
      { x: 295, y: 936, vx: 0, vy: 0 },
      { x: 295, y: 88, vx: 0, vy: 0 }
    ]
  };
  const onePuck = decodeRealtimePacket(
    encodeStatePacket({
      ...baseState,
      pucks: [{ id: "p0", x: 295, y: 624, vx: 0, vy: 0, lastMalletHitIndex: null, hitSerial: 0 }]
    })
  );
  const twoPucks = decodeRealtimePacket(
    encodeStatePacket({
      ...baseState,
      pucks: [
        { id: "p0", x: 237, y: 606, vx: 0, vy: 0, lastMalletHitIndex: null, hitSerial: 0 },
        { id: "p1", x: 353, y: 642, vx: 0, vy: 0, lastMalletHitIndex: 1, hitSerial: 7 }
      ]
    })
  );

  assert.equal(onePuck.state.pucks.length, 1);
  assert.equal(onePuck.state.pucks[0].id, "p0");
  assert.equal(twoPucks.state.pucks.length, 2);
  assert.equal(twoPucks.state.pucks[1].id, "p1");
  assert.equal(twoPucks.state.pucks[1].lastMalletHitIndex, 1);
  assert.equal(twoPucks.state.pucks[1].hitSerial, 7);
}

function testFastMalletSweepHitsStaticPuck() {
  const puck = {
    id: "p0",
    prevX: 295,
    prevY: 512,
    x: 295,
    y: 512,
    vx: 0,
    vy: 0,
    lastMalletHitIndex: null,
    lastMalletHitAt: 0
  };
  const mallet = {
    physicsPrevX: 120,
    physicsPrevY: 512,
    x: 470,
    y: 512,
    vx: 5200,
    vy: 0
  };
  const result = resolveSweptPuckMalletContact(TABLE, CONFIG, puck, mallet, 0, 1000);

  assert.ok(result, "fast sweep should hit the static puck");
  assert.ok(Math.hypot(result.x - mallet.x, result.y - mallet.y) >= TABLE.malletRadius + TABLE.puckRadius);
  assert.ok(Math.hypot(result.vx, result.vy) >= CONFIG.blockReleaseSpeed);
}

function testBottomMalletOverlapFallbackPushesPuckUp() {
  const mallet = { x: TABLE.width / 2, y: TABLE.height * 0.72, vx: 0, vy: 0 };
  const puck = { x: mallet.x, y: mallet.y, vx: 0, vy: 0 };
  const result = separatePuckFromMallet(TABLE, CONFIG, puck, mallet, 0);
  const distance = Math.hypot(puck.x - mallet.x, puck.y - mallet.y);
  const target = TABLE.malletRadius + TABLE.puckRadius + CONFIG.hardContactSeparation;

  assert.ok(result, "overlapping bottom mallet should separate the puck");
  assert.ok(puck.y < mallet.y, "bottom mallet should push concentric puck upward");
  assert.ok(distance >= target - 0.001);
}

function testTopMalletOverlapFallbackPushesPuckDown() {
  const mallet = { x: TABLE.width / 2, y: TABLE.height * 0.28, vx: 0, vy: 0 };
  const puck = { x: mallet.x, y: mallet.y, vx: 0, vy: 0 };
  const result = separatePuckFromMallet(TABLE, CONFIG, puck, mallet, 1);
  const distance = Math.hypot(puck.x - mallet.x, puck.y - mallet.y);
  const target = TABLE.malletRadius + TABLE.puckRadius + CONFIG.hardContactSeparation;

  assert.ok(result, "overlapping top mallet should separate the puck");
  assert.ok(puck.y > mallet.y, "top mallet should push concentric puck downward");
  assert.ok(distance >= target - 0.001);
}

function testStrongSweepUsesUncappedOffensiveSpeedBudget() {
  const puck = {
    id: "p0",
    prevX: 295,
    prevY: 512,
    x: 295,
    y: 512,
    vx: 0,
    vy: 0,
    lastMalletHitIndex: null,
    lastMalletHitAt: 0
  };
  const mallet = {
    physicsPrevX: 120,
    physicsPrevY: 512,
    x: 470,
    y: 512,
    vx: 4300,
    vy: 0
  };
  const result = resolveSweptPuckMalletContact(TABLE, CONFIG, puck, mallet, 0, 1000);

  assert.ok(result, "strong sweep should hit the static puck");
  const speed = Math.hypot(result.vx, result.vy);
  assert.ok(speed > PRE_OFFENSE_PUCK_MAX_SPEED, "strong sweep should exceed the previous max-speed budget");
}

function testDirectSweepHelperMatchesOfflineStrikeFeel() {
  const puck = {
    id: "p0",
    x: 295,
    y: 512,
    vx: 0,
    vy: 0,
    lastMalletHitIndex: null,
    lastMalletHitAt: 0
  };
  const result = resolveDirectMalletSweep(
    TABLE,
    {
      ...CONFIG,
      directContactSlop: 0.04,
      directStrikeBase: 170,
      directStrikeScale: 0.105,
      directSweepCarryScale: 8,
      staticPuckSpeed: 70,
      staticStrikeSpeed: 500,
      staticSweepSpeed: 440,
      strongSweepTangentialMax: 180,
      strongSweepTangentialTransfer: 0.08
    },
    puck,
    { fromX: 120, fromY: 512, toX: 470, toY: 512, inputDt: 1 / 120 },
    0,
    1000
  );

  assert.ok(result, "shared direct sweep should hit the puck");
  assert.ok(Math.hypot(result.x - 470, result.y - 512) >= TABLE.malletRadius + TABLE.puckRadius);
  assert.ok(Math.hypot(result.vx, result.vy) > PRE_OFFENSE_PUCK_MAX_SPEED);
}

function testFastPuckCannotTunnelThroughStationaryMallet() {
  const puck = {
    id: "p0",
    prevX: 295,
    prevY: 760,
    x: 295,
    y: 965,
    vx: 0,
    vy: 2600,
    lastMalletHitIndex: null,
    lastMalletHitAt: 0
  };
  const mallet = {
    physicsPrevX: 295,
    physicsPrevY: 900,
    x: 295,
    y: 900,
    vx: 0,
    vy: 0
  };
  const result = resolveSweptPuckMalletContact(TABLE, CONFIG, puck, mallet, 0, 1000);

  assert.ok(result, "fast puck should collide with the stationary mallet it crosses");
  assert.ok(result.vy < 0, "bottom mallet should send the puck back upward");
  assert.ok(result.y < mallet.y, "puck should be separated on the impact side");
}

function testGoalScoredWhenPuckCrossesLineBetweenFrames() {
  const goalEdgeX = TABLE.width / 2 + TABLE.goalWidth / 2;
  const topGoal = {
    prevX: TABLE.width / 2,
    prevY: 34,
    x: TABLE.width / 2,
    y: -48,
    vx: 0,
    vy: -1500
  };
  const bottomGoal = {
    prevX: TABLE.width / 2,
    prevY: TABLE.height - 34,
    x: TABLE.width / 2,
    y: TABLE.height + 48,
    vx: 0,
    vy: 1500
  };
  const insideArcIntersection = {
    prevX: goalEdgeX - 0.5,
    prevY: TABLE.height - 34,
    x: goalEdgeX - 0.5,
    y: TABLE.height + 48,
    vx: 0,
    vy: 1500
  };
  const outsideArcIntersection = {
    prevX: goalEdgeX + 0.5,
    prevY: TABLE.height - 34,
    x: goalEdgeX + 0.5,
    y: TABLE.height + 48,
    vx: 0,
    vy: 1500
  };

  assert.equal(detectGoalCrossing(TABLE, topGoal), 0);
  assert.equal(detectGoalCrossing(TABLE, bottomGoal), 1);
  assert.equal(detectGoalCrossing(TABLE, insideArcIntersection), 1);
  assert.equal(detectGoalCrossing(TABLE, outsideArcIntersection), null);
}

function testCornerPuckDoesNotCountAsGoal() {
  const cornerCases = [
    {
      prevX: TABLE.puckRadius + 3,
      prevY: TABLE.puckRadius + 4,
      x: TABLE.puckRadius + 1,
      y: -TABLE.puckRadius * 0.6,
      vx: -120,
      vy: -260
    },
    {
      prevX: TABLE.width - TABLE.puckRadius - 3,
      prevY: TABLE.puckRadius + 4,
      x: TABLE.width - TABLE.puckRadius - 1,
      y: -TABLE.puckRadius * 0.6,
      vx: 120,
      vy: -260
    },
    {
      prevX: TABLE.puckRadius + 3,
      prevY: TABLE.height - TABLE.puckRadius - 4,
      x: TABLE.puckRadius + 1,
      y: TABLE.height + TABLE.puckRadius * 0.6,
      vx: -120,
      vy: 260
    },
    {
      prevX: TABLE.width - TABLE.puckRadius - 3,
      prevY: TABLE.height - TABLE.puckRadius - 4,
      x: TABLE.width - TABLE.puckRadius - 1,
      y: TABLE.height + TABLE.puckRadius * 0.6,
      vx: 120,
      vy: 260
    }
  ];

  for (const puck of cornerCases) {
    assert.equal(detectGoalCrossing(TABLE, puck), null);
  }
}

function testPuckInertiaDampsWithoutSnappingFastPuck() {
  const puck = { vx: 1000, vy: 0 };

  applyPuckInertia(puck, CONFIG, 0.5);

  assert.ok(puck.vx < 1000, "surface drag should slow the puck");
  assert.ok(puck.vx > 950, "fast pucks should keep most of their momentum over a short step");
  assert.equal(puck.vy, 0);
}

function testPuckInertiaKeepsSlowPuckMoving() {
  const puck = { vx: 9, vy: 5 };
  const before = Math.hypot(puck.vx, puck.vy);

  applyPuckInertia(puck, CONFIG, 1 / 240);

  const after = Math.hypot(puck.vx, puck.vy);
  assert.ok(after > 0, "slow pucks should not be hard-stopped");
  assert.ok(after < before, "surface drag should still slow low-speed pucks");
}

function testMalletStepLimiterCapsInputJump() {
  const limited = limitPointStep(0, 0, 100, 0, 38);

  assert.equal(limited.x, 38);
  assert.equal(limited.y, 0);
}

function testDisplayPuckAdvancesByVelocity() {
  const puck = { id: "display-forward", x: 120, y: 300, vx: 1000, vy: -240 };

  const result = advanceDisplayPuck(TABLE, { ...CONFIG, frictionPerSecond: 1, linearFriction: 0 }, puck, 0.05);

  assert.equal(result.x, 170);
  assert.equal(result.y, 288);
  assert.equal(result.vx, 1000);
  assert.equal(result.vy, -240);
  assert.equal(puck.x, 120, "display advance should not mutate authoritative puck state");
}

function testDisplayPuckBouncesOffSideWall() {
  const puck = {
    id: "display-wall",
    x: TABLE.width - TABLE.puckRadius - 4,
    y: 420,
    vx: 1200,
    vy: 0
  };

  const result = advanceDisplayPuck(TABLE, { ...CONFIG, frictionPerSecond: 1, linearFriction: 0 }, puck, 0.02);

  assert.ok(result.x <= TABLE.width - TABLE.puckRadius, "display puck should stay inside side wall");
  assert.ok(result.vx < 0, "display puck should reflect from the right wall");
  assert.ok(Math.abs(result.vx + 1200 * CONFIG.wallRestitution) < 0.001);
}

function testDisplayPuckAppliesFrictionWithoutHardStop() {
  const puck = { id: "display-friction", x: 220, y: 380, vx: 800, vy: 0 };

  const result = advanceDisplayPuck(TABLE, CONFIG, puck, 0.05);

  assert.ok(result.vx < 800, "display advance should apply surface drag");
  assert.ok(result.vx > 780, "display drag should be gentle over a short visual lead");
  assert.ok(result.x > puck.x, "display puck should still advance after drag");
}

const tests = [
  testMalletStartsNearOwnGoals,
  testServeAvoidsMallets,
  testStatePacketPreservesPuckMasks,
  testFastMalletSweepHitsStaticPuck,
  testBottomMalletOverlapFallbackPushesPuckUp,
  testTopMalletOverlapFallbackPushesPuckDown,
  testStrongSweepUsesUncappedOffensiveSpeedBudget,
  testDirectSweepHelperMatchesOfflineStrikeFeel,
  testFastPuckCannotTunnelThroughStationaryMallet,
  testGoalScoredWhenPuckCrossesLineBetweenFrames,
  testCornerPuckDoesNotCountAsGoal,
  testPuckInertiaDampsWithoutSnappingFastPuck,
  testPuckInertiaKeepsSlowPuckMoving,
  testMalletStepLimiterCapsInputJump,
  testDisplayPuckAdvancesByVelocity,
  testDisplayPuckBouncesOffSideWall,
  testDisplayPuckAppliesFrictionWithoutHardStop
];

process.env.AIR_HOCKEY_NO_LISTEN = "1";
const {
  runActiveDisconnectSelfTest,
  runDynamicMalletMatterSelfTest,
  runImmediateInputStateSelfTest,
  runInputSpeedBudgetSelfTest,
  runSlowPuckNoHardStopSelfTest,
  runTickConfigSelfTest,
  runTurnCredentialNormalizationSelfTest,
  runWebRtcSignalRelaySelfTest
} = await import("../server.mjs");

function testActiveDisconnectClosesRemoteRoom() {
  const result = runActiveDisconnectSelfTest();
  assert.ok(result.passed, JSON.stringify(result));
}

function testServerSlowPuckIsNotHardStopped() {
  const result = runSlowPuckNoHardStopSelfTest();
  assert.ok(result.passed, JSON.stringify(result));
}

function testServerUsesChosenTickRates() {
  const result = runTickConfigSelfTest();
  assert.ok(result.passed, JSON.stringify(result));
}

function testServerDynamicMalletUsesAuthoritativeStrikeSpeed() {
  const result = runDynamicMalletMatterSelfTest();
  assert.ok(result.passed, JSON.stringify(result));
}

function testServerHumanInputSpeedBudgetIsUncapped() {
  const result = runInputSpeedBudgetSelfTest();
  assert.ok(result.passed, JSON.stringify(result));
}

function testServerAppliesInputImmediately() {
  const result = runImmediateInputStateSelfTest();
  assert.ok(result.passed, JSON.stringify(result));
}

function testTurnCredentialsNormalizeSafely() {
  const result = runTurnCredentialNormalizationSelfTest();
  assert.ok(result.passed, JSON.stringify(result));
}

function testWebRtcSignalsRelayOnlyToOpponent() {
  const result = runWebRtcSignalRelaySelfTest();
  assert.ok(result.passed, JSON.stringify(result));
}

tests.push(
  testActiveDisconnectClosesRemoteRoom,
  testServerSlowPuckIsNotHardStopped,
  testServerUsesChosenTickRates,
  testServerDynamicMalletUsesAuthoritativeStrikeSpeed,
  testServerHumanInputSpeedBudgetIsUncapped,
  testServerAppliesInputImmediately,
  testTurnCredentialsNormalizeSafely,
  testWebRtcSignalsRelayOnlyToOpponent
);

for (const test of tests) {
  await test();
}

console.log(`physics tests passed: ${tests.length}`);
