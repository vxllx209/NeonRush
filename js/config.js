/**
 * NEON RUSH — Configuración global.
 * Todos los scripts comparten el espacio de nombres `window.NR`
 * (scripts clásicos: el juego funciona abriendo index.html sin servidor).
 */
window.NR = window.NR || {};

NR.CONFIG = Object.freeze({
  VERSION: '1.3.2',
  BUILD_PHASE: 9,

  STORAGE_KEY: 'neonrush.save',
  SAVE_VERSION: 3,

  /** Límite de devicePixelRatio para proteger el rendimiento en móviles. */
  MAX_DPR: 2,
  /** Delta time máximo por frame (s). Evita saltos tras un tirón o cambio de pestaña. */
  MAX_DT: 0.05,

  COLORS: Object.freeze({
    bg: '#080B16',
    bg2: '#10172A',
    cyan: '#00D9FF',
    purple: '#8B5CF6',
    pink: '#FF36C8',
    green: '#39FF88',
    white: '#F5F7FF',
    gray: '#929BB5',
  }),

  /**
   * Gameplay. Unidades del mundo: 1 = ancho de un carril.
   * Distancias en unidades (1 unidad = 1 m en la interfaz), tiempos en segundos.
   */
  GAME: Object.freeze({
    LANES: 3,
    LANE_WIDTH: 1,

    SPAWN_AHEAD: 78,      // distancia a la que se generan filas de obstáculos
    FAR: 82,              // límite de dibujado
    FADE_START: 62,       // los objetos aparecen con fundido entre FAR y FADE_START

    // Dificultad (curvas exponenciales suaves, sin saltos bruscos)
    SPEED_MIN: 13,
    SPEED_MAX: 32,
    SPEED_TAU: 95,        // s para alcanzar ~63% del rango de velocidad
    GAP_MAX: 1.2,         // s de reacción entre filas al inicio
    GAP_MIN: 0.62,        // s de reacción mínimo (siempre superable)
    GAP_TAU: 85,
    TIER_1_TIME: 14,      // s: campos, compuertas, mezclas, tráfico doble
    TIER_2_TIME: 42,      // s: secuencias combinadas y tráfico que cambia de carril

    // Auto
    LANE_CHANGE_RATE: 14,
    CAR_HALF_D: 0.7,      // mitad del largo del auto (profundidad de la hitbox)
    HIT_TOLERANCE: 0.06,  // margen que perdona roces mínimos
    SPEED_RESPONSE: 3,    // suavizado de aceleración/frenado

    NITRO_DURATION: 3,
    NITRO_SPEED: 1.42,
    NITRO_PER_ORB: 0.05,
    NITRO_PER_GREEN: 0.2,
    NITRO_SCORE_MULT: 2,

    BRAKE_SPEED: 0.6,
    BRAKE_HEAT_RATE: 1 / 1.6,  // segundos de freno continuo hasta sobrecalentar
    BRAKE_COOL_RATE: 1 / 2.4,
    BRAKE_RECOVER: 0.35,       // calor al que vuelve a funcionar tras sobrecalentarse
    BRAKE_PULSE: 0.6,          // freno táctil mínimo (gesto hacia abajo)

    // Obstáculos dinámicos
    TRAFFIC_SPEED: 0.35,       // fracción de la velocidad del jugador
    TRAFFIC_SIGNAL: 0.8,       // s de intermitente antes de cambiar de carril
    TRAFFIC_SWITCH_TIME: 0.45,
    TRAFFIC_SWITCH_LEAD: 1.9,  // s antes del encuentro en que empieza el aviso
    GATE_PERIOD: 1.8,
    GATE_ON: 0.5,              // fracción del ciclo con láser encendido
    GATE_WARN: 0.22,           // s de parpadeo antes de encenderse

    // Power-ups
    SHIELD_TIME: 5,
    MAGNET_TIME: 8,
    MULT_TIME: 10,
    MAGNET_RANGE: 16,
    POWERUP_MIN_GAP: 200,
    POWERUP_CHANCE: 0.2,
    POWERUP_SCORE: 50,
    SHIELD_GRACE: 0.6,         // invulnerabilidad tras romper el escudo

    // Puntuación
    SCORE_PER_UNIT: 1,
    ORB_SCORE: 10,
    ORB_GREEN_SCORE: 50,
    ORB_GREEN_VALUE: 5,
    ORB_GREEN_CHANCE: 0.1,
    DODGE_SCORE: 5,
    SURVIVAL_BONUS: 100,
    SURVIVAL_INTERVAL: 15,
    MISSION_BONUS: 500,
    LEVEL_DISTANCE: 450,
    MAX_LEVEL: 4,
    LEVEL_MULT_STEP: 0.5,      // x1 -> x1.5 -> x2 -> x2.5 -> x3

    COUNTDOWN_STEP: 0.45,
    CRASH_DURATION: 1.2,       // s reales de cámara lenta antes del GAME OVER
  }),
});
