// Morphospace map — canvas visualization with fog of war
// X axis: average gene extremity (0-9), Y axis: depth (1-8)

import { RARITY_COLORS, morphospaceCoords, morphospaceJitter } from './registry.js';

const FOG_CLEAR_RADIUS = 0.08; // fraction of canvas size

export function createMap(canvas) {
  const ctx = canvas.getContext('2d');
  let entries = [];     // [{ genes, mode, rarity, discoverer, hash }]
  let pulses = [];      // [{ x, y, color, startTime }]
  let hoveredEntry = null;
  let onEntryClick = null;
  let onEntryHover = null;

  // Fog canvas (offscreen) — drawn once per update, composited onto main
  const fogCanvas = document.createElement('canvas');
  const fogCtx = fogCanvas.getContext('2d');

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fogCanvas.width = canvas.width;
    fogCanvas.height = canvas.height;
  }

  // Convert morphospace coords to pixel coords
  function toPixel(mx, my) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pad = 40;
    const px = pad + (mx / 9) * (w - pad * 2);
    const py = pad + ((my - 1) / 7) * (h - pad * 2);
    return { px, py };
  }

  function fromPixel(px, py) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pad = 40;
    const mx = ((px - pad) / (w - pad * 2)) * 9;
    const my = ((py - pad) / (h - pad * 2)) * 7 + 1;
    return { mx, my };
  }

  function updateFog() {
    const dpr = window.devicePixelRatio || 1;
    fogCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;

    // Start with full opaque fog
    fogCtx.fillStyle = 'rgba(10, 14, 20, 0.85)';
    fogCtx.fillRect(0, 0, w, h);

    // Clear circles around discoveries using destination-out
    fogCtx.globalCompositeOperation = 'destination-out';
    const radius = Math.max(w, h) * FOG_CLEAR_RADIUS;

    for (const entry of entries) {
      const coords = morphospaceCoords(entry.genes);
      const jitter = morphospaceJitter(entry.genes, entry.mode);
      const { px, py } = toPixel(coords.x + jitter.jx, coords.y + jitter.jy);

      const grad = fogCtx.createRadialGradient(px, py, 0, px, py, radius);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.6, 'rgba(0,0,0,0.6)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      fogCtx.fillStyle = grad;
      fogCtx.beginPath();
      fogCtx.arc(px, py, radius, 0, Math.PI * 2);
      fogCtx.fill();
    }

    fogCtx.globalCompositeOperation = 'source-over';
  }

  function drawAxes() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const pad = 40;

    ctx.strokeStyle = '#1a2030';
    ctx.lineWidth = 1;

    // Grid lines
    for (let d = 1; d <= 8; d++) {
      const { py } = toPixel(0, d);
      ctx.beginPath();
      ctx.moveTo(pad, py);
      ctx.lineTo(w - pad, py);
      ctx.stroke();
    }
    for (let e = 0; e <= 9; e++) {
      const { px } = toPixel(e, 1);
      ctx.beginPath();
      ctx.moveTo(px, pad);
      ctx.lineTo(px, h - pad);
      ctx.stroke();
    }

    // Labels
    ctx.fillStyle = '#3a4a5a';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'center';
    for (let e = 0; e <= 9; e += 3) {
      const { px } = toPixel(e, 1);
      ctx.fillText(e.toString(), px, h - pad + 14);
    }
    ctx.fillText('Gene Extremity', w / 2, h - 8);

    ctx.textAlign = 'right';
    for (let d = 1; d <= 8; d += 2) {
      const { py } = toPixel(0, d);
      ctx.fillText(`d${d}`, pad - 6, py + 3);
    }
    ctx.save();
    ctx.translate(10, h / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Depth', 0, 0);
    ctx.restore();
  }

  function drawDots() {
    for (const entry of entries) {
      const coords = morphospaceCoords(entry.genes);
      const jitter = morphospaceJitter(entry.genes, entry.mode);
      const { px, py } = toPixel(coords.x + jitter.jx, coords.y + jitter.jy);
      const color = RARITY_COLORS[entry.rarity] || '#aaa';
      const isHovered = entry === hoveredEntry;
      const r = isHovered ? 5 : 3;

      // Glow for rare+
      if (entry.rarity === 'epic' || entry.rarity === 'legendary') {
        ctx.beginPath();
        ctx.arc(px, py, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = color + '30';
        ctx.fill();
      }

      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();

      if (isHovered) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  function drawPulses(now) {
    const alive = [];
    for (const pulse of pulses) {
      const elapsed = now - pulse.startTime;
      if (elapsed > 1500) continue;
      alive.push(pulse);

      const t = elapsed / 1500;
      const scale = 1 + t * 3;
      const alpha = (1 - t) * 0.6;

      ctx.beginPath();
      ctx.arc(pulse.px, pulse.py, 4 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = pulse.color;
      ctx.globalAlpha = alpha;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    pulses = alive;
  }

  function render(now) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    drawAxes();
    drawDots();
    drawPulses(now || performance.now());

    // Fog overlay
    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(fogCanvas, 0, 0);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.restore();
  }

  function setEntries(newEntries) {
    entries = newEntries;
    updateFog();
  }

  function addPulse(genes, mode, rarity) {
    const coords = morphospaceCoords(genes);
    const jitter = morphospaceJitter(genes, mode);
    const { px, py } = toPixel(coords.x + jitter.jx, coords.y + jitter.jy);
    pulses.push({ px, py, color: RARITY_COLORS[rarity] || '#aaa', startTime: performance.now() });
    updateFog();
  }

  // Hit testing
  function hitTest(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left;
    const my = clientY - rect.top;

    let closest = null;
    let closestDist = 12; // max pixel distance for hit

    for (const entry of entries) {
      const coords = morphospaceCoords(entry.genes);
      const jitter = morphospaceJitter(entry.genes, entry.mode);
      const { px, py } = toPixel(coords.x + jitter.jx, coords.y + jitter.jy);
      const dist = Math.hypot(px - mx, py - my);
      if (dist < closestDist) {
        closestDist = dist;
        closest = entry;
      }
    }
    return closest;
  }

  canvas.addEventListener('mousemove', (e) => {
    const entry = hitTest(e.clientX, e.clientY);
    hoveredEntry = entry;
    canvas.style.cursor = entry ? 'pointer' : 'crosshair';
    if (onEntryHover) onEntryHover(entry, e.clientX, e.clientY);
  });

  canvas.addEventListener('click', (e) => {
    const entry = hitTest(e.clientX, e.clientY);
    if (entry && onEntryClick) onEntryClick(entry);
  });

  canvas.addEventListener('mouseleave', () => {
    hoveredEntry = null;
    if (onEntryHover) onEntryHover(null, 0, 0);
  });

  resize();
  window.addEventListener('resize', () => {
    resize();
    updateFog();
  });

  return {
    render,
    resize,
    setEntries,
    addPulse,
    set onClick(fn) { onEntryClick = fn; },
    set onHover(fn) { onEntryHover = fn; },
    get hasPulses() { return pulses.length > 0; },
  };
}
