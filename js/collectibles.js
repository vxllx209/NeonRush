/**
 * NEON RUSH — Coleccionables.
 *
 * Orb: cian = 1 de energía; verde (raro) = 5 de energía, más puntos y nitro.
 * PowerUp: shield (escudo), magnet (imán), multiplier (x2).
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;
  const G = NR.CONFIG.GAME;
  const { clamp } = NR.util;

  const RADIUS = 0.2;
  const ORB_Y = 0.45;

  function fadeFor(z) {
    return clamp((G.FAR - z) / (G.FAR - G.FADE_START), 0, 1);
  }

  /** Colisión generosa en (x, z): tocar el objeto con cualquier parte del auto. */
  function touches(item, p, distance, radius) {
    const z = item.pos - distance;
    if (Math.abs(z) > p.halfD + radius + 0.1) return false;
    return Math.abs(item.x - p.x) <= p.halfW + radius + 0.15;
  }

  class Orb {
    constructor(lane, pos, green = false) {
      this.x = NR.laneX(lane);
      this.pos = pos;
      this.y = ORB_Y;
      this.green = green;
      this.value = green ? G.ORB_GREEN_VALUE : 1;
      this.score = green ? G.ORB_GREEN_SCORE : G.ORB_SCORE;
      this.nitro = green ? G.NITRO_PER_GREEN : G.NITRO_PER_ORB;
      this.collected = false;
      this.attracted = false;
      this.phase = Math.random() * Math.PI * 2;
    }

    /** Imán: el orbe vuela hacia el auto. */
    attract(dt, carX, distance) {
      const k = Math.min(1, dt * 9);
      this.x += (carX - this.x) * k;
      this.pos += (distance - this.pos) * Math.min(1, dt * 7);
    }

    touches(p, distance) {
      return touches(this, p, distance, RADIUS);
    }

    draw(ctx, cam, distance, time) {
      const z = this.pos - distance;
      const alpha = fadeFor(z);
      if (alpha <= 0 || z < cam.zNear - 0.5) return;
      const s = cam.scale(z);
      const bob = Math.sin(time * 3 + this.phase) * 0.06;
      const x = cam.sx(this.x, z);
      const y = cam.sy(this.y + bob, z);
      const r = RADIUS * s * (this.green ? 1.15 : 1);
      const color = this.green ? C.green : C.cyan;

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(x, cam.groundY(z), r * 0.9, r * 0.25, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha * 0.22;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.white;
      ctx.beginPath();
      ctx.arc(x - r * 0.25, y - r * 0.25, r * 0.38, 0, Math.PI * 2);
      ctx.fill();
      if (r > 3) {
        ctx.strokeStyle = color;
        ctx.lineWidth = Math.max(1, r * 0.14);
        ctx.beginPath();
        ctx.ellipse(x, y, r * 1.55, r * 0.5, Math.sin(time * 2 + this.phase) * 0.6, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  const POWERUPS = Object.freeze({
    shield: { color: C.cyan, label: 'ESCUDO', time: G.SHIELD_TIME },
    magnet: { color: C.purple, label: 'IMÁN', time: G.MAGNET_TIME },
    multiplier: { color: C.pink, label: 'X2', time: G.MULT_TIME },
  });

  class PowerUp {
    constructor(type, lane, pos) {
      this.type = type;
      this.x = NR.laneX(lane);
      this.pos = pos;
      this.collected = false;
      this.phase = Math.random() * 10;
    }

    touches(p, distance) {
      return touches(this, p, distance, 0.3);
    }

    draw(ctx, cam, distance, time) {
      const z = this.pos - distance;
      const alpha = fadeFor(z);
      if (alpha <= 0 || z < cam.zNear - 0.5) return;
      const s = cam.scale(z);
      const x = cam.sx(this.x, z);
      const y = cam.sy(0.6 + Math.sin(time * 2.5 + this.phase) * 0.08, z);
      const r = s * 0.3;
      const def = POWERUPS[this.type];

      ctx.save();
      ctx.globalAlpha = alpha;
      // Columna de luz que lo hace visible desde lejos.
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, y - s * 2, 0, cam.groundY(z));
      beam.addColorStop(0, 'rgba(0,0,0,0)');
      beam.addColorStop(1, def.color);
      ctx.globalAlpha = alpha * 0.25;
      ctx.fillStyle = beam;
      ctx.fillRect(x - r * 0.35, y - s * 2, r * 0.7, cam.groundY(z) - (y - s * 2));
      ctx.globalAlpha = alpha * 0.3;
      ctx.fillStyle = def.color;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;

      // Token hexagonal girando.
      const squash = Math.abs(Math.cos(time * 2 + this.phase)) * 0.6 + 0.4;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(squash, 1);
      NR.hexPath(ctx, 0, 0, r);
      ctx.fillStyle = '#0b0f22';
      ctx.fill();
      ctx.lineWidth = Math.max(1.5, r * 0.12);
      ctx.strokeStyle = def.color;
      ctx.stroke();
      drawIcon(ctx, this.type, r * 0.55, def.color);
      ctx.restore();
      ctx.restore();
    }
  }

  /** Iconos vectoriales (también se usan en el HUD vía CSS/SVG equivalentes). */
  function drawIcon(ctx, type, r, color) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.5, r * 0.22);
    ctx.lineCap = 'round';
    if (type === 'shield') {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.85, -r * 0.55);
      ctx.lineTo(r * 0.7, r * 0.35);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.7, r * 0.35);
      ctx.lineTo(-r * 0.85, -r * 0.55);
      ctx.closePath();
      ctx.fill();
    } else if (type === 'magnet') {
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.65, Math.PI, 0);
      ctx.moveTo(-r * 0.65, 0); ctx.lineTo(-r * 0.65, r * 0.8);
      ctx.moveTo(r * 0.65, 0); ctx.lineTo(r * 0.65, r * 0.8);
      ctx.stroke();
    } else {
      ctx.font = `900 ${Math.round(r * 1.3)}px Orbitron, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('x2', 0, r * 0.05);
    }
  }

  NR.Orb = Orb;
  NR.PowerUp = PowerUp;
  NR.POWERUPS = POWERUPS;
})(window.NR);
