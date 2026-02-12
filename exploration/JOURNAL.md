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

*This exploration was conducted programmatically — Claude selected offspring based on explicit fitness criteria, not visual evaluation of rendered images. A future exploration should use vision-based evaluation (rendering biomorphs and evaluating the images) for more naturalistic selection.*
