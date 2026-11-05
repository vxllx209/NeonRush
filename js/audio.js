/**
 * NEON RUSH — Audio sintetizado con WebAudio (sin archivos externos).
 *
 * - El AudioContext se crea solo tras la primera interacción del usuario
 *   (los navegadores bloquean el audio automático y el juego lo respeta).
 * - Dos buses independientes: música y efectos (el motor va por efectos).
 *
 * Música: synthwave procedural de 8 compases (Am – F – C – G), 112 BPM, con
 *   pad, bajo, arpegio, melodía con eco, reverb y batería en carrera.
 *   En pausa la música se amortigua con un filtro (sonido "bajo el agua").
 *
 * Auto (capas continuas actualizadas cada frame con engine()):
 *   motor   osciladores + modulación de explosiones + distorsión + filtro;
 *           simula 6 marchas: las RPM suben dentro de cada marcha y caen al cambiar.
 *   turbo   silbido que sube con el nitro.
 *   viento  ruido filtrado proporcional a la velocidad.
 *   freno   chirrido de neumáticos continuo mientras se mantiene el freno.
 * Efectos puntuales: llantas chillando al cambiar de carril, adelantamientos
 *   (whoosh con paneo estéreo), nitro, cambios de marcha, choque metálico, etc.
 */
(function (NR) {
  'use strict';

  const BPM = 112;
  const STEP = 60 / BPM / 4; // semicorchea
  const BARS = 8;
  const CHORDS = [
    { root: 110.0, notes: [220.0, 261.63, 329.63] },  // Am
    { root: 87.31, notes: [174.61, 220.0, 261.63] },  // F
    { root: 130.81, notes: [261.63, 329.63, 392.0] }, // C
    { root: 98.0, notes: [196.0, 246.94, 293.66] },   // G
  ];
  const _ = null;
  // Melodía en semitonos sobre La4 (440 Hz). Sección A y sección B.
  const MELODY = [
    [12, _, _, 10, _, 7, _, _, 5, _, 7, _, _, _, _, _],
    [3, _, _, 5, _, 7, _, _, 10, _, 7, _, 5, _, _, _],
    [7, _, _, 10, _, 12, _, _, 15, _, 12, _, 10, _, _, _],
    [10, _, _, 7, _, 5, _, _, 7, _, _, _, _, _, _, _],
    [15, _, 12, _, 10, _, 12, _, 15, _, 17, _, 15, _, 12, _],
    [12, _, 10, _, 8, _, 10, _, 12, _, _, _, 15, _, _, _],
    [19, _, 17, _, 15, _, 12, _, 15, _, 17, _, 19, _, _, _],
    [17, _, 15, _, 14, _, 10, _, 12, _, _, _, _, _, _, _],
  ];
  const noteFreq = (n) => 440 * Math.pow(2, n / 12);
  const GEARS = 6;

  class AudioSystem {
    constructor() {
      this.ctx = null;
      this.settings = { musicVolume: 0.6, sfxVolume: 0.8, musicMuted: false, sfxMuted: false };
      this.mode = 'off';
      this._timer = 0;
      this._step = 0;
      this._next = 0;
      this.engineOn = false;
      this.level = 0;
      this._rpm = 0;
      this._gear = 0;
      this._rev = 0;
      this._brakeSq = 0;
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
      this.master.threshold.value = -12;
      this.master.ratio.value = 4;
      this.master.connect(ctx.destination);

      // Ruido blanco reutilizable (2 s).
      const len = ctx.sampleRate * 2;
      this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // --- Bus de música: entrada -> (seco + reverb) -> filtro (pausa) -> volumen
      this.musicBus = ctx.createGain();
      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 18000;
      this.musicFilter.connect(this.musicBus);
      this.musicBus.connect(this.master);
      this.musicIn = ctx.createGain();
      this.musicIn.connect(this.musicFilter);
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._impulse(2.4);
      const revSend = ctx.createGain();
      revSend.gain.value = 0.28;
      this.musicIn.connect(revSend).connect(this.reverb).connect(this.musicFilter);
      // Eco para la melodía.
      this.leadIn = ctx.createGain();
      const delay = ctx.createDelay(1);
      delay.delayTime.value = STEP * 3;
      const fb = ctx.createGain();
      fb.gain.value = 0.32;
      this.leadIn.connect(this.musicIn);
      this.leadIn.connect(delay).connect(fb).connect(delay);
      fb.connect(this.musicIn);

      // --- Bus de efectos
      this.sfxBus = ctx.createGain();
      this.sfxBus.connect(this.master);

      this._buildCar();
      this.applySettings(this.settings);
      if (this.mode !== 'off') this._startScheduler();
    }

    applySettings(s) {
      this.settings = Object.assign({}, this.settings, s);
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      const music = this.settings.musicMuted ? 0 : this.settings.musicVolume * 0.6;
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

    /* ================================================================ */
    /* Música                                                           */
    /* ================================================================ */

    setMusic(mode) {
      if (mode === this.mode) return;
      this.mode = mode;
      if (!this.ctx) return;
      if (mode === 'off') this._stopScheduler();
      else this._startScheduler();
    }

    /** Amortigua la música (pausa). */
    muffle(on) {
      if (!this.ctx) return;
      this.musicFilter.frequency.setTargetAtTime(on ? 650 : 18000, this.ctx.currentTime, 0.12);
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
        this._step = (this._step + 1) % (16 * BARS);
      }
    }

    _playStep(step, t) {
      const race = this.mode === 'race';
      const barIndex = Math.floor(step / 16);
      const bar = barIndex % 4;
      const s = step % 16;
      const chord = CHORDS[bar];
      const out = this.musicIn;

      // Pad: tres voces desafinadas por compás.
      if (s === 0) {
        for (const f of chord.notes) {
          for (const det of [-6, 6]) {
            this._tone(f / 2, t, STEP * 16, {
              type: 'sawtooth', gain: race ? 0.018 : 0.026, attack: 0.5, filter: race ? 1400 : 900, detune: det, dest: out,
            });
          }
        }
      }
      // Bajo.
      if (race ? s % 2 === 0 : s % 4 === 0) {
        const f = chord.root * (s === 6 || s === 14 ? 2 : 1);
        this._tone(f, t, STEP * (race ? 1.5 : 3), { type: 'sawtooth', gain: race ? 0.15 : 0.1, filter: race ? 800 : 500, dest: out });
      }
      // Arpegio.
      const arp = chord.notes[s % 3] * (s % 6 >= 3 ? 2 : 1);
      this._tone(arp, t, STEP * 0.9, { type: race ? 'square' : 'triangle', gain: race ? 0.022 : 0.03, filter: race ? 3200 : 1800, dest: out });
      // Melodía (sección A en el menú; A y B en carrera).
      const n = MELODY[race ? barIndex : barIndex % 4][s];
      if (n != null) {
        const f = noteFreq(n);
        const dur = STEP * 2.5;
        this._tone(f, t, dur, { type: race ? 'sawtooth' : 'triangle', gain: race ? 0.035 : 0.04, filter: race ? 2600 : 2000, detune: 0, dest: this.leadIn });
        if (race) this._tone(f * 2, t, dur, { type: 'square', gain: 0.008, filter: 3000, dest: this.leadIn });
      }
      if (!race) return;

      // Batería.
      if (s % 4 === 0) this._kick(t, out);
      if (s === 4 || s === 12) this._snare(t, out);
      this._noise(t, s % 4 === 2 ? 0.12 : 0.025, { gain: s % 4 === 2 ? 0.05 : 0.03, type: 'highpass', freq: 8000, dest: out });
      if (step === 0) this._noise(t, 1.6, { gain: 0.07, type: 'highpass', freq: 5000, dest: out }); // platillo
    }

    _impulse(seconds) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      return buf;
    }

    /* ================================================================ */
    /* Auto: capas continuas                                            */
    /* ================================================================ */

    _buildCar() {
      const ctx = this.ctx;
      const loopNoise = () => {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuffer;
        src.loop = true;
        src.start();
        return src;
      };

      // Motor: 2 sierras desafinadas + cuadrada sub -> AM (explosiones) -> distorsión -> filtro.
      this.engOut = ctx.createGain();
      this.engOut.gain.value = 0;
      this.engFilter = ctx.createBiquadFilter();
      this.engFilter.type = 'lowpass';
      this.engFilter.Q.value = 4;
      this.engFilter.connect(this.engOut).connect(this.sfxBus);
      const shaper = ctx.createWaveShaper();
      shaper.curve = distortionCurve(6);
      shaper.connect(this.engFilter);
      this.engAM = ctx.createGain();
      this.engAM.gain.value = 0.55;
      this.engAM.connect(shaper);
      this.engA = ctx.createOscillator();
      this.engA.type = 'sawtooth';
      this.engB = ctx.createOscillator();
      this.engB.type = 'sawtooth';
      this.engB.detune.value = 9;
      this.engSub = ctx.createOscillator();
      this.engSub.type = 'square';
      const subGain = ctx.createGain();
      subGain.gain.value = 0.5;
      this.engA.connect(this.engAM);
      this.engB.connect(this.engAM);
      this.engSub.connect(subGain).connect(this.engAM);
      this.engLfo = ctx.createOscillator();
      this.engLfo.type = 'sine';
      const lfoDepth = ctx.createGain();
      lfoDepth.gain.value = 0.4;
      this.engLfo.connect(lfoDepth).connect(this.engAM.gain);
      [this.engA, this.engB, this.engSub, this.engLfo].forEach((o) => o.start());

      // Turbo (silbido).
      this.turbo = ctx.createOscillator();
      this.turbo.type = 'sine';
      this.turboGain = ctx.createGain();
      this.turboGain.gain.value = 0;
      this.turbo.connect(this.turboGain).connect(this.sfxBus);
      this.turbo.start();

      // Viento / rodadura.
      this.windFilter = ctx.createBiquadFilter();
      this.windFilter.type = 'lowpass';
      this.windGain = ctx.createGain();
      this.windGain.gain.value = 0;
      loopNoise().connect(this.windFilter).connect(this.windGain).connect(this.sfxBus);

      // Chirrido de frenos (continuo, con vibrato).
      this.squealFilter = ctx.createBiquadFilter();
      this.squealFilter.type = 'bandpass';
      this.squealFilter.frequency.value = 2600;
      this.squealFilter.Q.value = 14;
      this.squealGain = ctx.createGain();
      this.squealGain.gain.value = 0;
      loopNoise().connect(this.squealFilter).connect(this.squealGain).connect(this.sfxBus);
      const vib = ctx.createOscillator();
      vib.frequency.value = 11;
      const vibDepth = ctx.createGain();
      vibDepth.gain.value = 260;
      vib.connect(vibDepth).connect(this.squealFilter.frequency);
      vib.start();
      this.squealTone = ctx.createOscillator();
      this.squealTone.type = 'triangle';
      this.squealTone.frequency.value = 1150;
      this.squealToneGain = ctx.createGain();
      this.squealToneGain.gain.value = 0;
      vibDepth.connect(this.squealTone.frequency);
      this.squealTone.connect(this.squealToneGain).connect(this.sfxBus);
      this.squealTone.start();
    }

    /**
     * Actualiza el sonido del auto cada frame.
     * @param on     motor encendido
     * @param level  velocidad normalizada 0..1
     */
    engine(on, level = 0, nitro = false, brake = false, dt = 1 / 60) {
      if (!this.ctx) return;
      const t = this.ctx.currentTime;
      this.level = level;

      // Marchas: dentro de cada marcha las RPM suben; al pasar a la siguiente, caen.
      const g = Math.min(GEARS - 1, Math.floor(level * GEARS));
      if (on && g > this._gear && this._rpm > 0) this.play('shift');
      this._gear = g;
      const inGear = level * GEARS - g;
      let rpm = 0.35 + 0.6 * (g === GEARS - 1 ? Math.min(1, inGear * 0.6 + 0.4) : inGear);
      if (nitro) rpm += 0.25;
      if (brake) rpm -= 0.22;
      this._rev = Math.max(0, this._rev - dt * 1.6);
      rpm = Math.max(0.15, Math.min(1.25, rpm + this._rev));
      this._rpm += (rpm - this._rpm) * Math.min(1, dt * 6);

      const f0 = 34 + this._rpm * 92;
      this.engA.frequency.setTargetAtTime(f0, t, 0.05);
      this.engB.frequency.setTargetAtTime(f0, t, 0.05);
      this.engSub.frequency.setTargetAtTime(f0 / 2, t, 0.05);
      this.engLfo.frequency.setTargetAtTime(f0 / 2, t, 0.05);
      this.engFilter.frequency.setTargetAtTime(260 + this._rpm * 2000 + (nitro ? 900 : 0), t, 0.06);
      this.engOut.gain.setTargetAtTime(on ? 0.075 + this._rpm * 0.03 : 0, t, on ? 0.12 : 0.06);

      this.turbo.frequency.setTargetAtTime(1600 + this._rpm * 1800, t, 0.1);
      this.turboGain.gain.setTargetAtTime(on && nitro ? 0.018 : 0, t, nitro ? 0.15 : 0.05);

      this.windFilter.frequency.setTargetAtTime(400 + level * 1600, t, 0.2);
      this.windGain.gain.setTargetAtTime(on ? level * level * 0.09 : 0, t, 0.2);

      const sq = on && brake ? Math.min(1, 0.4 + level) : 0;
      this.squealGain.gain.setTargetAtTime(sq * 0.11, t, sq ? 0.04 : 0.12);
      this.squealToneGain.gain.setTargetAtTime(sq * 0.012, t, sq ? 0.04 : 0.12);
      this.engineOn = on;
    }

    /** Acelerón puntual (cuenta atrás, salida). */
    rev(amount) {
      this._rev = Math.max(this._rev, amount);
    }

    /* ================================================================ */
    /* Efectos puntuales                                                */
    /* ================================================================ */

    play(name, opts = {}) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime;
      const o = { dest: this.sfxBus };
      const seq = (notes, gap, op) => notes.forEach((f, i) => this._tone(f, t + i * gap, gap * 1.6, Object.assign({}, o, op)));
      const lvl = 0.4 + this.level * 0.8;
      switch (name) {
        case 'orb': seq([1046, 1568], 0.045, { type: 'square', gain: 0.06, filter: 5000 }); break;
        case 'orb-green': seq([784, 1175, 1568, 2093], 0.04, { type: 'square', gain: 0.06, filter: 6000 }); break;
        case 'lane':
          // Llantas chillando + golpe de aire, con paneo hacia el lado del giro.
          this._squeal(t, 0.28, 0.07 * lvl, opts.dir || 0);
          this._noise(t, 0.16, { gain: 0.05, type: 'bandpass', freq: 700, sweep: 1800, pan: (opts.dir || 0) * 0.5 });
          break;
        case 'bump':
          this._tone(90, t, 0.12, { type: 'square', gain: 0.12, filter: 500, ...o });
          this._squeal(t, 0.12, 0.05, opts.dir || 0);
          break;
        case 'deny': seq([220, 165], 0.06, { type: 'square', gain: 0.07, filter: 1200 }); break;
        case 'nitro':
          this.rev(0.45);
          this._noise(t, 0.9, { gain: 0.2, type: 'bandpass', freq: 500, sweep: 5000 });
          this._tone(120, t, 0.7, { type: 'sawtooth', gain: 0.09, slide: 520, filter: 2200, ...o });
          for (let i = 0; i < 5; i++) this._noise(t + 0.05 + i * 0.07 * Math.random(), 0.04, { gain: 0.12, type: 'lowpass', freq: 900 });
          break;
        case 'nitro-end':
          // Válvula de alivio del turbo.
          this._noise(t, 0.35, { gain: 0.12, type: 'highpass', freq: 3000, sweep: 1200 });
          break;
        case 'shift':
          this._noise(t, 0.08, { gain: 0.1, type: 'lowpass', freq: 600 });
          this._tone(140, t, 0.09, { type: 'square', gain: 0.05, slide: 90, filter: 800, ...o });
          break;
        case 'brake':
          this._squeal(t, 0.18, 0.06 * lvl, 0);
          this._tone(70, t, 0.15, { type: 'sine', gain: 0.12, slide: 45, ...o });
          break;
        case 'overheat':
          this._noise(t, 0.8, { gain: 0.14, type: 'highpass', freq: 4000, sweep: 2000 });
          seq([300, 220], 0.08, { type: 'square', gain: 0.06, filter: 1500 });
          break;
        case 'pass':
          // Auto adelantado: whoosh con desplazamiento estéreo.
          this._noise(t, 0.45, { gain: 0.16 * lvl, type: 'bandpass', freq: 300, sweep: 1400, pan: opts.dir || 0, panTo: (opts.dir || 0) * 1 });
          this._tone(180, t, 0.4, { type: 'sawtooth', gain: 0.03, slide: 110, filter: 700, ...o });
          break;
        case 'power-shield': seq([523, 659, 784, 1046], 0.06, { type: 'triangle', gain: 0.14 }); break;
        case 'power-magnet': seq([392, 523, 659, 523, 784], 0.05, { type: 'sawtooth', gain: 0.07, filter: 2000 }); break;
        case 'power-multiplier': seq([659, 784, 988, 1318], 0.06, { type: 'square', gain: 0.07, filter: 4000 }); break;
        case 'shield-hit':
          this._noise(t, 0.35, { gain: 0.25, type: 'lowpass', freq: 2500 });
          this._tone(620, t, 0.4, { type: 'triangle', gain: 0.15, slide: 180, ...o });
          break;
        case 'powerdown': this._tone(600, t, 0.25, { type: 'triangle', gain: 0.07, slide: 300, ...o }); break;
        case 'crash': this._crash(t); break;
        case 'count':
          this.rev(0.35);
          this._tone(440, t, 0.14, { type: 'square', gain: 0.07, filter: 2500, ...o });
          break;
        case 'go':
          this.rev(0.8);
          this._tone(880, t, 0.4, { type: 'square', gain: 0.08, filter: 3500, ...o });
          this._squeal(t, 0.5, 0.08, 0); // salida quemando rueda
          break;
        case 'levelup': seq([523, 659, 784], 0.07, { type: 'square', gain: 0.06, filter: 3500 }); break;
        case 'record': seq([523, 659, 784, 1046, 1318], 0.08, { type: 'square', gain: 0.07, filter: 4000 }); break;
        case 'mission': seq([784, 988, 1175, 1568], 0.07, { type: 'triangle', gain: 0.11 }); break;
        case 'purchase': seq([660, 880, 1320], 0.06, { type: 'square', gain: 0.07, filter: 4000 }); break;
        case 'click': this._tone(1400, t, 0.04, { type: 'sine', gain: 0.06, ...o }); break;
        case 'gameover': seq([392, 330, 262, 196], 0.13, { type: 'triangle', gain: 0.11 }); break;
      }
    }

    /** Chirrido de neumático puntual. */
    _squeal(t, dur, gain, pan) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 12;
      f.frequency.setValueAtTime(2900, t);
      f.frequency.linearRampToValueAtTime(2300, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      let node = src.connect(f).connect(g);
      if (pan && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, pan * 0.6));
        node = node.connect(p);
      }
      node.connect(this.sfxBus);
      src.start(t, Math.random());
      src.stop(t + dur + 0.05);
      // Componente tonal con vibrato.
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1250, t);
      osc.frequency.linearRampToValueAtTime(1050, t + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(gain * 0.15, t + 0.03);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(og).connect(this.sfxBus);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }

    /** Choque: frenazo, golpe grave, chapa metálica y cristales. */
    _crash(t) {
      this._squeal(t, 0.25, 0.1, 0);
      this._noise(t + 0.05, 1.2, { gain: 0.5, type: 'lowpass', freq: 3500, sweep: 180 });
      this._tone(85, t + 0.05, 0.9, { type: 'sine', gain: 0.6, slide: 28, dest: this.sfxBus });
      for (const f of [317, 541, 893, 1270]) {
        this._tone(f, t + 0.06, 0.6 + Math.random() * 0.5, { type: 'square', gain: 0.04, slide: f * 0.7, filter: 3000, dest: this.sfxBus });
      }
      for (let i = 0; i < 9; i++) {
        this._tone(3000 + Math.random() * 3500, t + 0.15 + Math.random() * 0.5, 0.08, { type: 'sine', gain: 0.03, dest: this.sfxBus });
      }
    }

    /* ================================================================ */
    /* Síntesis                                                         */
    /* ================================================================ */

    _tone(freq, t, dur, { type = 'square', gain = 0.1, attack = 0.005, filter = 0, slide = 0, detune = 0, dest } = {}) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t);
      if (detune) osc.detune.value = detune;
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, attack + 0.01));
      let node = osc.connect(g);
      if (filter) {
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = filter;
        node = node.connect(f);
      }
      node.connect(dest || this.sfxBus);
      osc.start(t);
      osc.stop(t + Math.max(dur, attack) + 0.05);
    }

    _noise(t, dur, { gain = 0.1, type = 'bandpass', freq = 1000, sweep = 0, pan = 0, panTo = null, dest } = {}) {
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
      let node = src.connect(f).connect(g);
      if ((pan || panTo != null) && ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan * 0.3)), t);
        if (panTo != null) p.pan.linearRampToValueAtTime(Math.max(-1, Math.min(1, panTo)), t + dur);
        node = node.connect(p);
      }
      node.connect(dest || this.sfxBus);
      src.start(t, Math.random());
      src.stop(t + dur + 0.05);
    }

    _kick(t, dest) {
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(150, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(g).connect(dest);
      osc.start(t);
      osc.stop(t + 0.25);
    }

    _snare(t, dest) {
      this._noise(t, 0.18, { gain: 0.14, type: 'bandpass', freq: 1900, dest });
      this._tone(190, t, 0.1, { type: 'triangle', gain: 0.09, slide: 140, dest });
    }
  }

  function distortionCurve(k) {
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
    }
    return curve;
  }

  NR.Audio = new AudioSystem();
})(window.NR);
