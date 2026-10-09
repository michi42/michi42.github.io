// Boot code: canvas scaling, asset decoding, start of the game loop.
'use strict';
(function (E) {
  E.DATA = window.ESPRIT_DATA;

  // F9 toggles between scaled to the window and the original size (640x400)
  let scaled = true;
  try { scaled = localStorage.getItem('esprit.scaled') !== '0'; } catch (e) { /* ignore */ }

  function fitCanvas(canvas) {
    if (document.body.classList.contains('touch')) {
      // touch devices: use the whole screen, keeping the 16:10 aspect (small screens can't afford
      // integer scaling)
      const s = Math.min(window.innerWidth / 640, window.innerHeight / 400);
      canvas.style.width = Math.floor(640 * s) + 'px';
      canvas.style.height = Math.floor(400 * s) + 'px';
      return;
    }
    // integer scale in *device* pixels so every ST pixel becomes an equal square block
    const dpr = window.devicePixelRatio || 1;
    const availW = (window.innerWidth - 16) * dpr, availH = (window.innerHeight - 70) * dpr;
    let s = Math.min(availW / 640, availH / 400);
    s = s >= 1 ? Math.floor(s) : s;
    if (!scaled) s = Math.min(s, Math.max(1, Math.round(dpr)));   // original size: 640x400 at native density
    canvas.style.width = (640 * s) / dpr + 'px';
    canvas.style.height = (400 * s) / dpr + 'px';
  }

  window.addEventListener('load', () => {
    const canvas = document.getElementById('screen');
    // touch-first devices (phones, tablets) get the full-screen layout right away
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
    fitCanvas(canvas);
    window.addEventListener('resize', () => fitCanvas(canvas));
    const screen = new E.Screen(canvas);
    const input = new E.Input(canvas);
    input.onF9 = () => {
      scaled = !scaled;
      try { localStorage.setItem('esprit.scaled', scaled ? '1' : '0'); } catch (e) { /* ignore */ }
      fitCanvas(canvas);
    };
    const sound = new E.Sound();
    const unlock = () => sound.unlock();
    for (const ev of ['pointerdown', 'mousedown', 'keydown', 'touchend']) window.addEventListener(ev, unlock);
    E.loadAssets();
    E.screen = screen; E.input = input; E.sound = sound;
    E.game = new E.Game(screen, input, sound);
    const touch = new E.Touch(canvas, input, E.game, sound);
    E.touch = touch;
    E.game.onLevelStart = () => touch.calibrate();            // neutral tilt = how the device is held now
    setInterval(() => touch.update(), 250);
    window.addEventListener('orientationchange', () => setTimeout(() => { fitCanvas(canvas); touch.calibrate(); }, 300));
    // debug options in the URL hash: #level=N (start at level N), #ticks=N (run N VBLs at once),
    // #keys=F3,5 (queue key presses), #mouse=dx,dy (constant mouse motion per VBL)
    const opt = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map((kv) => kv.split('=')));
    if (opt.level) E.game.debugLevel = +opt.level;
    const sens = document.getElementById('sens');
    E.game.onMouseScale = (v) => { if (sens) sens.textContent = Math.round(v * 100); };
    E.game.onMouseScale(E.game.mouseScale);
    E.game.start();
    if (opt.keys) for (const k of opt.keys.split(',')) window.dispatchEvent(new KeyboardEvent('keydown', { code: k, key: k }));
    if (opt.ticks) {
      const [mx, my] = (opt.mouse || '0,0').split(',').map(Number);
      for (let i = 0; i < +opt.ticks; i++) { input.dx += mx; input.dy += my; E.game.vblTick(); }
      screen.present();
    }
  });
})(window.ESPRIT = window.ESPRIT || {});
