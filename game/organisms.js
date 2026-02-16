// Organism data, growth, lifecycle, sprite caching

import { drawTree, randomInteresting, mutate, cloneGenes, MODE_CONFIGS } from '../shared/genotype.js';
import { TILE_SIZE } from './world.js';
import { generateName } from './naming.js';

const SPRITE_SIZE = 44;
const spriteCache = new Map();

let nextId = 1;

// ── Farm genes ──────────────────────────────────────────────
// Separate from structural genes — game-only traits that affect farming.
// Mutate and crossover independently, just like color genes.

export function randomFarmGenes() {
  return {
    fertility: 1 + Math.floor(Math.random() * 4), // 1-4: seeds on harvest
    longevity: 1 + Math.floor(Math.random() * 3), // 1-3: harvests before death
    vigor:     1 + Math.floor(Math.random() * 3), // 1-3: growth speed
  };
}

export function mutateFarmGenes(fg) {
  const child = { fertility: fg.fertility, longevity: fg.longevity, vigor: fg.vigor };
  // Mutate one random farm gene ±1
  const r = Math.random();
  if (r < 0.33) {
    child.fertility = clamp(child.fertility + (Math.random() < 0.5 ? 1 : -1), 1, 4);
  } else if (r < 0.66) {
    child.longevity = clamp(child.longevity + (Math.random() < 0.5 ? 1 : -1), 1, 3);
  } else {
    child.vigor = clamp(child.vigor + (Math.random() < 0.5 ? 1 : -1), 1, 3);
  }
  return child;
}

export function crossoverFarmGenes(fg1, fg2) {
  return {
    fertility: Math.random() < 0.5 ? fg1.fertility : fg2.fertility,
    longevity: Math.random() < 0.5 ? fg1.longevity : fg2.longevity,
    vigor:     Math.random() < 0.5 ? fg1.vigor     : fg2.vigor,
  };
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ── Organism creation ───────────────────────────────────────

export function createOrganism(genes, mode, colorGenes, farmGenes) {
  const fg = farmGenes || randomFarmGenes();
  const cg = colorGenes || randomColorGenes();
  const vigorMultiplier = fg.vigor === 1 ? 1.5 : fg.vigor === 3 ? 0.5 : 1;
  return {
    kind: 'organism',
    id: nextId++,
    genes: genes,
    mode: mode,
    colorGenes: cg,
    farmGenes: fg,
    nickname: generateName(genes, mode, cg),
    stage: 'seed',           // seed → growing → mature
    growthProgress: 0,
    matureDays: Math.max(1, Math.ceil(genes[8] / 2 * vigorMultiplier)),
    harvestsLeft: fg.longevity,  // counts down per harvest
    plantedDay: null,
    tileCol: null,
    tileRow: null,
  };
}

export function randomColorGenes() {
  return {
    hue: Math.floor(Math.random() * 12),
    spread: Math.floor(Math.random() * 13) - 6,
  };
}

export function createSeed(mode) {
  const genes = randomInteresting(mode);
  return createOrganism(genes, mode);
}

// ── Growth ──────────────────────────────────────────────────

export function tickGrowth(organisms, currentDay) {
  for (const org of organisms) {
    if (org.stage === 'seed' && org.plantedDay !== null) {
      org.stage = 'growing';
    }
    if (org.stage === 'growing' && org.plantedDay !== null) {
      org.growthProgress = currentDay - org.plantedDay;
      if (org.growthProgress >= org.matureDays) {
        org.growthProgress = org.matureDays;
        org.stage = 'mature';
      }
    }
  }
}

function visibleDepth(org) {
  // Items in inventory (not planted) always show at full depth
  // so you can preview what seeds will grow into
  if (org.tileCol == null && org.tileRow == null) return org.genes[8];
  if (org.stage === 'seed') return 0;
  const maxDepth = org.genes[8];
  if (org.stage === 'mature') return maxDepth;
  const ratio = org.growthProgress / org.matureDays;
  return Math.max(1, Math.ceil(maxDepth * ratio));
}

// ── Harvest ─────────────────────────────────────────────────
// Returns { harvested, seeds, plantDied }
// If longevity > 1, the plant stays in the ground and regrows.

export function harvest(org) {
  const seeds = [];
  const numSeeds = org.farmGenes.fertility;
  for (let i = 0; i < numSeeds; i++) {
    const childGenes = mutate(org.genes, org.mode, 1);
    const childColor = mutateColor(org.colorGenes);
    const childFarm = mutateFarmGenes(org.farmGenes);
    seeds.push(createOrganism(childGenes, org.mode, childColor, childFarm));
  }

  // Longevity: decrement harvests remaining
  org.harvestsLeft = (org.harvestsLeft || 1) - 1;
  const plantDied = org.harvestsLeft <= 0;

  if (!plantDied) {
    // Regrow: reset to growing stage
    org.stage = 'growing';
    org.plantedDay += org.matureDays; // regrow from current day
    org.growthProgress = 0;
  }

  return { harvested: org, seeds, plantDied };
}

function mutateColor(cGenes) {
  const child = { hue: cGenes.hue, spread: cGenes.spread };
  if (Math.random() < 0.5) {
    child.hue = ((child.hue + (Math.random() < 0.5 ? 1 : -1)) % 12 + 12) % 12;
  } else {
    child.spread = clamp(child.spread + (Math.random() < 0.5 ? 1 : -1), -6, 6);
  }
  return child;
}

// ── Color helper ────────────────────────────────────────────

export function depthToColor(depth, maxDepth, hue, spread) {
  const t = maxDepth > 1 ? (maxDepth - depth) / (maxDepth - 1) : 0;
  const h = ((hue * 30) + spread * 30 * t + 360) % 360;
  const s = 70 + t * 20;
  const l = 55 + t * 15;
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// ── Sprite rendering ────────────────────────────────────────

// Apply symmetry transformation to line segments
function applySymmetry(lines, symType) {
  if (!symType || symType === 'left-right') return lines;
  const result = lines.slice();
  if (symType === 'up-down' || symType === 'four-way') {
    for (const seg of lines) {
      result.push({ x0: seg.x0, y0: -seg.y0, x1: seg.x1, y1: -seg.y1, depth: seg.depth });
    }
  }
  if (symType === 'four-way') {
    const soFar = result.slice();
    for (const seg of soFar) {
      result.push({ x0: -seg.x0, y0: seg.y0, x1: -seg.x1, y1: seg.y1, depth: seg.depth });
    }
  }
  return result;
}

export function getSprite(org, size) {
  size = size || SPRITE_SIZE;
  const depth = visibleDepth(org);
  const sym = org.symmetry || 'left-right';
  const key = `${org.id}-${depth}-${size}-${sym}`;

  if (spriteCache.has(key)) return spriteCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  if (depth === 0) {
    const sctx = canvas.getContext('2d');
    sctx.fillStyle = depthToColor(1, org.genes[8], org.colorGenes.hue, org.colorGenes.spread);
    sctx.beginPath();
    sctx.arc(size / 2, size / 2, 4, 0, Math.PI * 2);
    sctx.fill();
    spriteCache.set(key, canvas);
    return canvas;
  }

  const allLines = drawTree(org.genes);
  const filtered = allLines.filter(l => l.depth > org.genes[8] - depth);
  const lines = applySymmetry(filtered, sym);

  if (lines.length === 0) {
    spriteCache.set(key, canvas);
    return canvas;
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of lines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const padding = 4;
  const scale = Math.min((size - padding * 2) / bw, (size - padding * 2) / bh);
  const cx = size / 2;
  const cy = size / 2;
  const offsetX = (minX + maxX) / 2;
  const offsetY = (minY + maxY) / 2;

  const sctx = canvas.getContext('2d');
  const maxDepth = Math.max(...lines.map(s => s.depth));

  const byDepth = new Map();
  for (const seg of lines) {
    if (!byDepth.has(seg.depth)) byDepth.set(seg.depth, []);
    byDepth.get(seg.depth).push(seg);
  }

  sctx.lineWidth = Math.max(1, 1.5 * (size / SPRITE_SIZE));
  sctx.lineCap = 'round';

  for (const [d, segs] of byDepth) {
    sctx.strokeStyle = depthToColor(d, maxDepth, org.colorGenes.hue, org.colorGenes.spread);
    sctx.beginPath();
    for (const seg of segs) {
      sctx.moveTo(cx + (seg.x0 - offsetX) * scale, cy + (seg.y0 - offsetY) * scale);
      sctx.lineTo(cx + (seg.x1 - offsetX) * scale, cy + (seg.y1 - offsetY) * scale);
    }
    sctx.stroke();
  }

  spriteCache.set(key, canvas);
  return canvas;
}

export function clearSpriteCache() {
  spriteCache.clear();
}
