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
let mutationIntensity = 1; // F5: 1=Gentle, 2=Moderate, 3=Wild

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
};

// ── URL hash encoding (F3) ──────────────────────────────────

const SYM_CODES = { 'left-right': 'lr', 'up-down': 'ud', 'four-way': 'fw', 'asymmetric': 'as' };
const SYM_DECODE = { lr: 'left-right', ud: 'up-down', fw: 'four-way', as: 'asymmetric' };

function encodeState() {
  const parts = [`m=${currentMode}`];

  if (currentMode === 0) {
    // Compact hex encoding for 256-element binary array
    let hex = '';
    for (let i = 0; i < parentGenes.length; i += 4) {
      let nibble = 0;
      for (let j = 0; j < 4 && i + j < parentGenes.length; j++) {
        if (parentGenes[i + j]) nibble |= (1 << j);
      }
      hex += nibble.toString(16);
    }
    parts.push(`g=${hex}`);
  } else {
    parts.push(`g=${parentGenes.join(',')}`);
    parts.push(`s=${SYM_CODES[symmetryType] || 'lr'}`);
    if (alternatingAsymmetry) parts.push('aa=1');
    if (radialSymmetry) parts.push('rs=1');
  }

  if (mutationIntensity !== 1) parts.push(`mi=${mutationIntensity}`);
  parts.push(`gen=${generation}`);

  return '#' + parts.join('&');
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

  return {
    mode,
    genes,
    symmetry: SYM_DECODE[params.s] || 'left-right',
    alternatingAsym: params.aa === '1',
    radialSym: params.rs === '1',
    mutationIntensity: parseInt(params.mi) || 1,
    generation: parseInt(params.gen) || 0,
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
  return genes;
}

function cloneGenes(genes) {
  return genes.slice();
}

function mutate(genes) {
  const config = getConfig();
  const child = cloneGenes(genes);
  const i = Math.floor(Math.random() * config.geneCount);
  // F5: mutation intensity controls max step size
  const maxDelta = mutationIntensity;
  const delta = (1 + Math.floor(Math.random() * maxDelta)) * (Math.random() < 0.5 ? -1 : 1);
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

// ── Gallery (F2) ────────────────────────────────────────────

const GALLERY_KEY = 'biomorph-gallery';

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
    renderBiomorph(canvas, parentGenes);
  }
  return canvas.toDataURL('image/png');
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
  };
  gallery.push(specimen);
  localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
  renderGallery();

  // Visual feedback
  const btn = document.getElementById('btn-save');
  btn.textContent = 'Saved!';
  setTimeout(() => btn.textContent = 'Save', 1500);
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

  syncUIControls();

  // Push to history
  evolutionHistory.reset();
  const node = evolutionHistory.push(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, generation);
  captureNodeThumbnail(evolutionHistory, node);

  updateParent();
  spawnOffspring();
}

function renderGallery() {
  const content = document.getElementById('gallery-content');
  if (!content) return;

  const gallery = loadGallery();
  content.innerHTML = '';

  if (gallery.length === 0) {
    content.innerHTML = '<p class="gallery-empty">No saved specimens. Click "Save" to add the current biomorph.</p>';
    return;
  }

  for (const spec of gallery) {
    const card = document.createElement('div');
    card.className = 'gallery-card';

    const img = document.createElement('img');
    img.src = spec.thumbnail;
    img.draggable = false;
    card.appendChild(img);

    const nameEl = document.createElement('input');
    nameEl.className = 'gallery-name';
    nameEl.value = spec.name;
    nameEl.addEventListener('change', () => renameInGallery(spec.id, nameEl.value));
    card.appendChild(nameEl);

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

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', () => deleteFromGallery(spec.id));
    actions.appendChild(delBtn);

    card.appendChild(actions);
    content.appendChild(card);
  }
}

// ── Comparison modal (F7) ───────────────────────────────────

let comparisonChildGenes = null;

function showComparison(childGenes) {
  const modal = document.getElementById('comparison-modal');
  if (!modal) return;

  comparisonChildGenes = childGenes;
  modal.style.display = 'flex';

  // Render parent
  const pCanvas = document.getElementById('compare-parent');
  if (currentMode === 0) {
    renderPeppering(pCanvas, parentGenes);
  } else {
    renderBiomorph(pCanvas, parentGenes);
  }

  // Render child
  const cCanvas = document.getElementById('compare-child');
  if (currentMode === 0) {
    renderPeppering(cCanvas, childGenes);
  } else {
    renderBiomorph(cCanvas, childGenes);
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

const parentCanvas = document.getElementById('parent');
const geneDisplay = document.getElementById('gene-display');
const offspringGrid = document.getElementById('offspring-grid');
const genCounter = document.getElementById('generation-counter');

const evolutionHistory = new EvolutionHistory();

function renderGeneChips(genes) {
  const config = getConfig();
  geneDisplay.innerHTML = '';
  for (let i = 0; i < config.geneCount; i++) {
    const chip = document.createElement('span');
    chip.className = 'gene-chip';
    chip.textContent = `${config.geneLabels[i]}=${genes[i]}`;
    const tooltip = GENE_TOOLTIPS[config.geneLabels[i]];
    if (tooltip) chip.dataset.tooltip = tooltip;
    geneDisplay.appendChild(chip);
  }
}

const MODE_DESCRIPTIONS = {
  0: '\u201CSuppose we simply pepper a two-dimensional screen with random dots\u2026 Cumulative selection could theoretically be brought to bear, but almost certainly to no avail.\u201D \u2014 Dawkins, p.204',
  1: '\u201CNine genes\u2026 the first eight are used to determine the directions (and lengths) of eight lines\u2026 The ninth gene determines the depth of recursion.\u201D \u2014 Dawkins, p.207',
  2: '\u201CWhat if the constraint of bilateral symmetry is relaxed?\u2026 We can also impose top-bottom symmetry, or both at once.\u201D \u2014 Dawkins, p.210',
  3: '\u201CSegmentation \u2014 the repetition of body units along a backbone \u2014 is one of the great innovations of animal body plans.\u201D \u2014 Dawkins, p.211',
  4: '\u201CIf segments are allowed to differ from each other in a graded fashion\u2026 the creatures begin to look more like real arthropods.\u201D \u2014 Dawkins, p.212',
  5: '\u201CCombining all these embryological tricks\u2026 radial symmetry, alternating asymmetry\u2026 the range of forms is enormously expanded.\u201D \u2014 Dawkins, p.214',
};

function updateModeDescription() {
  document.getElementById('mode-description').textContent = MODE_DESCRIPTIONS[currentMode] || '';
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
  document.getElementById('btn-interesting').disabled = currentMode === 0;
  updateModeDescription();
}

function updateParent() {
  if (currentMode === 0) {
    renderPeppering(parentCanvas, parentGenes);
    geneDisplay.innerHTML = '';
    geneDisplay.textContent = pepperingFormatGenes(parentGenes);
  } else {
    renderBiomorph(parentCanvas, parentGenes);
    renderGeneChips(parentGenes);
  }
  genCounter.textContent = `Generation: ${generation}`;
  updateHash();
  updateHistoryStrip(evolutionHistory, jumpToHistoryNode);

  // Update genealogy if panel is open
  const genPanel = document.getElementById('genealogy-panel');
  if (genPanel) {
    const content = genPanel.querySelector('.panel-content');
    if (content && content.style.display !== 'none') {
      renderGenealogy(evolutionHistory, jumpToHistoryNode);
    }
  }
}

function selectOffspring(childGenes) {
  parentGenes = childGenes;
  generation++;

  const node = evolutionHistory.push(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, generation);
  captureNodeThumbnail(evolutionHistory, node);

  updateParent();
  spawnOffspring();
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
    canvas.title = 'Click to select \u00B7 Shift+click to compare';
    offspringGrid.appendChild(canvas);

    if (currentMode === 0) {
      renderPeppering(canvas, childGenes);
    } else {
      renderBiomorph(canvas, childGenes);
    }

    canvas.addEventListener('click', (e) => {
      if (e.shiftKey) {
        showComparison(childGenes);
        return;
      }
      selectOffspring(childGenes);
    });
  }
}

function restoreFromNode(node) {
  parentGenes = node.genes.slice();
  generation = node.generation;
  currentMode = node.mode;
  symmetryType = node.symmetry;
  alternatingAsymmetry = node.alternatingAsym;
  radialSymmetry = node.radialSym;
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
  const node = evolutionHistory.push(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, generation);
  captureNodeThumbnail(evolutionHistory, node);

  syncUIControls();
  updateParent();
  spawnOffspring();
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

    syncUIControls();

    const node = evolutionHistory.push(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, generation);
    captureNodeThumbnail(evolutionHistory, node);

    updateParent();
    spawnOffspring();
  } else {
    setMode(1);
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

  // Random Parent
  document.getElementById('btn-random').addEventListener('click', () => {
    parentGenes = currentMode === 0 ? pepperingRandomGenotype() : randomGenotype();
    generation = 0;
    evolutionHistory.reset();
    const node = evolutionHistory.push(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, generation);
    captureNodeThumbnail(evolutionHistory, node);
    updateParent();
    spawnOffspring();
  });

  // Reset to Origin
  document.getElementById('btn-reset').addEventListener('click', () => {
    parentGenes = currentMode === 0 ? pepperingOriginGenotype() : originGenotype();
    generation = 0;
    evolutionHistory.reset();
    const node = evolutionHistory.push(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, generation);
    captureNodeThumbnail(evolutionHistory, node);
    updateParent();
    spawnOffspring();
  });

  // Undo (F1)
  document.getElementById('btn-undo').addEventListener('click', () => {
    const node = evolutionHistory.undo();
    if (node) {
      restoreFromNode(node);
      updateParent();
      spawnOffspring();
    }
  });

  // Save to gallery (F2)
  document.getElementById('btn-save').addEventListener('click', saveToGallery);

  // Copy link (F3)
  document.getElementById('btn-copy-link').addEventListener('click', () => {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      const btn = document.getElementById('btn-copy-link');
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy Link', 1500);
    });
  });

  // Random Interesting (F4)
  document.getElementById('btn-interesting').addEventListener('click', () => {
    if (currentMode === 0) return;
    parentGenes = randomInteresting();
    generation = 0;
    evolutionHistory.reset();
    const node = evolutionHistory.push(parentGenes, currentMode, symmetryType, alternatingAsymmetry, radialSymmetry, generation);
    captureNodeThumbnail(evolutionHistory, node);
    updateParent();
    spawnOffspring();
  });

  // Collapsible panels (Gallery + Genealogy)
  document.querySelectorAll('.panel-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const content = btn.nextElementSibling;
      const isOpen = content.style.display !== 'none';
      content.style.display = isOpen ? 'none' :
        (content.id === 'gallery-content' ? 'grid' : 'block');
      btn.classList.toggle('open', !isOpen);

      // Render genealogy when opening its panel
      if (!isOpen && content.closest('#genealogy-panel')) {
        renderGenealogy(evolutionHistory, jumpToHistoryNode);
      }
    });
  });

  // Load gallery on startup
  renderGallery();

  // Comparison modal (F7)
  document.getElementById('compare-dismiss').addEventListener('click', hideComparison);
  document.getElementById('compare-select').addEventListener('click', () => {
    if (comparisonChildGenes) {
      const genes = comparisonChildGenes;
      hideComparison();
      selectOffspring(genes);
    }
  });
  document.getElementById('comparison-modal').addEventListener('click', (e) => {
    if (e.target.id === 'comparison-modal') hideComparison();
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideComparison();
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      const node = evolutionHistory.undo();
      if (node) {
        restoreFromNode(node);
        updateParent();
        spawnOffspring();
      }
    }
  });
}

init();
