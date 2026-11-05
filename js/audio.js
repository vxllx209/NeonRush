/**
 * NEON RUSH — Audio sintetizado con WebAudio (sin archivos externos).
 *
 * - El AudioContext se crea solo tras la primera interacción del usuario
 *   (los navegadores bloquean el audio automático y el juego lo respeta).
 * - Dos buses independientes: música y efectos, cada uno con volumen y
 *   silencio propios.
 * - Música electrónica procedural (Am – F – C – G, 112 BPM):
 *     'menu' = bajo + arpegio suave; 'race' = + batería y arpegio brillante.
 * - Motor del auto: osciladores cuya frecuencia sigue la velocidad.
 */
(function (NR) {
  'use strict';

  const BPM = 112;
  const STEP = 60 / BPM / 4; // semicorchea
  const CHORDS = [
    { root: 110.0, notes: [220.0, 261.63, 329.63] },  // Am
    { root: 87.31, notes: [174.61, 220.0, 261.63] },  // F
    { root: 130.81, notes: [261.63, 329.63, 392.0] }, // C
    { root: 98.0, notes: [196.0, 246.94, 293.66] },   // G
  ];

  class AudioSystem {
    constructor() {
      this.ctx = null;
      this.settings = { musicVolume: 0.6, sfxVolume: 0.8, musicMuted: false, sfxMuted: false };
      this.mode = 'off';
      this._timer = 0;
      this._step = 0;
      this._next = 0;
      this.engineOn = false;
    }

    get ready() { return !!this.ctx; }

    /** Llamar desde un gesto del usuario. Idempotente. */
    unlock() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended' && !document.hidden) this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      this.ctx = ctx;

      this.master = ctx.createDynamicsCompressor();
      this.master.threshold.value = -14;
      this.master.ratio.value = 4;
      this.master.connect(ctx.destination);

      this.musicBus = ctx.createGain();
      this.sfxBus = ctx.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);

      // Ruido blanco reutilizable.
      const len = ctx.sampleRate;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this._buildEngine();
      this.applySettings(this.settings);
      if (this.mode !== 'off') this._startScheduler();
    }

    applySettings(s) {
      this.settings = Object.assign({}, this.settings, s);
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const music = this.settings.musicMuted ? 0 : this.settings.musicVolume * 0.55;
      const sfx = this.settings.sfxMuted ? 0 : this.settings.sfxVolume;
      this.musicBus.gain.setTargetAtTime(music, t, 0.05);
      this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    }

    suspend() {
      if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
    }

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    }

    /* ---------------------------------------------------------------- */
    /* Música                                                           */
    /* ---------------------------------------------------------------- */

    setMusic(mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      if (!this.ctx) return;
      if (mode === 'off') this._stopScheduler();
      else this._startScheduler();
    }

    _startScheduler() {
      if (this._timer) return;
      this._next = this.ctx.currentTime + 0.05;
      this._timer = setInterval(() => this._schedule(), 25);
    }

    _stopScheduler() {
      clearInterval(this._timer);
      this._timer = 0;
    }

    _schedule() {
      const ctx = this.ctx;
      if (!ctx || ctx.state !== 'running') return;
      if (this._next < ctx.currentTime - 0.2) this._next = ctx.currentTime + 0.02; // tras suspender
      while (this._next < ctx.currentTime + 0.12) {
        this._playStep(this._step, this._next);
        this._next += STEP;
        this._step = (this._step + 1) % 64;
      }
    }

    _playStep(step, t) {
      const race = this.mode === 'race';
      const bar = Math.floor(step / 16);
      const s = step % 16;
      const chord = CHORDS[bar];
      const out = this.musicBus;

      // Bajo: corcheas con salto de octava.
      if (s % 2 === 0) {
        const f = chord.root * (s === 6 || s === 14 ? 2 : 1);
        this._tone(f, t, STEP * 1.6, { type: 'sawtooth', gain: race ? 0.16 : 0.11, filter: race ? 900 : 600, dest: out });
      }
      // Arpegio.
      const n = chord.notes[s % 3] * (s % 6 >= 3 ? 2 : 1);
      this._tone(n, t, STEP * 0.9, { type: race ? 'square' : 'triangle', gain: race ? 0.035 : 0.05, filter: race ? 3200 : 1800, dest: out });
      // Pad en el primer tiempo de cada compás (menú).
      if (!race && s === 0) {
        for (const f of chord.notes) this._tone(f / 2, t, STEP * 15, { type: 'triangle', gain: 0.035, attack: 0.4, dest: out });
      }
      if (!race) return;
      // Batería.
      if (s % 4 === 0) this._kick(t, out);
      if (s === 4 || s === 12) this._noise(t, 0.12, { gain: 0.16, type: 'bandpass', freq: 1800, dest: out });
      if (s % 2 === 1) this._noise(t, 0.03, { gain: 0.06, type: 'highpass', freq: 7000, dest: out });
    }

    /* ---------------------------------------------------------------- */
    /* Motor                                                            */
    /* ---------------------------------------------------------------- */

    _buildEngine() {
      const ctx = this.ctx;
      this.engGain = ctx.createGain();
      this.engGain.gain.value = 0;
      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 500;
      this.engA = ctx.createOscillator();
      this.engA.type = 'sawtooth';
      this.engB = ctx.createOscillator();
      this.engB.type = 'square';
      const mixB = ctx.createGain();
      mixB.gain.value = 0.5;
      this.engA.connect(this.engFilter);
      this.engB.connect(mixB).connect(this.engFilter);
      this.engFilter.connect(this.engGain).connect(this.sfxBus);
      this.engA.start();
      this.engB.start();
    }

    /** level 0..1 (velocidad relativa), nitro/brake booleanos. */
    engine(on, level = 0, nitro = false, brake = false) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const f = 48 + level * 95 + (nitro ? 45 : 0) - (brake ? 18 : 0);
      this.engA.frequency.setTargetAtTime(f, t, 0.08);
      this.engB.frequency.setTargetAtTime(f * 0.5, t, 0.08);
      this.engFilter.frequency.setTargetAtTime(brake ? 380 : 500 + level * 1400 + (nitro ? 900 : 0), t, 0.1);
      this.engGain.gain.setTargetAtTime(on ? 0.06 : 0, t, on ? 0.15 : 0.08);
      this.engineOn = on;
    }

    /* ---------------------------------------------------------------- */
    /* Efectos                                                          */
    /* ---------------------------------------------------------------- */

    play(name) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const o = { dest: this.sfxBus };
      const seq = (notes, gap, opts) => notes.forEach((f, i) => this._tone(f, t + i * gap, gap * 1.6, Object.assign({}, o, opts)));
      switch (name) {
        case 'orb': seq([1046, 1568], 0.045, { type: 'square', gain: 0.07, filter: 5000 }); break;
        case 'orb-green': seq([784, 1175, 1568, 2093], 0.04, { type: 'square', gain: 0.07, filter: 6000 }); break;
        case 'lane': this._noise(t, 0.12, { gain: 0.08, type: 'bandpass', freq: 900, sweep: 2200, dest: this.sfxBus }); break;
        case 'bump': this._tone(110, t, 0.1, { type: 'square', gain: 0.12, filter: 600, ...o }); break;
        case 'deny': seq([220, 165], 0.06, { type: 'square', gain: 0.08, filter: 1200 }); break;
        case 'nitro':
          this._noise(t, 0.6, { gain: 0.18, type: 'highpass', freq: 800, sweep: 4000, dest: this.sfxBus });
          this._tone(180, t, 0.6, { type: 'sawtooth', gain: 0.1, slide: 720, filter: 2500, ...o });
          break;
        case 'brake': this._tone(1700, t, 0.3, { type: 'sawtooth', gain: 0.03, slide: 1300, filter: 3000, ...o }); break;
        case 'power-shield': seq([523, 659, 784, 1046], 0.06, { type: 'triangle', gain: 0.14 }); break;
        case 'power-magnet': seq([392, 523, 659, 523, 784], 0.05, { type: 'sawtooth', gain: 0.08, filter: 2000 }); break;
        case 'power-multiplier': seq([659, 784, 988, 1318], 0.06, { type: 'square', gain: 0.08, filter: 4000 }); break;
        case 'shield-hit':
          this._noise(t, 0.3, { gain: 0.25, type: 'lowpass', freq: 2000, dest: this.sfxBus });
          this._tone(600, t, 0.35, { type: 'triangle', gain: 0.15, slide: 200, ...o });
          break;
        case 'powerdown': this._tone(600, t, 0.25, { type: 'triangle', gain: 0.08, slide: 300, ...o }); break;
        case 'crash':
          this._noise(t, 1.1, { gain: 0.5, type: 'lowpass', freq: 3000, sweep: 200, dest: this.sfxBus });
          this._tone(90, t, 0.8, { type: 'sine', gain: 0.6, slide: 30, ...o });
          break;
        case 'count': this._tone(440, t, 0.12, { type: 'square', gain: 0.08, filter: 2500, ...o }); break;
        case 'go': this._tone(880, t, 0.35, { type: 'square', gain: 0.09, filter: 3500, ...o }); break;
        case 'levelup': seq([523, 659, 784], 0.07, { type: 'square', gain: 0.07, filter: 3500 }); break;
        case 'record': seq([523, 659, 784, 1046, 1318], 0.08, { type: 'square', gain: 0.08, filter: 4000 }); break;
        case 'mission': seq([784, 988, 1175, 1568], 0.07, { type: 'triangle', gain: 0.12 }); break;
        case 'purchase': seq([660, 880, 1320], 0.06, { type: 'square', gain: 0.08, filter: 4000 }); break;
        case 'click': this._tone(1400, t, 0.04, { type: 'sine', gain: 0.07, ...o }); break;
        case 'gameover': seq([392, 330, 262, 196], 0.12, { type: 'triangle', gain: 0.12 }); break;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Síntesis                                                         */
    /* ---------------------------------------------------------------- */

    _tone(freq, t, dur, { type = 'square', gain = 0.1, attack = 0.005, filter = 0, slide = 0, dest } = {}) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = osc.connect(g);
      if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filter;
        node = node.connect(f);
      }
      node.connect(dest || this.sfxBus);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    _noise(t, dur, { gain = 0.1, type = 'bandpass', freq = 1000, sweep = 0, dest } = {}) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.setValueAtTime(freq, t);
      if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f).connect(g).connect(dest || this.sfxBus);
      src.start(t, Math.random() * 0.5);
      src.stop(t + dur + 0.05);
    }

    _kick(t, dest) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.55, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.25);
    }
  }

  NR.Audio = new AudioSystem();
})(window.NR);
