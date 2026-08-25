# Dev Log: From Command Line to Conversational Sandbox — Teaching an LLM to Build Worlds

**Date:** 2026-02-23 to 2026-02-24
**Status:** Working, actively evolving

---

## The Starting Point

Biomorph Farm had about 70 commands — `plant`, `breed 1 2`, `sell worst`, `warp shop`, `garden spiral 5`. Press `/` to open the command bar, type the command, hit Enter. The whole surface was a flat `COMMANDS` table mapping keywords to handler functions:

```js
const COMMANDS = {
  warp: cmdWarp,
  go: cmdGo,
  breed: cmdBreed,
  sell: cmdSell,
  plant: cmdPlant,
  garden: cmdGarden,
  paint: cmdPaint,
  // ... ~70 entries
};
```

Worked great for players who already knew the syntax. Completely invisible to everyone else. New players had to type `/help`, read a wall of text, and memorize syntax. The discoverability problem isn't that the commands are hard — it's that you have to know they exist.

## Adding LLM Fallback

The idea: instead of showing "Unknown command" on unrecognized input, fall through to an LLM that translates natural language into the game commands the player would have typed.

The key design decision is that the AI writes the same text a player would type. It never touches game internals. "sell my worst creature" comes back as `sell worst`. "how's Fern doing?" comes back as `peek fern`. The AI is a translator, not an operator — the game's command system remains the single source of truth for what's possible.

The fallthrough pattern is a single `return false` convention. Any command handler can decline:

```js
const handler = COMMANDS[cmd];
if (handler) {
  const result = handler(arg);
  if (result !== false) return; // handler succeeded
  // Handler returned false — fall through to AI
}
```

This means `paint dirt hexagon 5` hits the paint handler, which doesn't know "hexagon," returns `false`, and the AI takes over. The AI might reply `paint dirt circle 5` ("closest shape to a hexagon"), or it might say `SAY: I don't have a hexagon shape — try circle, square, ring, spiral, or cross.` The convention is lightweight — no registration system, no middleware chain. Just "return false if you can't handle it."

Setting up the API key is `/ai key sk-...` and everything stores in localStorage. Bring-your-own-key, defaulting to `gpt-4o-mini` at `api.openai.com/v1`. Works with any OpenAI-compatible endpoint (OpenRouter, Together AI, Ollama).

### The Proxy

Browser-to-API calls hit CORS walls. The simplest fix: a 70-line Python dev server (`server.py`) that handles static files plus two POST endpoints:

```python
elif self.path == '/api/llm':
    # Strip apiKey/baseUrl from request, forward to OpenAI, relay response
    req_data = json.loads(body)
    api_key = req_data.pop('apiKey', '')
    base_url = req_data.pop('baseUrl', 'https://api.openai.com/v1')
    url = f'{base_url}/chat/completions'
    req = urllib.request.Request(url, data=json.dumps(req_data).encode(),
        headers={'Content-Type': 'application/json',
                 'Authorization': f'Bearer {api_key}'})
```

The client checks `location.hostname` — on localhost it hits `/api/llm`, on production it calls the API directly (GitHub Pages, no server). The proxy adds zero dependencies: stdlib `http.server` and `urllib`. It also handles `/api/wish` for the wish system (see below).

### Conversation Memory

The AI keeps the last 10 turns of conversation history, enabling follow-ups:

```
Player: "breed Ziggy with Ficus"
AI:     "breed 1 2"
Player: "name it Ziggy Jr"
AI:     "name Ziggy Jr"      (knows "it" = the result of the last breed)
```

Each turn, the system prompt gets a fresh game state snapshot: day, gold, inventory with slot numbers and nicknames, player position, NPC states, structures. The AI resolves nicknames to slot numbers because the game only speaks slot numbers — `breed 1 2`, never `breed Ziggy Ficus`.

Rate limiting is 20 requests per minute, tracked client-side with a sliding window of timestamps.

## The Action Runner

Single commands weren't enough. "Make a park" requires: walk somewhere, paint water, walk somewhere else, paint a path around it, plant some trees, maybe build a fence. A single `paint water circle 4` doesn't cut it.

The AI needed to write scripts. The response format grew from single commands to multi-line `DO:/SAY:` sequences:

```
DO: paint water circle 4
DO: paint path ring 5
DO: paint tree ring 6
DO: garden spiral 5
SAY: Built a park with a lake, path, trees, and garden!
```

The action runner (`actions.js`) executes `DO:` lines sequentially, waits for walk animations to complete between steps, tracks `$last` (the slot number of the most recently created item), shows progress `[2/5]`, and can be cancelled with Escape:

```js
async function run(actions, say) {
  for (let i = 0; i < doActions.length; i++) {
    if (cancelled) break;
    let cmd = resolveLast(doActions[i].content, lastSlot);
    gameState.actionRunner = { step: i + 1, total: totalSteps, label: cmd };
    showMessageFn(`[${i + 1}/${totalSteps}] ${cmd}`, 2);

    const invBefore = player.inventory.length;
    executeCommandFn(cmd);
    await waitForWalk();

    if (player.inventory.length > invBefore) {
      lastSlot = player.inventory.length; // $last = newest item
    }
  }
}
```

The `$last` variable is what makes compound operations like "breed these two and plant the offspring at home" work:

```
DO: breed 1 2
DO: name $last Ziggy Jr
DO: warp home
DO: plant $last
SAY: Bred Ziggy Jr and planted them at home.
```

The AI became a scripting engine. It composes the game's primitive commands into higher-level operations, the same way a shell script composes Unix utilities.

## Canvas Mode and the Bug Storm

The 256x256 Canvas sandbox was supposed to be the LLM's playground — a blank slate for building landscapes. Taking the action runner there exposed a cascade of bugs.

**Bug 1: Auto-walk disabled in sandbox.** The sandbox had its own movement code that skipped `walkTarget` processing entirely. Walk-based commands (anything that requires the player to move before acting) silently did nothing. Fix: ensure the sandbox update loop processes `walkTarget` the same way the main loop does.

**Bug 2: Empty inventory on fresh Canvas.** Sandbox starts with no inventory. Commands like `plant` that pull from inventory failed silently. Fix: in creative mode, auto-generate seeds when inventory is empty.

**Bug 3: The walkTarget chain.** This was the most satisfying fix. The pattern for chaining walk-based commands — walk to tile A, do something, walk to tile B, do something — uses `onArrive` callbacks. Each callback sets a new `walkTarget`. The bug: the arrival handler was setting the new target *and then the caller nulled it*:

```js
// BROKEN: onArrive sets new target, then we null it
if (cb) cb();            // callback sets gameState.walkTarget = { ... }
gameState.walkTarget = null;  // immediately destroyed
```

The fix is to clear the target *before* calling the callback:

```js
// FIXED: clear BEFORE callback so callback can set a new one
const cb = wt.onArrive;
gameState.walkTarget = null;
if (cb) cb();
```

One line moved. Multi-hour investigation. The symptom was that multi-step action sequences would execute the first command, walk to position, then freeze — the second walk never started. The root cause was invisible in logging because the new target existed for one frame before being nulled.

**Bug 4: Sandbox save not persisting.** Structures and inventory weren't included in the sandbox save/load. Players would build elaborate landscapes, close the tab, and lose everything. Fix: serialize structures and inventory alongside the tile grid.

Each of these was a one-line root cause. Every one of them took an hour or more to find.

## Composable Primitives

The turning point came from a user who said: "Remember Roblox's mission — create generalizable primitives." The LLM was trying to build landscapes, but it only had `garden` (which plants biomorphs in patterns) and `build` (which places structures). It had no way to shape terrain.

This crystallized the Roblox insight: don't build "make a village." Build `paint`, `moveto`, and `build`, and let creativity emerge from composition. Every new primitive multiplies the space of what's possible. The LLM is the natural language interface that makes these primitives accessible to players who don't want to memorize syntax.

So we built `paint` — the core terrain primitive:

```js
const PAINT_TILES = {
  grass: TILE.GRASS, dirt: TILE.DIRT, path: TILE.PATH, stone: TILE.PATH,
  water: TILE.WATER, lake: TILE.WATER, river: TILE.WATER,
  tree: TILE.TREE, trees: TILE.TREE, forest: TILE.TREE,
  wall: TILE.BUILDING, fence: TILE.FENCE,
};
```

Seven tile types. Eight shapes: circle, ring, square, line, column, cross, spiral, dot. Sizes 1-20. The shape logic was extracted into `generateShapeOffsets()` — a shared helper that returns `[dx, dy]` arrays for any shape at any size:

```js
function generateShapeOffsets(shape, size) {
  const offsets = [];
  if (shape === 'circle' || shape === 'disc') {
    for (let dy = -size; dy <= size; dy++)
      for (let dx = -size; dx <= size; dx++)
        if (Math.hypot(dx, dy) <= size) offsets.push([dx, dy]);
  } else if (shape === 'ring') {
    for (let dy = -size; dy <= size; dy++)
      for (let dx = -size; dx <= size; dx++) {
        const dist = Math.hypot(dx, dy);
        if (dist >= size - 1 && dist <= size) offsets.push([dx, dy]);
      }
  } else if (shape === 'spiral') {
    let x = 0, y = 0, dx = 1, dy = 0, steps = 1, stepsTaken = 0, turns = 0;
    const n = (2 * size + 1) * (2 * size + 1);
    for (let i = 0; i < Math.min(n, 200); i++) {
      offsets.push([x, y]);
      x += dx; y += dy; stepsTaken++;
      if (stepsTaken >= steps) {
        stepsTaken = 0; turns++;
        [dx, dy] = [-dy, dx];
        if (turns % 2 === 0) steps++;
      }
    }
  }
  // ... dot, line, column, cross, grid
  return offsets;
}
```

Both `garden` (planting patterns) and `paint` (terrain painting) now call `generateShapeOffsets()`. One shape vocabulary, two applications. And now the AI can compose:

```
"make a lake"           → paint water circle 4
"path around it"        → paint path ring 5
"forest border"         → paint tree ring 7
"build a cottage by it" → moveto 135 128 + build cottage Lakeside
```

The composability is combinatorial. Seven tiles times eight shapes times twenty sizes is 1,120 distinct paint calls, and the AI can chain as many as it wants with `moveto` for positioning. "Make a Japanese garden with a koi pond, stepping stones, and a bamboo border" becomes six or seven `DO:` lines, each a single primitive.

## The Spatial Reasoning Problem

The AI could compose primitives beautifully for self-contained requests. "Make a lake" works because it's relative to the player's current position. But "place the barn north of the lake" requires knowing *where the lake is* and computing coordinates relative to it.

LLMs are terrible at 2D spatial math. This isn't just intuition — it's well-documented. "From Text to Space" (Yamada et al., Feb 2025) found that for grid navigation tasks, giving LLMs Cartesian JSON coordinates yielded 98% accuracy while row-by-row text descriptions dropped to 30%. The spatial representation format matters more than the model.

But our task isn't navigation — it's scene understanding and constraint satisfaction. The AI doesn't need to pathfind. It needs to know "the lake is centered at (128, 128) and is roughly radius 8" and then express "barn: near lake, north side." The game engine can compute the actual coordinates.

## The Solution: Scene Graph + Constraints

A 256x256 canvas is 65,536 tiles. Encoding that as text is insane — it would blow past any context window and the AI couldn't parse it anyway. Instead, we build a scene graph: detect terrain features (connected regions of water, trees, etc.), name them, compute spatial relationships between features and structures.

The AI sees compact, meaningful descriptions instead of raw tile data:

```
lake: water r~8 at (128,128)
Home: 15 tiles west of lake
tree-border: trees ring r~10 around lake
```

Combined with constraint-based placement — `build barn near lake` gets resolved by the game engine finding open space near the lake feature — the LLM never needs to do spatial math. It expresses intent. The engine handles geometry.

This is the same separation of concerns as the original command fallback: the AI writes *what* to do, the game handles *how*. The AI says "near the lake." The game finds the coordinates.

## The Query System

Stuffing the entire scene graph into every prompt would bloat the context. Most commands don't need spatial detail — "sell worst" doesn't care where the lake is. So the base game context stays compact (~200 tokens: day, gold, inventory, position) and the AI can request deeper information on demand via `query`:

```
query area       — what's around me?
query structures — list all structures with positions
query features   — terrain features with spatial relationships
```

This is tool-use without formal tool-use. The AI includes a `query` command in its `DO:` sequence when it needs spatial information, reads the result, and plans its next steps. It keeps the base prompt small while enabling arbitrarily deep spatial reasoning when the task demands it.

## The Wish System

The AI can't execute commands that don't exist. But it can *wish* for them. When the AI encounters something it wants to do but can't, it appends `|WISH: /emote sit — sit down and rest` to its response. The wish gets logged to both localStorage and a server-side file:

```python
# server.py
with open(WISHLIST_PATH, 'a') as f:
    ts = datetime.now().strftime('%Y-%m-%d %H:%M')
    f.write(f'- **{ts}** — "{inp}" → {suggestion}\n')
```

The wishlist becomes a prioritized feature backlog written by actual usage. The emote system (dance, wave, yell, sit, sing, think, sleep, cheer, bow, flex, whistle, laugh) was built entirely from wishes the AI generated during playtesting. So were `mutate`, `release`, `collect`, `water`, `pet`, `photo`, and `farmname`. The AI proposed commands it needed, we built them, and the hit rate climbed from ~70% in the first testing round to ~95% by the fourth.

## The Feedback Flag

Visual commands like `paint` and `garden` change the world, but the AI can't see the result. It has no eyes. The `|FEEDBACK` flag is a request: "I just did something visual — take a screenshot and send it to me next turn so I can see if it worked."

```js
const feedbackIdx = command.indexOf('|FEEDBACK');
if (feedbackIdx >= 0) {
  wantsFeedback = true;
  command = command.slice(0, feedbackIdx).trim();
}
```

When the AI requests feedback, the next API call includes a JPEG screenshot of the canvas (`canvas.toDataURL('image/jpeg', 0.7)`). This only works with vision-capable models (GPT-4o, not 4o-mini), so the screenshot is silently skipped for non-vision models. It's a crude visual feedback loop, but it lets the AI self-correct: "The lake looks too small, let me make it bigger."

## What's Novel

Nobody seems to be doing exactly this combination: LLM as real-time creative collaborator in a tile-based sandbox, composing primitive text commands from a scene graph, with the game engine handling spatial constraint satisfaction.

The closest research:

- **LLMR** (2023) — LLM-driven scene building in Unity. The LLM writes C# code that manipulates the scene directly. Our approach is more constrained: the AI writes the same text commands a player would, never touching game internals.
- **Narrative-to-Scene** (various 2024-2025 papers) — LLM generates semantic predicates, then a procedural system (often cellular automata) builds the scene. Similar spirit, but they're one-shot generation. Ours is conversational and iterative.
- **Roblox's approach** — Roblox's entire philosophy is composable primitives. Their AI assistant generates Lua scripts. We're doing the same thing with a simpler command vocabulary — no code generation, just command composition.

The constraint-based spatial reasoning (scene graph + intent expressions + engine-resolved geometry) seems genuinely underexplored. Most LLM-for-games research either gives the AI direct coordinate access (and it fails at spatial math) or avoids spatial tasks entirely. The scene graph approach lets us eat our cake and have it too: the AI reasons about space in natural language ("north of the lake"), and the engine translates that into coordinates.

## The Roblox Lesson

The deepest lesson from this build is the one the user articulated: don't build "make a village." Build `paint`, `moveto`, and `build`, and let everything else emerge.

Every new primitive multiplies the creative space combinatorially. Seven tile types times eight shapes is 56 paint operations. Add `moveto` for positioning and you can place those 56 operations anywhere on a 256x256 grid. Add `build` for structures and `garden` for biomorph patterns and the space is effectively infinite.

The LLM is the natural language interface that makes this combinatorial space accessible. A player who types "make a Japanese garden" doesn't need to know that `paint water circle 3` exists. They describe what they want, the AI decomposes it into primitives, and the action runner executes them one by one, with progress indicators and cancellation support.

This is a general pattern. It works for any game with a text command interface. Build simple, composable primitives. Add an LLM fallback that translates intent into commands. Add a multi-step action runner. Add a scene graph for spatial context. The LLM becomes a creative collaborator without ever touching game internals.

## What's Next

- **Scene graph implementation** — The design is solid but the feature detection (connected-component analysis of terrain regions, named feature registry, spatial relationship computation) needs to be built out fully. The current spatial context in the prompt is a 5x5 tile neighborhood around the player. The scene graph would replace this with world-scale feature awareness.
- **Constraint resolver** — `build barn near lake` needs an engine-side function that finds valid placement coordinates satisfying spatial constraints ("near," "north of," "between"). Currently the AI has to compute coordinates itself using `moveto`, which works but requires the AI to do spatial math it's bad at.
- **Persistent conversation** — Conversation history resets on page reload. Saving it to localStorage (or even the server) would let players pick up creative sessions where they left off.
- **More primitives** — `road <from> <to>` (auto-path between two points), `zone <name> <shape> <size>` (named areas the AI can reference), `terraform <heightmap>` (if we ever add elevation). Each one multiplies the space.
- **Prompt compression** — The system prompt is ~300 lines. Most of it is command documentation. As the command set grows, we'll need dynamic prompt construction: include only the commands relevant to the current context (farming commands when near farmland, building commands in creative mode, etc.).

## Files

- **`game/llm.js`** — Settings, API call, system prompt, game context builder, conversation history, rate limiting, wish system, screenshot capture
- **`game/actions.js`** — Multi-step action parser and runner (`parseActions`, `createActionRunner`)
- **`game/main.js`** — Command table, `executeCommand()` with fallthrough pattern, `cmdPaint`, `generateShapeOffsets`
- **`server.py`** — Dev server: static files + `/api/llm` proxy + `/api/wish` logger
