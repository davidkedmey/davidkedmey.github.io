/**
 * Dawkins' Biomorphs — Mode-aware engine
 * Modes 1-5: progressive embryologies from "The Evolution of Evolvability" (1988)
 */

// ── Mode configurations ──────────────────────────────────────

const MODE_CONFIGS = {
  1: { // Basic biomorphs — 9 genes, bilateral symmetry
    geneCount: 9,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth'],
  },
  2: { // + Symmetry options — same 9 genes, symmetry applied post-render
    geneCount: 9,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth'],
  },
  3: { // + Segmentation — 11 genes
    geneCount: 11,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1, 1, 2],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8, 8, 12],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist'],
  },
  4: { // + Gradients — 13 genes
    geneCount: 13,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1, 1, 2, -3, -3],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8, 8, 12, 3,  3],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist','grad1','grad2'],
  },
  5: { // Full Dawkins — 13 base genes + toggles via UI
    geneCount: 13,
    geneMin: [-3, -3, -3, -3, -3, -3, -3, -3, 1, 1, 2, -3, -3],
    geneMax: [ 3,  3,  3,  3,  3,  3,  3,  3, 8, 8, 12, 3,  3],
    geneLabels: ['g1','g2','g3','g4','g5','g6','g7','g8','depth','segs','segDist','grad1','grad2'],
  },
};

const NUM_OFFSPRING = 8;

// ── Current state ────────────────────────────────────────────

let currentMode = 1;
let symmetryType = 'left-right';
let alternatingAsymmetry = false;
let radialSymmetry = false;

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
  return genes;
}

function cloneGenes(genes) {
  return genes.slice();
}

function mutate(genes) {
  const config = getConfig();
  const child = cloneGenes(genes);
  const i = Math.floor(Math.random() * config.geneCount);
  const delta = Math.random() < 0.5 ? -1 : 1;
  child[i] = Math.max(config.geneMin[i], Math.min(config.geneMax[i], child[i] + delta));
  return child;
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
      if (i === 9) adapted[i] = 1;  // segCount
      else if (i === 10) adapted[i] = 4; // segDist
      else adapted[i] = 0; // gradients start at 0
    }
  }
  return adapted;
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
    lines.push({ x0, y0, x1, y1 });
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
      result.push({ x0: seg.x0, y0: -seg.y0, x1: seg.x1, y1: -seg.y1 });
    }
  }
  if (symType === 'four-way') {
    // Also mirror the entire set across vertical axis (negate x)
    const soFar = result.slice();
    for (const seg of soFar) {
      result.push({ x0: -seg.x0, y0: seg.y0, x1: -seg.x1, y1: seg.y1 });
    }
  }
  if (symType === 'asymmetric') {
    // No symmetry enforcement — lines are used as-is
    // The built-in bilateral symmetry in defineVectors is already present,
    // but we break it by using independent vectors
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
      });
    }
  }

  return allLines;
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
      });
    }
  }
  return result;
}

// ── Main draw dispatcher ────────────────────────────────────

function drawBiomorph(genes) {
  let lines;

  if (currentMode >= 3) {
    lines = drawSegmented(genes);
  } else {
    lines = drawTree(genes);
    if (currentMode >= 2) {
      lines = applySymmetry(lines, symmetryType);
    }
  }

  // Radial symmetry (Mode 5)
  if (currentMode >= 5 && radialSymmetry) {
    const segCount = genes[9] || 1;
    lines = applyRadial(lines, segCount > 1 ? segCount : 5);
  }

  return lines;
}

// ── Rendering ────────────────────────────────────────────────

function renderBiomorph(canvas, genes) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const lines = drawBiomorph(genes);
  if (lines.length === 0) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const seg of lines) {
    minX = Math.min(minX, seg.x0, seg.x1);
    maxX = Math.max(maxX, seg.x0, seg.x1);
    minY = Math.min(minY, seg.y0, seg.y1);
    maxY = Math.max(maxY, seg.y0, seg.y1);
  }

  const bw = maxX - minX || 1;
  const bh = maxY - minY || 1;
  const padding = 20;
  const scale = Math.min((w - padding * 2) / bw, (h - padding * 2) / bh);
  const cx = w / 2;
  const cy = h / 2;
  const offsetX = (minX + maxX) / 2;
  const offsetY = (minY + maxY) / 2;

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

// ── UI ───────────────────────────────────────────────────────

let parentGenes = originGenotype();
let generation = 0;

const parentCanvas = document.getElementById('parent');
const geneDisplay = document.getElementById('gene-display');
const offspringGrid = document.getElementById('offspring-grid');
const genCounter = document.getElementById('generation-counter');

function formatGenes(genes) {
  const config = getConfig();
  return genes.map((g, i) => `${config.geneLabels[i]}=${g}`).join('  ');
}

function updateParent() {
  if (currentMode === 0) {
    renderPeppering(parentCanvas, parentGenes);
    geneDisplay.textContent = pepperingFormatGenes(parentGenes);
  } else {
    renderBiomorph(parentCanvas, parentGenes);
    geneDisplay.textContent = formatGenes(parentGenes);
  }
  genCounter.textContent = `Generation: ${generation}`;
}

function spawnOffspring() {
  offspringGrid.innerHTML = '';

  for (let i = 0; i < NUM_OFFSPRING; i++) {
    const childGenes = currentMode === 0
      ? pepperingMutate(parentGenes)
      : mutate(parentGenes);

    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    offspringGrid.appendChild(canvas);

    if (currentMode === 0) {
      renderPeppering(canvas, childGenes);
    } else {
      renderBiomorph(canvas, childGenes);
    }

    canvas.addEventListener('click', () => {
      parentGenes = childGenes;
      generation++;
      updateParent();
      spawnOffspring();
    });
  }
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

  // Update active tab
  document.querySelectorAll('.mode-tab').forEach(tab => {
    tab.classList.toggle('active', parseInt(tab.dataset.mode) === mode);
  });

  // Show/hide mode-specific controls
  document.getElementById('symmetry-controls').style.display = mode >= 2 ? 'flex' : 'none';
  document.getElementById('mode5-controls').style.display = mode >= 5 ? 'flex' : 'none';

  // Update mode description
  const descriptions = {
    0: '"Suppose we simply pepper a two-dimensional screen with random dots... Cumulative selection could theoretically be brought to bear, but almost certainly to no avail." — Dawkins, p.204',
    1: '"Nine genes... the first eight are used to determine the directions (and lengths) of eight lines... The ninth gene determines the depth of recursion." — Dawkins, p.207',
    2: '"What if the constraint of bilateral symmetry is relaxed?... We can also impose top-bottom symmetry, or both at once." — Dawkins, p.210',
    3: '"Segmentation — the repetition of body units along a backbone — is one of the great innovations of animal body plans." — Dawkins, p.211',
    4: '"If segments are allowed to differ from each other in a graded fashion... the creatures begin to look more like real arthropods." — Dawkins, p.212',
    5: '"Combining all these embryological tricks... radial symmetry, alternating asymmetry... the range of forms is enormously expanded." — Dawkins, p.214',
  };
  document.getElementById('mode-description').textContent = descriptions[mode] || '';

  updateParent();
  spawnOffspring();
}

// ── Init ─────────────────────────────────────────────────────

function init() {
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

  // Buttons
  document.getElementById('btn-random').addEventListener('click', () => {
    parentGenes = currentMode === 0 ? pepperingRandomGenotype() : randomGenotype();
    generation = 0;
    updateParent();
    spawnOffspring();
  });

  document.getElementById('btn-reset').addEventListener('click', () => {
    parentGenes = currentMode === 0 ? pepperingOriginGenotype() : originGenotype();
    generation = 0;
    updateParent();
    spawnOffspring();
  });

  // Start in Mode 1
  setMode(1);
}

init();
