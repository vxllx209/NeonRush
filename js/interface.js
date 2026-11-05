/**
 * NEON RUSH — Capa de interfaz (DOM).
 *
 * - Un único listener delegado de clic para todo [data-action]: aunque
 *   se reinicie la partida muchas veces, nunca se acumulan listeners.
 * - Cada <section data-screen="ESTADO"> se activa según el estado actual;
 *   las pantallas inactivas quedan `inert` (sin foco ni clics).
 * - El HUD solo toca el DOM cuando un valor visible cambia.
 */
(function (NR) {
  'use strict';

  const { formatNumber } = NR.util;
  const MAX_TOASTS = 3;

  const formatTime = (s) => {
    const t = Math.floor(s);
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
  };

  class Interface {
    constructor(root, { onAction }) {
      this.root = root;
      this.onAction = onAction;
      this.toastRegion = root.querySelector('.toast-region');
      this.screens = [...root.querySelectorAll('[data-screen]')];
      this._q = (sel) => root.querySelector(sel);

      this.hud = {
        score: this._q('[data-hud="score"]'),
        best: this._q('[data-hud="best"]'),
        energy: this._q('[data-hud="energy"]'),
        mult: this._q('[data-hud="mult"]'),
        multChip: this._q('.hud-chip--mult'),
        nitro: this._q('[data-hud="nitro"]'),
        nitroGauge: this._q('.gauge--nitro'),
        heat: this._q('[data-hud="heat"]'),
        heatGauge: this._q('.gauge--brake'),
        powers: [...root.querySelectorAll('[data-power]')].map((el) => ({
          el, type: el.dataset.power, bar: el.querySelector('b'), total: NR.POWERUPS[el.dataset.power].time,
        })),
      };
      this._hudCache = {};
      this.bannerEl = this._q('.hud-banner');
      this.countdownEl = this._q('.countdown');
      this._tween = 0;

      this._onClick = this._onClick.bind(this);
      root.addEventListener('click', this._onClick);
    }

    _onClick(event) {
      const el = event.target.closest('[data-action]');
      if (!el || !this.root.contains(el) || el.disabled) return;
      if (el.closest('[inert]')) return;
      this.onAction(el.dataset.action, el);
    }

    showScreen(state) {
      this.root.dataset.state = state;
      for (const screen of this.screens) {
        const active = screen.dataset.screen === state;
        screen.classList.toggle('is-active', active);
        screen.toggleAttribute('inert', !active);
        screen.setAttribute('aria-hidden', String(!active));
      }
      // Foco en la acción principal de la pantalla (accesible con teclado).
      const screen = this.screens.find((s) => s.dataset.screen === state);
      const primary = screen && screen.querySelector('.btn--primary, [data-action="tut-next"]');
      if (primary && state !== 'PLAYING' && state !== 'MENU') primary.focus({ preventScroll: true });
      else if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    }

    bindValues(data) {
      for (const el of this.root.querySelectorAll('[data-bind]')) {
        const value = data[el.dataset.bind];
        if (value === undefined) continue;
        el.textContent = typeof value === 'number' ? formatNumber(value) : String(value);
      }
    }

    /* ---------------- HUD ---------------- */

    resetHud() {
      this._hudCache = {};
      this.hud.powers.forEach((p) => (p.el.hidden = true));
      this.bannerEl.className = 'hud-banner';
      this.bannerEl.textContent = '';
      this.countdownEl.className = 'countdown';
      this.countdownEl.textContent = '';
    }

    updateHud(game) {
      const car = game.car;
      this._set('score', Math.floor(game.score), formatNumber);
      this._set('best', Math.floor(game.best), formatNumber);
      this._set('energy', game.energy, formatNumber);
      this._set('mult', game.scoreMult, (m) => `x${m}`);

      // Medidores: solo se tocan cuando cambian más de un 1%.
      const nitro = car.nitroActive ? car.nitroT / NR.CONFIG.GAME.NITRO_DURATION : car.nitroMeter;
      this._bar('nitro', nitro);
      this._flag('nitroReady', car.nitroReady, () => this.hud.nitroGauge.classList.toggle('is-ready', car.nitroReady));
      this._flag('nitroOn', car.nitroActive, () => this.hud.nitroGauge.classList.toggle('is-active', car.nitroActive));
      this._bar('heat', car.heat);
      this._flag('hot', car.overheated, () => this.hud.heatGauge.classList.toggle('is-hot', car.overheated));
      this._flag('braking', car.braking, () => this.hud.heatGauge.classList.toggle('is-active', car.braking));

      for (const p of this.hud.powers) {
        const left = game.power[p.type];
        const on = left > 0;
        this._flag(`p-${p.type}`, on, () => {
          p.el.hidden = !on;
          if (on) this._retrigger(p.el, 'is-new');
        });
        if (on) {
          const k = Math.round((left / p.total) * 100) / 100;
          if (this._hudCache[`pb-${p.type}`] !== k) {
            this._hudCache[`pb-${p.type}`] = k;
            p.bar.style.transform = `scaleX(${k})`;
            p.el.classList.toggle('is-ending', left < 1.2);
          }
        }
      }
    }

    _set(key, value, fmt) {
      if (this._hudCache[key] === value) return;
      this._hudCache[key] = value;
      this.hud[key].textContent = fmt(value);
      if (key === 'mult') this._retrigger(this.hud.multChip, 'is-bump');
    }

    _bar(key, value) {
      const k = Math.round(value * 100) / 100;
      if (this._hudCache[key] === k) return;
      this._hudCache[key] = k;
      this.hud[key].style.transform = `scaleX(${k})`;
    }

    _flag(key, value, apply) {
      if (this._hudCache[key] === value) return;
      this._hudCache[key] = value;
      apply();
    }

    banner(text, tone = 'cyan') {
      this.bannerEl.textContent = text;
      this.bannerEl.className = `hud-banner hud-banner--${tone}`;
      this._retrigger(this.bannerEl, 'is-on');
    }

    countdown(label) {
      this.countdownEl.textContent = label;
      this.countdownEl.className = `countdown${label === 'GO' ? ' countdown--go' : ''}`;
      this._retrigger(this.countdownEl, 'is-on');
    }

    _retrigger(el, cls) {
      el.classList.remove(cls);
      void el.offsetWidth; // reinicia la animación CSS
      el.classList.add(cls);
    }

    /* ---------------- Paneles ---------------- */

    showPause(game) {
      this._q('[data-pause="score"]').textContent = formatNumber(game.score);
      this._q('[data-pause="energy"]').textContent = formatNumber(game.energy);
      this._q('[data-pause="time"]').textContent = formatTime(game.time);
    }

    showGameOver(r) {
      const q = (k) => this._q(`[data-go="${k}"]`);
      q('best').textContent = formatNumber(r.best);
      q('orbs').textContent = formatNumber(r.orbs);
      q('time').textContent = formatTime(r.time);
      q('distance').textContent = `${formatNumber(r.distance)} m`;
      q('energy').textContent = formatNumber(r.energy);
      q('record').hidden = !r.newRecord;
      this._q('.panel--gameover').classList.toggle('is-record', r.newRecord);
      this._countUp(q('score'), r.score, 900);
    }

    /** Animación de conteo de la puntuación final. */
    _countUp(el, target, ms) {
      cancelAnimationFrame(this._tween);
      const start = performance.now();
      const tick = (now) => {
        const k = Math.min(1, (now - start) / ms);
        const eased = 1 - (1 - k) ** 3;
        el.textContent = formatNumber(target * eased);
        if (k < 1) this._tween = requestAnimationFrame(tick);
      };
      this._tween = requestAnimationFrame(tick);
    }

    setSwitch(action, on) {
      const el = this._q(`[data-action="${action}"]`);
      if (el) el.setAttribute('aria-checked', String(on));
    }

    /** Ajustes: interruptores y deslizadores de audio. */
    syncSettings(s) {
      this.setSwitch('toggle-reduced', s.reducedEffects);
      this.setSwitch('toggle-music', !s.musicMuted);
      this.setSwitch('toggle-sfx', !s.sfxMuted);
      for (const key of ['musicVolume', 'sfxVolume']) {
        const input = this._q(`[data-setting="${key}"]`);
        if (input) {
          input.value = Math.round(s[key] * 100);
          input.style.setProperty('--v', `${input.value}%`);
        }
      }
    }

    /** Insignia de misiones por cobrar en el menú. */
    setBadge(count) {
      const b = this._q('[data-bind="missionBadge"]');
      if (!b) return;
      b.textContent = String(count);
      b.hidden = count === 0;
    }

    /* ---------------- Toasts ---------------- */

    toast(message, { tag = 'INFO', tone = 'cyan', duration = 2800 } = {}) {
      if (!this.toastRegion) return;

      const live = [...this.toastRegion.querySelectorAll('.toast:not(.is-leaving)')];

      // Mismo mensaje ya visible: se renueva su tiempo en lugar de duplicarlo.
      const same = live.find((t) => t.dataset.message === message);
      if (same) {
        clearTimeout(same._timer);
        same._timer = setTimeout(() => this._dismiss(same), duration);
        return;
      }
      if (live.length >= MAX_TOASTS) this._dismiss(live[0]);

      const el = document.createElement('div');
      el.className = `toast toast--${tone}`;
      el.setAttribute('role', 'status');
      el.dataset.message = message;
      const tagEl = document.createElement('span');
      tagEl.className = 'toast__tag';
      tagEl.textContent = tag;
      const msgEl = document.createElement('span');
      msgEl.textContent = message;
      el.append(tagEl, msgEl);

      this.toastRegion.append(el);
      el._timer = setTimeout(() => this._dismiss(el), duration);
    }

    _dismiss(el) {
      if (!el || el.classList.contains('is-leaving')) return;
      clearTimeout(el._timer);
      el.classList.add('is-leaving');
      const remove = () => el.remove();
      el.addEventListener('animationend', remove, { once: true });
      setTimeout(remove, 600); // por si las animaciones están desactivadas
    }

    destroy() {
      this.root.removeEventListener('click', this._onClick);
    }
  }

  NR.Interface = Interface;
  NR.formatTime = formatTime;
})(window.NR);
