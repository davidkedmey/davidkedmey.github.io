// UI module — rendering biomorphs, managing collection grid, toasts, overlays

import { drawTree, MODE_CONFIGS } from '../shared/genotype.js';
import { RARITY_COLORS, RARITY_LABELS, getLeaderboard, getCollectorCount } from './registry.js';
import { getBotProfile, BOT_NAMES } from './bots.js';

// ── Biomorph Rendering ──

export function renderBiomorph(canvas, genes, mode, options = {}) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const lines = drawTree(genes);
  if (lines.length === 0) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of lines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const pad = options.pad || 6;
  const scale = Math.min((w - pad * 2) / bw, (h - pad * 2) / bh);
  const cx = w / 2;
  const cy = h / 2;
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;
  const maxD = Math.max(...lines.map(s => s.depth));

  const baseColor = options.color || '#a8d8a8';

  for (const seg of lines) {
    const t = maxD > 1 ? (seg.depth - 1) / (maxD - 1) : 0;
    const hue = 120 + t * 60;
    const light = 35 + t * 25;
    ctx.strokeStyle = options.monoColor ? baseColor : `hsl(${hue}, 50%, ${light}%)`;
    ctx.lineWidth = Math.max(0.5, 1.2 * (w / 100));
    ctx.beginPath();
    ctx.moveTo(cx + (seg.x0 - ox) * scale, cy + (seg.y0 - oy) * scale);
    ctx.lineTo(cx + (seg.x1 - ox) * scale, cy + (seg.y1 - oy) * scale);
    ctx.stroke();
  }
}

// ── Collection Grid ──

export function renderCollectionGrid(container, specimens, options = {}) {
  const { filter = 'all', onSelect, selectedHashes = [] } = options;
  container.innerHTML = '';

  const filtered = filter === 'all'
    ? specimens
    : specimens.filter(s => s.rarity === filter);

  for (const spec of filtered) {
    const card = document.createElement('div');
    card.className = 'specimen-card';
    if (selectedHashes.includes(spec.hash)) {
      card.classList.add('selected-parent');
    }

    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    card.appendChild(canvas);

    // Rarity dot
    const dot = document.createElement('div');
    dot.className = 'specimen-rarity';
    dot.style.background = RARITY_COLORS[spec.rarity] || '#aaa';
    card.appendChild(dot);

    card.title = `${spec.name} (${RARITY_LABELS[spec.rarity]})`;

    // Render biomorph
    renderBiomorph(canvas, spec.genes, spec.mode);

    card.addEventListener('click', () => {
      if (onSelect) onSelect(spec);
    });

    container.appendChild(card);
  }
}

// ── Parent Slot Rendering ──

export function renderParentSlot(slotEl, specimen) {
  slotEl.innerHTML = '';
  if (!specimen) {
    slotEl.classList.remove('filled');
    const span = document.createElement('span');
    span.textContent = slotEl.id === 'parent-1' ? 'Parent 1' : 'Parent 2';
    slotEl.appendChild(span);
    return;
  }

  slotEl.classList.add('filled');
  const canvas = document.createElement('canvas');
  canvas.width = 120;
  canvas.height = 120;
  slotEl.appendChild(canvas);
  renderBiomorph(canvas, specimen.genes, specimen.mode);
}

// ── Offspring Row ──

export function renderOffspring(container, offspring, onSelect) {
  container.innerHTML = '';
  for (let i = 0; i < offspring.length; i++) {
    const spec = offspring[i];
    const slot = document.createElement('div');
    slot.className = 'offspring-slot';

    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    slot.appendChild(canvas);

    renderBiomorph(canvas, spec.genes, spec.mode);

    slot.addEventListener('click', () => {
      // Deselect others
      container.querySelectorAll('.offspring-slot').forEach(s => s.classList.remove('selected'));
      slot.classList.add('selected');
      if (onSelect) onSelect(spec, i);
    });

    container.appendChild(slot);
  }
}

// ── Activity Feed (Toasts) ──

const MAX_TOASTS = 20;

export function addToast(feedEl, entry) {
  const div = document.createElement('div');
  div.className = 'toast-entry';

  const text = document.createElement('span');
  const discoverer = entry.discoverer === 'player' ? 'You' : entry.discoverer;
  const rarityClass = `rarity-${entry.rarity}`;
  text.innerHTML = `<strong>${discoverer}</strong> discovered a <span class="${rarityClass}">${RARITY_LABELS[entry.rarity]}</span> <em>${entry.name}</em>`;

  const time = document.createElement('span');
  time.className = 'toast-time';
  time.textContent = 'just now';
  time.dataset.time = Date.now();

  div.appendChild(text);
  div.appendChild(time);

  // Prepend (newest first)
  feedEl.insertBefore(div, feedEl.firstChild);

  // Trim old
  while (feedEl.children.length > MAX_TOASTS) {
    feedEl.removeChild(feedEl.lastChild);
  }

  // Scroll to top
  feedEl.scrollTop = 0;
}

export function updateToastTimes(feedEl) {
  const now = Date.now();
  for (const el of feedEl.querySelectorAll('.toast-time')) {
    const t = parseInt(el.dataset.time);
    const sec = Math.floor((now - t) / 1000);
    if (sec < 5) el.textContent = 'just now';
    else if (sec < 60) el.textContent = `${sec}s ago`;
    else if (sec < 3600) el.textContent = `${Math.floor(sec / 60)}m ago`;
    else el.textContent = `${Math.floor(sec / 3600)}h ago`;
  }
}

// ── Leaderboard Overlay ──

export function renderLeaderboard(tbodyEl, registry) {
  tbodyEl.innerHTML = '';
  const board = getLeaderboard(registry);

  for (let i = 0; i < board.length; i++) {
    const { name, count } = board[i];
    const tr = document.createElement('tr');
    if (name === 'player') tr.classList.add('player-row');

    const isBot = BOT_NAMES.includes(name);
    const profile = isBot ? getBotProfile(name) : null;
    const displayName = name === 'player' ? 'You' :
      name === 'genesis' ? 'Dawkins (genesis)' :
      `${profile?.emoji || ''} ${name}`;

    tr.innerHTML = `
      <td class="rank">${i + 1}</td>
      <td>${displayName}</td>
      <td>${count}</td>
    `;
    tbodyEl.appendChild(tr);
  }
}

// ── Inspect Overlay ──

export function showInspect(entry, hash) {
  const overlay = document.getElementById('overlay-inspect');
  const canvas = document.getElementById('inspect-canvas');
  const nameEl = document.getElementById('inspect-name');
  const detailsEl = document.getElementById('inspect-details');

  renderBiomorph(canvas, entry.genes, entry.mode, { pad: 16 });
  nameEl.textContent = entry.name;
  nameEl.style.color = RARITY_COLORS[entry.rarity] || '#d4dce6';

  const discoverer = entry.discoverer === 'player' ? 'You' :
    entry.discoverer === 'genesis' ? 'Dawkins (genesis)' : entry.discoverer;
  detailsEl.innerHTML = `
    <div>${RARITY_LABELS[entry.rarity]} &middot; Mode ${entry.mode}</div>
    <div>Discovered by ${discoverer}</div>
    <div>Genes: [${entry.genes.map(g => Math.round(g * 10) / 10).join(', ')}]</div>
  `;

  overlay.classList.add('visible');
  overlay._entry = entry;
  overlay._hash = hash;
}

// ── Mode Select Update ──

export function updateModeSelect(selectEl, unlockedModes, allThresholds) {
  const current = parseInt(selectEl.value);
  selectEl.innerHTML = '';

  for (let m = 1; m <= 5; m++) {
    const opt = document.createElement('option');
    opt.value = m;
    const config = MODE_CONFIGS[m];
    const labels = { 1: 'Basic', 2: 'Symmetry', 3: 'Segments', 4: 'Gradients', 5: 'Full Dawkins' };
    if (unlockedModes.includes(m)) {
      opt.textContent = `Mode ${m} \u2014 ${labels[m]}`;
    } else {
      opt.textContent = `Mode ${m} \u2014 ${labels[m]} (${allThresholds[m]} discoveries)`;
      opt.disabled = true;
    }
    selectEl.appendChild(opt);
  }

  // Restore selection if still valid
  if (unlockedModes.includes(current)) {
    selectEl.value = current;
  } else {
    selectEl.value = unlockedModes[unlockedModes.length - 1];
  }
}

// ── Map Tooltip ──

export function showTooltip(tooltipEl, entry, x, y) {
  if (!entry) {
    tooltipEl.style.display = 'none';
    return;
  }

  tooltipEl.style.display = 'block';
  tooltipEl.style.left = (x + 12) + 'px';
  tooltipEl.style.top = (y - 8) + 'px';
  const discoverer = entry.discoverer === 'player' ? 'You' :
    entry.discoverer === 'genesis' ? 'Dawkins' : entry.discoverer;
  tooltipEl.innerHTML = `<strong style="color:${RARITY_COLORS[entry.rarity]}">${entry.name}</strong><br>${RARITY_LABELS[entry.rarity]} &middot; by ${discoverer}`;
}
