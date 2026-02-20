/**
 * Dawkins' Biomorphs — Mode-aware engine
 * Modes 1-5: progressive embryologies from "The Evolution of Evolvability" (1988)
 */

// ── Mode configurations ──────────────────────────────────────

const MODE_CONFIGS = {
  1: { // Basic biomorphs — 9 genes, bilateral symmetry
    geneCount: 9,
    geneMin: [-9, -9, -9, -9, -9, -9, -9, -9, 1],
    geneMax: [ 9,  9,  9,  9,  9,  9,  9,  9, 8],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth'],
  },
  2: { // + Symmetry options — same 9 genes, symmetry applied post-render
    geneCount: 9,
    geneMin: [-9, -9, -9, -9, -9, -9, -9, -9, 1],
    geneMax: [ 9,  9,  9,  9,  9,  9,  9,  9, 8],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth'],
  },
  3: { // + Segmentation — 11 genes
    geneCount: 11,
    geneMin: [-9, -9, -9, -9, -9, -9, -9, -9, 1, 1, 2],
    geneMax: [ 9,  9,  9,  9,  9,  9,  9,  9, 8, 8, 12],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist'],
  },
  4: { // + Gradients — 13 genes
    geneCount: 13,
    geneMin: [-9, -9, -9, -9, -9, -9, -9, -9, 1, 1, 2, -9, -9],
    geneMax: [ 9,  9,  9,  9,  9,  9,  9,  9, 8, 8, 12, 9,  9],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist','grad1','grad2'],
  },
  5: { // Full Dawkins — 13 base genes + toggles via UI
    geneCount: 13,
    geneMin: [-9, -9, -9, -9, -9, -9, -9, -9, 1, 1, 2, -9, -9],
    geneMax: [ 9,  9,  9,  9,  9,  9,  9,  9, 8, 8, 12, 9,  9],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist','grad1','grad2'],
  },
  6: { // Buds/Hox — 36 genes: trunk + segments + gradients + bud A + bud B + meta
    geneCount: 36,
    geneMin: [
      -9, -9, -9, -9, -9, -9, -9, -9, 1,    // trunk g1-g8, depth
       1,  2, -9, -9,                          // segs, segDist, grad1, grad2
      -9, -9, -9, -9, -9, -9, -9, -9, 1,     // bud A: ag1-ag8, aDepth
      -9, -9, -9, -9, -9, -9, -9, -9, 1,     // bud B: bg1-bg8, bDepth
       0,  1,  0,  1, -9,                      // budTrigger, budScale, budSwitch, budDensity, budGrad
    ],
    geneMax: [
       9,  9,  9,  9,  9,  9,  9,  9, 8,     // trunk
       8, 12,  9,  9,                          // segs, segDist, grad1, grad2
       9,  9,  9,  9,  9,  9,  9,  9, 8,     // bud A
       9,  9,  9,  9,  9,  9,  9,  9, 8,     // bud B
       8,  8,  6,  8,  9,                      // budTrigger, budScale, budSwitch, budDensity, budGrad
    ],
    geneLabels: [
      'g1','g2','g3','g4','g5','g6','g7','g8','depth',
      'segs','segDist','grad1','grad2',
      'ag1','ag2','ag3','ag4','ag5','ag6','ag7','ag8','aDepth',
      'bg1','bg2','bg3','bg4','bg5','bg6','bg7','bg8','bDepth',
      'budTrigger','budScale','budSwitch','budDensity','budGrad',
    ],
  },
};

const NUM_OFFSPRING = 8;

const MODE_NAMES = {
  0: 'Peppering',
  1: 'Basic',
  2: 'Symmetry',
  3: 'Segments',
  4: 'Gradients',
  5: 'Full',
  6: 'Buds',
};

// ── Current state ────────────────────────────────────────────

let currentMode = 1;
let symmetryType = 'left-right';
let alternatingAsymmetry = false;
let radialSymmetry = false;
let mutationIntensity = 1; // F5: 1=Gentle, 2=Moderate, 3=Wild
let colorMode = 'depth'; // 'none', 'depth', 'angle'
let colorGenes = { hue: 7, spread: 3 }; // hue: 0-11 (30° steps), spread: -6 to 6

// ── Gene tooltips (F6) ──────────────────────────────────────

const GENE_TOOLTIPS = {
  g1: 'Horizontal spread of inner branches (v3 & v5)',
  g2: 'Horizontal spread of middle branches (v2 & v6)',
  g3: 'Horizontal spread of outer branches (v1 & v7)',
  g4: 'Length of central upward stem (v4)',
  g5: 'Vertical reach of inner branches (v3 & v5)',
  g6: 'Vertical reach of middle branches (v2 & v6)',
  g7: 'Vertical reach of outer branches (v1 & v7)',
  g8: 'Length of trunk / downward stem (v8)',
  depth: 'Recursion depth \u2014 controls complexity',
  segs: 'Number of body segments',
  segDist: 'Spacing between segments',
  grad1: 'How inner branch spread changes across segments',
  grad2: 'How outer branch spread changes across segments',
  ag1: 'Bud A: horizontal spread of inner branches',
  ag2: 'Bud A: horizontal spread of middle branches',
  ag3: 'Bud A: horizontal spread of outer branches',
  ag4: 'Bud A: length of central upward stem',
  ag5: 'Bud A: vertical reach of inner branches',
  ag6: 'Bud A: vertical reach of middle branches',
  ag7: 'Bud A: vertical reach of outer branches',
  ag8: 'Bud A: length of trunk / downward stem',
  aDepth: 'Bud A: recursion depth — controls bud complexity',
  bg1: 'Bud B: horizontal spread of inner branches',
  bg2: 'Bud B: horizontal spread of middle branches',
  bg3: 'Bud B: horizontal spread of outer branches',
  bg4: 'Bud B: length of central upward stem',
  bg5: 'Bud B: vertical reach of inner branches',
  bg6: 'Bud B: vertical reach of middle branches',
  bg7: 'Bud B: vertical reach of outer branches',
  bg8: 'Bud B: length of trunk / downward stem',
  bDepth: 'Bud B: recursion depth — controls bud complexity',
  budTrigger: 'Depth at which trunk branches switch to buds (0 = buds off)',
  budScale: 'Size of bud growths (1-8, where 8 = full size)',
  budSwitch: 'Segment boundary between Bud A and Bud B (Hox boundary)',
  budDensity: 'Fraction of branch-tips that sprout buds (1-8)',
  budGrad: 'Sonic Hedgehog gradient — bud scale varies left-to-right',
};

// ── URL hash encoding (F3) ──────────────────────────────────

const SYM_CODES = { 'left-right': 'lr', 'up-down': 'ud', 'four-way': 'fw', 'asymmetric': 'as' };
const SYM_DECODE = { lr: 'left-right', ud: 'up-down', fw: 'four-way', as: 'asymmetric' };

function encodeStateFor(genes, mode, sym, altAsym, radSym, mi, gen, cm, cGenes) {
  const parts = [`m=${mode}`];

  if (mode === 0) {
    let hex = '';
    for (let i = 0; i < genes.length; i += 4) {
      let nibble = 0;
      for (let j = 0; j < 4 && i + j < genes.length; j++) {
        if (genes[i + j]) nibble |= (1 << j);
      }
      hex += nibble.toString(16);
    }
    parts.push(`g=${hex}`);
  } else {
    parts.push(`g=${genes.join(',')}`);
    parts.push(`s=${SYM_CODES[sym] || 'lr'}`);
    if (altAsym) parts.push('aa=1');
    if (radSym) parts.push('rs=1');
  }

  if (mi !== 1) parts.push(`mi=${mi}`);
  if (cm && cm !== 'none') parts.push(`cm=${cm}`);
  if (cm === 'depth' && cGenes) parts.push(`cg=${cGenes.hue},${cGenes.spread}`);
  parts.push(`gen=${gen}`);

  return '#' + parts.join('&');
}

function encodeState() {
  return encodeStateFor(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, mutationIntensity, generation, colorMode, colorGenes);
}

function decodeState(hash) {
  if (!hash || hash.length < 2) return null;
  const params = {};
  hash.slice(1).split('&').forEach(p => {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq)] = p.slice(eq + 1);
  });

  if (!params.m || !params.g) return null;

  const mode = parseInt(params.m);
  let genes;

  if (mode === 0) {
    const hex = params.g;
    genes = new Uint8Array(GRID_SIZE * GRID_SIZE);
    for (let i = 0; i < hex.length; i++) {
      const nibble = parseInt(hex[i], 16);
      for (let j = 0; j < 4 && i * 4 + j < genes.length; j++) {
        genes[i * 4 + j] = (nibble >> j) & 1;
      }
    }
  } else {
    genes = params.g.split(',').map(Number);
    // Validate against mode config
    const config = MODE_CONFIGS[mode];
    if (config && genes.length === config.geneCount) {
      for (let i = 0; i < genes.length; i++) {
        genes[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
      }
    }
  }

  // Color mode: new cm= param, backward compat with old ce=1
  let cm = params.cm || 'none';
  if (!params.cm && params.ce === '1') cm = 'depth';
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
    colorMode: cm,
    colorGenes: cGenes,
  };
}

function updateHash() {
  window.history.replaceState(null, '', encodeState());
}

// ── Genotype helpers ─────────────────────────────────────────

function getConfig() {
  return MODE_CONFIGS[currentMode] || MODE_CONFIGS[1];
}

function randomGene(i, config) {
  return config.geneMin[i] + Math.floor(Math.random() * (config.geneMax[i] - config.geneMin[i] + 1));
}

function randomGenotype() {
  const config = getConfig();
  return Array.from({ length: config.geneCount }, (_, i) => randomGene(i, config));
}

function originGenotype() {
  const config = getConfig();
  const genes = new Array(config.geneCount).fill(0);
  genes[8] = 1; // depth
  if (config.geneCount > 9) genes[9] = 1;  // segCount
  if (config.geneCount > 10) genes[10] = 4; // segDist
  if (config.geneCount >= 36) {
    genes[21] = 1;  // aDepth
    genes[30] = 1;  // bDepth
    genes[32] = 4;  // budScale mid
    genes[33] = 1;  // budSwitch
    genes[34] = 8;  // budDensity full
  }
  return genes;
}

function cloneGenes(genes) {
  return genes.slice();
}

function mutate(genes) {
  const config = getConfig();
  const child = cloneGenes(genes);
  // Mode 6 has 36 genes — single-gene mutation is ~3%, too slow.
  // Mutate intensity+1 genes to maintain ~6-8% proportional pressure.
  const numMutations = currentMode >= 6 ? mutationIntensity + 1 : 1;
  for (let m = 0; m < numMutations; m++) {
    const i = Math.floor(Math.random() * config.geneCount);
    // F5: mutation intensity controls max step size
    const maxDelta = mutationIntensity;
    const delta = (1 + Math.floor(Math.random() * maxDelta)) * (Math.random() < 0.5 ? -1 : 1);
    child[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], child[i] + delta));
  }
  return child;
}

// ── Color gene helpers ───────────────────────────────────────

function depthToColor(depth, maxDepth, hue, spread) {
  const t = maxDepth > 1 ? (maxDepth - depth) / (maxDepth - 1) : 0; // 0 at trunk, 1 at tips
  const h = ((hue * 30) + spread * 30 * t + 360) % 360;
  const s = 70 + t * 20; // saturation 70-90%
  const l = 55 + t * 15; // lightness 55-70%
  return `hsl(${h}, ${s}%, ${l}%)`;
}

function mutateColor(cGenes) {
  const child = { hue: cGenes.hue, spread: cGenes.spread };
  if (Math.random() < 0.5) {
    child.hue = ((child.hue + (Math.random() < 0.5 ? 1 : -1)) % 12 + 12) % 12;
  } else {
    child.spread = Math.max(-6, Math.min(6, child.spread + (Math.random() < 0.5 ? 1 : -1)));
  }
  return child;
}

function crossoverColor(cGenes1, cGenes2) {
  return {
    hue: Math.random() < 0.5 ? cGenes1.hue : cGenes2.hue,
    spread: Math.random() < 0.5 ? cGenes1.spread : cGenes2.spread,
  };
}

/**
 * Adapt genes when switching modes: extend or trim to fit new gene count.
 */
function adaptGenes(genes, newMode) {
  const config = MODE_CONFIGS[newMode];
  if (genes.length === config.geneCount) return genes.slice();
  const adapted = new Array(config.geneCount);
  for (let i = 0; i < config.geneCount; i++) {
    if (i < genes.length) {
      adapted[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
    } else {
      // Sensible defaults for new genes
      if (i === 9) adapted[i] = 1;       // segCount
      else if (i === 10) adapted[i] = 4; // segDist
      else if (i >= 13 && i <= 20) {
        // Bud A direction genes: copy from trunk (buds start identical to trunk)
        adapted[i] = genes[i - 13];
      }
      else if (i === 21) adapted[i] = Math.max(1, genes[8] || 1); // aDepth = trunk depth
      else if (i >= 22 && i <= 29) {
        // Bud B direction genes: copy from trunk
        adapted[i] = genes[i - 22];
      }
      else if (i === 30) adapted[i] = Math.max(1, genes[8] || 1); // bDepth = trunk depth
      else if (i === 31) adapted[i] = 0;  // budTrigger off — user breeds into buds
      else if (i === 32) adapted[i] = 4;  // budScale mid
      else if (i === 33) adapted[i] = 1;  // budSwitch
      else if (i === 34) adapted[i] = 8;  // budDensity max
      else if (i === 35) adapted[i] = 0;  // budGrad neutral
      else adapted[i] = 0; // gradients start at 0
    }
  }
  return adapted;
}

// ── Quick start: Random Interesting (F4) ────────────────────

function randomInteresting() {
  const config = getConfig();
  const genes = new Array(config.geneCount);

  // Depth 5+ for visual complexity
  genes[8] = 5 + Math.floor(Math.random() * 4);
  genes[8] = Math.min(genes[8], config.geneMax[8]);

  // Random vector genes
  for (let i = 0; i < 8; i++) {
    genes[i] = config.geneMin[i] + Math.floor(Math.random() * (config.geneMax[i] - config.geneMin[i] + 1));
  }

  // Ensure at least 3 non-zero vector genes for visual interest
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

  // Segmentation genes
  if (config.geneCount > 9) genes[9] = 1 + Math.floor(Math.random() * 5);
  if (config.geneCount > 10) genes[10] = 3 + Math.floor(Math.random() * 8);
  if (config.geneCount > 11) genes[11] = randomGene(11, config);
  if (config.geneCount > 12) genes[12] = randomGene(12, config);

  // Mode 6: bud genes and meta genes
  if (config.geneCount >= 36) {
    // Bud A direction genes (13-20): own random shape
    genes[21] = 2 + Math.floor(Math.random() * 3); // aDepth 2-4
    for (let i = 13; i < 21; i++) {
      genes[i] = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 5));
      genes[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
    }
    // Zero out 2 for variety
    for (let z = 0; z < 2; z++) genes[13 + Math.floor(Math.random() * 8)] = 0;

    // Bud B direction genes (22-29): own random shape
    genes[30] = 2 + Math.floor(Math.random() * 3); // bDepth 2-4
    for (let i = 22; i < 30; i++) {
      genes[i] = (Math.random() < 0.5 ? -1 : 1) * (1 + Math.floor(Math.random() * 5));
      genes[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
    }
    for (let z = 0; z < 2; z++) genes[22 + Math.floor(Math.random() * 8)] = 0;

    // Meta genes
    const maxTrigger = Math.max(2, genes[8] - 1);
    genes[31] = 2 + Math.floor(Math.random() * (maxTrigger - 1)); // budTrigger
    genes[32] = 3 + Math.floor(Math.random() * 4); // budScale 3-6
    genes[33] = Math.max(1, Math.floor((genes[9] || 1) / 2)); // budSwitch midpoint
    genes[34] = 3 + Math.floor(Math.random() * 6); // budDensity 3-8
    genes[35] = (Math.random() < 0.5 ? -1 : 1) * Math.floor(Math.random() * 5); // budGrad
  }

  // Clamp all
  for (let i = 0; i < config.geneCount; i++) {
    genes[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], genes[i]));
  }

  return genes;
}

// ── DefineVectors ────────────────────────────────────────────

function defineVectors(genes) {
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

// ── Core tree drawing ────────────────────────────────────────

function drawTree(genes) {
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

// ── Symmetry ─────────────────────────────────────────────────

function applySymmetry(lines, symType) {
  if (symType === 'left-right') return lines; // already built-in

  const result = lines.slice();

  if (symType === 'up-down' || symType === 'four-way') {
    // Mirror across horizontal axis (negate y)
    for (const seg of lines) {
      result.push({ x0: seg.x0, y0: -seg.y0, x1: seg.x1, y1: -seg.y1, depth: seg.depth });
    }
  }
  if (symType === 'four-way') {
    // Also mirror the entire set across vertical axis (negate x)
    const soFar = result.slice();
    for (const seg of soFar) {
      result.push({ x0: -seg.x0, y0: seg.y0, x1: -seg.x1, y1: seg.y1, depth: seg.depth });
    }
  }
  if (symType === 'asymmetric') {
    // No symmetry enforcement — lines are used as-is
    return lines;
  }

  return result;
}

// ── Segmentation ─────────────────────────────────────────────

function drawSegmented(genes) {
  const segCount = genes[9] || 1;
  const segDist = genes[10] || 4;
  const hasGradients = currentMode >= 4 && genes.length >= 13;
  const allLines = [];

  for (let s = 0; s < segCount; s++) {
    let segGenes = genes.slice();

    // Apply gradients: interpolate genes across segments
    if (hasGradients && segCount > 1) {
      const t = s / (segCount - 1); // 0 to 1
      const grad1 = genes[11]; // gradient for g1
      const grad2 = genes[12]; // gradient for g2
      segGenes = segGenes.slice();
      // Gradients modify g1 and g3 (which control tree width)
      const config = getConfig();
      segGenes[0] = Math.max(config.geneMin[0], Math.min(config.geneMax[0],
        Math.round(genes[0] + grad1 * t)));
      segGenes[2] = Math.max(config.geneMin[2], Math.min(config.geneMax[2],
        Math.round(genes[2] + grad2 * t)));
    }

    // Alternating asymmetry (Mode 5)
    let segSymType = symmetryType;
    if (alternatingAsymmetry && s % 2 === 1) {
      // Flip left-right for odd segments
      segGenes = segGenes.slice();
      segGenes[0] = -segGenes[0]; // negate g1
      segGenes[1] = -segGenes[1]; // negate g2
      segGenes[2] = -segGenes[2]; // negate g3
    }

    const treeLines = drawTree(segGenes);
    const yOffset = (s - (segCount - 1) / 2) * segDist;

    // Apply symmetry per segment
    const symLines = (currentMode >= 2) ? applySymmetry(treeLines, segSymType) : treeLines;

    for (const seg of symLines) {
      allLines.push({
        x0: seg.x0, y0: seg.y0 + yOffset,
        x1: seg.x1, y1: seg.y1 + yOffset,
        depth: seg.depth,
      });
    }
  }

  return allLines;
}

// ── Segmentation with buds (Mode 6) ─────────────────────

function drawSegmentedWithBuds(genes) {
  const trunkDepth = genes[8];
  const segs = genes[9] || 1;
  const segDist = genes[10] || 4;
  const grad1 = genes[11]; // trunk grad for g1
  const grad2 = genes[12]; // trunk grad for g3

  // Bud A genes at offset 13
  const budAVectors = defineVectors(genes.slice(13, 21));
  const budADepth = genes[21];
  // Bud B genes at offset 22
  const budBVectors = defineVectors(genes.slice(22, 30));
  const budBDepth = genes[30];

  const budTrigger = genes[31];
  const budScale = genes[32] / 8;
  const budSwitch = Math.min(genes[33], segs);
  const budDensity = genes[34];
  const budGrad = genes[35];

  const config = getConfig();
  const allLines = [];
  let budTipCounter = 0;
  let budTipTotal = 0;

  for (let s = 0; s < segs; s++) {
    const useBudA = s < budSwitch;
    const activeBudVectors = useBudA ? budAVectors : budBVectors;
    const activeBudDepth = useBudA ? budADepth : budBDepth;
    const budType = useBudA ? 'budA' : 'budB';

    // Trunk gradient: interpolate g1 and g3 across segments
    const t = segs > 1 ? s / (segs - 1) : 0;
    const segGenes = genes.slice(0, 9);
    segGenes[0] = Math.max(config.geneMin[0], Math.min(config.geneMax[0],
      Math.round(genes[0] + grad1 * t)));
    segGenes[2] = Math.max(config.geneMin[2], Math.min(config.geneMax[2],
      Math.round(genes[2] + grad2 * t)));

    // Alternating asymmetry (if enabled)
    if (alternatingAsymmetry && s % 2 === 1) {
      segGenes[0] = -segGenes[0];
      segGenes[1] = -segGenes[1];
      segGenes[2] = -segGenes[2];
    }

    const trunkVectors = defineVectors(segGenes);
    const yOffset = (s - (segs - 1) / 2) * segDist;

    function recurse(i, c, x0, y0) {
      if (i === 0) i = 8;
      else if (i === 9) i = 1;

      const v = trunkVectors[i];
      const x1 = x0 + c * v[0];
      const y1 = y0 + c * v[1];
      allLines.push({ x0, y0: y0 + yOffset, x1, y1: y1 + yOffset, depth: c, type: 'trunk', maxDepth: trunkDepth });

      // Hox switch: at trigger depth, spawn buds (subject to density filter)
      if (budTrigger > 0 && c === budTrigger) {
        if (activeBudDepth > 0) {
          budTipCounter++;
          if ((budTipCounter % 8) < budDensity) {
            budTipTotal++;
            const gradT = budTipTotal / Math.max(1, Math.pow(2, trunkDepth - budTrigger));
            const gradScale = budScale * Math.max(0.2, 1 + budGrad * 0.08 * (gradT - 0.5));
            recurseBud(i - 1, activeBudDepth, x1, y1 + yOffset, budType, gradScale);
            recurseBud(i + 1, activeBudDepth, x1, y1 + yOffset, budType, gradScale);
          }
        }
      } else if (c > 1) {
        recurse(i - 1, c - 1, x1, y1);
        recurse(i + 1, c - 1, x1, y1);
      }
    }

    function recurseBud(i, c, x0, y0, bType, localScale) {
      if (i === 0) i = 8;
      else if (i === 9) i = 1;

      const bVec = bType === 'budA' ? budAVectors : budBVectors;
      const v = bVec[i];
      const sc = localScale || budScale;
      const x1 = x0 + c * v[0] * sc;
      const y1 = y0 + c * v[1] * sc;
      allLines.push({ x0, y0, x1, y1, depth: c, type: bType, maxDepth: (bType === 'budA' ? budADepth : budBDepth) });

      if (c > 1) {
        recurseBud(i - 1, c - 1, x1, y1, bType, localScale);
        recurseBud(i + 1, c - 1, x1, y1, bType, localScale);
      }
    }

    // Apply symmetry per segment, then recurse
    const segLines = [];
    const segStartIdx = allLines.length;
    recurse(4, trunkDepth, 0, 0);
    const newLines = allLines.splice(segStartIdx);

    // Apply bilateral symmetry for this segment
    const symLines = (currentMode >= 2) ? applySymmetryTyped(newLines, symmetryType) : newLines;
    allLines.push(...symLines);
  }

  return allLines;
}

function applySymmetryTyped(lines, symType) {
  if (symType === 'left-right') return lines;

  const result = lines.slice();

  if (symType === 'up-down' || symType === 'four-way') {
    for (const seg of lines) {
      result.push({ x0: seg.x0, y0: -seg.y0, x1: seg.x1, y1: -seg.y1, depth: seg.depth, type: seg.type, maxDepth: seg.maxDepth });
    }
  }
  if (symType === 'four-way') {
    const soFar = result.slice();
    for (const seg of soFar) {
      result.push({ x0: -seg.x0, y0: seg.y0, x1: -seg.x1, y1: seg.y1, depth: seg.depth, type: seg.type, maxDepth: seg.maxDepth });
    }
  }
  if (symType === 'asymmetric') {
    return lines;
  }

  return result;
}

// ── Radial symmetry ──────────────────────────────────────────

function applyRadial(lines, arms) {
  if (!arms || arms <= 1) return lines;
  const result = [];
  const angleStep = (2 * Math.PI) / arms;
  for (let a = 0; a < arms; a++) {
    const cos = Math.cos(angleStep * a);
    const sin = Math.sin(angleStep * a);
    for (const seg of lines) {
      result.push({
        x0: seg.x0 * cos - seg.y0 * sin,
        y0: seg.x0 * sin + seg.y0 * cos,
        x1: seg.x1 * cos - seg.y1 * sin,
        y1: seg.x1 * sin + seg.y1 * cos,
        depth: seg.depth,
      });
    }
  }
  return result;
}

// ── Main draw dispatcher ────────────────────────────────────

function drawBiomorph(genes) {
  let lines;

  if (currentMode >= 6) {
    lines = drawSegmentedWithBuds(genes);
  } else if (currentMode >= 3) {
    lines = drawSegmented(genes);
  } else {
    lines = drawTree(genes);
    if (currentMode >= 2) {
      lines = applySymmetry(lines, symmetryType);
    }
  }

  // Radial symmetry (Mode 5+)
  if (currentMode >= 5 && radialSymmetry) {
    const segCount = genes[9] || 1;
    const arms = segCount > 1 ? segCount : 5;
    lines = currentMode >= 6 ? applyRadialTyped(lines, arms) : applyRadial(lines, arms);
  }

  return lines;
}

function applyRadialTyped(lines, arms) {
  if (!arms || arms <= 1) return lines;
  const result = [];
  const angleStep = (2 * Math.PI) / arms;
  for (let a = 0; a < arms; a++) {
    const cos = Math.cos(angleStep * a);
    const sin = Math.sin(angleStep * a);
    for (const seg of lines) {
      result.push({
        x0: seg.x0 * cos - seg.y0 * sin,
        y0: seg.x0 * sin + seg.y0 * cos,
        x1: seg.x1 * cos - seg.y1 * sin,
        y1: seg.x1 * sin + seg.y1 * cos,
        depth: seg.depth,
        type: seg.type,
        maxDepth: seg.maxDepth,
      });
    }
  }
  return result;
}

// ── Rendering ────────────────────────────────────────────────

function renderBiomorph(canvas, genes, options) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const lines = options && options.lines ? options.lines : drawBiomorph(genes);
  if (lines.length === 0) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  if (options && options.bbox) {
    minX = options.bbox.minX; maxX = options.bbox.maxX;
    minY = options.bbox.minY; maxY = options.bbox.maxY;
  } else {
    for (const seg of lines) {
      minX = Math.min(minX, seg.x0, seg.x1);
      maxX = Math.max(maxX, seg.x0, seg.x1);
      minY = Math.min(minY, seg.y0, seg.y1);
      maxY = Math.max(maxY, seg.y0, seg.y1);
    }
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const padding = 20;
  const scale = Math.min((w - padding * 2) / bw, (h - padding * 2) / bh);
  const cx = w / 2;
  const cy = h / 2;
  const offsetX = (minX + maxX) / 2;
  const offsetY = (minY + maxY) / 2;

  // Mode 6: three-color developmental rendering (trunk/budA/budB)
  const isMode6 = lines.length > 0 && lines[0].type !== undefined;
  if (isMode6) {
    const BUD_COLORS = { trunk: '#58a6ff', budA: '#f0883e', budB: '#d2a8ff' };
    ctx.lineCap = 'round';

    for (const type of ['trunk', 'budA', 'budB']) {
      const subset = lines.filter(s => s.type === type);
      if (subset.length === 0) continue;

      ctx.strokeStyle = BUD_COLORS[type];

      // Group by depth for batch drawing with depth-based thickness
      const byDepth = new Map();
      for (const seg of subset) {
        if (!byDepth.has(seg.depth)) byDepth.set(seg.depth, []);
        byDepth.get(seg.depth).push(seg);
      }

      for (const [d, segs] of byDepth) {
        const maxD = segs[0].maxDepth || 6;
        const t = maxD > 1 ? (d - 1) / (maxD - 1) : 0;
        const baseWidth = type === 'trunk' ? 2.5 : 1.8;
        ctx.lineWidth = 0.6 + t * baseWidth;

        ctx.beginPath();
        for (const seg of segs) {
          ctx.moveTo(cx + (seg.x0 - offsetX) * scale, cy + (seg.y0 - offsetY) * scale);
          ctx.lineTo(cx + (seg.x1 - offsetX) * scale, cy + (seg.y1 - offsetY) * scale);
        }
        ctx.stroke();
      }
    }
  } else {
    const useColor = options && options.colorEnabled && options.colorGenes;
    if (useColor) {
      const maxDepth = Math.max(...lines.map(s => s.depth));
      const byDepth = new Map();
      for (const seg of lines) {
        if (!byDepth.has(seg.depth)) byDepth.set(seg.depth, []);
        byDepth.get(seg.depth).push(seg);
      }
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (const [d, segs] of byDepth) {
        ctx.strokeStyle = depthToColor(d, maxDepth, options.colorGenes.hue, options.colorGenes.spread);
        ctx.beginPath();
        for (const seg of segs) {
          ctx.moveTo(cx + (seg.x0 - offsetX) * scale, cy + (seg.y0 - offsetY) * scale);
          ctx.lineTo(cx + (seg.x1 - offsetX) * scale, cy + (seg.y1 - offsetY) * scale);
        }
        ctx.stroke();
      }
    } else if (options && options.colorMode === 'angle') {
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      for (const seg of lines) {
        const angle = Math.atan2(seg.y1 - seg.y0, seg.x1 - seg.x0);
        const hue = ((angle / Math.PI) * 180 + 180) % 360;
        ctx.strokeStyle = `hsl(${hue}, 75%, 60%)`;
        ctx.beginPath();
        ctx.moveTo(cx + (seg.x0 - offsetX) * scale, cy + (seg.y0 - offsetY) * scale);
        ctx.lineTo(cx + (seg.x1 - offsetX) * scale, cy + (seg.y1 - offsetY) * scale);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = '#e6edf3';
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (const seg of lines) {
        ctx.moveTo(cx + (seg.x0 - offsetX) * scale, cy + (seg.y0 - offsetY) * scale);
        ctx.lineTo(cx + (seg.x1 - offsetX) * scale, cy + (seg.y1 - offsetY) * scale);
      }
      ctx.stroke();
    }
  }
}

function colorOptions(cGenes) {
  if (currentMode === 0 || colorMode === 'none') return undefined;
  if (colorMode === 'depth') return { colorEnabled: true, colorGenes: cGenes || colorGenes };
  if (colorMode === 'angle') return { colorMode: 'angle' };
  return undefined;
}

function pushHistory() {
  const node = evolutionHistory.push(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, generation);
  node.colorMode = colorMode;
  node.colorEnabled = colorMode === 'depth';
  node.colorGenes = { hue: colorGenes.hue, spread: colorGenes.spread };
  captureNodeThumbnail(evolutionHistory, node);
  return node;
}

// ── Developmental animation ─────────────────────────────────

let animationTimer = null;

function stopAnimation() {
  if (animationTimer !== null) {
    clearTimeout(animationTimer);
    animationTimer = null;
  }
  if (parentAnimBtn) {
    parentAnimBtn.innerHTML = '&#9654;'; // ▶
    parentAnimBtn.classList.remove('animating');
    parentAnimBtn.title = 'Watch growth animation';
  }
}

let parentAnimBtn = null; // dynamic — created in spawnOffspring()

function animateGrowth() {
  stopAnimation();
  if (currentMode === 0 || !parentCanvasRef || !parentAnimBtn) return;

  const allLines = drawBiomorph(parentGenes);
  if (allLines.length === 0) return;

  // Compute bounding box from ALL lines (stable framing)
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of allLines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }
  const bbox = { minX, maxX, minY, maxY };

  // Group by depth
  const maxDepth = Math.max(...allLines.map(s => s.depth));
  const depthGroups = [];
  for (let d = maxDepth; d >= 1; d--) {
    depthGroups.push(allLines.filter(s => s.depth >= d));
  }

  const btn = parentAnimBtn;
  btn.innerHTML = '&#9209;'; // ⏹
  btn.classList.add('animating');
  btn.title = 'Stop animation';

  let step = 0;
  function nextFrame() {
    if (step >= depthGroups.length) {
      // Animation complete — show replay
      animationTimer = null;
      btn.innerHTML = '&#8635;'; // ↻
      btn.classList.remove('animating');
      btn.title = 'Replay growth animation';
      return;
    }

    const lines = depthGroups[step];
    const opts = { lines, bbox };
    if (colorMode === 'depth') {
      opts.colorEnabled = true;
      opts.colorGenes = colorGenes;
    } else if (colorMode === 'angle') {
      opts.colorMode = 'angle';
    }
    renderBiomorph(parentCanvasRef, parentGenes, opts);
    step++;
    animationTimer = setTimeout(() => requestAnimationFrame(nextFrame), 280);
  }

  requestAnimationFrame(nextFrame);
}

// ── Offspring animation ──────────────────────────────────────

const offspringAnimations = new WeakMap();

function animateOffspring(canvas, genes, childColorGenes, btn) {
  // Stop any existing animation on this canvas
  const existing = offspringAnimations.get(canvas);
  if (existing) clearTimeout(existing);

  if (currentMode === 0) return;

  const allLines = drawBiomorph(genes);
  if (allLines.length === 0) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of allLines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }
  const bbox = { minX, maxX, minY, maxY };

  const maxDepth = Math.max(...allLines.map(s => s.depth));
  const depthGroups = [];
  for (let d = maxDepth; d >= 1; d--) {
    depthGroups.push(allLines.filter(s => s.depth >= d));
  }

  btn.innerHTML = '&#9209;';
  btn.classList.add('animating');

  let step = 0;
  function nextFrame() {
    if (step >= depthGroups.length) {
      offspringAnimations.delete(canvas);
      btn.innerHTML = '&#8635;';
      btn.classList.remove('animating');
      return;
    }
    const lines = depthGroups[step];
    const opts = { lines, bbox };
    if (colorMode === 'depth' && childColorGenes) {
      opts.colorEnabled = true;
      opts.colorGenes = childColorGenes;
    } else if (colorMode === 'angle') {
      opts.colorMode = 'angle';
    }
    renderBiomorph(canvas, genes, opts);
    step++;
    const timer = setTimeout(() => requestAnimationFrame(nextFrame), 280);
    offspringAnimations.set(canvas, timer);
  }

  requestAnimationFrame(nextFrame);
}

function stopOffspringAnimation(canvas, genes, childColorGenes) {
  const timer = offspringAnimations.get(canvas);
  if (timer) {
    clearTimeout(timer);
    offspringAnimations.delete(canvas);
  }
  if (currentMode === 0) {
    renderPeppering(canvas, genes);
  } else {
    renderBiomorph(canvas, genes, colorOptions(childColorGenes));
  }
}

// ── Sexual reproduction (crossover) ─────────────────────────

const PARENT_COLORS = [
  { label: 'Parent', color: '#58a6ff', bg: 'rgba(88, 166, 255, 0.1)' },
  { label: 'Mate',   color: '#d2a8ff', bg: 'rgba(210, 168, 255, 0.1)' },
  { label: 'Mate 2', color: '#3fb950', bg: 'rgba(63, 185, 80, 0.1)' },
  { label: 'Mate 3', color: '#f0883e', bg: 'rgba(240, 136, 62, 0.1)' },
  { label: 'Mate 4', color: '#f778ba', bg: 'rgba(247, 120, 186, 0.1)' },
];

function crossoverMulti(parentsList) {
  const config = getConfig();
  const child = new Array(config.geneCount);
  const sources = new Array(config.geneCount);
  for (let i = 0; i < config.geneCount; i++) {
    const srcIdx = Math.floor(Math.random() * parentsList.length);
    child[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], parentsList[srcIdx][i]));
    sources[i] = srcIdx + 1; // 1-indexed
  }
  return { genes: child, sources };
}

function crossoverColorMulti(colorGenesList) {
  return {
    hue: colorGenesList[Math.floor(Math.random() * colorGenesList.length)].hue,
    spread: colorGenesList[Math.floor(Math.random() * colorGenesList.length)].spread,
  };
}

// ── Mate picker ─────────────────────────────────────────────

function openMatePicker() {
  if (currentMode === 0) return;

  // Combine classic presets + user saves (skip peppering — can't breed mode 0)
  const thumbs = ensurePresetThumbnails();
  const presetSpecs = CLASSIC_PRESETS.map((p, i) => ({
    ...p, id: `preset-classic-${i}`, thumbnail: thumbs[p.name], _preset: true,
  }));
  const userSpecs = loadGallery().filter(s => s.mode !== 0);
  const allSpecs = [...presetSpecs, ...userSpecs];

  const modal = document.getElementById('mate-picker-modal');
  const grid = document.getElementById('mate-picker-grid');
  const confirmBtn = document.getElementById('mate-picker-confirm');
  grid.innerHTML = '';

  if (allSpecs.length === 0) {
    grid.innerHTML = '<p class="mate-picker-empty">No saved specimens. Save biomorphs to your gallery first.</p>';
    confirmBtn.disabled = true;
    modal.style.display = 'flex';
    return;
  }

  const selected = new Set();

  for (const spec of allSpecs) {
    const card = document.createElement('div');
    card.className = 'mate-picker-card';

    const img = document.createElement('img');
    img.src = spec.thumbnail;
    img.draggable = false;
    card.appendChild(img);

    const name = document.createElement('div');
    name.className = 'mate-name';
    name.textContent = spec.name;
    card.appendChild(name);

    card.addEventListener('click', () => {
      if (selected.has(spec.id)) {
        selected.delete(spec.id);
        card.classList.remove('selected');
      } else if (selected.size < 4) {
        selected.add(spec.id);
        card.classList.add('selected');
      }
      confirmBtn.disabled = selected.size === 0;
      confirmBtn.textContent = selected.size > 0
        ? `Breed (${selected.size} mate${selected.size > 1 ? 's' : ''})`
        : 'Breed';
    });

    grid.appendChild(card);
  }

  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Breed';
  modal.style.display = 'flex';

  // Store handler for confirm
  confirmBtn.onclick = () => {
    const specimens = allSpecs.filter(s => selected.has(s.id));
    closeMatePicker();
    if (specimens.length > 0) showBreedModal(specimens);
  };
}

function closeMatePicker() {
  document.getElementById('mate-picker-modal').style.display = 'none';
  document.getElementById('mate-picker-grid').innerHTML = '';
}

// ── Breed modal (multi-parent) ──────────────────────────────

function showBreedModal(specimens) {
  if (currentMode === 0 || specimens.length === 0) return;

  const modal = document.getElementById('breed-modal');
  const parentsContainer = document.getElementById('breed-parents');
  parentsContainer.innerHTML = '';

  // Prepare all parent gene arrays and color genes
  const allParentGenes = [parentGenes];
  const allColorGenes = [{ hue: colorGenes.hue, spread: colorGenes.spread }];

  // Render current parent
  const p0Side = document.createElement('div');
  p0Side.className = 'breed-parent-side';
  const p0H = document.createElement('h3');
  p0H.textContent = 'Parent';
  p0H.style.color = PARENT_COLORS[0].color;
  p0Side.appendChild(p0H);
  const p0Canvas = document.createElement('canvas');
  p0Canvas.width = 200;
  p0Canvas.height = 200;
  p0Side.appendChild(p0Canvas);
  parentsContainer.appendChild(p0Side);
  renderBiomorph(p0Canvas, parentGenes, colorOptions());
  p0Canvas.addEventListener('mouseenter', () => highlightBreedColumn('breed-col-p0'));
  p0Canvas.addEventListener('mouseleave', () => highlightBreedColumn(null));

  // Render each mate
  const savedMode = currentMode;
  const savedSym = symmetryType;
  const savedAltAsym = alternatingAsymmetry;
  const savedRadSym = radialSymmetry;

  for (let m = 0; m < specimens.length; m++) {
    const spec = specimens[m];

    // × separator
    const x = document.createElement('span');
    x.className = 'breed-x';
    x.innerHTML = '&times;';
    parentsContainer.appendChild(x);

    // Adapt genes
    let mateGenes = spec.genes.slice();
    if (spec.mode !== savedMode) mateGenes = adaptGenes(mateGenes, savedMode);
    allParentGenes.push(mateGenes);

    const mateColorGenes = spec.colorGenes || { hue: 7, spread: 3 };
    allColorGenes.push(mateColorGenes);

    const side = document.createElement('div');
    side.className = 'breed-parent-side';
    const h = document.createElement('h3');
    h.textContent = PARENT_COLORS[m + 1].label;
    h.style.color = PARENT_COLORS[m + 1].color;
    side.appendChild(h);
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 200;
    side.appendChild(canvas);
    parentsContainer.appendChild(side);

    // Render mate in its original style
    currentMode = spec.mode;
    symmetryType = spec.symmetry || 'left-right';
    alternatingAsymmetry = spec.alternatingAsym || false;
    radialSymmetry = spec.radialSym || false;
    const mateCM = spec.colorMode || (spec.colorEnabled ? 'depth' : 'none');
    const mateColorOpts = mateCM === 'depth'
      ? { colorEnabled: true, colorGenes: mateColorGenes }
      : (mateCM === 'angle' ? { colorMode: 'angle' } : undefined);
    renderBiomorph(canvas, spec.genes.slice(), mateColorOpts);

    const colIdx = m;
    canvas.addEventListener('mouseenter', () => highlightBreedColumn('breed-col-p' + (colIdx + 1)));
    canvas.addEventListener('mouseleave', () => highlightBreedColumn(null));
  }

  currentMode = savedMode;
  symmetryType = savedSym;
  alternatingAsymmetry = savedAltAsym;
  radialSymmetry = savedRadSym;

  const parentCount = allParentGenes.length;

  // Generate 8 crossover+mutation offspring
  const offspringData = [];
  for (let i = 0; i < NUM_OFFSPRING; i++) {
    const { genes: crossed, sources } = crossoverMulti(allParentGenes);
    const childGenes = mutate(crossed);
    const childColorGenes = colorMode === 'depth'
      ? mutateColor(crossoverColorMulti(allColorGenes))
      : null;

    let mutatedIndex = -1;
    for (let j = 0; j < crossed.length; j++) {
      if (crossed[j] !== childGenes[j]) { mutatedIndex = j; break; }
    }

    offspringData.push({ childGenes, childColorGenes, sources, mutatedIndex });
  }

  // Render gene comparison table
  renderBreedGeneComparison(allParentGenes, offspringData, parentCount);

  // Render offspring grid
  const grid = document.getElementById('breed-offspring');
  grid.innerHTML = '';
  for (let i = 0; i < offspringData.length; i++) {
    const { childGenes, childColorGenes, sources, mutatedIndex } = offspringData[i];

    const canvas = document.createElement('canvas');
    canvas.width = 140;
    canvas.height = 140;
    canvas.title = 'Click to select';
    grid.appendChild(canvas);

    renderBiomorph(canvas, childGenes, colorOptions(childColorGenes));

    const childIdx = i;
    canvas.addEventListener('mouseenter', () => {
      renderBreedDetailStrip(childGenes, sources, mutatedIndex, parentCount);
      highlightBreedColumn('breed-col-child-' + childIdx);
    });
    canvas.addEventListener('mouseleave', () => {
      clearBreedDetailStrip();
      highlightBreedColumn(null);
    });

    canvas.addEventListener('click', () => {
      hideBreedModal();
      selectOffspring(childGenes, childColorGenes);
    });
  }

  clearBreedDetailStrip();
  modal.style.display = 'flex';
}

function renderBreedGeneComparison(allParentGenes, offspring, parentCount) {
  const config = getConfig();
  const container = document.getElementById('breed-gene-comparison');
  container.innerHTML = '';

  const totalCols = 2 + parentCount + offspring.length; // label + desc + parents + children
  const colTemplate = `55px 160px repeat(${parentCount + offspring.length}, 60px)`;

  // Header row
  const header = document.createElement('div');
  header.className = 'breed-gene-row breed-gene-header';
  header.style.gridTemplateColumns = colTemplate;
  const cols = ['Gene', 'Description'];
  const colClasses = ['', ''];
  for (let p = 0; p < parentCount; p++) {
    cols.push(p === 0 ? 'P' : 'M' + (parentCount > 2 && p > 1 ? p : ''));
    colClasses.push('breed-col-p' + p);
  }
  for (let c = 0; c < offspring.length; c++) {
    cols.push(String(c + 1));
    colClasses.push('breed-col-child-' + c);
  }
  for (let c = 0; c < cols.length; c++) {
    const span = document.createElement('span');
    if (colClasses[c]) span.className = colClasses[c];
    span.textContent = cols[c];
    if (c >= 2 && c < 2 + parentCount) span.style.color = PARENT_COLORS[c - 2].color;
    header.appendChild(span);
  }
  container.appendChild(header);

  for (let i = 0; i < config.geneCount; i++) {
    const label = config.geneLabels[i];
    // Check if any parent differs
    const vals = allParentGenes.map(g => i < g.length ? g[i] : 0);
    const differs = vals.some(v => v !== vals[0]);

    const row = document.createElement('div');
    row.className = 'breed-gene-row' + (differs ? ' breed-gene-differs' : '');
    row.style.gridTemplateColumns = colTemplate;

    const labelSpan = document.createElement('span');
    labelSpan.textContent = label;
    row.appendChild(labelSpan);

    const descSpan = document.createElement('span');
    descSpan.className = 'breed-gene-desc';
    descSpan.textContent = GENE_TOOLTIPS[label] || '';
    row.appendChild(descSpan);

    // Parent values
    for (let p = 0; p < parentCount; p++) {
      const pSpan = document.createElement('span');
      pSpan.className = 'breed-col-p' + p;
      pSpan.style.color = PARENT_COLORS[p].color;
      pSpan.textContent = vals[p];
      row.appendChild(pSpan);
    }

    // Child values
    for (let c = 0; c < offspring.length; c++) {
      const child = offspring[c];
      const cVal = child.childGenes[i];
      const span = document.createElement('span');
      span.className = 'breed-col-child-' + c;
      if (i === child.mutatedIndex) {
        span.classList.add('breed-gene-mutated-val');
      } else {
        // Color by which parent the gene came from
        const srcIdx = child.sources[i] - 1;
        span.style.color = PARENT_COLORS[srcIdx].color;
      }
      span.textContent = cVal;
      row.appendChild(span);
    }

    container.appendChild(row);
  }
}

function highlightBreedColumn(colClass) {
  document.querySelectorAll('.breed-col-highlight').forEach(el =>
    el.classList.remove('breed-col-highlight'));
  if (colClass) {
    document.querySelectorAll('.' + colClass).forEach(el =>
      el.classList.add('breed-col-highlight'));
  }
}

function renderBreedDetailStrip(childGenes, sources, mutatedIndex, parentCount) {
  const config = getConfig();
  const strip = document.getElementById('breed-detail-strip');
  strip.innerHTML = '';
  for (let i = 0; i < config.geneCount; i++) {
    const chip = document.createElement('span');
    const srcIdx = sources[i] - 1;
    const mutClass = i === mutatedIndex ? ' breed-gene-mutated' : '';
    chip.className = `gene-chip${mutClass}`;
    chip.style.background = PARENT_COLORS[srcIdx].bg;
    chip.style.borderColor = PARENT_COLORS[srcIdx].color;
    chip.style.color = PARENT_COLORS[srcIdx].color;
    chip.textContent = `${config.geneLabels[i]}=${childGenes[i]}`;
    strip.appendChild(chip);
  }
}

function clearBreedDetailStrip() {
  const strip = document.getElementById('breed-detail-strip');
  strip.innerHTML = '<span class="breed-detail-hint">Hover an offspring to see gene provenance</span>';
}

function hideBreedModal() {
  const modal = document.getElementById('breed-modal');
  modal.style.display = 'none';
  document.getElementById('breed-parents').innerHTML = '';
  document.getElementById('breed-offspring').innerHTML = '';
  document.getElementById('breed-gene-comparison').innerHTML = '';
  document.getElementById('breed-detail-strip').innerHTML = '';
  highlightBreedColumn(null);
}

// ── Gallery (F2) ────────────────────────────────────────────

const GALLERY_KEY = 'biomorph-gallery';

const PEPPERING_PRESETS = [
  {
    name: 'T-Rex',
    genes: Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,1,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,1,1,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,1,1,0,0,0,1,1,1,1,1,1,0,0,0,0,0,1,1,1,0,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0,0]),
    mode: 0,
  },
  {
    name: 'Churchill',
    genes: Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]),
    mode: 0,
  },
  {
    name: 'Smiley',
    genes: Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,0,1,1,0,0,1,1,0,1,1,0,0,0,0,1,1,0,1,1,0,0,1,1,0,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,1,1,0,1,1,1,1,1,1,0,1,1,0,0,0,0,1,1,1,0,1,1,1,1,0,1,1,1,0,0,0,0,0,1,1,1,1,0,0,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]),
    mode: 0,
  },
  {
    name: 'Heart',
    genes: Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,1,1,1,0,0,0,0,0,1,1,1,1,1,0,0,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]),
    mode: 0,
  },
  {
    name: 'Arrow',
    genes: Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]),
    mode: 0,
  },
];

const CLASSIC_PRESETS = [
  {
    name: 'Insect',
    genes: [1, 1, -4, 1, -1, -2, 8, -4, 6],
    mode: 1, symmetry: 'left-right',
    notes: "Dawkins' original Insect preset (raw [10,10,-40,10,-10,-20,80,-40,6] / trickle=10)",
  },
  {
    name: 'Fern',
    genes: [-1, -2, -2, -2, -2, 0, 2, 2, 7],
    mode: 1, symmetry: 'left-right',
    notes: "Dawkins' BasicTree preset (raw [-10,-20,-20,-15,-15,0,15,15,7] / trickle=9, rounded)",
  },
  {
    name: 'Snowflake',
    genes: [2, 1, -2, 0, 2, -1, 1, -2, 5],
    mode: 2, symmetry: 'four-way',
  },
  {
    name: 'Caterpillar',
    genes: [1, -2, 2, -1, 2, -1, 1, -2, 5, 4, 6],
    mode: 3, symmetry: 'left-right',
  },
  {
    name: 'Centipede',
    genes: [2, -1, 1, 0, 1, -2, 2, -1, 4, 6, 3],
    mode: 3, symmetry: 'left-right',
  },
  {
    name: 'Arthropod',
    genes: [2, -2, 3, -1, 1, -1, 2, -3, 5, 3, 5, 2, -1],
    mode: 4, symmetry: 'left-right',
  },
  {
    name: 'Coral',
    genes: [1, 2, -2, 2, -1, 3, -1, 2, 6, 2, 4, 1, 2],
    mode: 4, symmetry: 'left-right',
    colorMode: 'depth', colorEnabled: true, colorGenes: { hue: 4, spread: 3 },
  },
  {
    name: 'Mandala',
    genes: [2, -1, 1, -2, 2, 1, -1, -2, 5, 5, 4, 1, -1],
    mode: 5, symmetry: 'left-right', radialSym: true,
  },
  {
    name: 'Scorpion',
    genes: [3, -2, 1, -1, 2, -3, 2, 3, 5, 3, 6, 2, -2],
    mode: 5, symmetry: 'left-right', alternatingAsym: true,
  },
  {
    name: 'Hydra',
    genes: [2, -1, 3, -2, 1, -1, 2, -3, 5, 3, 5, 2, -1,
            1, 2, -1, 1, -2, 1, -1, 2, 3,
            -1, 1, 2, -1, 2, -2, 1, -1, 3,
            3, 5, 2, 6, 2],
    mode: 6, symmetry: 'left-right',
  },
];

const PRESET_THUMBS_KEY = 'biomorph-preset-thumbs';
let currentCollection = 'classic'; // 'peppering', 'classic', 'saves'

function getPresetThumbnails() {
  try {
    return JSON.parse(localStorage.getItem(PRESET_THUMBS_KEY)) || {};
  } catch { return {}; }
}

function ensurePresetThumbnails() {
  const cached = getPresetThumbnails();
  let dirty = false;
  const allPresets = [...PEPPERING_PRESETS, ...CLASSIC_PRESETS];
  for (const p of allPresets) {
    const key = p.name;
    if (!cached[key]) {
      cached[key] = generateThumbnail(p);
      dirty = true;
    }
  }
  if (dirty) localStorage.setItem(PRESET_THUMBS_KEY, JSON.stringify(cached));
  return cached;
}

function loadGallery() {
  try {
    return JSON.parse(localStorage.getItem(GALLERY_KEY)) || [];
  } catch { return []; }
}

function captureCurrentThumbnail() {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;
  if (currentMode === 0) {
    renderPeppering(canvas, parentGenes);
  } else {
    renderBiomorph(canvas, parentGenes, colorOptions());
  }
  return canvas.toDataURL('image/png');
}

function generateThumbnail(specimen) {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;

  // Temporarily swap globals for rendering
  const prevMode = currentMode;
  const prevSym = symmetryType;
  const prevAlt = alternatingAsymmetry;
  const prevRad = radialSymmetry;

  currentMode = specimen.mode;
  symmetryType = specimen.symmetry || 'left-right';
  alternatingAsymmetry = specimen.alternatingAsym || false;
  radialSymmetry = specimen.radialSym || false;

  if (specimen.mode === 0) {
    renderPeppering(canvas, specimen.genes);
  } else {
    const specCM = specimen.colorMode || (specimen.colorEnabled ? 'depth' : 'none');
    const opts = specCM === 'depth' && specimen.colorGenes
      ? { colorEnabled: true, colorGenes: specimen.colorGenes }
      : (specCM === 'angle' ? { colorMode: 'angle' } : undefined);
    renderBiomorph(canvas, specimen.genes, opts);
  }

  currentMode = prevMode;
  symmetryType = prevSym;
  alternatingAsymmetry = prevAlt;
  radialSymmetry = prevRad;

  return canvas.toDataURL('image/png');
}

function autoSelectCollection() {
  currentCollection = currentMode === 0 ? 'peppering' : 'classic';
  const sel = document.getElementById('gallery-collection');
  if (sel) sel.value = currentCollection;
}

function saveToGallery() {
  const gallery = loadGallery();
  const specimen = {
    id: Date.now(),
    name: `Specimen ${gallery.length + 1}`,
    genes: currentMode === 0 ? Array.from(parentGenes) : parentGenes.slice(),
    mode: currentMode,
    symmetry: symmetryType,
    alternatingAsym: alternatingAsymmetry,
    radialSym: radialSymmetry,
    generation,
    thumbnail: captureCurrentThumbnail(),
    colorMode,
    colorEnabled: colorMode === 'depth',
    colorGenes: { hue: colorGenes.hue, spread: colorGenes.spread },
  };
  gallery.push(specimen);
  localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
  currentCollection = 'saves';
  const sel = document.getElementById('gallery-collection');
  if (sel) sel.value = 'saves';
  renderGallery();
}

function flashIcon(btn, color) {
  if (!btn) return;
  const orig = btn.style.color;
  btn.style.color = color;
  setTimeout(() => btn.style.color = orig, 800);
}

function saveChildToGallery(childGenes, childColorGenes, iconBtn) {
  const gallery = loadGallery();
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;
  const opts = colorMode === 'depth' && childColorGenes
    ? { colorEnabled: true, colorGenes: childColorGenes }
    : (colorMode === 'angle' ? { colorMode: 'angle' } : undefined);
  if (currentMode === 0) {
    renderPeppering(canvas, childGenes);
  } else {
    renderBiomorph(canvas, childGenes, opts);
  }
  const specimen = {
    id: Date.now(),
    name: `Specimen ${gallery.length + 1}`,
    genes: currentMode === 0 ? Array.from(childGenes) : childGenes.slice(),
    mode: currentMode,
    symmetry: symmetryType,
    alternatingAsym: alternatingAsymmetry,
    radialSym: radialSymmetry,
    generation,
    thumbnail: canvas.toDataURL('image/png'),
    colorMode,
    colorEnabled: colorMode === 'depth',
    colorGenes: childColorGenes ? { hue: childColorGenes.hue, spread: childColorGenes.spread } : { hue: colorGenes.hue, spread: colorGenes.spread },
  };
  gallery.push(specimen);
  localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
  currentCollection = 'saves';
  const sel = document.getElementById('gallery-collection');
  if (sel) sel.value = 'saves';
  renderGallery();
  if (iconBtn) flashIcon(iconBtn, '#3fb950');
}

function copyBiomorphLink(genes, cGenes, iconBtn) {
  const hash = encodeStateFor(genes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, mutationIntensity, generation, colorMode, cGenes || colorGenes);
  const url = window.location.origin + window.location.pathname + hash;
  navigator.clipboard.writeText(url).then(() => {
    if (iconBtn) flashIcon(iconBtn, '#3fb950');
  });
}

function copySpecimenLink(specimen, iconBtn) {
  const cGenes = specimen.colorGenes || { hue: 7, spread: 3 };
  const hash = encodeStateFor(
    specimen.genes, specimen.mode,
    specimen.symmetry || 'left-right',
    specimen.alternatingAsym || false,
    specimen.radialSym || false,
    mutationIntensity,
    specimen.generation || 0,
    specimen.colorMode || (specimen.colorEnabled ? 'depth' : 'none'),
    cGenes
  );
  const url = window.location.origin + window.location.pathname + hash;
  navigator.clipboard.writeText(url).then(() => {
    if (iconBtn) flashIcon(iconBtn, '#3fb950');
  });
}

function deleteFromGallery(id) {
  let gallery = loadGallery();
  gallery = gallery.filter(s => s.id !== id);
  localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
  renderGallery();
}

function renameInGallery(id, newName) {
  const gallery = loadGallery();
  const spec = gallery.find(s => s.id === id);
  if (spec) spec.name = newName;
  localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
}

function loadSpecimen(specimen) {
  currentMode = specimen.mode;
  parentGenes = specimen.mode === 0
    ? new Uint8Array(specimen.genes)
    : specimen.genes.slice();
  symmetryType = specimen.symmetry || 'left-right';
  alternatingAsymmetry = specimen.alternatingAsym || false;
  radialSymmetry = specimen.radialSym || false;
  generation = specimen.generation || 0;
  colorMode = specimen.colorMode || (specimen.colorEnabled ? 'depth' : 'none');
  if (specimen.colorGenes) colorGenes = { hue: specimen.colorGenes.hue, spread: specimen.colorGenes.spread };

  syncUIControls();

  // Push to history
  evolutionHistory.reset();
  pushHistory();

  updateParent();
  spawnOffspring();
}

function renderGallery() {
  const content = document.getElementById('gallery-content');
  if (!content) return;

  content.innerHTML = '';

  const isPreset = currentCollection === 'peppering' || currentCollection === 'classic';
  let items;

  if (currentCollection === 'peppering') {
    const thumbs = ensurePresetThumbnails();
    items = PEPPERING_PRESETS.map(p => ({ ...p, thumbnail: thumbs[p.name], _preset: true }));
  } else if (currentCollection === 'classic') {
    const thumbs = ensurePresetThumbnails();
    items = CLASSIC_PRESETS.map(p => ({ ...p, thumbnail: thumbs[p.name], _preset: true }));
  } else {
    items = loadGallery();
  }

  if (items.length === 0) {
    content.innerHTML = '<p class="gallery-empty">No saved specimens. Click "Save" to add the current biomorph.</p>';
    return;
  }

  for (const spec of items) {
    const card = document.createElement('div');
    card.className = 'gallery-card';

    // Delete button — only for user saves
    if (!spec._preset) {
      const delBtn = document.createElement('button');
      delBtn.className = 'gallery-card-delete';
      delBtn.innerHTML = '&times;';
      delBtn.title = 'Delete specimen';
      delBtn.addEventListener('click', () => deleteFromGallery(spec.id));
      card.appendChild(delBtn);
    }

    const img = document.createElement('img');
    img.src = spec.thumbnail;
    img.draggable = false;
    card.appendChild(img);

    // Name — editable input for user saves, static label for presets
    if (spec._preset) {
      const nameLabel = document.createElement('div');
      nameLabel.className = 'gallery-name-label';
      nameLabel.textContent = spec.name;
      card.appendChild(nameLabel);
    } else {
      const nameEl = document.createElement('input');
      nameEl.className = 'gallery-name';
      nameEl.value = spec.name;
      nameEl.addEventListener('change', () => renameInGallery(spec.id, nameEl.value));
      card.appendChild(nameEl);
    }

    const info = document.createElement('div');
    info.className = 'gallery-info';
    info.textContent = `Mode ${spec.mode} \u00B7 Gen ${spec.generation || 0}`;
    card.appendChild(info);

    const actions = document.createElement('div');
    actions.className = 'gallery-actions';

    const loadBtn = document.createElement('button');
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => loadSpecimen(spec));
    actions.appendChild(loadBtn);

    const breedBtn = document.createElement('button');
    breedBtn.className = 'btn-breed';
    breedBtn.textContent = 'Breed';
    breedBtn.title = 'Cross with current parent';
    if (currentMode === 0 || spec.mode === 0) {
      breedBtn.disabled = true;
      breedBtn.title = 'Cannot breed in Pixel Peppering mode';
    }
    breedBtn.addEventListener('click', () => showBreedModal([spec]));
    actions.appendChild(breedBtn);

    const linkBtn = document.createElement('button');
    linkBtn.textContent = '\u26D3';
    linkBtn.title = 'Copy link';
    linkBtn.addEventListener('click', () => copySpecimenLink(spec, linkBtn));
    actions.appendChild(linkBtn);

    card.appendChild(actions);
    content.appendChild(card);
  }
}

// ── Comparison modal (F7) ───────────────────────────────────

let comparisonChildGenes = null;
let comparisonChildColorGenes = null;

function showComparison(childGenes, childColorGenes) {
  const modal = document.getElementById('comparison-modal');
  if (!modal) return;

  comparisonChildGenes = childGenes;
  comparisonChildColorGenes = childColorGenes || null;
  modal.style.display = 'flex';

  // Render parent
  const pCanvas = document.getElementById('compare-parent');
  if (currentMode === 0) {
    renderPeppering(pCanvas, parentGenes);
  } else {
    renderBiomorph(pCanvas, parentGenes, colorOptions());
  }

  // Render child
  const cCanvas = document.getElementById('compare-child');
  if (currentMode === 0) {
    renderPeppering(cCanvas, childGenes);
  } else {
    renderBiomorph(cCanvas, childGenes, colorOptions(childColorGenes));
  }

  // Gene diff
  renderGeneDiff(parentGenes, childGenes);
}

function hideComparison() {
  const modal = document.getElementById('comparison-modal');
  if (modal) modal.style.display = 'none';
  comparisonChildGenes = null;
}

function renderGeneDiff(parentG, childG) {
  const config = getConfig();
  const parentDiv = document.getElementById('compare-parent-genes');
  const childDiv = document.getElementById('compare-child-genes');
  parentDiv.innerHTML = '';
  childDiv.innerHTML = '';

  if (currentMode === 0) {
    // For peppering, just show pixel counts
    const pOn = Array.from(parentG).reduce((s, v) => s + v, 0);
    const cOn = Array.from(childG).reduce((s, v) => s + v, 0);
    parentDiv.textContent = `${pOn}/${parentG.length} pixels`;
    childDiv.textContent = `${cOn}/${childG.length} pixels`;
    return;
  }

  for (let i = 0; i < config.geneCount; i++) {
    const label = config.geneLabels[i];
    const pVal = i < parentG.length ? parentG[i] : 0;
    const cVal = i < childG.length ? childG[i] : 0;
    const changed = pVal !== cVal;

    const pChip = document.createElement('span');
    pChip.className = 'gene-chip' + (changed ? ' gene-changed' : '');
    pChip.textContent = `${label}=${pVal}`;
    parentDiv.appendChild(pChip);

    const cChip = document.createElement('span');
    cChip.className = 'gene-chip' + (changed ? ' gene-changed' : '');
    cChip.textContent = `${label}=${cVal}`;
    childDiv.appendChild(cChip);
  }
}

// ── UI ───────────────────────────────────────────────────────

let parentGenes = originGenotype();
let generation = 0;

let parentCanvasRef = null; // dynamic — created in spawnOffspring()
const offspringGrid = document.getElementById('offspring-grid');

const evolutionHistory = new EvolutionHistory();

const GENOME_GROUPS = [
  { name: 'Branch Shape', genes: ['g1', 'g2', 'g3'], minMode: 1 },
  { name: 'Branch Height', genes: ['g5', 'g6', 'g7'], minMode: 1 },
  { name: 'Stems', genes: ['g4', 'g8'], minMode: 1 },
  { name: 'Complexity', genes: ['depth'], minMode: 1 },
  { name: 'Body Plan', genes: ['segs', 'segDist'], minMode: 3 },
  { name: 'Gradients', genes: ['grad1', 'grad2'], minMode: 4 },
  { name: 'Bud A (anterior)', genes: ['ag1','ag2','ag3','ag4','ag5','ag6','ag7','ag8','aDepth'], minMode: 6 },
  { name: 'Bud B (posterior)', genes: ['bg1','bg2','bg3','bg4','bg5','bg6','bg7','bg8','bDepth'], minMode: 6 },
  { name: 'Hox Genes', genes: ['budTrigger','budScale','budSwitch','budDensity','budGrad'], minMode: 6 },
];

const GENOME_SHORT_DESCS = {
  g1: 'Inner horizontal', g2: 'Mid horizontal', g3: 'Outer horizontal',
  g4: 'Central stem', g5: 'Inner vertical', g6: 'Mid vertical',
  g7: 'Outer vertical', g8: 'Trunk length', depth: 'Recursion depth',
  segs: 'Segment count', segDist: 'Segment spacing',
  grad1: 'Inner spread gradient', grad2: 'Outer spread gradient',
  hue: 'Base hue', spread: 'Hue spread',
  ag1: 'A inner horiz', ag2: 'A mid horiz', ag3: 'A outer horiz',
  ag4: 'A central stem', ag5: 'A inner vert', ag6: 'A mid vert',
  ag7: 'A outer vert', ag8: 'A trunk', aDepth: 'A depth',
  bg1: 'B inner horiz', bg2: 'B mid horiz', bg3: 'B outer horiz',
  bg4: 'B central stem', bg5: 'B inner vert', bg6: 'B mid vert',
  bg7: 'B outer vert', bg8: 'B trunk', bDepth: 'B depth',
  budTrigger: 'Bud activation depth', budScale: 'Bud size',
  budSwitch: 'A/B boundary', budDensity: 'Tip sprouting',
  budGrad: 'Shh gradient',
};

function renderGenomeTable(genes, cGenes) {
  const config = getConfig();
  const table = document.getElementById('genome-table');
  table.innerHTML = '';

  const labelToIndex = {};
  for (let i = 0; i < config.geneLabels.length; i++) {
    labelToIndex[config.geneLabels[i]] = i;
  }

  for (const group of GENOME_GROUPS) {
    if (currentMode < group.minMode) continue;
    // Check that at least one gene in this group exists in current config
    const activeGenes = group.genes.filter(g => labelToIndex[g] !== undefined);
    if (activeGenes.length === 0) continue;

    const header = document.createElement('div');
    header.className = 'genome-group-header';
    header.textContent = group.name;
    table.appendChild(header);

    for (const geneLabel of activeGenes) {
      const idx = labelToIndex[geneLabel];
      const row = document.createElement('div');
      row.className = 'genome-row';

      const label = document.createElement('span');
      label.className = 'genome-label';
      label.textContent = geneLabel;
      row.appendChild(label);

      const val = document.createElement('span');
      val.className = 'genome-value';
      val.textContent = genes[idx];
      row.appendChild(val);

      const desc = document.createElement('span');
      desc.className = 'genome-desc';
      desc.textContent = GENOME_SHORT_DESCS[geneLabel] || '';
      row.appendChild(desc);

      table.appendChild(row);
    }
  }

  // Color genes (depth mode only)
  if (colorMode === 'depth' && cGenes) {
    const header = document.createElement('div');
    header.className = 'genome-group-header';
    header.textContent = 'Color';
    table.appendChild(header);

    for (const [key, value] of [['hue', cGenes.hue], ['spread', cGenes.spread]]) {
      const row = document.createElement('div');
      row.className = 'genome-row';

      const label = document.createElement('span');
      label.className = 'genome-label';
      label.textContent = key;
      row.appendChild(label);

      const val = document.createElement('span');
      val.className = 'genome-value genome-color';
      val.textContent = value;
      row.appendChild(val);

      const desc = document.createElement('span');
      desc.className = 'genome-desc';
      desc.textContent = GENOME_SHORT_DESCS[key] || '';
      row.appendChild(desc);

      table.appendChild(row);
    }
  }
}

const MODE_DESCRIPTIONS = {
  0: '\u201CSuppose we simply pepper a two-dimensional screen with random dots\u2026 Cumulative selection could theoretically be brought to bear, but almost certainly to no avail.\u201D \u2014 Dawkins, p.204',
  1: '\u201CNine genes\u2026 the first eight are used to determine the directions (and lengths) of eight lines\u2026 The ninth gene determines the depth of recursion.\u201D \u2014 Dawkins, p.207',
  2: '\u201CWhat if the constraint of bilateral symmetry is relaxed?\u2026 We can also impose top-bottom symmetry, or both at once.\u201D \u2014 Dawkins, p.210',
  3: '\u201CSegmentation \u2014 the repetition of body units along a backbone \u2014 is one of the great innovations of animal body plans.\u201D \u2014 Dawkins, p.211',
  4: '\u201CIf segments are allowed to differ from each other in a graded fashion\u2026 the creatures begin to look more like real arthropods.\u201D \u2014 Dawkins, p.212',
  5: '\u201CCombining all these embryological tricks\u2026 radial symmetry, alternating asymmetry\u2026 the range of forms is enormously expanded.\u201D \u2014 Dawkins, p.214',
  6: 'Dual Hox programs grow buds from branch-tips: Bud A (orange) on anterior segments, Bud B (purple) on posterior \u2014 like Hox genes expressing different structures along the body axis. 36 genes total.',
};

function updateModeDescription() {
  const el = document.getElementById('mode-description');
  if (el) el.textContent = MODE_DESCRIPTIONS[currentMode] || '';
}

function syncUIControls() {
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', parseInt(tab.dataset.mode) === currentMode);
  });
  document.getElementById('symmetry-controls').style.display = currentMode >= 2 ? 'flex' : 'none';
  document.getElementById('mode5-controls').style.display = currentMode >= 5 ? 'flex' : 'none';
  document.getElementById('symmetry-select').value = symmetryType;
  document.getElementById('alternating-asym').checked = alternatingAsymmetry;
  document.getElementById('radial-sym').checked = radialSymmetry;
  document.getElementById('mutation-intensity').value = mutationIntensity;
  // Mode 6 uses three-color developmental scheme — hide user color controls, show bud legend
  document.getElementById('color-controls').style.display = (currentMode >= 1 && currentMode < 6) ? 'flex' : 'none';
  document.getElementById('color-mode').value = colorMode;
  const budLegend = document.getElementById('bud-legend');
  if (budLegend) budLegend.style.display = currentMode >= 6 ? 'flex' : 'none';
  updateExpeditionButton();
  updateModeDescription();
}

function updateParent() {
  stopAnimation();
  updateHash();

  // Update genome panel
  if (currentMode === 0) {
    document.getElementById('genome-table').innerHTML = '';
  } else {
    renderGenomeTable(parentGenes, colorGenes);
  }

  // Update genealogy if panel is open
  const genPanel = document.getElementById('genealogy-panel');
  if (genPanel) {
    const content = genPanel.querySelector('.panel-content');
    if (content && content.style.display !== 'none') {
      renderGenealogy(evolutionHistory, jumpToHistoryNode);
    }
  }
}

function selectOffspring(childGenes, childColorGenes) {
  parentGenes = childGenes;
  if (childColorGenes) colorGenes = childColorGenes;
  generation++;

  pushHistory();

  updateParent();
  spawnOffspring();
}

function spawnOffspring() {
  offspringGrid.innerHTML = '';

  // ── Parent card (first in grid) ──
  const parentCard = document.createElement('div');
  parentCard.className = 'offspring-card parent-card';

  // Parent label (above canvas)
  const label = document.createElement('div');
  label.className = 'parent-label';
  label.innerHTML = `Parent \u00B7 ${MODE_NAMES[currentMode]} \u00B7 Gen ${generation}`
    + ` \u00B7 <a id="link-3d" href="3d/${encodeState()}" title="View in 3D">3D</a>`;
  parentCard.appendChild(label);

  const pCanvas = document.createElement('canvas');
  pCanvas.width = 180;
  pCanvas.height = 180;
  parentCard.appendChild(pCanvas);
  parentCanvasRef = pCanvas;

  // Parent hover icons (save, play, link)
  const pSaveBtn = document.createElement('button');
  pSaveBtn.className = 'card-icon card-icon-save';
  pSaveBtn.title = 'Save to gallery';
  pSaveBtn.innerHTML = '&#8595;';
  pSaveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    saveToGallery();
    flashIcon(pSaveBtn, '#3fb950');
  });
  parentCard.appendChild(pSaveBtn);

  const pLinkBtn = document.createElement('button');
  pLinkBtn.className = 'card-icon card-icon-link';
  pLinkBtn.title = 'Copy link';
  pLinkBtn.textContent = '\uD83D\uDD17';
  pLinkBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyBiomorphLink(parentGenes, colorGenes, pLinkBtn);
  });
  parentCard.appendChild(pLinkBtn);

  if (currentMode !== 0) {
    const pAnimBtn = document.createElement('button');
    pAnimBtn.className = 'card-icon card-icon-animate';
    pAnimBtn.title = 'Watch growth animation';
    pAnimBtn.innerHTML = '&#9654;';
    parentAnimBtn = pAnimBtn;
    pAnimBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (animationTimer !== null) {
        stopAnimation();
        // Re-render the full parent
        renderBiomorph(parentCanvasRef, parentGenes, colorOptions());
      } else {
        animateGrowth();
      }
    });
    parentCard.appendChild(pAnimBtn);
  } else {
    parentAnimBtn = null;
  }

  offspringGrid.appendChild(parentCard);

  // Render parent
  if (currentMode === 0) {
    renderPeppering(pCanvas, parentGenes);
  } else {
    renderBiomorph(pCanvas, parentGenes, colorOptions());
  }

  // ── 8 Offspring cards ──
  const offspringData = [];
  for (let i = 0; i < NUM_OFFSPRING; i++) {
    const childGenes = currentMode === 0
      ? pepperingMutate(parentGenes)
      : mutate(parentGenes);
    const childColorGenes = colorMode === 'depth' ? mutateColor(colorGenes) : null;
    offspringData.push({ genes: childGenes, colorGenes: childColorGenes });

    const card = document.createElement('div');
    card.className = 'offspring-card';

    const badge = document.createElement('span');
    badge.className = 'offspring-number';
    badge.textContent = String(i + 1);
    card.appendChild(badge);

    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    canvas.title = 'Click to select \u00B7 Shift+click to compare';
    card.appendChild(canvas);

    const saveBtn = document.createElement('button');
    saveBtn.className = 'card-icon card-icon-save';
    saveBtn.title = 'Save to gallery';
    saveBtn.innerHTML = '&#8595;';
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      saveChildToGallery(childGenes, childColorGenes, saveBtn);
    });
    card.appendChild(saveBtn);

    const linkBtn = document.createElement('button');
    linkBtn.className = 'card-icon card-icon-link';
    linkBtn.title = 'Copy link';
    linkBtn.textContent = '\uD83D\uDD17';
    linkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      copyBiomorphLink(childGenes, childColorGenes, linkBtn);
    });
    card.appendChild(linkBtn);

    if (currentMode !== 0) {
      const animBtn = document.createElement('button');
      animBtn.className = 'card-icon card-icon-animate';
      animBtn.title = 'Watch growth animation';
      animBtn.innerHTML = '&#9654;';
      animBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (offspringAnimations.has(canvas)) {
          stopOffspringAnimation(canvas, childGenes, childColorGenes);
          animBtn.innerHTML = '&#9654;';
          animBtn.classList.remove('animating');
        } else {
          animateOffspring(canvas, childGenes, childColorGenes, animBtn);
        }
      });
      card.appendChild(animBtn);
    }

    offspringGrid.appendChild(card);

    if (currentMode === 0) {
      renderPeppering(canvas, childGenes);
    } else {
      renderBiomorph(canvas, childGenes, colorOptions(childColorGenes));
    }

    canvas.addEventListener('click', (e) => {
      if (e.shiftKey) {
        showComparison(childGenes, childColorGenes);
        return;
      }
      selectOffspring(childGenes, childColorGenes);
    });
  }

  window._offspringData = offspringData;
}

function restoreFromNode(node) {
  parentGenes = node.genes.slice();
  generation = node.generation;
  currentMode = node.mode;
  symmetryType = node.symmetry;
  alternatingAsymmetry = node.alternatingAsym;
  radialSymmetry = node.radialSym;
  if (node.colorGenes) {
    colorMode = node.colorMode || (node.colorEnabled ? 'depth' : 'none');
    colorGenes = { hue: node.colorGenes.hue, spread: node.colorGenes.spread };
  }
  syncUIControls();
}

function jumpToHistoryNode(id) {
  const node = evolutionHistory.jumpTo(id);
  if (!node) return;
  restoreFromNode(node);
  updateParent();
  spawnOffspring();
}

// ── Mode switching ───────────────────────────────────────────

function setMode(mode) {
  const prevMode = currentMode;
  currentMode = mode;

  // Adapt genes to new mode
  if (prevMode === 0 || mode === 0) {
    parentGenes = mode === 0 ? pepperingOriginGenotype() : originGenotype();
  } else {
    parentGenes = adaptGenes(parentGenes, mode);
  }

  generation = 0;

  // Reset history on mode change
  evolutionHistory.reset();
  pushHistory();

  syncUIControls();
  autoSelectCollection();
  renderGallery();
  updateParent();
  spawnOffspring();
}

// ── Send to Expedition ──────────────────────────────────────

const EXPEDITION_ADJECTIVES = {
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

const EXPEDITION_NOUNS_BY_MODE = {
  1: ['Fern', 'Branch', 'Twig', 'Sapling', 'Bough'],
  2: ['Shrub', 'Bush', 'Thicket', 'Hedge'],
  3: ['Caterpillar', 'Spine', 'Centipede', 'Worm', 'Crawler'],
  4: ['Cascade', 'Coral', 'Fan', 'Crest'],
  5: ['Plume', 'Spiral', 'Tendril', 'Bloom'],
  6: ['Hydra', 'Polyp', 'Anemone', 'Zooid', 'Colony'],
};

const EXPEDITION_FALLBACK_NOUNS = ['Form', 'Shape', 'Creature', 'Being'];

function expeditionRarity(genes, mode) {
  const depth = genes[8] || 1;
  const dirGenes = genes.slice(0, 8);
  const avgExtremity = dirGenes.reduce((s, g) => s + Math.abs(g), 0) / dirGenes.length;

  let score = 0;
  score += (depth - 1) * 3;
  score += (mode - 1) * 4;
  score += Math.min(avgExtremity, 9) * 1.5;

  if (genes.length > 9) score += ((genes[9] || 1) - 1) * 1.5;
  if (genes.length > 11) score += (Math.abs(genes[11] || 0) + Math.abs(genes[12] || 0)) * 0.5;

  if (score >= 45) return 'legendary';
  if (score >= 32) return 'epic';
  if (score >= 20) return 'rare';
  if (score >= 10) return 'uncommon';
  return 'common';
}

function expeditionName(genes, mode) {
  function symScore(g) {
    const pairs = [[0,6], [1,5], [2,4]];
    let s = 0;
    for (const [a, b] of pairs) s += (3 - Math.min(Math.abs(g[a] + g[b]), 3)) / 3;
    return s / pairs.length;
  }
  function cmplxScore(g) {
    let nz = 0;
    for (let i = 0; i < 8; i++) if (g[i] !== 0) nz++;
    return (nz / 8) * 0.4 + ((g[8] - 1) / 7) * 0.6;
  }
  function balScore(g) {
    const hM = Math.abs(g[0]) + Math.abs(g[1]) + Math.abs(g[2]);
    const vM = Math.abs(g[4]) + Math.abs(g[5]) + Math.abs(g[6]);
    const t = hM + vM;
    return t === 0 ? 0.5 : Math.min(hM, vM) / t;
  }

  let h = mode * 31;
  for (let i = 0; i < genes.length; i++) h = ((h << 5) - h + Math.round(genes[i]) + 128) | 0;
  h = Math.abs(h);

  const depth = genes[8];
  const sym = symScore(genes);
  const cmplx = cmplxScore(genes);
  const bal = balScore(genes);

  let adjPool;
  if (depth <= 2) adjPool = EXPEDITION_ADJECTIVES.tiny;
  else if (depth >= 7) adjPool = EXPEDITION_ADJECTIVES.grand;
  else if (sym > 0.8) adjPool = EXPEDITION_ADJECTIVES.highSymmetry;
  else if (sym < 0.3) adjPool = EXPEDITION_ADJECTIVES.lowSymmetry;
  else if (cmplx > 0.7) adjPool = EXPEDITION_ADJECTIVES.highComplexity;
  else if (bal > 0.4) adjPool = EXPEDITION_ADJECTIVES.stout;
  else if (bal < 0.15) adjPool = EXPEDITION_ADJECTIVES.spindly;
  else adjPool = EXPEDITION_ADJECTIVES.neutral;

  const adj = adjPool[h % adjPool.length];
  const nouns = EXPEDITION_NOUNS_BY_MODE[mode] || EXPEDITION_FALLBACK_NOUNS;
  const noun = nouns[(h >> 3) % nouns.length];
  return `${adj} ${noun}`;
}

const EXPEDITION_RARITY_LABELS = {
  common: 'Common', uncommon: 'Uncommon', rare: 'Rare', epic: 'Epic', legendary: 'Legendary'
};

function showExpeditionToast(message, rarity) {
  let toast = document.getElementById('expedition-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'expedition-toast';
    toast.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);' +
      'padding:10px 20px;border-radius:8px;color:#fff;font-weight:bold;z-index:9999;' +
      'opacity:0;transition:opacity 0.3s;pointer-events:none;text-align:center;' +
      'font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.3);';
    document.body.appendChild(toast);
  }
  const colors = { common:'#666', uncommon:'#3a3', rare:'#38e', epic:'#94f', legendary:'#f90' };
  toast.style.background = colors[rarity] || '#444';
  toast.textContent = message;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

function sendToExpedition() {
  if (currentMode === 0) return;

  const genes = parentGenes;
  const mode = currentMode;
  const hash = `m${mode}:${genes.map(g => Math.round(g * 10) / 10).join(',')}`;

  const raw = localStorage.getItem('expedition-registry');
  if (!raw) {
    showExpeditionToast('Visit Expedition first to initialize the registry.', 'common');
    return;
  }
  const registry = JSON.parse(raw);

  if (registry.entries[hash]) {
    showExpeditionToast(`Already in Expedition: "${registry.entries[hash].name}"`, 'common');
    return;
  }

  const rarity = expeditionRarity(genes, mode);
  const name = expeditionName(genes, mode);
  const entry = { discoverer: 'player', genes: genes.slice(), mode, rarity, name, time: Date.now() };
  registry.entries[hash] = entry;

  if (!registry.collectors.player) registry.collectors.player = { count: 0, specimens: [] };
  registry.collectors.player.count++;
  registry.collectors.player.specimens.push(hash);
  registry.log.push({ hash, discoverer: 'player', rarity, name, time: entry.time });

  localStorage.setItem('expedition-registry', JSON.stringify(registry));
  showExpeditionToast(`Sent "${name}" (${EXPEDITION_RARITY_LABELS[rarity]}) to Expedition!`, rarity);
}

function updateExpeditionButton() {
  const btn = document.getElementById('btn-send-expedition');
  if (btn) btn.style.display = currentMode === 0 ? 'none' : '';
}

// ── Init ─────────────────────────────────────────────────────

function init() {
  // Check URL hash for saved state
  const savedState = decodeState(window.location.hash);

  if (savedState) {
    currentMode = savedState.mode;
    parentGenes = savedState.genes;
    symmetryType = savedState.symmetry;
    alternatingAsymmetry = savedState.alternatingAsym;
    radialSymmetry = savedState.radialSym;
    mutationIntensity = savedState.mutationIntensity;
    generation = savedState.generation;
    colorMode = savedState.colorMode || 'none';
    if (savedState.colorGenes) colorGenes = savedState.colorGenes;

    syncUIControls();

    pushHistory();

    updateParent();
    spawnOffspring();
  } else {
    setMode(1);
    // Start with a random biomorph so first-time visitors see something
    parentGenes = randomGenotype();
    evolutionHistory.reset();
    pushHistory();
    updateParent();
    spawnOffspring();
  }

  // Tab clicks
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.addEventListener('click', () => setMode(parseInt(tab.dataset.mode)));
  });

  // Symmetry selector
  const symSelect = document.getElementById('symmetry-select');
  if (symSelect) {
    symSelect.addEventListener('change', (e) => {
      symmetryType = e.target.value;
      updateParent();
      spawnOffspring();
    });
  }

  // Mode 5 toggles
  const altAsym = document.getElementById('alternating-asym');
  if (altAsym) {
    altAsym.addEventListener('change', (e) => {
      alternatingAsymmetry = e.target.checked;
      updateParent();
      spawnOffspring();
    });
  }
  const radSym = document.getElementById('radial-sym');
  if (radSym) {
    radSym.addEventListener('change', (e) => {
      radialSymmetry = e.target.checked;
      updateParent();
      spawnOffspring();
    });
  }

  // Mutation intensity (F5)
  document.getElementById('mutation-intensity').addEventListener('change', (e) => {
    mutationIntensity = parseInt(e.target.value);
  });

  // Color mode
  document.getElementById('color-mode').addEventListener('change', (e) => {
    colorMode = e.target.value;
    updateParent();
    spawnOffspring();
  });

  // Breed — open mate picker for sexual reproduction
  document.getElementById('btn-breed').addEventListener('click', () => {
    openMatePicker();
  });

  // Reroll — regenerate offspring from same parent
  document.getElementById('btn-reroll').addEventListener('click', () => {
    spawnOffspring();
  });

  // Random — respects dropdown (Interesting / Pure random)
  document.getElementById('btn-random').addEventListener('click', () => {
    const mode = document.getElementById('random-mode').value;
    if (mode === 'interesting') {
      parentGenes = currentMode === 0 ? pepperingOriginGenotype() : randomInteresting();
    } else {
      parentGenes = currentMode === 0 ? pepperingOriginGenotype() : randomGenotype();
    }
    generation = 0;
    evolutionHistory.reset();
    pushHistory();
    updateParent();
    spawnOffspring();
  });

  // Undo
  document.getElementById('btn-undo').addEventListener('click', () => {
    const node = evolutionHistory.undo();
    if (node) {
      restoreFromNode(node);
      updateParent();
      spawnOffspring();
    }
  });

  // Send to Expedition
  document.getElementById('btn-send-expedition').addEventListener('click', sendToExpedition);

  // Collapsible panels (Gallery + Genealogy)
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      const isOpen = content.style.display !== 'none';
      content.style.display = isOpen ? 'none' : 'block';
      btn.classList.toggle('open', !isOpen);

      // Render genealogy when opening its panel
      if (!isOpen && content.closest('#genealogy-panel')) {
        renderGenealogy(evolutionHistory, jumpToHistoryNode);
      }
    });
  });

  // Gallery collection switcher
  const collSel = document.getElementById('gallery-collection');
  if (collSel) {
    collSel.addEventListener('change', () => {
      currentCollection = collSel.value;
      renderGallery();
    });
  }
  autoSelectCollection();
  renderGallery();
  renderGenealogy(evolutionHistory, jumpToHistoryNode);

  // Comparison modal (F7)
  document.getElementById('compare-dismiss').addEventListener('click', hideComparison);
  document.getElementById('compare-select').addEventListener('click', () => {
    if (comparisonChildGenes) {
      const genes = comparisonChildGenes;
      const cColors = comparisonChildColorGenes;
      hideComparison();
      selectOffspring(genes, cColors);
    }
  });
  document.getElementById('comparison-modal').addEventListener('click', (e) => {
    if (e.target.id === 'comparison-modal') hideComparison();
  });

  // Breed modal
  document.getElementById('breed-dismiss').addEventListener('click', hideBreedModal);
  document.getElementById('breed-modal').addEventListener('click', (e) => {
    if (e.target.id === 'breed-modal') hideBreedModal();
  });

  // Mate picker modal
  document.getElementById('mate-picker-cancel').addEventListener('click', closeMatePicker);
  document.getElementById('mate-picker-modal').addEventListener('click', (e) => {
    if (e.target.id === 'mate-picker-modal') closeMatePicker();
  });

  // About modal
  document.getElementById('btn-about').addEventListener('click', () => {
    document.getElementById('about-modal').style.display = 'flex';
  });
  document.getElementById('about-close').addEventListener('click', () => {
    document.getElementById('about-modal').style.display = 'none';
  });
  document.getElementById('about-modal').addEventListener('click', (e) => {
    if (e.target.id === 'about-modal') e.target.style.display = 'none';
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideComparison(); hideBreedModal(); closeMatePicker(); document.getElementById('about-modal').style.display = 'none'; }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      const node = evolutionHistory.undo();
      if (node) {
        restoreFromNode(node);
        updateParent();
        spawnOffspring();
      }
    }
    // Number keys 1-8 to select offspring
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key >= '1' && e.key <= '8') {
      if (document.querySelector('#comparison-modal[style*="flex"], #breed-modal[style*="flex"], #mate-picker-modal[style*="flex"]')) return;
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT' || document.activeElement.tagName === 'TEXTAREA') return;
      const idx = parseInt(e.key) - 1;
      if (window._offspringData && window._offspringData[idx]) {
        selectOffspring(window._offspringData[idx].genes, window._offspringData[idx].colorGenes);
      }
    }
  });
}

if (document.getElementById('offspring-grid')) init();
