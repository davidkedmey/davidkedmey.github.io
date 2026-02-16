# Biomorph Builder — Claude Code Context

## Project Overview

Interactive implementation of Richard Dawkins' biomorphs from "The Evolution of Evolvability" (1988). Four experiences: breeding app, interactive paper, 2D game, and 3D gallery. No build step — vanilla JS, served as static files.

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
├── index.html              # Landing page (hub for Breed/Play/Explore)
├── breed.html              # 2D breeding app
├── biomorph.js             # 2D engine: rendering, mutation, UI, breeding (~2000 lines)
├── style.css               # 2D styles
├── history.js              # Undo/genealogy tracking
├── peppering.js            # Mode 0: random pixel peppering demo
├── shared/
│   ├── genotype.js         # Shared genotype logic (ES module)
│   └── breeding.js         # Shared breeding logic
├── 3d/                     # 3D gallery (Three.js)
├── game/                   # Farming/exploration game
├── dawkins-paper/          # Interactive annotated paper (biomorphbuilder.com/dawkins-paper/)
│   └── index.html          # Single-file app (~5,400 lines): reading modes, study system, widgets
├── exploration/            # AI-generated exploration journal + screenshots (dev only)
├── IDEAS.md                # Future directions (dev only)
└── Evolution-of-Evolvability.pdf  # Dawkins' original 1988 paper
```

## Key Concepts

- **Genotype:** Array of integers. 9 genes (modes 1-2), 11 (mode 3), or 13 (modes 4-5).
- **Genes 0-7 (g1-g8):** Define 8 direction vectors for recursive tree drawing. Range: [-3, 3].
- **Gene 8 (depth):** Recursion depth. Range: [1, 8]. Higher = exponentially more branches.
- **Gene 9 (segs):** Segment count (modes 3+). Gene 10 (segDist): spacing between segments.
- **Genes 11-12 (grad1, grad2):** Gradient factors (modes 4-5). Make segments taper.
- **Modes 1→5:** Progressive embryologies, each adding developmental features.
- **Mode 0:** Pixel peppering (no genetics, demonstrates need for constrained development).

## 3D Gallery (current focus)

First-person walkable gallery using Three.js (v0.172.0, via CDN import map). Five zones along a path, each showing biomorphs from a different mode.

**Controls:** WASD move, Arrow keys look, Space/C vertical, Shift run, Esc pause.

**Key details:**
- Uses ES modules — must be served over HTTP, not file:// (CORS blocks local module imports)
- Biomorphs rendered as merged cylinder geometries with vertex colors (brown→green gradient)
- Day/night cycle: 90-second loop with dynamic sky color, sun position, lighting
- Distance culling: exhibits beyond 120 units hidden for performance
- Gene overlay: shows genotype when player approaches an exhibit

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
- `biomorph.js` has its own copy of MODE_CONFIGS (historical duplication from before shared/ existed).
- Prefer merged geometries over individual meshes for performance.
- Keep the 3D world explorable and atmospheric — it's meant to feel like a museum/nature walk.

## Session Context / In-Progress Work

Read `~/.claude/projects/-Users-davidkedmey/memory/llm-integration.md` for full context on the LLM command bar integration that's in progress. Key points:
- `game/llm.js` (new), `game/main.js`, `game/renderer.js`, `game/input.js` were modified
- AI fallback for natural language commands in the game's command bar (bring-your-own-key, OpenAI-compatible)
- Tested & working on localhost:8765. User has an OpenAI key saved in localStorage.
- Still needs: more testing via DevTools MCP, deployment to biomorphbuilder.com

## Dawkins Paper (`dawkins-paper/`)

Single monolithic `index.html` (~5,400 lines) — interactive annotated edition of the 1988 paper. Served at `biomorphbuilder.com/dawkins-paper/`.

- **Reading Modes:** Clean, Enhanced (margin notes + paragraph tracking), Multimedia (walkthroughs + annotation panels)
- **Interactive Widgets:** Gene explorer, breeding widget, pixel-peppering walkthroughs, figure galleries
- **Study Mode:** SM-2 spaced repetition with cloze/QA/note/question cards linked to paragraphs
- **Component prefixes:** `pw-*` (paragraph walkthrough), `fc-*` (flashcard/study), `pi-*` (paragraph index)
- **Local dev:** `python3 -m http.server 8765` then open `http://localhost:8765/dawkins-paper/`

## References

- Dawkins, R. (1988). "The Evolution of Evolvability." — the paper this implements
- See `IDEAS.md` for future directions (physics, AI exploration, evo-devo features)
- See `3D-WORLD-IDEAS.md` for ideas on making the 3D world a living ecosystem
