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

  // Spatial context: player position and nearby tiles
  const ts = tileSize || 48;
  const pCol = Math.floor(player.x / ts);
  const pRow = Math.floor(player.y / ts);
  const facing = player.facing || 'down';

  // Tile type names for spatial context
  const TILE_NAMES = { 0: 'grass', 1: 'dirt', 2: 'water', 3: 'wall', 4: 'floor', 5: 'planted', 6: 'door' };
  let nearbyDesc = '';
  if (world) {
    const tiles = [];
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = pRow + dr, c = pCol + dc;
        if (r >= 0 && r < world.length && c >= 0 && c < world[0].length) {
          const t = world[r][c];
          const name = TILE_NAMES[t] || `tile${t}`;
          if (name !== 'grass' && name !== 'wall' && name !== 'floor') {
            tiles.push(`${name}@(${c},${r})`);
          }
        }
      }
    }
    if (tiles.length > 0) nearbyDesc = `\nNearby: ${tiles.join(', ')}`;
  }

  const structLines = (gameState.structures || []).map(s => `${s.name}(${s.type})@(${s.col},${s.row})`).join(', ');

  const ctx = [
    `Day ${gameState.day} | ${player.wallet}g | Inventory: ${inv.length} items`,
    invLines.length > 0 ? invLines.join('  ') : '(empty)',
    `Position: col ${pCol}, row ${pRow}, facing ${facing}`,
    `Planted: ${planted.length} plots`,
    `NPCs: ${npcLines}`,
    `Mode: ${gameState.sandboxMode ? 'sandbox' : gameState.creativeMode ? 'creative' : 'survival'}`,
    structLines ? `Structures: ${structLines}` : '',
  ].filter(Boolean).join('\n') + nearbyDesc;
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
  build <type> [name]   — build a structure (shed/cottage/barn/tower/pen/wall). Free in creative, costs gold otherwise.
  demolish <name|nearest> — walk to and demolish a named structure, restoring original tiles
  movestructure <name> <col> <row> — relocate a structure to new coordinates
  clearplants [all]     — walk to and remove crops. In creative, clears NPC crops too.
  cleartrees [all]      — walk to and remove trees. In creative, clears all trees.
  destroy <target>      — meta: "plants"→clearplants, "trees"→cleartrees, "everything"→both, else→demolish by name
  structures            — list all player-built structures

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
  spawn [n]             — (creative only) add n random seeds to inventory (default 1, max 9)

Info & Utility:
  name <nickname>       — rename your CURRENTLY SELECTED organism (max 16 chars). Just the name, e.g. "name Steve"
  farmname <name>       — name your farm (max 24 chars)
  photo                 — save a screenshot of your farm
  stats                 — your stats
  look                  — describe surroundings
  fortune               — get a fortune
  quest                 — get a random objective
  zoom <25-200>         — zoom level (smaller = zoomed out)
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
- "plant a few seeds" in creative → DO: plant\nDO: plant\nDO: plant\nSAY: Planted 3 seeds!
- "give me some seeds" in creative → spawn 5
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
    // Use local proxy on localhost to avoid CORS, direct call otherwise
    const useProxy = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const fetchUrl = useProxy ? '/api/llm' : `${baseUrl}/chat/completions`;
    const fetchOpts = useProxy
      ? {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey, baseUrl, model, messages, max_tokens: 500, temperature: 0.3 }),
        }
      : {
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
