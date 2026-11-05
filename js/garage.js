/**
 * NEON RUSH — GARAGE: "landing page" de selección de auto antes de correr.
 *
 * - Vista previa animada del auto sobre una plataforma giratoria.
 * - Flechas / teclado ←→ / deslizar para cambiar de auto.
 * - Los autos desbloqueados se equipan al verlos ("lo que ves es lo que corres").
 * - Pintura, estela y efecto: se equipan aquí entre los que ya posees;
 *   el botón "+" lleva a la tienda.
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;
  const CAT = NR.CATALOG;
  const { formatNumber, clamp } = NR.util;

  class Garage {
    constructor(root) {
      this.root = root;
      this.canvas = root.querySelector('.garage-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.q = (k) => root.querySelector(`[data-garage="${k}"]`);
      this.index = 0;
      this.time = 0;
      this.slide = 0;      // desplazamiento de la animación de cambio de auto
      this.save = null;
      this._swipe = null;

      this.canvas.addEventListener('pointerdown', (e) => { this._swipe = { x: e.clientX, id: e.pointerId }; });
      this.canvas.addEventListener('pointerup', (e) => {
        if (!this._swipe || this._swipe.id !== e.pointerId) return;
        const dx = e.clientX - this._swipe.x;
        this._swipe = null;
        if (Math.abs(dx) > 40) this.step(dx < 0 ? 1 : -1);
      });
    }

    get car() { return CAT.CARS[this.index]; }

    open(save) {
      this.save = save;
      this.index = Math.max(0, CAT.CARS.findIndex((c) => c.id === save.equipped.car));
      this.slide = 0;
      this.resize();
      this.renderInfo();
    }

    /** Cambia el auto visible. Si está desbloqueado, se equipa. */
    step(dir) {
      this.index = (this.index + dir + CAT.CARS.length) % CAT.CARS.length;
      this.slide = dir;
      if (this.owns('cars', this.car.id)) {
        this.save = NR.Storage.update((d) => { d.equipped.car = this.car.id; });
      }
      NR.Audio.play('click');
      this.renderInfo();
    }

    owns(cat, id) {
      return this.save.unlocked[cat].includes(id);
    }

    setSave(save) {
      this.save = save;
      this.renderInfo();
    }

    /** Texto, puntos, botón principal y selectores de cosméticos. */
    renderInfo() {
      const car = this.car;
      const save = this.save;
      const owned = this.owns('cars', car.id);
      this.q('class').textContent = car.cls;
      this.q('name').textContent = car.name;
      this.q('desc').textContent = car.desc;
      this.q('coins').textContent = formatNumber(save.coins);
      // Cualidades: las propias incluyen mejoras y botones del taller;
      // las de un auto bloqueado se comparan con el auto equipado (ya mejorado).
      const equipped = CAT.find('cars', save.equipped.car);
      const stats = CAT.effectiveStats(car.id, owned ? save.upgrades : null);
      StatsView.render(this.q('stats'), stats, {
        base: car.stats,
        compare: equipped && equipped.id !== car.id ? CAT.effectiveStats(equipped.id, save.upgrades) : null,
        upgrade: owned ? { car, levels: CAT.upgradeLevels(car.id, save.upgrades), coins: save.coins } : null,
      });

      const dots = this.q('dots');
      dots.replaceChildren(...CAT.CARS.map((c, i) => {
        const dot = document.createElement('i');
        dot.classList.toggle('is-on', i === this.index);
        dot.classList.toggle('is-locked', !this.owns('cars', c.id));
        return dot;
      }));

      const status = this.q('status');
      const primary = this.q('primary');
      primary.disabled = false;
      if (owned) {
        status.textContent = save.equipped.car === car.id ? 'SELECCIONADO' : 'DESBLOQUEADO';
        status.className = 'garage-status is-owned';
        primary.textContent = 'RACE';
        primary.dataset.mode = 'race';
      } else if (save.coins >= car.price) {
        status.textContent = `BLOQUEADO · ${formatNumber(car.price)} ENERGY`;
        status.className = 'garage-status is-locked';
        primary.textContent = `UNLOCK · ${formatNumber(car.price)}`;
        primary.dataset.mode = 'unlock';
      } else {
        status.textContent = `BLOQUEADO · te faltan ${formatNumber(car.price - save.coins)} de energía`;
        status.className = 'garage-status is-locked';
        primary.textContent = `LOCKED · ${formatNumber(car.price)}`;
        primary.dataset.mode = 'locked';
        primary.disabled = true;
      }

      this._swatches('paints', 'paint', (p) => `linear-gradient(135deg, ${p.swatch[0]} 50%, ${p.swatch[1]} 50%)`);
      this._swatches('trails', 'trail', (t) => `linear-gradient(90deg, ${t.colors.join(', ')}${t.colors.length === 1 ? `, ${t.colors[0]}` : ''})`);
      this._swatches('effects', 'effect', (e) => e.id === 'none' ? 'repeating-linear-gradient(45deg, #1a2140 0 4px, #0c1124 4px 8px)'
        : e.id === 'underglow' ? 'radial-gradient(circle, #00D9FF, #0c1124 70%)'
          : e.id === 'sparks' ? 'radial-gradient(circle, #FFD23F, #0c1124 70%)'
            : 'radial-gradient(circle, #8B5CF6, #0c1124 70%)');
    }

    _swatches(cat, key, bg) {
      const box = this.q(cat);
      const owned = CAT.CATEGORIES[cat].filter((item) => this.owns(cat, item.id));
      const nodes = owned.map((item) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'swatch';
        b.title = item.name;
        b.setAttribute('aria-label', item.name);
        b.style.background = bg(item);
        b.dataset.action = 'equip';
        b.dataset.cat = cat;
        b.dataset.id = item.id;
        b.classList.toggle('is-on', this.save.equipped[key] === item.id);
        return b;
      });
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'swatch swatch--more';
      more.textContent = '+';
      more.title = 'Más en la tienda';
      more.setAttribute('aria-label', 'Más en la tienda');
      more.dataset.action = 'open-shop';
      more.dataset.tab = cat;
      box.replaceChildren(...nodes, more);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, NR.CONFIG.MAX_DPR);
      const w = this.canvas.clientWidth || 1;
      const h = this.canvas.clientHeight || 1;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w;
      this.h = h;
    }

    update(dt) {
      this.time += dt;
      this.slide *= Math.pow(0.0005, dt); // vuelve a 0 rápidamente
      if (Math.abs(this.slide) < 0.001) this.slide = 0;
    }

    render() {
      const { ctx, w, h, time } = this;
      if (!w || !this.save) return;
      ctx.clearRect(0, 0, w, h);
      const car = this.car;
      const colors = CAT.resolveColors(car.id, this.save.equipped.paint);
      const trail = CAT.find('trails', this.save.equipped.trail);
      const owned = this.owns('cars', car.id);

      const cx = w / 2;
      const ground = h * 0.84;
      const u = Math.min(w * (h > w * 0.75 ? 0.62 : 0.3), h * 0.92);

      // Foco de luz.
      const spot = ctx.createRadialGradient(cx, ground - u * 0.3, 0, cx, ground - u * 0.3, u * 1.1);
      spot.addColorStop(0, 'rgba(139,92,246,0.25)');
      spot.addColorStop(1, 'rgba(139,92,246,0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, w, h);

      // Plataforma giratoria.
      ctx.save();
      ctx.translate(cx, ground);
      ctx.scale(1, 0.22);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        ctx.strokeStyle = i === 1 ? C.pink : C.cyan;
        ctx.globalAlpha = 0.5 - i * 0.12;
        ctx.lineWidth = 2;
        ctx.setLineDash([u * 0.12, u * 0.06]);
        ctx.lineDashOffset = (i % 2 ? -1 : 1) * time * u * 0.3;
        ctx.beginPath();
        ctx.arc(0, 0, u * (0.62 + i * 0.12), 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, u * 0.6);
      g.addColorStop(0, 'rgba(0,217,255,0.3)');
      g.addColorStop(1, 'rgba(0,217,255,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      const x = cx + this.slide * w * 0.6;
      const alpha = clamp(1 - Math.abs(this.slide) * 1.5, 0, 1);

      // Vista previa de la estela.
      if (trail) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = alpha;
        for (const side of [-1, 1]) {
          const grad = ctx.createLinearGradient(0, ground - u * 0.08, 0, h);
          grad.addColorStop(0, trail.colors[0]);
          grad.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.strokeStyle = trail.colors.length > 1 ? trail.colors[(Math.floor(time * 4) + (side > 0 ? 2 : 0)) % trail.colors.length] : grad;
          ctx.lineWidth = u * 0.05;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x + side * u * 0.3, ground - u * 0.06);
          ctx.lineTo(x + side * u * 0.42, h);
          ctx.stroke();
        }
        ctx.restore();
      }

      // "Acelerón" periódico: luz de freno y llama de nitro.
      const rev = (time % 4) > 3.3;
      NR.CarRenderer.draw(ctx, x, ground, u, car.model, owned ? colors : lockedColors(), {
        wheel: time * 0.6, time, alpha, effect: owned ? this.save.equipped.effect : 'none',
        bounce: Math.sin(time * 30) * 0.003, nitro: owned && rev ? 1 : 0, brake: rev ? 0 : 0.4,
      });

      if (!owned) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = C.white;
        ctx.font = `900 ${Math.round(u * 0.1)}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.shadowColor = C.pink;
        ctx.shadowBlur = 16;
        ctx.fillText('LOCKED', x, ground - u * 0.68);
        ctx.restore();
      }
    }
  }

  /**
   * Barras de cualidades de un auto (garaje, garaje inicial y tienda).
   * @param stats   cualidades finales (de serie + mejoras)
   * @param base    cualidades de serie: la parte mejorada se pinta en verde
   * @param compare cualidades de otro auto (el equipado) como referencia;
   *                la diferencia se colorea en verde (mejor) o rosa (peor)
   * @param upgrade { car, levels, coins }: muestra los botones del taller
   */
  const StatsView = {
    render(el, stats, { compare = null, compact = false, base = null, upgrade = null } = {}) {
      if (!el || !stats) return;
      el.classList.toggle('car-stats--compact', compact);
      el.classList.toggle('car-stats--upgrade', !!upgrade);
      const rows = CAT.STATS.map(({ key, label }) => {
        const v = stats[key];
        const row = document.createElement('div');
        row.className = 'stat';
        const name = document.createElement('span');
        name.className = 'stat__label';
        name.textContent = label;
        const bar = document.createElement('i');
        bar.className = 'stat__bar';
        bar.style.setProperty('--v', `${Math.round(v * 100)}%`);
        if (base && base[key] < v) {
          // Proporción de la barra que es de serie (el resto es mejora).
          bar.style.setProperty('--b', `${Math.round((base[key] / v) * 100)}%`);
          bar.dataset.upgraded = '1';
        }
        if (compare) {
          const c = compare[key];
          bar.style.setProperty('--m', `${Math.round(c * 100)}%`);
          bar.dataset.delta = v > c + 0.004 ? 'up' : v < c - 0.004 ? 'down' : 'same';
        }
        const value = document.createElement('b');
        value.className = 'stat__value';
        value.textContent = (v * 10).toFixed(1);
        row.append(name, bar, value);

        if (upgrade) {
          const level = upgrade.levels[key];
          const pips = document.createElement('span');
          pips.className = 'stat__pips';
          pips.title = `Nivel ${level} de ${CAT.MAX_UPGRADE}`;
          for (let i = 0; i < CAT.MAX_UPGRADE; i++) {
            const p = document.createElement('i');
            p.classList.toggle('is-on', i < level);
            pips.append(p);
          }
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'stat__up';
          if (level >= CAT.MAX_UPGRADE || v >= 1) {
            btn.textContent = 'MAX';
            btn.disabled = true;
          } else {
            const cost = CAT.upgradeCost(upgrade.car, level);
            btn.textContent = `▲ ${formatNumber(cost)}`;
            btn.title = `Mejorar ${label.toLowerCase()} (+${(CAT.UPGRADE_STEP * 10).toFixed(1)}) por ${formatNumber(cost)} de energía`;
            btn.dataset.action = 'upgrade';
            btn.dataset.stat = key;
            btn.classList.toggle('is-short', upgrade.coins < cost);
          }
          row.append(pips, btn);
        }
        return row;
      });
      const head = document.createElement('div');
      head.className = 'stat-rating';
      const r = CAT.rating(stats);
      head.innerHTML = `<span>${upgrade ? 'TALLER · RATING' : 'RATING'}</span><b>${r.toFixed(1)}</b>`;
      if (compare) {
        const d = r - CAT.rating(compare);
        if (Math.abs(d) >= 0.05) {
          const em = document.createElement('em');
          em.className = d > 0 ? 'is-up' : 'is-down';
          em.textContent = `${d > 0 ? '+' : ''}${d.toFixed(1)} vs tu auto`;
          head.append(em);
        }
      }
      el.replaceChildren(head, ...rows);
    },
  };

  /** Silueta para autos bloqueados. */
  function lockedColors() {
    return { body: '#1b2240', body2: '#121832', accent: '#2a3358', dark: '#0a0e1d', light: '#3a4366' };
  }

  NR.Garage = Garage;
  NR.StatsView = StatsView;
})(window.NR);
