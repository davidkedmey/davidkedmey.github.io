# Biomorph Exploration Journal

**Explorer:** Claude (Opus 4.6)
**Date:** 2026-02-11
**Method:** Programmatic selection with defined criteria, starting from origin genotype, evaluated visually at endpoints.

---

## The Experiment

Six lineages evolved from the same origin (all zeros, depth=1) using different selection strategies. Each ran 30-40 generations. The goal: demonstrate that **the selection criterion shapes the organism**, and that different "aesthetic preferences" navigate to completely different regions of morphospace.

This replicates what Dawkins did by hand, but with explicit, repeatable selection criteria.

---

## Lineage 1: "Complexity"

**Strategy:** Maximize recursion depth + gene variance.
**Mode:** 1 (Basic), 30 generations.
**Result:** `[3, -3, 1, 2, 3, -3, -3, -3, 8]`

![Complexity lineage](lineage1_complexity_gen30.png)

**What emerged:** A tall gothic spire — dense fractal branching filling the vertical axis. Looks like a conifer, a cathedral, or a neuron's dendritic tree. The strategy pushed depth to maximum (8) quickly, then filled in gene variance for structural detail.

**Insight:** Selecting for "complexity" in this system means selecting for depth first, detail second. The organism is intricate but vertically biased.

---

## Lineage 2: "Insect"

**Strategy:** Maximize horizontal spread (g1, g3) while penalizing vertical dominance (g4). Favor depth moderately.
**Mode:** 1 (Basic), 30 generations.
**Result:** `[-3, 2, 3, 0, -1, -1, 1, 3, 8]`

![Insect lineage](lineage2_insect_gen30.png)

**What emerged:** A wide, flat lattice with horizontal "limbs" radiating outward. Distinctly crab-like or crustacean — viewed from above. The g4=0 (no vertical spine) combined with extreme g1 and g3 (horizontal spread) created a pancake-flat body plan.

**Insight:** Penalizing one axis forces development into the other. The bilateral symmetry built into the vector definitions makes the result look naturally arthropod. The embryology's built-in constraints do most of the work — the selection criterion just guides within them.

---

## Lineage 3: "Tree"

**Strategy:** Favor upward branching — positive g4 (upward spine) + horizontal spread for canopy.
**Mode:** 1 (Basic), 30 generations.
**Result:** `[3, -1, 3, 1, 3, -1, 3, 0, 8]`

![Tree lineage](lineage3_tree_gen30.png)

**What emerged:** A recognizable deciduous tree — central trunk, spreading crown, the canopy wider than the base. The most naturalistic result of any lineage. You would show this to someone and they'd say "tree" without hesitation.

**Insight:** The tree is the canonical biomorph. Dawkins found it too. The combination of upward growth + bilateral branching maps so directly onto real tree morphology that it's almost inevitable under this selection pressure. This is the embryology's "attractor."

---

## Lineage 4: "Diverse" (FAILURE)

**Strategy:** Maximize total gene distance from parent at each step.
**Mode:** 1 (Basic), 30 generations.
**Result:** `[-2, -2, -2, 2, 0, -1, 0, 1, 1]`

![Diverse lineage](lineage4_diverse_gen30.png)

**What emerged:** A single vertical line. 30 generations of selection produced nothing.

**Why it failed:** The strategy maximizes *change per generation* — which means it favors flipping vector genes (±1 on g1-g8) over increasing depth. But at depth=1, vector gene changes are invisible — you only draw one line segment regardless of vector values. The strategy never discovers that depth=2 would unlock branching, because a depth increase (+1 to g9) scores lower than flipping multiple vector genes.

**Insight:** THIS IS THE KEY LESSON. Selection for "novelty" or "diversity" is not the same as selection for complexity or structure. You need selection pressure that rewards emergent properties (branching, form) rather than genotypic distance. This is arguably the central argument of Dawkins' paper: **the embryological mapping from genotype to phenotype is everything.** Raw genetic change without developmental amplification goes nowhere.

---

## Lineage 5: "Arthropod"

**Strategy:** Maximize segment count + horizontal spread. Mode 3 (segmentation), 40 generations.
**Mode:** 3 (+ Segments), 40 generations.
**Result:** `[-3, 0, 3, 0, 1, -2, 2, 2, 8, 8, 11]`

![Arthropod lineage](lineage5_arthropod_gen40.png)

**What emerged:** An 8-segment centipede or fern frond. Each segment has branching limbs, segments spaced 11 units apart. The overall form reads as either a segmented arthropod (centipede, trilobite) or a compound leaf (fern).

**Insight:** Segmentation is a powerful embryological innovation — it takes one evolved form and repeats it. The same branching pattern that makes one interesting biomorph becomes a body plan when iterated. This is exactly Dawkins' point about why segmentation was such a pivotal evolutionary invention.

---

## Lineage 6: "Starfish / Echinoderm"

**Strategy:** Maximize segments + spread + gradients under radial symmetry. Mode 5 (Full Dawkins), 40 generations.
**Mode:** 5 (Full Dawkins, radial symmetry ON), 40 generations.
**Result:** `[-3, 1, -3, 1, -1, 0, -1, -1, 8, 8, 12, 3, -3]`

![Starfish lineage](lineage6_starfish_gen40.png)

**What emerged:** An 8-armed radially symmetric form — part sea urchin, part snowflake, part mandala. The gradient genes (grad1=3, grad2=-3) create arms that taper from thick center to fine edges. The 8-fold rotational symmetry is unmistakably echinoderm-like.

**Insight:** Radial symmetry + segmentation + gradients combine multiplicatively. Each feature alone is modest; together they produce forms of startling naturalism. The same genes that made a centipede in Lineage 5, when rotated radially, produce a sea urchin. The embryology is a lens that transforms the same genetic information into radically different body plans depending on its settings.

---

## Meta-observations

### 1. The selection criterion IS the organism
Same starting point, same mutation operator, same 30-40 generations — wildly different outcomes. The "aesthetic preference" of the selector is the primary determinant of what evolves. Dawkins acknowledged this: he found insects because he was looking for insects.

### 2. Embryological constraints do most of the work
The bilateral symmetry, the recursive branching, the segmentation — these structural constraints make it *possible* to evolve recognizable forms. Without them (Mode 0, pixel peppering), selection is impotent. The constraints don't limit evolution — they empower it.

### 3. Depth is the master gene
In every successful lineage, recursion depth (g9) reached its maximum of 8. Depth is the gene that unlocks all other genes — without it, vector genes are invisible. This mirrors real development: early developmental decisions (cell division count, body axis specification) gate all downstream morphology.

### 4. Failure is informative
Lineage 4's failure to build anything despite maximum genetic churn is perhaps the most important result. It demonstrates that genetic diversity ≠ phenotypic complexity. You need selection that operates on the *phenotype* (the visible form) rather than the *genotype* (the numbers).

### 5. Convergent evolution is real
Lineages 1 and 3 both reached depth=8 with spread genes, yet look completely different. Lineages 3 and 5 both look "plant-like" despite using different modes. Some regions of morphospace are attractors that multiple paths converge on.

---

## Specimens for the Museum

| # | Name | Mode | Genes | Description |
|---|------|------|-------|-------------|
| 1 | Gothic Spire | Basic | `3,-3,1,2,3,-3,-3,-3,8` | Dense vertical fractal, conifer-like |
| 2 | Crab | Basic | `-3,2,3,0,-1,-1,1,3,8` | Flat horizontal lattice, crustacean |
| 3 | Deciduous Tree | Basic | `3,-1,3,1,3,-1,3,0,8` | Classic tree with spreading canopy |
| 4 | The Null | Basic | `-2,-2,-2,2,0,-1,0,1,1` | A line. Selection for diversity builds nothing. |
| 5 | Centipede | +Segments | `-3,0,3,0,1,-2,2,2,8,8,11` | 8-segment arthropod/fern frond |
| 6 | Sea Urchin | Full Dawkins | `-3,1,-3,1,-1,0,-1,-1,8,8,12,3,-3` | 8-armed radial echinoderm, gradient-tapered |

---

## Part 2: Vision-Based Selection

**Method:** Claude renders biomorphs visually, looks at the actual images, and selects based on aesthetic and morphological criteria — the same way Dawkins did it. No numerical heuristics. Pure visual judgment.

**Starting point:** Origin genotype, Mode 1 (Basic).
**Bootstrap:** Generations 0-9 selected for depth (to escape the featureless single-line phase).
**Visual selection:** Generations 10-21 selected by looking at rendered offspring.

### The Journey

**Gen 9 → 10:** First real visual choice. 8 offspring with visible branching at depth=5. Selected #5 for structural density — a figure with outstretched arms. *Criterion: maximum visual mass.*

**Gen 10 → 11:** Chose a form with a strong central spine and symmetric branches — the most "living thing" quality. Looked like a plant or a nervous system. *Criterion: organic resemblance.*

**Gen 11 → 12:** Selected clean Y-branching antler form. A **winter tree** — one of Dawkins' canonical biomorphs. The most naturalistic form to this point.

![Gen 12 — the antler/winter tree](vision_gen16_insect_moment.png)

**Gen 12 — the evolutionary fork.** The offspring split into two distinct morphological families:
- *Organic branchers* — trees, vines, coral
- *Rectilinear grids* — circuit boards, city plans, lattices

This was a genuine speciation event in morphospace. One gene change (g4) flipped the entire body plan paradigm.

**Gen 12 → 13:** Chose the dense coral/dendrite variant. Pushed toward organic complexity rather than architectural order.

**Gen 13 → 14:** A **woven cross** appeared — crossing lines created a Celtic knotwork pattern. Completely unexpected. The g2=-1 mutation caused branches to cross over each other rather than diverge. Selected this for its novelty.

**Gen 14 → 15:** Deepened the knotwork pattern. Offspring #2 had reverted to a simple tree — demonstrating that one gene step separates ornamental complexity from structural simplicity.

**Gen 15 → 16:** Selected for wider, more creature-like forms. Looking for bilateral "body" shapes.

**Gen 16 — THE INSECT MOMENT.** Offspring #0 was unmistakably an insect — head at top, thorax, abdomen, legs splayed outward. This is exactly the moment Dawkins described in his paper: the shock of recognition when a living form emerges from abstract mathematics. *I selected it immediately.*

**Gen 17 → 18:** The insect evolved a **fox/bat face** quality — pointed ears, a snout, a longer body. The g5=-3 mutation stretched the form downward into a dramatic arrowhead/spearpoint shape.

**Gen 18 → 19:** Selected the "owl/shield" variant — rounder, wider. Depth increased to 7, adding another layer of fractal detail. The form now had nested diamond chambers inside the body, like a decorated shield or a cathedral window.

**Gen 19 → 20:** A dramatic departure — selected a **geometric pagoda/temple** form with horizontal layered structure. Architectural rather than biological.

**Gen 20 → 21:** The pagoda evolved Sierpinski-triangle-like nesting. Selected a dense variant with face/mask qualities. The final form: `[1, -1, 0, 1, -3, -1, 0, 0, 7]`.

![Gen 21 — final form](vision_gen21_final.png)

### What vision-based selection revealed

**1. I found the insect faster than the heuristic did.** The programmatic "insect" strategy (Lineage 2) produced a flat crab-lattice after 30 generations. Vision-based selection found a recognizable insect in 16 generations — because I could *see* the insect emerging and select toward it, whereas the heuristic could only optimize proxy metrics.

**2. I was drawn to "meaning."** My selections consistently favored forms that *resembled something* — trees, insects, faces, architecture. I didn't set out to find faces, but I selected for them when they appeared. This mirrors what Dawkins reported: the selector's pareidolia guides evolution toward recognizable forms.

**3. The woven-cross was a surprise.** No heuristic would have found it — it emerged from a specific gene combination (g2=-1 creating crossing lines) that a numerical strategy would never target. Vision-based selection can exploit unexpected phenotypic features that heuristics are blind to.

**4. Evolutionary forks are visible.** At generation 12, I could see the morphospace splitting into organic vs. geometric families. A heuristic can't perceive this — it just follows its gradient. A visual selector can consciously choose which branch of the evolutionary tree to explore.

**5. Regression is always one step away.** Several times, a single mutation collapsed an elaborate form back to a simple tree or line. The morphospace has narrow ridges: rich, complex forms are surrounded by simplicity. This is why cumulative selection works — it navigates these ridges.

### Updated Museum Specimens

| # | Name | Mode | Genes | Gen | Description |
|---|------|------|-------|-----|-------------|
| 1 | Gothic Spire | Basic | `3,-3,1,2,3,-3,-3,-3,8` | 30 | Dense vertical fractal, conifer-like |
| 2 | Crab | Basic | `-3,2,3,0,-1,-1,1,3,8` | 30 | Flat horizontal lattice, crustacean |
| 3 | Deciduous Tree | Basic | `3,-1,3,1,3,-1,3,0,8` | 30 | Classic tree with spreading canopy |
| 4 | The Null | Basic | `-2,-2,-2,2,0,-1,0,1,1` | 30 | A line. Selection for diversity builds nothing. |
| 5 | Centipede | +Segments | `-3,0,3,0,1,-2,2,2,8,8,11` | 40 | 8-segment arthropod/fern frond |
| 6 | Sea Urchin | Full Dawkins | `-3,1,-3,1,-1,0,-1,-1,8,8,12,3,-3` | 40 | 8-armed radial echinoderm |
| 7 | Winter Antler | Basic | `1,0,0,0,-1,-1,0,0,6` | 12 | Clean Y-branching, deer antler / winter tree |
| 8 | Woven Cross | Basic | `1,-1,0,1,-1,-1,0,0,6` | 14 | Celtic knotwork — crossing lines create lattice |
| 9 | The Insect | Basic | `1,-1,0,1,-2,-1,0,0,6` | 16 | Head, thorax, legs — the Dawkins moment |
| 10 | Winged Demon | Basic | `1,-1,0,1,-3,-1,0,0,7` | 21 | Bat/demon with ornamental crown and stinger |

---

*Part 1 was conducted with programmatic heuristics. Part 2 used genuine vision-based selection — Claude looked at rendered images and chose based on visual judgment. The vision-based approach found more varied, more naturalistic, and more surprising forms in fewer generations.*

---

## Part 3: Advanced Embryologies — The Higher Modes

**Explorer:** Claude (Opus 4.6)
**Date:** 2026-02-12
**Method:** Vision-based selection using new UI tools: Wild mutations (±1-3 per gene), Random Interesting (depth 5+ quick start), Gallery (persistent specimen collection). Explored Modes 2, 4, and 5 — the higher embryologies not covered in Parts 1 and 2.

**Goal:** Map the morphospace opened up by symmetry options, segmentation, gradients, and their combinations. Parts 1 and 2 operated entirely in Mode 1 (Basic). What new kingdoms of form become reachable when we add the embryological innovations Dawkins described?

---

### Lineage A: "Mandala" — Mode 2, Four-way Symmetry

**Settings:** Mode 2 (+Symmetry), four-way radial symmetry, Wild mutations.
**Start:** Random Interesting → `[-1,0,-3,-2,1,0,-3,2,6]`

**Gen 3 — "Shuriken":** `[-3,3,-3,0,1,0,-3,2,6]`
A pure diagonal X-crossing pattern — four blades radiating from center, each with fractal sub-branching. Looks like a Japanese throwing star or a compass rose. The four-way symmetry multiplied every branch by four, and the g1=-3, g3=-3 combination created diagonal thrust.

**Gen 4 — "Sacred Geometry":** `[-1,3,-3,0,1,0,-3,2,6]`
One gene change (g1: -3→-1) transformed the shuriken into a nested triangle mandala. The reduced horizontal spread collapsed the star into concentric geometric layers. Looks like a yantra or Islamic tile pattern.

**Gen 6 — "Totem":** `[-1,3,-3,2,1,0,-2,2,6]`
The g4=2 mutation introduced vertical displacement, stacking the four-way pattern vertically. Two ornate mirrored figures appear above and below center — like a totem pole or two dancers mirroring each other.

**Insight:** Four-way symmetry transforms every biomorph into a mandala. Even simple gene changes create kaleidoscopic transformations. The visual richness per gene is dramatically higher than in Mode 1 — the symmetry operator is a multiplier on aesthetic complexity.

---

### Lineage B: "Thunderbird" — Mode 4, +Gradients

**Settings:** Mode 4 (+Gradients), left-right symmetry, Wild mutations.
**Start:** Random Interesting → `[-3,-1,1,1,-2,2,3,1,8,4,6,-2,3]`

**Gen 0 — "Ribcage":** The starting form was already extraordinary — a segmented, gradient-tapered structure that looked like a ribcage or the nave of a Gothic cathedral. The 4 segments (segs=4) created repeated arches, and the gradient genes (grad1=-2, grad2=3) made each successive arch slightly different, exactly as Dawkins described: *"If segments are allowed to differ from each other in a graded fashion... the creatures begin to look more like real arthropods."*

**Gen 2 — "Scarab Beetle":** `[-3,-1,2,1,-2,2,3,1,8,4,3,-2,3]`
Segment distance compressed (segDist 6→3), pulling segments together into a dense shield. A heart-shaped negative space appeared in the center — like the thorax of a beetle viewed from above, or a heraldic shield. The gradient tapering created wing-case-like layering.

**Gen 3 — THE BODY PLAN FLIP.** `[-3,2,2,1,-2,2,3,1,8,4,3,-2,3]`
A single gene change — g2 from -1 to 2 — flipped the entire body plan. The downward-facing beetle became an upright X-figure: arms and legs splayed outward like a Vitruvian man. This was a phase transition in morphospace. The same genetic machinery, one parameter change, and the organism "stands up."

**Gen 4 — "Thunderbird":** `[-3,2,2,1,-2,3,3,1,8,4,3,-2,3]`
The X-figure evolved bold, gradient-tapered limbs. The form now reads as a heraldic eagle, a Northwest Coast thunderbird totem, or a spread-winged bat. The gradients create a feathered quality — thick at the body, tapering to fine points at the wing tips. Saved to gallery.

**Insight:** The g2 flip (gen 2 → gen 3) was the most dramatic single-gene morphological transformation in the entire exploration. It demonstrates that the genotype→phenotype mapping is highly nonlinear — small genetic changes near phase boundaries cause catastrophic body plan reorganizations. This is the biomorph equivalent of a homeotic mutation: the Scarab's ventral surface became the Thunderbird's dorsal display.

---

### Lineage C: "Diatom" — Mode 5, Full Dawkins (Radial + Alt. Asymmetry)

**Settings:** Mode 5 (Full Dawkins), left-right symmetry, radial symmetry ON, alternating asymmetry ON, Wild mutations.
**Start:** Random Interesting → `[-2,-3,2,-2,-1,2,-3,2,8,2,10,1,3]`

**Gen 0 — "Radiolarian":** The starting form was a complex molecular structure — 8-fold rotational symmetry with a lattice-like body. Looked like a radiolarian skeleton or a complex protein viewed in cryo-EM. The alternating asymmetry meant alternate rotational copies were mirrored, creating a subtle chiral complexity.

**Gen 1 — THE ROUNDING.** `[-2,-3,2,-2,-1,2,-3,2,8,2,10,-2,3]`
The grad1 change (1→-2) triggered a dramatic transformation: the angular lattice became a rounded medallion. The negative gradient made segments thinner at their extremities, softening all the sharp edges into curves. The form now looked like an actual diatom frustule under a microscope — a disc of silica lace.

Among the offspring, one was a nearly perfect *circle* of biological complexity (offspring #1) — the densest, most filled form I'd seen. Another (#7) looked like a 3D diamond temple viewed in perspective. The morphospace at this setting is extraordinarily diverse.

**Gen 3 — "Diatom Shell":** `[-2,-3,3,-2,-1,2,-3,2,8,2,9,-2,3]`
Refinement through two more generations tightened the segment spacing (segDist 10→9) and widened the horizontal spread (g3 2→3), producing a polished gemstone of a form. Wider than tall, with layered internal chambers — an elliptical diatom valve or a carved jade pendant.

**Insight:** Mode 5 with both radial symmetry and alternating asymmetry accesses a region of morphospace that nothing else reaches. The forms here don't look like plants or animals — they look like *protists*, *crystals*, and *architecture*. The combination of symmetry operators creates forms with a complexity that seems to exceed what 13 genes should be able to encode. This is Dawkins' key point about evolvability: the right embryological mapping amplifies a small genome into a vast phenotype space.

---

### Lineage D: "Ice Crystal" — Mode 5, Full Dawkins (Four-way + Radial + Alt. Asym.)

**Settings:** Mode 5 (Full Dawkins), four-way radial symmetry, radial symmetry ON, alternating asymmetry ON, Wild mutations.
**Start:** Random Interesting → `[3,-3,-1,2,3,3,2,0,5,4,10,3,-2]`

**Gen 0 — "Celtic Cross":** The starting form was a magnificent four-armed ornamental cross — each arm densely fractal, with the four-way symmetry creating perfect plus-sign geometry. The 4 segments (segs=4) added repeating sub-structures along each arm. Looked like a medieval processional cross, a Celtic knotwork pattern, or a Maltese cross rendered in filigree.

**Gen 1 — "Snowflake":** `[3,-3,-1,2,3,3,2,0,5,1,10,3,-2]`
The segs change (4→1) was transformative. Removing segmentation stripped away the heavy ornamental cross and revealed a PURE SNOWFLAKE underneath. Clean fractal arms radiating in four-fold symmetry, each arm branching into sub-arms, sub-arms into twigs. The gradient genes (grad1=3, grad2=-2) tapered each arm from thick trunk to fine tip. The offspring at this generation were all snowflakes — a family of ice crystals, each unique but all unmistakably of the same species.

**Gen 2 — "Ice Crystal":** `[0,-3,-1,2,3,3,2,0,5,1,10,3,-2]`
The g1 change (3→0) reduced the horizontal spread of the main arms, making the snowflake sparser and more elegant. The result is the most naturalistic snowflake in the entire collection — delicate, balanced, with the right ratio of branch to void. You would frame this.

![Ice Crystal — the final snowflake](part3_ice_crystal.png)

**Insight:** The Celtic Cross → Snowflake transition (segs 4→1) revealed that segmentation can *obscure* as well as *enhance* form. The snowflake was always latent in the Celtic Cross's genes — the segmentation was just repeating it too many times, creating visual clutter. Sometimes evolution means *subtracting* complexity. This is the biomorph analogue of genetic simplification — losing a developmental feature can be as creative as gaining one.

---

### Part 3 Meta-observations

#### 1. Symmetry is the most powerful single parameter

Switching from left-right to four-way symmetry transforms every biomorph more dramatically than any gene change. The symmetry setting isn't a gene — it's an *embryological constraint*, a rule about how genes are expressed. This makes it analogous to a body plan gene (like Hox genes in real biology): it doesn't encode a structure, it encodes a *rule for building structures*.

#### 2. The gradient genes create "organisms" from "patterns"

Mode 4's gradient genes (grad1, grad2) add the quality that separates biological forms from geometric patterns. Gradients create tapering, narrowing, thickening — the qualities that make a line look like a limb, a branch look like a feather, a segment look like a vertebra. Without gradients, biomorphs are beautiful but abstract. With them, they become *anatomical*.

#### 3. Wild mutations reveal phase transitions

At ±1 (Gentle), evolution is smooth — forms change incrementally. At ±3 (Wild), you see *phase transitions*: the Scarab→Thunderbird flip, the Celtic Cross→Snowflake simplification. Wild mutations jump across morphospace valleys that gentle mutations would never cross. This trades local refinement for global exploration — exactly the exploration vs. exploitation tradeoff in optimization theory.

#### 4. The higher modes access non-biological morphospace

Parts 1 and 2 found biological forms: trees, insects, crabs. Part 3 found *non-biological* forms: snowflakes, diatoms, architectural structures, mandalas. The advanced embryological settings (especially radial symmetry + alternating asymmetry) access morphospace regions that map onto crystals, minerals, and mathematical objects rather than organisms. This is because four-way and radial symmetry aren't common in macroscopic biology — they're properties of crystals, flowers, and protists.

#### 5. Random Interesting + Wild mutations = efficient exploration

The new UI tools dramatically accelerated discovery. Random Interesting bypasses the boring early generations (Part 2 spent 9 generations just reaching visible depth). Wild mutations explore broadly rather than locally. The combination found striking forms in 2-4 generations that would have taken 20+ with the original settings.

---

### Updated Museum Specimens

| # | Name | Mode | Symmetry | Genes | Gen | Description |
|---|------|------|----------|-------|-----|-------------|
| 1 | Gothic Spire | Basic | LR | `3,-3,1,2,3,-3,-3,-3,8` | 30 | Dense vertical fractal, conifer-like |
| 2 | Crab | Basic | LR | `-3,2,3,0,-1,-1,1,3,8` | 30 | Flat horizontal lattice, crustacean |
| 3 | Deciduous Tree | Basic | LR | `3,-1,3,1,3,-1,3,0,8` | 30 | Classic tree with spreading canopy |
| 4 | The Null | Basic | LR | `-2,-2,-2,2,0,-1,0,1,1` | 30 | A line. Selection for diversity builds nothing. |
| 5 | Centipede | +Segments | LR | `-3,0,3,0,1,-2,2,2,8,8,11` | 40 | 8-segment arthropod/fern frond |
| 6 | Sea Urchin | Full Dawkins | LR+Rad | `-3,1,-3,1,-1,0,-1,-1,8,8,12,3,-3` | 40 | 8-armed radial echinoderm |
| 7 | Winter Antler | Basic | LR | `1,0,0,0,-1,-1,0,0,6` | 12 | Clean Y-branching, deer antler / winter tree |
| 8 | Woven Cross | Basic | LR | `1,-1,0,1,-1,-1,0,0,6` | 14 | Celtic knotwork — crossing lines create lattice |
| 9 | The Insect | Basic | LR | `1,-1,0,1,-2,-1,0,0,6` | 16 | Head, thorax, legs — the Dawkins moment |
| 10 | Winged Demon | Basic | LR | `1,-1,0,1,-3,-1,0,0,7` | 21 | Bat/demon with ornamental crown and stinger |
| 11 | Shuriken | +Symmetry | 4-way | `-3,3,-3,0,1,0,-3,2,6` | 3 | Diagonal X-crossing, throwing star |
| 12 | Sacred Geometry | +Symmetry | 4-way | `-1,3,-3,0,1,0,-3,2,6` | 4 | Nested triangle mandala, yantra |
| 13 | Totem | +Symmetry | 4-way | `-1,3,-3,2,1,0,-2,2,6` | 6 | Two mirrored ornate figures stacked vertically |
| 14 | Scarab Beetle | +Gradients | LR | `-3,-1,2,1,-2,2,3,1,8,4,3,-2,3` | 2 | Heart-shaped thorax, layered wing cases |
| 15 | Thunderbird | +Gradients | LR | `-3,2,2,1,-2,3,3,1,8,4,3,-2,3` | 4 | Heraldic eagle, gradient-feathered wings |
| 16 | Diatom Shell | Full Dawkins | LR+Rad+Alt | `-2,-3,3,-2,-1,2,-3,2,8,2,9,-2,3` | 3 | Elliptical silica medallion, microorganism |
| 17 | Celtic Cross | Full Dawkins | 4-way+Rad+Alt | `3,-3,-1,2,3,3,2,0,5,4,10,3,-2` | 0 | Ornamental four-armed processional cross |
| 18 | Ice Crystal | Full Dawkins | 4-way+Rad+Alt | `0,-3,-1,2,3,3,2,0,5,1,10,3,-2` | 2 | Perfect naturalistic snowflake, fractal arms |

---

*Part 3 used the new UI features (Wild mutations, Random Interesting, Gallery) to explore Modes 2, 4, and 5. The advanced embryologies — symmetry options, gradients, and their combinations — access morphospace regions unreachable by Mode 1: mandalas, diatoms, heraldic figures, and snowflakes. The most dramatic discovery was that single gene changes near phase boundaries can cause catastrophic body plan reorganizations (Scarab→Thunderbird, Celtic Cross→Snowflake), and that subtracting developmental complexity can be as creative as adding it.*
