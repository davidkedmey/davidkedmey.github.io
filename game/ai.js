// AI decision system for Fern and Moss — autonomous farmer behavior

import { TILE, TILE_SIZE, COLS, ROWS, tileAt } from './world.js';
import { NPCS } from './npcs.js';
import { createOrganism, randomColorGenes, tickGrowth, harvest } from './organisms.js';
import { randomInteresting } from '../shared/genotype.js';
import { sellPrice, buyPrice, generateShopStock } from './economy.js';
import { breed } from './breeding.js';
import { donate, recordSale, recordBreed } from './collection.js';
import { harvestMaterials, addMaterialToInventory } from './materials.js';
import { RECIPES, canCraft, executeCraft } from './crafting.js';
import { getWildOrganism } from './wild.js';

export const AI_PERSONALITIES = {
  fern: {
    preferredDepth: [1, 4],
    sellThreshold: 4,
    buyBudget: 0.3,
    breedChance: 0.1,
    donateChance: 0.15,
    forageChance: 0.2,
    craftPriority: ['hoe', 'spear'],
    pickOffspring: 'safe',
  },
  moss: {
    preferredDepth: [4, 8],
    sellThreshold: 3,
    buyBudget: 0.5,
    breedChance: 0.4,
    donateChance: 0.1,
    forageChance: 0.3,
    craftPriority: ['spear', 'axe'],
    pickOffspring: 'risky',
  },
};

const NPC_SPEED = 60;
const SELL_COOLDOWN_DAYS = 3;
const NPC_SELL_DISCOUNT = 0.5; // NPCs get 50% of player sell price

// Building door positions (where NPCs walk to)
const DESTINATIONS = {
  shop:   { col: 28, row: 5 },
  lab:    { col: 4,  row: 18 },
  museum: { col: 28, row: 18 },
};

// ── Main AI day tick — replaces npcDayTick ──

export function aiDayTick(npcStates, gameState, world, wilds, collection) {
  const currentDay = gameState.day;

  for (let i = 0; i < npcStates.length; i++) {
    const state = npcStates[i];
    const npc = NPCS[i];
    if (!npc || npc.plots.length === 0) continue;

    // === Existing farm cycle: grow, harvest, replant ===
    tickGrowth(state.planted, currentDay);

    for (let j = state.planted.length - 1; j >= 0; j--) {
      const org = state.planted[j];
      if (org.stage === 'mature') {
        const result = harvest(org);
        state.planted.splice(j, 1);
        org.tileCol = null;
        org.tileRow = null;
        if (state.inventory.length < 6) {
          state.inventory.push(org);
        }
        if (result.seeds.length > 0) {
          const seed = result.seeds[0];
          const plot = npc.plots[j % npc.plots.length];
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

    // === AI task picking (one per day, only if idle) ===
    if (state.task) continue; // already busy

    const personality = AI_PERSONALITIES[npc.id];
    if (!personality) continue;

    const task = pickTask(state, npc, personality, gameState, collection, wilds, world);
    if (task) {
      state.task = task;
    }
  }
}

// ── Pick a task based on priority + personality ──

function pickTask(state, npc, personality, gameState, collection, wilds, world) {
  const organisms = state.inventory.filter(i => i.kind === 'organism');
  const wallet = state.wallet || 0;

  // 1. Sell — when inventory is full enough + cooldown elapsed
  const daysSinceLastSell = gameState.day - (state.lastSellDay || 0);
  if (organisms.length >= personality.sellThreshold && daysSinceLastSell >= SELL_COOLDOWN_DAYS) {
    return createTask('sell', DESTINATIONS.shop, { npcId: npc.id });
  }

  // 2. Breed — random chance, needs 2+ organisms and lab unlocked
  if (collection.labUnlocked && organisms.length >= 2 && Math.random() < personality.breedChance) {
    return createTask('breed', DESTINATIONS.lab, { npcId: npc.id });
  }

  // 3. Buy — when wallet allows and inventory is low
  if (organisms.length < 3 && wallet > 20) {
    const budget = Math.floor(wallet * personality.buyBudget);
    if (budget >= 10) {
      return createTask('buy', DESTINATIONS.shop, { npcId: npc.id, budget });
    }
  }

  // 4. Forage — random chance, walk to nearest wild tree
  if (Math.random() < personality.forageChance) {
    const hasTool = state.inventory.some(i => i.kind === 'tool' && (i.toolType === 'spear' || i.toolType === 'axe'));
    if (hasTool) {
      const tree = findNearestTree(state.x, state.y, world, wilds);
      if (tree) {
        return createTask('forage', tree, { npcId: npc.id });
      }
    }
  }

  // 5. Donate — random chance
  if (organisms.length > 0 && Math.random() < personality.donateChance) {
    return createTask('donate', DESTINATIONS.museum, { npcId: npc.id });
  }

  // 6. Craft — stay home, craft if materials available
  const craftRecipe = findCraftableRecipe(state.inventory, personality.craftPriority);
  if (craftRecipe) {
    const homeCol = Math.floor(npc.homeX / TILE_SIZE);
    const homeRow = Math.floor(npc.homeY / TILE_SIZE);
    return createTask('craft', { col: homeCol, row: homeRow }, { npcId: npc.id, recipeId: craftRecipe.id });
  }

  return null;
}

function createTask(type, destination, data) {
  return {
    type,
    phase: 'walking', // walking → acting → returning → done
    destX: destination.col * TILE_SIZE + TILE_SIZE / 2,
    destY: destination.row * TILE_SIZE + TILE_SIZE / 2,
    actTimer: 0,
    actDuration: 2, // seconds at destination
    data: data || {},
  };
}

function findNearestTree(x, y, world, wilds) {
  let best = null, bestDist = Infinity;
  for (let row = 1; row < ROWS - 1; row++) {
    for (let col = 1; col < COLS - 1; col++) {
      if (world[row][col] === TILE.TREE) {
        const wildOrg = getWildOrganism(wilds, col, row);
        if (wildOrg) {
          const tx = col * TILE_SIZE + TILE_SIZE / 2;
          const ty = row * TILE_SIZE + TILE_SIZE / 2;
          const dist = Math.hypot(tx - x, ty - y);
          if (dist < bestDist) {
            bestDist = dist;
            best = { col, row };
          }
        }
      }
    }
  }
  return best;
}

function findCraftableRecipe(inventory, priorityList) {
  for (const recipeId of priorityList) {
    const recipe = RECIPES.find(r => r.id === recipeId);
    if (recipe && canCraft(recipe, inventory)) return recipe;
  }
  return null;
}

// ── Per-frame AI task update — drives walking + acting ──

export function updateAITasks(npcStates, dt, gameState, world, wilds, collection) {
  for (let i = 0; i < npcStates.length; i++) {
    const state = npcStates[i];
    const npc = NPCS[i];
    if (!state.task) continue;

    const task = state.task;

    if (task.phase === 'walking') {
      const dx = task.destX - state.x;
      const dy = task.destY - state.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 4) {
        state.x = task.destX;
        state.y = task.destY;
        state.moving = false;
        task.phase = 'acting';
        task.actTimer = 0;
        // Trigger spectator mode if player is following this NPC
        if (gameState.followNpcIdx === i && !gameState.spectator && task.type !== 'forage') {
          const npc = NPCS[i];
          const result = precomputeSpectatorAction(state, npc, task, gameState, collection);
          if (result) {
            task.actDuration = Math.max(task.actDuration, result.totalDuration + 0.5);
            gameState._pendingSpectator = { npcIdx: i, result };
          }
        }
      } else {
        state.moving = true;
        const step = NPC_SPEED * dt;
        state.x += (dx / dist) * step;
        state.y += (dy / dist) * step;
        if (Math.abs(dx) > Math.abs(dy)) {
          state.facing = dx > 0 ? 'right' : 'left';
        } else {
          state.facing = dy > 0 ? 'down' : 'up';
        }
      }
    } else if (task.phase === 'acting') {
      task.actTimer += dt;
      state.moving = false;

      if (task.actTimer >= task.actDuration) {
        // Execute the action
        executeAction(state, npc, task, gameState, world, wilds, collection);
        // Return home
        task.phase = 'returning';
        task.destX = npc.homeX;
        task.destY = npc.homeY;
      }
    } else if (task.phase === 'returning') {
      const dx = task.destX - state.x;
      const dy = task.destY - state.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 4) {
        state.x = task.destX;
        state.y = task.destY;
        state.moving = false;
        state.task = null; // done
      } else {
        state.moving = true;
        const step = NPC_SPEED * dt;
        state.x += (dx / dist) * step;
        state.y += (dy / dist) * step;
        if (Math.abs(dx) > Math.abs(dy)) {
          state.facing = dx > 0 ? 'right' : 'left';
        } else {
          state.facing = dy > 0 ? 'down' : 'up';
        }
      }
    }
  }
}

// ── Execute task action at destination ──

function executeAction(state, npc, task, gameState, world, wilds, collection) {
  const personality = AI_PERSONALITIES[npc.id];

  switch (task.type) {
    case 'sell':
      executeSell(state, personality, collection, gameState);
      break;
    case 'buy':
      executeBuy(state, personality, gameState);
      break;
    case 'breed':
      executeBreed(state, personality, collection);
      break;
    case 'forage':
      executeForage(state, task, world, wilds, gameState);
      break;
    case 'donate':
      executeDonate(state, collection, gameState);
      break;
    case 'craft':
      executeCraftAction(state, task);
      break;
  }
}

function executeSell(state, personality, collection, gameState) {
  // Sell organisms from inventory until below threshold
  const toSell = [];
  for (let i = state.inventory.length - 1; i >= 0; i--) {
    const item = state.inventory[i];
    if (item.kind === 'organism') {
      toSell.push(i);
      if (state.inventory.length - toSell.length <= 1) break; // keep at least 1
    }
  }
  for (const idx of toSell) {
    const item = state.inventory[idx];
    const price = Math.floor(sellPrice(item) * NPC_SELL_DISCOUNT);
    state.wallet = (state.wallet || 0) + price;
    recordSale(collection, item);
    state.inventory.splice(idx, 1);
  }
  state.lastSellDay = gameState.day;
}

function executeBuy(state, personality, gameState) {
  const budget = Math.floor((state.wallet || 0) * personality.buyBudget);
  const stock = gameState.shopStock || [];

  // Find an affordable seed in preferred depth range
  const [minDepth, maxDepth] = personality.preferredDepth;
  for (let i = stock.length - 1; i >= 0; i--) {
    const item = stock[i];
    if (item.kind !== 'organism') continue;
    const depth = item.genes[8];
    const price = buyPrice(item);
    if (depth >= minDepth && depth <= maxDepth && price <= budget && price <= (state.wallet || 0)) {
      state.wallet -= price;
      state.inventory.push(item);
      stock.splice(i, 1);
      break;
    }
  }
}

function executeBreed(state, personality, collection) {
  // Find two organisms of the same mode
  const organisms = state.inventory
    .map((item, idx) => ({ item, idx }))
    .filter(e => e.item.kind === 'organism');

  if (organisms.length < 2) return;

  // Find a compatible pair (same mode)
  let pair = null;
  for (let i = 0; i < organisms.length - 1 && !pair; i++) {
    for (let j = i + 1; j < organisms.length; j++) {
      if (organisms[i].item.mode === organisms[j].item.mode) {
        pair = [organisms[i], organisms[j]];
        break;
      }
    }
  }
  if (!pair) return;

  const offspring = breed(pair[0].item, pair[1].item);
  if (offspring.length === 0) return;

  recordBreed(collection);

  // Pick best offspring based on personality
  let pick;
  if (personality.pickOffspring === 'risky') {
    // Prefer higher depth
    pick = offspring.reduce((best, o) => o.genes[8] > best.genes[8] ? o : best);
  } else {
    // Prefer lower depth (safer)
    pick = offspring.reduce((best, o) => o.genes[8] < best.genes[8] ? o : best);
  }

  // Remove parents (higher index first)
  const indices = [pair[0].idx, pair[1].idx].sort((a, b) => b - a);
  for (const idx of indices) state.inventory.splice(idx, 1);

  // Add offspring
  state.inventory.push(pick);
}

function executeForage(state, task, world, wilds, gameState) {
  const col = Math.round((task.destX - TILE_SIZE / 2) / TILE_SIZE);
  const row = Math.round((task.destY - TILE_SIZE / 2) / TILE_SIZE);

  if (world[row] && world[row][col] === TILE.TREE) {
    const wildOrg = getWildOrganism(wilds, col, row);
    if (wildOrg && wildOrg.lastForagedDay !== gameState.day) {
      // Find a tool
      const toolIdx = state.inventory.findIndex(i => i.kind === 'tool' && (i.toolType === 'spear' || i.toolType === 'axe'));
      if (toolIdx >= 0) {
        const materials = harvestMaterials(wildOrg);
        for (const mat of materials) {
          addMaterialToInventory(state.inventory, mat);
        }
        wildOrg.lastForagedDay = gameState.day;
        // Use tool
        state.inventory[toolIdx].durability--;
        if (state.inventory[toolIdx].durability <= 0) {
          state.inventory.splice(toolIdx, 1);
        }
      }
    }
  }
}

function executeDonate(state, collection, gameState) {
  // Donate first organism in inventory
  const idx = state.inventory.findIndex(i => i.kind === 'organism');
  if (idx >= 0) {
    const org = state.inventory.splice(idx, 1)[0];
    donate(collection, org, gameState.day);
  }
}

function executeCraftAction(state, task) {
  const recipe = RECIPES.find(r => r.id === task.data.recipeId);
  if (!recipe) return;
  if (!canCraft(recipe, state.inventory)) return;
  const item = executeCraft(recipe, state.inventory);
  state.inventory.push(item);
}

// ── Helper: task label for renderer ──

export function getTaskLabel(task) {
  if (!task) return null;
  const labels = {
    sell: 'Shop',
    buy: 'Shop',
    breed: 'Lab',
    forage: 'Tree',
    donate: 'Museum',
    craft: 'Craft',
  };
  const dest = labels[task.type] || '?';
  if (task.phase === 'returning') return 'Home';
  return dest;
}

// ── Follow-mode narration ──

export const NARRATION = {
  fern: {
    idle: [
      "These biomorphs are coming along nicely.",
      "Shallow roots grow strong, I always say.",
      "I wonder what depth-3 would look like...",
      "The soil seems good today.",
      "Maybe I'll try a new cross tomorrow.",
    ],
    sell: { walking: "Off to sell some specimens!", acting: "Let's see what Chip offers...", returning: "A fair trade." },
    buy:  { walking: "Need some new seeds.", acting: "Hmm, what looks good?", returning: "This one has potential." },
    breed: { walking: "Maybe I should try the lab.", acting: "Breeding two specimens...", returning: "Let's see how this one grows." },
    forage: { walking: "I spotted a wild tree.", acting: "Gathering materials...", returning: "Good haul today." },
    donate: { walking: "The museum needs specimens.", acting: "Donating to the collection.", returning: "For science!" },
    craft: { walking: "Time to craft something.", acting: "Working on a new tool...", returning: "That should be useful." },
  },
  moss: {
    idle: [
      "I need deeper specimens...",
      "Color genes are the real treasure.",
      "Fern plays it too safe if you ask me.",
      "Depth 7... that's where it gets interesting.",
      "Wonder what's in the wild trees today.",
    ],
    sell: { walking: "Gotta fund my next experiment.", acting: "Selling the extras.", returning: "More gold for seeds!" },
    buy:  { walking: "Shopping for something exotic.", acting: "Depth 6? Depth 7? Yes please.", returning: "This is going to be wild." },
    breed: { walking: "Lab time! My favorite.", acting: "Let's make something weird.", returning: "Now THAT'S a specimen." },
    forage: { walking: "Wild trees have the best stuff.", acting: "Foraging...", returning: "Interesting materials." },
    donate: { walking: "Museum donation day.", acting: "Here, take this oddity.", returning: "They'll appreciate that one." },
    craft: { walking: "Need better tools.", acting: "Crafting...", returning: "That'll do." },
  },
};

export function getNarration(npcId, task) {
  const lines = NARRATION[npcId];
  if (!lines) return null;
  if (!task) {
    // Idle — pick a random line
    const idle = lines.idle;
    return idle[Math.floor(Math.random() * idle.length)];
  }
  const taskLines = lines[task.type];
  if (!taskLines) return null;
  return taskLines[task.phase] || null;
}

// ── Spectator mode: pre-compute NPC action + animation steps ──

export function precomputeSpectatorAction(state, npc, task, gameState, collection) {
  const personality = AI_PERSONALITIES[npc.id];
  if (!personality) return null;

  switch (task.type) {
    case 'sell':  return precomputeSell(state, personality, gameState);
    case 'buy':   return precomputeBuy(state, personality, gameState);
    case 'breed': return precomputeBreed(state, personality);
    case 'donate': return precomputeDonate(state);
    case 'craft': return precomputeCraft(state, task);
    default:      return null; // forage has no overlay
  }
}

function precomputeSell(state, personality, gameState) {
  // Figure out which items the NPC will sell (same logic as executeSell, but don't mutate)
  const inv = state.inventory.map(i => ({ ...i })); // shallow copy for display
  const toSell = [];
  for (let i = inv.length - 1; i >= 0; i--) {
    if (inv[i].kind === 'organism') {
      toSell.push({ idx: i, item: inv[i], price: Math.floor(sellPrice(inv[i]) * NPC_SELL_DISCOUNT) });
      if (inv.length - toSell.length <= 1) break;
    }
  }
  if (toSell.length === 0) return null;

  const actor = {
    inventory: inv,
    wallet: state.wallet || 0,
    selectedSlot: 0,
  };

  const steps = [];

  // Step 1: Show inventory side
  steps.push({
    duration: 1.0,
    apply(gs, actor) {
      gs.shopSide = 1;
      gs.shopCursor = toSell.length > 0 ? toSell[toSell.length - 1].idx : 0;
    },
  });

  // Steps 2+: cursor moves to each item being sold
  for (const sale of toSell.reverse()) { // show in forward order
    steps.push({
      duration: 1.0,
      apply(gs, actor) {
        gs.shopCursor = sale.idx;
        gs.spectatorLabel = `Selling for ${sale.price}g...`;
      },
    });
    steps.push({
      duration: 0.5,
      apply(gs, actor) {
        gs.spectatorLabel = `Sold for ${sale.price}g!`;
      },
    });
  }

  const totalDuration = steps.reduce((s, step) => s + step.duration, 0);

  return {
    overlay: 'shop',
    actionLabel: 'Selling',
    actor,
    steps,
    totalDuration,
  };
}

function precomputeBuy(state, personality, gameState) {
  const budget = Math.floor((state.wallet || 0) * personality.buyBudget);
  const stock = gameState.shopStock || [];
  const [minDepth, maxDepth] = personality.preferredDepth;

  // Find target item (same logic as executeBuy)
  let targetIdx = -1;
  for (let i = stock.length - 1; i >= 0; i--) {
    const item = stock[i];
    if (item.kind !== 'organism') continue;
    const depth = item.genes[8];
    const price = buyPrice(item);
    if (depth >= minDepth && depth <= maxDepth && price <= budget && price <= (state.wallet || 0)) {
      targetIdx = i;
      break;
    }
  }

  if (targetIdx < 0) return null;

  const targetItem = stock[targetIdx];
  const price = buyPrice(targetItem);

  const actor = {
    inventory: state.inventory.map(i => ({ ...i })),
    wallet: state.wallet || 0,
    selectedSlot: 0,
  };

  const steps = [
    {
      duration: 1.0,
      apply(gs, actor) {
        gs.shopSide = 0;
        gs.shopCursor = targetIdx;
      },
    },
    {
      duration: 1.0,
      apply(gs, actor) {
        gs.shopCursor = targetIdx;
        gs.spectatorLabel = `Buying for ${price}g...`;
      },
    },
    {
      duration: 0.5,
      apply(gs, actor) {
        gs.spectatorLabel = `Bought for ${price}g!`;
      },
    },
  ];

  return {
    overlay: 'shop',
    actionLabel: 'Buying',
    actor,
    steps,
    totalDuration: 2.5,
  };
}

function precomputeBreed(state, personality) {
  const organisms = state.inventory
    .map((item, idx) => ({ item, idx }))
    .filter(e => e.item.kind === 'organism');

  if (organisms.length < 2) return null;

  // Find compatible pair
  let pair = null;
  for (let i = 0; i < organisms.length - 1 && !pair; i++) {
    for (let j = i + 1; j < organisms.length; j++) {
      if (organisms[i].item.mode === organisms[j].item.mode) {
        pair = [organisms[i], organisms[j]];
        break;
      }
    }
  }
  if (!pair) return null;

  const offspring = breed(pair[0].item, pair[1].item);
  if (offspring.length === 0) return null;

  // Determine which offspring the NPC would pick
  let pickIdx;
  if (personality.pickOffspring === 'risky') {
    pickIdx = offspring.reduce((bi, o, i) => o.genes[8] > offspring[bi].genes[8] ? i : bi, 0);
  } else {
    pickIdx = offspring.reduce((bi, o, i) => o.genes[8] < offspring[bi].genes[8] ? i : bi, 0);
  }

  const actor = {
    inventory: state.inventory.map(i => ({ ...i })),
    wallet: state.wallet || 0,
    selectedSlot: 0,
  };

  // Build a fake lab state for the renderer
  const labState = {
    active: true,
    step: 'select1',
    parent1Idx: pair[0].idx,
    parent2Idx: pair[1].idx,
    offspring,
    selectedOffspring: [],
    maxKeep: 1,
  };

  const steps = [
    {
      duration: 1.5,
      apply(gs, actor, lab) {
        lab.step = 'select1';
        gs.spectatorLabel = 'Selecting parent 1...';
      },
    },
    {
      duration: 1.5,
      apply(gs, actor, lab) {
        lab.step = 'select2';
        gs.spectatorLabel = 'Selecting parent 2...';
      },
    },
    {
      duration: 1.5,
      apply(gs, actor, lab) {
        lab.step = 'offspring';
        lab.selectedOffspring = [];
        gs.spectatorLabel = 'Examining offspring...';
      },
    },
    {
      duration: 1.0,
      apply(gs, actor, lab) {
        lab.selectedOffspring = [pickIdx];
        gs.spectatorLabel = `Picked offspring ${pickIdx + 1}!`;
      },
    },
  ];

  return {
    overlay: 'lab',
    actionLabel: 'Breeding',
    actor,
    lab: labState,
    steps,
    totalDuration: 5.5,
  };
}

function precomputeDonate(state) {
  const idx = state.inventory.findIndex(i => i.kind === 'organism');
  if (idx < 0) return null;

  const actor = {
    inventory: state.inventory.map(i => ({ ...i })),
    wallet: state.wallet || 0,
    selectedSlot: idx,
  };

  const steps = [
    {
      duration: 1.0,
      apply(gs, actor) {
        actor.selectedSlot = idx;
        gs.spectatorLabel = 'Browsing collection...';
      },
    },
    {
      duration: 1.5,
      apply(gs, actor) {
        gs.spectatorLabel = 'Donating specimen...';
      },
    },
  ];

  return {
    overlay: 'museum',
    actionLabel: 'Donating',
    actor,
    steps,
    totalDuration: 2.5,
  };
}

function precomputeCraft(state, task) {
  const recipe = RECIPES.find(r => r.id === task.data.recipeId);
  if (!recipe) return null;
  if (!canCraft(recipe, state.inventory)) return null;

  const actor = {
    inventory: state.inventory.map(i => ({ ...i })),
    wallet: state.wallet || 0,
    selectedSlot: 0,
  };

  const recipeIdx = RECIPES.indexOf(recipe);

  const steps = [
    {
      duration: 1.5,
      apply(gs, actor) {
        gs.craftCursor = recipeIdx;
        gs.spectatorLabel = `Selecting ${recipe.name}...`;
      },
    },
    {
      duration: 1.0,
      apply(gs, actor) {
        gs.spectatorLabel = `Crafting ${recipe.name}!`;
      },
    },
  ];

  return {
    overlay: 'crafting',
    actionLabel: 'Crafting',
    actor,
    steps,
    totalDuration: 2.5,
  };
}
