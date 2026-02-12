/**
 * Dawkins' Biomorphs — faithful to "The Evolution of Evolvability" (1988)
 *
 * Genotype: 9 integer genes
 *   g1–g8: range [-3, 3]  — control the 8 direction vectors
 *   g9:    range [1, 8]    — recursion depth
 *
 * DefineVectors(g1..g8) → 8 two-dimensional vectors:
 *   v1 = (-g3, g7)    v5 = (g1, g5)
 *   v2 = (-g2, g6)    v6 = (g2, g6)
 *   v3 = (-g1, g5)    v7 = (g3, g7)
 *   v4 = (0,   g4)    v8 = (0,  g8)
 *
 * DrawBiomorph(i, c, x0, y0):
 *   if i == 0 then i = 8; if i == 9 then i = 1
 *   (xNew, yNew) = (x0, y0) + c * v[i]
 *   draw line from (x0,y0) to (xNew,yNew)
 *   if c > 1:
 *     DrawBiomorph(i-1, c-1, xNew, yNew)
 *     DrawBiomorph(i+1, c-1, xNew, yNew)
 *
 * Initial call: DrawBiomorph(4, g9, 0, 0)
 *
 * Mutation: a single gene changes by +1 or -1, clamped to its range.
 */

// ── Gene ranges ──────────────────────────────────────────────
const GENE_MIN = [-3, -3, -3, -3, -3, -3, -3, -3, 1]; // g1..g8 min=-3, g9 min=1
const GENE_MAX = [ 3,  3,  3,  3,  3,  3,  3,  3, 8]; // g1..g8 max=3,  g9 max=8

const NUM_OFFSPRING = 8;

// ── Genotype helpers ─────────────────────────────────────────

function randomGene(i) {
  return GENE_MIN[i] + Math.floor(Math.random() * (GENE_MAX[i] - GENE_MIN[i] + 1));
}

function randomGenotype() {
  return Array.from({ length: 9 }, (_, i) => randomGene(i));
}

/** The "origin" biomorph — all vector genes 0, depth 1 */
function originGenotype() {
  return [0, 0, 0, 0, 0, 0, 0, 0, 1];
}

function cloneGenes(genes) {
  return genes.slice();
}

/**
 * Mutate: pick one random gene, change it by +1 or -1, clamped.
 */
function mutate(genes) {
  const child = cloneGenes(genes);
  const i = Math.floor(Math.random() * 9);
  const delta = Math.random() < 0.5 ? -1 : 1;
  child[i] = Math.max(GENE_MIN[i], Math.min(GENE_MAX[i], child[i] + delta));
  return child;
}

// ── DefineVectors ────────────────────────────────────────────

/**
 * Returns vectors v[1]..v[8] (1-indexed) from genes g1..g8 (0-indexed in array).
 * Each vector is [dx, dy].
 */
function defineVectors(genes) {
  const [g1, g2, g3, g4, g5, g6, g7, g8] = genes;
  // v[0] is unused; v[1]..v[8] correspond to directions 1–8
  return [
    null,          // placeholder for index 0
    [-g3,  g7],    // v1
    [-g2,  g6],    // v2
    [-g1,  g5],    // v3
    [  0,  g4],    // v4
    [ g1,  g5],    // v5
    [ g2,  g6],    // v6
    [ g3,  g7],    // v7
    [  0,  g8],    // v8
  ];
}

// ── DrawBiomorph ─────────────────────────────────────────────

/**
 * Recursively draw the biomorph, collecting line segments.
 * Returns an array of {x0, y0, x1, y1} objects.
 */
function drawBiomorph(genes) {
  const vectors = defineVectors(genes);
  const depth = genes[8]; // g9
  const lines = [];

  function recurse(i, c, x0, y0) {
    // Wrap direction index
    if (i === 0) i = 8;
    else if (i === 9) i = 1;

    const v = vectors[i];
    const x1 = x0 + c * v[0];
    const y1 = y0 + c * v[1];

    lines.push({ x0, y0, x1, y1 });

    if (c > 1) {
      recurse(i - 1, c - 1, x1, y1);
      recurse(i + 1, c - 1, x1, y1);
    }
  }

  recurse(4, depth, 0, 0);
  return lines;
}

// ── Rendering ────────────────────────────────────────────────

/**
 * Render a biomorph's genes onto a canvas, auto-scaling to fit.
 */
function renderBiomorph(canvas, genes) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const lines = drawBiomorph(genes);
  if (lines.length === 0) return;

  // Find bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of lines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const padding = 20;
  const scale = Math.min((w - padding * 2) / bw, (h - padding * 2) / bh);
  const cx = w / 2;
  const cy = h / 2;
  const offsetX = (minX + maxX) / 2;
  const offsetY = (minY + maxY) / 2;

  ctx.strokeStyle = '#e6edf3';
  ctx.lineWidth = 1.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const seg of lines) {
    const sx = cx + (seg.x0 - offsetX) * scale;
    const sy = cy + (seg.y0 - offsetY) * scale;
    const ex = cx + (seg.x1 - offsetX) * scale;
    const ey = cy + (seg.y1 - offsetY) * scale;
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
  }
  ctx.stroke();
}

// ── UI ───────────────────────────────────────────────────────

let parentGenes = originGenotype();
let generation = 0;

const parentCanvas = document.getElementById('parent');
const geneDisplay = document.getElementById('gene-display');
const offspringGrid = document.getElementById('offspring-grid');
const genCounter = document.getElementById('generation-counter');

function formatGenes(genes) {
  return genes.map((g, i) => `g${i + 1}=${g}`).join('  ');
}

function updateParent() {
  renderBiomorph(parentCanvas, parentGenes);
  geneDisplay.textContent = formatGenes(parentGenes);
  genCounter.textContent = `Generation: ${generation}`;
}

function spawnOffspring() {
  offspringGrid.innerHTML = '';

  for (let i = 0; i < NUM_OFFSPRING; i++) {
    const childGenes = mutate(parentGenes);
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    offspringGrid.appendChild(canvas);
    renderBiomorph(canvas, childGenes);

    // Click to select as new parent
    canvas.addEventListener('click', () => {
      parentGenes = childGenes;
      generation++;
      updateParent();
      spawnOffspring();
    });
  }
}

// Buttons
document.getElementById('btn-random').addEventListener('click', () => {
  parentGenes = randomGenotype();
  generation = 0;
  updateParent();
  spawnOffspring();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  parentGenes = originGenotype();
  generation = 0;
  updateParent();
  spawnOffspring();
});

// Init
updateParent();
spawnOffspring();
