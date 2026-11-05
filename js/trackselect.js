/**
 * NEON RUSH — TRACK SELECT: elección de pista antes de correr.
 *
 * El fondo de la pantalla muestra en vivo el escenario de la pista que se
 * está mirando (cielo, horizonte, carretera y clima). Las pistas bloqueadas
 * se desbloquean con energía; las propias se seleccionan al verlas.
 */
(function (NR) {
  'use strict';

  const CAT = NR.CATALOG;
  const { formatNumber } = NR.util;

  class TrackSelect {
    constructor(root, backdrop) {
      this.root = root;
      this.backdrop = backdrop;
      this.q = (k) => root.querySelector(`[data-track="${k}"]`);
      this.index = 0;
      this.save = null;
    }

    get track() { return CAT.TRACKS[this.index]; }

    owns(id) { return this.save.unlocked.tracks.includes(id); }

    open(save) {
      this.save = save;
      this.index = Math.max(0, CAT.TRACKS.findIndex((t) => t.id === save.equipped.track));
      this.render();
    }

    /** Cambia la pista visible; si se posee, queda seleccionada. */
    step(dir) {
      this.index = (this.index + dir + CAT.TRACKS.length) % CAT.TRACKS.length;
      if (this.owns(this.track.id)) {
        this.save = NR.Storage.update((d) => { d.equipped.track = this.track.id; });
      }
      NR.Audio.play('click');
      this.render();
    }

    setSave(save) {
      this.save = save;
      this.render();
    }

    render() {
      const t = this.track;
      const save = this.save;
      const owned = this.owns(t.id);
      this.backdrop.setTheme(t.theme);

      this.q('coins').textContent = formatNumber(save.coins);
      this.q('num').textContent = `${this.index + 1} / ${CAT.TRACKS.length}`;
      this.q('name').textContent = t.name;
      this.q('desc').textContent = t.desc;

      const tags = this.q('tags');
      const mult = t.mods.score || 1;
      const chips = [`x${mult} PUNTOS`, ...t.tags.filter((x) => !/PUNTOS/.test(x))].map((txt, i) => {
        const chip = document.createElement('span');
        chip.className = `track-tag${i === 0 && mult > 1 ? ' track-tag--score' : ''}`;
        chip.textContent = txt;
        return chip;
      });
      tags.replaceChildren(...chips);

      this.q('dots').replaceChildren(...CAT.TRACKS.map((tr, i) => {
        const dot = document.createElement('i');
        dot.classList.toggle('is-on', i === this.index);
        dot.classList.toggle('is-locked', !this.owns(tr.id));
        return dot;
      }));

      const status = this.q('status');
      const primary = this.q('primary');
      primary.disabled = false;
      if (owned) {
        status.textContent = 'SELECCIONADA';
        status.className = 'garage-status is-owned';
        primary.textContent = 'START RACE';
        primary.dataset.mode = 'start';
      } else if (save.coins >= t.price) {
        status.textContent = `BLOQUEADA · ${formatNumber(t.price)} ENERGY`;
        status.className = 'garage-status is-locked';
        primary.textContent = `UNLOCK · ${formatNumber(t.price)}`;
        primary.dataset.mode = 'unlock';
      } else {
        status.textContent = `BLOQUEADA · te faltan ${formatNumber(t.price - save.coins)} de energía`;
        status.className = 'garage-status is-locked';
        primary.textContent = `LOCKED · ${formatNumber(t.price)}`;
        primary.dataset.mode = 'locked';
        primary.disabled = true;
      }
    }
  }

  NR.TrackSelect = TrackSelect;
})(window.NR);
