# Biomorph Universe: Concept Document

**Date:** 2026-02-19
**Status:** Early concept / brainstorm

---

## The Big Idea

One experience at different magnifications. The player zooms between scales — from molecular to cosmic — and discovers that the same evolutionary dynamics play out at every level. No lecture required. The universality of evolution is something you *feel* by navigating the zoom.

**Expedition** (the current collecting prototype) becomes the front door — the cosmic/macro view. **Biomorph Builder** (the breeding sandbox) becomes what happens when you land somewhere and go deep. The interactive paper becomes the field guide you consult along the way.

---

## The Zoom Levels

### Level 1: Genome View (Microscope)
You're inside the creature. You see its genotype — the actual gene values, regulatory switches, duplicated genes, broken pseudogenes. This is where you understand *why* a creature looks the way it does.

**Informed by:**
- **Wagner's genotype networks** — Visualize how many different genotypes produce the same phenotype. Show the player that their creature is one point on a vast connected network of equivalent genotypes. Neighbors on the network look identical but have different hidden potential.
- **Carroll's fossil genes** — Creatures accumulate vestigial gene slots. A creature that once had color pigmentation but evolved in a dark cave still carries the broken pigment genes, grayed out. Visible evolutionary history on the genome itself.
- **Carroll's gene duplication** — A core mechanic. Players can duplicate a gene, freeing one copy to mutate while the other maintains function. This is how real novelty arrives. The opsin/color-vision story is the perfect tutorial: duplicate one photoreceptor gene, diverge the copies, unlock trichromatic vision.

### Level 2: Organism View (The Builder)
The current Biomorph Builder experience. You're looking at one creature, breeding it, selecting offspring, shaping its evolution through artificial selection. This is the Dawkins layer — the original insight.

**Informed by:**
- **Carroll's convergent evolution** — Different players, starting from different creatures, independently arrive at similar solutions when facing the same environment. Dark creatures on dark substrates. Streamlined forms in fast-flowing water. The rock pocket mouse story: same phenotype, different genotypic paths.
- **Wagner's robustness** — Most mutations don't break things. The player experiences this: they mutate freely and most offspring are viable. This isn't a bug, it's the deep structure of biology. Robustness is what makes exploration safe.

### Level 3: Population / Ecosystem View (The Colony)
Zoom out and you see a population of creatures on a landscape. They look like a bacterial colony, a coral reef, a forest canopy from above. Clusters of similar forms, diversity hotspots, competition at boundaries.

**Informed by:**
- **Wagner's neutral drift across genotype networks** — Populations spread across the genotype network even when the phenotype stays the same. The colony *looks* uniform but harbors hidden genetic diversity. When the environment shifts, different members of the colony are pre-adapted to different new conditions. The player sees a uniform-looking colony suddenly explode into diverse forms after an environmental change — not because of new mutations, but because the diversity was already there, hidden.
- **Carroll's arms races** — Introduce parasites or predators that co-evolve. The colony must stay one step ahead. Sickle-cell dynamics: a mutation that's costly in one context is lifesaving in another. Tradeoffs become visible at population scale.
- **Carroll's "use it or lose it"** — Traits not under selection pressure decay over generations. Move a population to a dark cave and watch pigmentation genes slowly break down into pseudogenes. The colony adapts by *losing* things, not just gaining them.

### Level 4: Planet View (The World)
Multiple ecosystems on one world. Different biomes, different selection pressures, migration between them. This is where biogeography becomes visible — why creatures on islands look different from mainland relatives, why convergent evolution produces similar forms in similar environments worldwide.

**Informed by:**
- **Carroll's rock pocket mice** — Different lava flows, different populations, same selection pressure, same phenotypic outcome, different genetic paths. Each biome on the planet is a natural experiment in parallel evolution.
- **Wagner's "sleeping beauties"** — Some lineages exist for millions of years before their environment shifts and they suddenly dominate. Grasses waited 40 million years. Mammals waited 100 million. The player might nurture a lineage that seems unimpressive until a catastrophe wipes out the dominant forms and their sleeper explodes.

### Level 5: Expedition View (The Cosmos)
The current Expedition prototype, reimagined as the outermost zoom level. You're navigating morphospace itself — a galaxy of possible forms. Each point of light is a world. Each world has its own ecosystems, populations, creatures.

This is the front door. You arrive here. You see the vastness. You see other explorers (bots, other players) discovering creatures. You see clusters (common forms) and voids (unexplored morphospace). You see rare specimens glowing at the edges.

**Informed by:**
- **Wagner's library metaphor** — Morphospace IS the Library of Babel. Every possible creature exists as a "book" in this library. Most are gibberish (non-viable). But viable forms are connected through vast networks, and you can walk from one to another through small changes. Expedition is the experience of wandering through this library.
- **Wagner's innovability** — The library isn't random. It has structure that makes discovery inevitable. Clusters of viable forms, paths between them, surprising connections between distant regions. The map of Expedition should *feel* like this — not a uniform scatter but a structured landscape with hotspots, highways, and hidden passages.

---

## Key Mechanics Derived from the Science

### 1. Duplicate and Diverge (from Carroll)
The primary engine of novelty. At the genome level, players can duplicate a gene. The original copy keeps working. The duplicate is free to mutate. Most mutations do nothing interesting. But occasionally, the duplicate acquires a new function — a new color receptor, an antifreeze protein, a novel structural element. This is how real evolution creates new capabilities without breaking existing ones.

**Game feel:** Like getting a "free mutation slot." The excitement of duplicating a gene and then watching what it becomes over generations.

### 2. Neutral Drift / Hidden Diversity (from Wagner)
Populations accumulate genetic diversity even when nothing visibly changes. The player sees a stable-looking colony but can inspect individuals and discover they're genetically divergent. This hidden diversity is a *resource* — when the environment shifts, pre-adapted individuals emerge.

**Game feel:** The "aha" moment when your seemingly boring, stable population suddenly produces wildly diverse offspring after an environmental change. You realize the diversity was there all along.

### 3. Genotype Networks / The Map Has Structure (from Wagner)
The morphospace in Expedition isn't a random scatter. Viable forms cluster along networks. Players who explore systematically discover that certain paths through morphospace reliably lead to interesting destinations. Other regions are deserts — long stretches of non-viable forms.

**Game feel:** Exploration rewards intuition. Experienced players develop a sense for which "directions" in morphospace are promising, just as evolution itself is biased toward certain regions by the structure of genotype networks.

### 4. Convergent Evolution / Parallel Discovery (from Carroll)
Different players (or different AI explorers) independently discover similar forms when facing similar environmental pressures. The game tracks and highlights these convergences: "Player A and Player B independently evolved streamlined forms in the Ocean biome, through completely different genetic paths."

**Game feel:** Validating. You discover something and then learn that others discovered it too, by a different route. It feels like a law of nature, not an accident.

### 5. Fossil Genes / Evolutionary Memory (from Carroll)
Every creature carries its history. Vestigial gene slots, broken pseudogenes, traces of ancestral forms. A deep-sea creature that descended from a surface-dweller still has (broken) photoreceptor genes. A player can read a creature's genome like an archaeologist reads strata.

**Game feel:** Creatures have *depth*. They're not just their current form — they're a layered history of every environment they've passed through and every capability they've gained and lost.

### 6. Arms Races / Co-evolution (from Carroll)
Parasites, predators, or environmental challenges that evolve in response to the player's creatures. You develop resistance; the parasite evolves to overcome it. You develop speed; the predator gets faster. This creates ongoing, dynamic pressure that prevents any single solution from being permanent.

**Game feel:** The game pushes back. Your "perfect" creature is only perfect until the environment catches up. Keeps breeding meaningful long-term.

### 7. Sleeping Beauties / Latent Potential (from Wagner)
Some creatures or lineages sit dormant — viable but unremarkable — until conditions change. A mass extinction, an environmental shift, a new resource becoming available. Then the sleeper wakes and radiates into dozens of new forms.

**Game feel:** Rewarding patience and diversity. The player who maintains a diverse portfolio of creatures — including seemingly useless ones — is better prepared for catastrophic change than the player who optimizes a single lineage.

### 8. Promiscuous Enzymes / Unexpected Utility (from Wagner)
Traits evolved for one purpose turn out to be useful for something completely different. A structural protein that happens to bind a toxin. A heat-resistance gene that also confers radiation tolerance.

**Game feel:** Surprises. "Wait, my creature's thick shell — which I evolved for predator defense — also works as heat insulation in the volcanic biome?" Emergent discovery through play.

---

## The Narrative Arc

1. **You arrive in Expedition.** The cosmos. Points of light. Other explorers moving through the space. You don't know what any of it means yet. You click on a bright point.

2. **You land on a world.** You see ecosystems, biomes, populations of creatures. It looks like a satellite view of a coral reef or a bacterial colony.

3. **You zoom into a population.** You see individuals, variation, selection happening in real-time. You notice some creatures are thriving and others aren't.

4. **You select a creature and enter the Builder.** Now you're breeding. You're making choices. You understand — through doing — how selection shapes form.

5. **You zoom into the genome.** You see why your creature looks the way it does. You see its fossil genes, its duplicated genes, its hidden potential. You understand — through seeing — how genotype maps to phenotype.

6. **You zoom back out.** Each level looks different but feels the same. The same dynamics, the same patterns, at every scale. That's the lesson. That's the game.

---

## How the Existing Pieces Fit

| Current piece | Role in the unified experience |
|---|---|
| **Expedition** | Level 5 — the cosmic front door, morphospace exploration |
| **Biomorph Builder** | Level 2 — organism-level breeding sandbox |
| **Interactive Paper** | The field guide / codex — explains the science behind what you're experiencing |
| **LLM Command Bar** | Natural language interface across all levels ("show me creatures adapted to cold", "what are the fossil genes in this lineage?") |

---

## Planet Types

The Planet level isn't just geography — each planet type represents a different *relationship between zoom levels*. Different developmental rules, different selection pressures, different things you find when you zoom in.

### Embryology Planets (Storyboard v1)
The current storyboard demonstrates these: each planet/region is defined by its developmental toolkit.
- **Recursive** — Basic branching trees. The Dawkins original. 9 genes, bilateral symmetry.
- **Segmented** — Repeat the body plan along an axis. Arthropods, centipedes, vertebrae. 11 genes.
- **Gradient** — Segments that taper and transform. Organic, flowing forms. 13 genes.
- **Symmetry Variants** — Same genes, different axes. Up-down, radial, four-way. One genome, many body plans.

### Locomotive Worlds
Selection pressure for movement. Creatures evolve not just form but gait — the 3D locomotion system already built in `3d/`. Wind resistance, terrain, energy cost. A planet where standing still means death. Zooming in shows not just anatomy but kinematics.

### Breeder Civilizations
Artificial selection instead of natural. Populations of creatures being shaped by NPC breeders with aesthetic or functional goals — breeding for beauty, for combat, for utility. The player arrives and sees the *results* of someone else's selection choices. A planet where the "environment" is taste.

### Composite Worlds (Biomorphs Made of Biomorphs)
The most powerful idea. On a composite planet, zooming into a creature doesn't reveal genes — it reveals *more creatures*. The sub-units are themselves evolved organisms, cooperating (or competing) to form a larger whole.

**Why this is deep:**
This maps directly to real biological transitions in individuality:
- **Eukaryotic cells** — Mitochondria were once free-living bacteria, engulfed and domesticated. Every animal cell is a composite organism.
- **Lichens** — A fungus and an alga fused into one organism that is neither.
- **Colonial organisms** — Portuguese man o' war is a colony of specialized individuals (polyps) that functions as one creature. No individual polyp can survive alone.
- **Multicellularity itself** — Individual cells that surrendered autonomy to become sub-units of something larger. The most consequential composition event in evolutionary history.

**How it works mechanically:**
Instead of `drawTree(genes)` rendering lines, you'd have `drawTree(bodyPlanGenes, subOrganism)` where each terminal node renders another biomorph at smaller scale. Two genomes cooperating:
- A **body plan genome** — controls overall structure, arrangement, connectivity
- A **cell genome** — controls what each sub-unit looks like and does

Or three levels deep: a body plan made of organs made of cells, each level with its own genotype.

**Why it fits the zoom storyboard perfectly:**
The zoom levels stop being a UI metaphor and become the *actual biology*. You zoom into a creature and find it's made of creatures. The hierarchy isn't imposed by the interface — it's the organism's real structure. On a composite planet, every zoom level is simultaneously all five levels.

**Key design question:** Do the sub-organisms evolve independently and get recruited into composites? Or does the composite evolve as a unit, with the sub-organisms co-adapting? Both happen in real biology (endosymbiosis vs. multicellular development), and both could be distinct planet types.

### Extreme Environment Planets
Planets with harsh constraints that force radical adaptation:
- **Cave worlds** — No light. Pigmentation genes decay into fossils. Selection for chemical sensing.
- **Volcanic worlds** — Extreme heat. Only creatures with specific gene configurations survive.
- **Ice worlds** — Slow metabolism, antifreeze adaptations, long generation times.

These create the selection pressures that drive Carroll's "use it or lose it" and convergent evolution mechanics.

---

## Open Questions

- How literal are the zoom levels? Smooth continuous zoom vs. discrete mode switches?
- Is the planet/world level necessary for v1, or can we skip from colony to cosmos?
- How much real-time simulation vs. turn-based breeding?
- How do we handle the tension between scientific accuracy and game feel?
- What's the minimum viable version of this? (Probably: Expedition as entry → click to enter Builder with that creature as seed)
- How does multiplayer / social discovery work at scale?
- Does the interactive paper integrate as an in-game codex, or remain a separate experience?

---

## Key Sources

- **Richard Dawkins** — *The Blind Watchmaker* (1986): The original biomorph concept. Artificial selection as a window into evolution.
- **Andreas Wagner** — *Arrival of the Fittest* (2014): Genotype networks, neutral drift, robustness, innovability. Why the structure of biological possibility-space makes innovation inevitable, not miraculous.
- **Sean B. Carroll** — *The Making of the Fittest* (2006): DNA as forensic record. Gene duplication, fossil genes, convergent evolution, arms races. The molecular evidence that evolution is lawful and repeatable.

---

*This document is a living sketch. The vision is one experience at every magnification — microscope to telescope — where the player discovers the universality of evolution not by being told, but by seeing the same patterns everywhere they look.*
