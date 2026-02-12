# Dawkins' Biomorphs

A faithful implementation of Richard Dawkins' progressive embryologies from **"The Evolution of Evolvability"** (1988), originally described in *The Blind Watchmaker* (1986).

**Live demo:** https://dkclaude2000.github.io/dawkins-biomorphs/

## 6 Progressive Modes

The app walks through Dawkins' embryologies in the order he introduced them:

### Mode 0: Pixel Peppering (p.204-205)
Random pixels on a 16×16 grid. No embryological structure. Demonstrates that without constrained development, cumulative selection is impotent.

### Mode 1: Basic Biomorphs (p.207-210)
The classic 9-gene recursive bilateral tree. Genes g1-g8 define direction vectors, g9 controls recursion depth.

### Mode 2: + Symmetry Options (p.210)
Adds a symmetry selector: left-right (default), up-down, four-way radial, or asymmetric. Opens new morphospace.

### Mode 3: + Segmentation (p.211-212)
Body repeated in segments along a backbone, like arthropod body plans. Adds `segCount` and `segDist` genes (11 total).

### Mode 4: + Gradients (p.212-213)
Segments taper front-to-back via gradient genes. Creates naturalistic body plans where segments differ in a graded fashion (13 total genes).

### Mode 5: Full Dawkins (p.213-215)
All features combined, plus:
- **Alternating asymmetry** — successive segments are asymmetrical in alternate directions, like leaves on a stem
- **Radial symmetry** — combined with segmentation, produces echinoderms (starfish, sea urchins)

## The Algorithm

Each biomorph has a genotype of integer genes. The core 8 genes map to 8 direction vectors with built-in bilateral symmetry:

| Vector | dx   | dy  |
|--------|------|-----|
| v1     | −g3  | g7  |
| v2     | −g2  | g6  |
| v3     | −g1  | g5  |
| v4     | 0    | g4  |
| v5     | g1   | g5  |
| v6     | g2   | g6  |
| v7     | g3   | g7  |
| v8     | 0    | g8  |

The recursive drawing procedure branches at each node, creating tree-like structures. Mutation changes a single gene by ±1 per generation.

## How to Use

1. Open `index.html` in a browser (or visit the live demo)
2. Select a mode from the tab bar
3. The parent biomorph is shown at the top with 8 mutant offspring below
4. Click any offspring to select it as the new parent
5. Repeat to evolve creatures through artificial selection
6. Use mode-specific controls (symmetry selector, toggles) to explore different morphospaces

## References

- Dawkins, R. (1988). "The Evolution of Evolvability." In *Artificial Life* (ed. C. Langton), pp. 201–220.
- Dawkins, R. (1986). *The Blind Watchmaker*. Norton.
