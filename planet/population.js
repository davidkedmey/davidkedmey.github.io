// Planet population — de-globalized colony tick logic for multi-biome use
// All state (nextId, caps) is per-biome, passed as parameters.

import { randomInteresting, mutate } from '../shared/genotype.js';
import { crossoverMulti } from '../shared/breeding.js';
import { fitnessModifier, BIOMES } from './biomes.js';

const MODE = 1;
const SOFT_CAP = 50;
const HARD_CAP = 60;
const INITIAL_POP = 35;

// ── Creature factory ──

export function createCreature(biomeState, genes, x, y, parentIds, generation) {
  const id = `${biomeState.biome}:${biomeState.nextId++}`;
  return {
    id,
    genes,
    mode: MODE,
    x, y,
    prevX: x,
    prevY: y,
    vx: (Math.random() - 0.5) * 0.002,
    vy: (Math.random() - 0.5) * 0.002,
    age: 0,
    generation: generation || 0,
    parentIds: parentIds || null,
    biomeId: biomeState.biome,
  };
}

// ── Seed a biome ──

export function seedBiome(biomeId) {
  const state = {
    biome: biomeId,
    population: [],
    tickCount: 0,
    nextId: 1,
    migrationCount: 0,
  };
  for (let i = 0; i < INITIAL_POP; i++) {
    const genes = randomInteresting(MODE);
    const x = 0.1 + Math.random() * 0.8;
    const y = 0.1 + Math.random() * 0.8;
    state.population.push(createCreature(state, genes, x, y, null, 0));
  }
  return state;
}

// ── Tick one biome ──

export function tickBiome(biomeState, allBiomeStates) {
  const pop = biomeState.population;
  const events = [];
  const toRemove = new Set();
  const biomeId = biomeState.biome;

  // Movement — damped random walk
  for (const c of pop) {
    c.prevX = c.x;
    c.prevY = c.y;
    c.vx += (Math.random() - 0.5) * 0.002;
    c.vy += (Math.random() - 0.5) * 0.002;
    c.vx *= 0.95;
    c.vy *= 0.95;
    c.x += c.vx;
    c.y += c.vy;

    // Soft bounce off edges
    if (c.x < 0.02) { c.x = 0.02; c.vx = Math.abs(c.vx) * 0.5; }
    if (c.x > 0.98) { c.x = 0.98; c.vx = -Math.abs(c.vx) * 0.5; }
    if (c.y < 0.02) { c.y = 0.02; c.vy = Math.abs(c.vy) * 0.5; }
    if (c.y > 0.98) { c.y = 0.98; c.vy = -Math.abs(c.vy) * 0.5; }

    c.age++;
  }

  // Breeding — ~3% chance
  const newborns = [];
  if (pop.length < HARD_CAP) {
    for (const c of pop) {
      if (Math.random() > 0.03) continue;

      let nearest = null;
      let nearDist = 0.08;
      for (const other of pop) {
        if (other.id === c.id) continue;
        const d = Math.hypot(other.x - c.x, other.y - c.y);
        if (d < nearDist) { nearDist = d; nearest = other; }
      }
      if (!nearest) continue;

      const { genes: childGenes } = crossoverMulti([c.genes, nearest.genes], MODE);
      const mutated = mutate(mutate(childGenes, MODE), MODE);

      const ox = (c.x + nearest.x) / 2 + (Math.random() - 0.5) * 0.03;
      const oy = (c.y + nearest.y) / 2 + (Math.random() - 0.5) * 0.03;
      const gen = Math.max(c.generation, nearest.generation) + 1;

      const baby = createCreature(biomeState, mutated, ox, oy, [c.id, nearest.id], gen);
      newborns.push(baby);
      events.push({ type: 'birth', creature: baby, biome: biomeId });

      if (pop.length + newborns.length >= HARD_CAP) break;
    }
  }

  // Death — age-based + density + biome fitness
  const densityFactor = pop.length > SOFT_CAP
    ? 1 + (pop.length - SOFT_CAP) / (HARD_CAP - SOFT_CAP) * 3
    : 1;

  for (const c of pop) {
    const ageFactor = (c.age / 600) ** 2;
    const fitMod = fitnessModifier(biomeId, c.genes);
    const deathProb = 0.001 * ageFactor * densityFactor * fitMod;
    if (Math.random() < deathProb) {
      toRemove.add(c.id);
      events.push({ type: 'death', creature: c, biome: biomeId });
    }
  }

  // Migration — edge creatures have 0.5% chance of moving to adjacent biome
  const adjacent = BIOMES[biomeId].adjacent;
  for (const c of pop) {
    if (toRemove.has(c.id)) continue;
    const nearEdge = c.x < 0.05 || c.x > 0.95 || c.y < 0.05 || c.y > 0.95;
    if (!nearEdge || Math.random() > 0.005) continue;

    // Pick random adjacent biome
    const targetId = adjacent[Math.floor(Math.random() * adjacent.length)];
    const targetState = allBiomeStates.get(targetId);
    if (!targetState || targetState.population.length >= HARD_CAP) continue;

    // Remove from current biome
    toRemove.add(c.id);

    // Create in target biome (genes unchanged — founder effect)
    const migrant = createCreature(targetState, c.genes.slice(), 0.4 + Math.random() * 0.2, 0.4 + Math.random() * 0.2, c.parentIds, c.generation);
    migrant.age = c.age;
    targetState.population.push(migrant);

    biomeState.migrationCount++;
    events.push({
      type: 'migration',
      creature: c,
      from: biomeId,
      to: targetId,
    });
  }

  // Apply changes
  biomeState.population = pop.filter(c => !toRemove.has(c.id));
  biomeState.population.push(...newborns);
  biomeState.tickCount++;

  return events;
}

// ── Serialization ──

export function serializeWorld(biomeStates, globalTickCount, totalMigrations) {
  const biomes = {};
  for (const [id, state] of biomeStates) {
    biomes[id] = {
      biome: state.biome,
      population: state.population.map(c => ({
        id: c.id, genes: c.genes, mode: c.mode,
        x: c.x, y: c.y, vx: c.vx, vy: c.vy,
        age: c.age, generation: c.generation,
        parentIds: c.parentIds, biomeId: c.biomeId,
      })),
      tickCount: state.tickCount,
      nextId: state.nextId,
      migrationCount: state.migrationCount,
    };
  }
  return { biomes, globalTickCount, totalMigrations };
}

export function deserializeWorld(data) {
  const biomeStates = new Map();
  for (const [id, saved] of Object.entries(data.biomes)) {
    biomeStates.set(id, {
      biome: saved.biome,
      population: saved.population.map(c => ({
        ...c,
        prevX: c.x,
        prevY: c.y,
      })),
      tickCount: saved.tickCount,
      nextId: saved.nextId,
      migrationCount: saved.migrationCount,
    });
  }
  return {
    biomeStates,
    globalTickCount: data.globalTickCount || 0,
    totalMigrations: data.totalMigrations || 0,
  };
}
