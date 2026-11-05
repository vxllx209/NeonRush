/**
 * NEON RUSH — STARTER: garaje inicial con TODOS los autos.
 *
 * Se muestra antes de la primera carrera. El jugador elige cualquier auto
 * del catálogo y ese primero es gratis, sea cual sea. Después solo puede
 * cambiar de auto comprando otros con energía (en el GARAGE o la SHOP).
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;
  const CAT = NR.CATALOG;

  class Starter {
    constructor(root) {
      this.root = root;
      this.q = (k) => root.querySelector(`[data-starter="${k}"]`);
      this.grid = this.q('grid');
      this.filtersEl = this.q('filters');
      this.preview = this.q('preview');
      this.pctx = this.preview.getContext('2d');
      this.confirmBtn = root.querySelector('[data-action="starter-confirm"]');
      this.filter = 'all';
      this.selected = null;
      this.time = 0;
      this.pop = 0;

      // Tarjetas: se crean una vez (las miniaturas son estáticas).
      const blank = { equipped: {} };
      this.cards = CAT.CARS.map((car) => {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'starter-card';
        card.dataset.action = 'starter-pick';
        card.dataset.id = car.id;
        card.dataset.cls = car.cls;
        card.setAttribute('aria-label', `${car.name}, ${car.cls}`);
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 190;
        NR.drawThumb(canvas, 'cars', car, blank);
        const name = document.createElement('strong');
        name.textContent = car.name;
        const cls = document.createElement('span');
        cls.textContent = car.cls;
        card.append(canvas, name, cls);
        return card;
      });
      this.grid.replaceChildren(...this.cards);

      const classes = [...new Set(CAT.CARS.map((c) => c.cls))];
      this.filtersEl.replaceChildren(...['all', ...classes].map((cls) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'shop-tab';
        b.textContent = cls === 'all' ? `TODOS (${CAT.CARS.length})` : cls;
        b.dataset.action = 'starter-filter';
        b.dataset.cls = cls;
        return b;
      }));
    }

    open() {
      this.selected = null;
      this.setFilter('all');
      this.renderSelection();
      this.resize();
    }

    setFilter(cls) {
      this.filter = cls;
      for (const b of this.filtersEl.children) b.classList.toggle('is-on', b.dataset.cls === cls);
      for (const card of this.cards) card.hidden = cls !== 'all' && card.dataset.cls !== cls;
    }

    pick(id) {
      if (!CAT.find('cars', id)) return;
      this.selected = id;
      this.pop = 1;
      this.renderSelection();
    }

    renderSelection() {
      const car = this.selected && CAT.find('cars', this.selected);
      for (const card of this.cards) card.classList.toggle('is-selected', card.dataset.id === this.selected);
      this.q('cls').textContent = car ? car.cls : 'PASO 1 DE 1';
      this.q('name').textContent = car ? car.name : 'Selecciona un auto';
      this.q('desc').textContent = car ? car.desc : 'Toca cualquier auto para verlo aquí.';
      const statsEl = this.q('stats');
      if (car) NR.StatsView.render(statsEl, car.stats, { compact: true });
      else statsEl.replaceChildren();
      this.confirmBtn.disabled = !car;
      this.confirmBtn.textContent = car ? `ELEGIR ${car.name} · GRATIS` : 'ELIGE UN AUTO';
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, NR.CONFIG.MAX_DPR);
      const w = this.preview.clientWidth || 1;
      const h = this.preview.clientHeight || 1;
      this.preview.width = Math.round(w * dpr);
      this.preview.height = Math.round(h * dpr);
      this.pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w;
      this.h = h;
    }

    update(dt) {
      this.time += dt;
      this.pop = Math.max(0, this.pop - dt * 3);
    }

    /** Vista previa animada del auto seleccionado. */
    render() {
      const { pctx: ctx, w, h, time } = this;
      if (!w) return;
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, ground = h * 0.86;
      const u = Math.min(w * 0.7, h * 1.05) * (1 + this.pop * 0.08);

      ctx.save();
      ctx.translate(cx, ground);
      ctx.scale(1, 0.22);
      ctx.strokeStyle = C.cyan;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.setLineDash([u * 0.1, u * 0.05]);
      ctx.lineDashOffset = time * u * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, u * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      const car = this.selected && CAT.find('cars', this.selected);
      if (!car) {
        ctx.fillStyle = C.gray;
        ctx.font = `700 ${Math.round(h * 0.18)}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('?', cx, ground - h * 0.25);
        return;
      }
      const rev = (time % 3) > 2.4;
      NR.CarRenderer.draw(ctx, cx, ground, u, car.model, car.colors, {
        time, wheel: time * 0.6, bounce: Math.sin(time * 30) * 0.003, brake: rev ? 0 : 0.5, nitro: rev ? 1 : 0,
      });
    }
  }

  NR.Starter = Starter;
})(window.NR);
