// Colony population — creature factory, breeding, death, movement

import { randomInteresting, mutate } from '../shared/genotype.js';
import { crossoverMulti } from '../shared/breeding.js';

const MODE = 1;
const SOFT_CAP = 120;
const HARD_CAP = 150;
const INITIAL_POP = 80;

let nextId = 1;

// ── Creature factory ──

export function createCreature(genes, x, y, parentIds, generation) {
  const c = {
    id: nextId++,
    genes,
    mode: MODE,
    x,
    y,
    prevX: x,
    prevY: y,
    vx: (Math.random() - 0.5) * 0.002,
    vy: (Math.random() - 0.5) * 0.002,
    age: 0,
    generation: generation || 0,
    parentIds: parentIds || null,
  };
  return c;
}

export function seedPopulation(count) {
  count = count || INITIAL_POP;
  const pop = [];
  for (let i = 0; i < count; i++) {
    const genes = randomInteresting(MODE);
    const x = 0.1 + Math.random() * 0.8;
    const y = 0.1 + Math.random() * 0.8;
    pop.push(createCreature(genes, x, y, null, 0));
  }
  return pop;
}

// ── Simulation tick ──

export function tick(population) {
  const events = [];
  const toRemove = new Set();

  // Movement — damped random walk
  for (const c of population) {
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
    if (c.y < 0.04) { c.y = 0.04; c.vy = Math.abs(c.vy) * 0.5; }
    if (c.y > 0.96) { c.y = 0.96; c.vy = -Math.abs(c.vy) * 0.5; }

    c.age++;
  }

  // Breeding — ~3% chance per creature per tick
  const newborns = [];
  if (population.length < HARD_CAP) {
    for (const c of population) {
      if (Math.random() > 0.03) continue;

      // Find nearest neighbor within radius 0.08
      let nearest = null;
      let nearDist = 0.08;
      for (const other of population) {
        if (other.id === c.id) continue;
        const d = Math.hypot(other.x - c.x, other.y - c.y);
        if (d < nearDist) {
          nearDist = d;
          nearest = other;
        }
      }

      if (!nearest) continue;

      // Crossover + mutation
      const { genes: childGenes } = crossoverMulti([c.genes, nearest.genes], MODE);
      const mutated = mutate(mutate(childGenes, MODE), MODE); // 2 mutations

      // Offspring at midpoint + jitter
      const ox = (c.x + nearest.x) / 2 + (Math.random() - 0.5) * 0.03;
      const oy = (c.y + nearest.y) / 2 + (Math.random() - 0.5) * 0.03;
      const gen = Math.max(c.generation, nearest.generation) + 1;

      const baby = createCreature(mutated, ox, oy, [c.id, nearest.id], gen);
      newborns.push(baby);
      events.push({ type: 'birth', creature: baby });

      if (population.length + newborns.length >= HARD_CAP) break;
    }
  }

  // Death — age-based + density-dependent
  const densityFactor = population.length > SOFT_CAP
    ? 1 + (population.length - SOFT_CAP) / (HARD_CAP - SOFT_CAP) * 3
    : 1;

  for (const c of population) {
    const ageFactor = (c.age / 600) ** 2;
    const deathProb = 0.001 * ageFactor * densityFactor;
    if (Math.random() < deathProb) {
      toRemove.add(c.id);
      events.push({ type: 'death', creature: c });
    }
  }

  // Apply changes
  const surviving = population.filter(c => !toRemove.has(c.id));
  surviving.push(...newborns);

  return { population: surviving, events };
}

// ── Serialization ──

export function serialize(population, tickCount) {
  return {
    population: population.map(c => ({
      id: c.id, genes: c.genes, mode: c.mode,
      x: c.x, y: c.y, vx: c.vx, vy: c.vy,
      age: c.age, generation: c.generation,
      parentIds: c.parentIds,
    })),
    tickCount,
    nextId,
  };
}

export function deserialize(data) {
  nextId = data.nextId || 1;
  const population = data.population.map(c => ({
    ...c,
    prevX: c.x,
    prevY: c.y,
  }));
  return { population, tickCount: data.tickCount || 0 };
}

export function resetNextId() {
  nextId = 1;
}
