/**
 * NEON RUSH — Máquina de estados.
 *
 * Solo se permiten las transiciones declaradas en TRANSITIONS, así la
 * lógica de una pantalla no puede ejecutarse mientras otra está activa.
 */
(function (NR) {
  'use strict';

  const STATES = Object.freeze({
    MENU: 'MENU',
    CHARACTER_SELECT: 'CHARACTER_SELECT',
    SHOP: 'SHOP',
    SETTINGS: 'SETTINGS',
    MISSIONS: 'MISSIONS',
    TUTORIAL: 'TUTORIAL',
    PLAYING: 'PLAYING',
    PAUSED: 'PAUSED',
    GAME_OVER: 'GAME_OVER',
  });

  const S = STATES;
  const TRANSITIONS = Object.freeze({
    [S.MENU]: [S.CHARACTER_SELECT, S.SHOP, S.SETTINGS, S.MISSIONS],
    // CHARACTER_SELECT = GARAGE: la "landing page" de elección de auto antes de correr.
    [S.CHARACTER_SELECT]: [S.MENU, S.SHOP, S.TUTORIAL, S.PLAYING],
    [S.SHOP]: [S.MENU, S.CHARACTER_SELECT],
    [S.SETTINGS]: [S.MENU, S.TUTORIAL],
    [S.MISSIONS]: [S.MENU],
    [S.TUTORIAL]: [S.PLAYING, S.MENU],
    [S.PLAYING]: [S.PAUSED, S.GAME_OVER],
    [S.PAUSED]: [S.PLAYING, S.MENU],
    [S.GAME_OVER]: [S.PLAYING, S.MENU, S.CHARACTER_SELECT],
  });

  class StateMachine {
    constructor(initial = S.MENU) {
      this.current = initial;
      this.previous = null;
      this._hooks = new Map(); // state -> { enter, exit }
      this._listeners = new Set();
      this._transitioning = false;
    }

    is(state) {
      return this.current === state;
    }

    can(to) {
      return (TRANSITIONS[this.current] || []).includes(to);
    }

    /** Registra callbacks de entrada/salida de un estado. */
    define(state, { enter, exit } = {}) {
      this._hooks.set(state, { enter, exit });
      return this;
    }

    /** Escucha todos los cambios. Devuelve una función para darse de baja. */
    onChange(fn) {
      this._listeners.add(fn);
      return () => this._listeners.delete(fn);
    }

    go(to, payload) {
      if (this._transitioning) {
        console.warn(`[NeonRush] Transición a ${to} ignorada: ya hay una en curso.`);
        return false;
      }
      if (!this.can(to)) {
        console.warn(`[NeonRush] Transición no permitida: ${this.current} -> ${to}`);
        return false;
      }

      this._transitioning = true;
      const from = this.current;
      try {
        this._hooks.get(from)?.exit?.(to, payload);
        this.previous = from;
        this.current = to;
        this._hooks.get(to)?.enter?.(from, payload);
        this._listeners.forEach((fn) => fn(to, from, payload));
      } finally {
        this._transitioning = false;
      }
      return true;
    }
  }

  NR.STATES = STATES;
  NR.StateMachine = StateMachine;
})(window.NR);
