export const GRID_SIZE = 18;
export const CELL_SIZE = 36; // px per cell

export const CELL = {
  GRASS: 'grass',
  WALL: 'wall',
  EMPTY: 'empty',
  ROAD: 'road',
  CASTLE: 'castle',
  SLOT: 'slot',
};

// Top-left corner of each 2×2 structure slot (row, col) — 10 slots
export const STRUCTURE_SLOTS = [
  [2, 2],   // 0 — top-left
  [2, 7],   // 1 — top-center-left
  [2, 9],   // 2 — top-center-right
  [2, 13],  // 3 — top-right
  [6, 2],   // 4 — mid-left-top
  [9, 2],   // 5 — mid-left-bottom
  [6, 13],  // 6 — mid-right-top
  [9, 13],  // 7 — mid-right-bottom
  [13, 2],  // 8 — bottom-left
  [13, 13], // 9 — bottom-right
];

// Castle occupies rows 7-10, cols 7-10
export const CASTLE_ROW = 7;
export const CASTLE_COL = 7;
export const CASTLE_SPAN = 4;

export function createInitialMap() {
  // Fill everything with grass
  const grid = Array.from({ length: GRID_SIZE }, (_, r) =>
    Array.from({ length: GRID_SIZE }, (_, c) => ({ type: CELL.GRASS, slotId: null }))
  );

  // City walls — single-tile border at rows 1 & 16, cols 1 & 16
  for (let i = 1; i <= 16; i++) {
    grid[1][i].type = CELL.WALL;
    grid[16][i].type = CELL.WALL;
    grid[i][1].type = CELL.WALL;
    grid[i][16].type = CELL.WALL;
  }

  // Inner territory (rows 2-15, cols 2-15)
  for (let r = 2; r <= 15; r++) {
    for (let c = 2; c <= 15; c++) {
      grid[r][c].type = CELL.EMPTY;
    }
  }

  // Road network — main cross + ring around castle
  // Row 5 and row 12 (horizontal arteries)
  for (let c = 2; c <= 15; c++) {
    grid[5][c].type = CELL.ROAD;
    grid[12][c].type = CELL.ROAD;
  }
  // Col 5 and col 12 (vertical arteries)
  for (let r = 2; r <= 15; r++) {
    grid[r][5].type = CELL.ROAD;
    grid[r][12].type = CELL.ROAD;
  }
  // Ring road around castle (rows 6-11, cols 6-11 perimeter)
  for (let c = 6; c <= 11; c++) {
    grid[6][c].type = CELL.ROAD;
    grid[11][c].type = CELL.ROAD;
  }
  for (let r = 6; r <= 11; r++) {
    grid[r][6].type = CELL.ROAD;
    grid[r][11].type = CELL.ROAD;
  }

  // Castle (4×4: rows 7-10, cols 7-10) — overwrites roads/empty
  for (let r = CASTLE_ROW; r < CASTLE_ROW + CASTLE_SPAN; r++) {
    for (let c = CASTLE_COL; c < CASTLE_COL + CASTLE_SPAN; c++) {
      grid[r][c].type = CELL.CASTLE;
    }
  }

  // South gate — open two tiles in the south wall and add a boulevard to row-12 artery
  grid[16][8].type = CELL.ROAD;
  grid[16][9].type = CELL.ROAD;
  for (let r = 13; r <= 15; r++) {
    grid[r][8].type = CELL.ROAD;
    grid[r][9].type = CELL.ROAD;
  }

  // Structure slots (2×2 each) — placed after roads; no overlaps by design
  STRUCTURE_SLOTS.forEach(([sr, sc], idx) => {
    for (let dr = 0; dr <= 1; dr++) {
      for (let dc = 0; dc <= 1; dc++) {
        grid[sr + dr][sc + dc].type = CELL.SLOT;
        grid[sr + dr][sc + dc].slotId = idx;
      }
    }
  });

  return grid;
}

// Deterministic grass shade variation (3 shades)
export function grassShade(r, c) {
  return (r * 3 + c * 7) % 3;
}
