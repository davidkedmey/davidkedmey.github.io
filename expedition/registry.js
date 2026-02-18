// Discovery registry — hashing, rarity, genesis seeding, naming, persistence
// Self-contained module for the Expedition experience

import { MODE_CONFIGS, randomInteresting, mutate, adaptGenes } from '../shared/genotype.js';
import { crossoverMulti } from '../shared/breeding.js';

// ── Genotype Hash ──
// Exact gene identity (rounded to 1 decimal for floating-point specimens from zoo)
export function genotypeHash(genes, mode) {
  return `m${mode}:${genes.map(g => Math.round(g * 10) / 10).join(',')}`;
}

// ── Rarity ──

export const RARITY_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

export const RARITY_COLORS = {
  common:    '#aaa',
  uncommon:  '#4a4',
  rare:      '#48f',
  epic:      '#a4f',
  legendary: '#fa0',
};

export const RARITY_LABELS = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  epic:      'Epic',
  legendary: 'Legendary',
};

export function getRarityTier(genes, mode) {
  const depth = genes[8] || 1;
  const dirGenes = genes.slice(0, 8);
  const avgExtremity = dirGenes.reduce((s, g) => s + Math.abs(g), 0) / dirGenes.length;

  let score = 0;
  score += (depth - 1) * 3;
  score += (mode - 1) * 4;
  score += Math.min(avgExtremity, 9) * 1.5;

  if (genes.length > 9) {
    score += ((genes[9] || 1) - 1) * 1.5;
  }
  if (genes.length > 11) {
    score += (Math.abs(genes[11] || 0) + Math.abs(genes[12] || 0)) * 0.5;
  }

  if (score >= 45) return 'legendary';
  if (score >= 32) return 'epic';
  if (score >= 20) return 'rare';
  if (score >= 10) return 'uncommon';
  return 'common';
}

// ── Naming (adapted from game/naming.js) ──

const ADJECTIVES = {
  highSymmetry: ['Balanced', 'Mirrored', 'Symmetric'],
  lowSymmetry:  ['Twisted', 'Lopsided', 'Crooked'],
  highComplexity: ['Dense', 'Intricate', 'Elaborate'],
  stout: ['Stout', 'Sturdy'],
  spindly: ['Spindly', 'Lanky'],
  tiny: ['Little', 'Tiny'],
  grand: ['Ancient', 'Grand'],
  warm: ['Crimson', 'Golden', 'Amber'],
  cool: ['Azure', 'Jade', 'Violet'],
  neutral: ['Pale', 'Dusky', 'Ashen'],
};

const NOUNS_BY_MODE = {
  1: ['Fern', 'Branch', 'Twig', 'Sapling', 'Bough'],
  2: ['Shrub', 'Bush', 'Thicket', 'Hedge'],
  3: ['Caterpillar', 'Spine', 'Centipede', 'Worm', 'Crawler'],
  4: ['Cascade', 'Coral', 'Fan', 'Crest'],
  5: ['Plume', 'Spiral', 'Tendril', 'Bloom'],
};

const FALLBACK_NOUNS = ['Form', 'Shape', 'Creature', 'Being'];

function symmetryScore(genes) {
  const pairs = [[0,6], [1,5], [2,4]];
  let score = 0;
  for (const [a, b] of pairs) {
    const diff = Math.abs(genes[a] + genes[b]);
    score += (3 - Math.min(diff, 3)) / 3;
  }
  return score / pairs.length;
}

function complexityScore(genes) {
  let nonZero = 0;
  for (let i = 0; i < 8; i++) if (genes[i] !== 0) nonZero++;
  return (nonZero / 8) * 0.4 + ((genes[8] - 1) / 7) * 0.6;
}

function balanceScore(genes) {
  const hMag = Math.abs(genes[0]) + Math.abs(genes[1]) + Math.abs(genes[2]);
  const vMag = Math.abs(genes[4]) + Math.abs(genes[5]) + Math.abs(genes[6]);
  const total = hMag + vMag;
  return total === 0 ? 0.5 : Math.min(hMag, vMag) / total;
}

function nameHash(genes, mode) {
  let h = mode * 31;
  for (let i = 0; i < genes.length; i++) {
    h = ((h << 5) - h + Math.round(genes[i]) + 128) | 0;
  }
  return Math.abs(h);
}

function pick(arr, hash) {
  return arr[hash % arr.length];
}

export function generateName(genes, mode) {
  const hash = nameHash(genes, mode);
  const depth = genes[8];
  const sym = symmetryScore(genes);
  const cmplx = complexityScore(genes);
  const bal = balanceScore(genes);

  let adjPool;
  if (depth <= 2) adjPool = ADJECTIVES.tiny;
  else if (depth >= 7) adjPool = ADJECTIVES.grand;
  else if (sym > 0.8) adjPool = ADJECTIVES.highSymmetry;
  else if (sym < 0.3) adjPool = ADJECTIVES.lowSymmetry;
  else if (cmplx > 0.7) adjPool = ADJECTIVES.highComplexity;
  else if (bal > 0.4) adjPool = ADJECTIVES.stout;
  else if (bal < 0.15) adjPool = ADJECTIVES.spindly;
  else adjPool = ADJECTIVES.neutral;

  const adj = pick(adjPool, hash);
  const nouns = NOUNS_BY_MODE[mode] || FALLBACK_NOUNS;
  const noun = pick(nouns, hash >> 3);
  return `${adj} ${noun}`;
}

// ── Mode Unlocking ──

const MODE_THRESHOLDS = { 1: 0, 2: 10, 3: 25, 4: 50, 5: 100 };

export function getUnlockedModes(playerDiscoveryCount) {
  const modes = [];
  for (const [mode, threshold] of Object.entries(MODE_THRESHOLDS)) {
    if (playerDiscoveryCount >= threshold) modes.push(parseInt(mode));
  }
  return modes;
}

export function getModeThreshold(mode) {
  return MODE_THRESHOLDS[mode] || 0;
}

// ── Registry ──

export function createRegistry() {
  return {
    entries: {},       // hash -> { discoverer, genes, mode, rarity, name, time }
    collectors: {},    // name -> { count, specimens: [hash, ...] }
    log: [],           // chronological: [{ hash, discoverer, rarity, name, time }]
  };
}

export function registerDiscovery(registry, genes, mode, discoverer) {
  const hash = genotypeHash(genes, mode);
  if (registry.entries[hash]) {
    return { isNew: false, hash, entry: registry.entries[hash] };
  }

  const rarity = getRarityTier(genes, mode);
  const name = generateName(genes, mode);
  const entry = {
    discoverer,
    genes: genes.slice(),
    mode,
    rarity,
    name,
    time: Date.now(),
  };

  registry.entries[hash] = entry;

  // Update collector stats
  if (!registry.collectors[discoverer]) {
    registry.collectors[discoverer] = { count: 0, specimens: [] };
  }
  registry.collectors[discoverer].count++;
  registry.collectors[discoverer].specimens.push(hash);

  // Log
  registry.log.push({ hash, discoverer, rarity, name, time: entry.time });

  return { isNew: true, hash, entry };
}

export function getCollectorCount(registry, name) {
  return registry.collectors[name]?.count || 0;
}

export function getCollectorSpecimens(registry, name) {
  const hashes = registry.collectors[name]?.specimens || [];
  return hashes.map(h => registry.entries[h]).filter(Boolean);
}

export function getLeaderboard(registry) {
  return Object.entries(registry.collectors)
    .map(([name, data]) => ({ name, count: data.count }))
    .sort((a, b) => b.count - a.count);
}

export function getTotalDiscoveries(registry) {
  return Object.keys(registry.entries).length;
}

// ── Genesis Seeding ──

export async function seedGenesis(registry) {
  try {
    const resp = await fetch('../shared/dawkins-zoo.json');
    const zoo = await resp.json();
    let count = 0;

    // Exhibition zoo specimens (mode 1)
    const specimens = zoo.exhibitionZoo || [];
    for (const spec of specimens) {
      const genes = spec.genes.map(g => Math.round(g * 10) / 10);
      // Pad to 9 genes if needed
      while (genes.length < 9) genes.push(0);
      const result = registerDiscovery(registry, genes, 1, 'genesis');
      if (result.isNew) count++;
    }

    // Named specimens
    if (zoo.namedSpecimens) {
      for (const [, spec] of Object.entries(zoo.namedSpecimens)) {
        const genes = spec.genes.map(g => Math.round(g * 10) / 10);
        while (genes.length < 9) genes.push(0);
        const result = registerDiscovery(registry, genes, 1, 'genesis');
        if (result.isNew) count++;
      }
    }

    return count;
  } catch (e) {
    console.warn('Failed to seed genesis specimens:', e);
    return 0;
  }
}

// ── Persistence ──

const STORAGE_KEY = 'expedition-registry';

export function saveRegistry(registry) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(registry));
  } catch (e) {
    console.warn('Failed to save registry:', e);
  }
}

export function loadRegistry() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // Rebuild collector index if missing
    if (!data.collectors) {
      data.collectors = {};
      for (const [hash, entry] of Object.entries(data.entries)) {
        const d = entry.discoverer;
        if (!data.collectors[d]) data.collectors[d] = { count: 0, specimens: [] };
        data.collectors[d].count++;
        data.collectors[d].specimens.push(hash);
      }
    }
    return data;
  } catch (e) {
    console.warn('Failed to load registry:', e);
    return null;
  }
}

// ── Morphospace coordinates ──
// X = avg gene extremity (0-9), Y = depth (1-8)

export function morphospaceCoords(genes) {
  const dirGenes = genes.slice(0, 8);
  const avgExtremity = dirGenes.reduce((s, g) => s + Math.abs(g), 0) / dirGenes.length;
  const depth = genes[8] || 1;
  return { x: avgExtremity, y: depth };
}

// Deterministic jitter from gene hash to prevent overlapping dots
export function morphospaceJitter(genes, mode) {
  let h = 0;
  for (let i = 0; i < genes.length; i++) {
    h = ((h << 5) - h + Math.round(genes[i] * 10) + 128) | 0;
  }
  h = ((h << 5) - h + mode) | 0;
  const jx = ((h & 0xFF) / 255 - 0.5) * 0.6;
  const jy = (((h >> 8) & 0xFF) / 255 - 0.5) * 0.4;
  return { jx, jy };
}
