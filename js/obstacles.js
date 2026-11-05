/**
 * NEON RUSH — Obstáculos (versión auto: no se puede saltar).
 *
 * Tipo      Comportamiento                                     Cómo se evita
 * block     barricada tecnológica fija en 1 carril            cambiar de carril
 * field     campo de energía de 1-2 carriles, con aviso       cambiar de carril
 *           en el suelo antes de llegar
 * gate      compuerta láser que se enciende y se apaga        cruzar con el láser
 *           (con parpadeo de aviso antes de encenderse)       apagado, o cambiar
 * traffic   auto lento; algunos cambian de carril tras        adelantarlo por
 *           encender el intermitente                          otro carril
 *
 * `pos` es la posición absoluta en la pista; z = pos - distancia recorrida.
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;
  const G = NR.CONFIG.GAME;
  const { clamp } = NR.util;
  const drawBox = NR.drawBox;

  const TYPES = Object.freeze({
    block: { depth: 1.0, halfW: 0.42 },
    field: { depth: 0.3, halfW: 0.47 },
    gate: { depth: 0.3, halfW: 0.48 },
    traffic: { depth: 1.4, halfW: 0.4 },
  });

  const FIELD_WARNING = 12;
  const TRAFFIC_COLORS = [
    { body: '#2b3150', body2: '#1b2038', accent: '#3a4366', dark: '#0b0e1a', light: '#FF3B5C' },
    { body: '#3a2d4f', body2: '#241b33', accent: '#4b3d66', dark: '#0e0a16', light: '#FF3B5C' },
    { body: '#22343d', body2: '#152229', accent: '#2f4652', dark: '#081014', light: '#FF5A3B' },
  ];

  class Obstacle {
    /**
     * @param {string} type
     * @param {number} laneA primer carril
     * @param {number} pos   posición absoluta
     * @param {number} span  carriles que ocupa (field / gate)
     */
    constructor(type, laneA, pos, span = 1) {
      const t = TYPES[type];
      this.type = type;
      this.pos = pos;
      this.laneA = laneA;
      this.span = span;
      this.x = NR.laneX(laneA) + ((span - 1) * G.LANE_WIDTH) / 2;
      this.halfW = t.halfW + ((span - 1) * G.LANE_WIDTH) / 2;
      this.depth = t.depth;
      this.phase = Math.random() * 10;
      this.destroyed = false;
      this.fade = 1;
    }

    /** Solo el tráfico se mueve. */
    update() {}

    /** Compuertas: encendidas en la primera mitad del ciclo. */
    isOn(time) {
      if (this.type !== 'gate') return true;
      const k = ((time + this.phase) % G.GATE_PERIOD) / G.GATE_PERIOD;
      return k < G.GATE_ON;
    }

    /** ¿Está a punto de encenderse? (parpadeo de aviso) */
    warning(time) {
      if (this.type !== 'gate') return false;
      const k = ((time + this.phase) % G.GATE_PERIOD) / G.GATE_PERIOD;
      return k > 1 - G.GATE_WARN / G.GATE_PERIOD;
    }

    /** Colisión en el plano (x, z) contra la hitbox del auto. */
    hits(p, distance, time) {
      if (this.destroyed) return false;
      const z0 = this.pos - distance;
      const z1 = z0 + this.depth;
      if (z1 < -p.halfD || z0 > p.halfD) return false;
      if (Math.abs(this.x - p.x) >= this.halfW + p.halfW) return false;
      return this.isOn(time);
    }

    drawGround(ctx, cam, distance, time) {
      if (this.type !== 'field' || this.destroyed) return;
      const zEnd = this.pos - distance;
      const zStart = zEnd - FIELD_WARNING;
      if (zStart > G.FAR || zEnd < cam.zNear) return;
      const xa = this.x - this.halfW;
      const xb = this.x + this.halfW;
      const pulse = 0.5 + 0.5 * Math.sin(time * 8);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = C.pink;
      for (let z = Math.max(zStart, cam.zNear); z < zEnd; z += 1.5) {
        const fade = clamp((G.FAR - z) / 16, 0, 1);
        ctx.globalAlpha = (0.14 + pulse * 0.12) * fade;
        const y0 = cam.groundY(z), y1 = cam.groundY(z + 0.5);
        ctx.beginPath();
        ctx.moveTo(cam.sx(xa, z), y0);
        ctx.lineTo(cam.sx(xb, z), y0);
        ctx.lineTo(cam.sx(xb, z + 0.5), y1);
        ctx.lineTo(cam.sx(xa, z + 0.5), y1);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    draw(ctx, cam, distance, time) {
      if (this.destroyed) return;
      const z0 = this.pos - distance;
      const alpha = clamp((G.FAR - z0) / (G.FAR - G.FADE_START), 0, 1) * this.fade;
      if (alpha <= 0) return;
      ctx.save();
      ctx.globalAlpha = alpha;
      switch (this.type) {
        case 'block': drawBlock(ctx, cam, this, z0, time); break;
        case 'field': drawField(ctx, cam, this, z0, time); break;
        case 'gate': drawGate(ctx, cam, this, z0, time); break;
      }
      ctx.restore();
    }
  }

  /**
   * Tráfico: su posición avanza una fracción fija de lo que avanza el jugador,
   * así el punto de encuentro (`meet`) es exacto aunque se use nitro o freno.
   */
  class Traffic extends Obstacle {
    constructor(lane, meet, distance, switchTo = null) {
      const f = G.TRAFFIC_SPEED;
      // pos(d) = start + f (d - d0) ; encuentro cuando d = pos => d = meet
      const start = meet * (1 - f) + f * distance;
      super('traffic', lane, start);
      this.start = start;
      this.d0 = distance;
      this.meet = meet;
      this.lane = lane;
      this.switchTo = switchTo;
      this.signalT = -1;  // >= 0 cuando el intermitente está encendido
      this.moveT = -1;    // >= 0 durante el cambio de carril
      this.colors = TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)];
      this.fade = 0;
      this.wheel = Math.random();
    }

    update(dt, distance, speed) {
      this.pos = this.start + G.TRAFFIC_SPEED * (distance - this.d0);
      this.fade = Math.min(1, this.fade + dt * 2.5);
      this.wheel += dt * speed * G.TRAFFIC_SPEED * 3;

      if (this.switchTo == null) return;
      const z = this.pos - distance;
      const lead = (1 - G.TRAFFIC_SPEED) * speed * G.TRAFFIC_SWITCH_LEAD;
      if (this.signalT < 0 && z < lead) this.signalT = 0;
      if (this.signalT >= 0 && this.moveT < 0) {
        this.signalT += dt;
        if (this.signalT >= G.TRAFFIC_SIGNAL) this.moveT = 0;
      }
      if (this.moveT >= 0 && this.moveT < G.TRAFFIC_SWITCH_TIME) {
        this.moveT = Math.min(G.TRAFFIC_SWITCH_TIME, this.moveT + dt);
        const k = this.moveT / G.TRAFFIC_SWITCH_TIME;
        const e = k * k * (3 - 2 * k);
        this.x = NR.laneX(this.lane) + (NR.laneX(this.switchTo) - NR.laneX(this.lane)) * e;
      }
    }

    get indicator() {
      if (this.switchTo == null || this.signalT < 0) return 0;
      if (this.moveT >= G.TRAFFIC_SWITCH_TIME) return 0;
      return this.switchTo < this.lane ? -1 : 1;
    }

    draw(ctx, cam, distance, time) {
      if (this.destroyed) return;
      const z = this.pos - distance;
      const alpha = clamp((G.FAR - z) / (G.FAR - G.FADE_START), 0, 1) * this.fade;
      if (alpha <= 0 || z < cam.zNear - 1) return;
      const u = cam.scale(z);
      NR.CarRenderer.draw(ctx, cam.sx(this.x, z), cam.groundY(z), u, 'traffic', this.colors, {
        wheel: this.wheel, time, alpha, indicator: this.indicator, brake: 0.3,
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Dibujo por tipo                                                    */
  /* ------------------------------------------------------------------ */

  function glowLine(ctx, points, color, width) {
    ctx.strokeStyle = color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.3;
    ctx.lineWidth = width * 4;
    ctx.beginPath();
    points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.globalAlpha = a;
    ctx.lineWidth = width;
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  /** Barricada tecnológica. */
  function drawBlock(ctx, cam, o, z, time) {
    const x0 = o.x - o.halfW, x1 = o.x + o.halfW;
    const r = drawBox(ctx, cam, { x0, x1, y0: 0, y1: 1.1, z0: z, z1: z + o.depth },
      { front: '#141b38', top: '#232c55', side: '#0b1026', edge: 'rgba(255,54,200,0.9)', edgeWidth: 1.5 });
    const w = r.right - r.left;
    const h = r.bottom - r.top;
    if (w < 10) return;

    ctx.strokeStyle = 'rgba(146,155,181,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(r.left + 2, r.top + h * 0.5);
    ctx.lineTo(r.right - 2, r.top + h * 0.5);
    ctx.stroke();

    // Franja de peligro.
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.left, r.bottom - h * 0.3, w, h * 0.2);
    ctx.clip();
    ctx.fillStyle = '#2a0f2a';
    ctx.fillRect(r.left, r.bottom - h * 0.3, w, h * 0.2);
    ctx.fillStyle = C.pink;
    const stripe = Math.max(4, w * 0.12);
    for (let x = r.left - h * 0.2; x < r.right; x += stripe * 2) {
      ctx.beginPath();
      ctx.moveTo(x, r.bottom - h * 0.1);
      ctx.lineTo(x + stripe, r.bottom - h * 0.1);
      ctx.lineTo(x + stripe + h * 0.2, r.bottom - h * 0.3);
      ctx.lineTo(x + h * 0.2, r.bottom - h * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Núcleo pulsante.
    const pulse = 0.6 + 0.4 * Math.sin(time * 4 + o.phase);
    const cw = w * 0.34, ch = h * 0.18;
    const cx = (r.left + r.right) / 2 - cw / 2;
    const cy = r.top + h * 0.18;
    ctx.save();
    ctx.globalAlpha *= pulse;
    ctx.shadowColor = C.pink;
    ctx.shadowBlur = w * 0.25;
    ctx.fillStyle = C.pink;
    ctx.fillRect(cx, cy, cw, ch);
    ctx.restore();
    ctx.fillStyle = C.pink;
    ctx.fillRect(r.left, r.top, w, Math.max(1.5, h * 0.025));
  }

  /** Campo de energía: muro translúcido. */
  function drawField(ctx, cam, o, z, time) {
    const x0 = o.x - o.halfW, x1 = o.x + o.halfW;
    const zm = z + o.depth / 2;
    const s = cam.scale(zm);
    const left = cam.sx(x0, zm), right = cam.sx(x1, zm);
    const top = cam.sy(1.8, zm), bottom = cam.groundY(zm);
    const h = bottom - top;

    ctx.globalCompositeOperation = 'lighter';
    const a = ctx.globalAlpha;
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, 'rgba(139,92,246,0.05)');
    g.addColorStop(1, 'rgba(255,54,200,0.34)');
    ctx.fillStyle = g;
    ctx.fillRect(left, top, right - left, h);

    ctx.fillStyle = C.pink;
    for (let i = 0; i < 6; i++) {
      const k = (time * 0.6 + i / 6 + o.phase) % 1;
      ctx.globalAlpha = a * 0.35 * (1 - k);
      ctx.fillRect(left, bottom - h * k, right - left, Math.max(1, s * 0.02));
    }
    ctx.globalAlpha = a * 0.18;
    ctx.strokeStyle = C.pink;
    ctx.lineWidth = 1;
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, h);
    ctx.clip();
    ctx.beginPath();
    const step = Math.max(6, s * 0.25);
    for (let x = left - h; x < right; x += step) {
      ctx.moveTo(x, bottom);
      ctx.lineTo(x + h, top);
    }
    ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'source-over';

    for (const px of [x0 - 0.05, x1 - 0.05]) {
      drawBox(ctx, cam, { x0: px, x1: px + 0.1, y0: 0, y1: 1.8, z0: z, z1: z + o.depth },
        { front: '#251238', side: '#160a24', edge: C.pink, edgeWidth: 1 });
    }
    glowLine(ctx, [[left, top], [right, top]], C.pink, Math.max(1, s * 0.02));
  }

  /** Compuerta láser: rojo/rosa = encendida, verde = paso libre. */
  function drawGate(ctx, cam, o, z, time) {
    const x0 = o.x - o.halfW, x1 = o.x + o.halfW;
    const zm = z + o.depth / 2;
    const s = cam.scale(zm);
    const on = o.isOn(time);
    const warn = o.warning(time);

    for (const px of [x0 - 0.05, x1 - 0.05]) {
      drawBox(ctx, cam, { x0: px, x1: px + 0.1, y0: 0, y1: 1.3, z0: z, z1: z + o.depth },
        { front: '#1a1f45', side: '#0d1130', edge: 'rgba(139,92,246,0.8)', edgeWidth: 1 });
    }
    const r = drawBox(ctx, cam, { x0: x0 - 0.05, x1: x1 + 0.05, y0: 1.15, y1: 1.35, z0: z, z1: z + o.depth },
      { front: '#1b1640', top: '#2a2260', side: '#100c2a' });

    // Luz de estado en la viga.
    const status = on ? C.pink : warn ? (Math.sin(time * 40) > 0 ? '#FFB020' : C.green) : C.green;
    ctx.save();
    ctx.shadowColor = status;
    ctx.shadowBlur = s * 0.2;
    ctx.fillStyle = status;
    const lw = (r.right - r.left) * 0.5;
    ctx.fillRect((r.left + r.right) / 2 - lw / 2, r.top + (r.bottom - r.top) * 0.35, lw, Math.max(1.5, (r.bottom - r.top) * 0.3));
    ctx.restore();

    const left = cam.sx(x0, zm), right = cam.sx(x1, zm);
    if (on || warn) {
      const a = ctx.globalAlpha;
      if (warn && !on) ctx.globalAlpha = a * (Math.sin(time * 40) > 0 ? 0.45 : 0.1);
      for (const hgt of [0.15, 0.4, 0.65, 0.9]) {
        const y = cam.sy(hgt + Math.sin(time * 30 + hgt * 9 + o.phase) * 0.012, zm);
        glowLine(ctx, [[left, y], [right, y]], hgt === 0.4 ? C.white : C.pink, Math.max(1, s * 0.025));
      }
      if (on) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.12;
        ctx.fillStyle = C.pink;
        ctx.fillRect(left, cam.sy(1.15, zm), right - left, cam.groundY(zm) - cam.sy(1.15, zm));
        ctx.globalCompositeOperation = 'source-over';
      }
      ctx.globalAlpha = a;
    } else {
      // Apagada: guías tenues verdes.
      ctx.globalAlpha *= 0.35;
      ctx.strokeStyle = C.green;
      ctx.setLineDash([4, 6]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const hgt of [0.4, 0.9]) {
        const y = cam.sy(hgt, zm);
        ctx.moveTo(left, y);
        ctx.lineTo(right, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  NR.Obstacle = Obstacle;
  NR.Traffic = Traffic;
  NR.OBSTACLE_TYPES = TYPES;
})(window.NR);
