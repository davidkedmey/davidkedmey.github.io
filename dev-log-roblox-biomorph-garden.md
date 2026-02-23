# Dev Log: Roblox Biomorph Garden — From ctx.lineTo() to Walkable Sculptures

**Date:** 2026-02-23
**Status:** Working prototype

---

## The Idea

Our biomorph renderer does a recursive depth-first walk of the gene tree. At each node it draws a line segment. In the web version, that's `ctx.lineTo()` on a canvas. But a line segment is just a start point, an end point, and a thickness. There's nothing canvas-specific about it.

In Roblox, `Instance.new("Part")` creates a physical block with a position, size, and orientation. Swap `lineTo` for `new Part` with the same coordinates translated into 3D space, and each biomorph becomes a tree of blocks — literally a block sculpture that matches the 2D silhouette but exists as a walkable, collidable 3D object. Players can walk around them, between the branches, under the canopy.

The gene system, the recursion, the vector definitions, the mutation and crossover — all of it ports unchanged. The only new code is the coordinate transform: 2D gene-space into 3D world-space (gene x → Roblox X, gene y → Roblox Y (up), extrusion → Roblox Z).

## The Density Problem

It worked immediately. Too well. A depth-7 biomorph has 127 branch segments. When they're all the same thickness — sized for visibility on a depth-3 sapling with 7 segments — they overlap into opaque walls. The branching structure that's so legible in 2D becomes an unreadable slab in 3D.

We explored seven approaches:

1. **Transparency gradient** — trunk semi-transparent, tips opaque. Ghostly.
2. **Thinner max thickness** — cap branch width globally. Loses the chunky trunk feel.
3. **Gaps** — shorten each segment to 88% of its length, revealing cracks between connections.
4. **Wireframe trunk** — thick branches become thin + neon material. X-ray quality.
5. **Z-stagger** — offset branches in the Z axis by their vector index so they fan out into real 3D instead of lying flat.
6. **Density-scaled thickness** — more parts → thinner branches.
7. **Gaps + Z-stagger combo.**

We built all seven as switchable render styles with a live UI — click a button, the entire forest rebuilds. The clear winner was #6.

## Density-Scaled Thickness

The formula:

```
if partCount > 30 then
    thickness = thickness * (30 / partCount)^0.5
end
```

Below 30 parts: no change. A depth-3 sapling (7 parts) stays chunky and solid. Above 30: branches thin out proportionally. The square root exponent keeps the falloff gentle — a 127-part depth-7 tree gets branches roughly half as thick, not skeletal. A 255-part depth-8 tree thins a bit more.

The effect naturally mirrors real plant morphology. A bush has few thick stems. A big oak has thousands of thin twigs. The total visual mass stays similar, but complexity becomes legible instead of opaque.

What makes this satisfying is that it's not a rendering hack — it's a principled relationship between the genotype (which determines part count via the depth gene) and the phenotype (visual branch thickness). More developmental complexity → finer structural resolution. That's not a bad analogy for how real organisms work: the more cell divisions in a developmental cascade, the finer the structures it produces.

## Technical Notes

- **Coordinate grounding:** Biomorphs are auto-grounded by computing the bounding box in gene-space and shifting so the minimum Y maps to ground level (Y=0). The depth gene controls target height: depth 1 → ~3 studs (sapling), depth 8 → ~25 studs (tree). A Roblox character is ~5 studs tall.
- **Color:** Each tree gets a random color palette (hueBase + hueRange). Trunk branches are dark/saturated, tips are bright/vivid. The gradient follows recursion depth. Ten palettes cycle through brown→green, blue→cyan, purple→magenta, red→orange, etc.
- **Symmetry:** Mode 2's up-down and four-way symmetries are implemented as post-processing transforms on the line set — mirror all Y coords, then mirror all X coords. The four-way specimens look like kaleidoscope snowflakes.
- **Part budget:** ~100 trees at average ~60 parts each = ~6,000 parts. Roblox handles 10,000-15,000 anchored static parts comfortably. All parts are `Anchored = true`, `CanCollide = true`.
- **Rojo sync:** The project uses Rojo for live file sync from `~/Desktop/BiomorphGarden/` into Roblox Studio. File naming conventions (`.server.lua`, `.client.lua`, plain `.lua`) determine script type automatically.

## What's Next

- **4D Generation integration:** Roblox's `GenerateModelAsync()` can create polished mesh creatures from text prompts. We have a module that converts gene values into natural language descriptions ("A highly complex organic creature, wide spreading, towering...") and feeds them to the Body1 schema. This would be the "HD Render" button — breed fast with Part-trees, optionally generate a museum-quality mesh version.
- **Segmented mode trees in 3D** are already working and look great — the caterpillar specimens with 6-8 segments have a totem-pole quality.
- **The Z-stagger style** is worth revisiting. Combined with density scaling, it could make the sculptures genuinely three-dimensional instead of flat reliefs with depth extrusion. Each branch direction (v1-v8) would fan to a different Z position, so you could walk *through* the branching structure.

## Project Location

- **Roblox project:** `~/Desktop/BiomorphGarden/`
- **Reference implementation:** `~/Desktop/Biomorph Builder/shared/genotype.js`
- **Lua port:** `~/Desktop/BiomorphGarden/src/shared/Genotype.lua`
