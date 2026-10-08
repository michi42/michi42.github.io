// Item kinds (engine), item procedures and the inventory.
'use strict';
(function (E) {
  const I = {};
  const G = (w) => w.game;
  const { fixMul } = E;

  // Fire-proof / unsafe item sets
  const FIREPROOF = new Set([9, 10, 12, 13, 22, 26, 27, 60, 61, 62, 63, 66, 67, 68, 69, 70, 71]);
  const SEEDABLE = new Set([0, 11, 12, 13, 27]);
  I.RESPAWN_BAD = new Set([67, 66, 68, 26, 9, 70, 71, 60, 61, 62]);
  I.VORTEX_UNSAFE = I.RESPAWN_BAD;

  // ---------------------------------------------------------------------------------------------
  I.onSet = function (w, r, c) {
    const d = r.def;
    switch (d.kind) {
      case 2: w.itemSpr[c] = r.sprite !== undefined ? r.sprite : d.sprite; return true;   // r.sprite: item 53 (random)
      case 3: w.itemSpr[c] = d.sprite; return true;
      case 4: {                                                  // magnet @17896
        const o = w.newObj(c, r, 'item');
        o.strength = 0; magnetSet(o);
        return true;
      }
      case 6: {                                                  // vortex @17ad2
        const o = w.newObj(c, r, 'item');
        o.open = !!d.open; vortexDraw(o);
        return true;
      }
      case 8: {                                                  // collectible
        if (d.frames) { const o = w.newObj(c, r, 'item'); o.start(d.frames, d.period, true, true, null); }
        else w.itemSpr[c] = d.sprite;
        return true;
      }
      case 9: {                                                  // animated @17206
        const o = w.newObj(c, r, 'item');
        if (d.animate) ik9Start(w, c); else o.draw(d.sprite);
        return true;
      }
      case 10: { w.newObj(c, r, 'item'); w.itemSpr[c] = -1; return true; }
    }
    w.itemSpr[c] = -1;
    return true;
  };

  I.onRemove = function (w, r, c) {
    const o = w.iobj[c];
    if (o) { o.park(); const k = w.ticks.indexOf(o); if (k >= 0) w.ticks.splice(k, 1); }
    w.itemSpr[c] = -1;
  };

  function ik9Start(w, c) {                                      // IK9_StartAnim @1718c
    const o = w.iobj[c]; if (!o) return;
    const d = o.cls.def;
    o.start(d.frames, d.period, d.loop, true, d.loop ? null : (ob) => {
      G(w).hit = Object.assign({}, G(w).hit, { cell: ob.cell });
      callProc(w, d.procB, ob.cell, null);
    });
  }
  function ik9Stop(w, c) { const o = w.iobj[c]; if (!o) return; o.park(); o.draw(o.cls.def.sprite); }

  // ---- magnet (kind 4) ----
  function magnetSet(o) {
    const w = o.world, d = o.cls.def;
    const k = w.ticks.indexOf(o);
    if (o.strength !== 0) {
      o.frames = d.frames; o.index = 0; o.draw(d.frames[0]); o.cnt = d.delay;
      if (k < 0) w.ticks.push(o);
    } else {
      o.draw(d.sprite);
      if (k >= 0) w.ticks.splice(k, 1);
    }
  }
  const abs32 = (v) => (v < 0 ? -v : v) | 0;                     // neg.l (0x80000000 stays)
  I.magnetTick = function (o) {                                  // @175e8, every frame (ring 1)
    const w = o.world, g = G(w), d = o.cls.def;
    if (--o.cnt <= 0) { o.cnt = d.delay; o.index = (o.index + 1) % o.frames.length; o.draw(o.frames[o.index]); }
    const [cx, cy] = w.cellCentre(o.cell);
    const sHi = o.strength >> 16;                                  // tst.w $2a(obj)
    for (const a of g.actors) {
      if (!g.inSet(d.forceSet, a.index) || !a.active) continue;
      const k = (abs32(a.charge) + abs32(o.strength)) >>> 0;     // add.l, unsigned dividend
      if (k === 0) continue;
      const dx = E.i16((a.x >> 16) + (a.offx >> 16) - cx), dy = E.i16((a.y >> 16) + (a.offy >> 16) - cy);
      const r2 = dx * dx + dy * dy;
      let q;
      if (r2 < 0x10000) {
        if (r2 === 0) continue;
        q = Math.floor(k / r2);
        if (q > 0xffff) q = k & 0xffff;                            // divu overflow: d7 unchanged
      } else {
        q = Math.floor((k >>> 16) / (r2 >>> 16 || 1));
        if (q & 0x8000) q = 0x7fff;
      }
      q = E.i16(q);                                                // muls.w uses the low word, signed
      // attract (ax -= dx*q) unless polarity flag and charge/strength integer parts have the same sign
      const cHi = a.charge >> 16;
      const repel = a.polarity && cHi !== 0 && (cHi > 0 ? sHi > 0 : sHi < 0);
      const s = repel ? 1 : -1;
      a.fx = E.i32(a.fx + s * dx * q); a.fy = E.i32(a.fy + s * dy * q);
    }
  };

  // ---- vortex (kind 6) ----
  function vortexDraw(o) {
    const d = o.cls.def;
    if (o.open) o.start(d.frames, d.period, true, true, null);
    else { o.park(); o.draw(d.closed); }
  }

  // ---------------------------------------------------------------------------------------------
  // Item under an actor (Pc422 first loop): kind dispatch
  I.onActor = function (w, c, a) {
    const id = w.item[c]; if (!id) return;
    const r = w.icls[id], d = r.def, g = G(w);
    if (!g.inSet(d.set, a.index)) return;
    g.hit = { actor: a.index, cell: c, item: id };
    switch (d.kind) {
      case 2: callProc(w, d.proc, c, a); break;
      case 3: dentForce(w, r, a); break;
      case 6: vortexPull(w, c, a); break;
      case 8: pickUp(w, r, c, a); break;
      case 9: callProc(w, d.procA, c, a); break;
      case 10: {
        const o = w.iobj[c];
        if (a.cellChanged && o) w.broadcast(o.link, d.value, c);
        break;
      }
    }
  };

  function dentForce(w, r, a) {                                  // kind 3 @17554
    const d = r.def;
    let dx = (a.x & 0x1fffff) - 0x100000, dy = (a.y & 0x1fffff) - 0x100000;
    const ix = dx >> 16, iy = dy >> 16;
    if (ix * ix + iy * iy > d.r2) return;
    const h = d.half * 65536;
    const gfun = (v) => { let t = v - h; if (t >= 0) t = -t; return t + h; };
    dx = gfun(dx); dy = gfun(dy);
    a.fx = E.i32(a.fx - fixMul(dx, r.factor));
    a.fy = E.i32(a.fy - fixMul(dy, r.factor));
  }

  function vortexPull(w, c, a) {                                 // @179c4
    const o = w.iobj[c]; if (!o || !o.open) return;
    const g = G(w);
    g.vortexLink = o.link;
    const dx = (a.x & 0x1fffff) - 0x100000, dy = (a.y & 0x1fffff) - 0x100000;
    const ix = dx >> 16, iy = dy >> 16, d2 = ix * ix + iy * iy;
    if (d2 > 200) return;
    a.vx = E.fixMulFrac(a.vx, 0xf000); a.vy = E.fixMulFrac(a.vy, 0xf000);
    a.fx = E.i32(a.fx - fixMul(dx, 0x1000)); a.fy = E.i32(a.fy - fixMul(dy, 0x1000));
    if (d2 <= 16 && Math.abs(a.vx) <= 0x2000 && Math.abs(a.vy) <= 0x2000) callProc(w, o.cls.def.caught, c, a);
  }

  function pickUp(w, r, c, a) {                                  // @173a0
    const g = G(w);
    if (!a.hasInventory) return;
    const x = (a.x >> 16) & 31, y = (a.y >> 16) & 31;
    if (!E.itemMaskHit(w.itemSpr[c], x, y)) return;
    if (g.inv.free() === 0) return;
    w.setItem(0, c);
    g.inv.insertFront(r.def.code);
  }

  // ---------------------------------------------------------------------------------------------
  I.handlerA = function (w, c, rec) {
    const id = w.item[c]; if (!id) return;
    const d = w.icls[id].def, o = w.iobj[c];
    if (d.A === 'P16f30') { if (o) o.link = rec; }
    else if (d.A === 'P1bfa2' || d.A === 'P1c012' || d.A === 'P1c082') {
      const code = { P1bfa2: 0x14, P1c012: 0x15, P1c082: 0x16 }[d.A];
      for (const t of rec.dst) {
        const tc = t & 0x1fff;
        const so = w.sobj[tc];
        if (so && so.cls.def.kind === 6) so.guard = () => G(w).inv.get(0) === code;
      }
    }
  };

  I.handlerB = function (w, c, v) {
    const id = w.item[c]; if (!id) return;
    const d = w.icls[id].def, o = w.iobj[c], g = G(w);
    switch (d.B) {
      case 'P1c12a': if (v >= 1) w.setItem(22, c); break;       // big dent -> big hill
      case 'P1c160': if (v <= 0) w.setItem(10, c); break;       // big hill -> big dent
      case 'P1c0f2': g.playSound('ESZISCH', 100); w.setItem(66, c); break;
      case 'P178f6': if (o) { o.open = v !== 0; vortexDraw(o); } break;
      case 'P177aa': if (o) { o.strength = E.i32(o.strength + (v !== 0 ? 1 : -1) * w.icls[id].strengthStep); magnetSet(o); } break;
      case 'P17aee': if (o) w.broadcast(o.link, d.value, g.hit ? g.hit.cell : c); break;
      case 'P1c2be': if (v === 0) ik9Stop(w, c); else ik9Start(w, c); break;
    }
  };

  // ---------------------------------------------------------------------------------------------
  function callProc(w, name, c, a) {
    if (!name) return;
    const f = PROCS[name];
    if (f) f(w, c, a);
  }

  function crackStep(w, c) {                                     // P19812
    const g = G(w), S = g.S;
    if (c < 0 || c >= w.n) return;
    let fl = w.floor[c];
    if (S.R3 && !(fl >= 29 && fl <= 32)) fl = 0;
    if (fl === 0 || (w.flags[c] & 0xf)) return;
    if (g.rng.range(0, S.R1) !== 0) return;
    const next = { 0: 11, 11: 12, 12: 13, 13: 27, 27: 65 }[w.item[c]];
    if (next === undefined) return;
    w.setItem(next, c);
    g.playSound('ESZISCH', 100);
    if (next === 65 && w.stone[c]) { g.playSound('ESCRASH', 100); w.setStone(65, c); }
  }

  function fireIgnite(w, n) {                                    // P194ea
    const g = G(w);
    if (n <= 0 || n >= w.n) return;
    const it = w.item[n];
    if (!FIREPROOF.has(it) && (w.stone[n] === 0 || (w.flags[n] & E.F_KIND2))) {
      g.playSound('ESZISCH', 20); w.setItem(66, n);
    } else if (it === 9) w.setItem(70, n);
  }

  const PROCS = {
    P19abe(w, c, a) {                                            // crack: player just entered
      if (!a.cellChanged) return;
      crackStep(w, c);
      for (let d = 1; d <= 8; d++) { const n = w.neighbour(c, d); if (n !== 0) crackStep(w, n); }
    },
    P1ac74(w, c, a) { G(w).actorFall(a.index); },                // abyss
    P1af52(w) { const g = G(w); if (g.playerFig) { g.playerFig.oil = 1; g.playerDamping(); } },
    P1ad44(w, c) {                                               // fire touched
      const g = G(w);
      if (!g.playerProtected()) { g.playerShatter(); return; }
      if (g.inv.get(0) === 0x17 && (w.item[c] === 66 || w.item[c] === 67)) w.setItem(68, c);
    },
    P196b6(w, c) { w.setItem(67, c); },
    P1960c(w, c) {                                               // burning fire cycle
      const g = G(w);
      if (g.rng.range(0, g.S.B1) === 0) for (let d = 1; d <= 8; d++) { const n = w.neighbour(c, d); if (n > 0) fireIgnite(w, n); }
      ik9Start(w, c);
      if (g.rng.range(0, g.S.B2) === 0) w.setItem(68, c);
    },
    P196dc(w, c) { w.setItem(69, c); },
    P197d8(w, c) { if (G(w).inv.get(0) === 0xc) w.setItem(0, c); },  // ash + brush
    P19b50(w, c) {                                               // dynamite explodes
      const g = G(w);
      g.playSound('ESCRASH', 100);
      w.setItem(71, c);
      for (let d = 1; d <= 8; d++) {
        const n = w.neighbour(c, d);
        if (n <= 0) continue;
        // the coin is tossed whenever the flags byte is 0 / the item id is < 32, even for an empty cell
        const s = w.stone[n];
        if (w.flags[n] === 0 && g.rng.range(0, 1) === 0 && (s === 21 || s === 23 || s === 20)) w.setStone(65, n);
        const it = w.item[n];
        if (it === 9) w.setItem(70, n);
        else if (it < 32 && g.rng.range(0, 1) === 0 && E.CODE2ITEM.slice(1, 26).includes(it)) w.setItem(0, n);
      }
    },
    P1aca0(w) { G(w).playerShatter(); },                         // explosion touched
    P19d68(w, c) { w.setItem(10, c); },                          // crater
    P18fb8(w, c) {                                               // seedling grown
      const g = G(w);
      w.setStone(24, c);
      if (g.playerOverlapsCell(c)) g.playerShatter();
    },
    P19702(w, c) {                                               // crumbling floor done
      const g = G(w);
      if (g.S.R2) w.setItem(26, c);
      else { w.setItem(63, c); w.setFloor(53 + g.rng.range(0, 3), c); }   // floors G3a116..G3a11c
    },
    P19d8e(w, c, a) { G(w).vortexEnter(a.index, c); },
  };
  I.PROCS = PROCS;

  // ---------------------------------------------------------------------------------------------
  // Inventory (INV_New @163d8): 13 slots of inventory codes, kept packed at the front.
  class Inventory {
    constructor(game) { this.game = game; this.slots = new Array(13).fill(0); this.silent = false; this.dirty = true; }
    count() { return this.slots.filter((x) => x).length; }
    free() { return 13 - this.count(); }
    get(i) { return this.slots[i] || 0; }
    contains(code) { return this.slots.includes(code); }
    clear() { this.slots.fill(0); this.dirty = true; }
    compact() { const s = this.slots.filter((x) => x); while (s.length < 13) s.push(0); this.slots = s; }
    added(code) { this.dirty = true; if (!this.silent) this.game.invOnAdd(code); }
    append(code) {
      const i = this.slots.indexOf(0);
      if (i < 0) { this.dirty = true; return; }
      this.slots[i] = code; this.added(code);
    }
    insertFront(code) {
      if (this.slots.indexOf(0) < 0) return;
      this.slots.pop(); this.slots.unshift(code); this.added(code);
    }
    popFirst() { const c = this.slots[0]; this.slots[0] = 0; this.compact(); this.dirty = true; return c; }
    removeAt(i) { this.slots[i] = 0; this.compact(); this.dirty = true; }
    removeOne(code) { const i = this.slots.indexOf(code); if (i >= 0) this.removeAt(i); }
    removeAll(code) { if (this.slots.includes(code)) { this.slots = this.slots.map((x) => (x === code ? 0 : x)); this.compact(); this.dirty = true; } }
  }
  I.Inventory = Inventory;
  I.FIREPROOF = FIREPROOF;
  I.SEEDABLE = SEEDABLE;
  I.ik9Start = ik9Start;
  E.Items = I;
})(window.ESPRIT = window.ESPRIT || {});
