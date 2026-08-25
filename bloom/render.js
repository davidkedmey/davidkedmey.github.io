/**
 * Density renderer. Points are accumulated into a count buffer and then mapped
 * to colour, so overlapping strokes brighten instead of flattening to one shade.
 */
import { fieldPoints, fieldExtent, expressGenes,
         creaturePoints, bodyForward, turnRate, cruiseLevel, pumpPhase, seed,
         bodyRadius } from './field.js';
import { drawTree } from '../shared/genotype.js';

const BG = [10, 14, 20];
const LO = [46, 104, 74];    // sparse: dim green
const HI = [214, 244, 222];  // dense: near-white green

const buffers = new WeakMap();

// Little-endian hosts pack a pixel as 0xAABBGGRR; big-endian ones the other way round.
const LITTLE_ENDIAN = (() => {
  const probe = new Uint32Array([0x11223344]);
  return new Uint8Array(probe.buffer)[0] === 0x44;
})();

function pack(r, g, b) {
  return LITTLE_ENDIAN
    ? ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0
    : ((r << 24) | (g << 16) | (b << 8) | 255) >>> 0;
}

// Precomputed ramps: hits-per-pixel -> packed pixel, one set per depth band. Most of a form
// is single-hit dust, so the first hit has to be clearly visible; density beyond ~12 hits
// reads as solid. Farther bands are lerped toward the background, which is the depth cue.
const RAMP_N = 64;
const DEPTH_BANDS = 6;
const FAR_DIM = 0.45;                // how much of full brightness the farthest band keeps

const RAMPS = [];
for (let band = 0; band < DEPTH_BANDS; band++) {
  const dim = FAR_DIM + (1 - FAR_DIM) * (band / (DEPTH_BANDS - 1));
  const ramp = new Uint32Array(RAMP_N);
  for (let i = 0; i < RAMP_N; i++) {
    const v = Math.pow(1 - Math.exp(-i / 3.5), 0.6);
    const ch = [];
    for (let c = 0; c < 3; c++) {
      const lo = BG[c] + (LO[c] - BG[c]) * Math.min(1, v * 2.4);
      const full = lo + (HI[c] - lo) * v * v;
      ch.push(Math.round(BG[c] + (full - BG[c]) * dim));
    }
    ramp[i] = pack(ch[0], ch[1], ch[2]);
  }
  RAMPS.push(ramp);
}
const RAMP32 = RAMPS[DEPTH_BANDS - 1];   // full brightness, for everything but the aquarium
const BG32 = RAMP32[0];

function bufferFor(canvas, widest, total) {
  let b = buffers.get(canvas);
  const w = canvas.width, h = canvas.height;
  if (!b || b.w !== w || b.h !== h || b.pts.length < widest * 2 || b.touched.length < total) {
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(w, h);
    const pixels = new Uint32Array(image.data.buffer);
    pixels.fill(BG32);
    b = {
      w, h, ctx, image, pixels,
      counts: new Uint16Array(w * h),
      pts: new Float32Array(widest * 2),   // reused per creature, so only the largest matters
      touched: new Int32Array(total),      // a point can newly light at most one pixel
      touchedN: 0,
    };
    buffers.set(canvas, b);
  }
  return b;
}

const MAX_POINTS = 26000;

function countFor(genes, perCopy) {
  return Math.min(MAX_POINTS, perCopy * expressGenes(genes).phases);
}

/**
 * Draw any number of creatures into one canvas, each fitted to its own rectangle.
 *
 * items: [{ genes, x, y, w, h, perCopy }] — x/y/w/h in device pixels.
 *
 * `perCopy` is points per overlaid copy, not points in total. Gene 9 raises the number of
 * copies, so holding perCopy fixed means more development yields more structure — the same
 * relationship depth has to branch count under the tree rule.
 *
 * Only pixels a point actually lands on are cleared and recoloured. A form lights far fewer
 * pixels than the canvas holds, so the per-frame cost tracks the points drawn rather than the
 * canvas area, which is what many animating creatures at once can afford.
 */
export function renderScene(canvas, items, t) {
  let total = 0, widest = 0;
  for (const it of items) {
    const c = countFor(it.genes, it.perCopy);
    total += c;
    if (c > widest) widest = c;
  }

  const b = bufferFor(canvas, widest, total);
  const { w, ctx, counts, image, pixels, pts, touched } = b;

  // Undo the previous frame, touching only what it lit.
  for (let i = 0; i < b.touchedN; i++) {
    const idx = touched[i];
    counts[idx] = 0;
    pixels[idx] = BG32;
  }
  b.touchedN = 0;

  let n = 0;
  for (const it of items) {
    const count = countFor(it.genes, it.perCopy);
    fieldPoints(it.genes, t, count, pts);

    const box = fieldExtent(it.genes);
    const pad = 6;
    const scale = Math.min((it.w - pad * 2) / box.w, (it.h - pad * 2) / box.h);
    const cx = it.x + it.w / 2 - box.cx * scale;
    const cy = it.y + it.h / 2 - box.cy * scale;
    const x0 = it.x, x1 = it.x + it.w, y0 = it.y, y1 = it.y + it.h;

    for (let i = 0; i < count * 2; i += 2) {
      const x = (cx + pts[i] * scale) | 0;
      const y = (cy + pts[i + 1] * scale) | 0;
      if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
      const idx = y * w + x;
      const c = counts[idx];
      if (c === 0) touched[n++] = idx;
      if (c < RAMP_N - 1) counts[idx] = c + 1;
    }
  }
  b.touchedN = n;

  for (let i = 0; i < n; i++) pixels[touched[i]] = RAMP32[counts[touched[i]]];
  ctx.putImageData(image, 0, 0);
}

/** One creature filling the whole canvas. */
export function renderField(canvas, genes, t, perCopy) {
  renderScene(canvas, [{ genes, x: 0, y: 0, w: canvas.width, h: canvas.height, perCopy }], t);
}


/**
 * One individual from each genotype, sharing a single tank.
 *
 * Each body is brought to a comparable size and placed at wherever its copy currently sits on
 * its own backbone, so the creatures swim their real paths rather than being pushed around by
 * anything invented. Body scale and travel scale are set separately — at the genotype's own
 * ratio a body large enough to see would only creep, since most genotypes put a small
 * cross-section on a wide backbone.
 *
 * items: [{ genes, phaseIndex, name }]
 */
const swimStates = new WeakMap();

// Tank half-widths per unit of t. t advances 0.028 a frame, so 0.06 works out at a twentieth
// of a tank-width a second — a creature takes about twenty seconds to cross. Speed is flat:
// creatures change direction, never pace.
const SPEED = 0.06;
const WALL = 0.72;        // beyond this radius a creature starts turning back
const WALL_TURN = 1.0;    // decisive at the glass, but a turn rather than a bounce

// A bump lands as a turning impulse on `spin`, which then decays, rather than as a heading
// change applied on the spot. Steering straight to the away-angle turns both creatures at a
// fixed rate the moment they touch, which is what made it read like meshing gears; an impulse
// takes a second or so to play out and lets a creature swing wide and settle back.
// Halving the impulse and the decay together keeps the total deflection a bump produces while
// spreading it over twice as long — the creature leans out of the way instead of snapping.
const SPIN_DECAY = 0.35;
const BUMP_IMPULSE = 0.18;

// A wake shed by the pump rather than sprinkled at a fixed rate. Each bubble carries the
// strength of the stroke that threw it off, so the trail bands: dense and wide behind a hard
// squeeze, thin and faint between strokes, and nothing at all while a creature rests. Bubbles
// drift sideways as they age, alternating either side of the path the way shed vortices do,
// which is what makes the wake widen behind a creature instead of tracing its line.
const TRAIL_AGE = 14.0;   // units of t, about 8 seconds
const TRAIL_EVERY = 0.13;  // denser and fainter, so the wake thins out instead of popping off
const TRAIL_MIN_MOVE = 0.004;   // measured from the last bubble, not from last frame
const TRAIL_MIN_POWER = 0.10;   // below this the stroke is too weak to shed anything

// Creatures at different depths slide past without touching. Only ones sharing a band, or in
// neighbouring bands, are close enough in the water to shoulder each other.
const BUMP_BANDS = 1;
// Bodies are about 0.17 across, so at 0.14 two creatures visibly overlap before either
// reacts — a shoulder rather than a swerve around each other. Measured, that lands at roughly
// one contact every twenty seconds; wider thresholds have them jostling half the time.
const BUMP_DIST = 0.14;
const BUMP_TURN = 3.0;

/** Deterministic 0..1 from any number — gives each bubble its own drift without randomness. */
function hash01(v) {
  const x = Math.sin(v * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function swimmersFor(canvas, items) {
  const sig = items.map(i => i.genes.join(',') + '/' + (i.phaseIndex || 0)).join('|');
  let st = swimStates.get(canvas);
  if (!st || st.sig !== sig) {
    // Depth is fixed per creature and drawn from its genotype, so a shared link lays the tank
    // out the same way for everyone. Sorting by that key spreads them across the bands.
    const order = items.map((it, j) => ({ j, key: seed(it.genes, 41) }))
                       .sort((a, b) => a.key - b.key);
    const band = new Array(items.length);
    order.forEach((o, rank) => {
      band[o.j] = items.length === 1 ? DEPTH_BANDS - 1
                : Math.round((rank / (items.length - 1)) * (DEPTH_BANDS - 1));
    });
    st = {
      sig, lastT: null,
      list: items.map((it, j) => {
        const a = (j / items.length) * Math.PI * 2;
        return {
          x: 0.62 * Math.cos(a), y: 0.62 * Math.sin(a),
          heading: seed(it.genes, 31) * Math.PI * 2,
          band: band[j],
          spin: 0,
          // How readily this one gives way. Two creatures meeting should not both yield by the
          // same amount, or the exchange looks geared.
          give: 0.55 + seed(it.genes, 51) * 0.9,
          trail: [], lastTrail: -99,
        };
      }),
      // far to near, so nearer creatures paint over farther ones
      draw: items.map((_, j) => j).sort((a, b) => band[a] - band[b]),
    };
    swimStates.set(canvas, st);
  }
  return st;
}

/** Turn `sw` toward `want` by at most `amount` radians. */
function steer(sw, want, amount) {
  const diff = ((want - sw.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  sw.heading += diff * amount;
}

/**
 * One individual from each genotype, swimming a shared tank.
 *
 * Every creature travels at one flat speed and only ever changes direction. Each is turned to
 * face the way it is going — its forward axis is measured from where the dense bell sits
 * relative to the centroid, which differs per creature, so there is no single "up" to assume.
 * Heading turns on a quasi-periodic wander, and near the glass a creature steers back inward,
 * which is where most of the reversals come from. The body swells and shrinks on its own
 * cycle; that is the genotype's doing and nothing to do with how fast it goes.
 *
 * Creatures sit at fixed depths. Farther ones are dimmer and slightly smaller, and are painted
 * first so nearer ones cover them — which is what makes a crossing read as one passing behind
 * another rather than the two colliding. Only creatures sharing a depth band, or neighbouring
 * ones, shoulder each other and turn away.
 *
 * State is integrated in t, and t advances a fixed amount per frame, so a viewer whose browser
 * drops frames falls behind rather than diverging — the link still shows everyone the same
 * creatures doing the same things.
 */
export function renderAquarium(canvas, items, t, opts = {}) {
  const w = canvas.width, h = canvas.height;
  const n = items.length;
  const perCopy = opts.perCopy || 4800;
  const baseBody = opts.bodyPx || Math.min(w, h) * 0.115;

  const margin = baseBody * 1.05;
  const spanX = Math.max(1, w / 2 - margin);
  const spanY = Math.max(1, h / 2 - margin);

  const st = swimmersFor(canvas, items);
  const dt = st.lastT === null ? 0 : Math.min(0.2, Math.max(0, t - st.lastT));
  st.lastT = t;

  if (dt > 0) {
    for (let j = 0; j < n; j++) {
      const sw = st.list[j];
      sw.heading += (turnRate(items[j].genes, t) + sw.spin) * dt;
      sw.spin *= Math.exp(-SPIN_DECAY * dt);

      // Steer away from the glass. Turning back rather than bouncing keeps the motion smooth,
      // and a creature that has committed to a wall takes a while to come round.
      const r = Math.hypot(sw.x, sw.y);
      if (r > WALL) {
        steer(sw, Math.atan2(-sw.y, -sw.x),
              Math.min(1, (r - WALL) / (1 - WALL)) * WALL_TURN * dt);
      }

      // Cruising or stopped, never in between for long: one speed when moving, eased over a
      // short band so starting again is not a snap.
      const cruise = cruiseLevel(items[j].genes, t);
      const px = sw.x, py = sw.y;
      sw.x = Math.max(-1, Math.min(1, sw.x + Math.cos(sw.heading) * SPEED * cruise * dt));
      sw.y = Math.max(-1, Math.min(1, sw.y + Math.sin(sw.heading) * SPEED * cruise * dt));

      // Strength of the stroke throwing this bubble off. Both terms matter: a resting creature
      // sheds nothing however hard its bell works, and a cruising one still sheds in pulses.
      const power = cruise * pumpPhase(items[j].genes, items[j].phaseIndex || 0, t);

      // Distance is measured from the last bubble left behind. Comparing against this frame's
      // step instead would never clear the threshold — a frame covers only 0.0017 of a tank.
      const last = sw.trail[sw.trail.length - 1];
      if (power > TRAIL_MIN_POWER && t - sw.lastTrail > TRAIL_EVERY &&
          (!last || Math.hypot(sw.x - last.x, sw.y - last.y) > TRAIL_MIN_MOVE)) {
        // Each bubble is given its own drift once, here, and keeps it for life. Deriving the
        // direction from a bubble's position in the array instead makes every bubble jump to a
        // new side each time the oldest is dropped off the front — which is the sparkle, and
        // why the wake looked like a fixed pattern rather than water carrying things apart.
        const h1 = hash01(t * 91.7), h2 = hash01(t * 47.3 + 11), h3 = hash01(t * 133.1 + 5);
        const perp = sw.heading + (h1 < 0.5 ? Math.PI / 2 : -Math.PI / 2);
        sw.trail.push({
          x: sw.x, y: sw.y, t, power,
          ang: perp + (h2 - 0.5) * 1.3,   // mostly across the path, but not exactly
          sp: 0.55 + h3 * 0.95,           // some bubbles carry further than others
          curl: (h2 - 0.5) * 1.7,         // and bend as they go
        });
        sw.lastTrail = t;
      }
      while (sw.trail.length && t - sw.trail[0].t > TRAIL_AGE) sw.trail.shift();
    }

    // Shoulder anyone sharing the water. Speed is flat, so a bump can only turn a creature.
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        const A = st.list[a], B = st.list[b];
        if (Math.abs(A.band - B.band) > BUMP_BANDS) continue;
        const dx = A.x - B.x, dy = A.y - B.y;
        const d = Math.hypot(dx, dy);
        if (d >= BUMP_DIST || d === 0) continue;
        const overlap = 1 - d / BUMP_DIST;
        const awayA = Math.atan2(dy, dx);
        const wrap = (x) => ((x + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        A.spin += wrap(awayA - A.heading) * overlap * A.give * BUMP_IMPULSE * dt;
        B.spin += wrap(awayA + Math.PI - B.heading) * overlap * B.give * BUMP_IMPULSE * dt;
      }
    }
  }

  const b = bufferFor(canvas, perCopy, perCopy * n);
  const { ctx, counts, image, pixels, pts, touched } = b;

  for (let i = 0; i < b.touchedN; i++) {
    counts[touched[i]] = 0;
    pixels[touched[i]] = BG32;
  }
  b.touchedN = 0;

  const placed = [];
  let plotted = 0;

  for (const j of st.draw) {
    const { genes, phaseIndex = 0 } = items[j];
    const sw = st.list[j];
    const depth = n === 1 ? 1 : sw.band / (DEPTH_BANDS - 1);
    const bodyPx = baseBody * (0.82 + 0.18 * depth);   // farther reads smaller

    const scale = bodyPx / bodyRadius(genes, phaseIndex);
    const rot = sw.heading - bodyForward(genes, phaseIndex);
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const cx = w / 2 + sw.x * spanX;
    const cy = h / 2 + sw.y * spanY;
    placed.push({ x: cx, y: cy + bodyPx * 1.0, name: items[j].name, band: sw.band });

    const from = plotted;

    // The wake, drawn before the body so the creature sits on top of its own trail.
    for (let i = 0; i < sw.trail.length; i++) {
      const pt = sw.trail[i];
      const fade = 1 - (t - pt.t) / TRAIL_AGE;
      if (fade <= 0) continue;
      // Each bubble travels its own way as it ages. The distance goes as the square root of
      // age, not linearly: things carried apart in water separate quickly at first and then
      // ever more slowly, so the wake billows out early and keeps thinning instead of holding
      // a shape and then vanishing.
      const age01 = 1 - fade;
      // age^0.6 rather than a straight square root: still fast-then-slow, but it holds the
      // fresh wake nearer the tail for a moment before it opens out.
      const dist = bodyPx * (0.08 + 0.85 * pt.power) * pt.sp * Math.pow(age01, 0.6);
      const a = pt.ang + pt.curl * age01;
      const tx = (w / 2 + pt.x * spanX + Math.cos(a) * dist) | 0;
      const ty = (h / 2 + pt.y * spanY + Math.sin(a) * dist) | 0;

      // fade^1.3 keeps a long faint tail rather than a cliff, without losing the fresh wake.
      const heat = pt.power * Math.pow(fade, 1.3);
      const lvl = Math.round(heat * 12);
      if (lvl < 1) continue;
      const r0 = heat > 0.38 ? 2 : 1;
      for (let oy = 0; oy < r0; oy++) for (let ox = 0; ox < r0; ox++) {
        const x = tx + ox, y = ty + oy;
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        const idx = y * w + x;
        if (counts[idx] === 0) touched[plotted++] = idx;
        if (counts[idx] < lvl) counts[idx] = lvl;
      }
    }

    creaturePoints(genes, t, perCopy, phaseIndex, pts);
    for (let k = 0; k < perCopy * 2; k += 2) {
      const px = pts[k], py = pts[k + 1];
      const x = (cx + (px * cos - py * sin) * scale) | 0;
      const y = (cy + (px * sin + py * cos) * scale) | 0;
      if (x < 0 || x >= w || y < 0 || y >= h) continue;
      const idx = y * w + x;
      const c = counts[idx];
      if (c === 0) touched[plotted++] = idx;
      if (c < RAMP_N - 1) counts[idx] = c + 1;
    }

    // Paint this creature now, then clear its counts so the next one starts from bare water
    // rather than adding to it. Painting in depth order is what gives the occlusion.
    const ramp = RAMPS[sw.band];
    for (let i = from; i < plotted; i++) pixels[touched[i]] = ramp[counts[touched[i]]];
    for (let i = from; i < plotted; i++) counts[touched[i]] = 0;
  }
  b.touchedN = plotted;

  ctx.putImageData(image, 0, 0);

  if (!opts.labelPx) return;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = `${Math.round(opts.labelPx * 0.58)}px -apple-system, "Segoe UI", sans-serif`;
  for (const p of placed) {
    if (!p.name) continue;
    const dim = FAR_DIM + (1 - FAR_DIM) * (p.band / (DEPTH_BANDS - 1));
    ctx.fillStyle = `rgba(122, 152, 178, ${(0.35 + 0.5 * dim).toFixed(2)})`;
    ctx.fillText(p.name, p.x, Math.min(h - opts.labelPx, Math.max(0, p.y)));
  }
}

/** The same genotype under the tree rule, for side-by-side comparison. */
export function renderTree(canvas, genes) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = `rgb(${BG.join(',')})`;
  ctx.fillRect(0, 0, w, h);

  const lines = drawTree(genes);
  if (!lines.length) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const s of lines) {
    minX = Math.min(minX, s.x0, s.x1); maxX = Math.max(maxX, s.x0, s.x1);
    minY = Math.min(minY, s.y0, s.y1); maxY = Math.max(maxY, s.y0, s.y1);
  }
  const pad = 10;
  const scale = Math.min((w - pad * 2) / (maxX - minX || 1), (h - pad * 2) / (maxY - minY || 1));
  const ox = (minX + maxX) / 2, oy = (minY + maxY) / 2;
  const maxD = Math.max(...lines.map(s => s.depth));

  ctx.lineWidth = 1.1;
  for (const s of lines) {
    const f = maxD > 1 ? (s.depth - 1) / (maxD - 1) : 0;
    ctx.strokeStyle = `hsl(${120 + f * 55}, 48%, ${34 + f * 30}%)`;
    ctx.beginPath();
    ctx.moveTo(w / 2 + (s.x0 - ox) * scale, h / 2 + (s.y0 - oy) * scale);
    ctx.lineTo(w / 2 + (s.x1 - ox) * scale, h / 2 + (s.y1 - oy) * scale);
    ctx.stroke();
  }
}
