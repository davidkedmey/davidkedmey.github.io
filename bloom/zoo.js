/**
 * A zoo is a set of genotypes in one space. The genotypes travel in the URL, not in
 * localStorage, so a link works for anyone who opens it — the rendering is deterministic,
 * so everyone sees the same creatures.
 *
 * #z=<9 chars per creature>&n=<names>&t=<title>
 */
import { renderScene } from './render.js';

// 19 symbols cover a gene's full range of -9..9 at one character each.
const ALPHA = '0123456789ABCDEFGHI';

export function encodeGenes(genes) {
  let out = '';
  for (let i = 0; i < 9; i++) {
    const lo = i === 8 ? 1 : -9;
    const hi = i === 8 ? 8 : 9;
    const v = Math.max(lo, Math.min(hi, (genes[i] | 0)));
    out += ALPHA[v + 9];
  }
  return out;
}

export function decodeGenes(str) {
  const genes = [];
  for (let i = 0; i < 9; i++) {
    const idx = ALPHA.indexOf(str[i]);
    if (idx < 0) return null;
    genes.push(idx - 9);
  }
  genes[8] = Math.max(1, Math.min(8, genes[8]));
  return genes;
}

export function encodeZoo(specimens, title, view) {
  const z = specimens.map(s => encodeGenes(s.genes)).join('');
  const parts = [`z=${z}`];
  if (view === 'aquarium') parts.push('v=a');
  const names = specimens.map(s => encodeURIComponent(s.name || ''));
  if (names.some(n => n)) parts.push(`n=${names.join(',')}`);
  if (title) parts.push(`t=${encodeURIComponent(title)}`);
  return parts.join('&');
}

export function decodeZoo(hash) {
  const h = (hash || '').replace(/^#/, '');
  if (!h) return null;
  const params = new URLSearchParams(h);
  const z = params.get('z');
  if (!z || z.length < 9) return null;
  const names = (params.get('n') || '').split(',').map(decodeURIComponent);
  const specimens = [];
  for (let i = 0; i + 9 <= z.length; i += 9) {
    const genes = decodeGenes(z.slice(i, i + 9));
    if (!genes) continue;
    const k = specimens.length;
    specimens.push({ genes, name: names[k] || `Specimen ${k + 1}` });
  }
  if (!specimens.length) return null;
  return {
    specimens,
    title: params.get('t') ? decodeURIComponent(params.get('t')) : '',
    view: params.get('v') === 'a' ? 'aquarium' : 'zoo',
  };
}

/** Columns that keep cells close to square: a creature in a long thin cell scales to the
 *  short side and leaves the rest empty. The canvas is sized from this too, so both agree. */
export function columnsFor(count) {
  return Math.max(1, Math.min(count, Math.round(Math.sqrt(count * 1.35))));
}

/** Lay creatures out in a single canvas. */
export function layout(count, width, height, labelPx, cols) {
  const rows = Math.ceil(count / cols);
  const cw = width / cols;
  const ch = height / rows;
  const cells = [];
  for (let i = 0; i < count; i++) {
    const c = i % cols, r = (i / cols) | 0;
    cells.push({ x: c * cw, y: r * ch, w: cw, h: ch - labelPx });
  }
  return { cells, cols, rows, cw, ch };
}

export function drawZoo(canvas, specimens, t, perCopy, opts = {}) {
  const dpr = opts.dpr || 1;
  const labelPx = opts.labelPx || 0;
  const cols = opts.cols || columnsFor(specimens.length);
  const { cells } = layout(specimens.length, canvas.width, canvas.height, labelPx, cols);
  renderScene(canvas, specimens.map((s, i) => ({
    genes: s.genes, perCopy,
    x: Math.round(cells[i].x), y: Math.round(cells[i].y),
    w: Math.round(cells[i].w), h: Math.round(cells[i].h),
  })), t);

  if (!labelPx) return;
  const ctx = canvas.getContext('2d');
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `${Math.round(11 * dpr)}px -apple-system, "Segoe UI", sans-serif`;
  for (let i = 0; i < specimens.length; i++) {
    const c = cells[i];
    ctx.fillStyle = '#5d7286';
    ctx.fillText(specimens[i].name, c.x + c.w / 2, c.y + c.h + labelPx * 0.62);
  }
}
