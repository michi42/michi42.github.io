/* RoboRally board editor — element catalog.
 *
 * Every graphic in assets/ is 150x150 and is drawn "pointing north" (conveyor
 * arrows leave the tile at the top edge, walls/pushers sit on the bottom edge),
 * so a placement is fully described by a file name plus a quarter-turn count.
 */
'use strict';

const TILE_PX = 150;          // native size of every element graphic
const ASSET_DIR = 'assets/';

/** Basenames of every graphic shipped in assets/ (without the .png). */
const FILES = [
  "Antigrav", "Big_Gear_H1", "Big_Gear_H2", "Big_Gear_H3",
  "Big_Gear_H4", "Big_Gear_V1", "Big_Gear_V2", "Big_Gear_V3",
  "Big_Gear_V4", "Big_Pusher_1", "Big_Pusher_2", "Big_Pusher_3",
  "Big_Pusher_4", "Big_Pusher_5", "Big_Pusher_Blank", "Black",
  "Blank", "Blue", "Blue_J3", "Blue_JB",
  "Blue_JL", "Blue_JR", "Blue_Ramp_Special", "Blue_Start",
  "Blue_TL", "Blue_TR", "Chop_Shop", "Crusher_1",
  "Crusher_2", "Crusher_3", "Crusher_4", "Crusher_5",
  "Crusher_Blank", "Double_Spanner", "Energizer", "Finish",
  "FlamerSpecial", "Flamer_1", "Flamer_1r", "Flamer_2",
  "Flamer_2r", "Flamer_3", "Flamer_3r", "Flamer_4",
  "Flamer_4r", "Flamer_5", "Flamer_5r", "Flamer_Blank",
  "Flamer_Long_1", "Flamer_Long_1r", "Flamer_Long_2", "Flamer_Long_2r",
  "Flamer_Long_3", "Flamer_Long_3r", "Flamer_Long_4", "Flamer_Long_4r",
  "Flamer_Long_5", "Flamer_Long_5r", "Flamer_Long_Blank", "Flamer_Long_Start",
  "Floor1", "Floor2", "Floor3", "Floor_Cracked",
  "Floor_Metal", "Forcefield", "Forcefield_Open_L", "Forcefield_Open_R",
  "GLaser", "Gear_AC", "Gear_AC_Special", "Gear_CW",
  "Gear_CW_Special", "Gear_Green_1", "Gear_Green_2", "Gear_Shadow",
  "Gold", "Gold_JL", "Gold_JR", "Gold_Special1",
  "Gold_Special2", "Gold_Special3", "Gold_TL", "Gold_TR",
  "Grate", "Green", "GreenA", "GreenB",
  "Green_TL", "Green_TR", "Gun", "GunL",
  "GunR", "Jack", "Knightsbridge", "Laser",
  "Ledge", "Ledge_L", "Ledge_Nodule", "Ledge_O",
  "Ledge_U", "MGun", "MLaser", "Magnet",
  "Magnet_1", "Magnet_2", "Magnet_3", "Magnet_4",
  "Magnet_5", "Magnet_Blank", "Mirror", "Mirror_L",
  "Mirror_L_W", "Mirror_W", "Multi_1", "Multi_2",
  "Multi_3", "Multi_4", "Multi_5", "Multi_Blank",
  "Multi_Blue_UL", "Multi_Blue_UR", "Multi_Gold_XUL", "Multi_Gold_XUR",
  "Multi_Red_UD", "Multi_Red_UL", "Multi_Red_ULR", "Multi_Red_UR",
  "Multi_Red_XUL", "Multi_Red_XUR", "Number_1", "Number_2",
  "Number_3", "Number_4", "Number_5", "Oil_Drain_L",
  "Oil_Drop1", "Oil_Drop2", "Oil_End1", "Oil_End2",
  "Oil_L1", "Oil_L2", "Oil_Middle1", "Oil_Middle2",
  "Oil_Middle3", "Oil_Splash", "Oil_Splash2", "Oil_Start1",
  "Oil_Start2", "Oil_Start_L", "Oil_Stop1", "Oil_Stop2",
  "Oil_T", "Oil_TU", "Oil_U", "Oil_UT",
  "Oil_X", "Oil_l", "Oil_t", "Oil_tu",
  "Oil_u", "Oil_ut", "Padded_Green", "Padded_Green_Double_Spanner",
  "Padded_Orange", "Padded_Orange_Double_Spanner", "Padded_Pink", "Padded_Wall_Green_L",
  "Padded_Wall_Green_R", "Padded_Wall_Pink_L", "Padded_Wall_Pink_R", "Pit",
  "Pit_1", "Pit_2", "Pit_3", "Pit_4",
  "Pit_5", "Pit_Blank", "Pit_Edge", "Pit_L",
  "Pit_Nodule", "Pit_Tape_Edge", "Pit_Tape_L", "Pit_Tape_Nodule",
  "Pit_Tape_U", "Pit_U", "Portal_Black", "Portal_Blue",
  "Portal_Brown", "Portal_Cyan", "Portal_Green", "Portal_Grey",
  "Portal_Lilac", "Portal_Orange", "Portal_Pink", "Portal_Purple",
  "Portal_Red", "Portal_Shadow", "Portal_Shadow2", "Portal_Yellow",
  "Pull1", "Pull2", "Pull3", "Pusher_1",
  "Pusher_2", "Pusher_3", "Pusher_4", "Pusher_5",
  "Pusher_Blank", "Radiation", "Radiation_Corner", "Radiation_Edge",
  "Radiation_Square", "Radioactive_Waste", "Radioactive_Waste_Drain", "Radioactive_Waste_Edge1",
  "Radioactive_Waste_Edge2", "Radioactive_Waste_Edge3", "Radioactive_Waste_End", "Radioactive_Waste_End_Barrel",
  "Radioactive_Waste_Middle", "Ramp", "Ramp_L", "Ramp_O",
  "Ramp_Small", "Ramp_Tiny", "Ramp_U", "Randomizer",
  "Randomizer_Shadow", "Red", "Red_Crusher_15", "Red_Crusher_24",
  "Red_Crusher_3", "Red_Crusher_3a", "Red_Crusher_Blank", "Red_J3",
  "Red_JB", "Red_JL", "Red_JL_Crusher_24", "Red_JL_Crusher_3",
  "Red_JR", "Red_Start", "Red_TL", "Red_TR",
  "Repulsor1", "Repulsor2", "Repulsor_L", "Reset",
  "Rust1", "Rust2", "Rust3", "Rust4",
  "Sandslip", "Spanner", "Spikes", "Spikes_W",
  "Tama1", "Tama2", "Teleporter", "Variable",
  "Very_Black", "Wall", "Wall_Green", "Wall_Green_L",
  "Wall_Green_Open_B", "Wall_Green_Open_L", "Wall_Green_Open_R", "Wall_L",
  "Wall_L_Open_B", "Wall_L_Open_L", "Wall_L_Open_R", "Wall_Nodule",
  "Wall_Nodule_L", "Wall_Nodule_R", "Wall_Open_B", "Wall_Open_L",
  "Wall_Open_R", "Wall_PT", "Wall_PT_1", "Wall_PT_2",
  "Wall_PT_3", "Wall_PT_4", "Wall_PT_5", "Wall_PT_Blank",
  "Wall_Red", "Wall_Red_L", "Wall_Red_Open_B", "Wall_Red_Open_L",
  "Wall_Red_Open_R", "Wall_U", "Wall_U_Open_B", "Water1",
  "Water1_Special", "Water2", "Water_Current1", "Water_Current2",
  "Water_Current_JL", "Water_Current_JR", "Water_Current_L", "Water_Current_R",
  "Water_Double_Spanner", "Water_Drain", "XGear_AC", "XGear_CW",
  "XGear_E", "XGear_N", "XGear_S", "XGear_W",
];

/* ------------------------------------------------------------------ *
 * Categories                                                          *
 * ------------------------------------------------------------------ */

const CATEGORIES = [
  'Floors',
  'Conveyors',
  'Ramps',
  'Belt distributors',
  'Gears',
  'Walls & ledges',
  'Lasers',
  'Pushers & hazards',
  'Repair & special',
  'Teleporters',
  'Oil & waste',
  'Other',
  'Pits (custom)',
];

/* First matching rule wins, so the order here matters. */
const CATEGORY_RULES = [
  [/^(Big_)?Pusher/,                                    'Pushers & hazards'],
  [/^Multi_/,                                           'Belt distributors'],
  [/^(Crusher|Flamer|Magnet|Spikes)/,                   'Pushers & hazards'],
  [/^Wall_PT/,                                          'Pushers & hazards'],
  [/^Red_Crusher/,                                      'Pushers & hazards'],
  [/^Radioactive/,                                      'Oil & waste'],
  [/^Radiation/,                                        'Floors'],

  [/^(Wall|Padded_Wall|Ledge|Forcefield|Knightsbridge|Grate)/, 'Walls & ledges'],

  [/^(Laser|MLaser|GLaser|Gun|GunL|GunR|MGun|Mirror)/,  'Lasers'],

  [/^(Big_)?X?Gear/,                                    'Gears'],

  /* the trap door fires in register phases, so it belongs with the hazards */
  [/^Pit_Blank$/,                                       'Pushers & hazards'],
  [/^Pit/,                                              'Pits (custom)'],

  [/^(Teleporter|Portal|Antigrav|Repulsor|Pull\d|Tama)/, 'Teleporters'],

  [/^(Spanner|Double_Spanner)$/,                        'Repair & special'],
  [/Double_Spanner$/,                                   'Repair & special'],
  [/^Water_Drain$/,                                     'Floors'],
  [/^(Chop_Shop|Energizer|Jack|Reset|Randomizer|Randomizer_Shadow|Finish)$/,               'Repair & special'],

  /* Ramps first: the belt-topped ones would otherwise read as conveyors. */
  [/^Ramp(_|$)|^(Blue_Ramp_Special|Gold_Special1)$/,    'Ramps'],

  [/^Water_Current/,                                    'Conveyors'],
  [/^(Blue|Red|Gold|Green|GreenA|GreenB|Variable)(_|$)/, 'Conveyors'],

  [/^Oil/,                                              'Oil & waste'],
  [/^Number/,                                           'Oil & waste'],

  [/^Floor/,                                            'Floors'],
  [/^(Blank|Black|Water\d|Water1_Special|Padded_|Rust|Sandslip)/, 'Floors'],
];

function categoryOf(name) {
  for (const [re, cat] of CATEGORY_RULES) if (re.test(name)) return cat;
  return 'Other';
}

/* ------------------------------------------------------------------ *
 * Layers                                                              *
 * ------------------------------------------------------------------ */

/* A "floor" replaces the tile's base image; everything else stacks on top. */
const FLOOR_RE = new RegExp('^(' + [
  'Floor[123]', 'Floor_Cracked', 'Floor_Metal',
  'Rust[1234]',
  'Water[12]', 'Water1_Special',
  'Black', 'Blank',
  'Padded_(Green|Orange|Pink)',
  'Radiation', 'Radiation_Square', 'Radiation_Corner', 'Radiation_Edge',
  'Radioactive_Waste',
  'Sandslip',
].join('|') + ')$');

function layerOf(name) { return FLOOR_RE.test(name) ? 'floor' : 'overlay'; }

/*
 * Directions and tile edges share one encoding: 0 north, 1 east, 2 south,
 * 3 west, going clockwise. A graphic drawn against the bottom of its tile is on
 * edge 2, and turning a placement by `rot` quarter-turns clockwise moves each of
 * its edges on by the same amount.
 */
const EDGE_N = 0, EDGE_E = 1, EDGE_S = 2, EDGE_W = 3;
const DIR_STEP = [[0, -1], [1, 0], [0, 1], [-1, 0]];

/* ------------------------------------------------------------------ *
 * Overlay slots                                                       *
 * ------------------------------------------------------------------ */

/*
 * A square holds at most one element of each kind: painting a conveyor over a
 * conveyor replaces it rather than stacking two belts. Edge-mounted kinds are
 * keyed by facing as well, so one square can still carry a wall on each of its
 * four sides, or a pusher north and another south.
 *
 * `z` fixes the drawing order, so the result does not depend on the order the
 * elements happened to be painted in — belts and pits go down first, then the
 * machinery, then walls, then laser beams on top of everything.
 */
const KINDS = {
  'Conveyors':         { key: 'belt',    z: 10, perFacing: false },
  'Belt distributors': { key: 'belt',    z: 10, perFacing: false },
  'Pits (custom)':     { key: 'pit',     z: 20, perFacing: false },
  'Gears':             { key: 'gear',    z: 30, perFacing: false },
  'Teleporters':       { key: 'warp',    z: 40, perFacing: false },
  'Repair & special':  { key: 'station', z: 50, perFacing: false },
  'Oil & waste':       { key: 'decal',   z: 60, perFacing: false },
  'Ramps':             { key: 'ramp',    z: 82, perFacing: true  },
  'Pushers & hazards': { key: 'hazard',  z: 70, perFacing: true  },
  'Walls & ledges':    { key: 'wall',    z: 80, perFacing: true  },
  'Lasers':            { key: 'laser',   z: 90, perFacing: true  },
};

const DEFAULT_KIND = { key: 'other', z: 55, perFacing: false };

/* A mirror is a fitting in the square rather than a gun on the wall, so it gets
 * its own slot and can share a square with a laser cannon. */
const MIRROR_KIND = { key: 'mirror', z: 85, perFacing: true };
const KIND_BY_FILE = {
  Mirror: MIRROR_KIND, Mirror_L: MIRROR_KIND,
  Mirror_W: MIRROR_KIND, Mirror_L_W: MIRROR_KIND,
};

function kindOf(cat) { return KINDS[cat] || DEFAULT_KIND; }

const KIND_CACHE = new Map();   // file -> kind, categoryOf() is regex work

function kindOfFile(file) {
  let k = KIND_CACHE.get(file);
  if (!k) { k = KIND_BY_FILE[file] || kindOf(categoryOf(file)); KIND_CACHE.set(file, k); }
  return k;
}

/** Which of a square's overlay slots this placement occupies. */
function slotFor(file, rot) {
  const k = kindOfFile(file);
  return k.perFacing ? k.key + ':' + rot : k.key;
}

/* Runs of wall laid by the auto tool are managed as a set rather than one at a
 * time, so each piece keeps a slot of its own instead of evicting its siblings.
 */
function slotOf(p) {
  return p.auto ? 'auto-' + p.auto + ':' + p.file + ':' + p.rot : slotFor(p.file, p.rot);
}

function zIndexOf(file) { return kindOfFile(file).z; }

/* ------------------------------------------------------------------ *
 * Register phases                                                     *
 * ------------------------------------------------------------------ */

/*
 * Pushers, crushers, flamers, trap doors and the like only fire in some of the
 * five register phases, and the board art carries a digit graphic per phase.
 * A placement stores which phases it is active in and the editor draws the
 * matching digits, so numbers never have to be positioned by hand.
 *
 * Two badge styles ship in the set:
 *   - a digit on a full 150x150 canvas already carries its own position, and
 *     the artwork gives each of the five phases its own spot on the tile, so
 *     any combination can simply be drawn on top of the body (no `anchor`);
 *   - a small badge has no position of its own, so those are laid out centred
 *     on `anchor`, in 150-px tile space. The anchors follow where the graphics
 *     set puts the numbers on the tiles that have them baked in: on the flame
 *     for a flamer, on the disc for a crusher. A piston wall's sit just inside
 *     the square from its bar, with `shadow` to lift them off the floor.
 *     `stack` splits more than two badges over two lines so they keep fitting
 *     inside a round element.
 */
const PHASES = [1, 2, 3, 4, 5];

const PHASED = {
  Pusher_Blank:      { badge: 'Pusher_#' },
  Big_Pusher_Blank:  { badge: 'Big_Pusher_#' },
  Pit_Blank:         { badge: 'Pit_#' },
  Magnet_Blank:      { badge: 'Magnet_#' },

  Crusher_Blank:     { badge: 'Crusher_#',     anchor: [75, 75], stack: true },
  Red_Crusher_Blank: { badge: 'Crusher_#',     anchor: [75, 75], stack: true },
  Flamer_Blank:      { badge: 'Flamer_#',      anchor: [75, 59], stack: true },
  /* the long flame's numbers go on the body of it, which is in the square
   * above the nozzle — hence an anchor above this one */
  Flamer_Long_Start: { badge: 'Flamer_Long_#', anchor: [75, -59], stack: true },
  Wall_PT:           { badge: 'Wall_PT_#',     anchor: [75, 114], shadow: true },
};

/* ------------------------------------------------------------------ *
 * Belt distributors                                                   *
 * ------------------------------------------------------------------ */

/*
 * A distributor is a belt junction: a robot arriving on it is sent one way or
 * another depending on the register phase. So the phases are not a property of
 * the element as a whole but of each way out of it, and the numbers are printed
 * against the edge the robot leaves by — which is how the printed boards show
 * them.
 *
 * Exits are held turned with the tile, so turning a distributor turns its
 * labels along with its arrows.
 */
const DISTRIBUTORS = new Set(FILES.filter(f => /^Multi_(Blue|Gold|Red)_/.test(f)));
const EXIT_BADGE = 'Multi_#';
const EXIT_INSET = 20;          // how far in from the edge the numbers sit

function isDistributor(file) { return DISTRIBUTORS.has(file); }

/*
 * Which sides a distributor's arrows point out of, read from its name: the
 * letters after the colour are the ways out — up, down, left, right — and a
 * leading X only says the belt comes in from the side rather than the foot of
 * the tile, which does not change where it can send a robot.
 */
const EXIT_LETTERS = { U: EDGE_N, D: EDGE_S, L: EDGE_W, R: EDGE_E };

function distributorExits(file) {
  const m = /^Multi_(?:Blue|Gold|Red)_X?([UDLR]+)$/.exec(file);
  return m ? [...m[1]].map(ch => EXIT_LETTERS[ch]) : [];
}

function exitBadge(n) { return EXIT_BADGE.replace('#', n); }

function phaseSpec(file) { return PHASED[file] || null; }

/* ------------------------------------------------------------------ *
 * Elements spanning more than one square                              *
 * ------------------------------------------------------------------ */

/*
 * A cross gear is a middle with four wings, and a big gear is four quarters
 * filling a 2x2. Only the piece listed here is placed by hand; the rest go down
 * with it, at the offsets given as [column, row, graphic] from that square.
 */
const ASSEMBLIES = {
  XGear_CW: [[0, -1, 'XGear_N'], [1, 0, 'XGear_E'], [0, 1, 'XGear_S'], [-1, 0, 'XGear_W']],
  XGear_AC: [[0, -1, 'XGear_N'], [1, 0, 'XGear_E'], [0, 1, 'XGear_S'], [-1, 0, 'XGear_W']],
  Big_Gear_H1: [[1, 0, 'Big_Gear_H2'], [0, 1, 'Big_Gear_H3'], [1, 1, 'Big_Gear_H4']],
  /* the long flame stands on its nozzle and spills into the square beyond */
  Flamer_Long_Start: [[0, -1, 'Flamer_Long_Blank']],
};

function assemblyOf(file) { return ASSEMBLIES[file] || null; }

/** Every square an assembly covers, the one it is placed from included. */
function assemblySquares(file) {
  const parts = ASSEMBLIES[file];
  return parts ? [[0, 0], ...parts.map(([dc, dr]) => [dc, dr])] : [[0, 0]];
}

/** The graphic for one phase digit of `file`, or null if it has no phases. */
function phaseBadge(file, n) {
  const spec = PHASED[file];
  return spec ? spec.badge.replace('#', n) : null;
}

/* The digit graphics come from the phase property now, so they are not offered
 * in the palette; nor are the two empty placeholder tiles, nor the crushers
 * with phases baked in that `Red_Crusher_Blank` now covers. */
const HIDDEN_RE = new RegExp('^(' + [
  '(Pusher|Big_Pusher|Pit|Magnet|Crusher|Multi|Wall_PT|Number)_[1-5]',
  '(Flamer|Flamer_Long)_[1-5]r?',
  '(Multi|Wall_PT)_Blank',
  /* numbers baked in — the phase property covers these now */
  'Red_Crusher_(15|24|3|3a)', 'Red_JL_Crusher_(24|3)', 'FlamerSpecial',
  /* a belt baked in — a crusher over a conveyor draws itself this way */
  'Red_Crusher_Blank',
  /* now a property of the randomizer rather than a tile of its own */
  'Randomizer_Shadow',
  /* the water is washed back over a repair site standing in it instead */
  'Water_Double_Spanner',
  /* a laser cannon carries its own barrels and draws its own beam */
  'GunL', 'GunR', 'Laser', 'MLaser', 'GLaser',
  /* the open forcefields are the plain one redrawn, and Knightsbridge belongs
   * to a single board */
  'Forcefield_Open_[LR]', 'Knightsbridge',
  /* a portal and a gear draw their own shadow, and a magnet casts its own pull */
  'Portal_Shadow2?', 'Gear_Shadow', 'Pull[123]',
  /* the "special" gears are the plain ones redrawn */
  'Gear_(CW|AC)_Special',
  /* the wings and quarters of the multi-square gears come with their middles,
   * and the vertical big gear is the horizontal one turned a quarter */
  'XGear_[NESW]', 'Big_Gear_H[234]', 'Big_Gear_V[1234]',
  /* the top of the long flame comes with its nozzle */
  'Flamer_Long_Blank',
  /* the mirrors on a wall are the plain ones stood off it, which is done for
   * them when a wall is there */
  'Mirror_W', 'Mirror_L_W',
  /* the gold "special" belts; Gold_Special1 is the gold belt-ramp and stays */
  'Gold_Special[23]',
  /* spikes and a wall can be placed one on top of the other */
  'Spikes_W',
  /* one plain black floor is enough */
  'Very_Black',
].join('|') + ')$');

/* ------------------------------------------------------------------ *
 * Lasers                                                              *
 * ------------------------------------------------------------------ */

/*
 * Elements that cast something down a line of squares. An emitter turned by
 * `rot` casts in direction `rot`: a cannon is bolted to a wall and fires away
 * from it, and a magnet's poles face the way it is turned.
 *
 *   mounts      barrel graphics for the left, middle and right positions, and
 *               `spread` how far the outer two sit from the middle of the tile;
 *               an emitter without them just draws its own graphic
 *   muzzle      how far in from the edge the beam starts
 *   skipSource  the beam begins in the next square, clear of the element itself
 *   reflects    whether angled mirrors turn it
 *   beam        one graphic, or several cycled along the beam for variety
 */
const EMITTERS = {
  /*
   * The barrels are drawn 34 px apart in the graphics, but a printed board
   * spaces them by how many there are: a triple stands its outer two 50 from
   * the middle, a double draws its pair in to 25. Both were measured off
   * Baggage Claim. Each barrel is moved from where it was drawn to where it
   * belongs, and its beam follows; `baked` is where each mount graphic sits.
   */
  Gun: {
    beam: 'Laser', mounts: ['GunL', 'Gun', 'GunR'], baked: [-34.5, 0, 34.5],
    spread: { 2: 25, 3: 50 }, max: 3, muzzle: 27, reflects: true,
  },
  MGun: {
    beam: 'MLaser', mounts: ['MGun'], baked: [0],
    spread: {}, max: 1, muzzle: 22, reflects: true,
  },
  Magnet: {
    beam: ['Pull1', 'Pull2', 'Pull3'],
    spread: 0, max: 1, muzzle: 0, reflects: false, skipSource: true,
  },
};

function emitterSpec(file) { return EMITTERS[file] || null; }

/*
 * The barrels of an emitter set to cast `count` beams. `off` is where the beam
 * goes, square to the way it fires; `shift` is how far the graphic has to move
 * from where it was drawn to sit under it.
 */
function emitterBarrels(spec, count) {
  if (!spec.mounts) return [{ mount: null, off: 0, shift: 0 }];
  const at = (i, off) => ({ mount: spec.mounts[i], off, shift: off - spec.baked[i] });
  const n = Math.max(1, Math.min(spec.max, count || 1));
  if (spec.max === 1) return [at(0, 0)];
  if (n === 1) return [at(1, 0)];
  const out = spec.spread[n];
  const outer = [at(0, -out), at(2, out)];
  return n === 2 ? outer : [outer[0], at(1, 0), outer[1]];
}

/** Every graphic an emitter's beam can use, and the one for its `i`th square. */
function beamGraphics(spec) {
  return Array.isArray(spec.beam) ? spec.beam : [spec.beam];
}

function beamGraphic(spec, i) {
  const all = beamGraphics(spec);
  return all[i % all.length];
}

/*
 * Which tile edges a graphic walls off, as drawn. Taken from the artwork: an
 * edge counts when the graphic covers the outer band of the tile along it.
 * Nodules, spikes without a wall and the like cover too little to stop a beam.
 */
const WALL_EDGES = {};
const wallsOn = (edges, files) => files.forEach(f => { WALL_EDGES[f] = edges; });

wallsOn([EDGE_S], [
  'Wall', 'Wall_Red', 'Wall_Green',
  'Wall_Open_B', 'Wall_Open_L', 'Wall_Open_R',
  'Wall_Red_Open_B', 'Wall_Red_Open_L', 'Wall_Red_Open_R',
  'Wall_Green_Open_B', 'Wall_Green_Open_L', 'Wall_Green_Open_R',
  'Wall_PT', 'Spikes_W',
  'Forcefield', 'Forcefield_Open_L', 'Forcefield_Open_R',
  'Padded_Wall_Green_L', 'Padded_Wall_Green_R',
  'Padded_Wall_Pink_L', 'Padded_Wall_Pink_R',
]);
wallsOn([EDGE_S, EDGE_W], [
  'Wall_L', 'Wall_L_Open_B', 'Wall_L_Open_L', 'Wall_L_Open_R',
  'Wall_Red_L', 'Wall_Green_L',
]);
wallsOn([EDGE_S, EDGE_W, EDGE_E], ['Wall_U', 'Wall_U_Open_B']);

/*
 * A ledge is a step, and the tile it is drawn in is the low side looking up at
 * it, so it stops a beam trying to leave that tile across it but not one coming
 * the other way.
 */
const LEDGE_EDGES = {
  Ledge: [EDGE_S], Ledge_L: [EDGE_S, EDGE_W],
  Ledge_U: [EDGE_S, EDGE_W, EDGE_E], Ledge_O: [EDGE_N, EDGE_E, EDGE_S, EDGE_W],
};

/*
 * Elements bolted to the edge of a square, and which edge they sit on as drawn.
 * A wall or ledge on the same edge stands them off it so they rest on its face
 * instead of sinking into it.
 */
const EDGE_MOUNTED = {
  Gun: [EDGE_S], GunL: [EDGE_S], GunR: [EDGE_S], MGun: [EDGE_S],
  Pusher_Blank: [EDGE_S], Big_Pusher_Blank: [EDGE_S],
  Spikes: [EDGE_S], Wall_PT: [EDGE_S],
  /* the mirrors: the flat one is bolted to one edge, the angled one tucks into
   * the corner between two, so a wall on either pushes it off that one */
  Mirror: [EDGE_S], Mirror_L: [EDGE_S, EDGE_W],
};

/** The edges `file` is bolted to, as drawn; empty if it is bolted to none. */
function mountBases(file) { return EDGE_MOUNTED[file] || []; }

/** The edge a single-edge fitting is bolted to once turned, or null. */
function mountEdge(file, rot) {
  const base = EDGE_MOUNTED[file];
  return base ? (base[0] + rot) % 4 : null;
}

/*
 * How far a wall or ledge stands into its square, taken off the artwork. A
 * cannon mounted on the same edge is moved in by this much so it sits on the
 * wall rather than through it. The ordinary walls are all 22 to 26 deep, so
 * only the ones that differ noticeably are listed.
 */
const DEFAULT_WALL_DEPTH = 24;
const WALL_DEPTH = {
  Forcefield: 13, Forcefield_Open_L: 13, Forcefield_Open_R: 13,
  Padded_Wall_Green_L: 9, Padded_Wall_Pink_L: 8,
  Padded_Wall_Green_R: 16, Padded_Wall_Pink_R: 16,
  Ledge: 27, Ledge_L: 27, Ledge_U: 27, Ledge_O: 27,
};

function wallDepth(file) {
  const d = WALL_DEPTH[file];
  return d === undefined ? DEFAULT_WALL_DEPTH : d;
}

/** The edges `placement` blocks, and whether they only block from the inside. */
function blockedEdges(file, rot) {
  const walls = WALL_EDGES[file], ledges = LEDGE_EDGES[file];
  const turn = e => (e + rot) % 4;
  return {
    both: walls ? walls.map(turn) : [],
    leaving: ledges ? ledges.map(turn) : [],
  };
}

/* ------------------------------------------------------------------ *
 * Painting runs of wall                                               *
 * ------------------------------------------------------------------ */

/*
 * The wall and ledge tools work in terms of which edges of a square are walled;
 * these tables say which graphic covers which set of them, and which variant to
 * use where a run carries on into the next square.
 *
 * The set is drawn with both ends of every bar capped. `_Open_L` uncaps the
 * left-hand end as the graphic is drawn, `_Open_R` the right-hand one and
 * `_Open_B` both; on a corner piece the left-hand end is the upright arm's and
 * the right-hand one the flat arm's. The U has only a both-ends variant, so a
 * run reaching either of its arms opens both.
 */
const AUTO_SETS = {
  wall: {
    label: 'Wall',
    one: 'Wall', corner: 'Wall_L', three: 'Wall_U', ring: null,
    nodule: 'Wall_Nodule',
    opens: {
      Wall:    ['Wall_Open_L', 'Wall_Open_R', 'Wall_Open_B'],
      Wall_L:  ['Wall_L_Open_L', 'Wall_L_Open_R', 'Wall_L_Open_B'],
      Wall_U:  [null, null, 'Wall_U_Open_B'],
    },
  },
  ledge: {
    label: 'Ledge',
    one: 'Ledge', corner: 'Ledge_L', three: 'Ledge_U', ring: 'Ledge_O',
    nodule: 'Ledge_Nodule',
    opens: {},                                  // the ledges have no open ends
  },
};

/*
 * The pit tools work by area rather than by edge: you say which squares are
 * pit, and the rim goes round wherever the pit stops. `floor` is what the
 * square's floor becomes — the dark of the pit itself, or nothing at all for
 * the tape — and `all` is the ready-made tile for a pit standing on its own.
 * Only the rim pieces are overlays.
 */
const AUTO_AREAS = {
  pit: {
    label: 'Pit', floor: 'Black',
    edge: 'Pit_Edge', corner: 'Pit_L', three: 'Pit_U', all: 'Pit',
    nodule: 'Pit_Nodule',
  },
  pittape: {
    label: 'Pit tape', floor: 'Blank',
    edge: 'Pit_Tape_Edge', corner: 'Pit_Tape_L', three: 'Pit_Tape_U', all: null,
    nodule: 'Pit_Tape_Nodule',
  },
  /*
   * Waste has no corner or ring tile, only a bank drawn along the foot of an
   * otherwise ordinary square of sludge. So rather than pick a tile per shape,
   * a bank is laid on each side the pool stops at, clipped to the strip it
   * occupies, which covers every shape a pool can take. `banks` are the three
   * interchangeable bank tiles and `bank` is how deep the strip is.
   */
  waste: {
    label: 'Radioactive waste', floor: 'Radioactive_Waste',
    cat: 'Oil & waste', bank: 48, thumb: 'Radioactive_Waste_End', spin: true,
    banks: ['Radioactive_Waste_Edge1', 'Radioactive_Waste_Edge2',
            'Radioactive_Waste_Edge3'],
  },
};

/*
 * Oil runs in a trail from square to square, so its tiles are chosen by which
 * sides the trail carries on into. The names in the set do not describe that —
 * `Oil_T` joins on all four sides and `Oil_U` on three — so the shapes here were
 * read off the artwork instead. `base` is what each group joins as drawn.
 */
const OIL_SLICK = {
  alone:    { base: [],           files: ['Oil_Splash', 'Oil_Splash2', 'Oil_Drop1', 'Oil_Drop2'] },
  end:      { base: [EDGE_N],     files: ['Oil_End1', 'Oil_End2', 'Oil_Stop1', 'Oil_Stop2'] },
  start:    { base: [EDGE_N],     files: ['Oil_Start1', 'Oil_Start2'] },
  straight: { base: [EDGE_N, EDGE_S], files: ['Oil_Middle1', 'Oil_Middle2', 'Oil_Middle3'] },
  corner:   { base: [EDGE_N, EDGE_E], files: ['Oil_L1', 'Oil_L2', 'Oil_l'] },
  startCorner: { base: [EDGE_N, EDGE_E], files: ['Oil_Start_L'] },
  three:    { base: [EDGE_E, EDGE_S, EDGE_W],
              files: ['Oil_U', 'Oil_u', 'Oil_t', 'Oil_tu', 'Oil_ut'] },
  four:     { base: [EDGE_N, EDGE_E, EDGE_S, EDGE_W],
              files: ['Oil_T', 'Oil_TU', 'Oil_UT', 'Oil_X'] },
};

/* `Oil_Stop*` join southwards where the others join north, so they are turned
 * half a circle to line up with the rest of their group. */
const OIL_FLIPPED = new Set(['Oil_Stop1', 'Oil_Stop2']);

/*
 * Which of a group's tiles a square uses. Picking by position rather than at
 * random keeps a square looking the same as the trail is drawn around it.
 */
function oilVariant(group, c, r) {
  const files = OIL_SLICK[group].files;
  return files[Math.abs(c * 73856093 ^ r * 19349663) % files.length];
}

/** The variant of `file` with the ends its neighbours carry on into uncapped. */
function openVariant(set, file, left, right) {
  const v = set.opens[file];
  if (!v) return file;
  const pick = left && right ? v[2] : left ? v[0] : right ? v[1] : null;
  return pick || (left || right ? v[2] || file : file);
}

/** The quarter-turn that puts `base`'s edges onto `target`, or null. */
function rotForEdges(base, target) {
  const want = [...target].sort().join();
  for (let k = 0; k < 4; k++) {
    if (base.map(e => (e + k) % 4).sort().join() === want) return k;
  }
  return null;
}

/*
 * The angled mirrors turn a beam through 90 degrees. `Mirror_L` fills the
 * bottom-left corner of its tile, so its face lies on the north-west to
 * south-east diagonal; a quarter-turn flips that to the other diagonal.
 */
const MIRRORS = new Set(['Mirror_L', 'Mirror_L_W']);
const MIRROR_TURNS = [
  [EDGE_W, EDGE_S, EDGE_E, EDGE_N],   // north-west to south-east: north turns west
  [EDGE_E, EDGE_N, EDGE_W, EDGE_S],   // north-east to south-west: north turns east
];

function mirrorTurn(file, rot) {
  return MIRRORS.has(file) ? MIRROR_TURNS[rot % 2] : null;
}

/*
 * A repair site, workshop or reset point standing in water has the water washed
 * back over it so it reads as submerged — what the ready-made
 * `Water_Double_Spanner` tile shows — rather than needing a separate graphic
 * for every combination.
 */
const SUBMERGE = {
  alpha: 0.35,
  floors: /^(Water[12]|Water1_Special)$/,
  over: new Set(['Spanner', 'Double_Spanner', 'Chop_Shop', 'Reset']),
};

/** The wash to draw back over `file`, or null if it is not standing in water. */
function submergedBy(floorFile, file) {
  return floorFile && SUBMERGE.floors.test(floorFile) && SUBMERGE.over.has(file)
    ? SUBMERGE : null;
}

/* ------------------------------------------------------------------ *
 * Element properties                                                  *
 * ------------------------------------------------------------------ */

/* Elements that can be given a drop shadow, and the graphic that draws it. */
const SHADOWS = {
  Randomizer: 'Randomizer_Shadow',
};

/* Every portal takes the same shadow. `Portal_Shadow2`, a softer version of the
 * same thing, is left unused. */
for (const f of FILES) {
  if (/^Portal_/.test(f) && !/Shadow/.test(f)) SHADOWS[f] = 'Portal_Shadow';
}

/* The plain gears share one shadow; the big and cross gears are a different
 * shape and have none. */
for (const f of ['Gear_CW', 'Gear_AC', 'Gear_Green_1', 'Gear_Green_2']) {
  SHADOWS[f] = 'Gear_Shadow';
}

function shadowFor(file) { return SHADOWS[file] || null; }

/*
 * A crusher dropped onto a conveyor shows the belt running through its window,
 * the way the ready-made crusher-on-a-belt tiles in the set do. The belt is
 * redrawn inside the crusher's disc so its arrow comes through the dotted
 * background.
 *
 * The belt is scaled down uniformly, so the arrow keeps its shape, by enough
 * that even the longest of them (the turns and the belt starts, 71 px from the
 * centre) fits inside the window rather than being cut off at the rim.
 *
 * `band` is the half-width of the belt's central strip: every belt in the set
 * puts its arrow inside it and its side rollers outside, so clipping the window
 * to the scaled band keeps the rollers from being dragged in with the arrow.
 *
 * `maskRadius` is the reach of a second pass that flattens the belt's own
 * full-size arrow to the belt's colour wherever the crusher does not cover it,
 * so no part of the arrow shows outside the crusher.
 *
 * `badges` moves the phase numbers off the middle of the disc when a belt is
 * running under it, into two columns either side of the arrow, turned a quarter
 * turn the way `Red_Crusher_3` and friends have them. The two columns
 * interleave: a pair spreads around a lone number opposite it so three read as
 * a triangle, and tucks into the gaps of a full column of three.
 */
const BELT_WINDOW = {
  Crusher_Blank: {
    radius: 39, scale: 0.54, alpha: 0.8, band: 37, maskRadius: 64,
    badges: { offset: 21, y: 84, pitch: 13, turn: 1 },
  },
};

function beltWindow(file) { return BELT_WINDOW[file] || null; }

/* ------------------------------------------------------------------ *
 * Labels                                                              *
 * ------------------------------------------------------------------ */

const SUFFIX_WORDS = {
  TL: 'turn left', TR: 'turn right',
  JL: 'join left', JR: 'join right', JB: 'join both', J3: 'join 3-way',
  Start: 'start', Blank: 'blank',
  L: 'left', R: 'right', U: 'U-shape', O: 'open', B: 'back',
  CW: 'clockwise', AC: 'anti-clockwise',
  W: 'with wall', PT: 'piston',
};

/* A few names the mechanical rule below would read wrongly. */
const LABEL_OVERRIDES = {
  Wall: 'Wall (edge)',
  Wall_L: 'Wall — corner',
  Ledge: 'Ledge (edge)',
  Ledge_L: 'Ledge — corner',
  Pit_L: 'Pit — corner',
  Pit_Tape_L: 'Pit tape — corner',
  Blank: 'Nothing (transparent)',
  Floor_Cracked: 'Floor — cracked',
  Floor_Metal: 'Floor — metal grid',
  Radioactive_Waste: 'Floor — toxic waste',
  Radiation_Square: 'Floor — radiation',
  Sandslip: 'Floor — sand',
  Water1_Special: 'Deep water',
  Laser: 'Laser beam',
  Gun: 'Laser cannon',
  MGun: 'Pulse cannon',
  Magnet: 'Magnet',
  Mirror_L: 'Mirror — angled',
  Mirror_L_W: 'Mirror — angled, on a wall',
  Pusher_Blank: 'Pusher',
  Big_Pusher_Blank: 'Pusher (wide)',
  Pit_Blank: 'Trap door',
  Black: 'Floor — black',
  Magnet_Blank: 'Magnet plate',
  Crusher_Blank: 'Crusher',
  Red_Crusher_Blank: 'Crusher on a belt',
  Flamer_Blank: 'Flamer',
  Flamer_Long_Start: 'Flamer (long)',
  Wall_PT: 'Piston wall',
  Randomizer: 'Randomizer',
  Big_Gear_H1: 'Big gear',
  XGear_CW: 'Cross gear — clockwise',
  XGear_AC: 'Cross gear — anti-clockwise',
  Water_Drain: 'Drain',
  Variable: 'Belt — variable speed',
  Blue_Ramp_Special: 'Ramp — blue belt',
  Gold_Special1: 'Ramp — gold belt',
};

function prettyLabel(name) {
  if (LABEL_OVERRIDES[name]) return LABEL_OVERRIDES[name];
  const parts = name.split('_');
  const mods = [];
  while (parts.length > 1 && SUFFIX_WORDS[parts[parts.length - 1]]) {
    mods.unshift(SUFFIX_WORDS[parts.pop()]);
  }
  const head = parts.join(' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2');
  return head + (mods.length ? ' \u2014 ' + mods.join(', ') : '');
}

/* ------------------------------------------------------------------ *
 * Palette entries                                                     *
 * ------------------------------------------------------------------ */

/*
 * An entry is one clickable swatch in the sidebar.
 *   files     one or more graphics; a placement picks one at random, which is
 *             how plain floor gets its variety
 *   randomRot placements default to a random quarter-turn
 */
function entry(o) {
  return {
    id: o.id,
    label: o.label,
    cat: o.cat,
    layer: o.layer,
    files: o.files,
    randomRot: !!o.randomRot,
    thumb: o.thumb || o.files[0],
    smart: !!o.smart,
    phased: o.files.length === 1 && !!PHASED[o.files[0]],
    distributor: o.files.length === 1 && DISTRIBUTORS.has(o.files[0]),
    emitter: o.files.length === 1 && !!EMITTERS[o.files[0]],
    assembly: o.files.length === 1 && !!ASSEMBLIES[o.files[0]],
  };
}

/* Hand-tuned entries that draw from several interchangeable graphics. */
const SMART_SPEC = [
  ['floor-plain',      'Floor — plain',        ['Floor1', 'Floor2', 'Floor3']],
  ['floor-rust',       'Floor — rust',         ['Rust1', 'Rust2', 'Rust3', 'Rust4']],
  ['floor-water',      'Floor — water',        ['Water1', 'Water2']],
  ['floor-padded',     'Floor — padded cell',  ['Padded_Green', 'Padded_Orange', 'Padded_Pink']],
];

const SMART_ENTRIES = SMART_SPEC.map(([id, label, files]) => entry({
  id: 'smart:' + id, label, cat: 'Floors', layer: 'floor',
  files, randomRot: true, smart: true,
}));

/* Painting runs and areas rather than placing one piece at a time. */
const AUTO_ENTRIES = [
  ...Object.keys(AUTO_SETS).map(kind => {
    const e = entry({
      id: 'auto:' + kind,
      label: AUTO_SETS[kind].label + ' (auto)',
      cat: 'Walls & ledges', layer: 'overlay',
      files: [AUTO_SETS[kind].one], smart: true,
    });
    e.auto = kind;
    return e;
  }),
  (() => {
    const e = entry({
      id: 'slick:oil', label: 'Oil slick (auto)',
      cat: 'Oil & waste', layer: 'overlay',
      files: ['Oil_Start1'], smart: true,
    });
    e.slick = true;
    return e;
  })(),
  ...Object.keys(AUTO_AREAS).map(kind => {
    const e = entry({
      id: 'area:' + kind,
      label: AUTO_AREAS[kind].label + ' (auto)',
      cat: AUTO_AREAS[kind].cat || 'Floors', layer: 'overlay',
      files: [AUTO_AREAS[kind].thumb || AUTO_AREAS[kind].all
              || AUTO_AREAS[kind].three], smart: true,
    });
    e.area = kind;
    return e;
  }),
];

const RAW_ENTRIES = FILES.filter(name => !HIDDEN_RE.test(name)).map(name => entry({
  id: 'file:' + name,
  label: prettyLabel(name),
  cat: categoryOf(name),
  layer: layerOf(name),
  files: [name],
  randomRot: layerOf(name) === 'floor',   // loose floor tiles look better scattered
}));

const ENTRIES = [...SMART_ENTRIES, ...AUTO_ENTRIES, ...RAW_ENTRIES];
const ENTRY_BY_ID = new Map(ENTRIES.map(e => [e.id, e]));

/** Palette grouped for the sidebar, the handy entries first inside their group. */
const PALETTE = CATEGORIES
  .map(cat => ({ cat, entries: ENTRIES.filter(e => e.cat === cat) }))
  .filter(g => g.entries.length);

/** The raw entry that placed `file`, for the eyedropper. */
function entryForFile(file) { return ENTRY_BY_ID.get('file:' + file) || null; }

function assetUrl(file) { return ASSET_DIR + file + '.png'; }
