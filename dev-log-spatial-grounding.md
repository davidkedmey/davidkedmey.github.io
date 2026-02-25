# Dev Log: The Spatial Grounding Problem — When an LLM Paints a Fence Inside Its Own Lake

**Date:** 2026-02-25
**Status:** Fix deployed, observations ongoing

---

## The Problem

The command bar had been working beautifully for self-contained operations. "Make a lake" produces a nice circle of water. "Build a cottage" drops a structure. But then you say "surround the lake with a fence," and the AI paints a fence ring *inside* the lake. The ring is smaller than the water it was supposed to enclose.

Here's what happened: the AI had painted `water circle ~7` to create the lake, then responded to "surround it with fence" by painting `fence ring 5`. Ring 5 is smaller than circle 7. The fence appeared *inside* the lake, submerged under water tiles, achieving the exact opposite of what was asked.

A second failure showed up immediately after. "Build a cottage and a barn" produced two structures stacked on top of each other. The AI correctly generated two `build` commands but never moved between them — both structures spawned at the player's current position, overlapping into an unreadable mess.

These aren't hallucination bugs. The AI had all the information it needed. The scene graph showed the lake's radius. The coordinate system was documented. The commands exist to move between builds. The AI just didn't connect "surround" to "must be bigger than the thing you're surrounding."

## The Semantic-Physical Execution Gap

This failure mode has a name in recent research. Zheng et al. (2026) call it the "semantic-physical execution gap" in their Code2Worlds paper: the distance between what an LLM can express semantically ("put a fence around the lake") and what it can execute physically (computing that the fence ring must have a larger radius than the lake circle).

LLMs predict plausible tokens, not geometry. "Fence ring 5" is a plausible-looking command. It has the right syntax, the right tile type, the right shape. It's just the wrong number. And the wrongness is only apparent if you understand that ring 5 fits inside circle 7 — a spatial fact that lives in the geometry of the game world, not in the token distribution.

This is related to what Yamada et al. found in "From Text to Space" (2025): LLMs achieve 98% accuracy on grid tasks when given structured coordinate representations, but drop to 30% with natural language spatial descriptions. The format matters more than the model. Our AI had the coordinates — but the prompt didn't teach it how to use them for relative operations.

## Three Failure Modes

Working through test cases, three distinct spatial failures emerged:

**1. Relative Sizing.** "Surround X with Y" requires Y to be geometrically larger than X. The AI treats the ring size as an independent aesthetic choice instead of computing it from the feature's radius. It picks a number that "sounds right" — ring 5 sounds like a reasonable fence — without checking whether 5 > 7. This is the fence-inside-lake bug.

**2. Structure Overlap.** When building multiple structures in one command sequence, the AI generates sequential `build` commands without inserting `moveto` commands between them. Both structures spawn at the player's position. The AI understands that structures are separate things but doesn't model that separate things need separate locations.

**3. Destructive Overwrite.** The AI paints a new feature on top of an existing one without realizing the new paint will obliterate the old feature. "Add a path through the forest" might erase half the trees. This one is partially handled by the existing SCALE SAFETY warning for large paints, but the AI doesn't connect "painting over" with "destroying what's there."

All three share a root cause: the AI has spatial data (scene graph with radii, coordinates, feature relationships) but lacks *patterns* for turning that data into correctly-sized, correctly-positioned operations. It's like giving someone a ruler and a blueprint but never teaching them to measure before cutting.

## What the Research Says

How does published work handle this? We surveyed the landscape:

| System | Approach | Spatial grounding? |
|--------|----------|--------------------|
| **Voyager** (Wang et al., 2023) | LLM writes JavaScript programs for Minecraft agents | Implicit — code can query block positions, but spatial reasoning is delegated to hand-written library functions |
| **Code as Policies** (Liang et al., 2023) | LLM generates Python policy code that calls perception APIs | Yes — the key insight. LLM writes code that *computes* geometry rather than reasoning about it directly |
| **SayCan** (Ahn et al., 2022) | LLM scores affordances, robot selects executable actions | Physical grounding through affordance functions, not spatial reasoning |
| **Inner Monologue** (Huang et al., 2023) | LLM plans with environment feedback loops | Grounding through iterative observation, not upfront spatial computation |
| **Roblox 4D** (2024) | LLM generates Lua code for 3D scene construction | Code-based — same pattern as Code as Policies. Spatial math lives in the code, not the LLM |
| **WorldCoder** (Hao et al., 2024) | LLM builds world models as Python programs | World-model approach — learns spatial rules through code synthesis |
| **Code2Worlds** (Zheng et al., 2026) | LLM generates executable world-building code from descriptions | Names the "semantic-physical execution gap" explicitly. Proposes code generation as the bridge |

The pattern is clear: every system that succeeds at spatial tasks does so by having the LLM generate *code* that computes geometry, rather than having the LLM reason about geometry directly. Code as Policies is the canonical formulation: don't ask the LLM "where should the fence go?" — ask it to write `fence_radius = lake_radius + 2`.

But we're not in code-generation territory. Our AI writes text commands, not programs. The whole point of the architecture is that the AI is a translator — it writes the same commands a player would type. We can't have it emit Python.

## Our Architecture

Before describing the fix, it's worth noting what we already have that most research systems don't: a real-time scene graph with semantic feature detection.

The game's `detectFeatures()` function runs flood-fill on the tile grid, identifies connected regions of water, trees, and other terrain, classifies them by shape (circle, ring, path, cluster), computes approximate radii, and names them ("lake," "forest-1," "tree-border"). Structures are tracked separately with exact coordinates.

Every LLM call gets a compact scene graph in the system prompt:

```
Features: water circle r≈7 at (128,128), trees ring r≈10 at (128,128)
Structures: Home at (113,128), Storage at (140,125)
```

The AI can read this. It knows the lake is radius 7 at position 128,128. It knows Home is at 113,128. The information is there — structured, compact, and in the format that Yamada et al. showed works best (coordinate-based, not natural language).

The problem was never missing data. It was missing *patterns* — the prompt didn't teach the AI the recipe for turning feature data into correctly-sized operations.

## The Fix

The fix is three additions to the system prompt:

**Relative sizing rules.** After the existing SCALE SAFETY section, we added explicit instructions for "surround" / "around" / "enclose" operations:

```
RELATIVE SIZING (CRITICAL for "surround", "around", "enclose"):
  The scene graph shows features with approximate radius (r≈N).
  To SURROUND a feature, your ring/fence MUST be LARGER than the feature:
    "surround the lake with fence" → read lake r≈7 from features → paint fence ring 9 near lake (r+2)
    "put trees around the garden" → read garden r≈4 → paint tree ring 6 near garden (r+2)
  NEVER use a ring size smaller than or equal to the feature you're surrounding!
  General rule: surround_size = feature_radius + 2
```

The `r+2` formula is the bridge. Instead of asking the AI to reason about geometry ("is 5 bigger than 7?"), we give it a recipe: read the radius, add 2, use that number. This is a baby version of the Code as Policies pattern — the "code" is just arithmetic in a prompt template, but it serves the same purpose. The LLM doesn't reason about space; it follows a formula.

**Structure spacing.** For the overlap problem, we added explicit movement instructions:

```
STRUCTURE SPACING: Structures are 3-5 tiles wide. When placing multiple:
    "build a cottage and a barn" → DO: build cottage Home
                                   DO: move east 8
                                   DO: build barn Storage
```

**Failure-specific examples.** We added the exact failure cases as few-shot examples in the CREATIVE MAPPING section. "Surround the lake with a fence" now has a worked example showing the radius lookup and size computation.

This is prompt engineering at its most literal: we observed failures, identified the missing reasoning step, and wrote it into the prompt as an explicit pattern. It's not elegant. It won't scale to arbitrary spatial reasoning. But for the specific failure modes we observed, it works — the AI now produces `fence ring 9` when the lake is radius 7.

## The Deeper Question

Is this a real fix or a patch? It's a patch. We're teaching the AI three specific spatial recipes. The next novel spatial request — "build a moat around the village" — might fail in a new way that needs a new recipe.

The real fix, following the Code as Policies insight, would be a constraint resolver in the game engine. The AI would express intent (`surround lake fence`) and the engine would compute the geometry. We already have this partially — `build barn near lake` uses landmark resolution to find valid placement coordinates. But `paint fence ring ? near lake` still requires the AI to choose the ring size, which requires spatial reasoning.

A constraint-aware paint command might look like:

```
paint fence surround lake     ← engine computes ring size automatically
paint path between Home lake  ← engine computes path coordinates
```

This moves spatial computation entirely out of the LLM and into the game engine, where it belongs. The AI expresses spatial *relationships*, the engine resolves them into coordinates and sizes.

## What's Next

Three directions, roughly in order of ambition:

1. **Closed-loop observation.** After painting, auto-query the scene graph and inject the updated state into the next turn. The AI can self-correct: "The fence ring I just painted has r≈5, but the lake has r≈7 — the fence is too small, repainting at r≈9."

2. **Constraint validation.** Before executing a paint command, check basic spatial constraints. Is the ring bigger than the feature it's supposed to surround? Is the structure placement at least 6 tiles from existing structures? Reject and re-prompt if constraints are violated.

3. **Spatial intent primitives.** `paint fence surround lake`, `build barn north-of lake 10`, `paint path between Home Storage`. The AI expresses spatial relationships, the engine does the math. This is the full Code as Policies pattern, implemented at the command level instead of through code generation.

The prompt-engineering fix gets us through the immediate failures. The constraint resolver is the principled long-term solution. The interesting question is whether the gap between them — the space of spatial tasks that defeat prompt recipes but don't yet have engine support — is large or small. Early testing suggests it's manageable. Most player requests fall into a small number of spatial patterns: surround, place-near, place-between, line-from-to. A handful of engine-side primitives might cover 95% of cases.

## References

- Zheng, Y. et al. (2026). "Code2Worlds: Bridging the Semantic-Physical Execution Gap in LLM-Generated Virtual Environments." *arXiv preprint*.
- Yamada, H. et al. (2025). "From Text to Space: Spatial Representation Formats for LLM Grounding." *arXiv preprint*.
- Liang, J. et al. (2023). "Code as Policies: Language Model Programs for Embodied Control." *ICRA 2023*.
- Wang, G. et al. (2023). "Voyager: An Open-Ended Embodied Agent with Large Language Models." *NeurIPS 2023*.
- Ahn, M. et al. (2022). "Do As I Can, Not As I Say: Grounding Language in Robotic Affordances." *CoRL 2022*.
- Huang, W. et al. (2023). "Inner Monologue: Embodied Reasoning through Planning with Language Models." *CoRL 2023*.
- Hao, S. et al. (2024). "WorldCoder: A Model-Based LLM Agent." *ICML 2024*.

## Files

- **`game/llm.js`** — System prompt with relative sizing rules, structure spacing, failure-specific examples (~lines 337-343, 447-451, 444-447)
- **`dev-log-spatial-grounding.md`** — This file
