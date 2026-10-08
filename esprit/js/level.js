// Level file parser for the original ESPRIT .LEV format.
'use strict';
(function (E) {

  function b64ToBytes(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // RLE layers are decoded backwards. A byte with bit 7 set is a run marker,
  // preceded (in file order) by lo, hi, value: (hi<<8|lo)+1 copies of value.
  function unRLE(data, size) {
    const out = new Uint8Array(size);
    let a0 = size, a1 = data.length, d0 = size - 1;
    while (d0 >= 0 && a1 > 0) {
      const b = data[--a1];
      if (b & 0x80) {
        const v = data[--a1], hi = data[--a1], lo = data[--a1];
        const cnt = (hi << 8) | lo;
        d0 -= cnt;
        for (let i = 0; i <= cnt; i++) out[--a0] = v;
      } else {
        out[--a0] = b;
      }
      d0--;
    }
    return out;
  }

  // Link table: records src(word) n(word) dst(word)*n, terminated by 0xffff.
  // Bit 13 of a cell reference selects the item (set) or the stone (clear).
  function parseLinks(bytes) {
    const links = [];
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 0;
    while (p + 2 <= bytes.length) {
      const src = dv.getUint16(p); p += 2;
      if (src === 0xffff) break;
      const n = dv.getUint16(p); p += 2;
      const dst = [];
      for (let i = 0; i < n; i++) { dst.push(dv.getUint16(p)); p += 2; }
      links.push({ src, dst });
    }
    return links;
  }

  function parseLevel(bytes) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let p = 0;
    const L = { links: [], script: '', scriptBytes: new Uint8Array(0), linkBytes: new Uint8Array(0) };
    const w = () => { const v = dv.getUint16(p); p += 2; return v; };
    const rd = (n) => { const r = bytes.subarray(p, p + n); p += n; return r; };
    const layer = () => { const n = w(); return unRLE(rd(n), L.w * L.h); };
    while (p + 2 <= bytes.length) {
      const t = w();
      if (t === 0) {
        const hdr = rd(72);
        const hv = new DataView(hdr.buffer, hdr.byteOffset, 72);
        L.header = hv.getUint32(0);
        L.w = hv.getUint16(4); L.h = hv.getUint16(6);
        L.points = [];
        for (let i = 0; i < 8; i++) L.points.push({ x: hv.getInt32(8 + i * 8), y: hv.getInt32(12 + i * 8) });
      } else if (t === 1) {
        L.scriptBytes = rd(w());
        let s = '';
        for (const c of L.scriptBytes) { if (c === 0) break; s += String.fromCharCode(c); }
        L.script = s;
      } else if (t === 2) {
        L.linkBytes = rd(w());
        L.links = parseLinks(L.linkBytes);
      } else if (t === 3) {
        L.number = w();
      } else if (t === 4) {
        L.stones = layer(); L.items = layer(); L.floors = layer();
      } else if (t === 6) {
        L.stones = layer();
      } else if (t === 7) {
        L.items = layer();
      } else if (t === 8) {
        L.floors = layer();
      } else if (t === 5) {
        break;
      }
    }
    const n = L.w * L.h;
    L.stones = L.stones || new Uint8Array(n);
    L.items = L.items || new Uint8Array(n);
    L.floors = L.floors || new Uint8Array(n);
    return L;
  }

  function loadLevel(num) {
    return parseLevel(b64ToBytes(E.DATA.levels[num - 1]));
  }

  E.b64ToBytes = b64ToBytes;
  E.parseLevel = parseLevel;
  E.loadLevel = loadLevel;
})(window.ESPRIT = window.ESPRIT || {});
