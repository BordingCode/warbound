// Square-grid geometry + pathfinding for the 8x8 battle arena.
// Pure: no DOM, no RNG. Coordinates are {col, row}; col 0..COLS-1, row 0..ROWS-1.
// Row 0 is the TOP (enemy back line). Player deploys rows 4..7, enemy rows 0..3.

export const COLS = 8;
export const ROWS = 8;
export const PLAYER_ROWS = [4, 5, 6, 7];
export const ENEMY_ROWS = [3, 2, 1, 0];

export function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }
export function idx(c, r) { return r * COLS + c; }
export function fromIdx(i) { return { col: i % COLS, row: (i / COLS) | 0 }; }

// Chebyshev distance (8-directional movement: diagonals cost 1). Matches how units
// step on a square board so melee "adjacency" includes diagonals.
export function dist(a, b) {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

// 8 neighbours, deterministic order (used by BFS; order only affects equal-cost ties,
// which we break explicitly elsewhere).
const DIRS = [
  { dc: 0, dr: -1 }, { dc: 1, dr: -1 }, { dc: 1, dr: 0 }, { dc: 1, dr: 1 },
  { dc: 0, dr: 1 }, { dc: -1, dr: 1 }, { dc: -1, dr: 0 }, { dc: -1, dr: -1 },
];
export function neighbours(c, r) {
  const out = [];
  for (const d of DIRS) {
    const nc = c + d.dc, nr = r + d.dr;
    if (inBounds(nc, nr)) out.push({ col: nc, row: nr });
  }
  return out;
}

// BFS distance field from a goal cell across all walkable cells.
// `blocked` is a Set of idx() that cannot be entered (occupied tiles).
// Returns Int16Array of step-distances (or -1 if unreachable). The goal itself = 0.
export function distanceField(goal, blocked) {
  const field = new Int16Array(COLS * ROWS).fill(-1);
  const gi = idx(goal.col, goal.row);
  field[gi] = 0;
  let frontier = [goal];
  while (frontier.length) {
    const nextFrontier = [];
    for (const cell of frontier) {
      const base = field[idx(cell.col, cell.row)];
      for (const n of neighbours(cell.col, cell.row)) {
        const ni = idx(n.col, n.row);
        if (field[ni] !== -1) continue;        // already visited
        if (blocked.has(ni) && ni !== gi) continue; // can't path through bodies
        field[ni] = base + 1;
        nextFrontier.push(n);
      }
    }
    frontier = nextFrontier;
  }
  return field;
}

// Choose the next step from `from` toward `goal`, avoiding occupied cells.
// Deterministic tie-break: lowest field value, then lowest cell index.
// Returns the chosen {col,row} or null if no progress possible.
export function stepToward(from, goal, blocked) {
  // We want a tile adjacent to `from` that is closer to goal. Build the field with the
  // GOAL cell walkable (so units can approach it) but every other body blocking.
  const field = distanceField(goal, blocked);
  let best = null, bestVal = Infinity, bestIdx = Infinity;
  for (const n of neighbours(from.col, from.row)) {
    const ni = idx(n.col, n.row);
    if (blocked.has(ni)) continue;            // occupied, can't move there
    const v = field[ni];
    if (v === -1) continue;                   // unreachable
    if (v < bestVal || (v === bestVal && ni < bestIdx)) {
      best = n; bestVal = v; bestIdx = ni;
    }
  }
  return best;
}
