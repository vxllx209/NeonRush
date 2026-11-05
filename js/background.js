/**
 * NEON RUSH — Escena de fondo de la ciudad (menús).
 *
 * Capas, de atrás hacia delante:
 *   cielo -> neblina del horizonte -> 3 capas de edificios con parallax
 *   (prerenderizadas en canvas fuera de pantalla) -> haces de luz ->
 *   ventanas parpadeantes / balizas / carteles holográficos (por frame) ->
 *   suelo con rejilla -> carretera de 3 carriles en perspectiva ->
 *   partículas (motas flotantes + líneas de velocidad).
 *
 * La carretera usa la misma geometría que tendrá el gameplay (Fase 3):
 * punto de fuga central, 3 carriles, profundidad z con y = vpY + D / z.
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;
  const { clamp, lerp, fract, seededRandom, pick } = NR.util;

  const LAYERS = [
    { // lejana: torres altas, tenues
      speed: 5, minH: 0.34, maxH: 0.86, minW: 30, maxW: 80, gap: 0,
      body: '#0c1228', edge: 'rgba(139,92,246,0.35)',
      windows: ['rgba(139,92,246,0.38)', 'rgba(0,217,255,0.22)'], lit: 0.16,
    },
    { // media: carteles holográficos
      speed: 12, minH: 0.22, maxH: 0.62, minW: 44, maxW: 110, gap: 6,
      body: '#090e20', edge: 'rgba(0,217,255,0.45)',
      windows: ['rgba(0,217,255,0.55)', 'rgba(255,54,200,0.45)', 'rgba(245,247,255,0.32)'], lit: 0.2,
      signs: true,
    },
    { // cercana: bloques oscuros con perfil neón
      speed: 24, minH: 0.1, maxH: 0.36, minW: 70, maxW: 160, gap: 18,
      body: '#060914', edge: 'rgba(255,54,200,0.65)',
      windows: ['rgba(0,217,255,0.75)', 'rgba(255,54,200,0.6)', 'rgba(57,255,136,0.5)', 'rgba(245,247,255,0.55)'], lit: 0.13,
    },
  ];

  const SIGN_TEXTS = ['NEON', 'RUSH', 'CYBER//', 'NR-77', 'OPEN 24/7', 'SYNC', 'VOLT', 'GRID 07', 'DATA'];
  const SIGN_COLORS = [C.cyan, C.pink, C.green, C.purple];
  const MOTE_COLORS = [C.cyan, C.pink, C.purple, C.cyan];

  class CityBackdrop {
    constructor(canvas, { reducedMotion = false } = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.time = 0;
      this.reducedMotion = reducedMotion;
      this.motion = reducedMotion ? 0.25 : 1;
      this.roadSpeed = 1.6; // unidades z por segundo (crucero de menú)
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

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, NR.CONFIG.MAX_DPR);
      const w = Math.max(1, this.canvas.clientWidth);
      const h = Math.max(1, this.canvas.clientHeight);
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

      this.layers = LAYERS.map((def, i) => this._buildLayer(def, i));
      this._skyGradient = this._makeSky();
      this.particles.clear();
      return true;
    }

    /* ---------------------------------------------------------------- */
    /* Construcción (una vez por resize)                                  */
    /* ---------------------------------------------------------------- */

    _makeSky() {
      const g = this.ctx.createLinearGradient(0, 0, 0, this.horizonY);
      g.addColorStop(0, '#04060d');
      g.addColorStop(0.55, C.bg);
      g.addColorStop(0.85, '#141433');
      g.addColorStop(1, '#2a1442');
      return g;
    }

    _buildLayer(def, index) {
      const rng = seededRandom(7919 + index * 104729);
      const s = this.scale;
      const H = this.horizonY;
      const tileW = Math.ceil(Math.max(this.w, 700) * 1.3);

      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(tileW * this.dpr);
      canvas.height = Math.ceil(H * this.dpr);
      const g = canvas.getContext('2d');
      g.scale(this.dpr, this.dpr);

      const flickers = [];
      const beacons = [];
      const signs = [];

      const cellW = 7 * s, cellH = 10 * s, winW = 3 * s, winH = 4.5 * s;
      let x = 0;

      while (x < tileW) {
        const remaining = tileW - x;
        let bw = lerp(def.minW, def.maxW, rng()) * s;
        // El último edificio cierra el tile exactamente: el bucle es continuo.
        if (remaining - bw < def.minW * s) bw = remaining;
        const bh = H * lerp(def.minH, def.maxH, rng());
        const top = H - bh;

        g.fillStyle = def.body;
        g.fillRect(x, top, bw, bh);

        // Remate escalonado + antena con baliza.
        let roofY = top;
        if (bw > 36 * s && rng() < 0.4) {
          const cw = bw * lerp(0.3, 0.6, rng());
          const ch = lerp(8, 28, rng()) * s;
          g.fillRect(x + (bw - cw) / 2, top - ch, cw, ch);
          roofY = top - ch;
          if (rng() < 0.6) {
            const ah = lerp(10, 34, rng()) * s;
            g.fillRect(x + bw / 2 - 0.75, roofY - ah, 1.5, ah);
            beacons.push({ x: x + bw / 2, y: roofY - ah, phase: rng() * 6, color: rng() < 0.7 ? C.pink : C.cyan });
          }
        }

        // Perfil neón (borde superior y canto izquierdo).
        g.fillStyle = def.edge;
        g.fillRect(x, top, bw, 1);
        g.fillRect(x, top, 1, bh * 0.5);

        // Ventanas.
        for (let wy = top + 8 * s; wy < H - 6 * s; wy += cellH) {
          for (let wx = x + 5 * s; wx < x + bw - 5 * s - winW; wx += cellW) {
            if (rng() > def.lit) continue;
            const color = pick(def.windows, rng);
            if (flickers.length < 36 && rng() < 0.08) {
              flickers.push({ x: wx, y: wy, w: winW, h: winH, color, phase: rng() * 10, speed: lerp(0.5, 2.2, rng()) });
            } else {
              g.fillStyle = color;
              g.fillRect(wx, wy, winW, winH);
            }
          }
        }

        // Carteles holográficos en la capa media.
        if (def.signs && bw > 70 * s && rng() < 0.22) {
          const sw = bw * lerp(0.55, 0.8, rng());
          const sh = lerp(16, 24, rng()) * s;
          signs.push({
            x: x + (bw - sw) / 2,
            y: top + bh * lerp(0.12, 0.45, rng()),
            w: sw, h: sh,
            text: pick(SIGN_TEXTS, rng),
            color: pick(SIGN_COLORS, rng),
            phase: rng() * 10,
          });
        }

        x += bw + (def.gap ? Math.floor(rng() * def.gap * s) : 0);
      }

      return { def, canvas, tileW, H, flickers, beacons, signs };
    }

    /* ---------------------------------------------------------------- */
    /* Actualización                                                    */
    /* ---------------------------------------------------------------- */

    update(dt) {
      this.time += dt * this.motion;
      this.particles.update(dt);
      if (this.reducedMotion) return;

      // Motas de luz flotando hacia arriba.
      this._moteTimer += dt;
      while (this._moteTimer > 0.07) {
        this._moteTimer -= 0.07;
        this.particles.spawn({
          x: Math.random() * this.w,
          y: this.h * lerp(0.25, 1.05, Math.random()),
          vx: lerp(-6, 6, Math.random()),
          vy: -lerp(8, 26, Math.random()),
          life: lerp(3, 7, Math.random()),
          size: lerp(0.6, 1.8, Math.random()),
          color: pick(MOTE_COLORS),
          alpha: lerp(0.3, 0.8, Math.random()),
        });
      }

      // Líneas de velocidad que salen del punto de fuga a lo largo de la carretera.
      this._streakTimer += dt;
      while (this._streakTimer > 0.12) {
        this._streakTimer -= 0.12;
        const side = Math.random() < 0.5 ? -1 : 1;
        const f = side * lerp(0.55, 1.6, Math.random()); // fuera de los carriles
        const tx = this.vpX + f * this.roadBottomW * 0.5;
        const dx = tx - this.vpX;
        const dy = this.h - this.horizonY;
        const len = Math.hypot(dx, dy);
        const speed = lerp(60, 120, Math.random());
        this.particles.spawn({
          x: this.vpX + dx * 0.04,
          y: this.horizonY + dy * 0.04,
          vx: (dx / len) * speed,
          vy: (dy / len) * speed,
          ax: (dx / len) * speed * 2.2,
          ay: (dy / len) * speed * 2.2,
          life: lerp(1.1, 1.6, Math.random()),
          size: lerp(0.8, 1.6, Math.random()),
          color: side < 0 ? C.cyan : C.pink,
          alpha: 0.55,
          streak: 0.06,
        });
      }
    }

    /* ---------------------------------------------------------------- */
    /* Render                                                           */
    /* ---------------------------------------------------------------- */

    /** Solo avanza el tiempo de la escena (usado durante el gameplay). */
    tick(dt) {
      this.time += dt * this.motion;
    }

    /** Escena completa de menú: ciudad + carretera decorativa + partículas. */
    render() {
      this.renderScenery();
      this._drawGround();
      this._drawRoad();
      this.particles.draw(this.ctx);
    }

    /** Cielo y ciudad hasta el horizonte (compartido con el gameplay). */
    renderScenery() {
      const { ctx, w, horizonY } = this;
      ctx.fillStyle = this._skyGradient;
      ctx.fillRect(0, 0, w, horizonY);
      this._drawHaze();

      this._drawLayer(this.layers[0]);
      this._drawBeams();
      this._drawLayer(this.layers[1]);
      this._drawLayer(this.layers[2]);
    }

    _drawHaze() {
      const { ctx, w, vpX, horizonY } = this;
      const pulse = 0.9 + 0.1 * Math.sin(this.time * 0.6);
      const r = Math.max(w, this.h) * 0.55;
      const g = ctx.createRadialGradient(vpX, horizonY, 0, vpX, horizonY, r);
      g.addColorStop(0, `rgba(255,54,200,${0.32 * pulse})`);
      g.addColorStop(0.35, `rgba(139,92,246,${0.14 * pulse})`);
      g.addColorStop(1, 'rgba(139,92,246,0)');
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

      // Posición en pantalla de una x del tile (con envoltura).
      const sx = (x) => {
        let p = x - offset;
        if (p < -L.tileW * 0.5) p += L.tileW;
        return p;
      };

      for (const f of L.flickers) {
        const x = sx(f.x);
        if (x < -10 || x > w + 10) continue;
        const a = this.reducedMotion ? 0.7 : 0.5 + 0.5 * Math.sin(t * f.speed * 3 + f.phase);
        ctx.globalAlpha = a;
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
      // Parpadeo holográfico: oscilación suave + caídas breves.
      let a = 0.78 + 0.22 * Math.sin(t * 3 + s.phase);
      if (fract(t * 0.31 + s.phase) < 0.025) a *= 0.25;

      ctx.save();
      ctx.globalAlpha = a;
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

    /** Ancho de la carretera a una altura y (lineal en y => perspectiva correcta). */
    _roadWidthAt(y) {
      const k = (y - this.horizonY) / (this.h - this.horizonY);
      return this.roadTopW + (this.roadBottomW - this.roadTopW) * k;
    }

    /** Altura en pantalla de la profundidad z (z = 1 es el borde inferior). */
    _yAtDepth(z) {
      return this.horizonY + (this.h - this.horizonY) / z;
    }

    _drawGround() {
      const { ctx, w, h, horizonY, vpX } = this;

      const g = ctx.createLinearGradient(0, horizonY, 0, h);
      g.addColorStop(0, '#120f2b');
      g.addColorStop(0.25, '#0b0e1f');
      g.addColorStop(1, '#05070f');
      ctx.fillStyle = g;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Rejilla lateral radial.
      ctx.strokeStyle = 'rgba(139,92,246,0.16)';
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

      // Líneas horizontales que avanzan hacia el jugador.
      const phase = fract(this.time * this.roadSpeed);
      for (let i = 0; i < 28; i++) {
        const z = i + 1 - phase;
        if (z <= 0.05) continue;
        const y = this._yAtDepth(z);
        if (y > h) continue;
        const near = clamp((y - horizonY) / (h - horizonY), 0, 1);
        ctx.globalAlpha = 0.05 + near * 0.3;
        ctx.fillStyle = C.purple;
        ctx.fillRect(0, y, w, 1);
      }
      ctx.globalAlpha = 1;

      // Línea del horizonte.
      const hg = ctx.createLinearGradient(0, 0, w, 0);
      hg.addColorStop(0, 'rgba(255,54,200,0)');
      hg.addColorStop(0.5, 'rgba(255,54,200,0.9)');
      hg.addColorStop(1, 'rgba(255,54,200,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(0, horizonY - 1, w, 2);
    }

    _drawRoad() {
      const { ctx, h, horizonY, vpX } = this;
      const topHalf = this.roadTopW / 2;
      const botHalf = this.roadBottomW / 2;

      // Superficie.
      const surface = ctx.createLinearGradient(0, horizonY, 0, h);
      surface.addColorStop(0, 'rgba(40,20,70,0.95)');
      surface.addColorStop(0.3, 'rgba(14,18,40,0.96)');
      surface.addColorStop(1, 'rgba(8,11,22,0.98)');
      ctx.fillStyle = surface;
      ctx.beginPath();
      ctx.moveTo(vpX - topHalf, horizonY);
      ctx.lineTo(vpX + topHalf, horizonY);
      ctx.lineTo(vpX + botHalf, h);
      ctx.lineTo(vpX - botHalf, h);
      ctx.closePath();
      ctx.fill();

      // Reflejo de la ciudad sobre el asfalto.
      ctx.save();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const refl = ctx.createLinearGradient(0, horizonY, 0, h);
      refl.addColorStop(0, 'rgba(255,54,200,0.22)');
      refl.addColorStop(0.35, 'rgba(0,217,255,0.06)');
      refl.addColorStop(1, 'rgba(0,217,255,0)');
      ctx.fillStyle = refl;
      ctx.fillRect(vpX - botHalf, horizonY, this.roadBottomW, h - horizonY);

      // Bandas de luz recorriendo la carretera.
      const phase = fract(this.time * this.roadSpeed * 0.25);
      for (let i = 0; i < 6; i++) {
        const z = (i + 1 - phase) * 4;
        const y0 = this._yAtDepth(z);
        const y1 = this._yAtDepth(z + 0.6);
        ctx.fillStyle = 'rgba(0,217,255,0.05)';
        ctx.fillRect(vpX - botHalf, y1, this.roadBottomW, Math.max(1, y0 - y1));
      }
      ctx.restore();

      // Bordes: halo ancho + línea fina.
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
      edge(-1, C.cyan);
      edge(1, C.pink);

      // Divisores de carril discontinuos (3 carriles => 2 divisores).
      const dashPhase = fract(this.time * this.roadSpeed);
      ctx.strokeStyle = C.white;
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
