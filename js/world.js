/**
 * NEON RUSH — Cámara en perspectiva y carretera del gameplay.
 *
 * Coordenadas del mundo:
 *   X: lateral (carriles en -1, 0, 1), Y: altura, z: profundidad delante
 *   del jugador (el jugador está siempre en z = 0).
 * Proyección: escala(z) = Px / (z + D)
 *   x pantalla = vpX + (X - panX) * escala
 *   y pantalla = horizonte + G / (z + D) - Y * escala
 * Colisiones y dibujo usan exactamente las mismas coordenadas.
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;
  const G = NR.CONFIG.GAME;
  const { clamp } = NR.util;

  const ROAD_HALF = (G.LANES * G.LANE_WIDTH) / 2; // 1.5

  class Camera {
    constructor() {
      this.D = 5;        // distancia de la cámara detrás del jugador
      this.panX = 0;     // la cámara sigue un poco al jugador
    }

    resize(w, h, horizonY) {
      this.w = w;
      this.h = h;
      this.horizonY = horizonY;
      this.vpX = w / 2;
      const portrait = h > w;
      this.groundY0 = h * (portrait ? 0.82 : 0.86);
      this.G = (this.groundY0 - horizonY) * this.D;
      // Píxeles por unidad a la altura del jugador: limitado por alto y ancho.
      const s0 = Math.min(h * 0.155, (w * 0.9) / G.LANES);
      this.Px = s0 * this.D;
      // Profundidad (negativa) que corresponde al borde inferior de la pantalla.
      this.zNear = this.G / (h - horizonY) - this.D;
    }

    scale(z) { return this.Px / (z + this.D); }
    groundY(z) { return this.horizonY + this.G / (z + this.D); }
    sx(X, z) { return this.vpX + (X - this.panX) * this.scale(z); }
    sy(Y, z) { return this.groundY(z) - Y * this.scale(z); }
  }

  /** Dibuja una caja en perspectiva: cara lateral visible, superior y frontal. */
  function drawBox(ctx, cam, b, style) {
    const { x0, x1, y0, y1, z0, z1 } = b;
    const fl = cam.sx(x0, z0), fr = cam.sx(x1, z0);
    const ft = cam.sy(y1, z0), fb = cam.sy(y0, z0);
    const bl = cam.sx(x0, z1), br = cam.sx(x1, z1);
    const bt = cam.sy(y1, z1), bb = cam.sy(y0, z1);

    // Lateral: se ve el lado que mira hacia el centro de la cámara.
    if (style.side) {
      ctx.fillStyle = style.side;
      if (bl > fl) { // lado izquierdo visible (objeto a la derecha)
        ctx.beginPath();
        ctx.moveTo(fl, fb); ctx.lineTo(fl, ft); ctx.lineTo(bl, bt); ctx.lineTo(bl, bb);
        ctx.closePath(); ctx.fill();
      } else if (br < fr) { // lado derecho visible (objeto a la izquierda)
        ctx.beginPath();
        ctx.moveTo(fr, fb); ctx.lineTo(fr, ft); ctx.lineTo(br, bt); ctx.lineTo(br, bb);
        ctx.closePath(); ctx.fill();
      }
    }
    // Superior: visible si el borde trasero queda por encima del frontal.
    if (style.top && bt < ft) {
      ctx.fillStyle = style.top;
      ctx.beginPath();
      ctx.moveTo(fl, ft); ctx.lineTo(fr, ft); ctx.lineTo(br, bt); ctx.lineTo(bl, bt);
      ctx.closePath(); ctx.fill();
    }
    // Frontal.
    ctx.fillStyle = style.front;
    ctx.fillRect(fl, ft, fr - fl, fb - ft);
    if (style.edge) {
      ctx.strokeStyle = style.edge;
      ctx.lineWidth = style.edgeWidth || 1.5;
      ctx.strokeRect(fl, ft, fr - fl, fb - ft);
    }
    return { left: fl, right: fr, top: ft, bottom: fb };
  }

  class World {
    constructor(camera) {
      this.cam = camera;
      this.theme = NR.CITY_THEME;
    }

    /** Colores de la pista actual (ver js/tracks.js). */
    setTheme(theme) {
      this.theme = theme || NR.CITY_THEME;
    }

    /** Suelo, rejilla, carretera, divisores y postes laterales. */
    draw(ctx, distance, time) {
      const cam = this.cam;
      const { w, h, horizonY } = cam;
      const far = G.FAR;
      const zN = cam.zNear - 0.5;

      // Suelo.
      const T = this.theme;
      const g = ctx.createLinearGradient(0, horizonY, 0, h);
      g.addColorStop(0, T.ground[0]);
      g.addColorStop(0.3, T.ground[1]);
      g.addColorStop(1, T.ground[2]);
      ctx.fillStyle = g;
      ctx.fillRect(0, horizonY, w, h - horizonY);

      // Rejilla lateral (líneas longitudinales).
      ctx.strokeStyle = `rgba(${T.grid},0.16)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k <= 9; k++) {
        for (const side of [-1, 1]) {
          const X = side * (ROAD_HALF + 0.7 + k * 1.6);
          ctx.moveTo(cam.sx(X, far), cam.groundY(far));
          ctx.lineTo(cam.sx(X, zN), cam.groundY(zN));
        }
      }
      ctx.stroke();

      // Rejilla transversal: fija al mundo, avanza con la distancia recorrida.
      const step = 4;
      const first = Math.ceil((distance + zN) / step) * step;
      ctx.fillStyle = `rgb(${T.grid})`;
      for (let p = first; p - distance < far; p += step) {
        const z = p - distance;
        const y = cam.groundY(z);
        const near = clamp(1 - z / far, 0, 1);
        ctx.globalAlpha = 0.04 + near * near * 0.32;
        ctx.fillRect(0, y, w, Math.max(1, near * 2));
      }
      ctx.globalAlpha = 1;

      this._drawRoad(ctx, distance, time, far, zN);
      this._drawPylons(ctx, distance, time, far, zN);

      // Línea del horizonte.
      const hg = ctx.createLinearGradient(0, 0, w, 0);
      hg.addColorStop(0, `rgba(${T.horizon},0)`);
      hg.addColorStop(0.5, `rgba(${T.horizon},0.85)`);
      hg.addColorStop(1, `rgba(${T.horizon},0)`);
      ctx.fillStyle = hg;
      ctx.fillRect(0, horizonY - 1, w, 2);
    }

    _drawRoad(ctx, distance, time, far, zN) {
      const cam = this.cam;
      const T = this.theme;
      const { h, horizonY } = cam;

      const tlx = cam.sx(-ROAD_HALF, far), trx = cam.sx(ROAD_HALF, far);
      const blx = cam.sx(-ROAD_HALF, zN), brx = cam.sx(ROAD_HALF, zN);
      const ty = cam.groundY(far), by = cam.groundY(zN);

      const surface = ctx.createLinearGradient(0, horizonY, 0, h);
      surface.addColorStop(0, T.road[0]);
      surface.addColorStop(0.28, T.road[1]);
      surface.addColorStop(1, T.road[2]);
      ctx.fillStyle = surface;
      ctx.beginPath();
      ctx.moveTo(tlx, ty); ctx.lineTo(trx, ty); ctx.lineTo(brx, by); ctx.lineTo(blx, by);
      ctx.closePath();
      ctx.fill();

      // Reflejos y bandas de luz que pasan bajo el jugador (sensación de velocidad).
      ctx.save();
      ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      const refl = ctx.createLinearGradient(0, horizonY, 0, h);
      refl.addColorStop(0, `rgba(${T.reflect},0.22)`);
      refl.addColorStop(0.35, `rgba(${T.band},0.05)`);
      refl.addColorStop(1, `rgba(${T.band},0)`);
      ctx.fillStyle = refl;
      ctx.fillRect(0, horizonY, cam.w, h - horizonY);

      const band = 14;
      const firstBand = Math.ceil((distance + zN) / band) * band;
      ctx.fillStyle = `rgba(${T.band},0.06)`;
      for (let p = firstBand; p - distance < far; p += band) {
        const z = p - distance;
        const y0 = cam.groundY(z + 1.2);
        const y1 = cam.groundY(z);
        ctx.fillRect(0, y0, cam.w, Math.max(1, y1 - y0));
      }
      ctx.restore();

      // Divisores de carril discontinuos (fijos al mundo).
      ctx.strokeStyle = T.dash;
      ctx.lineCap = 'round';
      const period = 3.2;
      const dash = 1.4;
      const firstDash = Math.floor((distance + zN) / period) * period;
      for (const X of [-0.5, 0.5]) {
        for (let p = firstDash; p - distance < far; p += period) {
          const zA = Math.max(p - distance, zN);
          const zB = p - distance + dash;
          if (zB <= zN) continue;
          const near = clamp(1 - zA / far, 0, 1);
          ctx.globalAlpha = 0.12 + near * near * 0.6;
          ctx.lineWidth = Math.max(1, cam.scale(zA) * 0.05);
          ctx.beginPath();
          ctx.moveTo(cam.sx(X, zA), cam.groundY(zA));
          ctx.lineTo(cam.sx(X, zB), cam.groundY(zB));
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;

      // Bordes neón.
      const edge = (X, color) => {
        const x0 = cam.sx(X, far), x1 = cam.sx(X, zN);
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.22;
        ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, by); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(x0, ty); ctx.lineTo(x1, by); ctx.stroke();
      };
      edge(-ROAD_HALF, T.edges[0]);
      edge(ROAD_HALF, T.edges[1]);
    }

    /** Postes de luz a ambos lados: refuerzan la sensación de velocidad. */
    _drawPylons(ctx, distance, time, far, zN) {
      const cam = this.cam;
      const spacing = 12;
      const first = Math.ceil((distance + zN) / spacing) * spacing;
      const posts = [];
      for (let p = first; p - distance < far; p += spacing) posts.push(p - distance);

      ctx.save();
      for (let i = posts.length - 1; i >= 0; i--) {
        const z = posts[i];
        const s = cam.scale(z);
        const fade = clamp((far - z) / 14, 0, 1);
        for (const side of [-1, 1]) {
          const X = side * (ROAD_HALF + 0.75);
          const x = cam.sx(X, z);
          const yb = cam.groundY(z);
          const yt = cam.sy(2.6, z);
          ctx.globalAlpha = fade;
          ctx.fillStyle = '#0d1226';
          ctx.fillRect(x - s * 0.04, yt, s * 0.08, yb - yt);
          const color = side < 0 ? this.theme.pylons[0] : this.theme.pylons[1];
          ctx.fillStyle = color;
          ctx.fillRect(x - s * 0.04, yt, s * 0.08, Math.max(1, s * 0.5));
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = fade * 0.2;
          ctx.beginPath();
          ctx.arc(x, yt + s * 0.25, s * 0.16, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
      ctx.restore();
    }
  }

  NR.Camera = Camera;
  NR.World = World;
  NR.drawBox = drawBox;
  NR.ROAD_HALF = ROAD_HALF;
})(window.NR);
