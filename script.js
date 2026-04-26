const BOARD_SIZE = 9;
const CELL_SIZE = 56;
const GAP_SIZE = 12;
const STEP_SIZE = CELL_SIZE + GAP_SIZE;
const WALL_THICKNESS = 14;
const WALL_LENGTH = (2 * CELL_SIZE) + GAP_SIZE;
const PAWN_SIZE = 34;
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

const cells = new Map();
const wallSlots = [];
let state = createInitialState();

init();

function init() {
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
    state = createInitialState();
    render();
  });

  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "r") {
      state.orientation = state.orientation === "horizontal" ? "vertical" : "horizontal";
      render();
    }
  });
}

function attemptMove(r, c) {
  if (state.gameOver) {
    state.message = "เกมจบแล้ว กดเริ่มเกมใหม่เพื่อเล่นรอบถัดไป";
    render();
    return;
  }

  const legalMoves = getLegalMoves(state.currentPlayer, state.walls);
  const allowed = legalMoves.some((move) => move.r === r && move.c === c);

  if (!allowed) {
    state.message = "เดินไม่ถูกกติกา: เลือกช่องที่มีไฮไลต์เท่านั้น";
    render();
    return;
  }

  const player = state.players[state.currentPlayer];
  player.pawn = { r, c };

  if (isWinner(state.currentPlayer)) {
    state.gameOver = true;
    state.message = `${player.name} ชนะเกม!`;
    render();
    return;
  }

  endTurn();
}

function attemptPlaceWall(orientation, r, c) {
  state.orientation = orientation;

  if (state.gameOver) {
    state.message = "เกมจบแล้ว กดเริ่มเกมใหม่เพื่อเล่นรอบถัดไป";
    render();
    return;
  }

  const player = state.players[state.currentPlayer];
  if (player.wallsLeft <= 0) {
    state.message = `${player.name} ไม่เหลือกำแพงแล้ว`;
    render();
    return;
  }

  const validation = canPlaceWall(orientation, r, c, state.walls);
  if (!validation.ok) {
    state.message = validation.reason;
    render();
    return;
  }

  state.walls[orientation].push({ r, c });
  player.wallsLeft -= 1;
  endTurn();
}

function endTurn() {
  state.currentPlayer = 1 - state.currentPlayer;
  state.message = `ตาของ${state.players[state.currentPlayer].name}`;
  render();
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

  if (!state.gameOver) {
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
}

function updatePanel() {
  const current = state.players[state.currentPlayer];
  turnTextEl.textContent = state.gameOver
    ? "จบเกม"
    : `ตาปัจจุบัน: ${current.name}`;
  statusTextEl.textContent = state.message;
  redWallsEl.textContent = `${state.players[0].wallsLeft} กำแพง`;
  ivoryWallsEl.textContent = `${state.players[1].wallsLeft} กำแพง`;
  orientationBtn.textContent = `แนวกำแพง: ${
    state.orientation === "horizontal" ? "แนวนอน" : "แนวตั้ง"
  }`;
}

function updateWallSlots() {
  const current = state.players[state.currentPlayer];

  for (const slot of wallSlots) {
    const orientation = slot.dataset.orientation;
    const r = Number(slot.dataset.row);
    const c = Number(slot.dataset.col);

    slot.classList.toggle("active", orientation === state.orientation);
    slot.classList.toggle("inactive", orientation !== state.orientation);

    const noWallsLeft = current.wallsLeft <= 0;
    const cannotPlace = !canPlaceWall(orientation, r, c, state.walls).ok;
    const disabled = state.gameOver || noWallsLeft || cannotPlace;
    slot.classList.toggle("disabled", disabled);
    slot.setAttribute("aria-disabled", String(disabled));
  }
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
