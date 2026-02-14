// Save/load (localStorage), serialization

import { serializeCollection } from './collection.js';
import { serializeWilds, deserializeWilds } from './wild.js';
import { TILE } from './world.js';

const SAVE_KEY = 'biomorph-farm-save';

export function saveGame(gameState, player, world, planted, inventory, collection, npcStates, wilds) {
  const tutState = gameState.tutorialState;
  const dState = gameState.dawkinsState;
  const data = {
    version: 7,
    day: gameState.day,
    dayTimer: gameState.dayTimer,
    playerX: player.x,
    playerY: player.y,
    playerFacing: player.facing,
    wallet: player.wallet,
    selectedSlot: player.selectedSlot,
    world: world,
    planted: planted.map(serializeOrganism),
    inventory: inventory.map(serializeItem),
    collection: serializeCollection(collection),
    shopStock: (gameState.shopStock || []).map(serializeOrganism),
    npcStates: (npcStates || []).map(serializeNpcState),
    wilds: wilds ? serializeWilds(wilds) : [],
    tutorialState: tutState ? { active: tutState.active, stepIdx: tutState.stepIdx, completed: tutState.completed } : null,
    dawkinsCompletedVisits: dState ? dState.completedVisits : 0,
    savedAt: Date.now(),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Save failed:', e);
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data.version) return null;

    // Migration: v3 -> v4: add kind:'organism' to all inventory items
    if (data.version < 4) {
      data.inventory = (data.inventory || []).map(item => {
        if (!item.kind) item.kind = 'organism';
        return item;
      });
      data.planted = (data.planted || []).map(item => {
        if (!item.kind) item.kind = 'organism';
        return item;
      });
      if (data.shopStock) {
        data.shopStock = data.shopStock.map(item => {
          if (!item.kind) item.kind = 'organism';
          return item;
        });
      }
      if (data.npcStates) {
        for (const ns of data.npcStates) {
          ns.planted = (ns.planted || []).map(item => { if (!item.kind) item.kind = 'organism'; return item; });
          ns.inventory = (ns.inventory || []).map(item => { if (!item.kind) item.kind = 'organism'; return item; });
        }
      }
      // No wilds data in v3 saves — will be initialized fresh
      data.wilds = null;
    }

    // Migration: v5 -> v6: add tutorial and dawkins state
    if (data.version < 6) {
      data.tutorialState = { active: false, stepIdx: 0, completed: true }; // skip for existing saves
      data.dawkinsCompletedVisits = 0;
      // Add Sage NPC state if missing
      if (data.npcStates && data.npcStates.length < 4) {
        data.npcStates.push({
          id: 'sage',
          x: 15 * 48 + 24, y: 8 * 48 + 24,
          facing: 'down',
          targetX: 15 * 48 + 24, targetY: 8 * 48 + 24,
          waitTimer: 2, moving: false,
          wanderRadius: 3, // existing saves: Sage wanders immediately
          planted: [], inventory: [], dialogIdx: 0,
        });
      }
    }

    // Migration: v6 -> v7: add NPC wallets, cottages, extra plots
    if (data.version < 7) {
      for (const ns of (data.npcStates || [])) {
        if (ns.wallet == null) ns.wallet = 50;
        ns.task = null;
      }
      // Add NPC cottage building tiles
      if (data.world) {
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            data.world[8 + dy][7 + dx] = TILE.BUILDING;   // Fern's cottage
            data.world[8 + dy][22 + dx] = TILE.BUILDING;   // Moss's cottage
          }
        // Add new dirt plots
        data.world[9][9] = TILE.DIRT; data.world[10][9] = TILE.DIRT;
        data.world[9][24] = TILE.DIRT; data.world[10][24] = TILE.DIRT;
        // Remove conflicting trees
        if (data.world[3][10] === TILE.TREE) data.world[3][10] = TILE.GRASS;
        if (data.world[3][20] === TILE.TREE) data.world[3][20] = TILE.GRASS;
        if (data.world[3][21] === TILE.TREE) data.world[3][21] = TILE.GRASS;
      }
    }

    data.planted = (data.planted || []).map(deserializeItem);
    data.inventory = (data.inventory || []).map(deserializeItem);
    if (data.shopStock) data.shopStock = data.shopStock.map(deserializeItem);
    if (data.npcStates) {
      for (const ns of data.npcStates) {
        ns.planted = (ns.planted || []).map(deserializeItem);
        ns.inventory = (ns.inventory || []).map(deserializeItem);
        ns.wallet = ns.wallet || 0;
        ns.task = null; // tasks are not saved — NPCs resume idle on load
        ns.lastSellDay = ns.lastSellDay || 0;
      }
    }
    // Deserialize wilds
    data.wilds = data.wilds ? deserializeWilds(data.wilds) : null;

    return data;
  } catch (e) {
    console.warn('Load failed:', e);
    return null;
  }
}

export function hasSave() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}

// Serialize any inventory item (organism, material, tool, or product)
function serializeItem(item) {
  if (item.kind === 'material') return { ...item };
  if (item.kind === 'tool') return { ...item };
  if (item.kind === 'product') return { ...item };
  return serializeOrganism(item);
}

// Deserialize any inventory item
function deserializeItem(data) {
  if (data.kind === 'material') return { ...data };
  if (data.kind === 'tool') return { ...data };
  if (data.kind === 'product') return { ...data };
  return deserializeOrganism(data);
}

function serializeOrganism(org) {
  return {
    kind: org.kind || 'organism',
    id: org.id,
    genes: org.genes,
    mode: org.mode,
    colorGenes: org.colorGenes,
    farmGenes: org.farmGenes,
    stage: org.stage,
    growthProgress: org.growthProgress,
    matureDays: org.matureDays,
    harvestsLeft: org.harvestsLeft,
    plantedDay: org.plantedDay,
    tileCol: org.tileCol,
    tileRow: org.tileRow,
  };
}

function deserializeOrganism(data) {
  if (!data.kind) data.kind = 'organism';
  return { ...data };
}

function serializeNpcState(ns) {
  return {
    id: ns.id,
    x: ns.x,
    y: ns.y,
    facing: ns.facing,
    targetX: ns.targetX,
    targetY: ns.targetY,
    waitTimer: ns.waitTimer,
    moving: ns.moving,
    wanderRadius: ns.wanderRadius,
    planted: ns.planted.map(serializeOrganism),
    inventory: ns.inventory.map(serializeItem),
    dialogIdx: ns.dialogIdx,
    wallet: ns.wallet || 0,
    lastSellDay: ns.lastSellDay || 0,
  };
}
