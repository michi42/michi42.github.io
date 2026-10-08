// Decoders for the original ESPRIT picture formats (.PAC images, .SHL shape libraries).
'use strict';
(function (E) {

  // ---- .PAC: "espritms" compressed 640x400 monochrome picture (mirror of PAC_Unpack @1273a) ----
  function unpac(data) {
    const magic = String.fromCharCode(...data.subarray(0, 8));
    if (magic !== 'espritms') throw new Error('not a PAC file');
    const h = data.subarray(8);
    const dv = new DataView(h.buffer, h.byteOffset, h.byteLength);
    const bw = dv.getUint16(8), bh = dv.getUint16(10);
    const bitlen = dv.getUint32(12);
    const xorpat = dv.getUint16(20);
    const bits = h.subarray(32), dat = h.subarray(32 + bitlen);
    const stride = bw * 2 <= 80 ? 80 : bw * 2;
    const out = new Uint8Array(stride * bh * 16);
    let bp = 0, bitn = 8, dp = 0;
    const bit = () => { if (--bitn < 0) { bitn = 7; bp++; } return (bits[bp] >> bitn) & 1; };
    const byte = () => dat[dp++];
    const buf = new Uint8Array(32);
    for (let by = 0; by < bh; by++) {
      if (!bit()) continue;
      for (let bx = 0; bx < bw; bx++) {
        if (!bit()) continue;
        let mode = bit() << 1; mode |= bit();
        buf.fill(0);
        if (mode === 3) {
          for (let i = 0; i < 32; i++) buf[i] = byte();
        } else {
          for (const base of [0, 1, 16, 17]) {
            if (bit()) {
              const c = byte();
              for (let k = 0; k < 8; k++) if (c & (0x80 >> k)) buf[base + 2 * k] = byte();
            }
          }
          if (mode === 1) {        // word[i] ^= word[i-1]
            for (let i = 1; i < 16; i++) { buf[2 * i] ^= buf[2 * i - 2]; buf[2 * i + 1] ^= buf[2 * i - 1]; }
          } else if (mode === 2) { // long[i] ^= long[i-1]  (word[i] ^= word[i-2])
            for (let i = 1; i < 8; i++) for (let k = 0; k < 4; k++) buf[4 * i + k] ^= buf[4 * i - 4 + k];
          }
        }
        for (let r = 0; r < 16; r++) {
          const o = (by * 16 + r) * stride + bx * 2;
          out[o] = buf[2 * r]; out[o + 1] = buf[2 * r + 1];
        }
      }
    }
    if (xorpat) {
      for (let y = 0; y < bh * 16; y++) {
        const p = (y % 2 === 0) ? (xorpat >> 8) : (xorpat & 0xff);
        for (let x = 0; x < bw * 2; x++) out[y * stride + x] ^= p;
      }
    }
    return out;
  }

  // ---- .SHL: shape library (FIGURES.SHL, ESFNT.SHL) ----
  // Each shape: hot-spot offset dx,dy, size w,h, image (1 = ink) and mask (1 = opaque) at shift 0.
  function unshl(d) {
    const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
    const n = dv.getUint16(4);
    const shapes = [];
    const bitmap = (o) => {
      const wb = dv.getUint16(o + 4), h = dv.getUint16(o + 6);
      const w = wb * 8, px = new Uint8Array(w * h);
      for (let c = 0; c < wb; c++)
        for (let r = 0; r < h; r++) {
          const b = d[o + 8 + c * h + r];
          for (let k = 0; k < 8; k++) px[r * w + c * 8 + k] = (b >> (7 - k)) & 1;
        }
      return { w, h, px };
    };
    for (let i = 0; i < n; i++) {
      const so = dv.getUint32(8 + 4 * i);
      if (!so) { shapes.push(null); continue; }
      const dx = dv.getInt16(so), dy = dv.getInt16(so + 2);
      const w = dv.getUint16(so + 4), h = dv.getUint16(so + 6);
      const hasMask = dv.getUint16(so + 10);
      const img = bitmap(so + dv.getUint32(so + 12));
      let mask = null;
      if (hasMask) {
        const m = bitmap(so + dv.getUint32(so + 44));
        // file mask: 1 = keep background -> store as 1 = opaque
        mask = new Uint8Array(m.px.length);
        for (let k = 0; k < mask.length; k++) mask[k] = m.px[k] ^ 1;
      }
      shapes.push({ dx, dy, w, h, bw: img.w, img: img.px, mask });
    }
    return shapes;
  }

  E.unpac = unpac;
  E.unshl = unshl;
})(window.ESPRIT = window.ESPRIT || {});
