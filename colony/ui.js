// Colony UI — activity feed, inspect panel, stats bar

import { generateName, getRarityTier, RARITY_COLORS } from '../expedition/registry.js';
import { encodeState } from '../shared/genotype.js';
import { getSprite } from './landscape.js';

const MAX_FEED_ITEMS = 15;
let feedItems = [];

// ── Activity Feed ──

export function pushFeedEvent(event, feedEl) {
  const c = event.creature;
  const name = generateName(c.genes, c.mode);
  let html;

  if (event.type === 'birth') {
    html = `<div class="feed-item feed-birth">Born: <span class="feed-name">"${name}"</span> (gen ${c.generation})</div>`;
  } else {
    html = `<div class="feed-item feed-death">Died: <span class="feed-name">"${name}"</span> (age ${c.age}, gen ${c.generation})</div>`;
  }

  feedItems.push(html);
  if (feedItems.length > MAX_FEED_ITEMS) feedItems.shift();
  feedEl.innerHTML = feedItems.join('');
  feedEl.scrollTop = feedEl.scrollHeight;
}

// ── Stats ──

export function updateStats(population, tickCount) {
  document.getElementById('stat-pop').textContent = population.length;
  document.getElementById('stat-tick').textContent = tickCount;

  if (population.length === 0) {
    document.getElementById('stat-gen').textContent = '0';
    document.getElementById('stat-oldest').textContent = '0';
    return;
  }

  const avgGen = Math.round(population.reduce((s, c) => s + c.generation, 0) / population.length);
  const oldest = Math.max(...population.map(c => c.age));
  document.getElementById('stat-gen').textContent = avgGen;
  document.getElementById('stat-oldest').textContent = oldest;
}

// ── Inspect panel ──

export function openInspect(creature, overlayEl) {
  const name = generateName(creature.genes, creature.mode);
  const rarity = getRarityTier(creature.genes, creature.mode);

  document.getElementById('inspect-name').textContent = name;
  document.getElementById('inspect-name').style.color = RARITY_COLORS[rarity];
  document.getElementById('inspect-meta').textContent =
    `Generation ${creature.generation} · Age ${creature.age} · ${rarity.charAt(0).toUpperCase() + rarity.slice(1)}`;

  // Render large preview
  const preview = getSprite(creature.genes, 128);
  const inspectCanvas = document.getElementById('inspect-canvas');
  const ictx = inspectCanvas.getContext('2d');
  ictx.clearRect(0, 0, 128, 128);
  ictx.drawImage(preview, 0, 0);

  document.getElementById('inspect-genes').textContent =
    `Mode ${creature.mode} · Genes: [${creature.genes.join(', ')}]`;

  // Builder link
  const hash = encodeState({
    genes: creature.genes,
    mode: creature.mode,
    symmetry: 'left-right',
    generation: creature.generation,
  });
  document.getElementById('inspect-builder').href = `../breed.html${hash}`;

  overlayEl.dataset.creatureId = creature.id;
  overlayEl.classList.add('open');
}

export function closeInspect(overlayEl) {
  overlayEl.classList.remove('open');
}

// ── Tooltip ──

export function showTooltip(creature, clientX, clientY, tooltipEl) {
  const name = generateName(creature.genes, creature.mode);
  tooltipEl.textContent = `${name} (gen ${creature.generation})`;
  tooltipEl.style.left = (clientX + 12) + 'px';
  tooltipEl.style.top = (clientY - 8) + 'px';
  tooltipEl.style.display = 'block';
}

export function hideTooltip(tooltipEl) {
  tooltipEl.style.display = 'none';
}

export function clearFeed() {
  feedItems = [];
}
