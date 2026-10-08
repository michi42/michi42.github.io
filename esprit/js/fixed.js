// Exact 16.16 fixed-point arithmetic and the original random number generator.
'use strict';
(function (E) {
  const ONE = 0x10000;

  // Truncate to a signed 32-bit integer (68000 long wrap-around).
  const i32 = (v) => v | 0;
  const i16 = (v) => (v << 16) >> 16;

  // |a|*|b| >> 16 for non-negative 32-bit values without losing precision.
  function umulHi(a, b) {
    const ah = Math.floor(a / 65536), al = a % 65536;
    const bh = Math.floor(b / 65536), bl = b % 65536;
    // (ah*bh<<16) + ah*bl + al*bh + (al*bl>>16)
    return ah * bh * 65536 + ah * bl + al * bh + Math.floor(al * bl / 65536);
  }

  // FixMul @67f6: sign(a)*sign(b)*((|a|*|b|)>>16)
  function fixMul(a, b) {
    const neg = (a < 0) !== (b < 0);
    const r = umulHi(Math.abs(a), Math.abs(b));
    return i32(neg ? -r : r);
  }

  // FixMulFrac @686c: 0 <= f <= 1.0
  function fixMulFrac(a, f) {
    if (f === 0) return 0;
    if (f === ONE) return a;
    const r = Math.floor(Math.abs(a) * (f & 0xffff) / 65536);
    return a < 0 ? -r : r;
  }

  // FixDamp @68b6: v * min(1, fric*k)
  function fixDamp(v, fric, k) {
    let f;
    if (k === 0) return 0;
    if (k === ONE) f = fric;
    else if (k > ONE) { f = fric + Math.floor(((k & 0xffff) * (fric & 0xffff)) / 65536); if (f > ONE) f = ONE; }
    else f = (fric === ONE) ? k : Math.floor(((k & 0xffff) * (fric & 0xffff)) / 65536);
    return fixMulFrac(v, f);
  }

  const fix = (r) => Math.trunc(r * 65536);       // RealToFix
  const ipart = (v) => v >> 16;                    // integer part (floor)

  // Integer square root @6c3a (P6b24 = isqrt(hi(x)^2 + hi(y)^2) jumps there). Newton iteration in
  // 16-bit words, NOT floor-exact (isqrt(3) = 2, isqrt(8) = 3; garbage for n >= 2^29 because the
  // add.w carry is lost). Start x = 2^ceil(msb/2); x' = ((n divu x) + x).w >> 1 while x' < x (signed).
  function isqrt(n) {
    n = n | 0;
    if (n <= 0) return 0;
    const b = 31 - Math.clz32(n);
    let x = 1 << ((b >> 1) + (b & 1));
    for (;;) {
      if (x === 0) return 0;                       // (divide-by-zero trap; unreachable)
      const q = Math.floor(n / x);
      const lo = q > 0xffff ? (n & 0xffff) : q;    // divu.w overflow leaves the dividend
      const nx = ((lo + x) & 0xffff) >>> 1;
      if (i16(nx) < i16(x)) { x = nx; continue; }
      return nx;
    }
  }

  // ---- RNG (SeedRandom @6742, Random @66d6, RandRange @675a) ----
  class RNG {
    constructor(seed) { this.st = new Uint16Array(16); this.seed(seed === undefined ? (Date.now() & 0xffff) : seed); }
    seed(s) {
      let d0 = s & 0xffff;
      for (let i = 0; i < 16; i++) {
        this.st[i] = d0;
        d0 = (d0 + (15 - i)) & 0xffff;
        d0 = ((d0 << 1) | (d0 >> 15)) & 0xffff;
      }
    }
    randomize() { this.seed((Math.random() * 65536) | 0); }
    random() {
      const T = E.RNG_TAB;
      let r = 0;
      for (let i = 0; i < 16; i++) {
        const w = this.st[i];
        if ((T[(w >> 4) & 0xff] >> (w & 7)) & 1) r |= 1 << (15 - i);
      }
      let d0 = r;
      for (let i = 0; i < 16; i++) {
        this.st[i] = (this.st[i] + d0 + 0x23) & 0xffff;
        d0 = ((d0 << 1) | (d0 >> 15)) & 0xffff;
      }
      return r;
    }
    // RandRange @675a: lo + (Random() & 0x7fff) mod (hi-lo+1)
    range(lo, hi) {
      const n = i16(hi + 1 - lo);
      if (n === 0) return lo;
      return i16(lo + ((this.random() & 0x7fff) % n));
    }
  }

  // Level code numbers: code[1] = 27182818, then 100 unique 8-digit numbers.
  function levelCodes(seed) {
    const g = new RNG(seed);
    const c = [0, 27182818];
    const seen = new Set([27182818]);
    while (c.length <= 101) {
      let v;
      do { v = (g.random() * 65536 + g.random()) % 100000000; } while (seen.has(v));
      seen.add(v); c.push(v);
    }
    return c;
  }
  const code8 = (n) => String(n).padStart(8, '0');

  Object.assign(E, { ONE, i32, i16, fixMul, fixMulFrac, fixDamp, fix, ipart, isqrt, RNG, levelCodes, code8 });
})(window.ESPRIT = window.ESPRIT || {});
