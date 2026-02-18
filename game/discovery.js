// Discovery registry — tracks who discovered each unique species first
// Pure functions, no side effects, testable in isolation

import { genotypeHash } from './collection.js';

// ── Rarity tiers ──

const RARITY_TIERS = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

const RARITY_COLORS = {
  common:    '#aaa',
  uncommon:  '#4a4',
  rare:      '#48f',
  epic:      '#a4f',
  legendary: '#fa0',
};

const RARITY_LABELS = {
  common:    'Common',
  uncommon:  'Uncommon',
  rare:      'Rare',
  epic:      'Epic',
  legendary: 'Legendary',
};

export { RARITY_TIERS, RARITY_COLORS, RARITY_LABELS };

// ── Registry creation ──

export function createDiscoveryRegistry() {
  return {
    entries: {},       // hash → { discoverer, day, mode, genes, rarity }
    leaderboard: { player: 0, fern: 0, moss: 0, dawkins: 0 },
    totalDiscoveries: 0,
    log: [],           // chronological: [{ hash, discoverer, day, rarity, mode }]
  };
}

// ── Check and register a discovery ──

export function checkAndRegister(registry, org, discoverer, day) {
  const hash = genotypeHash(org.genes, org.mode);
  if (registry.entries[hash]) {
    return { isNew: false, discoverer: registry.entries[hash].discoverer, hash, rarity: registry.entries[hash].rarity };
  }

  const rarity = getRarityTier(org);
  const entry = {
    discoverer,
    day,
    mode: org.mode,
    genes: org.genes.slice(),
    rarity,
  };
  if (org.colorGenes) entry.colorGenes = { ...org.colorGenes };

  registry.entries[hash] = entry;
  registry.totalDiscoveries++;

  // Update leaderboard
  if (registry.leaderboard[discoverer] != null) {
    registry.leaderboard[discoverer]++;
  }

  // Add to chronological log
  registry.log.push({ hash, discoverer, day, rarity, mode: org.mode });

  return { isNew: true, discoverer, hash, rarity };
}

// ── Rarity from biology ──
// Rarity emerges from mode + depth + gene extremity, not arbitrary assignment

export function getRarityTier(org) {
  const depth = org.genes[8] || 1;
  const mode = org.mode || 1;

  // Gene extremity: how far from zero the direction genes are on average
  const dirGenes = org.genes.slice(0, 8);
  const avgExtremity = dirGenes.reduce((s, g) => s + Math.abs(g), 0) / dirGenes.length;

  // Score components
  let score = 0;

  // Depth contributes heavily (depth 1-2 = common, 7-8 = rare territory)
  score += (depth - 1) * 3; // 0-21

  // Higher modes are rarer
  score += (mode - 1) * 4; // 0-16

  // Gene extremity (genes near max [-9,9] are rarer)
  score += Math.min(avgExtremity, 9) * 1.5; // 0-13.5

  // Extra genes (segments, gradients) add rarity
  if (org.genes.length > 9) {
    const segs = org.genes[9] || 1;
    score += (segs - 1) * 1.5; // 0-10.5
  }
  if (org.genes.length > 11) {
    const grad1 = Math.abs(org.genes[11] || 0);
    const grad2 = Math.abs(org.genes[12] || 0);
    score += (grad1 + grad2) * 0.5; // 0-9
  }

  // Map score to tiers
  // score range roughly 0-70
  if (score >= 45) return 'legendary';
  if (score >= 32) return 'epic';
  if (score >= 20) return 'rare';
  if (score >= 10) return 'uncommon';
  return 'common';
}

// ── Seed genesis specimens from dawkins-zoo.json ──

export async function seedGenesisSpecimens(registry) {
  try {
    const resp = await fetch('../shared/dawkins-zoo.json');
    const zoo = await resp.json();

    let count = 0;
    const specimens = zoo.exhibitionZoo || [];
    for (const spec of specimens) {
      const org = {
        genes: spec.genes.slice(),
        mode: 1, // exhibition zoo specimens are all mode 1
      };
      const result = checkAndRegister(registry, org, 'dawkins', 0);
      if (result.isNew) count++;
    }

    return count;
  } catch (e) {
    console.warn('Failed to seed genesis specimens:', e);
    return 0;
  }
}

// ── Serialization ──

export function serializeRegistry(registry) {
  return {
    entries: registry.entries,
    leaderboard: { ...registry.leaderboard },
    totalDiscoveries: registry.totalDiscoveries,
    log: registry.log,
  };
}

export function deserializeRegistry(data) {
  const reg = createDiscoveryRegistry();
  if (!data) return reg;
  reg.entries = data.entries || {};
  reg.leaderboard = data.leaderboard || { player: 0, fern: 0, moss: 0, dawkins: 0 };
  reg.totalDiscoveries = data.totalDiscoveries || 0;
  reg.log = data.log || [];
  return reg;
}

// ── Query helpers ──

export function getLeaderboardRanked(registry) {
  return Object.entries(registry.leaderboard)
    .filter(([id]) => id !== 'dawkins') // exclude dawkins from competition
    .sort((a, b) => b[1] - a[1]);
}

export function getRarityBreakdown(registry, discoverer) {
  const breakdown = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0 };
  for (const entry of Object.values(registry.entries)) {
    if (discoverer && entry.discoverer !== discoverer) continue;
    breakdown[entry.rarity]++;
  }
  return breakdown;
}

export function getMorphospaceData(registry) {
  // Build mode × depth grid for heatmap
  // mode 1-5 (x), depth 1-8 (y)
  const grid = [];
  for (let m = 0; m < 5; m++) {
    grid[m] = new Array(8).fill(0);
  }
  for (const entry of Object.values(registry.entries)) {
    const mi = (entry.mode || 1) - 1;
    const di = Math.min(Math.max(Math.round(entry.genes[8] || 1) - 1, 0), 7);
    if (mi >= 0 && mi < 5) grid[mi][di]++;
  }
  return grid;
}
