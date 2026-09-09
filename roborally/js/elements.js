/* RoboRally board editor — element classes.
 *
 * Every element on a board is an instance of one of the classes below. A class
 * carries what a whole family has in common: which palette group its elements
 * belong to, which slot they take on a square, how far up the drawing order
 * they go, and which properties can be set on them. A definition in catalog.js
 * then names one element and gives only what it does differently.
 *
 * Nothing is worked out from a file name: an element knows its category, its
 * assets and its properties because its definition says so.
 *
 * Every graphic in assets/ is 150x150 and is drawn "pointing north" (conveyor
 * arrows leave the tile at the top edge, walls and pushers sit on the bottom
 * edge), so a placement is a name plus a count of quarter-turns clockwise.
 */
export const TILE_PX = 150;          // native size of every element graphic
export const ASSET_DIR = 'assets/';

/*
 * Directions and tile edges share one encoding: 0 north, 1 east, 2 south,
 * 3 west, going clockwise. A graphic drawn against the bottom of its tile is on
 * edge 2, and turning a placement by `rot` quarter-turns clockwise moves each of
 * its edges on by the same amount.
 */
export const EDGE_N = 0, EDGE_E = 1, EDGE_S = 2, EDGE_W = 3;
export const DIR_STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/** The five register phases a board element can be set to fire in. */
export const PHASES = [1, 2, 3, 4, 5];

/*
 * The angled mirrors turn a beam through 90 degrees. An angled mirror fills the
 * bottom-left corner of its tile, so its face lies on the north-west to
 * south-east diagonal; a quarter-turn flips that to the other diagonal.
 */
export const MIRROR_TURNS = [
  [EDGE_W, EDGE_S, EDGE_E, EDGE_N],   // north-west to south-east: north turns west
  [EDGE_E, EDGE_N, EDGE_W, EDGE_S],   // north-east to south-west: north turns east
];

/* ------------------------------------------------------------------ *
 * Inherited defaults                                                  *
 * ------------------------------------------------------------------ */

/*
 * A class states its defaults in a static `defaults` object holding only what
 * it changes; the chain is gathered from Element downwards, so `class Ledge
 * extends Wall` inherits the wall's slot and drawing order while replacing the
 * one thing it does differently.
 */
const DEFAULTS_CACHE = new Map();

function classDefaults(cls) {
  let merged = DEFAULTS_CACHE.get(cls);
  if (merged) return merged;
  const chain = [];
  for (let c = cls; c && c !== Function.prototype; c = Object.getPrototypeOf(c)) {
    if (Object.prototype.hasOwnProperty.call(c, 'defaults')) chain.unshift(c.defaults);
  }
  merged = Object.assign({}, ...chain);
  DEFAULTS_CACHE.set(cls, merged);
  return merged;
}

/* ------------------------------------------------------------------ *
 * The base element                                                    *
 * ------------------------------------------------------------------ */

export class Element {
  /*
   * category   the palette group it is offered in
   * layer      'floor' replaces the square's base image, 'overlay' stacks on it
   * slotKey    a square holds one element per slot, so painting a second
   *            conveyor replaces the first
   * perFacing  slotted by facing as well, so one square can carry a wall on
   *            each of its four sides
   * z          drawing order, fixed by class rather than by paint order
   * hidden     shipped and drawable, but not offered in the palette
   * randomRot  placed at a random quarter-turn when the facing is Auto
   * label      what the palette calls it; a readable form of the name if unset
   */
  static defaults = {
    category: 'Other',
    layer: 'overlay',
    slotKey: 'other',
    perFacing: false,
    z: 55,
    hidden: false,
    randomRot: false,
    label: null,

    /* properties a placement can carry, and what the element needs to draw them */
    phases: null,        // {badge, anchor, stack, shadow} — register phases
    shadow: null,        // the graphic drawn under it when its shadow is on
    emitter: null,       // {beam, mounts, muzzle, ...} — casts down a line
    exits: null,         // a distributor's ways out, as drawn
    lettering: false,    // carries words rather than a graphic

    /* how it sits in and against its square */
    mounts: [],          // edges it is bolted to, as drawn
    blocks: [],          // edges it walls off both ways
    stops: [],           // edges it stops only from the inside, as a ledge does
    depth: 0,            // how far it stands into its square
    angled: false,       // an angled mirror, which turns a beam
    window: null,        // a disc a conveyor underneath shows through
    washes: false,       // a floor that washes back over what stands in it
    submerges: false,    // an element the water washes back over
    parts: null,         // [[dc, dr, name]] of the squares it also covers
    opens: null,         // [left, right, both] variants with the ends uncapped
    extras: [],          // further graphics it draws with (badges, beams, ...)
  };

  constructor(name, opts = {}) {
    Object.assign(this, classDefaults(new.target), { name }, opts);
  }

  /** Which of a square's slots a placement of this element occupies. */
  slot(rot) { return this.perFacing ? this.slotKey + ':' + rot : this.slotKey; }

  /** The graphic for one phase digit, or null if it fires in no phases. */
  phaseBadge(n) { return this.phases ? this.phases.badge.replace('#', n) : null; }

  /** The edges it blocks once turned, and which of them only from the inside. */
  blockedEdges(rot) {
    const turn = e => (e + rot) % 4;
    return { both: this.blocks.map(turn), leaving: this.stops.map(turn) };
  }

  /** The edge a fitting bolted to a single edge sits on once turned, or null. */
  mountEdge(rot) {
    return this.mounts.length ? (this.mounts[0] + rot) % 4 : null;
  }

  /** How an angled mirror turns a beam, by facing; null if it does not. */
  mirrorTurn(rot) { return this.angled ? MIRROR_TURNS[rot % 2] : null; }

  /** Every square it covers, the one it is placed from included. */
  squares() {
    return this.parts ? [[0, 0], ...this.parts.map(([dc, dr]) => [dc, dr])] : [[0, 0]];
  }

  /*
   * Every graphic this element can draw with — itself, its phase digits, its
   * shadow, its barrels and beam, the other squares of an assembly, the
   * variants with an end uncapped. Used to check that everything a definition
   * mentions is really shipped.
   */
  assets() {
    const out = [this.name];
    if (this.phases) for (const n of PHASES) out.push(this.phaseBadge(n));
    if (this.shadow) out.push(this.shadow);
    if (this.emitter) {
      out.push(...(this.emitter.mounts || []));
      out.push(...beamGraphics(this.emitter));
    }
    if (this.parts) out.push(...this.parts.map(([, , f]) => f));
    if (this.opens) out.push(...this.opens.filter(Boolean));
    out.push(...this.extras);
    return [...new Set(out)];
  }

  /*
   * The properties a placement of this element can carry, as the panels need to
   * show them: `prop` is the field on the placement, `ui` how it is edited, and
   * `brush` the field on the brush that new placements take it from.
   */
  properties() {
    const out = [];
    if (this.phases) out.push({ prop: 'phases', ui: 'phases', brush: 'phases' });
    if (this.exits) out.push({ prop: 'route', ui: 'route' });
    if (this.shadow) {
      out.push({ prop: 'shadow', ui: 'flag', label: 'Drop shadow', brush: 'shadow' });
    }
    if (this.emitter && this.emitter.max > 1) {
      out.push({ prop: 'count', ui: 'choice', label: 'Beams', brush: 'beams',
                 values: [1, 2, 3], fallback: 1 });
    }
    if (this.lettering) {
      out.push({ prop: 'text', ui: 'text', label: 'Text', brush: 'text' });
    }
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * Floors                                                              *
 * ------------------------------------------------------------------ */

/* The base image of a square. Loose floor tiles look better scattered, so they
 * are laid at a random quarter-turn. */
export class Floor extends Element {
  static defaults = { category: 'Floors', layer: 'floor', randomRot: true };
}

/* ------------------------------------------------------------------ *
 * Overlays                                                            *
 * ------------------------------------------------------------------ */

/* Anything that stacks on a floor. The drawing order runs belts and pits
 * first, then the machinery, then the walls, then the beams over everything. */
export class Overlay extends Element {
  static defaults = { layer: 'overlay' };
}

export class Conveyor extends Overlay {
  static defaults = { category: 'Conveyors', slotKey: 'belt', z: 10 };
}

/*
 * A belt junction: a robot arriving on it is sent one way or another depending
 * on the register phase. The phases are therefore a property of each way out
 * rather than of the element, and the numbers are printed against the edge the
 * robot leaves by — which is how the printed boards show them. `exits` are held
 * as drawn and turn with the tile.
 */
export class Distributor extends Conveyor {
  static defaults = { category: 'Conveyor distributors' };
}

export class Ramp extends Overlay {
  static defaults = { category: 'Ramps', slotKey: 'ramp', z: 82, perFacing: true };
}

export class Gear extends Overlay {
  static defaults = { category: 'Gears', slotKey: 'gear', z: 30 };
}

export class Pit extends Overlay {
  static defaults = { category: 'Pits (custom)', slotKey: 'pit', z: 20 };
}

export class Teleporter extends Overlay {
  static defaults = { category: 'Teleporters', slotKey: 'warp', z: 40 };
}

/*
 * A portal bolted to the edge of a square rather than lying on its floor. It
 * takes a slot per facing, so a square can carry one on each side, and is drawn
 * after the walls: where a wall shares its edge the portal rests on its face,
 * the way the printed boards show it.
 */
export class WallPortal extends Teleporter {
  static defaults = { slotKey: 'wallportal', z: 84, perFacing: true };
}

export class Station extends Overlay {
  static defaults = { category: 'Repair & special', slotKey: 'station', z: 50 };
}

export class Decal extends Overlay {
  static defaults = { category: 'Oil & waste', slotKey: 'decal', z: 60 };
}

export class Hazard extends Overlay {
  static defaults = { category: 'Pushers & hazards', slotKey: 'hazard', z: 70,
                      perFacing: true };
}

/*
 * A wall stands on the edge of its square and stops a beam crossing it either
 * way. `depth` is how far it stands in, taken off the artwork: a fitting bolted
 * to the same edge is moved in by that much so it rests on the wall's face
 * instead of sinking into it.
 */
export class Wall extends Overlay {
  static defaults = { category: 'Walls & ledges', slotKey: 'wall', z: 80,
                      perFacing: true, blocks: [EDGE_S], depth: 24 };
}

/*
 * A ledge is a step, and the square it is drawn in is the low side looking up
 * at it, so it stops a beam trying to leave that square across it but not one
 * coming the other way.
 */
export class Ledge extends Wall {
  static defaults = { blocks: [], stops: [EDGE_S], depth: 27 };
}

/* A nodule bridges two runs meeting at a corner. It covers too little of the
 * edge to stop anything. */
export class WallJoin extends Wall {
  static defaults = { blocks: [], stops: [], depth: 0 };
}

export class Cannon extends Overlay {
  static defaults = { category: 'Lasers', slotKey: 'laser', z: 90, perFacing: true };
}

/* A mirror is a fitting in the square rather than a gun bolted to the wall, so
 * it takes a slot of its own and can share a square with a laser cannon. */
export class Mirror extends Cannon {
  static defaults = { slotKey: 'mirror', z: 85 };
}

/*
 * Lettering is not a graphic at all: the placement carries the words and the
 * editor sets them. A board's title is printed over everything else.
 */
export class Lettering extends Overlay {
  static defaults = { category: 'Repair & special', slotKey: 'text', z: 95,
                      lettering: true };
}

/* ------------------------------------------------------------------ *
 * Beams                                                               *
 * ------------------------------------------------------------------ */

/** Every graphic an emitter's beam can use, and the one for its `i`th square. */
export function beamGraphics(spec) {
  return Array.isArray(spec.beam) ? spec.beam : [spec.beam];
}

export function beamGraphic(spec, i) {
  const all = beamGraphics(spec);
  return all[i % all.length];
}

/*
 * The barrels of an emitter set to cast `count` beams. `off` is where the beam
 * goes, square to the way it fires; `shift` is how far the graphic has to move
 * from where it was drawn to sit under it.
 */
export function emitterBarrels(spec, count) {
  if (!spec.mounts) return [{ mount: null, off: 0, shift: 0 }];
  const at = (i, off) => ({ mount: spec.mounts[i], off, shift: off - spec.baked[i] });
  const n = Math.max(1, Math.min(spec.max, count || 1));
  if (spec.max === 1) return [at(0, 0)];
  if (n === 1) return [at(1, 0)];
  const out = spec.spread[n];
  const outer = [at(0, -out), at(2, out)];
  return n === 2 ? outer : [outer[0], at(1, 0), outer[1]];
}

/** The quarter-turn that puts `base`'s edges onto `target`, or null. */
export function rotForEdges(base, target) {
  const want = [...target].sort().join();
  for (let k = 0; k < 4; k++) {
    if (base.map(e => (e + k) % 4).sort().join() === want) return k;
  }
  return null;
}
