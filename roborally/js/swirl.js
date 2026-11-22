/* RoboRally board editor — the swirl of a particle accelerator, generated.
 *
 * A field of accelerator is one vortex: streaks of light spiralling in towards
 * the middle of the field, over broad bands of colour that wind round it the
 * same way. Rather than being lifted off a printed board, it is painted the way
 * the printed one looks to have been — stroke by stroke along the flow — so a
 * field of any shape or size gets a vortex of its own, centred on it, turning
 * whichever way and in whatever colours its kind of accelerator calls for.
 *
 * Everything is measured in squares, so the same field painted at a different
 * size is the same picture, and the strokes come from a generator seeded by the
 * field's bounds, so a field paints the same every time it is drawn.
 */

/*
 * The kinds of swirl. `turn` is the way it spirals in, +1 clockwise on screen,
 * and `stops` the colours its bands run through, darkest to lightest, with
 * `bright` and `glint` for the streaks of light over them. `path` is the flat
 * colour of a particle path laid over it.
 */
export const SWIRLS = {
  cw: {
    turn: 1,
    stops: ['#113a9c', '#195cc6', '#1480c0', '#119fae', '#1cb09a', '#36c2a3'],
    bright: '#45d2ee',
    glint: '#a4eef8',
    path: '#68d3e5',                  // the printed paths' light blue
  },
  ccw: {
    turn: -1,
    stops: ['#5a0c1c', '#8c1724', '#b32a26', '#c9452a', '#d9672e', '#e58a3c'],
    bright: '#f4a35a',
    glint: '#ffe2b0',
    path: '#ffcf87',
  },
};

/* how steeply the streaks spiral in: measured off the printed board, where
 * they run about 21 degrees in from going round */
const PITCH = 22 * Math.PI / 180;
const WAVE = 1.6;                     // how closely the strands waver, per square

/* ------------------------------------------------------------------ *
 * Randomness                                                          *
 * ------------------------------------------------------------------ */

function generator(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Smooth noise in [-1, 1]: gradients on a lattice, blended between. */
function noise2(rand) {
  const perm = new Uint8Array(512);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = (rand() * (i + 1)) | 0;
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = rand() * Math.PI * 2;
    gx[i] = Math.cos(t); gy[i] = Math.sin(t);
  }
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const dot = (ix, iy, dx, dy) => {
      const h = perm[perm[(X + ix) & 255] + ((Y + iy) & 255)];
      return gx[h] * dx + gy[h] * dy;
    };
    const u = fade(xf), v = fade(yf);
    const a = dot(0, 0, xf, yf) + u * (dot(1, 0, xf - 1, yf) - dot(0, 0, xf, yf));
    const b = dot(0, 1, xf, yf - 1) + u * (dot(1, 1, xf - 1, yf - 1) - dot(0, 1, xf, yf - 1));
    return (a + v * (b - a)) * 1.4;
  };
}

/* ------------------------------------------------------------------ *
 * Colour                                                              *
 * ------------------------------------------------------------------ */

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a, b, t) { return a.map((v, i) => v + (b[i] - v) * t); }

function css(c, alpha) {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha.toFixed(3)})`;
}

/** The colour `t` of the way along a swirl's bands, 0 darkest and 1 lightest. */
function bandColour(stops, t) {
  const x = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(x);
  return mix(stops[i], stops[i + 1], x - i);
}

/* ------------------------------------------------------------------ *
 * The vortex                                                          *
 * ------------------------------------------------------------------ */

/*
 * Paint a field's swirl onto `g`, which covers `w` by `h` squares at `px` to
 * the square. The vortex turns about (cx, cy), in squares from the top left —
 * the middle of the field — and `seed` picks this field's strokes.
 */
export function paintSwirl(g, w, h, px, cx, cy, kind, seed) {
  const spec = SWIRLS[kind] || SWIRLS.cw;
  const rand = generator(seed);
  const n1 = noise2(rand), n2 = noise2(rand), n3 = noise2(rand);
  const stops = spec.stops.map(rgb);
  const bright = rgb(spec.bright), glint = rgb(spec.glint);
  const turn = spec.turn;
  const twist = turn / Math.tan(PITCH);
  const ph1 = rand() * 6.3, ph2 = rand() * 6.3;

  /* Which way the swirl runs at (x, y): round the middle and a little in
   * towards it, wandering with the noise so it is not ruled out by compass. */
  const heading = (x, y, wiggle, fx) => {
    const dx = x - cx, dy = y - cy;
    const t = Math.atan2(dy, dx);
    return t + turn * (Math.PI / 2 + PITCH)
      + 0.55 * n1(x * 0.35, y * 0.35)
      + wiggle * n3(x * fx, y * fx);
  };

  /* How far along its bands a point is: constant along a spiral arm, so the
   * bands wind in with the streaks rather than lying across them. */
  const band = (x, y) => {
    const dx = x - cx, dy = y - cy;
    const r = Math.max(0.05, Math.hypot(dx, dy));
    const s = Math.atan2(dy, dx) + twist * Math.log(r);
    return 0.5 + 0.3 * Math.sin(2 * s + ph1) + 0.16 * Math.sin(3 * s + ph2)
      + 0.25 * n2(x * 0.3, y * 0.3) + 0.15 * n2(x * 0.9 + 17, y * 0.9);
  };

  /* A streak from (x, y) along the flow, both ways, `len` squares in all. */
  const streak = (x, y, len, wiggle, fx) => {
    const step = 0.05;
    const half = Math.max(2, Math.round(len / step / 2));
    const trace = dir => {
      const pts = [];
      let px_ = x, py_ = y;
      for (let i = 0; i < half; i++) {
        const a = heading(px_, py_, wiggle, fx);
        const mx = px_ + dir * Math.cos(a) * step / 2, my = py_ + dir * Math.sin(a) * step / 2;
        const b = heading(mx, my, wiggle, fx);
        px_ += dir * Math.cos(b) * step;
        py_ += dir * Math.sin(b) * step;
        if (Math.hypot(px_ - cx, py_ - cy) < 0.06) break;     // run into the eye
        pts.push(px_, py_);
      }
      return pts;
    };
    const back = trace(-1), fwd = trace(1);
    const pts = [];
    for (let i = back.length - 2; i >= 0; i -= 2) pts.push(back[i], back[i + 1]);
    pts.push(x, y, ...fwd);
    return pts;
  };

  const draw = (to, pts, width, colour) => {
    if (pts.length < 4) return;
    to.strokeStyle = colour;
    to.lineWidth = width * px;
    to.beginPath();
    to.moveTo(pts[0] * px, pts[1] * px);
    for (let i = 2; i < pts.length; i += 2) to.lineTo(pts[i] * px, pts[i + 1] * px);
    to.stroke();
  };

  const area = w * h;
  const seedAt = () => [rand() * (w + 1) - 0.5, rand() * (h + 1) - 0.5];
  const jitter = k => (rand() - 0.5) * k;

  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.fillStyle = css(bandColour(stops, 0.5), 1);
  g.fillRect(0, 0, w * px, h * px);

  /*
   * Broad washes of colour, which make the bands, laid on a canvas of their
   * own and blurred on: the printed swirl is painted soft, its colours running
   * into one another, with only the strands over them drawn sharp.
   */
  const wash = document.createElement('canvas');
  wash.width = g.canvas.width;
  wash.height = g.canvas.height;
  const wg = wash.getContext('2d');
  wg.lineCap = 'round';
  wg.fillStyle = g.fillStyle;
  wg.fillRect(0, 0, wash.width, wash.height);
  for (let i = 0; i < area * 18; i++) {
    const [x, y] = seedAt();
    const pts = streak(x, y, 1.5 + rand() * 3, 0.25, 1.2);
    draw(wg, pts, 0.3 + rand() * 0.45, css(bandColour(stops, band(x, y) + jitter(0.12)), 0.16));
  }
  /* darker and lighter runs within the bands, so they are not flat */
  for (let i = 0; i < area * 14; i++) {
    const [x, y] = seedAt();
    const pts = streak(x, y, 0.6 + rand() * 1.6, 0.5, 2.5);
    const t = band(x, y) + (rand() < 0.5 ? -0.3 : 0.25) + jitter(0.1);
    draw(wg, pts, 0.06 + rand() * 0.1, css(bandColour(stops, t), 0.22));
  }
  g.save();
  g.filter = `blur(${(px * 0.035).toFixed(2)}px)`;
  g.drawImage(wash, 0, 0);
  g.restore();

  /*
   * The strands the swirl is drawn in: short, and wavering as smoke does, each
   * in a colour from near the band it lies in — some darker, some lighter — so
   * they show against it.
   */
  /* They waver together, as currents in smoke do, rather than each its own
   * way, so they share one field to waver in. They are softened a little
   * once laid, as the printed ones are. */
  const strands = document.createElement('canvas');
  strands.width = g.canvas.width;
  strands.height = g.canvas.height;
  const sg = strands.getContext('2d');
  sg.lineCap = 'round';
  sg.lineJoin = 'round';
  for (let i = 0; i < area * 70; i++) {
    const [x, y] = seedAt();
    const pts = streak(x, y, 0.3 + rand() * 1.1, 0.7 + rand() * 0.5, WAVE);
    const c = bandColour(stops, band(x, y) + jitter(0.7));
    draw(sg, pts, 0.014 + rand() * 0.026,
         css(rand() < 0.2 ? mix(c, bright, 0.5) : c, 0.25 + rand() * 0.25));
  }
  /* and the wisps of light over them, each with a soft glow */
  sg.globalCompositeOperation = 'screen';
  for (let i = 0; i < area * 14; i++) {
    const [x, y] = seedAt();
    const pts = streak(x, y, 0.4 + rand() * 1.3, 0.7 + rand() * 0.5, WAVE);
    const c = mix(bright, glint, rand() * 0.4);
    draw(sg, pts, 0.06 + rand() * 0.04, css(c, 0.07));
    draw(sg, pts, 0.012 + rand() * 0.018, css(c, 0.35 + rand() * 0.3));
  }
  g.save();
  g.filter = `blur(${(px * 0.005).toFixed(2)}px)`;
  g.drawImage(strands, 0, 0);
  g.restore();
  g.restore();
}

/* ------------------------------------------------------------------ *
 * Fields, painted and kept                                            *
 * ------------------------------------------------------------------ */

/*
 * A field is painted once at a given size and kept: painting a big one takes a
 * good fraction of a second, too long to do on every redraw. Its strokes are
 * seeded from the field's kind and bounds, so it paints the same at any size,
 * and squares added inside the bounds leave it as it was.
 */
const cache = new Map();          // id -> { kind, c0, r0, w, h, px, canvas }
const CACHE_MAX = 16;
let pending = new Map();
let timer = null;
let ready = () => {};

function idOf(f, px) { return `${f.kind}|${f.c0},${f.r0},${f.w}x${f.h}@${px}`; }

function seedOf(f) {
  let h = 2166136261;
  for (const ch of `${f.kind}|${f.c0},${f.r0},${f.w}x${f.h}`) {
    h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  }
  return h >>> 0;
}

function keep(id, entry) {
  cache.set(id, entry);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return entry;
}

function paintField(f, px) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(f.w * px);
  canvas.height = Math.ceil(f.h * px);
  paintSwirl(canvas.getContext('2d'), f.w, f.h, px, f.w / 2, f.h / 2, f.kind, seedOf(f));
  return { ...f, px, canvas };
}

/** Called with nothing once fields asked for while drawing have been painted. */
export function onSwirlsReady(fn) { ready = fn; }

/** Forget the fields asked for by the last redraw: a new one is under way. */
export function swirlFrame() { pending = new Map(); }

/*
 * The painted swirl for field `f` — {kind, c0, r0, w, h} in squares — at `px`
 * to the square. With `now`, it is painted there and then if it has to be, as
 * an export needs; otherwise a field not painted yet is painted a moment after
 * the drawing stops asking for new ones, so painting a field square by square
 * does not stall on every square, and null comes back meanwhile.
 */
export function fieldSwirl(f, px, now) {
  const id = idOf(f, px);
  const hit = cache.get(id);
  if (hit) {
    cache.delete(id);             // most recently used goes to the back
    cache.set(id, hit);
    return hit;
  }
  if (now) return keep(id, paintField(f, px));
  pending.set(id, f);
  clearTimeout(timer);
  timer = setTimeout(() => {
    const jobs = pending;
    pending = new Map();
    for (const [jid, jf] of jobs) {
      const jpx = Number(jid.slice(jid.lastIndexOf('@') + 1));
      if (!cache.has(jid)) keep(jid, paintField(jf, jpx));
    }
    if (jobs.size) ready();
  }, 90);
  return null;
}

/*
 * Something to show for square (c, r) of a field not painted yet: the latest
 * painted field of the same kind that covered that square, which is the field
 * as it was before its last change — or null, for a square new to it.
 */
export function staleSwirl(kind, c, r) {
  let best = null;
  for (const e of cache.values()) {
    if (e.kind === kind && c >= e.c0 && r >= e.r0 && c < e.c0 + e.w && r < e.r0 + e.h) best = e;
  }
  return best;
}

/** The plain colour a square of swirl shows before it is painted. */
export function swirlBase(kind) {
  return css(bandColour((SWIRLS[kind] || SWIRLS.cw).stops.map(rgb), 0.5), 1);
}

/* ------------------------------------------------------------------ *
 * Swatches                                                            *
 * ------------------------------------------------------------------ */

const swatches = new Map();

/*
 * A palette swatch: a single square painted as a field of its own, so the
 * whole vortex fits in it, with a path across it if `path` is set.
 */
export function swirlSwatch(kind, path) {
  const id = kind + (path ? ':path' : '');
  if (swatches.has(id)) return swatches.get(id);
  const S = 150;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const g = cv.getContext('2d');
  paintSwirl(g, 1, 1, S, 0.5, 0.5, kind, 1234567);
  if (path) {
    g.strokeStyle = (SWIRLS[kind] || SWIRLS.cw).path;
    g.lineWidth = 21;
    g.lineJoin = 'miter';
    g.beginPath();
    g.moveTo(0, S / 2);
    g.lineTo(S / 2, S / 2);
    g.lineTo(S, 0);
    g.stroke();
  }
  g.strokeStyle = 'rgba(0,0,0,0.85)';
  g.lineWidth = 2;
  g.strokeRect(1, 1, S - 2, S - 2);
  const url = cv.toDataURL('image/png');
  swatches.set(id, url);
  return url;
}
