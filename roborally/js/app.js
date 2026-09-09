/* RoboRally board editor.
 *
 * The board is a grid of cells; each cell has one optional floor graphic and a
 * stack of overlay graphics on top of it. A placement is {file, rot} where rot
 * counts quarter-turns clockwise. Everything is drawn to a <canvas>, so the
 * export is just the same draw routine at 150 px per square.
 */
import {
  TILE_PX, EDGE_N, EDGE_S, EDGE_W, EDGE_E, DIR_STEP, PHASES,
  beamGraphic, emitterBarrels, rotForEdges,
} from './elements.js';
import {
  AUTO_AREAS, AUTO_SETS, ENTRIES, ENTRY_BY_ID, EXIT_INSET, OIL_FLIPPED,
  OIL_SLICK, PALETTE, TEXT_FILE,
  assemblyOf, assemblySquares, assetUrl, beltWindow, blockedEdges,
  distributorExits, emitterSpec, entryForFile, exitBadge, isDistributor,
  kindOfFile, mirrorTurn, mountBases, oilVariant, openVariant, phaseBadge,
  phaseSpec, prettyLabel, propertiesOf, shadowFor, slotOf, submergedBy,
  wallDepth, zIndexOf,
} from './catalog.js';

/* ------------------------------------------------------------------ *
 * Image cache                                                         *
 * ------------------------------------------------------------------ */

const images = new Map();   // file -> {img, ready, failed, promise}

function imageRecord(file) {
  let rec = images.get(file);
  if (rec) return rec;
  const img = new Image();
  rec = { img, ready: false, failed: false };
  rec.promise = new Promise(resolve => {
    img.onload = () => { rec.ready = true; scheduleRender(); resolve(rec); };
    img.onerror = () => { rec.failed = true; resolve(rec); };
  });
  img.src = assetUrl(file);
  images.set(file, rec);
  return rec;
}

/*
 * An image shown behind the whole board. Kept apart from the element graphics:
 * it comes from the user rather than from assets/, and it is a setting rather
 * than board content, so it stays out of the undo history.
 */
const backdrop = { url: null, img: null, ready: false };

function setBackdrop(url) {
  backdrop.url = url;
  backdrop.img = null;
  backdrop.ready = false;
  if (els.btnBackdropOff) els.btnBackdropOff.disabled = !url;
  if (!url) { scheduleRender(); return Promise.resolve(); }

  const img = new Image();
  backdrop.img = img;
  return new Promise(resolve => {
    img.onload = () => {
      if (backdrop.img === img) { backdrop.ready = true; scheduleRender(); }
      resolve(true);
    };
    img.onerror = () => { setStatus('That image could not be read.', true); resolve(false); };
    img.src = url;
  });
}

/** The decoded image, or null while it is still loading. */
function peekImage(file) {
  const rec = imageRecord(file);
  return rec.ready ? rec.img : null;
}

function loadImage(file) { return imageRecord(file).promise; }

/* ------------------------------------------------------------------ *
 * State                                                               *
 * ------------------------------------------------------------------ */

const state = {
  cols: 12,
  rows: 12,
  cells: [],
  zoom: 56,
  tool: 'paint',
  rotMode: 'auto',        // 'auto' or 0..3
  brush: null,            // palette entry
  showGrid: true,
  showCoords: true,
  sel: null,              // {c, r} last clicked square
  hover: null,
  phases: [1, 3, 5],      // register phases given to new phased elements
  shadow: true,           // whether new elements that can have one get a shadow
  beams: 1,               // barrels on a newly placed laser cannon
  text: 'BOARD\nTITLE',    // the words a newly placed text element carries
};

const STORAGE_KEY = 'roborally-board-editor';

function makeCell() { return { floor: null, items: [] }; }

function newCells(cols, rows) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, makeCell));
}

function cellAt(c, r) {
  return (r >= 0 && r < state.rows && c >= 0 && c < state.cols)
    ? state.cells[r][c] : null;
}

/** Topmost placement in a cell, or null. */
function topOf(cell) {
  if (!cell) return null;
  return cell.items.length ? cell.items[cell.items.length - 1] : cell.floor;
}

/* Overlays are kept in drawing order, so the tile looks the same however it
 * was painted, and the last entry is always the one on top. */
function sortItems(cell) {
  cell.items = cell.items
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (zIndexOf(a.p.file) - zIndexOf(b.p.file)) || (a.i - b.i))
    .map(o => o.p);
}

/** Add an overlay, replacing whatever already occupies its slot. */
function addToCell(cell, p) {
  const slot = slotOf(p);
  cell.items = cell.items.filter(q => slotOf(q) !== slot);
  cell.items.push(p);
  sortItems(cell);
}

/** After `keep` was turned, drop anything it now collides with. */
function evictConflicts(cell, keep) {
  const slot = slotOf(keep);
  cell.items = cell.items.filter(q => q === keep || slotOf(q) !== slot);
  sortItems(cell);
}

/** Bring a cell from an older save into the one-element-per-slot shape. */
function normalizeCell(cell) {
  const bySlot = new Map();
  for (const p of cell.items) bySlot.set(slotOf(p), p);
  cell.items = [...bySlot.values()];
  sortItems(cell);
  return cell;
}

function eachPlacement(fn) {
  for (const row of state.cells) {
    for (const cell of row) {
      if (cell.floor) fn(cell.floor);
      for (const it of cell.items) fn(it);
    }
  }
}

/*
 * Build a placement for `entry`. Which properties it carries comes from the
 * element's definition, and each is taken from the field of the brush that
 * property names — so an element gains a property by being defined with one.
 */
function placement(entry) {
  const file = entry.files[(Math.random() * entry.files.length) | 0];
  let rot;
  if (state.rotMode === 'auto') rot = entry.randomRot ? (Math.random() * 4) | 0 : 0;
  else rot = state.rotMode;
  const p = { file, rot };
  for (const spec of propertiesOf(file)) {
    if (!spec.brush) {                          // set on the placement, not the brush
      if (spec.ui === 'route') p.route = {};
      continue;
    }
    const v = state[spec.brush];
    if (spec.ui === 'flag' && !v) continue;     // an unticked box leaves no trace
    p[spec.prop] = Array.isArray(v) ? [...v] : v;
  }
  return p;
}

/** Every graphic a placement needs: its body plus any phase digits. */
function placementFiles(p) {
  if (p.file === TEXT_FILE) return [];      // lettering is drawn, not loaded
  const out = [p.file];
  if (p.phases) for (const n of p.phases) out.push(phaseBadge(p.file, n));
  if (p.route) for (const n of Object.keys(p.route)) out.push(exitBadge(n));
  if (p.shadow) out.push(shadowFor(p.file));
  const emitter = emitterSpec(p.file);
  if (emitter) {
    out.push(...beamGraphics(emitter));
    for (const b of emitterBarrels(emitter, p.count)) out.push(b.mount);
  }
  return out.filter(Boolean);
}

/* ------------------------------------------------------------------ *
 * Runs of wall and ledge                                              *
 * ------------------------------------------------------------------ */

/** The edges of a square walled by the auto tool of this kind. */
function edgesOwned(cell, kind) {
  const out = new Set();
  if (!cell) return out;
  for (const p of cell.items) {
    if (p.auto !== kind) continue;
    const b = blockedEdges(p.file, p.rot);
    for (const e of b.both) out.add(e);
    for (const e of b.leaving) out.add(e);
  }
  return out;
}

/*
 * Whether an edge is walled at all, whichever of the two squares that share it
 * happens to hold the graphic. A run reads as continuous either way, so this is
 * what decides where the end caps come off.
 */
function edgeIsWalled(c, r, edge, kind) {
  if (edgesOwned(cellAt(c, r), kind).has(edge)) return true;
  const n = cellAt(c + DIR_STEP[edge][0], r + DIR_STEP[edge][1]);
  return edgesOwned(n, kind).has((edge + 2) % 4);
}

/** Does the square at (c, r) hold a wall of this kind on that edge itself? */
function ownsEdge(c, r, edge, kind) {
  return edgesOwned(cellAt(c, r), kind).has(edge);
}

/*
 * Corner nubs. Where a run turns, the two bars usually meet inside one square
 * and the corner piece mitres them. But the two halves can end up in squares
 * diagonally across from each other — a run along the bottom of one row turning
 * down a line to its right, say — and then the bars touch at a point only,
 * leaving the corner of the square between them bare. That is the square a nub
 * goes in.
 *
 * `owned` is the square's own set of walled edges, which during a redraw is not
 * yet what its placements say.
 */
function needsNub(kind, c, r, k, owned) {
  if (!AUTO_SETS[kind].nodule) return false;
  const along = (2 + k) % 4, up = (3 + k) % 4;
  const mine = owned || edgesOwned(cellAt(c, r), kind);
  if (mine.has(along) || mine.has(up)) return false;       // our own bar covers it
  return ownsEdge(c + DIR_STEP[up][0], r + DIR_STEP[up][1], along, kind)
      && ownsEdge(c + DIR_STEP[along][0], r + DIR_STEP[along][1], up, kind);
}

function cornerNodules(kind, edges, c, r) {
  const out = [];
  for (let k = 0; k < 4; k++) {
    if (needsNub(kind, c, r, k, edges)) out.push({ file: AUTO_SETS[kind].nodule, rot: k });
  }
  return out;
}

/** The graphics covering one square's walled edges, with their end caps. */
function autoPieces(kind, edges, c, r) {
  const set = AUTO_SETS[kind];
  const es = [...edges].sort((a, b) => a - b);
  const nubs = cornerNodules(kind, edges, c, r);
  if (!es.length) return nubs;

  /*
   * Does the wall carry on past this end of the bar? Either straight on into the
   * next square, or round a corner through a nub — in which case the cap has to
   * come off too, so the bar meets the nub cleanly.
   */
  const carries = (edge, dir) => {
    const nc = c + DIR_STEP[dir][0], nr = r + DIR_STEP[dir][1];
    if (edgeIsWalled(nc, nr, edge, kind)) return true;
    const k = rotForEdges([2, 3], [edge, (dir + 2) % 4]);
    return k !== null && needsNub(kind, nc, nr, k);
  };

  const single = e => ({
    file: openVariant(set.one, carries(e, (e + 1) % 4), carries(e, (e + 3) % 4)),
    rot: (e + 2) % 4,
  });
  const corner = (a, b) => {
    const rot = rotForEdges([2, 3], [a, b]);
    const upright = (3 + rot) % 4, flat = (2 + rot) % 4;
    return {
      file: openVariant(set.corner,
                        carries(upright, (upright + 1) % 4),
                        carries(flat, (flat + 3) % 4)),
      rot,
    };
  };
  const three = missing => {
    const open = carries((3 + missing) % 4, missing) || carries((1 + missing) % 4, missing);
    return { file: openVariant(set.three, open, open), rot: missing };
  };

  if (es.length === 1) return [...nubs, single(es[0])];
  if (es.length === 2) {
    const pieces = (es[1] - es[0]) % 2
      ? [corner(es[0], es[1])] : [single(es[0]), single(es[1])];
    return [...nubs, ...pieces];
  }
  if (es.length === 3) return [...nubs, three([0, 1, 2, 3].find(e => !edges.has(e)))];
  return set.ring ? [{ file: set.ring, rot: 0 }] : [three(0), single(0)];
}

/** Lay the graphics for a square's walled edges, replacing what was there. */
function setAutoEdges(c, r, kind, edges) {
  const cell = cellAt(c, r);
  if (!cell) return;
  /* work the pieces out before clearing: they read the squares around this one,
   * and a neighbour's nub reads back at this one in turn */
  const pieces = autoPieces(kind, edges, c, r);
  cell.items = cell.items.filter(p => p.auto !== kind);
  for (const piece of pieces) {
    cell.items.push({ file: piece.file, rot: piece.rot, auto: kind });
  }
  sortItems(cell);
}

/*
 * Redraw everything a changed edge can reach. Two squares out, not one: an end
 * cap comes off for a nub in the next square along, and whether that nub is
 * there depends on the square beyond it again.
 */
const AUTO_REACH = 2;

function refreshAuto(around, kind) {
  const seen = new Set();
  for (const [c, r] of around) {
    for (let dr = -AUTO_REACH; dr <= AUTO_REACH; dr++) {
      for (let dc = -AUTO_REACH; dc <= AUTO_REACH; dc++) {
        const nc = c + dc, nr = r + dr;
        const key = nc + ',' + nr;
        if (seen.has(key)) continue;
        seen.add(key);
        const cell = cellAt(nc, nr);
        if (cell) setAutoEdges(nc, nr, kind, edgesOwned(cell, kind));
      }
    }
  }
}

/** Wall or unwall one edge of a square. */
function paintEdge(c, r, edge, kind, on) {
  const cell = cellAt(c, r);
  if (!cell) return false;
  const nc = c + DIR_STEP[edge][0], nr = r + DIR_STEP[edge][1];
  const back = (edge + 2) % 4;
  const mine = edgesOwned(cell, kind);
  const theirs = edgesOwned(cellAt(nc, nr), kind);
  let changed = false;

  if (on) {
    if (mine.has(edge) || theirs.has(back)) return false;   // already walled
    mine.add(edge);
    setAutoEdges(c, r, kind, mine);
    changed = true;
  } else {
    /* the edge is one thing however it is stored, so clear it from either side */
    if (mine.has(edge)) { mine.delete(edge); setAutoEdges(c, r, kind, mine); changed = true; }
    if (theirs.has(back)) { theirs.delete(back); setAutoEdges(nc, nr, kind, theirs); changed = true; }
  }
  if (changed) refreshAuto([[c, r], [nc, nr]], kind);
  return changed;
}

/* ------------------------------------------------------------------ *
 * Painting areas of pit                                               *
 * ------------------------------------------------------------------ */

/* A sunk square is one whose floor the tool laid; only the rim round it is an
 * overlay. */
function isPit(c, r, kind) {
  const cell = cellAt(c, r);
  return !!cell && !!cell.floor && cell.floor.auto === kind;
}

/*
 * The rim goes round a pit wherever it stops, so a square's pieces follow the
 * sides where the pit does not carry on. A square walled in on all sides by
 * more pit is just the dark floor.
 */
function pitPieces(kind, c, r) {
  const set = AUTO_AREAS[kind];
  const out = [];

  if (!isPit(c, r, kind)) return out;

  const open = [0, 1, 2, 3].filter(e => !isPit(c + DIR_STEP[e][0], r + DIR_STEP[e][1], kind));

  /*
   * Waste has no corner or ring tile: its bank is simply drawn along the foot
   * of a square, so one is laid on each side the pool stops at, taking any of
   * the interchangeable bank tiles. The choice is made from the position so
   * that it keeps still as the pool around it is painted.
   */
  if (set.bank) {
    for (const e of open) {
      const v = (((c * 7 + r * 13 + e * 5) % set.banks.length) + set.banks.length)
                % set.banks.length;
      out.push({ file: set.banks[v], rot: (e + 2) % 4, bank: set.bank });
    }
    return out;
  }

  /*
   * A pit's rim is drawn inside the pit, so where the pit turns around the
   * outside of a square the two rims meeting at that corner sit in squares
   * diagonally apart. The bare corner is the inner one of the turn, inside this
   * square, when both neighbours along it are pit and the one across the corner
   * from it is not.
   */
  for (let k = 0; k < 4; k++) {
    const a = (2 + k) % 4, b = (3 + k) % 4;
    const da = DIR_STEP[a], db = DIR_STEP[b];
    if (isPit(c + da[0], r + da[1], kind) && isPit(c + db[0], r + db[1], kind)
        && !isPit(c + da[0] + db[0], r + da[1] + db[1], kind)) {
      out.push({ file: set.nodule, rot: k });
    }
  }

  if (!open.length) return out;                       // deep inside the pit
  if (open.length === 4) {
    if (set.all) out.push({ file: set.all, rot: 0 });
    else out.push({ file: set.three, rot: 0 }, { file: set.edge, rot: 2 });
    return out;
  }
  if (open.length === 3) {
    out.push({ file: set.three, rot: [0, 1, 2, 3].find(e => !open.includes(e)) });
  } else if (open.length === 2 && (open[1] - open[0]) % 2) {
    out.push({ file: set.corner, rot: rotForEdges([2, 3], open) });
  } else {
    for (const e of open) out.push({ file: set.edge, rot: (e + 2) % 4 });
  }
  return out;
}

const PIT_KINDS = Object.keys(AUTO_AREAS);

/** Sink a square or fill it back in, and redraw the rim around it. */
function paintPit(c, r, kind, on) {
  const cell = cellAt(c, r);
  if (!cell || isPit(c, r, kind) === on) return false;

  if (on) {
    /* keep whatever floor was there, so filling the square back in puts it
     * back rather than leaving a hole */
    const beneath = cell.floor && cell.floor.auto ? cell.floor.under || null : cell.floor || null;
    for (const k of PIT_KINDS) cell.items = cell.items.filter(p => p.auto !== k);
    /* sludge has a pattern of its own, so each square of it is turned at
     * random to keep a pool from looking tiled */
    const spin = AUTO_AREAS[kind].spin ? (Math.random() * 4) | 0 : 0;
    cell.floor = { file: AUTO_AREAS[kind].floor, rot: spin, auto: kind, under: beneath };
  } else {
    cell.floor = cell.floor.under || null;
  }

  refreshPits(c, r);
  return true;
}

/*
 * Redraw the rim of every square around one that changed, and the nubs, which
 * read the corners diagonally. All of them are worked out before any is laid,
 * so that clearing one square does not change what its neighbours see.
 */
function refreshPits(c, r) {
  const jobs = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc, nr = r + dr;
      if (!cellAt(nc, nr)) continue;
      for (const k of PIT_KINDS) jobs.push([nc, nr, k, pitPieces(k, nc, nr)]);
    }
  }
  for (const [nc, nr, k, pieces] of jobs) {
    const t = cellAt(nc, nr);
    t.items = t.items.filter(p => p.auto !== k);
    for (const piece of pieces) {
      const item = { file: piece.file, rot: piece.rot, auto: k };
      if (piece.bank) item.bank = piece.bank;
      t.items.push(item);
    }
    sortItems(t);
  }
}

/* ------------------------------------------------------------------ *
 * Painting a trail of oil                                             *
 * ------------------------------------------------------------------ */

function isOil(c, r) {
  const cell = cellAt(c, r);
  return !!cell && cell.items.some(p => p.auto === 'oil');
}

function isOilStart(c, r) {
  const cell = cellAt(c, r);
  return !!cell && cell.items.some(p => p.auto === 'oil' && p.start);
}

/*
 * The tile for one square of a trail, from the sides the oil carries on into.
 * The square the trail was begun from keeps its drum; a square the trail simply
 * runs out at gets a drain.
 */
function oilPiece(c, r) {
  if (!isOil(c, r)) return null;
  const joins = [0, 1, 2, 3].filter(e => isOil(c + DIR_STEP[e][0], r + DIR_STEP[e][1]));
  const start = isOilStart(c, r);

  /* a square with nothing running off it is just a splash, drum or no drum:
   * the drum only makes sense once the trail leads somewhere */
  let group;
  if (!joins.length) group = 'alone';
  else if (joins.length === 1) group = start ? 'start' : 'end';
  else if (joins.length === 2) {
    const bend = (joins[1] - joins[0]) % 2 !== 0;
    group = bend ? (start ? 'startCorner' : 'corner') : 'straight';
  } else group = joins.length === 3 ? 'three' : 'four';

  const spec = OIL_SLICK[group];
  const file = oilVariant(group, c, r);
  /* a couple of the end tiles are drawn joining the other way round */
  const flip = OIL_FLIPPED.has(file) ? 2 : 0;
  const rot = joins.length ? (rotForEdges(spec.base, joins) + flip) % 4 : 0;
  return { file, rot, start };
}

/** Lay or lift a square of oil, redrawing the trail around it. */
function paintOil(c, r, on) {
  const cell = cellAt(c, r);
  if (!cell || isOil(c, r) === on) return false;

  if (on) {
    const alone = ![0, 1, 2, 3].some(e => isOil(c + DIR_STEP[e][0], r + DIR_STEP[e][1]));
    const p = { file: 'Oil_Splash', rot: 0, auto: 'oil' };
    if (alone) p.start = true;             // where the trail was begun
    cell.items.push(p);
  } else {
    cell.items = cell.items.filter(p => p.auto !== 'oil');
  }

  refreshOil(c, r);
  return true;
}

/** Redraw the trail around a square that changed. */
function refreshOil(c, r) {
  const jobs = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      const nc = c + dc, nr = r + dr;
      if (cellAt(nc, nr)) jobs.push([nc, nr, oilPiece(nc, nr)]);
    }
  }
  for (const [nc, nr, piece] of jobs) {
    const t = cellAt(nc, nr);
    t.items = t.items.filter(p => p.auto !== 'oil');
    if (piece) {
      const laid = { file: piece.file, rot: piece.rot, auto: 'oil' };
      if (piece.start) laid.start = true;
      t.items.push(laid);
    }
    sortItems(t);
  }
}

/*
 * Every piece the painting tools lay is stamped with the tool that laid it, so
 * a piece taken away or turned by any other means — the eraser, the cell panel,
 * Del, the wheel — can put the rest of its run, area or trail right again.
 */
function repairAuto(c, r, kinds) {
  for (const kind of kinds) {
    if (AUTO_SETS[kind]) refreshAuto([[c, r]], kind);
    else if (AUTO_AREAS[kind]) refreshPits(c, r);
    else if (kind === 'oil') refreshOil(c, r);
  }
}

/** The tools whose pieces a square holds, floor included. */
function autoKindsIn(cell) {
  const kinds = new Set();
  if (!cell) return kinds;
  for (const p of cell.items) if (p.auto) kinds.add(p.auto);
  if (cell.floor && cell.floor.auto) kinds.add(cell.floor.auto);
  return kinds;
}

/** Which edge of a square a click at (fx, fy) within it is nearest. */
function nearestEdge(fx, fy) {
  const away = [fy, 1 - fx, 1 - fy, fx];      // north, east, south, west
  let best = 0;
  for (let e = 1; e < 4; e++) if (away[e] < away[best]) best = e;
  return best;
}

/*
 * Dragging along a line of squares should lay a straight wall. Left to itself
 * the nearest edge flips as the pointer wanders over a corner, so the first
 * edge of a drag pins the grid line being walled and the side of it the bar
 * sits on; the rest of the drag just moves along that line.
 */
function edgeLock(t) {
  return (t.edge % 2 === 0)                        // north or south: a level line
    ? { level: true, edge: t.edge, line: t.edge === 0 ? t.r : t.r + 1 }
    : { level: false, edge: t.edge, line: t.edge === 3 ? t.c : t.c + 1 };
}

function lockedTarget(p, lock) {
  const c = lock.level ? p.c : (lock.edge === 3 ? lock.line : lock.line - 1);
  const r = lock.level ? (lock.edge === 0 ? lock.line : lock.line - 1) : p.r;
  return cellAt(c, r) ? { c, r, edge: lock.edge } : null;
}

/** The edge a pointer event is aiming at, following any lock a drag has set. */
function edgeTarget(p, lock) {
  if (!state.brush || !state.brush.auto) return null;
  return lock ? lockedTarget(p, lock)
              : { c: p.c, r: p.r, edge: nearestEdge(p.fx, p.fy) };
}

/* ------------------------------------------------------------------ *
 * Undo / redo                                                         *
 * ------------------------------------------------------------------ */

let undoStack = [], redoStack = [];

function snapshot() {
  return JSON.stringify({ cols: state.cols, rows: state.rows, cells: state.cells });
}

function pushUndo() {
  undoStack.push(snapshot());
  if (undoStack.length > 120) undoStack.shift();
  redoStack.length = 0;
  updateUndoButtons();
}

/*
 * Restore a board, from the undo history or from the last autosave. The stack
 * within a square is sorted again rather than taken as it comes: a board saved
 * before the drawing order was last changed would otherwise keep the old order
 * and, say, hide a ramp behind the ledge it climbs.
 */
function restore(json) {
  const o = JSON.parse(json);
  state.cols = o.cols;
  state.rows = o.rows;
  state.cells = o.cells.map(row => row.map(normalizeCell));
  if (state.sel && !cellAt(state.sel.c, state.sel.r)) state.sel = null;
  els.inCols.value = state.cols;
  els.inRows.value = state.rows;
}

function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
  afterChange();
}

function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
  afterChange();
}

function updateUndoButtons() {
  els.btnUndo.disabled = !undoStack.length;
  els.btnRedo.disabled = !redoStack.length;
}

/* ------------------------------------------------------------------ *
 * Drawing                                                             *
 * ------------------------------------------------------------------ */

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}

/* Graphics keep their native size relative to a 150 px square, so the small
 * number badges stay small instead of being blown up to a full tile. */
function drawPlacement(g, img, x, y, tile, rot) {
  const k = tile / TILE_PX;
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  g.save();
  g.translate(x + tile / 2, y + tile / 2);
  if (rot) g.rotate(rot * Math.PI / 2);
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.restore();
}

/* ------------------------------------------------------------------ *
 * Lettering                                                           *
 * ------------------------------------------------------------------ */

/*
 * Measured off the title printed on the Baggage Claim board: black bold sans,
 * set in caps 23px tall — about 33px of type at 150px to the square — on 36px
 * lines, the longer of its two lines filling 134px of the 150. The printed face
 * is a narrower one than anything we can count on having, so the size above is
 * a ceiling and the fitting below is what decides the size actually used.
 */
const TEXT_FONT = 'Arial, Helvetica, sans-serif';
const TEXT_MAX = 33;        // font size at TILE_PX, before any shrinking
const TEXT_MIN = 7;
const TEXT_LEAD = 1.09;     // line spacing, in ems
const TEXT_FIT = 0.9;       // how much of the square the block may fill

/*
 * Wrap `paras` into lines no wider than `room`, at whatever size the context's
 * font is set to. A word too wide to stand on a line of its own is left over-long
 * unless `hard` is set, when it is broken across lines instead — the layout
 * shrinks the type to avoid that as long as there is room to.
 */
function wrapText(g, paras, room, hard) {
  const lines = [];
  for (const para of paras) {
    let line = '';
    for (let word of para.split(/\s+/).filter(Boolean)) {
      while (hard && g.measureText(word).width > room && word.length > 1) {
        let n = 1;
        while (n < word.length && g.measureText(word.slice(0, n + 1)).width <= room) n++;
        if (line) { lines.push(line); line = ''; }
        lines.push(word.slice(0, n));
        word = word.slice(n);
      }
      const next = line ? line + ' ' + word : word;
      if (line && g.measureText(next).width > room) { lines.push(line); line = word; }
      else line = next;
    }
    lines.push(line);                         // a line you left blank stays blank
  }
  return lines;
}

/*
 * Break `text` into lines that fit a square and pick the size to set them at.
 * Lines the user typed are kept; anything too long is wrapped at a space, and
 * the size comes down until the block fits the square both ways. Wrapping
 * depends on the size, so the two are settled together, largest first.
 *
 * It is all worked out at TILE_PX and scaled when drawn, so the lettering on
 * screen is the lettering in the exported PNG.
 */
function textLayout(g, text) {
  const room = TILE_PX * TEXT_FIT;
  const paras = String(text).split('\n');

  for (let size = TEXT_MAX; size >= TEXT_MIN; size -= 0.5) {
    g.font = 'bold ' + size + 'px ' + TEXT_FONT;
    const lines = wrapText(g, paras, room, false);
    if (lines.every(l => g.measureText(l).width <= room)
        && lines.length * size * TEXT_LEAD <= room) {
      return { size, lines };
    }
  }
  /* as small as the type goes: break the words themselves rather than run over */
  g.font = 'bold ' + TEXT_MIN + 'px ' + TEXT_FONT;
  return { size: TEXT_MIN, lines: wrapText(g, paras, room, true) };
}

/* Lettering for a board title, centred in its square and turning with it. */
function drawText(g, p, x, y, tile) {
  if (!p.text) return;
  g.save();
  g.translate(x + tile / 2, y + tile / 2);
  if (p.rot) g.rotate(p.rot * Math.PI / 2);
  g.scale(tile / TILE_PX, tile / TILE_PX);
  const lay = textLayout(g, p.text);
  const step = lay.size * TEXT_LEAD;
  g.fillStyle = '#000';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const top = -(lay.lines.length - 1) * step / 2;
  lay.lines.forEach((line, i) => g.fillText(line, 0, top + i * step));
  g.restore();
}

/*
 * A bank is the strip along the foot of a waste tile. Drawing it on its own
 * over a square of sludge lets a pool stop on any combination of sides without
 * an artwork for every shape. The strip is cut deep enough to clear the highest
 * point of the shore and faded out along its inner edge, so that the sludge it
 * brings with it melts into the sludge already there instead of ending on a
 * straight line across the square.
 */
const BANK_FADE = 16;                       // how far the inner edge fades, in TILE_PX
const bankPad = document.createElement('canvas');

function drawBank(g, img, x, y, tile, rot, depth) {
  const k = tile / TILE_PX;
  const d = Math.ceil(depth * k), fade = BANK_FADE * k;
  const w = Math.ceil(tile);
  if (d < 1 || w < 1) return;

  bankPad.width = w; bankPad.height = d;
  const p = bankPad.getContext('2d');
  p.clearRect(0, 0, w, d);
  const iw = img.naturalWidth * k, ih = img.naturalHeight * k;
  p.drawImage(img, (tile - iw) / 2, (tile - ih) / 2 - (tile - d), iw, ih);

  const grad = p.createLinearGradient(0, 0, 0, fade);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  p.globalCompositeOperation = 'destination-in';
  p.fillStyle = grad;
  p.fillRect(0, 0, w, d);
  p.globalCompositeOperation = 'source-over';

  g.save();
  g.translate(x + tile / 2, y + tile / 2);
  if (rot) g.rotate(rot * Math.PI / 2);
  g.drawImage(bankPad, -tile / 2, tile / 2 - d);
  g.restore();
}

/*
 * Draw the digits for the phases a placement fires in. Full-tile digits carry
 * their own position, so they just go on top of the body; small badges are laid
 * out in a row centred on the element, inside the same rotation as the body so
 * they turn with it.
 */
function drawPhaseBadges(g, p, x, y, tile, resolve, belt, stand) {
  const spec = phaseSpec(p.file);
  if (!spec || !p.phases || !p.phases.length) return;

  const imgs = [...p.phases].sort((a, b) => a - b)
    .map(n => resolve(phaseBadge(p.file, n)))
    .filter(Boolean);
  if (!imgs.length) return;

  /* with a belt running underneath, the middle of the disc is taken by the
   * arrow, so the numbers go either side of it instead */
  const win = belt && beltWindow(p.file);
  if (win && win.badges) {
    const frame = badgeFrame(p.rot, belt.rot);
    /* The numbers sit a little back from the middle, away from the arrowhead.
     * Turning the arrangement over must not carry them across to the head, so
     * the setback is measured from the far side in the turned-over frame. */
    const lay = frame === belt.rot
      ? win.badges
      : Object.assign({}, win.badges, { y: TILE_PX - win.badges.y });
    drawFlankingBadges(g, frame, imgs, lay, x, y, tile);
    return;
  }

  if (!spec.anchor) {
    for (const img of imgs) drawMounted(g, img, x, y, tile, p.rot, stand || 0);
    return;
  }

  /* Round elements run out of width past two digits, so those wrap onto a
   * second line the way the crushers with numbers baked in do. */
  const rows = (spec.stack && imgs.length > 2)
    ? [imgs.slice(0, Math.ceil(imgs.length / 2)), imgs.slice(Math.ceil(imgs.length / 2))]
    : [imgs];

  const k = tile / TILE_PX;
  const lineH = Math.max(...imgs.map(img => img.naturalHeight));
  /* anchored numbers ride along when the element is stood off its wall */
  const anchorY = spec.anchor[1] - (stand || 0);
  let cy = anchorY - (rows.length * lineH) / 2 + lineH / 2;          // 150-px space

  g.save();
  g.translate(x + tile / 2, y + tile / 2);
  if (p.rot) g.rotate(p.rot * Math.PI / 2);
  if (spec.shadow) {                       // lift them off the floor behind them
    g.shadowColor = 'rgba(0,0,0,0.85)';
    g.shadowBlur = 4 * k;
  }
  for (const line of rows) {
    let cx = spec.anchor[0] - line.reduce((w, img) => w + img.naturalWidth, 0) / 2;
    for (const img of line) {
      const w = img.naturalWidth, h = img.naturalHeight;
      g.drawImage(img, (cx - TILE_PX / 2) * k, (cy - h / 2 - TILE_PX / 2) * k, w * k, h * k);
      cx += w;
    }
    cy += lineH;
  }
  g.restore();
}

/*
 * Where a column's numbers sit, in pitches from the middle of the column, given
 * how many are in the column opposite. The two columns interleave: a pair
 * spreads around a lone number opposite so the three read as a triangle, and
 * against a full column of three it tucks into the two gaps instead.
 */
function badgeSlots(count, opposite) {
  if (count <= 1) return count ? [0] : [];
  if (count === 2) return opposite === 3 ? [-0.5, 0.5] : [-1, 1];
  return [-1, 0, 1];
}

/*
 * Which way round the flanking numbers go. They have to line up with the belt to
 * stay off its arrow, which leaves two arrangements a half turn apart; turning
 * the crusher picks between them, and a quarter turn rounds to the nearer one
 * rather than dropping the numbers onto the arrow.
 */
function badgeFrame(hostRot, beltRot) {
  const quarter = (((hostRot - beltRot) % 4) + 4) % 4;
  return (beltRot + (quarter >= 2 ? 2 : 0)) % 4;
}

/*
 * Lay the phase numbers out in two columns flanking the belt's arrow, lowest
 * phase first down the right-hand one, in the frame `badgeFrame` chose. Every
 * number gets the same quarter turn as on the crushers that ship with their
 * phases drawn in.
 */
function drawFlankingBadges(g, frame, imgs, lay, x, y, tile) {
  const k = tile / TILE_PX;
  const half = Math.ceil(imgs.length / 2);
  const columns = [[1, imgs.slice(0, half)], [-1, imgs.slice(half)]];

  g.save();
  g.translate(x + tile / 2, y + tile / 2);
  if (frame) g.rotate(frame * Math.PI / 2);

  for (const [side, list] of columns) {
    const slots = badgeSlots(list.length, imgs.length - list.length);
    list.forEach((img, i) => {
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      g.save();
      g.translate(side * lay.offset * k,
                  (lay.y - TILE_PX / 2 + slots[i] * lay.pitch) * k);
      g.rotate(lay.turn * Math.PI / 2);
      g.drawImage(img, -w / 2, -h / 2, w, h);
      g.restore();
    });
  }
  g.restore();
}

/*
 * The flat colour of a belt's central strip, used to paint out its arrow. Read
 * once per graphic off an offscreen canvas; the median ignores the arrow, which
 * covers well under half the strip. Returns null when the pixels cannot be read
 * — over file:// the canvas is tainted — and the mask is then simply skipped.
 */
const beltTones = new Map();

function beltTone(file) {
  if (beltTones.has(file)) return beltTones.get(file);
  const rec = images.get(file);
  if (!rec || !rec.ready) return null;          // not cached: retry once loaded

  let tone = null;
  try {
    const c = document.createElement('canvas');
    c.width = c.height = TILE_PX;
    const cg = c.getContext('2d', { willReadFrequently: true });
    cg.drawImage(rec.img, 0, 0, TILE_PX, TILE_PX);
    const band = BELT_BAND;
    const px = cg.getImageData(TILE_PX / 2 - band, 0, band * 2, TILE_PX).data;
    const mid = [0, 1, 2].map(ch => {
      const hist = new Uint32Array(256);
      for (let i = ch; i < px.length; i += 4) hist[px[i]]++;
      let seen = 0;
      const half = px.length / 8;
      for (let v = 0; v < 256; v++) { seen += hist[v]; if (seen >= half) return v; }
      return 0;
    });
    tone = `rgb(${mid[0]},${mid[1]},${mid[2]})`;
  } catch { tone = null; }

  beltTones.set(file, tone);
  return tone;
}

const BELT_BAND = 37;   // half-width of the strip every belt keeps its arrow in

/*
 * Flatten the belt's own arrow to the belt's colour around the crusher, so the
 * arrow appears only inside the crusher's window. Darkening leaves the strip's
 * dark texture as it is and only pulls the bright arrow down to the surrounding
 * tone; the strip is narrower than the side rollers, which are left alone.
 */
function maskBeltArrow(g, spec, belt, x, y, tile) {
  const tone = beltTone(belt.file);
  if (!tone) return;

  const k = tile / TILE_PX;
  const cx = x + tile / 2, cy = y + tile / 2;

  g.save();
  g.beginPath();
  g.arc(cx, cy, spec.maskRadius * k, 0, Math.PI * 2);
  g.clip();
  g.translate(cx, cy);
  if (belt.rot) g.rotate(belt.rot * Math.PI / 2);
  g.globalCompositeOperation = 'darken';
  g.fillStyle = tone;
  g.fillRect(-spec.band * k, -tile / 2, spec.band * 2 * k, tile);
  g.restore();
}

/*
 * Redraw the conveyor inside a crusher's window so its arrow shows through the
 * crusher's background. Lightening keeps the crusher's dotted disc visible and
 * lets only the bright arrow come through; the belt is scaled down uniformly so
 * the whole arrow sits inside the disc, and the window is clipped to the belt's
 * central strip so the side rollers are not scaled in with it.
 */
function drawBeltWindow(g, host, belt, x, y, tile, resolve) {
  const spec = beltWindow(host.file);
  if (!spec || !belt) return;
  const img = resolve(belt.file);
  if (!img) return;

  const k = tile / TILE_PX;
  const cx = x + tile / 2, cy = y + tile / 2;
  const band = spec.band * spec.scale * k;

  g.save();
  g.beginPath();
  g.arc(cx, cy, spec.radius * k, 0, Math.PI * 2);
  g.clip();
  g.translate(cx, cy);
  if (belt.rot) g.rotate(belt.rot * Math.PI / 2);
  g.beginPath();
  g.rect(-band, -tile / 2, band * 2, tile);
  g.clip();
  g.globalAlpha = spec.alpha;
  g.globalCompositeOperation = 'lighten';
  g.scale(spec.scale, spec.scale);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.restore();
}

/* Wash the floor back over an element standing in water, so it reads as sunk
 * into it rather than sitting on top. */
function drawSubmerge(g, cell, p, x, y, tile, resolve) {
  const floor = cell.floor;
  const spec = floor && submergedBy(floor.file, p.file);
  if (!spec) return;
  const img = resolve(floor.file);
  if (!img) return;

  g.save();
  g.globalAlpha = spec.alpha;
  drawPlacement(g, img, x, y, tile, floor.rot);
  g.restore();
}

/* ------------------------------------------------------------------ *
 * Laser beams                                                         *
 * ------------------------------------------------------------------ */

/*
 * What stops a beam crossing out of (c, r) heading in direction `dir`: null if
 * nothing does, otherwise how far short of the edge of the square it ends. A
 * wall in this square stands its own depth into it and the beam stops against
 * that face; one in the next square stands away from the shared edge, so the
 * beam runs all the way to it.
 */
function beamStop(c, r, dir) {
  const here = cellAt(c, r);
  if (!here) return 0;
  const back = (dir + 2) % 4;

  let depth = null;
  for (const p of here.items) {
    const b = blockedEdges(p.file, p.rot);
    if (b.both.includes(dir) || b.leaving.includes(dir)) {
      depth = Math.max(depth === null ? 0 : depth, wallDepth(p.file));
    }
  }
  if (depth !== null) return depth;

  const next = cellAt(c + DIR_STEP[dir][0], r + DIR_STEP[dir][1]);
  if (!next) return 0;                          // the edge of the board
  for (const p of next.items) {
    if (blockedEdges(p.file, p.rot).both.includes(back)) return 0;
  }
  return null;
}

/*
 * How deep the wall a cannon is bolted to stands into the square. A cannon fires
 * away from its mounting edge, so that edge is behind it; anything walling the
 * edge off pushes the cannon in ahead of itself.
 */
function mountDepth(cell, edge, self) {
  if (!cell || edge === null) return 0;
  let depth = 0;
  for (const p of cell.items) {
    if (p === self) continue;                   // a piston wall is not its own wall
    const b = blockedEdges(p.file, p.rot);
    if (b.both.includes(edge) || b.leaving.includes(edge)) {
      depth = Math.max(depth, wallDepth(p.file));
    }
  }
  return depth;
}

/*
 * How far a placement is stood off the walls it is bolted to, in its own frame:
 * `in` away from the edge it faces, `side` away from the one beside it. An
 * angled mirror sits in a corner and can be pushed off both.
 */
function standOff(cell, p) {
  const off = { in: 0, side: 0 };
  for (const base of mountBases(p.file)) {
    const depth = mountDepth(cell, (base + p.rot) % 4, p);
    if (!depth) continue;
    if (base === EDGE_S) off.in += depth;
    else if (base === EDGE_N) off.in -= depth;
    else if (base === EDGE_W) off.side += depth;
    else off.side -= depth;
  }
  return off;
}

function mirrorInCell(cell) {
  for (const p of cell.items) {
    const turn = mirrorTurn(p.file, p.rot);
    if (turn) return turn;
  }
  return null;
}

/*
 * Follow one barrel's beam from its cannon until something stops it, collecting
 * a piece per tile it crosses. Each piece records the two edges the beam
 * touches — where it came in and where it goes on — so a tile it passes through
 * gets a full-width beam and one where a mirror turns it gets an elbow.
 */
function traceBeam(c, r, dir, off, spec, out, inset) {
  const seen = new Set();
  let cc = c, rr = r, d = dir;
  let drawn = 0;

  for (let step = 0; step < 500; step++) {
    const key = cc + ',' + rr + ',' + d;
    if (seen.has(key)) return;                  // mirrors sending it in circles
    seen.add(key);

    const cell = cellAt(cc, rr);
    if (!cell) return;
    const from = d;
    if (spec.reflects) {
      const turn = mirrorInCell(cell);
      if (turn) d = turn[d];
    }

    /* the beam starts at the muzzle, not at the edge of the square, and ends
     * against the face of whatever stops it */
    const stop = beamStop(cc, rr, d);
    if (!(spec.skipSource && step === 0)) {
      out.push({ c: cc, r: rr, file: beamGraphic(spec, drawn++), off, in: from, out: d,
                 inset: step ? 0 : inset, stop: stop === null ? 0 : stop });
    }
    if (stop !== null) return;
    cc += DIR_STEP[d][0];
    rr += DIR_STEP[d][1];
  }
}

/** Every beam on the board, worked out from the cannons rather than stored. */
function traceAllBeams() {
  const out = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      for (const p of state.cells[r][c].items) {
        const spec = emitterSpec(p.file);
        if (!spec) continue;
        const inset = spec.muzzle && standOff(state.cells[r][c], p).in + spec.muzzle;
        for (const b of emitterBarrels(spec, p.count)) {
          traceBeam(c, r, p.rot, b.off, spec, out, inset);
        }
      }
    }
  }
  return out;
}

/*
 * Draw the half of a beam running from the middle of a tile out to one edge.
 * The offset that separates the barrels of a multiple laser is taken square to
 * the direction of travel, so parallel beams stay parallel through a turn.
 */
function drawBeamArm(g, img, x, y, tile, point, travel, off, inset) {
  const k = tile / TILE_PX;
  const half = tile / 2;
  const i = (inset || 0) * k;                 // trimmed off the outer end
  if (i >= half) return;
  const boxes = [[x, y + i, tile, half - i], [x + half, y, half - i, tile],
                 [x, y + half, tile, half - i], [x + i, y, half - i, tile]];
  const perp = DIR_STEP[(travel + 1) % 4];

  g.save();
  g.beginPath();
  g.rect(...boxes[point]);
  g.clip();
  g.translate(x + half + perp[0] * off * k, y + half + perp[1] * off * k);
  if (travel % 2) g.rotate(Math.PI / 2);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  g.drawImage(img, -w / 2, -h / 2, w, h);
  g.restore();
}

function drawBeams(g, tile, resolve) {
  for (const b of traceAllBeams()) {
    const img = resolve(b.file);
    if (!img) continue;
    const x = b.c * tile, y = b.r * tile;
    drawBeamArm(g, img, x, y, tile, (b.in + 2) % 4, b.in, b.off, b.inset);
    drawBeamArm(g, img, x, y, tile, b.out, b.out, b.off, b.stop);
  }
}

/* Like drawPlacement, but standing the graphic off its mounting edge — a laser
 * cannon bolted to a wall sits on the face of it, not inside it. */
function drawMounted(g, img, x, y, tile, rot, inward, sideways) {
  if (!inward && !sideways) { drawPlacement(g, img, x, y, tile, rot); return; }
  const k = tile / TILE_PX;
  g.save();
  g.translate(x + tile / 2, y + tile / 2);
  if (rot) g.rotate(rot * Math.PI / 2);
  const w = img.naturalWidth * k, h = img.naturalHeight * k;
  g.drawImage(img, -w / 2 + (sideways || 0) * k, -h / 2 - (inward || 0) * k, w, h);
  g.restore();
}

/*
 * A distributor's numbers go against the edge a robot leaves by, turned to read
 * along it, the way the printed boards show them.
 */
function drawExitBadges(g, p, x, y, tile, resolve) {
  if (!p.route || !isDistributor(p.file)) return;
  const k = tile / TILE_PX;

  /* the route says where each phase sends a robot; the numbers are printed
   * grouped at the side they send it out of */
  const ways = distributorExits(p.file);
  const byExit = {};
  for (const n of PHASES) {
    const rel = p.route[n];
    if (rel === undefined || rel === null || !ways.includes(rel)) continue;
    (byExit[rel] = byExit[rel] || []).push(n);
  }

  for (const rel of [0, 1, 2, 3]) {
    const phases = byExit[rel];
    if (!phases || !phases.length) continue;
    const imgs = [...phases].sort((a, b) => a - b)
      .map(n => resolve(exitBadge(n))).filter(Boolean);
    if (!imgs.length) continue;

    g.save();
    g.translate(x + tile / 2, y + tile / 2);
    g.rotate(((rel + p.rot) % 4) * Math.PI / 2);
    g.shadowColor = 'rgba(0,0,0,0.85)';
    g.shadowBlur = 4 * k;
    let cx = -imgs.reduce((t, i) => t + i.naturalWidth, 0) * k / 2;
    const cy = (-TILE_PX / 2 + EXIT_INSET) * k;
    for (const img of imgs) {
      const w = img.naturalWidth * k, h = img.naturalHeight * k;
      g.drawImage(img, cx, cy - h / 2, w, h);
      cx += w;
    }
    g.restore();
  }
}

/** Draw every tile. `resolve` returns an image or null (editor: skip). */
function drawTiles(g, tile, resolve) {
  /* the background goes down first, so anything transparent lets it through */
  if (backdrop.ready) {
    g.drawImage(backdrop.img, 0, 0, state.cols * tile, state.rows * tile);
  }
  /* Phase numbers wait until every square is down. A long flamer wears its
   * numbers on the half of it in the next square along, and that square may not
   * have been drawn yet. */
  const numbers = [];
  for (let r = 0; r < state.rows; r++) {
    for (let c = 0; c < state.cols; c++) {
      const cell = state.cells[r][c];
      const x = c * tile, y = r * tile;
      const stack = cell.floor ? [cell.floor, ...cell.items] : cell.items;
      const belt = cell.items.find(q => kindOfFile(q.file).key === 'belt');
      const host = belt && cell.items.find(q => beltWindow(q.file));
      for (const p of stack) {
        if (p.shadow) {
          const sh = resolve(shadowFor(p.file));
          if (sh) drawPlacement(g, sh, x, y, tile, p.rot);
        }
        const stand = standOff(cell, p);
        const emitter = emitterSpec(p.file);
        const barrels = emitter && emitter.mounts;
        if (barrels) {
          for (const b of emitterBarrels(emitter, p.count)) {
            const barrel = resolve(b.mount);
            if (barrel) drawMounted(g, barrel, x, y, tile, p.rot, stand.in, b.shift + stand.side);
          }
        }
        const img = barrels || p.file === TEXT_FILE ? null : resolve(p.file);
        if (p.file === TEXT_FILE) drawText(g, p, x, y, tile);
        else if (img && p.bank) drawBank(g, img, x, y, tile, p.rot, p.bank);
        else if (img) drawMounted(g, img, x, y, tile, p.rot, stand.in, stand.side);
        /* paint the belt's arrow out straight away, before anything else in
         * the square is drawn over it */
        if (host && p === belt) maskBeltArrow(g, beltWindow(host.file), belt, x, y, tile);
        if (p === host) drawBeltWindow(g, p, belt, x, y, tile, resolve);
        drawSubmerge(g, cell, p, x, y, tile, resolve);
        if (p.phases && p.phases.length) numbers.push([p, x, y, belt, stand.in]);
        if (p.route) drawExitBadges(g, p, x, y, tile, resolve);
      }
    }
  }
  for (const [p, x, y, belt, stand] of numbers) {
    drawPhaseBadges(g, p, x, y, tile, resolve, belt, stand);
  }
  drawBeams(g, tile, resolve);      // beams run over the squares they cross
}

function drawGridLines(g, tile, colour) {
  g.save();
  g.strokeStyle = colour;
  g.lineWidth = 1;
  g.beginPath();
  for (let c = 0; c <= state.cols; c++) {
    const x = Math.round(c * tile) + 0.5;
    g.moveTo(x, 0); g.lineTo(x, state.rows * tile);
  }
  for (let r = 0; r <= state.rows; r++) {
    const y = Math.round(r * tile) + 0.5;
    g.moveTo(0, y); g.lineTo(state.cols * tile, y);
  }
  g.stroke();
  g.restore();
}

function colName(c) {
  let s = '';
  do { s = String.fromCharCode(65 + (c % 26)) + s; c = Math.floor(c / 26) - 1; }
  while (c >= 0);
  return s;
}

function render() {
  const tile = state.zoom;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = state.cols * tile, h = state.rows * tile;

  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';

  drawTiles(ctx, tile, peekImage);

  if (state.showGrid) drawGridLines(ctx, tile, 'rgba(255,255,255,0.14)');

  if (state.showCoords && tile >= 38) {
    ctx.save();
    ctx.font = `${Math.max(9, Math.round(tile * 0.17))}px system-ui, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const t = colName(c) + (r + 1);
        ctx.strokeText(t, c * tile + 3, r * tile + 2);
        ctx.fillText(t, c * tile + 3, r * tile + 2);
      }
    }
    ctx.restore();
  }

  /* the cursor shows every square the brush will cover, not just the one under
   * the pointer */
  const footprint = state.brush && state.brush.assembly
    ? assemblySquares(state.brush.files[0]) : [[0, 0]];

  const outline = (p, colour, dash, spread) => {
    if (!p) return;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.setLineDash(dash || []);
    for (const [dc, dr] of (spread ? footprint : [[0, 0]])) {
      ctx.strokeRect((p.c + dc) * tile + 1, (p.r + dr) * tile + 1, tile - 2, tile - 2);
    }
    ctx.restore();
  };
  outline(state.sel, '#ffffff', [4, 3]);
  outline(state.hover, '#f0a500', null, state.tool === 'paint');
}

/* ------------------------------------------------------------------ *
 * Editing actions                                                     *
 * ------------------------------------------------------------------ */

/* Assemblies are laid and lifted whole, so each one carries a tag its pieces
 * share. */
let assemblyTag = 0;

function placeAssembly(c, r, entry) {
  const file = entry.files[0];
  const parts = assemblyOf(file);
  const squares = assemblySquares(file);
  if (squares.some(([dc, dr]) => !cellAt(c + dc, r + dr))) {
    setStatus('That gear does not fit there — it covers '
      + squares.length + ' squares.', true);
    return false;
  }
  const tag = 'a' + (++assemblyTag);
  /* take whatever the brush is set to — phases and the rest — but lay the
   * pieces out unturned, then turn the whole thing to the facing asked for */
  const piece = placement(entry);
  const turns = piece.rot;
  piece.rot = 0;
  piece.asm = tag;
  addToCell(cellAt(c, r), piece);
  for (const [dc, dr, part] of parts) {
    addToCell(cellAt(c + dc, r + dr), { file: part, rot: 0, asm: tag });
  }
  for (let i = 0; i < turns; i++) rotateAssembly(c, r, tag, 1);
  return true;
}

/** Lift every piece of the assembly `tag` touches, wherever they are. */
function removeAssembly(c, r, tag) {
  let gone = false;
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const cell = cellAt(c + dc, r + dr);
      if (!cell) continue;
      const kept = cell.items.filter(p => p.asm !== tag);
      if (kept.length !== cell.items.length) { cell.items = kept; gone = true; }
    }
  }
  return gone;
}

function paint(c, r, at) {
  if (!state.brush) { setStatus('Pick an element from the palette first.', true); return false; }
  const cell = cellAt(c, r);
  if (!cell) return false;
  if (state.brush.slick) return paintOil(c, r, true);
  if (state.brush.area) return paintPit(c, r, state.brush.area, true);
  if (state.brush.assembly) return placeAssembly(c, r, state.brush);
  if (state.brush.auto) {
    return at && at.edge !== undefined
      && paintEdge(at.c, at.r, at.edge, state.brush.auto, true);
  }
  if (state.brush.layer === 'floor') { layFloor(c, r, placement(state.brush)); return true; }
  addToCell(cell, placement(state.brush));
  return true;
}

/* Lay a floor over a square, lifting any pit that was there: painting over a
 * pit fills it in, rather than leaving its rim stranded round a new floor. */
function layFloor(c, r, floor) {
  const cell = cellAt(c, r);
  const kind = cell.floor && cell.floor.auto;
  if (kind && AUTO_AREAS[kind]) paintPit(c, r, kind, false);
  cell.floor = floor;
}

function eraseTop(c, r, at) {
  const cell = cellAt(c, r);
  if (!cell) return false;
  /* with a run tool in hand, rubbing out takes the edge away rather than the
   * whole piece, which may be carrying other edges too */
  if (state.brush && state.brush.slick) return paintOil(c, r, false);
  if (state.brush && state.brush.area) return paintPit(c, r, state.brush.area, false);
  if (at && at.edge !== undefined && state.brush && state.brush.auto) {
    return paintEdge(at.c, at.r, at.edge, state.brush.auto, false);
  }
  if (cell.items.length) {
    const top = cell.items[cell.items.length - 1];
    if (top.asm) return removeAssembly(c, r, top.asm);   // the whole gear goes
    /* a pit's rim belongs to the pit, so rubbing at it lifts the pit rather
     * than a piece that would only be drawn again */
    if (top.auto && AUTO_AREAS[top.auto]) return paintPit(c, r, top.auto, false);
    cell.items.pop();
    if (top.auto) repairAuto(c, r, [top.auto]);
    return true;
  }
  /* A floor is not rubbed out: there is nothing sensible to leave behind, and
   * laying the transparent floor is the way to make a square bare. A sunk
   * square is the exception — lifting the pit gives back what it was sunk from
   * — and matters for the middle of a large pit, which has no rim to rub at. */
  const kind = cell.floor && cell.floor.auto;
  if (kind && AUTO_AREAS[kind]) return paintPit(c, r, kind, false);
  return false;
}

/*
 * Turn a gear that spans several squares as one piece: every part moves round
 * the middle of the gear and turns with it, so the gear stays whole. Turning it
 * is the same as turning the picture it makes, written a square at a time.
 */
function rotateAssembly(c, r, tag, dir) {
  const found = [];
  for (let dr = -2; dr <= 2; dr++) {
    for (let dc = -2; dc <= 2; dc++) {
      const cell = cellAt(c + dc, r + dr);
      if (!cell) continue;
      for (const p of cell.items) if (p.asm === tag) found.push({ p, c: c + dc, r: r + dr });
    }
  }
  if (!found.length) return false;

  /*
   * Turn it about its middle. That only works when the middle is somewhere the
   * grid can turn about — the centre of a square, or the corner of four — which
   * a 2x2 gear and a five-square cross both are but a two-square piece is not.
   * For those, turn about the square the piece was placed from instead, so the
   * nozzle or hub stays put and the rest swings round it.
   */
  const anchor = found.find(f => assemblyOf(f.p.file)) || found[0];
  const turn = (mx, my) => found.map(f => {
    const dx = f.c + 0.5 - mx, dy = f.r + 0.5 - my;
    const [nx, ny] = dir < 0 ? [dy, -dx] : [-dy, dx];
    return { f, x: mx + nx, y: my + ny };
  });
  const onGrid = m => Math.abs(m.x - Math.floor(m.x) - 0.5) < 1e-9
                   && Math.abs(m.y - Math.floor(m.y) - 0.5) < 1e-9;

  let spun = turn(found.reduce((t, f) => t + f.c + 0.5, 0) / found.length,
                  found.reduce((t, f) => t + f.r + 0.5, 0) / found.length);
  if (!spun.every(onGrid)) spun = turn(anchor.c + 0.5, anchor.r + 0.5);

  const moves = spun.map(m => ({ f: m.f, to: [Math.floor(m.x), Math.floor(m.y)] }));
  if (moves.some(m => !cellAt(m.to[0], m.to[1]))) return false;

  for (const m of moves) {
    const from = cellAt(m.f.c, m.f.r);
    from.items = from.items.filter(x => x !== m.f.p);
  }
  for (const m of moves) {
    m.f.p.rot = (m.f.p.rot + (dir < 0 ? 3 : 1)) % 4;
    addToCell(cellAt(m.to[0], m.to[1]), m.f.p);
  }
  return true;
}

/** Turn one placement; `dir` is +1 clockwise, -1 anti-clockwise. */
function rotatePlacement(c, r, p, dir) {
  const cell = cellAt(c, r);
  if (!cell) return false;
  if (p.asm) return rotateAssembly(c, r, p.asm, dir);
  p.rot = (p.rot + (dir < 0 ? 3 : 1)) % 4;
  if (p !== cell.floor) evictConflicts(cell, p);
  if (p.auto) repairAuto(c, r, [p.auto]);   // the rest of the run follows suit
  return true;
}

function rotateTop(c, r, dir) {
  const top = topOf(cellAt(c, r));
  return top ? rotatePlacement(c, r, top, dir) : false;
}

function pickAt(c, r) {
  const top = topOf(cellAt(c, r));
  if (!top) { setStatus('That square is empty.'); return false; }
  const entry = entryForFile(top.file);
  if (entry) {
    selectEntry(entry);
    setRotMode(top.rot);
    if (top.phases) setPhases(top.phases);
    if (shadowFor(top.file)) { state.shadow = !!top.shadow; renderBrush(); }
    if (top.count && emitterSpec(top.file)) { state.beams = top.count; renderBrush(); }
    setStatus('Picked up ' + entry.label + '.');
  }
  return false;   // picking never changes the board
}

function clearCell(c, r) {
  const cell = cellAt(c, r);
  if (!cell) return false;
  if (!cell.floor && !cell.items.length) return false;
  const kinds = autoKindsIn(cell);
  cell.floor = null;
  cell.items = [];
  if (kinds.size) repairAuto(c, r, kinds);
  return true;
}

function fillFloor() {
  const brush = state.brush;
  if (!brush || brush.layer !== 'floor') {
    setStatus('Select a floor tile in the palette, then press "Fill floor".', true);
    return;
  }
  pushUndo();
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c < state.cols; c++)
      layFloor(c, r, placement(brush));
  afterChange();
  setStatus('Floor re-laid with ' + brush.label + '.');
}

function resizeBoard(cols, rows) {
  pushUndo();
  const next = newCells(cols, rows);
  for (let r = 0; r < Math.min(rows, state.rows); r++)
    for (let c = 0; c < Math.min(cols, state.cols); c++)
      next[r][c] = state.cells[r][c];
  state.cols = cols;
  state.rows = rows;
  state.cells = next;
  if (state.sel && !cellAt(state.sel.c, state.sel.r)) state.sel = null;
  afterChange();
}

function newBoard(cols, rows) {
  state.cols = cols;
  state.rows = rows;
  state.cells = newCells(cols, rows);
  setBackdrop(null);                        // a fresh board starts bare
  const floor = ENTRY_BY_ID.get('smart:floor-plain');
  if (floor) {
    const keep = state.rotMode;
    state.rotMode = 'auto';
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        state.cells[r][c].floor = placement(floor);
    state.rotMode = keep;
  }
  state.sel = null;
  undoStack = []; redoStack = [];
  updateUndoButtons();
  afterChange();
}

/* ------------------------------------------------------------------ *
 * Canvas input                                                        *
 * ------------------------------------------------------------------ */

const stage = document.getElementById('stage');

let stroke = null;   // {cells:Set, dirty:bool} while the pointer is down
let pan = null;      // {x, y, l, t} while the middle button is held

function cellFromEvent(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) / state.zoom;
  const y = (e.clientY - rect.top) / state.zoom;
  const c = Math.floor(x), r = Math.floor(y);
  return cellAt(c, r) ? { c, r, fx: x - c, fy: y - r } : null;
}

/* One action per square per stroke, but the run tools work on edges. */
function strokeKey(p, t) {
  return t ? t.c + ',' + t.r + ',' + t.edge : p.c + ',' + p.r;
}

function applyTool(c, r, e, at) {
  const dir = e.shiftKey ? -1 : 1;          // shift turns the other way
  if (e.altKey) return rotateTop(c, r, dir);
  switch (state.tool) {
    case 'paint':  return paint(c, r, at);
    case 'erase':  return eraseTop(c, r, at);
    case 'rotate': return rotateTop(c, r, dir);
    case 'pick':   return pickAt(c, r);
  }
  return false;
}

canvas.addEventListener('pointerdown', e => {
  if (e.button === 1) {                     // middle button pans the view
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* no live pointer */ }
    pan = { x: e.clientX, y: e.clientY, l: stage.scrollLeft, t: stage.scrollTop };
    canvas.style.cursor = 'grabbing';
    return;
  }
  if (e.button !== 0) return;
  const p = cellFromEvent(e);
  if (!p) return;
  try { canvas.setPointerCapture(e.pointerId); } catch { /* no live pointer */ }
  state.sel = p;
  pushUndo();
  stroke = { cells: new Set(), dirty: false, lock: null };
  const t = edgeTarget(p, null);
  if (t) stroke.lock = edgeLock(t);          // pin the line this drag follows
  stroke.cells.add(strokeKey(p, t));
  stroke.dirty = applyTool(p.c, p.r, e, t || p) || stroke.dirty;
  afterChange();
});

canvas.addEventListener('pointermove', e => {
  if (pan) {
    stage.scrollLeft = pan.l - (e.clientX - pan.x);
    stage.scrollTop = pan.t - (e.clientY - pan.y);
    return;
  }
  const p = cellFromEvent(e);
  const before = state.hover;
  state.hover = p;
  if (!before !== !p || (p && before && (p.c !== before.c || p.r !== before.r))) scheduleRender();
  if (p) setStatus(describeCell(p.c, p.r));

  if (!stroke || !p) return;
  const t = edgeTarget(p, stroke.lock);
  if (state.brush && state.brush.auto && !t) return;      // off the pinned line
  const key = strokeKey(p, t);
  if (stroke.cells.has(key)) return;
  stroke.cells.add(key);
  state.sel = t ? { c: t.c, r: t.r } : p;
  if (applyTool(p.c, p.r, e, t || p)) stroke.dirty = true;
  afterChange();
});

function endStroke() {
  if (pan) { pan = null; canvas.style.cursor = ''; }
  if (!stroke) return;
  if (!stroke.dirty) { undoStack.pop(); updateUndoButtons(); }
  stroke = null;
}
canvas.addEventListener('pointerup', endStroke);
canvas.addEventListener('pointercancel', endStroke);

canvas.addEventListener('pointerleave', () => {
  state.hover = null;
  scheduleRender();
});

/* The wheel turns the topmost element of the square under the cursor. Undo
 * entries are coalesced so one flick of the wheel is one undo step. */
let lastWheel = { key: null, t: 0 };

canvas.addEventListener('wheel', e => {
  if (e.ctrlKey) {                          // ctrl+wheel zooms instead
    e.preventDefault();
    setZoom(state.zoom + (e.deltaY > 0 ? -8 : 8));
    return;
  }
  const p = cellFromEvent(e);
  if (!p || !topOf(cellAt(p.c, p.r))) return;   // nothing to turn: let it scroll
  e.preventDefault();

  const key = p.c + ',' + p.r;
  const now = performance.now();
  if (lastWheel.key !== key || now - lastWheel.t > 700) pushUndo();
  lastWheel = { key, t: now };

  state.sel = p;
  rotateTop(p.c, p.r, e.deltaY > 0 ? 1 : -1);
  afterChange();
}, { passive: false });

canvas.addEventListener('auxclick', e => e.preventDefault());

canvas.addEventListener('contextmenu', e => {
  e.preventDefault();
  const p = cellFromEvent(e);
  if (!p) return;
  state.sel = p;
  pushUndo();
  const changed = e.shiftKey ? clearCell(p.c, p.r)
                            : eraseTop(p.c, p.r, edgeTarget(p, null) || p);
  if (!changed) { undoStack.pop(); updateUndoButtons(); }
  afterChange();
});

/* ------------------------------------------------------------------ *
 * Palette                                                             *
 * ------------------------------------------------------------------ */

const OPEN_BY_DEFAULT = new Set(['Floors', 'Conveyors']);

function swatchFor(entry) {
  const b = document.createElement('button');
  const tool = entry.auto || entry.area || entry.slick;
  b.className = 'sw' + (entry.files.length > 1 ? ' multi' : '') + (tool ? ' tool' : '');
  b.dataset.id = entry.id;
  b.title = entry.label
    + (tool ? '  — paints, choosing the pieces for you' : '')
    + (entry.layer === 'floor' && !tool ? '  [floor]' : '')
    + (entry.files.length > 1 ? '  — random of ' + entry.files.length : '')
    + (entry.randomRot ? '  — random facing' : '');
  const img = document.createElement('img');
  img.loading = 'lazy';
  img.src = assetUrl(entry.thumb);
  img.alt = entry.label;
  b.appendChild(img);
  b.addEventListener('click', () => selectEntry(entry));
  return b;
}

function buildPalette(query) {
  const list = document.getElementById('palList');
  list.textContent = '';
  const q = (query || '').trim().toLowerCase();

  const groups = q
    ? [{
        cat: 'Results',
        entries: ENTRIES.filter(e =>
          e.label.toLowerCase().includes(q) ||
          e.cat.toLowerCase().includes(q) ||
          e.files.some(f => f.toLowerCase().includes(q))),
      }]
    : PALETTE;

  if (q && !groups[0].entries.length) {
    const p = document.createElement('div');
    p.className = 'empty-note';
    p.textContent = 'No element matches “' + query + '”.';
    list.appendChild(p);
    return;
  }

  for (const g of groups) {
    const d = document.createElement('details');
    d.open = !!q || OPEN_BY_DEFAULT.has(g.cat);
    const s = document.createElement('summary');
    s.innerHTML = g.cat + ' <span class="count">(' + g.entries.length + ')</span>';
    d.appendChild(s);
    const box = document.createElement('div');
    box.className = 'swatches';
    for (const e of g.entries) box.appendChild(swatchFor(e));
    d.appendChild(box);
    list.appendChild(d);
  }
  markSelectedSwatch();
}

function markSelectedSwatch() {
  const id = state.brush ? state.brush.id : null;
  for (const b of document.querySelectorAll('.sw'))
    b.classList.toggle('on', b.dataset.id === id);
}

function selectEntry(entry) {
  state.brush = entry;
  markSelectedSwatch();
  renderBrush();
  if (state.tool === 'pick') setTool('paint');
}

/*
 * Five toggles for the register phases an element fires in. `get` reads the
 * current set, `set` is handed the new one; used both for the brush (what new
 * elements get) and for editing a placement already on the board.
 */
function phaseChooser(get, set, label) {
  const box = document.createElement('div');
  box.className = 'phases';
  const lbl = document.createElement('span');
  lbl.textContent = label || 'Phases';
  box.appendChild(lbl);

  for (const n of PHASES) {
    const b = document.createElement('button');
    b.textContent = n;
    b.className = get().includes(n) ? 'on' : '';
    b.title = 'Active in register ' + n;
    b.addEventListener('click', () => {
      const now = get();
      set(now.includes(n) ? now.filter(x => x !== n) : [...now, n].sort((a, c) => a - c));
    });
    box.appendChild(b);
  }
  return box;
}

/** A tick-box property row, e.g. the randomizer's drop shadow. */
function optionRow(label, get, set) {
  const box = document.createElement('div');
  box.className = 'opts';
  const l = document.createElement('label');
  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = get();
  cb.addEventListener('change', () => set(cb.checked));
  l.append(cb, document.createTextNode(' ' + label));
  box.appendChild(l);
  return box;
}

/*
 * The words a text element carries. Typed lines are kept as they are; the
 * editor wraps and shrinks whatever will not fit the square, so there is
 * nothing to set beyond the text itself.
 */
function textRow(get, set) {
  const box = document.createElement('div');
  box.className = 'textprop';
  const l = document.createElement('span');
  l.textContent = 'Text';
  const ta = document.createElement('textarea');
  ta.rows = 2;
  ta.spellcheck = false;
  ta.value = get();
  ta.placeholder = 'Board title';
  ta.title = 'Line breaks are kept; long lines are wrapped and the size brought '
    + 'down until the words fit the square';
  ta.addEventListener('input', () => set(ta.value));
  box.append(l, ta);
  return box;
}

/** A row of mutually exclusive choices, e.g. how many barrels a cannon has. */
function choiceRow(label, values, get, set) {
  const box = document.createElement('div');
  box.className = 'phases';
  const l = document.createElement('span');
  l.textContent = label;
  box.appendChild(l);
  for (const v of values) {
    const b = document.createElement('button');
    b.textContent = v;
    b.className = get() === v ? 'on' : '';
    b.addEventListener('click', () => set(v));
    box.appendChild(b);
  }
  return box;
}

/*
 * Where one register phase sends a robot off a distributor. Each phase leads
 * one way or none at all, so the sides are a single choice; clicking the side
 * already chosen takes the phase off the element again.
 */
function exitChooser(phase, p, route) {
  const box = document.createElement('div');
  box.className = 'phases';
  const lbl = document.createElement('span');
  lbl.textContent = 'Phase ' + phase;
  box.appendChild(lbl);

  for (const rel of distributorExits(p.file)) {
    const b = document.createElement('button');
    b.textContent = FACING[(rel + p.rot) % 4];
    b.className = route[phase] === rel ? 'on' : '';
    b.title = 'Phase ' + phase + ' sends a robot out this side';
    b.addEventListener('click', () => {
      pushUndo();
      if (route[phase] === rel) delete route[phase]; else route[phase] = rel;
      afterChange();
    });
    box.appendChild(b);
  }
  return box;
}

function setPhases(phases) {
  state.phases = [...phases].sort((a, b) => a - b);
  renderBrush();
}

function renderBrush() {
  const box = document.getElementById('brush');
  box.textContent = '';
  if (!state.brush) { box.textContent = 'nothing selected'; return; }
  const e = state.brush;
  const img = document.createElement('img');
  img.src = assetUrl(e.thumb);
  const txt = document.createElement('div');
  const notes = [e.assembly ? 'covers ' + assemblySquares(e.files[0]).length + ' squares'
    : e.auto ? 'paints runs of ' + e.auto
    : e.slick ? 'paints a trail of oil'
    : e.area ? 'paints areas of ' + AUTO_AREAS[e.area].label.toLowerCase()
    : e.layer === 'floor' ? 'floor layer' : 'overlay'];
  if (e.files.length > 1) notes.push(e.files.length + ' variants');
  if (e.randomRot) notes.push('random facing');
  txt.innerHTML = '<b></b>' + notes.join(' · ');
  txt.querySelector('b').textContent = e.label;
  const head = document.createElement('div');
  head.className = 'brush-head';
  head.append(img, txt);
  box.appendChild(head);

  if (e.auto || e.area || e.slick) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = e.auto
      ? 'Click near the side of a square to wall it, and drag to carry the run '
        + 'along; the corner and join pieces are chosen for you. Right-click '
        + 'takes an edge away.'
      : e.slick
        ? 'Click or drag to spread oil; the tiles join up along the trail. The '
          + 'square you start from gets the drum, and a trail running out gets '
          + 'a drain. Right-click wipes a square.'
        : 'Click or drag over squares to sink them; the rim goes round wherever '
          + 'the pit stops and joins up with the squares next to it. Right-click '
          + 'fills a square back in.';
    box.appendChild(hint);
  }
  if (e.distributor) {
    const hint = document.createElement('div');
    hint.className = 'hint';
    hint.textContent = 'Place it, then set which phases send a robot out of which '
      + 'side in the Cell panel — one side per phase, or none — and the numbers '
      + 'are printed against the side they send it out of.';
    box.appendChild(hint);
  }
  /* one row per property the element carries, over the field of the brush it
   * is taken from; a distributor's routing is set on the placement instead */
  for (const spec of e.props) {
    const set = v => { state[spec.brush] = v; renderBrush(); };
    if (spec.ui === 'phases') box.appendChild(phaseChooser(() => state.phases, setPhases));
    else if (spec.ui === 'flag') {
      box.appendChild(optionRow(spec.label, () => state[spec.brush], set));
    } else if (spec.ui === 'choice') {
      box.appendChild(choiceRow(spec.label, spec.values, () => state[spec.brush], set));
    } else if (spec.ui === 'text') {
      box.appendChild(textRow(() => state[spec.brush], v => { state[spec.brush] = v; }));
    }
  }
}

/* ------------------------------------------------------------------ *
 * Cell inspector                                                      *
 * ------------------------------------------------------------------ */

const FACING = ['N', 'E', 'S', 'W'];

/** The words of a text element, on one line, for the lists that mention it. */
function oneLine(text) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  return flat.length > 24 ? flat.slice(0, 23) + '\u2026' : flat;
}

function describeCell(c, r) {
  const cell = cellAt(c, r);
  if (!cell) return '';
  const n = cell.items.length + (cell.floor ? 1 : 0);
  const top = topOf(cell);
  return colName(c) + (r + 1) + ' — ' + n + (n === 1 ? ' element' : ' elements')
    + (top ? ' — top: ' + prettyLabel(top.file)
             + (top.file === TEXT_FILE ? ' \u201c' + oneLine(top.text) + '\u201d' : '')
             + ' facing ' + FACING[top.rot]
             + (top.phases ? ', phases ' + (top.phases.join(', ') || 'none') : '')
           : '');
}

/*
 * The editable properties of one element on a square, taken from its
 * definition: the phases it fires in, where a distributor sends each phase, a
 * drop shadow, how many beams a cannon casts, the words a title carries.
 */
function cellProperties(box, p) {
  for (const spec of propertiesOf(p.file)) {
    const change = v => { pushUndo(); p[spec.prop] = v; afterChange(); };
    if (spec.ui === 'phases') {
      box.appendChild(phaseChooser(() => p.phases || [], change));
    } else if (spec.ui === 'route') {
      const route = p.route || (p.route = {});
      for (const n of PHASES) box.appendChild(exitChooser(n, p, route));
    } else if (spec.ui === 'flag') {
      box.appendChild(optionRow(spec.label, () => !!p[spec.prop], change));
    } else if (spec.ui === 'choice') {
      box.appendChild(choiceRow(spec.label, spec.values,
        () => p[spec.prop] || spec.fallback, change));
    } else if (spec.ui === 'text') {
      let held = false;                     // one undo step per burst of typing
      box.appendChild(textRow(() => p[spec.prop] || '', v => {
        if (!held) { pushUndo(); held = true; }
        p[spec.prop] = v;
        scheduleRender();
        autosave();
      }));
    }
  }
}

function renderCellInfo() {
  const box = document.getElementById('cellInfo');
  box.textContent = '';
  const p = state.sel;
  const cell = p && cellAt(p.c, p.r);
  if (!cell) { box.textContent = 'click a square'; return; }

  const head = document.createElement('div');
  head.style.marginBottom = '6px';
  head.textContent = colName(p.c) + (p.r + 1);
  box.appendChild(head);

  // Topmost first, so the list reads the way the tile looks.
  const rows = [];
  for (let i = cell.items.length - 1; i >= 0; i--) rows.push({ p: cell.items[i], idx: i });
  if (cell.floor) rows.push({ p: cell.floor, floor: true });

  if (!rows.length) { box.append('empty'); return; }

  for (const row of rows) {
    const el = document.createElement('div');
    el.className = 'layer' + (row.floor ? ' floorLayer' : '');

    const img = document.createElement('img');
    img.src = assetUrl(row.p.file);
    const nm = document.createElement('div');
    nm.className = 'nm';
    nm.innerHTML = '<i></i>';
    nm.prepend(prettyLabel(row.p.file)
      + (row.p.file === TEXT_FILE ? ' \u2014 \u201c' + oneLine(row.p.text) + '\u201d ' : ' '));
    nm.querySelector('i').textContent = '(' + FACING[row.p.rot] + ')';

    const turn = dir => {
      const b = document.createElement('button');
      b.textContent = dir < 0 ? '↺' : '↻';
      b.title = dir < 0 ? 'Turn anti-clockwise' : 'Turn clockwise';
      b.onclick = () => {
        pushUndo();
        rotatePlacement(p.c, p.r, row.p, dir);
        afterChange();
      };
      return b;
    };

    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Remove';
    del.onclick = () => {
      pushUndo();
      const kind = row.p.auto;
      if (row.floor) cell.floor = kind ? row.p.under || null : null;
      else cell.items.splice(row.idx, 1);
      if (kind) repairAuto(p.c, p.r, [kind]);
      afterChange();
    };

    el.append(img, nm, turn(-1), turn(1), del);
    box.appendChild(el);

    cellProperties(box, row.p);
  }
}

/* ------------------------------------------------------------------ *
 * Save / load / export                                                *
 * ------------------------------------------------------------------ */

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function saveJSON() {
  const data = { format: 'roborally-board', version: 1, cols: state.cols, rows: state.rows,
                 cells: state.cells, backdrop: backdrop.url || undefined };
  download(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), 'board.json');
  setStatus('Board saved as board.json.');
}

function loadJSON(text) {
  let o;
  try { o = JSON.parse(text); }
  catch { setStatus('That file is not valid JSON.', true); return; }
  if (!o || !Array.isArray(o.cells) || !o.cols || !o.rows) {
    setStatus('That JSON is not a board file.', true);
    return;
  }
  pushUndo();
  state.cols = o.cols;
  state.rows = o.rows;
  state.cells = o.cells.map(row => row.map(cell => normalizeCell({
    floor: cell.floor || null,
    items: Array.isArray(cell.items) ? cell.items : [],
  })));
  els.inCols.value = state.cols;
  els.inRows.value = state.rows;
  state.sel = null;
  setBackdrop(o.backdrop || null);
  afterChange();
  setStatus('Board loaded (' + state.cols + '×' + state.rows + ').');
}

async function exportPNG() {
  const tile = +els.inExportTile.value;
  const need = new Set();
  eachPlacement(p => { for (const f of placementFiles(p)) need.add(f); });

  els.btnExport.disabled = true;
  setStatus('Loading ' + need.size + ' graphics…');
  await Promise.all([...need].map(loadImage));

  const out = document.createElement('canvas');
  out.width = state.cols * tile;
  out.height = state.rows * tile;
  const g = out.getContext('2d');
  g.imageSmoothingQuality = 'high';

  drawTiles(g, tile, f => {
    const rec = images.get(f);
    return rec && rec.ready ? rec.img : null;
  });
  if (els.chkExportGrid.checked) drawGridLines(g, tile, 'rgba(0,0,0,0.35)');

  els.btnExport.disabled = false;

  try {
    out.toBlob(blob => {
      if (!blob) { setStatus('The browser could not encode the image.', true); return; }
      download(blob, `roborally-board-${state.cols}x${state.rows}.png`);
      setStatus(`Exported ${out.width}×${out.height} PNG.`);
    }, 'image/png');
  } catch (err) {
    setStatus('Export blocked: the page must be served over http:// — run ./serve.sh and '
      + 'open http://localhost:8000/ instead of opening the file directly.', true);
  }
}

/* ------------------------------------------------------------------ *
 * Wiring                                                              *
 * ------------------------------------------------------------------ */

const els = {};
for (const id of ['inCols', 'inRows', 'btnResize', 'btnNew', 'btnFill', 'btnUndo', 'btnRedo',
                  'chkGrid', 'chkCoords', 'inZoom', 'btnSave', 'btnLoad', 'fileLoad',
                  'btnBackdrop', 'btnBackdropOff', 'fileBackdrop',
                  'inExportTile', 'chkExportGrid', 'btnExport', 'inSearch', 'status']) {
  els[id] = document.getElementById(id);
}

function setStatus(msg, warn) {
  els.status.textContent = msg;
  els.status.parentElement.classList.toggle('warn', !!warn);
}

function setTool(tool) {
  state.tool = tool;
  for (const b of document.querySelectorAll('#tools button'))
    b.classList.toggle('on', b.dataset.tool === tool);
}

function setRotMode(mode) {
  state.rotMode = mode;
  const key = mode === 'auto' ? 'auto' : String(mode);
  for (const b of document.querySelectorAll('#rotGroup button'))
    b.classList.toggle('on', b.dataset.rot === key);
}

let saveTimer = null;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    /* the background can be megabytes, so if it will not fit, keep the board */
    for (const withImage of [true, false]) {
      try {
        const board = JSON.parse(snapshot());
        if (withImage && backdrop.url) board.backdrop = backdrop.url;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(board));
        return;
      } catch { /* quota or private mode — autosave is a convenience only */ }
    }
  }, 400);
}

/** Everything that has to happen after the board model changed. */
function afterChange() {
  scheduleRender();
  renderCellInfo();
  autosave();
}

document.querySelectorAll('#tools button').forEach(b =>
  b.addEventListener('click', () => setTool(b.dataset.tool)));

document.querySelectorAll('#rotGroup button').forEach(b =>
  b.addEventListener('click', () =>
    setRotMode(b.dataset.rot === 'auto' ? 'auto' : +b.dataset.rot)));

els.btnResize.addEventListener('click', () => {
  const c = Math.max(1, Math.min(40, +els.inCols.value || 12));
  const r = Math.max(1, Math.min(40, +els.inRows.value || 12));
  els.inCols.value = c; els.inRows.value = r;
  if (c === state.cols && r === state.rows) return;
  resizeBoard(c, r);
  setStatus('Board resized to ' + c + '×' + r + '.');
});

els.btnNew.addEventListener('click', () => {
  if (!confirm('Discard the current board and start a new one?')) return;
  const c = Math.max(1, Math.min(40, +els.inCols.value || 12));
  const r = Math.max(1, Math.min(40, +els.inRows.value || 12));
  newBoard(c, r);
  setStatus('New ' + c + '×' + r + ' board.');
});

els.btnFill.addEventListener('click', fillFloor);
els.btnUndo.addEventListener('click', undo);
els.btnRedo.addEventListener('click', redo);

els.chkGrid.addEventListener('change', () => { state.showGrid = els.chkGrid.checked; scheduleRender(); });
els.chkCoords.addEventListener('change', () => { state.showCoords = els.chkCoords.checked; scheduleRender(); });

function setZoom(px) {
  state.zoom = Math.max(16, Math.min(150, Math.round(px)));
  els.inZoom.value = state.zoom;
  scheduleRender();
}

els.inZoom.addEventListener('input', () => setZoom(+els.inZoom.value));

els.btnSave.addEventListener('click', saveJSON);
els.btnLoad.addEventListener('click', () => els.fileLoad.click());
els.fileLoad.addEventListener('change', () => {
  const f = els.fileLoad.files[0];
  if (!f) return;
  f.text().then(loadJSON);
  els.fileLoad.value = '';
});

els.btnBackdrop.addEventListener('click', () => els.fileBackdrop.click());
els.btnBackdropOff.addEventListener('click', () => {
  setBackdrop(null);
  autosave();
  setStatus('Background image removed.');
});
els.fileBackdrop.addEventListener('change', () => {
  const f = els.fileBackdrop.files[0];
  els.fileBackdrop.value = '';
  if (!f) return;
  const reader = new FileReader();
  reader.onload = async () => {
    if (await setBackdrop(reader.result)) {
      autosave();
      setStatus('Background image set (' + Math.round(f.size / 1024) + ' kB). '
        + 'It sits behind the board and goes into the exported PNG.');
    }
  };
  reader.onerror = () => setStatus('That file could not be read.', true);
  reader.readAsDataURL(f);
});

els.btnExport.addEventListener('click', exportPNG);

let searchTimer = null;
els.inSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => buildPalette(els.inSearch.value), 120);
});

document.addEventListener('keydown', e => {
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (e.ctrlKey || e.metaKey) {
    if (typing) return;                     // a field undoes its own typing
    if (e.key.toLowerCase() === 'z') {
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    }
    return;
  }
  if (typing) return;

  const k = e.key.toLowerCase();
  if (k === 'b') setTool('paint');
  else if (k === 'e') setTool('erase');
  else if (k === 't') setTool('rotate');
  else if (k === 'i') setTool('pick');
  else if (k === 'r') {
    const order = ['auto', 0, 1, 2, 3];
    setRotMode(order[(order.indexOf(state.rotMode) + 1) % order.length]);
  } else if (k === 'delete' || k === 'backspace') {
    if (!state.sel) return;
    e.preventDefault();
    pushUndo();
    if (!clearCell(state.sel.c, state.sel.r)) { undoStack.pop(); updateUndoButtons(); }
    afterChange();
  } else if (k === '[' || k === ']') {
    setZoom(state.zoom + (k === ']' ? 8 : -8));
  }
});

/* ------------------------------------------------------------------ *
 * Start                                                               *
 * ------------------------------------------------------------------ */

buildPalette('');
selectEntry(ENTRY_BY_ID.get('smart:floor-plain') || ENTRIES[0]);
setTool('paint');
setRotMode('auto');

let restored = false;
try {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    restore(saved);
    const back = JSON.parse(saved).backdrop;
    if (back) setBackdrop(back);
    restored = true;
  }
} catch { /* ignore */ }

if (restored) {
  updateUndoButtons();
  afterChange();
  setStatus('Restored your last board (' + state.cols + '×' + state.rows + ').');
} else {
  newBoard(12, 12);
  setStatus('New 12×12 board. Pick an element on the left and click the board.');
}

/* ------------------------------------------------------------------ *
 * What the editor offers                                              *
 * ------------------------------------------------------------------ */

/*
 * This module is the page's entry point: the browser loads it and it wires
 * itself up, so nothing in the page imports it. The names below are what the
 * editor can be driven by from outside — which is how the test suites work it,
 * rather than reaching for globals.
 */
export {
  /* the page and the board it holds */
  state, els, canvas, newBoard, resizeBoard, clearCell, fillFloor, addToCell,
  sortItems, topOf, eachPlacement, placement, placementFiles,

  /* saving, loading and the undo history */
  snapshot, restore, loadJSON, pushUndo, undo, redo, undoStack, restored,
  afterChange, autosave,

  /* the tools */
  applyTool, setTool, setRotMode, paint, eraseTop, rotateTop, paintEdge,
  paintPit, paintOil, isPit, isOil, nearestEdge, standOff, lastWheel,

  /* drawing */
  images, loadImage, drawTiles, traceAllBeams, badgeFrame, beltTone, beltTones,
  backdrop, setBackdrop, textLayout, TEXT_FONT, TEXT_MAX, TEXT_LEAD, TEXT_FIT,

  /* the panels */
  buildPalette, selectEntry, renderBrush, renderCellInfo, setPhases,
};
