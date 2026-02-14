// World grid, tile types, layout, collision

export const TILE = { GRASS: 0, DIRT: 1, PATH: 2, WATER: 3, BUILDING: 4, TREE: 5, FENCE: 6 };
export const COLS = 32;
export const ROWS = 24;
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
  // Lower left grove
  [1,21],[2,21],[1,22],[6,21],[7,21],[6,22],
  // Lower right grove
  [24,21],[25,21],[24,22],[30,21],[30,22],[29,21],
  // Scattered mid-area trees
  [11,3],
  [10,20],[11,20],[20,20],[21,20],
  // Near pond
  [11,14],[14,14],[11,17],[14,17],
];

// Pond position (interior water)
const POND = { x: 12, y: 15, w: 2, h: 2 };

export function createWorld() {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(TILE.GRASS));

  // Water border
  for (let x = 0; x < COLS; x++) { grid[0][x] = TILE.WATER; grid[ROWS - 1][x] = TILE.WATER; }
  for (let y = 0; y < ROWS; y++) { grid[y][0] = TILE.WATER; grid[y][COLS - 1] = TILE.WATER; }

  // Central vertical path (cols 15-16)
  for (let y = 1; y < ROWS - 1; y++) { grid[y][15] = TILE.PATH; grid[y][16] = TILE.PATH; }

  // Horizontal paths (rows 6 and 16)
  for (let x = 1; x < COLS - 1; x++) { grid[6][x] = TILE.PATH; grid[16][x] = TILE.PATH; }

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

  return grid;
}

export function tileAt(grid, col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return TILE.WATER;
  return grid[row][col];
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
