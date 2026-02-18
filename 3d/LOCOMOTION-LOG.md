# Building Locomotion: A Development Log

## The Question

A biomorph is a recursive branching tree defined by 9-13 genes. It has no muscles, no skeleton, no nervous system. It's a shape — nothing more. So what happens when you give it physics and drop it on the ground?

Richard Dawkins showed that simple genetic rules produce an astonishing diversity of form. But form without function is just art. The question driving the Locomotion Arena is: **can the same genes that determine shape also determine movement?**

## Day 1: First Contact with the Ground

The first attempt was straightforward: take the tree structure, convert each branch into a rigid body, connect them with hinge joints, and oscillate the joints sinusoidally. Drop it on a ground plane. See what happens.

What happened was explosions. The creatures detonated on contact with the ground — bodies flying in every direction, branches launching into the sky. The constraint solver couldn't keep up with the forces.

After research into cannon-es physics stability (ragdoll examples, constraint tuning guides, walking robot demos), we identified the critical settings:

- **Solver iterations must exceed body count** (we use 30)
- **Quaternion normalization must be exact** (`quatNormalizeFast = false`)
- **Motor forces must be gentle** (5-15, not hundreds)
- **Connected bodies must not self-collide** (`collideConnected: false`)
- **Creature parts only collide with ground** (collision groups)

With these in place, a hardcoded test creature — a flat box with four dangling legs — stood on the ground and walked. Slowly, awkwardly, but it walked.

## Day 1.5: From Test Creature to Genotype Creatures

The test creature proved the physics pipeline. Next: connect it to real genotypes.

The challenge: biomorph trees vary enormously in size. A depth-8 creature with gene values of 9 can span 50+ units. A depth-2 creature might be 3 units. The physics needs everything within a ~3-unit envelope.

Solution: a pre-pass computes the tree's bounding extent, then derives a normalization scale. Every creature, regardless of genotype, fits within the same physical size. The genes determine *shape*, not *scale*.

The first genotype creatures were sprawling, crab-like forms — branches radiating from a central spine, resting on the ground. The crawl gait made their branches oscillate in sequence. They moved. Not well, but they moved.

## Day 2: Designing for Locomotion

Random genotypes produce random shapes. Most are terrible at moving — they flop, they spin, they sit still. This is expected. In nature, most random mutations are harmful.

But what if we *design* genotypes that should be good at locomotion? Not evolved — designed, by understanding what the genes do and choosing values that produce functional morphologies.

### Understanding the Gene-Shape Relationship

The 8 direction genes (g1-g8) define vectors that control branching:

| Genes | Control | Locomotion role |
|-------|---------|----------------|
| g1, g5 | Inner diagonal branches (v3/v5) | Primary "legs" |
| g2, g6 | Horizontal branches (v2/v6) | Secondary legs / feet |
| g3, g7 | Outer diagonal branches (v1/v7) | Stabilizers / wide stance |
| g4 | Upward trunk (v4) | Body height |
| g8 | Downward stem (v8) | Tail / anchor |

The key insight: **negative values for g5, g6, g7 make branches point downward**. Downward branches become legs. Positive g1, g2, g3 spread them outward. So a "quadruped" is just: spread outward (positive g1-g3), point down (negative g5-g7), short trunk (small g4).

### The g4=0 Trap

Before designing presets, we hit a critical discovery. The recursion in `extractSkeleton` starts at vector index 4 — the upward trunk. If g4=0, the trunk has zero length, and the entire tree is pruned at the root: `if (length < 0.001) return;`. The creature spawns as a single bodyless point. No joints. No movement.

This means **every creature that wants to move must have g4 ≥ 1**. Even a value of 1 is enough — just a tiny trunk to anchor the branching structure. It's the spine, the nucleus, the starting point of form.

### Preset Design: Round 1

The first attempt at hand-designed genotypes was humbling. We made these predictions:

| Design | Predicted shape | Predicted gait | Predicted speed |
|--------|----------------|----------------|-----------------|
| **Table** — spread out, legs down | Quadruped | Crawl | Medium |
| **Spider** — wide, many legs | Low scuttler | Crawl | Medium |
| **Snake** — segments, no branches | Chain | Wiggle | Fast |
| **Caterpillar** — segments with legs | Worm | Crawl | Slow |
| **Jellyfish** — dome, upward branches | Umbrella | Pulse | Slow |
| **Crab** — max horizontal spread | Wide flat | Wiggle | Medium |

The reality:

| Design | Bodies | Speed | What actually happened |
|--------|--------|-------|----------------------|
| Table v1 | 4 | 0.12 m/s | Recognizable quadruped. Slow but stable. |
| Spider v1 | 4 | 0.19 m/s | Toppled. Too vertical. |
| Snake v1 | 4 | 0.25 m/s | Fastest! But invisible — too flat to see. |
| Caterpillar v1 | 16 | 0.10 m/s | Complex but tiny in the distance. |
| Jellyfish v1 | 4 | 0.02 m/s | Barely moved. Upward branches can't push ground. |
| Crab v1 | 1 | 0.00 m/s | **Dead.** g4=0 killed the tree. |

Key lessons from Round 1:
1. **Physics depth matters hugely.** With `maxPhysicsDepth=2`, most creatures only got 4 bodies — barely enough for interesting movement. Increasing to 3 doubled the body count and dramatically improved articulation.
2. **g4=0 is fatal.** Discovered the trunk-pruning bug (see above).
3. **Upward branches don't help on flat ground.** The jellyfish's dome shape had nothing to push against.
4. **Flat is fast but invisible.** The snake moved well but was impossible to see from the default camera angle.

### Preset Design: Round 2

Armed with these lessons, we revised every preset:
- Increased `physDepth` to 3 for most presets (more articulated joints)
- Ensured g4 ≥ 1 on every preset (no more dead trees)
- Increased depth values for more branching complexity
- Gave the jellyfish downward branches for ground contact
- Made the spider flatter with more leg emphasis

| Design | Genes | Mode | Bodies | Gait | Speed | Visual |
|--------|-------|------|--------|------|-------|--------|
| **Table** | [4,6,4,2,-5,-7,-5,0,4] | 1 | 8 | crawl | 0.49 m/s | Clear quadruped with spread legs |
| **Spider** | [6,4,6,1,-3,-5,-3,0,5] | 1 | 8 | crawl | 0.29 m/s | Wide sprawl, many ground-touching legs |
| **Snake** | [2,1,0,1,-1,-1,0,0,2,6,3] | 3 | 16 | wiggle | 0.29 m/s | Visible segmented chain, undulating |
| **Caterpillar** | [3,4,2,1,-4,-5,-3,0,3,4,3] | 3 | 16 | crawl | 0.22 m/s | Orange spine + green leg branches |
| **Jellyfish** | [5,7,5,3,-2,-3,-2,-3,4] | 1 | 8 | pulse | 0.22 m/s | Umbrella shape, actually pulses |
| **Crab** | [3,9,4,1,-2,-6,-3,0,4] | 1 | 8 | wiggle | 0.22 m/s | Extremely wide lateral form |

The Table is the champion at 0.49 m/s. It turns out the recipe for fast ground locomotion is simple: **moderate spread, strongly downward legs, enough depth for articulated joints**. The negative g5/g6/g7 values (-5, -7, -5) create branches that act like real legs — they point down, they touch the ground, and the crawl gait swings them in alternating pairs like a trot.

### What the Genes Actually Do (Revised)

After two rounds of testing, here's a more honest assessment of how genes map to locomotion:

| Gene | Effect on locomotion | Sweet spot |
|------|---------------------|------------|
| g1 (inner spread) | Controls "hip width" of primary legs | 3-6 |
| g2 (horiz spread) | Controls reach of lateral limbs | 4-9 (higher = wider) |
| g3 (outer spread) | Stabilizer width | 2-6 |
| g4 (trunk) | **Must be ≥ 1.** Height of body center | 1-3 (low = stable) |
| g5 (inner vertical) | Primary leg angle. **Negative = legs** | -3 to -7 |
| g6 (horiz vertical) | Lateral leg angle. **Negative = legs** | -3 to -7 |
| g7 (outer vertical) | Stabilizer angle | -2 to -5 |
| g8 (tail) | Tail/anchor. Mostly irrelevant | 0 |
| depth | Branching complexity. More = more joints | 3-5 |
| physDepth | How many levels get physics bodies | 2-3 |

The fundamental insight: **locomotion is an emergent property of the interaction between downward-pointing branches and oscillating hinge joints.** The genes don't encode "legs" — they encode vectors. But negative vertical genes create structures that happen to function as legs when driven by sinusoidal motors. Form follows function follows form.

## Day 3: Ground Truth

A persistent problem: branches visually penetrate the ground. The physics bodies are small boxes at branch midpoints, but the visual geometry — especially deeper visual-only sub-branches — extends far beyond the collision envelope. When a body tilts, branch tips sweep through the ground plane like ghostly roots.

### Why It Happens

Each physics body has a single collision box at its center. But it carries visual branches that may extend 2-3x the box size. These branches are just meshes — Three.js geometry with no physics. When the body rotates, the meshes rotate with it, and any part that dips below y=0 passes through the ground unimpeded.

### The Fix: Two Layers

**Layer 1 — Tip Colliders (Physics)**

After building the skeleton, we iterate through each body's visual branches and find the leaf endpoints — branch tips that aren't the start of any other branch. At each tip, we add a small `CANNON.Sphere` (radius 0.12) as an additional shape on the parent body, offset to the tip position. These spheres collide with the ground plane, creating invisible "feet" at every branch endpoint.

The tip colliders do double duty: they prevent the physics body from rotating into a position where tips would go underground, and they give the creature more points of ground contact for traction.

**Layer 2 — Ground Clipping Plane (Visual)**

For any geometry that still manages to dip below ground (branches between the body center and tips, or during fast motion), we add a Three.js clipping plane at y=0.01 to the locomotion material. This is a GPU-level clip — any fragment below the plane is simply not rendered. The result: branches appear to meet the ground cleanly, as if pressing into soil rather than phasing through it.

The clipping plane is only applied to the locomotion material (`locoMaterial` in `createTreeBodies`), so the regular 3D gallery viewer is unaffected.

### The Result

Creatures now interact cleanly with the ground. Branch tips that touch the surface create flat contact edges instead of ghostly penetrations. The tip colliders also changed the movement dynamics — creatures with more ground contact points (like the Spider and Caterpillar) became more stable and slightly slower, while the Table maintained its speed advantage because its legs are structured to push off the ground efficiently.
