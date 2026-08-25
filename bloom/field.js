/**
 * Field embryology — a second developmental rule for the Dawkins 9-gene genotype.
 *
 * The tree rule (shared/genotype.js) reads genes 1-8 as eight direction vectors
 * and gene 9 as recursion depth. This rule reads the same nine numbers as the
 * coefficients of a trigonometric generator, after a p5.js sketch by @yuruyurau:
 *
 *   a=(m,d=mag(k=9*cos(i*5)*sin(i),e=cos(i*3)*cos(i*2)*9)**3/1999+1.5-sin(t/2+m)**3/3)
 *     =>point(99*sin(c=d/16-t/48+m)+k*(p=d**sin(d*d-t+m))+200,99*sin(c*4)+e*p+200)
 *
 * The sketch's constants become the genes. A point's position is three things added:
 * a place on a backbone, a cross-section added there, and a factor that swells it.
 *
 *   (k, e)   the cross-section: four harmonics beating against each other   <- g1..g4
 *   backbone (R sin c, R sin(ratio*c)) — one horizontal cycle per `ratio`
 *            vertical ones, so it has lobes rather than being an ellipse    <- g5, g6
 *   d        a radius from |k,e|, cubed so the outer structure dominates,
 *            plus a sin^3 pulse that swells and eases rather than oscillating
 *   c        d/16 - t/48 + m — the backbone position, nudged by the local
 *            geometry so tissue detail and body placement stay coupled
 *   p        d^sin(d^2 - t + m) — runs between 1/d and d and never reaches
 *            zero, so the form expands and contracts without inverting
 *   fuzz     how big the cross-section is against the backbone              <- g7
 *   m        each copy's offset into the clocks, so the pulse travels
 *            along the body instead of the whole thing throbbing at once
 *   sweep    how far the copies wrap around the backbone                    <- g8
 *   phases   how many copies are overlaid                                   <- gene 9
 *
 * Three clocks run at once: -t deforms the cross-section, t/2 drives the pulse at
 * half that rate, and -t/48 drifts the whole form around the backbone. Nothing is
 * random; a point is fixed exactly by (its sample index, its copy, t).
 */

const TAU = Math.PI * 2;

// Gene 9 (depth in the tree rule) sets how many overlaid copies develop.
// The tree rule makes depth exponential in branch count; this mirrors that.
export const PHASE_COUNTS = [1, 2, 3, 4, 6, 8, 12, 16];

export const GENE_ROLES = [
  { gene: 'g1', field: 'Seed harmonic A', tree: 'v3/v5 horizontal spread' },
  { gene: 'g2', field: 'Seed harmonic B', tree: 'v2/v6 horizontal spread' },
  { gene: 'g3', field: 'Seed harmonic C', tree: 'v1/v7 horizontal spread' },
  { gene: 'g4', field: 'Seed harmonic D', tree: 'v4 vertical (up)' },
  { gene: 'g5', field: 'Carrier ratio', tree: 'v3/v5 vertical' },
  { gene: 'g6', field: 'Carrier size', tree: 'v2/v6 vertical' },
  { gene: 'g7', field: 'Fuzz scale', tree: 'v1/v7 vertical' },
  { gene: 'g8', field: 'Body sweep', tree: 'v8 vertical (down)' },
  { gene: 'depth', field: 'Copies overlaid', tree: 'Recursion depth' },
];

/** Read a genotype as field parameters. Every gene has a job; none has a dead range. */
export function expressGenes(genes) {
  const g = genes;
  const depth = Math.max(1, Math.min(8, g[8] | 0));
  const phases = PHASE_COUNTS[depth - 1];
  const sweep = 1.104 * Math.pow(2, g[7] / 7);   // 0.45..2.69 revolutions
  return {
    h1: 5 + g[0],              // seed harmonics: integers, so +/-1 adds or drops a lobe
    h2: 1 + g[1],
    h3: 3 + g[2],
    h4: 2 + g[3],
    ratio: 4 + g[4],             // Lissajous ratio of the carrier; 0 flattens it, negative mirrors
    carrier: 90 + g[5] * 8,      // how far apart the copies sit, 18..162
    // How big each copy is. The frame is fitted to the form, so only the ratio of fuzz to
    // carrier matters: low values scatter the copies as separate specks, high values swell
    // them until they merge into one body. 0.25..16, always positive so mutation stays graded.
    fuzz: 2 * Math.pow(2, g[6] / 3),
    phases,
    depth,
    // How far the copies wrap around the body, in revolutions. The original's step of 13 is
    // 0.4336 mod 2pi, and 16 copies of that sweep 1.104 revolutions — evenly spaced round the
    // body. Holding the step at 13 while gene 9 lowers the copy count bunches every copy into
    // a 7%-wide arc, which left gene 9 nearly dead below its top value. Deriving the step from
    // the sweep keeps the copies spread at every count, and reproduces the original at g8 = 0.
    sweep,
    step: TAU * sweep / phases,
  };
}

// Sampling note: the original steps i by 1 radian, and 1/2pi is irrational, so its 10,000
// integer samples equidistribute over the same closed 2pi-periodic curve this traces with a
// normalised parameter. The two produce the same point set in a different order, verified
// side by side. So nothing needs to be added back to compensate for normalising.
//
// The exponent stays sin(d*d - t + m) with no multiplier. d*d is calibrated so neighbouring
// regions deform slightly differently; scaling it up decorrelates them and the forms break
// into scattered dust instead of holding a silhouette.

const extentCache = new Map();

/**
 * The box to frame a genotype in. The analytic worst case is far larger than what a given
 * genotype actually occupies, so measure instead: sample the form at several points in its
 * cycle and take percentiles per axis, which keeps rare outliers from shrinking everything
 * else. Cached — a genotype is drawn for many frames before it changes.
 */
export function fieldExtent(genes) {
  const key = genes.join(',');
  const hit = extentCache.get(key);
  if (hit) return hit;

  const SAMPLES = 2200;
  const buf = new Float32Array(SAMPLES * 2);
  const xs = [], ys = [];
  for (const t of [0, 1.6, 3.2, 4.8, 6.4]) {
    fieldPoints(genes, t, SAMPLES, buf);
    for (let i = 0; i < SAMPLES * 2; i += 2) { xs.push(buf[i]); ys.push(buf[i + 1]); }
  }
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const lo = Math.floor(xs.length * 0.012);
  const hi = Math.floor(xs.length * 0.988);
  const box = {
    minX: xs[lo], maxX: xs[hi],
    minY: ys[lo], maxY: ys[hi],
  };
  box.w = Math.max(4, box.maxX - box.minX);
  box.h = Math.max(4, box.maxY - box.minY);
  box.cx = (box.minX + box.maxX) / 2;
  box.cy = (box.minY + box.maxY) / 2;

  if (extentCache.size > 400) extentCache.clear();
  extentCache.set(key, box);
  return box;
}

/**
 * Write `count` points as x,y pairs into `out` (a Float32Array of length count*2).
 * Coordinates are centred on the origin; scale with fieldBound().
 */
export function fieldPoints(genes, t, count, out) {
  const p = expressGenes(genes);
  const { h1, h2, h3, h4, ratio, carrier, fuzz, step, phases } = p;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const th = (i / count) * TAU;
    // The phase offset keeps h2 = 0 from zeroing k outright, which would flatten every
    // form in that slice of the gene space to a vertical streak. At h2 = 0 the term
    // becomes a plain scaled cosine instead of a dead gene.
    const k = 9 * Math.cos(h1 * th) * Math.sin(h2 * th + 0.6);
    const e = 9 * Math.cos(h3 * th) * Math.cos(h4 * th);
    const m = (i % phases) * step;
    const s = Math.sin(t / 2 + m);
    const d = Math.pow(k * k + e * e, 1.5) / 1999 + 1.5 - (s * s * s) / 3;
    const c = d / 16 - t / 48 + m;
    const pw = Math.pow(d, Math.sin(d * d - t + m));
    out[n++] = carrier * Math.sin(c) + fuzz * k * pw;
    out[n++] = carrier * Math.sin(ratio * c) + fuzz * e * pw;
  }
  return n;
}

// ── one individual, pulled out of the colony ──────────────────────────────────
//
// A genotype normally develops `phases` copies at once. Taking a single copy means pinning m
// to one value instead of cycling it. Splitting the point into its two parts is what makes an
// aquarium possible: `creaturePoints` gives the body alone, in its own frame, so it can be
// drawn at a legible size and placed anywhere. The body is the genotype's and is untouched;
// where it travels is `driftOffset`, which the sketch never specified at all.

/** The body of copy `phaseIndex`, in its own frame (centred on where it sits, not on 0,0). */
export function creaturePoints(genes, t, count, phaseIndex, out) {
  const p = expressGenes(genes);
  const m = (phaseIndex % p.phases) * p.step;
  let n = 0;
  for (let i = 0; i < count; i++) {
    const th = (i / count) * TAU;
    const k = 9 * Math.cos(p.h1 * th) * Math.sin(p.h2 * th + 0.6);
    const e = 9 * Math.cos(p.h3 * th) * Math.cos(p.h4 * th);
    const s = Math.sin(t / 2 + m);
    const d = Math.pow(k * k + e * e, 1.5) / 1999 + 1.5 - (s * s * s) / 3;
    const pw = Math.pow(d, Math.sin(d * d - t + m));
    out[n++] = p.fuzz * k * pw;
    out[n++] = p.fuzz * e * pw;
  }
  return n;
}

/**
 * The body's pulse repeats every 4*pi of t — the sin^3 term's period, into which the swelling
 * factor's 2*pi divides. Sampling one cycle therefore covers a creature forever.
 */
const PULSE = 4 * Math.PI;

/**
 * How hard a creature is squeezing right now, 0..1.
 *
 * A body swells and shrinks 2.4-2.8x over its pulse. Read as a bell, the squeeze is the stroke
 * that displaces water, so it is what a wake should be shed by: strong while contracting,
 * nothing while it refills. Sampling the real body once per genotype is safer than deriving it
 * from the sin^3 term alone, since the swelling factor distorts the phase.
 */
const PUMP_STEPS = 96;
const pumpCache = new Map();

export function pumpPhase(genes, phaseIndex, t) {
  const key = genes.join(',') + '/' + phaseIndex;
  let contract = pumpCache.get(key);
  if (!contract) {
    const N = 360;
    const buf = new Float32Array(N * 2);
    const size = new Float32Array(PUMP_STEPS);
    for (let i = 0; i < PUMP_STEPS; i++) {
      creaturePoints(genes, (i / PUMP_STEPS) * PULSE, N, phaseIndex, buf);
      let sum = 0;
      for (let k = 0; k < N * 2; k += 2) sum += Math.hypot(buf[k], buf[k + 1]);
      size[i] = sum / N;
    }
    contract = new Float32Array(PUMP_STEPS);
    let peak = 1e-6;
    for (let i = 0; i < PUMP_STEPS; i++) {
      const shrink = size[i] - size[(i + 1) % PUMP_STEPS];
      contract[i] = Math.max(0, shrink);
      if (contract[i] > peak) peak = contract[i];
    }
    for (let i = 0; i < PUMP_STEPS; i++) contract[i] /= peak;
    if (pumpCache.size > 400) pumpCache.clear();
    pumpCache.set(key, contract);
  }
  const u = (((t % PULSE) + PULSE) % PULSE) / PULSE * PUMP_STEPS;
  const i = Math.floor(u), frac = u - i;
  return contract[i % PUMP_STEPS] * (1 - frac) + contract[(i + 1) % PUMP_STEPS] * frac;
}

const forwardCache = new Map();

/**
 * Which way this creature faces, in its own frame.
 *
 * The dense core sits off the centroid — trailing filaments are sparse and drag the centroid
 * behind the bell — and that offset points the way a jellyfish goes: bell first, tentacles
 * streaming. It differs per creature, so there is no one "up" to assume.
 */
export function bodyForward(genes, phaseIndex) {
  const key = genes.join(',') + '/' + phaseIndex;
  const hit = forwardCache.get(key);
  if (hit !== undefined) return hit;

  const N = 1200;
  const buf = new Float32Array(N * 2);
  let sx = 0, sy = 0, cx = 0, cy = 0;
  for (let s = 0; s < 6; s++) {
    creaturePoints(genes, (s / 6) * PULSE, N, phaseIndex, buf);
    let mx = 0, my = 0;
    for (let i = 0; i < N * 2; i += 2) { mx += buf[i]; my += buf[i + 1]; }
    mx /= N; my /= N;
    const pts = [];
    for (let i = 0; i < N * 2; i += 2) {
      pts.push({ d: Math.hypot(buf[i] - mx, buf[i + 1] - my), x: buf[i], y: buf[i + 1] });
    }
    pts.sort((a, b) => a.d - b.d);
    const half = N >> 1;
    let kx = 0, ky = 0;
    for (let i = 0; i < half; i++) { kx += pts[i].x; ky += pts[i].y; }
    sx += kx / half - mx; sy += ky / half - my;
    cx += mx; cy += my;
  }
  const angle = (sx === 0 && sy === 0) ? -Math.PI / 2 : Math.atan2(sy, sx);
  if (forwardCache.size > 400) forwardCache.clear();
  forwardCache.set(key, angle);
  return angle;
}

/** Deterministic 0..1 from a genotype and a salt. */
export function seed(genes, salt) {
  let x = (salt * 2654435761) >>> 0;
  for (let i = 0; i < genes.length; i++) {
    x = (x ^ (((genes[i] + 10) * 2246822519) >>> 0)) >>> 0;
    x = Math.imul(x, 2654435761) >>> 0;
  }
  return (x >>> 8) / 16777216;
}

/**
 * A smooth, non-repeating signal in [-1, 1], seeded from a genotype.
 *
 * Three sines at frequencies 1, phi and phi^2. Those ratios are irrational, so the sum is
 * quasi-periodic — it never repeats. Not random: a link has to render the same motion for
 * everyone who opens it. `salt` gives each use of it (turning, pausing) its own phases.
 */
const PHI = 1.618033988749895;
export function wobble(genes, t, salt, rate) {
  const tau = t * rate * (0.7 + seed(genes, salt) * 0.7);
  return 0.60 * Math.sin(tau + seed(genes, salt + 1) * Math.PI * 2)
       + 0.30 * Math.sin(PHI * tau + seed(genes, salt + 2) * Math.PI * 2)
       + 0.10 * Math.sin(PHI * PHI * tau + seed(genes, salt + 3) * Math.PI * 2);
}

/**
 * How sharply a creature is turning right now, in radians per unit of t. Heading integrates
 * this, so small persistent turns accumulate into long curves. t advances 0.028 a frame, so
 * 0.22 peaks near 20 degrees a second.
 */
export function turnRate(genes, t, opts = {}) {
  const amp = opts.amp === undefined ? 0.22 : opts.amp;
  return amp * wobble(genes, t, 21, opts.rate === undefined ? 0.09 : opts.rate);
}

/**
 * 0 while a creature is holding still, 1 while it is cruising, easing between.
 *
 * A slow wobble dipping below a threshold is the cue to stop. Smoothing the crossing over a
 * band rather than switching on it avoids a snap into motion, which at this scale reads more
 * mechanically than the pause itself does.
 */
export function cruiseLevel(genes, t, opts = {}) {
  const level = opts.level === undefined ? -0.60 : opts.level;
  const band = opts.band === undefined ? 0.16 : opts.band;
  const d = wobble(genes, t, 61, opts.rate === undefined ? 0.13 : opts.rate);
  const u = Math.max(0, Math.min(1, (d - (level - band)) / (band * 2)));
  return u * u * (3 - 2 * u);   // smoothstep
}

const bodyCache = new Map();

/**
 * Half-size of one body at its largest, so different species can be brought to a comparable
 * scale without any of them outgrowing the space they are given.
 *
 * A body breathes: the sin^3 pulse runs on a 4*pi cycle in t and the swelling factor on a
 * 2*pi one, and across those a body can change size threefold. Sampling only part of the cycle
 * under-measures, and the creature then bursts out of its station at the moments it was never
 * measured at. Sample the whole pulse and take the widest it ever gets.
 */
export function bodyRadius(genes, phaseIndex) {
  const key = genes.join(',') + '/' + phaseIndex;
  const hit = bodyCache.get(key);
  if (hit !== undefined) return hit;
  const N = 1200;
  const STEPS = 14;
  const buf = new Float32Array(N * 2);
  let widest = 0;
  for (let j = 0; j < STEPS; j++) {
    const t = (j / STEPS) * 4 * Math.PI;   // one full pulse
    creaturePoints(genes, t, N, phaseIndex, buf);
    const radii = [];
    for (let i = 0; i < N * 2; i += 2) {
      radii.push(Math.hypot(buf[i], buf[i + 1]));   // radial, so turning cannot enlarge it
    }
    radii.sort((a, b) => a - b);
    const q = radii[Math.floor(radii.length * 0.99)];
    if (q > widest) widest = q;
  }
  const r = Math.max(0.5, widest);
  if (bodyCache.size > 400) bodyCache.clear();
  bodyCache.set(key, r);
  return r;
}
