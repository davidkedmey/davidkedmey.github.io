// LLM integration: AI command interpretation via OpenAI-compatible API

const LLM_SETTINGS_KEY = 'biomorph-llm-settings';

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

// Build a concise game context string for the LLM
export function buildGameContext(gameState, player, npcStates, planted, collection) {
  const inv = player.inventory;
  const invLines = inv.slice(0, 9).map((item, i) => {
    if (item.kind === 'organism') {
      const price = item.sellPrice || '?';
      return `[${i + 1}] M${item.mode} seed ~${price}g`;
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

  return [
    `Day ${gameState.day} | ${player.wallet}g | Inventory: ${inv.length} items`,
    invLines.length > 0 ? invLines.join('  ') : '(empty)',
    `Planted: ${planted.length} plots`,
    `NPCs: ${npcLines}`,
  ].join('\n');
}

const SYSTEM_PROMPT = `You interpret natural language commands for Biomorph Farm.
Map the player's input to exactly one game command.

Commands:
follow <npc>, stop, go <place>, warp <place>, plant [slot], harvest, plow,
trade <npc>, talk <npc>, stats, who, look, peek <npc>, appraise [slot],
rank, best, compare <s1> <s2>, name <text>, save, skip, pause, speed,
music, voice, fortune, inventory, help, dance, wave, yell

Places: shop, lab, museum, home, study, fern, moss, chip, sage
NPCs: chip, fern, moss, sage

Reply with ONLY the command to execute (no slash prefix).
If the input is a question or conversation, reply with a short answer prefixed by "SAY:".
If uncertain but you have a reasonable guess, reply with "SUGGEST:" followed by the command.
Only reply "NONE" for complete gibberish.`;

// Rate limiting: max 10 requests per minute
const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;
const requestTimestamps = [];

function isRateLimited() {
  const now = Date.now();
  // Remove timestamps older than the window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_WINDOW) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length >= RATE_LIMIT;
}

export async function interpretCommand(rawInput, context) {
  const { apiKey, model, baseUrl } = llmSettings;
  if (!apiKey) return null;

  if (isRateLimited()) {
    console.warn('LLM rate limited: too many requests');
    return 'SAY: Slow down! Max 10 AI commands per minute.';
  }
  requestTimestamps.push(Date.now());

  const systemMsg = SYSTEM_PROMPT + '\n\nCurrent game state:\n' + context;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: rawInput },
        ],
        max_tokens: 150,
        temperature: 0.2,
      }),
    });

    if (!res.ok) {
      console.warn('LLM API error:', res.status, res.statusText);
      return null;
    }

    const data = await res.json();
    const reply = (data.choices?.[0]?.message?.content || '').trim();

    if (!reply || reply === 'NONE') return null;
    return reply;
  } catch (err) {
    console.warn('LLM request failed:', err.message);
    return null;
  }
}
