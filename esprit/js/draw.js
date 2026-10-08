// Rendering: sprite atlas, playfield layers, figures, status bar, inventory, font and ticker.
'use strict';
(function (E) {
  const ONE = 0x10000;
  const hi = (v) => v >> 16;
  const SPR = (x, y) => 20 * y + x;

  // ---- assets -----------------------------------------------------------------------------------
  function loadAssets() {
    const P = E.DATA.pictures, B = E.b64ToBytes;
    const pic = (n) => E.Bitmap.fromST(E.unpac(B(P[n])));
    const strip = (a, b) => { const bm = new E.Bitmap(640, 800); bm.px.set(a.px, 0); bm.px.set(b.px, 640 * 400); return bm; };
    E.sprites = strip(pic('SPRITEA.PAC'), pic('SPRITEB.PAC'));
    E.masks = strip(pic('MSPRITEA.PAC'), pic('MSPRITEB.PAC'));   // file semantics: 1 = opaque
    E.title = pic('TITLE.PAC');
    E.bossPic = pic('BIC.PAC');
    E.masked = new Uint8Array(500);
    for (let i = 0; i < 500; i++) {
      const x0 = (i % 20) * 32, y0 = Math.floor(i / 20) * 32;
      let any = 0;
      for (let y = 0; y < 32 && !any; y++) for (let x = 0; x < 32; x++) if (E.masks.px[(y0 + y) * 640 + x0 + x]) { any = 1; break; }
      E.masked[i] = any;
    }
    E.figures = E.unshl(B(P['FIGURES.SHL']));
    E.font = E.unshl(B(P['ESFNT.SHL']));
  }

  // Item pick-up / hollow test @103e2: tests the (horizontally mirrored) mask pixel of the item sprite.
  E.itemMaskHit = function (spr, x, y) {
    if (spr < 0) spr = 0;
    if (!E.masked[spr]) return true;
    const x0 = (spr % 20) * 32, y0 = Math.floor(spr / 20) * 32;
    return E.masks.px[(y0 + y) * 640 + x0 + (31 - x)] === 1;
  };

  // ---- primitive blits ----------------------------------------------------------------------------
  function blitCell(fb, spr, dx, dy, mode) {
    if (spr < 0) spr = 0;
    const sx = (spr % 20) * 32, sy = Math.floor(spr / 20) * 32;
    const S = E.sprites.px, M = E.masks.px, D = fb.px;
    for (let y = 0; y < 32; y++) {
      const ty = dy + y; if (ty < 0 || ty >= fb.h) continue;
      let si = (sy + y) * 640 + sx, di = ty * fb.w + dx;
      for (let x = 0; x < 32; x++, si++, di++) {
        if (dx + x < 0 || dx + x >= fb.w) continue;
        switch (mode) {
          case 0: D[di] = S[si]; break;                          // copy
          case 1: D[di] = (D[di] & (M[si] ^ 1)) | S[si]; break;  // masked: (dst AND NOT mask) OR spr
          case 2: D[di] |= S[si]; break;                         // OR (shadow pattern)
          case 3: D[di] = S[si] | (M[si] ^ 1); break;            // icon on black background
        }
      }
    }
  }
  const drawCellSprite = (fb, spr, dx, dy) => blitCell(fb, spr, dx, dy, E.masked[spr < 0 ? 0 : spr] ? 1 : 0);
  const drawIcon = (fb, spr, dx, dy) => blitCell(fb, spr, dx, dy, E.masked[spr < 0 ? 0 : spr] ? 3 : 0);

  // shape from an SHL library; mode 'masked' (figures) or 'white' (text: ink set to white)
  function drawShape(fb, sh, x, y, mode, clip) {
    if (!sh) return;
    const X = x + sh.dx, Y = y + sh.dy;
    const c = clip || { x0: 0, y0: 0, x1: fb.w, y1: fb.h };
    for (let j = 0; j < sh.h; j++) {
      const ty = Y + j; if (ty < c.y0 || ty >= c.y1) continue;
      for (let i = 0; i < sh.w; i++) {
        const tx = X + i; if (tx < c.x0 || tx >= c.x1) continue;
        const k = j * sh.bw + i, d = ty * fb.w + tx;
        if (mode === 'white') { if (sh.img[k]) fb.px[d] = 0; }
        else if (sh.mask) { if (sh.mask[k] || sh.img[k]) fb.px[d] = sh.img[k]; }
        else if (sh.img[k]) fb.px[d] = 1;
      }
    }
  }

  // ---- text ----------------------------------------------------------------------------------------
  // A text view = font + space width + letter spacing (+ optional clip rect)
  function textWidth(str, spaceW = 10, spacing = 2) {
    let w = 0, n = 0;
    for (const ch of str) {
      const code = typeof ch === 'number' ? ch : ch.charCodeAt(0);
      const g = E.font[code];
      w += code === 32 ? spaceW : g ? g.w : 0; n++;                // TXT_Width: missing glyph = 0
    }
    return w + spacing * Math.max(0, n - 1);
  }
  function drawText(fb, str, x, y, opts = {}) {
    const spaceW = opts.spaceW ?? 10, spacing = opts.spacing ?? 2;
    let cx = x;
    for (const ch of str) {
      const code = typeof ch === 'number' ? ch : ch.charCodeAt(0);
      const g = E.font[code];
      if (code === 32) { cx += spaceW + spacing; continue; }
      if (!g) { cx += spacing; continue; }                       // no shape: width 0
      drawShape(fb, g, cx - g.dx, y, 'white', opts.clip);
      cx += g.w + spacing;
    }
    return cx;
  }
  function drawCentered(fb, str, x, y, opts = {}) {
    const w = textWidth(str, opts.spaceW ?? 10, opts.spacing ?? 2);
    return drawText(fb, str, x - Math.trunc(w / 2), y, opts);
  }
  // TXT_DrawJustified @14a18 (ASH logo): the glyphs of str are spread over `width` px centred at cx;
  // glyph i's left edge = cx - width div 2 + (sum of previous glyph widths) + gap*i div (n-1).
  function drawJustified(fb, str, cx, y, width) {
    const codes = Array.from(str, (ch) => (typeof ch === 'number' ? ch : ch.charCodeAt(0)));
    const left = cx - Math.trunc(width / 2);
    let sum = 0;
    for (const c of codes) sum += E.font[c] ? E.font[c].w : 0;
    const gap = width - sum, n1 = Math.max(1, codes.length - 1);
    let cum = 0;
    codes.forEach((c, i) => {
      const g = E.font[c];
      if (!g) return;
      drawShape(fb, g, left + cum + Math.trunc((gap * i) / n1) - g.dx, y, 'white');
      cum += g.w;
    });
  }
  // TXT height of a string (P144ac) for a single glyph
  const glyphHeight = (code) => (E.font[code] ? E.font[code].h : 0);
  // Atari charset bytes -> JS string of char codes (font is indexed by Atari codes)
  const atariStr = (bytes) => bytes.slice();

  // ---- status bar (GFX_DrawStatusBar @18440) -------------------------------------------------------
  function drawStatusBar(fb) {
    fb.fillRect(0, 352, 640, 48, 1);
    const part = (spr, x, y, sy, h) => {                       // icon op restricted to sprite lines sy..sy+h
      const tmp = new E.Bitmap(32, 32);
      tmp.clear(1);
      blitCell(tmp, spr, 0, 0, E.masked[spr] ? 3 : 0);
      fb.blit(tmp, 0, sy, 32, h, x, y);
    };
    for (let col = 0; col < 20; col++) {
      let top;
      if (col === 0) top = SPR(0, 18);
      else if (col === 19) top = SPR(3, 18);
      else if (col === 4) top = SPR(3, 18);
      else if (col === 5) top = SPR(0, 18);
      else if (col === 6) top = SPR(2, 18);
      else top = SPR(1, 18);
      part(top, col * 32, 352, 0, 8);
      part(top, col * 32, 392, 24, 8);
    }
    for (let col = 0; col <= 4; col++) drawIcon(fb, SPR(4 + col, 18), col * 32, 360);
    drawIcon(fb, SPR(4, 18), 160, 360);
    drawIcon(fb, SPR(8, 18), 608, 360);
  }
  function drawInventory(fb, inv) {
    for (let k = 0; k < 13; k++) {
      const code = inv.slots[k];
      const spr = code ? E.CODE2SPRITE[code] : -1;
      drawIcon(fb, spr < 0 ? 0 : spr, 192 + 32 * k, 360);
    }
  }

  // ---- scrolling message (TXT_TickerStart @14cd4 / TXT_TickerStep @14eb6) ---------------------------
  // TXT_TickerStart(text, view, y=24, speed): the original keeps one text position per screen buffer
  // (A starts at rect-x 415, B at 415+speed) and scrolls the back buffer's rect by 2*speed px per
  // frame, drawing only the glyphs entering on the right. The step runs before the frame is shown and
  // starts with buffer B, so the displayed frames show the whole string at 415-speed, 415-2*speed, ...
  // (clipped to the rect). It stops when both buffers' text ends are < 0, i.e. at the first step with
  // pos + width < -speed. speed: 5 for the mouse-help and game-over code tickers, the script's text
  // mode (4 normal, 2 = text contains a level code) for TEXT_L / TEXT_l messages.
  class Ticker {
    constructor(game, bytes, speed = 5) {
      this.text = Array.from(bytes);
      this.speed = speed;
      this.pos = 415;                                            // left edge relative to x=192
      this.width = textWidth(this.text, 10, 6);
      this.done = false;
    }
    // The original moved `speed` px per frame but slowed the whole game to 2 VBLs per frame while a
    // message scrolled. Here the game keeps running at full speed and the text moves speed/2 per
    // frame, which gives the same on-screen scroll speed.
    step() { this.pos -= this.speed / 2; if (this.pos + this.width < -this.speed) this.done = true; }
    draw(fb) {
      fb.fillRect(192, 360, 416, 32, 1);
      drawText(fb, this.text, 192 + Math.round(this.pos), 384, { spaceW: 10, spacing: 6, clip: { x0: 192, y0: 360, x1: 608, y1: 392 } });
    }
  }

  // ---- playfield ------------------------------------------------------------------------------------
  function drawPlayfield(fb, lv) {
    const w = lv.world, vx = lv.view.x, vy = lv.view.y;
    const cols = Math.min(20, w.W), rows = Math.min(11, w.H);
    fb.fillRect(0, 0, 640, 352, 1);
    const stoneLayer = () => {
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const c = (vy + y) * w.W + vx + x;
        if (w.stone[c] && w.stoneSpr[c] >= 0) drawCellSprite(fb, w.stoneSpr[c], x * 32, y * 32);
      }
    };
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      const c = (vy + y) * w.W + vx + x, dx = x * 32, dy = y * 32;
      blitCell(fb, w.floors[w.floor[c]].sprite, dx, dy, 0);
      const sh = w.shadow[c];
      if (sh >= 0) blitCell(fb, 20 + sh, dx, dy, 2);
      const is = w.itemSpr[c];
      if (w.item[c] && is >= 0) {
        if (E.masked[is]) { blitCell(fb, is, dx, dy, 1); if (sh >= 0) blitCell(fb, 20 + sh, dx, dy, 2); }
        else blitCell(fb, is, dx, dy, 0);
      }
    }
    stoneLayer();
    const ox = -32 * vx, oy = -32 * vy;
    const clip = { x0: 0, y0: 0, x1: 640, y1: 352 };
    for (const a of lv.actors) {
      if (!a.active || a.shadow < 0) continue;
      drawShape(fb, E.figures[a.shadow], hi(a.x + a.shadowDX) + ox, hi(a.y + a.shadowDY) + oy, 'masked', clip);
    }
    stoneLayer();
    for (const a of lv.actors) {
      if (!a.active) continue;
      if (a.body >= 0) drawShape(fb, E.figures[a.body], hi(a.x) + ox, hi(a.y) + oy, 'masked', clip);
      if (a.overlay && a.overlay.shape >= 0) drawShape(fb, E.figures[a.overlay.shape], hi(a.x + a.overlay.dx) + ox, hi(a.y + a.overlay.dy) + oy, 'masked', clip);
    }
    stoneLayer();
    for (const s of lv.sparks) drawShape(fb, E.figures[hi(s.frame)], hi(s.x) + ox, hi(s.y) + oy, 'masked', clip);
  }

  Object.assign(E, { loadAssets, blitCell, drawCellSprite, drawIcon, drawShape, textWidth, drawText, drawCentered, drawJustified, glyphHeight,
    drawStatusBar, drawInventory, drawPlayfield, Ticker, SPR, atariStr });
})(window.ESPRIT = window.ESPRIT || {});
