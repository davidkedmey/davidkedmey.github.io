# LLM Command Bar — Vision & Test Findings

## Aspiration: Roblox 4D-Style Generative Creation

Roblox's "4D generation" (Feb 2026) adds the dimension of **interactivity** to AI-generated
3D objects. Their Cube foundation model doesn't just create static geometry — it decomposes
objects into **schemas** (structured rulesets that break an object into functional parts), then
attaches **behavioral scripts** adapted to the generated object's unique dimensions. A player
types "give me a car" and gets a drivable car: 5 mesh parts (body + 4 wheels), each with
physics and steering scripts retargeted to the generated shape.

The key insight: **schemas as the bridge between natural language and functional game objects.**
A schema defines what parts an object has and what behaviors they need. The AI doesn't
generate code from scratch — it selects a schema, generates geometry to fill it, then adapts
pre-built behavior scripts to fit.

### What this means for Biomorph Builder

We already have the primitives:
- **Terrain painting** (circle, ring, square, line, column, cross, spiral)
- **Structure building** (cottage, barn, shop, study — each a schema with defined footprint)
- **Organism spawning** (biomorphs with genotypes, growth stages, breeding compatibility)
- **Garden composition** (fenced area + planted biomorphs — our most "4D" command)

What we're missing is the **schema layer** that chains these primitives into higher-order
compositions. "Build a village" should decompose into a schema: structures at positions,
paths connecting them, a garden, a water source. Each part is a primitive the game already
knows how to execute — the AI's job is selecting and arranging them spatially.

### The composition hierarchy

```
Natural language prompt
  → Schema selection (village, farm, park, island, forest...)
    → Part decomposition (structures, terrain features, organisms)
      → Primitive commands (paint, build, spawn, garden, move)
        → Game state changes (tile writes, entity spawns, structure placement)
```

This is exactly what our DO:/SAY: multi-step action format already supports — we just need
the AI to be better at composing these chains, and we need more primitive shapes to work with.

## Test Session: Canvas Mode World-Building (2026-02-25)

Started from a blank Canvas (all grass). Attempted to build a complete world using only natural language.

### What Worked Well

| Command | Result | Notes |
|---------|--------|-------|
| `make a lake nearby` | Large water circle painted around player | Impressive — mapped to `paint water circle 7` |
| `surround the lake with trees` | Tree ring painted around the lake | Correctly inferred ring shape from "surround" |
| `build a cottage to the south` | Gray stone building appeared | Multi-step: moved south, then built |
| `move south 15 tiles` | Player walked south | Movement commands work well |
| `plow the ground in front of me and plant my biomorph` | Ground plowed (dirt tile appeared) | Multi-step partially worked (plow succeeded, plant may have failed) |
| `make a fenced garden to the east` | Massive fenced garden with biomorphs | Most impressive result — `garden` command is powerful |
| `build a barn to the west` | Barn structure appeared to the west | Building placement with direction works |
| `name my farm Dawkins Ranch` | (Likely worked, hard to verify visually) | Naming commands route correctly |
| `tell me a joke` | AI responded with conversational text | SAY: responses display properly with word wrap |
| `how do I plant a biomorph` | Helpful instructions shown | AI correctly explains game mechanics |

### Deficiencies Found

#### 1. Directional Paint Shapes
**"build a path going south"** → painted an east-west line instead of a north-south column.

**Root cause:** The `line` shape paints horizontally. There's a `column` shape for vertical, but the AI doesn't reliably distinguish "south" → column vs "east" → line.

**Fix:** Improve system prompt to explicitly teach: `paint path column` = vertical (north-south), `paint path line` = horizontal (east-west). Add examples.

#### 2. Destructive Large Operations / No Undo Warning
**"create a spiral path centered on me"** → painted a massive path square that wiped out the lake, trees, and garden.

**Root cause:** Paint operations overwrite existing tiles with no confirmation. A single bad command can destroy hours of work.

**Fixes needed:**
- AI should use `|FEEDBACK` flag on large paint operations to check results
- Consider a confirmation step for paint commands with radius > 10
- Add an `/undo` command that reverts the last paint operation (tile-level undo stack)
- System prompt should warn: "For large operations, use SUGGEST: to let the player confirm first"

#### 3. Spawn Command Silent Failure
**"spawn a biomorph"** and **"spawn 5 biomorphs around me"** → nothing visible happened.

**Root cause:** Unclear — may require specific tile type, or sandbox spawn has restrictions. No error message shown to player.

**Fix:** `spawn` handler should show an error message when it fails. AI should know spawn prerequisites.

#### 4. Zoom via Natural Language
**"zoom out all the way"** → no change. Even **"zoom 0.25"** didn't seem to work.

**Root cause:** Zoom command may have restrictions or the AI mapped it wrong.

**Fix:** Verify zoom command works in sandbox mode. Add to system prompt examples.

#### 5. Plant in Multi-Step Didn't Complete
**"plow and plant"** → plow worked but plant didn't fire.

**Root cause:** In sandbox/creative mode, the player has a biomorph in their palette but the `plant` command may expect an inventory slot number. The AI said `plant 1` but slot 1 in sandbox is handled differently.

**Fix:** System prompt should explain sandbox planting mechanics. `plant` handler should handle sandbox mode gracefully.

#### 6. Message Display Timing
Short messages (like `/look` results) disappear before you can read them — only 2.5 seconds default.

**Fix:** AI responses should use longer durations (5-8 seconds). Or messages should persist until the player types the next command.

#### 7. No Conversation History Visible
The AI maintains conversation state but the player can't see previous exchanges. After a command runs, the response vanishes.

**Fix (aspirational):** Add a scrollable message log visible below the command bar, or a `/history` command.

### Feature Gaps (Aspirational)

#### Tier 1: Quick Wins
- [ ] **Undo paint** — `/undo` reverts last terrain paint operation
- [ ] **Confirm large operations** — AI uses SUGGEST: for radius > 10 paint commands
- [ ] **Better directional mapping** — Teach AI line vs column in system prompt
- [ ] **Persistent messages** — Messages stay until next command, not on a timer
- [ ] **Spawn error feedback** — Show why spawn failed

#### Tier 2: Medium Effort
- [ ] **"Make it bigger/smaller"** — AI remembers last paint operation and can resize
- [ ] **"Connect X to Y"** — Paint a path between two named features
- [ ] **"Undo that"** — Natural language undo via conversation context
- [ ] **Composite commands** — "Build a village" = cottage + barn + paths + garden + fence
- [ ] **Copy/paste regions** — "Copy this garden to the north"

#### Tier 3: Schema-Based Composition (Roblox 4D approach)
- [ ] **Named schemas** — Define reusable templates: "village", "farm", "island", "forest"
- [ ] **Schema = parts + spatial layout** — Each schema decomposes into positioned primitives
- [ ] **"Build a village"** → schema selects: cottage at center, barn 10 tiles east, paths connecting them, garden nearby, water source, fence perimeter
- [ ] **Adaptive scripts** — Like Roblox's retargeting: schemas adapt to available space and existing features
- [ ] **Player-defined schemas** — "Save this layout as 'My Farm'" → reusable template
- [ ] **Visual feedback loop** — AI captures screenshot after each step, adjusts placement
- [ ] **Iterative refinement** — "Move the barn closer" / "Make the lake bigger" works via conversation context + undo

### System Prompt Improvements

Current prompt is comprehensive but needs:

1. **Direction ↔ shape mapping examples:**
   ```
   "path going south" → paint path column (NOT line)
   "path going east" → paint path line (NOT column)
   "road from X to Y" → multiple paint commands connecting coordinates
   ```

2. **Scale awareness:**
   ```
   Small: radius 2-3 (decorative detail)
   Medium: radius 5-7 (features like lakes, gardens)
   Large: radius 10+ (WARNING: use SUGGEST: to confirm with player)
   ```

3. **Sandbox-specific context:**
   ```
   In sandbox/canvas mode:
   - Player has a biomorph palette (scroll to browse, shown in sidebar)
   - Plant with: select biomorph tool, click on dirt tiles
   - spawn creates random organisms near the player
   - garden is the power move — creates fenced area with random biomorphs
   ```

4. **Composite command recipes:**
   ```
   "Build a village" → DO: build cottage Village Center
   DO: build barn Village Barn
   DO: paint path cross 3
   DO: paint fence ring 6
   DO: garden 4
   SAY: Built a village with a cottage, barn, paths, fence, and garden!
   ```

## Architecture Notes

- `game/llm.js` — System prompt, API calls, conversation state, spatial detection
- `game/main.js` — Command routing, executeCommand, action runner
- `game/actions.js` — Multi-step action parser and sequential executor
- `game/renderer.js` — Message display, command bar rendering

The LLM receives rich spatial context via `buildGameContext()`: detected terrain features, structures, NPCs, inventory, and coordinate-relative descriptions. This is the foundation for spatial reasoning.

## Next Steps

1. Fix the 5 deficiencies found in testing
2. Improve system prompt with direction/scale/sandbox sections
3. Add undo for paint operations
4. Test multi-step sequences more thoroughly (DO: chains)
5. Build toward composite "build a village" type commands
6. Consider screenshot feedback loop for visual verification
