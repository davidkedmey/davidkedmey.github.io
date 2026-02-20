// Colony landscape — canvas renderer with sprite cache and hit detection

import { drawTree } from '../shared/genotype.js';

const SPRITE_SIZE = 32;
const spriteCache = new Map();

// ── Sprite rendering ──

function geneKey(genes) {
  return genes.join(',');
}

function depthToColor(d, maxD) {
  // Green-teal palette, lighter at tips
  const t = maxD > 1 ? (d - 1) / (maxD - 1) : 0;
  const r = Math.round(60 + t * 80);
  const g = Math.round(160 + t * 80);
  const b = Math.round(100 + t * 100);
  return `rgb(${r},${g},${b})`;
}

export function getSprite(genes, size) {
  size = size || SPRITE_SIZE;
  const key = geneKey(genes) + '-' + size;
  if (spriteCache.has(key)) return spriteCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const allLines = drawTree(genes);
  if (allLines.length === 0) {
    spriteCache.set(key, canvas);
    return canvas;
  }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of allLines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const padding = 2;
  const scale = Math.min((size - padding * 2) / bw, (size - padding * 2) / bh);
  const cx = size / 2;
  const cy = size / 2;
  const offsetX = (minX + maxX) / 2;
  const offsetY = (minY + maxY) / 2;

  const sctx = canvas.getContext('2d');
  const maxDepth = Math.max(...allLines.map(s => s.depth));

  // Batch by depth for color
  const byDepth = new Map();
  for (const seg of allLines) {
    if (!byDepth.has(seg.depth)) byDepth.set(seg.depth, []);
    byDepth.get(seg.depth).push(seg);
  }

  sctx.lineWidth = Math.max(1, 1.5 * (size / SPRITE_SIZE));
  sctx.lineCap = 'round';

  for (const [d, segs] of byDepth) {
    sctx.strokeStyle = depthToColor(d, maxDepth);
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

// ── Landscape renderer ──

export function createLandscape(canvas) {
  const ctx = canvas.getContext('2d');
  let W, H, dpr;
  let creatures = [];
  let selectedId = null;
  let hoveredId = null;

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width;
    H = rect.height;
  }

  function render(interpFraction) {
    if (!W) return;
    // Dark background with subtle gradient
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, W, H);

    // Subtle radial glow in center
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6);
    grad.addColorStop(0, '#0f1520');
    grad.addColorStop(1, '#0a0e14');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    const f = interpFraction || 0;

    for (const c of creatures) {
      // Interpolate position for smooth movement
      const px = (c.prevX + (c.x - c.prevX) * f) * W;
      const py = (c.prevY + (c.y - c.prevY) * f) * H;

      const sprite = getSprite(c.genes, SPRITE_SIZE);
      const half = SPRITE_SIZE / 2;

      // Selection highlight
      if (c.id === selectedId) {
        ctx.strokeStyle = '#c8e6c8';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - half - 3, py - half - 3, SPRITE_SIZE + 6, SPRITE_SIZE + 6);
      }
      // Hover highlight
      if (c.id === hoveredId && c.id !== selectedId) {
        ctx.strokeStyle = '#4a5a6a';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - half - 2, py - half - 2, SPRITE_SIZE + 4, SPRITE_SIZE + 4);
      }

      ctx.drawImage(sprite, px - half, py - half);
    }
  }

  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const half = SPRITE_SIZE / 2;
    let closest = null;
    let closestDist = half + 4;

    for (const c of creatures) {
      const px = c.x * W;
      const py = c.y * H;
      const dist = Math.hypot(px - mx, py - my);
      if (dist < closestDist) {
        closestDist = dist;
        closest = c;
      }
    }
    return closest;
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    render,
    resize,
    hitTest,
    setCreatures(list) { creatures = list; },
    set selectedId(id) { selectedId = id; },
    get selectedId() { return selectedId; },
    set hoveredId(id) { hoveredId = id; },
  };
}
