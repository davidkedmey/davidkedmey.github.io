# Dev Log: Software Landscape Research + Kirschner Talk Analysis

**Date:** 2026-02-21
**Status:** Research complete, two new prototypes in progress

---

## The Landscape: Software Similar to Biomorph Builder

### Direct Biomorph Implementations

Every other implementation of Dawkins' biomorphs is a bare-bones breeding grid — a single screen where you click offspring to select parents. None extend the concept beyond what Dawkins described in 1986.

- **Watchmaker Suite** (Alan Canon, Java) — a curatorial project preserving Dawkins' original Pascal code. Faithful but frozen. [watchmakersuite.sourceforge.net](https://watchmakersuite.sourceforge.net/)
- **BiomorphJS** (Cameron McKay, JS) — minimal web breeding grid. [github.com/cdmckay/biomorphjs](https://github.com/cdmckay/biomorphjs)
- **Biomorph Evolve** (GATC/jggatc, Python) — the only one that engages with evolvability concepts from the 1988 paper, but it's a desktop app. [gatc.ca/projects/biomorph-evolve](https://gatc.ca/projects/biomorph-evolve/)
- **Penguin's Mount Improbable** — official Penguin Books web version, now defunct. [gwern.net mirror](https://gwern.net/doc/genetics/selection/www.mountimprobable.com/index.html)
- **LMU Biomorphs** (Ray Toal), **CodeProject** article, **Cornell 3D-Biomorph** — educational write-ups with simple implementations.

**Takeaway:** Nobody has gone beyond Dawkins' original scope. No progressive embryologies, no educational framing, no exploration modes. The +bud work is genuinely new territory.

### Interactive Evolution Platforms

These are the closest spiritual relatives — tools where humans guide evolution through aesthetic selection, but using different underlying representations.

- **Picbreeder** (Ken Stanley et al.) — the landmark collaborative evolutionary art platform. Users evolve 2D images using CPPNs. Anyone can branch from anyone's image. The key innovation is the CPPN representation, which has massive evolvability. Probably the single most important comparable project. [picbreeder.net](https://picbreeder.net/)
- **Artbreeder** (Joel Simon) — Picbreeder's commercial successor using GANs. Millions of users. More accessible but less pedagogically transparent — the "genes" are latent space dimensions, not interpretable. [artbreeder.com](https://www.artbreeder.com/)
- **EndlessForms** (Jeff Clune) — Picbreeder in 3D. Objects can be 3D-printed. Shows full ancestral lineage. [endlessforms.com](http://endlessforms.com/)
- **CPPNArtEvolution** (Jacob Schrum) — suite of interactive evolution tools: images, animations, 3D objects, and sound. [github.com/schrum2/CPPNArtEvolution](https://github.com/schrum2/CPPNArtEvolution)
- **Biomorpher** (Grasshopper/Rhino plugin) — interactive evolution for architectural design.

**Takeaway:** Picbreeder proved that interactive evolution on the web is compelling. But none of these projects have an educational mission or connect to biological concepts. They're art tools, not teaching tools.

### Artificial Life Simulators

Broader scope — entire ecosystems where evolution happens autonomously.

- **ALIEN** — GPU-powered 2D artificial life with particles, sensors, muscles, neural networks. Won the ALIFE 2024 Virtual Creatures Competition. [alien-project.org](https://www.alien-project.org/)
- **The Bibites** — 2D creatures with neural-network-driven behavior, evolving in real time. Steam Early Access. [Steam](https://store.steampowered.com/app/2736860/)
- **Species: ALRE** — scientifically-grounded evolution sim. Every creature defined by its genes, with a nursery for tinkering. [Steam](https://store.steampowered.com/app/774541/)
- **Framsticks** — long-running academic 3D creature simulator (v5.2). Supports coevolution, open-ended evolution. [framsticks.com](https://www.framsticks.com/)
- **The Simsulator** (2024) — open-source Karl Sims-style evolved virtual creatures. ALIFE 2024. [github.com/mycoolfin/the-simsulator](https://github.com/mycoolfin/the-simsulator)
- **Lenia** — continuous Game of Life. 400+ species. [chakazul.github.io/lenia.html](https://chakazul.github.io/lenia.html)
- **The Life Engine** — web-based ecosystem. [thelifeengine.net](https://thelifeengine.net/)

**Takeaway:** Fascinating but they're *watching* evolution, not *doing* it. The user is an observer, not a selector. And none of them teach the underlying biology.

### Physics-Based Creature Evolution

- **Evolution by Keiwan** — browser-based sandbox where you build creatures from joints/bones and watch them evolve locomotion. Directly relevant to IDEAS.md locomotion section. [keiwan.itch.io/evolution](https://keiwan.itch.io/evolution)
- **Karl Sims' Evolved Virtual Creatures** (1994) — the foundational work. Block creatures evolving both morphology and behavior. [karlsims.com](https://www.karlsims.com/evolved-virtual-creatures.html)
- **EvoBots** — neural network + GA bots. [evobots.ai](https://evobots.ai/)

### Evolution Education Tools

- **Avida-ED** (Michigan State) — the gold standard for digital evolution education. Won ISAL Education Award. Research shows it increases student acceptance of evolution. [avida-ed.msu.edu](https://avida-ed.msu.edu/app/AvidaED.html)
- **PhET Natural Selection** (University of Colorado) — widely used classroom sim. [phet.colorado.edu](https://phet.colorado.edu/en/simulations/natural-selection)
- **Population Genetics Explorer** (HHMI BioInteractive) — allele/genotype frequency simulation. [biointeractive.org](https://www.biointeractive.org/classroom-resources/population-genetics-explorer)
- **MinuteLabs Evolution Simulator** — visual blob evolution. [labs.minutelabs.io/evolution-simulator](https://labs.minutelabs.io/evolution-simulator/)
- **Karpathy's Canvas Evolution** — neural evolution in the browser. [cs.stanford.edu](https://cs.stanford.edu/~karpathy/canvas/evolve.html)

### Where Biomorph Builder Sits

Biomorph Builder occupies a gap in the landscape that nobody else fills:

1. **Breeding + education + exploration** in one project. Picbreeder has collaborative breeding but no education. Avida-ED has education but no aesthetic breeding. Nobody has expedition-style exploration.
2. **The biological realism direction is uncharted.** No interactive biomorph tool has attempted to make evolvability, compartmentation, facilitated variation, or weak linkage into explorable mechanics. The +bud prototypes are genuinely novel.
3. **The Dawkins provenance matters.** Starting from Dawkins' actual algorithm and paper, with verified specimens from his original program, gives the project a historical and scientific grounding that art-evolution tools lack.
4. **Closest comparisons:** Picbreeder (interactive evolution on the web) and Avida-ED (evolution education in the browser). We're bridging both worlds.

---

## Kirschner Talk: What We Haven't Captured Yet

The transcript (`~/Desktop/Marc Kirschner (Harvard)- Evolvability .txt`, [YouTube](https://youtu.be/gr5iUoNYLL0)) covers four mechanisms of evolvability. Cross-referencing with existing prototypes (v1-v3):

### Already captured in +bud prototypes:
- **Compartmentation** — buds as spatial domains with independent gene programs
- **Facilitated variation** — trunk mutations coherently reshape the whole organism
- **Homeotic switching** — budSwitch gene shifts the A/B bud-type boundary

### Not yet captured:

#### 1. The Mustard Plant Principle (Regulatory Change) → `prototype-mustard.html`

Kirschner's most vivid example: wild mustard → kohlrabi, Brussels sprouts, cabbage, cauliflower, broccoli, kale. Same genes, different expression patterns. The only difference is **where and how much** each structure grows.

Currently, buds have their own *separate* gene set (9 independent bud genes). But Kirschner's point is that the most powerful regulatory changes don't require new genes — they reuse the *same* program with different activation parameters.

**Idea:** Instead of independent bud genes, buds use the trunk's genes transformed by a few *modifier* genes:
- `depthMod`: bud depth = trunk depth + modifier
- `scaleMod`: bud branch lengths scaled
- `angleMod`: bud angles rotated
- Possibly `flipMod`: mirror bud gene order
- Possibly `maskGene`: suppress one trunk gene in the bud context

This would:
- Massively increase evolvability (small modifier → large coherent morphological shift)
- Make facilitated variation stronger (change the trunk, buds change *with* it)
- Be a truer model of Kirschner's point
- Use fewer genes total (trunk + 3-5 modifiers vs trunk + 9 independent bud genes)

#### 2. Exploratory Growth (Nerve/Vessel Adaptive Tissue) → `prototype-exploratory.html`

Kirschner's key insight about limb development: bone formation leads, but everything else is exploratory and adaptive. Muscles migrate randomly and attach where bones are. Nerves grow randomly and stabilize when they hit a target. Blood vessels branch toward oxygen-deprived tissue. "It looks like the nerve knew where to go... it's just stabilized."

**Idea:** Two-pass rendering:
1. Deterministic skeleton (the current biomorph algorithm)
2. Exploratory growth: random "soft tissue" branches that are stabilized/pruned by proximity to the skeleton

Mutations to the skeleton automatically produce coherent soft-tissue changes — facilitated variation at its most dramatic. You'd literally see Kirschner's principle: "one thing sets the direction, the other things adapt to it."

#### 3. The "Lost Ant" Principle (not prototyped yet)

From the ant foraging section: ants following a trail occasionally wander off. Maps to mutation strategy — an "exploration rate" that sometimes allows large-jump mutations to escape local optima.

#### 4. Weak Linkage as Plug-and-Play Modules (not prototyped yet)

Kirschner's electrical outlet metaphor. A module library of pre-evolved sub-structures that can be plugged into bud attachment points. More ambitious — deferred.

#### 5. The Cognition Parallel (educational content, not a prototype)

Evolution ↔ Learning, Evolvability ↔ Learnability, Exploratory processes ↔ Reinforcement, Compartmentation ↔ Modularity, Weak linkage ↔ Plasticity. Could be an explainer section or interactive paper addition.

---

## Sources

- Kirschner, M.W. Harvard lecture, "Evolvability." [YouTube](https://youtu.be/gr5iUoNYLL0)
- Kirschner, M.W. & Gerhart, J.C. (1998). "Evolvability." *PNAS* 95(15), 8420-8427.
- Dawkins, R. (1988). "The Evolution of Evolvability." *Artificial Life*, Santa Fe Institute.
- Carroll, S.B. (2006). *The Making of the Fittest.* W.W. Norton.
- Stanley, K.O. (2007). "Compositional Pattern Producing Networks." (Picbreeder/CPPN)
- Sims, K. (1994). "Evolving Virtual Creatures." SIGGRAPH.

*Last updated: 2026-02-21*
