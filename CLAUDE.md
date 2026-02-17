# Biomorph Builder — Claude Code Context

## Project Overview

Interactive implementation of Richard Dawkins' biomorphs from "The Evolution of Evolvability" (1988). Seven experiences: breeding app, interactive paper, 2D game, 3D gallery, specimen museum, gene search tool, and methodology writeup. The landing page showcases all seven with cycling biomorph animations. No build step — vanilla JS, served as static files.

**Live site:** https://biomorphbuilder.com/
**Repo:** `davidkedmey/davidkedmey.github.io` (GitHub Pages user site)
**Local folder:** `~/Desktop/Biomorph Builder/`
**Local dev:** `python3 -m http.server 8765` from this folder

## Roles

**On startup, before doing anything else:** Ask the user which role they want you to take (Leader, Breeder, Paper, or Game). Also remind them: "Do you already have another instance running this role?" Then follow the scope below. Only edit files you own. Coordinate through the user for cross-cutting changes.

| Role | Scope | Files owned |
|------|-------|-------------|
| **Leader** | Landing page, navigation, shared design, cross-project integration | `index.html`, `style.css`, `shared/`, `CLAUDE.md` |
| **Breeder** | 2D breeding app | `breed.html`, `biomorph.js`, `history.js`, `peppering.js`, `specimen-library.json`, `gallery-preview.html` |
| **Paper** | Interactive annotated Dawkins paper | `dawkins-paper/` |
| **Game** | 2D sandbox game + 3D gallery world | `game/`, `3d/` |

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
├── reverse-engineering-dawkins.md  # Source markdown for how-we-built-this.html
├── IDEAS.md                # Future directions (dev only)
└── Evolution-of-Evolvability.pdf  # Dawkins' original 1988 paper
```

## Key Concepts

- **Genotype:** Array of integers. 9 genes (modes 1-2), 11 (mode 3), or 13 (modes 4-5).
- **Genes 0-7 (g1-g8):** Define 8 direction vectors for recursive tree drawing. Range: [-9, 9].
- **Gene 8 (depth):** Recursion depth. Range: [1, 8]. Higher = exponentially more branches.
- **Gene 9 (segs):** Segment count (modes 3+). Gene 10 (segDist): spacing between segments.
- **Genes 11-12 (grad1, grad2):** Gradient factors (modes 4-5). Make segments taper.
- **Modes 1→5:** Progressive embryologies, each adding developmental features.
- **Mode 0:** Pixel peppering (no genetics, demonstrates need for constrained development).

## 3D Viewer

Interactive 3D biomorph viewer using Three.js (v0.172.0, via CDN import map). Single-specimen viewer with orbit controls and WASD walking.

**Controls:** WASD move, Arrow Left/Right prev/next specimen, 1-5 switch mode, F collect, R regenerate, P pause rotation, G toggle wind, E cycle environments, L cycle locomotion.

**Key details:**
- Uses ES modules — must be served over HTTP, not file:// (CORS blocks local module imports)
- Biomorphs rendered as merged cylinder geometries with vertex colors (brown→green gradient)
- **Wind system:** Two-layer Crysis-style vertex shader (main bending + detail flutter), toggle with G key
- **Locomotion:** 3 vertex shader modes — Wiggle (fish-like), Crawl (alternating legs), Pulse (breathing). L key cycles.
- **Environments:** 6 presets (Museum, Garden, Ocean, Sunset, Void, Starfield) with dynamic lighting/fog. E key cycles.
- Collect feature: press F to save specimen to `shared/collection.js` store, importable into game

## Development

```bash
# Serve locally (required for ES modules)
python3 -m http.server 8765
# Then open http://localhost:8765/3d/index.html
```

No dependencies to install. No build tools. Just a web server.

## Conventions

- Vanilla JS, no frameworks. ES modules for 3d/ and shared/. Classic scripts for 2D app.
- Three.js loaded via CDN import map (no npm/bundler).
- `shared/genotype.js` is the single source of truth for genotype operations. Both 2D and 3D import from it.
- `shared/collection.js` manages cross-experience specimen collection in localStorage (`biomorph-collected` key). Any experience can save specimens; the game's gallery bridge reads from both breeder gallery and collected specimens.
- `biomorph.js` has its own copy of MODE_CONFIGS (historical duplication from before shared/ existed).
- Prefer merged geometries over individual meshes for performance.
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

- **Breeder → Game:** `gallery-bridge.js` reads `biomorph-gallery`, converts via `breederToOrganism()`
- **3D Gallery → Game:** `shared/collection.js` writes to `biomorph-collected`, `gallery-bridge.js` reads via `loadAllImportable()`
- **Game → Breeder:** Not yet implemented (future: export organism back to breeder gallery)
- **specimen-library.json:** 35 curated specimens, currently only used by `gallery-preview.html`. Future: shared exhibit data for 3D gallery and game world.

## Session Context / In-Progress Work

**LLM Command Bar:** Read `~/.claude/projects/-Users-davidkedmey/memory/llm-integration.md` for context.
- AI fallback for natural language commands in the game's command bar (bring-your-own-key, OpenAI-compatible)
- Tested & working on localhost:8765. Needs deployment + more testing.

**Recent additions (Feb 2026):**
- Landing page: 7 experience cards (Breed, Play, Explore, Read + Museum, Search, How We Built This) + cycling biomorph hero animation
- Museum: 74 original Dawkins specimens with live-rendered thumbnails, metadata, provenance notes, action buttons
- Search: Polished GA-powered gene search tool — upload target, watch evolution, click results to open in Breeder
- How We Built This: Methodology narrative with live Insect demo (clamped vs real gene range)
- 3D Viewer: 6 environment presets, Crysis-style wind system, 3 locomotion modes (wiggle/crawl/pulse)
- Breeder: Multi-gallery system (peppering/classic/saves), 35 curated specimens
- Paper: Media margin notes with toggle/dismiss, lazy video loading, verified genotypes from Exhibition zoo in all figures, full site nav
- Game: Sandbox mode (terrain painting, biomorph brush, undo), Creative mode, Examine overlay (E key), full mouse support
- Shared: `collection.js` for cross-experience specimen collection, `dawkins-zoo.json` with 74 extracted specimens

**Gene range expansion (Feb 2026):**
- Expanded g1-g8 ranges from [-3,3] to [-9,9] across all modes in `shared/genotype.js`, `biomorph.js`, and `dawkins-paper/index.html` (`PAPER_MODE_CONFIGS`)
- Updated Insect and Fern presets in `CLASSIC_PRESETS` (biomorph.js) to use real Dawkins genotypes from the original Blind Watchmaker program
- Added `shared/dawkins-zoo.json` — 42 Exhibition zoo + 24 Alphabet zoo + 3 named specimens + 3 presets, extracted from WatchmakerSuite binary files
- Added `shared/gene-search.js` — GA + brute-force genotype search with grayscale NCC scoring for matching paper figures
- Algorithm audit confirmed: `defineVectors` and `drawTree` are exact matches to Dawkins' Pascal (index offset +2 compensated by starting at v4)
- Known limitation: a few exotic radial specimens have effective gene values up to 36, beyond [-9,9]

**Tasks for Breeder instance:**
- Add interactive gene sliders to the Genome panel in breed.html (currently read-only). The paper already has a gene explorer widget with sliders (`dawkins-paper/index.html:3053`) that can serve as reference. This corresponds to Dawkins' "Engineering" mode.
- Review remaining CLASSIC_PRESETS specimens — some may benefit from updated genes now that the range is wider

## Dawkins Paper (`dawkins-paper/`)

Single monolithic `index.html` (~5,400 lines) — interactive annotated edition of the 1988 paper. Served at `biomorphbuilder.com/dawkins-paper/`.

- **Reading Modes:** Clean, Enhanced (margin notes + paragraph tracking), Multimedia (walkthroughs + annotation panels + media margin notes)
- **Interactive Widgets:** Gene explorer, breeding widget, pixel-peppering walkthroughs, figure galleries
- **Study Mode:** SM-2 spaced repetition with cloze/QA/note/question cards linked to paragraphs
- **Media Margin Notes:** Collapsible video/media panels in right margin (`mn-*` prefixes), toggle/dismiss, lazy loading
- **Component prefixes:** `pw-*` (paragraph walkthrough), `fc-*` (flashcard/study), `pi-*` (paragraph index), `mn-*` (media margin notes)
- **Local dev:** `python3 -m http.server 8765` then open `http://localhost:8765/dawkins-paper/`

## References

- Dawkins, R. (1988). "The Evolution of Evolvability." — the paper this implements
- See `IDEAS.md` for future directions (physics, AI exploration, evo-devo features)
- See `3D-WORLD-IDEAS.md` for ideas on making the 3D world a living ecosystem
