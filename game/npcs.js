// NPC data, wander AI, farm tending, trading

import { TILE, TILE_SIZE, tileAt, isSolid, GARDEN_PLOTS } from './world.js';
import { createSeed, createOrganism, tickGrowth, harvest, randomColorGenes } from './organisms.js';
import { randomInteresting } from '../shared/genotype.js';

export const NPCS = [
  {
    id: 'chip',
    name: 'Chip',
    role: 'shopkeeper',
    color: '#e0d0b0',
    accent: '#8a7a5a',
    homeX: 28 * TILE_SIZE + 24,
    homeY: 5 * TILE_SIZE + 24,
    wanderRadius: 1.5,
    dialogIdle: [
      "Fresh seeds every morning!",
      "Some rare specimens today...",
      "Business is good when the biomorphs bloom.",
    ],
    plots: [], // shopkeeper doesn't farm
  },
  {
    id: 'fern',
    name: 'Fern',
    role: 'farmer',
    color: '#7bc67b',
    accent: '#3a7a3a',
    homeX: 8 * TILE_SIZE + 24,
    homeY: 11 * TILE_SIZE + 24,
    wanderRadius: 3,
    dialogIdle: [
      "I'm trying to breed the tallest biomorph!",
      "Depth is everything, I say.",
      "Want to trade? I might have something you like.",
    ],
    plots: [
      { col: 7, row: 9 },
      { col: 8, row: 9 },
      { col: 7, row: 10 },
      { col: 8, row: 10 },
      { col: 9, row: 9 },
      { col: 9, row: 10 },
    ],
  },
  {
    id: 'moss',
    name: 'Moss',
    role: 'farmer',
    color: '#7ba8c6',
    accent: '#3a6a8a',
    homeX: 23 * TILE_SIZE + 24,
    homeY: 11 * TILE_SIZE + 24,
    wanderRadius: 3,
    dialogIdle: [
      "I collect the weird ones.",
      "Color genes are underrated!",
      "Trade with me — I've got oddities.",
    ],
    plots: [
      { col: 22, row: 9 },
      { col: 23, row: 9 },
      { col: 22, row: 10 },
      { col: 23, row: 10 },
      { col: 24, row: 9 },
      { col: 24, row: 10 },
    ],
  },
  {
    id: 'sage',
    name: 'Sage',
    role: 'guide',
    color: '#d4a0d4',
    accent: '#8a5a8a',
    homeX: 15 * TILE_SIZE + 24,
    homeY: 8 * TILE_SIZE + 24,
    wanderRadius: 0,  // overridden to 3 after tutorial completes
    dialogIdle: [
      "Need a tip? Plant deeper biomorphs \u2014 they sell for more!",
      "Craft a spear at your House to forage wild trees.",
      "The Museum unlocks the Lab after 5 donations.",
      "Try breeding in the Lab for unique offspring!",
      "Hold T to fast-forward through the day.",
    ],
    plots: [],
  },
];

export function initNPCs(world) {
  const states = [];
  for (const npc of NPCS) {
    // Pre-plow NPC farm plots
    for (const p of npc.plots) {
      world[p.row][p.col] = TILE.DIRT;
    }

    const state = {
      id: npc.id,
      x: npc.homeX,
      y: npc.homeY,
      facing: 'down',
      // Wander AI
      targetX: npc.homeX,
      targetY: npc.homeY,
      waitTimer: 2 + Math.random() * 3,
      moving: false,
      wanderRadius: npc.wanderRadius,
      // Farming
      planted: [],
      inventory: [],
      // Garden — curated specimens on display in botanical zones
      garden: [],
      // Dialog
      dialogIdx: 0,
      // AI
      wallet: npc.role === 'farmer' ? 50 : 0,
      task: null,
      lastSellDay: 0,
    };

    // Plant initial crops on their plots
    for (const p of npc.plots) {
      const mode = npc.id === 'fern' ? 1 : 1;
      const genes = randomInteresting(mode);
      const org = createOrganism(genes, mode, randomColorGenes());
      org.tileCol = p.col;
      org.tileRow = p.row;
      org.plantedDay = 0;
      org.stage = 'mature';
      org.growthProgress = org.matureDays;
      state.planted.push(org);
    }

    // Seed initial garden specimens (first 4 plots per farmer)
    const gardenPlots = GARDEN_PLOTS[npc.id];
    if (gardenPlots) {
      const seedCount = Math.min(4, gardenPlots.length);
      for (let gi = 0; gi < seedCount; gi++) {
        const plot = gardenPlots[gi];
        const genes = randomInteresting(1);
        const org = createOrganism(genes, 1, randomColorGenes());
        org.stage = 'mature';
        org.growthProgress = org.matureDays;
        state.garden.push({ col: plot.col, row: plot.row, organism: org });
      }
    }

    states.push(state);
  }
  return states;
}

const NPC_SPEED = 60; // pixels per second (slower than player)

export function updateNPCs(npcStates, world, dt, tutorialActive) {
  for (let i = 0; i < npcStates.length; i++) {
    const state = npcStates[i];
    const npc = NPCS[i];
    if (!npc) continue;

    // Skip guide NPC when tutorial is driving their movement
    if (npc.role === 'guide' && tutorialActive) continue;

    // Skip NPCs with active AI tasks (AI drives their movement)
    if (state.task) continue;

    if (state.moving) {
      // Move toward target
      const dx = state.targetX - state.x;
      const dy = state.targetY - state.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 2) {
        state.x = state.targetX;
        state.y = state.targetY;
        state.moving = false;
        state.waitTimer = 2 + Math.random() * 4;
      } else {
        const step = NPC_SPEED * dt;
        state.x += (dx / dist) * step;
        state.y += (dy / dist) * step;
        // Update facing
        if (Math.abs(dx) > Math.abs(dy)) {
          state.facing = dx > 0 ? 'right' : 'left';
        } else {
          state.facing = dy > 0 ? 'down' : 'up';
        }
      }
    } else {
      // Wait, then pick new target
      state.waitTimer -= dt;
      if (state.waitTimer <= 0) {
        // Pick random target within wander radius
        const wanderRadius = state.wanderRadius ?? npc.wanderRadius;
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * wanderRadius * TILE_SIZE;
        let tx = npc.homeX + Math.cos(angle) * r;
        let ty = npc.homeY + Math.sin(angle) * r;
        // Clamp to world bounds and check walkability
        const col = Math.floor(tx / TILE_SIZE);
        const row = Math.floor(ty / TILE_SIZE);
        const tile = tileAt(world, col, row);
        if (!isSolid(tile)) {
          state.targetX = tx;
          state.targetY = ty;
          state.moving = true;
        } else {
          state.waitTimer = 1; // try again soon
        }
      }
    }
  }
}

// Called each new day: NPC farms cycle
export function npcDayTick(npcStates, currentDay) {
  for (let i = 0; i < npcStates.length; i++) {
    const state = npcStates[i];
    const npc = NPCS[i];
    if (npc.plots.length === 0) continue;

    // Grow existing plants
    tickGrowth(state.planted, currentDay);

    // Auto-harvest mature and replant
    for (let j = state.planted.length - 1; j >= 0; j--) {
      const org = state.planted[j];
      if (org.stage === 'mature') {
        // Harvest: keep in inventory (up to 6), replant with mutant
        const result = harvest(org);
        state.planted.splice(j, 1);
        org.tileCol = null;
        org.tileRow = null;
        // Keep some in inventory for trading
        if (state.inventory.length < 6) {
          state.inventory.push(org);
        }
        // Replant a seed
        if (result.seeds.length > 0) {
          const seed = result.seeds[0];
          const plot = npc.plots[j % npc.plots.length];
          // Check plot is empty
          if (!state.planted.some(p => p.tileCol === plot.col && p.tileRow === plot.row)) {
            seed.tileCol = plot.col;
            seed.tileRow = plot.row;
            seed.plantedDay = currentDay;
            seed.stage = 'growing';
            seed.growthProgress = 0;
            state.planted.push(seed);
          }
        }
      }
    }

    // Fill empty plots
    for (const plot of npc.plots) {
      if (!state.planted.some(p => p.tileCol === plot.col && p.tileRow === plot.row)) {
        const genes = randomInteresting(1);
        const org = createOrganism(genes, 1, randomColorGenes());
        org.tileCol = plot.col;
        org.tileRow = plot.row;
        org.plantedDay = currentDay;
        org.stage = 'growing';
        org.growthProgress = 0;
        state.planted.push(org);
      }
    }
  }
}

// Seed starter specimens into empty gardens (for migrated saves)
export function seedEmptyGardens(npcStates) {
  for (let i = 0; i < npcStates.length; i++) {
    const npc = NPCS[i];
    if (!npc) continue;
    const state = npcStates[i];
    if (!state.garden) state.garden = [];
    if (state.garden.length > 0) continue; // already has specimens
    const gardenPlots = GARDEN_PLOTS[npc.id];
    if (!gardenPlots) continue;
    const seedCount = Math.min(4, gardenPlots.length);
    for (let gi = 0; gi < seedCount; gi++) {
      const plot = gardenPlots[gi];
      const genes = randomInteresting(1);
      const org = createOrganism(genes, 1, randomColorGenes());
      org.stage = 'mature';
      org.growthProgress = org.matureDays;
      state.garden.push({ col: plot.col, row: plot.row, organism: org });
    }
  }
}

// Find NPC near player
export function nearbyNPC(px, py, npcStates) {
  for (let i = 0; i < npcStates.length; i++) {
    const s = npcStates[i];
    if (Math.hypot(px - s.x, py - s.y) < TILE_SIZE * 1.8) {
      return { npc: NPCS[i], state: s, index: i };
    }
  }
  return null;
}

// Trade: swap one of yours for one of theirs
export function executeTrade(npcState, npcItemIdx, player, playerItemIdx) {
  if (npcItemIdx >= npcState.inventory.length) return false;
  if (playerItemIdx >= player.inventory.length) return false;

  const npcItem = npcState.inventory[npcItemIdx];
  const playerItem = player.inventory[playerItemIdx];

  npcState.inventory[npcItemIdx] = playerItem;
  player.inventory[playerItemIdx] = npcItem;
  return true;
}
