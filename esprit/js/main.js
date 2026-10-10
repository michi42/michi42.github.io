// Boot code: canvas scaling, asset decoding, start of the game loop.
'use strict';
(function (E) {
  E.DATA = window.ESPRIT_DATA;

  // F9 toggles between scaled to the window and the original size (640x400).
  // F8 / touch menu: lock the scale to integer multiples of 640x400 in *device* pixels (default on for
  // desktop, off for touch devices). Fractional scaling resamples the 1-bit picture unevenly, which
  // turns the 50% checkerboard patterns of the Atari graphics into moire stripes.
  let scaled = true, intLock = null;
  try {
    scaled = localStorage.getItem('esprit.scaled') !== '0';
    const v = localStorage.getItem('esprit.intscale'); if (v === '0' || v === '1') intLock = v === '1';
  } catch (e) { /* ignore */ }
  const isTouch = () => document.body.classList.contains('touch');
  const integerScaling = () => (intLock === null ? !isTouch() : intLock);

  const fullscreenSupported = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);

  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const touch = isTouch();
    // touch devices outside fullscreen: reserve a 64 px strip for the fullscreen button, beside the
    // picture in landscape and below it in portrait
    const btn = document.getElementById('fsbtn');
    const showBtn = touch && !isFullscreen() && fullscreenSupported();
    const landscape = window.innerWidth >= window.innerHeight;
    const resW = showBtn && landscape ? 64 : 0, resH = showBtn && !landscape ? 64 : 0;
    document.body.style.paddingRight = resW + 'px';
    document.body.style.paddingBottom = resH + 'px';
    // available area in device pixels (desktop leaves room for the help text)
    const availW = (window.innerWidth - (touch ? resW : 16)) * dpr, availH = (window.innerHeight - (touch ? resH : 70)) * dpr;
    let s = Math.min(availW / 640, availH / 400);          // scale in device pixels per ST pixel
    if (integerScaling() && s >= 1) s = Math.floor(s);
    if (!scaled && !touch) s = Math.min(s, Math.max(1, Math.round(dpr)));   // original size: 640x400 at native density
    const wDev = Math.max(1, Math.floor(640 * s)), hDev = Math.max(1, Math.floor(400 * s));
    // The wrapper reserves the space in the layout. The canvas itself stays 640x400 CSS px and is scaled
    // with a transform: transforms are exact floats, whereas CSS sizes are rounded to 1/64 px (e.g.
    // 1280 device px at 3x = 426.666 CSS px would become 426.656, which resamples the picture).
    const wrap = canvas.parentElement;
    wrap.style.width = wDev / dpr + 'px';
    wrap.style.height = hDev / dpr + 'px';
    canvas.style.width = '640px';
    canvas.style.height = '400px';
    const r = wrap.getBoundingClientRect();
    // snap the origin onto the device-pixel grid (centring can leave it at a fractional position)
    const ox = (Math.round(r.left * dpr) - r.left * dpr) / dpr, oy = (Math.round(r.top * dpr) - r.top * dpr) / dpr;
    canvas.style.transform = `translate(${ox}px, ${oy}px) scale(${wDev / dpr / 640}, ${hDev / dpr / 400})`;
    if (btn) {
      btn.style.display = showBtn ? 'block' : 'none';
      // the button sits centred in the reserved strip at the right (landscape) or bottom (portrait)
      btn.style.left = landscape ? (window.innerWidth - resW / 2 - 24) + 'px' : (window.innerWidth / 2 - 24) + 'px';
      btn.style.top = landscape ? (window.innerHeight / 2 - 24) + 'px' : (window.innerHeight - resH / 2 - 24) + 'px';
    }
  }
  E.fitCanvas = () => fitCanvas(document.getElementById('screen'));
  E.integerScaling = integerScaling;
  E.setIntegerScaling = (on) => {
    intLock = on;
    try { localStorage.setItem('esprit.intscale', on ? '1' : '0'); } catch (e) { /* ignore */ }
    E.fitCanvas();
  };

  window.addEventListener('load', () => {
    const canvas = document.getElementById('screen');
    // touch-first devices (phones, tablets) get the full-screen layout right away
    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
    fitCanvas(canvas);
    window.addEventListener('resize', () => fitCanvas(canvas));
    // zooming changes devicePixelRatio, sometimes without a resize event
    const watchDpr = () => {
      if (!window.matchMedia) return;
      const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      const on = () => { fitCanvas(canvas); watchDpr(); };
      if (mq.addEventListener) mq.addEventListener('change', on, { once: true });
    };
    watchDpr();
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
    const fsbtn = document.getElementById('fsbtn');
    if (fsbtn) fsbtn.addEventListener('click', (e) => { e.preventDefault(); touch.toggleFullscreen(); });
    // no text selection anywhere (double clicks / long presses), except in the hidden text field
    document.addEventListener('selectstart', (e) => { if (e.target.id !== 'kbd') e.preventDefault(); });
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
