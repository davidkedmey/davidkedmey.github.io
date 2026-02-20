// Expedition — main orchestrator
// Wires registry, map, bots, and UI together

import { MODE_CONFIGS, mutate, adaptGenes, randomInteresting } from '../shared/genotype.js';
import { crossoverMulti } from '../shared/breeding.js';
import {
  createRegistry, seedGenesis, registerDiscovery,
  getCollectorCount, getCollectorSpecimens, getLeaderboard,
  getUnlockedModes, getModeThreshold,
  saveRegistry, loadRegistry, getTotalDiscoveries,
  RARITY_LABELS, RARITY_COLORS, genotypeHash,
} from './registry.js';
import { createMap } from './map.js';
import { createBots, BOT_NAMES } from './bots.js';
import {
  renderBiomorph, renderCollectionGrid, renderParentSlot,
  renderOffspring, addToast, updateToastTimes,
  renderLeaderboard, showInspect, updateModeSelect, showTooltip,
} from './ui.js';

// ── Reset via ?reset query param ──
if (location.search.includes('reset')) {
  localStorage.removeItem('expedition-registry');
  history.replaceState(null, '', location.pathname);
}

// ── State ──

let registry;
let map;
let bots;
let animFrame;

// Breeding state
let parent1 = null;  // { genes, mode, hash, name, rarity }
let parent2 = null;
let offspring = [];   // [{ genes, mode }]
let selectedOffspring = null;
let currentFilter = 'all';

// ── DOM refs ──

const $ = id => document.getElementById(id);

const els = {};

function cacheDom() {
  els.discoveryCount = $('discovery-count');
  els.modeSelect = $('mode-select');
  els.btnLeaderboard = $('btn-leaderboard');
  els.mapCanvas = $('morphospace-canvas');
  els.parent1 = $('parent-1');
  els.parent2 = $('parent-2');
  els.btnBreed = $('btn-breed');
  els.btnClearParents = $('btn-clear-parents');
  els.offspringRow = $('offspring-row');
  els.claimRow = $('claim-row');
  els.btnClaim = $('btn-claim');
  els.claimInfo = $('claim-info');
  els.collectionCount = $('collection-count');
  els.collectionGrid = $('collection-grid');
  els.activityFeed = $('activity-feed');
  els.overlayLeaderboard = $('overlay-leaderboard');
  els.lbBody = $('lb-body');
  els.closeLeaderboard = $('close-leaderboard');
  els.overlayInspect = $('overlay-inspect');
  els.closeInspect = $('close-inspect');
  els.inspectSelectParent = $('inspect-select-parent');
  els.inspectOpenBuilder = $('inspect-open-builder');
  els.mapTooltip = $('map-tooltip');
}

// ── Init ──

async function init() {
  cacheDom();

  // Load or create registry
  const saved = loadRegistry();
  if (saved) {
    registry = saved;
  } else {
    registry = createRegistry();
    const genesisCount = await seedGenesis(registry);
    console.log(`Seeded ${genesisCount} genesis specimens`);
    saveRegistry(registry);
  }

  // Init map
  map = createMap(els.mapCanvas);
  refreshMapEntries();

  map.onClick = (entry) => {
    const hash = genotypeHash(entry.genes, entry.mode);
    showInspect(entry, hash);
  };

  map.onHover = (entry, x, y) => {
    showTooltip(els.mapTooltip, entry, x, y);
  };

  // Init bots
  bots = createBots(registry, onBotDiscovery);
  bots.start();

  // Update UI
  refreshUI();

  // Bind events
  bindEvents();

  // Start render loop
  renderLoop();

  // Toast time updater
  setInterval(() => updateToastTimes(els.activityFeed), 5000);

  // Auto-save
  setInterval(() => saveRegistry(registry), 10000);
  window.addEventListener('beforeunload', () => saveRegistry(registry));

  // Populate initial feed with recent log entries
  const recentLog = registry.log.slice(-10).reverse();
  for (const entry of recentLog) {
    const fullEntry = registry.entries[entry.hash];
    if (fullEntry) addToast(els.activityFeed, fullEntry);
  }
}

// ── Events ──

function bindEvents() {
  // Breed button
  els.btnBreed.addEventListener('click', breed);

  // Clear parents
  els.btnClearParents.addEventListener('click', clearParents);

  // Claim button
  els.btnClaim.addEventListener('click', claimOffspring);

  // Leaderboard
  els.btnLeaderboard.addEventListener('click', () => {
    renderLeaderboard(els.lbBody, registry);
    els.overlayLeaderboard.classList.add('visible');
  });
  els.closeLeaderboard.addEventListener('click', () => {
    els.overlayLeaderboard.classList.remove('visible');
  });

  // Inspect overlay
  els.closeInspect.addEventListener('click', () => {
    els.overlayInspect.classList.remove('visible');
  });

  els.inspectSelectParent.addEventListener('click', () => {
    const entry = els.overlayInspect._entry;
    if (!entry) return;
    selectParent(entry);
    els.overlayInspect.classList.remove('visible');
  });

  els.inspectOpenBuilder.addEventListener('click', () => {
    const entry = els.overlayInspect._entry;
    if (!entry) return;
    const hash = `#m=${entry.mode}&g=${entry.genes.join(',')}&s=lr`;
    window.open('/breed.html' + hash, '_blank');
  });

  // Overlay backdrop close
  for (const ov of [els.overlayLeaderboard, els.overlayInspect]) {
    ov.addEventListener('click', (e) => {
      if (e.target === ov) ov.classList.remove('visible');
    });
  }

  // Filter pills
  document.querySelectorAll('.filter-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      currentFilter = pill.dataset.filter;
      refreshCollection();
    });
  });

  // Mode select
  els.modeSelect.addEventListener('change', () => {
    // Mode change clears breeding state
    clearParents();
    refreshCollection();
  });

  // Parent slot clicks
  els.parent1.addEventListener('click', () => {
    if (parent1) { parent1 = null; refreshBreedingUI(); }
  });
  els.parent2.addEventListener('click', () => {
    if (parent2) { parent2 = null; refreshBreedingUI(); }
  });
}

// ── Bot Discovery Handler ──

function onBotDiscovery(botName, entry, hash) {
  addToast(els.activityFeed, entry);
  refreshMapEntries();
  map.addPulse(entry.genes, entry.mode, entry.rarity);
  refreshUI();
  saveRegistry(registry);
}

// ── Breeding ──

function selectParent(specimen) {
  const hash = genotypeHash(specimen.genes, specimen.mode);
  const entry = { ...specimen, hash };

  const currentMode = parseInt(els.modeSelect.value);

  // Only allow same-mode parents
  if (specimen.mode !== currentMode) {
    // If first parent, set mode
    if (!parent1 && !parent2) {
      els.modeSelect.value = specimen.mode;
    } else {
      return; // mode mismatch
    }
  }

  if (!parent1) {
    parent1 = entry;
  } else if (!parent2) {
    parent2 = entry;
  } else {
    // Replace parent1, shift
    parent1 = parent2;
    parent2 = entry;
  }

  refreshBreedingUI();
}

function breed() {
  if (!parent1 || !parent2) return;
  if (parent1.mode !== parent2.mode) return;

  const mode = parent1.mode;
  offspring = [];

  for (let i = 0; i < 5; i++) {
    const result = crossoverMulti([parent1.genes, parent2.genes], mode);
    // Apply 1-2 mutations
    let genes = result.genes;
    const mutations = 1 + Math.floor(Math.random() * 2);
    for (let m = 0; m < mutations; m++) {
      genes = mutate(genes, mode, 1);
    }
    offspring.push({ genes, mode });
  }

  selectedOffspring = null;
  els.claimRow.style.display = 'none';

  renderOffspring(els.offspringRow, offspring, (spec, idx) => {
    selectedOffspring = spec;
    els.claimRow.style.display = 'flex';

    // Check if new
    const hash = genotypeHash(spec.genes, spec.mode);
    const existing = registry.entries[hash];
    if (existing) {
      els.claimInfo.textContent = `Already discovered by ${existing.discoverer === 'player' ? 'you' : existing.discoverer}`;
      els.claimInfo.style.color = '#6a7a8a';
    } else {
      els.claimInfo.textContent = 'New discovery!';
      els.claimInfo.style.color = '#a8d8a8';
    }
  });
}

function claimOffspring() {
  if (!selectedOffspring) return;

  const { genes, mode } = selectedOffspring;
  const result = registerDiscovery(registry, genes, mode, 'player');

  if (result.isNew) {
    addToast(els.activityFeed, result.entry);
    map.addPulse(genes, mode, result.entry.rarity);
    refreshMapEntries();
  }

  // Clear breeding state
  offspring = [];
  selectedOffspring = null;
  els.offspringRow.innerHTML = '';
  els.claimRow.style.display = 'none';

  refreshUI();
  saveRegistry(registry);
}

function clearParents() {
  parent1 = null;
  parent2 = null;
  offspring = [];
  selectedOffspring = null;
  els.offspringRow.innerHTML = '';
  els.claimRow.style.display = 'none';
  refreshBreedingUI();
}

// ── UI Refresh ──

function refreshUI() {
  const total = getTotalDiscoveries(registry);
  els.discoveryCount.textContent = `${total} discoveries`;

  const playerCount = getCollectorCount(registry, 'player');
  els.collectionCount.textContent = playerCount;

  // Update mode select
  const unlocked = getUnlockedModes(playerCount);
  const thresholds = { 1: 0, 2: 10, 3: 25, 4: 50, 5: 100 };
  updateModeSelect(els.modeSelect, unlocked, thresholds);

  refreshCollection();
  refreshBreedingUI();
}

function refreshCollection() {
  const playerSpecs = getCollectorSpecimens(registry, 'player');
  // Also include genesis specimens as browseable
  const genesisSpecs = getCollectorSpecimens(registry, 'genesis');
  const allSpecs = [...genesisSpecs, ...playerSpecs];

  const selectedHashes = [];
  if (parent1) selectedHashes.push(parent1.hash);
  if (parent2) selectedHashes.push(parent2.hash);

  // Add hash to each for selection tracking
  const withHash = allSpecs.map(s => ({
    ...s,
    hash: genotypeHash(s.genes, s.mode),
  }));

  renderCollectionGrid(els.collectionGrid, withHash, {
    filter: currentFilter,
    selectedHashes,
    onSelect: (spec) => selectParent(spec),
  });
}

function refreshBreedingUI() {
  renderParentSlot(els.parent1, parent1);
  renderParentSlot(els.parent2, parent2);
  els.btnBreed.disabled = !(parent1 && parent2 && parent1.mode === parent2.mode);
}

function refreshMapEntries() {
  const allEntries = Object.entries(registry.entries).map(([hash, entry]) => ({
    ...entry,
    hash,
  }));
  map.setEntries(allEntries);
}

// ── Render Loop ──

function renderLoop() {
  const now = performance.now();
  map.render(now);

  // Only keep animating if there are active pulses; otherwise slow down
  if (map.hasPulses) {
    animFrame = requestAnimationFrame(renderLoop);
  } else {
    // Idle: render at low rate
    animFrame = setTimeout(() => requestAnimationFrame(renderLoop), 200);
  }
}

// ── Start ──

init();
