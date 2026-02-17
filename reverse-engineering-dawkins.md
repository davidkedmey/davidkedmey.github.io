# Reverse-Engineering Dawkins' Biomorphs

## The Problem

Richard Dawkins' 1988 paper *The Evolution of Evolvability* contains roughly 50 biomorph figures — insects, ferns, trees, letters of the alphabet, echinoderms. These are the canonical examples that made the concept famous. But the paper never lists their genotypes.

When we built Biomorph Builder — an interactive reimplementation of Dawkins' system — we wanted to reproduce these exact figures. Our first attempt: stare at the paper, guess the gene values, tweak until it looks "close enough." The results were recognizable but unconvincing. The proportions were off. The branching angles were wrong. We were eyeballing 9-dimensional space.

This document describes how we went from guesswork to verified fidelity, using a combination of algorithm auditing, binary archaeology, genetic algorithm search, and source code analysis.

## Step 1: Verify the Algorithm

Before blaming the genes, we verified the algorithm. Dawkins published his `Tree` and `PlugIn` procedures in Pascal on page 207 of the paper:

```pascal
procedure PlugIn(ThisGenotype: Genotype);
begin
  order := gene[9];
  dx[3] := gene[1]; dx[4] := gene[2]; dx[5] := gene[3];
  dx[1] := -dx[3]; dx[0] := -dx[4]; dx[2] := 0; dx[6] := 0; dx[7] := -dx[5];
  dy[2] := gene[4]; dy[3] := gene[5]; dy[4] := gene[6]; dy[5] := gene[7]; dy[6] := gene[8];
  dy[0] := dy[4]; dy[1] := dy[3]; dy[7] := dy[5];
end;
```

We compared this line-by-line against our JavaScript `defineVectors` function. The result: **exact match**. Our implementation uses array indices offset by +2 from Dawkins' (our indices 1–8 vs Dawkins' 0–7), but this is compensated by starting the recursion at index 4 instead of Dawkins' index 2. Every direction vector is identical.

The recursion logic (`drawTree`) also matches: same binary branching, same depth decrement, same direction accumulation. The algorithm isn't the problem.

## Step 2: Discover the Real Gene Range

This was the breakthrough. Our initial implementation used gene ranges of [-3, 3] for genes 1–8 — a reasonable guess based on the paper's description and the fact that small values produce recognizable biomorphs. But something was wrong: Dawkins' famous Insect biomorph has gene 7 = 8. His Chess piece has gene 7 = 6. These are literally impossible in a [-3, 3] range.

### The Trickle Factor

The key to understanding Dawkins' gene values is a variable called `trickle` that appears in the original Blind Watchmaker source code but is never mentioned in the paper. Here's how it works:

- Dawkins stored gene values as large integers internally (e.g., raw gene 7 = 80 for the Insect)
- The `trickle` value (typically 9 or 10) acts as a scaling divisor
- **Effective gene value = raw value / trickle** (except for gene 9, the depth, which is used directly)
- So raw 80 / trickle 10 = effective gene 7 value of 8

This means Dawkins' actual gene range was much wider than [-3, 3]. His Exhibition zoo contains effective values from -9 to +9, with a few exotic radial specimens going as high as 36 (though these are outliers).

We expanded our gene ranges from [-3, 3] to [-9, 9], which covers >90% of Dawkins' original specimens. The visual difference was immediate and dramatic — the Insect's swept-back wings, previously invisible, suddenly appeared with full fidelity.

### How We Found the Range

1. **Algorithm audit** against Dawkins' published Pascal confirmed our code was correct
2. **Source code archaeology** of the [WatchmakerSuite](https://github.com/Aronnax9000/WatchmakerSuite) repository (a preservation of Dawkins' original Macintosh program) revealed the `trickle` scaling factor
3. **Binary parsing** of the zoo files (see Step 3) provided ground truth effective gene values
4. **Statistical analysis** of all 42 Exhibition zoo specimens showed effective ranges clustering in [-9, 9]

## Step 3: Extract the Original Specimens (Binary Archaeology)

The WatchmakerSuite repository contains Dawkins' original saved biomorphs as binary files — the actual creatures he bred and curated in 1986–1988. These are the ground truth.

### File Format

Each biomorph is stored as a 40-byte "person" record in big-endian format:

| Bytes | Field | Description |
|-------|-------|-------------|
| 0–17 | genes[1..9] | 16-bit signed integers (9 genes × 2 bytes) |
| 18–19 | segNo | Segment count |
| 20–21 | segDist | Segment spacing |
| 22–23 | completeness | Single or Double |
| 24–25 | spokes | NorthOnly, NSouth, or Radial |
| 26–39 | gradient genes | Per-gene gradient factors |

We parsed three collections:

- **Exhibition zoo**: 42 curated biomorphs (15 basic, 12 segmented, 15 radial)
- **Alphabet zoo**: 24 letter-shaped biomorphs (A–Z, minus some Dawkins couldn't breed)
- **Named specimens**: Standalone saved animals (Stunted, ChineseCharacter, HandkerchiefWithBows)
- **Presets**: The three default starting biomorphs (BasicTree, Insect, Chess)

All extracted genotypes are stored in `shared/dawkins-zoo.json` with both raw values and effective values (raw / trickle).

### Example: The Insect

```
Raw genes:  [10, 10, -40, 10, -10, -20, 80, -40, 6]
Trickle:    10
Effective:  [ 1,  1,  -4,  1,  -1,  -2,  8,  -4, 6]  ← what our code uses
```

Gene 7 = 8 creates those iconic swept-back wings. Under our old [-3, 3] range, this was clamped to 3 — producing a completely different, much less dramatic shape.

## Step 4: Automated Image Matching (Genetic Algorithm)

For figures where we don't have the original binary data — or where we want to verify our matches against the paper's printed figures — we built an automated search using a genetic algorithm.

### The Meta-Circularity

Dawkins' whole point was that cumulative selection — small random mutations filtered by a fitness criterion — can navigate enormous search spaces efficiently. We're using his method to find his specimens. The selection criterion changed from "looks interesting to a zoologist" to "looks like this specific picture" — but the evolutionary machinery is the same.

### The Search Space

With the expanded [-9, 9] range:
- Genes 1–8: 19 values each → 19⁸ ≈ 16.9 billion combinations
- Gene 9 (depth): 8 values
- **Total: ~135 billion possible genotypes** (mode 1 alone)

This is far too large for exhaustive search. The GA is essential.

### GA Configuration

- **Population**: 300 candidate genotypes
- **Fitness function**: Grayscale NCC (normalized cross-correlation) after box blur
- **Selection**: Tournament selection (best of 3 random candidates)
- **Reproduction**: Single-point crossover + random single-gene mutation (±1 or ±2)
- **Elitism**: Top 5 individuals survive unchanged
- **Immigration**: 10% random newcomers per generation (30% during stagnation)
- **Local search**: 5 mutations of the best-ever individual injected each generation

The GA typically converges within 200–500 generations (~60,000–150,000 evaluations).

### Scoring Functions: A Hard-Won Lesson

We tried three scoring approaches, each solving a different problem:

**1. Intersection-over-Union (IoU):** Score = |A ∩ B| / |A ∪ B|. Too strict — even a 1-pixel shift produces near-zero overlap. The fitness landscape is effectively flat, giving the GA no gradient to follow. Abandoned after scoring 0.23 on a trivial ground truth test.

**2. Chamfer Distance:** For each black pixel in image A, compute the distance to the nearest black pixel in image B (and vice versa). Much better — captures "almost right" matches. Achieved a **perfect 1.0 on ground truth** (clean render → clean render). But scored only **0.065 on real PDF scans** — the blurry gray scan pixels don't match our crisp 1px rendered lines.

**3. Grayscale Blur + NCC:** Both images converted to grayscale, inverted (dark features = high values), blurred with a box filter, then compared using normalized cross-correlation. Scored **0.795 on the same PDF scan** where chamfer scored 0.065 — a 12× improvement. NCC is invariant to brightness scaling; the blur creates tolerance for thickness and position differences.

**The lesson:** The optimal scoring function depends on the noise characteristics of the data. A function that works perfectly for clean-on-clean comparison can completely fail when the reference is noisy. This mirrors a deep truth about evolution: the fitness landscape's shape matters more than the search algorithm, and the landscape changes when the environment changes.

### Manual Fitting (Interactive)

Sometimes the algorithm gets close but not perfect. For these cases, the interactive paper includes a Gene Explorer widget with sliders — the paper's figure on one side, a live-rendered biomorph on the other. A human makes the final adjustments.

This mirrors Dawkins' original workflow. He didn't design biomorphs from equations — he bred them by eye. When we tweak genes to match a target shape, we're doing exactly what he did, just in reverse.

## Step 5: Populate the Paper with Verified Genotypes

With all three data sources — binary archaeology, GA search, and manual fitting — we replaced the guessed genotypes throughout the interactive paper:

| Figure | Description | Source | # Specimens |
|--------|-------------|--------|-------------|
| 4 | Basic tree | BasicTree preset (trickle=9) | 1 |
| 5 | Breeding screen | BasicTree as parent | 9 |
| 6 | Mode 1 portfolio | Exhibition zoo #1–15 | 10 |
| 10 | Segmented portfolio | Exhibition zoo #18–27 | 8 |
| 12 | Asymmetric segmented | Exhibition zoo #16–26 | 6 |
| 13 | Radial portfolio | Exhibition zoo #28–39 | 6 |
| 14 | Echinoderms | Exhibition zoo #28–42 | 6 |

The visual improvement was dramatic. The old guessed specimens (all constrained to [-3, 3]) looked generic and repetitive. The real Dawkins specimens use the full [-9, 9] range and show the extraordinary morphological diversity that made biomorphs famous.

## Results

### Ground Truth Test — Validating the Search

Before tackling paper figures, we ran a controlled experiment: render a known genotype (`[-1, 3, -1, -1, 2, 2, 2, 3, 7]` — the classic tree), pretend we don't know the genes, and see if the GA can rediscover them.

**First attempt (IoU scoring):** Converged to 0.23 by generation 20 and stalled. Flat fitness landscape.

**Second attempt (chamfer distance):** Reached 0.69 — visually close, 5 of 9 genes correct. But stalled due to a preprocessing bug: the reference was rescaled to 90%, so the *correct* genes scored *lower* (0.60) than the GA's best (0.69).

**Third attempt (fixed scale + chamfer):** The correct genes scored 1.0. The GA found a **perfect match in 20 generations** — about 6,000 evaluations out of 46 million possible genotypes (0.013% of the search space).

The genes it found: `[1, -3, 1, -1, 2, 2, 2, 3, 7]` — not the original `[-1, 3, -1, -1, 2, 2, 2, 3, 7]`. The first three genes are negated. This produces an identical phenotype because of bilateral symmetry — **genotypic degeneracy**, where multiple genotypes map to the same phenotype. A real biological parallel: codon degeneracy in DNA.

### Figure 6 — The Spitfire (Before Zoo Discovery)

We cropped the spitfire from a PDF scan and fed it to the GA:

- **Binary chamfer:** 0.065 — flat landscape, blurry scan vs crisp render
- **Grayscale NCC:** 0.795 — 12× improvement, consistent convergence across 4 runs to `[2, -2, 2, 0, 0, 0, -3, 3, 7]`

After discovering the Exhibition zoo, we found the actual Insect genotype: `[1, 1, -4, 1, -1, -2, 8, -4, 6]`. The GA's answer was in the right neighborhood but limited by the old [-3, 3] search range — it couldn't find gene values like 8 or -4 because they were outside its search space.

### After Zoo Discovery — No Search Needed

For many paper figures, binary archaeology made automated search unnecessary. The Exhibition zoo contains the actual biomorphs Dawkins curated — they're not approximations, they're the real thing. The 42 Exhibition specimens, 3 presets, and 3 named specimens collectively cover most of the paper's figures.

The remaining gap: Figure 15 (the biomorph alphabet). These letter-shaped biomorphs exist in a separate Alphabet zoo file that we're still parsing.

## What We Learned

1. **The gene range was the real problem.** We spent significant effort on sophisticated image-matching algorithms, only to discover that the fundamental issue was much simpler: our gene ranges were too narrow. The Insect needs gene 7 = 8; our range was [-3, 3]. No amount of clever searching can find values outside the search space. Check your assumptions before optimizing your algorithms.

2. **Source code archaeology beats reverse engineering.** The GA search was elegant and meta-circular, but parsing the actual binary files from Dawkins' original program gave us ground truth in minutes. When the original data exists, go find it. The WatchmakerSuite repository was a goldmine.

3. **Hidden scaling factors change everything.** The `trickle` variable isn't mentioned in the paper, doesn't appear in the published Pascal code, and only exists in the full program source. It transforms raw stored integers into effective gene values. Without understanding trickle, you can't interpret the binary data correctly. Documentation debt from 1988 is real.

4. **The fitness function is everything — and context-dependent.** IoU made the landscape flat. Chamfer distance worked for clean references but failed on scans. Grayscale NCC handled noise. The optimal scoring function depends on the data's noise characteristics. This mirrors a deep truth about evolution: the fitness landscape's shape matters more than the search algorithm.

5. **Genotypic degeneracy is real even in simple systems.** The GA found a correct phenotype via a different genotype — negated horizontal genes producing a mirror-identical biomorph. With 9 integer genes and bilateral symmetry, multiple genotypes map to identical phenotypes. This emerged naturally, without being designed in.

6. **The rendering pipeline IS the embryology.** A subtle preprocessing bug (90% rescaling) meant correct genes scored lower than incorrect ones. The scoring function and rendering pipeline together form the artificial embryology, and they must be perfectly aligned. This is analogous to studying an organism in the wrong environment.

7. **Selection really is powerful.** With correct scoring, the GA found a perfect match in 20 generations (~6,000 evaluations) out of 46 million possible genotypes. That's 0.013% of the search space. Dawkins' central argument — that cumulative selection can navigate vast possibility spaces — is demonstrated by the very tool we built to study his work.

8. **Reference quality sets the ceiling.** A blurry 170×160 crop from a 1988 paper scan doesn't contain enough information to uniquely identify a genotype. The GA confidently converges to a consistent answer — but that answer is "the best match to this blob," not necessarily the original genes. Higher-confidence results need either better references, the original binary data, or human-in-the-loop refinement.

9. **Dawkins' algorithm is remarkably compact.** The entire generative procedure is ~20 lines of code. Yet it produces enough morphological diversity that 42 curated specimens from one zoo fill six distinct figure portfolios, each with its own visual character. The evolution of evolvability is demonstrated by the program itself: each embryological innovation (segmentation, gradients, radial symmetry) opens vast new regions of morphospace from the same compact algorithm.

## Fidelity Summary

| Component | Status | Notes |
|-----------|--------|-------|
| `defineVectors` (PlugIn) | Exact match | Verified gene by gene against published Pascal |
| `drawTree` (Tree) | Exact match | Same binary recursion, direction accumulation |
| Gene ranges (g1–g8) | [-9, 9] | Covers >90% of Exhibition zoo; 5 exotic specimens exceed this |
| Depth range (g9) | [1, 8] | Matches original |
| Bilateral symmetry | Correct | Built into vector definitions, same as Dawkins' `PlugIn` |
| Segmentation | Correct | Repeat loop with segment count and spacing genes |
| Gradients | Simplified | 2 gradient genes vs Dawkins' per-gene gradients |
| Radial symmetry | Approximate | Reuses segment count as arm count; 4-way only (Dawkins also 4-way) |
| Trickle scaling | Not needed | Our genes are effective values (already divided by trickle) |

## Tools & Data

- `shared/genotype.js` — Shared genotype logic (MODE_CONFIGS, drawTree, defineVectors)
- `shared/gene-search.js` — GA + brute-force search with grayscale NCC scoring
- `shared/dawkins-zoo.json` — 42 Exhibition + 3 presets + 3 named specimens from original program
- `dawkins-paper/index.html` — Interactive annotated paper with verified genotypes in all figures

---

*This is supplemental material for [Biomorph Builder](https://biomorphbuilder.com), an interactive reimplementation of Dawkins' Blind Watchmaker system.*
