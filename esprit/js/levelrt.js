// Running level: GameInit / LevelSetup / hooks / figure procedures / end-of-level state machine.
'use strict';
(function (E) {
  const { ONE, fix, fixMul, i32 } = E;
  const hi = (v) => v >> 16;

  // figure types
  const T_FM = 1, T_FB = 3, T_FK = 4, T_FQ = 5;
  // FIG states
  const ST_ALIVE = 0, ST_FALL = 1, ST_GONE = 2, ST_SHATTER = 3, ST_DEAD = 4, ST_WIN = 5, ST_WON = 6,
    ST_APPEAR = 7, ST_TELE_IN = 8, ST_TELE_OUT = 9;

  class Level {
    constructor(game, num) {
      this.game = game;
      this.num = num;
      this.inv = game.inv;
      this.rng = game.rng;
      this.vbl = game.vbl;
      const L = E.loadLevel(num);
      this.L = L;
      // ---- GameInit: script pass 1, class definitions ----
      const S = E.scriptPass1(L.scriptBytes, num, game.language, game.codes);
      this.S = S;
      this.isMedit = !!S.IS_MEDIT;
      this.figs = [];
      this.actors = [];
      for (let i = 0; i < 8; i++) { this.actors.push(new E.Actor(i)); this.figs.push({ type: 0, state: 0, umbrella: 0, blink: 0 }); }
      this.sets = { ALL: 0xff, PLAYER: 0, B: 0, MARBLES: 0, BM: 0, NONE: 0, Q: 0, BMK: 0 };
      this.player = -1;
      this.hasPlayer = false;
      this.nMedit = 0;
      S.actors.forEach((a, i) => {
        const f = this.figs[i];
        Object.assign(f, { def: a });
        if (a.type === 'FB') {
          f.type = T_FB; this.player = i; this.hasPlayer = true;
          this.sets.PLAYER |= 1 << i; this.sets.MARBLES |= 1 << i; this.sets.BMK |= 1 << i;
        } else if (a.type === 'FM') {
          f.type = T_FM; this.nMedit++;
          this.sets.MARBLES |= 1 << i; this.sets.BMK |= 1 << i;
        } else if (a.type === 'FK') {
          f.type = T_FK;
          if (a.opensOxyd) this.sets.BMK |= 1 << i;
        } else if (a.type === 'FQ') {
          f.type = T_FQ;
          if (a.homeCell >= 0) this.sets.Q |= 1 << i;
        }
      });
      this.sets.B = this.sets.PLAYER; this.sets.BM = this.sets.MARBLES;
      if (this.player < 0) this.player = 0;
      // collision pairs: everything kills the player marble (Act_SetCollPair .., Coll_PlayerEnemy)
      if (this.hasPlayer) {
        this.figs.forEach((f, i) => {
          if (i === this.player || !f.type || (f.type === T_FM && i < this.player)) return;
          this.actors[this.player].contact[i] = () => this.playerShatter();
          this.actors[i].contact[this.player] = () => this.playerShatter();
        });
      }
      this.world = new E.World(this, L);
      this.world.defineClasses(S);
      this.physics = new E.Physics(this);
      this.oxyd = { n: 0, pairs: 0, open: null };
      this.hit = { actor: 0, cell: 0, stone: 0 };
      this.sparks = [];
      this.maxSparks = S.sparks;
      this.lvlEnding = false; this.endState = 0; this.gameOver = false;
      this.attemptQuit = false; this.lvlQuit = false; this.abortGame = false; this.quitPrg = false;
      this.romState = 0;
      this.meditWon = false;        // G39bb0, cleared by GameInit only
      this.mouse = { dx: 0, dy: 0, left: false, right: false };
      this.message = null;          // active ticker
      // ---- map ----
      this.world.build();
      this.view = { x: 0, y: 0, fx: 0, fy: 0 };
      // ---- Hook_AfterMap ----
      this.resetPlayerStart();
      this.toggleLink = 0; this.toggleCell = -1;                 // TOGGLE_LINK / TOGGLE_CELL (only here, not on restart)
      this.inv.removeOne(25);
      // ---- Link_InitAll ----
      this.world.initLinks();
      // ---- Hook_LevelStart ----
      this.levelSetup();
      this.flipView();
      this.startTicker = S.t === 1;
    }

    // ------------------------------------------------------------------ helpers
    inSet(name, i) { const s = this.sets[name]; return s !== undefined && !!(s & (1 << i)); }
    playSound(name, prio) { this.game.sound.play(name, prio); }
    soundPlaying(name) { return this.game.sound.playing(name); }
    playMaterialSound(a, b) {
      if (!a || !b) return;
      const p = a < b ? a * 8 + b : b * 8 + a;
      const name = p === 11 ? 'ESKLICK2' : p === 12 ? 'ESKLICK3' : p === 14 ? 'ESKLICK4' : 'ESKLICK1';
      this.playSound(name, 1);
    }
    get playerFig() { return this.hasPlayer ? this.figs[this.player] : null; }
    get playerAct() { return this.actors[this.player]; }
    playerProtected() { const f = this.playerFig; return !!(f && f.umbrella === 1); }   // FIG+$20 == 1
    playerOverlapsCell(c) {
      if (!this.hasPlayer) return false;
      const a = this.playerAct; if (!a.active) return false;
      const [cx, cy] = this.world.cellXY(c);
      const x = hi(a.x), y = hi(a.y);
      return x + a.box[2] >= cx * 32 && x + a.box[0] <= cx * 32 + 31 && y + a.box[3] >= cy * 32 && y + a.box[1] <= cy * 32 + 31;
    }
    cellCentreFix(c) { const [x, y] = this.world.cellCentre(c); return [x * ONE, y * ONE]; }

    resetPlayerStart() {                                         // P21a70
      const p = this.L.points[this.player] || this.L.points[0];
      this.respawnPt = { x: p.x, y: p.y };
      for (let k = 1; k <= 24; k++) this.inv.removeAll(k);
    }

    // ------------------------------------------------------------------ LevelSetup @21b34
    levelSetup() {
      this.f3Restart = false; this.respawnOk = true; this.spawnedOnce = false;
      this.message = null;
      if (this.S.G2) this.oxydShuffle();
      this.oxydPlaceSymbols();
      for (const op of E.scriptPass2(this.L.scriptBytes)) {
        if (op.op === 'trigger') this.world.trigger(op.value, op.item, op.cell);
        else if (op.op === 'S8timing' && op.cell >= 0) {
          const o = this.world.sobj[op.cell];
          if (o && o.cls.def.kind === 8) o.timing = op.k * 17;
        }
      }
      for (let i = 0; i < 8; i++) {
        const f = this.figs[i];
        if (f.type === T_FM) this.spawnFM(i);
        else if (f.type === T_FB) this.spawnFB(i, this.respawnPt.x, this.respawnPt.y);
        else if (f.type === T_FK) this.spawnFK(i);
        else if (f.type === T_FQ) this.spawnFQ(i);
      }
    }

    oxydCells() {
      const out = [];
      for (let id = 1; id <= 16; id++) { const c = this.world.scls[id].cell; out.push(c); }
      return out;
    }
    oxydShuffle() {                                              // P1c4cc
      this.rng.randomize();
      const w = this.world;
      for (let k = 0; k < 64; k++) {
        const a = 1 + this.rng.range(0, 7) * 2 + this.rng.range(0, 1);
        const b = 1 + this.rng.range(0, 7) * 2 + this.rng.range(0, 1);
        const ca = w.scls[a].cell, cb = w.scls[b].cell;
        if (ca >= 0 && cb >= 0 && ca !== cb) w.swapStones(ca, cb);
      }
    }
    oxydPlaceSymbols() {                                         // P1c59a
      const w = this.world;
      for (let id = 1; id <= 16; id++) { const c = w.scls[id].cell; if (c >= 0) w.setItem(71 + id, c); }
    }
    oxydReset() {                                                // P1c674
      const w = this.world;
      for (let id = 1; id <= 16; id++) { const c = w.scls[id].cell; if (c >= 0) w.setStone(id, c); }
      this.oxydShuffle();
      this.oxydPlaceSymbols();
    }
    oxydAllOpen() {                                              // P1c442
      if (!this.hasPlayer) return;
      const f = this.playerFig, a = this.playerAct;
      f.state = ST_WIN; a.layer = -1; a.shadow = -1; f.umbrella = 0; f.umbrellaT = 0;
      this.levelWon();
    }
    levelWon() {                                                 // P1898a
      while (this.inv.free() === 0) {
        for (let k = 1; k <= 25; k++) if (this.inv.contains(k)) { this.inv.removeOne(k); break; }
      }
      this.inv.insertFront(25);
      this.endState = 2;
    }

    // ------------------------------------------------------------------ figures
    makeActor(i, proc, opts) {
      const a = new E.Actor(i);
      const old = this.actors[i];
      a.contact = old.contact;
      Object.assign(a, opts);
      a.setMass(opts.mass);
      a.proc = proc;
      const shape = E.figures[opts.shapeSize !== undefined ? opts.shapeSize : opts.body];
      a.setShape(shape ? shape.w : 19);
      this.actors[i] = a;
      return a;
    }
    activate(a, x, y) { this.physics.setPos(a, x, y); a.vx = 0; a.vy = 0; a.active = true; }

    spawnFB(i, x, y) {                                           // FB_Spawn @1b9b8
      const d = this.figs[i].def;
      this.lvlEnding = false;
      const a = this.makeActor(i, (act) => this.fbFrame(act), {
        mass: d.mass, kf: fix(d.b / 1000), kb: fix(d.a / 1000), hasInventory: true,
        body: -1, shadow: -1, shapeSize: 3, layer: -1,
      });
      this.inv.removeAll(4);
      const f = this.figs[i];
      // FIG +3e,+50/+54,+60,+62,+40/+42,+1c,+4c,+20,+44,+48 are reset; +10 (frame counter), +4a (blink
      // counter) and the wobble velocities +58/+5c keep their old values (as in the original)
      Object.assign(f, { oil: 0, wobble: 0, wobCnt: 0, wobX: 0, wobY: 0, roll0: 3, roll1: 4,
        state: ST_APPEAR, umbrella: 0, umbrellaT: 0, invisT: 0, invis: 0 });
      if (f.cnt === undefined) f.cnt = 0;
      a.sens = d.sens * ONE;
      this.activate(a, x, y);
      if (this.spawnedOnce) this.respawnPlace(a);
      this.addSpark(a.x, a.y);
      this.spawnedOnce = true;
    }
    respawnPlace(a) {                                            // FB_Spawn @1bd0c..@1bee6
      const w = this.world, BAD = E.Items.RESPAWN_BAD;
      const ox = a.x, oy = a.y;
      let cell = (hi(a.y) >> 5) * w.W + (hi(a.x) >> 5);          // Pa072(pos)
      // first test: item and Pb324 only (the floor is not checked here)
      if (!(BAD.has(w.item[cell]) || !this.pb324(a, 80))) return;
      let tries = 40, done;
      do {
        let n;
        do { n = w.neighbour(cell, this.rng.range(1, 8)); } while (n === 0 || n === -1);
        cell = n;
        const [cx, cy] = this.cellCentreFix(cell);
        this.physics.setPos(a, cx, cy);
        const ok = !BAD.has(w.item[cell]) && w.floor[cell] !== 0 && this.pb324(a, 80);   // floor G3a0a8 = 0
        done = ok || tries === 0;
        tries--;
      } while (!done);
      // quirk: the counter is checked after the loop, so the 41st try is discarded even if it was good
      if (tries < 0) this.physics.setPos(a, ox, oy);
    }
    // Pb324(i, r) @b324: TRUE = the spot is free. Stone part: every stone cell under the bounding box
    // (actor layer <= stone max layer) is classified by the region of the actor centre. Centre inside
    // the cell = occupied. For the edge regions the routine reuses the edge tests of Pb240, but with
    // the registers of Pb324 (d1 = left cell column, d2 = 4*stone id, d5 = cell y bound), so these
    // tests are effectively garbage; reproduced as is. Corner regions never count. Actor part: any
    // other active actor whose integer centre is closer than r px.
    pb324(a, r) {
      if (!a.active) return true;
      const w = this.world, W = w.W;
      const x = hi(a.x), y = hi(a.y);
      const [bx0, by0, bx1, by1] = a.box;
      const left = ((x + bx0) & 0xffff) >>> 5, top = ((y + by0) & 0xffff) >>> 5;
      const right = ((x + bx1) & 0xffff) >>> 5, bottom = ((y + by1) & 0xffff) >>> 5;
      const cxp = E.i16(x + hi(a.offx)), cyp = E.i16(y + hi(a.offy));
      let d1 = left;
      for (let ty = top; ty <= bottom; ty++)
        for (let tx = left; tx <= right; tx++) {
          const c = ty * W + tx;
          if (c < 0 || c >= w.n) continue;
          const s = w.stone[c];
          if (!s || a.layer > w.scls[s].def.maxLayer) continue;
          const X = tx * 32, Y = ty * 32;
          let code = 0, d5;
          if (cxp < X) code |= 4; else if (cxp > X + 31) code |= 8;
          if (cyp < Y) { code |= 1; d5 = Y; } else { d5 = Y + 31; if (cyp > d5) code |= 2; }
          let occ = false;
          if (code === 0) occ = true;
          else if (code === 1) occ = E.i16(d1) <= E.i16(cyp + by1);
          else if (code === 2) { d1 = (d1 + 31) & 0xffff; occ = E.i16(d1) >= E.i16(cyp + by0); }
          else if (code === 4) occ = E.i16(s * 4) <= E.i16(d5 + bx1);
          else if (code === 8) occ = E.i16(s * 4 + 31) >= E.i16(d5 + bx0);
          if (occ) return false;
        }
      for (const b of this.actors) {
        if (b === a || !b.active) continue;
        const dx = E.i16(x - hi(b.x)), dy = E.i16(y - hi(b.y));
        if (dx * dx + dy * dy < r * r) return false;
      }
      return true;
    }

    spawnFM(i) {                                                 // FM_Spawn @1a9ec
      const d = this.figs[i].def;
      this.lvlEnding = false;
      const a = this.makeActor(i, (act) => this.fmFrame(act), { mass: 200, kf: 66519, kb: ONE, body: 56, shadow: 7 });
      const f = this.figs[i];
      Object.assign(f, { state: ST_ALIVE, umbrella: 0, cnt: 0, t: 0, number: d.number, target: d.target });
      a.sens = 10 * ONE;
      if (d.number > 0) a.overlay = { shape: 0x15 + d.number, dx: 0, dy: 0 };
      const p = this.L.points[i];
      this.activate(a, p.x, p.y);
    }

    spawnFK(i) {                                                 // FK_Spawn @1a0d6
      const d = this.figs[i].def;
      const a = this.makeActor(i, (act) => this.fkFrame(act), { mass: d.mass, kf: fix(d.b / 1000), kb: fix(d.a / 1000), body: 57, shadow: 7 });
      const p = this.L.points[i];
      const f = this.figs[i];
      Object.assign(f, { home: { x: p.x, y: p.y }, jx: 0, jy: 0, jcnt: d.jitterPeriod });
      this.activate(a, p.x, p.y);
    }

    spawnFQ(i) {                                                 // FQ_Spawn @1a5e4
      const d = this.figs[i].def;
      const a = this.makeActor(i, (act) => this.fqFrame(act), { mass: 200, kf: fix(d.b / 1000), kb: fix(d.a / 1000), body: 0x26, shadow: -1 });
      const p = this.L.points[i];
      const f = this.figs[i];
      const home = d.homeCell >= 0 ? (() => { const [x, y] = this.cellCentreFix(d.homeCell); return { x, y }; })() : { x: p.x, y: p.y };
      Object.assign(f, { home, dir: 1 << this.rng.range(0, 3), free: 0, cnt: 0, blocked: 0 });
      this.activate(a, p.x, p.y);
      f.target = (hi(home.y) >> 5) * this.world.W + (hi(home.x) >> 5);
    }

    // ------------------------------------------------------------------ deaths
    shatter(i) {
      const a = this.actors[i], f = this.figs[i];
      this.playSound('ESKLIRR', 100);
      a.layer = -1; f.t = 32; f.state = ST_SHATTER;
    }
    playerShatter() {                                            // Coll_PlayerEnemy / P1aca0
      if (!this.hasPlayer) return;
      const f = this.playerFig;
      if (f.state === ST_ALIVE && f.umbrella !== 1) this.shatter(this.player);   // eori #1: only $20 == 1 protects
    }
    killActor(i) {                                               // KillActor P18d9a (HIT_ACTOR)
      // no state test: only the umbrella flag and RESPAWN_OK are checked
      const f = this.figs[i];
      if (!f || !f.type) return;
      if (f.umbrella !== 1 && this.respawnOk) this.shatter(i);
    }
    actorFall() {                                                // Hole_Fall @1ac74: always the player
      if (!this.hasPlayer) return;
      const f = this.playerFig, a = this.playerAct;
      if (f.umbrella) return;
      a.layer = -1; a.shadow = -1; f.state = ST_FALL; f.cnt = 3;
    }
    vortexEnter(i, c) {                                          // Vortex_Enter P19d8e: always the player
      if (!this.hasPlayer) return;
      const f = this.playerFig, a = this.playerAct;
      f.state = ST_TELE_OUT; f.teleLink = this.vortexLink; f.teleCell = c; f.cnt = 3;
      a.layer = -1; a.shadow = -1;
      this.playSound('ESQUIT', 100);
    }
    vortexTeleport() {                                           // P19e3e
      const f = this.playerFig, a = this.playerAct, w = this.world;
      const rec = f.teleLink;
      if (rec) {
        // first destination (in link order) whose item is not in RESPAWN_BAD_ITEMS and that has no
        // stone or a kind-2 (passable) stone; the velocity is not touched (layer -1 zeroes it anyway)
        for (const d of rec.dst) {
          const c = d & 0x1fff;
          if (c >= w.n) continue;
          if (E.Items.RESPAWN_BAD.has(w.item[c])) continue;
          if (w.stone[c] && !(w.flags[c] & E.F_KIND2)) continue;
          const [x, y] = this.cellCentreFix(c);
          this.physics.setPos(a, x, y);
          break;
        }
      }
      f.state = ST_TELE_IN; a.body = 0;
    }

    // ------------------------------------------------------------------ figure procedures
    noSteer(a) { const fl = this.world.floor[a.cell]; return fl >= E.NOSTEER_FIRST && fl <= E.NOSTEER_LAST; }
    // mouse steering of FB_Frame / FM_Frame: returns false when +a2 != 0 or on a no-steer floor
    steer(a) {
      if (a.layer !== 0 || this.noSteer(a)) return false;
      a.ix = i32(a.ix + fixMul(a.sens, this.mouse.dx * ONE));
      a.iy = i32(a.iy + fixMul(a.sens, this.mouse.dy * ONE));
      return true;
    }
    fbFrame(a) {                                                 // FB_Frame @1b692
      const f = this.figs[a.index];
      if (this.steer(a) && f.wobble) {                           // wobble only together with steering
        if (--f.wobCnt < 0) {
          f.wobCnt = 7;
          f.wobble--;
          if (f.wobble === 0) { f.wobX = f.wobY = 0; }
          else {
            const n = f.wobble;
            f.wobVX = (this.rng.range(-n, n) * ONE - f.wobX) >> 3;
            f.wobVY = (this.rng.range(-n, n) * ONE - f.wobY) >> 3;
          }
        }
        if (f.wobble) {
          f.wobX = i32(f.wobX + f.wobVX); a.ix = i32(a.ix + f.wobX);
          f.wobY = i32(f.wobY + f.wobVY); a.iy = i32(a.iy + f.wobY);
        }
      }
      f.cnt = (f.cnt + 1) & 3;
      switch (f.state) {
        case ST_ALIVE: {
          // rolling sprite: bit 18 of the 16.16 sum x+y (the fractions can carry)
          a.body = ((a.x + a.y) & 0x40000) ? f.roll1 : f.roll0;
          a.shadow = 8;
          if (f.umbrella && f.umbrellaT > 0) {
            f.umbrellaT--; f.blink++;
            const ov = [-1, 20, -1, 21][f.blink & 3];
            a.overlay = { shape: ov, dx: 0, dy: 0 };
          } else { f.umbrella = 0; a.overlay = null; }
          if (f.invis) {
            if (f.invisT > 0) { f.invisT--; a.body = -1; a.shadow = -1; if (a.overlay) a.overlay.shape = -1; }
            else f.invis = 0;
          }
          break;                                                 // -> mouse buttons
        }
        case ST_TELE_OUT:
          if (f.cnt !== 0) return;
          a.body--;
          if (a.body < 0) { a.body = 0; this.vortexTeleport(); }
          return;
        case ST_TELE_IN:
        case ST_APPEAR:
          if (f.cnt !== 0) return;
          a.body++;
          if (a.body === 3) { a.shadow = 7; a.layer = 0; f.state = ST_ALIVE; a.overlay = null; }
          return;
        case ST_WIN:
          if (f.cnt !== 0) return;
          a.body--;
          if (a.body < 0) { a.body = 0; a.active = false; f.state = ST_WON; this.lvlEnding = true; }
          return;
        case ST_FALL:
          if (f.cnt !== 0) return;
          a.x = ((((hi(a.x) & ~31) + 15) * ONE) | (a.x & 0xffff));
          a.y = ((((hi(a.y) & ~31) + 15) * ONE) | (a.y & 0xffff));
          a.overlay = null;
          a.body--;
          if (a.body === -15) { f.state = ST_GONE; a.active = false; this.playSound('ESKLIRR', 100); this.lvlEnding = true; }
          return;
        case ST_SHATTER:
          if (!this.shatterStep(a, f, [28, 29, 30, 31], false)) return;
          break;                                                 // -> mouse buttons (only while +1e > 0)
      }
      // @1b992: the buttons are read in every other state; UseFirst acts only in state 0, Rotate
      // stops the ticker and redraws the inventory in any state but rotates only in state 0
      if (this.mouse.left) this.useFirstItem();
      if (this.mouse.right) this.rotateInventory();
    }
    // shatter animation (state 3); returns true while the animation is still running
    shatterStep(a, f, sprites, isFM) {
      a.overlay = null;
      if (f.t === 0) {
        this.lvlEnding = true;
        if (isFM) f.state = ST_DEAD;                             // the FM stays active (as a splat)
        return false;
      }
      f.t--;
      a.body = sprites[3 - (f.t >> 3)];
      a.shadow = -1;
      return true;
    }
    fmFrame(a) {                                                 // FM_Frame @1a860
      const f = this.figs[a.index];
      this.steer(a);
      f.cnt = (f.cnt + 1) & 3;
      if (f.state === ST_SHATTER) this.shatterStep(a, f, [0x20, 0x21, 0x22, 0x23], true);
    }
    // VecLen @6b24 + the integer square root @6c3a. The Newton iteration returns the last new
    // estimate, which is sometimes one more than floor(sqrt) (e.g. 3 -> 2, 8 -> 3, 24 -> 5).
    vecLen(dx, dy) {
      const ix = E.i16(hi(dx)), iy = E.i16(hi(dy));
      const n = i32(ix * ix + iy * iy);
      if (n <= 0) return 0;
      const b = 31 - Math.clz32(n);
      let x = 1 << ((b >> 1) + (b & 1));
      for (;;) {
        const q = Math.floor((n >>> 0) / x);
        if (q > 0xffff) return x;                                // divu overflow (not reachable)
        const nx = ((q + x) & 0xffff) >>> 1;
        if (E.i16(nx) < E.i16(x)) { x = nx; continue; }
        return nx;
      }
    }
    // VecScale @6b3c: (int(d) * force / len) per axis, 16-bit signed quotient, len 0 -> (0,0)
    addForce(a, dx, dy, len, force) {
      if (!len) return;
      a.iy = i32(a.iy + E.i16(Math.trunc(E.i16(hi(dy)) * force / len)) * ONE);
      a.ix = i32(a.ix + E.i16(Math.trunc(E.i16(hi(dx)) * force / len)) * ONE);
    }
    // accelerate toward home if go_home and the distance is not 0; returns true if a force was added
    goHome(a, f, d) {
      if (!d.goHome) return false;
      const dx = i32(f.home.x - a.x), dy = i32(f.home.y - a.y);
      const len = this.vecLen(dx, dy);
      if (!len) return false;
      this.addForce(a, dx, dy, len, d.force);
      return true;
    }
    fkFrame(a) {                                                 // FK_Frame @19fa8
      const f = this.figs[a.index], d = f.def;
      if (this.noSteer(a)) return;
      if (d.jitter && --f.jcnt < 0) {
        f.jcnt = d.jitterPeriod;
        f.jx = i32(E.i16(this.rng.range(-1, 1) * d.jitterAmp) * ONE);
        f.jy = i32(E.i16(this.rng.range(-1, 1) * d.jitterAmp) * ONE);
      }
      // the player is chased even when inactive (fallen / won): no active test in the original
      if (this.hasPlayer && !this.playerFig.invis) {
        const pa = this.playerAct;
        const dx = i32(pa.x + f.jx - a.x), dy = i32(pa.y + f.jy - a.y);
        const len = this.vecLen(dx, dy);
        if (len < d.range) { this.addForce(a, dx, dy, len, d.force); return; }
      }
      this.goHome(a, f, d);
    }
    fqFrame(a) {                                                 // FQ_Frame @1a30a
      const f = this.figs[a.index], d = f.def, w = this.world;
      if (this.noSteer(a)) return;
      const pf = this.playerFig, pa = this.playerAct;
      const seesPlayer = this.hasPlayer && !pf.invis;
      let tx, ty;
      if (!d.grid) {
        if (!seesPlayer) { if (this.goHome(a, f, d)) this.fqAnim(a, f); return; }
        tx = pa.x; ty = pa.y;
      } else {
        const decide = (a.hitLast && ((++f.blocked) & 15) === 0) || f.target === a.cell;
        if (decide) {
          f.blocked = 0;
          const c = a.cell;
          const dirs = [[1, c - w.W, 0], [2, c + w.W, 1], [4, c - 1, 2], [8, c + 1, 3]];
          let free = 0, nfree = 0;
          for (const [bit, n, num] of dirs) {
            if (n < 0 || n >= w.n) continue;
            const s = w.stone[n];
            if (!s || ((w.flags[n] & E.F_KIND2) && (w.kstate[n] === 4 || w.kstate[n] === num))) { free |= bit; nfree++; }
          }
          f.free = free;
          if (nfree === 0) return;
          const rev = { 1: 2, 2: 1, 4: 8, 8: 4 }[f.dir] || 0;
          let nd;
          if (nfree === 1 || free === f.dir || free === rev) nd = free;
          else {
            free &= ~rev; f.free = free; nd = 0;
            if (this.rng.range(0, d.chase) !== 0 && seesPlayer) {
              const dx = E.i16(hi(pa.x) - hi(a.x)), dy = E.i16(hi(pa.y) - hi(a.y));
              const want = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 4 : 8) : (dy < 0 ? 1 : 2);
              if (free & want) nd = want;
            }
            while (!nd) { const b = 1 << this.rng.range(0, 3); if (free & b) nd = b; }
          }
          f.dir = nd;
          f.target = c + ({ 1: -w.W, 2: w.W, 4: -1, 8: 1 }[nd] || 0);
        }
        [tx, ty] = this.cellCentreFix(f.target);
      }
      const dx = i32(tx - a.x), dy = i32(ty - a.y);
      const len = this.vecLen(dx, dy);
      if (len < d.range) { this.addForce(a, dx, dy, len, d.force); this.fqAnim(a, f); return; }   // anim even if len == 0
      if (this.goHome(a, f, d)) this.fqAnim(a, f);
    }
    fqAnim(a, f) {                                               // @1a564
      const TAB = [52, 50, 38, 0, 40, 42, 38, 0, 48, 50, 46, 0, 44, 42, 46, 0];
      let d0 = E.i16(a.iy >> 16), d1 = E.i16(a.ix >> 16), d2 = 0;
      if (d0 < 0) { d2 |= 16; d0 = -d0; }
      if (d1 < 0) { d1 = -d1; d2 |= 8; }
      if (d1 < (d0 >> 1)) d2 |= 4;
      if (d0 < (d1 >> 1)) d2 |= 2;
      const v = (a.body & 1) | TAB[d2 >> 1];
      f.cnt = (f.cnt + 1) & 0xffff;
      if ((f.cnt & 3) === 0) a.body = v ^ 1;
    }

    // ------------------------------------------------------------------ inventory
    invOnAdd(code) {                                             // INV_OnAdd @1c312
      const f = this.playerFig, a = this.playerAct;
      if (code === 1) { const p = this.L.points[this.player]; this.respawnPt = { x: p.x, y: p.y }; }
      else if (code === 3 && f) { f.wobCnt = 0; f.wobble += 80; }
      else if (code === 4 && a) { a.setMass(a.mass + 500); }
      this.playSound('ESALARM', 100);
      this.playerDamping();
    }
    playerDamping() {                                            // P1ae82
      if (!this.hasPlayer) return;
      const a = this.playerAct, f = this.playerFig;
      // the original resets kf to 1.0 here, which throws away the level's own friction factor from
      // FB(..)(..)(b) (e.g. level 99) after the first inventory action - fixed: fall back to that value
      const base = fix(f.def.b / 1000);
      a.kf = this.inv.get(0) === 6 ? 58982 : (f.oil ? 67502 : base);
    }
    coinTake() {                                                 // P1929e
      const c = this.inv.popFirst();
      const secs = { 9: 2, 11: 5, 14: 10 }[c] || 0;
      if (!secs && c) { this.inv.silent = true; this.inv.insertFront(c); this.inv.silent = false; }
      return secs;
    }
    rotateInventory() {                                          // INV_Rotate @1b610
      this.message = null;                                       // TXT_TickerStop, INV_Show: in any state
      this.inv.dirty = true;
      if (!this.hasPlayer || this.playerFig.state !== ST_ALIVE) return;
      const c = this.inv.popFirst();
      this.playSound('ESHITOM', 100);
      this.inv.silent = true; this.inv.append(c); this.inv.silent = false;
      this.playerDamping();
    }
    useFirstItem() {                                             // INV_UseFirst @1af7a
      const w = this.world, f = this.playerFig, a = this.playerAct;
      if (!f || f.state !== ST_ALIVE) return;                    // returns without the damping update
      const c = this.inv.popFirst();
      const cell = a.cell, here = w.item[cell];
      const back = () => this.inv.insertFront(c);
      switch (c) {
        case 0: break;
        case 1:
          if (here === 0) { const [x, y] = this.cellCentreFix(cell); this.respawnPt = { x, y }; w.setItem(18, cell); }
          else back();
          break;
        case 4: back(); break;
        case 7: this.showText(this.S.textL, this.S.textLmode); break;
        case 8: this.showText(this.S.textl, this.S.textlmode); break;
        case 0xa: this.game.coffeeBreak(); break;
        case 0xd: if (f.state === ST_ALIVE) { f.umbrellaT += 10 * 71; f.umbrella = 1; } break;
        case 0x18: if (f.state === ST_ALIVE) { f.invisT += 10 * 71; f.invis = 1; } break;
        case 0x10:
          if (E.Items.SEEDABLE.has(here)) {
            w.setItem(E.CODE2ITEM[c], cell);
            // d = 0 is the cell itself (now the seedling, not seedable); empty cells are re-set to 0 too
            for (let d = 0; d <= 8; d++) { const n = w.neighbour(cell, d); if (n > 0 && E.Items.SEEDABLE.has(w.item[n])) w.setItem(0, n); }
          } else back();
          break;
        case 0x12:
          if (here === 0) w.setItem(21, cell);
          else if (here === 10) { w.setItem(14, cell); back(); }
          else if (here === 14 || here === 23) { w.setItem(0, cell); back(); }
          else if (here === 22) { w.setItem(23, cell); back(); }
          else back();
          break;
        default:
          if (here === 0) w.setItem(E.CODE2ITEM[c] || 0, cell); else back();
      }
      this.playerDamping();
    }
    showText(bytes, speed = 4) {                                   // P14cd4: last arg = scroll speed
      if (!bytes) return;
      this.message = new E.Ticker(this.game, bytes, speed);
    }

    // ------------------------------------------------------------------ sparks
    addSpark(x, y) {
      if (!this.maxSparks) return;
      let s;
      if (this.sparks.length < this.maxSparks) { s = {}; this.sparks.push(s); }
      else s = this.sparks.reduce((m, o) => (o.frame > m.frame ? o : m));
      s.x = x; s.y = y; s.frame = 11 * ONE;
    }
    stepSparks() {
      this.sparks = this.sparks.filter((s) => { s.frame += ONE / 4; return hi(s.frame) <= 19; });
    }

    // ------------------------------------------------------------------ view
    flipView() {                                                 // VIEW_FlipToActor @16392
      const a = this.actors[0];
      if (!a.active) return;
      const W = this.world.W, H = this.world.H;
      let vx = Math.floor(((hi(a.x) - 15) >> 5) / 19) * 19, vy = Math.floor(((hi(a.y) - 15) >> 5) / 10) * 10;
      vx = Math.max(0, Math.min(W - 20, vx)); vy = Math.max(0, Math.min(H - 11, vy));
      this.view.x = vx; this.view.y = vy; this.view.fx = 0; this.view.fy = 0;
    }
    followView() {                                               // VIEW_FollowActor @162be
      const a = this.actors[0], v = this.view;
      if (!a.active) return;
      const W = this.world.W, H = this.world.H;
      const rx = (hi(a.x) >> 5) - v.x, ry = (hi(a.y) >> 5) - v.y;
      if (v.fx === 0) { if (rx <= 0) v.fx = -1; else if (rx >= 19) v.fx = 1; }
      if (v.fx === -1) { if (rx >= 10) v.fx = 0; else v.x--; }
      else if (v.fx === 1) { if (rx <= 10) v.fx = 0; else v.x++; }
      if (v.fy === 0) { if (ry <= 0) v.fy = -1; else if (ry >= 10) v.fy = 1; }
      if (v.fy === -1) { if (ry >= 5) v.fy = 0; else v.y--; }
      else if (v.fy === 1) { if (ry <= 5) v.fy = 0; else v.y++; }
      const cx = Math.max(0, Math.min(W - 20, v.x)), cy = Math.max(0, Math.min(H - 11, v.y));
      if (cx !== v.x) { v.x = cx; v.fx = 0; }
      if (cy !== v.y) { v.y = cy; v.fy = 0; }
    }

    // ------------------------------------------------------------------ meditation
    meditAllHome() {                                             // Medit_AllHome @1a920
      const w = this.world; let n = 0;
      for (let k = 0; k < this.nMedit; k++) {
        const a = this.actors[k], f = this.figs[k];
        if (f.type !== T_FM) continue;                           // (no active test in the original)
        const c = a.cell, it = w.item[c];
        if (it !== 10 && it !== 14) continue;
        if (f.target >= 0 && f.target !== c) continue;
        if (!E.itemMaskHit(w.itemSpr[c], hi(a.x) & 31, hi(a.y) & 31)) continue;
        // quirk: cmpi.w compares only the low word of |vx|+|vy| (so e.g. exactly 1.0 px/frame passes)
        if (((Math.abs(a.vx) + Math.abs(a.vy)) & 0xffff) > 0x100) continue;
        let dup = false;
        for (let j = 0; j < this.nMedit; j++) if (j !== k && this.actors[j].cell === c) dup = true;
        if (dup) continue;
        n++;
      }
      return n === this.nMedit && n > 0;
    }

    // ------------------------------------------------------------------ RestartLevel @221a8
    restartLevel() {
      const w = this.world, L = this.L;
      for (let c = 0; c < w.n; c++) {
        w.setStone(L.stones[c], c);
        const it = L.items[c];
        if (it !== 6) w.setItem(it, c);                          // I_MARBLE: only kept if still there
        else w.setItem(w.item[c] === 6 ? 6 : 0, c);
        w.setFloor(L.floors[c], c);
      }
      w.initLinks();
      this.oxyd.open = null;
      this.resetPlayerStart();
      this.levelSetup();
    }

    // ------------------------------------------------------------------ per-frame hooks
    // Hook_Frame @222d8 (start of every frame): mouse, keys, end-of-level state machine, view
    hookFrame(input) {
      const g = this.game;
      this.mouse = input;
      this.gameKeys(input.keys);
      if (this.lvlEnding) {
        switch (this.endState) {
          case 0: {
            if (this.soundPlaying('ESKLIRR')) break;
            this.respawnOk = false;
            if (this.isMedit) {
              for (let k = 0; k <= this.nMedit && k < 8; k++) {
                if (this.figs[k].type === T_FM && this.figs[k].state === ST_DEAD) {
                  if (this.inv.contains(25)) { this.inv.removeOne(25); this.spawnFM(k); this.respawnOk = true; }
                  else this.respawnOk = false;
                }
              }
            } else if (this.inv.contains(25)) {
              this.inv.removeOne(25); this.respawnOk = true;
              if (this.S.s || this.f3Restart) { this.f3Restart = false; this.restartLevel(); }
              else this.spawnFB(this.player, this.respawnPt.x, this.respawnPt.y);
            }
            if (this.respawnOk) {
              if (this.S.x) this.oxydReset();
              this.flipView();
              g.requestDissolve();
            } else {
              if (this.S.e) this.showText(Array.from(E.code8(g.codes[this.num]), (ch) => ch.charCodeAt(0)), 5);
              this.playSound('ESFOUL', 1000);
              this.endState = 1;
            }
            break;
          }
          case 1:
            if (!this.soundPlaying('ESFOUL')) { this.gameOver = true; this.attemptQuit = this.lvlQuit = true; }
            break;
          case 2:
            if (!this.soundPlaying('ESMEMOP')) { this.playSound('ESFIN', 1000); this.endState = 3; }
            break;
          case 3:
            if (!this.soundPlaying('ESFIN')) { this.attemptQuit = this.lvlQuit = true; this.won = true; }
            break;
        }
      }
      if (this.isMedit && !this.meditWon && this.meditAllHome()) {
        this.lvlEnding = true; this.meditWon = true; this.levelWon();
      }
      if (this.S.f) this.followView(); else this.flipView();
    }

    gameKeys(keys) {                                             // GameKeys @18734
      for (const k of keys) {
        if (k === 'F1') this.game.toggleSound();
        else if (k === 'F2') { this.attemptQuit = this.lvlQuit = this.abortGame = true; }
        else if (k === 'F3') {                                   // FIG[0] (not PLAYER_FIG), KillActor(0)
          if (this.figs[0].state === ST_ALIVE) { this.killActor(0); this.f3Restart = true; }
        }   // F10 (quit to the desktop in the original) cycles the language here, handled in Game.takeInput
        else if (k === 'Help') this.game.bossKey(true);
        else if (this.S.r && !/^(Shift|Control|Alt|Meta|CapsLock|OS)/.test(k)) {
          // 'R' only from state 0, 'O' only from 1, 'M' in state 2 triggers (state stays 2); N/P/Q,
          // any other key (also F4..F9, cursor keys, Esc, Undo) resets to 0; R/O/M in a wrong state
          // leave the state unchanged
          const ch = k.length === 1 ? k.toUpperCase() : '';
          if (ch === 'R') { if (this.romState === 0) this.romState = 1; }
          else if (ch === 'O') { if (this.romState === 1) this.romState = 2; }
          else if (ch === 'M') { if (this.romState === 2) this.world.trigger(1, true, this.S.rCell); }
          else this.romState = 0;
        }
      }
    }

    // One complete game frame (main loop Pd012 body)
    frame(input, render) {
      this.vbl = this.game.vbl;
      this.hookFrame(input);
      if (this.attemptQuit) return;
      this.physics.velocity();
      this.physics.move();
      this.stepSparks();
      if (render) render();                                      // Pd012: render before the actor procs
      for (const a of this.actors) if (a.active && a.proc) a.proc(a);
      this.world.tickAnimations();
      for (const o of this.world.ticks.slice()) E.Items.magnetTick(o);
    }
  }

  E.Level = Level;
  E.FIG = { T_FM, T_FB, T_FK, T_FQ, ST_ALIVE, ST_SHATTER, ST_DEAD };
})(window.ESPRIT = window.ESPRIT || {});
