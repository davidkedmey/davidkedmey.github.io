// Wild biomorphs — living organisms backing TREE tiles
// Each tree in the forest is a real biomorph with unique genetics.
// Forests slowly spread and evolve over time.

import { randomInteresting, mutate } from '../shared/genotype.js';
import { createOrganism, randomColorGenes } from './organisms.js';
import { TILE, COLS, ROWS } from './world.js';
import { getOwner } from './property.js';

// Initialize wild biomorphs for every TREE tile in the world.
// Returns a Map keyed by "col,row" → organism
export function initWildBiomorphs(world) {
  const wilds = new Map();
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (world[row][col] === TILE.TREE) {
        const genes = randomInteresting(1);
        // Wild trees tend to be depth 4-7
        genes[8] = 4 + Math.floor(Math.random() * 4);
        const org = createOrganism(genes, 1);
        org.stage = 'mature';
        org.growthProgress = org.matureDays;
        wilds.set(`${col},${row}`, org);
      }
    }
  }
  return wilds;
}

// Daily tick: 2% chance per tree to spread to an adjacent grass tile.
// The child is a mutant of the parent. Returns number of new trees spawned.
export function wildDayTick(wilds, world) {
  const newTrees = [];

  for (const [key, org] of wilds) {
    if (Math.random() > 0.02) continue; // 2% chance

    const [col, row] = key.split(',').map(Number);

    // Check 4 adjacent tiles for grass
    const neighbors = [
      [col - 1, row], [col + 1, row],
      [col, row - 1], [col, row + 1],
    ];
    // Shuffle so spread direction is random
    for (let i = neighbors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [neighbors[i], neighbors[j]] = [neighbors[j], neighbors[i]];
    }

    for (const [nc, nr] of neighbors) {
      if (nc < 1 || nc >= COLS - 1 || nr < 1 || nr >= ROWS - 1) continue;
      if (world[nr][nc] !== TILE.GRASS) continue;
      if (getOwner(nc, nr) !== null) continue; // don't spread into owned property

      // Spread! Create mutant child
      const childGenes = mutate(org.genes, org.mode, 1);
      const childOrg = createOrganism(childGenes, 1, randomColorGenes());
      childOrg.stage = 'mature';
      childOrg.growthProgress = childOrg.matureDays;

      newTrees.push({ col: nc, row: nr, org: childOrg });
      break; // Only spread to one tile per day
    }
  }

  // Apply new trees (separate pass to avoid modifying map during iteration)
  for (const { col, row, org } of newTrees) {
    world[row][col] = TILE.TREE;
    wilds.set(`${col},${row}`, org);
  }

  return newTrees.length;
}

// Get the wild organism at a tile position (or null)
export function getWildOrganism(wilds, col, row) {
  return wilds.get(`${col},${row}`) || null;
}

// Remove a wild organism at a tile position (used by axe chop)
export function removeWildOrganism(wilds, col, row) {
  wilds.delete(`${col},${row}`);
}

// Serialize wild biomorphs for saving
export function serializeWilds(wilds) {
  const entries = [];
  for (const [key, org] of wilds) {
    entries.push({
      key,
      id: org.id,
      genes: org.genes,
      mode: org.mode,
      colorGenes: org.colorGenes,
      farmGenes: org.farmGenes,
    });
  }
  return entries;
}

// Deserialize wild biomorphs from save data
export function deserializeWilds(entries) {
  const wilds = new Map();
  if (!entries) return wilds;
  for (const e of entries) {
    const org = createOrganism(e.genes, e.mode, e.colorGenes, e.farmGenes);
    org.id = e.id || org.id;
    org.stage = 'mature';
    org.growthProgress = org.matureDays;
    wilds.set(e.key, org);
  }
  return wilds;
}
