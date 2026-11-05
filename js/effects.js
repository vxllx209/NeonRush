/**
 * NEON RUSH — Efectos visuales reutilizables.
 *
 * ParticlePool: pool de capacidad fija. No crea objetos por frame
 * (sin presión sobre el recolector de basura) y descarta silenciosamente
 * nuevas partículas si el pool está lleno.
 */
(function (NR) {
  'use strict';

  class ParticlePool {
    constructor(capacity = 200) {
      this.items = Array.from({ length: capacity }, () => ({
        alive: false, x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0,
        life: 0, maxLife: 1, size: 1, color: '#fff', alpha: 1, streak: 0,
      }));
      this._cursor = 0;
      this.active = 0;
    }

    /**
     * @param {object} o x, y, vx, vy, ax, ay, life, size, color, alpha, streak
     *   streak > 0 dibuja una línea de velocidad de longitud proporcional a v.
     */
    spawn(o) {
      const n = this.items.length;
      for (let i = 0; i < n; i++) {
        const p = this.items[this._cursor];
        this._cursor = (this._cursor + 1) % n;
        if (p.alive) continue;
        p.alive = true;
        p.x = o.x; p.y = o.y;
        p.vx = o.vx || 0; p.vy = o.vy || 0;
        p.ax = o.ax || 0; p.ay = o.ay || 0;
        p.life = p.maxLife = o.life || 1;
        p.size = o.size || 1;
        p.color = o.color || '#fff';
        p.alpha = o.alpha == null ? 1 : o.alpha;
        p.streak = o.streak || 0;
        this.active++;
        return p;
      }
      return null;
    }

    update(dt) {
      for (const p of this.items) {
        if (!p.alive) continue;
        p.life -= dt;
        if (p.life <= 0) { p.alive = false; this.active--; continue; }
        p.vx += p.ax * dt;
        p.vy += p.ay * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }
    }

    draw(ctx) {
      if (!this.active) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const p of this.items) {
        if (!p.alive) continue;
        const k = p.life / p.maxLife; // 1 -> 0
        // Aparece y desaparece suavemente.
        const a = p.alpha * Math.min(1, (1 - k) * 5) * Math.min(1, k * 3);
        if (a <= 0.01) continue;

        if (p.streak) {
          ctx.globalAlpha = a;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * p.streak, p.y - p.vy * p.streak);
          ctx.stroke();
        } else {
          ctx.fillStyle = p.color;
          ctx.globalAlpha = a * 0.18; // halo
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = a; // núcleo
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    clear() {
      for (const p of this.items) p.alive = false;
      this.active = 0;
    }
  }

  NR.ParticlePool = ParticlePool;
})(window.NR);
