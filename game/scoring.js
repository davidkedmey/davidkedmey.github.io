// Heuristic scoring functions for rating biomorphs
// Used by NPCs for garden curation

import { defineVectors, drawTree } from '../shared/genotype.js';

/**
 * Symmetry score — how mirror-symmetric are the gene pairs?
 * Compares g1/g7, g2/g6, g3/g5. Perfect mirrors score 1.0.
 * @param {number[]} genes
 * @returns {number} 0–1
 */
export function symmetryScore(genes) {
  const pairs = [[0, 6], [1, 5], [2, 4]]; // g1/g7, g2/g6, g3/g5
  let totalDiff = 0;
  const maxDiff = 6; // each gene ranges -3..3, max absolute diff between pair = 6
  for (const [a, b] of pairs) {
    // Perfect symmetry means g1 == -g7 (they mirror horizontally)
    // But in defineVectors, v1 = [-g3, g7] and v7 = [g3, g7]
    // So symmetric forms have g1==g7, g2==g6, g3==g5 (same magnitude)
    totalDiff += Math.abs(Math.abs(genes[a]) - Math.abs(genes[b]));
  }
  return 1 - totalDiff / (pairs.length * maxDiff);
}

/**
 * Complexity score — count line segments from drawTree, normalize by depth.
 * More segments at a given depth = more complex form.
 * @param {number[]} genes
 * @returns {number} 0–1
 */
export function complexityScore(genes) {
  const lines = drawTree(genes);
  const depth = genes[8];
  // Maximum possible segments for a given depth: 2^depth - 1 (binary tree)
  // But the recursive structure creates at most 2^depth leaf branches
  // Theoretical max at depth d: sum of 2^i for i=0..d-1 = 2^d - 1
  const maxSegments = Math.pow(2, depth + 1) - 1;
  if (maxSegments <= 0) return 0;
  // Normalize: real count / theoretical max, clamped to [0,1]
  return Math.min(1, lines.length / maxSegments);
}

/**
 * Novelty score — Manhattan distance from nearest reference specimen.
 * Higher distance = more novel.
 * @param {number[]} genes
 * @param {number[][]} referenceSet — array of gene arrays
 * @returns {number} 0–1
 */
export function noveltyScore(genes, referenceSet) {
  if (!referenceSet || referenceSet.length === 0) return 1;
  const geneCount = Math.min(genes.length, 9); // compare first 9 genes
  const maxDist = geneCount * 6; // each gene can differ by up to 6 (-3 to 3)

  let minDist = Infinity;
  for (const ref of referenceSet) {
    let dist = 0;
    for (let i = 0; i < geneCount; i++) {
      dist += Math.abs(genes[i] - (ref[i] || 0));
    }
    if (dist < minDist) minDist = dist;
  }
  return Math.min(1, minDist / maxDist);
}

/**
 * Balance score — how square is the bounding box? Square = balanced.
 * @param {number[]} genes
 * @returns {number} 0–1
 */
export function balanceScore(genes) {
  const lines = drawTree(genes);
  if (lines.length === 0) return 0;

  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const l of lines) {
    minX = Math.min(minX, l.x0, l.x1);
    maxX = Math.max(maxX, l.x0, l.x1);
    minY = Math.min(minY, l.y0, l.y1);
    maxY = Math.max(maxY, l.y0, l.y1);
  }

  const w = maxX - minX;
  const h = maxY - minY;
  if (w === 0 && h === 0) return 1;
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  return maxDim > 0 ? minDim / maxDim : 1;
}

/**
 * Composite curation score — weighted blend based on NPC personality.
 * @param {number[]} genes
 * @param {number[][]} referenceSet
 * @param {'fern'|'moss'} personality
 * @returns {number} 0–1
 */
export function curateScore(genes, referenceSet, personality) {
  const sym = symmetryScore(genes);
  const comp = complexityScore(genes);
  const nov = noveltyScore(genes, referenceSet);
  const bal = balanceScore(genes);

  // Fern weights symmetry + balance; Moss weights novelty + complexity
  if (personality === 'fern') {
    return sym * 0.35 + bal * 0.30 + comp * 0.20 + nov * 0.15;
  }
  // moss
  return nov * 0.35 + comp * 0.30 + sym * 0.15 + bal * 0.20;
}
