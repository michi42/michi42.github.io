// Actors (figures) and the marble physics: Phys_Velocity (Pc422) and Phys_Move (Pc724).
// All positions/velocities/forces are raw 16.16 integers, as in the original.
// Verified against emulator traces by tools/physcheck.js (free roll, wall, corner, slope, marble-marble
// collision, falling into a hole).
'use strict';
(function (E) {
  const { ONE, i32, i16, fixMulFrac, fixDamp } = E;
  const hi = (v) => v >> 16;
  const F_KIND2 = 16;                    // MAP flags bit 4: stone kind 2 (one-way / passable)

  // 68000 divs.w: 32/16 signed division; on overflow the destination register is left unchanged,
  // so the "quotient" word read afterwards is the low word of the dividend.
  function divs(p, q) {
    q = i16(q); p = i32(p);
    if (q === 0) return i16(p);          // (would be a divide-by-zero trap; cannot happen here)
    const r = Math.trunc(p / q);
    return r < -32768 || r > 32767 ? i16(p) : r;
  }

  class Actor {
    constructor(index) {
      this.index = index;
      this.active = false;
      this.proc = null;                  // per-frame procedure
      this.contact = new Array(8).fill(null);
      this.x = 0; this.y = 0; this.px = 0; this.py = 0;
      this.vx = 0; this.vy = 0; this.stepX = 0; this.stepY = 0;
      this.fx = 0; this.fy = 0; this.fric = 0; this.ix = 0; this.iy = 0;
      this.mass = 300; this.invMass = 218; this.vmax = 20 * ONE; this.kf = ONE; this.kb = ONE;
      // +60/+61/+62: every actor in the game is created with +61 = FALSE, so the long-range
      // actor-actor force (Pc422 @c5b4) never runs; charge/polarity are only used by magnets.
      this.charge = -3 * ONE; this.polarity = true; this.longRange = false; this.sticky = false;
      this.layer = 0;
      this.hitNow = false; this.hitLast = false; this.hitSub = false; this.hitMask = 0;
      this.cell = -1; this.prevCell = -1; this.cellChanged = false;
      this.material = 1;                 // +24: Pa9b8 sets 1 for every actor type
      this.hasInventory = false;
      this.offx = 0; this.offy = 0;      // +f4/+f8 (always 0: ActorShapeFromSprite passes 0,0)
      this.nx8 = 0; this.ny8 = 0;        // +108/+10c words: normal parts after the last exchange
      // rendering
      this.body = -1; this.shadow = -1; this.shadowDX = 4 * ONE; this.shadowDY = 4 * ONE;
      this.overlay = null;               // {shape, dx, dy} attachment (digit, umbrella)
      this.cx = 0; this.cy = 0;          // +118/+11c: centre after this actor's stone pass
    }
    setShape(size) {                     // ActorSetCircle @2472e (all actors are round in ESPRIT)
      const half = size >> 1, r = (size + 1) >> 1;
      const ox = hi(this.offx), oy = hi(this.offy);
      this.round = true;
      this.box = [ox - half, oy - half, ox + half, oy + half];
      this.half = half;
      this.r2x64 = (r * r * 64) & 0xffff;
    }
    setMass(m) { this.mass = m; this.invMass = m <= 1 ? ONE : Math.floor(ONE / m); }  // @244d2
  }

  // ---------------------------------------------------------------------------------------------
  class Physics {
    constructor(game) {
      this.g = game;
      this.contactX = 0; this.contactY = 0;   // G34828/G3482c: last contact point (sparks)
    }
    get w() { return this.g.world; }

    // SampleFloor (Pc346). The cell index is computed with 16-bit unsigned arithmetic like the
    // original (x beyond the right edge wraps into the next row); the actor is deactivated when the
    // index is beyond the map.
    sampleFloor(a) {
      const w = this.w;
      a.ix = 0; a.iy = 0;
      const cell = (((hi(a.y) & 0xffff) >>> 5) * w.W + ((hi(a.x) & 0xffff) >>> 5)) & 0xffff;
      a.cellChanged = cell !== a.cell;
      if (cell > w.n - 1) {
        // original: actor inactive, but it still stores the bogus cell and reads a floor from
        // memory beyond the map; we keep the last valid cell instead.
        a.active = false; a.hitNow = false; return;
      }
      a.prevCell = a.cell; a.cell = cell;
      a.hitNow = false;
      if (a.layer !== 0) { a.fric = 0; a.fx = 0; a.fy = 0; return; }
      const F = w.floors[w.floor[cell]];
      a.fric = F.fric;
      if (F.type === 1) { a.fx = F.fx; a.fy = F.fy; return; }
      const px = hi(a.x) & 31, py = hi(a.y) & 31;              // FloorH_Field @17ebe
      let fxo = true;
      if (F.flag === 1) fxo = !(py > px);
      else if (F.flag === 3) fxo = !(py < px);
      else if (F.flag === 2) fxo = !(px + py > 32);
      else if (F.flag === 4) fxo = !(px + py < 32);
      a.fx = fxo ? i32(px * F.dx + F.bx) : 0;
      a.fy = (F.flag === 0 || !fxo) ? i32(py * F.dy + F.by) : 0;
    }

    setPos(a, x, y) {                    // ActorSetPos @24488
      a.x = a.px = x; a.y = a.py = y;
      this.sampleFloor(a);
    }

    // Phys_Velocity (Pc422)
    velocity() {
      const g = this.g, acts = g.actors;
      // item under the actor (cell sampled in the previous frame), layer-0 actors only
      for (const a of acts) {
        if (!a.active || a.layer !== 0 || a.cell < 0) continue;
        E.Items.onActor(this.w, a.cell, a);
      }
      for (const a of acts) {
        if (!a.active) continue;
        a.fx = i32(a.fx + fixMulFrac(a.ix, a.invMass));
        a.fy = i32(a.fy + fixMulFrac(a.iy, a.invMass));
        let vx = fixDamp(i32(a.fx + a.vx), a.fric, a.kf);
        let vy = fixDamp(i32(a.fy + a.vy), a.fric, a.kf);
        vx = Math.max(-a.vmax, Math.min(a.vmax, vx));
        vy = Math.max(-a.vmax, Math.min(a.vmax, vy));
        a.vx = vx; a.vy = vy;
        a.stepX = vx >> 1; a.stepY = vy >> 1;
        a.hitMask = 0;
        this.sampleFloor(a);
        // (long-range force @c5b4 only for actors with +61 set: none in this game)
      }
    }

    // ---- stone collision helpers ----
    region(a, X, Y) {
      const x = hi(a.x) + hi(a.offx), y = hi(a.y) + hi(a.offy);
      let c = 0;
      if (x < X) c |= 4; else if (x > X + 31) c |= 8;
      if (y < Y) c |= 1; else if (y > Y + 31) c |= 2;
      return c;
    }
    // Coll_CornerCircle @ab4a: also stores the corner as contact point (even when it misses)
    cornerHit(a, kx, ky) {
      if (!a.round) return true;
      this.contactX = kx * ONE; this.contactY = ky * ONE;
      const dx = hi(i32(i32(kx * ONE - i32(a.x + a.offx)) * 8));
      const dy = hi(i32(i32(ky * ONE - i32(a.y + a.offy)) * 8));
      const d = dx * dx + dy * dy;
      return d < 0x10000 && d <= a.r2x64;
    }
    // pure side hits store the contact point on the stone edge (sic: +f4 used for both axes)
    sideHit(a, c, X, Y) {
      if (c === 4) { this.contactX = X * ONE; this.contactY = i32(a.y + a.offx); }
      else if (c === 8) { this.contactX = (X + 31) * ONE; this.contactY = i32(a.y - a.offx); }
      else if (c === 2) { this.contactX = i32(a.x - a.offx); this.contactY = (Y + 31) * ONE; }
      else { this.contactX = i32(a.x + a.offx); this.contactY = Y * ONE; }
      return true;
    }
    // hit test for one overlapped stone cell: table @c84a (0xaaa..0xae88) incl. one-way stones
    hitTest(a, cell, X, Y, c, oneWay) {
      if (!oneWay) {
        switch (c) {
          case 0: return true;                                   // contact point not updated
          case 1: case 2: case 4: case 8: return this.sideHit(a, c, X, Y);
          case 5: return this.cornerHit(a, X, Y);
          case 9: return this.cornerHit(a, X + 31, Y);
          case 6: return this.cornerHit(a, X, Y + 31);
          case 10: return this.cornerHit(a, X + 31, Y + 31);
        }
        return false;
      }
      const dir = this.w.kstate[cell];
      if (dir === 4) return false;
      const vx = a.vx, vy = a.vy;
      switch (c) {
        case 0: {                                                // entered through an edge?
          const px = hi(a.px) + hi(a.offx), py = hi(a.py) + hi(a.offy);
          if (dir === 2) return px < X;
          if (dir === 3) return px > X + 31;
          if (dir === 0) return py < Y;
          return py > Y + 31;
        }
        case 4: return dir === 2 && vx >= 0 && this.sideHit(a, c, X, Y);
        case 8: return dir === 3 && vx < 0 && this.sideHit(a, c, X, Y);
        case 1: return dir === 0 && vy >= 0 && this.sideHit(a, c, X, Y);
        case 2: return dir === 1 && vy < 0 && this.sideHit(a, c, X, Y);
        case 5: return ((dir === 0 && vy >= 0) || (dir === 2 && vx >= 0)) && this.cornerHit(a, X, Y);
        case 9: return ((dir === 0 && vy >= 0) || (dir === 3 && vx < 0)) && this.cornerHit(a, X + 31, Y);
        case 6: return ((dir === 1 && vy < 0) || (dir === 2 && vx >= 0)) && this.cornerHit(a, X, Y + 31);
        case 10: return ((dir === 1 && vy < 0) || (dir === 3 && vx < 0)) && this.cornerHit(a, X + 31, Y + 31);
      }
      return false;
    }
    // neighbour test of the corner bounces (b032 etc.): stone present, actor layer <= stone
    // height and not a kind-2 cell
    solid(a, n) {
      const w = this.w;
      if (n < 0 || n >= w.n) return false;
      const s = w.stone[n];
      if (!s) return false;
      return a.layer <= w.scls[s].def.maxLayer && !(w.flags[n] & F_KIND2);
    }
    flipX(a) { a.vx = i32(-a.vx); a.stepX = 0; }               // @ae8e / @ae98
    flipY(a) { a.vy = i32(-a.vy); a.stepY = 0; }               // @aea2 / @aeac
    bounceCorner(a, kx, ky) {                                    // Bounce_Corner @aeb6
      if (!a.round) {                                            // @af4c (position already reverted)
        const ox = Math.abs(i16(hi(a.x) - hi(a.px))), oy = Math.abs(i16(hi(a.y) - hi(a.py)));
        if (oy > ox) this.flipY(a); else this.flipX(a);
        return;
      }
      const nx = hi(i32(i32(kx * ONE - i32(a.x + a.offx)) * 8));
      const ny = hi(i32(i32(ky * ONE - i32(a.y + a.offy)) * 8));
      let n2 = i16(nx * nx + ny * ny);
      if (n2 === 0) n2 = 0x7fff;
      const vx8 = hi(i32(a.vx * 8)), vy8 = hi(i32(a.vy * 8));
      const dot = i16(i32(nx * vx8 + ny * vy8));
      const qx = divs(i32(i32(dot * nx) * 2), n2);
      a.vx = i32(a.vx - (i32(qx * ONE) >> 3));
      const qy = divs(i32(i32(dot * ny) * 2), n2);
      a.vy = i32(a.vy - (i32(qy * ONE) >> 3));
    }
    // Coll_PushAway @af82: step <= +12c (0.2 px) away from the point d ahead of the centre
    pushAway(a, dx, dy) {
      dx = i32(dx); dy = i32(dy);
      const sx = dx < 0, sy = dy < 0;
      dx = Math.abs(dx); dy = Math.abs(dy);
      while (dy > 0x3333 || dx > 0x3333) { dx = Math.floor(dx / 2); dy = Math.floor(dy / 2); }
      a.stepX = sx ? dx : -dx; a.stepY = sy ? dy : -dy;
    }
    // corner bounces @afe8 (5), @b064 (9), @b0e8 (6), @b16c (10)
    cornerBounce(a, cell, c, X, Y) {
      const W = this.w.W;
      const nv = (c === 5 || c === 9) ? cell - W : cell + W;     // stone's neighbour above/below
      const nh = (c === 5 || c === 6) ? cell - 1 : cell + 1;     // stone's neighbour left/right
      if (this.solid(a, nv)) { this.flipX(a); return; }
      if (this.solid(a, nh)) { this.flipY(a); return; }
      const kx = (c === 5 || c === 6) ? X : X + 31, ky = (c === 5 || c === 9) ? Y : Y + 31;
      this.bounceCorner(a, kx, ky);
      this.pushAway(a, kx * ONE - i32(a.x + a.offx), ky * ONE - i32(a.y + a.offy));
    }

    // stone pass of one sub-step (Pc724 0xc75e..0xcafc)
    stonePass(a) {
      const w = this.w, g = this.g, W = w.W;
      const x0 = (hi(a.x) + a.box[0]) >> 5, y0 = (hi(a.y) + a.box[1]) >> 5;
      const x1 = (hi(a.x) + a.box[2]) >> 5, y1 = (hi(a.y) + a.box[3]) >> 5;
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          // the original walks MAP memory linearly (no per-axis clipping): a column beyond the
          // right edge reads the first cell of the next row (but keeps X = cx*32)
          if (cx < 0 || cy < 0) continue;
          const cell = cy * W + cx;
          if (cell >= w.n) continue;
          const s = w.stone[cell];
          if (!s) continue;
          const r = w.scls[s], d = r.def;
          if (a.layer > d.maxLayer) continue;
          const X = cx * 32, Y = cy * 32;
          let c = this.region(a, X, Y);
          if (!this.hitTest(a, cell, X, Y, c, !!(w.flags[cell] & F_KIND2))) continue;
          if (!a.hitLast && g.addSpark) g.addSpark(this.contactX, this.contactY);   // Spark_Add @a1e0
          a.x = a.px; a.y = a.py; a.hitSub = true;
          c = this.region(a, X, Y);                              // G34822, from the reverted centre
          if (c === 4 || c === 8) this.flipX(a);
          else if (c === 1 || c === 2) this.flipY(a);
          else if (c === 5 || c === 9 || c === 6 || c === 10) this.cornerBounce(a, cell, c, X, Y);
          if (!a.hitLast) {                                      // fresh contact (none last frame)
            a.vx = fixDamp(a.vx, d.bounce, a.kb);
            a.vy = fixDamp(a.vy, d.bounce, a.kb);
            if (a.hitStone) a.hitStone(cell, s);                 // +6e (no-op for every actor)
            g.playMaterialSound(a.material, d.mat);
            if (g.inSet(d.hitSet, a.index)) E.Stones.onHit(w, r, cell, a.index, c);
            if (d.movable && g.inSet(d.pushSet, a.index)) this.tryPush(a, cell, c, d);
          }
          a.hitNow = true; a.hitLast = true;
          return;
        }
      }
    }

    // push attempt @ca5a: Push_Dir/Push_Target/Push_Do + Pb8fa
    tryPush(a, cell, c, d) {
      const axis = (c === 1 || c === 2) ? 1 : (c === 4 || c === 8) ? 2 : 0;
      if (!axis) return;
      const v = hi(axis === 1 ? a.vy : a.vx);                    // after reflection and damping
      const e = (((v * v) & 0xffff) * ((a.mass & 0xffff) >> 1)) >>> 3;
      if (e < ((d.pushThr & 0xffff) >>> 3)) return;
      const dir = { 1: 2, 2: 1, 4: 8, 8: 4 }[c];
      const t = this.w.neighbourCode(cell, dir);
      if (t >= 0 && this.w.stone[t] === 0) this.w.swapStones(t, cell);
    }

    // Coll_CircleCircle @c0a0 (a = moving actor, centre a.cx/a.cy from before its revert)
    circleCircle(a, b) {
      const dx = i16(hi(b.x) + hi(b.offx) - hi(a.cx)), dy = i16(hi(b.y) + hi(b.offy) - hi(a.cy));
      const rr = i16(a.half + b.half);
      if (dx * dx + dy * dy > rr * rr) return false;
      if (!(a.hitMask & (1 << b.index))) {
        a.hitMask |= 1 << b.index; b.hitMask |= 1 << a.index;
        const D = i16(dx * dx + dy * dy);
        if (D === 0) return false;
        const Va = [hi(i32(a.vx * 8)), hi(i32(a.vy * 8))], Vb = [hi(i32(b.vx * 8)), hi(i32(b.vy * 8))];
        const ma = i16(a.mass), mb = i16(b.mass), M = i16(ma + mb);
        if (a.sticky || b.sticky) {                              // @c2ea
          const vx = divs(ma * Va[0] + mb * Vb[0], M), vy = divs(ma * Va[1] + mb * Vb[1], M);
          a.vx = b.vx = i32(vx * ONE) >> 3; a.vy = b.vy = i32(vy * ONE) >> 3;
        } else {
          // normal / tangential parts (1/8 px words), b with (dx,dy) first, then a with (-dx,-dy)
          const part = (V, ex, ey) => {
            const p = i16(ex * V[0] + ey * V[1]);
            const nx = divs(p * ex, D), ny = divs(p * ey, D);
            return { nx, ny, tx: i16(V[0] - nx), ty: i16(V[1] - ny) };
          };
          const pb = part(Vb, dx, dy), pa = part(Va, i16(-dx), i16(-dy));
          const ex = (m1, m2, n1, n2) => divs(i32(i16(2 * m2) * n2 + i16(m1 - m2) * n1), M);
          a.nx8 = ex(ma, mb, pa.nx, pb.nx); b.nx8 = ex(mb, ma, pb.nx, pa.nx);
          a.ny8 = ex(ma, mb, pa.ny, pb.ny); b.ny8 = ex(mb, ma, pb.ny, pa.ny);
          a.vx = i32((a.nx8 + pa.tx) * ONE) >> 3; a.vy = i32((a.ny8 + pa.ty) * ONE) >> 3;
          b.vx = i32((b.nx8 + pb.tx) * ONE) >> 3; b.vy = i32((b.ny8 + pb.ty) * ONE) >> 3;
        }
      }
      a.x = a.px; a.y = a.py;                                    // only the moving actor reverts
      this.pushAway(a, i32(b.x + b.offx) - a.cx, i32(b.y + b.offy) - a.cy);
      return true;
    }

    // actor pass of one sub-step (0xcb00..0xcc26)
    actorPass(a) {
      const g = this.g;
      if (a.index === 7) return;                                 // quirk @cb0a: slot 7 never tests
      a.cx = i32(a.x + a.offx); a.cy = i32(a.y + a.offy);
      for (const b of g.actors) {
        if (b === a || !b.active || b.layer !== a.layer) continue;
        const lim = (a.half + b.half) * ONE;
        if (Math.abs(i32(b.x + b.offx) - a.cx) > lim || Math.abs(i32(b.y + b.offy) - a.cy) > lim) continue;
        let hit;
        if (a.round) hit = b.round ? this.circleCircle(a, b) : false;
        else hit = b.round;                                      // (box-box @c000: no box actors exist)
        if (hit) {
          // sound uses the normal parts stored by the last exchange of a and b (stale on re-contacts)
          const nn = a.nx8 * a.nx8 + a.ny8 * a.ny8 + b.nx8 * b.nx8 + b.ny8 * b.ny8;
          if (nn > 64) g.playMaterialSound(a.material, b.material);
          if (a.contact[b.index]) a.contact[b.index](a, b);
        }
      }
    }

    // Phys_Move (Pc724): two sub-steps; per actor: move, stone pass, actor pass
    move() {
      const acts = this.g.actors;
      for (let pass = 0; pass < 2; pass++) {
        for (const a of acts) {
          if (!a.active) continue;
          a.hitSub = false;
          a.px = a.x; a.py = a.y;
          a.x = i32(a.x + a.stepX); a.y = i32(a.y + a.stepY);
          this.stonePass(a);
          this.actorPass(a);
        }
      }
      for (const a of acts) a.hitLast = a.hitNow;
    }
  }

  E.Actor = Actor;
  E.Physics = Physics;
})(window.ESPRIT = window.ESPRIT || {});
