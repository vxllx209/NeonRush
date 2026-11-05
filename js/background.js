/**
 * NEON RUSH — Escena de fondo con temas (pistas).
 *
 * Capas, de atrás hacia delante:
 *   cielo -> estrellas / aurora / planeta / sol -> neblina del horizonte ->
 *   3 capas de horizonte con parallax (prerenderizadas en canvas fuera de
 *   pantalla): edificios, montañas, dunas, palmeras o estaciones espaciales ->
 *   detalles animados (ventanas, balizas, carteles) -> (menú) suelo y
 *   carretera decorativa -> partículas.
 *
 * setTheme(theme) cambia de escenario (ver js/tracks.js). Durante la carrera
 * el juego usa renderScenery() y dibuja su propia carretera (world.js).
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;
  const { clamp, lerp, fract, seededRandom, pick } = NR.util;

  const SIGN_TEXTS = ['NEON', 'RUSH', 'CYBER//', 'NR-77', 'OPEN 24/7', 'SYNC', 'VOLT', 'GRID 07', 'DATA'];
  const SIGN_COLORS = [C.cyan, C.pink, C.green, C.purple];

  class CityBackdrop {
    /**
     * @param size opcional { w, h } para canvas fuera del DOM (miniaturas)
     */
    constructor(canvas, { reducedMotion = false, theme = null, size = null } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.fixedSize = size;
      this.theme = theme || NR.CITY_THEME;
      this.time = 0;
      this.reducedMotion = reducedMotion;
      this.motion = reducedMotion ? 0.25 : 1;
      this.roadSpeed = 1.6;
      this.particles = new NR.ParticlePool(160);
      this._moteTimer = 0;
      this._streakTimer = 0;
      this.layers = [];
      this.resize();
    }

    setReducedMotion(value) {
      this.reducedMotion = value;
      this.motion = value ? 0.25 : 1;
      if (value) this.particles.clear();
    }

    /** Cambia de escenario (reconstruye capas y cielo). */
    setTheme(theme) {
      if (!theme || theme === this.theme) return;
      this.theme = theme;
      this._rebuild();
    }

    resize() {
      const dpr = this.fixedSize ? 1 : Math.min(window.devicePixelRatio || 1, NR.CONFIG.MAX_DPR);
      const w = Math.max(1, this.fixedSize ? this.fixedSize.w : this.canvas.clientWidth);
      const h = Math.max(1, this.fixedSize ? this.fixedSize.h : this.canvas.clientHeight);
      if (w === this.w && h === this.h && dpr === this.dpr) return false;

      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const portrait = h > w;
      this.horizonY = Math.round(h * (portrait ? 0.56 : 0.6));
      this.scale = clamp(h / 820, 0.7, 1.35);
      this.vpX = w / 2;
      this.roadBottomW = Math.min(w * (portrait ? 1.15 : 0.62), 980);
      this.roadTopW = this.roadBottomW * 0.035;
      this._rebuild();
      return true;
    }

    _rebuild() {
      if (!this.w) return;
      const T = this.theme;
      this.layers = T.layers.map((def, i) => this._buildLayer(def, i));
      this._skyGradient = this._makeSky();
      const rng = seededRandom(4242);
      this.stars = Array.from({ length: T.stars || 0 }, () => ({
        x: rng() * this.w, y: rng() * this.horizonY * 0.9, r: lerp(0.4, 1.6, rng()), phase: rng() * 10,
      }));
      this.particles.clear();
    }

    /* ---------------------------------------------------------------- */
    /* Construcción (una vez por resize / cambio de tema)                 */
    /* ---------------------------------------------------------------- */

    _makeSky() {
      const g = this.ctx.createLinearGradient(0, 0, 0, this.horizonY);
      for (const [stop, color] of this.theme.sky) g.addColorStop(stop, color);
      return g;
    }

    _buildLayer(def, index) {
      const rng = seededRandom(7919 + index * 104729);
      const H = this.horizonY;
      const tileW = Math.ceil(Math.max(this.w, 700) * 1.3);
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(tileW * this.dpr);
      canvas.height = Math.ceil(H * this.dpr);
      const g = canvas.getContext('2d');
      g.scale(this.dpr, this.dpr);
      const L = { def, canvas, tileW, H, flickers: [], beacons: [], signs: [] };

      switch (def.kind) {
        case 'ridge': this._buildRidge(g, L, rng); break;
        case 'dunes': this._buildDunes(g, L, rng); break;
        case 'palms': this._buildPalms(g, L, rng); break;
        case 'stations': this._buildStations(g, L, rng); break;
        default: this._buildBuildings(g, L, rng);
      }
      return L;
    }

    _buildBuildings(g, L, rng) {
      const { def, tileW, H } = L;
      const s = this.scale;
      const cellW = 7 * s, cellH = 10 * s, winW = 3 * s, winH = 4.5 * s;
      let x = 0;
      while (x < tileW) {
        const remaining = tileW - x;
        let bw = lerp(def.minW, def.maxW, rng()) * s;
        if (remaining - bw < def.minW * s) bw = remaining; // el tile cierra exactamente
        const bh = H * lerp(def.minH, def.maxH, rng());
        const top = H - bh;
        g.fillStyle = def.body;
        g.fillRect(x, top, bw, bh);

        if (bw > 36 * s && rng() < 0.4) {
          const cw = bw * lerp(0.3, 0.6, rng());
          const ch = lerp(8, 28, rng()) * s;
          g.fillRect(x + (bw - cw) / 2, top - ch, cw, ch);
          if (rng() < 0.6) {
            const ah = lerp(10, 34, rng()) * s;
            g.fillRect(x + bw / 2 - 0.75, top - ch - ah, 1.5, ah);
            L.beacons.push({ x: x + bw / 2, y: top - ch - ah, phase: rng() * 6, color: rng() < 0.7 ? C.pink : C.cyan });
          }
        }
        g.fillStyle = def.edge;
        g.fillRect(x, top, bw, 1);
        g.fillRect(x, top, 1, bh * 0.5);

        for (let wy = top + 8 * s; wy < H - 6 * s; wy += cellH) {
          for (let wx = x + 5 * s; wx < x + bw - 5 * s - winW; wx += cellW) {
            if (rng() > def.lit) continue;
            const color = pick(def.windows, rng);
            if (L.flickers.length < 36 && rng() < 0.08) {
              L.flickers.push({ x: wx, y: wy, w: winW, h: winH, color, phase: rng() * 10, speed: lerp(0.5, 2.2, rng()) });
            } else {
              g.fillStyle = color;
              g.fillRect(wx, wy, winW, winH);
            }
          }
        }

        if (def.signs && bw > 70 * s && rng() < 0.22) {
          const sw = bw * lerp(0.55, 0.8, rng());
          const sh = lerp(16, 24, rng()) * s;
          L.signs.push({
            x: x + (bw - sw) / 2, y: top + bh * lerp(0.12, 0.45, rng()), w: sw, h: sh,
            text: pick(SIGN_TEXTS, rng), color: pick(SIGN_COLORS, rng), phase: rng() * 10,
          });
        }
        x += bw + (def.gap ? Math.floor(rng() * def.gap * s) : 0);
      }
    }

    /** Cordillera dentada con perfil neón y, opcionalmente, picos nevados. */
    _buildRidge(g, L, rng) {
      const { def, tileW, H } = L;
      const s = this.scale;
      const pts = [];
      const h0 = H - H * lerp(def.minH, def.maxH, rng());
      pts.push([0, h0]);
      let x = 0;
      while (x < tileW) {
        x = Math.min(tileW, x + lerp(30, 110, rng()) * s);
        pts.push([x, H - H * lerp(def.minH, def.maxH, rng())]);
      }
      pts[pts.length - 1][1] = h0; // el tile encaja sin costura

      g.fillStyle = def.body;
      g.beginPath();
      g.moveTo(0, H);
      for (const [px, py] of pts) g.lineTo(px, py);
      g.lineTo(tileW, H);
      g.closePath();
      g.fill();

      if (def.cap) {
        const capLine = H - H * (def.minH + (def.maxH - def.minH) * 0.62);
        g.fillStyle = def.cap;
        for (let i = 1; i < pts.length - 1; i++) {
          const [px, py] = pts[i];
          if (py > capLine || py > pts[i - 1][1] || py > pts[i + 1][1]) continue;
          const k = 0.28;
          g.beginPath();
          g.moveTo(px, py);
          g.lineTo(lerp(px, pts[i - 1][0], k), lerp(py, pts[i - 1][1], k));
          g.lineTo(px, py + (capLine - py) * 0.25 + 4);
          g.lineTo(lerp(px, pts[i + 1][0], k), lerp(py, pts[i + 1][1], k));
          g.closePath();
          g.fill();
        }
      }

      g.strokeStyle = def.edge;
      g.lineWidth = 1.5;
      g.beginPath();
      pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
      g.stroke();
    }

    /** Dunas suaves (frecuencias enteras: el tile encaja sin costura) y mesetas. */
    _buildDunes(g, L, rng) {
      const { def, tileW, H } = L;
      const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
      const yAt = (x) => {
        const t = (x / tileW) * Math.PI * 2;
        const v = 0.5 + 0.25 * Math.sin(2 * t + ph[0]) + 0.15 * Math.sin(3 * t + ph[1]) + 0.1 * Math.sin(5 * t + ph[2]);
        return H - H * (def.minH + (def.maxH - def.minH) * v);
      };

      // Mesetas detrás de las dunas.
      for (let i = 0; i < (def.mesas || 0); i++) {
        const mx = rng() * tileW * 0.85;
        const mw = lerp(70, 160, rng()) * this.scale;
        const mh = H * lerp(def.maxH * 0.9, def.maxH * 1.5, rng());
        g.fillStyle = def.body;
        g.beginPath();
        g.moveTo(mx, H);
        g.lineTo(mx + mw * 0.12, H - mh);
        g.lineTo(mx + mw * 0.88, H - mh);
        g.lineTo(mx + mw, H);
        g.closePath();
        g.fill();
        g.fillStyle = def.edge;
        g.fillRect(mx + mw * 0.12, H - mh, mw * 0.76, 1.5);
      }

      const grad = g.createLinearGradient(0, H * (1 - def.maxH), 0, H);
      grad.addColorStop(0, def.edge);
      grad.addColorStop(0.08, def.body);
      grad.addColorStop(1, def.body);
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= tileW; x += 4) g.lineTo(x, yAt(x));
      g.lineTo(tileW, H);
      g.closePath();
      g.fill();
      g.strokeStyle = def.edge;
      g.lineWidth = 1.2;
      g.beginPath();
      for (let x = 0; x <= tileW; x += 4) (x ? g.lineTo(x, yAt(x)) : g.moveTo(x, yAt(x)));
      g.stroke();
    }

    /** Palmeras en silueta sobre una franja de colinas. */
    _buildPalms(g, L, rng) {
      const { def, tileW, H } = L;
      const s = this.scale;
      g.fillStyle = def.body;
      g.beginPath();
      g.moveTo(0, H);
      for (let x = 0; x <= tileW; x += 6) {
        const t = (x / tileW) * Math.PI * 2;
        g.lineTo(x, H - H * (0.035 + 0.02 * Math.sin(3 * t) + 0.01 * Math.sin(7 * t)));
      }
      g.lineTo(tileW, H);
      g.closePath();
      g.fill();

      g.strokeStyle = def.body;
      g.lineCap = 'round';
      let x = lerp(20, 80, rng()) * s;
      while (x < tileW - 40 * s) {
        const h = H * lerp(def.minH, def.maxH, rng());
        const lean = lerp(-0.25, 0.25, rng()) * h;
        const tx = x + lean, ty = H - h;
        g.lineWidth = 5 * s;
        g.beginPath();
        g.moveTo(x, H);
        g.quadraticCurveTo(x + lean * 0.2, H - h * 0.5, tx, ty);
        g.stroke();
        g.lineWidth = 3 * s;
        for (let f = 0; f < 7; f++) {
          const a = -Math.PI / 2 + lerp(-2.4, 2.4, f / 6);
          const len = lerp(26, 42, rng()) * s;
          const ex = tx + Math.cos(a) * len;
          const ey = ty + Math.sin(a) * len * 0.6 + len * 0.45;
          g.beginPath();
          g.moveTo(tx, ty);
          g.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - 6 * s, ex, ey);
          g.stroke();
        }
        x += lerp(90, 220, rng()) * s;
      }
    }

    /** Estaciones espaciales flotando sobre el horizonte. */
    _buildStations(g, L, rng) {
      const { def, tileW, H } = L;
      const s = this.scale;
      let x = lerp(20, 80, rng()) * s;
      while (x < tileW - 60 * s) {
        const w = lerp(60, 170, rng()) * s;
        const h = lerp(10, 26, rng()) * s;
        const y = H * lerp(0.2, 0.65, rng());
        g.fillStyle = def.body;
        g.fillRect(x, y, w, h);
        g.fillRect(x + w * 0.4, y - h * 0.8, w * 0.2, h * 0.8);
        g.strokeStyle = def.edge;
        g.lineWidth = 1;
        g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        // Anillo / antena
        g.beginPath();
        g.ellipse(x + w / 2, y + h / 2, w * 0.62, h * 0.9, 0, 0, Math.PI * 2);
        g.stroke();
        g.fillRect(x + w / 2 - 0.5, y - h * 2, 1, h * 1.2);
        L.beacons.push({ x: x + w / 2, y: y - h * 2, phase: rng() * 6, color: rng() < 0.5 ? C.pink : '#2ef2d0' });
        for (let wx = x + 5 * s; wx < x + w - 6 * s; wx += 8 * s) {
          if (rng() > def.lit) continue;
          const color = pick(def.windows, rng);
          if (L.flickers.length < 24 && rng() < 0.2) {
            L.flickers.push({ x: wx, y: y + h * 0.35, w: 3 * s, h: 3 * s, color, phase: rng() * 10, speed: lerp(0.5, 2.2, rng()) });
          } else {
            g.fillStyle = color;
            g.fillRect(wx, y + h * 0.35, 3 * s, 3 * s);
          }
        }
        x += w + lerp(60, 200, rng()) * s;
      }
    }

    /* ---------------------------------------------------------------- */
    /* Actualización                                                    */
    /* ---------------------------------------------------------------- */

    update(dt) {
      this.time += dt * this.motion;
      this.particles.update(dt);
      if (this.reducedMotion) return;
      const T = this.theme;

      this._moteTimer += dt;
      while (this._moteTimer > 0.07) {
        this._moteTimer -= 0.07;
        this._spawnAmbient(T);
      }

      this._streakTimer += dt;
      while (this._streakTimer > 0.12) {
        this._streakTimer -= 0.12;
        const side = Math.random() < 0.5 ? -1 : 1;
        const f = side * lerp(0.55, 1.6, Math.random());
        const tx = this.vpX + f * this.roadBottomW * 0.5;
        const dx = tx - this.vpX;
        const dy = this.h - this.horizonY;
        const len = Math.hypot(dx, dy);
        const speed = lerp(60, 120, Math.random());
        this.particles.spawn({
          x: this.vpX + dx * 0.04, y: this.horizonY + dy * 0.04,
          vx: (dx / len) * speed, vy: (dy / len) * speed,
          ax: (dx / len) * speed * 2.2, ay: (dy / len) * speed * 2.2,
          life: lerp(1.1, 1.6, Math.random()), size: lerp(0.8, 1.6, Math.random()),
          color: side < 0 ? T.edges[0] : T.edges[1], alpha: 0.55, streak: 0.06,
        });
      }
    }

    _spawnAmbient(T) {
      const colors = T.particleColors;
      switch (T.particles) {
        case 'snow':
          this.particles.spawn({
            x: Math.random() * this.w, y: -5, vx: lerp(-15, 15, Math.random()), vy: lerp(30, 70, Math.random()),
            life: lerp(6, 10, Math.random()), size: lerp(0.8, 2.2, Math.random()), color: pick(colors), alpha: 0.8,
          });
          break;
        case 'sand':
          this.particles.spawn({
            x: this.w + 10, y: this.h * lerp(0.2, 0.95, Math.random()), vx: -lerp(250, 500, Math.random()), vy: lerp(-10, 20, Math.random()),
            life: lerp(1.5, 3, Math.random()), size: lerp(0.6, 1.4, Math.random()), color: pick(colors), alpha: 0.45, streak: 0.03,
          });
          break;
        default:
          this.particles.spawn({
            x: Math.random() * this.w, y: this.h * lerp(0.25, 1.05, Math.random()),
            vx: lerp(-6, 6, Math.random()), vy: -lerp(8, 26, Math.random()),
            life: lerp(3, 7, Math.random()), size: lerp(0.6, 1.8, Math.random()),
            color: pick(colors), alpha: lerp(0.3, 0.8, Math.random()),
          });
      }
    }

    /** Solo avanza el tiempo de la escena (usado durante el gameplay). */
    tick(dt) {
      this.time += dt * this.motion;
    }

    /* ---------------------------------------------------------------- */
    /* Render                                                           */
    /* ---------------------------------------------------------------- */

    /** Escena completa de menú: horizonte + carretera decorativa + partículas. */
    render() {
      this.renderScenery();
      this._drawGround();
      this._drawRoad();
      this.particles.draw(this.ctx);
    }

    /** Cielo y horizonte (compartido con el gameplay). */
    renderScenery() {
      const { ctx, w, horizonY } = this;
      const T = this.theme;
      ctx.fillStyle = this._skyGradient;
      ctx.fillRect(0, 0, w, horizonY);
      if (this.stars.length) this._drawStars();
      if (T.aurora) this._drawAurora();
      if (T.planet) this._drawPlanet(T.planet);
      if (T.sun) this._drawSun(T.sun);
      this._drawHaze();

      this.layers.forEach((L, i) => {
        this._drawLayer(L);
        if (i === 0 && T.beams) this._drawBeams();
      });
    }

    _drawStars() {
      const { ctx, time } = this;
      ctx.fillStyle = '#ffffff';
      for (const st of this.stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 2 + st.phase);
        ctx.fillRect(st.x, st.y, st.r, st.r);
      }
      ctx.globalAlpha = 1;
    }

    _drawAurora() {
      const { ctx, w, horizonY, time } = this;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const bands = [['57,255,136', 0.16, 0], ['0,217,255', 0.12, 2], ['139,92,246', 0.1, 4]];
      for (const [rgb, a, ph] of bands) {
        const base = horizonY * (0.22 + ph * 0.03);
        const g = ctx.createLinearGradient(0, base - 40, 0, base + 90);
        g.addColorStop(0, `rgba(${rgb},0)`);
        g.addColorStop(0.4, `rgba(${rgb},${a})`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y = base + Math.sin(x * 0.006 + time * 0.35 + ph) * 26 + Math.sin(x * 0.017 + time * 0.6) * 8;
          x ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        for (let x = w; x >= 0; x -= 12) {
          const y = base + 90 + Math.sin(x * 0.006 + time * 0.35 + ph) * 20;
          ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    _drawPlanet(p) {
      const { ctx, w, horizonY } = this;
      const r = Math.min(w, this.h) * p.r;
      const x = w * p.x, y = horizonY * p.y + Math.sin(this.time * 0.1) * 3;
      const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
      g.addColorStop(0, p.c2);
      g.addColorStop(0.6, p.c1);
      g.addColorStop(1, '#0a0420');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      if (p.ring) {
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.strokeStyle = p.ring;
        ctx.lineWidth = Math.max(1, r * 0.06);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.7, r * 0.42, -0.35, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    _drawSun(sun) {
      const { ctx, vpX, horizonY } = this;
      const r = Math.min(this.w, this.h) * sun.r;
      const cy = horizonY - r * sun.lift;
      ctx.save();
      const glow = ctx.createRadialGradient(vpX, cy, r * 0.5, vpX, cy, r * 2.2);
      glow.addColorStop(0, 'rgba(255,200,120,0.35)');
      glow.addColorStop(1, 'rgba(255,120,120,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(vpX - r * 2.2, cy - r * 2.2, r * 4.4, r * 4.4);
      const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
      g.addColorStop(0, sun.top);
      g.addColorStop(1, sun.bottom);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(vpX, cy, r, 0, Math.PI * 2);
      ctx.fill();
      if (sun.stripes) {
        // Franjas horizontales en la mitad inferior (estilo synthwave), animadas.
        ctx.fillStyle = sun.stripe;
        const off = fract(this.time * 0.15);
        for (let i = 0; i < 7; i++) {
          const k = (i + off) / 7;
          const y = cy + r * 0.05 + k * r;
          const hgt = Math.max(1, r * 0.03 + k * r * 0.07);
          ctx.fillRect(vpX - r, y, r * 2, hgt);
        }
      }
      ctx.restore();
    }

    _drawHaze() {
      const { ctx, w, vpX, horizonY } = this;
      const [c1, c2] = this.theme.haze;
      const pulse = 0.9 + 0.1 * Math.sin(this.time * 0.6);
      const r = Math.max(w, this.h) * 0.55;
      const g = ctx.createRadialGradient(vpX, horizonY, 0, vpX, horizonY, r);
      g.addColorStop(0, `rgba(${c1},${0.32 * pulse})`);
      g.addColorStop(0.35, `rgba(${c2},${0.14 * pulse})`);
      g.addColorStop(1, `rgba(${c2},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, horizonY);
    }

    _drawBeams() {
      const { ctx, w, horizonY } = this;
      if (this.reducedMotion) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const beams = [
        { x: w * 0.22, color: '0,217,255', speed: 0.23, phase: 0 },
        { x: w * 0.78, color: '139,92,246', speed: 0.17, phase: 2 },
      ];
      for (const b of beams) {
        const angle = Math.sin(this.time * b.speed + b.phase) * 0.45;
        const len = horizonY * 1.1;
        const spread = 0.06;
        const tipX = b.x + Math.sin(angle) * len;
        const tipY = horizonY - Math.cos(angle) * len;
        const g = ctx.createLinearGradient(b.x, horizonY, tipX, tipY);
        g.addColorStop(0, `rgba(${b.color},0.18)`);
        g.addColorStop(1, `rgba(${b.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(b.x, horizonY);
        ctx.lineTo(b.x + Math.sin(angle - spread) * len, horizonY - Math.cos(angle - spread) * len);
        ctx.lineTo(b.x + Math.sin(angle + spread) * len, horizonY - Math.cos(angle + spread) * len);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    _drawLayer(L) {
      const { ctx, w } = this;
      const t = this.time;
      const offset = (t * L.def.speed * this.scale) % L.tileW;

      for (let k = 0; k * L.tileW - offset < w; k++) {
        ctx.drawImage(L.canvas, k * L.tileW - offset, 0, L.tileW, L.H);
      }

      const sx = (x) => {
        let p = x - offset;
        if (p < -L.tileW * 0.5) p += L.tileW;
        return p;
      };

      for (const f of L.flickers) {
        const x = sx(f.x);
        if (x < -10 || x > w + 10) continue;
        ctx.globalAlpha = this.reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(t * f.speed * 3 + f.phase);
        ctx.fillStyle = f.color;
        ctx.fillRect(x, f.y, f.w, f.h);
      }

      for (const b of L.beacons) {
        const x = sx(b.x);
        if (x < -10 || x > w + 10) continue;
        const on = fract(t * 0.5 + b.phase) < 0.5;
        ctx.globalAlpha = on ? 1 : 0.15;
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(x, b.y, 1.6 * this.scale, 0, Math.PI * 2);
        ctx.fill();
        if (on) {
          ctx.globalAlpha = 0.18;
          ctx.beginPath();
          ctx.arc(x, b.y, 6 * this.scale, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;

      for (const s of L.signs) this._drawSign(s, sx(s.x));
    }

    _drawSign(s, x) {
      if (x + s.w < -10 || x > this.w + 10) return;
      const { ctx } = this;
      const t = this.time;
      let a = 0.78 + 0.22 * Math.sin(t * 3 + s.phase);
      if (fract(t * 0.31 + s.phase) < 0.025) a *= 0.25;

      ctx.save();
      ctx.fillStyle = s.color;
      ctx.globalAlpha = a * 0.1;
      ctx.fillRect(x, s.y, s.w, s.h);
      ctx.globalAlpha = a;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 10;
      ctx.strokeRect(x + 0.5, s.y + 0.5, s.w - 1, s.h - 1);
      ctx.font = `700 ${Math.round(s.h * 0.56)}px Orbitron, "Segoe UI", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(s.text, x + s.w / 2, s.y + s.h / 2 + 1, s.w - 8);
      ctx.restore();
    }

    /* ---------------- Suelo y carretera decorativos (menús) ---------------- */

    _roadWidthAt(y) {
      const k = (y - this.horizonY) / (this.h - this.horizonY);
      return this.roadTopW + (this.roadBottomW - this.roadTopW) * k;
    }

    _yAtDepth(z) {
      return this.horizonY + (this.h - this.horizonY) / z;
    }

    _drawGround() {
      const { ctx, w, h, horizonY, vpX } = this;
      const T = this.theme;
      const g = ctx.createLinearGradient(0, horizonY, 0, h);
      g.addColorStop(0, T.ground[0]);
      g.addColorStop(0.25, T.ground[1]);
      g.addColorStop(1, T.ground[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      ctx.strokeStyle = `rgba(${T.grid},0.16)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i <= 10; i++) {
        for (const side of [-1, 1]) {
          const f = side * (0.5 + i * 0.55);
          ctx.moveTo(vpX + f * this.roadTopW, horizonY);
          ctx.lineTo(vpX + f * this.roadBottomW, h);
        }
      }
      ctx.stroke();

      const phase = fract(this.time * this.roadSpeed);
      ctx.fillStyle = `rgb(${T.grid})`;
      for (let i = 0; i < 28; i++) {
        const z = i + 1 - phase;
        if (z <= 0.05) continue;
        const y = this._yAtDepth(z);
        if (y > h) continue;
        const near = clamp((y - horizonY) / (h - horizonY), 0, 1);
        ctx.globalAlpha = 0.05 + near * 0.3;
        ctx.fillRect(0, y, w, 1);
      }
      ctx.globalAlpha = 1;

      const hg = ctx.createLinearGradient(0, 0, w, 0);
      hg.addColorStop(0, `rgba(${T.horizon},0)`);
      hg.addColorStop(0.5, `rgba(${T.horizon},0.9)`);
      hg.addColorStop(1, `rgba(${T.horizon},0)`);
      ctx.fillStyle = hg;
      ctx.fillRect(0, horizonY - 1, w, 2);
    }

    _drawRoad() {
      const { ctx, h, horizonY, vpX } = this;
      const T = this.theme;
      const topHalf = this.roadTopW / 2;
      const botHalf = this.roadBottomW / 2;

      const surface = ctx.createLinearGradient(0, horizonY, 0, h);
      surface.addColorStop(0, T.road[0]);
      surface.addColorStop(0.3, T.road[1]);
      surface.addColorStop(1, T.road[2]);
      ctx.fillStyle = surface;
      ctx.beginPath();
      ctx.moveTo(vpX - topHalf, horizonY);
      ctx.lineTo(vpX + topHalf, horizonY);
      ctx.lineTo(vpX + botHalf, h);
      ctx.lineTo(vpX - botHalf, h);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const refl = ctx.createLinearGradient(0, horizonY, 0, h);
      refl.addColorStop(0, `rgba(${T.reflect},0.22)`);
      refl.addColorStop(0.35, `rgba(${T.band},0.06)`);
      refl.addColorStop(1, `rgba(${T.band},0)`);
      ctx.fillStyle = refl;
      ctx.fillRect(vpX - botHalf, horizonY, this.roadBottomW, h - horizonY);
      const phase = fract(this.time * this.roadSpeed * 0.25);
      ctx.fillStyle = `rgba(${T.band},0.05)`;
      for (let i = 0; i < 6; i++) {
        const z = (i + 1 - phase) * 4;
        const y0 = this._yAtDepth(z);
        const y1 = this._yAtDepth(z + 0.6);
        ctx.fillRect(vpX - botHalf, y1, this.roadBottomW, Math.max(1, y0 - y1));
      }
      ctx.restore();

      const edge = (side, color) => {
        const x0 = vpX + side * topHalf;
        const x1 = vpX + side * botHalf;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 7;
        ctx.beginPath(); ctx.moveTo(x0, horizonY); ctx.lineTo(x1, h); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x0, horizonY); ctx.lineTo(x1, h); ctx.stroke();
      };
      edge(-1, T.edges[0]);
      edge(1, T.edges[1]);

      const dashPhase = fract(this.time * this.roadSpeed);
      ctx.strokeStyle = T.dash;
      ctx.lineCap = 'round';
      for (const f of [-1 / 6, 1 / 6]) {
        for (let i = 0; i < 24; i++) {
          const zA = i + 1 - dashPhase;
          const zB = zA + 0.45;
          if (zA <= 0.2) continue;
          const yA = this._yAtDepth(zA);
          const yB = this._yAtDepth(zB);
          if (yB > h) continue;
          const near = clamp((yA - horizonY) / (h - horizonY), 0, 1);
          ctx.globalAlpha = 0.15 + near * 0.6;
          ctx.lineWidth = 1 + near * 3;
          ctx.beginPath();
          ctx.moveTo(vpX + f * this._roadWidthAt(yA), Math.min(yA, h));
          ctx.lineTo(vpX + f * this._roadWidthAt(yB), yB);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }
  }

  NR.CityBackdrop = CityBackdrop;
})(window.NR);
