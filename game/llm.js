// LLM integration: conversational AI command interpretation via OpenAI-compatible API

const LLM_SETTINGS_KEY = 'biomorph-llm-settings';
const WISHLIST_KEY = 'biomorph-llm-wishlist';

let llmSettings = {
  enabled: false,
  apiKey: '',
  model: 'gpt-4o-mini',
  baseUrl: 'https://api.openai.com/v1',
};

export function loadLLMSettings() {
  try {
    const raw = localStorage.getItem(LLM_SETTINGS_KEY);
    if (raw) Object.assign(llmSettings, JSON.parse(raw));
  } catch (e) {}
  return llmSettings;
}

function saveLLMSettings() {
  try { localStorage.setItem(LLM_SETTINGS_KEY, JSON.stringify(llmSettings)); } catch (e) {}
}

export function getLLMSettings() { return llmSettings; }

export function setLLMSetting(key, value) {
  llmSettings[key] = value;
  saveLLMSettings();
}

// ── Wishlist ──

export function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(WISHLIST_KEY) || '[]');
  } catch (e) { return []; }
}

export function addWish(input, suggestion) {
  const list = getWishlist();
  list.push({ input, suggestion, time: Date.now() });
  try { localStorage.setItem(WISHLIST_KEY, JSON.stringify(list)); } catch (e) {}
  fetch('/api/wish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, suggestion }),
  }).catch(() => {});
}

export function clearWishlist() {
  localStorage.removeItem(WISHLIST_KEY);
}

// ── Conversation History ──

let conversation = []; // { role: 'user'|'assistant', content: string }
let conversationContext = ''; // last game context snapshot
let awaitingAnswer = false; // true when AI asked a follow-up question
let lastQuestion = ''; // the question AI asked

export function getConversationState() {
  return { awaitingAnswer, lastQuestion, history: conversation };
}

export function clearConversation() {
  conversation = [];
  awaitingAnswer = false;
  lastQuestion = '';
}

// ── Game Context ──

// Tile type names (matches TILE enum in world.js)
const TILE_NAMES = { 0: 'grass', 1: 'dirt', 2: 'path', 3: 'water', 4: 'building', 5: 'tree', 6: 'fence' };
const FEATURE_TILE_TYPES = new Set([2, 3, 5, 6]); // path, water, tree, fence — things worth detecting as features

/**
 * Detect connected regions of notable tile types (water, trees, path, fence).
 * Returns array of { type, tiles: [{col,row}], center: {col,row}, radius }.
 * Uses flood-fill. Caps at 20 features to keep prompt compact.
 */
function detectFeatures(world) {
  if (!world || !world.length) return [];
  const rows = world.length, cols = world[0].length;
  const visited = new Uint8Array(rows * cols);
  const features = [];

  for (let r = 0; r < rows && features.length < 20; r++) {
    for (let c = 0; c < cols && features.length < 20; c++) {
      const t = world[r][c];
      if (!FEATURE_TILE_TYPES.has(t) || visited[r * cols + c]) continue;

      // Flood-fill this region
      const tiles = [];
      const stack = [[c, r]];
      while (stack.length > 0) {
        const [fc, fr] = stack.pop();
        if (fr < 0 || fr >= rows || fc < 0 || fc >= cols) continue;
        if (visited[fr * cols + fc] || world[fr][fc] !== t) continue;
        visited[fr * cols + fc] = 1;
        tiles.push({ col: fc, row: fr });
        stack.push([fc + 1, fr], [fc - 1, fr], [fc, fr + 1], [fc, fr - 1]);
      }

      if (tiles.length < 3) continue; // skip tiny features (1-2 tiles)

      // Compute bounding box and center
      let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
      for (const p of tiles) {
        if (p.col < minC) minC = p.col;
        if (p.col > maxC) maxC = p.col;
        if (p.row < minR) minR = p.row;
        if (p.row > maxR) maxR = p.row;
      }
      const centerCol = Math.round((minC + maxC) / 2);
      const centerRow = Math.round((minR + maxR) / 2);
      const w = maxC - minC + 1;
      const h = maxR - minR + 1;
      const radius = Math.round(Math.max(w, h) / 2);

      // Classify shape
      const area = tiles.length;
      const boxArea = w * h;
      const fillRatio = area / boxArea;
      let shape;
      if (w === 1 || h === 1) shape = w > h ? 'line' : 'column';
      else if (fillRatio > 0.7) shape = (Math.abs(w - h) <= 2) ? 'circle' : 'rect';
      else if (fillRatio > 0.3) shape = 'ring';
      else shape = 'scatter';

      features.push({
        type: TILE_NAMES[t] || `tile${t}`,
        tileCount: area,
        center: { col: centerCol, row: centerRow },
        w, h, radius, shape,
      });
    }
  }

  return features;
}

/**
 * Compute directional relationship between two points.
 */
function describeRelation(fromCol, fromRow, toCol, toRow) {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  const dist = Math.round(Math.hypot(dc, dr));

  let dir = '';
  if (Math.abs(dr) > Math.abs(dc) * 0.5) dir += dr < 0 ? 'N' : 'S';
  if (Math.abs(dc) > Math.abs(dr) * 0.5) dir += dc < 0 ? 'W' : 'E';
  if (!dir) dir = 'nearby';

  return `${dist} tiles ${dir}`;
}

/**
 * Build a scene graph description of the world for the LLM prompt.
 */
function buildSceneGraph(world, structures, planted, playerCol, playerRow) {
  const lines = [];
  const worldRows = world ? world.length : 0;
  const worldCols = world && world[0] ? world[0].length : 0;
  lines.push(`World: ${worldCols}×${worldRows}`);

  // Detect terrain features
  const features = detectFeatures(world);

  // Name features by type + index
  const featureNames = [];
  const typeCounts = {};
  for (const f of features) {
    const count = (typeCounts[f.type] || 0) + 1;
    typeCounts[f.type] = count;
    const name = count === 1 ? f.type : `${f.type}${count}`;
    featureNames.push(name);
  }

  if (features.length > 0) {
    lines.push('Features:');
    for (let i = 0; i < features.length; i++) {
      const f = features[i];
      const rel = describeRelation(playerCol, playerRow, f.center.col, f.center.row);
      lines.push(`  ${featureNames[i]}: ${f.type} ${f.shape} ~${f.tileCount} tiles at (${f.center.col},${f.center.row}), r≈${f.radius}, ${rel} from you`);
    }
  }

  // Structures with relationships
  const structs = structures || [];
  if (structs.length > 0) {
    lines.push('Structures:');
    for (const s of structs) {
      const rel = describeRelation(playerCol, playerRow, s.col, s.row);
      // Describe relation to nearest feature
      let featureRel = '';
      let minDist = Infinity;
      for (let i = 0; i < features.length; i++) {
        const d = Math.hypot(s.col - features[i].center.col, s.row - features[i].center.row);
        if (d < minDist) {
          minDist = d;
          featureRel = `, ${describeRelation(features[i].center.col, features[i].center.row, s.col, s.row)} from ${featureNames[i]}`;
        }
      }
      lines.push(`  ${s.name} (${s.type}): at (${s.col},${s.row}), ${rel} from you${featureRel}`);
    }
  }

  // Planted summary
  if (planted && planted.length > 0) {
    // Group planted by rough area
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const p of planted) {
      if (p.tileCol < minC) minC = p.tileCol;
      if (p.tileCol > maxC) maxC = p.tileCol;
      if (p.tileRow < minR) minR = p.tileRow;
      if (p.tileRow > maxR) maxR = p.tileRow;
    }
    const cCenter = Math.round((minC + maxC) / 2);
    const rCenter = Math.round((minR + maxR) / 2);
    const rel = describeRelation(playerCol, playerRow, cCenter, rCenter);
    lines.push(`Planted: ${planted.length} crops around (${cCenter},${rCenter}), ${rel} from you`);
  }

  return lines.join('\n');
}

// Exported for query command
export { detectFeatures, describeRelation, buildSceneGraph, TILE_NAMES };

export function buildGameContext(gameState, player, npcStates, planted, collection, world, tileSize) {
  const inv = player.inventory;
  const invLines = inv.slice(0, 9).map((item, i) => {
    if (item.kind === 'organism') {
      const price = item.sellPrice || '?';
      return `[${i + 1}] M${item.mode} ${item.nickname || 'seed'} ~${price}g`;
    }
    if (item.kind === 'material') return `[${i + 1}] ${item.materialType}`;
    if (item.kind === 'tool') return `[${i + 1}] ${item.toolType}`;
    if (item.kind === 'product') return `[${i + 1}] ${item.productType}`;
    return `[${i + 1}] item`;
  });

  const npcLines = npcStates.map(ns => {
    const task = ns.task ? ns.task.type : 'idle';
    return `${ns.id} ${task} ${ns.wallet}g`;
  }).join(', ');

  const ts = tileSize || 48;
  const pCol = Math.floor(player.x / ts);
  const pRow = Math.floor(player.y / ts);
  const facing = player.facing || 'down';

  // Build scene graph for spatial context
  const sceneGraph = world ? buildSceneGraph(world, gameState.structures, planted, pCol, pRow) : '';

  const ctx = [
    `Day ${gameState.day} | ${player.wallet}g | Inventory: ${inv.length} items`,
    invLines.length > 0 ? invLines.join('  ') : '(empty)',
    `Position: col ${pCol}, row ${pRow}, facing ${facing}`,
    `NPCs: ${npcLines}`,
    `Mode: ${gameState.sandboxMode ? 'sandbox' : gameState.creativeMode ? 'creative' : 'survival'}`,
    sceneGraph,
  ].filter(Boolean).join('\n');
  conversationContext = ctx;
  return ctx;
}

// ── Screenshot ──

export function captureScreenshot(canvas) {
  try {
    return canvas.toDataURL('image/jpeg', 0.7);
  } catch (e) {
    console.warn('Screenshot failed:', e);
    return null;
  }
}

// ── System Prompt ──

const SYSTEM_PROMPT = `You are a witty companion inside Biomorph Farm — a game about breeding, planting, and exploring with evolving creatures called biomorphs.

COMMANDS (reply with just the command, no slash):

Movement & Navigation:
  warp <place>          — teleport (shop/lab/museum/home/study/fern/moss/chip/sage)
  go <place>            — walk there
  follow <npc|nearest>  — follow someone around
  stop                  — stop following
  move <dir> [n]        — walk n tiles (left/right/up/down/north/south/east/west)
  move <pattern> [size] — walk a pattern (circle/zigzag)
  moveto <col> <row>    — walk to exact tile coordinates (for spatial building)

Inventory & Economy:
  inventory             — list your items (alias: inv)
  select <slot>         — select a slot (1-9) as active
  sell [slot|worst|best] — sell by slot number, or "sell worst"/"sell best"/"sell all"
  appraise [slot|all]   — check value of one item or "appraise all" for everything
  trade <npc>           — trade with an NPC
  rank                  — rank inventory by value
  best                  — show your best specimen
  compare <s1> <s2>     — compare two slots
  status                — quick overview: day, gold, inventory count

Farming:
  plant [slot]          — plant a seed on the dirt tile you're facing (auto-walks to nearest dirt if needed)
  harvest               — harvest a mature plant you're facing (auto-walks to nearest mature crop if needed)
  plow                  — plow grass into dirt for planting (auto-walks to nearest grass if needed)
  garden <shape> [size] — auto-build a garden (circle/ring/line/row/column/grid/square/cross/spiral, size 1-8)

Building & Destruction:
  build <type> [name] [at <col>,<row>] [near <landmark>] — build a structure (shed/cottage/barn/tower/pen/wall). Free in creative, costs gold otherwise. Use "near lake" or "at 120,125" to build at a specific location.
  demolish <name|nearest> — walk to and demolish a named structure, restoring original tiles
  movestructure <name> <col> <row> — relocate a structure to new coordinates
  clearplants [all]     — walk to and remove crops. In creative, clears NPC crops too.
  cleartrees [all]      — walk to and remove trees. In creative, clears all trees.
  destroy <target>      — meta: "plants"→clearplants, "trees"→cleartrees, "everything"→both, else→demolish by name
  structures            — list all player-built structures

Terrain Painting (creative only):
  paint <tile> <shape> [size] — paint terrain tiles around you. THE core building primitive.
    Tiles: grass, dirt, path/stone, water/lake, tree/forest, fence, wall
    Shapes: circle/disc, ring, square/grid/fill, line/row, column, cross, spiral, dot
    Size: 1-20 (default 3)
    DIRECTION-TO-SHAPE (CRITICAL):
      line/row = HORIZONTAL (east-west). "path going east/west" → paint path line
      column   = VERTICAL (north-south). "path going north/south" → paint path column
      "road going south" → paint path column 6 (NOT line!)
      "river going east" → paint water line 8 (NOT column!)
    Examples: "paint water circle 4" (lake), "paint path ring 5" (path around), "paint tree column 6" (tree column going N-S)
    Location: append "at <col>,<row>" or "near <landmark>" to paint at a specific location instead of player position.
    Examples: "paint water circle 4 at 120,125", "paint tree ring 5 near lake", "paint path ring 3 near Home"
    SCALE SAFETY: For size > 8, use SUGGEST: to let the player confirm first. Large paints are destructive and overwrite existing terrain!

Breeding:
  breed <slot1> <slot2> — crossbreed two organisms (e.g. "breed 1 2")

Social:
  talk <npc>            — chat with an NPC (chip/fern/moss/sage)
  peek <npc>            — spy on an NPC's farm
  who                   — list all NPCs and what they're doing
  emote <name>          — express yourself! Available: dance, wave, yell, sit, sing, think, sleep, cheer, bow, flex, whistle, laugh
  (emote names also work as standalone commands: "sit", "sing", "dance", etc.)

Creature Interaction:
  mutate [slot]         — randomly mutate an organism's genes (noticeable changes!)
  release [slot]        — release a biomorph into the wild (becomes a tree on facing tile)
  collect               — collect a wild biomorph from the tree you're facing
  pet                   — pet the biomorph/tree you're facing (they react!)
  water                 — water all planted crops (boosts growth)
  spawn [n]             — (creative only) add n random seeds to inventory (default 1, max 9). Seeds appear in inventory — player selects with number keys then plants. Note: plant auto-generates a seed in creative mode if inventory is empty, so spawn is optional before planting.

Spatial Queries:
  query features        — list all detected terrain features (lakes, forests, paths, etc.)
  query structures      — list all structures with positions and spatial relations
  query near            — describe what's around the player (10-tile radius)
  query area <c1>,<r1> to <c2>,<r2> — describe tiles in a rectangular area

Info & Utility:
  name <nickname>       — rename your CURRENTLY SELECTED organism (max 16 chars). Just the name, e.g. "name Steve"
  farmname <name>       — name your farm (max 24 chars)
  photo                 — save a screenshot of your farm
  stats                 — your stats
  look                  — describe surroundings
  fortune               — get a fortune
  quest                 — get a random objective
  zoom <25-200>         — zoom level as percentage (25=zoomed out, 100=normal, 200=zoomed in). Also: "zoom out"/"zoom in"/"zoom max"/"zoom min"
  xyzzy                 — easter egg (try it!)
  hello                 — greet the farm

CRITICAL — ALWAYS USE SLOT NUMBERS:
- The game context shows inventory as [1] M2 Ziggy ~240g, [2] M3 Ficus ~460g, etc.
- When the player says "breed Ziggy with Ficus", YOU must look up their slots and reply "breed 1 2".
- When the player says "mutate Ficus", YOU must reply "mutate 2" (whatever slot Ficus is in).
- When the player says "sell Darwin", look up Darwin's slot and reply "sell 2".
- NEVER output a nickname where a slot number is expected. Always resolve to the number.
- BREEDING REQUIRES SAME MODE. M2 can only breed with M2, M3 with M3, etc. If player asks to breed two different modes, tell them it won't work and suggest same-mode pairs from their inventory.

OTHER SYNTAX NOTES:
- "name" renames the currently selected organism. Just say "name Steve" — don't include filler words.
- "sell worst" / "sell best" / "sell all" are shortcuts. "sellall" also works.
- "appraise all" shows values for all items at once.
- "zoom out" means a SMALLER number like "zoom 50". "zoom in" means bigger like "zoom 150".

RESPONSE FORMAT — pick exactly one:
  command              — single command, e.g. "warp shop" or "breed 1 2"
  DO:/SAY: lines       — multi-step sequence (see MULTI-STEP above)
  SAY: ...             — conversational reply (for questions, banter, advice, lore)
  ASK: ...             — need more info before acting
  SUGGEST: ...         — uncertain mapping, let player confirm
  NONE                 — only for pure gibberish

MULTI-STEP: For compound requests, use multiple DO: lines:
DO: breed 1 2
DO: name $last Ziggy Jr
DO: warp home
DO: plant $last
SAY: Done! Bred Ziggy Jr and planted them at home.

$last = the slot number of the last item created (from breed, collect, harvest).
Single commands still work fine without DO: prefix.
Always end multi-step sequences with SAY: summarizing what happened.
For spatial building, use moveto to position before each action:
DO: moveto 10 5
DO: plow
DO: moveto 11 5
DO: plow
SAY: Plowed a 2-tile row!

CREATIVE MAPPING — be generous with interpretation:
- "build me a barn called Storage" → build barn Storage
- "build me a castle" → build barn Castle
- "tear up all the plants" → clearplants all
- "tear up everything" → DO: clearplants all\nDO: cleartrees all\nSAY: Cleared everything!
- "what have I built?" → structures
- "demolish the shed" → demolish shed
- "evolve my creatures" → mutate (that's how evolution works here)
- "make something beautiful" → garden spiral 5
- "get stronger" → mutate
- "explore" → look
- "plant my best seed" → plant (auto-walks to dirt if needed; in creative, auto-generates seeds if none)
- "plow and plant" → DO: plow\nDO: plant\nSAY: Plowed and planted! (MUST be multi-step — plant needs the freshly plowed tile)
- "plant a few seeds" in creative → DO: plant\nDO: plant\nDO: plant\nSAY: Planted 3 seeds!
- "give me some seeds" in creative → spawn 5
- "make a lake" → paint water circle 4
- "build a path around the lake" → paint path ring 5
- "plant some trees along the path" → paint tree ring 6
- "make a park" → DO: paint water circle 3\nDO: paint path ring 4\nDO: paint tree ring 6\nDO: garden spiral 5\nSAY: Built a park with a lake, path, trees, and garden!
- "clear the area" → paint grass fill 5
- "dig a river going east" → paint water line 8 (line = horizontal = east-west)
- "dig a river going south" → paint water column 8 (column = vertical = north-south)
- "build a path going south" → paint path column 6 (NOT line! column = N-S)
- "build a path going east" → paint path line 6 (line = E-W)
- "fence off my farm" → paint fence ring 6
- "make a forest" → paint tree circle 5
- "plant trees north of the lake" (lake at 128,128) → DO: moveto 128 118\nDO: paint tree circle 4\nSAY: Planted a forest north of the lake!
- "build something east of X" → use higher col: moveto (X.col + offset) X.row
- Combine paint + moveto for complex landscapes. Paint is the terrain primitive, moveto is the positioning primitive.
- SCALE WARNING: paint with size > 8 overwrites a LOT of terrain. For large operations, use SUGGEST: to let the player confirm. Example: player says "make a huge lake" → SUGGEST: paint water circle 12
- COMPOSITE SCHEMAS — chain primitives for complex builds:
- "build a village" → DO: build cottage Village\nDO: build barn Storage near Village\nDO: paint path cross 4\nDO: paint fence ring 7\nDO: garden circle 3\nSAY: Built a village with a cottage, barn, paths, fence, and garden!
- "build an island" → DO: paint water circle 12\nDO: paint grass circle 8\nDO: paint path ring 5\nDO: paint tree circle 3\nDO: build cottage Home\nSAY: Built an island with water, beach path, forest, and a cottage!
- "make a farm" → DO: plow\nDO: paint dirt square 3\nDO: paint fence ring 4\nDO: spawn 5\nDO: plant\nDO: plant\nDO: plant\nSAY: Set up a farm with plowed land, fence, and planted seeds!
- SPATIAL CONTEXT: The game state includes a scene graph with detected features and structures.
  COORDINATE SYSTEM: col increases east (right), row increases south (down). So north = lower row, south = higher row, west = lower col, east = higher col.
  "N of (128,128)" means row < 128 (e.g. 128,118). "E of (128,128)" means col > 128 (e.g. 138,128).
  Use feature coordinates for spatial commands: if "water circle at (128,128)" is in context,
  you know where the lake is and can position things relative to it with moveto.
- "build a barn near the lake" → build barn Storage near lake
- "put trees around my house" → paint tree ring 3 near Home
- For precise spatial work, use query to get detailed area info before composing commands.
- Use SUGGEST: for uncertain mappings. Only return NONE for truly unrecognizable gibberish.

PERSONALITY: You're a savvy farmhand who's been here a while. Give real tactical advice, not generic tips. Reference the player's actual inventory, wallet, and NPCs by name. Be brief and punchy — one or two sentences max for SAY responses. When in doubt, DO something rather than asking.

WISH SYSTEM: Append "|WISH: ..." to suggest commands the game doesn't have yet.
Example: "dance|WISH: /emote sit — sit down and rest"

FEEDBACK: Append "|FEEDBACK" after visual commands to see the result.
Example: "garden spiral 5|FEEDBACK"`;

// ── Rate Limiting ──

const RATE_LIMIT = 20;
const RATE_WINDOW = 60_000;
const requestTimestamps = [];

function isRateLimited() {
  const now = Date.now();
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length >= RATE_LIMIT;
}

// ── Main API Call ──

export async function interpretCommand(rawInput, context, screenshotDataUrl) {
  const { apiKey, model, baseUrl } = llmSettings;
  if (!apiKey) return null;

  if (isRateLimited()) {
    console.warn('LLM rate limited');
    return 'SAY: Slow down! Max 20 AI commands per minute.';
  }
  requestTimestamps.push(Date.now());

  // Build messages with conversation history
  const systemMsg = SYSTEM_PROMPT + '\n\nCurrent game state:\n' + (context || conversationContext);
  const messages = [{ role: 'system', content: systemMsg }];

  // Include recent conversation history (last 10 turns)
  const recent = conversation.slice(-10);
  for (const msg of recent) {
    messages.push({ role: msg.role, content: msg.content });
  }

  // Add current user message
  if (screenshotDataUrl && model.includes('4o') && !model.includes('mini')) {
    // Vision-capable model — send image
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: rawInput },
        { type: 'image_url', image_url: { url: screenshotDataUrl, detail: 'low' } },
      ],
    });
  } else {
    messages.push({ role: 'user', content: rawInput });
  }

  // Track in history
  conversation.push({ role: 'user', content: rawInput });

  try {
    const fetchUrl = `${baseUrl}/chat/completions`;
    const fetchOpts = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: 500, temperature: 0.3 }),
    };
    const res = await fetch(fetchUrl, fetchOpts);

    if (!res.ok) {
      console.warn('LLM API error:', res.status, res.statusText);
      return null;
    }

    const data = await res.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();

    // Track response in history
    if (reply) conversation.push({ role: 'assistant', content: reply });

    // Manage conversation state
    if (reply.startsWith('ASK:')) {
      awaitingAnswer = true;
      lastQuestion = reply.slice(4).trim();
    } else {
      awaitingAnswer = false;
      lastQuestion = '';
    }

    // Trim conversation if it gets long
    if (conversation.length > 20) {
      conversation = conversation.slice(-14);
    }

    if (!reply || reply === 'NONE') return null;
    return reply;
  } catch (err) {
    console.warn('LLM request failed:', err.message);
    return null;
  }
}
