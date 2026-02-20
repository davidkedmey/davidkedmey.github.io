// Planet world renderer — circular disc, biome regions, creature sprites, hit testing

import { getSprite } from '../colony/landscape.js';
import { BIOMES, BIOME_SECTORS } from './biomes.js';

const SPRITE_SIZE = 20;

export function createWorld(canvas) {
  const ctx = canvas.getContext('2d');
  let W, H, dpr;
  let cx, cy, R; // planet disc center and radius
  let allCreatures = []; // flat list of all creatures across biomes
  let biomeStates = new Map();
  let hoveredBiome = null;
  let hoveredCreature = null;
  let selectedCreature = null;

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
    cx = W / 2;
    cy = H / 2;
    R = Math.min(W, H) / 2 * 0.85;
  }

  // ── Biome-local coords → canvas pixel ──

  function biomeToCanvas(biomeId, lx, ly) {
    const sector = BIOME_SECTORS[biomeId];

    if (sector.type === 'center') {
      // Map (0-1, 0-1) into a circle of radius maxR * R
      const r = sector.maxR * R;
      // Use a square-to-disc mapping
      const dx = (lx - 0.5) * 2 * r * 0.85;
      const dy = (ly - 0.5) * 2 * r * 0.85;
      return { px: cx + dx, py: cy + dy };
    }

    // Arc sector
    const { startAngle, endAngle, minR, maxR } = sector;
    // lx → angle within the sector, ly → radial distance
    const angle = startAngle + lx * (endAngle - startAngle);
    const rDist = (minR + ly * (maxR - minR) * 0.9 + 0.05) * R;
    return {
      px: cx + Math.cos(angle) * rDist,
      py: cy + Math.sin(angle) * rDist,
    };
  }

  // ── Rendering ──

  function render(interpFraction) {
    if (!W) return;
    const f = interpFraction || 0;

    // Dark background
    ctx.fillStyle = '#0a0e14';
    ctx.fillRect(0, 0, W, H);

    // Clip to planet disc
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // Draw biome regions
    drawBiomeRegions();

    // Draw creatures
    drawCreatures(f);

    ctx.restore();

    // Planet border
    ctx.strokeStyle = '#2a3444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.stroke();

    // Biome labels (outside clip)
    drawBiomeLabels();
  }

  function drawBiomeRegions() {
    // Shallows (center circle)
    const shR = BIOME_SECTORS.shallows.maxR * R;
    const shGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, shR);
    const shColor = hoveredBiome === 'shallows' ? BIOMES.shallows.colorLight : BIOMES.shallows.color;
    shGrad.addColorStop(0, shColor);
    shGrad.addColorStop(1, adjustAlpha(shColor, 0.8));
    ctx.fillStyle = shGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, shR, 0, Math.PI * 2);
    ctx.fill();

    // Outer biome arcs
    for (const id of ['canopy', 'steppe', 'depths', 'fringe']) {
      const sector = BIOME_SECTORS[id];
      const biome = BIOMES[id];
      const color = hoveredBiome === id ? biome.colorLight : biome.color;

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, R, sector.startAngle, sector.endAngle);
      ctx.arc(cx, cy, shR, sector.endAngle, sector.startAngle, true);
      ctx.closePath();
      ctx.fill();

      // Subtle separator line
      ctx.strokeStyle = '#1a2434';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(sector.startAngle) * shR, cy + Math.sin(sector.startAngle) * shR);
      ctx.lineTo(cx + Math.cos(sector.startAngle) * R, cy + Math.sin(sector.startAngle) * R);
      ctx.stroke();
    }

    // Shallows border ring
    ctx.strokeStyle = '#1a2434';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, shR, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawCreatures(f) {
    const half = SPRITE_SIZE / 2;
    for (const c of allCreatures) {
      const lx = c.prevX + (c.x - c.prevX) * f;
      const ly = c.prevY + (c.y - c.prevY) * f;
      const { px, py } = biomeToCanvas(c.biomeId, lx, ly);

      // Check if inside planet disc
      const dist = Math.hypot(px - cx, py - cy);
      if (dist > R + half) continue;

      const sprite = getSprite(c.genes, SPRITE_SIZE);

      // Selection highlight
      if (selectedCreature && c.id === selectedCreature.id) {
        ctx.strokeStyle = '#c8e6c8';
        ctx.lineWidth = 2;
        ctx.strokeRect(px - half - 2, py - half - 2, SPRITE_SIZE + 4, SPRITE_SIZE + 4);
      }
      // Hover highlight
      if (hoveredCreature && c.id === hoveredCreature.id && (!selectedCreature || c.id !== selectedCreature.id)) {
        ctx.strokeStyle = '#4a5a6a';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - half - 1, py - half - 1, SPRITE_SIZE + 2, SPRITE_SIZE + 2);
      }

      ctx.drawImage(sprite, px - half, py - half);
    }
  }

  function drawBiomeLabels() {
    ctx.font = '600 0.65rem monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4a5a6a';

    // Shallows label at center
    ctx.fillText('Shallows', cx, cy - BIOME_SECTORS.shallows.maxR * R * 0.65);

    // Arc biome labels at midpoints
    const labelR = (BIOME_SECTORS.canopy.minR + 1.0) / 2 * R;
    for (const id of ['canopy', 'steppe', 'depths', 'fringe']) {
      const sector = BIOME_SECTORS[id];
      const midAngle = (sector.startAngle + sector.endAngle) / 2;
      const lx = cx + Math.cos(midAngle) * labelR;
      const ly = cy + Math.sin(midAngle) * labelR;
      ctx.fillText(BIOMES[id].name, lx, ly);
    }
  }

  // ── Hit testing ──

  function hitTestBiome(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const dx = mx - cx;
    const dy = my - cy;
    const dist = Math.hypot(dx, dy);

    if (dist > R) return null;

    // Check if in shallows
    if (dist < BIOME_SECTORS.shallows.maxR * R) return 'shallows';

    // Determine angle
    let angle = Math.atan2(dy, dx);
    // Normalize to match sector conventions
    if (angle < -Math.PI / 4) angle += Math.PI * 2;

    for (const id of ['canopy', 'steppe', 'depths', 'fringe']) {
      const sector = BIOME_SECTORS[id];
      let sa = sector.startAngle;
      let ea = sector.endAngle;
      if (sa < -Math.PI / 4) sa += Math.PI * 2;
      if (ea < -Math.PI / 4) ea += Math.PI * 2;
      if (angle >= sa && angle < ea) return id;
    }
    return null;
  }

  function hitTestCreature(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    const half = SPRITE_SIZE / 2;

    let closest = null;
    let closestDist = half;

    for (const c of allCreatures) {
      const { px, py } = biomeToCanvas(c.biomeId, c.x, c.y);
      const d = Math.hypot(px - mx, py - my);
      if (d < closestDist) {
        closestDist = d;
        closest = c;
      }
    }
    return closest;
  }

  // ── State management ──

  function updateCreatures(states) {
    biomeStates = states;
    allCreatures = [];
    for (const [, state] of states) {
      allCreatures.push(...state.population);
    }
  }

  function adjustAlpha(hex, alpha) {
    // Simple: just return the hex (we use solid fills for performance)
    return hex;
  }

  resize();
  window.addEventListener('resize', resize);

  return {
    render,
    resize,
    hitTestBiome,
    hitTestCreature,
    updateCreatures,
    biomeToCanvas,
    set hoveredBiome(id) { hoveredBiome = id; },
    get hoveredBiome() { return hoveredBiome; },
    set hoveredCreature(c) { hoveredCreature = c; },
    set selectedCreature(c) { selectedCreature = c; },
    get selectedCreature() { return selectedCreature; },
    get allCreatures() { return allCreatures; },
  };
}
