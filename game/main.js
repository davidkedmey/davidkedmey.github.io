// Entry point: init, RAF game loop, day cycle

import { createWorld, TILE, tileAt, isSolid, TILE_SIZE, COLS, ROWS, nearbyBuilding, BUILDINGS, buildingDoorPos } from './world.js';
import { createPlayer, updatePlayer, facingTile } from './player.js';
import { createInput } from './input.js';
import { render, updateCamera, CANVAS_W, CANVAS_H } from './renderer.js';
import { createSeed, tickGrowth, harvest } from './organisms.js';
import { sellPrice, buyPrice, generateShopStock } from './economy.js';
import { createBreedingLab, labSelectParent, labSelectOffspring, labConfirm, labReset } from './breeding.js';
import { createCollection, donate, recordSale, recordBreed, serializeCollection, deserializeCollection } from './collection.js';
import { saveGame, loadGame, hasSave } from './state.js';
import { NPCS, initNPCs, updateNPCs, nearbyNPC, executeTrade } from './npcs.js';
import { harvestMaterials, addMaterialToInventory, analyzeBiomorph, MATERIAL_TYPES } from './materials.js';
import { initWildBiomorphs, wildDayTick, getWildOrganism, removeWildOrganism } from './wild.js';
import { RECIPES, canCraft, executeCraft, useTool, addProductToInventory } from './crafting.js';
import { createTutorialState, updateTutorial, getTutorialSpeech, TUTORIAL_STEPS, SAGE_TIPS, createSageShowState, updateSageShow, getSageShowSpeech } from './tutorial.js';
import { buildOwnershipGrid, isPlayerProperty } from './property.js';
import { aiDayTick, updateAITasks, getNarration, precomputeSpectatorAction } from './ai.js';
import { loadDawkinsDialogue, createDawkinsState, canStartVisit, startVisit, advanceLine, selectChoice, getCurrentLine, completeVisit } from './dawkins.js';
import { loadAudioSettings, getAudioSettings, initOnInteraction, toggleMusic, toggleVoice, toggleAutoFollow, startMusic, stopMusic, setMusicMood, speak, stopSpeech, resetLastSpoken } from './audio.js';
import { loadLLMSettings, getLLMSettings, setLLMSetting, interpretCommand, buildGameContext } from './llm.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const world = createWorld();
buildOwnershipGrid();
const player = createPlayer();
const input = createInput(canvas);

const planted = [];
const lab = createBreedingLab();
let collection = createCollection();
let npcStates = initNPCs(world);
let wilds = initWildBiomorphs(world);
const cam = { x: player.x - 480, y: player.y - 360 }; // center on player

// ── Tutorial + Dawkins ──
let tutorialState = createTutorialState();
const dawkinsState = createDawkinsState();
const sageShowState = createSageShowState();
loadDawkinsDialogue().then(data => { dawkinsState.dialogueData = data; }).catch(() => {});
loadAudioSettings();
loadLLMSettings();
initOnInteraction();
let musicStarted = false;

// ── Intro screens ──
const INTRO_PAGES = [
  {
    text: [
      "An old letter, folded many times...",
    ],
    style: 'italic',
  },
  {
    text: [
      "\"Dear friend,",
      "",
      "If you're reading this, it means my",
      "research station on Biomorph Island",
      "is finally in your hands.\"",
    ],
  },
  {
    text: [
      "\"For decades, I studied the creatures here —",
      "biomorphs, we call them. They grow from seeds,",
      "shaped by invisible genes. Each generation,",
      "they change. Sometimes beautifully.",
      "Sometimes strangely. Always surprisingly.\"",
    ],
  },
  {
    text: [
      "\"The farm is modest. The shop will buy",
      "what you grow. The museum awaits your",
      "discoveries. And when you're ready,",
      "the breeding lab will unlock possibilities",
      "I only dreamed of.\"",
    ],
  },
  {
    text: [
      "\"Your neighbors Fern and Moss are good folk —",
      "they've been tending biomorphs here for years.",
      "Watch what they grow. Trade with them.",
      "You'll learn a lot.\"",
    ],
  },
  {
    text: [
      "\"Your task is simple:",
      "grow, discover, evolve.\"",
      "",
      "With great anticipation,",
      "Professor R. Dawkins",
    ],
    style: 'signature',
  },
];

const gameState = {
  phase: 'title',  // 'title' | 'intro' | 'playing'
  titleCursor: 0,  // 0 = New Game, 1 = Continue
  introPage: 0,
  introFade: 0,
  day: 1,
  dayTimer: 0,
  DAY_LENGTH: 30,   // 30 seconds per day (was 10)
  timeSkip: false,   // true when holding T for fast-forward
  timeSkipSticky: false, // toggled via command bar "time" command
  message: null,
  overlay: null,  // 'shop' | 'lab' | 'museum' | 'trade' | 'inventory' | 'crafting' | null
  shopStock: [],
  shopCursor: 0,
  shopSide: 0,    // 0 = for-sale panel, 1 = your-items panel
  museumScroll: 0,
  // Trade state
  tradeNpcIdx: -1,
  tradeCursor: 0,   // 0 = NPC side, 1 = player side
  tradeNpcSlot: 0,
  tradePlayerSlot: 0,
  craftCursor: 0,
  // Follow NPC mode
  followNpcIdx: -1,       // index into npcStates, or -1 if not following
  followNarration: null,   // { text, timer } current narration bubble
  followNarrationCooldown: 0, // prevents rapid narration changes
  followLastTaskKey: null, // tracks task type+phase for change detection
  // Spectator mode (watching NPC at building)
  spectator: null,
  // Command bar
  commandBar: { active: false, text: '' },
  // Auto-walk target (set by /go command)
  walkTarget: null, // { x, y, label, onArrive?, npcIdx? }
  // Dance spin timer
  playerSpin: 0,
  // Pause
  paused: false,
  // Camera pan (right-click drag)
  cameraPanOffset: { x: 0, y: 0 },
  cameraPanTimer: 0,       // countdown to ease back after mouse release
  // AI command interpretation
  aiThinking: false,
};

// Default inventory
for (let i = 0; i < 3; i++) player.inventory.push(createSeed(1));
gameState.shopStock = generateShopStock(collection.unlockedModes);

// What's New — show once per version
const GAME_VERSION = 7;
const whatsNewKey = `biomorph-farm-whatsnew-v${GAME_VERSION}`;
gameState.showWhatsNew = !localStorage.getItem(whatsNewKey);

// ── Save/Load ──
const savedGame = loadGame();
gameState.hasSave = !!savedGame;

function applySave(save) {
  gameState.phase = 'playing';
  gameState.day = save.day;
  gameState.dayTimer = save.dayTimer;
  player.x = save.playerX;
  player.y = save.playerY;
  player.facing = save.playerFacing;
  player.wallet = save.wallet;
  player.selectedSlot = save.selectedSlot;
  for (let r = 0; r < save.world.length; r++)
    for (let c = 0; c < save.world[r].length; c++)
      world[r][c] = save.world[r][c];
  planted.length = 0;
  planted.push(...save.planted);
  player.inventory = save.inventory;
  if (save.collection) collection = deserializeCollection(save.collection);
  if (save.shopStock) gameState.shopStock = save.shopStock;
  if (save.npcStates) npcStates = save.npcStates;
  if (save.wilds) wilds = save.wilds;
  else wilds = initWildBiomorphs(world);
  if (save.tutorialState) {
    tutorialState = {
      ...createTutorialState(),
      active: save.tutorialState.active,
      stepIdx: save.tutorialState.stepIdx,
      completed: save.tutorialState.completed,
      phase: save.tutorialState.completed ? 'walking' : 'walking',
    };
    if (tutorialState.completed) tutorialState.active = false;
  }
  if (save.dawkinsCompletedVisits != null) {
    dawkinsState.completedVisits = save.dawkinsCompletedVisits;
  }
  showMessage('Game loaded!');
}

function startNewGame() {
  localStorage.removeItem('biomorph-farm-save');
  gameState.phase = 'intro';
  gameState.introPage = 0;
  gameState.introFade = 0;
  tutorialState = createTutorialState();
}

// Attach to gameState for renderer + save access
gameState.tutorialState = tutorialState;
gameState.dawkinsState = dawkinsState;

function doSave() {
  gameState.tutorialState = tutorialState;
  gameState.dawkinsState = dawkinsState;
  saveGame(gameState, player, world, planted, player.inventory, collection, npcStates, wilds);
}

function showMessage(text, duration) {
  const lines = Array.isArray(text) ? text : [text];
  gameState.message = { lines, timer: duration || 2.5 };
}

// ── World Actions ──

function handleWorldAction() {
  // ── Tool / product actions ──
  const selected = player.inventory[player.selectedSlot];
  if (selected) {
    const ft0 = facingTile(player);
    const tile0 = tileAt(world, ft0.col, ft0.row);

    // Hoe: plow facing tile + next tile in same direction
    if (selected.kind === 'tool' && selected.toolType === 'hoe' && tile0 === TILE.GRASS) {
      if (!isPlayerProperty(ft0.col, ft0.row)) {
        showMessage("That's someone else's property!"); return;
      }
      world[ft0.row][ft0.col] = TILE.DIRT;
      // Second tile in same direction
      const dir = { up: [0,-1], down: [0,1], left: [-1,0], right: [1,0] }[player.facing];
      const c2 = ft0.col + dir[0], r2 = ft0.row + dir[1];
      if (c2 >= 0 && c2 < COLS && r2 >= 0 && r2 < ROWS && tileAt(world, c2, r2) === TILE.GRASS) {
        if (isPlayerProperty(c2, r2)) world[r2][c2] = TILE.DIRT;
      }
      if (!useTool(selected)) {
        player.inventory.splice(player.selectedSlot, 1);
        if (player.selectedSlot >= player.inventory.length && player.inventory.length > 0)
          player.selectedSlot = player.inventory.length - 1;
        showMessage('Hoe broke!');
      } else {
        showMessage('Plowed!');
      }
      return;
    }

    // Spear: forage materials from wild tree (non-destructive)
    if (selected.kind === 'tool' && selected.toolType === 'spear' && tile0 === TILE.TREE) {
      const wildOrg = getWildOrganism(wilds, ft0.col, ft0.row);
      if (wildOrg) {
        if (wildOrg.lastForagedDay === gameState.day) {
          showMessage('Already foraged this tree today.');
          return;
        }
        const materials = harvestMaterials(wildOrg);
        const parts = [];
        for (const mat of materials) {
          addMaterialToInventory(player.inventory, mat);
          const mt = MATERIAL_TYPES[mat.materialType];
          parts.push(`+${mat.quantity} ${mt.name.toLowerCase()}`);
        }
        wildOrg.lastForagedDay = gameState.day;
        if (!useTool(selected)) {
          player.inventory.splice(player.selectedSlot, 1);
          if (player.selectedSlot >= player.inventory.length && player.inventory.length > 0)
            player.selectedSlot = player.inventory.length - 1;
          showMessage(`Foraged! ${parts.join(', ')} — Spear broke!`);
        } else {
          showMessage(`Foraged! ${parts.join(', ')}`);
        }
      }
      return;
    }

    // Axe: chop wild tree — 2x materials, remove tree
    if (selected.kind === 'tool' && selected.toolType === 'axe' && tile0 === TILE.TREE) {
      const wildOrg = getWildOrganism(wilds, ft0.col, ft0.row);
      if (wildOrg) {
        const materials = harvestMaterials(wildOrg);
        const parts = [];
        for (const mat of materials) {
          mat.quantity *= 2; // 2x yield
          addMaterialToInventory(player.inventory, mat);
          const mt = MATERIAL_TYPES[mat.materialType];
          parts.push(`+${mat.quantity} ${mt.name.toLowerCase()}`);
        }
        // Remove tree
        world[ft0.row][ft0.col] = TILE.GRASS;
        removeWildOrganism(wilds, ft0.col, ft0.row);
        if (!useTool(selected)) {
          player.inventory.splice(player.selectedSlot, 1);
          if (player.selectedSlot >= player.inventory.length && player.inventory.length > 0)
            player.selectedSlot = player.inventory.length - 1;
          showMessage(`Chopped! ${parts.join(', ')} — Axe broke!`);
        } else {
          showMessage(`Chopped! ${parts.join(', ')}`);
        }
      }
      return;
    }

    // Fence product: place fence tile on grass
    if (selected.kind === 'product' && selected.productType === 'fence' && tile0 === TILE.GRASS) {
      world[ft0.row][ft0.col] = TILE.FENCE;
      selected.quantity--;
      if (selected.quantity <= 0) {
        player.inventory.splice(player.selectedSlot, 1);
        if (player.selectedSlot >= player.inventory.length && player.inventory.length > 0)
          player.selectedSlot = player.inventory.length - 1;
      }
      showMessage('Fence placed!');
      return;
    }
  }

  // Check NPC interaction first
  const nearby = nearbyNPC(player.x, player.y, npcStates);
  if (nearby) {
    const npc = nearby.npc;
    // Sage interactions
    if (npc.role === 'guide') {
      // During tutorial: hint to follow
      if (tutorialState.active && !tutorialState.completed) {
        showMessage('Sage: "Keep following me!"', 2);
        return;
      }
      // Post-tutorial: accept offer to show
      if (sageShowState.phase === 'offered') {
        sageShowState.phase = 'walking';
        return;
      }
      // Post-tutorial: ignore if already showing
      if (sageShowState.phase === 'walking' || sageShowState.phase === 'arrived') return;
      // Post-tutorial: give tip + offer to show
      const tipIdx = nearby.state.dialogIdx % SAGE_TIPS.length;
      nearby.state.dialogIdx++;
      const tip = SAGE_TIPS[tipIdx];
      if (tip.targetCol != null) {
        sageShowState.phase = 'tip';
        sageShowState.tipIdx = tipIdx;
        sageShowState.timer = 3.5;
      } else {
        showMessage(`Sage: "${tip.tip}"`, 3);
      }
      return;
    }
    if (npc.role === 'farmer' && nearby.state.inventory.length > 0) {
      // Open trade
      gameState.overlay = 'trade';
      gameState.tradeNpcIdx = nearby.index;
      gameState.tradeCursor = 0;
      gameState.tradeNpcSlot = 0;
      gameState.tradePlayerSlot = player.selectedSlot;
      return;
    }
    // Shopkeeper or farmer with no items: show dialog
    const dialog = npc.dialogIdle[nearby.state.dialogIdx % npc.dialogIdle.length];
    nearby.state.dialogIdx++;
    showMessage(`${npc.name}: "${dialog}"`, 3);
    return;
  }

  const ft = facingTile(player);
  const tile = tileAt(world, ft.col, ft.row);

  // Near building
  const building = nearbyBuilding(player.x, player.y);
  if (building) {
    if (building.id === 'shop') { gameState.overlay = 'shop'; gameState.shopCursor = 0; gameState.shopSide = 0; return; }
    if (building.id === 'lab') {
      if (!collection.labUnlocked) { showMessage('Lab locked — donate 5 specimens first.'); return; }
      gameState.overlay = 'lab'; lab.active = true; lab.step = 'select1'; return;
    }
    if (building.id === 'museum') { gameState.overlay = 'museum'; gameState.museumScroll = 0; return; }
    if (building.id === 'house') { gameState.overlay = 'crafting'; gameState.craftCursor = 0; return; }
    if (building.id === 'fern_house') { showMessage("That's Fern's cottage."); return; }
    if (building.id === 'moss_house') { showMessage("That's Moss's cottage."); return; }
    if (building.id === 'study') {
      if (!dawkinsState.dialogueData) { showMessage('The door is locked...'); return; }
      if (!canStartVisit(dawkinsState)) {
        showMessage('Dawkins: "The Mac is yours whenever you want it."');
        return;
      }
      startVisit(dawkinsState);
      gameState.overlay = 'dawkins';
      setMusicMood('study');
      // Speak first line
      const firstLine = getCurrentLine(dawkinsState);
      if (firstLine && firstLine.text) speak(firstLine.text, 'dawkins');
      return;
    }
  }

  // Forage from wild trees
  if (tile === TILE.TREE) {
    const wildOrg = getWildOrganism(wilds, ft.col, ft.row);
    if (wildOrg) {
      const analysis = analyzeBiomorph(wildOrg.genes);
      const yields = [];
      if (analysis.wood > 0) yields.push(`${analysis.wood} wood`);
      if (analysis.fiber > 0) yields.push(`${analysis.fiber} fiber`);
      if (analysis.fruit > 0) yields.push(`${analysis.fruit} fruit`);
      if (analysis.resin > 0) yields.push(`${analysis.resin} resin`);
      const yieldStr = yields.length > 0 ? yields.join(', ') : 'nothing useful';
      showMessage(`Wild tree (D${wildOrg.genes[8]}): yields ${yieldStr}`, 3.5);
    }
    return;
  }

  // Plow
  if (tile === TILE.GRASS) {
    doPlow();
    return;
  }

  // Dirt tile
  if (tile === TILE.DIRT) {
    if (!isPlayerProperty(ft.col, ft.row)) {
      showMessage("That's someone else's property!");
      return;
    }
    const existing = planted.find(o => o.tileCol === ft.col && o.tileRow === ft.row);
    if (existing && existing.stage === 'mature') { doHarvest(); return; }
    if (existing && existing.stage === 'growing') {
      const left = existing.matureDays - existing.growthProgress;
      showMessage(`Growing... ${left} day${left !== 1 ? 's' : ''} left`);
      return;
    }
    if (!existing && player.inventory.length > 0) { doPlant(); return; }
    if (!existing && player.inventory.length === 0) { showMessage('No seeds'); return; }
  }
}

// ── Shop ──
function handleShopInput() {
  if (input.justPressed('Escape')) { gameState.overlay = null; return; }
  const side = gameState.shopSide || 0;
  const items = side === 0 ? gameState.shopStock : player.inventory;

  // Switch panels
  if (input.justPressed('ArrowLeft') && side === 1) {
    gameState.shopSide = 0;
    gameState.shopCursor = Math.min(gameState.shopCursor, Math.max(0, gameState.shopStock.length - 1));
  }
  if (input.justPressed('ArrowRight') && side === 0) {
    gameState.shopSide = 1;
    gameState.shopCursor = Math.min(gameState.shopCursor, Math.max(0, player.inventory.length - 1));
  }

  // Navigate within panel
  if (input.justPressed('ArrowUp')) gameState.shopCursor = Math.max(0, gameState.shopCursor - 1);
  if (input.justPressed('ArrowDown')) gameState.shopCursor = Math.min(items.length - 1, gameState.shopCursor + 1);

  // Buy/Sell
  if (input.justPressed(' ')) {
    if (side === 0 && gameState.shopCursor < gameState.shopStock.length) {
      const item = gameState.shopStock[gameState.shopCursor];
      const price = buyPrice(item);
      if (player.wallet >= price) {
        player.wallet -= price;
        player.inventory.push(item);
        gameState.shopStock.splice(gameState.shopCursor, 1);
        if (gameState.shopCursor >= gameState.shopStock.length)
          gameState.shopCursor = Math.max(0, gameState.shopStock.length - 1);
        showMessage(`Bought! -${price}g`);
      } else { showMessage('Not enough gold!'); }
    } else if (side === 1 && gameState.shopCursor < player.inventory.length) {
      const item = player.inventory[gameState.shopCursor];
      if (item) {
        let price = sellPrice(item);
        if (item.kind === 'material') {
          player.inventory.splice(gameState.shopCursor, 1);
          player.wallet += price;
          showMessage(`Sold ${MATERIAL_TYPES[item.materialType]?.name || 'material'} ${price}g`);
        } else if (item.kind === 'tool') {
          player.inventory.splice(gameState.shopCursor, 1);
          player.wallet += price;
          showMessage(`Sold ${item.toolType} ${price}g`);
        } else if (item.kind === 'product') {
          player.inventory.splice(gameState.shopCursor, 1);
          player.wallet += price;
          showMessage(`Sold ${item.productType} ${price}g`);
        } else {
          player.inventory.splice(gameState.shopCursor, 1);
          const isNew = recordSale(collection, item);
          if (isNew) { price = Math.floor(price * 1.5); showMessage(`Sold ${price}g (NEW species!)`); }
          else { showMessage(`Sold ${price}g`); }
          player.wallet += price;
        }
        if (gameState.shopCursor >= player.inventory.length)
          gameState.shopCursor = Math.max(0, player.inventory.length - 1);
        if (player.selectedSlot >= player.inventory.length && player.inventory.length > 0)
          player.selectedSlot = player.inventory.length - 1;
      }
    }
  }
}

// ── Lab ──
function handleLabInput() {
  if (input.justPressed('Escape')) { labReset(lab); gameState.overlay = null; return; }
  if (lab.step === 'select1' || lab.step === 'select2') {
    for (let i = 1; i <= 9; i++) {
      if (input.justPressed(String(i))) {
        // Only allow selecting organisms for breeding, not materials
        const idx = i - 1;
        if (idx < player.inventory.length && player.inventory[idx].kind !== 'organism') {
          showMessage("Can only breed organisms!");
          continue;
        }
        labSelectParent(lab, player, idx);
        if (lab.step === 'offspring') recordBreed(collection);
      }
    }
  } else if (lab.step === 'offspring') {
    for (let i = 1; i <= 4; i++) {
      if (input.justPressed(String(i))) labSelectOffspring(lab, i - 1);
    }
    if (input.justPressed(' ') || input.justPressed('Enter')) {
      if (labConfirm(lab, player)) {
        showMessage('Offspring added!');
        labReset(lab);
        gameState.overlay = null;
      }
    }
  }
}

// ── Museum ──
function handleMuseumInput() {
  if (input.justPressed('Escape')) { gameState.overlay = null; return; }
  if (input.justPressed(' ') && player.inventory.length > 0) {
    const item = player.inventory[player.selectedSlot];
    // Only donate organisms
    if (item && item.kind !== 'organism') {
      showMessage("Can only donate organisms!");
      return;
    }
    if (item) {
      player.inventory.splice(player.selectedSlot, 1);
      const isNew = donate(collection, item, gameState.day);
      showMessage(isNew ? 'New species donated!' : 'Specimen donated.');
      if (player.selectedSlot >= player.inventory.length && player.inventory.length > 0)
        player.selectedSlot = player.inventory.length - 1;
    }
  }
  if (input.justPressed('ArrowDown')) gameState.museumScroll = Math.min(gameState.museumScroll + 1, Math.max(0, Math.floor(collection.donated.length / 8)));
  if (input.justPressed('ArrowUp')) gameState.museumScroll = Math.max(0, gameState.museumScroll - 1);
}

// ── Trade ──
function handleTradeInput() {
  if (input.justPressed('Escape')) { gameState.overlay = null; return; }
  const ns = npcStates[gameState.tradeNpcIdx];
  if (!ns) { gameState.overlay = null; return; }

  // Tab/left-right to switch between NPC and player side
  if (input.justPressed('ArrowLeft') || input.justPressed('ArrowRight')) {
    gameState.tradeCursor = gameState.tradeCursor === 0 ? 1 : 0;
  }
  // Up/down to select slot
  if (input.justPressed('ArrowUp')) {
    if (gameState.tradeCursor === 0) gameState.tradeNpcSlot = Math.max(0, gameState.tradeNpcSlot - 1);
    else gameState.tradePlayerSlot = Math.max(0, gameState.tradePlayerSlot - 1);
  }
  if (input.justPressed('ArrowDown')) {
    if (gameState.tradeCursor === 0) gameState.tradeNpcSlot = Math.min(ns.inventory.length - 1, gameState.tradeNpcSlot + 1);
    else gameState.tradePlayerSlot = Math.min(player.inventory.length - 1, gameState.tradePlayerSlot + 1);
  }
  // Space to execute trade
  if (input.justPressed(' ')) {
    if (ns.inventory.length > 0 && player.inventory.length > 0) {
      // Only trade organisms to NPCs
      const playerItem = player.inventory[gameState.tradePlayerSlot];
      if (playerItem && playerItem.kind !== 'organism') {
        showMessage("NPCs only want organisms... for now.");
        return;
      }
      if (executeTrade(ns, gameState.tradeNpcSlot, player, gameState.tradePlayerSlot)) {
        showMessage('Traded!');
      }
    } else {
      showMessage('Need items on both sides to trade.');
    }
  }
}

// ── Crafting ──
function handleCraftingInput() {
  if (input.justPressed('Escape')) { gameState.overlay = null; return; }
  if (input.justPressed('s') || input.justPressed('S')) { doSave(); showMessage('Game saved!'); return; }
  if (input.justPressed('ArrowUp')) gameState.craftCursor = Math.max(0, gameState.craftCursor - 1);
  if (input.justPressed('ArrowDown')) gameState.craftCursor = Math.min(RECIPES.length - 1, gameState.craftCursor + 1);
  if (input.justPressed(' ')) {
    const recipe = RECIPES[gameState.craftCursor];
    if (!recipe) return;
    if (!canCraft(recipe, player.inventory)) {
      showMessage("Missing materials!");
      return;
    }
    const item = executeCraft(recipe, player.inventory);
    if (item.kind === 'product') {
      addProductToInventory(player.inventory, item);
    } else {
      player.inventory.push(item);
    }
    showMessage(`Crafted ${recipe.name}!`);
  }
}

// ── Dawkins ──
function handleDawkinsInput() {
  if (input.justPressed('Escape')) {
    gameState.overlay = null;
    stopSpeech();
    setMusicMood('farm');
    return;
  }

  const line = getCurrentLine(dawkinsState);
  if (!line) {
    completeVisit(dawkinsState);
    gameState.overlay = null;
    stopSpeech();
    setMusicMood('farm');
    showMessage(`Visit ${dawkinsState.completedVisits} complete!`);
    doSave();
    return;
  }

  if (dawkinsState.choiceActive) {
    if (input.justPressed('ArrowUp')) {
      dawkinsState.choiceCursor = Math.max(0, dawkinsState.choiceCursor - 1);
    }
    if (input.justPressed('ArrowDown')) {
      const choiceLine = getCurrentLine(dawkinsState);
      if (choiceLine && choiceLine.options) {
        dawkinsState.choiceCursor = Math.min(choiceLine.options.length - 1, dawkinsState.choiceCursor + 1);
      }
    }
    if (input.justPressed(' ') || input.justPressed('Enter')) {
      selectChoice(dawkinsState, dawkinsState.choiceCursor);
      const resp = getCurrentLine(dawkinsState);
      if (resp && resp.text) speak(resp.text, 'dawkins');
    }
  } else {
    if (input.justPressed(' ') || input.justPressed('Enter')) {
      advanceLine(dawkinsState);
      const newLine = getCurrentLine(dawkinsState);
      if (newLine && newLine.text && newLine.speaker === 'dawkins') {
        speak(newLine.text, 'dawkins');
      } else if (newLine && newLine.interactive) {
        speak(newLine.interactive.prompt || '', 'dawkins');
      }
    }
  }
}

// ── Inventory ──
function handleInventoryInput() {
  if (input.justPressed('Escape')) { gameState.overlay = null; return; }
  const max = player.inventory.length;
  const cols = 3;
  if (input.justPressed('ArrowUp') && player.selectedSlot >= cols)
    player.selectedSlot -= cols;
  if (input.justPressed('ArrowDown') && player.selectedSlot + cols < max)
    player.selectedSlot += cols;
  if (input.justPressed('ArrowLeft') && player.selectedSlot > 0)
    player.selectedSlot--;
  if (input.justPressed('ArrowRight') && player.selectedSlot < max - 1)
    player.selectedSlot++;
  if (player.selectedSlot >= max && max > 0)
    player.selectedSlot = max - 1;
}

// ── Auto-follow ──

const PLAYER_HALF = 14; // half of PLAYER_SIZE (28)

function canAutoMoveTo(x, y) {
  return !isSolid(tileAt(world, Math.floor((x - PLAYER_HALF) / TILE_SIZE), Math.floor((y - PLAYER_HALF) / TILE_SIZE)))
      && !isSolid(tileAt(world, Math.floor((x + PLAYER_HALF - 1) / TILE_SIZE), Math.floor((y - PLAYER_HALF) / TILE_SIZE)))
      && !isSolid(tileAt(world, Math.floor((x - PLAYER_HALF) / TILE_SIZE), Math.floor((y + PLAYER_HALF - 1) / TILE_SIZE)))
      && !isSolid(tileAt(world, Math.floor((x + PLAYER_HALF - 1) / TILE_SIZE), Math.floor((y + PLAYER_HALF - 1) / TILE_SIZE)));
}

function autoFollowSage(sageState, dt, ignoreCollision) {
  if (!sageState) return;
  const dx = sageState.x - player.x;
  const dy = sageState.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < TILE_SIZE * 2) return; // close enough

  const speed = 180 * dt; // match player speed
  const nx = (dx / dist) * speed;
  const ny = (dy / dist) * speed;

  if (ignoreCollision) {
    // Tutorial tour mode: follow Sage through any terrain
    player.x += nx;
    player.y += ny;
  } else {
    // Try X and Y independently (allows wall sliding)
    if (canAutoMoveTo(player.x + nx, player.y)) player.x += nx;
    if (canAutoMoveTo(player.x, player.y + ny)) player.y += ny;
  }
  // Update facing
  if (Math.abs(dx) > Math.abs(dy)) {
    player.facing = dx > 0 ? 'right' : 'left';
  } else {
    player.facing = dy > 0 ? 'down' : 'up';
  }
}

// ── Follow NPC ──

function autoFollowNPC(targetState, dt) {
  if (!targetState) return;
  const dx = targetState.x - player.x;
  const dy = targetState.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < TILE_SIZE * 2.5) return; // trail behind at a comfortable distance

  const speed = 180 * dt;
  const nx = (dx / dist) * speed;
  const ny = (dy / dist) * speed;

  // Wall-sliding collision
  if (canAutoMoveTo(player.x + nx, player.y)) player.x += nx;
  if (canAutoMoveTo(player.x, player.y + ny)) player.y += ny;
  // Update facing
  if (Math.abs(dx) > Math.abs(dy)) {
    player.facing = dx > 0 ? 'right' : 'left';
  } else {
    player.facing = dy > 0 ? 'down' : 'up';
  }
}

function startFollowNPC(idx) {
  gameState.followNpcIdx = idx;
  gameState.followNarration = null;
  gameState.followNarrationCooldown = 0;
  gameState.followLastTaskKey = null;
  gameState.cameraPanOffset.x = 0;
  gameState.cameraPanOffset.y = 0;
  gameState.cameraPanTimer = 0;
}

function stopFollowNPC() {
  gameState.followNpcIdx = -1;
  gameState.followNarration = null;
  gameState.followNarrationCooldown = 0;
  gameState.followLastTaskKey = null;
}

// ── Spectator Mode ──

function startSpectator(npcIdx, result) {
  if (!result) return;
  const npc = NPCS[npcIdx];
  gameState.spectator = {
    npcIdx,
    npcName: npc ? npc.name : '?',
    npcColor: npc ? npc.color : '#8ab4f8',
    overlay: result.overlay,
    actionLabel: result.actionLabel,
    steps: result.steps,
    stepIdx: 0,
    timer: 0,
    actor: result.actor,
    lab: result.lab || null,
    done: false,
  };
  gameState.overlay = result.overlay;
  // Apply the first step immediately
  if (result.steps.length > 0) {
    result.steps[0].apply(gameState, gameState.spectator.actor, gameState.spectator.lab);
  }
}

function stopSpectator() {
  gameState.spectator = null;
  gameState.spectatorLabel = null;
  gameState.overlay = null;
}

// ── Auto-Walk System ──

function autoWalkToTarget(dt) {
  const wt = gameState.walkTarget;
  if (!wt) return;
  // If tracking an NPC, update target position each frame
  if (wt.npcIdx != null && npcStates[wt.npcIdx]) {
    wt.x = npcStates[wt.npcIdx].x;
    wt.y = npcStates[wt.npcIdx].y;
  }
  const dx = wt.x - player.x;
  const dy = wt.y - player.y;
  const dist = Math.hypot(dx, dy);
  if (dist < TILE_SIZE * 1.2) {
    // Arrived
    if (wt.onArrive) wt.onArrive();
    gameState.walkTarget = null;
    return;
  }
  const speed = 180 * dt;
  const nx = (dx / dist) * speed;
  const ny = (dy / dist) * speed;
  if (canAutoMoveTo(player.x + nx, player.y)) player.x += nx;
  if (canAutoMoveTo(player.x, player.y + ny)) player.y += ny;
  if (Math.abs(dx) > Math.abs(dy)) {
    player.facing = dx > 0 ? 'right' : 'left';
  } else {
    player.facing = dy > 0 ? 'down' : 'up';
  }
}

// ── Target Resolution ──

const TARGET_ALIASES = {
  home: 'house', store: 'shop', dawkins: 'study',
};

function resolveTarget(name) {
  if (!name) return null;
  const key = name.toLowerCase().trim();
  const alias = TARGET_ALIASES[key] || key;
  // Check buildings
  const building = BUILDINGS.find(b => b.id === alias || b.name.toLowerCase() === alias);
  if (building) return { type: 'building', building };
  // Check NPCs
  const npcIdx = NPCS.findIndex(n => n.name.toLowerCase() === alias || n.id === alias);
  if (npcIdx >= 0) return { type: 'npc', idx: npcIdx };
  return null;
}

// ── Farming Helpers ──

function doPlant(slotIdx) {
  const ft = facingTile(player);
  const tile = tileAt(world, ft.col, ft.row);
  if (tile !== TILE.DIRT) { showMessage("Not facing a dirt tile."); return false; }
  if (!isPlayerProperty(ft.col, ft.row)) { showMessage("That's someone else's property!"); return false; }
  const existing = planted.find(o => o.tileCol === ft.col && o.tileRow === ft.row);
  if (existing) { showMessage("Something's already planted here."); return false; }
  const idx = slotIdx != null ? slotIdx : player.selectedSlot;
  if (idx < 0 || idx >= player.inventory.length) { showMessage('No item selected.'); return false; }
  const selected = player.inventory[idx];
  if (!selected || selected.kind !== 'organism') { showMessage("Can only plant organisms!"); return false; }
  const seed = player.inventory.splice(idx, 1)[0];
  seed.tileCol = ft.col; seed.tileRow = ft.row;
  seed.plantedDay = gameState.day; seed.stage = 'growing'; seed.growthProgress = 0;
  planted.push(seed);
  if (player.selectedSlot >= player.inventory.length && player.inventory.length > 0)
    player.selectedSlot = player.inventory.length - 1;
  showMessage('Planted!');
  return true;
}

function doHarvest() {
  const ft = facingTile(player);
  const tile = tileAt(world, ft.col, ft.row);
  if (tile !== TILE.DIRT) { showMessage("Not facing a dirt tile."); return false; }
  const existing = planted.find(o => o.tileCol === ft.col && o.tileRow === ft.row);
  if (!existing) { showMessage("Nothing planted here."); return false; }
  if (existing.stage !== 'mature') {
    const left = existing.matureDays - existing.growthProgress;
    showMessage(`Growing... ${left} day${left !== 1 ? 's' : ''} left`);
    return false;
  }
  const result = harvest(existing);
  for (const s of result.seeds) player.inventory.push(s);
  const materials = harvestMaterials(existing);
  const matParts = [];
  for (const mat of materials) {
    addMaterialToInventory(player.inventory, mat);
    const mt = MATERIAL_TYPES[mat.materialType];
    matParts.push(`+${mat.quantity} ${mt.name.toLowerCase()}`);
  }
  if (result.plantDied) {
    planted.splice(planted.indexOf(existing), 1);
    existing.tileCol = null; existing.tileRow = null;
    player.inventory.push(existing);
    const matStr = matParts.length > 0 ? `, ${matParts.join(', ')}` : '';
    showMessage(`Harvested! +${result.seeds.length} seed${result.seeds.length > 1 ? 's' : ''}${matStr}`);
  } else {
    const matStr = matParts.length > 0 ? ` ${matParts.join(', ')}` : '';
    showMessage(`Harvested +${result.seeds.length} seed${result.seeds.length > 1 ? 's' : ''}!${matStr} (${existing.harvestsLeft} left)`);
  }
  return true;
}

function doPlow() {
  const ft = facingTile(player);
  const tile = tileAt(world, ft.col, ft.row);
  if (tile !== TILE.GRASS) { showMessage("Not facing grass."); return false; }
  if (!isPlayerProperty(ft.col, ft.row)) { showMessage("That's someone else's property!"); return false; }
  world[ft.row][ft.col] = TILE.DIRT;
  showMessage('Plowed!');
  return true;
}

// ── Command Dispatch Table ──

function cmdFollow(arg) {
  if (!arg) { showMessage('Usage: follow <name>'); return; }
  const name = arg.toLowerCase();
  const idx = NPCS.findIndex(n => n.name.toLowerCase() === name);
  if (idx < 0) { showMessage(`Unknown NPC: "${arg}"`); return; }
  if (NPCS[idx].role !== 'farmer') { showMessage(`Can't follow ${NPCS[idx].name} (not a farmer)`); return; }
  startFollowNPC(idx);
  showMessage(`Following ${NPCS[idx].name}!`, 2);
}

function cmdStop() {
  if (gameState.followNpcIdx >= 0) {
    stopFollowNPC();
    showMessage('Stopped following.', 1.5);
  } else if (gameState.walkTarget) {
    gameState.walkTarget = null;
    showMessage('Stopped.', 1.5);
  } else {
    showMessage('Not following anyone.');
  }
}

function cmdHelp() { gameState.overlay = gameState.overlay === 'help' ? null : 'help'; }
function cmdInventory() { gameState.overlay = 'inventory'; }

function cmdTime() {
  gameState.timeSkipSticky = !gameState.timeSkipSticky;
  gameState.timeSkip = gameState.timeSkipSticky;
  showMessage(gameState.timeSkipSticky ? 'Fast-forward ON' : 'Fast-forward OFF', 1.5);
}

function cmdSave() { doSave(); showMessage('Game saved!'); }

function cmdSkip() {
  gameState.dayTimer = gameState.DAY_LENGTH - 0.01;
  showMessage('Skipping to next morning...', 1.5);
}

function cmdPause() {
  gameState.paused = !gameState.paused;
  showMessage(gameState.paused ? 'Paused' : 'Resumed', 1.5);
}

function cmdMusic() {
  const on = toggleMusic();
  showMessage(on ? 'Music ON' : 'Music OFF', 1.5);
}

function cmdVoice() {
  const on = toggleVoice();
  showMessage(on ? 'Voice ON' : 'Voice OFF', 1.5);
}

function cmdFortune() {
  const tips = NPCS[3].dialogIdle;
  const tip = tips[Math.floor(Math.random() * tips.length)];
  showMessage(`Sage: "${tip}"`, 4);
}

function cmdStats() {
  showMessage([
    `Day ${gameState.day}  |  ${player.wallet}g`,
    `Species: ${collection.discovered.size}  Donated: ${collection.totalDonated}`,
    `Sold: ${collection.totalSold}  Bred: ${collection.totalBred}`,
    `Modes: ${collection.unlockedModes.join(', ')}  Lab: ${collection.labUnlocked ? 'open' : 'locked'}`,
  ], 5);
}

function cmdWho() {
  const lines = npcStates.map((ns, i) => {
    const npc = NPCS[i];
    const task = ns.task ? ns.task.type : 'idle';
    return `${npc.name}: ${task}  (${ns.wallet}g)`;
  });
  showMessage(lines, 4);
}

function cmdLook() {
  const ft = facingTile(player);
  const tile = tileAt(world, ft.col, ft.row);
  const tileNames = { [TILE.GRASS]:'grass', [TILE.DIRT]:'dirt', [TILE.PATH]:'path', [TILE.WATER]:'water', [TILE.BUILDING]:'building', [TILE.TREE]:'tree', [TILE.FENCE]:'fence' };
  const lines = [`Facing: ${tileNames[tile] || '?'} (${ft.col},${ft.row})`];
  const building = nearbyBuilding(player.x, player.y);
  if (building) lines.push(`Near: ${building.name}`);
  const nearby = nearbyNPC(player.x, player.y, npcStates);
  if (nearby) lines.push(`NPC: ${nearby.npc.name}`);
  const org = planted.find(o => o.tileCol === ft.col && o.tileRow === ft.row);
  if (org) lines.push(`Planted: M${org.mode} D${org.genes[8]} (${org.stage})`);
  showMessage(lines, 4);
}

function cmdPeek(arg) {
  if (!arg) { showMessage('Usage: peek <npc name>'); return; }
  const name = arg.toLowerCase();
  const idx = NPCS.findIndex(n => n.name.toLowerCase() === name);
  if (idx < 0) { showMessage(`Unknown NPC: "${arg}"`); return; }
  const ns = npcStates[idx];
  const npc = NPCS[idx];
  const task = ns.task ? ns.task.type : 'idle';
  showMessage([
    `${npc.name} — ${task}`,
    `Wallet: ${ns.wallet}g  Items: ${ns.inventory.length}`,
    `Plots planted: ${ns.planted.length}`,
  ], 4);
}

function cmdAppraise(arg) {
  const idx = arg ? parseInt(arg) - 1 : player.selectedSlot;
  if (idx < 0 || idx >= player.inventory.length) { showMessage('No item in that slot.'); return; }
  const item = player.inventory[idx];
  if (item.kind !== 'organism') {
    showMessage(`Slot ${idx + 1}: ${item.kind} — ~${sellPrice(item)}g`, 3);
    return;
  }
  const fg = item.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
  showMessage([
    `Slot ${idx + 1}: Mode ${item.mode}  Depth ${item.genes[8]}`,
    `F${fg.fertility} L${fg.longevity} V${fg.vigor}  Stage: ${item.stage}`,
    `Sell price: ~${sellPrice(item)}g`,
  ], 4);
}

function cmdRank() {
  const organisms = player.inventory
    .map((item, i) => ({ item, i }))
    .filter(e => e.item.kind === 'organism')
    .sort((a, b) => sellPrice(b.item) - sellPrice(a.item));
  if (organisms.length === 0) { showMessage('No organisms in inventory.'); return; }
  const top = organisms.slice(0, 3);
  const lines = top.map((e, rank) =>
    `#${rank + 1} Slot ${e.i + 1}: M${e.item.mode} D${e.item.genes[8]} ~${sellPrice(e.item)}g`
  );
  showMessage(lines, 4);
}

function cmdBest() {
  let bestIdx = -1, bestVal = -1;
  for (let i = 0; i < player.inventory.length; i++) {
    const v = sellPrice(player.inventory[i]);
    if (v > bestVal) { bestVal = v; bestIdx = i; }
  }
  if (bestIdx < 0) { showMessage('Inventory is empty.'); return; }
  player.selectedSlot = bestIdx;
  showMessage(`Selected slot ${bestIdx + 1} (~${bestVal}g)`, 2);
}

function cmdGo(arg) {
  if (!arg) { showMessage('Usage: go <place or npc>'); return; }
  const target = resolveTarget(arg);
  if (!target) { showMessage(`Unknown target: "${arg}"`); return; }
  if (target.type === 'building') {
    const pos = buildingDoorPos(target.building);
    gameState.walkTarget = { x: pos.x, y: pos.y, label: target.building.name };
    showMessage(`Walking to ${target.building.name}...`, 1.5);
  } else {
    const ns = npcStates[target.idx];
    gameState.walkTarget = { x: ns.x, y: ns.y, label: NPCS[target.idx].name, npcIdx: target.idx };
    showMessage(`Walking to ${NPCS[target.idx].name}...`, 1.5);
  }
}

function cmdWarp(arg) {
  if (!arg) { showMessage('Usage: warp <place or npc>'); return; }
  const target = resolveTarget(arg);
  if (!target) { showMessage(`Unknown target: "${arg}"`); return; }
  if (target.type === 'building') {
    const pos = buildingDoorPos(target.building);
    player.x = pos.x; player.y = pos.y;
    showMessage(`Warped to ${target.building.name}!`, 1.5);
  } else {
    const ns = npcStates[target.idx];
    player.x = ns.x; player.y = ns.y;
    showMessage(`Warped to ${NPCS[target.idx].name}!`, 1.5);
  }
}

function cmdPlant(arg) {
  const slotIdx = arg ? parseInt(arg) - 1 : null;
  if (slotIdx != null && slotIdx >= 0) player.selectedSlot = slotIdx;
  doPlant(slotIdx != null && slotIdx >= 0 ? slotIdx : null);
}

function cmdHarvest() { doHarvest(); }
function cmdPlow() { doPlow(); }

function cmdTrade(arg) {
  if (!arg) { showMessage('Usage: trade <npc name>'); return; }
  const name = arg.toLowerCase();
  const idx = NPCS.findIndex(n => n.name.toLowerCase() === name);
  if (idx < 0) { showMessage(`Unknown NPC: "${arg}"`); return; }
  if (NPCS[idx].role !== 'farmer') { showMessage(`Can't trade with ${NPCS[idx].name}.`); return; }
  const ns = npcStates[idx];
  if (ns.inventory.length === 0) { showMessage(`${NPCS[idx].name} has nothing to trade.`); return; }
  gameState.walkTarget = {
    x: ns.x, y: ns.y, label: NPCS[idx].name, npcIdx: idx,
    onArrive: () => {
      gameState.overlay = 'trade';
      gameState.tradeNpcIdx = idx;
      gameState.tradeCursor = 0;
      gameState.tradeNpcSlot = 0;
      gameState.tradePlayerSlot = player.selectedSlot;
    },
  };
  showMessage(`Walking to ${NPCS[idx].name} to trade...`, 1.5);
}

function cmdTalk(arg) {
  if (!arg) { showMessage('Usage: talk <npc name>'); return; }
  const name = arg.toLowerCase();
  const idx = NPCS.findIndex(n => n.name.toLowerCase() === name);
  if (idx < 0) { showMessage(`Unknown NPC: "${arg}"`); return; }
  const npc = NPCS[idx];
  const ns = npcStates[idx];
  gameState.walkTarget = {
    x: ns.x, y: ns.y, label: npc.name, npcIdx: idx,
    onArrive: () => {
      const dialog = npc.dialogIdle[ns.dialogIdx % npc.dialogIdle.length];
      ns.dialogIdx++;
      showMessage(`${npc.name}: "${dialog}"`, 3);
    },
  };
  showMessage(`Walking to ${npc.name}...`, 1.5);
}

function cmdName(arg) {
  if (!arg) { showMessage('Usage: name <nickname>'); return; }
  const item = player.inventory[player.selectedSlot];
  if (!item || item.kind !== 'organism') { showMessage('Select an organism first.'); return; }
  item.nickname = arg.slice(0, 16);
  showMessage(`Named: "${item.nickname}"`, 2);
}

function cmdCompare(arg, parts) {
  const s1 = parseInt(parts[1]) - 1;
  const s2 = parseInt(parts[2]) - 1;
  if (isNaN(s1) || isNaN(s2)) { showMessage('Usage: compare <slot1> <slot2>'); return; }
  const a = player.inventory[s1], b = player.inventory[s2];
  if (!a || !b) { showMessage('Invalid slot(s).'); return; }
  if (a.kind !== 'organism' || b.kind !== 'organism') { showMessage('Both slots must be organisms.'); return; }
  const fgA = a.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
  const fgB = b.farmGenes || { fertility: 2, longevity: 1, vigor: 2 };
  showMessage([
    `Slot ${s1 + 1} vs Slot ${s2 + 1}`,
    `Mode: ${a.mode} | ${b.mode}   Depth: ${a.genes[8]} | ${b.genes[8]}`,
    `F/L/V: ${fgA.fertility}/${fgA.longevity}/${fgA.vigor} | ${fgB.fertility}/${fgB.longevity}/${fgB.vigor}`,
    `Price: ~${sellPrice(a)}g | ~${sellPrice(b)}g`,
  ], 5);
}

function cmdDance() {
  gameState.playerSpin = 2;
  showMessage('You dance!', 2);
}

function cmdWave() {
  const nearby = nearbyNPC(player.x, player.y, npcStates);
  showMessage('You wave!', 1.5);
  if (nearby) {
    setTimeout(() => {
      showMessage(`${nearby.npc.name} waves back!`, 2);
    }, 1500);
  }
}

function cmdYell() {
  showMessage('AAAHH!', 2);
  // Nearby NPCs face toward player and pause
  for (const ns of npcStates) {
    const dist = Math.hypot(ns.x - player.x, ns.y - player.y);
    if (dist < TILE_SIZE * 6) {
      const dx = player.x - ns.x, dy = player.y - ns.y;
      if (Math.abs(dx) > Math.abs(dy)) ns.facing = dx > 0 ? 'right' : 'left';
      else ns.facing = dy > 0 ? 'down' : 'up';
      ns.moving = false;
      ns.waitTimer = 2;
    }
  }
}

function cmdAI(arg, parts) {
  const llm = getLLMSettings();
  const sub = (parts[1] || '').toLowerCase();

  if (!sub || sub === 'status') {
    showMessage([
      `AI: ${llm.enabled ? 'ON' : 'OFF'}`,
      `Model: ${llm.model}`,
      `Key: ${llm.apiKey ? '****' + llm.apiKey.slice(-4) : 'not set'}`,
      `Endpoint: ${llm.baseUrl}`,
    ], 5);
    return;
  }
  if (sub === 'on') { setLLMSetting('enabled', true); showMessage('AI enabled'); return; }
  if (sub === 'off') { setLLMSetting('enabled', false); showMessage('AI disabled'); return; }
  if (sub === 'key') {
    const key = arg.replace(/^key\s+/i, '');
    if (!key) { showMessage('Usage: /ai key <your-api-key>'); return; }
    setLLMSetting('apiKey', key);
    showMessage('API key saved: ****' + key.slice(-4));
    return;
  }
  if (sub === 'model') {
    const m = arg.replace(/^model\s+/i, '');
    if (!m) { showMessage(`Current model: ${llm.model}`); return; }
    setLLMSetting('model', m);
    showMessage(`Model set: ${m}`);
    return;
  }
  if (sub === 'url') {
    const u = arg.replace(/^url\s+/i, '');
    if (!u) { showMessage(`Endpoint: ${llm.baseUrl}`); return; }
    setLLMSetting('baseUrl', u);
    showMessage(`Endpoint set: ${u}`);
    return;
  }
  if (sub === 'clear') {
    setLLMSetting('apiKey', '');
    setLLMSetting('enabled', false);
    showMessage('API key cleared, AI disabled');
    return;
  }
  showMessage('Usage: /ai [on|off|key|model|url|clear]');
}

const COMMANDS = {
  follow: cmdFollow, f: cmdFollow,
  stop: cmdStop, unfollow: cmdStop,
  help: cmdHelp,
  inventory: cmdInventory, inv: cmdInventory,
  time: cmdTime, speed: cmdTime,
  save: cmdSave,
  skip: cmdSkip,
  pause: cmdPause,
  music: cmdMusic,
  voice: cmdVoice,
  fortune: cmdFortune,
  stats: cmdStats,
  who: cmdWho,
  look: cmdLook,
  peek: cmdPeek,
  appraise: cmdAppraise,
  rank: cmdRank,
  best: cmdBest,
  go: cmdGo,
  warp: cmdWarp,
  plant: cmdPlant,
  harvest: cmdHarvest,
  plow: cmdPlow,
  trade: cmdTrade,
  talk: cmdTalk,
  name: cmdName,
  compare: cmdCompare,
  dance: cmdDance,
  wave: cmdWave,
  yell: cmdYell,
};

function executeCommand(raw) {
  const rawParts = raw.split(/\s+/);
  const cmd = rawParts[0].toLowerCase();

  // Check for /ai subcommands first
  if (cmd === 'ai') { cmdAI(rawParts.slice(1).join(' '), rawParts.map(p => p.toLowerCase())); return; }

  const handler = COMMANDS[cmd];
  if (handler) {
    // Pass original-case arg for commands like /name, lowercase parts for others
    handler(rawParts.slice(1).join(' '), rawParts.map(p => p.toLowerCase()));
    return;
  }

  // AI fallback: if enabled and key present
  const llm = getLLMSettings();
  if (llm.enabled && llm.apiKey) {
    gameState.aiThinking = true;
    showMessage('Thinking...', 15);
    const ctx = buildGameContext(gameState, player, npcStates, planted, collection);
    interpretCommand(raw, ctx).then(result => {
      gameState.aiThinking = false;
      if (!result) {
        showMessage(`Couldn't map "${raw}" \u2014 try /help`, 3);
      } else if (result.startsWith('SAY:')) {
        showMessage(result.slice(4).trim(), 5);
      } else if (result.startsWith('SUGGEST:')) {
        const suggested = result.slice(8).trim();
        gameState.message = null;
        gameState.commandBar.active = true;
        gameState.commandBar.text = suggested;
        gameState.commandBar.suggestion = true;
        input.setTextMode(true);
      } else {
        showMessage([`> ${result}`, '(AI interpreted)'], 2);
        setTimeout(() => executeCommand(result), 400);
      }
    }).catch(() => {
      gameState.aiThinking = false;
      showMessage('AI error \u2014 check /ai settings');
    });
    return;
  }

  showMessage(`Unknown: "${cmd}" \u2014 type /help`);
}

// ── Game Loop ──

let lastTime = 0;
let lastDay = gameState.day;
let autoSaveTimer = 0;
let lastTutorialSpeech = null;

function gameLoop(timestamp) {
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
  lastTime = timestamp;

  // ── Title screen ──
  if (gameState.phase === 'title') {
    // What's New overlay intercepts input
    if (gameState.showWhatsNew) {
      if (input.justPressed(' ') || input.justPressed('Enter') || input.justPressed('Escape')) {
        gameState.showWhatsNew = false;
        localStorage.setItem(whatsNewKey, '1');
      }
      render(ctx, world, player, gameState, planted, collection, lab, npcStates, cam, wilds);
      requestAnimationFrame(gameLoop);
      return;
    }
    if (input.justPressed('ArrowUp') || input.justPressed('ArrowDown')) {
      gameState.titleCursor = gameState.titleCursor === 0 ? 1 : 0;
    }
    if (input.justPressed(' ') || input.justPressed('Enter')) {
      if (gameState.titleCursor === 0) {
        // New Game
        startNewGame();
      } else if (savedGame) {
        // Continue
        applySave(savedGame);
        musicStarted = true;
        startMusic('farm');
      }
    }
    // Disable Continue if no save
    if (!gameState.hasSave && gameState.titleCursor === 1) gameState.titleCursor = 0;
    render(ctx, world, player, gameState, planted, collection, lab, npcStates, cam, wilds);
    requestAnimationFrame(gameLoop);
    return;
  }

  // ── Intro phase ──
  if (gameState.phase === 'intro') {
    gameState.introFade = Math.min(1, gameState.introFade + dt * 2);
    if (input.justPressed(' ') || input.justPressed('Enter')) {
      gameState.introPage++;
      gameState.introFade = 0;
      if (gameState.introPage >= INTRO_PAGES.length) {
        gameState.phase = 'playing';
        if (!musicStarted) { musicStarted = true; startMusic('farm'); }
      }
    }
    if (input.justPressed('Escape')) {
      gameState.phase = 'playing'; // skip intro
      if (!musicStarted) { musicStarted = true; startMusic('farm'); }
    }
    render(ctx, world, player, gameState, planted, collection, lab, npcStates, cam, wilds);
    requestAnimationFrame(gameLoop);
    return;
  }

  // ── Playing phase ──

  // Pause toggle: P key always, Escape when no overlay and not following
  if (input.justPressed('p') || input.justPressed('P')) {
    gameState.paused = !gameState.paused;
  }
  if (!gameState.overlay && gameState.followNpcIdx < 0 && input.justPressed('Escape')) {
    gameState.paused = !gameState.paused;
  }

  // When paused, skip all updates but still render
  if (gameState.paused) {
    gameState.tutorialState = tutorialState;
    gameState.dawkinsState = dawkinsState;
    gameState.audioSettings = getAudioSettings();
    render(ctx, world, player, gameState, planted, collection, lab, npcStates, cam, wilds);
    requestAnimationFrame(gameLoop);
    return;
  }

  // ── Command bar ──
  if (gameState.commandBar.active) {
    // Drain character buffer into command text
    const chars = input.drainCharBuffer();
    for (const ch of chars) {
      if (ch === '\b') {
        gameState.commandBar.text = gameState.commandBar.text.slice(0, -1);
      } else {
        gameState.commandBar.text += ch;
      }
    }
    // Enter submits, Escape cancels
    if (input.justPressed('Enter')) {
      const cmd = gameState.commandBar.text.trim();
      gameState.commandBar.active = false;
      gameState.commandBar.text = '';
      gameState.commandBar.suggestion = false;
      input.setTextMode(false);
      if (cmd) executeCommand(cmd);
    } else if (input.justPressed('Escape')) {
      gameState.commandBar.active = false;
      gameState.commandBar.text = '';
      gameState.commandBar.suggestion = false;
      input.setTextMode(false);
    }
    // Skip all other game input while command bar is open
    // (still update world, camera, NPCs below)
  } else {
    // / key opens command bar (only when no overlay is open)
    if (!gameState.overlay && input.justPressed('/')) {
      gameState.commandBar.active = true;
      gameState.commandBar.text = '';
      input.setTextMode(true);
    }

  // Inventory slot selection (number keys when no overlay, or specific overlays)
  if (!gameState.overlay) {
    for (let i = 1; i <= 9; i++) {
      if (input.justPressed(String(i)) && i - 1 < player.inventory.length)
        player.selectedSlot = i - 1;
    }
  }

  // Time-skip: holding T advances time 3x faster (or sticky toggle via command bar)
  if (!gameState.overlay && (input.isDown('t') || input.isDown('T'))) {
    gameState.timeSkip = true;
  } else if (!gameState.timeSkipSticky) {
    gameState.timeSkip = false;
  }

  // Global toggle keys (work in any context)
  if (input.justPressed('m') || input.justPressed('M')) {
    const on = toggleMusic();
    showMessage(on ? 'Music ON' : 'Music OFF', 1.5);
  }
  if (input.justPressed('v') || input.justPressed('V')) {
    const on = toggleVoice();
    showMessage(on ? 'Voice ON' : 'Voice OFF', 1.5);
  }
  if (input.justPressed('f') || input.justPressed('F')) {
    const on = toggleAutoFollow();
    showMessage(on ? 'Auto-follow ON' : 'Auto-follow OFF', 1.5);
  }
  if (input.justPressed('h') || input.justPressed('H')) {
    gameState.overlay = gameState.overlay === 'help' ? null : 'help';
  }

  // Q key: toggle follow NPC mode
  if (input.justPressed('q') || input.justPressed('Q')) {
    if (gameState.followNpcIdx >= 0) {
      stopFollowNPC();
    } else if (!gameState.overlay) {
      // Find nearby farmer NPC
      for (let i = 0; i < npcStates.length; i++) {
        const npc = NPCS[i];
        if (npc.role !== 'farmer') continue;
        const dist = Math.hypot(player.x - npcStates[i].x, player.y - npcStates[i].y);
        if (dist < TILE_SIZE * 2.5) {
          startFollowNPC(i);
          showMessage(`Following ${npc.name}!`, 2);
          break;
        }
      }
    }
  }

  // Spectator mode input: Space/Enter advance steps, Escape/Q exits
  if (gameState.spectator) {
    if (input.justPressed('Escape') || input.justPressed('q') || input.justPressed('Q')) {
      stopSpectator();
      stopFollowNPC();
    } else if (input.justPressed(' ') || input.justPressed('Enter')
      || input.justPressed('ArrowRight') || input.justPressed('ArrowDown')) {
      const spec = gameState.spectator;
      if (spec.done) {
        stopSpectator();
      } else {
        spec.stepIdx++;
        if (spec.stepIdx < spec.steps.length) {
          spec.steps[spec.stepIdx].apply(gameState, spec.actor, spec.lab);
        } else {
          spec.done = true;
        }
      }
    }
    // Skip normal overlay/world input while spectating
  }

  // Cancel follow mode on Escape or opening an overlay
  if (gameState.followNpcIdx >= 0 && input.justPressed('Escape')) {
    stopFollowNPC();
  }
  // Dispatch to overlay or world
  else if (gameState.overlay === 'help') { if (input.justPressed('Escape')) gameState.overlay = null; }
  else if (gameState.overlay === 'inventory') handleInventoryInput();
  else if (gameState.overlay === 'shop') handleShopInput();
  else if (gameState.overlay === 'lab') handleLabInput();
  else if (gameState.overlay === 'museum') handleMuseumInput();
  else if (gameState.overlay === 'trade') handleTradeInput();
  else if (gameState.overlay === 'crafting') handleCraftingInput();
  else if (gameState.overlay === 'dawkins') handleDawkinsInput();
  else {
    // Arrow keys reset camera pan and cancel auto-walk
    if (input.ArrowLeft || input.ArrowRight || input.ArrowUp || input.ArrowDown) {
      gameState.cameraPanOffset.x = 0;
      gameState.cameraPanOffset.y = 0;
      gameState.cameraPanTimer = 0;
      if (gameState.walkTarget) gameState.walkTarget = null;
    }
    updatePlayer(player, input, world, dt);
    if (input.justPressed(' ')) handleWorldAction();
    if (input.justPressed('i') || input.justPressed('I') || input.justPressed('Enter'))
      gameState.overlay = 'inventory';
  }

  } // end: command bar not active

  // (Follow mode persists through overlays — only explicit Escape/Q/stop cancels it)

  // Camera — follow NPC or player
  if (gameState.followNpcIdx >= 0) {
    const followTarget = npcStates[gameState.followNpcIdx];
    if (followTarget) {
      updateCamera(cam, followTarget, dt);
    } else {
      stopFollowNPC();
      updateCamera(cam, player, dt);
    }
  } else {
    updateCamera(cam, player, dt);
  }

  // Mouse camera panning (right-click drag)
  if (input.mouseDragging) {
    const drag = input.consumeDragDelta();
    gameState.cameraPanOffset.x -= drag.dx;
    gameState.cameraPanOffset.y -= drag.dy;
    gameState.cameraPanTimer = 0; // reset ease-back while dragging
  }
  if (input.consumeMouseRelease()) {
    gameState.cameraPanTimer = 3; // 3s until ease-back
  }
  // Ease camera pan offset back to zero after timer expires
  if (gameState.cameraPanTimer > 0 && !input.mouseDragging) {
    gameState.cameraPanTimer -= dt;
  } else if (gameState.cameraPanTimer <= 0) {
    const off = gameState.cameraPanOffset;
    if (Math.abs(off.x) > 0.5 || Math.abs(off.y) > 0.5) {
      const ease = Math.min(1, 4 * dt);
      off.x *= (1 - ease);
      off.y *= (1 - ease);
    } else {
      off.x = 0;
      off.y = 0;
    }
  }
  // Apply pan offset to camera (clamped to world bounds)
  const WORLD_PX_W = COLS * TILE_SIZE;
  const WORLD_PX_H = ROWS * TILE_SIZE;
  const VIEW_H = CANVAS_H - TILE_SIZE;
  cam.x = Math.max(0, Math.min(WORLD_PX_W - CANVAS_W, cam.x + gameState.cameraPanOffset.x));
  cam.y = Math.max(0, Math.min(WORLD_PX_H - VIEW_H, cam.y + gameState.cameraPanOffset.y));

  // Tutorial update
  const sageState = npcStates.find(s => s.id === 'sage');
  const tutActive = tutorialState.active && !tutorialState.completed;
  const audioSettings = getAudioSettings();
  if (tutActive) {
    updateTutorial(tutorialState, sageState, player.x, player.y, dt, audioSettings.autoFollow);
  }

  // Auto-follow: move player toward Sage when no keys pressed
  const playerMoving = input.ArrowLeft || input.ArrowRight || input.ArrowUp || input.ArrowDown;
  if (audioSettings.autoFollow && !playerMoving && !gameState.overlay) {
    if (tutActive || sageShowState.phase === 'walking') {
      autoFollowSage(sageState, dt, tutActive);
    }
  }

  // Sage "show me" tips (post-tutorial)
  if (sageShowState.phase !== 'idle') {
    updateSageShow(sageShowState, sageState, dt);
  }

  // Follow NPC: auto-walk player toward followed NPC
  if (gameState.followNpcIdx >= 0 && !gameState.overlay) {
    const followTarget = npcStates[gameState.followNpcIdx];
    if (followTarget) {
      autoFollowNPC(followTarget, dt);
    }
  }

  // Auto-walk to target (from /go command)
  if (gameState.walkTarget && !gameState.overlay) {
    autoWalkToTarget(dt);
  }

  // Dance spin timer
  if (gameState.playerSpin > 0) {
    gameState.playerSpin -= dt;
    if (gameState.playerSpin < 0) gameState.playerSpin = 0;
  }

  // Update AI tasks (drives NPC walking to buildings)
  updateAITasks(npcStates, dt, gameState, world, wilds, collection);

  // Pick up pending spectator request from AI
  if (gameState._pendingSpectator) {
    const { npcIdx, result } = gameState._pendingSpectator;
    gameState._pendingSpectator = null;
    startSpectator(npcIdx, result);
  }

  // Update NPCs (skip guide during tutorial or show-walk)
  const skipGuide = tutActive || sageShowState.phase === 'walking';
  updateNPCs(npcStates, world, dt, skipGuide);

  // Follow NPC narration update
  if (gameState.followNpcIdx >= 0) {
    const followState = npcStates[gameState.followNpcIdx];
    if (followState) {
      const task = followState.task;
      const taskKey = task ? `${task.type}:${task.phase}` : 'idle';

      // Cooldown timer
      if (gameState.followNarrationCooldown > 0) {
        gameState.followNarrationCooldown -= dt;
      }

      // Detect task state changes
      if (taskKey !== gameState.followLastTaskKey && gameState.followNarrationCooldown <= 0) {
        gameState.followLastTaskKey = taskKey;
        const text = getNarration(followState.id, task);
        if (text) {
          gameState.followNarration = { text, timer: 4 };
          gameState.followNarrationCooldown = 2; // min 2s between narration changes
          speak(text, followState.id);
        }
      }

      // Narration display timer
      if (gameState.followNarration) {
        gameState.followNarration.timer -= dt;
        if (gameState.followNarration.timer <= 0) {
          gameState.followNarration = null;
        }
      }

      // Idle narration: periodically show idle lines when no task
      if (!task && !gameState.followNarration && gameState.followNarrationCooldown <= 0) {
        const text = getNarration(followState.id, null);
        if (text) {
          gameState.followNarration = { text, timer: 3.5 };
          gameState.followNarrationCooldown = 8; // longer cooldown for idle chatter
          speak(text, followState.id);
        }
      }
    }
  }

  // Auto-close spectator when done (player pressed through all steps)
  if (gameState.spectator && gameState.spectator.done) {
    stopSpectator();
  }

  // Day cycle (with time-skip multiplier)
  const timeMultiplier = gameState.timeSkip ? 3 : 1;
  gameState.dayTimer += dt * timeMultiplier;
  if (gameState.dayTimer >= gameState.DAY_LENGTH) {
    gameState.dayTimer -= gameState.DAY_LENGTH;
    gameState.day++;
  }
  if (gameState.day !== lastDay) {
    lastDay = gameState.day;
    tickGrowth(planted, gameState.day);
    aiDayTick(npcStates, gameState, world, wilds, collection);
    gameState.shopStock = generateShopStock(collection.unlockedModes);
    // Wild forest spreading
    const newTrees = wildDayTick(wilds, world);
    if (newTrees > 0) {
      showMessage(`The forest grew... (+${newTrees} tree${newTrees > 1 ? 's' : ''})`, 2);
    }
  }

  // Message timer
  if (gameState.message) {
    gameState.message.timer -= dt;
    if (gameState.message.timer <= 0) gameState.message = null;
  }

  // Notification queue
  if (collection.notifications.length > 0 && !gameState.message) {
    showMessage(collection.notifications.shift(), 3);
  }

  // Auto-save
  autoSaveTimer += dt;
  if (autoSaveTimer >= 30) { autoSaveTimer = 0; doSave(); }

  // Attach states for renderer
  gameState.tutorialState = tutorialState;
  gameState.dawkinsState = dawkinsState;
  gameState.audioSettings = getAudioSettings();
  gameState.currentTutorialSpeech = getTutorialSpeech(tutorialState) || getSageShowSpeech(sageShowState);

  // TTS: speak tutorial/sage speech when it changes
  if (gameState.currentTutorialSpeech && gameState.currentTutorialSpeech !== lastTutorialSpeech) {
    speak(gameState.currentTutorialSpeech, 'sage');
  }
  if (!gameState.currentTutorialSpeech && lastTutorialSpeech) {
    resetLastSpoken(); // allow re-speaking if same text comes up later
  }
  lastTutorialSpeech = gameState.currentTutorialSpeech;

  // Debug exports (dev only)
  window.__GAME_STATE__ = { gameState, player, npcStates, collection, planted, wilds, world, executeCommand };
  window.__GAME_DEBUG__ = {
    day: gameState.day,
    playerGold: player.wallet,
    npcGold: Object.fromEntries(npcStates.map(ns => [ns.id, ns.wallet || 0])),
    npcGoldSum: npcStates.reduce((s, ns) => s + (ns.wallet || 0), 0),
    speciesDiscovered: collection.discovered.size,
    totalSold: collection.totalSold,
    totalDonated: collection.totalDonated,
    totalBred: collection.totalBred,
    unlockedModes: collection.unlockedModes,
    labUnlocked: collection.labUnlocked,
    plantedCount: planted.length,
    wildTreeCount: wilds.size,
  };

  render(ctx, world, player, gameState, planted, collection, lab, npcStates, cam, wilds);
  requestAnimationFrame(gameLoop);
}

window.addEventListener('beforeunload', doSave);

requestAnimationFrame(ts => {
  lastTime = ts;
  lastDay = gameState.day;
  gameLoop(ts);
});
