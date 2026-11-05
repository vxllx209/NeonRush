/**
 * NEON RUSH — Entrada de juego: teclado y gestos táctiles.
 *
 * Los listeners se registran una sola vez al arrancar; `enabled` decide si
 * los eventos llegan al juego. Así reiniciar partidas nunca acumula eventos.
 *
 * Acciones: 'left' | 'right' | 'nitro' | 'brake-on' | 'brake-off' | 'brake-pulse'
 *  - Teclado: el freno dura mientras se mantiene ↓ / S.
 *  - Táctil: deslizar hacia abajo frena mientras el dedo siga en pantalla
 *    (mínimo un pulso corto).
 */
(function (NR) {
  'use strict';

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    ArrowUp: 'nitro', KeyW: 'nitro', Space: 'nitro',
    ArrowDown: 'brake', KeyS: 'brake',
  };

  class Input {
    constructor(surface, onAction) {
      this.surface = surface;
      this.onAction = onAction;
      this.enabled = false;
      this._pointer = null;
      this._brakeKeys = new Set();

      this._onKeyDown = this._onKeyDown.bind(this);
      this._onKeyUp = this._onKeyUp.bind(this);
      this._onPointerDown = this._onPointerDown.bind(this);
      this._onPointerMove = this._onPointerMove.bind(this);
      this._onPointerUp = this._onPointerUp.bind(this);

      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      surface.addEventListener('pointerdown', this._onPointerDown);
      surface.addEventListener('pointermove', this._onPointerMove);
      surface.addEventListener('pointerup', this._onPointerUp);
      surface.addEventListener('pointercancel', this._onPointerUp);
    }

    setEnabled(value) {
      if (!value) this._releaseBrake();
      this.enabled = value;
      this._pointer = null;
    }

    _releaseBrake() {
      if (this._brakeKeys.size || (this._pointer && this._pointer.braking)) {
        this._brakeKeys.clear();
        this.onAction('brake-off');
      }
    }

    _onKeyDown(e) {
      const action = KEYMAP[e.code];
      if (!action || !this.enabled) return;
      e.preventDefault(); // evita el scroll con flechas/espacio
      if (action === 'brake') {
        if (!this._brakeKeys.size) this.onAction('brake-on');
        this._brakeKeys.add(e.code);
        return;
      }
      if (e.repeat) return; // mantener pulsado no repite acciones
      this.onAction(action);
    }

    _onKeyUp(e) {
      if (KEYMAP[e.code] !== 'brake' || !this._brakeKeys.has(e.code)) return;
      this._brakeKeys.delete(e.code);
      if (!this._brakeKeys.size && this.enabled) this.onAction('brake-off');
    }

    _onPointerDown(e) {
      if (!this.enabled || !e.isPrimary) return;
      if (e.target.closest('button, a, input')) return;
      this._pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, fired: false, braking: false };
    }

    _onPointerMove(e) {
      const p = this._pointer;
      if (!this.enabled || !p || p.id !== e.pointerId || p.fired) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      const threshold = Math.max(24, Math.min(window.innerWidth, window.innerHeight) * 0.05);
      if (Math.max(Math.abs(dx), Math.abs(dy)) < threshold) return;
      p.fired = true; // un gesto = una acción
      if (Math.abs(dx) > Math.abs(dy)) this.onAction(dx < 0 ? 'left' : 'right');
      else if (dy < 0) this.onAction('nitro');
      else {
        p.braking = true;
        this.onAction('brake-pulse');
        this.onAction('brake-on');
      }
    }

    _onPointerUp(e) {
      const p = this._pointer;
      if (!p || p.id !== e.pointerId) return;
      if (p.braking && this.enabled) this.onAction('brake-off');
      this._pointer = null;
    }
  }

  NR.Input = Input;
})(window.NR);
