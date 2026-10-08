// Level script parser (pass 1 = GameInit @229ec, pass 2 = LevelSetup @21b34).
'use strict';
(function (E) {

  class Lexer {
    constructor(bytes) {
      let n = bytes.indexOf(0); if (n < 0) n = bytes.length;
      this.b = bytes.subarray(0, Math.min(n, 999));
      this.pos = 0;
    }
    getc() {                                   // S_GetC: 0 at end or at ' ' (not consumed)
      if (this.pos >= this.b.length || this.b[this.pos] === 0x20) return 0;
      return this.b[this.pos++];
    }
    flag(def) {                                // S_Flag: \xf8 -> 0, \xf9 -> 1, any other char consumed -> default
      const c = this.getc();
      if (c === 0xf8) return 0;
      if (c === 0xf9) return 1;
      return def;
    }
    num(lo, hi, def) {                         // S_Num: '(' n ')' ; a non-'(' char is consumed
      const c = this.getc();
      if (c !== 0x28) return def;
      const r = this.int();
      if (!r.ok || r.v < lo || r.v > hi) return def;
      return r.v;
    }
    int() {                                    // S_ParseInt (consumes the terminator)
      const b = this.b; let p = this.pos;
      const ch = (i) => (i < b.length ? b[i] : 0);
      this.pos++; let c = ch(p++);
      if (c === 0) return { ok: false };
      let neg = false;
      if (c === 0x2b || c === 0x2d) {
        neg = c === 0x2d; this.pos++; c = ch(p++);
        if (c === 0) return { ok: false };
      }
      if (c < 0x30 || c > 0x39) return { ok: false };
      let v = 0;
      while (c >= 0x30 && c <= 0x39) {
        v = (v * 10 + c - 0x30) & 0xffff;
        this.pos++; c = ch(p++);
        if (c === 0) break;
      }
      if (neg) v = -v;
      return { ok: true, v: E.i16(v) };
    }
    string(max = 255) {                        // S_Str
      const out = [];
      if (this.pos < this.b.length && this.b[this.pos] === 0x22) {
        this.pos++;
        while (this.pos < this.b.length && this.b[this.pos] !== 0) {
          const c = this.b[this.pos++];
          if (c === 0x22) break;
          out.push(c);
          if (out.length >= max) break;
        }
      }
      return out;
    }
    skipToken() {                              // S_SkipToken
      while (this.pos < this.b.length && this.b[this.pos] !== 0x20) this.pos++;
      while (this.pos < this.b.length && this.b[this.pos] === 0x20) this.pos++;
      return this.pos < this.b.length;
    }
  }

  // Text placeholder substitution (S_Text @22736): '_' -> blank, first \xf0/\xf2/\xf3 run -> level code.
  function substText(bytes, level, codes) {
    const t = bytes.map((c) => (c === 0x5f ? 0x20 : c));
    let mode = 4;
    for (const [ph, lv] of [[0xf0, level], [0xf2, level + 1], [0xf3, level - 1]]) {
      const i = t.indexOf(ph);
      if (i >= 0) {
        mode = 2;
        const d = E.code8(codes[lv] || 0);
        for (let k = 0; k < 8; k++) if (i + k < t.length) t[i + k] = d.charCodeAt(k);
      }
    }
    return { text: t, mode };
  }

  const LANGCH = { 0x67: 0, 0x65: 1, 0x66: 2 }; // g e f

  function pass1(bytes, level, language, codes) {
    const S = {
      IS_MEDIT: 0, G1: 1, G2: 1, R1: 2, R2: 1, R3: 0, S: 30, B1: 5, B2: 5, b: 1000, T: 0.40,
      g1: 0.20, g2: 0.40, m: 3.0, t: 0, Kspeed: 0, sparks: 10, r: 0, rCell: -1, s: 0, f: 0, x: 0, e: 0,
      textL: null, textLmode: 4, textl: null, textlmode: 4, actors: [], player: -1,
    };
    const L = new Lexer(bytes);
    for (;;) {
      const c = L.getc();
      if (c === 0x46) {                                    // F
        if (S.actors.length < 8) {
          const k = L.getc(); const i = S.actors.length; let a = null;
          if (k === 0x4d) a = { type: 'FM', number: L.num(0, 6, 0), target: L.num(0, 32000, -1) };
          else if (k === 0x42) {
            a = { type: 'FB', sens: L.num(0, 40, 20), a: L.num(0, 1999, 1000), b: L.num(0, 1999, 1000), mass: L.num(10, 32000, 300) };
            S.player = i;
          } else if (k === 0x4b) {
            a = { type: 'FK', force: L.num(-1000, 1000, 30), range: L.num(0, 32000, 100), goHome: L.flag(1),
              jitter: L.flag(0), jitterPeriod: L.num(0, 32000, 71), jitterAmp: L.num(0, 32000, 64),
              a: L.num(0, 1999, 1000), b: L.num(0, 1999, 1000), mass: L.num(10, 32000, 300), opensOxyd: L.flag(0) };
          } else if (k === 0x51) {
            a = { type: 'FQ', force: L.num(-1000, 1000, 30), range: L.num(0, 32000, 100), goHome: L.flag(1),
              grid: L.flag(0), chase: L.num(0, 32000, 32000), a: L.num(0, 1999, 1000), b: L.num(0, 1999, 1015),
              homeCell: L.num(0, 2080, -1) };
          }
          if (a) S.actors.push(a);
        }
      } else if (c === 0x47) {                             // G
        S.IS_MEDIT = L.getc() === 0x4d ? 1 : 0;
        if (!S.IS_MEDIT) { S.G1 = L.flag(1); S.G2 = L.flag(1); }
      } else if (c === 0x42) { S.B1 = L.num(0, 100, 5); S.B2 = L.num(0, 100, 5); }          // B
      else if (c === 0x4b) {                                                               // K
        const n = L.num(1, 71, 71); S.Kspeed = Math.floor(71 / n) - 1; S.sparks = L.num(0, 10, 10);
      } else if (c === 0x4c || c === 0x6c) {                                               // L / l
        const lc = L.getc();
        const lang = lc in LANGCH ? LANGCH[lc] : language;
        const txt = L.string();
        if (lang === language) {
          const r = substText(txt, level, codes);
          if (c === 0x4c) { S.textL = r.text; S.textLmode = r.mode; } else { S.textl = r.text; S.textlmode = r.mode; }
        }
      } else if (c === 0x52) { S.R1 = L.num(0, 32000, 2); S.R2 = L.flag(1); S.R3 = L.flag(0); } // R
      else if (c === 0x53) S.S = L.num(0, 32000, 30);                                      // S
      else if (c === 0x54) S.T = L.num(0, 4000, 40) / 100;                                 // T
      else if (c === 0x62) S.b = L.num(0, 4000, 1000);                                     // b
      else if (c === 0x65) S.e = 1;                                                        // e
      else if (c === 0x66) S.f = 1;                                                        // f
      else if (c === 0x67) { S.g1 = L.num(-4000, 4000, 20) / 100; S.g2 = L.num(-4000, 4000, 40) / 100; } // g
      else if (c === 0x6d) S.m = L.num(0, 32000, 3000) / 1000;                             // m
      else if (c === 0x72) { S.r = 1; S.rCell = L.num(0, 2080, -1); }                      // r
      else if (c === 0x73) S.s = 1;                                                        // s
      else if (c === 0x74) S.t = L.num(0, 1000, 0);                                        // t
      else if (c === 0x78) S.x = 1;                                                        // x
      if (!L.skipToken()) break;
    }
    return S;
  }

  function pass2(bytes) {
    const ops = [];
    const L = new Lexer(bytes);
    for (;;) {
      const c = L.getc();
      if (c === 0x7e) ops.push({ op: 'S8timing', cell: L.num(0, 2080, -1), k: L.num(0, 15, 0) });
      else if (c === 0x49 || c === 0x4f || c === 0x69 || c === 0x6f) {
        const cell = L.num(0, 2080, -1);
        if (cell >= 0) ops.push({ op: 'trigger', value: (c === 0x49 || c === 0x69) ? 1 : 0, item: c === 0x69 || c === 0x6f, cell });
      }
      if (!L.skipToken()) break;
    }
    return ops;
  }

  E.scriptPass1 = pass1;
  E.scriptPass2 = pass2;
})(window.ESPRIT = window.ESPRIT || {});
