// Stone kinds (engine) and per-stone game procedures.
'use strict';
(function (E) {
  const S = {};
  const SWAPPABLE = { 0: 1, 1: 1, 2: 1, 3: 1, 6: 0, 7: 1, 8: 1, 9: 1, 10: 0 };
  S.swappable = (kind) => !!SWAPPABLE[kind];

  const G = (w) => w.game;                 // running level
  const now = (w) => G(w).vbl;             // VBL counter G348c8 (71 per second, G348ea)
  const fwd = (o) => E.animStepFwd(o);     // anim step procs @9eea / @9f26
  const setHitCell = (w, c) => { G(w).hit = Object.assign({}, G(w).hit, { cell: c }); };   // HIT_CELL G3480a

  // ---------------------------------------------------------------------------------------------
  // onSet / onRemove per engine kind. Return false if the stone could not be placed.
  S.onSet = function (w, r, c) {
    const d = r.def;
    switch (d.kind) {
      case 1: w.stoneSpr[c] = d.sprite; return true;                       // @6cfa
      case 2: w.kstate[c] = d.state; w.stoneSpr[c] = d.sprA; return true;  // @7582: map+5 := state
      case 3: {                                                  // oxyd @76aa
        const o = w.newObj(c, r, 'stone');
        G(w).oxyd.n++;
        o.ox = 'closed'; o.matched = false;
        o.draw(w.oxydFrames[0]);
        return true;
      }
      case 6: {                                                  // switch @7c2a
        const o = w.newObj(c, r, 'stone');
        o.guard = null; o.on = d.init;
        switchShow(w, o);
        return true;
      }
      case 7: { const o = w.newObj(c, r, 'stone'); o.draw(d.frames[0]); return true; }   // @72f8
      case 8: {                                                  // animated @6ede
        const o = w.newObj(c, r, 'stone');
        o.draw(d.sprite); o.ends = 0; o.timing = 0;
        if (d.autostart) s8Start(w, o);                         // ($28 := $29 := 0 only here)
        return true;
      }
      case 9: {                                                  // timed @70be
        const o = w.newObj(c, r, 'stone');
        o.running = !!d.autorun;
        if (!d.autorun || !d.frames) {
          o.animating = false; o.tickWith(10, s9Step); o.draw(d.sprite);   // Anim_Park(10, 7088)
        } else {
          o.animating = true;
          o.start(d.frames, d.speed, d.loop, true);
          o.step = s9Step;
          if (!d.loop) o.endCb = s9AnimEnd;
        }
        s9Reschedule(w, o);
        return true;
      }
      case 10: { const o = w.newObj(c, r, 'stone'); o.pos = 0; o.prev = -1; o.draw(d.frames[0]); return true; } // @7dfa
    }
    return true;
  };

  S.onRemove = function (w, r, c) {
    const o = w.sobj[c];
    if (r.def.kind === 3 && o) {                                 // @76fa
      const ox = G(w).oxyd;
      if (o.matched) ox.pairs--;
      if (ox.open === o) ox.open = null;
      ox.n--;
    }
    if (o) o.park();                                             // SObj_Free @9d4c
    w.stoneSpr[c] = -1;
  };

  // ---------------------------------------------------------------------------------------------
  // Handler A (link source init) and B (link trigger)
  S.handlerA = function (w, c, rec) {
    const id = w.stone[c]; if (!id) return;
    const d = w.scls[id].def;
    if (d.A === 'setLink') { const o = w.sobj[c]; if (o) o.link = rec; }      // @6c7a: obj.$12 := linkOfs
    else if (d.A === 'P1c292') { G(w).laugh = { cell: c, link: rec }; }   // stone 30: G39ed4/G39ed6
  };

  S.handlerB = function (w, c, v) {
    const id = w.stone[c]; if (!id) return;
    const r = w.scls[id], d = r.def, o = w.sobj[c];
    switch (d.B) {
      case 'P748c': {                                            // kind 2 toggle
        const T = [1, 0, 3, 2, 4];
        w.kstate[c] = T[w.kstate[c]] ?? 4;
        w.stoneSpr[c] = w.kstate[c] === d.state ? d.sprA : d.sprB;
        break;
      }
      case 'P77c6': oxydClose(w, c); break;
      case 'P7b38':                                              // switch @7b38
        if (!o) break;
        // `tst.w $26(a1)` tests the word toggleMode(+38)|initState(+39)
        o.on = (d.toggle || d.init) ? !o.on : v !== 0;
        switchShow(w, o);
        break;
      case 'P7d5a':                                              // selector @7d5a
        if (o && v) { o.pos = (o.pos + v) & 3; selectorSend(w, o); }
        break;
      case 'P1c194':                                             // open door 19: value <= 0 -> close
        if (v <= 0) {
          w.setStone(20, c);
          if (G(w).playerOverlapsCell(c)) G(w).playerShatter();
        }
        break;
      case 'P1c21c': if (v >= 1) w.setStone(19, c); break;      // closed door 20
      case 'P1c1f4': w.setStone(29, c); break;                   // dormant spreading stone 51
      case 'P1c252': if (G(w).inv.contains(25)) w.setStone(0, c); break; // rock 54
    }
  };

  // ---------------------------------------------------------------------------------------------
  // onHit (table 0xca18): called on a fresh actor contact if the actor is in the stone's set p3.
  S.onHit = function (w, r, c, actor, code) {
    const d = r.def, o = w.sobj[c];
    const g = G(w);
    g.hit = { actor, cell: c, stone: r.id };                     // HIT_ACTOR/HIT_CELL/HIT_STONE
    switch (d.kind) {
      case 1: callProc(w, d.hitProc, c); break;                  // @6d08 (sound +38 is 0 for all)
      case 3: oxydHit(w, c, o); break;
      case 6:                                                    // switch @7c66
        if (!o) break;
        if (o.guard && !o.guard()) break;
        o.on = !o.on;
        switchShow(w, o);
        break;
      case 7: bumperHit(w, d, c, o, actor); break;
      case 8:                                                    // @6f40: start only if idle, then hitProc
        if (d.animOnHit && o && !o.ringList) s8Start(w, o);
        callProc(w, d.hitProc, c);
        break;
      case 9: callProc(w, d.hitProc, c); break;                  // @7160
      case 10:                                                   // @7e40
        if (o) { o.pos = (o.pos + 1) & 3; selectorSend(w, o); }
        break;
    }
  };

  // ---------------------------------------------------------------------------------------------
  // Kind 3: oxyd (memory) stones. o.ox = closed/opening/open/closing (flags $2b/$2c/$2a/$2d).
  // "Reverse in place" only replaces the step proc and end callback (index and ring unchanged).
  function oxydHit(w, c, o) {                                    // @7948
    if (!o) return;
    const g = G(w), ox = g.oxyd, d = o.cls.def;
    if (o.ox === 'open' || o.ox === 'opening') return;
    if (o.ox === 'closing') o.step = E.animStepFwd;             // @79a8
    else o.start(w.oxydFrames, d.ocSpeed, false, true);
    o.endCb = oxydOpened;
    o.ox = 'opening';
    g.playSound('ESMEMOP', 100);
    const p = ox.open;
    if (p && p.cell >= 0 && w.sobj[p.cell] === p) {
      if (p.ox === 'opening') {                                  // @7a0e: reverse p, flags untouched
        p.step = E.animStepBwd; p.endCb = oxydClosed;            // (p stays 'opening' until CLOSED)
      } else if (p.ox === 'open') {
        if (p.cls.def.partner === o.cls.id) {                    // match @7a48
          oxydSymbol(p, true);
          o.matched = true; ox.pairs++;
          g.playSound('ESGRETT', 100);                           // OXYD_ONMATCH = P18f60
          if ((ox.n >> 1) === ox.pairs) g.oxydAllOpen();         // OXYD_ONALL = P1c442
          ox.open = null;
          return;
        }
        p.ox = 'closing';                                        // mismatch @7ab0: close the older one
        p.start(w.oxydFrames, p.cls.def.ocSpeed, false, false); p.endCb = oxydClosed;
        g.playSound('ESMEMCL', 101);
      }
    }
    ox.open = o;
  }
  function oxydSymbol(o, matched) {                              // symbol animation (loop, speed spdSym)
    const d = o.cls.def;
    if (!d.matchFrames) { o.draw(d.symbol); return; }            // (both paths test symMatch +56)
    o.start(matched ? d.matchFrames : d.openFrames, d.symSpeed, true, true);
  }
  function oxydOpened(o) { o.ox = 'open'; oxydSymbol(o, o.matched); }   // @7736 (end callback)
  function oxydClosed(o) { o.ox = 'closed'; o.park(); }                 // @77ae: stays on frames[0]
  function oxydClose(w, c) {                                     // handler B @77c6 (value ignored)
    const o = w.sobj[c]; if (!o) return;
    const g = G(w);
    const close = (x) => {
      if (x.ox === 'opening') x.step = E.animStepBwd;            // reverse in place
      else x.start(w.oxydFrames, x.cls.def.ocSpeed, false, false);
      x.endCb = oxydClosed;
      x.ox = 'closing';
    };
    if (o.ox === 'closed' || o.ox === 'closing') return;
    close(o);
    g.playSound('ESMEMCL', 101);
    // (the check "class == OXYD_OPEN" can never be true -> OXYD_OPEN is not cleared here)
    const pc = w.scls[o.cls.def.partner].cell;
    if (pc >= 0) {
      const p = w.sobj[pc];
      if (p && (p.ox === 'open' || p.ox === 'opening')) {
        close(p); g.oxyd.pairs--;                                // partner's 'matched' flag stays
        g.playSound('ESMEMCL', 101);                             // @7922
      }
    }
  }

  // Kind 6: switch. @7b00: draw (state ? sprOn : sprOff), Link_Broadcast(link, state, cell)
  function switchShow(w, o) {
    const d = o.cls.def;
    o.draw(o.on ? d.sprOn : d.sprOff);
    w.broadcast(o.link, o.on ? 1 : 0, o.cell);
  }

  // Kind 7: bumper @73a4 (radial). dx/dy = integer parts of the 16.16 differences (P6b24).
  function bumperHit(w, d, c, o, ai) {
    const g = G(w), a = g.actors[ai];
    const [cx, cy] = w.cellCentre(c);
    const dx = E.i16(((cx * 65536 - a.x) | 0) >> 16), dy = E.i16(((cy * 65536 - a.y) | 0) >> 16);
    const L = isqrt6c3a((dx * dx + dy * dy) | 0);
    if (L) {
      const F = E.i16(E.fix(g.S.b) >> 16);                       // SC_b (int part of the fixed force)
      a.ix = (a.ix - (Math.trunc(dx * F / L) << 16)) | 0;
      a.iy = (a.iy - (Math.trunc(dy * F / L) << 16)) | 0;
    }
    g.playSound('ESWOUOU', 1);
    if (o) o.start(d.frames, d.speed, false, true);              // ends parked on the rest frame
  }
  // @6c3a: Newton integer square root as in the original (not always floor(sqrt), e.g. 8 -> 3)
  function isqrt6c3a(n) {
    if (n <= 0) return 0;
    const hb = 31 - Math.clz32(n);
    let x = 1 << ((hb >> 1) + (hb & 1));
    for (;;) {
      const old = x;
      const q = Math.floor(n / x);
      const d2 = q > 0xffff ? n : q;                             // divu overflow: d2 unchanged
      x = (((d2 + old) & 0xffff) >>> 1);
      if (E.i16(x) >= E.i16(old)) return x;
    }
  }

  // Kind 8: animated
  function s8Start(w, o) {                                       // S8_StartAnim @6e28
    const d = o.cls.def;
    if (d.kind !== 8 || !d.frames) return;
    o.start(d.frames, d.speed, d.loop, true);
    if (!d.loop) o.endCb = s8End;
  }
  function s8End(o) {                                            // @6df0
    const w = o.world, d = o.cls.def;
    o.ends = (o.ends + 1) & 0xff;
    setHitCell(w, o.cell);
    o.park();
    callProc(w, d.endProc, o.cell, o);
  }
  // S8_StartAnimEnd @6e94(speed, loop, fwd, frames, proc, cell); end @6e0e
  function s8StartAnimEnd(w, c, speed, loop, dir, frames, proc) {
    const o = w.sobj[c]; if (!o || o.cls.def.kind !== 8) return;
    o.start(frames, speed, loop, dir);
    if (!loop) o.endCb = (ob) => { ob.ends = (ob.ends + 1) & 0xff; setHitCell(w, ob.cell); ob.park(); if (proc) proc(w, ob.cell, ob); };
  }

  // Kind 9: timed. o.running = $29, o.animating = $28, o.due = $2a
  function s9Reschedule(w, o) {                                  // @7058
    const d = o.cls.def;
    o.due = now(w) + G(w).rng.range(d.tmin, d.tmax) * 71;
  }
  function s9Step(o) {                                           // @7088 (step proc)
    const w = o.world, d = o.cls.def;
    if (!o.running) return;
    let fire = false;
    if (now(w) >= o.due) { setHitCell(w, o.cell); fire = true; s9Reschedule(w, o); }
    if (o.animating) fwd(o);
    if (fire) callProc(w, d.timerProc, o.cell, o);              // (pushed as return address)
  }
  function s9AnimEnd(o) { o.animating = true; }                  // @7082: no park -> stays on the last frame
  function s9Stop(w, c) {                                        // S9_Stop @7168 (object stays queued)
    const o = w.sobj[c]; if (!o || o.cls.def.kind !== 9) return;
    o.running = false; o.animating = false;
    o.draw(o.cls.def.sprite);
  }
  function s9Idle(w, c) {                                        // S9_Idle @7194 (FALSE if no kind-9 obj)
    const o = w.sobj[c];
    return !!o && o.cls.def.kind === 9 && !o.running;
  }
  function s9StartTimer(w, c, secs) {                            // S9_StartTimer @71ba
    const o = w.sobj[c]; if (!o || o.cls.def.kind !== 9) return;
    const d = o.cls.def;
    if (!o.running) o.due = now(w);
    o.running = true;
    o.due += secs * 71;
    o.animating = true;
    o.start(d.frames, d.speed, d.loop, true);
    o.step = s9Step;
    if (!d.loop) o.endCb = s9AnimEnd;
  }

  // Kind 10: selector @7cdc. Sends 1 to the new output first, then 0 to the previous one
  // (both calls are pushed before the first Link_SendNth runs; A3 is a stack).
  function selectorSend(w, o) {
    const d = o.cls.def;
    o.draw(d.frames[o.pos]);
    if (o.prev < 0) { o.prev = o.pos; w.sendNth(o.link, o.pos + 1, 1, o.cell); }
    else {
      const old = o.prev; o.prev = o.pos;
      w.sendNth(o.link, o.pos + 1, 1, o.cell);
      w.sendNth(o.link, old + 1, 0, o.cell);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Game procedures referenced by the stone classes
  function callProc(w, name, c, o) {
    if (!name) return;
    const f = PROCS[name];
    if (f) f(w, c, o);
  }

  const PROCS = {
    // skulls 18/64: kill the touching marble
    P18d9a(w) { G(w).killActor(G(w).hit.actor); },
    // breakable stone 21/29: hammer as left-most inventory object
    P18e6c(w, c) {
      const g = G(w);
      if (g.inv.get(0) === 0x13) { g.playSound('ESCRASH', 100); w.setStone(65, c); }
    },
    P18e4a(w, c) { w.setStone(0, c); },                          // crumbling stone done
    P18eba(w, c) {                                               // thief (end of the rising anim)
      const g = G(w), n = g.inv.count();
      if (n && !g.playerProtected()) { g.playSound('ESGRETT', 100); g.inv.removeAt(g.rng.range(0, n - 1)); }
      s8StartAnimEnd(w, c, 3, false, true, THIEF_SINK, null);
    },
    P18f84(w, c) { w.setStone(21, c); w.setItem(0, c); },        // grown stone 24 -> 21
    P18cd2(w, c) {                                               // spreading stone timer
      const g = G(w); let free = 0;
      for (let k = 1; k <= 8; k++) {
        const n = w.neighbour(c, k);
        if (n > 0 && w.stone[n] === 0) {                         // (-1 at the border not filtered in the original)
          free++;
          if (g.rng.range(0, 3) === 0) w.setStone(66, n);
        }
      }
      if (free === 0) w.setStone(21, c);
    },
    P19058(w, c) { w.setStone(67, c); },
    P1900c(w, c) {                                               // HAS_PLAYER and PLAYER_ACT.$d8 == cell
      const g = G(w);
      if (g.hasPlayer && g.playerAct.cell === c) g.playerShatter();
      w.setStone(29, c);
    },
    P1907e(w, c) {                                               // laughing switch hit
      const g = G(w), had30 = w.scls[30].count !== 0;
      g.playSound('ESLACH1', 100);
      w.setStone(31, c);
      if (w.scls[30].count === 0 && had30 && g.laugh) w.broadcast(g.laugh.link, 1, g.laugh.cell);
    },
    P1911c(w, c) {                                               // laughing timer runs out
      const g = G(w), none30 = w.scls[30].count === 0;
      w.setStone(30, c);
      if (none30 && g.laugh) w.broadcast(g.laugh.link, 0, g.laugh.cell);
    },
    P193de(w) {                                                  // sunflower puzzle
      const c = w.scls[35].cell;
      if (c < 0) return;
      if (w.scls[36].cell === w.neighbour(c, 1) && w.scls[37].cell === w.neighbour(c, 3) &&
          w.scls[38].cell === w.neighbour(c, 2)) {
        const o = w.sobj[c];
        if (o) w.broadcast(o.link, 1, c);
      }
    },
    P191b4(w, c, o) {                                            // pulse generator
      o.ends = (o.ends - 1) & 0xff;
      let cnt = (o.timing & 15) - 1, fire = false;
      if (cnt < 0) { cnt = o.timing >> 4; o.ends = (o.ends + 1) & 0xff; fire = true; }
      o.timing = (o.timing & 0xf0) | (cnt & 15);
      if (fire) w.broadcast(o.link, o.ends & 1, c);
      s8Start(w, o);
    },
    P1934e(w, c) {                                               // coin slot
      const g = G(w);
      const secs = g.coinTake();
      if (secs) {
        const wasIdle = s9Idle(w, c);
        g.playSound('ESGELD', 100);
        s9StartTimer(w, c, secs);
        const o = w.sobj[c];
        if (wasIdle && o) w.broadcast(o.link, 1, c);
      }
    },
    P19256(w, c) {                                               // coin slot time over
      s9Stop(w, c);
      const o = w.sobj[c];
      if (o) w.broadcast(o.link, 0, c);
    },
    P18a02() {}, P18c28() {},                                     // easter eggs (printer / modem output)
  };
  // thief sinks: list G3a150 (6 frames, ends on (0,6))
  const THIEF_SINK = [244, 243, 242, 241, 240, 120];

  S.PROCS = PROCS;
  S.s9Stop = s9Stop;
  S.isqrt = isqrt6c3a;
  E.Stones = S;
})(window.ESPRIT = window.ESPRIT || {});
