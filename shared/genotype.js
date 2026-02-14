/**
 * Shared genotype logic — pure functions, no global state.
 * Duplicated from biomorph.js for 3D use; consolidation comes later.
 */

export const MODE_CONFIGS = {
  1: {
    geneCount: 9,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth'],
  },
  2: {
    geneCount: 9,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth'],
  },
  3: {
    geneCount: 11,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1, 1, 2],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8, 8, 12],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist'],
  },
  4: {
    geneCount: 13,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1, 1, 2, -3, -3],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8, 8, 12, 3,  3],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist','grad1','grad2'],
  },
  5: {
    geneCount: 13,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1, 1, 2, -3, -3],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8, 8, 12, 3,  3],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist','grad1','grad2'],
  },
};

export const GENE_TOOLTIPS = {
  g1: 'Horizontal spread of inner branches (v3 & v5)',
  g2: 'Horizontal spread of middle branches (v2 & v6)',
  g3: 'Horizontal spread of outer branches (v1 & v7)',
  g4: 'Length of central upward stem (v4)',
  g5: 'Vertical reach of inner branches (v3 & v5)',
  g6: 'Vertical reach of middle branches (v2 & v6)',
  g7: 'Vertical reach of outer branches (v1 & v7)',
  g8: 'Length of trunk / downward stem (v8)',
  depth: 'Recursion depth — controls complexity',
  segs: 'Number of body segments',
  segDist: 'Spacing between segments',
  grad1: 'How inner branch spread changes across segments',
  grad2: 'How outer branch spread changes across segments',
};

const SYM_CODES = { 'left-right': 'lr', 'up-down': 'ud', 'four-way': 'fw', 'asymmetric': 'as' };
const SYM_DECODE = { lr: 'left-right', ud: 'up-down', fw: 'four-way', as: 'asymmetric' };

export function encodeState(state) {
  const { genes, mode, symmetry = 'left-right', alternatingAsym = false,
          radialSym = false, mutationIntensity = 1, generation = 0,
          colorEnabled = false, colorGenes } = state;

  const parts = [`m=${mode}`];
  parts.push(`g=${genes.join(',')}`);
  parts.push(`s=${SYM_CODES[symmetry] || 'lr'}`);
  if (alternatingAsym) parts.push('aa=1');
  if (radialSym) parts.push('rs=1');
  if (mutationIntensity !== 1) parts.push(`mi=${mutationIntensity}`);
  if (colorEnabled && colorGenes) parts.push(`ce=1&cg=${colorGenes.hue},${colorGenes.spread}`);
  parts.push(`gen=${generation}`);

  return '#' + parts.join('&');
}

export function decodeState(hash) {
  if (!hash || hash.length < 2) return null;
  const params = {};
  hash.slice(1).split('&').forEach(p => {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq)] = p.slice(eq + 1);
  });

  if (!params.m || !params.g) return null;

  const mode = parseInt(params.m);
  const genes = params.g.split(',').map(Number);

  const config = MODE_CONFIGS[mode];
  if (config && genes.length === config.geneCount) {
    for (let i = 0; i < genes.length; i++) {
      genes[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
    }
  }

  let colorEn = params.ce === '1';
  let cGenes = { hue: 7, spread: 3 };
  if (params.cg) {
    const parts2 = params.cg.split(',').map(Number);
    if (parts2.length === 2) cGenes = { hue: parts2[0], spread: parts2[1] };
  }

  return {
    mode,
    genes,
    symmetry: SYM_DECODE[params.s] || 'left-right',
    alternatingAsym: params.aa === '1',
    radialSym: params.rs === '1',
    mutationIntensity: parseInt(params.mi) || 1,
    generation: parseInt(params.gen) || 0,
    colorEnabled: colorEn,
    colorGenes: cGenes,
  };
}

export function defineVectors(genes) {
  const [g1, g2, g3, g4, g5, g6, g7, g8] = genes;
  return [
    null,
    [-g3,  g7],    // v1
    [-g2,  g6],    // v2
    [-g1,  g5],    // v3
    [  0,  g4],    // v4
    [ g1,  g5],    // v5
    [ g2,  g6],    // v6
    [ g3,  g7],    // v7
    [  0,  g8],    // v8
  ];
}

export function drawTree(genes) {
  const vectors = defineVectors(genes);
  const depth = genes[8];
  const lines = [];

  function recurse(i, c, x0, y0) {
    if (i === 0) i = 8;
    else if (i === 9) i = 1;
    const v = vectors[i];
    const x1 = x0 + c * v[0];
    const y1 = y0 + c * v[1];
    lines.push({ x0, y0, x1, y1, depth: c });
    if (c > 1) {
      recurse(i - 1, c - 1, x1, y1);
      recurse(i + 1, c - 1, x1, y1);
    }
  }

  recurse(4, depth, 0, 0);
  return lines;
}

function randomGene(i, config) {
  return config.geneMin[i] + Math.floor(Math.random() * (config.geneMax[i] - config.geneMin[i] + 1));
}

export function randomGenotype(mode) {
  const config = MODE_CONFIGS[mode] || MODE_CONFIGS[1];
  return Array.from({ length: config.geneCount }, (_, i) => randomGene(i, config));
}

export function originGenotype(mode) {
  const config = MODE_CONFIGS[mode] || MODE_CONFIGS[1];
  const genes = new Array(config.geneCount).fill(0);
  genes[8] = 1;
  if (config.geneCount > 9) genes[9] = 1;
  if (config.geneCount > 10) genes[10] = 4;
  return genes;
}

export function randomInteresting(mode) {
  const config = MODE_CONFIGS[mode] || MODE_CONFIGS[1];
  const genes = new Array(config.geneCount);

  genes[8] = 5 + Math.floor(Math.random() * 4);
  genes[8] = Math.min(genes[8], config.geneMax[8]);

  for (let i = 0; i < 8; i++) {
    genes[i] = randomGene(i, config);
  }

  let nonZero = 0;
  for (let i = 0; i < 8; i++) if (genes[i] !== 0) nonZero++;
  while (nonZero < 3) {
    const i = Math.floor(Math.random() * 8);
    if (genes[i] === 0) {
      genes[i] = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 2));
      genes[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
      nonZero++;
    }
  }

  if (config.geneCount > 9) genes[9] = 1 + Math.floor(Math.random() * 5);
  if (config.geneCount > 10) genes[10] = 3 + Math.floor(Math.random() * 8);
  if (config.geneCount > 11) genes[11] = randomGene(11, config);
  if (config.geneCount > 12) genes[12] = randomGene(12, config);

  for (let i = 0; i < config.geneCount; i++) {
    genes[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
  }

  return genes;
}

export function mutate(genes, mode, intensity = 1) {
  const config = MODE_CONFIGS[mode] || MODE_CONFIGS[1];
  const child = genes.slice();
  const i = Math.floor(Math.random() * config.geneCount);
  const delta = (1 + Math.floor(Math.random() * intensity)) * (Math.random() < 0.5 ? -1 : 1);
  child[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], child[i] + delta));
  return child;
}

export function cloneGenes(genes) {
  return genes.slice();
}

export function adaptGenes(genes, newMode) {
  const config = MODE_CONFIGS[newMode];
  if (genes.length === config.geneCount) return genes.slice();
  const adapted = new Array(config.geneCount);
  for (let i = 0; i < config.geneCount; i++) {
    if (i < genes.length) {
      adapted[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
    } else {
      if (i === 9) adapted[i] = 1;
      else if (i === 10) adapted[i] = 4;
      else adapted[i] = 0;
    }
  }
  return adapted;
}
