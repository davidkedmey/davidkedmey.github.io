// Auto-name generator: deterministic trait-based names from genes

const ADJECTIVES = {
  highSymmetry: ['Balanced', 'Mirrored', 'Symmetric'],
  lowSymmetry:  ['Twisted', 'Lopsided', 'Crooked'],
  highComplexity: ['Dense', 'Intricate', 'Elaborate'],
  stout: ['Stout', 'Sturdy'],
  spindly: ['Spindly', 'Lanky'],
  tiny: ['Little', 'Tiny'],
  grand: ['Ancient', 'Grand'],
  warm: ['Crimson', 'Golden', 'Amber'],
  cool: ['Azure', 'Jade', 'Violet'],
  neutral: ['Pale', 'Dusky', 'Ashen'],
};

const NOUNS_BY_MODE = {
  1: ['Fern', 'Branch', 'Twig', 'Sapling', 'Bough'],
  2: ['Shrub', 'Bush', 'Thicket', 'Hedge'],
  3: ['Caterpillar', 'Spine', 'Centipede', 'Worm', 'Crawler'],
  4: ['Cascade', 'Coral', 'Fan', 'Crest'],
  5: ['Plume', 'Spiral', 'Tendril', 'Bloom'],
};

const FALLBACK_NOUNS = ['Form', 'Shape', 'Creature', 'Being'];

// Compute a simple symmetry score from direction genes (g1-g8)
function symmetryScore(genes) {
  // Genes 0-7 are direction vectors. Perfect mirror symmetry means
  // opposing pairs sum to zero: g1+g7, g2+g6, g3+g5 (g4 is center, g8 is trunk)
  const pairs = [[0,6], [1,5], [2,4]]; // g1/g7, g2/g6, g3/g5
  let score = 0;
  for (const [a, b] of pairs) {
    const diff = Math.abs(genes[a] + genes[b]);
    score += (3 - Math.min(diff, 3)) / 3; // 1 when perfectly symmetric, 0 when max diff
  }
  return score / pairs.length; // 0-1
}

// Compute complexity: how many genes are non-zero, weighted by depth
function complexityScore(genes) {
  let nonZero = 0;
  for (let i = 0; i < 8; i++) {
    if (genes[i] !== 0) nonZero++;
  }
  const geneComplexity = nonZero / 8;
  const depthFactor = (genes[8] - 1) / 7; // depth 1-8 mapped to 0-1
  return geneComplexity * 0.4 + depthFactor * 0.6;
}

// Balance: ratio of horizontal to vertical gene magnitudes
function balanceScore(genes) {
  const hMag = Math.abs(genes[0]) + Math.abs(genes[1]) + Math.abs(genes[2]);
  const vMag = Math.abs(genes[4]) + Math.abs(genes[5]) + Math.abs(genes[6]);
  const total = hMag + vMag;
  if (total === 0) return 0.5;
  return Math.min(hMag, vMag) / total; // 0-0.5, higher = more balanced
}

// Deterministic hash from genes to pick from arrays
function geneHash(genes, mode) {
  let h = mode * 31;
  for (let i = 0; i < genes.length; i++) {
    h = ((h << 5) - h + genes[i] + 128) | 0;
  }
  return Math.abs(h);
}

function pick(arr, hash) {
  return arr[hash % arr.length];
}

export function generateName(genes, mode, colorGenes) {
  const hash = geneHash(genes, mode);
  const depth = genes[8];
  const sym = symmetryScore(genes);
  const cmplx = complexityScore(genes);
  const bal = balanceScore(genes);

  // Pick adjective based on dominant trait
  let adjPool;
  if (depth <= 2) {
    adjPool = ADJECTIVES.tiny;
  } else if (depth >= 7) {
    adjPool = ADJECTIVES.grand;
  } else if (sym > 0.8) {
    adjPool = ADJECTIVES.highSymmetry;
  } else if (sym < 0.3) {
    adjPool = ADJECTIVES.lowSymmetry;
  } else if (cmplx > 0.7) {
    adjPool = ADJECTIVES.highComplexity;
  } else if (bal > 0.4) {
    adjPool = ADJECTIVES.stout;
  } else if (bal < 0.15) {
    adjPool = ADJECTIVES.spindly;
  } else if (colorGenes) {
    // Use color-based adjective as fallback
    const hue = colorGenes.hue;
    if (hue <= 2 || hue >= 10) adjPool = ADJECTIVES.warm;
    else if (hue >= 4 && hue <= 7) adjPool = ADJECTIVES.cool;
    else adjPool = ADJECTIVES.neutral;
  } else {
    adjPool = ADJECTIVES.neutral;
  }

  const adj = pick(adjPool, hash);
  const nouns = NOUNS_BY_MODE[mode] || FALLBACK_NOUNS;
  const noun = pick(nouns, hash >> 3);

  return `${adj} ${noun}`;
}
