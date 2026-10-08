// Two-voice sample player with the original priority rules (PlaySound @9806).
// The voices are tracked logically in game time (VBL ticks) so that "is this sound still playing"
// queries used by the game logic are deterministic; WebAudio mirrors the logical state.
'use strict';
(function (E) {
  const RATE = 6269.4, TITLE_RATE = 6536.2, VBL_HZ = 71.2;

  class Sound {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.buffers = {};
      this.len = {};
      this.voices = [null, null];   // {name, prio, left (samples), node, gain}
      for (const [name, b64] of Object.entries(E.DATA.sounds)) this.len[name] = E.b64ToBytes(b64).length - 2;
    }
    // Called on every user gesture: browsers only allow audio after one. Sounds that were started
    // before (e.g. ESTITLE in the intro) are logically playing already; attach audio to them then.
    unlock() {
      if (this.ctx) {
        if (this.ctx.state !== 'running') this.ctx.resume().then(() => this.resync(), () => {});
        else this.resync();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { this.ctx = new AC(); } catch (e) { return; }
      this.ctx.onstatechange = () => { if (this.ctx.state === 'running') this.resync(); };
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      for (const [name, b64] of Object.entries(E.DATA.sounds)) {
        const raw = E.b64ToBytes(b64);
        const n = Math.max(1, raw.length - 2);           // byte 0 skipped, last byte = end marker
        const rate = name === 'ESTITLE' ? TITLE_RATE : RATE;
        const buf = this.ctx.createBuffer(1, n, Math.max(3000, Math.round(rate)));
        const ch = buf.getChannelData(0);
        for (let i = 0; i < n; i++) ch[i] = ((raw[i + 1] || 1) - 128) / 128;
        this.buffers[name] = buf;
      }
      if (this.ctx.state !== 'running') this.ctx.resume().then(() => this.resync(), () => {});
      else this.resync();
    }
    // start audio for logical voices that have none yet, at their current playback position
    resync() {
      if (!this.ctx || this.ctx.state !== 'running' || !this.enabled) return;
      for (const v of this.voices) {
        if (!v || v.node || !this.buffers[v.name]) continue;
        const offset = Math.max(0, (this.len[v.name] - v.left) / this.rate(v.name));
        this.attach(v, offset);
      }
      this.mix();
    }
    attach(voice, offset = 0) {
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[voice.name];
      const g = this.ctx.createGain();
      src.connect(g); g.connect(this.master);
      voice.node = src; voice.gain = g;
      src.start(0, offset);
    }
    duration(name) { return (this.len[name] || 0) / this.rate(name); }   // seconds
    rate(name) { return name === 'ESTITLE' ? TITLE_RATE : RATE; }
    play(name, prio = 1) {
      if (!this.enabled || !(name in this.len)) return;
      const v = this.voices;
      let slot;
      if (!v[0]) slot = 0;
      else if (!v[1]) slot = 1;
      else if (prio >= v[0].prio) slot = 0;
      else if (prio >= v[1].prio) slot = 1;
      else return;
      this.stopVoice(slot);
      const voice = { name, prio, left: this.len[name], node: null, gain: null };
      v[slot] = voice;
      if (this.ctx && this.ctx.state === 'running' && this.buffers[name]) this.attach(voice);
      this.mix();
    }
    stopVoice(i) {
      const v = this.voices[i];
      if (v && v.node) { try { v.node.stop(); } catch (e) { /* ended */ } }
      this.voices[i] = null;
    }
    mix() {   // with two voices the ST outputs (s1+s2)/2
      const both = this.voices[0] && this.voices[1];
      for (const v of this.voices) if (v && v.gain) v.gain.gain.value = both ? 0.5 : 1;
    }
    // advance logical playback by one VBL
    tick() {
      for (let i = 0; i < 2; i++) {
        const v = this.voices[i];
        if (!v) continue;
        v.left -= this.rate(v.name) / VBL_HZ;
        if (v.left <= 0) this.voices[i] = null;
      }
      if (!this.voices[0] && this.voices[1]) { this.voices[0] = this.voices[1]; this.voices[1] = null; }
      this.mix();
    }
    playing(name) { return this.voices.some((v) => v && v.name === name); }
    stop(name) { for (let i = 0; i < 2; i++) if (this.voices[i] && this.voices[i].name === name) this.stopVoice(i); this.tick0(); }
    tick0() { if (!this.voices[0] && this.voices[1]) { this.voices[0] = this.voices[1]; this.voices[1] = null; } this.mix(); }
    stopAll() { this.stopVoice(0); this.stopVoice(1); }
    setEnabled(on) { this.enabled = on; if (!on) this.stopAll(); }
  }
  E.Sound = Sound;
})(window.ESPRIT = window.ESPRIT || {});
