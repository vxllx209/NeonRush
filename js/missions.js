/**
 * NEON RUSH — Misiones.
 *
 * scope 'total': progreso acumulado entre carreras (estadísticas guardadas + carrera actual).
 * scope 'run'  : mejor marca lograda dentro de una sola carrera.
 *
 * Una misión completada durante la carrera da +500 puntos al momento
 * ("objetivos completados"). La recompensa de energía se cobra en la pantalla
 * MISSIONS y solo una vez (`claimed`).
 */
(function (NR) {
  'use strict';

  const { formatNumber } = NR.util;

  const DEFS = Object.freeze([
    { id: 'orbs100', name: 'COLECTOR', desc: 'Recolecta 100 orbes (acumulado).', scope: 'total', stat: 'totalOrbs', run: 'orbs', goal: 100, reward: 150 },
    { id: 'survive60', name: 'RESISTENCIA', desc: 'Sobrevive 60 segundos en una carrera.', scope: 'run', run: 'time', goal: 60, reward: 200 },
    { id: 'score2000', name: 'PRIMEROS 2K', desc: 'Alcanza 2.000 puntos en una carrera.', scope: 'run', run: 'score', goal: 2000, reward: 150 },
    { id: 'shield1', name: 'BLINDADO', desc: 'Utiliza un escudo.', scope: 'total', stat: 'shieldsUsed', run: 'shields', goal: 1, reward: 100 },
    { id: 'dodge30', name: 'REFLEJOS', desc: 'Esquiva 30 obstáculos en una carrera.', scope: 'run', run: 'dodged', goal: 30, reward: 200 },
    { id: 'nitro5', name: 'A FONDO', desc: 'Activa el nitro 5 veces (acumulado).', scope: 'total', stat: 'nitrosUsed', run: 'nitros', goal: 5, reward: 150 },
    { id: 'magnet3', name: 'ATRACCIÓN', desc: 'Utiliza 3 imanes (acumulado).', scope: 'total', stat: 'magnetsUsed', run: 'magnets', goal: 3, reward: 150 },
    { id: 'mult3', name: 'DOBLE O NADA', desc: 'Utiliza 3 multiplicadores x2 (acumulado).', scope: 'total', stat: 'multipliersUsed', run: 'multipliers', goal: 3, reward: 150 },
    { id: 'distance2000', name: 'MARATÓN', desc: 'Recorre 2.000 m en una carrera.', scope: 'run', run: 'distance', goal: 2000, reward: 300 },
    { id: 'games10', name: 'PILOTO HABITUAL', desc: 'Completa 10 carreras.', scope: 'total', stat: 'gamesPlayed', run: 'one', goal: 10, reward: 250 },
    { id: 'score10000', name: 'LEYENDA', desc: 'Alcanza 10.000 puntos en una carrera.', scope: 'run', run: 'score', goal: 10000, reward: 600 },
    { id: 'upgrade1', name: 'TALLER', desc: 'Compra una mejora para un auto en el garaje.', scope: 'total', stat: 'upgradesBought', run: 'none', goal: 1, reward: 100 },
    { id: 'track1', name: 'TROTAMUNDOS', desc: 'Desbloquea una pista nueva.', scope: 'total', stat: 'tracksUnlocked', run: 'none', goal: 1, reward: 150 },
    { id: 'orbs1000', name: 'CENTRAL ELÉCTRICA', desc: 'Recolecta 1.000 orbes (acumulado).', scope: 'total', stat: 'totalOrbs', run: 'orbs', goal: 1000, reward: 800 },
  ]);

  /** Valor de la carrera para una estadística ('one' = esta carrera cuenta como 1). */
  const runValue = (run, key) => (!run ? 0 : key === 'one' ? 1 : Math.floor(run[key] || 0));

  class Missions {
    constructor() {
      this.defs = DEFS;
      this._announced = new Set();
    }

    /** Progreso actual (sin guardar) dada la partida guardada y la carrera en curso. */
    progressOf(def, save, run) {
      const stored = (save.missions[def.id] && save.missions[def.id].progress) || 0;
      if (def.scope === 'total') return (save.stats[def.stat] || 0) + runValue(run, def.run);
      return Math.max(stored, runValue(run, def.run));
    }

    isDone(def, save) {
      return !!(save.missions[def.id] && save.missions[def.id].done);
    }

    /** Llamar al empezar cada carrera. */
    beginRun() {
      this._announced.clear();
    }

    /** Misiones que se acaban de completar en esta carrera (cada una se anuncia una vez). */
    checkLive(save, run) {
      const fresh = [];
      for (const def of this.defs) {
        if (this.isDone(def, save) || this._announced.has(def.id)) continue;
        if (this.progressOf(def, save, run) >= def.goal) {
          this._announced.add(def.id);
          fresh.push(def);
        }
      }
      return fresh;
    }

    /**
     * Aplica la carrera al borrador del guardado. Se llama ANTES de sumar las
     * estadísticas de la carrera a `draft.stats` (para no contarla dos veces).
     */
    applyRun(draft, run) {
      for (const def of this.defs) {
        const value = this.progressOf(def, draft, run);
        const m = draft.missions[def.id] || { progress: 0, done: false, claimed: false };
        m.progress = Math.min(def.goal, Math.max(m.progress, value));
        if (m.progress >= def.goal) m.done = true;
        draft.missions[def.id] = m;
      }
    }

    /** Cobra la recompensa una única vez. Devuelve la recompensa o 0. */
    claim(id) {
      const def = this.defs.find((d) => d.id === id);
      if (!def) return 0;
      let paid = 0;
      NR.Storage.update((d) => {
        const m = d.missions[id];
        if (!m || !m.done || m.claimed) return;
        m.claimed = true;
        d.coins += def.reward;
        paid = def.reward;
      });
      return paid;
    }

    claimableCount(save) {
      return this.defs.filter((def) => {
        const m = save.missions[def.id];
        return m && m.done && !m.claimed;
      }).length;
    }

    /** Pinta la lista en la pantalla MISSIONS. */
    render(listEl, save) {
      const items = this.defs.map((def) => {
        const m = save.missions[def.id] || { progress: 0, done: false, claimed: false };
        const progress = Math.min(def.goal, this.progressOf(def, save, null));
        const pct = Math.round((progress / def.goal) * 100);

        const li = document.createElement('li');
        li.className = `mission${m.claimed ? ' is-claimed' : m.done ? ' is-done' : ''}`;

        const info = document.createElement('div');
        info.className = 'mission__info';
        const title = document.createElement('strong');
        title.textContent = def.name;
        const desc = document.createElement('p');
        desc.textContent = def.desc;
        const bar = document.createElement('div');
        bar.className = 'mission__bar';
        bar.style.setProperty('--p', `${pct}%`);
        const meta = document.createElement('span');
        meta.className = 'mission__meta';
        meta.textContent = `${formatNumber(progress)} / ${formatNumber(def.goal)} · +${formatNumber(def.reward)} ENERGY`;
        info.append(title, desc, bar, meta);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn--small';
        if (m.claimed) {
          btn.textContent = 'COBRADA';
          btn.disabled = true;
        } else if (m.done) {
          btn.textContent = 'COBRAR';
          btn.classList.add('btn--claim');
          btn.dataset.action = 'claim';
          btn.dataset.id = def.id;
        } else {
          btn.textContent = `${pct}%`;
          btn.disabled = true;
        }
        li.append(info, btn);
        return li;
      });
      listEl.replaceChildren(...items);
    }
  }

  NR.Missions = new Missions();
})(window.NR);
