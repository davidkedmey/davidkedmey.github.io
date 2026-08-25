# Biomorph Builder — Claude Code Context

## Project Overview

Interactive implementation of Richard Dawkins' biomorphs from "The Evolution of Evolvability" (1988). The landing page carries four experiences: illustrated explainer, selection app (Select, file still breed.html), interactive paper, and specimen museum. Everything else — Bloom (field embryology), the 2D game, the 3D gallery, Genome, Gene Search, Colony, Planet, Locomotion, Expedition, the prototypes, and the dev logs — is listed on `workshop.html`. Site-nav on every page: Hub · Explainer · Select · Museum · Read (omit the page's own link). No build step — vanilla JS, served as static files.

**Vocabulary:** the core loop is mutation plus artificial selection — a parent, offspring that each differ by one mutation, and the user picking which offspring parents the next generation. Call it selection, not breeding; "breeding" in this codebase means the separate sexual-reproduction feature that crosses saved specimens.

**Live site:** https://biomorphbuilder.com/
**Repo:** `davidkedmey/davidkedmey.github.io` (GitHub Pages user site)
**Local folder:** `~/projects/biomorphbuilder/` (moved from `~/Desktop/Biomorph Builder/` 2026-08-25 to escape iCloud eviction)
**Local dev:** `python3 -m http.server 8765` from this folder

## Roles

When a role is assigned (via launcher or user message), follow the scope below. Only edit files you own. Coordinate through the user for cross-cutting changes.

| Role | Scope | Files owned |
|------|-------|-------------|
| **Leader** | Landing page, navigation, shared design, cross-project integration | `index.html`, `workshop.html`, `style.css`, `shared/`, `CLAUDE.md` |
| **Breeder** | 2D breeding app | `breed.html`, `biomorph.js`, `history.js`, `peppering.js`, `specimen-library.json`, `gallery-preview.html` |
| **Paper** | Interactive annotated Dawkins paper | `dawkins-paper/` |
| **Game** | 2D sandbox game + 3D gallery world | `game/`, `3d/` |
| **Scribe** | Bug tracking, enhancement requests, questions, speculations | `.local/scribe/` |

If no role is assigned, you have full access to everything.

## Architecture

```
├── index.html              # Landing page (hub for the 7 front-page experiences)
├── workshop.html           # Index of everything not on the front page
├── breed.html              # 2D selection app
├── museum.html             # Dawkins' Zoo — 74 original specimens with live rendering
├── search.html             # Gene Search — GA-powered genotype finder
├── how-we-built-this.html  # Methodology writeup (reverse-engineering narrative)
├── biomorph.js             # 2D engine: rendering, mutation, UI, breeding (~2000 lines)
├── style.css               # 2D styles
├── history.js              # Undo/genealogy tracking
├── peppering.js            # Mode 0: random pixel peppering demo
├── bloom/                  # Field embryology — the 9-gene genotype under a second rule
│   ├── index.html          # Selection grid, tree/field comparison, gene table
│   ├── field.js            # Gene -> trigonometric parameters; point generator
│   ├── render.js           # Density renderer (many creatures per canvas) + tree renderer
│   ├── app.js              # Selection loop, lineage, gallery bridge
│   ├── zoo.html            # Many genotypes in one space; shareable. Two views:
│   │                       #   Colonies — each genotype's whole colony, one panel each
│   │                       #   Aquarium — one individual from each, sharing a tank
│   ├── zoo.js              # URL encoding of a zoo + colony layout
│   └── zoo-preview.png     # og:image for link cards
├── shared/
│   ├── genotype.js         # Shared genotype logic (ES module)
│   ├── breeding.js         # Shared breeding logic
│   ├── collection.js       # Cross-experience specimen collection (localStorage)
│   ├── gene-search.js      # GA + brute-force search to match target images to genotypes
│   └── dawkins-zoo.json    # 74 original specimens from Dawkins' Blind Watchmaker program
├── 3d/                     # 3D viewer (Three.js) — environments, wind, locomotion
├── game/                   # Farming/exploration game
├── dawkins-paper/          # Interactive annotated paper (biomorphbuilder.com/dawkins-paper/)
│   └── index.html          # Single-file app (~6,000 lines): reading modes, study system, widgets
└── .local/                 # Dev-internal (gitignored): launcher, shell scripts, scribe logs
```

## Key Concepts

- **Genotype:** Array of integers. 9 genes (modes 1-2), 11 (mode 3), or 13 (modes 4-5).
- **Genes 0-7 (g1-g8):** Define 8 direction vectors for recursive tree drawing. Range: [-9, 9].
- **Gene 8 (depth):** Recursion depth. Range: [1, 8]. Higher = exponentially more branches. Under the field rule (`bloom/`) the same gene sets how many copies of the form are overlaid, so it plays the same "how much development" role.
- **Gene 9 (segs):** Segment count (modes 3+). Gene 10 (segDist): spacing between segments.
- **Genes 11-12 (grad1, grad2):** Gradient factors (modes 4-5). Make segments taper.
- **Modes 1→5:** Progressive embryologies, each adding developmental features.
- **Mode 0:** Pixel peppering (no genetics, demonstrates need for constrained development).
- **Known limitation:** A few exotic radial specimens have effective gene values up to 36, beyond [-9,9].

## Conventions

- Vanilla JS, no frameworks. ES modules for 3d/ and shared/. Classic scripts for 2D app.
- Three.js loaded via CDN import map (no npm/bundler).
- `shared/genotype.js` is the single source of truth for genotype operations.
- Keep the 3D world explorable and atmospheric — it's meant to feel like a museum/nature walk.

## Sharing

`bloom/zoo.html` carries its genotypes in the URL hash
(`#z=<9 chars each>&v=a&n=<names>&t=<title>`; `v=a` selects the aquarium view),
not in localStorage, so a link renders the same creatures for anyone who opens it — rendering is
deterministic. With no hash it falls back to this browser's saved gallery. Nine genes fit in nine
characters, so a zoo of a dozen creatures is a short link.

The aquarium takes one copy out of each genotype's colony (`creaturePoints` pins the phase
instead of cycling it) and lets them swim a shared tank:

- **One flat speed** (`SPEED`, tank half-widths per unit t). Creatures change direction, never
  pace — no acceleration, no coasting. At 0.06 a crossing takes about twenty seconds. Verified
  by simulation: speed is invariant to four decimals for every creature on every frame.
- **`bodyForward`** — which way a creature faces, measured from where its dense bell sits
  relative to its centroid. Trailing filaments are sparse and drag the centroid behind the
  bell, so that offset is the direction of travel. It differs per creature: there is no single
  "up" to assume. Body points are rotated by `heading - bodyForward`.
- **`turnRate`** — three sines at frequencies 1, phi and phi^2. Irrational ratios, so the sum
  is quasi-periodic and never repeats; heading integrates it, so small persistent turns
  accumulate into long curves. Not random: a link has to render the same motion for everyone.
  Amplitude is radians per unit t; 0.22 works out near 20 degrees a second. Near the glass a
  creature steers back inward (`WALL_TURN`), which is where most reversals come from.
- **Depth.** Each creature sits in one of `DEPTH_BANDS` fixed bands, drawn from its genotype
  so a shared link lays the tank out identically for everyone. Farther bands are lerped toward
  the background (`RAMPS`, one ramp per band) and drawn slightly smaller, and creatures are
  painted far-to-near — each one's counts are colourised and then zeroed before the next is
  plotted, so a nearer creature *covers* a farther one instead of adding brightness to it.
  That occlusion is what makes a crossing read as passing rather than colliding.
- **Bumping.** Only creatures within `BUMP_BANDS` of each other in depth can touch; the rest
  slide through. Speed is flat, so a bump can only turn a creature. `BUMP_DIST` is 0.14 against
  bodies about 0.17 across, so they visibly overlap before either reacts — roughly one contact
  every fifteen seconds. Wider thresholds have them jostling 40% of the time.
- **Bumps land as an impulse on `spin`**, an angular velocity that then decays, not as a
  heading change applied on the spot. Steering straight at the away-angle turns both creatures
  at a fixed rate the instant they touch, which reads like meshing gears. `BUMP_IMPULSE` 0.18
  with `SPIN_DECAY` 0.35 gives a 21-56 deg/sec lean over a ~2.4s contact totalling ~95 degrees
  of turn. Each creature also has a `give` drawn from its genotype, so two meeting do not yield
  by the same amount.
- **Pauses.** `cruiseLevel` is a slow `wobble` through a smoothstep: 0 while stopped, 1 while
  cruising. Roughly one pause every 49 seconds lasting ~4.7s, about 9% of the time. Speed when
  moving is still flat — this is stop-and-go, not acceleration.
- **Wake.** Shed by the pump, not sprinkled at a fixed rate. `pumpPhase` samples the real body
  once per genotype and returns how hard it is squeezing (0..1); bubble strength is that times
  `cruiseLevel`, so a resting creature sheds nothing however hard its bell works, and a
  cruising one sheds in pulses — about 15 discrete puffs a minute, with gaps between.

  Each bubble is given its own drift **once, at the moment it is shed**, and keeps it for life:
  a direction mostly across the path, a carry distance, and a slight curl, all from a
  deterministic hash so a link still renders the same wake for everyone. Deriving the direction
  from a bubble's index in the array instead makes every bubble jump to a new side each time
  the oldest is dropped off the front — the wake then reads as a fixed pattern that sparkles
  and disappears rather than as water carrying things apart.

  Drift distance goes as `age^0.6`, not linearly: things carried apart in water separate fast
  at first and then ever more slowly, so the wake billows out early and keeps thinning.
  Brightness falls as `fade^1.3`, which leaves a long faint tail rather than a cliff.

  `TRAIL_MIN_MOVE` must be measured from the last bubble, not the last frame — a frame covers
  only 0.0017 of a tank, so a per-frame test never fires and no wake is ever recorded.
- **`bodyRadius` uses radial distance**, not `max(|x|,|y|)`, or a turning body would outgrow
  its measured size. It samples a whole 4*pi pulse, since a body changes size threefold across
  its cycle and measuring part of it makes creatures burst out of frame.

The body still swells and shrinks on its own cycle — that is the genotype's and has nothing to
do with how fast the creature travels. Creatures bunch and disperse on their own (all six in
one half about 13% of the time, mean pairwise distance 0.79); no separation rule is applied.

State is integrated in t, and t advances a fixed amount per frame, so a viewer whose browser
drops frames falls behind rather than diverging.

## Cross-Experience Data Flow

Biomorphs can flow between experiences via localStorage:

```
Breeder (breed.html)  ──save──►  localStorage['biomorph-gallery']
                                        │
3D Gallery (3d/)      ──collect──► localStorage['biomorph-collected']
                                        │
                         ┌──────────────┘
                         ▼
Game (game/)  ◄── gallery-bridge.js reads both stores
              └── /gallery command shows all importable specimens
```

## Parallel Development

Multiple Claude instances may work on this project simultaneously. Follow these rules to avoid conflicts.

**Before editing, check for other work in progress:**
```
git status        # see if other instances have uncommitted changes
git diff --stat   # see which files are touched
```
If another instance has uncommitted changes to files you need, either wait or use a branch.

**Branching rules:**
- **One instance working?** Stay on `main`. No branch needed.
- **Two instances, different roles?** Usually fine on `main` — role file ownership prevents overlap.
- **Two instances, same role or shared files?** One stays on `main`, the other branches: `git checkout -b feature-name` (works even with dirty files mid-session).
- **Realize mid-session there's overlap?** Branch now — `git checkout -b my-feature` carries your uncommitted changes to the new branch.

**Commit discipline:**
- **Always `git pull` before staging.** Another instance may have pushed since you last checked. This is the single most common source of conflicts — don't skip it.
- Commit frequently in small, focused chunks. Large uncommitted diffs are hard to merge.
- Write clear commit messages — the next instance reads `git log` to understand what changed.
- **Only stage files related to your current task.** Never batch unrelated changes into one commit. If `git status` shows modified files you didn't touch, leave them alone — another instance owns those.
- **Never amend a commit that was already pushed** — this rewrites history and forces a `--force` push, which can destroy another instance's work.

**Merging and conflicts:**
- The instance performing the merge resolves conflicts.
- Most conflicts are additive (two new imports, two new functions) — keep both sides.
- If unsure, ask the user rather than guessing.

**Shared files:** `game/main.js` is the most conflict-prone file (imported by everything, edited by most Game tasks). When two Game instances run in parallel, coordinate around it — one owns it, the other branches.

## Session Context

**LLM Command Bar:** Read `~/.claude/projects/-Users-davidkedmey/memory/llm-integration.md` for context.

**Dawkins Paper (`dawkins-paper/`):** Single monolithic `index.html`. Component prefixes: `pw-*` (paragraph walkthrough), `fc-*` (flashcard/study), `pi-*` (paragraph index), `mn-*` (media margin notes).
