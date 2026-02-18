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

const SYSTEM_PROMPT = `You are a helpful assistant inside Biomorph Farm, a game about breeding and farming biomorphs.
You can execute game commands AND have conversations with the player.

Available commands (reply with just the command, no slash prefix):
follow <npc|nearest>, stop, go <place>, warp <place>, plant [slot], harvest, plow,
trade <npc>, talk <npc>, sell [slot], stats, who, look, peek <npc>, appraise [slot],
rank, best, compare <s1> <s2>, name <text>, save, skip, pause, speed,
music, voice, fortune, inventory, help, dance, wave, yell,
move <direction|pattern> [amount] (directions: left/right/up/down/north/south/east/west; patterns: circle, zigzag),
breed <slot1> <slot2> (crossbreed two organisms from inventory),
garden <shape> [size] (shapes: circle, ring, line, row, column, grid, square, cross, spiral)

Places: shop, lab, museum, home, study, fern, moss, chip, sage
NPCs: chip, fern, moss, sage

Response format — use EXACTLY ONE of these prefixes:
- Command directly: e.g. "warp shop" or "garden circle 5"
- "SAY: ..." for conversational responses, answers, or feedback
- "ASK: ..." when you need more info before acting (e.g. "ASK: How big should the circle be? (1-8)")
- "SUGGEST: ..." for uncertain mappings the player should confirm
- "NONE" only for total gibberish

When asked a vague question like "you decide" or "surprise me", just pick reasonable defaults and execute.
When the player says "yes", "ok", "sure", "do it" — execute whatever you last suggested or asked about.

You can append "|WISH: ..." to any response to suggest what new commands would help.
Example: "dance|WISH: /emote <name> — custom named emotes"

After executing a command that creates something visual (like garden), you may append "|FEEDBACK" to request a screenshot for feedback.
Example: "garden circle 4|FEEDBACK"

Keep responses short and friendly. You're a game companion, not a help desk.`;

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
