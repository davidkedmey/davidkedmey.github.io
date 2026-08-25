import { mutate, randomInteresting, MODE_CONFIGS } from '../shared/genotype.js';
import { renderField, renderTree } from './render.js';
import { GENE_ROLES, expressGenes } from './field.js';

const MODE = 1;                 // 9 genes, the base Dawkins genotype
const CELL = 168;               // offspring canvas size in CSS px
const DPR = Math.min(2, window.devicePixelRatio || 1);
const CELL_PX = Math.round(CELL * DPR);
const CHILD_PER_COPY = 1500;
const COMPARE_PER_COPY = 2600;
const GALLERY_KEY = 'biomorph-gallery';

const grid = document.getElementById('grid');
const cmpField = document.getElementById('cmp-field');
const cmpTree = document.getElementById('cmp-tree');
const geneRows = document.getElementById('gene-rows');
const genLabel = document.getElementById('gen');
const statusEl = document.getElementById('status');

let parent = null;   // set below, after seedGenotype is defined
let children = [];
let lineage = [];               // previous parents, for Back
let generation = 0;
let t = 0;
let speed = 0.06;

// ── grid construction ─────────────────────────────────────────

const cells = [];               // 9 cells; index 4 is the parent
for (let i = 0; i < 9; i++) {
  const cell = document.createElement('div');
  cell.className = 'cell';
  const canvas = document.createElement('canvas');
  canvas.width = CELL_PX;
  canvas.height = CELL_PX;
  cell.appendChild(canvas);
  const tag = document.createElement('span');
  tag.className = 'tag';
  cell.appendChild(tag);
  grid.appendChild(cell);
  cells.push({ cell, canvas, tag });

  if (i === 4) {
    cell.classList.add('parent');
    tag.textContent = 'Parent';
  } else {
    tag.textContent = '';
    cell.addEventListener('click', () => select(i));
  }
}

function childIndexFor(cellIndex) {
  return cellIndex < 4 ? cellIndex : cellIndex - 1;
}

// ── the selection loop ────────────────────────────────────────

function intensity() {
  return parseInt(document.getElementById('intensity').value, 10) || 1;
}

function breed() {
  const n = intensity();
  children = [];
  for (let i = 0; i < 8; i++) {
    let child = mutate(parent, MODE, n);
    // A mutation that lands back on the parent wastes a slot; try again.
    let tries = 0;
    while (same(child, parent) && tries++ < 8) child = mutate(parent, MODE, n);
    children.push(child);
  }
}

function same(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function select(cellIndex) {
  lineage.push(parent.slice());
  parent = children[childIndexFor(cellIndex)].slice();
  generation++;
  breed();
  refresh();
}

function newBrood() { breed(); refresh(); }

function back() {
  if (!lineage.length) return;
  parent = lineage.pop();
  generation = Math.max(0, generation - 1);
  breed();
  refresh();
}

/**
 * randomInteresting() picks freely across the gene space; g7 near its floor makes every
 * copy a speck too small to judge, so start selection somewhere the form is visible.
 */
function seedGenotype() {
  const g = randomInteresting(MODE);
  if (g[6] < -2) g[6] = -2 + Math.floor(Math.random() * 8);
  return g;
}

function seed() {
  lineage = [];
  generation = 0;
  parent = seedGenotype();
  breed();
  refresh();
}

// ── panels ────────────────────────────────────────────────────

function refresh() {
  genLabel.textContent = generation;
  document.getElementById('btn-back').disabled = lineage.length === 0;
  renderTree(cmpTree, parent);
  drawGeneTable();
}

function drawGeneTable() {
  const p = expressGenes(parent);
  const values = [p.h1, p.h2, p.h3, p.h4, p.ratio, p.carrier,
                  p.fuzz.toFixed(2), p.sweep.toFixed(2) + ' rev', p.phases];
  geneRows.innerHTML = GENE_ROLES.map((r, i) => `
    <tr>
      <td class="name">${r.gene}</td>
      <td class="val">${parent[i]}</td>
      <td class="role">${r.field} <span style="color:#4d6070">= ${values[i]}</span></td>
      <td class="tree">${r.tree}</td>
    </tr>`).join('');
}

// ── gallery (shared with the breeder) ─────────────────────────

function loadGallery() {
  try { return JSON.parse(localStorage.getItem(GALLERY_KEY)) || []; }
  catch { return []; }
}

function thumbnail(genes) {
  const c = document.createElement('canvas');
  c.width = 96; c.height = 96;
  renderField(c, genes, 3.2, 700);
  return c.toDataURL('image/png');
}

function saveCurrent() {
  const gallery = loadGallery();
  gallery.push({
    id: Date.now(),
    name: `Bloom ${gallery.length + 1}`,
    genes: parent.slice(),
    mode: MODE,
    symmetry: 'left-right',
    alternatingAsym: false,
    radialSym: false,
    generation,
    thumbnail: thumbnail(parent),
    colorMode: 'none',
    colorEnabled: false,
    colorGenes: { hue: 0, spread: 0 },
  });
  try {
    localStorage.setItem(GALLERY_KEY, JSON.stringify(gallery));
    statusEl.textContent = 'Saved. It will also appear in the breeder.';
  } catch {
    statusEl.textContent = 'Could not save — browser storage is full.';
  }
  drawGalleryList();
}

function drawGalleryList() {
  const list = document.getElementById('gallery-list');
  const empty = document.getElementById('gallery-empty');
  const config = MODE_CONFIGS[MODE];
  // Any 9-gene-or-longer specimen can be read by the field rule; take its first 9.
  const usable = loadGallery().filter(s => Array.isArray(s.genes) && s.genes.length >= config.geneCount);
  list.innerHTML = '';
  empty.style.display = usable.length ? 'none' : 'block';
  for (const spec of usable.slice(-16).reverse()) {
    const img = document.createElement('img');
    img.src = spec.thumbnail || thumbnail(spec.genes.slice(0, 9));
    img.title = `${spec.name} — open in the field rule`;
    img.addEventListener('click', () => {
      lineage.push(parent.slice());
      parent = spec.genes.slice(0, 9).map((v, i) =>
        Math.max(config.geneMin[i], Math.min(config.geneMax[i], v | 0)));
      breed();
      refresh();
      statusEl.textContent = `Loaded ${spec.name}.`;
    });
    list.appendChild(img);
  }
}

// ── animation ─────────────────────────────────────────────────

function frame() {
  t += speed;
  for (let i = 0; i < 9; i++) {
    const genes = i === 4 ? parent : children[childIndexFor(i)];
    renderField(cells[i].canvas, genes, t, CHILD_PER_COPY);
  }
  renderField(cmpField, parent, t, COMPARE_PER_COPY);
  requestAnimationFrame(frame);
}

// ── wiring ────────────────────────────────────────────────────

document.getElementById('btn-brood').addEventListener('click', newBrood);
document.getElementById('btn-back').addEventListener('click', back);
document.getElementById('btn-seed').addEventListener('click', seed);
document.getElementById('btn-save').addEventListener('click', saveCurrent);
document.getElementById('btn-reload').addEventListener('click', drawGalleryList);
document.getElementById('speed').addEventListener('change', e => {
  speed = parseFloat(e.target.value);
});

parent = seedGenotype();
breed();
refresh();
drawGalleryList();
requestAnimationFrame(frame);
