/**
 * NEON RUSH — Auto del jugador + renderizador de autos (vista trasera).
 *
 * La hitbox es IDÉNTICA para todos los modelos: los autos son cosméticos.
 * Física independiente de los FPS (todo escalado por dt).
 *
 * CarRenderer.draw(ctx, x, y, u, model, colors, state) dibuja cualquier auto
 * (jugador, tráfico, garaje y miniaturas de la tienda) con el mismo código.
 * (x, y) = punto del suelo bajo el centro de la trasera; u = píxeles por unidad.
 */
(function (NR) {
  'use strict';

  const G = NR.CONFIG.GAME;
  const { clamp } = NR.util;

  const laneX = (lane) => (lane - (G.LANES - 1) / 2) * G.LANE_WIDTH;
  const HALF_W = 0.38;

  /* ================================================================== */
  /* Auto del jugador                                                    */
  /* ================================================================== */

  class Car {
    constructor() {
      this.reset({});
    }

    reset({ car = 'neo', paint = 'factory', trail = 'stream', effect = 'none' }) {
      const def = NR.CATALOG.find('cars', car) || NR.CATALOG.CARS[0];
      this.model = def.model;
      this.colors = NR.CATALOG.resolveColors(def.id, paint);
      this.trail = NR.CATALOG.find('trails', trail) || NR.CATALOG.TRAILS[0];
      this.effect = effect;

      this.lane = 1;
      this.x = laneX(this.lane);
      this.tilt = 0;
      this.wheel = 0;
      this.nitroMeter = 0;
      this.nitroT = 0;
      this.brakeHeld = false;
      this.brakePulse = 0;
      this.heat = 0;
      this.overheated = false;
      this.dead = false;
      this.spin = 0;
      this.spinV = 0;
      this.history = []; // posiciones pasadas para la estela
    }

    get braking() {
      return !this.dead && !this.overheated && (this.brakeHeld || this.brakePulse > 0);
    }

    get nitroActive() { return this.nitroT > 0; }
    get nitroReady() { return this.nitroMeter >= 1 && !this.nitroActive; }

    move(dir) {
      if (this.dead) return false;
      const next = this.lane + dir;
      if (next < 0 || next >= G.LANES) return false;
      this.lane = next;
      return true;
    }

    nitro() {
      if (this.dead || !this.nitroReady) return false;
      this.nitroT = G.NITRO_DURATION;
      this.nitroMeter = 0;
      return true;
    }

    addNitro(amount) {
      if (!this.nitroActive) this.nitroMeter = Math.min(1, this.nitroMeter + amount);
    }

    setBrake(on) {
      this.brakeHeld = on;
    }

    pulseBrake() {
      this.brakePulse = G.BRAKE_PULSE;
    }

    update(dt, speed, distance) {
      const target = laneX(this.lane);
      const prevX = this.x;
      this.x += (target - this.x) * Math.min(1, dt * G.LANE_CHANGE_RATE);
      if (Math.abs(target - this.x) < 0.002) this.x = target;
      const vx = dt > 0 ? (this.x - prevX) / dt : 0;
      this.tilt += (clamp(vx * 0.04, -0.22, 0.22) - this.tilt) * Math.min(1, dt * 12);
      this.wheel += dt * speed * 3;

      if (this.nitroT > 0) this.nitroT = Math.max(0, this.nitroT - dt);
      if (this.brakePulse > 0) this.brakePulse = Math.max(0, this.brakePulse - dt);

      // Freno limitado por temperatura: no se puede frenar indefinidamente.
      if (this.braking) {
        this.nitroT = 0; // frenar cancela el nitro
        this.heat = Math.min(1, this.heat + dt * G.BRAKE_HEAT_RATE);
        if (this.heat >= 1) this.overheated = true;
      } else {
        this.heat = Math.max(0, this.heat - dt * G.BRAKE_COOL_RATE);
        if (this.overheated && this.heat <= G.BRAKE_RECOVER) this.overheated = false;
      }

      if (this.dead) {
        this.spin += this.spinV * dt;
        this.spinV *= Math.pow(0.4, dt);
      }

      // Historial para la estela (se descartan muestras lejanas).
      this.history.push({ x: this.x, d: distance });
      while (this.history.length > 2 && distance - this.history[0].d > 4) this.history.shift();
    }

    crash() {
      this.dead = true;
      this.nitroT = 0;
      this.spinV = (Math.random() < 0.5 ? -1 : 1) * 7;
    }

    hitbox() {
      const t = G.HIT_TOLERANCE;
      return { x: this.x, halfW: HALF_W - t, halfD: G.CAR_HALF_D - t };
    }

    /** Dibuja estela + auto. `zRear` = profundidad de la trasera. */
    draw(ctx, cam, time, { glitch = 0, shield = 0, magnet = 0, mult = 0 } = {}) {
      const zRear = -0.45;
      const u = cam.scale(zRear);
      const x = cam.sx(this.x, zRear);
      const y = cam.groundY(zRear);

      this._drawTrail(ctx, cam, time);

      const state = {
        wheel: this.wheel, tilt: this.tilt + this.spin, time,
        brake: this.braking ? 1 : 0, nitro: this.nitroActive ? 1 : 0,
        effect: this.effect, glitch, bounce: this.dead ? 0 : Math.sin(time * 38) * 0.004,
      };
      CarRenderer.draw(ctx, x, y, u, this.model, this.colors, state);

      if (magnet > 0) drawMagnetField(ctx, x, y, u, time, magnet);
      if (mult > 0) drawMultAura(ctx, x, y, u, time, mult);
      if (shield > 0) drawShield(ctx, x, y, u, time, shield);
    }

    _drawTrail(ctx, cam, time) {
      const h = this.history;
      if (h.length < 2 || this.dead) return;
      const latest = h[h.length - 1].d;
      const colors = this.trail.colors;
      const u = cam.scale(-0.45);
      const y0 = cam.sy(0.08, -0.45);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'round';
      colors.forEach((color, ci) => {
        // Un único trazo continuo por lado (sin "cuentas" por solapamiento).
        const grad = ctx.createLinearGradient(0, y0, 0, cam.h);
        grad.addColorStop(0, color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = grad;
        ctx.globalAlpha = 0.75 / Math.sqrt(colors.length);
        ctx.lineWidth = Math.max(2, u * 0.06);
        const spread = (ci - (colors.length - 1) / 2) * 0.06;
        for (const side of [-1, 1]) {
          ctx.beginPath();
          let started = false;
          for (let i = h.length - 1; i >= 0; i--) {
            const z = -0.45 - (latest - h[i].d) * 1.4;
            if (z < cam.zNear - 0.4) break;
            const px = cam.sx(h[i].x + side * 0.3 + spread, z);
            const py = cam.sy(0.08, z);
            if (started) ctx.lineTo(px, py);
            else { ctx.moveTo(px, py); started = true; }
          }
          ctx.stroke();
        }
      });
      ctx.restore();
    }
  }

  /* ================================================================== */
  /* Efectos de power-ups alrededor del auto                            */
  /* ================================================================== */

  function drawShield(ctx, x, y, u, time, remaining) {
    const blink = remaining < 1.2 ? (Math.sin(time * 28) > 0 ? 1 : 0.35) : 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.9 * blink;
    const cx = x, cy = y - u * 0.3;
    const g = ctx.createRadialGradient(cx, cy, u * 0.2, cx, cy, u * 0.7);
    g.addColorStop(0, 'rgba(0,217,255,0)');
    g.addColorStop(0.8, 'rgba(0,217,255,0.18)');
    g.addColorStop(1, 'rgba(0,217,255,0.5)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, u * 0.68, u * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    // Hexágonos que recorren la burbuja.
    ctx.strokeStyle = '#00D9FF';
    ctx.lineWidth = Math.max(1, u * 0.012);
    for (let i = 0; i < 6; i++) {
      const a = time * 1.5 + (i / 6) * Math.PI * 2;
      const hx = cx + Math.cos(a) * u * 0.5;
      const hy = cy + Math.sin(a) * u * 0.32;
      hexPath(ctx, hx, hy, u * 0.07);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMagnetField(ctx, x, y, u, time, remaining) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#8B5CF6';
    ctx.lineWidth = Math.max(1, u * 0.02);
    for (let i = 0; i < 3; i++) {
      const k = (time * 1.2 + i / 3) % 1;
      ctx.globalAlpha = (1 - k) * 0.6 * (remaining < 1.2 && Math.sin(time * 28) < 0 ? 0.3 : 1);
      ctx.beginPath();
      ctx.ellipse(x, y - u * 0.05, u * (0.5 + k * 0.9), u * (0.12 + k * 0.22), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawMultAura(ctx, x, y, u, time, remaining) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.35 + 0.2 * Math.sin(time * 6)) * (remaining < 1.2 && Math.sin(time * 28) < 0 ? 0.3 : 1);
    ctx.fillStyle = '#FF36C8';
    ctx.font = `900 ${Math.round(u * 0.22)}px Orbitron, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('x2', x, y - u * 0.82 - Math.sin(time * 4) * u * 0.03);
    ctx.restore();
  }

  function hexPath(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
  }

  /* ================================================================== */
  /* Renderizador                                                       */
  /* ================================================================== */

  const EXHAUSTS = {
    formula: [[0, 0.1]],
    gt: [[-0.13, 0.09], [0.13, 0.09]],
    hyper: [[-0.06, 0.1], [0.06, 0.1]],
    proto: [[0, 0.08]],
    muscle: [[-0.3, 0.07], [0.3, 0.07]],
    traffic: [],
  };

  const CarRenderer = {
    /**
     * @param state wheel, tilt, time, brake (0-1), nitro (0-1), effect, glitch,
     *              bounce, indicator (-1/0/1), alpha
     */
    draw(ctx, x, y, u, model, colors, state = {}) {
      const s = Object.assign({ wheel: 0, tilt: 0, time: 0, brake: 0, nitro: 0, effect: 'none', glitch: 0, bounce: 0, indicator: 0 }, state);
      ctx.save();
      if (s.alpha != null) ctx.globalAlpha *= s.alpha;

      // Sombra y efectos bajo el auto.
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(x, y, u * 0.52, u * 0.09, 0, 0, Math.PI * 2);
      ctx.fill();
      if (s.effect === 'underglow') {
        const g = ctx.createRadialGradient(x, y, 0, x, y, u * 0.7);
        g.addColorStop(0, colors.accent);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha *= 0.55 + 0.15 * Math.sin(s.time * 5);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(x, y, u * 0.75, u * 0.16, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.translate(x, y - s.bounce * u);
      ctx.rotate(s.tilt);

      if (s.glitch > 0) {
        const off = u * 0.1 * s.glitch;
        const a = ctx.globalAlpha;
        ctx.globalAlpha = a * 0.55 * s.glitch;
        this._model(ctx, u, model, tintColors('#FF36C8'), s, -off);
        this._model(ctx, u, model, tintColors('#00D9FF'), s, off);
        ctx.globalAlpha = a;
      }
      this._model(ctx, u, model, colors, s, 0);

      // Llama del nitro en los escapes.
      if (s.nitro > 0) {
        ctx.globalCompositeOperation = 'lighter';
        for (const [ex, ey] of EXHAUSTS[model] || []) {
          const r = u * (0.07 + Math.random() * 0.05);
          const g = ctx.createRadialGradient(ex * u, -ey * u, 0, ex * u, -ey * u, r * 2);
          g.addColorStop(0, '#ffffff');
          g.addColorStop(0.35, '#7fe9ff');
          g.addColorStop(1, 'rgba(139,92,246,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(ex * u, -ey * u, r * 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
      }

      if (s.effect === 'aura') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = colors.accent;
        ctx.globalAlpha *= 0.4 + 0.3 * Math.sin(s.time * 4);
        ctx.lineWidth = Math.max(1, u * 0.015);
        ctx.beginPath();
        ctx.ellipse(0, -u * 0.3, u * 0.58, u * 0.4, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      if (s.effect === 'sparks' && s.time) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = '#FFD23F';
        ctx.lineWidth = Math.max(1, u * 0.012);
        for (let i = 0; i < 6; i++) {
          const k = (s.time * 7 + i * 0.37) % 1;
          const side = i % 2 ? 1 : -1;
          ctx.globalAlpha = (1 - k) * 0.8;
          ctx.beginPath();
          ctx.moveTo(x + side * u * 0.3, y);
          ctx.lineTo(x + side * u * (0.34 + k * 0.3), y + k * u * 0.2);
          ctx.stroke();
        }
        ctx.restore();
      }
    },

    _model(ctx, u, model, c, s, offX) {
      ctx.save();
      ctx.translate(offX, 0);
      if (model === 'formula') drawFormula(ctx, u, c, s);
      else if (model === 'hyper') drawHyper(ctx, u, c, s);
      else if (model === 'proto') drawProto(ctx, u, c, s);
      else if (model === 'muscle') drawMuscle(ctx, u, c, s);
      else drawGT(ctx, u, c, s, model === 'traffic');
      ctx.restore();
    },
  };

  function tintColors(t) {
    return { body: t, body2: t, accent: t, dark: t, light: t };
  }

  /* ---------------- Primitivas ---------------- */

  function poly(ctx, u, pts, fill) {
    ctx.fillStyle = fill;
    ctx.beginPath();
    pts.forEach(([px, py], i) => (i ? ctx.lineTo(px * u, -py * u) : ctx.moveTo(px * u, -py * u)));
    ctx.closePath();
    ctx.fill();
  }

  function rect(ctx, u, x0, y0, x1, y1, fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(x0 * u, -y1 * u, (x1 - x0) * u, (y1 - y0) * u);
  }

  function light(ctx, u, x0, y0, x1, y1, color, intensity) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = u * (0.08 + intensity * 0.22);
    ctx.globalAlpha *= 0.55 + intensity * 0.45;
    rect(ctx, u, x0, y0, x1, y1, color);
    ctx.restore();
  }

  /** Neumático con volumen (degradado cilíndrico) y rodadura sutil animada. */
  function wheel(ctx, u, cx, w, h, phase) {
    const x0 = (cx - w / 2) * u, y0 = -h * u, ww = w * u, hh = h * u;
    const g = ctx.createLinearGradient(x0, 0, x0 + ww, 0);
    g.addColorStop(0, '#05060a');
    g.addColorStop(0.35, '#22263a');
    g.addColorStop(0.65, '#121521');
    g.addColorStop(1, '#040508');
    ctx.fillStyle = g;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x0, y0, ww, hh, Math.min(ww, hh) * 0.28);
    else ctx.rect(x0, y0, ww, hh);
    ctx.fill();
    // Rodadura: líneas finas que se desplazan (sensación de giro).
    ctx.save();
    ctx.clip();
    ctx.globalAlpha *= 0.35;
    ctx.fillStyle = '#3a4060';
    const step = h / 5;
    const off = (phase % 1) * step;
    for (let yy = off; yy < h; yy += step) {
      ctx.fillRect(x0, -(yy + step * 0.12) * u, ww, Math.max(1, step * 0.12 * u));
    }
    ctx.restore();
  }

  /** Relleno con degradado vertical (luz arriba, sombra abajo). */
  function shade(ctx, u, top, bottom, c1, c2) {
    const g = ctx.createLinearGradient(0, -top * u, 0, -bottom * u);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    return g;
  }

  /* ---------------- Modelos ---------------- */

  function drawFormula(ctx, u, c, s) {
    const brake = s.brake;
    // Neumáticos traseros grandes.
    wheel(ctx, u, -0.33, 0.17, 0.3, s.wheel);
    wheel(ctx, u, 0.33, 0.17, 0.3, s.wheel);
    // Suspensión (brazos hacia las ruedas).
    ctx.strokeStyle = c.dark;
    ctx.lineWidth = Math.max(1, u * 0.018);
    ctx.beginPath();
    ctx.moveTo(-0.13 * u, -0.2 * u); ctx.lineTo(-0.26 * u, -0.17 * u);
    ctx.moveTo(-0.13 * u, -0.1 * u); ctx.lineTo(-0.26 * u, -0.12 * u);
    ctx.moveTo(0.13 * u, -0.2 * u); ctx.lineTo(0.26 * u, -0.17 * u);
    ctx.moveTo(0.13 * u, -0.1 * u); ctx.lineTo(0.26 * u, -0.12 * u);
    ctx.stroke();
    // Pontones.
    const pod = shade(ctx, u, 0.27, 0.1, c.body2, c.dark);
    poly(ctx, u, [[-0.24, 0.1], [-0.12, 0.1], [-0.12, 0.27], [-0.22, 0.23]], pod);
    poly(ctx, u, [[0.24, 0.1], [0.12, 0.1], [0.12, 0.27], [0.22, 0.23]], pod);
    // Difusor con aletas.
    poly(ctx, u, [[-0.22, 0.03], [0.22, 0.03], [0.17, 0.15], [-0.17, 0.15]], c.dark);
    ctx.strokeStyle = 'rgba(146,155,181,0.35)';
    ctx.lineWidth = Math.max(1, u * 0.008);
    ctx.beginPath();
    for (const fx of [-0.1, -0.03, 0.03, 0.1]) {
      ctx.moveTo(fx * u, -0.04 * u);
      ctx.lineTo(fx * u * 0.85, -0.14 * u);
    }
    ctx.stroke();
    // Cubierta del motor.
    poly(ctx, u, [[-0.13, 0.12], [0.13, 0.12], [0.08, 0.36], [0, 0.43], [-0.08, 0.36]], shade(ctx, u, 0.43, 0.12, c.body, c.body2));
    rect(ctx, u, -0.018, 0.14, 0.018, 0.4, c.accent);
    // Casco del piloto.
    ctx.fillStyle = c.accent;
    ctx.beginPath();
    ctx.arc(0, -0.45 * u, 0.055 * u, 0, Math.PI * 2);
    ctx.fill();
    // Escape y luz de lluvia (parpadea; se intensifica al frenar).
    ctx.fillStyle = '#05060a';
    ctx.beginPath();
    ctx.arc(0, -0.1 * u, 0.025 * u, 0, Math.PI * 2);
    ctx.fill();
    const blink = brake ? 1 : (Math.sin(s.time * 10) > 0 ? 0.5 : 0.15);
    light(ctx, u, -0.035, 0.15, 0.035, 0.2, c.light, blink);
    // Alerón trasero.
    rect(ctx, u, -0.32, 0.26, -0.29, 0.57, c.dark);
    rect(ctx, u, 0.29, 0.26, 0.32, 0.57, c.dark);
    rect(ctx, u, -0.31, 0.4, 0.31, 0.445, c.dark);
    rect(ctx, u, -0.32, 0.47, 0.32, 0.55, shade(ctx, u, 0.55, 0.47, c.body, c.body2));
    rect(ctx, u, -0.32, 0.535, 0.32, 0.55, c.accent);
    rect(ctx, u, -0.32, 0.26, -0.305, 0.57, c.accent);
    rect(ctx, u, 0.305, 0.26, 0.32, 0.57, c.accent);
  }

  function drawGT(ctx, u, c, s, traffic) {
    const brake = s.brake;
    wheel(ctx, u, -0.33, 0.16, 0.17, s.wheel);
    wheel(ctx, u, 0.33, 0.16, 0.17, s.wheel);
    // Carrocería.
    poly(ctx, u, [[-0.44, 0.07], [0.44, 0.07], [0.45, 0.3], [0.38, 0.36], [-0.38, 0.36], [-0.45, 0.3]], shade(ctx, u, 0.36, 0.07, c.body, c.body2));
    poly(ctx, u, [[-0.45, 0.07], [-0.3, 0.07], [-0.32, 0.3], [-0.45, 0.3]], c.body2);
    // Habitáculo y luna trasera.
    poly(ctx, u, [[-0.34, 0.36], [0.34, 0.36], [0.25, 0.58], [-0.25, 0.58]], c.body2);
    const glass = ctx.createLinearGradient(0, -0.58 * u, 0, -0.38 * u);
    glass.addColorStop(0, '#2b3557');
    glass.addColorStop(1, '#0a0e1d');
    poly(ctx, u, [[-0.28, 0.38], [0.28, 0.38], [0.21, 0.54], [-0.21, 0.54]], glass);
    ctx.strokeStyle = 'rgba(245,247,255,0.25)';
    ctx.lineWidth = Math.max(1, u * 0.01);
    ctx.beginPath();
    ctx.moveTo(-0.15 * u, -0.52 * u);
    ctx.lineTo(-0.05 * u, -0.4 * u);
    ctx.stroke();
    // Franjas de carreras opcionales (skins).
    if (c.stripe && !traffic) {
      rect(ctx, u, -0.11, 0.07, -0.05, 0.36, c.stripe);
      rect(ctx, u, 0.05, 0.07, 0.11, 0.36, c.stripe);
    }
    // Spoiler.
    rect(ctx, u, -0.41, 0.35, 0.41, 0.385, traffic ? c.body2 : c.accent);
    // Difusor y escapes.
    rect(ctx, u, -0.36, 0.04, 0.36, 0.12, c.dark);
    ctx.fillStyle = '#05060a';
    for (const ex of [-0.13, 0.13]) {
      ctx.beginPath();
      ctx.arc(ex * u, -0.09 * u, 0.03 * u, 0, Math.PI * 2);
      ctx.fill();
    }
    // Faros traseros (tira completa).
    light(ctx, u, -0.43, 0.25, 0.43, 0.29, c.light, brake ? 1 : 0.35);
    // Intermitentes (tráfico que va a cambiar de carril).
    if (s.indicator) {
      const on = Math.sin(s.time * 18) > 0;
      if (on) light(ctx, u, s.indicator < 0 ? -0.45 : 0.33, 0.2, s.indicator < 0 ? -0.33 : 0.45, 0.31, '#FFB020', 1);
    }
  }

  function drawHyper(ctx, u, c, s) {
    const brake = s.brake;
    wheel(ctx, u, -0.36, 0.17, 0.19, s.wheel);
    wheel(ctx, u, 0.36, 0.17, 0.19, s.wheel);
    poly(ctx, u, [[-0.46, 0.06], [0.46, 0.06], [0.44, 0.28], [0.2, 0.35], [-0.2, 0.35], [-0.44, 0.28]], shade(ctx, u, 0.35, 0.06, c.body, c.body2));
    poly(ctx, u, [[-0.46, 0.06], [-0.32, 0.06], [-0.3, 0.27], [-0.44, 0.28]], c.body2);
    // Cabina.
    const glass = ctx.createLinearGradient(0, -0.5 * u, 0, -0.35 * u);
    glass.addColorStop(0, '#2b2347');
    glass.addColorStop(1, '#09060f');
    poly(ctx, u, [[-0.2, 0.35], [0.2, 0.35], [0.13, 0.49], [-0.13, 0.49]], glass);
    // Aleta central.
    rect(ctx, u, -0.012, 0.35, 0.012, 0.56, c.body2);
    // Alerón.
    rect(ctx, u, -0.42, 0.3, -0.39, 0.6, c.dark);
    rect(ctx, u, 0.39, 0.3, 0.42, 0.6, c.dark);
    rect(ctx, u, -0.43, 0.53, 0.43, 0.6, c.dark);
    rect(ctx, u, -0.43, 0.585, 0.43, 0.6, c.accent);
    // Difusor grande.
    rect(ctx, u, -0.38, 0.03, 0.38, 0.13, c.dark);
    ctx.strokeStyle = 'rgba(146,155,181,0.3)';
    ctx.lineWidth = Math.max(1, u * 0.008);
    ctx.beginPath();
    for (const fx of [-0.24, -0.12, 0.12, 0.24]) {
      ctx.moveTo(fx * u, -0.03 * u);
      ctx.lineTo(fx * u, -0.13 * u);
    }
    ctx.stroke();
    // Faros en forma de flecha.
    ctx.save();
    ctx.shadowColor = c.light;
    ctx.shadowBlur = u * (brake ? 0.3 : 0.12);
    ctx.globalAlpha *= brake ? 1 : 0.7;
    ctx.strokeStyle = c.light;
    ctx.lineWidth = Math.max(1.5, u * 0.03);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-0.42 * u, -0.2 * u); ctx.lineTo(-0.12 * u, -0.25 * u);
    ctx.moveTo(0.42 * u, -0.2 * u); ctx.lineTo(0.12 * u, -0.25 * u);
    ctx.stroke();
    ctx.restore();
    // Línea de acento y franja central opcional.
    rect(ctx, u, -0.2, 0.335, 0.2, 0.35, c.accent);
    if (c.stripe) rect(ctx, u, -0.05, 0.13, 0.05, 0.335, c.stripe);
  }

  /** Prototipo de resistencia: cabina cerrada, aleta de tiburón y gran alerón. */
  function drawProto(ctx, u, c, s) {
    const brake = s.brake;
    wheel(ctx, u, -0.35, 0.17, 0.2, s.wheel);
    wheel(ctx, u, 0.35, 0.17, 0.2, s.wheel);
    poly(ctx, u, [[-0.47, 0.05], [0.47, 0.05], [0.46, 0.24], [0.3, 0.3], [-0.3, 0.3], [-0.46, 0.24]],
      shade(ctx, u, 0.3, 0.05, c.body, c.body2));
    // Cúpula de la cabina.
    const glass = ctx.createLinearGradient(0, -0.46 * u, 0, -0.3 * u);
    glass.addColorStop(0, '#2b3557');
    glass.addColorStop(1, '#090c18');
    ctx.fillStyle = glass;
    ctx.beginPath();
    ctx.moveTo(-0.17 * u, -0.3 * u);
    ctx.quadraticCurveTo(0, -0.52 * u, 0.17 * u, -0.3 * u);
    ctx.closePath();
    ctx.fill();
    if (c.stripe) rect(ctx, u, -0.06, 0.12, 0.06, 0.3, c.stripe);
    // Aleta de tiburón.
    poly(ctx, u, [[-0.014, 0.3], [0.014, 0.3], [0, 0.6]], c.body2);
    // Alerón con derivas altas.
    rect(ctx, u, -0.46, 0.2, -0.43, 0.6, c.dark);
    rect(ctx, u, 0.43, 0.2, 0.46, 0.6, c.dark);
    rect(ctx, u, -0.46, 0.5, 0.46, 0.57, shade(ctx, u, 0.57, 0.5, c.body, c.body2));
    rect(ctx, u, -0.46, 0.565, 0.46, 0.58, c.accent);
    // Difusor.
    rect(ctx, u, -0.4, 0.03, 0.4, 0.11, c.dark);
    ctx.fillStyle = '#05060a';
    ctx.beginPath();
    ctx.arc(0, -0.08 * u, 0.03 * u, 0, Math.PI * 2);
    ctx.fill();
    // Barra de luz completa.
    light(ctx, u, -0.44, 0.19, 0.44, 0.215, c.light, brake ? 1 : 0.45);
  }

  /** Muscle car clásico: carrocería ancha, parachoques cromado y franjas dobles. */
  function drawMuscle(ctx, u, c, s) {
    const brake = s.brake;
    wheel(ctx, u, -0.36, 0.19, 0.2, s.wheel);
    wheel(ctx, u, 0.36, 0.19, 0.2, s.wheel);
    poly(ctx, u, [[-0.46, 0.08], [0.46, 0.08], [0.46, 0.34], [0.43, 0.37], [-0.43, 0.37], [-0.46, 0.34]],
      shade(ctx, u, 0.37, 0.08, c.body, c.body2));
    // Cabina.
    poly(ctx, u, [[-0.33, 0.37], [0.33, 0.37], [0.26, 0.56], [-0.26, 0.56]], c.body2);
    const glass = ctx.createLinearGradient(0, -0.54 * u, 0, -0.39 * u);
    glass.addColorStop(0, '#2b3557');
    glass.addColorStop(1, '#0a0e1d');
    poly(ctx, u, [[-0.27, 0.39], [0.27, 0.39], [0.22, 0.53], [-0.22, 0.53]], glass);
    // Franjas dobles sobre maletero y techo.
    const stripe = c.stripe || c.accent;
    rect(ctx, u, -0.12, 0.12, -0.05, 0.56, stripe);
    rect(ctx, u, 0.05, 0.12, 0.12, 0.56, stripe);
    // Spoiler bajo.
    rect(ctx, u, -0.42, 0.365, 0.42, 0.395, c.dark);
    // Pilotos traseros dobles.
    for (const side of [-1, 1]) {
      light(ctx, u, side < 0 ? -0.42 : 0.24, 0.24, side < 0 ? -0.24 : 0.42, 0.3, c.light, brake ? 1 : 0.4);
    }
    // Parachoques cromado y escapes.
    const chrome = ctx.createLinearGradient(0, -0.12 * u, 0, -0.06 * u);
    chrome.addColorStop(0, '#eef2ff');
    chrome.addColorStop(1, '#6b7590');
    rect(ctx, u, -0.47, 0.06, 0.47, 0.12, chrome);
    ctx.fillStyle = '#05060a';
    for (const ex of [-0.3, 0.3]) {
      ctx.beginPath();
      ctx.arc(ex * u, -0.07 * u, 0.028 * u, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  NR.Car = Car;
  NR.CarRenderer = CarRenderer;
  NR.laneX = laneX;
  NR.hexPath = hexPath;
})(window.NR);
