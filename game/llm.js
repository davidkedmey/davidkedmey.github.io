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

export function buildGameContext(gameState, player, npcStates, planted, collection) {
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

  const ctx = [
    `Day ${gameState.day} | ${player.wallet}g | Inventory: ${inv.length} items`,
    invLines.length > 0 ? invLines.join('  ') : '(empty)',
    `Planted: ${planted.length} plots`,
    `NPCs: ${npcLines}`,
    `Mode: ${gameState.sandboxMode ? 'sandbox' : gameState.creativeMode ? 'creative' : 'survival'}`,
  ].join('\n');
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
  plant [slot]          — plant a seed on the dirt tile you're facing
  harvest               — harvest a mature plant you're facing
  plow                  — plow grass into dirt for planting
  garden <shape> [size] — auto-build a garden (circle/ring/line/row/column/grid/square/cross/spiral, size 1-8)

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

Info & Utility:
  name <nickname>       — rename your CURRENTLY SELECTED organism (max 16 chars). Just the name, e.g. "name Steve"
  farmname <name>       — name your farm (max 24 chars)
  photo                 — save a screenshot of your farm
  stats                 — your stats
  look                  — describe surroundings
  fortune               — get a fortune
  zoom <25-200>         — zoom level (smaller = zoomed out)

IMPORTANT SYNTAX NOTES:
- "name" renames whatever's in your current slot. To name slot 1 "Steve", just say "name Steve". DON'T include the slot number or "my first biomorph" — just the name.
- "sell 2" sells slot 2. "sellall" sells everything. For "sell my worst", use "rank" first to find the lowest, then sell that slot.
- "appraise all" shows values for all items at once.
- "breed 1 3" breeds slots 1 and 3. Always use slot numbers.
- "zoom out" means a SMALLER number like "zoom 50". "zoom in" means bigger like "zoom 150".

RESPONSE FORMAT — pick exactly one:
  command              — execute directly, e.g. "warp shop" or "breed 1 2"
  SAY: ...             — conversational reply (for questions, banter, advice, lore)
  ASK: ...             — need more info before acting
  SUGGEST: ...         — uncertain mapping, let player confirm
  NONE                 — only for pure gibberish

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
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 200,
        temperature: 0.3,
      }),
    });

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
