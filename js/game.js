/**
 * NEON RUSH — Núcleo del gameplay.
 *
 * Responsabilidades: estado de la carrera, dificultad progresiva, velocidad
 * (nitro/freno), colisiones, power-ups, puntuación, efectos y render.
 * No toca el DOM ni el audio: comunica todo mediante `events`.
 *
 * events: onHud(game), onBanner(text, tone), onCountdown(label), onSfx(name),
 *         onCrash(), onGameOver(results)
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;
  const G = NR.CONFIG.GAME;
  const { clamp, lerp, pick } = NR.util;

  const BURST_COLORS = [C.pink, C.cyan, C.white, '#FFD23F'];
  const POWER_KEYS = ['shield', 'magnet', 'multiplier'];

  class Game {
    constructor({ backdrop, events }) {
      this.backdrop = backdrop;
      this.ctx = backdrop.ctx;
      this.events = events;

      this.cam = new NR.Camera();
      this.world = new NR.World(this.cam);
      this.car = new NR.Car();
      this.spawner = new NR.Spawner(this);
      this.particles = new NR.ParticlePool(320);
      this.popups = Array.from({ length: 16 }, () => ({ alive: false, x: 0, y: 0, text: '', color: '', life: 0 }));

      this.obstacles = [];
      this.orbs = [];
      this.powerups = [];
      this.rows = [];
      this._drawList = [];
      this._diff = { speed: G.SPEED_MIN, gap: G.GAP_MAX, tier: 0 };
      this.power = { shield: 0, magnet: 0, multiplier: 0 };

      this._keepObstacle = (o) => !o.destroyed && o.pos + o.depth - this.distance > this.cam.zNear - 2;
      this._keepItem = (o) => !o.collected && o.pos - this.distance > this.cam.zNear - 2;
      this._keepRow = (r) => !r.counted;

      this.reducedEffects = false;
      this.theme = NR.CITY_THEME;
      this.mods = null;
      this.distance = 0;
      this.committed = true; // no hay carrera que registrar todavía
      this.resize();
    }

    /** Durante la carrera el horizonte sube para dar más espacio a la pista. */
    resize() {
      const b = this.backdrop;
      this.horizonShift = Math.round(b.h * 0.13);
      this.cam.resize(b.w, b.h, b.horizonY - this.horizonShift);
    }

    /* ---------------------------------------------------------------- */
    /* Ciclo de vida                                                    */
    /* ---------------------------------------------------------------- */

    newRun({ equipped = {}, upgrades = null, bestScore = 0, reducedEffects = false } = {}) {
      this.reducedEffects = reducedEffects;
      this.track = NR.CATALOG.find('tracks', equipped.track) || NR.TRACKS[0];
      this.mods = Object.assign({ score: 1, speed: 1, handling: 1, grip: 1, orbs: 0, patterns: {} }, this.track.mods);
      this.theme = this.track.theme;
      this.world.setTheme(this.theme);
      this.backdrop.setTheme(this.theme);
      this.car.reset(equipped, upgrades);
      // Condiciones de la pista sobre la conducción (p. ej. asfalto helado).
      this.car.laneRate *= this.mods.handling;
      this.car.brakeSpeed = 1 - (1 - this.car.brakeSpeed) * this.mods.grip;
      this.spawner.reset();
      this.obstacles.length = 0;
      this.orbs.length = 0;
      this.powerups.length = 0;
      this.rows.length = 0;
      this.particles.clear();
      this.popups.forEach((p) => (p.alive = false));
      POWER_KEYS.forEach((k) => (this.power[k] = 0));

      this.prevBest = bestScore;
      this.best = bestScore;
      this.recordAnnounced = false;
      this.score = 0;
      this.energy = 0;
      this.distance = 0;
      this.time = 0;
      this.level = 0;
      this.mult = 1;
      this.nextSurvival = G.SURVIVAL_INTERVAL;
      this.speed = G.SPEED_MIN;
      this.speedMul = 1;
      this.grace = 0;
      this.stats = { orbs: 0, dodged: 0, nitros: 0, shields: 0, magnets: 0, multipliers: 0 };

      this.crashed = false;
      this.crashT = 0;
      this.over = false;
      this.committed = false;
      this.shake = 0;
      this.flash = 0;
      this.animTime = 0;
      this._speedLineT = 0;
      this._ambientT = 0;
      this.cam.panX = 0;

      this.spawner.update(0, this.difficulty());
      this.startCountdown();
    }

    startCountdown(steps = 3) {
      this.countdown = steps * G.COUNTDOWN_STEP;
      this._lastCount = null;
      this.car.setBrake(false);
    }

    results() {
      const score = Math.floor(this.score);
      return {
        score,
        prevBest: this.prevBest,
        best: Math.max(this.prevBest, score),
        newRecord: score > this.prevBest && score > 0,
        orbs: this.stats.orbs,
        energy: this.energy,
        time: this.time,
        distance: Math.floor(this.distance),
        dodged: this.stats.dodged,
        nitros: this.stats.nitros,
        shields: this.stats.shields,
        magnets: this.stats.magnets,
        multipliers: this.stats.multipliers,
      };
    }

    /** Devuelve los resultados una sola vez por carrera. */
    commit() {
      if (this.committed) return null;
      this.committed = true;
      return this.results();
    }

    get canPause() {
      return !this.crashed && !this.over;
    }

    /** Multiplicador total de puntos (nivel × power-up x2). */
    get scoreMult() {
      const track = this.mods ? this.mods.score : 1;
      return Math.round(this.mult * track * (this.power.multiplier > 0 ? 2 : 1) * 100) / 100;
    }

    /** Bonificación externa (p. ej. misión completada). */
    bonus(points, label) {
      const pts = Math.round(points);
      this.score += pts;
      this._popup(this.cam.w / 2, this.cam.h * 0.34, `+${pts} ${label}`, C.green);
    }

    /* ---------------------------------------------------------------- */
    /* Dificultad progresiva (curvas suaves en función del tiempo)       */
    /* ---------------------------------------------------------------- */

    difficulty() {
      const t = this.time;
      const d = this._diff;
      d.speed = (G.SPEED_MIN + (G.SPEED_MAX - G.SPEED_MIN) * (1 - Math.exp(-t / G.SPEED_TAU))) * (this.mods ? this.mods.speed : 1);
      d.gap = G.GAP_MIN + (G.GAP_MAX - G.GAP_MIN) * Math.exp(-t / G.GAP_TAU);
      d.tier = t >= G.TIER_2_TIME ? 2 : t >= G.TIER_1_TIME ? 1 : 0;
      return d;
    }

    /* ---------------------------------------------------------------- */
    /* Entrada                                                          */
    /* ---------------------------------------------------------------- */

    handleAction(action) {
      const car = this.car;
      if (action === 'brake-off') { car.setBrake(false); return; }
      if (this.countdown > 0 || this.crashed || this.over) return;
      switch (action) {
        case 'left':
        case 'right': {
          const dir = action === 'left' ? -1 : 1;
          if (car.move(dir)) this.events.onSfx('lane', { dir });
          else {
            this.events.onSfx('bump', { dir });
            if (!this.reducedEffects) this.shake = Math.max(this.shake, 0.15);
          }
          break;
        }
        case 'nitro':
          if (car.nitro()) {
            this.stats.nitros++;
            this.events.onSfx('nitro');
            this.events.onBanner('NITRO', 'cyan');
            this.flash = Math.max(this.flash, 0.25);
          } else {
            this.events.onSfx('deny');
          }
          break;
        case 'brake-on':
          car.setBrake(true);
          if (car.braking) this.events.onSfx('brake');
          break;
        case 'brake-pulse':
          car.pulseBrake();
          break;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Actualización                                                    */
    /* ---------------------------------------------------------------- */

    update(dt) {
      this.animTime += dt;
      if (this.over) return;

      if (this.crashed) {
        this._updateCrash(dt);
        return;
      }

      if (this.countdown > 0) {
        this.countdown -= dt;
        if (this.countdown <= 0) {
          this.countdown = 0;
          this.events.onCountdown('GO');
          this.events.onSfx('go');
        } else {
          const n = Math.ceil(this.countdown / G.COUNTDOWN_STEP);
          if (n !== this._lastCount) {
            this._lastCount = n;
            this.events.onCountdown(String(n));
            this.events.onSfx('count');
          }
        }
        this._updateFx(dt);
        this.events.onHud(this);
        return;
      }

      const car = this.car;
      const d = this.difficulty();
      // Las cualidades del auto definen cuánto frena, cuánto empuja el nitro y lo rápido que responde.
      const targetMul = car.braking ? car.brakeSpeed : car.nitroActive ? car.nitroSpeed : 1;
      this.speedMul += (targetMul - this.speedMul) * Math.min(1, dt * car.speedResponse);
      this.speed = d.speed * this.speedMul;
      this.time += dt;
      const step = this.speed * dt;
      this.distance += step;
      this.backdrop.tick(dt * 0.5 * this.speedMul);

      const wasOverheated = car.overheated;
      const hadNitro = car.nitroActive;
      car.update(dt, this.speed, this.distance);
      if (!wasOverheated && car.overheated) {
        this.events.onBanner('FRENO SOBRECALENTADO', 'pink');
        this.events.onSfx('overheat');
      }
      if (hadNitro && !car.nitroActive) this.events.onSfx('nitro-end');
      this.cam.panX += (car.x * 0.35 - this.cam.panX) * Math.min(1, dt * 6);

      this.spawner.update(this.distance, d);
      for (const o of this.obstacles) o.update(dt, this.distance, this.speed);

      this._updatePowers(dt);
      this._updateScore(step);

      const hb = car.hitbox();
      if (this.grace > 0) this.grace -= dt;
      else {
        for (const o of this.obstacles) {
          if (!o.hits(hb, this.distance, this.time)) continue;
          if (this.power.shield > 0) {
            this._shieldBreak(o);
            break;
          }
          this._crash();
          this.events.onHud(this);
          return;
        }
      }

      for (const orb of this.orbs) {
        if (orb.collected) continue;
        if (this.power.magnet > 0 && Math.abs(orb.pos - this.distance) < G.MAGNET_RANGE) orb.attracted = true;
        if (orb.attracted) orb.attract(dt, car.x, this.distance);
        if (orb.touches(hb, this.distance)) this._collect(orb);
      }

      for (const pu of this.powerups) {
        if (!pu.collected && pu.touches(hb, this.distance)) this._activatePower(pu);
      }

      for (const row of this.rows) {
        if (!row.counted && row.pos < this.distance - hb.halfD) {
          row.counted = true;
          this.stats.dodged++;
          this.score += G.DODGE_SCORE * this.scoreMult;
          if (row.traffic) {
            // Adelantamiento: whoosh desde el lado del auto adelantado.
            const t = row.traffic;
            this.events.onSfx('pass', { dir: Math.sign(t.x - car.x) || 1 });
          }
        }
      }

      this._cleanup();
      this._spawnSpeedLines(dt);
      this._spawnAmbient(dt);
      this._updateFx(dt);
      this.events.onHud(this);
    }

    _updateScore(step) {
      const nitroBonus = this.car.nitroActive ? G.NITRO_SCORE_MULT : 1;
      this.score += step * G.SCORE_PER_UNIT * this.scoreMult * nitroBonus * this.car.scoreBonus;

      const level = Math.min(G.MAX_LEVEL, Math.floor(this.distance / G.LEVEL_DISTANCE));
      if (level > this.level) {
        this.level = level;
        this.mult = 1 + level * G.LEVEL_MULT_STEP;
        this.events.onBanner(`SPEED UP · x${this.mult}`, 'cyan');
        this.events.onSfx('levelup');
      }

      if (this.time >= this.nextSurvival) {
        this.nextSurvival += G.SURVIVAL_INTERVAL;
        const bonus = Math.round(G.SURVIVAL_BONUS * this.scoreMult);
        this.score += bonus;
        this._popup(this.cam.w / 2, this.cam.h * 0.3, `+${bonus} SURVIVAL`, C.purple);
      }

      if (!this.recordAnnounced && this.prevBest > 0 && this.score > this.prevBest) {
        this.recordAnnounced = true;
        this.events.onBanner('NEW RECORD!', 'green');
        this.events.onSfx('record');
      }
      this.best = Math.max(this.best, Math.floor(this.score));
    }

    _updatePowers(dt) {
      for (const k of POWER_KEYS) {
        if (this.power[k] <= 0) continue;
        this.power[k] = Math.max(0, this.power[k] - dt);
        if (this.power[k] === 0) this.events.onSfx('powerdown');
      }
    }

    _activatePower(pu) {
      pu.collected = true;
      const def = NR.POWERUPS[pu.type];
      this.power[pu.type] = def.time;
      this.score += G.POWERUP_SCORE * this.scoreMult;
      const key = { shield: 'shields', magnet: 'magnets', multiplier: 'multipliers' }[pu.type];
      this.stats[key]++;
      this.events.onBanner(def.label, pu.type === 'shield' ? 'cyan' : pu.type === 'magnet' ? 'purple' : 'pink');
      this.events.onSfx(`power-${pu.type}`);
      this.flash = Math.max(this.flash, 0.35);
      this._flashColor = def.color;

      // Anillo de activación.
      const z = pu.pos - this.distance;
      const x = this.cam.sx(pu.x, z), y = this.cam.sy(0.6, z);
      const n = this.reducedEffects ? 8 : 24;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        this.particles.spawn({
          x, y, vx: Math.cos(a) * 240, vy: Math.sin(a) * 160,
          life: 0.5, size: 2, color: def.color, streak: 0.04,
        });
      }
    }

    _shieldBreak(o) {
      this.power.shield = 0;
      this.grace = G.SHIELD_GRACE;
      o.destroyed = true;
      this.events.onSfx('shield-hit');
      this.events.onBanner('ESCUDO ROTO', 'cyan');
      this.shake = this.reducedEffects ? 0 : 0.5;
      this.flash = 0.4;
      this._flashColor = C.cyan;
      const z = Math.max(0.2, o.pos - this.distance);
      const x = this.cam.sx(o.x, z), y = this.cam.sy(0.5, z);
      this._burst(x, y, [C.cyan, C.white, C.pink], this.reducedEffects ? 12 : 36);
    }

    _collect(orb) {
      orb.collected = true;
      this.energy += orb.value;
      this.stats.orbs++;
      this.car.addNitro(orb.nitro);
      const pts = Math.round(orb.score * this.scoreMult);
      this.score += pts;
      this.events.onSfx(orb.green ? 'orb-green' : 'orb');

      const z = Math.max(orb.pos - this.distance, this.cam.zNear + 0.3);
      const x = this.cam.sx(orb.x, z);
      const y = this.cam.sy(orb.y, z);
      const color = orb.green ? C.green : C.cyan;
      const n = this.reducedEffects ? 4 : 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const v = lerp(60, 180, Math.random());
        this.particles.spawn({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 40, ay: 120,
          life: lerp(0.3, 0.6, Math.random()), size: lerp(1.2, 2.6, Math.random()), color,
        });
      }
      if (orb.green) this._popup(x, y - this.cam.scale(0) * 0.6, `+${pts}`, color);
    }

    _crash() {
      this.crashed = true;
      this.crashT = G.CRASH_DURATION;
      this.car.crash();
      this.flash = 1;
      this._flashColor = '#ffdcf5';
      this.shake = this.reducedEffects ? 0 : 1;

      const x = this.cam.sx(this.car.x, -0.45);
      const y = this.cam.sy(0.3, -0.45);
      this._burst(x, y, BURST_COLORS, this.reducedEffects ? 14 : 50);
      // Restos de carrocería y humo.
      const s = this.cam.scale(0);
      const n = this.reducedEffects ? 6 : 18;
      for (let i = 0; i < n; i++) {
        this.particles.spawn({
          x, y, vx: lerp(-3, 3, Math.random()) * s, vy: -lerp(1, 4, Math.random()) * s, ay: s * 7,
          life: lerp(0.6, 1.2, Math.random()), size: lerp(2, 4.5, Math.random()),
          color: Math.random() < 0.5 ? this.car.colors.body : this.car.colors.accent,
        });
        this.particles.spawn({
          x: x + lerp(-0.3, 0.3, Math.random()) * s, y, vx: lerp(-0.3, 0.3, Math.random()) * s, vy: -lerp(0.3, 0.9, Math.random()) * s,
          life: lerp(0.8, 1.4, Math.random()), size: lerp(4, 9, Math.random()), color: '#3a3f58', alpha: 0.35,
        });
      }
      this.events.onSfx('crash');
      this.events.onCrash();
    }

    _burst(x, y, colors, n) {
      const s = this.cam.scale(0);
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = lerp(80, 420, Math.random()) * (s / 100);
        this.particles.spawn({
          x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, ay: 260,
          life: lerp(0.5, 1.1, Math.random()), size: lerp(1.2, 3.2, Math.random()),
          color: pick(colors), streak: Math.random() < 0.5 ? 0.03 : 0,
        });
      }
    }

    _updateCrash(dt) {
      this.crashT -= dt;
      const slow = dt * 0.2; // cámara lenta
      this.distance += this.speed * slow * 0.4;
      this.car.update(dt, this.speed * 0.2, this.distance);
      this.backdrop.tick(slow);
      this._updateFx(dt);
      if (this.crashT <= 0 && !this.over) {
        this.over = true;
        this.events.onGameOver(this.results());
      }
    }

    _cleanup() {
      compact(this.obstacles, this._keepObstacle);
      compact(this.orbs, this._keepItem);
      compact(this.powerups, this._keepItem);
      compact(this.rows, this._keepRow);
    }

    /* ---------------------------------------------------------------- */
    /* Efectos                                                          */
    /* ---------------------------------------------------------------- */

    _spawnSpeedLines(dt) {
      if (this.reducedEffects) return;
      const intensity = this.car.nitroActive ? 1.8 : 0.7;
      this._speedLineT += dt * this.speed * intensity;
      const cam = this.cam;
      while (this._speedLineT >= 1) {
        this._speedLineT -= 1;
        const side = Math.random() < 0.5 ? -1 : 1;
        const X = side * lerp(2.3, 6, Math.random());
        const Y = lerp(0, 3.2, Math.random());
        const z0 = 34;
        const x0 = cam.sx(X, z0), y0 = cam.sy(Y, z0);
        const x1 = cam.sx(X, -1), y1 = cam.sy(Y, -1);
        const life = lerp(0.35, 0.55, Math.random()) * (20 / this.speed);
        const color = this.car.nitroActive ? C.white : this.theme.edges[side < 0 ? 0 : 1];
        this.particles.spawn({
          x: x0, y: y0,
          vx: (x1 - x0) / life * 0.4, vy: (y1 - y0) / life * 0.4,
          ax: (x1 - x0) / (life * life) * 1.2, ay: (y1 - y0) / (life * life) * 1.2,
          life, size: lerp(0.8, 1.6, Math.random()), color, alpha: 0.5, streak: 0.05,
        });
      }
    }

    /** Clima de la pista: nieve, arena o estrellas que pasan. */
    _spawnAmbient(dt) {
      const kind = this.theme.particles;
      if (this.reducedEffects || kind === 'motes') return;
      const cam = this.cam;
      const colors = this.theme.particleColors;
      this._ambientT += dt * (kind === 'stars' ? 40 : 28);
      while (this._ambientT >= 1) {
        this._ambientT -= 1;
        if (kind === 'snow') {
          this.particles.spawn({
            x: Math.random() * cam.w * 1.2 - cam.w * 0.1, y: -5,
            vx: lerp(-40, 10, Math.random()), vy: lerp(80, 180, Math.random()),
            life: lerp(3, 6, Math.random()), size: lerp(0.8, 2.4, Math.random()), color: pick(colors), alpha: 0.85,
          });
        } else if (kind === 'sand') {
          this.particles.spawn({
            x: cam.w + 10, y: cam.h * lerp(0.15, 1, Math.random()),
            vx: -lerp(500, 900, Math.random()), vy: lerp(-20, 40, Math.random()),
            life: lerp(1, 2, Math.random()), size: lerp(0.6, 1.5, Math.random()), color: pick(colors), alpha: 0.5, streak: 0.025,
          });
        } else if (kind === 'stars') {
          const a = Math.random() * Math.PI * 2;
          const v = lerp(200, 500, Math.random()) * (this.speed / 20);
          this.particles.spawn({
            x: cam.vpX, y: cam.horizonY - cam.h * 0.08,
            vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6,
            ax: Math.cos(a) * v * 1.5, ay: Math.sin(a) * v,
            life: lerp(0.8, 1.4, Math.random()), size: lerp(0.6, 1.4, Math.random()), color: pick(colors), alpha: 0.7, streak: 0.04,
          });
        }
      }
    }

    _popup(x, y, text, color) {
      const p = this.popups.find((q) => !q.alive);
      if (!p) return;
      Object.assign(p, { alive: true, x, y, text, color, life: 0.9 });
    }

    _updateFx(dt) {
      this.particles.update(dt);
      for (const p of this.popups) {
        if (!p.alive) continue;
        p.life -= dt;
        p.y -= 40 * dt;
        if (p.life <= 0) p.alive = false;
      }
      this.shake = Math.max(0, this.shake - dt * 2.2);
      this.flash = Math.max(0, this.flash - dt * 2.5);
    }

    /* ---------------------------------------------------------------- */
    /* Render                                                           */
    /* ---------------------------------------------------------------- */

    render() {
      const ctx = this.ctx;
      const cam = this.cam;
      const t = this.animTime;

      ctx.save();
      if (this.shake > 0) {
        const m = this.shake * this.shake * 10;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }

      ctx.save();
      ctx.translate(0, -this.horizonShift);
      this.backdrop.renderScenery();
      ctx.restore();
      this.world.draw(ctx, this.distance, t);
      for (const o of this.obstacles) o.drawGround(ctx, cam, this.distance, this.time);

      // Orden del pintor: de lejos a cerca; el auto se intercala en z = 0.
      const list = this._drawList;
      list.length = 0;
      for (const o of this.obstacles) {
        const z = o.pos - this.distance;
        if (!o.destroyed && z < G.FAR && z + o.depth > cam.zNear - 1) list.push(o);
      }
      for (const arr of [this.orbs, this.powerups]) {
        for (const o of arr) {
          const z = o.pos - this.distance;
          if (!o.collected && z < G.FAR && z > cam.zNear - 1) list.push(o);
        }
      }
      list.sort((a, b) => b.pos + (b.depth || 0) / 2 - (a.pos + (a.depth || 0) / 2));

      const glitch = this.crashed ? clamp(this.crashT / G.CRASH_DURATION, 0, 1) : 0;
      const fx = { glitch, shield: this.power.shield, magnet: this.power.magnet, mult: this.power.multiplier };
      let carDrawn = false;
      for (const e of list) {
        if (!carDrawn && e.pos + (e.depth || 0) / 2 < this.distance) {
          this.car.draw(ctx, cam, t, fx);
          carDrawn = true;
        }
        // Las compuertas usan el tiempo de carrera (se congela en pausa).
        e.draw(ctx, cam, this.distance, e.type === 'gate' ? this.time : t);
      }
      if (!carDrawn) this.car.draw(ctx, cam, t, fx);

      if (this.theme.fog) this._drawFog(ctx, this.theme.fog);
      this.particles.draw(ctx);
      this._drawPopups(ctx);
      ctx.restore();

      if (this.car.nitroActive) {
        // Viñeta azul de velocidad.
        const g = ctx.createRadialGradient(cam.w / 2, cam.h * 0.55, cam.h * 0.3, cam.w / 2, cam.h * 0.55, cam.h * 0.9);
        g.addColorStop(0, 'rgba(0,217,255,0)');
        g.addColorStop(1, 'rgba(0,217,255,0.18)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, cam.w, cam.h);
      }
      if (this.flash > 0) {
        ctx.globalAlpha = this.flash * 0.45;
        ctx.fillStyle = this._flashColor || '#ffdcf5';
        ctx.fillRect(0, 0, cam.w, cam.h);
        ctx.globalAlpha = 1;
      }
      if (this.crashed) {
        const k = 1 - clamp(this.crashT / G.CRASH_DURATION, 0, 1);
        ctx.fillStyle = `rgba(8,11,22,${k * 0.55})`;
        ctx.fillRect(0, 0, cam.w, cam.h);
      }
    }

    /** Niebla que oculta lo lejano: los obstáculos aparecen de entre la arena. */
    _drawFog(ctx, fog) {
      const cam = this.cam;
      const yFar = cam.groundY(fog.far);
      const yNear = cam.groundY(fog.near);
      const swirl = 0.05 * Math.sin(this.animTime * 1.3);
      const g = ctx.createLinearGradient(0, 0, 0, yNear);
      g.addColorStop(0, `rgba(${fog.color},0.55)`);
      g.addColorStop(clamp(cam.horizonY / yNear, 0, 1), `rgba(${fog.color},${0.88 + swirl})`);
      g.addColorStop(clamp(yFar / yNear, 0, 1), `rgba(${fog.color},${0.85 + swirl})`);
      g.addColorStop(1, `rgba(${fog.color},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cam.w, yNear);
    }

    _drawPopups(ctx) {
      const size = Math.round(clamp(this.cam.h * 0.026, 14, 24));
      ctx.font = `700 ${size}px Orbitron, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of this.popups) {
        if (!p.alive) continue;
        ctx.globalAlpha = clamp(p.life / 0.4, 0, 1);
        ctx.fillStyle = p.color;
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Elimina elementos en el sitio (sin crear arrays nuevos por frame). */
  function compact(arr, keep) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) {
      if (keep(arr[i])) arr[j++] = arr[i];
    }
    arr.length = j;
  }

  NR.Game = Game;
})(window.NR);
