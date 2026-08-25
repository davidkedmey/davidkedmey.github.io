# Dev Log: Recursive Body Plans — Buds, Hox Genes, and Facilitated Variation

**Date:** 2026-02-20
**Status:** Concept + prototype

---

## The Problem

Every biomorph is fundamentally one fractal tree, or a stack of identical copies of one. Segmentation (mode 3) repeats the same tree along an axis. Gradients (mode 4) let those repetitions taper. But there's no way to get a spine with differentiated structures growing off it — a head that's different from a tail, limbs that differ from wings, arms with hands at the end. The combinatorial space of the current genome is vast, but the *morphological* space has a ceiling: bilateral fractal trees, repeated and scaled.

Real organisms have body plans with modular, differentiated parts. How do we get there without over-designing?

## Biological Inspiration

Three ideas from the literature converge on a single insight.

### 1. Homeotic Selector Genes (Sean Carroll, *The Making of the Fittest*)

Fruit flies with the *Antennapedia* mutation grow legs where antennae should be. This isn't because the antenna cells "know how" to make a leg — it's because a single upstream switch gene was flipped, activating the leg developmental cascade in the wrong compartment. The key realization: the leg program and the antenna program are both *downstream outputs* of the same recursive developmental machinery. The selector gene doesn't design the leg — it just says "run *that* program *here*."

This is a meta-switch. The complexity lives in the developmental program (which is reused); the selector gene is just an address.

### 2. Compartmentation (Kirschner & Gerhart, "Evolvability," 1998 PNAS)

The vertebrate embryo is divided into spatial domains (compartments). Each compartment can run a different developmental program independently. A mutation affecting limb development in one compartment doesn't wreck the head or the gut. This is what makes body plans *modular* — you can tinker with one part without breaking the whole.

In the current biomorph system, there are no compartments. The entire organism is one `drawTree()` call. Segmentation creates spatial repetition, but every segment runs the same program with the same genes (modulo gradients). There's no concept of "this region develops differently."

### 3. Facilitated Variation (Marc Kirschner, Harvard lecture on Evolvability)

When a bone gets longer through mutation, the nerves, blood vessels, and muscles don't need their own separate mutations to accommodate the change. They *find their way* to the new endpoint through exploratory developmental processes. Kirschner calls this "facilitated variation" — the system is organized so that downstream structures adapt to upstream changes automatically.

This matters enormously for evolvability. If every bone-length change required coordinated mutations in nerves, muscles, tendons, and vasculature simultaneously, vertebrate evolution would be astronomically slower. Instead, one mutation (longer bone) produces a coherent new form because the other systems *accommodate*.

In the current biomorph system, we actually have a primitive version of this already: when you change a gene that makes the trunk longer, all branches attached to that trunk move with it. But the accommodation stops there — we can't have a "limb" that adjusts its own proportions in response to a trunk change, because there are no differentiated sub-structures.

## The Design Constraint

Dawkins' core principle: *"My main objectives in designing Blind Watchmaker was to reduce to the barest minimum the extent to which I designed biomorphs."*

We want complex, differentiated body plans. But we can't *design* body plans. We can only design the **conditions** under which body plans might emerge through evolution. The less we design, the more surprising and instructive the results will be.

## The Insight: Hox Genes as Recursion Switches

The current `drawTree()` algorithm already IS a developmental program. It takes 9 genes and recursively generates a branching form. We don't need to invent a new developmental program. We need to let the existing program be **invoked differently at different positions in the body**.

This is exactly what Hox genes do. They don't contain the instructions for building a leg or an antenna — they activate *which existing program runs* at *which position* along the body axis.

**Translation to biomorphs:** At a certain recursion depth, instead of continuing to branch with the same set of genes, switch to a *different* set of genes. The outer branches develop according to a different "program" (gene-group) than the inner trunk.

```
if (recursion_level == bud_trigger_depth) {
    // switch from trunk genes to bud genes
    recurse(bud_genes, ...)
}
```

This is one conditional added to the existing recursion. But it produces hierarchical differentiation as an *emergent property* — not a designed feature.

## Why This Satisfies Dawkins' Principle

**We are not designing body plans.** We are adding a single new condition: "developmental programs can switch at branch points." Everything else — what the programs produce, where they switch, what the result looks like — emerges through mutation and selection.

Specifically:

- The same `drawTree()` runs for both trunk and buds — we *reuse* the existing embryology
- Bilateral symmetry still comes for free (a bud on the left mirror-images a bud on the right, inherited from the parent tree's structural symmetry)
- **Facilitated variation emerges naturally**: mutate a trunk gene that makes the trunk longer, and all buds move with it. The buds don't need separate mutations to stay attached. Nerves follow bones.
- **Homeotic switching**: mutate which gene-group attaches where, and you get Antennapedia-style transformations — "grow a wing-shape here instead of a leg-shape"
- **Compartmentation**: each bud is a spatial domain with its own developmental program, insulated from mutations in other buds

## The Genome

### Minimal version (prototype)

```
Trunk:  [g1..g8, depth]           — 9 genes (the existing biomorph genome)
Bud:    [g1..g8, depth]           — 9 genes (same format, different values)
Meta:   [budTrigger, budScale]    — 2 genes

Total: 20 genes
```

- **budTrigger** (range 0–depth): at which recursion level the switch happens. 0 = no buds (equivalent to current biomorphs). This gene controls whether the organism has differentiated parts at all.
- **budScale** (range 1–8): relative size multiplier for bud branches (scaled by 0.25× to 1×). Controls how large the bud-growths are relative to the trunk.

The trunk genes define the overall body structure. The bud genes define what grows at the tips. When `budTrigger > 0`, every branch-tip at recursion level `budTrigger` spawns a sub-tree using the bud genes instead of continuing with the trunk genes.

### Why 20 genes is still minimal

Dawkins' original had 9. Mode 5 has 13. We're adding 11 (9 bud genes + 2 meta-genes) for a total of 20. That's less than doubling the genome — still a small, flat integer array with single-gene mutations. The design surface is still tiny. The morphospace explosion comes from the *interaction* between trunk and bud programs, not from the number of genes.

### Future: Multiple bud types

The natural extension: instead of one bud gene-group, have 2–4, with a selector gene that maps "body position → bud type." This would let evolution produce organisms with different limb types at different positions (head vs. legs vs. wings). But the prototype starts with one bud type to validate the concept.

## The Combinatorial Explosion

With 20 genes, each ranging [-9, 9] or [1, 8], the raw state space is roughly 19^18 × 8^2 ≈ 10^24 possibilities. That's enormous. But three things tame it:

1. **Single-gene mutation** — offspring are always one step from their parent. You can't jump to random points. Evolution walks through morphospace.
2. **Human selection** — the user picks what's interesting. The fitness function is aesthetic/intentional, not random.
3. **Structural constraints** — bilateral symmetry, branch-length proportionality, and the shared recursive algorithm mean that most genotypes produce *coherent* forms. This is exactly Kirschner's point: the system is organized so that random variation tends to produce viable variants, not monsters.

Nature handles a genome of 3 billion base pairs. It manages because the developmental architecture *channels* variation into viable forms. Our 20 integers, channeled through recursive tree-drawing with Hox-like switching, should produce a surprisingly rich space of differentiated body plans from minimal conditions.

## Prototypes

### v1: `prototype-buds.html` (20 genes)

Single bud type. Validates the core concept: one conditional in the recursion (`if c === budTrigger, switch to bud genes`) produces hierarchical body plans. Two-color rendering (blue trunk, orange buds) makes the developmental switching visible. Facilitated variation confirmed: trunk mutations coherently reshape the whole organism while preserving bud structure.

### v2: `prototype-buds-v2.html` (34 genes)

Full segmented body plans with dual Hox-gene programs. Key additions over v1:

- **Segmentation** (1-6 segments with variable spacing) — creates spine-like body axes
- **Two bud types**: Bud A (orange/anterior) and Bud B (purple/posterior) — different developmental programs at different body positions
- **budSwitch gene** — controls which segment is the A/B boundary. A single mutation shifts the head/tail boundary, exactly like Hox gene domain shifts in real evolution
- **trunkGrad gene** — tapers the spine across segments (wider head, narrower tail or vice versa). Makes organisms asymmetric along the body axis.
- **budDensity gene** — controls what fraction of branch-tips actually sprout buds (1/8 to 8/8). Maps to developmental signal thresholds. Low density produces sparse, legible, creature-like forms. High density produces dense fractal canopies.
- **Depth-based line thickness** — thicker near roots, thinner at tips. Gives an organic, tree-like taper.
- **Proportional mutation rate** — 2 genes per offspring at gentle intensity (vs 1 in original Dawkins). With 34 genes, single-gene mutation is only ~3% of the genome — too subtle for the user to see meaningful variation. Scaling to 2 maintains similar proportional pressure as Dawkins' 9-gene system (~11% per offspring).

### Key observations from breeding

1. Three-color rendering (blue/orange/purple) makes body plan organization immediately legible
2. Trunk mutations reshape the whole organism coherently (facilitated variation)
3. Bud mutations only affect the relevant organs (compartmentation)
4. The budSwitch gene produces dramatic "homeotic" transformations when it mutates
5. budDensity is perhaps the most impactful visual gene — the difference between density 3/8 (sparse creature-like) and 8/8 (dense fractal canopy) is dramatic
6. trunkGrad breaks the perfect symmetry between segments, making organisms look more biological

### v3: `prototype-buds-v3.html` (36 genes)

Full body plans with radial symmetry and digit gradients. Key additions over v2:

- **radialArms gene** (0-8): 0 = bilateral (default), 2-8 = radial symmetry. The entire organism is rotated N times around the center, producing starfish, jellyfish, and snowflake-like forms. The rotation is applied as a post-processing step to the line data, so it composes cleanly with all other features (segmentation, buds, gradients).
- **budGrad gene** (-9..9): A Sonic Hedgehog-like morphogen gradient. Bud scale varies across branch-tip positions within each segment — left-most buds get a different scale than right-most buds. This creates asymmetric digit lengths (thumb vs pinky). The gradient is calculated as `budScale * max(0.2, 1 + budGrad * 0.08 * (gradT - 0.5))` where `gradT` is the normalized position of each bud-tip in the sprouting sequence.
- **30% radial chance in `randomInteresting()`**: Most random organisms are bilateral (creature-like), but occasionally radial forms appear, producing echinoderm/cnidarian body plans.

### Key observations from v3 breeding

1. Radial forms with segmentation produce stunning snowflake/mandala patterns — segments radiate outward with bud differentiation
2. Non-radial forms remain the best candidates for the bone demo — bilateral creatures with clear head/tail differentiation
3. budGrad effect is subtle but present — needs high values (±5-9) to produce visually obvious left-right asymmetry in bud sizes
4. The full 36-gene system still breeds well with gentle mutation (2 genes per offspring ≈ 6% of genome)

### What's next

- Integration into the main breeding app as Mode 6
- 3D rendering of hierarchical body plans
- **Demo target**: morphing between homologous bone structures (human hand → bat wing → whale flipper → horse hoof) using the biomorph system. The forms must be reachable through mutation and selection — we can construct them directly for the demo, but only if a viable evolutionary path exists between them.

## Sources

- Dawkins, R. (1988). "The Evolution of Evolvability." *Artificial Life*, Santa Fe Institute.
- Carroll, S.B. (2006). *The Making of the Fittest.* W.W. Norton. (Homeotic genes, Antennapedia)
- Kirschner, M.W. & Gerhart, J.C. (1998). "Evolvability." *PNAS* 95(15), 8420-8427.
- Kirschner, M.W. Harvard lecture, "Evolvability." (youtube.com/watch?v=gr5iUoNYLL0) — Facilitated variation, exploratory systems, compartmentation, weak linkage.
- Wagner, A. (2014). *Arrival of the Fittest.* Current/Penguin. (Genotype networks, morphospace structure)
