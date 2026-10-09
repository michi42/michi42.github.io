// Mouse/keyboard input. The marble is steered by relative mouse motion like on the ST,
// so the canvas uses the Pointer Lock API to receive unbounded movement deltas.
'use strict';
(function (E) {
  class Input {
    constructor(canvas) {
      this.canvas = canvas;
      this.dx = 0; this.dy = 0;          // accumulated motion since last poll (screen pixels)
      this.buttons = 0;                  // bit0 = left, bit1 = right
      this.clicks = [];                  // queued button presses: 'left' | 'right'
      this.keys = [];                    // queued key presses (KeyboardEvent.code)
      this.keyChar = {};                 // KeyboardEvent.code -> last KeyboardEvent.key
      this.locked = false;
      this.sensitivity = 1;
      canvas.addEventListener('mousedown', (e) => {
        if (!this.locked && canvas.requestPointerLock) {
          // the click that captures the mouse is not passed to the game
          canvas.requestPointerLock();
          e.preventDefault();
          return;
        }
        const b = e.button === 2 ? 2 : (e.button === 0 ? 1 : 0);
        if (!b) return;
        this.buttons |= b;
        this.clicks.push(b === 1 ? 'left' : 'right');
        e.preventDefault();
      });
      window.addEventListener('mouseup', (e) => {
        const b = e.button === 2 ? 2 : (e.button === 0 ? 1 : 0);
        this.buttons &= ~b;
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
      document.addEventListener('pointerlockchange', () => {
        this.locked = document.pointerLockElement === canvas;
      });
      window.addEventListener('mousemove', (e) => {
        if (!this.locked) return;
        this.dx += e.movementX * this.sensitivity;
        this.dy += e.movementY * this.sensitivity;
      });
      window.addEventListener('keydown', (e) => {
        if (e.repeat) return;
        if (e.code === 'F9' && this.onF9) { e.preventDefault(); this.onF9(); return; }   // display options, not game keys
        if (e.code === 'F8') { e.preventDefault(); E.setIntegerScaling(!E.integerScaling()); return; }
        this.keys.push(e.code);
        this.keyChar[e.code] = e.key;    // typed character (layout-aware), used for the name entry
        if (/^F\d+$/.test(e.code) || e.code === 'Space' || e.code === 'Tab') e.preventDefault();
      });
    }
    // Returns and clears the accumulated motion (CSS pixels, may be fractional; the game converts
    // it to mickeys and keeps the remainder).
    takeMotion() {
      const m = { dx: this.dx, dy: this.dy };
      this.dx = 0; this.dy = 0;
      return m;
    }
    takeClick() { return this.clicks.shift(); }
    takeKey() { return this.keys.shift(); }
    releaseLock() { if (document.exitPointerLock) document.exitPointerLock(); }
  }
  E.Input = Input;
})(window.ESPRIT = window.ESPRIT || {});
