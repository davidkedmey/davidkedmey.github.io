# 3D World Ideas

Brainstormed directions for turning the 3D gallery into something more alive and interesting.

---

## 1. Living Ecosystem (not a museum)

Replace static exhibits with organisms that exist in the world — they reproduce, mutate, compete, and die. Walk through an ecosystem, not a gallery. Come back to a zone after 5 minutes and the population has drifted. Evolution happens whether you're watching or not.

## 2. Physics Gives Morphology Consequences

Currently genotype only affects appearance. If tree structures had even simple physics — center of mass, structural stability, wind resistance — then form would suddenly *matter*. A top-heavy biomorph falls over. A wide, low one survives a windstorm. This is the jump from artificial selection to natural selection, which is the core of Dawkins' argument.

## 3. Biomes as Selection Pressures

Instead of zones organized by mode complexity, zones could be environments — windy cliffs, dense forests competing for light, underwater with buoyancy. Same genetic system, different selection pressures. Convergent or divergent evolution emerges naturally.

## 4. Player as Selective Pressure

Be the "blind watchmaker" inside the world — pick up a biomorph and plant it somewhere, cross-pollinate between zones, introduce an invasive species. Or your presence itself could be a selection pressure (biomorphs near the player get more resources, creating a domestication dynamic).

## 5. Developmental Time-Lapse

When you approach a biomorph, watch it *grow* — the recursive branching process animated from a single point, like watching embryonic development. Makes the genotype→phenotype mapping visceral instead of abstract.

---

## 6. AI-Curated Botanical Gardens (Dream Version)

NPC farmers (Fern, Moss) breed biomorphs autonomously and curate gardens along a progressive path through morphospace — mirroring Dawkins' paper as a spatial journey.

### Vision Model Approach (max wow factor)
- Render each biomorph to an image after breeding
- Send to Claude/GPT-4V: "Rate 1-10 for visual interest. Does it resemble anything in nature? Name it."
- NPCs develop genuine aesthetic preferences — Fern favors plant-like forms, Moss favors alien symmetries
- Periodic "gallery reviews" where the vision model selects best-of-the-best for display on the main path
- AI-generated field notes on signs: not explanations but character observations ("Fern's been obsessed with depth-8 trees — says they remind her of coral")
- Compare AI aesthetic preferences to Dawkins' original selections from the paper
- Could produce a "tree of life" visualization showing the branching paths each NPC explored
- Vision model could also name specimens, creating a sense of discovered natural history

### Why defer this
- API cost per evaluation adds up across thousands of breeding cycles
- Latency — can't breed in real-time if each evaluation takes seconds
- Heuristic approach gets the spatial structure and progression working first
- Vision model can be layered on top later as a curation pass over heuristic-bred populations

---

*Last updated: 2026-02-15*
