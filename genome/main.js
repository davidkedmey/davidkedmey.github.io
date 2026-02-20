import {
  MODE_CONFIGS, GENE_TOOLTIPS, drawTree,
  encodeState, decodeState,
  randomInteresting, originGenotype, mutate, adaptGenes,
} from '../shared/genotype.js';

import {
  generateName, getRarityTier, RARITY_COLORS,
} from '../expedition/registry.js';

// ── DOM refs ──

const canvas = document.getElementById('preview-canvas');
const ctx = canvas.getContext('2d');
const genePanel = document.getElementById('gene-panel');
const nameEl = document.getElementById('creature-name');
const metaEl = document.getElementById('header-meta');
const statsEl = document.getElementById('stats-line');
const modeSelect = document.getElementById('mode-select');
const tooltip = document.getElementById('tooltip');
const toast = document.getElementById('toast');

// ── State ──

let mode = 1;
let genes = [];
let generation = 0;
let symmetry = 'left-right';
let sliders = []; // { input, valueEl, index }

// ── Gene grouping ──

const GENE_GROUPS = [
  { label: 'Branch Shape', keys: ['g1', 'g2', 'g3'] },
  { label: 'Branch Height', keys: ['g5', 'g6', 'g7'] },
  { label: 'Stems', keys: ['g4', 'g8'] },
  { label: 'Complexity', keys: ['depth'] },
  { label: 'Body Plan', keys: ['segs', 'segDist'] },
  { label: 'Gradients', keys: ['grad1', 'grad2'] },
];

// ── Init ──

function init() {
  const state = decodeState(location.hash);
  if (state) {
    mode = state.mode;
    genes = state.genes;
    generation = state.generation || 0;
    symmetry = state.symmetry || 'left-right';
  } else {
    mode = 1;
    genes = randomInteresting(1);
  }
  modeSelect.value = mode;
  buildSliders();
  scheduleRender();
  updateMeta();
}

// ── Build slider UI ──

function buildSliders() {
  genePanel.innerHTML = '';
  sliders = [];
  const config = MODE_CONFIGS[mode];

  for (const group of GENE_GROUPS) {
    // Check if any gene in this group exists in current mode
    const activeKeys = group.keys.filter(k => config.geneLabels.includes(k));
    if (activeKeys.length === 0) continue;

    const label = document.createElement('div');
    label.className = 'gene-group-label';
    label.textContent = group.label;
    genePanel.appendChild(label);

    for (const key of activeKeys) {
      const idx = config.geneLabels.indexOf(key);
      if (idx === -1) continue;

      const row = document.createElement('div');
      row.className = 'gene-row';

      const lbl = document.createElement('span');
      lbl.className = 'gene-label';
      lbl.textContent = key;
      lbl.dataset.gene = key;

      const input = document.createElement('input');
      input.type = 'range';
      input.className = 'gene-slider';
      input.min = config.geneMin[idx];
      input.max = config.geneMax[idx];
      input.value = genes[idx];
      input.dataset.idx = idx;

      const val = document.createElement('span');
      val.className = 'gene-value';
      val.textContent = genes[idx];

      input.addEventListener('input', () => {
        genes[idx] = parseInt(input.value);
        val.textContent = genes[idx];
        syncHash();
        scheduleRender();
        updateMeta();
      });

      // Tooltip on label hover
      lbl.addEventListener('mouseenter', e => {
        const tip = GENE_TOOLTIPS[key];
        if (!tip) return;
        tooltip.textContent = tip;
        tooltip.style.display = 'block';
        positionTooltip(e);
      });
      lbl.addEventListener('mousemove', positionTooltip);
      lbl.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

      row.appendChild(lbl);
      row.appendChild(input);
      row.appendChild(val);
      genePanel.appendChild(row);

      sliders.push({ input, valueEl: val, index: idx });
    }
  }
}

function positionTooltip(e) {
  tooltip.style.left = (e.clientX + 12) + 'px';
  tooltip.style.top = (e.clientY - 8) + 'px';
}

// ── Sync sliders from genes ──

function syncSliders() {
  for (const s of sliders) {
    s.input.value = genes[s.index];
    s.valueEl.textContent = genes[s.index];
  }
}

// ── Segmented drawing (modes 3+) ──

function drawSegmented(g, m) {
  const config = MODE_CONFIGS[m];
  const segCount = (config.geneCount > 9) ? (g[9] || 1) : 1;
  const segDist = (config.geneCount > 10) ? (g[10] || 4) : 4;
  const hasGradients = m >= 4 && g.length >= 13;

  if (segCount <= 1 && !hasGradients) return drawTree(g);

  const allLines = [];
  for (let s = 0; s < segCount; s++) {
    let segGenes = g.slice();

    if (hasGradients && segCount > 1) {
      const t = s / (segCount - 1);
      segGenes[0] = Math.max(config.geneMin[0], Math.min(config.geneMax[0],
        Math.round(g[0] + g[11] * t)));
      segGenes[2] = Math.max(config.geneMin[2], Math.min(config.geneMax[2],
        Math.round(g[2] + g[12] * t)));
    }

    const treeLines = drawTree(segGenes);
    const yOffset = (s - (segCount - 1) / 2) * segDist;
    for (const seg of treeLines) {
      allLines.push({
        x0: seg.x0, y0: seg.y0 + yOffset,
        x1: seg.x1, y1: seg.y1 + yOffset,
        depth: seg.depth,
      });
    }
  }
  return allLines;
}

// ── Rendering ──

let renderPending = false;

function scheduleRender() {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(render);
}

function render() {
  renderPending = false;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.parentElement.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.clearRect(0, 0, w, h);

  const lines = drawSegmented(genes, mode);
  if (lines.length === 0) return;

  // Compute bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of lines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const pad = 40;
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const cx = w / 2;
  const cy = h / 2;
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  const maxD = Math.max(...lines.map(s => s.depth));

  ctx.lineCap = 'round';

  for (const seg of lines) {
    const t = maxD > 1 ? (seg.depth - 1) / (maxD - 1) : 0;
    const hue = 120 + t * 60;
    const light = 35 + t * 25;
    ctx.strokeStyle = `hsl(${hue}, 50%, ${light}%)`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + (seg.x0 - ox) * scale, cy + (seg.y0 - oy) * scale);
    ctx.lineTo(cx + (seg.x1 - ox) * scale, cy + (seg.y1 - oy) * scale);
    ctx.stroke();
  }
}

// Resize handler
window.addEventListener('resize', scheduleRender);

// ── Meta / Stats ──

function updateMeta() {
  const name = generateName(genes, mode);
  nameEl.textContent = `"${name}"`;

  const rarity = getRarityTier(genes, mode);
  const rarityColor = RARITY_COLORS[rarity];
  const allLines = drawSegmented(genes, mode);
  const branches = allLines.length;
  const sym = symmetryScore(genes);

  metaEl.innerHTML =
    `<span>Mode ${mode}</span>` +
    `<span>Gen ${generation}</span>` +
    `<span style="color:${rarityColor}">${capitalize(rarity)}</span>`;

  statsEl.innerHTML =
    `<span>Branches: <b style="color:#c8e6c8">${branches}</b></span>` +
    `<span>Symmetry: <b style="color:#c8e6c8">${sym.toFixed(2)}</b></span>` +
    `<span class="rarity" style="color:${rarityColor}">${capitalize(rarity)}</span>`;
}

function symmetryScore(g) {
  const pairs = [[0, 6], [1, 5], [2, 4]];
  let score = 0;
  for (const [a, b] of pairs) {
    const diff = Math.abs(g[a] + g[b]);
    score += (3 - Math.min(diff, 3)) / 3;
  }
  return score / pairs.length;
}

function capitalize(s) { return s[0].toUpperCase() + s.slice(1); }

// ── URL Hash ──

function syncHash() {
  const hash = encodeState({ genes, mode, symmetry, generation });
  history.replaceState(null, '', hash);
}

// ── Actions ──

document.getElementById('btn-randomize').addEventListener('click', () => {
  genes = randomInteresting(mode);
  generation = 0;
  syncSliders();
  syncHash();
  scheduleRender();
  updateMeta();
});

document.getElementById('btn-reset').addEventListener('click', () => {
  genes = originGenotype(mode);
  generation = 0;
  syncSliders();
  syncHash();
  scheduleRender();
  updateMeta();
});

document.getElementById('btn-mutate').addEventListener('click', () => {
  genes = mutate(genes, mode);
  generation++;
  syncSliders();
  syncHash();
  scheduleRender();
  updateMeta();
});

document.getElementById('btn-builder').addEventListener('click', () => {
  const hash = encodeState({ genes, mode, symmetry, generation });
  window.open('../breed.html' + hash, '_blank');
});

document.getElementById('btn-copy').addEventListener('click', () => {
  copyGenes();
});

// Canvas click → copy
document.getElementById('preview-panel').addEventListener('click', () => {
  copyGenes();
});

function copyGenes() {
  const text = `[${genes.join(', ')}]`;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Genes copied to clipboard');
  }).catch(() => {
    showToast('Copy failed');
  });
}

// ── Mode switch ──

modeSelect.addEventListener('change', () => {
  const newMode = parseInt(modeSelect.value);
  genes = adaptGenes(genes, newMode);
  mode = newMode;
  buildSliders();
  syncHash();
  scheduleRender();
  updateMeta();
});

// ── Toast ──

let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

// ── Hash change (back/forward) ──

window.addEventListener('hashchange', () => {
  const state = decodeState(location.hash);
  if (!state) return;
  mode = state.mode;
  genes = state.genes;
  generation = state.generation || 0;
  symmetry = state.symmetry || 'left-right';
  modeSelect.value = mode;
  buildSliders();
  scheduleRender();
  updateMeta();
});

// ── Go ──

init();
