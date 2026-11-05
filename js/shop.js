/**
 * NEON RUSH — Tienda y economía.
 *
 * Shop.purchase() es la única vía para gastar energía:
 *  - comprueba el saldo dentro de la misma actualización atómica del guardado,
 *  - impide compras duplicadas,
 *  - nunca deja el saldo en negativo (además, Storage sanea enteros ≥ 0).
 */
(function (NR) {
  'use strict';

  const CAT = NR.CATALOG;
  const { formatNumber } = NR.util;

  const TABS = Object.freeze([
    { id: 'cars', label: 'AUTOS' },
    { id: 'paints', label: 'PINTURAS' },
    { id: 'trails', label: 'ESTELAS' },
    { id: 'effects', label: 'EFECTOS' },
  ]);

  function purchase(cat, id) {
    const item = CAT.find(cat, id);
    if (!item) return { ok: false, reason: 'unknown' };
    let result = { ok: false, reason: 'unknown' };
    const save = NR.Storage.update((d) => {
      if (d.unlocked[cat].includes(id)) { result = { ok: false, reason: 'owned' }; return; }
      if (d.coins < item.price) { result = { ok: false, reason: 'funds', missing: item.price - d.coins }; return; }
      d.coins -= item.price;
      d.unlocked[cat].push(id);
      d.equipped[NR.EQUIP_KEYS[cat]] = id; // lo comprado se equipa
      if (cat === 'tracks') d.stats.tracksUnlocked += 1;
      result = { ok: true, item };
    });
    result.save = save;
    return result;
  }

  /**
   * Taller: sube un nivel una cualidad de un auto propio.
   * Comprueba propiedad, nivel máximo, tope de la cualidad y saldo dentro de
   * la misma actualización atómica del guardado.
   */
  function upgrade(carId, statKey) {
    const car = CAT.find('cars', carId);
    if (!car || !CAT.STATS.some((s) => s.key === statKey)) return { ok: false, reason: 'unknown' };
    let result = { ok: false, reason: 'unknown' };
    const save = NR.Storage.update((d) => {
      if (!d.unlocked.cars.includes(carId)) { result = { ok: false, reason: 'locked' }; return; }
      const levels = CAT.upgradeLevels(carId, d.upgrades);
      const level = levels[statKey];
      if (level >= CAT.MAX_UPGRADE || CAT.effectiveStats(carId, d.upgrades)[statKey] >= 1) {
        result = { ok: false, reason: 'max' };
        return;
      }
      const cost = CAT.upgradeCost(car, level);
      if (d.coins < cost) { result = { ok: false, reason: 'funds', missing: cost - d.coins }; return; }
      d.coins -= cost;
      levels[statKey] = level + 1;
      d.upgrades[carId] = levels;
      d.stats.upgradesBought += 1;
      result = { ok: true, level: level + 1, cost };
    });
    result.save = save;
    return result;
  }

  function equip(cat, id) {
    return NR.Storage.update((d) => {
      if (d.unlocked[cat].includes(id)) d.equipped[NR.EQUIP_KEYS[cat]] = id;
    });
  }

  class Shop {
    constructor(root) {
      this.root = root;
      this.tab = 'cars';
      this.grid = root.querySelector('[data-shop="grid"]');
      this.tabsEl = root.querySelector('[data-shop="tabs"]');
      this.coinsEl = root.querySelector('[data-shop="coins"]');
      this.tabsEl.replaceChildren(...TABS.map((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'shop-tab';
        b.textContent = t.label;
        b.dataset.action = 'shop-tab';
        b.dataset.tab = t.id;
        b.setAttribute('role', 'tab');
        return b;
      }));
    }

    open(save, tab) {
      if (tab && CAT.CATEGORIES[tab]) this.tab = tab;
      this.render(save);
    }

    setTab(tab, save) {
      this.tab = tab;
      this.render(save);
    }

    render(save) {
      this.coinsEl.textContent = formatNumber(save.coins);
      for (const b of this.tabsEl.children) {
        const on = b.dataset.tab === this.tab;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', String(on));
      }
      const key = NR.EQUIP_KEYS[this.tab];
      const cards = CAT.CATEGORIES[this.tab].map((item) => {
        const owned = save.unlocked[this.tab].includes(item.id);
        const equipped = save.equipped[key] === item.id;

        const card = document.createElement('article');
        card.className = `shop-card${equipped ? ' is-equipped' : owned ? ' is-owned' : ''}`;

        const canvas = document.createElement('canvas');
        canvas.className = 'shop-card__preview';
        canvas.width = 320;
        canvas.height = 190;
        drawThumb(canvas, this.tab, item, save);

        const name = document.createElement('h3');
        name.textContent = item.name;
        const sub = document.createElement('p');
        sub.textContent = this.tab === 'cars' ? item.cls : this.tab === 'effects' ? item.desc : 'Cosmético';

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--small';
        btn.dataset.cat = this.tab;
        btn.dataset.id = item.id;
        if (equipped) {
          btn.textContent = 'EQUIPADO';
          btn.disabled = true;
        } else if (owned) {
          btn.textContent = 'EQUIPAR';
          btn.dataset.action = 'equip';
        } else {
          btn.textContent = `${formatNumber(item.price)} ⚡`;
          btn.dataset.action = 'buy';
          btn.classList.add('btn--buy');
          if (save.coins < item.price) btn.classList.add('is-short');
        }
        card.append(canvas, name, sub);
        if (this.tab === 'cars') {
          const stats = document.createElement('div');
          stats.className = 'car-stats';
          NR.StatsView.render(stats, owned ? CAT.effectiveStats(item.id, save.upgrades) : item.stats, { compact: true, base: item.stats });
          card.append(stats);
        }
        card.append(btn);
        return card;
      });
      this.grid.replaceChildren(...cards);
    }
  }

  /** Miniatura estática dibujada con el mismo renderizador del juego. */
  function drawThumb(canvas, tab, item, save) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#141033');
    bg.addColorStop(1, '#070a16');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // Suelo con rejilla.
    ctx.strokeStyle = 'rgba(139,92,246,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -6; i <= 6; i++) {
      ctx.moveTo(w / 2 + i * 12, h * 0.55);
      ctx.lineTo(w / 2 + i * 60, h);
    }
    ctx.stroke();

    const carId = tab === 'cars' ? item.id : save.equipped.car || CAT.DEFAULTS.cars;
    const car = CAT.find('cars', carId);
    const paint = tab === 'paints' ? item.id : tab === 'cars' ? 'factory' : save.equipped.paint;
    const effect = tab === 'effects' ? item.id : 'none';
    const colors = CAT.resolveColors(carId, paint);
    const u = h * 0.95;
    const gx = w / 2, gy = h * 0.88;

    if (tab === 'trails') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const side of [-1, 1]) {
        item.colors.forEach((c, i) => {
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.9;
          ctx.lineWidth = u * 0.05;
          ctx.beginPath();
          const off = (i - (item.colors.length - 1) / 2) * 6;
          ctx.moveTo(gx + side * u * 0.3 + off, gy - u * 0.05);
          ctx.lineTo(gx + side * u * 0.55 + off * 2, h + 10);
          ctx.stroke();
        });
      }
      ctx.restore();
    }
    NR.CarRenderer.draw(ctx, gx, gy, u, car.model, colors, { time: 1.3, effect, brake: 0.6, wheel: 0 });
  }

  NR.Shop = Shop;
  NR.Economy = Object.freeze({ purchase, equip, upgrade });
  NR.drawThumb = drawThumb;
})(window.NR);
