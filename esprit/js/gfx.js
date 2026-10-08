// 1-bit software framebuffer emulating the Atari ST monochrome screen (640x400).
// Pixel value 1 = black (ink), 0 = white (paper), exactly like ST high resolution.
'use strict';
(function (E) {
  const W = 640, H = 400;

  // Unpack a 32000-byte ST mono bitmap into one byte per pixel.
  function unpackMono(bytes) {
    const px = new Uint8Array(W * H);
    for (let i = 0; i < 32000; i++) {
      const b = bytes[i], o = i * 8;
      px[o] = b >> 7 & 1; px[o + 1] = b >> 6 & 1; px[o + 2] = b >> 5 & 1; px[o + 3] = b >> 4 & 1;
      px[o + 4] = b >> 3 & 1; px[o + 5] = b >> 2 & 1; px[o + 6] = b >> 1 & 1; px[o + 7] = b & 1;
    }
    return px;
  }

  class Bitmap {
    constructor(w, h, px) {
      this.w = w; this.h = h;
      this.px = px || new Uint8Array(w * h);
    }
    static fromST(bytes) { return new Bitmap(W, H, unpackMono(bytes)); }
    clear(v = 0) { this.px.fill(v); }
    // Copy a rectangle from src. mode: 'copy' | 'or' | 'and' | 'xor' | 'andnot'
    blit(src, sx, sy, w, h, dx, dy, mode = 'copy') {
      // clip
      if (dx < 0) { sx -= dx; w += dx; dx = 0; }
      if (dy < 0) { sy -= dy; h += dy; dy = 0; }
      if (dx + w > this.w) w = this.w - dx;
      if (dy + h > this.h) h = this.h - dy;
      if (w <= 0 || h <= 0) return;
      const S = src.px, D = this.px, sw = src.w, dw = this.w;
      for (let y = 0; y < h; y++) {
        let si = (sy + y) * sw + sx, di = (dy + y) * dw + dx;
        switch (mode) {
          case 'copy': for (let x = 0; x < w; x++) D[di++] = S[si++]; break;
          case 'or': for (let x = 0; x < w; x++) D[di++] |= S[si++]; break;
          case 'and': for (let x = 0; x < w; x++) D[di++] &= S[si++]; break;
          case 'xor': for (let x = 0; x < w; x++) D[di++] ^= S[si++]; break;
          case 'andnot': for (let x = 0; x < w; x++) D[di++] &= S[si++] ^ 1; break;
        }
      }
    }
    // Masked sprite: dest = (dest AND NOT mask) OR (sprite AND mask), mask 1 = opaque.
    blitMasked(sprite, mask, sx, sy, w, h, dx, dy, mx = sx, my = sy) {
      if (dx < 0) { sx -= dx; mx -= dx; w += dx; dx = 0; }
      if (dy < 0) { sy -= dy; my -= dy; h += dy; dy = 0; }
      if (dx + w > this.w) w = this.w - dx;
      if (dy + h > this.h) h = this.h - dy;
      if (w <= 0 || h <= 0) return;
      const S = sprite.px, M = mask.px, D = this.px, sw = sprite.w, mw = mask.w, dw = this.w;
      for (let y = 0; y < h; y++) {
        let si = (sy + y) * sw + sx, mi = (my + y) * mw + mx, di = (dy + y) * dw + dx;
        for (let x = 0; x < w; x++, si++, mi++, di++) {
          if (M[mi]) D[di] = S[si];
        }
      }
    }
    fillRect(x, y, w, h, v) {
      for (let j = Math.max(0, y); j < Math.min(this.h, y + h); j++)
        this.px.fill(v, j * this.w + Math.max(0, x), j * this.w + Math.min(this.w, x + w));
    }
  }

  // Presents a Bitmap on a canvas element.
  class Screen {
    constructor(canvas) {
      this.canvas = canvas;
      canvas.width = W; canvas.height = H;
      this.ctx = canvas.getContext('2d');
      this.img = this.ctx.createImageData(W, H);
      this.u32 = new Uint32Array(this.img.data.buffer);
      this.fb = new Bitmap(W, H);
      this.ink = 0xff000000;   // black, ABGR little endian
      this.paper = 0xffffffff; // white
    }
    present() {
      const P = this.fb.px, U = this.u32, ink = this.ink, paper = this.paper;
      for (let i = 0; i < P.length; i++) U[i] = P[i] ? ink : paper;
      this.ctx.putImageData(this.img, 0, 0);
    }
  }

  E.SCREEN_W = W; E.SCREEN_H = H;
  E.Bitmap = Bitmap;
  E.Screen = Screen;
  E.unpackMono = unpackMono;
})(window.ESPRIT = window.ESPRIT || {});
