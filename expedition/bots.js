// AI collector bots — 4 distinct personalities
// Each bot autonomously breeds/mutates to discover new specimens

import { MODE_CONFIGS, randomInteresting, mutate, adaptGenes } from '../shared/genotype.js';
import { crossoverMulti } from '../shared/breeding.js';
import { registerDiscovery, getCollectorSpecimens, RARITY_LABELS } from './registry.js';

const BOT_PROFILES = {
  Fern: {
    emoji: '\ud83c\udf3f',
    strategy: 'conservative',
    depthRange: [1, 4],
    mutationIntensity: 1,
    preferredModes: [1, 2],
    intervalRange: [4000, 7000],
    color: '#6a9a6a',
  },
  Moss: {
    emoji: '\ud83c\udf31',
    strategy: 'adventurous',
    depthRange: [4, 8],
    mutationIntensity: 3,
    preferredModes: [1, 2, 3],
    intervalRange: [3000, 5000],
    color: '#4a8a4a',
  },
  Coral: {
    emoji: '\ud83e\udeb8',
    strategy: 'specialist',
    depthRange: [3, 7],
    mutationIntensity: 2,
    preferredModes: [3, 4, 5],
    intervalRange: [5000, 8000],
    color: '#c87878',
  },
  Lichen: {
    emoji: '\ud83c\udf3e',
    strategy: 'completionist',
    depthRange: [1, 8],
    mutationIntensity: 2,
    preferredModes: [1, 2, 3],
    intervalRange: [6000, 10000],
    color: '#8a8a6a',
  },
};

export const BOT_NAMES = Object.keys(BOT_PROFILES);

export function getBotProfile(name) {
  return BOT_PROFILES[name];
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Generate a specimen for a bot based on its personality
function botBreed(botName, registry) {
  const profile = BOT_PROFILES[botName];
  const mode = pickRandom(profile.preferredModes);
  const config = MODE_CONFIGS[mode];
  const specimens = getCollectorSpecimens(registry, botName);

  // Filter to same-mode specimens
  const sameModeSpecs = specimens.filter(s => s.mode === mode);

  let genes;

  if (sameModeSpecs.length >= 2 && Math.random() < 0.6) {
    // Crossover two parents + mutation
    const p1 = pickRandom(sameModeSpecs);
    const p2 = pickRandom(sameModeSpecs);
    const result = crossoverMulti([p1.genes, p2.genes], mode);
    genes = result.genes;
    // Apply mutations
    for (let i = 0; i < profile.mutationIntensity; i++) {
      genes = mutate(genes, mode, profile.mutationIntensity);
    }
  } else if (sameModeSpecs.length >= 1 && Math.random() < 0.4) {
    // Mutate an existing specimen
    const parent = pickRandom(sameModeSpecs);
    genes = parent.genes.slice();
    for (let i = 0; i < profile.mutationIntensity + 1; i++) {
      genes = mutate(genes, mode, profile.mutationIntensity);
    }
  } else {
    // Generate fresh
    genes = randomInteresting(mode);
  }

  // Clamp depth to bot's preferred range
  const [minD, maxD] = profile.depthRange;
  genes[8] = Math.max(minD, Math.min(maxD, genes[8]));
  genes[8] = Math.max(config.geneMin[8], Math.min(config.geneMax[8], genes[8]));

  return { genes, mode };
}

export function createBots(registry, onDiscovery) {
  const timers = {};
  let running = false;

  function scheduleTick(botName) {
    if (!running) return;
    const profile = BOT_PROFILES[botName];
    const delay = randomInRange(profile.intervalRange[0], profile.intervalRange[1]);
    timers[botName] = setTimeout(() => tick(botName), delay);
  }

  function tick(botName) {
    if (!running) return;

    const { genes, mode } = botBreed(botName, registry);
    const result = registerDiscovery(registry, genes, mode, botName);

    if (result.isNew && onDiscovery) {
      onDiscovery(botName, result.entry, result.hash);
    }

    // Even if not new, bot "keeps" it in their collection implicitly
    // (they only care about registry discoveries)

    scheduleTick(botName);
  }

  function start() {
    running = true;
    for (const name of BOT_NAMES) {
      // Stagger start: each bot starts after a random initial delay
      const initialDelay = 2000 + Math.random() * 5000;
      timers[name] = setTimeout(() => tick(name), initialDelay);
    }
  }

  function stop() {
    running = false;
    for (const name of BOT_NAMES) {
      clearTimeout(timers[name]);
    }
  }

  return { start, stop };
}
