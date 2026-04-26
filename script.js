import { createClient } from '@supabase/supabase-js';

// ==========================================
// 1. Supabase & Online State
// ==========================================
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Supabase credentials missing! Check your .env file or Environment Variables.");
  document.body.innerHTML = `
    <div style="padding: 20px; background: #5b261f; color: #fff; font-family: sans-serif; text-align: center; border-radius: 12px; margin: 20px;">
      <h2>⚠️ Missing Configuration</h2>
      <p>Supabase URL หรือ API Key หายไปครับ</p>
      <p style="font-size: 0.9rem; opacity: 0.8;">ถ้าคุณรันบนเครื่องตัวเอง: ให้สร้างไฟล์ <b>.env</b> และใส่ VITE_SUPABASE_URL และ VITE_SUPABASE_ANON_KEY</p>
      <p style="font-size: 0.9rem; opacity: 0.8;">ถ้าคุณ Deploy บน Vercel: ให้ไปตั้งค่าที่ <b>Settings -> Environment Variables</b></p>
    </div>
  `;
  throw new Error("Supabase credentials missing");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const urlParams = new URLSearchParams(window.location.search);
let gameId = urlParams.get('game');
let myPlayerIndex = null;

if (gameId) {
  const saved = sessionStorage.getItem(`game_${gameId}_player`);
  if (saved !== null) {
    myPlayerIndex = parseInt(saved, 10);
  } else {
    myPlayerIndex = 1;
    sessionStorage.setItem(`game_${gameId}_player`, 1);
  }
}

// ==========================================
// 2. Constants
// ==========================================
const BOARD_SIZE = 9;
const DIRECTIONS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// Read CSS variable values for positioning
function getCSSSize(name) {
  return parseInt(getComputedStyle(document.documentElement).getPropertyValue(name), 10);
}

function getSizes() {
  const cellSize = getCSSSize('--cell-size');
  const gapSize = getCSSSize('--gap-size');
  const stepSize = cellSize + gapSize;
  const wallThickness = getCSSSize('--wall-thickness');
  const wallLength = (2 * cellSize) + gapSize;
  const pawnSize = getCSSSize('--pawn-size');
  return { cellSize, gapSize, stepSize, wallThickness, wallLength, pawnSize };
}

// ==========================================
// 3. Sound System
// ==========================================
let soundEnabled = true;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playTone(freq, duration, type = 'sine', vol = 0.15) {
  if (!soundEnabled) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) { /* ignore audio errors */ }
}

function playMoveSound() { playTone(520, 0.12, 'sine', 0.1); }
function playWallSound() { playTone(220, 0.2, 'square', 0.08); }
function playWinSound() {
  [523, 659, 784, 1047].forEach((f, i) => {
    setTimeout(() => playTone(f, 0.3, 'sine', 0.12), i * 120);
  });
}
function playErrorSound() { playTone(180, 0.15, 'sawtooth', 0.06); }

// ==========================================
// 4. DOM Elements
// ==========================================
const boardEl = document.getElementById("board");
const turnTextEl = document.getElementById("turnText");
const statusTextEl = document.getElementById("statusText");
const redWallsEl = document.getElementById("redWalls");
const ivoryWallsEl = document.getElementById("ivoryWalls");
const orientationBtn = document.getElementById("orientationBtn");
const newGameBtn = document.getElementById("newGameBtn");
const createRoomBtn = document.getElementById("createRoomBtn");
const inviteSection = document.getElementById("inviteSection");
const inviteLink = document.getElementById("inviteLink");
const copyLinkBtn = document.getElementById("copyLinkBtn");
const copyFeedback = document.getElementById("copyFeedback");
const waitingIndicator = document.getElementById("waitingIndicator");
const soundToggle = document.getElementById("soundToggle");
const soundIcon = document.getElementById("soundIcon");
const winOverlay = document.getElementById("winOverlay");
const winTitle = document.getElementById("winTitle");
const winNewGameBtn = document.getElementById("winNewGameBtn");
const confettiEl = document.getElementById("confetti");
const playerRowRed = document.getElementById("playerRowRed");
const playerRowIvory = document.getElementById("playerRowIvory");

const cells = new Map();
const wallSlots = [];
// Persistent pawn elements for smooth animation
let pawnEls = [null, null];
let state = createInitialState();

// ==========================================
// 5. Init
// ==========================================
init();

async function init() {
  buildBoard();
  createPawns();
  bindEvents();

  if (gameId) {
    await loadGameState();
    subscribeToGame();
  } else {
    render();
  }
}

// ==========================================
// 6. Online Multiplayer
// ==========================================
async function loadGameState() {
  const { data, error } = await supabase.from('games').select('*').eq('id', gameId).single();

  if (error) {
    statusTextEl.textContent = "ไม่พบห้องเกมนี้ หรือเกิดข้อผิดพลาด";
    return;
  }

  if (data) {
    state = data.state;
    if (data.status === 'waiting' && myPlayerIndex === 1) {
      await supabase.from('games').update({ status: 'playing' }).eq('id', gameId);
    }
    render();
  }
}

function subscribeToGame() {
  supabase
    .channel(`game-${gameId}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${gameId}` }, (payload) => {
      const prev = state.currentPlayer;
      state = payload.new.state;

      // Hide waiting indicator when opponent joins
      if (payload.new.status === 'playing' && waitingIndicator) {
        waitingIndicator.style.display = 'none';
      }

      render();

      // Play sound when it becomes my turn
      if (!state.gameOver && state.currentPlayer === myPlayerIndex && prev !== myPlayerIndex) {
        playMoveSound();
      }
    })
    .subscribe();
}

async function syncStateToSupabase(gameStatus = 'playing') {
  if (gameId) {
    await supabase.from('games').update({ state, status: gameStatus }).eq('id', gameId);
  }
}

// ==========================================
// 7. Board Building
// ==========================================
function createInitialState() {
  return {
    currentPlayer: 0,
    orientation: "horizontal",
    gameOver: false,
    message: "ตาของฝ่ายแดง",
    players: [
      { name: "ฝ่ายแดง", pawn: { r: 8, c: 4 }, targetRow: 0, wallsLeft: 10 },
      { name: "ฝ่ายงาช้าง", pawn: { r: 0, c: 4 }, targetRow: 8, wallsLeft: 10 }
    ],
    walls: { horizontal: [], vertical: [] }
  };
}

function buildBoard() {
  const s = getSizes();
  const fragment = document.createDocumentFragment();

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.style.top = `${r * s.stepSize}px`;
      cell.style.left = `${c * s.stepSize}px`;
      cell.setAttribute("aria-label", `ช่อง ${r + 1}, ${c + 1}`);
      cells.set(cellKey(r, c), cell);
      fragment.append(cell);
    }
  }

  for (let r = 0; r < BOARD_SIZE - 1; r++) {
    for (let c = 0; c < BOARD_SIZE - 1; c++) {
      const hSlot = createWallSlot("horizontal", r, c, s);
      const vSlot = createWallSlot("vertical", r, c, s);
      wallSlots.push(hSlot, vSlot);
      fragment.append(hSlot, vSlot);
    }
  }

  boardEl.append(fragment);
}

function createWallSlot(orientation, r, c, s) {
  const slot = document.createElement("button");
  slot.type = "button";
  slot.className = "wall-slot";
  slot.dataset.orientation = orientation;
  slot.dataset.row = String(r);
  slot.dataset.col = String(c);

  const pos = wallPosition(orientation, r, c, s);
  slot.style.top = `${pos.top}px`;
  slot.style.left = `${pos.left}px`;

  if (orientation === "horizontal") {
    slot.style.width = `${s.wallLength}px`;
    slot.style.height = `${s.wallThickness}px`;
  } else {
    slot.style.width = `${s.wallThickness}px`;
    slot.style.height = `${s.wallLength}px`;
  }

  return slot;
}

function createPawns() {
  const s = getSizes();
  for (let i = 0; i < 2; i++) {
    const pawn = document.createElement("div");
    pawn.className = `pawn ${i === 0 ? "red" : "ivory"}`;
    const p = state.players[i].pawn;
    pawn.style.top = `${(p.r * s.stepSize) + ((s.cellSize - s.pawnSize) / 2)}px`;
    pawn.style.left = `${(p.c * s.stepSize) + ((s.cellSize - s.pawnSize) / 2)}px`;
    boardEl.append(pawn);
    pawnEls[i] = pawn;
  }
}

// ==========================================
// 8. Events
// ==========================================
function bindEvents() {
  boardEl.addEventListener("click", (e) => {
    const cell = e.target.closest(".cell");
    if (cell) { attemptMove(Number(cell.dataset.row), Number(cell.dataset.col)); return; }
    const slot = e.target.closest(".wall-slot");
    if (slot) { attemptPlaceWall(slot.dataset.orientation, Number(slot.dataset.row), Number(slot.dataset.col)); }
  });

  orientationBtn.addEventListener("click", () => {
    state.orientation = state.orientation === "horizontal" ? "vertical" : "horizontal";
    render();
  });

  newGameBtn.addEventListener("click", startNewGame);
  if (winNewGameBtn) winNewGameBtn.addEventListener("click", startNewGame);

  if (createRoomBtn) {
    createRoomBtn.addEventListener("click", async () => {
      state = createInitialState();
      const { data, error } = await supabase.from('games').insert([{ state, status: 'waiting' }]).select().single();
      if (error) { statusTextEl.textContent = "สร้างห้องไม่สำเร็จ กรุณาลองอีกครั้ง"; return; }

      gameId = data.id;
      myPlayerIndex = 0;
      sessionStorage.setItem(`game_${gameId}_player`, 0);

      const url = `${window.location.origin}?game=${gameId}`;
      window.history.pushState({}, '', url);

      inviteLink.value = url;
      inviteSection.style.display = 'block';
      waitingIndicator.style.display = 'flex';

      subscribeToGame();
      render();
    });
  }

  if (copyLinkBtn) {
    copyLinkBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(inviteLink.value);
        copyFeedback.style.display = 'block';
        setTimeout(() => { copyFeedback.style.display = 'none'; }, 2000);
      } catch {
        inviteLink.select();
        document.execCommand('copy');
        copyFeedback.style.display = 'block';
        setTimeout(() => { copyFeedback.style.display = 'none'; }, 2000);
      }
    });
  }

  if (soundToggle) {
    soundToggle.addEventListener("click", () => {
      soundEnabled = !soundEnabled;
      soundToggle.classList.toggle("muted", !soundEnabled);
      if (soundEnabled && audioCtx.state === 'suspended') audioCtx.resume();
    });
  }

  window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "r") {
      state.orientation = state.orientation === "horizontal" ? "vertical" : "horizontal";
      render();
    }
  });

  // Resume AudioContext on first interaction
  document.addEventListener("click", () => {
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }, { once: true });
}

function startNewGame() {
  if (gameId && myPlayerIndex !== 0) {
    alert("เฉพาะ Host (ฝ่ายแดง) เท่านั้นที่เริ่มเกมใหม่ได้");
    return;
  }
  state = createInitialState();
  winOverlay.style.display = 'none';
  confettiEl.innerHTML = '';
  pawnEls.forEach(p => p.classList.remove('winner'));
  render();
  syncStateToSupabase('playing');
}

// ==========================================
// 9. Gameplay Logic
// ==========================================
function attemptMove(r, c) {
  if (gameId && state.currentPlayer !== myPlayerIndex) { playErrorSound(); return; }
  if (state.gameOver) { state.message = "เกมจบแล้ว กดเริ่มเกมใหม่"; render(); return; }

  const legalMoves = getLegalMoves(state.currentPlayer, state.walls);
  if (!legalMoves.some(m => m.r === r && m.c === c)) {
    state.message = "เดินไม่ถูกกติกา: เลือกช่องที่มีไฮไลต์";
    playErrorSound();
    render();
    return;
  }

  state.players[state.currentPlayer].pawn = { r, c };
  playMoveSound();

  if (isWinner(state.currentPlayer)) {
    state.gameOver = true;
    state.message = `${state.players[state.currentPlayer].name} ชนะเกม!`;
    render();
    showWinCelebration(state.currentPlayer);
    syncStateToSupabase('finished');
    return;
  }

  endTurn();
}

function attemptPlaceWall(orientation, r, c) {
  if (gameId && state.currentPlayer !== myPlayerIndex) { playErrorSound(); return; }
  state.orientation = orientation;
  if (state.gameOver) { state.message = "เกมจบแล้ว กดเริ่มเกมใหม่"; render(); return; }

  const player = state.players[state.currentPlayer];
  if (player.wallsLeft <= 0) { state.message = `${player.name} ไม่เหลือกำแพงแล้ว`; playErrorSound(); render(); return; }

  const v = canPlaceWall(orientation, r, c, state.walls);
  if (!v.ok) { state.message = v.reason; playErrorSound(); render(); return; }

  state.walls[orientation].push({ r, c });
  player.wallsLeft -= 1;
  playWallSound();
  endTurn();
}

function endTurn() {
  state.currentPlayer = 1 - state.currentPlayer;
  state.message = `ตาของ${state.players[state.currentPlayer].name}`;
  render();
  syncStateToSupabase('playing');
}

// ==========================================
// 10. Rendering
// ==========================================
function render() {
  const s = getSizes();

  // Clear dynamic elements (walls, hints) but NOT pawns
  boardEl.querySelectorAll(".wall-piece, .move-hint").forEach(el => el.remove());
  cells.forEach(cell => cell.classList.remove("reachable"));

  // Walls
  for (const w of state.walls.horizontal) placeWallPiece("horizontal", w.r, w.c, s);
  for (const w of state.walls.vertical) placeWallPiece("vertical", w.r, w.c, s);

  // Move pawns smoothly via CSS transition
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i].pawn;
    if (pawnEls[i]) {
      pawnEls[i].style.top = `${(p.r * s.stepSize) + ((s.cellSize - s.pawnSize) / 2)}px`;
      pawnEls[i].style.left = `${(p.c * s.stepSize) + ((s.cellSize - s.pawnSize) / 2)}px`;
    }
  }

  // Move hints
  if (!state.gameOver && (!gameId || state.currentPlayer === myPlayerIndex)) {
    const legalMoves = getLegalMoves(state.currentPlayer, state.walls);
    for (const move of legalMoves) {
      const hint = document.createElement("div");
      hint.className = "move-hint";
      hint.style.top = `${(move.r * s.stepSize) + ((s.cellSize - 16) / 2)}px`;
      hint.style.left = `${(move.c * s.stepSize) + ((s.cellSize - 16) / 2)}px`;
      boardEl.append(hint);

      const cell = cells.get(cellKey(move.r, move.c));
      if (cell) cell.classList.add("reachable");
    }
  }

  updateWallSlots();
  updatePanel();
}

function updatePanel() {
  const cur = state.players[state.currentPlayer];
  let roleStr = "";
  if (gameId && myPlayerIndex !== null) {
    roleStr = ` (คุณคือ: ${state.players[myPlayerIndex].name})`;
  }

  turnTextEl.textContent = state.gameOver ? "จบเกม" : `ตาปัจจุบัน: ${cur.name}${roleStr}`;
  statusTextEl.textContent = state.message;
  redWallsEl.textContent = `${state.players[0].wallsLeft} กำแพง`;
  ivoryWallsEl.textContent = `${state.players[1].wallsLeft} กำแพง`;
  orientationBtn.innerHTML = `<span class="btn-icon">🧱</span> แนวกำแพง: ${state.orientation === "horizontal" ? "แนวนอน" : "แนวตั้ง"}`;

  // Highlight active player row
  if (playerRowRed) playerRowRed.classList.toggle("active", state.currentPlayer === 0);
  if (playerRowIvory) playerRowIvory.classList.toggle("active", state.currentPlayer === 1);
}

function updateWallSlots() {
  const current = state.players[state.currentPlayer];
  const isMyTurn = !gameId || state.currentPlayer === myPlayerIndex;

  for (const slot of wallSlots) {
    const ori = slot.dataset.orientation;
    const r = Number(slot.dataset.row);
    const c = Number(slot.dataset.col);

    slot.classList.toggle("active", ori === state.orientation);
    slot.classList.toggle("inactive", ori !== state.orientation);

    const disabled = state.gameOver || current.wallsLeft <= 0 || !canPlaceWall(ori, r, c, state.walls).ok || !isMyTurn;
    slot.classList.toggle("disabled", disabled);
    slot.setAttribute("aria-disabled", String(disabled));
  }
}

function placeWallPiece(orientation, r, c, s) {
  const piece = document.createElement("div");
  piece.className = `wall-piece ${orientation}`;
  const pos = wallPosition(orientation, r, c, s);
  piece.style.top = `${pos.top}px`;
  piece.style.left = `${pos.left}px`;
  if (orientation === "horizontal") {
    piece.style.width = `${s.wallLength}px`;
    piece.style.height = `${s.wallThickness}px`;
  } else {
    piece.style.width = `${s.wallThickness}px`;
    piece.style.height = `${s.wallLength}px`;
  }
  boardEl.append(piece);
}

// ==========================================
// 11. Win Celebration
// ==========================================
function showWinCelebration(playerIndex) {
  playWinSound();
  pawnEls[playerIndex].classList.add('winner');

  winTitle.textContent = `${state.players[playerIndex].name} ชนะ!`;
  winOverlay.style.display = 'flex';

  // Spawn confetti
  confettiEl.innerHTML = '';
  const colors = ['#f0bd73', '#ca2b2b', '#e8c98e', '#ff998d', '#ffd700', '#4ade80', '#60a5fa'];
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = `${Math.random() * 100}%`;
    p.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    p.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    p.style.width = `${6 + Math.random() * 8}px`;
    p.style.height = `${6 + Math.random() * 8}px`;
    p.style.animationDuration = `${1.5 + Math.random() * 2}s`;
    p.style.animationDelay = `${Math.random() * 1}s`;
    confettiEl.append(p);
  }
}

// ==========================================
// 12. Game Rules & Validation
// ==========================================
function getLegalMoves(playerIndex, walls) {
  const player = state.players[playerIndex];
  const opponent = state.players[1 - playerIndex];
  const blocked = getBlockedEdges(walls);
  const legal = [];

  for (const [dr, dc] of DIRECTIONS) {
    const adj = { r: player.pawn.r + dr, c: player.pawn.c + dc };
    if (!inBounds(adj.r, adj.c)) continue;
    if (isBlocked(player.pawn, adj, blocked)) continue;

    if (adj.r !== opponent.pawn.r || adj.c !== opponent.pawn.c) {
      legal.push(adj);
      continue;
    }

    const jump = { r: opponent.pawn.r + dr, c: opponent.pawn.c + dc };
    if (inBounds(jump.r, jump.c) && !isBlocked(opponent.pawn, jump, blocked)) {
      legal.push(jump);
      continue;
    }

    const diags = dr !== 0 ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [ddr, ddc] of diags) {
      const diag = { r: opponent.pawn.r + ddr, c: opponent.pawn.c + ddc };
      if (inBounds(diag.r, diag.c) && !isBlocked(opponent.pawn, diag, blocked)) {
        legal.push(diag);
      }
    }
  }
  return dedupePositions(legal);
}

function canPlaceWall(orientation, r, c, walls) {
  if (r < 0 || r >= BOARD_SIZE - 1 || c < 0 || c >= BOARD_SIZE - 1) return { ok: false, reason: "ตำแหน่งเกินขอบกระดาน" };

  const hSet = new Set(walls.horizontal.map(w => wallKey(w.r, w.c)));
  const vSet = new Set(walls.vertical.map(w => wallKey(w.r, w.c)));
  const key = wallKey(r, c);

  if (orientation === "horizontal" && hSet.has(key)) return { ok: false, reason: "มีกำแพงแนวนอนอยู่แล้ว" };
  if (orientation === "vertical" && vSet.has(key)) return { ok: false, reason: "มีกำแพงแนวตั้งอยู่แล้ว" };
  if (orientation === "horizontal" && vSet.has(key)) return { ok: false, reason: "กำแพงตัดกัน" };
  if (orientation === "vertical" && hSet.has(key)) return { ok: false, reason: "กำแพงตัดกัน" };

  const blocked = getBlockedEdges(walls);
  const candidateEdges = wallEdges(orientation, r, c);
  if (candidateEdges.some(([a, b]) => blocked.has(edgeKey(a, b)))) return { ok: false, reason: "กำแพงทับซ้อน" };

  const nextWalls = {
    horizontal: walls.horizontal.map(w => ({ ...w })),
    vertical: walls.vertical.map(w => ({ ...w }))
  };
  nextWalls[orientation].push({ r, c });

  if (!hasPathToGoal(0, nextWalls) || !hasPathToGoal(1, nextWalls)) return { ok: false, reason: "ต้องเหลือทางไปยังฝั่งชนะ" };

  return { ok: true };
}

function hasPathToGoal(playerIndex, walls) {
  const start = state.players[playerIndex].pawn;
  const targetRow = state.players[playerIndex].targetRow;
  const blocked = getBlockedEdges(walls);
  const queue = [start];
  const visited = new Set([cellKey(start.r, start.c)]);

  while (queue.length > 0) {
    const cur = queue.shift();
    if (cur.r === targetRow) return true;
    for (const [dr, dc] of DIRECTIONS) {
      const next = { r: cur.r + dr, c: cur.c + dc };
      if (!inBounds(next.r, next.c)) continue;
      if (isBlocked(cur, next, blocked)) continue;
      const nk = cellKey(next.r, next.c);
      if (visited.has(nk)) continue;
      visited.add(nk);
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
  for (const w of walls.horizontal) for (const [a, b] of wallEdges("horizontal", w.r, w.c)) blocked.add(edgeKey(a, b));
  for (const w of walls.vertical) for (const [a, b] of wallEdges("vertical", w.r, w.c)) blocked.add(edgeKey(a, b));
  return blocked;
}

function wallEdges(orientation, r, c) {
  if (orientation === "horizontal") {
    return [[{ r, c }, { r: r + 1, c }], [{ r, c: c + 1 }, { r: r + 1, c: c + 1 }]];
  }
  return [[{ r, c }, { r, c: c + 1 }], [{ r: r + 1, c }, { r: r + 1, c: c + 1 }]];
}

function wallPosition(orientation, r, c, s) {
  if (orientation === "horizontal") {
    return { top: (r * s.stepSize) + s.cellSize + (s.gapSize / 2) - (s.wallThickness / 2), left: c * s.stepSize };
  }
  return { top: r * s.stepSize, left: (c * s.stepSize) + s.cellSize + (s.gapSize / 2) - (s.wallThickness / 2) };
}

// ==========================================
// 13. Utilities
// ==========================================
function dedupePositions(positions) {
  const unique = new Map();
  for (const p of positions) unique.set(cellKey(p.r, p.c), p);
  return [...unique.values()];
}

function inBounds(r, c) { return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE; }
function isBlocked(a, b, blockedEdges) { return blockedEdges.has(edgeKey(a, b)); }
function edgeKey(a, b) {
  const f = cellKey(a.r, a.c), s = cellKey(b.r, b.c);
  return f < s ? `${f}|${s}` : `${s}|${f}`;
}
function cellKey(r, c) { return `${r},${c}`; }
function wallKey(r, c) { return `${r},${c}`; }