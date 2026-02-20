// Colony main — orchestrator: init, tick loop, render loop, events, persistence

import { createLandscape, getSprite } from './landscape.js';
import { seedPopulation, tick, serialize, deserialize, createCreature, resetNextId } from './population.js';
import { pushFeedEvent, updateStats, openInspect, closeInspect, showTooltip, hideTooltip, clearFeed } from './ui.js';
import { generateName } from '../expedition/registry.js';
import { decodeState } from '../shared/genotype.js';

const STORAGE_KEY = 'colony-state';
const SAVE_INTERVAL = 10000; // 10s auto-save

let population = [];
let tickCount = 0;
let tickInterval = 500; // ms between simulation ticks
let paused = false;
let lastTickTime = 0;
let lastSaveTime = 0;

// ── DOM refs ──
const canvas = document.getElementById('colony-canvas');
const feedEl = document.getElementById('activity-feed');
const tooltipEl = document.getElementById('tooltip');
const overlayEl = document.getElementById('overlay-inspect');

const landscape = createLandscape(canvas);

// ── Init ──

function init() {
  // Check for reset
  if (location.search.includes('reset')) {
    localStorage.removeItem(STORAGE_KEY);
    history.replaceState(null, '', location.pathname);
  }

  // Try load saved state
  const saved = loadState();
  if (saved) {
    const data = deserialize(saved);
    population = data.population;
    tickCount = data.tickCount;
  } else {
    resetNextId();
    population = seedPopulation(80);
  }

  // Check for hash seeding (introduce creature)
  const hash = location.hash;
  if (hash && hash.length > 2) {
    const state = decodeState(hash);
    if (state && state.genes) {
      const x = 0.4 + Math.random() * 0.2;
      const y = 0.4 + Math.random() * 0.2;
      const creature = createCreature(state.genes, x, y, null, state.generation || 0);
      population.push(creature);
      const name = generateName(creature.genes, creature.mode);
      pushFeedEvent({ type: 'birth', creature }, feedEl);
      history.replaceState(null, '', location.pathname);
    }
  }

  landscape.setCreatures(population);
  updateStats(population, tickCount);

  // Start loops
  lastTickTime = performance.now();
  lastSaveTime = performance.now();
  requestAnimationFrame(renderLoop);
  scheduleNextTick();

  // Events
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

  const result = tick(population);
  population = result.population;
  tickCount++;
  landscape.setCreatures(population);

  for (const event of result.events) {
    pushFeedEvent(event, feedEl);
  }

  updateStats(population, tickCount);

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
  // Interpolation fraction for smooth movement
  const elapsed = now - lastTickTime;
  const frac = paused ? 1 : Math.min(elapsed / tickInterval, 1);

  landscape.render(frac);
  requestAnimationFrame(renderLoop);
}

// ── Interaction ──

function setupInteraction() {
  canvas.addEventListener('mousemove', (e) => {
    const hit = landscape.hitTest(e.clientX, e.clientY);
    if (hit) {
      landscape.hoveredId = hit.id;
      showTooltip(hit, e.clientX, e.clientY, tooltipEl);
      canvas.style.cursor = 'pointer';
    } else {
      landscape.hoveredId = null;
      hideTooltip(tooltipEl);
      canvas.style.cursor = 'default';
    }
  });

  canvas.addEventListener('click', (e) => {
    const hit = landscape.hitTest(e.clientX, e.clientY);
    if (hit) {
      landscape.selectedId = hit.id;
      openInspect(hit, overlayEl);
    }
  });

  // Close inspect
  document.getElementById('inspect-close').addEventListener('click', () => {
    landscape.selectedId = null;
    closeInspect(overlayEl);
  });

  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) {
      landscape.selectedId = null;
      closeInspect(overlayEl);
    }
  });

  // Send to Expedition
  document.getElementById('inspect-expedition').addEventListener('click', () => {
    const id = parseInt(overlayEl.dataset.creatureId);
    const creature = population.find(c => c.id === id);
    if (!creature) return;

    // Store in localStorage for Expedition to pick up
    const payload = { genes: creature.genes, mode: creature.mode, source: 'colony' };
    localStorage.setItem('colony-to-expedition', JSON.stringify(payload));

    window.open('../expedition/#import=colony', '_blank');
    closeInspect(overlayEl);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize(population, tickCount)));
  } catch (e) {
    console.warn('Colony save failed:', e);
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.warn('Colony load failed:', e);
    return null;
  }
}

window.addEventListener('beforeunload', saveState);

// ── Go ──
init();
