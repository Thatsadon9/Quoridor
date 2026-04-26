const BOARD_SIZE = 9;
const CELL_SIZE = 56;
const GAP_SIZE = 12;
const STEP_SIZE = CELL_SIZE + GAP_SIZE;
const WALL_THICKNESS = 14;
const WALL_LENGTH = (2 * CELL_SIZE) + GAP_SIZE;
const PAWN_SIZE = 34;
const ROOM_CODE_LENGTH = 6;
const STORAGE_SUPABASE_URL = "walltrap.supabase.url";
const STORAGE_SUPABASE_ANON = "walltrap.supabase.anon";
const DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
];

const boardEl = document.getElementById("board");
const turnTextEl = document.getElementById("turnText");
const statusTextEl = document.getElementById("statusText");
const redWallsEl = document.getElementById("redWalls");
const ivoryWallsEl = document.getElementById("ivoryWalls");
const orientationBtn = document.getElementById("orientationBtn");
const newGameBtn = document.getElementById("newGameBtn");

const supabaseUrlInput = document.getElementById("supabaseUrlInput");
const supabaseAnonInput = document.getElementById("supabaseAnonInput");
const saveConfigBtn = document.getElementById("saveConfigBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const leaveRoomBtn = document.getElementById("leaveRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const onlineStatusTextEl = document.getElementById("onlineStatusText");
const roomInfoTextEl = document.getElementById("roomInfoText");
const roleInfoTextEl = document.getElementById("roleInfoText");

const cells = new Map();
const wallSlots = [];
let state = createInitialState();
let online = createOnlineState();

init();

function init() {
  loadRealtimeConfig();
  buildBoard();
  bindEvents();
  render();
}

function createInitialState() {
  return {
    currentPlayer: 0,
    orientation: "horizontal",
    gameOver: false,
    message: "ตาของฝ่ายแดง",
    revision: 0,
    players: [
      {
        name: "ฝ่ายแดง",
        pawn: { r: 8, c: 4 },
        targetRow: 0,
        wallsLeft: 10
      },
      {
        name: "ฝ่ายงาช้าง",
        pawn: { r: 0, c: 4 },
        targetRow: 8,
        wallsLeft: 10
      }
    ],
    walls: {
      horizontal: [],
      vertical: []
    }
  };
}

function createOnlineState() {
  return {
    mode: "offline",
    client: null,
    channel: null,
    roomCode: "",
    isHost: false,
    localPlayerIndex: null,
    peerId: null,
    connected: false,
    pendingAction: false,
    clientId: randomClientId()
  };
}

function buildBoard() {
  const fragment = document.createDocumentFragment();

  for (let r = 0; r < BOARD_SIZE; r += 1) {
    for (let c = 0; c < BOARD_SIZE; c += 1) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.style.top = `${r * STEP_SIZE}px`;
      cell.style.left = `${c * STEP_SIZE}px`;
      cell.setAttribute("aria-label", `ช่อง ${r + 1}, ${c + 1}`);
      cells.set(cellKey(r, c), cell);
      fragment.append(cell);
    }
  }

  for (let r = 0; r < BOARD_SIZE - 1; r += 1) {
    for (let c = 0; c < BOARD_SIZE - 1; c += 1) {
      const horizontalSlot = createWallSlot("horizontal", r, c);
      const verticalSlot = createWallSlot("vertical", r, c);
      wallSlots.push(horizontalSlot, verticalSlot);
      fragment.append(horizontalSlot, verticalSlot);
    }
  }

  boardEl.append(fragment);
}

function createWallSlot(orientation, r, c) {
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = "wall-slot";
  slot.dataset.orientation = orientation;
  slot.dataset.row = String(r);
  slot.dataset.col = String(c);

  const position = wallPosition(orientation, r, c);
  slot.style.top = `${position.top}px`;
  slot.style.left = `${position.left}px`;

  if (orientation === "horizontal") {
    slot.style.width = `${WALL_LENGTH}px`;
    slot.style.height = `${WALL_THICKNESS}px`;
    slot.setAttribute("aria-label", `วางกำแพงแนวนอน แถว ${r + 1} คอลัมน์ ${c + 1}`);
  } else {
    slot.style.width = `${WALL_THICKNESS}px`;
    slot.style.height = `${WALL_LENGTH}px`;
    slot.setAttribute("aria-label", `วางกำแพงแนวตั้ง แถว ${r + 1} คอลัมน์ ${c + 1}`);
  }

  return slot;
}

function bindEvents() {
  boardEl.addEventListener("click", (event) => {
    const cell = event.target.closest(".cell");
    if (cell) {
      attemptMove(Number(cell.dataset.row), Number(cell.dataset.col));
      return;
    }

    const slot = event.target.closest(".wall-slot");
    if (slot) {
      attemptPlaceWall(
        slot.dataset.orientation,
        Number(slot.dataset.row),
        Number(slot.dataset.col)
      );
    }
  });

  orientationBtn.addEventListener("click", () => {
    state.orientation = state.orientation === "horizontal" ? "vertical" : "horizontal";
    render();
  });

  newGameBtn.addEventListener("click", () => {
    void handleNewGame();
  });

  saveConfigBtn.addEventListener("click", () => {
    saveRealtimeConfig();
    state.message = "บันทึกค่า Supabase แล้ว";
    render();
  });

  createRoomBtn.addEventListener("click", () => {
    void handleCreateRoom();
  });

  joinRoomBtn.addEventListener("click", () => {
    void handleJoinRoom();
  });

  leaveRoomBtn.addEventListener("click", () => {
    void disconnectRealtime("ออกจากห้องแล้ว กลับสู่ออฟไลน์", true);
  });

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r") {
      state.orientation = state.orientation === "horizontal" ? "vertical" : "horizontal";
      render();
    }
  });
}

async function handleNewGame() {
  if (online.mode === "online" && !online.isHost) {
    state.message = "โหมดออนไลน์: ให้โฮสต์เป็นคนเริ่มเกมใหม่";
    render();
    return;
  }

  state = createInitialState();

  if (online.mode === "online" && online.isHost) {
    state.message = "โฮสต์รีเซ็ตเกมแล้ว";
    const synced = await broadcastSnapshot();
    if (!synced.ok) {
      state.message = `${state.message} แต่ sync ไม่สำเร็จ`;
    }
  }

  render();
}

async function handleCreateRoom() {
  if (online.mode === "online") {
    state.message = "กำลังอยู่ในห้องแล้ว";
    render();
    return;
  }

  const roomCode = generateRoomCode();
  const connected = await connectRealtimeRoom(roomCode, true);
  if (!connected) {
    render();
    return;
  }

  state = createInitialState();
  state.message = `สร้างห้อง ${roomCode} สำเร็จ รอผู้เล่นอีกฝ่าย Join`;
  render();
}

async function handleJoinRoom() {
  if (online.mode === "online") {
    state.message = "กำลังอยู่ในห้องแล้ว";
    render();
    return;
  }

  const roomCode = normalizeRoomCode(roomCodeInput.value);
  if (roomCode.length !== ROOM_CODE_LENGTH) {
    state.message = `กรอกเลขห้อง ${ROOM_CODE_LENGTH} หลักให้ครบ`;
    render();
    return;
  }

  const connected = await connectRealtimeRoom(roomCode, false);
  if (!connected) {
    render();
    return;
  }

  state = createInitialState();
  state.message = "ส่งคำขอ Join ห้องแล้ว กำลังรอโฮสต์อนุมัติ";
  render();

  const joined = await sendBroadcast("join-request", { senderId: online.clientId });
  if (!joined.ok) {
    await disconnectRealtime(joined.reason, true);
  }
}

async function connectRealtimeRoom(roomCode, isHost) {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    state.message = "ยังโหลด Supabase SDK ไม่สำเร็จ";
    return false;
  }

  const config = getRealtimeConfig();
  if (!config.url || !config.anonKey) {
    state.message = "ต้องใส่ Supabase URL และ Anon Key ก่อนสร้าง/Join ห้อง";
    return false;
  }

  await disconnectRealtime("", false);

  online.mode = "connecting";
  online.isHost = isHost;
  online.roomCode = roomCode;
  online.localPlayerIndex = isHost ? 0 : null;
  online.connected = false;
  online.pendingAction = false;
  online.peerId = null;
  online.clientId = randomClientId();
  render();

  online.client = window.supabase.createClient(config.url, config.anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  online.channel = online.client.channel(`walltrap-room-${roomCode}`, {
    config: {
      broadcast: { self: false },
      presence: { key: online.clientId }
    }
  });

  registerRealtimeListeners(online.channel);

  const subscribed = await subscribeChannel(online.channel);
  if (!subscribed.ok) {
    state.message = `เชื่อมห้องไม่สำเร็จ (${subscribed.reason})`;
    await disconnectRealtime("", false);
    return false;
  }

  const tracked = await online.channel.track({
    id: online.clientId,
    role: isHost ? "host" : "guest",
    joinedAt: Date.now()
  });
  if (tracked !== "ok") {
    state.message = `เชื่อมต่อได้ แต่ track presence ไม่สำเร็จ (${tracked})`;
  }

  online.mode = "online";
  roomCodeInput.value = roomCode;
  return true;
}

function subscribeChannel(channel) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (result) => {
      if (done) {
        return;
      }
      done = true;
      resolve(result);
    };

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        finish({ ok: true });
      } else if (status === "CHANNEL_ERROR") {
        finish({ ok: false, reason: "channel error" });
      } else if (status === "TIMED_OUT") {
        finish({ ok: false, reason: "timed out" });
      }
    });
  });
}

async function disconnectRealtime(message, resetGame) {
  const shouldNotifyHostLeft =
    online.mode === "online" &&
    online.isHost &&
    online.channel &&
    online.connected &&
    online.peerId;

  if (shouldNotifyHostLeft) {
    await sendBroadcast("host-left", { targetId: online.peerId });
  }

  if (online.channel) {
    await online.channel.unsubscribe();
    if (online.client) {
      online.client.removeChannel(online.channel);
    }
  }

  online = createOnlineState();

  if (resetGame) {
    state = createInitialState();
  }
  if (message) {
    state.message = message;
  }

  render();
}

function registerRealtimeListeners(channel) {
  channel.on("broadcast", { event: "join-request" }, ({ payload }) => {
    if (channel !== online.channel) {
      return;
    }
    void handleJoinRequest(payload);
  });

  channel.on("broadcast", { event: "role-assigned" }, ({ payload }) => {
    if (channel !== online.channel) {
      return;
    }
    handleRoleAssigned(payload);
  });

  channel.on("broadcast", { event: "room-full" }, ({ payload }) => {
    if (channel !== online.channel) {
      return;
    }
    void handleRoomFull(payload);
  });

  channel.on("broadcast", { event: "host-left" }, ({ payload }) => {
    if (channel !== online.channel) {
      return;
    }
    void handleHostLeft(payload);
  });

  channel.on("broadcast", { event: "action-request" }, ({ payload }) => {
    if (channel !== online.channel) {
      return;
    }
    void handleActionRequest(payload);
  });

  channel.on("broadcast", { event: "action-error" }, ({ payload }) => {
    if (channel !== online.channel) {
      return;
    }
    handleActionError(payload);
  });

  channel.on("broadcast", { event: "snapshot" }, ({ payload }) => {
    if (channel !== online.channel) {
      return;
    }
    handleSnapshot(payload);
  });

  channel.on("presence", { event: "sync" }, () => {
    if (channel !== online.channel) {
      return;
    }
    handlePresenceSync();
  });
}

async function handleJoinRequest(payload) {
  if (!online.isHost || !payload || payload.senderId === online.clientId) {
    return;
  }

  if (online.peerId && online.peerId !== payload.senderId) {
    await sendBroadcast("room-full", {
      targetId: payload.senderId,
      reason: "ห้องนี้เต็มแล้ว (รองรับ 2 คน)"
    });
    return;
  }

  online.peerId = payload.senderId;
  online.connected = true;
  state.message = "ผู้เล่นอีกฝ่ายเข้าห้องแล้ว เริ่มเล่นได้";

  const roleAssigned = await sendBroadcast("role-assigned", {
    targetId: payload.senderId,
    accepted: true,
    playerIndex: 1,
    hostId: online.clientId
  });
  if (!roleAssigned.ok) {
    state.message = roleAssigned.reason;
    render();
    return;
  }

  const synced = await broadcastSnapshot();
  if (!synced.ok) {
    state.message = `${state.message} แต่ sync แรกไม่สำเร็จ`;
  }
  render();
}

function handleRoleAssigned(payload) {
  if (online.isHost || !payload || payload.targetId !== online.clientId) {
    return;
  }

  if (!payload.accepted) {
    state.message = "โฮสต์ไม่อนุมัติการเข้าห้อง";
    render();
    return;
  }

  online.localPlayerIndex = payload.playerIndex === 1 ? 1 : 0;
  online.peerId = payload.hostId || online.peerId;
  online.connected = true;
  online.pendingAction = false;
  state.message = `Join ห้องสำเร็จ คุณคือ${state.players[online.localPlayerIndex].name}`;
  render();
}

async function handleRoomFull(payload) {
  if (!payload || payload.targetId !== online.clientId) {
    return;
  }
  const reason = payload.reason || "ห้องเต็มแล้ว";
  await disconnectRealtime(reason, true);
}

async function handleHostLeft(payload) {
  if (online.isHost) {
    return;
  }
  if (payload && payload.targetId && payload.targetId !== online.clientId) {
    return;
  }
  await disconnectRealtime("โฮสต์ออกจากห้องแล้ว", true);
}

async function handleActionRequest(payload) {
  if (!online.isHost || !payload || payload.senderId !== online.peerId || !online.connected) {
    return;
  }

  if (state.currentPlayer !== 1) {
    await sendBroadcast("action-error", {
      targetId: payload.senderId,
      reason: "ยังไม่ใช่ตาของฝ่ายงาช้าง"
    });
    return;
  }

  const action = payload.action || {};
  let result = { ok: false, reason: "คำสั่งไม่ถูกต้อง" };

  if (action.kind === "move") {
    result = applyMove(action.r, action.c);
  } else if (action.kind === "wall") {
    result = applyWall(action.orientation, action.r, action.c);
  }

  if (!result.ok) {
    await sendBroadcast("action-error", {
      targetId: payload.senderId,
      reason: result.reason
    });
    state.message = `โฮสต์ปฏิเสธตาเดิน: ${result.reason}`;
    render();
    return;
  }

  const synced = await broadcastSnapshot();
  if (!synced.ok) {
    state.message = `${state.message} แต่ sync ไม่สำเร็จ`;
  }
  render();
}

function handleActionError(payload) {
  if (!payload || payload.targetId !== online.clientId) {
    return;
  }
  online.pendingAction = false;
  state.message = payload.reason || "โฮสต์ปฏิเสธการเดิน";
  render();
}

function handleSnapshot(payload) {
  if (!payload || payload.senderId === online.clientId || !payload.snapshot) {
    return;
  }

  applySnapshot(payload.snapshot);
  online.pendingAction = false;
  if (!online.isHost) {
    online.connected = true;
  }
  render();
}

function handlePresenceSync() {
  if (online.mode !== "online" || !online.channel) {
    return;
  }

  const presence = online.channel.presenceState();
  const activeIds = new Set(Object.keys(presence));

  if (online.isHost) {
    if (online.peerId && !activeIds.has(online.peerId)) {
      online.peerId = null;
      online.connected = false;
      online.pendingAction = false;
      state.message = "ผู้เล่นอีกฝ่ายหลุดออกจากห้อง";
      render();
    }
    return;
  }

  if (online.peerId && !activeIds.has(online.peerId)) {
    void disconnectRealtime("โฮสต์หลุดจากห้อง", true);
  }
}

async function sendBroadcast(event, payload) {
  if (!online.channel) {
    return { ok: false, reason: "ยังไม่เชื่อมห้อง" };
  }

  try {
    const status = await online.channel.send({
      type: "broadcast",
      event,
      payload
    });
    if (status !== "ok") {
      return { ok: false, reason: `ส่งข้อมูลไม่สำเร็จ (${status})` };
    }
    return { ok: true };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return { ok: false, reason: `ส่งข้อมูลไม่สำเร็จ (${reason})` };
  }
}

function broadcastSnapshot() {
  return sendBroadcast("snapshot", {
    senderId: online.clientId,
    snapshot: serializeState()
  });
}

function serializeState() {
  return {
    currentPlayer: state.currentPlayer,
    orientation: state.orientation,
    gameOver: state.gameOver,
    message: state.message,
    revision: state.revision,
    players: state.players.map((player) => ({
      name: player.name,
      targetRow: player.targetRow,
      wallsLeft: player.wallsLeft,
      pawn: { r: player.pawn.r, c: player.pawn.c }
    })),
    walls: {
      horizontal: state.walls.horizontal.map((wall) => ({ r: wall.r, c: wall.c })),
      vertical: state.walls.vertical.map((wall) => ({ r: wall.r, c: wall.c }))
    }
  };
}

function applySnapshot(snapshot) {
  if (!snapshot || typeof snapshot.revision !== "number" || snapshot.revision < state.revision) {
    return;
  }

  const next = createInitialState();
  next.currentPlayer = snapshot.currentPlayer === 1 ? 1 : 0;
  next.orientation = snapshot.orientation === "vertical" ? "vertical" : "horizontal";
  next.gameOver = Boolean(snapshot.gameOver);
  next.message = typeof snapshot.message === "string" ? snapshot.message : next.message;
  next.revision = snapshot.revision;

  for (let i = 0; i < 2; i += 1) {
    const incoming = Array.isArray(snapshot.players) ? snapshot.players[i] : null;
    next.players[i].pawn = sanitizePawn(incoming?.pawn, next.players[i].pawn);
    next.players[i].wallsLeft = sanitizeWallsLeft(incoming?.wallsLeft);
  }

  next.walls.horizontal = sanitizeWalls(snapshot?.walls?.horizontal);
  next.walls.vertical = sanitizeWalls(snapshot?.walls?.vertical);
  state = next;
}

function sanitizePawn(pawn, fallback) {
  const r = Number(pawn?.r);
  const c = Number(pawn?.c);
  if (Number.isInteger(r) && Number.isInteger(c) && inBounds(r, c)) {
    return { r, c };
  }
  return { ...fallback };
}

function sanitizeWallsLeft(value) {
  const amount = Number(value);
  if (Number.isInteger(amount) && amount >= 0 && amount <= 10) {
    return amount;
  }
  return 10;
}

function sanitizeWalls(walls) {
  if (!Array.isArray(walls)) {
    return [];
  }

  const seen = new Set();
  const clean = [];

  for (const wall of walls) {
    const r = Number(wall?.r);
    const c = Number(wall?.c);
    if (!Number.isInteger(r) || !Number.isInteger(c)) {
      continue;
    }
    if (r < 0 || r >= BOARD_SIZE - 1 || c < 0 || c >= BOARD_SIZE - 1) {
      continue;
    }
    const key = wallKey(r, c);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    clean.push({ r, c });
  }

  return clean;
}

function getRealtimeConfig() {
  return {
    url: supabaseUrlInput.value.trim(),
    anonKey: supabaseAnonInput.value.trim()
  };
}

function saveRealtimeConfig() {
  const config = getRealtimeConfig();
  localStorage.setItem(STORAGE_SUPABASE_URL, config.url);
  localStorage.setItem(STORAGE_SUPABASE_ANON, config.anonKey);
}

function loadRealtimeConfig() {
  supabaseUrlInput.value = localStorage.getItem(STORAGE_SUPABASE_URL) || "";
  supabaseAnonInput.value = localStorage.getItem(STORAGE_SUPABASE_ANON) || "";
}

function normalizeRoomCode(value) {
  return (value || "").replace(/\D+/g, "").slice(0, ROOM_CODE_LENGTH);
}

function generateRoomCode() {
  return String(Math.floor(100000 + (Math.random() * 900000)));
}

function randomClientId() {
  return `u-${Math.random().toString(36).slice(2, 10)}`;
}

function attemptMove(r, c) {
  const permission = getLocalPermission();
  if (!permission.ok) {
    state.message = permission.reason;
    render();
    return;
  }

  if (online.mode === "online" && !online.isHost) {
    void requestRemoteAction({
      kind: "move",
      r,
      c
    });
    return;
  }

  const result = applyMove(r, c);
  void afterLocalAction(result);
}

function attemptPlaceWall(orientation, r, c) {
  state.orientation = orientation;

  const permission = getLocalPermission();
  if (!permission.ok) {
    state.message = permission.reason;
    render();
    return;
  }

  if (online.mode === "online" && !online.isHost) {
    void requestRemoteAction({
      kind: "wall",
      orientation,
      r,
      c
    });
    return;
  }

  const result = applyWall(orientation, r, c);
  void afterLocalAction(result);
}

async function requestRemoteAction(action) {
  online.pendingAction = true;
  state.message = "ส่งตาเดินไปยังโฮสต์...";
  render();

  const sent = await sendBroadcast("action-request", {
    senderId: online.clientId,
    action
  });
  if (!sent.ok) {
    online.pendingAction = false;
    state.message = sent.reason;
    render();
  }
}

async function afterLocalAction(result) {
  if (!result.ok) {
    state.message = result.reason;
    render();
    return;
  }

  if (online.mode === "online" && online.isHost) {
    const synced = await broadcastSnapshot();
    if (!synced.ok) {
      state.message = `${state.message} แต่ sync ไม่สำเร็จ`;
    }
  }

  render();
}

function applyMove(r, c) {
  if (state.gameOver) {
    return { ok: false, reason: "เกมจบแล้ว กดเริ่มเกมใหม่เพื่อเล่นรอบถัดไป" };
  }

  const legalMoves = getLegalMoves(state.currentPlayer, state.walls);
  const allowed = legalMoves.some((move) => move.r === r && move.c === c);
  if (!allowed) {
    return { ok: false, reason: "เดินไม่ถูกกติกา: เลือกช่องที่มีไฮไลต์เท่านั้น" };
  }

  const player = state.players[state.currentPlayer];
  player.pawn = { r, c };
  state.revision += 1;

  if (isWinner(state.currentPlayer)) {
    state.gameOver = true;
    state.message = `${player.name} ชนะเกม!`;
    return { ok: true };
  }

  advanceTurn();
  return { ok: true };
}

function applyWall(orientation, r, c) {
  if (state.gameOver) {
    return { ok: false, reason: "เกมจบแล้ว กดเริ่มเกมใหม่เพื่อเล่นรอบถัดไป" };
  }

  const player = state.players[state.currentPlayer];
  if (player.wallsLeft <= 0) {
    return { ok: false, reason: `${player.name} ไม่เหลือกำแพงแล้ว` };
  }

  const validation = canPlaceWall(orientation, r, c, state.walls);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason };
  }

  state.walls[orientation].push({ r, c });
  player.wallsLeft -= 1;
  state.revision += 1;
  advanceTurn();
  return { ok: true };
}

function advanceTurn() {
  state.currentPlayer = 1 - state.currentPlayer;
  state.message = `ตาของ${state.players[state.currentPlayer].name}`;
}

function getLocalPermission() {
  if (state.gameOver) {
    return { ok: false, reason: "เกมจบแล้ว กดเริ่มเกมใหม่เพื่อเล่นรอบถัดไป" };
  }

  if (online.mode === "connecting") {
    return { ok: false, reason: "กำลังเชื่อมต่อห้อง..." };
  }

  if (online.mode !== "online") {
    return { ok: true };
  }

  if (!online.connected) {
    return { ok: false, reason: "รอผู้เล่นอีกฝ่ายเข้าห้องก่อน" };
  }

  if (online.localPlayerIndex === null) {
    return { ok: false, reason: "กำลังรอโฮสต์กำหนดบทบาทผู้เล่น" };
  }

  if (online.pendingAction) {
    return { ok: false, reason: "กำลังรอโฮสต์ยืนยันตาเดินนี้" };
  }

  if (state.currentPlayer !== online.localPlayerIndex) {
    return { ok: false, reason: "ยังไม่ใช่ตาของคุณ" };
  }

  return { ok: true };
}

function render() {
  boardEl.querySelectorAll(".pawn, .wall-piece, .move-hint").forEach((el) => el.remove());
  cells.forEach((cell) => cell.classList.remove("reachable"));

  for (const wall of state.walls.horizontal) {
    placeWallPiece("horizontal", wall.r, wall.c);
  }
  for (const wall of state.walls.vertical) {
    placeWallPiece("vertical", wall.r, wall.c);
  }

  for (let i = 0; i < state.players.length; i += 1) {
    placePawn(i);
  }

  const canAct = getLocalPermission().ok;
  if (!state.gameOver && canAct) {
    const legalMoves = getLegalMoves(state.currentPlayer, state.walls);
    for (const move of legalMoves) {
      const hint = document.createElement("div");
      hint.className = "move-hint";
      hint.style.top = `${(move.r * STEP_SIZE) + ((CELL_SIZE - 16) / 2)}px`;
      hint.style.left = `${(move.c * STEP_SIZE) + ((CELL_SIZE - 16) / 2)}px`;
      boardEl.append(hint);

      const cell = cells.get(cellKey(move.r, move.c));
      if (cell) {
        cell.classList.add("reachable");
      }
    }
  }

  updateWallSlots();
  updatePanel();
  updateOnlinePanel();
}

function updatePanel() {
  const current = state.players[state.currentPlayer];
  const modeText = online.mode === "online"
    ? "ออนไลน์"
    : (online.mode === "connecting" ? "กำลังเชื่อมต่อ" : "ออฟไลน์");
  const localTurn =
    online.mode !== "online" ||
    (online.localPlayerIndex !== null && state.currentPlayer === online.localPlayerIndex);
  const suffix = localTurn ? " (ตาคุณ)" : " (ตาคู่แข่ง)";

  turnTextEl.textContent = state.gameOver
    ? `จบเกม [${modeText}]`
    : `ตาปัจจุบัน: ${current.name}${online.mode === "online" ? suffix : ""} [${modeText}]`;
  statusTextEl.textContent = state.message;
  redWallsEl.textContent = `${state.players[0].wallsLeft} กำแพง`;
  ivoryWallsEl.textContent = `${state.players[1].wallsLeft} กำแพง`;
  orientationBtn.textContent = `แนวกำแพง: ${
    state.orientation === "horizontal" ? "แนวนอน" : "แนวตั้ง"
  }`;
  newGameBtn.disabled = online.mode !== "offline" && !online.isHost;
}

function updateWallSlots() {
  const current = state.players[state.currentPlayer];
  const canAct = getLocalPermission().ok;

  for (const slot of wallSlots) {
    const orientation = slot.dataset.orientation;
    const r = Number(slot.dataset.row);
    const c = Number(slot.dataset.col);

    slot.classList.toggle("active", orientation === state.orientation);
    slot.classList.toggle("inactive", orientation !== state.orientation);

    const noWallsLeft = current.wallsLeft <= 0 || !canAct;
    const cannotPlace = noWallsLeft ? true : !canPlaceWall(orientation, r, c, state.walls).ok;
    const disabled = state.gameOver || noWallsLeft || cannotPlace || !canAct;
    slot.classList.toggle("disabled", disabled);
    slot.setAttribute("aria-disabled", String(disabled));
  }
}

function updateOnlinePanel() {
  const isOnline = online.mode !== "offline";

  onlineStatusTextEl.textContent = online.mode === "online"
    ? (online.connected ? "สถานะ: เชื่อมต่อแล้ว" : "สถานะ: รอผู้เล่นอีกฝ่าย")
    : (online.mode === "connecting" ? "สถานะ: กำลังเชื่อมต่อห้อง..." : "สถานะ: ออฟไลน์");
  roomInfoTextEl.textContent = `ห้อง: ${online.roomCode || "-"}`;
  roleInfoTextEl.textContent = `บทบาท: ${getRoleText()}`;

  createRoomBtn.disabled = isOnline;
  joinRoomBtn.disabled = isOnline;
  leaveRoomBtn.disabled = !isOnline;
  saveConfigBtn.disabled = isOnline;
  supabaseUrlInput.disabled = isOnline;
  supabaseAnonInput.disabled = isOnline;
  roomCodeInput.disabled = isOnline;
}

function getRoleText() {
  if (online.mode !== "online") {
    return "-";
  }
  if (online.localPlayerIndex === 0) {
    return "ฝ่ายแดง (โฮสต์)";
  }
  if (online.localPlayerIndex === 1) {
    return "ฝ่ายงาช้าง";
  }
  return "กำลังรอสิทธิ์ผู้เล่น";
}

function placeWallPiece(orientation, r, c) {
  const piece = document.createElement("div");
  piece.className = `wall-piece ${orientation}`;
  const position = wallPosition(orientation, r, c);
  piece.style.top = `${position.top}px`;
  piece.style.left = `${position.left}px`;
  boardEl.append(piece);
}

function placePawn(playerIndex) {
  const player = state.players[playerIndex];
  const pawn = document.createElement("div");
  pawn.className = `pawn ${playerIndex === 0 ? "red" : "ivory"}`;
  pawn.style.top = `${(player.pawn.r * STEP_SIZE) + ((CELL_SIZE - PAWN_SIZE) / 2)}px`;
  pawn.style.left = `${(player.pawn.c * STEP_SIZE) + ((CELL_SIZE - PAWN_SIZE) / 2)}px`;
  boardEl.append(pawn);
}

function getLegalMoves(playerIndex, walls) {
  const player = state.players[playerIndex];
  const opponent = state.players[1 - playerIndex];
  const blocked = getBlockedEdges(walls);
  const legal = [];

  for (const [dr, dc] of DIRECTIONS) {
    const adjacent = { r: player.pawn.r + dr, c: player.pawn.c + dc };
    if (!inBounds(adjacent.r, adjacent.c)) {
      continue;
    }
    if (isBlocked(player.pawn, adjacent, blocked)) {
      continue;
    }

    const occupiedByOpponent = adjacent.r === opponent.pawn.r && adjacent.c === opponent.pawn.c;
    if (!occupiedByOpponent) {
      legal.push(adjacent);
      continue;
    }

    const jump = { r: opponent.pawn.r + dr, c: opponent.pawn.c + dc };
    if (inBounds(jump.r, jump.c) && !isBlocked(opponent.pawn, jump, blocked)) {
      legal.push(jump);
      continue;
    }

    const diagonals = dr !== 0
      ? [[0, -1], [0, 1]]
      : [[-1, 0], [1, 0]];

    for (const [ddr, ddc] of diagonals) {
      const diagonal = { r: opponent.pawn.r + ddr, c: opponent.pawn.c + ddc };
      if (!inBounds(diagonal.r, diagonal.c)) {
        continue;
      }
      if (!isBlocked(opponent.pawn, diagonal, blocked)) {
        legal.push(diagonal);
      }
    }
  }

  return dedupePositions(legal);
}

function canPlaceWall(orientation, r, c, walls) {
  if (!["horizontal", "vertical"].includes(orientation)) {
    return { ok: false, reason: "แนวกำแพงไม่ถูกต้อง" };
  }
  if (r < 0 || r >= BOARD_SIZE - 1 || c < 0 || c >= BOARD_SIZE - 1) {
    return { ok: false, reason: "ตำแหน่งกำแพงเกินขอบกระดาน" };
  }

  const horizontalSet = new Set(walls.horizontal.map((wall) => wallKey(wall.r, wall.c)));
  const verticalSet = new Set(walls.vertical.map((wall) => wallKey(wall.r, wall.c)));
  const key = wallKey(r, c);

  if (orientation === "horizontal" && horizontalSet.has(key)) {
    return { ok: false, reason: "ตำแหน่งนี้มีกำแพงแนวนอนอยู่แล้ว" };
  }
  if (orientation === "vertical" && verticalSet.has(key)) {
    return { ok: false, reason: "ตำแหน่งนี้มีกำแพงแนวตั้งอยู่แล้ว" };
  }
  if (orientation === "horizontal" && verticalSet.has(key)) {
    return { ok: false, reason: "กำแพงห้ามตัดกันตรงกลาง" };
  }
  if (orientation === "vertical" && horizontalSet.has(key)) {
    return { ok: false, reason: "กำแพงห้ามตัดกันตรงกลาง" };
  }

  const blocked = getBlockedEdges(walls);
  const candidateEdges = wallEdges(orientation, r, c);
  if (candidateEdges.some(([a, b]) => blocked.has(edgeKey(a, b)))) {
    return { ok: false, reason: "กำแพงทับซ้อนกับกำแพงที่มีอยู่" };
  }

  const nextWalls = {
    horizontal: walls.horizontal.map((wall) => ({ ...wall })),
    vertical: walls.vertical.map((wall) => ({ ...wall }))
  };
  nextWalls[orientation].push({ r, c });

  if (!hasPathToGoal(0, nextWalls) || !hasPathToGoal(1, nextWalls)) {
    return { ok: false, reason: "ต้องเหลือทางไปยังฝั่งชนะของทั้งสองฝ่าย" };
  }

  return { ok: true };
}

function hasPathToGoal(playerIndex, walls) {
  const start = state.players[playerIndex].pawn;
  const targetRow = state.players[playerIndex].targetRow;
  const blocked = getBlockedEdges(walls);
  const queue = [start];
  const visited = new Set([cellKey(start.r, start.c)]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current.r === targetRow) {
      return true;
    }

    for (const [dr, dc] of DIRECTIONS) {
      const next = { r: current.r + dr, c: current.c + dc };
      if (!inBounds(next.r, next.c)) {
        continue;
      }
      if (isBlocked(current, next, blocked)) {
        continue;
      }

      const nextKey = cellKey(next.r, next.c);
      if (visited.has(nextKey)) {
        continue;
      }

      visited.add(nextKey);
      queue.push(next);
    }
  }

  return false;
}

function isWinner(playerIndex) {
  return state.players[playerIndex].pawn.r === state.players[playerIndex].targetRow;
}

function getBlockedEdges(walls) {
  const blocked = new Set();
  for (const wall of walls.horizontal) {
    for (const [a, b] of wallEdges("horizontal", wall.r, wall.c)) {
      blocked.add(edgeKey(a, b));
    }
  }
  for (const wall of walls.vertical) {
    for (const [a, b] of wallEdges("vertical", wall.r, wall.c)) {
      blocked.add(edgeKey(a, b));
    }
  }
  return blocked;
}

function wallEdges(orientation, r, c) {
  if (orientation === "horizontal") {
    return [
      [{ r, c }, { r: r + 1, c }],
      [{ r, c: c + 1 }, { r: r + 1, c: c + 1 }]
    ];
  }

  return [
    [{ r, c }, { r, c: c + 1 }],
    [{ r: r + 1, c }, { r: r + 1, c: c + 1 }]
  ];
}

function wallPosition(orientation, r, c) {
  if (orientation === "horizontal") {
    return {
      top: (r * STEP_SIZE) + CELL_SIZE + (GAP_SIZE / 2) - (WALL_THICKNESS / 2),
      left: c * STEP_SIZE
    };
  }

  return {
    top: r * STEP_SIZE,
    left: (c * STEP_SIZE) + CELL_SIZE + (GAP_SIZE / 2) - (WALL_THICKNESS / 2)
  };
}

function dedupePositions(positions) {
  const unique = new Map();
  for (const position of positions) {
    unique.set(cellKey(position.r, position.c), position);
  }
  return [...unique.values()];
}

function inBounds(r, c) {
  return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function isBlocked(a, b, blockedEdges) {
  return blockedEdges.has(edgeKey(a, b));
}

function edgeKey(a, b) {
  const first = cellKey(a.r, a.c);
  const second = cellKey(b.r, b.c);
  return first < second ? `${first}|${second}` : `${second}|${first}`;
}

function cellKey(r, c) {
  return `${r},${c}`;
}

function wallKey(r, c) {
  return `${r},${c}`;
}
