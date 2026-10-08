// The map ("world"): cells, class records, stone/item/floor placement, links, animation rings, shadows.
'use strict';
(function (E) {
  const { fix } = E;

  // Map flag bits (MAP cell +0)
  const F_TOP = 1, F_BOTTOM = 2, F_LEFT = 4, F_RIGHT = 8, F_KIND2 = 16, F_GUARD = 128;

  // ---------------------------------------------------------------------------------------
  // Animation rings (ANIMQ G34656 for stones, G343ec for items): ring n holds n sub-lists; every
  // frame each ring advances to its next sub-list and steps the objects in it, so an object
  // enqueued with speed n steps once every n frames.
  class AnimRings {
    constructor() {
      this.rings = [null];
      this.phase = [0];
      for (let n = 1; n <= 10; n++) { this.rings.push(Array.from({ length: n }, () => [])); this.phase.push(0); }
    }
    remove(obj) {
      if (obj.ringList) {
        const l = obj.ringList, i = l.indexOf(obj);
        if (i >= 0) l.splice(i, 1);
        obj.ringList = null;
      }
    }
    // P9bcc + P9c06: scan the ring's heads starting at the one processed next; the LAST head with
    // the minimal count wins (cmp/bcs = "<=") -> with an empty ring the first step comes n frames
    // later. Objects are inserted at the front of the head's list.
    enqueue(obj, speed) {
      this.remove(obj);
      speed = Math.max(1, Math.min(10, speed | 0));
      const r = this.rings[speed];
      let best = null;
      for (let k = 1; k <= speed; k++) {
        const l = r[(this.phase[speed] + k) % speed];
        if (!best || l.length <= best.length) best = l;
      }
      best.unshift(obj);
      obj.ringList = best;
    }
    // Pbc88: each ring advances to its next head and steps its objects front to back (newest
    // first). The successor is fetched before the step; iteration stops if it left the list.
    tick() {
      for (let n = 1; n <= 10; n++) {
        this.phase[n] = (this.phase[n] + 1) % n;
        const l = this.rings[n][this.phase[n]];
        let obj = l[0];
        while (obj) {
          const next = l[l.indexOf(obj) + 1];
          if (obj.step) obj.step(obj);
          if (!next || next.ringList !== l) break;
          obj = next;
        }
      }
    }
  }

  // An animated object attached to a map cell (stone object SOBJ / item object IOBJ).
  class CellObj {
    constructor(world, cell, cls, layer) {
      this.world = world; this.cell = cell; this.cls = cls; this.layer = layer; // 'stone' | 'item'
      this.frames = null; this.index = 0; this.step = null; this.endCb = endPark;
      this.ringList = null; this.link = null;
    }
    draw(sprite) {
      if (this.layer === 'stone') this.world.stoneSpr[this.cell] = sprite;
      else this.world.itemSpr[this.cell] = sprite;
    }
    rings() { return this.layer === 'stone' ? this.world.srings : this.world.irings; }
    park() { this.rings().remove(this); }          // @9f7e: move to the idle list
    // Anim_Start @9fcc (speed, loop, fwd, frames, obj): sets index/step/end callback ($1a), enqueues
    // and draws the start frame immediately. The end callback runs INSTEAD of the default (loop:
    // rewind, else park); callers that need a raw callback assign `endCb` after start() (as the
    // original writes $1a). `onEnd` (non-loop only) is a convenience: park, then onEnd(obj).
    start(frames, speed, loop, fwd, onEnd) {
      this.frames = frames;
      if (fwd) { this.index = 0; this.step = stepFwd; this.endCb = loop ? endRewind : endPark; }
      else { this.index = frames.length - 1; this.step = stepBwd; this.endCb = loop ? endRewindBwd : endPark; }
      if (onEnd && !loop) this.endCb = (o) => { o.park(); onEnd(o); };
      this.rings().enqueue(this, speed);
      this.draw(frames[this.index]);
    }
    // Anim_Park @9fb2 (speed, stepproc, obj): enqueue with a custom step procedure, no drawing
    tickWith(speed, proc) { this.step = proc; this.rings().enqueue(this, speed); }
  }
  // end callbacks @9f62 / @9f68 / @9f7e
  function endRewind(o) { o.index = 0; }
  function endRewindBwd(o) { o.index = o.frames.length - 1; }
  function endPark(o) { o.park(); }
  // @9eea: index+1; at the list end: index-1, call the end callback; if it changed the index,
  // draw the (possibly new) list at the new index (repeating the end handling if needed)
  function stepFwd(o) {
    o.index++;
    for (;;) {
      if (o.index < o.frames.length) { o.draw(o.frames[o.index]); return; }
      o.index--;
      const old = o.index;
      o.endCb(o);
      if (o.index === old) return;
    }
  }
  // @9f26: index-1; below 0: index 0, call the end callback; if it changed the index, step again
  function stepBwd(o) {
    for (;;) {
      o.index--;
      if (o.index >= 0) { o.draw(o.frames[o.index]); return; }
      o.index = 0;
      o.endCb(o);
      if (o.index === 0) return;
    }
  }

  // ---------------------------------------------------------------------------------------
  // Floor classes (P20644). T/S are the slope strengths from the script command g(a)(b).
  function defineFloors(S) {
    const T = fix(S.g1), Sx = fix(S.g2);
    const f97 = 0xf851, f1 = 0x10000;
    const C = (sprite, fric, fx = 0, fy = 0) => ({ type: 1, sprite, fric, fx, fy });
    const F = (sprite, fric, r1, r2, r3, r4, flag = 0) =>
      ({ type: 2, sprite, fric, flag, bx: r1, by: r2, dx: Math.trunc((r3 - r1) / 32), dy: Math.trunc((r4 - r2) / 32) });
    return [
      C(0, f1), C(7, f97), C(33, f97), C(6, f97), C(8, f97),
      F(95, f97, 0, Sx, 0, 0), F(115, f97, 0, 0, 0, -Sx), F(116, f97, Sx, 0, 0, 0), F(117, f97, 0, 0, -Sx, 0),
      F(56, f97, Sx, Sx, 0, 0), F(57, f97, 0, Sx, -Sx, 0), F(76, f97, Sx, 0, 0, -Sx), F(77, f97, 0, 0, -Sx, -Sx),
      F(96, f97, Sx, Sx, 0, 0, 1), F(98, f97, Sx, 0, 0, -Sx, 4), F(97, f97, 0, Sx, -Sx, 0, 2), F(99, f97, 0, 0, -Sx, -Sx, 3),
      F(95, f97, -T, Sx, -T, 0), F(115, f97, -T, 0, -T, -Sx), F(95, f97, T, Sx, T, 0), F(115, f97, T, 0, T, -Sx),
      F(116, f97, Sx, -T, 0, -T), F(117, f97, 0, -T, -Sx, -T), F(116, f97, Sx, T, 0, T), F(117, f97, 0, T, -Sx, T),
      C(7, f97, 0, -T), C(7, f97, 0, T), C(7, f97, -T, 0), C(7, f97, T, 0),
      C(85, f1), C(86, f1), C(87, f1), C(88, f1),
      C(216, 0xe666), C(217, 0xe666), C(218, 0xe666), C(219, 0xe666),
      C(0, f97), C(105, f97), C(107, f97), C(108, f97),
      C(106, 0xfc28), C(106, 0xfc28, 0, fix(0.4)), C(7, 0xfeb8, 0, fix(0.2)),
      C(74, f97), C(480, f97), C(448, f97), C(449, f97),
      C(50, f97), C(51, f97), C(52, f97), C(53, f97), C(54, f97),
      C(80, f1), C(81, f1), C(82, f1), C(83, f1), C(84, f1),
    ];
  }
  const NOSTEER_FIRST = 53, NOSTEER_LAST = 57;

  // Shadow pattern table @b5e0 (index = 16*v(left) + 4*v(upleft) + v(up)), -1 = no shadow
  const SHADOWTAB = [-1, 6, 4, -1, 3, 0, 0, -1, 3, 0, 0, 0, -1, -1, -1, -1,
    7, 2, 8, -1, 1, 2, 2, -1, 1, 2, 2, 2, 1, 2, 2, 2,
    5, 9, 10, -1, 1, 2, 2, -1, 1, 2, 2, -1, -1, -1, -1, -1];

  // ---------------------------------------------------------------------------------------
  class World {
    constructor(game, L) {
      this.game = game;
      this.L = L;
      this.W = L.w; this.H = L.h; this.n = L.w * L.h;
      const n = this.n;
      this.flags = new Uint8Array(n);
      this.floor = new Uint8Array(n);
      this.stone = new Uint8Array(n);
      this.item = new Uint8Array(n);
      this.kstate = new Uint8Array(n);        // kind-2 stone state (MAP +5)
      this.sobj = new Array(n).fill(null);
      this.iobj = new Array(n).fill(null);
      this.stoneSpr = new Int16Array(n).fill(-1);
      this.itemSpr = new Int16Array(n).fill(-1);
      this.shadow = new Int8Array(n).fill(-1);
      this.srings = new AnimRings();
      this.irings = new AnimRings();
      this.links = L.links;
      this.ticks = [];                         // per-frame tick objects (magnets)
    }

    // class records are created per level (counts, single-instance cells, runtime params)
    defineClasses(S) {
      this.S = S;
      this.floors = defineFloors(S);
      this.scls = E.STONES.map((d) => d && { def: d, id: d.id, count: 0, cell: -1 });
      this.icls = E.ITEMS.map((d) => d && { def: d, id: d.id, count: 0, cell: -1 });
      // script dependent item parameters (read once at class definition)
      // only the big dent (10) reads the script's T; the big hill (22) is defined with a constant -0.4
      this.icls[10].factor = fix(S.T / 7);
      // oil stain (53): SPR(RandRange(18,19),14), rolled once per level at class definition (P1ec8e)
      this.icls[53].sprite = 20 * 14 + this.game.rng.range(0x12, 0x13);
      for (const c of this.icls) if (c && c.factor === undefined && c.def.factor !== undefined) c.factor = c.def.factor;
      this.icls[25].strengthStep = fix(S.m);
      // oxyd look (script G1): closed sprite and open/close animation
      this.oxydFrames = S.G1 ? [127, 128, 129, 130, 131] : [160, 161, 162, 163, 164, 165];
      this.oxydClosed = this.oxydFrames[0];
    }

    cellXY(c) { return [c % this.W, Math.floor(c / this.W)]; }
    cellCentre(c) { const [x, y] = this.cellXY(c); return [x * 32 + 15, y * 32 + 15]; }

    // P160c0: neighbour in direction d (1..8: E, SE, S, SW, W, NW, N, NE; 0 = itself), -1 at the border
    neighbour(c, d) {
      const fl = this.flags[c];
      const dirs = [[0, 0], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
      const [dx, dy] = dirs[d];
      if (dx < 0 && (fl & F_LEFT)) return -1;
      if (dx > 0 && (fl & F_RIGHT)) return -1;
      if (dy < 0 && (fl & F_TOP)) return -1;
      if (dy > 0 && (fl & F_BOTTOM)) return -1;
      return c + dy * this.W + dx;
    }
    // P16048: neighbour by contact-code direction (1 up, 2 down, 4 left, 8 right)
    neighbourCode(c, code) {
      return this.neighbour(c, { 1: 7, 2: 3, 4: 5, 8: 1 }[code]);
    }

    // ---- map construction (Pcdee) ----
    build() {
      const { W, H, L } = this;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = y * W + x;
        let f = 0;
        if (y === 0) f |= F_TOP;
        if (y === H - 1) f |= F_BOTTOM;
        if (x === 0) f |= F_LEFT;
        if (x === W - 1) f |= F_RIGHT;
        this.flags[c] = f;
      }
      for (let c = 0; c < this.n; c++) {
        this.setStone(L.stones[c], c);
        this.setItem(L.items[c], c);
        this.setFloor(L.floors[c], c);
      }
    }

    setFloor(id, c) {
      if (id >= this.floors.length) id = 0;
      this.floor[c] = id;
    }

    // ---- stones (P_SetStone @b938) ----
    setStone(id, c) {
      const old = this.stone[c];
      this.flags[c] &= ~F_KIND2;
      if (old) {
        const r = this.scls[old];
        r.count--; r.cell = -1;
        E.Stones.onRemove(this, r, c);
      }
      this.sobj[c] = null;
      this.stone[c] = id;
      let ok = true;
      if (id) {
        const r = this.scls[id];
        if (!r) { this.stone[c] = 0; this.stoneSpr[c] = -1; this.updateShadows(c); return; }
        r.count++;
        if (r.def.kind === 2) this.flags[c] |= F_KIND2;
        if (r.def.unique && r.cell >= 0) this.setStone(0, r.cell);
        r.cell = -1;
        ok = E.Stones.onSet(this, r, c);
        if (ok && r.def.unique) r.cell = c;
      }
      if (!id || !ok) {
        this.flags[c] &= ~F_KIND2;
        this.stone[c] = 0; this.sobj[c] = null; this.stoneSpr[c] = -1;
      }
      this.updateShadows(c);
    }

    // ---- items (P_SetItem @bac6) ----
    setItem(id, c) {
      const old = this.item[c];
      if (old) {
        const r = this.icls[old];
        r.count--; r.cell = -1;
        E.Items.onRemove(this, r, c);
      }
      this.iobj[c] = null;
      this.item[c] = id;
      let ok = true;
      if (id) {
        const r = this.icls[id];
        if (!r) { this.item[c] = 0; this.itemSpr[c] = -1; return; }
        r.count++;
        if (r.def.unique && r.cell >= 0) this.setItem(0, r.cell);
        r.cell = -1;
        ok = E.Items.onSet(this, r, c);
        if (ok && r.def.unique) r.cell = c;
      }
      if (!id || !ok) { this.item[c] = 0; this.iobj[c] = null; this.itemSpr[c] = -1; }
    }

    newObj(c, cls, layer) {
      const o = new CellObj(this, c, cls, layer);
      if (layer === 'stone') this.sobj[c] = o; else this.iobj[c] = o;
      return o;
    }

    // SwapStones @b65e (pushing, oxyd shuffle): swap stone id, object and kind-2 state, no handlers
    swapStones(a, b) {
      if (a === b || a < 0 || b < 0) return;
      const sa = this.stone[a], sb = this.stone[b];
      const ka = sa ? this.scls[sa].def.kind : 0, kb = sb ? this.scls[sb].def.kind : 0;
      if (!E.Stones.swappable(ka) || !E.Stones.swappable(kb)) return;
      this.stone[a] = sb; this.stone[b] = sa;
      const oa = this.sobj[a], ob = this.sobj[b];
      this.sobj[a] = ob; this.sobj[b] = oa;
      if (ob) ob.cell = a;
      if (oa) oa.cell = b;
      // map +4/+5 word (object index / kind-2 state) moves; the flags byte (+0, kind-2 bit4) does
      // NOT (asm b6ea..b702): a pushed one-way stone loses its one-way collision (solid box) and
      // the old cell keeps bit4 until the next P_SetStone there.
      const t = this.kstate[a]; this.kstate[a] = this.kstate[b]; this.kstate[b] = t;
      const p = this.stoneSpr[a]; this.stoneSpr[a] = this.stoneSpr[b]; this.stoneSpr[b] = p;
      if (sa && this.scls[sa].def.unique) this.scls[sa].cell = b;
      if (sb && this.scls[sb].def.unique) this.scls[sb].cell = a;
      this.updateShadows(a); this.updateShadows(b);
    }

    // ---- floor shadows of stones (Pb50c / Pb55c) ----
    shadowVal(c) {
      if (c < 0) return 0;
      const s = this.stone[c];
      return s ? this.scls[s].def.shadow : 0;
    }
    shadowCell(c) {
      if (c < 0 || c >= this.n) return;
      const s = this.stone[c];
      if (s && this.scls[s].def.shadow) { this.shadow[c] = SHADOWTAB[17]; return; } // @b596: code $11 -> 2
      const fl = this.flags[c];
      let code = 0;
      if (!(fl & F_LEFT)) {
        code += 16 * this.shadowVal(c - 1);
        if (!(fl & F_TOP)) code += 4 * this.shadowVal(c - 1 - this.W);
      }
      if (!(fl & F_TOP)) code += this.shadowVal(c - this.W);
      this.shadow[c] = code < SHADOWTAB.length ? SHADOWTAB[code] : -1;
    }
    updateShadows(c) {
      this.shadowCell(c);
      const fl = this.flags[c];
      if (!(fl & F_RIGHT)) this.shadowCell(c + 1);
      if (!(fl & F_BOTTOM)) {
        this.shadowCell(c + this.W);
        if (!(fl & F_RIGHT)) this.shadowCell(c + this.W + 1);
      }
    }

    // ---- links (G2915c) ----
    // Link_InitAll @15756: call handler A of every link source with its link record
    initLinks() {
      for (const rec of this.links) {
        const isItem = !!(rec.src & 0x2000), c = rec.src & 0x1fff;
        if (c >= this.n) continue;
        if (isItem) E.Items.handlerA(this, c, rec); else E.Stones.handlerA(this, c, rec);
      }
    }
    // Link_Broadcast @158ca
    broadcast(rec, value, cell) {
      if (!rec || cell < 0 || cell >= this.n) return;
      if (this.flags[cell] & F_GUARD) return;
      this.flags[cell] |= F_GUARD;
      for (const d of rec.dst) this.sendTo(d, value);
      this.flags[cell] &= ~F_GUARD;
    }
    // Link_SendNth @1581e (k is 1-based)
    sendNth(rec, k, value, cell) {
      if (!rec || cell < 0 || cell >= this.n || k < 1 || k > rec.dst.length) return;
      if (this.flags[cell] & F_GUARD) return;
      this.flags[cell] |= F_GUARD;
      this.sendTo(rec.dst[k - 1], value);
      this.flags[cell] &= ~F_GUARD;
    }
    sendTo(d, value) {
      const isItem = !!(d & 0x2000), c = d & 0x1fff;
      if (c >= this.n) return;
      this.trigger(value, isItem, c);
    }
    // Link_Trigger @1598a: call handler B of the stone/item at cell
    trigger(value, isItem, c) {
      if (c < 0 || c >= this.n) return;
      if (isItem) E.Items.handlerB(this, c, value); else E.Stones.handlerB(this, c, value);
    }

    tickAnimations() {
      this.srings.tick();
      this.irings.tick();
    }
  }

  Object.assign(E, { World, AnimRings, CellObj, animStepFwd: stepFwd, animStepBwd: stepBwd, F_TOP, F_BOTTOM, F_LEFT, F_RIGHT, F_KIND2, F_GUARD, NOSTEER_FIRST, NOSTEER_LAST });
})(window.ESPRIT = window.ESPRIT || {});
