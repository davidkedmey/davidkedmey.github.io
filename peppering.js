/**
 * Mode 0: Pixel Peppering — Dawkins' "naive" baseline (p.204-205)
 *
 * Random pixels on a 16×16 grid. No constrained embryology.
 * Demonstrates that without embryological structure,
 * cumulative selection is impotent.
 */

const GRID_SIZE = 16;

function pepperingRandomGenotype() {
  const grid = new Uint8Array(GRID_SIZE * GRID_SIZE);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = Math.random() < 0.5 ? 1 : 0;
  }
  return grid;
}

function pepperingOriginGenotype() {
  return new Uint8Array(GRID_SIZE * GRID_SIZE); // all black
}

function pepperingMutate(grid) {
  const child = new Uint8Array(grid);
  const flips = 1 + Math.floor(Math.random() * 3); // flip 1-3 pixels
  for (let f = 0; f < flips; f++) {
    const i = Math.floor(Math.random() * child.length);
    child[i] = child[i] ? 0 : 1;
  }
  return child;
}

function renderPeppering(canvas, grid) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cellW = w / GRID_SIZE;
  const cellH = h / GRID_SIZE;

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      const idx = row * GRID_SIZE + col;
      ctx.fillStyle = grid[idx] ? '#58a6ff' : '#161b22';
      ctx.fillRect(col * cellW, row * cellH, cellW - 0.5, cellH - 0.5);
    }
  }
}

function pepperingFormatGenes(grid) {
  const on = Array.from(grid).reduce((s, v) => s + v, 0);
  return `${on}/${grid.length} pixels on`;
}
