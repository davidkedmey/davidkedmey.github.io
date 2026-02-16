// World grid, tile types, layout, collision

export const TILE = { GRASS: 0, DIRT: 1, PATH: 2, WATER: 3, BUILDING: 4, TREE: 5, FENCE: 6 };
export const COLS = 32;
export const ROWS = 40;
export const TILE_SIZE = 48;

export const BUILDINGS = [
  { id: 'house',  name: 'House',   x: 3,  y: 2,  w: 2, h: 2, color: '#8B7355', doorSide: 'bottom' },
  { id: 'shop',   name: 'Shop',    x: 27, y: 2,  w: 2, h: 2, color: '#5B8B5B', doorSide: 'bottom' },
  { id: 'lab',    name: 'Lab',     x: 3,  y: 19, w: 2, h: 2, color: '#5B6B8B', doorSide: 'top' },
  { id: 'museum', name: 'Museum',  x: 27, y: 19, w: 2, h: 2, color: '#8B6B5B', doorSide: 'top' },
  { id: 'study', name: "Dawkins' Study", x: 14, y: 2, w: 2, h: 2, color: '#7B6B5B', doorSide: 'bottom' },
  { id: 'fern_house', name: "Fern's", x: 7, y: 8, w: 2, h: 2, color: '#5a8a5a', doorSide: 'bottom' },
  { id: 'moss_house', name: "Moss's", x: 22, y: 8, w: 2, h: 2, color: '#5a7a9a', doorSide: 'bottom' },
];

// Decorative tree positions
const TREES = [
  // Upper left grove
  [1,1],[2,1],[1,2],[6,1],[7,1],[6,2],
  // Upper right grove
  [24,1],[25,1],[24,2],[30,1],[30,2],[29,1],
  // Mid-left grove (old lower-left, now mid-area)
  [1,21],[2,21],[1,22],[6,21],[7,21],[6,22],
  // Mid-right grove (old lower-right, now mid-area)
  [24,21],[25,21],[24,22],[30,21],[30,22],[29,21],
  // Scattered mid-area trees
  [11,3],
  [10,20],[11,20],[20,20],[21,20],
  // Near pond
  [11,14],[14,14],[11,17],[14,17],
  // Southern grove — edges only, avoiding exhibit paths
  [1,28],[1,32],[1,36],
  [30,28],[30,32],[30,36],
];

// Pond position (interior water)
const POND = { x: 12, y: 15, w: 2, h: 2 };

// Zone signs — text labels at zone entrances
export const ZONE_SIGNS = [
  { col: 17, row: 25, text: 'Basic Forms' },
  { col: 17, row: 29, text: 'Symmetry' },
  { col: 17, row: 33, text: 'Segmentation' },
  { col: 17, row: 37, text: 'Full Dawkins' },
];

// ── Exhibit system ──────────────────────────────────────────
// World exhibits: curated specimens that demonstrate morphospace properties.
// Each exhibit has a position, a label, and a spec for generating its specimen.
// These are permanent displays — not owned by NPCs, not part of farming.

// A "nice-looking" base genotype used across depth exhibits so visitors
// see the SAME species at increasing complexity:
//   g1=-1, g2=3, g3=-1, g4=-1, g5=2, g6=2, g7=2, g8=3
const BASE_GENES_A = [-1, 3, -1, -1, 2, 2, 2, 3];
// A second base with different character:
const BASE_GENES_B = [2, -1, 2, 1, -2, 1, -2, -1];

function depthExhibit(col, row, depth, baseGenes, label) {
  return { col, row, label: label || `Depth ${depth}`,
    spec: { mode: 1, genes: [...baseGenes, depth] } };
}

export const EXHIBITS = [
  // ── Zone 1: Basic Forms — depth gradient ──────────────────
  // Left side (Species A): depth 2 near path → depth 7 at edge
  depthExhibit(13, 26, 2, BASE_GENES_A),
  depthExhibit(11, 26, 3, BASE_GENES_A),
  depthExhibit( 9, 26, 4, BASE_GENES_A),
  depthExhibit( 7, 26, 5, BASE_GENES_A),
  depthExhibit( 5, 26, 6, BASE_GENES_A),
  depthExhibit( 3, 26, 7, BASE_GENES_A),
  // Right side (Species B): depth 2 near path → depth 7 at edge
  depthExhibit(18, 26, 2, BASE_GENES_B),
  depthExhibit(20, 26, 3, BASE_GENES_B),
  depthExhibit(22, 26, 4, BASE_GENES_B),
  depthExhibit(24, 26, 5, BASE_GENES_B),
  depthExhibit(26, 26, 6, BASE_GENES_B),
  depthExhibit(28, 26, 7, BASE_GENES_B),
  // Second row: reversed (Species B left, Species A right)
  depthExhibit(13, 27, 2, BASE_GENES_B),
  depthExhibit(11, 27, 3, BASE_GENES_B),
  depthExhibit( 9, 27, 4, BASE_GENES_B),
  depthExhibit( 7, 27, 5, BASE_GENES_B),
  depthExhibit( 5, 27, 6, BASE_GENES_B),
  depthExhibit( 3, 27, 7, BASE_GENES_B),
  depthExhibit(18, 27, 2, BASE_GENES_A),
  depthExhibit(20, 27, 3, BASE_GENES_A),
  depthExhibit(22, 27, 4, BASE_GENES_A),
  depthExhibit(24, 27, 5, BASE_GENES_A),
  depthExhibit(26, 27, 6, BASE_GENES_A),
  depthExhibit(28, 27, 7, BASE_GENES_A),

  // ── Zone 2: Symmetry — different symmetry types ───────────
  // Row 30: Left-right symmetry (the default — shown at various depths)
  { col: 11, row: 30, label: 'Left-Right', spec: { mode: 2, genes: [-1,3,-1,-1,2,2,2,3,5], symmetry: 'left-right' } },
  { col: 13, row: 30, label: 'Left-Right', spec: { mode: 2, genes: [2,-1,2,1,-2,1,-2,-1,6], symmetry: 'left-right' } },
  { col: 18, row: 30, label: 'Up-Down', spec: { mode: 2, genes: [-1,3,-1,-1,2,2,2,3,5], symmetry: 'up-down' } },
  { col: 20, row: 30, label: 'Up-Down', spec: { mode: 2, genes: [2,-1,2,1,-2,1,-2,-1,6], symmetry: 'up-down' } },
  // Row 31: Four-way radial and Asymmetric
  { col: 11, row: 31, label: 'Four-Way', spec: { mode: 2, genes: [-1,3,-1,-1,2,2,2,3,5], symmetry: 'four-way' } },
  { col: 13, row: 31, label: 'Four-Way', spec: { mode: 2, genes: [2,-1,2,1,-2,1,-2,-1,6], symmetry: 'four-way' } },
  { col: 18, row: 31, label: 'Asymmetric', spec: { mode: 2, genes: [-1,3,-1,-1,2,2,2,3,5], symmetry: 'asymmetric' } },
  { col: 20, row: 31, label: 'Asymmetric', spec: { mode: 2, genes: [2,-1,2,1,-2,1,-2,-1,6], symmetry: 'asymmetric' } },

  // ── Zone 3: Segmentation — varying segment count ──────────
  // Same base genes, adding segments. segs gene[9], segDist gene[10]
  { col: 11, row: 34, label: '1 Segment',  spec: { mode: 3, genes: [-1,3,-1,-1,2,2,2,3,5, 1,4] } },
  { col:  9, row: 34, label: '2 Segments', spec: { mode: 3, genes: [-1,3,-1,-1,2,2,2,3,5, 2,5] } },
  { col:  7, row: 34, label: '3 Segments', spec: { mode: 3, genes: [-1,3,-1,-1,2,2,2,3,5, 3,5] } },
  { col:  5, row: 34, label: '5 Segments', spec: { mode: 3, genes: [-1,3,-1,-1,2,2,2,3,5, 5,4] } },
  { col: 20, row: 34, label: '1 Segment',  spec: { mode: 3, genes: [2,-1,2,1,-2,1,-2,-1,6, 1,4] } },
  { col: 22, row: 34, label: '2 Segments', spec: { mode: 3, genes: [2,-1,2,1,-2,1,-2,-1,6, 2,5] } },
  { col: 24, row: 34, label: '3 Segments', spec: { mode: 3, genes: [2,-1,2,1,-2,1,-2,-1,6, 3,5] } },
  { col: 26, row: 34, label: '5 Segments', spec: { mode: 3, genes: [2,-1,2,1,-2,1,-2,-1,6, 5,4] } },
  // Row 35: varying segment distance
  { col: 11, row: 35, label: 'Close',  spec: { mode: 3, genes: [-1,3,-1,-1,2,2,2,3,5, 3,2] } },
  { col:  9, row: 35, label: 'Medium', spec: { mode: 3, genes: [-1,3,-1,-1,2,2,2,3,5, 3,5] } },
  { col:  7, row: 35, label: 'Spread', spec: { mode: 3, genes: [-1,3,-1,-1,2,2,2,3,5, 3,9] } },
  { col: 20, row: 35, label: 'Close',  spec: { mode: 3, genes: [2,-1,2,1,-2,1,-2,-1,6, 3,2] } },
  { col: 22, row: 35, label: 'Medium', spec: { mode: 3, genes: [2,-1,2,1,-2,1,-2,-1,6, 3,5] } },
  { col: 24, row: 35, label: 'Spread', spec: { mode: 3, genes: [2,-1,2,1,-2,1,-2,-1,6, 3,9] } },

  // ── Zone 4: Full Dawkins — gradients + combined features ──
  // Showpieces with gradient genes (grad1=gene[11], grad2=gene[12])
  { col: 11, row: 38, label: 'No Gradient',   spec: { mode: 5, genes: [-1,3,-1,-1,2,2,2,3,5, 3,5, 0,0] } },
  { col:  9, row: 38, label: 'Taper In',      spec: { mode: 5, genes: [-1,3,-1,-1,2,2,2,3,5, 3,5, 2,0] } },
  { col:  7, row: 38, label: 'Taper Out',     spec: { mode: 5, genes: [-1,3,-1,-1,2,2,2,3,5, 3,5, -2,0] } },
  { col:  5, row: 38, label: 'Double Grad',   spec: { mode: 5, genes: [-1,3,-1,-1,2,2,2,3,5, 3,5, 2,2] } },
  { col: 20, row: 38, label: 'No Gradient',   spec: { mode: 5, genes: [2,-1,2,1,-2,1,-2,-1,5, 3,5, 0,0] } },
  { col: 22, row: 38, label: 'Taper In',      spec: { mode: 5, genes: [2,-1,2,1,-2,1,-2,-1,5, 3,5, 2,0] } },
  { col: 24, row: 38, label: 'Taper Out',     spec: { mode: 5, genes: [2,-1,2,1,-2,1,-2,-1,5, 3,5, -2,0] } },
  { col: 26, row: 38, label: 'Double Grad',   spec: { mode: 5, genes: [2,-1,2,1,-2,1,-2,-1,5, 3,5, 2,2] } },
];

// Legacy NPC garden plots — kept for backward compat with NPC curate task
export const GARDEN_PLOTS = {
  fern: [],
  moss: [],
};

export function createWorld() {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(TILE.GRASS));

  // Water border
  for (let x = 0; x < COLS; x++) { grid[0][x] = TILE.WATER; grid[ROWS - 1][x] = TILE.WATER; }
  for (let y = 0; y < ROWS; y++) { grid[y][0] = TILE.WATER; grid[y][COLS - 1] = TILE.WATER; }

  // Central vertical path (cols 15-16) — runs full height
  for (let y = 1; y < ROWS - 1; y++) { grid[y][15] = TILE.PATH; grid[y][16] = TILE.PATH; }

  // Horizontal paths (rows 6, 16 — original town)
  for (let x = 1; x < COLS - 1; x++) { grid[6][x] = TILE.PATH; grid[16][x] = TILE.PATH; }

  // Horizontal paths at zone boundaries — wide enough to reach outer exhibits
  for (let x = 2; x < 30; x++) { grid[25][x] = TILE.PATH; } // Zone 1: Basic Forms
  for (let x = 2; x < 30; x++) { grid[26][x] = TILE.PATH; } // walkway between exhibit rows
  for (let x = 10; x < 22; x++) { grid[29][x] = TILE.PATH; } // Zone 2: Symmetry
  for (let x = 4; x < 28; x++) { grid[33][x] = TILE.PATH; } // Zone 3: Segmentation
  for (let x = 4; x < 28; x++) { grid[37][x] = TILE.PATH; } // Zone 4: Full Dawkins

  // Buildings
  for (const b of BUILDINGS) {
    for (let dy = 0; dy < b.h; dy++)
      for (let dx = 0; dx < b.w; dx++)
        grid[b.y + dy][b.x + dx] = TILE.BUILDING;
  }

  // Pre-plow additional NPC farm plots
  grid[9][9] = TILE.DIRT;  grid[10][9] = TILE.DIRT;   // Fern's extra plots
  grid[9][24] = TILE.DIRT;  grid[10][24] = TILE.DIRT;  // Moss's extra plots

  // Trees
  for (const [tx, ty] of TREES) {
    if (grid[ty][tx] === TILE.GRASS) grid[ty][tx] = TILE.TREE;
  }

  // Pond
  for (let dy = 0; dy < POND.h; dy++)
    for (let dx = 0; dx < POND.w; dx++)
      grid[POND.y + dy][POND.x + dx] = TILE.WATER;

  // Exhibit dirt tiles
  for (const ex of EXHIBITS) {
    if (grid[ex.row][ex.col] === TILE.GRASS || grid[ex.row][ex.col] === TILE.PATH) {
      grid[ex.row][ex.col] = TILE.DIRT;
    }
  }

  return grid;
}

export function tileAt(grid, col, row) {
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return TILE.WATER;
  return grid[row][col];
}

export function createSandboxWorld(cols, rows) {
  const grid = Array.from({ length: rows }, () => new Array(cols).fill(TILE.GRASS));
  for (let x = 0; x < cols; x++) { grid[0][x] = TILE.WATER; grid[rows - 1][x] = TILE.WATER; }
  for (let y = 0; y < rows; y++) { grid[y][0] = TILE.WATER; grid[y][cols - 1] = TILE.WATER; }
  return grid;
}

export function isSolid(tile) {
  return tile === TILE.WATER || tile === TILE.BUILDING || tile === TILE.TREE || tile === TILE.FENCE;
}

export function nearbyBuilding(px, py) {
  const col = Math.floor(px / TILE_SIZE);
  const row = Math.floor(py / TILE_SIZE);
  for (const b of BUILDINGS) {
    if (col >= b.x - 1 && col <= b.x + b.w && row >= b.y - 1 && row <= b.y + b.h) {
      return b;
    }
  }
  return null;
}

export function buildingDoorPos(building) {
  const cx = (building.x + building.w / 2) * TILE_SIZE;
  if (building.doorSide === 'top') {
    return { x: cx, y: building.y * TILE_SIZE - TILE_SIZE * 0.5 };
  }
  return { x: cx, y: (building.y + building.h) * TILE_SIZE + TILE_SIZE * 0.5 };
}
