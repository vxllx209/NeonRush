/**
 * NEON RUSH — Generador dinámico de obstáculos, orbes y power-ups.
 *
 * Reglas de equidad (nunca se genera un patrón imposible):
 *  1. Cada fila deja al menos un carril completamente libre (sin bloque,
 *     campo, compuerta ni tráfico). Las compuertas son atajos opcionales.
 *  2. Entre filas hay como mínimo `speed * gap` unidades; gap nunca baja de
 *     GAP_MIN (0.62 s), tiempo suficiente para cruzar 2 carriles.
 *  3. En secuencias rápidas el carril libre solo se desplaza 1 posición.
 *  4. El tráfico se programa por su punto de encuentro exacto: ocupa un tramo
 *     propio de la pista y nunca se cruza con otras filas. Los autos que
 *     cambian de carril dejan siempre un carril que no tocan.
 *
 * La generación usa posiciones absolutas de la pista: no depende de los FPS.
 */
(function (NR) {
  'use strict';

  const G = NR.CONFIG.GAME;
  const { pick } = NR.util;
  const rnd = (n) => Math.floor(Math.random() * n);
  const LANES = [0, 1, 2];
  const POWER_TYPES = ['shield', 'magnet', 'multiplier'];

  const PATTERNS = {
    0: [['single', 3], ['double', 3], ['orbRun', 1], ['traffic', 2]],
    1: [['mixed', 3], ['field', 2], ['gates', 2], ['trafficPair', 2]],
    2: [['zigzag', 2], ['slalom', 2], ['trafficSwitch', 3], ['fieldGate', 2]],
  };

  class Spawner {
    constructor(game) {
      this.game = game;
      this.reset();
    }

    reset() {
      this.cursor = 40;
      this.lastRowEnd = 0;
      this.lastPower = 60;
      this.last = null;
      this.introDone = false;
    }

    update(distance, diff) {
      if (!this.introDone) {
        this.introDone = true;
        this._orbTrail(1, 10, 32);
      }
      while (this.cursor < distance + G.SPAWN_AHEAD) {
        const name = this._choose(diff.tier);
        this.last = name;
        this.cursor = this[`_p_${name}`](this.cursor, diff);
      }
    }

    _choose(tier) {
      const pool = [];
      // Cada pista puede favorecer ciertos patrones (p. ej. más tráfico en ORBITAL RING).
      const boost = (this.game.mods && this.game.mods.patterns) || {};
      for (let t = 0; t <= tier; t++) {
        for (const [name, w] of PATTERNS[t]) pool.push([name, w * (boost[name] || 1)]);
      }
      let name = this._weighted(pool);
      if (name === this.last) name = this._weighted(pool);
      return name;
    }

    _weighted(pool) {
      const total = pool.reduce((a, [, w]) => a + w, 0);
      let r = Math.random() * total;
      for (const [name, w] of pool) {
        if ((r -= w) <= 0) return name;
      }
      return pool[0][0];
    }

    _gap(d, k = 1) {
      return Math.max(d.speed * d.gap * k, 7.5);
    }

    _next(pos, d) {
      return pos + this._gap(d, 1 + Math.random() * 0.3);
    }

    /* ---------------- Primitivas ---------------- */

    /** lanes: array de 3 tipos ('block' | 'gate' | null). */
    _row(pos, lanes) {
      lanes.forEach((type, lane) => {
        if (type) this.game.obstacles.push(new NR.Obstacle(type, lane, pos));
      });
      this._registerRow(pos + 1);
    }

    _registerRow(end, traffic = null) {
      this.game.rows.push({ pos: end, counted: false, traffic });
      this.lastRowEnd = Math.max(this.lastRowEnd, end);
    }

    _orb(lane, pos) {
      this.game.orbs.push(new NR.Orb(lane, pos, Math.random() < G.ORB_GREEN_CHANCE));
    }

    _orbTrail(lane, from, to) {
      const start = Math.max(from, this.lastRowEnd + 1.5);
      // Pistas con más energía: estelas de orbes más densas.
      const extra = (this.game.mods && this.game.mods.orbs) || 0;
      const step = 2.2 / (1 + extra * 0.7);
      for (let p = start; p <= to; p += step) this._orb(lane, p);
    }

    /** Power-up ocasional en un carril libre, antes de la fila. */
    _maybePower(lane, pos) {
      if (pos - this.lastPower < G.POWERUP_MIN_GAP || Math.random() > G.POWERUP_CHANCE) return;
      this.lastPower = pos;
      this.game.powerups.push(new NR.PowerUp(pick(POWER_TYPES), lane, pos - 5));
    }

    _freeLanes(lanes) {
      return LANES.filter((l) => !lanes[l]);
    }

    /** Orbes en un carril libre (o, a veces, a través de una compuerta: riesgo/recompensa). */
    _rewardOrbs(lanes, pos) {
      const free = this._freeLanes(lanes);
      const gates = LANES.filter((l) => lanes[l] === 'gate');
      const lane = gates.length && Math.random() < 0.35 ? pick(gates) : pick(free);
      this._orbTrail(lane, pos - 9, pos + 3);
      this._maybePower(pick(free), pos);
    }

    /* ---------------- Patrones estáticos ---------------- */

    _p_single(pos, d) {
      const lanes = [null, null, null];
      lanes[rnd(3)] = pick(['block', 'block', 'gate']);
      this._rewardOrbs(lanes, pos);
      this._row(pos, lanes);
      return this._next(pos, d);
    }

    _p_double(pos, d) {
      const open = rnd(3);
      const lanes = LANES.map((l) => (l === open ? null : 'block'));
      this._rewardOrbs(lanes, pos);
      this._row(pos, lanes);
      return this._next(pos, d);
    }

    _p_orbRun(pos, d) {
      const path = Math.random() < 0.5 ? [0, 1, 2] : [2, 1, 0];
      let p = Math.max(pos, this.lastRowEnd + 2);
      for (const lane of path) {
        for (let i = 0; i < 3; i++, p += 2.2) this._orb(lane, p);
      }
      return p + this._gap(d, 0.5);
    }

    _p_mixed(pos, d) {
      const open = rnd(3);
      const lanes = LANES.map((l) => (l === open ? null : pick(['block', 'gate'])));
      this._rewardOrbs(lanes, pos);
      this._row(pos, lanes);
      return this._next(pos, d);
    }

    _p_gates(pos, d) {
      // Dos compuertas desfasadas y un carril libre.
      const open = rnd(3);
      const lanes = LANES.map((l) => (l === open ? null : 'gate'));
      this._rewardOrbs(lanes, pos);
      this._row(pos, lanes);
      return this._next(pos, d);
    }

    _p_field(pos, d) {
      if (Math.random() < 0.35) {
        const lane = rnd(3);
        const free = LANES.filter((l) => l !== lane);
        this._orbTrail(pick(free), pos - 9, pos + 3);
        this._maybePower(pick(free), pos);
        this.game.obstacles.push(new NR.Obstacle('field', lane, pos, 1));
        this._registerRow(pos + 1);
        return this._next(pos, d);
      }
      const laneA = rnd(2);
      const free = laneA === 0 ? 2 : 0;
      this._orbTrail(free, pos - 9, pos + 3);
      this._maybePower(free, pos);
      this.game.obstacles.push(new NR.Obstacle('field', laneA, pos, 2));
      this._registerRow(pos + 1);
      return pos + this._gap(d, 1.15);
    }

    _p_fieldGate(pos, d) {
      const order = [0, 1, 2].sort(() => Math.random() - 0.5);
      const [fieldLane, gateLane, free] = order;
      this._orbTrail(Math.random() < 0.4 ? gateLane : free, pos - 9, pos + 3);
      this.game.obstacles.push(new NR.Obstacle('field', fieldLane, pos, 1));
      this.game.obstacles.push(new NR.Obstacle('gate', gateLane, pos));
      this._registerRow(pos + 1);
      return this._next(pos, d);
    }

    _p_zigzag(pos, d) {
      const rows = 3 + rnd(2);
      const step = Math.max(this._gap(d, 0.9), d.speed * 0.55);
      let open = rnd(3);
      let p = pos;
      for (let i = 0; i < rows; i++) {
        if (i > 0) open = open === 1 ? pick([0, 2]) : 1; // solo 1 carril de cambio
        this._orbTrail(open, p - 4, p + 1.5);
        this._row(p, LANES.map((l) => (l === open ? null : 'block')));
        p += step;
      }
      return p - step + this._gap(d, 1.1);
    }

    _p_slalom(pos, d) {
      // Como zigzag pero mezclando bloques y compuertas.
      const rows = 3;
      const step = Math.max(this._gap(d, 0.95), d.speed * 0.6);
      let open = rnd(3);
      let p = pos;
      for (let i = 0; i < rows; i++) {
        if (i > 0) open = open === 1 ? pick([0, 2]) : 1;
        this._orbTrail(open, p - 4, p + 1.5);
        this._row(p, LANES.map((l) => (l === open ? null : pick(['block', 'gate']))));
        p += step;
      }
      return p - step + this._gap(d, 1.1);
    }

    /* ---------------- Tráfico ---------------- */

    /**
     * @param cars [{ lane, offset, switchTo }] offset: distancia extra al encuentro
     * El primer auto arranca en `start` (≥ cursor y detrás de la última fila);
     * los demás se escalonan. Devuelve el siguiente cursor libre.
     */
    _traffic(pos, d, cars) {
      const game = this.game;
      const f = G.TRAFFIC_SPEED;
      const start = Math.max(pos, this.lastRowEnd + 3);
      const meet0 = game.distance + (start - game.distance) / (1 - f);
      let lastMeet = meet0;
      const used = new Set();
      for (const c of cars) {
        const meet = meet0 + (c.offset || 0);
        const car = new NR.Traffic(c.lane, meet, game.distance, c.switchTo);
        game.obstacles.push(car);
        this._registerRow(meet + 1.5, car);
        lastMeet = Math.max(lastMeet, meet);
        used.add(c.lane);
        if (c.switchTo != null) used.add(c.switchTo);
      }
      // Orbes estáticos en los carriles que el tráfico nunca pisa.
      const free = LANES.filter((l) => !used.has(l));
      if (free.length) {
        const lane = pick(free);
        for (let p = start + 4; p < lastMeet; p += 2.4) this._orb(lane, p);
        this._maybePower(lane, lastMeet);
      }
      this.lastRowEnd = Math.max(this.lastRowEnd, lastMeet + 2);
      return lastMeet + this._gap(d, 1.1);
    }

    _p_traffic(pos, d) {
      return this._traffic(pos, d, [{ lane: rnd(3) }]);
    }

    _p_trafficPair(pos, d) {
      const [a, b] = [0, 1, 2].sort(() => Math.random() - 0.5);
      return this._traffic(pos, d, [{ lane: a }, { lane: b, offset: this._gap(d, 1) }]);
    }

    _p_trafficSwitch(pos, d) {
      // Un auto cambia a un carril adyacente; el tercer carril nunca se toca.
      const from = rnd(3);
      const to = from === 1 ? pick([0, 2]) : 1;
      const cars = [{ lane: from, switchTo: to }];
      if (Math.random() < 0.5) {
        // Segundo auto estático más adelante, en el carril de origen (ya libre).
        cars.push({ lane: from, offset: this._gap(d, 1.2) });
      }
      return this._traffic(pos, d, cars);
    }
  }

  NR.Spawner = Spawner;
})(window.NR);
