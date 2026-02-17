/**
 * Gene Search — find the genotype that best matches a reference image.
 *
 * Uses a genetic algorithm (yes, really) to evolve biomorphs toward a target
 * shape extracted from Dawkins' original paper figures. The meta-circularity
 * is intentional: we use artificial selection to reverse-engineer the products
 * of artificial selection.
 *
 * Usage:
 *   import { GeneSearch } from './gene-search.js';
 *   const search = new GeneSearch(targetCanvas, { mode: 1, populationSize: 200 });
 *   search.onProgress = (gen, best) => console.log(gen, best.score, best.genes);
 *   const result = await search.run();
 *
 * Search space (mode 1): 19^8 × 8 ≈ 136 billion with full [-9,9] range.
 * GA is the practical approach. Brute force requires narrowing via searchMin/searchMax.
 */

import { drawTree, MODE_CONFIGS, randomGenotype } from './genotype.js';

// ── Rendering ────────────────────────────────────────────────

let RENDER_SIZE = 80; // px — small enough for fast comparison
let RENDER_LINE_WIDTH = 1; // px — thicker lines help match blurry reference images

/**
 * Configure rendering parameters for the search.
 * Larger size + thicker lines = better matching against blurry PDF scans.
 */
export function configureRendering({ size, lineWidth } = {}) {
  if (size) RENDER_SIZE = size;
  if (lineWidth) RENDER_LINE_WIDTH = lineWidth;
}

/**
 * Render a genotype to a small bitmap, returning flat pixel data.
 * Uses Dawkins-faithful style: black lines, white bg, integer coords.
 */
function renderGenotype(genes, size = RENDER_SIZE) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // White background
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);

  const lines = drawTree(genes);
  if (lines.length === 0) return ctx.getImageData(0, 0, size, size);

  // Compute bounding box
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of lines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const pad = 4;
  const scale = Math.min((size - pad * 2) / bw, (size - pad * 2) / bh);
  const cx = size / 2;
  const cy = size / 2;
  const ox = (minX + maxX) / 2;
  const oy = (minY + maxY) / 2;

  ctx.strokeStyle = '#000';
  ctx.lineWidth = RENDER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const seg of lines) {
    const x0 = Math.round(cx + (seg.x0 - ox) * scale);
    const y0 = Math.round(cy + (seg.y0 - oy) * scale);
    const x1 = Math.round(cx + (seg.x1 - ox) * scale);
    const y1 = Math.round(cy + (seg.y1 - oy) * scale);
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

// ── Image comparison ─────────────────────────────────────────

/**
 * Threshold an ImageData to binary (black/white).
 * Returns a Uint8Array where 1 = black pixel, 0 = white.
 */
function toBinary(imageData, threshold = 128) {
  const { data, width, height } = imageData;
  const binary = new Uint8Array(width * height);
  for (let i = 0; i < binary.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const brightness = (r + g + b) / 3;
    binary[i] = brightness < threshold ? 1 : 0;
  }
  return binary;
}

/**
 * Compute a distance transform on a binary image.
 * For each pixel, stores the distance to the nearest black (1) pixel.
 * Uses a fast two-pass approximation (city-block / Manhattan).
 */
function distanceTransform(binary, width) {
  const height = binary.length / width;
  const dist = new Float32Array(binary.length);
  const INF = width + height;

  // Initialize: 0 for black pixels, INF for white
  for (let i = 0; i < binary.length; i++) {
    dist[i] = binary[i] ? 0 : INF;
  }

  // Forward pass (top-left to bottom-right)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (x > 0) dist[i] = Math.min(dist[i], dist[i - 1] + 1);
      if (y > 0) dist[i] = Math.min(dist[i], dist[i - width] + 1);
    }
  }

  // Backward pass (bottom-right to top-left)
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x;
      if (x < width - 1) dist[i] = Math.min(dist[i], dist[i + 1] + 1);
      if (y < height - 1) dist[i] = Math.min(dist[i], dist[i + width] + 1);
    }
  }

  return dist;
}

/**
 * Score similarity between two binary images using chamfer distance.
 * For each black pixel in A, looks up distance to nearest black pixel in B
 * (and vice versa). Lower average distance = better match.
 *
 * Returns 0..1 where 1 = perfect match.
 */
function scoreSimilarity(binaryA, binaryB) {
  const size = Math.round(Math.sqrt(binaryA.length));

  // Count black pixels
  let countA = 0, countB = 0;
  for (let i = 0; i < binaryA.length; i++) {
    if (binaryA[i]) countA++;
    if (binaryB[i]) countB++;
  }

  if (countA === 0 || countB === 0) return 0;

  // Distance transforms
  const distB = distanceTransform(binaryB, size);
  const distA = distanceTransform(binaryA, size);

  // Average distance from A's pixels to nearest B pixel
  let sumAtoB = 0;
  for (let i = 0; i < binaryA.length; i++) {
    if (binaryA[i]) sumAtoB += distB[i];
  }
  const avgAtoB = sumAtoB / countA;

  // Average distance from B's pixels to nearest A pixel
  let sumBtoA = 0;
  for (let i = 0; i < binaryB.length; i++) {
    if (binaryB[i]) sumBtoA += distA[i];
  }
  const avgBtoA = sumBtoA / countB;

  // Symmetric chamfer distance, normalized
  const chamfer = (avgAtoB + avgBtoA) / 2;

  // Convert to similarity score (0..1)
  // A chamfer of 0 = perfect match → score 1
  // Use exponential decay so small distances still score well
  const similarity = Math.exp(-chamfer * 0.5);

  // Penalize large differences in pixel count (wrong density)
  const densityRatio = Math.min(countA, countB) / Math.max(countA, countB);

  return similarity * (0.7 + 0.3 * densityRatio);
}

/**
 * Convert ImageData to a grayscale Float32Array (0=black, 1=white).
 */
function toGrayscale(imageData) {
  const { data } = imageData;
  const gray = new Float32Array(data.length / 4);
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / (3 * 255);
  }
  return gray;
}

/**
 * Apply a box blur to a grayscale image. Fast approximation of Gaussian blur.
 */
function boxBlur(gray, width, radius) {
  const height = gray.length / width;
  const out = new Float32Array(gray.length);
  const tmp = new Float32Array(gray.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx >= 0 && nx < width) { sum += gray[y * width + nx]; count++; }
      }
      tmp[y * width + x] = sum / count;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0, count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny >= 0 && ny < height) { sum += tmp[ny * width + x]; count++; }
      }
      out[y * width + x] = sum / count;
    }
  }

  return out;
}

/**
 * Score similarity using blurred grayscale correlation.
 * Both images are converted to grayscale, inverted (so dark=high),
 * blurred, then compared using normalized cross-correlation.
 * Much more tolerant of noise, blur, and thickness differences.
 *
 * Returns 0..1 where 1 = perfect match.
 */
function scoreGrayscale(grayA, grayB, width) {
  const blurRadius = Math.max(2, Math.round(width / 20));

  // Invert so dark pixels have high values (we want to match dark features)
  const invA = new Float32Array(grayA.length);
  const invB = new Float32Array(grayB.length);
  for (let i = 0; i < grayA.length; i++) {
    invA[i] = 1 - grayA[i];
    invB[i] = 1 - grayB[i];
  }

  // Blur both
  const blurA = boxBlur(invA, width, blurRadius);
  const blurB = boxBlur(invB, width, blurRadius);

  // Normalized cross-correlation
  let sumA = 0, sumB = 0;
  for (let i = 0; i < blurA.length; i++) { sumA += blurA[i]; sumB += blurB[i]; }
  const meanA = sumA / blurA.length;
  const meanB = sumB / blurB.length;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < blurA.length; i++) {
    const da = blurA[i] - meanA;
    const db = blurB[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  if (den === 0) return 0;

  // NCC ranges from -1 to 1; clamp and shift to 0..1
  const ncc = num / den;
  return Math.max(0, (ncc + 1) / 2);
}

// ── Prepare reference image ──────────────────────────────────

/**
 * Prepare a reference image for comparison.
 * Accepts a canvas/image element, scales to RENDER_SIZE, thresholds to binary.
 * @param {HTMLCanvasElement} sourceCanvas
 * @param {number} [size] - target size (default: RENDER_SIZE)
 * @param {object} [options]
 * @param {number} [options.threshold=128] - brightness threshold (higher = more black pixels, good for blurry scans)
 * @param {boolean} [options.enhanceContrast=false] - stretch histogram before thresholding
 */
export function prepareReference(sourceCanvas, size = RENDER_SIZE, options = {}) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);

  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  if (sw === size && sh === size) {
    // Source is already the right size — copy directly, no rescaling
    ctx.drawImage(sourceCanvas, 0, 0);
  } else {
    // Scale source to fit, preserving aspect ratio
    // Use same padding as renderGenotype (pad=4) for consistency
    const pad = 4;
    const scale = Math.min((size - pad * 2) / sw, (size - pad * 2) / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(sourceCanvas, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }

  let imageData = ctx.getImageData(0, 0, size, size);

  // Optional contrast enhancement for blurry PDF scans
  if (options.enhanceContrast) {
    const data = imageData.data;
    let min = 255, max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (b < 250) { min = Math.min(min, b); max = Math.max(max, b); }
    }
    if (max > min) {
      for (let i = 0; i < data.length; i += 4) {
        const b = (data[i] + data[i + 1] + data[i + 2]) / 3;
        const stretched = b >= 250 ? 255 : Math.max(0, Math.min(255, Math.round((b - min) / (max - min) * 255)));
        data[i] = data[i + 1] = data[i + 2] = stretched;
      }
    }
  }

  const threshold = options.threshold || 128;
  return toBinary(imageData, threshold);
}

/**
 * Prepare a grayscale reference for blur+correlation scoring.
 * Better for blurry PDF scans where binary thresholding fails.
 */
export function prepareGrayscaleReference(sourceCanvas, size = RENDER_SIZE) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);

  const sw = sourceCanvas.width;
  const sh = sourceCanvas.height;

  if (sw === size && sh === size) {
    ctx.drawImage(sourceCanvas, 0, 0);
  } else {
    const pad = 4;
    const scale = Math.min((size - pad * 2) / sw, (size - pad * 2) / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(sourceCanvas, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }

  return toGrayscale(ctx.getImageData(0, 0, size, size));
}

// ── Genetic Algorithm ────────────────────────────────────────

/**
 * Create a random individual for the GA population.
 */
function randomIndividual(mode) {
  const genes = randomGenotype(mode);
  return { genes, score: 0 };
}

/**
 * Crossover two parents to produce a child.
 * Single-point crossover on the gene array.
 */
function crossover(parentA, parentB) {
  const len = parentA.genes.length;
  const point = 1 + Math.floor(Math.random() * (len - 1));
  const childGenes = [
    ...parentA.genes.slice(0, point),
    ...parentB.genes.slice(point),
  ];
  return { genes: childGenes, score: 0 };
}

/**
 * Mutate an individual — change 1-3 genes by ±1 or ±2.
 */
function mutateIndividual(individual, mode, strong = false) {
  const config = MODE_CONFIGS[mode];
  const genes = individual.genes.slice();
  const mutations = strong ? (1 + Math.floor(Math.random() * 3)) : 1;
  for (let m = 0; m < mutations; m++) {
    const i = Math.floor(Math.random() * config.geneCount);
    const maxDelta = strong ? 2 : 1;
    const delta = (1 + Math.floor(Math.random() * maxDelta)) * (Math.random() < 0.5 ? -1 : 1);
    genes[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i] + delta));
  }
  return { genes, score: 0 };
}

/**
 * Tournament selection — pick the best of k random individuals.
 */
function tournamentSelect(population, k = 3) {
  let best = null;
  for (let i = 0; i < k; i++) {
    const candidate = population[Math.floor(Math.random() * population.length)];
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best;
}

// ── Main search class ────────────────────────────────────────

export class GeneSearch {
  /**
   * @param {Uint8Array|Float32Array} reference - binary from prepareReference() or grayscale from prepareGrayscaleReference()
   * @param {object} options
   * @param {number} options.mode - Dawkins mode (1-5)
   * @param {string} [options.scoring='chamfer'] - 'chamfer' (binary) or 'grayscale' (blur+correlation)
   * @param {number} [options.populationSize=300]
   * @param {number} [options.generations=500]
   * @param {number} [options.mutationRate=0.5]
   * @param {number} [options.eliteCount=5]
   */
  constructor(reference, options = {}) {
    this.reference = reference;
    this.scoring = options.scoring || 'chamfer';
    this.mode = options.mode || 1;
    this.populationSize = options.populationSize || 300;
    this.generations = options.generations || 500;
    this.mutationRate = options.mutationRate || 0.5;
    this.eliteCount = options.eliteCount || 5;
    this.immigrantRate = options.immigrantRate || 0.1;
    this.onProgress = null;
    this.bestEver = null;
  }

  /**
   * Score a single individual against the reference.
   */
  evaluate(individual) {
    const rendered = renderGenotype(individual.genes);
    if (this.scoring === 'grayscale') {
      const gray = toGrayscale(rendered);
      const size = Math.round(Math.sqrt(gray.length));
      individual.score = scoreGrayscale(this.reference, gray, size);
    } else {
      const binary = toBinary(rendered);
      individual.score = scoreSimilarity(this.reference, binary);
    }
    return individual.score;
  }

  /**
   * Run the GA. Returns the best individual found.
   * Uses setTimeout yielding to keep the browser responsive.
   */
  async run() {
    // Initialize population
    let population = [];
    for (let i = 0; i < this.populationSize; i++) {
      const ind = randomIndividual(this.mode);
      this.evaluate(ind);
      population.push(ind);
    }

    population.sort((a, b) => b.score - a.score);
    this.bestEver = { ...population[0], genes: population[0].genes.slice() };

    let stagnantGens = 0;
    let lastBestScore = 0;

    for (let gen = 0; gen < this.generations; gen++) {
      const newPop = [];

      // Detect stagnation
      const isStagnant = stagnantGens > 20;

      // Elitism — carry forward top individuals unchanged
      for (let i = 0; i < this.eliteCount; i++) {
        newPop.push({ genes: population[i].genes.slice(), score: population[i].score });
      }

      // Inject random immigrants to maintain diversity
      const immigrantCount = Math.floor(this.populationSize * (isStagnant ? 0.3 : this.immigrantRate));
      for (let i = 0; i < immigrantCount; i++) {
        const ind = randomIndividual(this.mode);
        this.evaluate(ind);
        newPop.push(ind);
      }

      // Also inject mutations of the best-ever individual (local search)
      for (let i = 0; i < 5; i++) {
        const neighbor = mutateIndividual(this.bestEver, this.mode, true);
        this.evaluate(neighbor);
        newPop.push(neighbor);
      }

      // Fill rest with offspring
      while (newPop.length < this.populationSize) {
        const parentA = tournamentSelect(population);
        const parentB = tournamentSelect(population);
        let child = crossover(parentA, parentB);

        if (Math.random() < this.mutationRate) {
          child = mutateIndividual(child, this.mode, isStagnant);
        }

        this.evaluate(child);
        newPop.push(child);
      }

      population = newPop;
      population.sort((a, b) => b.score - a.score);

      if (population[0].score > this.bestEver.score) {
        this.bestEver = { ...population[0], genes: population[0].genes.slice() };
        stagnantGens = 0;
      } else {
        stagnantGens++;
      }
      lastBestScore = this.bestEver.score;

      if (this.onProgress) {
        this.onProgress(gen, this.bestEver, population);
      }

      // Yield to browser every 10 generations
      if (gen % 10 === 0) {
        await new Promise(r => setTimeout(r, 0));
      }
    }

    return {
      genes: this.bestEver.genes,
      score: this.bestEver.score,
      mode: this.mode,
    };
  }
}

// ── Brute-force search (mode 1 only) ────────────────────────

/**
 * Exhaustive search over all mode 1 genotypes.
 * Reports progress via callback. Returns top N matches.
 *
 * With gene range [-9,9] (19 values per gene), full search = 19^8 × 8 ≈ 136B
 * combinations — infeasible. Use `searchMin`/`searchMax` to constrain the range,
 * or use the GA instead. With [-3,3] (original): ~46M, feasible in ~15 min.
 *
 * For when you want certainty, not heuristics.
 */
export async function bruteForceMode1(referenceBinary, options = {}) {
  const topN = options.topN || 10;
  const onProgress = options.onProgress || null;
  const config = MODE_CONFIGS[1];

  // Allow narrowing search range (defaults to full MODE_CONFIGS range)
  const searchMin = options.searchMin || config.geneMin;
  const searchMax = options.searchMax || config.geneMax;

  const best = []; // sorted by score descending
  let checked = 0;
  let total = 1;
  for (let i = 0; i < 8; i++) total *= (searchMax[i] - searchMin[i] + 1);
  total *= (searchMax[8] - searchMin[8] + 1);

  for (let depth = searchMin[8]; depth <= searchMax[8]; depth++) {
    const genes = new Array(9);
    genes[8] = depth;

    function* geneIterator(idx) {
      if (idx === 8) {
        yield genes.slice();
        return;
      }
      for (let v = searchMin[idx]; v <= searchMax[idx]; v++) {
        genes[idx] = v;
        yield* geneIterator(idx + 1);
      }
    }

    let batchCount = 0;
    for (const candidate of geneIterator(0)) {
      const rendered = renderGenotype(candidate);
      const binary = toBinary(rendered);
      const score = scoreSimilarity(referenceBinary, binary);

      if (best.length < topN || score > best[best.length - 1].score) {
        best.push({ genes: candidate, score });
        best.sort((a, b) => b.score - a.score);
        if (best.length > topN) best.pop();
      }

      checked++;
      batchCount++;

      // Yield every 50,000 iterations
      if (batchCount >= 50000) {
        batchCount = 0;
        if (onProgress) onProgress(checked, total, best[0]);
        await new Promise(r => setTimeout(r, 0));
      }
    }
  }

  if (onProgress) onProgress(checked, total, best[0]);
  return best;
}
