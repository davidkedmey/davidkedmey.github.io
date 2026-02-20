// Planet UI — sidebar, activity feed, inspect panel, tooltips

import { generateName, getRarityTier, RARITY_COLORS } from '../expedition/registry.js';
import { encodeState } from '../shared/genotype.js';
import { getSprite } from '../colony/landscape.js';
import { BIOMES, fitnessModifier } from './biomes.js';

const MAX_FEED_ITEMS = 20;
let feedItems = [];

// ── Activity Feed ──

export function pushFeedEvent(event, feedEl) {
  const c = event.creature;
  const name = generateName(c.genes, c.mode);
  let html;

  if (event.type === 'birth') {
    html = `<div class="feed-item feed-birth">Born: <span class="feed-name">"${name}"</span> in ${BIOMES[event.biome].name} (gen ${c.generation})</div>`;
  } else if (event.type === 'death') {
    html = `<div class="feed-item feed-death">Died: <span class="feed-name">"${name}"</span> in ${BIOMES[event.biome].name} (age ${c.age})</div>`;
  } else if (event.type === 'migration') {
    html = `<div class="feed-item feed-migration"><span class="feed-name">"${name}"</span> migrated: ${BIOMES[event.from].name} → ${BIOMES[event.to].name}</div>`;
  }

  if (html) {
    feedItems.push(html);
    if (feedItems.length > MAX_FEED_ITEMS) feedItems.shift();
    feedEl.innerHTML = feedItems.join('');
    feedEl.scrollTop = feedEl.scrollHeight;
  }
}

// ── Sidebar: Biome Info ──

export function showBiomeInfo(biomeId, biomeState, sidebarEl) {
  const biome = BIOMES[biomeId];
  const pop = biomeState.population;
  const avgGen = pop.length ? Math.round(pop.reduce((s, c) => s + c.generation, 0) / pop.length) : 0;
  const avgDepth = pop.length ? (pop.reduce((s, c) => s + (c.genes[8] || 1), 0) / pop.length).toFixed(1) : '0';
  const oldest = pop.length ? Math.max(...pop.map(c => c.age)) : 0;

  // Find top 3 specimens by fitness
  const scored = pop.map(c => ({
    creature: c,
    fitness: fitnessModifier(biomeId, c.genes),
  })).sort((a, b) => a.fitness - b.fitness);
  const top3 = scored.slice(0, 3).map(s => s.creature);

  let html = `
    <div class="biome-header" style="border-left: 3px solid ${biome.color}; padding-left: 12px;">
      <h2 class="biome-name">${biome.name}</h2>
      <p class="biome-desc">${biome.description}</p>
      <p class="biome-pressure">${biome.selectionLabel}</p>
    </div>
    <div class="biome-stats">
      <div class="bstat"><span class="bstat-val">${pop.length}</span><span class="bstat-label">Population</span></div>
      <div class="bstat"><span class="bstat-val">${avgGen}</span><span class="bstat-label">Avg Gen</span></div>
      <div class="bstat"><span class="bstat-val">${avgDepth}</span><span class="bstat-label">Avg Depth</span></div>
      <div class="bstat"><span class="bstat-val">${oldest}</span><span class="bstat-label">Oldest</span></div>
      <div class="bstat"><span class="bstat-val">${biomeState.migrationCount}</span><span class="bstat-label">Migrations</span></div>
    </div>
  `;

  if (top3.length) {
    html += `<div class="biome-top"><h3>Best Adapted</h3><div class="top-specimens">`;
    for (const c of top3) {
      const name = generateName(c.genes, c.mode);
      const rarity = getRarityTier(c.genes, c.mode);
      html += `
        <div class="top-specimen" data-id="${c.id}">
          <canvas class="top-sprite" width="40" height="40"></canvas>
          <div class="top-info">
            <span class="top-name" style="color:${RARITY_COLORS[rarity]}">${name}</span>
            <span class="top-meta">Gen ${c.generation} · Depth ${c.genes[8]}</span>
          </div>
        </div>`;
    }
    html += `</div></div>`;
  }

  sidebarEl.innerHTML = html;

  // Render top specimen sprites
  const canvases = sidebarEl.querySelectorAll('.top-sprite');
  canvases.forEach((el, i) => {
    if (top3[i]) {
      const sprite = getSprite(top3[i].genes, 40);
      el.getContext('2d').drawImage(sprite, 0, 0);
    }
  });

  return top3;
}

export function clearBiomeInfo(sidebarEl) {
  sidebarEl.innerHTML = `
    <div class="sidebar-placeholder">
      <p>Click a biome region to see its stats and top specimens.</p>
    </div>`;
}

// ── Inspect Panel ──

export function openInspect(creature, overlayEl) {
  const name = generateName(creature.genes, creature.mode);
  const rarity = getRarityTier(creature.genes, creature.mode);
  const biome = BIOMES[creature.biomeId];

  document.getElementById('inspect-name').textContent = name;
  document.getElementById('inspect-name').style.color = RARITY_COLORS[rarity];
  document.getElementById('inspect-meta').textContent =
    `Generation ${creature.generation} · Age ${creature.age} · ${rarity.charAt(0).toUpperCase() + rarity.slice(1)} · ${biome.name}`;

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

export function showTooltip(text, clientX, clientY, tooltipEl) {
  tooltipEl.textContent = text;
  tooltipEl.style.left = (clientX + 12) + 'px';
  tooltipEl.style.top = (clientY - 8) + 'px';
  tooltipEl.style.display = 'block';
}

export function hideTooltip(tooltipEl) {
  tooltipEl.style.display = 'none';
}

// ── Stats bar ──

export function updateGlobalStats(biomeStates, globalTickCount, totalMigrations) {
  let totalPop = 0;
  for (const [, state] of biomeStates) {
    totalPop += state.population.length;
  }
  document.getElementById('stat-pop').textContent = totalPop;
  document.getElementById('stat-migrations').textContent = totalMigrations;
  document.getElementById('stat-tick').textContent = globalTickCount;
}

export function clearFeed() {
  feedItems = [];
}
