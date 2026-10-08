// Game flow: intro, title menu, code entry, level sequence, transitions, in-game frame loop.
'use strict';
(function (E) {
  const VBL_HZ = 71.2;
  const VBL_MS = 1000 / VBL_HZ;
  const { SPR } = E;

  // Texts by language: 0 German, 1 English, 2 French (Atari charset escapes)
  const TXT = {
    soundOn: ['Ton \x81ber Monitor.', 'Sound via monitor.', 'Sortie son via moniteur.'],
    soundOff: ['Ton ist ausgeschaltet.', 'Sound is off.', 'Son d\x82branch\x82.'],
    f2: ['Spiel abbrechen.', 'Interrupt game.', 'Interruption du jeu.'],
    f3: ['Bild nochmal beginnen.', 'Start level again.', 'Recommencez le tableau.'],
    start: ['Zum Starten die linke Maustaste dr\x81cken!', 'To start, press the left mouse button!', 'Pour lancer cliquez sur le bouton gauche!'],
    code: [
      ['Bitte geben Sie die Geheimzahl f\x81r das', 'Bild ein, ab dem Sie spielen m\x94chten', 'oder', 'dr\x81cken Sie die linke Maustaste um', 'ab dem Bild mit der letzten', 'Geheimzahl weiterzuspielen.'],
      ['Please enter the code number for the', 'level with which you wish to begin', 'or', 'press the left mouse button to', 'start with the level with ', 'the last code number.'],
      ['Entrez le code secret du tableau', 'par lequel vous souhaitez d\x82buter', 'ou', 'cliquez sur le bouton gauche de la', 'souris afin de continuer la dernier', 'tableau choisi par le code secret.'],
    ],
    unknown: ['Dies war leider eine unbekannte Zahl!', 'Unfortunately this number is unknown!', "Ce code n'est pas le bon!"],
    level: [(n) => `Bild ${n} von 100.`, (n) => `Level no. ${n} of 100.`, (n) => `Tableaux de ${n} \x85 100.`],
    medit: ['Es folgt ein Meditationsbild...', 'A meditation level follows...', 'En suivant un tableau de M\x82ditation...'],
    coffee: ['Kaffeepause...', 'coffee break...', "C'est l'heure du caf\x82..."],
    presents: ['pr\x84sentiert', 'presents', 'Pr\x82sente'],
    credits: [
      ['Idee, Graphik, Musik & Ger\x84usche', 'programmiert und komponiert', 'von', 'Meinolf Schneider'],
      ['Idea, graphics, music, and noises', 'programmed and composed', 'by', 'Meinolf Schneider'],
      ['Id\x82e, graphique, musique bruitages,', 'Programme compos\x82', 'par', 'Meinolf Schneider'],
    ],
    invHelp: [
      'Benutzen Sie die rechte Maustaste um die eingesammelten Objekte zu sortieren, die linke Maustaste um das linke Objekt in der Anzeige abzulegen oder anzuwenden.',
      'Use the right mouse button to sort the collected objects, the left mouse button to place or use the left-hand object of the inventory.',
      'Cliquez sur le bouton droit de la souris pour faire tourner les objets collect\x82s. Cliquez sur le bouton gauche de la souris pour utiliser l\'objet \x85 gauche dans le tableau.',
    ],
    congrats: [['Sie haben es geschafft.', 'G R A T U L A T I O N !!'], ["You've done it.", 'C O N G R A T U L A T I O N S !'], ['Vous avez r\x82ussit.', 'F \x90 L I C I T A T I O N !']],
    nameAsk: [['Bitte geben Sie Ihren Namen f\x81r Ihre', 'Urkunde ein:'], ['Enter your name for', 'your diploma:'], ['Veuillez entrer votre nom pour', 'votre dipl\x93me:']],
    diploma: [['U R K U N D E', 'Dem Spieler', 'wird hiermit feierlich der Sieg best\x84tigt.', 'Heidelberg, den '],
      ['D I P L O M A', '', 'is herewith confirmed as victor.', 'Heidelberg, the '],
      ['D I P L O M E', 'Le', 'est c\x82lebr\x82e la victoire', '\x85 Heidelberg le: ']],
  };
  const codes = (s) => Array.from(s, (c) => c.charCodeAt(0));

  // Dissolve patterns @10da2 (bit 1 = old pixel)
  const DISSOLVE = [
    [0xff, 0xfd, 0xff, 0x77, 0xff, 0xdd, 0xff, 0x77], [0xff, 0xd5, 0xff, 0x55, 0xff, 0x5d, 0xff, 0x55],
    [0xff, 0x55, 0xbb, 0x55, 0xef, 0x55, 0xbb, 0x55], [0xee, 0x55, 0xaa, 0x55, 0xee, 0x55, 0xaa, 0x55],
    [0xaa, 0x55, 0xaa, 0x51, 0xaa, 0x55, 0xaa, 0x11], [0xaa, 0x44, 0xaa, 0x10, 0xaa, 0x44, 0xaa, 0x01],
    [0xaa, 0x00, 0xaa, 0x00, 0xaa, 0x00, 0x2a, 0x00], [0x88, 0x00, 0x22, 0x00, 0x88, 0x00, 0x22, 0x00],
    [0x80, 0x00, 0x00, 0x00, 0x80, 0x00, 0x00, 0x00], [0, 0, 0, 0, 0, 0, 0, 0]];
  const ROLL = '++++++++++++++0++++++++++++++++++++0++++++++0+++++0+++0++++0++0+++0+0++0++0+0++0+0+0+0+00+0+0+00+00+000+000+0000+00000000000000000000000000-0000-0000-00-00-00-00--00-0-0-0-0--0-0--0--0-0---0--0----0---0-----0--------0-------------------0---------------+';
  // table @10e82 has 252 entries; the byte after it (index 252, read by the search loop) is $4e (code)
  const ROLLT = Array.from(ROLL.slice(0, 252), (c) => (c === '+' ? 1 : c === '-' ? -1 : 0)).concat([0x4e]);
  // GFX_RollStep @10df4: draw the 352 source lines into dst (back buffer) with roll position L
  function rollStep(dst, src, L) {
    let k = 0, d = 0;
    if (L >= 0) k = -L;
    else {
      let acc = L;
      do { k++; if (k > 252) return; acc += ROLLT[k]; } while (acc < 0);
    }
    for (let s = 0; s < 352; s++) {
      if (d >= 0 && d < 400) dst.px.set(src.px.subarray(s * 640, s * 640 + 640), d * 640);
      if (k < 0) { k++; d++; } else if (k > 252 || ROLLT[k] < 0) { k++; d--; } else if (ROLLT[k] > 0) { k++; d++; } else k++;
    }
  }

  class Game {
    constructor(screen, input, sound) {
      this.screen = screen; this.fb = screen.fb; this.input = input; this.sound = sound;
      this.rng = new E.RNG();
      this.rng.randomize();
      this.codes = E.levelCodes(0x1cd9);
      // language: 0 German, 1 English, 2 French. Default = first supported entry of the browser's
      // preferred languages (Accept-Language); F10 cycles through them and the choice is remembered.
      this.language = 1;
      const prefs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'])
        .map((l) => String(l).slice(0, 2).toLowerCase());
      const first = prefs.find((l) => l === 'de' || l === 'en' || l === 'fr');
      if (first) this.language = { de: 0, en: 1, fr: 2 }[first];
      try { const s = localStorage.getItem('esprit.lang'); if (s === '0' || s === '1' || s === '2') this.language = +s; } catch (e) { /* ignore */ }
      this.inv = new E.Items.Inventory(this);
      this.vbl = 0;
      this.startLevel = 1;
      // the last played level survives a page reload (F3 / left click in the code entry continue there)
      try { const n = +localStorage.getItem('esprit.level'); if (n >= 1 && n <= 100) this.startLevel = n; } catch (e) { /* ignore */ }
      this.soundOn = true;
      this.mouseScale = 1;
      try { this.mouseScale = +localStorage.getItem('esprit.mouse') || 1; } catch (e) { /* storage unavailable */ }
      this.task = null;          // generator driving the current screen
      this.waitVbl = 0;
      this.level = null;
      this.lastTime = 0;
      this.acc = 0;
      this.paused = false;
    }

    start() {
      this.task = this.mainFlow();
      const loop = (t) => {
        if (!this.lastTime) this.lastTime = t;
        this.acc += Math.min(250, t - this.lastTime);
        this.lastTime = t;
        let ran = false;
        while (this.acc >= VBL_MS) { this.acc -= VBL_MS; this.vblTick(); ran = true; }
        if (ran) this.screen.present();
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }

    // one VBL: advance sound, then let the current task run if its wait is over
    vblTick() {
      if (!this.frozen) this.vbl++;
      this.sound.tick();
      if (this.waitVbl > 0) { this.waitVbl--; return; }
      const r = this.task.next();
      if (r.done) this.task = this.mainFlow();
      else this.waitVbl = Math.max(0, (r.value | 0) - 1);
    }

    // ---------------------------------------------------------------- helpers
    t(key) { return TXT[key][this.language]; }
    takeInput() {
      const inp = this.input;
      const m = inp.takeMotion();
      const scale = 640 / (this.screen.canvas.clientWidth || 640) * this.mouseScale;
      const keys = [];
      let left = false, right = false, k, c;
      while ((c = inp.takeClick())) { if (c === 'left') left = true; else right = true; }
      this.langChanged = false;
      while ((k = inp.takeKey())) {
        if (k === 'F10') {                                       // not in the original: cycle the language
          this.language = (this.language + 1) % 3;
          try { localStorage.setItem('esprit.lang', String(this.language)); } catch (e) { /* ignore */ }
          this.langChanged = true;
          continue;
        }
        if (k === 'NumpadAdd' || k === 'Equal' || k === 'NumpadSubtract' || k === 'Minus') {
          const up = k === 'NumpadAdd' || k === 'Equal';
          this.mouseScale = Math.max(0.1, Math.min(10, this.mouseScale * (up ? 1.25 : 0.8)));
          try { localStorage.setItem('esprit.mouse', String(this.mouseScale)); } catch (e) { /* ignore */ }
          if (this.onMouseScale) this.onMouseScale(this.mouseScale);
          continue;
        }
        keys.push(k);
      }
      // accumulate in floating point and hand out whole mickeys, keeping the remainder (rounding per
      // frame would drop slow movements in one direction and amplify them in the other)
      this.mx = (this.mx || 0) + m.dx * scale; this.my = (this.my || 0) + m.dy * scale;
      const dx = Math.trunc(this.mx), dy = Math.trunc(this.my);
      this.mx -= dx; this.my -= dy;
      return { dx, dy, left, right, keys };
    }
    anyInput(inp) { return inp.left || inp.right || inp.keys.length > 0; }
    toggleSound() { this.soundOn = !this.soundOn; this.sound.setEnabled(this.soundOn); }
    keyName(code) {
      if (/^F\d+$/.test(code)) return code;
      if (code === 'Insert' || code === 'Pause' || code === 'F12') return 'Help';
      if (code.startsWith('Key')) return code.slice(3);
      if (code.startsWith('Digit')) return code.slice(5);
      if (code.startsWith('Numpad') && /\d$/.test(code)) return code.slice(-1);
      return code;
    }

    clear(v = 1) { this.fb.clear(v); }
    snapshot() { return new E.Bitmap(640, 400, this.fb.px.slice()); }
    *wait(vbls, skippable = true) {
      for (let i = 0; i < vbls; i++) {
        const inp = this.takeInput();
        if (skippable && this.anyInput(inp)) return true;
        yield 1;
      }
      return false;
    }
    // The ST transitions were CPU bound; spread `frames` displayed frames over `total` VBLs
    // (measured in Hatari: dissolve 67 VBLs, short dissolve 25, roll-in 132).
    pacer(frames, total) {
      let done = 0, k = 0;
      return () => { k++; const t = Math.round(total * k / frames); const n = Math.max(1, t - done); done += n; return n; };
    }
    // GFX_Dissolve: from the displayed image to the new back buffer
    *dissolve(oldImg, steps = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const neu = this.snapshot();
      const pace = this.pacer(steps.length + 2, steps.length === 10 ? 67 : 25);
      for (const s of steps) {
        const P = DISSOLVE[s];
        for (let y = 0; y < 400; y++) {
          const p = P[y & 7];
          const o = y * 640;
          for (let x = 0; x < 640; x++) {
            const bit = (p >> (7 - (x & 7))) & 1;
            this.fb.px[o + x] = bit ? oldImg.px[o + x] : neu.px[o + x];
          }
        }
        yield pace();
      }
      this.fb.px.set(neu.px);
      yield pace() + pace();
    }
    // GFX_RollIn: the new playfield unrolls from the top
    *rollIn(oldImg) {
      const neu = this.snapshot();
      const pace = this.pacer(33, 132);
      for (let i = 0; i <= 30; i++) {
        this.fb.px.set(oldImg.px);
        const L = 352 - Math.trunc((432 * (30 - i)) / 30);
        rollStep(this.fb, neu, L);
        yield pace();
      }
      this.fb.px.set(neu.px);
      yield pace() + pace();
    }

    drawStatusFrame() { E.drawStatusBar(this.fb); }

    // ---------------------------------------------------------------- screens
    *mainFlow() {
      if (this.debugLevel) { const n = this.debugLevel; this.debugLevel = 0; this.startLevel = n; yield* this.startGame(true); }
      yield* this.intro();
      for (;;) {
        const r = yield* this.titleMenu();
        if (r === 'intro') { yield* this.intro(); continue; }
        if (r === 'start' || r === 'startF3') yield* this.startGame(r === 'startF3');
      }
    }

    *intro() {
      const old = () => this.snapshot();
      let o = old(); this.clear(1);
      yield* this.dissolve(o);
      if (yield* this.wait(213 - 67)) return;   // ESTITLE starts 213 VBLs after the intro
      o = old(); this.clear(1);
      // Intro @40c0: line pitch = glyph height * 5/4; all three lines justified to the width of APPLICATION
      const wApp = E.textWidth(codes('APPLICATION'));
      let hS = E.glyphHeight(0x53); hS += Math.trunc(hS / 4);
      let hSl = E.glyphHeight(0xe4); hSl += Math.trunc(hSl / 4);
      E.drawCentered(this.fb, codes('\xe4\xe4\xe4'), 320, 200 - hS - hSl);
      E.drawJustified(this.fb, 'APPLICATION', 320, 200 - hS, wApp);
      E.drawJustified(this.fb, 'SYSTEMS', 320, 200, wApp);
      E.drawJustified(this.fb, this.language === 2 ? 'PARIS' : 'HEIDELBERG', 320, 200 + hS, wApp);
      this.sound.play('ESTITLE', 100);
      // Screen durations measured in Hatari (VBLs from one dissolve start to the next, the CPU-bound
      // drawing included): logo 384, presents 384, esprit 394, credits 311 until the title menu.
      const waits = [384, 384, 394, 311].map((n) => n - 67);
      yield* this.dissolve(o);
      if (yield* this.wait(waits[0])) return;
      o = old(); this.clear(1);
      E.drawCentered(this.fb, codes(this.t('presents')), 320, 200);
      yield* this.dissolve(o);
      if (yield* this.wait(waits[1])) return;
      o = old(); this.clear(1);
      E.drawCentered(this.fb, [226], 320, 200);
      E.drawCentered(this.fb, [227], 424, 200);
      yield* this.dissolve(o);
      if (yield* this.wait(waits[2])) return;
      o = old(); this.clear(1);
      const cr = this.t('credits');
      E.drawCentered(this.fb, codes(cr[0]), 320, 100);
      E.drawCentered(this.fb, codes(cr[1]), 320, 140);
      E.drawCentered(this.fb, codes(cr[2]), 320, 200);
      E.drawCentered(this.fb, codes(cr[3]), 320, 260);
      yield* this.dissolve(o);
      yield* this.wait(waits[3]);
    }

    drawTitle() {
      const fb = this.fb;
      fb.clear(1);
      for (let y = 32; y <= 320; y += 32) for (let x = 32; x <= 576; x += 32) E.drawIcon(fb, SPR(7, 0), x, y);
      for (let c = 1; c <= 18; c++) { E.drawIcon(fb, SPR(15, 4), c * 32, 0); E.drawIcon(fb, SPR(15, 5), c * 32, 352); }
      for (let r = 1; r <= 10; r++) { E.drawIcon(fb, SPR(16, 5), 0, r * 32); E.drawIcon(fb, SPR(17, 5), 608, r * 32); }
      E.drawIcon(fb, SPR(16, 2), 0, 0); E.drawIcon(fb, SPR(17, 2), 608, 0);
      E.drawIcon(fb, SPR(16, 3), 0, 352); E.drawIcon(fb, SPR(17, 3), 608, 352);
      fb.fillRect(0, 384, 640, 16, 1);
      const texts = [
        [226, 320, 50], [227, 424, 50],
        ['F1', 320, 95], [this.soundOn ? this.t('soundOn') : this.t('soundOff'), 320, 120],
        ['F2', 320, 155], [this.t('f2'), 320, 180], ['F3', 320, 215], [this.t('f3'), 320, 240],
        [this.t('start'), 320, 348],
      ];
      const drawAll = (ox, oy) => {
        for (const [s, x, y] of texts) {
          E.drawCentered(fb, typeof s === 'number' ? [s] : codes(s), x + ox, y + oy);
        }
      };
      const inv = () => { for (let i = 0; i < fb.px.length; i++) fb.px[i] ^= 1; };
      inv();
      for (const [ox, oy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [8, 8]]) drawAll(ox, oy);
      inv();
      drawAll(0, 0);
    }

    *titleMenu() {
      const o = this.snapshot();
      this.drawTitle();
      yield* this.dissolve(o);
      let idle = 0;
      for (;;) {
        const inp = this.takeInput();
        if (this.langChanged) this.drawTitle();
        if (inp.left) return 'start';
        if (inp.right || ++idle > 71 * 60) return 'intro';
        for (const code of inp.keys) {
          const k = this.keyName(code);
          if (k === 'F1') { this.toggleSound(); this.drawTitle(); }
          else if (k === 'F3') return 'startF3';
          else if (k === 'G' || k === 'E' || k === 'F') { this.language = { G: 0, E: 1, F: 2 }[k]; this.drawTitle(); }
          else if (k === 'Help') yield* this.bossScreen();
          if (k === 'Help') this.drawTitle();
        }
        yield 1;
      }
    }

    *bossScreen() {
      const save = this.snapshot();
      this.fb.px.set(E.bossPic.px);
      this.sound.stopAll();
      this.frozen = true;
      for (;;) {
        const inp = this.takeInput();
        if (inp.keys.some((c) => this.keyName(c) === 'Help')) break;
        yield 1;
      }
      this.frozen = false;
      this.fb.px.set(save.px);
    }

    *codeEntry() {
      const o = this.snapshot();
      const fb = this.fb;
      fb.clear(1);
      this.drawStatusFrame();
      const drawLines = () => {
        fb.fillRect(0, 0, 640, 352, 1);
        const lines = this.t('code');
        [80, 110, 150, 190, 220, 250].forEach((y, i) => E.drawCentered(fb, codes(lines[i]), 320, y));
      };
      drawLines();
      const digits = [];
      const drawSlots = () => {
        fb.fillRect(192, 360, 416, 32, 1);
        let s = '';
        for (let i = 0; i < 8; i++) s += (i < digits.length ? digits[i] : '_') + (i < 7 ? ' ' : '');
        E.drawCentered(fb, codes(s), 192 + 207, 384, { spacing: 6, spaceW: 10 });
      };
      drawSlots();
      yield* this.dissolve(o);
      for (;;) {
        const inp = this.takeInput();
        if (this.langChanged) drawLines();
        if (inp.left && digits.length === 0) return this.startLevel;
        for (const code of inp.keys) {
          const k = this.keyName(code);
          if (code === 'Backspace' && digits.length) {             // not in the original: delete the last digit
            digits.pop();
            const o2 = this.snapshot(); drawSlots(); yield* this.dissolve(o2, [2, 5, 8]);
          } else if (/^\d$/.test(k) && digits.length < 8) {
            digits.push(k);
            const o2 = this.snapshot(); drawSlots(); yield* this.dissolve(o2, [2, 5, 8]);
          }
        }
        if (digits.length === 8) {
          const v = parseInt(digits.join(''), 10);
          // test backdoor (not in the original): 42000xxx starts level xxx (1..100, 101 = diploma)
          if (Math.floor(v / 1000) === 42000 && v % 1000 >= 1 && v % 1000 <= 101) return v % 1000;
          const lv = this.codes.indexOf(v, 1);
          return lv >= 1 ? lv : 0;
        }
        yield 1;
      }
    }

    // StartGame 0x5868: black screen (no status bar) + centred text, dissolve; then straight back to
    // the title menu (no extra wait in the original)
    *message(text, vbls = 0) {
      const o = this.snapshot();
      this.fb.clear(1);
      E.drawCentered(this.fb, codes(text), 320, 200);
      yield* this.dissolve(o);
      if (vbls) yield* this.wait(vbls);
    }

    newGameInventory() {
      this.inv.silent = true; this.inv.clear();
      for (let i = 0; i < 3; i++) this.inv.append(25);
      this.inv.silent = false;
    }

    *startGame(skipCode) {
      this.sound.stop('ESTITLE');                                // starting a game ends the title music
      let cur = skipCode ? this.startLevel : yield* this.codeEntry();
      if (cur === 0) { yield* this.message(this.t('unknown')); return; }
      if (cur === 101) { yield* this.endSequence(false); return; }
      this.newGameInventory();
      this.startLevel = cur;
      for (;;) {
        const o = this.snapshot();
        this.fb.clear(1);
        this.drawStatusFrame();
        const txt = (cur % 10 === 0 && cur !== 100) ? this.t('medit') : TXT.level[this.language](cur);
        E.drawCentered(this.fb, codes(txt), 320, 150);
        yield* this.dissolve(o);
        // the original now loads LEVELn.LEV from disk (P_LoadLevel) while the text is shown;
        // approximate the floppy load time so the text stays readable
        yield* this.wait(36, false);
        this.saveLevel(cur);
        const res = yield* this.playLevel(cur);
        if (res.quitPrg || res.abort) return;
        if (res.gameOver) return;
        cur++;
        if (cur === 101) { yield* this.endSequence(true); return; }
      }
    }

    // ---------------------------------------------------------------- playing one level
    *playLevel(num) {
      const lv = new E.Level(this, num);
      this.level = lv;
      // Hook_LevelStart: draw, status bar, ESINITO, roll-in
      // (TXT_TickerStart runs first and blackens the text rect; the inventory is only drawn by the
      // first frame's Hook_AfterRender, so the rolled-in screen shows an empty status area)
      if (lv.startTicker) lv.message = new E.Ticker(this, codes(this.t('invHelp')));
      const o = this.snapshot();
      E.drawPlayfield(this.fb, lv);
      this.drawStatusFrame();
      this.sound.play('ESINITO', 10);
      yield* this.rollIn(o);
      this.takeInput();                                          // flush mouse movement
      for (;;) {
        const inp = this.takeInput();
        inp.keys = inp.keys.map((c) => this.keyName(c));
        // the original renders between the physics and the actor procs/timers (main loop Pd012);
        // Level.frame calls the render hook at that point if it supports it
        let vbls = 0;
        lv.frame(inp, () => { vbls = this.renderLevel(lv); });
        if (this.pendingBoss) { this.pendingBoss = false; yield* this.bossScreen(); lv.attemptQuit = lv.lvlQuit = lv.abortGame = true; }
        if (this.pendingDissolve) {
          this.pendingDissolve = false;
          const o2 = this.snapshot(); E.drawPlayfield(this.fb, lv); yield* this.dissolve(o2);
          this.takeInput();                                      // ReadMouse x2 after the respawn dissolve
        }
        if (lv.attemptQuit) break;
        if (this.pendingCoffee) { this.pendingCoffee = false; yield* this.coffee(lv); }
        yield vbls || this.renderLevel(lv);
      }
      this.level = null;
      return { gameOver: lv.gameOver, abort: lv.abortGame, quitPrg: lv.quitPrg, won: lv.won };
    }

    // GFX_RenderCells + GFX_DrawFigures + Hook_AfterRender @226d4; returns the VBLs of this frame
    renderLevel(lv) {
      E.drawPlayfield(this.fb, lv);
      if (lv.message) {
        lv.message.step();
        lv.message.draw(this.fb);
        if (lv.message.done) { lv.message = null; this.inv.dirty = true; }
      } else E.drawInventory(this.fb, this.inv);
      return 1 + (lv.S.Kspeed | 0);
    }

    // not in the original: remember the last played level (F3 on the title continues there)
    saveLevel(n) {
      this.startLevel = n;
      try { localStorage.setItem('esprit.level', String(n)); } catch (e) { /* storage unavailable */ }
    }
    invOnAdd(code) { if (this.level) this.level.invOnAdd(code); }   // inventory add-callback (INV_OnAdd)
    requestDissolve() { this.pendingDissolve = true; }
    bossKey() { this.pendingBoss = true; }
    coffeeBreak() { this.pendingCoffee = true; }

    // INV_UseFirst, coffee (0x1b38c): text rect := black, "coffee break..." centred at rect (207,24),
    // copied to the displayed screen (the playfield stays as shown), ticker stopped, inventory marked
    // for redraw, then wait for a left-button press. The VBL counter is saved before and restored
    // right after drawing the text, i.e. *before* the wait, so game time is not frozen by the break.
    *coffee(lv) {
      const fb = this.fb;
      fb.fillRect(192, 360, 416, 32, 1);
      E.drawCentered(fb, codes(this.t('coffee')), 192 + 207, 384, { spacing: 6, spaceW: 10, clip: { x0: 192, y0: 360, x1: 608, y1: 392 } });
      lv.message = null;
      this.inv.dirty = true;
      for (;;) { const inp = this.takeInput(); if (inp.left) break; yield 1; }
    }

    // ---------------------------------------------------------------- end of the game
    // EndSequence @181e. played: after level 100 (else: started with the code of "level 101",
    // which only lets you print the diploma again).
    *endSequence(played) {
      const fb = this.fb, L = this.language;
      // screen 1: [congratulations at y 100/140] + name prompt at y 200/240, dissolve
      let o = this.snapshot(); fb.clear(1);
      if (played) { const c = this.t('congrats'); E.drawCentered(fb, codes(c[0]), 320, 100); E.drawCentered(fb, codes(c[1]), 320, 140); }
      const ask = this.t('nameAsk');
      E.drawCentered(fb, codes(ask[0]), 320, 200); E.drawCentered(fb, codes(ask[1]), 320, 240);
      yield* this.dissolve(o);
      // name entry (max 20 chars) centred at (320,300); the cursor '|' is drawn every second frame
      // (1 VBL per frame) at the left edge of character `cur`
      const back = this.snapshot();
      const name = []; let cur = 0, blink = 0;
      const ATARI = { 'ä': 0x84, 'ö': 0x94, 'ü': 0x81, 'Ä': 0x8e, 'Ö': 0x99, 'Ü': 0x9a, 'ß': 0x9e, 'é': 0x82, 'è': 0x8a,
        'ê': 0x88, 'à': 0x85, 'â': 0x83, 'ç': 0x87, 'É': 0x90, 'î': 0x8c, 'ô': 0x93, 'û': 0x96, 'ù': 0x97, 'ë': 0x89, 'ï': 0x8b };
      const charOf = (code) => {
        const ch = (this.input.keyChar && this.input.keyChar[code]) || (code === 'Space' ? ' ' : this.keyName(code));
        if (!ch || ch.length !== 1) return 0;
        const c = ch.charCodeAt(0);
        return ATARI[ch] || (c > 0x1f && c < 0x7f ? c : 0);
      };
      for (let done = false; !done;) {
        fb.px.set(back.px);
        const nameW = E.textWidth(name);
        E.drawCentered(fb, name, 320, 300);
        blink ^= 1;
        if (blink) E.drawText(fb, [0x7c], 320 - Math.trunc(nameW / 2) + E.textWidth(name.slice(0, cur)), 300);
        yield 1;
        const inp = this.takeInput();
        for (const code of inp.keys) {
          if (done) break;
          if (code === 'Enter' || code === 'NumpadEnter') done = true;
          else if (code === 'Backspace') { if (cur) cur--; name.splice(cur, 1); }
          else if (code === 'Escape') name.splice(cur);
          else if (code === 'Home') { name.length = 0; cur = 0; }             // Clr/Home
          else if (code === 'Delete') name.splice(cur, 1);
          else if (code === 'ArrowLeft') { if (cur) cur--; }
          else if (code === 'ArrowRight') { if (cur < name.length) cur++; }
          else if (name.length < 20) { const c = charOf(code); if (c) name.splice(cur++, 0, c); }
        }
      }
      fb.px.set(back.px); E.drawCentered(fb, name, 320, 300);
      // printer menu (F1..F3 print the diploma, F4 = don't print); here the "printout" is shown on screen
      const M = [
        ['Schlie\x9een Sie Ihren Drucker an und', 'w\x84hlen Sie:', 'Ausdruck mit NEC P6 oder', 'kompatiblen starten.', 'Ausdruck mit EPSON oder',
          'kompatiblen starten.', 'Ausdruck \x81ber TOS-Treiber starten.', 'Erst beim n\x84chsten mal drucken.', 'Die Geheimzahl zum Drucken lautet: ',
          'Hat der Ausdruck funktioniert ? (j/n)', 'J'],
        ['Attach your printer and choose', 'one of the following:', 'Start printout with', 'NEC P6 or a compatible.', 'Start printout with',
          'EPSON or a compatible.', 'Start printout via the TOS-driver.', "Don't print out until next time.", 'The secret no. for printing is: ',
          'Is the printout OK ? (y/n)', 'Y'],
        ['Branchez votre imprimante et', 'choisissez entre:', 'Impression avec NEC P6', 'ou compatibles.', 'Impression avec EPSON',
          'ou compatibles.', 'Impr. avec le driver install\x82 au bureau.', 'En attendant la prochaine fois.', "Le code secret pour l'impression est: ",
          'Impression bien effectu\x82e ? (o/n)', 'O'],
      ][L];
      for (;;) {
        o = this.snapshot(); fb.clear(1);
        [['F1', 100], ['F2', 180], ['F3', 260], ['F4', 315]].forEach(([t, y]) => E.drawCentered(fb, codes(t), 320, y));
        [30, 60, 125, 150, 205, 230, 285, 340].forEach((y, k) => E.drawCentered(fb, codes(M[k]), 320, y));
        E.drawCentered(fb, codes(M[8] + E.code8(this.codes[101])), 320, 395);
        yield* this.dissolve(o);
        let key = null;
        while (!key) {
          const inp = this.takeInput();
          key = inp.keys.map((c) => this.keyName(c)).find((k) => /^F[1-4]$/.test(k));
          yield 1;
        }
        if (key === 'F4') return;
        o = this.snapshot(); this.drawDiploma(name); yield* this.dissolve(o);
        for (;;) { const inp = this.takeInput(); if (inp.left || inp.keys.length) break; yield 1; }
        o = this.snapshot(); fb.clear(1); E.drawCentered(fb, codes(M[9]), 320, 200); yield* this.dissolve(o);
        let ans = null;
        while (!ans) { const inp = this.takeInput(); ans = inp.keys.find((c) => c.startsWith('Key') || c === 'Enter'); yield 1; }
        const ch = (this.input.keyChar && this.input.keyChar[ans]) || this.keyName(ans);
        if (ch.toUpperCase() === M[10]) return;
      }
    }
    // The diploma exactly as the original composes it on screen and sends it to the printer
    // (P1270 + P8d0): title-menu tiles, a leaf border, a 16-line strip at the bottom and the texts
    // drawn with the title's outline/drop-shadow technique. A plain ST has no clock, so no date line.
    drawDiploma(name) {
      const fb = this.fb, S = E.SPR, I = (spr, col, row8) => E.drawIcon(fb, spr, col * 32, row8 * 8);
      fb.clear(1);
      for (let c = 1; c <= 18; c++) for (let r = 1; r <= 10; r++) I(S(7, 0), c, 4 * r);
      for (let c = 1; c <= 17; c += 2) {
        I(S(5, 22), c, 0); I(S(6, 22), c + 1, 0); I(S(1, 23), c, 0x2c); I(S(2, 23), c + 1, 0x2c);
      }
      for (let r = 1; r <= 9; r += 2) {
        I(S(4, 23), 0, 4 * r); I(S(0, 22), 0, 4 * r + 4); I(S(7, 23), 19, 4 * r); I(S(3, 22), 19, 4 * r + 4);
      }
      I(S(4, 22), 0, 0); I(S(7, 22), 19, 0); I(S(0, 23), 0, 0x2c); I(S(3, 23), 19, 0x2c);
      for (let c = 0; c <= 19; c++) {                          // GFX_IconRows: sprite lines 0..15 at y=384
        const tmp = new E.Bitmap(32, 32); tmp.clear(1); E.drawIcon(tmp, S(4, 0), 0, 0);
        fb.blit(tmp, 0, 0, 32, 16, c * 32, 384);
      }
      const dpl = this.t('diploma'), L = this.language;
      const texts = (dx, dy) => {                                // P8d0(dx, dy)
        const T = (s, y) => E.drawCentered(fb, s, 320 + dx, y + dy);
        T([226], 50);
        T(codes(dpl[0]), 100);
        if (dpl[1]) T(codes(dpl[1]), 160);
        T(name, L === 1 ? 190 : 220);
        T(codes(dpl[2]), 290);
      };
      const inv = () => { for (let k = 0; k < fb.px.length; k++) fb.px[k] ^= 1; };
      inv();
      for (const [dx, dy] of [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1], [8, 8]]) texts(dx, dy);
      inv();
      texts(0, 0);
    }
  }

  E.Game = Game;
  E.TXT = TXT;
})(window.ESPRIT = window.ESPRIT || {});
