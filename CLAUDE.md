# Biomorph Builder — Claude Code Context

## Project Overview

Interactive implementation of Richard Dawkins' biomorphs from "The Evolution of Evolvability" (1988). Seven experiences: breeding app, interactive paper, 2D game, 3D gallery, specimen museum, gene search tool, and methodology writeup. The landing page showcases all seven with cycling biomorph animations. No build step — vanilla JS, served as static files.

**Live site:** https://biomorphbuilder.com/
**Repo:** `davidkedmey/davidkedmey.github.io` (GitHub Pages user site)
**Local folder:** `~/Desktop/Biomorph Builder/`
**Local dev:** `python3 -m http.server 8765` from this folder

## Roles

When a role is assigned (via launcher or user message), follow the scope below. Only edit files you own. Coordinate through the user for cross-cutting changes.

| Role | Scope | Files owned |
|------|-------|-------------|
| **Leader** | Landing page, navigation, shared design, cross-project integration | `index.html`, `style.css`, `shared/`, `CLAUDE.md` |
| **Breeder** | 2D breeding app | `breed.html`, `biomorph.js`, `history.js`, `peppering.js`, `specimen-library.json`, `gallery-preview.html` |
| **Paper** | Interactive annotated Dawkins paper | `dawkins-paper/` |
| **Game** | 2D sandbox game + 3D gallery world | `game/`, `3d/` |
| **Scribe** | Bug tracking, enhancement requests, questions, speculations | `.local/scribe/` |

If no role is assigned, you have full access to everything.

## Architecture

```
├── index.html              # Landing page (hub for all 7 experiences)
├── breed.html              # 2D breeding app
├── museum.html             # Dawkins' Zoo — 74 original specimens with live rendering
├── search.html             # Gene Search — GA-powered genotype finder
├── how-we-built-this.html  # Methodology writeup (reverse-engineering narrative)
├── biomorph.js             # 2D engine: rendering, mutation, UI, breeding (~2000 lines)
├── style.css               # 2D styles
├── history.js              # Undo/genealogy tracking
├── peppering.js            # Mode 0: random pixel peppering demo
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
- **Gene 8 (depth):** Recursion depth. Range: [1, 8]. Higher = exponentially more branches.
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
- Commit frequently in small, focused chunks. Large uncommitted diffs are hard to merge.
- Write clear commit messages — the next instance reads `git log` to understand what changed.
- **Only stage files related to your current task.** Never batch unrelated changes into one commit. If `git status` shows modified files you didn't touch, leave them alone — another instance owns those.

**Merging and conflicts:**
- The instance performing the merge resolves conflicts.
- Most conflicts are additive (two new imports, two new functions) — keep both sides.
- If unsure, ask the user rather than guessing.

**Shared files:** `game/main.js` is the most conflict-prone file (imported by everything, edited by most Game tasks). When two Game instances run in parallel, coordinate around it — one owns it, the other branches.

## Session Context

**LLM Command Bar:** Read `~/.claude/projects/-Users-davidkedmey/memory/llm-integration.md` for context.

**Dawkins Paper (`dawkins-paper/`):** Single monolithic `index.html`. Component prefixes: `pw-*` (paragraph walkthrough), `fc-*` (flashcard/study), `pi-*` (paragraph index), `mn-*` (media margin notes).
