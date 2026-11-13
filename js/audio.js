/* Tiny synthesized sound engine (WebAudio). No audio files, nothing is downloaded. */
(function () {
  'use strict';
  const Sfx = {
    ctx: null, enabled: true, eng: null,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.enabled ? 0.5 : 0;
        this.master.connect(this.ctx.destination);
      } catch (e) { this.ctx = null; }
    },
    setEnabled(on) {
      this.enabled = on;
      if (this.master) this.master.gain.value = on ? 0.5 : 0;
    },
    startEngine() {
      if (!this.ctx || this.eng) return;
      const c = this.ctx;
      const o1 = c.createOscillator(), o2 = c.createOscillator();
      o1.type = 'sawtooth'; o2.type = 'square';
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
      const g = c.createGain(); g.gain.value = 0.0;
      o1.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master);
      o1.start(); o2.start();
      this.eng = { o1, o2, lp, g };
    },
    stopEngine() {
      if (!this.eng) return;
      try { this.eng.o1.stop(); this.eng.o2.stop(); } catch (e) { /* already stopped */ }
      this.eng = null;
    },
    engine(rpm01, throttle) {
      if (!this.eng || !this.ctx) return;
      const t = this.ctx.currentTime;
      const f = 38 + rpm01 * 120;
      this.eng.o1.frequency.setTargetAtTime(f, t, 0.05);
      this.eng.o2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
      this.eng.lp.frequency.setTargetAtTime(280 + rpm01 * 900 + throttle * 400, t, 0.08);
      this.eng.g.gain.setTargetAtTime(0.05 + throttle * 0.05 + rpm01 * 0.03, t, 0.08);
    },
    noise(dur, gain, freq) {
      if (!this.ctx) return;
      const c = this.ctx, n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
      const s = c.createBufferSource(); s.buffer = buf;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 1200;
      const g = c.createGain(); g.gain.value = gain;
      s.connect(f); f.connect(g); g.connect(this.master); s.start();
    },
    tone(freq, dur, type, gain) {
      if (!this.ctx) return;
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(gain || 0.2, c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
      o.connect(g); g.connect(this.master); o.start(); o.stop(c.currentTime + dur);
    },
    crash() { this.noise(0.5, 0.9, 900); this.tone(70, 0.3, 'square', 0.25); },
    horn() { this.tone(420, 0.35, 'square', 0.12); this.tone(530, 0.35, 'square', 0.1); },
    click() { this.tone(660, 0.06, 'triangle', 0.15); },
    good() { this.tone(660, 0.12, 'triangle', 0.2); setTimeout(() => this.tone(880, 0.18, 'triangle', 0.2), 110); },
    bad() { this.tone(200, 0.25, 'sawtooth', 0.15); },
    screech() { this.noise(0.4, 0.25, 3000); }
  };
  window.Sfx = Sfx;
})();
