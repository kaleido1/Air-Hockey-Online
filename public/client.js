const canvas = document.querySelector("#rink");
let ctx =
  canvas.getContext("2d", { alpha: false, desynchronized: true }) ||
  canvas.getContext("2d");

const els = {
  youScore: document.querySelector("#youScore"),
  opponentScore: document.querySelector("#opponentScore"),
  youLabel: document.querySelector("#youLabel"),
  opponentLabel: document.querySelector("#opponentLabel"),
  roomPill: document.querySelector("#roomPill"),
  centerStatus: document.querySelector("#centerStatus"),
  connectionStatus: document.querySelector("#connectionStatus"),
  pingStatus: document.querySelector("#pingStatus"),
  roomCode: document.querySelector("#roomCode"),
  roomInput: document.querySelector("#roomInput"),
  joinForm: document.querySelector("#joinForm"),
  quickButton: document.querySelector("#quickButton"),
  createButton: document.querySelector("#createButton"),
  botButton: document.querySelector("#botButton"),
  copyButton: document.querySelector("#copyButton"),
  restartButton: document.querySelector("#restartButton"),
  leaveButton: document.querySelector("#leaveButton"),
  onePuckButton: document.querySelector("#onePuckButton"),
  twoPuckButton: document.querySelector("#twoPuckButton"),
  eyebrow: document.querySelector(".eyebrow"),
  panelTitle: document.querySelector(".panel h1"),
  joinButton: document.querySelector("#joinForm button"),
  metaLabels: document.querySelectorAll(".meta dt")
};

const TABLE = {
  width: 590,
  height: 1024,
  goalWidth: 178,
  malletRadius: 54,
  puckRadius: 29,
  firstTo: 7
};

const colors = {
  puck: "#ff3b15",
  line: "rgba(255,255,255,0.9)",
  tableTop: "#7fa7e8",
  tableBottom: "#285998",
  dot: "rgba(18,48,98,0.55)",
  cream: "#fff5c8",
  gold: "#c79625",
  railDark: "#4a5158",
  railLight: "#f6f7f4"
};

const LANGUAGE_STORAGE_KEY = "air-hockey-online-language";
const translations = {
  zh: {
    you: "你",
    opponent: "对手",
    bot: "电脑",
    offline: "离线",
    online: "在线",
    connecting: "连接中",
    error: "错误",
    reconnecting: "重新连接",
    chooseMode: "选择模式",
    searching: "搜索中",
    waitingOpponent: "等待对手",
    practice: "练习",
    rejoining: "重新加入",
    getReady: "准备",
    notice: "提示",
    goal: "进球",
    victory: "胜利",
    defeat: "失败",
    mainSingle: "单人游戏",
    mainLocal: "双人游戏",
    mainWireless: "无线双人游戏",
    mainOnline: "在线双人游戏",
    onlineTitle: "在线双人游戏",
    onlineHint: "创建房间或输入房间号远程联机",
    createOnlineRoom: "创建房间",
    joinOnlineRoom: "加入房间",
    enterRoomCode: "输入房间号",
    roomCodeDisplay: "房间号",
    shareRoomCode: "把房间号发给朋友",
    puckTitle: "选择冰球数量",
    onePuck: "1 个冰球",
    twoPuck: "2 个冰球",
    wirelessTitle: "无线双人游戏",
    wirelessHint: "两名玩家点击加入即可开始",
    joinBattle: "加入对战",
    back: "返回",
    waitingOtherPlayer: "等待另一名玩家",
    waitingOtherPlayerJoin: "等待另一名玩家加入",
    readyToStart: "准备开始",
    waitingJoin: "等待对手加入",
    backMenu: "返回菜单",
    unavailable: "暂不可用",
    paused: "已暂停",
    pauseTouchHint: "双击中间取消暂停",
    pauseKeyHint: "按空格取消暂停",
    returnMain: "返回主界面",
    resetGame: "重置游戏",
    linkCopied: "链接已复制",
    opponentLeft: "对手已离开",
    unableJoin: "无法加入对战",
    roomNotFound: "房间不存在",
    roomFull: "房间已满",
    invalidRoomCode: "请输入有效房间号",
    quickMatch: "快速匹配",
    createRoom: "创建房间",
    practiceBot: "练习电脑",
    roomCode: "房间码",
    join: "加入",
    copyLink: "复制链接",
    restart: "重开本局",
    leave: "离开",
    firstToSeven: "先到 7 分",
    room: "房间",
    status: "状态",
    ping: "延迟",
    languageButton: "EN"
  },
  en: {
    you: "You",
    opponent: "Opponent",
    bot: "Bot",
    offline: "Offline",
    online: "Online",
    connecting: "Connecting",
    error: "Error",
    reconnecting: "Reconnecting",
    chooseMode: "Choose a mode",
    searching: "Searching",
    waitingOpponent: "Waiting for opponent",
    practice: "Practice",
    rejoining: "Rejoining",
    getReady: "Get ready",
    notice: "Notice",
    goal: "Goal",
    victory: "Victory",
    defeat: "Defeat",
    mainSingle: "Single Player",
    mainLocal: "Two Players",
    mainWireless: "Wireless Two Players",
    mainOnline: "Online Two Players",
    onlineTitle: "Online Two Players",
    onlineHint: "Create a room or enter a room code",
    createOnlineRoom: "Create Room",
    joinOnlineRoom: "Join Room",
    enterRoomCode: "Enter room code",
    roomCodeDisplay: "Room Code",
    shareRoomCode: "Send this room code to your friend",
    puckTitle: "Choose Pucks",
    onePuck: "1 Puck",
    twoPuck: "2 Pucks",
    wirelessTitle: "Wireless Two Players",
    wirelessHint: "Both players tap Join to start",
    joinBattle: "Join Battle",
    back: "Back",
    waitingOtherPlayer: "Waiting for another player",
    waitingOtherPlayerJoin: "Waiting for another player",
    readyToStart: "Ready",
    waitingJoin: "Waiting for opponent",
    backMenu: "Back to Menu",
    unavailable: "Unavailable",
    paused: "Paused",
    pauseTouchHint: "Double tap center to resume",
    pauseKeyHint: "Press Space to resume",
    returnMain: "Back to Menu",
    resetGame: "Reset Game",
    linkCopied: "Link copied",
    opponentLeft: "Opponent left",
    unableJoin: "Unable to join",
    roomNotFound: "Room not found",
    roomFull: "Room is full",
    invalidRoomCode: "Enter a valid room code",
    quickMatch: "Quick Match",
    createRoom: "Create Room",
    practiceBot: "Practice Bot",
    roomCode: "Room code",
    join: "Join",
    copyLink: "Copy Link",
    restart: "Restart",
    leave: "Leave",
    firstToSeven: "First to 7",
    room: "Room",
    status: "Status",
    ping: "Ping",
    languageButton: "中"
  }
};

let currentLanguage = getInitialLanguage();

let socket = null;
let connected = false;
let playerIndex = null;
let puckCount = 1;
let roomCode = "";
let roomSettings = null;
let serverState = null;
let previousState = null;
let roomPlayers = null;
let pendingRoomFromUrl = new URLSearchParams(location.search).get("room") || "";
let pointerDown = false;
const lastInputAtByPlayer = [0, 0];
let lastPingSentAt = 0;
let reconnectTimer = 0;
let heartbeatTimer = 0;
let audio = null;
let audioPrimed = false;
let statusRaw = "chooseMode";
let statusText = t("chooseMode");
const playerKey = getPlayerKey();

const trails = new Map();
let uiScreen = pendingRoomFromUrl ? "waiting" : "main";
let previousUiScreen = null;
let uiTransitionStartedAt = performance.now();
let pendingStartMode = "bot";
let menuButtons = [];
let soundEnabled = true;
let lastPhase = null;
let phaseChangedAt = performance.now();
let gameoverReturnTimer = 0;
const activePointers = new Map();
const touchCapable = navigator.maxTouchPoints > 0 || "ontouchstart" in window;
let lastCenterTapAt = 0;
let renderScale = 1;
let tableCache = null;
let malletSprite = null;
let puckSprite = null;
let canvasMetrics = null;
let currentCursor = "";
const predictedMallets = new Map();
const LOCAL_PREDICTION_WINDOW_MS = 90;

applyLanguage();
connect();
resizeCanvas();
requestAnimationFrame(render);

window.addEventListener("resize", resizeCanvas);
window.addEventListener("pointerdown", unlockAudio, { capture: true, passive: true });
window.addEventListener("touchstart", unlockAudio, { capture: true, passive: true });
window.addEventListener("mousedown", unlockAudio, { capture: true, passive: true });
window.addEventListener("keydown", unlockAudio, { capture: true });

els.onePuckButton.addEventListener("click", () => setPuckCount(1));
els.twoPuckButton.addEventListener("click", () => setPuckCount(2));
els.quickButton.addEventListener("click", () => {
  unlockAudio();
  send({ type: "quick", puckCount });
  setStatus("searching");
});
els.createButton.addEventListener("click", () => {
  unlockAudio();
  send({ type: "create", puckCount });
  setStatus("waitingOpponent");
});
els.botButton.addEventListener("click", () => {
  unlockAudio();
  send({ type: "create", puckCount, bot: true });
  setStatus("practice");
});
els.joinForm.addEventListener("submit", (event) => {
  event.preventDefault();
  unlockAudio();
  const code = els.roomInput.value.trim().toUpperCase();
  if (code) send({ type: "join", code });
});
els.copyButton.addEventListener("click", async () => {
  if (!roomCode || !roomSettings?.lan) return;
  const url = new URL(location.href);
  url.searchParams.set("room", roomCode);
  try {
    await navigator.clipboard.writeText(url.href);
    setStatus("linkCopied");
  } catch {
    setStatus(roomCode);
  }
});
els.restartButton.addEventListener("click", () => send({ type: "restart" }));
els.leaveButton.addEventListener("click", () => {
  send({ type: "leave" });
  clearRoom();
});

canvas.addEventListener("pointerdown", (event) => {
  pointerDown = true;
  canvas.setPointerCapture(event.pointerId);
  measureCanvas();
  unlockAudio();
  const point = eventToCanvas(event);
  if (point && handleCanvasUi(point, event.detail || 1)) {
    pointerDown = false;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Some browsers release capture automatically after UI clicks.
    }
    return;
  }
  if (point && handleTouchPause(event, point)) {
    pointerDown = false;
    try {
      canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Some browsers release capture automatically after UI clicks.
    }
    return;
  }
  if (isLocalGame() && point) {
    const localIndex = point.y < TABLE.height / 2 ? 1 : 0;
    activePointers.set(event.pointerId, localIndex);
    sendPointer(event, true, localIndex);
  } else {
    sendPointer(event, true);
  }
});

canvas.addEventListener("pointermove", (event) => {
  if (!isActivePlay()) return;
  if (isLocalGame()) {
    const localIndex = activePointers.get(event.pointerId);
    if (localIndex === 0 || localIndex === 1) sendPointer(event, false, localIndex);
  } else {
    sendPointer(event, false);
  }
});

canvas.addEventListener("pointerup", (event) => {
  pointerDown = false;
  if (isActivePlay()) {
    const localIndex = activePointers.get(event.pointerId);
    sendPointer(event, true, localIndex);
  }
  activePointers.delete(event.pointerId);
});

canvas.addEventListener("pointercancel", () => {
  pointerDown = false;
  activePointers.clear();
});

window.addEventListener("keydown", (event) => {
  if (event.code !== "Space") return;
  if (!roomCode || !serverState || !["playing", "paused"].includes(serverState.phase)) return;
  event.preventDefault();
  unlockAudio();
  send({ type: "pause" });
});

function connect() {
  clearTimeout(reconnectTimer);
  socket = new WebSocket(getWebSocketUrl());

  socket.addEventListener("open", () => {
    connected = true;
    els.connectionStatus.textContent = t("online");
    setButtons();
    if (roomCode && playerIndex !== null) {
      send({ type: "join", code: roomCode, preferredIndex: playerIndex });
      setStatus("rejoining");
    }
    heartbeat();
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    handleMessage(message);
  });

  socket.addEventListener("close", () => {
    connected = false;
    clearTimeout(heartbeatTimer);
    els.connectionStatus.textContent = t("offline");
    setStatus("reconnecting");
    setButtons();
    reconnectTimer = setTimeout(connect, 900);
  });

  socket.addEventListener("error", () => {
    els.connectionStatus.textContent = t("error");
  });
}

function getWebSocketUrl() {
  const configuredUrl = String(window.AIR_HOCKEY_SERVER_URL || "").trim();
  const base = configuredUrl ? new URL(configuredUrl) : location;
  const protocol = base.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://${base.host}/ws`;
}

function handleMessage(message) {
  switch (message.type) {
    case "hello":
      if (pendingRoomFromUrl) {
        send({ type: "join", code: pendingRoomFromUrl });
        pendingRoomFromUrl = "";
      }
      break;
    case "queued":
      showUi("waiting");
      setStatus("searching");
      break;
    case "joined":
      roomCode = message.code;
      playerIndex = message.playerIndex;
      roomSettings = message.settings;
      puckCount = message.settings.puckCount;
      setPuckCount(puckCount, false);
      setStatus(playerIndex === 0 ? "waitingOpponent" : "getReady");
      showUi("waiting");
      setButtons();
      updateRoomLabels();
      break;
    case "room":
      roomPlayers = message.players || roomPlayers;
      updateRoomLabels(message);
      if (message.players?.[1]?.bot) setStatus("practice");
      break;
    case "started":
      showUi(null);
      setStatus("getReady");
      break;
    case "state":
      previousState = serverState;
      serverState = message.state;
      roomSettings = message.settings || roomSettings;
      if (serverState.phase !== lastPhase) {
        lastPhase = serverState.phase;
        phaseChangedAt = performance.now();
        if (serverState.phase === "gameover") {
          scheduleGameoverReturn();
          const self = playerIndex === 1 ? 1 : 0;
          if (serverState.winner === self) playFx("victory", 1);
        }
        if (serverState.phase === "paused" || serverState.phase === "gameover") clearControls();
        if (serverState.phase !== "gameover" && gameoverReturnTimer) {
          clearTimeout(gameoverReturnTimer);
          gameoverReturnTimer = 0;
        }
      }
      updateScoreboard(message);
      updatePhaseText();
      updateTrails();
      if (["playing", "countdown", "point", "gameover", "paused"].includes(message.state.phase)) {
        showUi(null);
      } else if (message.state.phase === "waiting" && roomCode) {
        showUi("waiting");
      }
      break;
    case "score":
      playFx("score", 1);
      break;
    case "fx":
      playFx(message.kind, message.intensity);
      break;
    case "notice":
      if (message.message === "Opponent left the room") {
        clearRoom();
        setUiNotice("opponentLeft");
      } else if (message.message) {
        setUiNotice(message.message);
      }
      setStatus(message.message || "notice");
      break;
    case "error":
      setUiNotice(message.message || "unableJoin");
      setStatus(message.message || "error");
      break;
    case "left":
      clearRoom();
      break;
    case "pong":
      if (message.at) {
        els.pingStatus.textContent = `${Math.max(1, Date.now() - Number(message.at))} ms`;
      }
      break;
    default:
      break;
  }
}

function heartbeat() {
  if (!connected) return;
  const now = Date.now();
  if (now - lastPingSentAt > 1400) {
    lastPingSentAt = now;
    send({ type: "ping", at: now });
  }
  clearTimeout(heartbeatTimer);
  heartbeatTimer = setTimeout(heartbeat, 700);
}

function getInitialLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // Ignore storage failures in private browsing modes.
  }
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function t(key) {
  return translations[currentLanguage]?.[key] || translations.en[key] || key;
}

function translateStatus(text) {
  const statusMap = {
    "Choose a mode": "chooseMode",
    Searching: "searching",
    "Waiting for opponent": "waitingOpponent",
    Practice: "practice",
    Reconnecting: "reconnecting",
    Rejoining: "rejoining",
    "Get ready": "getReady",
    Goal: "goal",
    Notice: "notice",
    Error: "error",
    "Link copied": "linkCopied",
    "Opponent left the room": "opponentLeft",
    "Room not found": "roomNotFound",
    "Room is full": "roomFull",
    "Enter a valid room code": "invalidRoomCode",
    胜利: "victory",
    失败: "defeat",
    对手已离开: "opponentLeft",
    无法加入对战: "unableJoin",
    等待另一名玩家: "waitingOtherPlayer",
    链接已复制: "linkCopied"
  };
  const key = statusMap[text] || text;
  return translations[currentLanguage]?.[key] || key || "";
}

function toggleLanguage() {
  currentLanguage = currentLanguage === "zh" ? "en" : "zh";
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, currentLanguage);
  } catch {
    // Language still changes for the current session.
  }
  applyLanguage();
}

function applyLanguage() {
  document.documentElement.lang = currentLanguage === "zh" ? "zh-CN" : "en";
  els.youLabel.textContent = t("you");
  els.opponentLabel.textContent = t("opponent");
  els.roomPill.textContent = roomCode || t("offline");
  els.connectionStatus.textContent = connected ? t("online") : t("connecting");
  els.eyebrow.textContent = "Air Hockey Online";
  els.panelTitle.textContent = t("firstToSeven");
  els.onePuckButton.textContent = t("onePuck");
  els.twoPuckButton.textContent = t("twoPuck");
  els.quickButton.textContent = t("quickMatch");
  els.createButton.textContent = t("createRoom");
  els.botButton.textContent = t("practiceBot");
  els.roomInput.placeholder = t("roomCode");
  els.roomInput.setAttribute("aria-label", t("roomCode"));
  els.joinButton.textContent = t("join");
  els.copyButton.textContent = t("copyLink");
  els.restartButton.textContent = t("restart");
  els.leaveButton.textContent = t("leave");
  [t("room"), t("status"), t("ping")].forEach((label, index) => {
    if (els.metaLabels[index]) els.metaLabels[index].textContent = label;
  });
  setStatus(statusRaw);
  updateScoreboard();
}

function setPuckCount(count, updateButtons = true) {
  puckCount = count === 2 ? 2 : 1;
  if (updateButtons) {
    els.onePuckButton.classList.toggle("active", puckCount === 1);
    els.twoPuckButton.classList.toggle("active", puckCount === 2);
  } else {
    requestAnimationFrame(() => setPuckCount(puckCount, true));
  }
}

function updateScoreboard(message = {}) {
  if (!serverState) return;
  roomPlayers = message.players || roomPlayers;
  const scores = serverState.scores || [0, 0];
  const self = playerIndex === 1 ? 1 : 0;
  const opponent = self === 0 ? 1 : 0;
  els.youScore.textContent = scores[self] ?? 0;
  els.opponentScore.textContent = scores[opponent] ?? 0;

  if (roomPlayers) {
    const opponentInfo = roomPlayers[opponent];
    els.opponentLabel.textContent = opponentInfo?.bot ? t("bot") : t("opponent");
  }
}

function updateRoomLabels(message = {}) {
  const code = message.code || roomCode || "-";
  els.roomCode.textContent = code;
  els.roomPill.textContent = roomCode ? code : t("offline");
  els.roomInput.value = roomCode ? roomCode : els.roomInput.value;
  if (roomCode && roomSettings?.lan) {
    const url = new URL(location.href);
    url.searchParams.set("room", roomCode);
    history.replaceState(null, "", url);
  } else if (!roomSettings?.lan && location.search) {
    history.replaceState(null, "", location.pathname);
  }
  setButtons();
}

function updatePhaseText() {
  if (!serverState) return;
  const phase = serverState.phase;
  if (phase === "waiting") {
    setStatus("waitingOpponent");
  } else if (phase === "countdown") {
    setStatus("");
  } else if (phase === "playing") {
    setStatus("");
  } else if (phase === "paused") {
    setStatus("");
  } else if (phase === "point") {
    setStatus("goal");
  } else if (phase === "gameover") {
    if (isLocalGame()) {
      setStatus("");
      return;
    }
    const self = playerIndex === 1 ? 1 : 0;
    setStatus(serverState.winner === self ? "victory" : "defeat");
  }
}

function setStatus(text) {
  statusRaw = text || "";
  statusText = translateStatus(statusRaw);
  els.centerStatus.textContent = statusText || "";
  els.centerStatus.classList.toggle("hidden", !statusText);
}

function setButtons() {
  const inRoom = Boolean(roomCode);
  els.quickButton.disabled = !connected;
  els.createButton.disabled = !connected;
  els.botButton.disabled = !connected;
  els.copyButton.disabled = !inRoom;
  els.restartButton.disabled = !inRoom || playerIndex !== 0;
  els.leaveButton.disabled = !inRoom;
}

function clearRoom() {
  if (gameoverReturnTimer) {
    clearTimeout(gameoverReturnTimer);
    gameoverReturnTimer = 0;
  }
  clearControls();
  playerIndex = null;
  roomCode = "";
  roomSettings = null;
  serverState = null;
  previousState = null;
  roomPlayers = null;
  predictedMallets.clear();
  trails.clear();
  els.roomCode.textContent = "-";
  els.roomPill.textContent = t("offline");
  els.youLabel.textContent = t("you");
  els.opponentLabel.textContent = t("opponent");
  els.youScore.textContent = "0";
  els.opponentScore.textContent = "0";
  setStatus("chooseMode");
  showUi("main");
  setButtons();
  history.replaceState(null, "", location.pathname);
}

function sendPointer(event, force, overridePlayerIndex = null) {
  if (!isActivePlay()) return;
  if (!roomCode || playerIndex === null) return;
  const now = performance.now();
  const point = eventToTable(event);
  if (!point) return;
  const targetIndex = overridePlayerIndex === 0 || overridePlayerIndex === 1 ? overridePlayerIndex : playerIndex;
  if (!force && now - lastInputAtByPlayer[targetIndex] < 1000 / 120) return;
  lastInputAtByPlayer[targetIndex] = now;
  const constrained = constrainForPlayer(targetIndex, point.x, point.y);
  const previousPredicted = predictedMallets.get(targetIndex);
  const fromX = previousPredicted?.x ?? serverState?.mallets?.[targetIndex]?.x ?? constrained.x;
  const fromY = previousPredicted?.y ?? serverState?.mallets?.[targetIndex]?.y ?? constrained.y;
  if (serverState?.mallets?.[targetIndex]) {
    serverState.mallets[targetIndex].x = constrained.x;
    serverState.mallets[targetIndex].y = constrained.y;
  }
  predictedMallets.set(targetIndex, {
    x: constrained.x,
    y: constrained.y,
    expiresAt: performance.now() + 180
  });
  applyLocalStrikePrediction(targetIndex, fromX, fromY, constrained.x, constrained.y, now);
  send({ type: "input", x: constrained.x, y: constrained.y, playerIndex: targetIndex });
}

function applyLocalStrikePrediction(index, fromX, fromY, toX, toY, now) {
  if (!serverState?.pucks?.length) return;
  const malletRadius = TABLE.malletRadius;
  const puckRadius = TABLE.puckRadius;
  const minDistance = malletRadius + puckRadius;
  const sweepX = toX - fromX;
  const sweepY = toY - fromY;
  const malletSpeed = Math.hypot(sweepX, sweepY) * 120;
  if (Math.abs(sweepX) < 0.001 && Math.abs(sweepY) < 0.001) return;

  for (const puck of serverState.pucks) {
    if (puck.localPredictedAt && now - puck.localPredictedAt < 22) continue;
    const relativeStartX = puck.x - fromX;
    const relativeStartY = puck.y - fromY;
    const a = sweepX * sweepX + sweepY * sweepY;
    const b = -2 * (relativeStartX * sweepX + relativeStartY * sweepY);
    const c = relativeStartX * relativeStartX + relativeStartY * relativeStartY - minDistance * minDistance;
    let hitT = null;

    if (c <= 0) {
      hitT = 0;
    } else if (a > 0.000001) {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const root = Math.sqrt(discriminant);
        const t0 = (-b - root) / (2 * a);
        const t1 = (-b + root) / (2 * a);
        if (t0 >= 0 && t0 <= 1) {
          hitT = t0;
        } else if (t1 >= 0 && t1 <= 1) {
          hitT = t1;
        }
      }
    }

    if (hitT === null) continue;

    const contactMalletX = fromX + sweepX * hitT;
    const contactMalletY = fromY + sweepY * hitT;
    let normalX = puck.x - contactMalletX;
    let normalY = puck.y - contactMalletY;
    let normalLength = Math.hypot(normalX, normalY);
    if (normalLength <= 0.001) {
      normalX = sweepX || 1;
      normalY = sweepY || 0;
      normalLength = Math.hypot(normalX, normalY) || 1;
    }
    normalX /= normalLength;
    normalY /= normalLength;

    puck.x = contactMalletX + normalX * (minDistance + 0.5);
    puck.y = contactMalletY + normalY * (minDistance + 0.5);

    const strike = Math.min(820, 180 + malletSpeed * 0.12);
    puck.vx = normalX * strike + sweepX * 9.5;
    puck.vy = normalY * strike + sweepY * 9.5;
    puck.localPredictedAt = now;
    puck.localPredictionExpiresAt = now + LOCAL_PREDICTION_WINDOW_MS;
    playFx("hit", Math.min(1, strike / 900));
  }
}

function eventToTable(event) {
  const metrics = canvasMetrics || measureCanvas();
  let x = ((event.clientX - metrics.offsetX) / metrics.width) * TABLE.width;
  let y = ((event.clientY - metrics.offsetY) / metrics.height) * TABLE.height;
  if (playerIndex === 1) {
    x = TABLE.width - x;
    y = TABLE.height - y;
  }
  return { x, y };
}

function constrainForPlayer(index, x, y) {
  const r = TABLE.malletRadius;
  const top = index === 0 ? TABLE.height / 2 + r * 0.28 : r;
  const bottom = index === 0 ? TABLE.height - r : TABLE.height / 2 - r * 0.28;
  return {
    x: clamp(x, r, TABLE.width - r),
    y: clamp(y, top, bottom)
  };
}

function send(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const needsIdentity =
    message.type === "quick" ||
    message.type === "create" ||
    message.type === "join" ||
    message.type === "lan" ||
    message.type === "local";
  socket.send(JSON.stringify(needsIdentity ? { ...message, key: playerKey } : message));
}

function getPlayerKey() {
  const storageKey = "online-air-hockey-player-key";
  try {
    const existing = sessionStorage.getItem(storageKey);
    if (existing) return existing;
    const browserCrypto = globalThis.crypto;
    const next =
      browserCrypto?.randomUUID?.() ||
      Array.from(browserCrypto.getRandomValues(new Uint8Array(16)), (byte) =>
        byte.toString(16).padStart(2, "0")
      ).join("");
    sessionStorage.setItem(storageKey, next);
    return next;
  } catch {
    return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  }
}

function eventToCanvas(event) {
  const metrics = canvasMetrics || measureCanvas();
  return {
    x: ((event.clientX - metrics.offsetX) / metrics.width) * TABLE.width,
    y: ((event.clientY - metrics.offsetY) / metrics.height) * TABLE.height
  };
}

function measureCanvas() {
  const rect = canvas.getBoundingClientRect();
  const displayRatio = TABLE.width / TABLE.height;
  let width = rect.width;
  let height = rect.height;
  if (width / height > displayRatio) {
    width = height * displayRatio;
  } else {
    height = width / displayRatio;
  }
  const offsetX = rect.left + (rect.width - width) / 2;
  const offsetY = rect.top + (rect.height - height) / 2;
  canvasMetrics = { offsetX, offsetY, width, height };
  return canvasMetrics;
}

function handleCanvasUi(point, clickCount = 1) {
  for (let index = menuButtons.length - 1; index >= 0; index -= 1) {
    const button = menuButtons[index];
    if (
      point.x >= button.x &&
      point.x <= button.x + button.w &&
      point.y >= button.y &&
      point.y <= button.y + button.h
    ) {
      button.action();
      return true;
    }
  }

  return Boolean(uiScreen);
}

function handleTouchPause(event, point) {
  const touchLike = event.pointerType === "touch" || touchCapable;
  if (!touchLike || !roomCode || !serverState) return false;
  if (!["playing", "paused"].includes(serverState.phase)) return false;
  if (!isCenterPausePoint(point)) return false;

  const now = performance.now();
  if (now - lastCenterTapAt <= 420) {
    lastCenterTapAt = 0;
    send({ type: "pause" });
  } else {
    lastCenterTapAt = now;
  }

  return true;
}

function isCenterPausePoint(point) {
  const dx = point.x - TABLE.width / 2;
  const dy = point.y - TABLE.height / 2;
  return Math.hypot(dx, dy) <= 115;
}

function showUi(screen) {
  if (uiScreen === screen) return;
  if (screen) clearControls();
  previousUiScreen = uiScreen;
  uiScreen = screen;
  uiTransitionStartedAt = performance.now();
}

function setUiNotice(text) {
  statusRaw = text || "";
  statusText = translateStatus(statusRaw);
  showUi("notice");
  setTimeout(() => {
    if (uiScreen === "notice") showUi("main");
  }, 1400);
}

function startSelectedMode(count) {
  setPuckCount(count);
  unlockAudio();
  if (pendingStartMode === "bot") {
    clearRoomUrl();
    send({ type: "create", puckCount: count, bot: true });
    setStatus("practice");
    showUi(null);
  } else if (pendingStartMode === "local") {
    clearRoomUrl();
    send({ type: "local", puckCount: count });
    setStatus("");
    showUi(null);
  } else if (pendingStartMode === "online") {
    clearRoomUrl();
    if (pendingRoomFromUrl) {
      send({ type: "join", code: pendingRoomFromUrl });
    } else {
      send({ type: "create", puckCount: count });
    }
    setStatus("waitingOpponent");
    showUi("waiting");
  }
}

function joinOnlineRoom() {
  unlockAudio();
  const rawCode = window.prompt(t("enterRoomCode"), "");
  const code = String(rawCode || "").trim().toUpperCase();
  if (!code) return;
  clearRoomUrl();
  send({ type: "join", code });
  setStatus("waitingOpponent");
  showUi("waiting");
}

function isActivePlay() {
  return Boolean(
    !uiScreen &&
    roomCode &&
      playerIndex !== null &&
      serverState &&
      ["playing", "countdown", "point"].includes(serverState.phase)
  );
}

function isLocalGame() {
  return Boolean(roomSettings?.local);
}

function isOnlineRoom() {
  return Boolean(roomCode && roomSettings && !roomSettings.lan && !roomSettings.local && !roomSettings.bot);
}

function getWaitingHintText() {
  if (roomSettings?.lan) return t("waitingOtherPlayerJoin");
  if (isOnlineRoom()) return t("shareRoomCode");
  return t("readyToStart");
}

function clearControls() {
  pointerDown = false;
  activePointers.clear();
  lastCenterTapAt = 0;
}

function exitToMain() {
  send({ type: "leaveToMenu" });
  clearRoom();
}

function clearRoomUrl() {
  if (location.search) history.replaceState(null, "", location.pathname);
}

function scheduleGameoverReturn() {
  if (gameoverReturnTimer) return;
  gameoverReturnTimer = setTimeout(() => {
    gameoverReturnTimer = 0;
    if (serverState?.phase !== "gameover") return;
    send({ type: "leave" });
    clearRoom();
  }, 2600);
}

function shouldRotateWorld() {
  return playerIndex === 1 && Boolean(serverState);
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function resizeCanvas() {
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  if (renderScale !== dpr) {
    renderScale = dpr;
    tableCache = null;
    malletSprite = null;
    puckSprite = null;
  }
  canvas.width = Math.round(TABLE.width * dpr);
  canvas.height = Math.round(TABLE.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  canvasMetrics = null;
  requestAnimationFrame(measureCanvas);
}

function render() {
  const state = serverState || demoState();
  const nextCursor = isActivePlay() ? "none" : "default";
  if (currentCursor !== nextCursor) {
    currentCursor = nextCursor;
    canvas.style.cursor = nextCursor;
  }
  ctx.clearRect(0, 0, TABLE.width, TABLE.height);

  drawTable();

  ctx.save();
  if (shouldRotateWorld()) {
    ctx.translate(TABLE.width, TABLE.height);
    ctx.rotate(Math.PI);
  }
  drawState(state);
  ctx.restore();

  drawCanvasScores(state);
  drawGameOverlay(state);
  requestAnimationFrame(render);
}

function drawGameOverlay(state) {
  menuButtons = [];

  if (state.phase === "gameover") {
    clearControls();
    drawGameOverOverlay(state);
    return;
  }

  if (state.phase === "paused") {
    drawPauseOverlay();
    return;
  }

  if (state.phase === "point") {
    drawGoalOverlay(state);
    return;
  }

  const progress = Math.min(1, (performance.now() - uiTransitionStartedAt) / 330);
  const eased = easeOutCubic(progress);
  const activeScreen = uiScreen;
  const leavingScreen = previousUiScreen && progress < 1 ? previousUiScreen : null;

  if (activeScreen || leavingScreen) {
    drawDim(0.42);
  }

  if (leavingScreen) {
    drawUiScreen(leavingScreen, -TABLE.height * eased, 1 - eased, false);
  }

  if (activeScreen) {
    const entering = previousUiScreen === null && progress >= 1 ? 0 : TABLE.height * (1 - eased);
    drawUiScreen(activeScreen, entering, 1, true);
  }
}

function drawDim(alpha) {
  ctx.save();
  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, TABLE.width, TABLE.height);
  ctx.restore();
}

function drawUiScreen(screen, offsetY, alpha, interactive) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(0, offsetY);

  if (screen === "main") drawMainMenu(interactive);
  if (screen === "puck") drawPuckMenu(interactive);
  if (screen === "lan") drawLanMenu(interactive);
  if (screen === "online") drawOnlineMenu(interactive);
  if (screen === "waiting") drawWaitingMenu(interactive);
  if (screen === "notice") drawNoticeMenu(interactive);

  ctx.restore();
}

function drawMainMenu(interactive) {
  const x = 76;
  const y = 264;
  const w = 438;
  const h = 514;
  drawBluePanel(x, y, w, h, 24);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 70px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.36)";
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 3;
  ctx.fillText("air hockey", x + w / 2, y + 76);
  ctx.font = "900 17px Arial, sans-serif";
  ctx.fillText("ONLINE", x + w / 2 + 132, y + 124);
  ctx.restore();

  drawMiniPucks(x + 122, y + 32);

  const labels = [t("mainSingle"), t("mainLocal"), t("mainWireless"), t("mainOnline")];
  const actions = [
    () => {
      unlockAudio();
      clearRoomUrl();
      pendingStartMode = "bot";
      showUi("puck");
    },
    () => {
      unlockAudio();
      clearRoomUrl();
      pendingStartMode = "local";
      showUi("puck");
    },
    () => {
      unlockAudio();
      pendingStartMode = "lan";
      showUi("lan");
    },
    () => {
      unlockAudio();
      pendingStartMode = "online";
      showUi("online");
    },
  ];

  for (let index = 0; index < 4; index += 1) {
    const button = { x: x + 18, y: y + 150 + index * 70, w: w - 36, h: 54 };
    drawRedButton(button.x, button.y, button.w, button.h, labels[index], 29);
    if (interactive) addButton(button, actions[index]);
  }

  drawLanguageButton(interactive);
}

function drawLanguageButton(interactive) {
  const button = { x: TABLE.width - 104, y: TABLE.height - 92, w: 70, h: 46 };
  ctx.save();
  ctx.fillStyle = "rgba(24,45,82,0.82)";
  ctx.strokeStyle = "rgba(255,255,255,0.82)";
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;
  ctx.beginPath();
  ctx.roundRect(button.x, button.y, button.w, button.h, 12);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 22px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(t("languageButton"), button.x + button.w / 2, button.y + button.h / 2 + 1);
  ctx.restore();
  if (interactive) addButton(button, toggleLanguage);
}

function drawPuckMenu(interactive) {
  const x = 76;
  const y = 405;
  const w = 438;
  const h = 232;
  drawBluePanel(x, y, w, h, 24);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "700 31px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.58)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 3;
  ctx.fillText(t("puckTitle"), x + w / 2, y + 58);
  ctx.restore();

  const one = { x: x + 18, y: y + 94, w: w - 36, h: 54 };
  const two = { x: x + 18, y: y + 164, w: w - 36, h: 54 };
  drawRedButton(one.x, one.y, one.w, one.h, t("onePuck"), 29);
  drawRedButton(two.x, two.y, two.w, two.h, t("twoPuck"), 29);

  if (interactive) {
    addButton(one, () => startSelectedMode(1));
    addButton(two, () => startSelectedMode(2));
  }
}

function drawLanMenu(interactive) {
  const x = 76;
  const y = 390;
  const w = 438;
  const h = 250;
  drawBluePanel(x, y, w, h, 24);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.58)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 3;
  ctx.font = "800 32px Arial, sans-serif";
  ctx.fillText(t("wirelessTitle"), x + w / 2, y + 56);
  ctx.font = "700 21px Arial, sans-serif";
  ctx.fillText(t("wirelessHint"), x + w / 2, y + 92);
  ctx.restore();

  const join = { x: x + 18, y: y + 120, w: w - 36, h: 56 };
  const back = { x: x + 18, y: y + 188, w: w - 36, h: 48 };
  drawRedButton(join.x, join.y, join.w, join.h, t("joinBattle"), 30);
  drawRedButton(back.x, back.y, back.w, back.h, t("back"), 24);

  if (interactive) {
    addButton(join, () => {
      unlockAudio();
      send({ type: "lan", puckCount });
      setStatus("waitingOtherPlayer");
      showUi("waiting");
    });
    addButton(back, () => showUi("main"));
  }
}

function drawOnlineMenu(interactive) {
  const x = 76;
  const y = 374;
  const w = 438;
  const h = 286;
  drawBluePanel(x, y, w, h, 24);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.58)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 3;
  ctx.font = "800 32px Arial, sans-serif";
  ctx.fillText(t("onlineTitle"), x + w / 2, y + 56);
  ctx.font = "700 20px Arial, sans-serif";
  ctx.fillText(t("onlineHint"), x + w / 2, y + 92);
  ctx.restore();

  const create = { x: x + 18, y: y + 116, w: w - 36, h: 54 };
  const join = { x: x + 18, y: y + 184, w: w - 36, h: 54 };
  const back = { x: x + 18, y: y + 246, w: w - 36, h: 34 };
  drawRedButton(create.x, create.y, create.w, create.h, t("createOnlineRoom"), 28);
  drawRedButton(join.x, join.y, join.w, join.h, t("joinOnlineRoom"), 28);
  drawRedButton(back.x, back.y, back.w, back.h, t("back"), 21);

  if (interactive) {
    addButton(create, () => {
      pendingStartMode = "online";
      showUi("puck");
    });
    addButton(join, joinOnlineRoom);
    addButton(back, () => showUi("main"));
  }
}

function drawWaitingMenu(interactive) {
  const x = 82;
  const y = isOnlineRoom() ? 344 : 378;
  const w = 426;
  const h = isOnlineRoom() ? 300 : roomSettings?.lan ? 210 : 188;
  drawBluePanel(x, y, w, h, 24);

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.58)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 3;
  ctx.font = "800 34px Arial, sans-serif";
  ctx.fillText(statusText || t("waitingJoin"), x + w / 2, y + 62);
  ctx.font = "700 22px Arial, sans-serif";
  ctx.fillText(getWaitingHintText(), x + w / 2, y + 122);
  if (isOnlineRoom()) {
    ctx.font = "800 24px Arial, sans-serif";
    ctx.fillText(t("roomCodeDisplay"), x + w / 2, y + 166);
    ctx.font = "900 44px Arial, sans-serif";
    ctx.letterSpacing = "4px";
    ctx.fillText(roomCode || "-", x + w / 2, y + 212);
    ctx.letterSpacing = "0px";
  }
  ctx.restore();

  const back = { x: x + 26, y: y + h - 66, w: w - 52, h: 48 };
  drawRedButton(back.x, back.y, back.w, back.h, t("backMenu"), 25);

  if (interactive) {
    addButton(back, () => {
      send({ type: "leave" });
      clearRoom();
    });
  }
}

function drawNoticeMenu(interactive) {
  const x = 80;
  const y = 430;
  const w = 430;
  const h = 150;
  drawBluePanel(x, y, w, h, 22);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 28px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.58)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 3;
  ctx.fillText(statusText || t("unavailable"), x + w / 2, y + h / 2);
  ctx.restore();

  if (interactive) addButton({ x, y, w, h }, () => showUi("main"));
}

function drawPauseOverlay() {
  const progress = Math.min(1, (performance.now() - phaseChangedAt) / 280);
  const eased = easeOutCubic(progress);
  ctx.save();
  ctx.globalAlpha = eased;
  const veil = ctx.createLinearGradient(0, 0, TABLE.width, TABLE.height);
  veil.addColorStop(0, "rgba(225,236,255,0.78)");
  veil.addColorStop(0.28, "rgba(32,56,98,0.34)");
  veil.addColorStop(0.5, "rgba(255,255,255,0.62)");
  veil.addColorStop(0.76, "rgba(30,54,97,0.34)");
  veil.addColorStop(1, "rgba(225,236,255,0.72)");
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, TABLE.width, TABLE.height);

  ctx.restore();

  ctx.save();
  ctx.globalAlpha = eased;
  drawRestartBubble();

  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 86px Arial, sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(255,255,255,0.78)";
  ctx.shadowColor = "rgba(15,55,128,0.88)";
  ctx.shadowBlur = 12;
  ctx.strokeText(t("paused"), TABLE.width / 2, 515);
  ctx.fillStyle = "#2f63bd";
  ctx.fillText(t("paused"), TABLE.width / 2, 515);
  ctx.font = "800 32px Arial, sans-serif";
  ctx.lineWidth = 5;
  const pauseHint = touchCapable ? t("pauseTouchHint") : t("pauseKeyHint");
  ctx.strokeText(pauseHint, TABLE.width / 2, 565);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(pauseHint, TABLE.width / 2, 565);
  ctx.restore();

  drawSpeakerIcon(140, 760, soundEnabled);
  ctx.restore();

  addButton({ x: 202, y: 138, w: 186, h: 112 }, () => send({ type: "restart" }));
  addButton({ x: 124, y: 22, w: 342, h: 116 }, exitToMain);
  addButton({ x: 62, y: 686, w: 172, h: 150 }, () => {
    soundEnabled = !soundEnabled;
    if (!soundEnabled && audio) audio.suspend();
    if (soundEnabled) unlockAudio();
  });
}

function drawGameOverOverlay(state) {
  if (isLocalGame()) {
    drawLocalGameOverOverlay(state);
    return;
  }

  const self = playerIndex === 1 ? 1 : 0;
  const won = state.winner === self;
  const elapsed = performance.now() - phaseChangedAt;
  const enter = easeOutCubic(Math.min(1, elapsed / 620));
  const exit = elapsed > 1900 ? easeOutCubic(Math.min(1, (elapsed - 1900) / 650)) : 0;
  const alpha = Math.max(0, enter * (1 - exit));
  const scale = 0.78 + 0.22 * enter + 0.08 * Math.sin(Math.min(1, elapsed / 900) * Math.PI);

  ctx.save();
  ctx.globalAlpha = alpha;
  const glow = ctx.createRadialGradient(
    TABLE.width / 2,
    TABLE.height / 2,
    20,
    TABLE.width / 2,
    TABLE.height / 2,
    330
  );
  glow.addColorStop(0, won ? "rgba(255,245,170,0.82)" : "rgba(185,210,255,0.72)");
  glow.addColorStop(0.42, won ? "rgba(255,190,50,0.32)" : "rgba(60,105,190,0.34)");
  glow.addColorStop(1, "rgba(0,0,0,0.58)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, TABLE.width, TABLE.height);

  ctx.translate(TABLE.width / 2, TABLE.height / 2);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 92px Arial, sans-serif";
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.shadowColor = won ? "rgba(255,213,66,0.95)" : "rgba(35,83,170,0.95)";
  ctx.shadowBlur = 18;
  ctx.strokeText(won ? t("victory") : t("defeat"), 0, -20);
  ctx.fillStyle = won ? "#ffcf38" : "#3c6fc6";
  ctx.fillText(won ? t("victory") : t("defeat"), 0, -20);

  ctx.font = "800 30px Arial, sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.strokeText(t("returnMain"), 0, 58);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(t("returnMain"), 0, 58);
  ctx.restore();
}

function drawLocalGameOverOverlay(state) {
  const winner = state.winner === 1 ? 1 : 0;
  const showBottom = winner === 0;
  const y = showBottom ? TABLE.height * 0.72 : TABLE.height * 0.28;
  const elapsed = performance.now() - phaseChangedAt;
  const enter = easeOutCubic(Math.min(1, elapsed / 620));
  const exit = elapsed > 1900 ? easeOutCubic(Math.min(1, (elapsed - 1900) / 650)) : 0;
  const alpha = Math.max(0, enter * (1 - exit));
  const scale = 0.78 + 0.22 * enter + 0.08 * Math.sin(Math.min(1, elapsed / 900) * Math.PI);
  const lift = (1 - enter) * (showBottom ? 52 : -52);

  ctx.save();
  ctx.globalAlpha = alpha;
  const glowY = y + lift;
  const glow = ctx.createRadialGradient(
    TABLE.width / 2,
    glowY,
    20,
    TABLE.width / 2,
    glowY,
    300
  );
  glow.addColorStop(0, "rgba(255,245,170,0.82)");
  glow.addColorStop(0.42, "rgba(255,190,50,0.32)");
  glow.addColorStop(1, "rgba(0,0,0,0.38)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, TABLE.width, TABLE.height);

  ctx.translate(TABLE.width / 2, glowY);
  if (!showBottom) ctx.rotate(Math.PI);
  ctx.scale(scale, scale);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 88px Arial, sans-serif";
  ctx.lineWidth = 9;
  ctx.strokeStyle = "rgba(255,255,255,0.92)";
  ctx.shadowColor = "rgba(255,213,66,0.95)";
  ctx.shadowBlur = 18;
  ctx.strokeText(t("victory"), 0, -20);
  ctx.fillStyle = "#ffcf38";
  ctx.fillText(t("victory"), 0, -20);

  ctx.font = "800 28px Arial, sans-serif";
  ctx.lineWidth = 4;
  ctx.strokeStyle = "rgba(0,0,0,0.45)";
  ctx.strokeText(t("returnMain"), 0, 54);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(t("returnMain"), 0, 54);
  ctx.restore();
}

function drawGoalOverlay(state) {
  const scorer = state.lastScorer;
  if (scorer !== 0 && scorer !== 1) return;

  const self = playerIndex === 1 ? 1 : 0;
  const showBottom = scorer === self;
  const y = showBottom ? TABLE.height * 0.72 : TABLE.height * 0.28;
  const elapsed = performance.now() - phaseChangedAt;
  const enter = easeOutCubic(Math.min(1, elapsed / 360));
  const leave = elapsed > 760 ? easeOutCubic(Math.min(1, (elapsed - 760) / 340)) : 0;
  const alpha = enter * (1 - leave);
  const lift = (1 - enter) * (showBottom ? 52 : -52);

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(TABLE.width / 2, y + lift);
  if (!showBottom) ctx.rotate(Math.PI);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 82px Arial, sans-serif";
  ctx.lineWidth = 8;
  ctx.shadowColor = "rgba(255,255,255,0.9)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.strokeText(t("goal"), 0, 0);
  ctx.fillStyle = "#2f63bd";
  ctx.fillText(t("goal"), 0, 0);

  ctx.restore();
}

function drawRestartBubble() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "800 30px Arial, sans-serif";
  ctx.fillStyle = "#1a6dff";
  ctx.shadowColor = "rgba(255,255,255,0.86)";
  ctx.shadowBlur = 6;
  ctx.fillText(t("resetGame"), TABLE.width / 2, 108);
  ctx.translate(TABLE.width / 2, 182);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "#1a6dff";
  ctx.lineWidth = 6.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.arc(0, 0, 18.5, -0.2, Math.PI * 1.58, true);
  ctx.stroke();

  ctx.fillStyle = "#1a6dff";
  ctx.beginPath();
  ctx.moveTo(16.8, -18.8);
  ctx.lineTo(32.5, -12.6);
  ctx.lineTo(20.5, -0.2);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawSpeakerIcon(x, y, on) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(35,51,82,0.62)";
  ctx.beginPath();
  ctx.moveTo(-62, -28);
  ctx.lineTo(-28, -28);
  ctx.lineTo(18, -62);
  ctx.lineTo(18, 62);
  ctx.lineTo(-28, 28);
  ctx.lineTo(-62, 28);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = ctx.fillStyle;
  ctx.lineWidth = 11;
  ctx.lineCap = "round";
  if (on) {
    for (let index = 0; index < 3; index += 1) {
      ctx.beginPath();
      ctx.arc(30, 0, 26 + index * 28, -0.65, 0.65);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMiniBoardIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(40,55,80,0.58)";
  ctx.strokeStyle = "rgba(255,255,255,0.6)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(-48, -72, 96, 144, 9);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#6493dd";
  ctx.fillRect(-36, -58, 72, 116);
  ctx.scale(0.24, 0.24);
  drawMallet({ x: -50, y: -150 });
  drawPuck({ x: 74, y: 0 });
  drawPuck({ x: -8, y: 120 });
  drawMallet({ x: 75, y: 170 });
  ctx.restore();
}

function drawBluePanel(x, y, w, h, radius) {
  ctx.save();
  ctx.shadowColor = "rgba(67,167,255,0.72)";
  ctx.shadowBlur = 12;
  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, "#76a7ef");
  gradient.addColorStop(0.28, "#4d7fd1");
  gradient.addColorStop(1, "#4068ba");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(127,211,255,0.9)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(x + 3, y + 3, w - 6, h - 6, radius - 3);
  ctx.stroke();

  ctx.globalAlpha = 0.32;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(x + 20, y + 76);
  ctx.bezierCurveTo(x + 30, y + 20, x + 120, y + 18, x + w - 30, y + 18);
  ctx.lineTo(x + w - 22, y + 44);
  ctx.bezierCurveTo(x + 120, y + 36, x + 38, y + 46, x + 20, y + 96);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawRedButton(x, y, w, h, text, fontSize) {
  ctx.save();
  const gradient = ctx.createLinearGradient(x, y, x, y + h);
  gradient.addColorStop(0, "#f0472e");
  gradient.addColorStop(0.5, "#d33018");
  gradient.addColorStop(1, "#9d1509");
  ctx.fillStyle = gradient;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 3;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 16);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "rgba(255,255,255,0.84)";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 14);
  ctx.stroke();

  ctx.globalAlpha = 0.26;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.roundRect(x + 10, y + 10, w - 20, h * 0.35, 12);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${fontSize}px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.shadowColor = "rgba(0,0,0,0.75)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 3;
  ctx.fillText(text, x + w / 2, y + h / 2 + 1);
  ctx.restore();
}

function drawMiniPucks(x, y) {
  ctx.save();
  ctx.scale(0.64, 0.64);
  drawMallet({ x: x / 0.64, y: y / 0.64 });
  drawMallet({ x: (x + 108) / 0.64, y: (y + 74) / 0.64 });
  drawPuck({ x: (x + 164) / 0.64, y: (y + 14) / 0.64 });
  ctx.restore();
}

function drawGameModePill() {
  const x = 118;
  const y = 72;
  const w = 370;
  const h = 70;
  ctx.save();
  ctx.fillStyle = "rgba(22,25,28,0.72)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 36);
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 34px Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(currentLanguage === "zh" ? "游戏模式：打开" : "Game Mode: On", x + 76, y + 26);
  ctx.font = "700 21px Arial, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.68)";
  ctx.fillText(
    currentLanguage === "zh" ? "在控制中心访问游戏叠层" : "Open game overlay from Control Center",
    x + 76,
    y + 52
  );
  drawRocketIcon(x + 44, y + 36);
  ctx.restore();
}

function drawRocketIcon(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.45);
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(0, -24);
  ctx.bezierCurveTo(17, -18, 24, 0, 9, 23);
  ctx.lineTo(-8, 12);
  ctx.lineTo(-21, -5);
  ctx.bezierCurveTo(-15, -18, -7, -24, 0, -24);
  ctx.fill();
  ctx.fillStyle = "rgba(22,25,28,0.72)";
  ctx.beginPath();
  ctx.arc(3, -8, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawStatusPill(text) {
  const x = TABLE.width / 2 - 128;
  const y = TABLE.height / 2 - 34;
  ctx.save();
  ctx.fillStyle = "rgba(18,22,32,0.86)";
  ctx.beginPath();
  ctx.roundRect(x, y, 256, 68, 10);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "900 28px Arial, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, TABLE.width / 2, TABLE.height / 2 + 1);
  ctx.restore();
}

function addButton(rect, action) {
  menuButtons.push({ ...rect, action });
}

async function copyInviteLink() {
  if (!roomCode || !roomSettings?.lan) return;
  const url = new URL(location.href);
  url.searchParams.set("room", roomCode);
  try {
    await navigator.clipboard.writeText(url.href);
    setStatus("linkCopied");
  } catch {
    setStatus(roomCode);
  }
}

function drawTable() {
  ctx.drawImage(getTableCache(), 0, 0, TABLE.width, TABLE.height);
}

function getTableCache() {
  if (tableCache) return tableCache;
  tableCache = createCachedCanvas(TABLE.width, TABLE.height);
  const previousCtx = ctx;
  ctx = tableCache.getContext("2d");
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawTableStatic();
  ctx = previousCtx;
  return tableCache;
}

function createCachedCanvas(width, height) {
  const cache = document.createElement("canvas");
  cache.width = Math.round(width * renderScale);
  cache.height = Math.round(height * renderScale);
  return cache;
}

function drawTableStatic() {
  ctx.clearRect(0, 0, TABLE.width, TABLE.height);

  const outer = { x: 17, y: 6, w: TABLE.width - 34, h: TABLE.height - 12, r: 40 };
  const field = { x: 34, y: 30, w: TABLE.width - 68, h: TABLE.height - 60, r: 26 };
  const metal = ctx.createLinearGradient(outer.x, 0, outer.x + 42, 0);
  metal.addColorStop(0, "#59616b");
  metal.addColorStop(0.22, "#f8f8f4");
  metal.addColorStop(0.46, "#9ca4aa");
  metal.addColorStop(0.68, "#3b4248");
  metal.addColorStop(1, "#edf0ed");
  roundRect(outer.x, outer.y, outer.w, outer.h, outer.r, metal);

  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.58)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(outer.x + 1.5, outer.y + 1.5, outer.w - 3, outer.h - 3, outer.r);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.74)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(outer.x + 6, outer.y + 6, outer.w - 12, outer.h - 12, outer.r - 6);
  ctx.stroke();
  ctx.restore();

  drawGoalSlot(0, outer);
  drawGoalSlot(TABLE.height, outer);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(field.x, field.y, field.w, field.h, field.r);
  ctx.clip();

  const blue = ctx.createLinearGradient(0, field.y, 0, field.y + field.h);
  blue.addColorStop(0, "#88aeea");
  blue.addColorStop(0.35, "#6e99dd");
  blue.addColorStop(0.68, "#4778bd");
  blue.addColorStop(1, "#244f88");
  ctx.fillStyle = blue;
  ctx.fillRect(field.x, field.y, field.w, field.h);

  ctx.fillStyle = colors.dot;
  for (let y = field.y + 18; y < field.y + field.h - 10; y += 21) {
    for (let x = field.x + 18; x < field.x + field.w - 10; x += 21) {
      ctx.beginPath();
      ctx.arc(x, y, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawRinkMarkings();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(0,0,0,0.5)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(field.x - 2, field.y - 2, field.w + 4, field.h + 4, field.r + 2);
  ctx.stroke();
  ctx.restore();
}

function drawRinkMarkings() {
  const fieldTop = 30;
  const fieldBottom = TABLE.height - 30;
  ctx.strokeStyle = colors.line;
  ctx.lineWidth = 3.5;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(34, TABLE.height / 2);
  ctx.lineTo(TABLE.width - 34, TABLE.height / 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(TABLE.width / 2, fieldTop - 12, 128, 0, Math.PI);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(TABLE.width / 2, fieldBottom + 12, 128, Math.PI, Math.PI * 2);
  ctx.stroke();

  drawCenterMark();
}

function drawCenterMark() {
  ctx.save();
  ctx.translate(TABLE.width / 2 + 2, TABLE.height / 2 + 23);
  ctx.rotate(-0.05);
  ctx.strokeStyle = "rgba(255,255,255,0.94)";
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.lineWidth = 4;
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(-105, -28);
  ctx.bezierCurveTo(-65, -48, 62, -54, 92, -25);
  ctx.bezierCurveTo(118, 0, 86, 18, 34, 16);
  ctx.bezierCurveTo(-20, 14, -72, 22, -88, 42);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-70, 16);
  ctx.bezierCurveTo(-20, -8, 92, -4, 78, 28);
  ctx.bezierCurveTo(65, 56, -38, 41, -12, 70);
  ctx.bezierCurveTo(2, 85, 42, 82, 56, 68);
  ctx.stroke();

  ctx.font = "900 44px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.strokeStyle = "rgba(62,104,170,0.85)";
  ctx.lineWidth = 8;
  ctx.strokeText("airhockey", 0, 6);
  ctx.fillText("airhockey", 0, 6);

  ctx.restore();
}

function drawGoalSlot(y, outer) {
  const slotWidth = TABLE.goalWidth + 40;
  const x = TABLE.width / 2 - slotWidth / 2;
  const top = y === 0 ? outer.y - 5 : outer.y + outer.h - 18;
  const lipY = y === 0 ? outer.y + 18 : outer.y + outer.h - 26;

  ctx.save();
  ctx.fillStyle = "#020202";
  ctx.beginPath();
  ctx.roundRect(x, top, slotWidth, 34, 10);
  ctx.fill();

  const lip = ctx.createLinearGradient(0, lipY - 12, 0, lipY + 12);
  lip.addColorStop(0, "#ffffff");
  lip.addColorStop(0.42, "#8f969c");
  lip.addColorStop(1, "#30363c");
  ctx.strokeStyle = lip;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x - 2, lipY);
  ctx.lineTo(x + slotWidth + 2, lipY);
  ctx.stroke();
  ctx.restore();
}

function drawState(state) {
  ctx.save();
  for (let index = 0; index < (state.pucks || []).length; index += 1) {
    drawPuck(state.pucks[index], index);
  }

  for (let index = 0; index < state.mallets.length; index += 1) {
    drawMallet(displayMallet(state.mallets[index], index));
  }

  ctx.restore();
}

function displayMallet(mallet, index) {
  const predicted = predictedMallets.get(index);
  if (!predicted) return mallet;
  if (performance.now() > predicted.expiresAt) {
    predictedMallets.delete(index);
    return mallet;
  }
  return {
    ...mallet,
    x: predicted.x,
    y: predicted.y
  };
}

function drawCanvasScores(state) {
  const self = playerIndex === 1 ? 1 : 0;
  const opponent = self === 0 ? 1 : 0;
  const topScore = Math.min(TABLE.firstTo, state.scores?.[opponent] ?? 0);
  const bottomScore = Math.min(TABLE.firstTo, state.scores?.[self] ?? 0);
  const x = TABLE.width - 63;

  drawScoreNumber(topScore, x, TABLE.height / 2 - 37);
  drawScoreNumber(bottomScore, x, TABLE.height / 2 + 45);
}

function drawScoreNumber(score, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 2);
  ctx.font = "900 58px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 7;
  ctx.strokeStyle = "rgba(40,70,125,0.84)";
  ctx.strokeText(String(score), 0, 0);
  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.strokeText(String(score), 0, 0);
  ctx.fillStyle = "rgba(255,255,255,0.98)";
  ctx.fillText(String(score), 0, 0);
  ctx.restore();
}

function drawTrail(puck) {
  const points = trails.get(puck.id) || [];
  if (points.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    ctx.globalAlpha = (index / points.length) * 0.16;
    ctx.strokeStyle = colors.gold;
    ctx.lineWidth = 8 * (index / points.length);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMallet(mallet) {
  const sprite = getMalletSprite();
  ctx.drawImage(
    sprite.canvas,
    mallet.x - sprite.size / 2,
    mallet.y - sprite.size / 2,
    sprite.size,
    sprite.size
  );
}

function getMalletSprite() {
  if (malletSprite) return malletSprite;
  const size = TABLE.malletRadius * 2 + 32;
  const canvas = createCachedCanvas(size, size);
  const previousCtx = ctx;
  ctx = canvas.getContext("2d");
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawMalletRaw({ x: size / 2, y: size / 2 });
  ctx = previousCtx;
  malletSprite = { canvas, size };
  return malletSprite;
}

function drawMalletRaw(mallet) {
  ctx.save();
  ctx.translate(mallet.x, mallet.y);
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 4;

  const outer = ctx.createRadialGradient(-18, -20, 6, 0, 0, TABLE.malletRadius);
  outer.addColorStop(0, "#fffdf2");
  outer.addColorStop(0.16, "#fff5bf");
  outer.addColorStop(0.42, "#d7ad3d");
  outer.addColorStop(0.68, "#fff0a0");
  outer.addColorStop(0.82, "#b57904");
  outer.addColorStop(1, "#553006");

  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(0, 0, TABLE.malletRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  ctx.strokeStyle = "rgba(84,45,0,0.62)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, TABLE.malletRadius - 3, 0, Math.PI * 2);
  ctx.stroke();

  const innerRing = ctx.createRadialGradient(-12, -12, 4, 0, 0, TABLE.malletRadius * 0.63);
  innerRing.addColorStop(0, "#fffefa");
  innerRing.addColorStop(0.42, "#f9e79c");
  innerRing.addColorStop(0.72, "#b77b0e");
  innerRing.addColorStop(1, "#5f3705");
  ctx.fillStyle = innerRing;
  ctx.beginPath();
  ctx.arc(0, 0, TABLE.malletRadius * 0.63, 0, Math.PI * 2);
  ctx.fill();

  const knob = ctx.createRadialGradient(-11, -13, 5, 0, 0, TABLE.malletRadius * 0.43);
  knob.addColorStop(0, "#ffffff");
  knob.addColorStop(0.55, "#fff6d6");
  knob.addColorStop(1, "#c49a35");
  ctx.fillStyle = knob;
  ctx.beginPath();
  ctx.arc(0, 0, TABLE.malletRadius * 0.43, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(-18, -22, TABLE.malletRadius * 0.16, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawPuck(puck) {
  const sprite = getPuckSprite();
  ctx.drawImage(
    sprite.canvas,
    puck.x - sprite.size / 2,
    puck.y - sprite.size / 2,
    sprite.size,
    sprite.size
  );
}

function getPuckSprite() {
  if (puckSprite) return puckSprite;
  const size = TABLE.puckRadius * 2 + 22;
  const canvas = createCachedCanvas(size, size);
  const previousCtx = ctx;
  ctx = canvas.getContext("2d");
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawPuckRaw({ x: size / 2, y: size / 2 });
  ctx = previousCtx;
  puckSprite = { canvas, size };
  return puckSprite;
}

function drawPuckRaw(puck) {
  ctx.save();
  ctx.translate(puck.x, puck.y);
  ctx.shadowColor = "rgba(0,0,0,0.66)";
  ctx.shadowBlur = 7;
  ctx.shadowOffsetY = 3;

  const gradient = ctx.createRadialGradient(-8, -10, 4, 0, 0, TABLE.puckRadius);
  gradient.addColorStop(0, "#ffffff");
  gradient.addColorStop(0.18, "#ffcf4c");
  gradient.addColorStop(0.5, "#ff531d");
  gradient.addColorStop(0.78, "#f1280d");
  gradient.addColorStop(1, "#811100");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, TABLE.puckRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.strokeStyle = "rgba(120,0,0,0.72)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, TABLE.puckRadius - 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function updateTrails() {
  if (!serverState) return;
  for (const puck of serverState.pucks || []) {
    const points = trails.get(puck.id) || [];
    points.push({ x: puck.x, y: puck.y });
    while (points.length > 9) points.shift();
    trails.set(puck.id, points);
  }
}

function demoState() {
  return {
    phase: "waiting",
    scores: [0, 0],
    mallets: [
      { x: 392, y: 816 },
      { x: TABLE.width / 2, y: 128 }
    ],
    pucks: [{ id: "demo", x: 352, y: 692 }]
  };
}

function roundRect(x, y, width, height, radius, fillStyle) {
  ctx.save();
  ctx.fillStyle = fillStyle;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
  ctx.fill();
  ctx.restore();
}

function unlockAudio() {
  if (!audio) {
    audio = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audio.state === "suspended") {
    void audio.resume();
  }
  if (!audioPrimed) {
    const gain = audio.createGain();
    gain.gain.value = 0.00001;
    gain.connect(audio.destination);
    const buffer = audio.createBuffer(1, 1, audio.sampleRate);
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    source.start();
    audioPrimed = true;
  }
}

function playFx(kind, intensity = 0.5) {
  if (!soundEnabled) return;
  unlockAudio();
  if (!audio || audio.state !== "running") return;
  const now = audio.currentTime;
  const force = clamp(Number(intensity) || 0.5, 0, 1);

  if (kind === "score") {
    playGoalDrop(now);
    return;
  }

  if (kind === "victory") {
    playVictoryCheer(now);
    return;
  }

  if (kind === "wall") {
    playIceClick(now, force * 0.5, 760 + force * 140, 0.07);
    return;
  }

  playIceClick(now, force, 960 + force * 220, 0.09 + force * 0.045);
}

function playIceClick(start, intensity, resonance, duration) {
  const bodyGain = audio.createGain();
  bodyGain.connect(audio.destination);
  bodyGain.gain.setValueAtTime(0.0001, start);
  bodyGain.gain.exponentialRampToValueAtTime(0.02 + intensity * 0.075, start + 0.008);
  bodyGain.gain.exponentialRampToValueAtTime(0.0001, start + duration + 0.035);

  const noise = audio.createBufferSource();
  noise.buffer = makeNoiseBuffer(duration + 0.07);
  const bandpass = audio.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(resonance, start);
  bandpass.Q.setValueAtTime(0.85 + intensity * 0.55, start);
  const lowpass = audio.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(1700 + intensity * 420, start);
  noise.connect(bandpass);
  bandpass.connect(lowpass);
  lowpass.connect(bodyGain);
  noise.start(start);
  noise.stop(start + duration + 0.05);

  const thumpGain = audio.createGain();
  thumpGain.connect(audio.destination);
  thumpGain.gain.setValueAtTime(0.0001, start);
  thumpGain.gain.exponentialRampToValueAtTime(0.03 + intensity * 0.08, start + 0.006);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.95);

  const thump = audio.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(230 + intensity * 48, start);
  thump.frequency.exponentialRampToValueAtTime(148 + intensity * 22, start + duration * 0.9);
  thump.connect(thumpGain);
  thump.start(start);
  thump.stop(start + duration);

  const ringGain = audio.createGain();
  ringGain.connect(audio.destination);
  ringGain.gain.setValueAtTime(0.0001, start + 0.002);
  ringGain.gain.exponentialRampToValueAtTime(0.012 + intensity * 0.032, start + 0.01);
  ringGain.gain.exponentialRampToValueAtTime(0.0001, start + duration * 0.72);
  tone(320 + intensity * 85, start + 0.002, duration * 0.62, "triangle", ringGain);
}

function playGoalDrop(start) {
  const gain = audio.createGain();
  gain.connect(audio.destination);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(0.18, start + 0.025);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62);

  const slide = audio.createOscillator();
  slide.type = "triangle";
  slide.frequency.setValueAtTime(360, start);
  slide.frequency.exponentialRampToValueAtTime(88, start + 0.42);
  slide.connect(gain);
  slide.start(start);
  slide.stop(start + 0.48);

  playIceClick(start + 0.04, 0.42, 1500, 0.05);
  playIceClick(start + 0.28, 0.78, 900, 0.12);
}

function playVictoryCheer(start) {
  const cheerGain = audio.createGain();
  cheerGain.connect(audio.destination);
  cheerGain.gain.setValueAtTime(0.0001, start);
  cheerGain.gain.exponentialRampToValueAtTime(0.12, start + 0.05);
  cheerGain.gain.exponentialRampToValueAtTime(0.0001, start + 1.15);

  const noise = audio.createBufferSource();
  noise.buffer = makeNoiseBuffer(1.15);
  const bandpass = audio.createBiquadFilter();
  bandpass.type = "bandpass";
  bandpass.frequency.setValueAtTime(1150, start);
  bandpass.Q.setValueAtTime(0.8, start);
  noise.connect(bandpass);
  bandpass.connect(cheerGain);
  noise.start(start);
  noise.stop(start + 1.15);

  [523, 659, 784, 1046].forEach((frequency, index) => {
    tone(frequency, start + index * 0.08, 0.18, "triangle", cheerGain);
  });
}

function tone(frequency, start, duration, type, destination) {
  const oscillator = audio.createOscillator();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  oscillator.connect(destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

function makeNoiseBuffer(duration) {
  const sampleRate = audio.sampleRate;
  const buffer = audio.createBuffer(1, Math.max(1, Math.floor(sampleRate * duration)), sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < data.length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
  }
  return buffer;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
