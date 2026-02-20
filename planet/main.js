// Planet main — orchestrator: init, tick all biomes, render, persistence, events

import { createWorld } from './world.js';
import { BIOMES } from './biomes.js';
import { seedBiome, tickBiome, serializeWorld, deserializeWorld } from './population.js';
import {
  pushFeedEvent, updateGlobalStats, showBiomeInfo, clearBiomeInfo,
  openInspect, closeInspect, showTooltip, hideTooltip, clearFeed,
} from './ui.js';
import { generateName } from '../expedition/registry.js';

const STORAGE_KEY = 'planet-state';
const SAVE_INTERVAL = 10000;

let biomeStates = new Map();
let globalTickCount = 0;
let totalMigrations = 0;
let tickInterval = 500;
let paused = false;
let lastTickTime = 0;
let lastSaveTime = 0;
let selectedBiome = null;

// ── DOM refs ──
const canvas = document.getElementById('world-canvas');
const feedEl = document.getElementById('activity-feed');
const tooltipEl = document.getElementById('tooltip');
const overlayEl = document.getElementById('overlay-inspect');
const sidebarEl = document.getElementById('sidebar-content');

const world = createWorld(canvas);

// ── Init ──

function init() {
  if (location.search.includes('reset')) {
    localStorage.removeItem(STORAGE_KEY);
    history.replaceState(null, '', location.pathname);
  }

  const saved = loadState();
  if (saved) {
    const data = deserializeWorld(saved);
    biomeStates = data.biomeStates;
    globalTickCount = data.globalTickCount;
    totalMigrations = data.totalMigrations;
  } else {
    for (const id of Object.keys(BIOMES)) {
      biomeStates.set(id, seedBiome(id));
    }
  }

  world.updateCreatures(biomeStates);
  updateGlobalStats(biomeStates, globalTickCount, totalMigrations);
  clearBiomeInfo(sidebarEl);

  lastTickTime = performance.now();
  lastSaveTime = performance.now();
  requestAnimationFrame(renderLoop);
  scheduleNextTick();

  setupInteraction();
  setupSpeedControls();
}

// ── Tick loop ──

function scheduleNextTick() {
  if (paused) return;
  setTimeout(doTick, tickInterval);
}

function doTick() {
  if (paused) return;

  let allEvents = [];
  for (const [, state] of biomeStates) {
    const events = tickBiome(state, biomeStates);
    allEvents.push(...events);
  }
  globalTickCount++;

  // Count migrations
  for (const e of allEvents) {
    if (e.type === 'migration') totalMigrations++;
  }

  world.updateCreatures(biomeStates);

  // Push only migration events + a sample of births/deaths to feed
  for (const e of allEvents) {
    if (e.type === 'migration') {
      pushFeedEvent(e, feedEl);
    } else if (Math.random() < 0.1) {
      // Show ~10% of births/deaths to avoid flood
      pushFeedEvent(e, feedEl);
    }
  }

  updateGlobalStats(biomeStates, globalTickCount, totalMigrations);

  // Update sidebar if a biome is selected
  if (selectedBiome && biomeStates.has(selectedBiome)) {
    showBiomeInfo(selectedBiome, biomeStates.get(selectedBiome), sidebarEl);
  }

  // Auto-save
  const now = performance.now();
  if (now - lastSaveTime > SAVE_INTERVAL) {
    saveState();
    lastSaveTime = now;
  }

  lastTickTime = now;
  scheduleNextTick();
}

// ── Render loop ──

function renderLoop(now) {
  const elapsed = now - lastTickTime;
  const frac = paused ? 1 : Math.min(elapsed / tickInterval, 1);
  world.render(frac);
  requestAnimationFrame(renderLoop);
}

// ── Interaction ──

function setupInteraction() {
  canvas.addEventListener('mousemove', (e) => {
    // Check creature hover first
    const creature = world.hitTestCreature(e.clientX, e.clientY);
    if (creature) {
      world.hoveredCreature = creature;
      world.hoveredBiome = null;
      const name = generateName(creature.genes, creature.mode);
      showTooltip(`${name} (gen ${creature.generation}, ${BIOMES[creature.biomeId].name})`, e.clientX, e.clientY, tooltipEl);
      canvas.style.cursor = 'pointer';
      return;
    }

    world.hoveredCreature = null;

    // Check biome hover
    const biome = world.hitTestBiome(e.clientX, e.clientY);
    if (biome) {
      world.hoveredBiome = biome;
      const state = biomeStates.get(biome);
      showTooltip(`${BIOMES[biome].name} (${state ? state.population.length : 0} creatures)`, e.clientX, e.clientY, tooltipEl);
      canvas.style.cursor = 'pointer';
    } else {
      world.hoveredBiome = null;
      hideTooltip(tooltipEl);
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('click', (e) => {
    // Check creature click first
    const creature = world.hitTestCreature(e.clientX, e.clientY);
    if (creature) {
      world.selectedCreature = creature;
      openInspect(creature, overlayEl);
      return;
    }

    // Check biome click
    const biome = world.hitTestBiome(e.clientX, e.clientY);
    if (biome && biomeStates.has(biome)) {
      selectedBiome = biome;
      showBiomeInfo(biome, biomeStates.get(biome), sidebarEl);
    }
  });

  canvas.addEventListener('mouseleave', () => {
    world.hoveredBiome = null;
    world.hoveredCreature = null;
    hideTooltip(tooltipEl);
  });

  // Close inspect
  document.getElementById('inspect-close').addEventListener('click', () => {
    world.selectedCreature = null;
    closeInspect(overlayEl);
  });

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) {
      world.selectedCreature = null;
      closeInspect(overlayEl);
    }
  });

  // Send to Expedition
  document.getElementById('inspect-expedition').addEventListener('click', () => {
    const id = overlayEl.dataset.creatureId;
    let creature = null;
    for (const [, state] of biomeStates) {
      creature = state.population.find(c => c.id === id);
      if (creature) break;
    }
    if (!creature) return;

    const payload = { genes: creature.genes, mode: creature.mode, source: 'planet' };
    localStorage.setItem('colony-to-expedition', JSON.stringify(payload));
    window.open('../expedition/#import=colony', '_blank');
    closeInspect(overlayEl);
  });

  // Zoom to Colony
  document.getElementById('inspect-colony').addEventListener('click', () => {
    const id = overlayEl.dataset.creatureId;
    let creature = null;
    let biomeId = null;
    for (const [bId, state] of biomeStates) {
      creature = state.population.find(c => c.id === id);
      if (creature) { biomeId = bId; break; }
    }
    if (!creature || !biomeId) return;

    // Pack biome population into colony-state format
    const state = biomeStates.get(biomeId);
    const colonyState = {
      population: state.population.map(c => ({
        id: typeof c.id === 'string' ? parseInt(c.id.split(':')[1]) : c.id,
        genes: c.genes, mode: c.mode,
        x: c.x, y: c.y, vx: c.vx, vy: c.vy,
        age: c.age, generation: c.generation,
        parentIds: c.parentIds,
      })),
      tickCount: state.tickCount,
      nextId: state.nextId,
    };
    localStorage.setItem('colony-state', JSON.stringify(colonyState));
    window.open('../colony/', '_blank');
    closeInspect(overlayEl);
  });

  // Sidebar specimen clicks
  sidebarEl.addEventListener('click', (e) => {
    const specEl = e.target.closest('.top-specimen');
    if (specEl) {
      const id = specEl.dataset.id;
      let creature = null;
      for (const [, state] of biomeStates) {
        creature = state.population.find(c => c.id === id);
        if (creature) break;
      }
      if (creature) {
        world.selectedCreature = creature;
        openInspect(creature, overlayEl);
      }
    }
  });
}

// ── Speed controls ──

function setupSpeedControls() {
  const buttons = document.querySelectorAll('[data-speed]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const speed = parseInt(btn.dataset.speed);
      if (speed === 0) {
        paused = true;
      } else {
        const wasPaused = paused;
        paused = false;
        tickInterval = speed;
        if (wasPaused) {
          lastTickTime = performance.now();
          scheduleNextTick();
        }
      }
    });
  });
}

// ── Persistence ──

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeWorld(biomeStates, globalTickCount, totalMigrations)));
  } catch (e) {
    console.warn('Planet save failed:', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Planet load failed:', e);
    return null;
  }
}

window.addEventListener('beforeunload', saveState);

// ── Go ──
init();
