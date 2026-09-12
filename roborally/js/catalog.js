/* RoboRally board editor — element catalog.
 *
 * The catalog is a list of definitions: every element says which class it
 * belongs to (js/elements.js), which graphics it draws with, and whatever it
 * does differently from the rest of its class. Everything the editor asks about
 * an element — its palette group, its slot, its drawing order, its properties —
 * is answered from its definition, so adding an element means writing one line
 * here rather than teaching a rule to recognise its name.
 *
 * Graphics that only ever appear as part of another element (phase digits, a
 * beam, a shadow, the far half of a long flame) are defined too, marked
 * `hidden` so they stay out of the palette while remaining drawable.
 */
import {
  ASSET_DIR, EDGE_N, EDGE_E, EDGE_S, EDGE_W, PHASES,
  Element, Floor, Overlay, Conveyor, Distributor, Ramp, Gear, Pit, Teleporter,
  Station, Decal, Flow, Fog, Hazard, Wall, Ledge, WallJoin, Cannon, Mirror,
  Lettering, WallPortal, Bridge, Rim,
} from './elements.js';

/* ------------------------------------------------------------------ *
 * The registry                                                        *
 * ------------------------------------------------------------------ */

export const REGISTRY = new Map();

/*
 * Define elements of one class. `spec` is either a list of names, for elements
 * that need nothing beyond their class, or a map of name to whatever that one
 * does differently. `shared` applies to all of them, which is how a family such
 * as the portals is given one shadow between them.
 */
function define(Cls, spec, shared = {}) {
  const add = (name, opts) => {
    if (REGISTRY.has(name)) throw new Error('element defined twice: ' + name);
    REGISTRY.set(name, new Cls(name, Object.assign({}, shared, opts)));
  };
  if (Array.isArray(spec)) for (const name of spec) add(name, {});
  else for (const [name, opts] of Object.entries(spec)) add(name, opts);
}

/** Hidden elements: shipped and drawable, but not offered in the palette. */
function defineHidden(Cls, names, shared = {}) {
  define(Cls, names, Object.assign({ hidden: true }, shared));
}

/** A family of numbered graphics, e.g. `numbered('Pusher_#')` for its digits. */
function numbered(pattern) { return PHASES.map(n => pattern.replace('#', n)); }

/* ------------------------------------------------------------------ *
 * Floors                                                              *
 * ------------------------------------------------------------------ */

define(Floor, {
  Floor1: {}, Floor2: {}, Floor3: {},
  Floor_Cracked: { label: 'Floor — cracked' },
  Floor_Metal: { label: 'Floor — metal grid' },
  Rust1: {}, Rust2: {}, Rust3: {}, Rust4: {},
  Sandslip: { label: 'Floor — sand' },
  Black: { label: 'Floor — black' },
  Blank: { label: 'Nothing (transparent)' },
  Padded_Green: {}, Padded_Orange: {}, Padded_Pink: {},
  Radiation: {}, Radiation_Corner: {}, Radiation_Edge: {},
  Radiation_Square: { label: 'Floor — radiation' },
});

/* Water washes back over a repair site standing in it, so it reads as
 * submerged rather than needing a graphic per combination. */
define(Floor, {
  Water1: {}, Water2: {},
  Water1_Special: { label: 'Deep water' },
}, { washes: true });

/*
 * Ice, off Cold Room by tools/extract_cold.py. Two sheets of it are printed,
 * which that board lays at random over its field, and two more carrying a ridge
 * of brighter frost, which it runs along the sides the field stops at — those
 * are the rim below, not sheets to lay a field from. A repair site or a chop
 * shop standing on ice is printed under it, so the ice washes back over the
 * top, the way water does but far more thickly.
 */
defineHidden(Floor, ['Ice1', 'Ice2'], { washes: 0.65 });

/* the ridge of frost a field of ice is edged with; only the strip along the
 * foot of each is ever drawn */
defineHidden(Rim, ['Ice_Edge1', 'Ice_Edge2', 'Ice_Edge3'], { category: 'Floors' });

/* Sludge is a floor, but it belongs with the waste rather than the floors. */
define(Floor, {
  Radioactive_Waste: { label: 'Floor — toxic waste', category: 'Oil, fog & waste' },
});

/*
 * Lava, off Forge On by tools/extract_currents.py. Every printed lava square
 * carries a flow arrow, so the plain tile is one with its arrow painted out.
 */
defineHidden(Floor, { Lava: { label: 'Floor — lava' } });

/* the rock a pool of lava banks up against, drawn along the sides the pool
 * stops at; only the strip along the foot of each is ever used */
defineHidden(Rim, ['Lava_Edge1', 'Lava_Edge2', 'Lava_Edge3'], { category: 'Floors' });

/* the drain sits on a floor rather than being one */
define(Overlay, { Water_Drain: { label: 'Drain', category: 'Floors' } });

/* ------------------------------------------------------------------ *
 * Conveyors                                                           *
 * ------------------------------------------------------------------ */

define(Conveyor, [
  'Blue', 'Blue_TL', 'Blue_TR', 'Blue_JL', 'Blue_JR', 'Blue_JB', 'Blue_J3',
  'Blue_Start',
  'Red', 'Red_TL', 'Red_TR', 'Red_JL', 'Red_JR', 'Red_JB', 'Red_J3', 'Red_Start',
  'Gold', 'Gold_TL', 'Gold_TR', 'Gold_JL', 'Gold_JR',
  'Green', 'GreenA', 'GreenB', 'Green_TL', 'Green_TR',
]);
/*
 * The variable-speed belt, with the three-colour rollers that mark a belt
 * running at more than one speed: the straight one off Baggage Claim and its
 * turns and joins off Grand Prix 4, by tools/extract_variable_belt.py. Neither
 * board carries a join from both sides or a three-way one.
 */
define(Conveyor, {
  Variable:    { label: 'Belt — variable speed' },
  Variable_TL: { label: 'Belt — variable speed, turn left' },
  Variable_TR: { label: 'Belt — variable speed, turn right' },
  Variable_JL: { label: 'Belt — variable speed, join left' },
  Variable_JR: { label: 'Belt — variable speed, join right' },
});

/* ------------------------------------------------------------------ *
 * Flows                                                               *
 * ------------------------------------------------------------------ */

/* the ordinary water currents, drawn with a solid arrow */
define(Flow, [
  'Water_Current1', 'Water_Current2', 'Water_Current_L', 'Water_Current_R',
  'Water_Current_JL', 'Water_Current_JR',
]);

/*
 * The currents the dump has no artwork for, lifted off printed boards by
 * tools/extract_currents.py: the fast water currents, drawn with an outline
 * arrow where the ordinary ones have a solid one, the flow through radioactive
 * sludge, and the flow through lava. What a board does not carry is made from
 * what it does — a mirrored arrow for the turn that goes the other way, a turn
 * swept round from a straight arrow where the printed ones are painted as
 * diagonal splashes too loose to read on a square board, and the circle that
 * marks where a flow starts where the printed one cannot be keyed cleanly.
 */
define(Flow, [
  'Water_Current_Fast1', 'Water_Current_Fast2',
  'Water_Current_Fast_L', 'Water_Current_Fast_R',
  'Water_Current_Fast_JL', 'Water_Current_Fast_JR',
], { order: 1 });                             // after the slow ones they match

define(Flow, ['Waste_Current_Start', 'Waste_Current1', 'Waste_Current2',
              'Waste_Current_L', 'Waste_Current_R'], { order: 2 });

define(Flow, ['Lava_Flow_Start', 'Lava_Flow1', 'Lava_Flow2',
              'Lava_Flow_L', 'Lava_Flow_R'], { order: 3 });

/* ------------------------------------------------------------------ *
 * Conveyor distributors                                               *
 * ------------------------------------------------------------------ */

/*
 * Which sides a distributor's arrows point out of, in the order its name lists
 * them. A phase is routed to one of these and its number printed against that
 * edge, EXIT_INSET in from it.
 */
const EXIT_BADGE = 'Multi_#';
export const EXIT_INSET = 20;

define(Distributor, {
  Multi_Blue_UL:  { exits: [EDGE_N, EDGE_W] },
  Multi_Blue_UR:  { exits: [EDGE_N, EDGE_E] },
  Multi_Gold_XUL: { exits: [EDGE_N, EDGE_W] },
  Multi_Gold_XUR: { exits: [EDGE_N, EDGE_E] },
  Multi_Red_UD:   { exits: [EDGE_N, EDGE_S] },
  Multi_Red_UL:   { exits: [EDGE_N, EDGE_W] },
  Multi_Red_ULR:  { exits: [EDGE_N, EDGE_W, EDGE_E] },
  Multi_Red_UR:   { exits: [EDGE_N, EDGE_E] },
  Multi_Red_XUL:  { exits: [EDGE_N, EDGE_W] },
  Multi_Red_XUR:  { exits: [EDGE_N, EDGE_E] },
}, { extras: numbered(EXIT_BADGE) });

defineHidden(Distributor, numbered(EXIT_BADGE));

/* ------------------------------------------------------------------ *
 * Ramps                                                               *
 * ------------------------------------------------------------------ */

define(Ramp, ['Ramp', 'Ramp_L', 'Ramp_O', 'Ramp_Small', 'Ramp_Tiny', 'Ramp_U']);
define(Ramp, {
  Blue_Ramp_Special: { label: 'Ramp — blue belt' },
  Gold_Special1: { label: 'Ramp — gold belt' },
});

/*
 * A bridge, which carries a robot over what it spans in some of the register
 * phases. It wears the trap door's digits, in the places they are drawn on the
 * tile — the two go together, a bridge over a pit — and the digits carry their
 * own positions, so nothing has to be laid out for them.
 */
define(Bridge, { Bridge: { phases: { badge: 'Pit_#' } } });

/* ------------------------------------------------------------------ *
 * Gears                                                               *
 * ------------------------------------------------------------------ */

/* The plain gears share one shadow. The big and cross gears are a different
 * shape and have none. */
define(Gear, ['Gear_CW', 'Gear_AC', 'Gear_Green_1', 'Gear_Green_2'],
  { shadow: 'Gear_Shadow' });

/*
 * A cross gear is a middle with four wings and a big gear is four quarters
 * filling a 2x2. Only the piece defined here is placed by hand; `parts` lays
 * the rest with it, at [column, row, graphic] from that square.
 */
const XGEAR_WINGS = [[0, -1, 'XGear_N'], [1, 0, 'XGear_E'],
                     [0, 1, 'XGear_S'], [-1, 0, 'XGear_W']];

define(Gear, {
  Big_Gear_H1: {
    label: 'Big gear',
    parts: [[1, 0, 'Big_Gear_H2'], [0, 1, 'Big_Gear_H3'], [1, 1, 'Big_Gear_H4']],
  },
  XGear_CW: { label: 'Cross gear — clockwise', parts: XGEAR_WINGS },
  XGear_AC: { label: 'Cross gear — anti-clockwise', parts: XGEAR_WINGS },
});

/*
 * A numbered platform: the platform itself, printed with a 1 on it, and the
 * other four digits, which go on the other squares the platform covers. So a
 * number is a thing you place rather than a property you set, and all five
 * share the gears' slot — a square is one of them or another, and never a gear
 * as well.
 */
define(Gear, ['Platform', 'Platform2', 'Platform3', 'Platform4', 'Platform5']);

/* the wings and quarters come with their middles */
defineHidden(Gear, [
  'XGear_N', 'XGear_E', 'XGear_S', 'XGear_W',
  'Big_Gear_H2', 'Big_Gear_H3', 'Big_Gear_H4', 'Gear_Shadow',
]);

/* ------------------------------------------------------------------ *
 * Walls and ledges                                                    *
 * ------------------------------------------------------------------ */

/*
 * The set is drawn with both ends of every bar capped. `opens` names the
 * variants with the left-hand end uncapped, the right-hand one, and both, as
 * the graphic is drawn; on a corner piece the left-hand end is the upright
 * arm's and the right-hand one the flat arm's. Which edges a piece walls off
 * was taken from the artwork: an edge counts when the graphic covers the outer
 * band of the tile along it.
 */
define(Wall, {
  Wall: { label: 'Wall (edge)',
          opens: ['Wall_Open_L', 'Wall_Open_R', 'Wall_Open_B'] },
  Wall_Open_L: {}, Wall_Open_R: {}, Wall_Open_B: {},
  Wall_Red: {}, Wall_Red_Open_L: {}, Wall_Red_Open_R: {}, Wall_Red_Open_B: {},
  Wall_Green: {}, Wall_Green_Open_L: {}, Wall_Green_Open_R: {},
  Wall_Green_Open_B: {},
});

define(Wall, {
  Wall_L: { label: 'Wall — corner',
            opens: ['Wall_L_Open_L', 'Wall_L_Open_R', 'Wall_L_Open_B'] },
  Wall_L_Open_L: {}, Wall_L_Open_R: {}, Wall_L_Open_B: {},
  Wall_Red_L: {}, Wall_Green_L: {},
}, { blocks: [EDGE_S, EDGE_W] });

/* the U has only a both-ends variant, so a run reaching either arm opens both */
define(Wall, {
  Wall_U: { opens: [null, null, 'Wall_U_Open_B'] },
  Wall_U_Open_B: {},
}, { blocks: [EDGE_S, EDGE_W, EDGE_E] });

define(WallJoin, ['Wall_Nodule', 'Wall_Nodule_L', 'Wall_Nodule_R']);

/* a forcefield stands shallower than a wall and the padded ones shallower
 * still — all measured off the artwork */
define(Wall, { Forcefield: {} }, { depth: 13 });
define(Wall, {
  Padded_Wall_Green_L: { depth: 9 },
  Padded_Wall_Pink_L: { depth: 8 },
  Padded_Wall_Green_R: { depth: 16 },
  Padded_Wall_Pink_R: { depth: 16 },
});

/* a grate is a wall you can see over */
define(Wall, { Grate: { blocks: [] } });

define(Ledge, {
  Ledge: { label: 'Ledge (edge)' },
  Ledge_L: { label: 'Ledge — corner', stops: [EDGE_S, EDGE_W] },
  Ledge_U: { stops: [EDGE_S, EDGE_W, EDGE_E] },
  Ledge_O: { stops: [EDGE_N, EDGE_E, EDGE_S, EDGE_W] },
});
define(WallJoin, { Ledge_Nodule: { category: 'Levels & Ramps' } });

/* ------------------------------------------------------------------ *
 * Lasers, mirrors and pulls                                           *
 * ------------------------------------------------------------------ */

/*
 * An emitter casts something down a line of squares. Turned by `rot` it casts
 * in direction `rot`: a cannon is bolted to a wall and fires away from it, a
 * magnet's poles face the way it is turned.
 *
 *   mounts      barrel graphics for the left, middle and right positions, with
 *               `baked` where each sits in its own graphic and `spread` how far
 *               the outer two belong from the middle for a given number of beams
 *   muzzle      how far in from the edge the beam starts
 *   skipSource  the beam begins in the next square, clear of the element itself
 *   reflects    whether angled mirrors turn it
 *   beam        one graphic, or several cycled along the beam for variety
 *
 * The barrels are drawn 34 px apart, but a printed board spaces them by how
 * many there are: a triple stands its outer two 50 from the middle, a double
 * draws its pair in to 25. Both measured off Baggage Claim.
 */
define(Cannon, {
  Gun: {
    label: 'Laser cannon',
    emitter: { beam: 'Laser', mounts: ['GunL', 'Gun', 'GunR'],
               baked: [-34.5, 0, 34.5], spread: { 2: 25, 3: 50 },
               max: 3, muzzle: 27, reflects: true },
  },
  MGun: {
    label: 'Pulse cannon',
    emitter: { beam: 'MLaser', mounts: ['MGun'], baked: [0], spread: {},
               max: 1, muzzle: 22, reflects: true },
  },
}, { mounts: [EDGE_S] });

/*
 * A sensor beam: the same nozzle as a laser cannon, casting one bright green
 * beam rather than a red one. `GLaser`, the green beam, ships in the set with
 * nothing to fire it; the nozzle is the cannon's own graphic under another name,
 * so that an element is one name and one thing.
 */
define(Cannon, {
  Sensor: {
    label: 'Sensor beam', mounts: [EDGE_S],
    emitter: { beam: 'GLaser', mounts: ['Sensor'], baked: [0], spread: {},
               max: 1, muzzle: 27, reflects: true },
  },
});

/* a cannon carries its own barrels and draws its own beam */
defineHidden(Cannon, ['GunL', 'GunR'], { mounts: [EDGE_S] });
defineHidden(Cannon, { Laser: { label: 'Laser beam' }, MLaser: {},
                       GLaser: { label: 'Sensor beam — the beam itself' } });

/*
 * The flat mirror is bolted to one edge; the angled one tucks into the corner
 * between two, so a wall on either pushes it off that one. The mirrors drawn
 * against a wall are the plain ones stood off it, which the editor does for
 * them when a wall is there.
 */
define(Mirror, {
  Mirror: { mounts: [EDGE_S] },
  Mirror_L: { label: 'Mirror — angled', mounts: [EDGE_S, EDGE_W], angled: true },
});
/* ------------------------------------------------------------------ *
 * Pushers and hazards                                                 *
 * ------------------------------------------------------------------ */

/*
 * Pushers, crushers, flamers, trap doors and the like fire in only some of the
 * five register phases, and the set carries a digit graphic per phase. A
 * placement stores which phases it is active in and the editor draws the
 * matching digits, so numbers never have to be positioned by hand.
 *
 * Two badge styles ship in the set:
 *   - a digit on a full 150x150 canvas already carries its own position, so any
 *     combination can simply be drawn on top of the body (no `anchor`);
 *   - a small badge has no position of its own, so those are laid out centred
 *     on `anchor`, in 150-px tile space, following where the set puts the
 *     numbers on the tiles that have them baked in: on the flame for a flamer,
 *     on the disc for a crusher, just inside the square from a piston wall's
 *     bar. `stack` splits more than two badges over two lines so they keep
 *     fitting inside a round element, and `shadow` lifts them off the floor.
 */
define(Hazard, {
  Pusher_Blank: { label: 'Pusher', phases: { badge: 'Pusher_#' } },
  Big_Pusher_Blank: { label: 'Pusher (wide)', phases: { badge: 'Big_Pusher_#' } },
}, { mounts: [EDGE_S] });

/*
 * A crusher dropped onto a conveyor shows the belt running through its window,
 * the way the ready-made crusher-on-a-belt tiles do. The belt is redrawn inside
 * the disc so its arrow comes through the dotted background.
 *
 * It is scaled down uniformly, so the arrow keeps its shape, by enough that even
 * the longest of them (the turns and the belt starts, 71 px from the centre)
 * fits inside the window rather than being cut off at the rim. `band` is the
 * half-width of the belt's central strip: every belt puts its arrow inside it
 * and its side rollers outside, so clipping to the scaled band keeps the rollers
 * from being dragged in with the arrow. `maskRadius` is the reach of a second
 * pass that flattens the belt's own full-size arrow to the belt's colour
 * wherever the crusher does not cover it. `badges` moves the phase numbers off
 * the middle of the disc into two columns either side of the arrow, turned a
 * quarter the way `Red_Crusher_3` and friends have them.
 */
define(Hazard, {
  Crusher_Blank: {
    label: 'Crusher',
    phases: { badge: 'Crusher_#', anchor: [75, 75], stack: true },
    window: { radius: 39, scale: 0.54, alpha: 0.8, band: 37, maskRadius: 64,
              badges: { offset: 21, y: 84, pitch: 13, turn: 1 } },
  },
  Flamer_Blank: {
    label: 'Flamer',
    phases: { badge: 'Flamer_#', anchor: [75, 59], stack: true },
  },
  /* the long flame stands on its nozzle and spills into the square beyond, and
   * wears its numbers on that half of it — hence an anchor above this square */
  Flamer_Long_Start: {
    label: 'Flamer (long)',
    phases: { badge: 'Flamer_Long_#', anchor: [75, -59], stack: true },
    parts: [[0, -1, 'Flamer_Long_Blank']],
  },
  Magnet_Blank: { label: 'Magnet plate', phases: { badge: 'Magnet_#' } },
  Pit_Blank: { label: 'Trap door', phases: { badge: 'Pit_#' } },
});

/* a magnet pulls a robot down a line of squares towards it, and unlike a beam
 * it is not turned by a mirror */
define(Hazard, {
  Magnet: {
    emitter: { beam: ['Pull1', 'Pull2', 'Pull3'], spread: 0, max: 1,
               muzzle: 0, reflects: false, skipSource: true },
  },
});

define(Hazard, { Spikes: { mounts: [EDGE_S] } });

/* a randomizer spins a robot's cards, which is a hazard rather than a repair.
 * Its shadow is a property of it now, so the tile is not offered on its own. */
define(Hazard, { Randomizer: { shadow: 'Randomizer_Shadow' } });
defineHidden(Hazard, ['Randomizer_Shadow']);
define(Hazard, {
  Wall_PT: {
    label: 'Piston wall', mounts: [EDGE_S], blocks: [EDGE_S], depth: 24,
    phases: { badge: 'Wall_PT_#', anchor: [75, 114], shadow: true },
  },
});

/* The digit graphics come with the elements that wear them; the crushers with a
 * belt and numbers baked in are drawn by dropping a crusher on a conveyor; the
 * far half of the long flame comes with its nozzle; and spikes and a wall can
 * be placed one on top of the other. */
defineHidden(Hazard, [
  ...numbered('Pusher_#'), ...numbered('Big_Pusher_#'),
  ...numbered('Crusher_#'), ...numbered('Magnet_#'), ...numbered('Wall_PT_#'),
  ...numbered('Flamer_#'), ...numbered('Flamer_Long_#'), 'Flamer_Long_Blank',
]);

/* ------------------------------------------------------------------ *
 * Teleporters                                                         *
 * ------------------------------------------------------------------ */

define(Teleporter, ['Teleporter', 'Antigrav', 'Repulsor1', 'Repulsor2',
                    'Repulsor_L', 'Tama1', 'Tama2']);

/* every portal takes the same shadow */
define(Teleporter, [
  'Portal_Black', 'Portal_Blue', 'Portal_Brown', 'Portal_Cyan', 'Portal_Green',
  'Portal_Grey', 'Portal_Lilac', 'Portal_Orange', 'Portal_Pink', 'Portal_Purple',
  'Portal_Red', 'Portal_Yellow',
], { shadow: 'Portal_Shadow' });

/*
 * A portal bolted to the edge of a square rather than lying on the floor: a lit
 * bar in a bracket, which pairs with the floor portal of the same colour. One is
 * lifted off Propagation by tools/extract_wall_portal.py and the rest coloured
 * from it. A wall on the same edge stands it off, which is how the printed
 * boards show one where a wall is already there.
 */
define(WallPortal, [
  'Wall_Portal_Black', 'Wall_Portal_Blue', 'Wall_Portal_Brown',
  'Wall_Portal_Cyan', 'Wall_Portal_Green', 'Wall_Portal_Grey',
  'Wall_Portal_Lilac', 'Wall_Portal_Orange', 'Wall_Portal_Pink',
  'Wall_Portal_Purple', 'Wall_Portal_Red', 'Wall_Portal_Yellow',
], { mounts: [EDGE_S] });

/* a portal draws its own shadow and a magnet casts its own pull */
defineHidden(Teleporter, ['Portal_Shadow', 'Pull1', 'Pull2', 'Pull3']);

/* ------------------------------------------------------------------ *
 * Repair sites and the rest                                           *
 * ------------------------------------------------------------------ */

define(Station, ['Spanner', 'Double_Spanner', 'Chop_Shop', 'Reset'],
  { submerges: true });
define(Station, ['Energizer', 'Jack', 'Finish', 'Repeater',
                 'Padded_Green_Double_Spanner', 'Padded_Orange_Double_Spanner']);
/* Lettering for a board title: it carries words rather than a graphic. The name
 * begins with @ so it can never collide with a file in assets/. */
export const TEXT_FILE = '@Text';
define(Lettering, { [TEXT_FILE]: { label: 'Text' } });

/* ------------------------------------------------------------------ *
 * Oil and waste                                                       *
 * ------------------------------------------------------------------ */

define(Decal, [
  'Oil_Splash', 'Oil_Splash2', 'Oil_Drop1', 'Oil_Drop2',
  'Oil_Start1', 'Oil_Start2', 'Oil_Start_L', 'Oil_Drain_L',
  'Oil_End1', 'Oil_End2', 'Oil_Stop1', 'Oil_Stop2',
  'Oil_Middle1', 'Oil_Middle2', 'Oil_Middle3',
  'Oil_L1', 'Oil_L2', 'Oil_l',
  'Oil_U', 'Oil_u', 'Oil_t', 'Oil_tu', 'Oil_ut',
  'Oil_T', 'Oil_TU', 'Oil_UT', 'Oil_X',
]);

define(Decal, [
  'Radioactive_Waste_Drain', 'Radioactive_Waste_Middle',
  'Radioactive_Waste_End', 'Radioactive_Waste_End_Barrel',
  'Radioactive_Waste_Edge1', 'Radioactive_Waste_Edge2', 'Radioactive_Waste_Edge3',
]);

/*
 * Fog: white cloud on a transparent tile, drawn by hand rather than taken off a
 * board. Four of them, offered one by one and as a brush that picks between
 * them at a random quarter-turn, which is how a bank of it is laid.
 */
define(Fog, ['Fog1', 'Fog2', 'Fog3', 'Fog4'], { randomRot: true });

/* ------------------------------------------------------------------ *
 * Pits                                                                *
 * ------------------------------------------------------------------ */

define(Pit, {
  Pit: {}, Pit_Edge: {}, Pit_U: {}, Pit_Nodule: {},
  Pit_L: { label: 'Pit — corner' },
  Pit_Tape_Edge: {}, Pit_Tape_U: {}, Pit_Tape_Nodule: {},
  Pit_Tape_L: { label: 'Pit tape — corner' },
});

/* the trap door's digits */
defineHidden(Pit, numbered('Pit_#'));

/* ------------------------------------------------------------------ *
 * What the definitions add up to                                      *
 * ------------------------------------------------------------------ */

/** Every graphic the catalog defines, the drawn-not-loaded lettering aside. */
export const FILES = [...REGISTRY.keys()].filter(name => name !== TEXT_FILE).sort();

/** Palette groups, in the order they are shown. */
export const CATEGORIES = [
  'Floors',
  'Conveyors',
  'Conveyor distributors',
  'Flows',
  'Levels & Ramps',
  'Gears',
  'Walls',
  'Lasers',
  'Pushers & hazards',
  'Repair & special',
  'Teleporters',
  'Oil, fog & waste',
  'Other',
  'Pits (custom)',
];

/*
 * Every overlay slot there is, gathered from the elements that take one. A slot
 * belongs to a class rather than to a palette group: a ledge is offered with
 * the ramps but holds a wall's slot, so one group can draw on two of these.
 */
export const SLOTS = (() => {
  const out = {};
  for (const el of REGISTRY.values()) {
    if (el.layer === 'floor') continue;
    out[el.slotKey] = { key: el.slotKey, z: el.z, perFacing: el.perFacing };
  }
  return out;
})();

/* Register phases by element, for the panels that offer them. */
export const PHASED = (() => {
  const out = {};
  for (const el of REGISTRY.values()) if (el.phases) out[el.name] = el.phases;
  return out;
})();

/* ------------------------------------------------------------------ *
 * Asking a definition                                                 *
 * ------------------------------------------------------------------ */

/* A name the catalog has never heard of still has to draw somewhere, so these
 * fall back on a bare element rather than throwing. */
const UNKNOWN = new Element('?');

/** The definition of `file`; every drawable graphic has one. */
export function elementOf(file) { return REGISTRY.get(file) || UNKNOWN; }

export function categoryOf(file) { return elementOf(file).category; }
export function layerOf(file) { return elementOf(file).layer; }
export function zIndexOf(file) { return elementOf(file).z; }
export function kindOfFile(file) {
  const el = elementOf(file);
  return { key: el.slotKey, z: el.z, perFacing: el.perFacing };
}

/** Which of a square's overlay slots this placement occupies. */
export function slotFor(file, rot) { return elementOf(file).slot(rot); }

/* Runs of wall laid by the auto tool are managed as a set rather than one at a
 * time, so each piece keeps a slot of its own instead of evicting its siblings.
 */
export function slotOf(p) {
  return p.auto ? 'auto-' + p.auto + ':' + p.file + ':' + p.rot : slotFor(p.file, p.rot);
}

export function phaseSpec(file) { return elementOf(file).phases; }
export function phaseBadge(file, n) { return elementOf(file).phaseBadge(n); }
export function exitBadge(n) { return EXIT_BADGE.replace('#', n); }

export function isDistributor(file) { return !!elementOf(file).exits; }
export function distributorExits(file) { return elementOf(file).exits || []; }

export function assemblyOf(file) { return elementOf(file).parts; }
export function assemblySquares(file) { return elementOf(file).squares(); }

export function emitterSpec(file) { return elementOf(file).emitter; }
export function shadowFor(file) { return elementOf(file).shadow; }
export function beltWindow(file) { return elementOf(file).window; }

/** The properties a placement of `file` can carry, for the Brush and Cell panels. */
export function propertiesOf(file) { return elementOf(file).properties(); }

export function blockedEdges(file, rot) { return elementOf(file).blockedEdges(rot); }
export function wallDepth(file) { return elementOf(file).depth; }
export function mountBases(file) { return elementOf(file).mounts; }
export function mountEdge(file, rot) { return elementOf(file).mountEdge(rot); }
export function mirrorTurn(file, rot) { return elementOf(file).mirrorTurn(rot); }

/*
 * A repair site, workshop or reset point standing in water has the water washed
 * back over it so it reads as submerged — what the ready-made
 * `Water_Double_Spanner` tile shows — rather than needing a separate graphic
 * for every combination.
 */
export const SUBMERGE = { alpha: 0.35 };

/*
 * The wash to draw back over `file`, or null if what it stands on does not wash
 * over it. A floor says how thickly it washes: water lets a repair site read
 * through it easily, ice hardly at all, which is how the printed boards have
 * them.
 */
export function submergedBy(floorFile, file) {
  const washes = floorFile && elementOf(floorFile).washes;
  if (!washes || !elementOf(file).submerges) return null;
  return washes === true ? SUBMERGE : { alpha: washes };
}

/* ------------------------------------------------------------------ *
 * Painting runs, areas and trails                                     *
 * ------------------------------------------------------------------ */

/*
 * The wall and ledge tools work in terms of which edges of a square are walled:
 * these name the piece that covers each set of them, while the pieces
 * themselves say which variant to use where a run carries on into the next
 * square.
 */
export const AUTO_SETS = {
  wall: {
    label: 'Wall', cat: 'Walls',
    one: 'Wall', corner: 'Wall_L', three: 'Wall_U', ring: null,
    nodule: 'Wall_Nodule',
  },
  ledge: {
    label: 'Ledge', cat: 'Levels & Ramps',
    one: 'Ledge', corner: 'Ledge_L', three: 'Ledge_U', ring: 'Ledge_O',
    nodule: 'Ledge_Nodule',
  },
};

/** The variant of `file` with the ends its neighbours carry on into uncapped. */
export function openVariant(file, left, right) {
  const v = elementOf(file).opens;
  if (!v) return file;
  const pick = left && right ? v[2] : left ? v[0] : right ? v[1] : null;
  return pick || (left || right ? v[2] || file : file);
}

/*
 * The pit tools work by area rather than by edge: you say which squares are
 * pit, and the rim goes round wherever the pit stops. `floor` is what the
 * square's floor becomes — the dark of the pit itself, or nothing at all for
 * the tape — and `all` is the ready-made tile for a pit standing on its own.
 * Only the rim pieces are overlays.
 */
export const AUTO_AREAS = {
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
    cat: 'Oil, fog & waste', bank: 48, thumb: 'Radioactive_Waste_End', spin: true,
    banks: ['Radioactive_Waste_Edge1', 'Radioactive_Waste_Edge2',
            'Radioactive_Waste_Edge3'],
  },
  /* lava banks against rock the same way, so it is painted the same way; its
   * banks are shallower, being the rock that lies between two channels of it */
  lava: {
    label: 'Lava', floor: 'Lava',
    cat: 'Floors', bank: 36, thumb: 'Lava', spin: true,
    banks: ['Lava_Edge1', 'Lava_Edge2', 'Lava_Edge3'],
  },
  /*
   * A field of ice is edged by a ridge of brighter frost, faint beside a bank
   * of rock but there all the same. Two plain sheets of ice are printed, so a
   * square takes one of them at random as well as a turn.
   */
  ice: {
    label: 'Ice', floors: ['Ice1', 'Ice2'],
    cat: 'Floors', bank: 26, thumb: 'Ice1', spin: true,
    banks: ['Ice_Edge1', 'Ice_Edge2', 'Ice_Edge3'],
  },
};

/*
 * Oil runs in a trail from square to square, so its tiles are chosen by which
 * sides the trail carries on into. The names in the set do not describe that —
 * `Oil_T` joins on all four sides and `Oil_U` on three — so the shapes here were
 * read off the artwork instead. `base` is what each group joins as drawn.
 */
export const OIL_SLICK = {
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
export const OIL_FLIPPED = new Set(['Oil_Stop1', 'Oil_Stop2']);

/*
 * Which of a group's tiles a square uses. Picking by position rather than at
 * random keeps a square looking the same as the trail is drawn around it.
 */
export function oilVariant(group, c, r) {
  const files = OIL_SLICK[group].files;
  return files[Math.abs(c * 73856093 ^ r * 19349663) % files.length];
}

/* ------------------------------------------------------------------ *
 * Labels                                                              *
 * ------------------------------------------------------------------ */

/*
 * Most elements are named after what they are, so a definition gives a label
 * only where a mechanical reading of the name would be wrong or unhelpful.
 */
const SUFFIX_WORDS = {
  TL: 'turn left', TR: 'turn right',
  JL: 'join left', JR: 'join right', JB: 'join both', J3: 'join 3-way',
  Start: 'start', Blank: 'blank',
  L: 'left', R: 'right', U: 'U-shape', O: 'open', B: 'back',
  CW: 'clockwise', AC: 'anti-clockwise',
  W: 'with wall', PT: 'piston',
};

export function prettyLabel(name) {
  const el = REGISTRY.get(name);
  if (el && el.label) return el.label;
  const parts = name.split('_');
  const mods = [];
  while (parts.length > 1 && SUFFIX_WORDS[parts[parts.length - 1]]) {
    mods.unshift(SUFFIX_WORDS[parts.pop()]);
  }
  const head = parts.join(' ').replace(/([a-z])([A-Z0-9])/g, '$1 $2');
  return head + (mods.length ? ' — ' + mods.join(', ') : '');
}

/* ------------------------------------------------------------------ *
 * Palette entries                                                     *
 * ------------------------------------------------------------------ */

/*
 * An entry is one clickable swatch in the sidebar. Most stand for a single
 * element; a few draw from several interchangeable graphics, and the painting
 * tools stand for a whole set of pieces.
 *   files     one or more graphics; a placement picks one at random
 *   randomRot placements default to a random quarter-turn
 *   props     the properties a placement from this entry can carry
 */
export function entry(o) {
  const el = elementOf(o.files[0]);
  const one = o.files.length === 1;
  return {
    id: o.id,
    label: o.label,
    cat: o.cat,
    layer: o.layer,
    files: o.files,
    randomRot: !!o.randomRot,
    thumb: o.thumb || o.files[0],
    smart: !!o.smart,
    props: one ? el.properties() : [],
    phased: one && !!el.phases,
    distributor: one && !!el.exits,
    emitter: one && !!el.emitter,
    assembly: one && !!el.parts,
  };
}

/*
 * Hand-tuned entries that draw from several interchangeable graphics, laid at a
 * random quarter-turn. The group is the floors unless one is named.
 */
const SMART_SPEC = [
  ['floor-plain',      'Floor — plain',        ['Floor1', 'Floor2', 'Floor3']],
  ['floor-rust',       'Floor — rust',         ['Rust1', 'Rust2', 'Rust3', 'Rust4']],
  ['floor-water',      'Floor — water',        ['Water1', 'Water2']],
  ['floor-padded',     'Floor — padded cell',  ['Padded_Green', 'Padded_Orange', 'Padded_Pink']],
  ['fog',              'Fog',                  ['Fog1', 'Fog2', 'Fog3', 'Fog4'],
   'Oil, fog & waste'],
];

const SMART_ENTRIES = SMART_SPEC.map(([id, label, files, cat]) => entry({
  id: 'smart:' + id, label, cat: cat || 'Floors', layer: layerOf(files[0]),
  files, randomRot: true, smart: true,
}));

/* Painting runs and areas rather than placing one piece at a time. */
const AUTO_ENTRIES = [
  ...Object.keys(AUTO_SETS).map(kind => {
    const e = entry({
      id: 'auto:' + kind,
      label: AUTO_SETS[kind].label + ' (auto)',
      cat: AUTO_SETS[kind].cat, layer: 'overlay',
      files: [AUTO_SETS[kind].one], smart: true,
    });
    e.auto = kind;
    return e;
  }),
  (() => {
    const e = entry({
      id: 'slick:oil', label: 'Oil slick (auto)',
      cat: 'Oil, fog & waste', layer: 'overlay',
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

/* Lettering for a board title, which carries words rather than a graphic. */
const TEXT_ENTRY = (() => {
  const el = elementOf(TEXT_FILE);
  const e = entry({
    id: 'text:label', label: el.label, cat: el.category, layer: el.layer,
    files: [TEXT_FILE], smart: true,
  });
  e.text = true;
  return e;
})();

/*
 * One swatch per element the catalog offers, by name within its group — unless
 * its definition gives it an `order`, which keeps a family together where the
 * names alone would interleave it with another.
 */
const RAW_ENTRIES = [...REGISTRY.values()]
  .filter(el => !el.hidden && el.name !== TEXT_FILE)
  .sort((a, b) => (a.order - b.order) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  .map(el => entry({
    id: 'file:' + el.name,
    label: prettyLabel(el.name),
    cat: el.category,
    layer: el.layer,
    files: [el.name],
    randomRot: el.randomRot,
  }));

export const ENTRIES = [...SMART_ENTRIES, ...AUTO_ENTRIES, TEXT_ENTRY, ...RAW_ENTRIES];
export const ENTRY_BY_ID = new Map(ENTRIES.map(e => [e.id, e]));

/** Palette grouped for the sidebar, the handy entries first inside their group. */
export const PALETTE = CATEGORIES
  .map(cat => ({ cat, entries: ENTRIES.filter(e => e.cat === cat) }))
  .filter(g => g.entries.length);

/** The raw entry that placed `file`, for the eyedropper. */
export function entryForFile(file) { return ENTRY_BY_ID.get('file:' + file) || null; }

/* ------------------------------------------------------------------ *
 * Graphics                                                            *
 * ------------------------------------------------------------------ */

/* The swatch for the lettering, drawn rather than loaded from assets/. */
const TEXT_THUMB = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="150" height="150">'
  + '<rect width="150" height="150" fill="#cfcdc6"/>'
  + '<g font-family="Arial,Helvetica,sans-serif" font-weight="bold" font-size="33"'
  + ' text-anchor="middle" fill="#000">'
  + '<text x="75" y="68">BOARD</text><text x="75" y="104">TITLE</text></g></svg>');

export function assetUrl(file) {
  if (file === TEXT_FILE) return TEXT_THUMB;
  return ASSET_DIR + file + '.png';
}
