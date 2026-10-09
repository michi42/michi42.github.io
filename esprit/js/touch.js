// Mobile support (not in the original): touch controls, tilt steering via devicemotion, fullscreen in
// landscape, an on-screen menu replacing the function keys and a hidden text field for the virtual
// keyboard (code entry / diploma name).
//   - tap anywhere            = left mouse button (use the left inventory object, start, ...)
//   - drag on the inventory   = right mouse button (rotate the inventory, one step per 32 px)
//   - tap on the esprit logo  = menu (restart, abort, sound, language, tilt sensitivity, calibrate)
//   - tilt the device         = mouse movement
// Landscape is only locked while in fullscreen; in portrait the picture is letterboxed.
'use strict';
(function (E) {
  const G0 = 9.81;

  class Touch {
    constructor(canvas, input, game, sound) {
      this.canvas = canvas; this.input = input; this.game = game; this.sound = sound;
      this.active = false;            // a touch was seen: we are on a touch device
      this.started = false;           // first gesture done (fullscreen, permissions)
      this.tilt = { x: 0, y: 0 };     // calibrated screen-plane tilt (m/s^2)
      this.raw = null;                // last uncalibrated screen-plane vector
      this.neutral = null;
      this.flip = null;               // sign convention of accelerationIncludingGravity (detected)
      this.zAvg = 0;
      this.gain = 1.0;                // mickeys per frame per m/s^2
      try { const g = +localStorage.getItem('esprit.tilt'); if (g > 0) this.gain = Math.max(0.25, Math.min(4, g)); } catch (e) { /* ignore */ }
      this.drag = null;
      this.menuEl = document.getElementById('menu');
      this.kbd = document.getElementById('kbd');
      input.takeTilt = () => this.takeTilt();
      input.touch = this;
      const opts = { passive: false };
      canvas.addEventListener('touchstart', (e) => this.onStart(e), opts);
      canvas.addEventListener('touchmove', (e) => this.onMove(e), opts);
      canvas.addEventListener('touchend', (e) => this.onEnd(e), opts);
      canvas.addEventListener('touchcancel', (e) => this.onEnd(e), opts);
      window.addEventListener('devicemotion', (e) => this.onMotion(e));
      document.addEventListener('fullscreenchange', () => this.onFullscreenChange());
      document.addEventListener('webkitfullscreenchange', () => this.onFullscreenChange());
      this.setupMenu();
      this.setupKeyboard();
    }

    // ---------------------------------------------------------------- touches
    pos(t) {
      const r = this.canvas.getBoundingClientRect();
      return { x: (t.clientX - r.left) * 640 / r.width, y: (t.clientY - r.top) * 400 / r.height };
    }
    firstGesture() {
      this.started = true;
      this.sound.unlock();
      const el = document.documentElement;
      const fs = el.requestFullscreen || el.webkitRequestFullscreen;
      // landscape is only locked while in fullscreen; otherwise portrait just letterboxes the picture
      if (fs && !this.isFullscreen()) {
        try {
          const p = fs.call(el, { navigationUI: 'hide' });
          if (p && p.then) p.then(() => this.lockLandscape(), () => {});
        } catch (e) { /* not allowed */ }
      } else if (this.isFullscreen()) this.lockLandscape();
      // iOS 13+: motion sensors need an explicit permission from a user gesture
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().catch(() => {});
      }
    }
    isFullscreen() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
    lockLandscape() {
      if (this.isFullscreen() && screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    }
    onFullscreenChange() {
      if (!this.isFullscreen() && screen.orientation && screen.orientation.unlock) {
        try { screen.orientation.unlock(); } catch (e) { /* not supported */ }
      }
      window.dispatchEvent(new Event('resize'));
    }
    onStart(e) {
      e.preventDefault();
      if (!this.active) { this.active = true; document.body.classList.add('touch'); window.dispatchEvent(new Event('resize')); }
      if (!this.started) { this.firstGesture(); return; }   // the first tap only sets things up
      if (e.touches.length >= 2) { this.openMenu(); return; }
      const t = e.changedTouches[0], p = this.pos(t);
      if (p.y >= 352 && p.x < 160) { this.drag = { menu: true, id: t.identifier }; return; }
      if (p.y >= 352 && p.x >= 192 && p.x < 608 && this.game.level) {
        this.drag = { id: t.identifier, x: p.x, acc: 0, moved: false };
        return;
      }
      if (this.game.textEntry === 'text' || (this.game.textEntry && p.y >= 352)) { this.showKeyboard(); return; }
      this.input.tapPos = p;
      this.input.clicks.push('left');
    }
    onMove(e) {
      e.preventDefault();
      const d = this.drag; if (!d || d.menu) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== d.id) continue;
        const p = this.pos(t);
        d.acc += p.x - d.x; d.x = p.x;
        // drag left = items move left (like the right button), drag right = the other way
        while (Math.abs(d.acc) >= 32) {
          this.input.clicks.push(d.acc < 0 ? 'rotfwd' : 'rotback');
          d.acc -= Math.sign(d.acc) * 32; d.moved = true;
        }
      }
    }
    onEnd(e) {
      e.preventDefault();
      const d = this.drag; if (!d) return;
      for (const t of e.changedTouches) {
        if (t.identifier !== d.id) continue;
        if (d.menu) this.openMenu();
        else if (!d.moved) { this.input.tapPos = this.pos(t); this.input.clicks.push('left'); }   // tap on the bar
        this.drag = null;
      }
    }

    // ---------------------------------------------------------------- tilt steering
    // accelerationIncludingGravity is the reaction to gravity in Chrome (z = +9.81 lying face up),
    // but gravity itself in Firefox for Android and Safari on iOS (all axes negated). The convention is
    // detected from the sign of z (a game device is held face up); when the device is nearly vertical
    // the user agent decides.
    onMotion(e) {
      const a = e.accelerationIncludingGravity;
      if (!a || a.x === null || a.x === undefined) return;
      this.zAvg = this.zAvg * 0.9 + (a.z || 0) * 0.1;
      if (this.zAvg > 2) this.flip = false;
      else if (this.zAvg < -2) this.flip = true;
      else if (this.flip === null) this.flip = /Firefox|iPhone|iPad|iPod/.test(navigator.userAgent);
      const s = this.flip ? -1 : 1;
      // force on the marble in device coordinates (x right, y up): the marble rolls downhill
      const fx = -s * a.x, fy = -s * a.y;
      // to portrait screen coordinates (y down), then rotate by the screen orientation
      const px = fx, py = -fy;
      const ang = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 0) * Math.PI / 180;
      const c = Math.cos(-ang), sn = Math.sin(-ang);
      this.raw = { x: px * c - py * sn, y: px * sn + py * c };
      if (!this.neutral) this.calibrate();
      this.motionSeen = true;
    }
    calibrate() { if (this.raw) this.neutral = { x: this.raw.x, y: this.raw.y }; }
    takeTilt() {
      if (!this.raw || !this.neutral || this.menuOpen) return { x: 0, y: 0 };
      let x = this.raw.x - this.neutral.x, y = this.raw.y - this.neutral.y;
      const dz = 0.25, dead = (v) => (Math.abs(v) < dz ? 0 : v - Math.sign(v) * dz);
      x = Math.max(-G0, Math.min(G0, dead(x))); y = Math.max(-G0, Math.min(G0, dead(y)));
      return { x: x * this.gain, y: y * this.gain };
    }
    setGain(g) {
      this.gain = Math.max(0.25, Math.min(4, g));
      try { localStorage.setItem('esprit.tilt', String(this.gain)); } catch (e) { /* ignore */ }
      this.updateMenu();
    }

    // ---------------------------------------------------------------- menu (replaces the F keys)
    setupMenu() {
      const m = this.menuEl; if (!m) return;
      m.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const act = b.dataset.act;
        const key = (k) => { this.closeMenu(); this.input.keys.push(k); };
        if (act === 'close') this.closeMenu();
        else if (act === 'restart') key('F3');
        else if (act === 'abort') key('F2');
        else if (act === 'sound') { this.game.toggleSound(); this.updateMenu(); }
        else if (act === 'lang') { this.game.cycleLanguage(); this.updateMenu(); }
        else if (act === 'calib') { this.calibrate(); this.closeMenu(); }
        else if (act === 'fullscreen') this.toggleFullscreen();
        else if (act === 'intscale') { E.setIntegerScaling(!E.integerScaling()); this.updateMenu(); }
      });
      m.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
      // sensitivity slider: logarithmic, -200..200 = 25%..400% (2^(v/100))
      const sl = m.querySelector('#tiltslider');
      if (sl) sl.addEventListener('input', () => this.setGain(Math.pow(2, +sl.value / 100)));
    }
    openMenu() {
      if (!this.menuEl) return;
      this.menuOpen = true; this.game.paused = true;
      this.updateMenu();
      this.menuEl.classList.add('open');
    }
    closeMenu() {
      if (!this.menuEl) return;
      this.menuOpen = false; this.game.paused = false;
      this.menuEl.classList.remove('open');
      this.calibrate();
    }
    updateMenu() {
      const m = this.menuEl; if (!m) return;
      const L = this.game.language;
      const T = (de, en, fr) => [de, en, fr][L];
      const set = (act, txt) => { const b = m.querySelector(`[data-act="${act}"]`); if (b) b.textContent = txt; };
      set('close', T('Weiter', 'Continue', 'Continuer'));
      set('restart', T('Bild nochmal beginnen', 'Start level again', 'Recommencez le tableau'));
      set('abort', T('Spiel abbrechen', 'Interrupt game', 'Interruption du jeu'));
      set('sound', T('Ton: ', 'Sound: ', 'Son: ') + (this.game.soundOn ? T('an', 'on', 'oui') : T('aus', 'off', 'non')));
      set('lang', T('Sprache: Deutsch', 'Language: English', 'Langue: Français'));
      set('calib', T('Neigung kalibrieren', 'Calibrate tilt', "Calibrer l'inclinaison"));
      set('fullscreen', T('Vollbild', 'Fullscreen', 'Plein écran'));
      set('intscale', T('Ganzzahlige Skalierung: ', 'Integer scaling: ', 'Échelle entière: ') +
        (E.integerScaling && E.integerScaling() ? T('an', 'on', 'oui') : T('aus', 'off', 'non')));
      const g = m.querySelector('#tiltval'); if (g) g.textContent = Math.round(this.gain * 100) + '%';
      const sl = m.querySelector('#tiltslider');
      if (sl && document.activeElement !== sl) sl.value = String(Math.round(Math.log2(this.gain) * 100));
      const tl = m.querySelector('#tiltlabel'); if (tl) tl.textContent = T('Empfindlichkeit', 'Tilt sensitivity', 'Sensibilité');
    }
    toggleFullscreen() {
      if (this.isFullscreen()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { this.started = false; this.firstGesture(); }
    }

    // ---------------------------------------------------------------- virtual keyboard
    setupKeyboard() {
      const k = this.kbd; if (!k) return;
      const push = (code, ch) => { this.input.keys.push(code); if (ch) this.input.keyChar[code] = ch; };
      const typed = (str) => {
        for (const ch of str) {
          if (/[0-9]/.test(ch)) push('Digit' + ch, ch);
          else if (/[a-z]/i.test(ch)) push('Key' + ch.toUpperCase(), ch);
          else if (ch === ' ') push('Space', ' ');
          else { const code = 'Char' + ch.charCodeAt(0); push(code, ch); }
        }
      };
      k.addEventListener('beforeinput', (e) => {
        if (e.inputType === 'insertText' && e.data) typed(e.data);
        else if (e.inputType === 'deleteContentBackward') push('Backspace');
        else if (e.inputType === 'insertLineBreak') push('Enter');
        else return;
        e.preventDefault();
      });
      k.addEventListener('input', () => { if (k.value) { typed(k.value); k.value = ''; } });
      k.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { push('Enter'); e.preventDefault(); k.blur(); }
        e.stopPropagation();
      });
    }
    showKeyboard() {
      const k = this.kbd; if (!k) return;
      k.inputMode = this.game.textEntry === 'digits' ? 'numeric' : 'text';
      k.value = '';
      k.focus();
    }
    // called every frame: hide the keyboard when no text is expected any more
    update() {
      if (this.kbd && !this.game.textEntry && document.activeElement === this.kbd) this.kbd.blur();
    }
  }
  E.Touch = Touch;
})(window.ESPRIT = window.ESPRIT || {});
