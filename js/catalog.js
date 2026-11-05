/**
 * NEON RUSH — Catálogo de autos y cosméticos.
 * Los autos tienen cualidades (aceleración, velocidad máxima, freno y manejo)
 * que afectan a la conducción; los más caros son mejores. Pinturas, estelas y
 * efectos son puramente estéticos. La hitbox es la misma para todos.
 */
(function (NR) {
  'use strict';

  const freeze = (list) => Object.freeze(list.map((o) => Object.freeze(o)));

  /** El garaje recorre los autos del más barato al más caro. */
  const byPrice = (list) => list.slice().sort((a, b) => a.price - b.price);

  /**
   * Cualidades de cada auto (0..1). El precio fija el nivel general
   * (más caro = mejor media) y cada carrocería reparte puntos según su
   * carácter. Los sesgos de cada modelo suman 0, así la media depende solo
   * del precio y siempre crece con él.
   */
  const STATS = Object.freeze([
    { key: 'accel', label: 'ACELERACIÓN' },
    { key: 'top', label: 'VEL. MÁXIMA' },
    { key: 'brake', label: 'FRENO' },
    { key: 'handling', label: 'MANEJO' },
  ]);
  const MAX_PRICE = 3000;
  const BIAS = {
    formula: { accel: -0.04, top: -0.08, brake: 0.05, handling: 0.07 },
    gt: { accel: 0.03, top: 0.02, brake: -0.02, handling: -0.03 },
    hyper: { accel: 0.02, top: 0.1, brake: -0.04, handling: -0.08 },
    proto: { accel: -0.06, top: 0.03, brake: 0.05, handling: -0.02 },
    muscle: { accel: 0.12, top: 0.04, brake: -0.08, handling: -0.08 },
  };

  function computeStats(car) {
    const base = 0.28 + 0.6 * Math.min(1, car.price / MAX_PRICE);
    const bias = BIAS[car.model] || {};
    const out = {};
    for (const { key } of STATS) {
      out[key] = Math.round(NR.util.clamp(base + (bias[key] || 0), 0.12, 1) * 100) / 100;
    }
    return Object.freeze(out);
  }

  /** Valoración global 0..10. */
  const rating = (stats) => (STATS.reduce((a, s) => a + stats[s.key], 0) / STATS.length) * 10;

  const withStats = (list) => list.map((car) => Object.assign({}, car, { stats: computeStats(car) }));

  const CARS = freeze(byPrice(withStats([
    {
      id: 'neo', name: 'NEO-1', model: 'formula', cls: 'FÓRMULA', price: 300,
      desc: 'Monoplaza de serie en azul y blanco. Ligero, preciso, nacido en la pista.',
      colors: { body: '#E6EEFF', body2: '#9FB3D9', accent: '#00D9FF', dark: '#141c36', light: '#FF36C8' },
    },
    {
      id: 'blaze', name: 'BLAZE R', model: 'formula', cls: 'FÓRMULA', price: 600,
      desc: 'Monoplaza de competición con alerón doble y pintura de fuego rosa.',
      colors: { body: '#FF36C8', body2: '#a01f7f', accent: '#F5F7FF', dark: '#1a0d1f', light: '#FF36C8' },
    },
    {
      id: 'volt', name: 'VOLT GT', model: 'gt', cls: 'DEPORTIVO', price: 900,
      desc: 'Gran turismo eléctrico en verde neón. Línea limpia y estela de alto voltaje.',
      colors: { body: '#1d4a35', body2: '#12301f', accent: '#39FF88', dark: '#08140e', light: '#39FF88' },
    },
    {
      id: 'shadow', name: 'SHADOW X', model: 'hyper', cls: 'HIPERDEPORTIVO', price: 1500,
      desc: 'Hiperdeportivo negro y morado con aleta central. Silencioso hasta que no lo es.',
      colors: { body: '#1a1428', body2: '#0f0b18', accent: '#8B5CF6', dark: '#07050c', light: '#FF36C8' },
    },

    /* ---------- Fórmula ---------- */
    {
      id: 'redline', name: 'REDLINE F', model: 'formula', cls: 'FÓRMULA', price: 450,
      desc: 'Rojo de competición clásico con alerón blanco. Nostalgia a 300 km/h.',
      colors: { body: '#e8213b', body2: '#8f0f22', accent: '#F5F7FF', dark: '#1a0508', light: '#FF3B5C' },
    },
    {
      id: 'aurora', name: 'AURORA', model: 'formula', cls: 'FÓRMULA', price: 750,
      desc: 'Blanco perla con reflejos violeta, inspirado en la aurora boreal.',
      colors: { body: '#f2ecff', body2: '#b9a6f2', accent: '#8B5CF6', dark: '#1c1530', light: '#8B5CF6' },
    },
    {
      id: 'cobalt', name: 'COBALT 9', model: 'formula', cls: 'FÓRMULA', price: 850,
      desc: 'Azul cobalto profundo con detalles amarillos de equipo de fábrica.',
      colors: { body: '#1f3fd1', body2: '#13267f', accent: '#FFD23F', dark: '#070c24', light: '#FFD23F' },
    },
    {
      id: 'phantom', name: 'PHANTOM', model: 'formula', cls: 'FÓRMULA', price: 1300,
      desc: 'Negro mate con luces verde ácido. Casi invisible en la noche.',
      colors: { body: '#15171c', body2: '#0b0c10', accent: '#39FF88', dark: '#040506', light: '#39FF88' },
    },

    /* ---------- Deportivos ---------- */
    {
      id: 'nova', name: 'NOVA GT', model: 'gt', cls: 'DEPORTIVO', price: 700,
      desc: 'Gran turismo blanco con franjas cian. Elegante en cualquier autopista.',
      colors: { body: '#e9eef8', body2: '#9aa6c2', accent: '#00D9FF', dark: '#121828', light: '#00D9FF', stripe: '#00D9FF' },
    },
    {
      id: 'ember', name: 'EMBER GT', model: 'gt', cls: 'DEPORTIVO', price: 950,
      desc: 'Naranja brasa con franjas negras y pilotos de fuego.',
      colors: { body: '#ff6a1f', body2: '#a33c0b', accent: '#16100c', dark: '#160b05', light: '#FF3B1F', stripe: '#16100c' },
    },
    {
      id: 'glacier', name: 'GLACIER', model: 'gt', cls: 'DEPORTIVO', price: 1100,
      desc: 'Azul hielo translúcido. Frío por fuera, eléctrico por dentro.',
      colors: { body: '#a9e9ff', body2: '#4a9fc4', accent: '#F5F7FF', dark: '#0b1d27', light: '#00D9FF' },
    },
    {
      id: 'viper', name: 'VIPER RS', model: 'gt', cls: 'DEPORTIVO', price: 1400,
      desc: 'Rosa neón con franjas negras. No pasa desapercibido.',
      colors: { body: '#ff36c8', body2: '#9e1a7a', accent: '#0d0610', dark: '#14050f', light: '#FF36C8', stripe: '#0d0610' },
    },

    /* ---------- Hiperdeportivos ---------- */
    {
      id: 'eclipse', name: 'ECLIPSE', model: 'hyper', cls: 'HIPERDEPORTIVO', price: 1800,
      desc: 'Oro sobre negro. Para quien colecciona récords.',
      colors: { body: '#d9a830', body2: '#7a5a12', accent: '#120d03', dark: '#0d0902', light: '#FFD23F', stripe: '#120d03' },
    },
    {
      id: 'specter', name: 'SPECTER', model: 'hyper', cls: 'HIPERDEPORTIVO', price: 2100,
      desc: 'Plata líquida con firma de luz rosa. Aerodinámica de otro planeta.',
      colors: { body: '#cfd6e6', body2: '#7c869e', accent: '#FF36C8', dark: '#0f1219', light: '#FF36C8' },
    },
    {
      id: 'nebula', name: 'NEBULA', model: 'hyper', cls: 'HIPERDEPORTIVO', price: 2400,
      desc: 'Morado galáctico con destellos turquesa.',
      colors: { body: '#5b2bb5', body2: '#2c1360', accent: '#2ef2d0', dark: '#0d0620', light: '#2ef2d0', stripe: '#2ef2d0' },
    },

    /* ---------- Prototipos ---------- */
    {
      id: 'apex', name: 'APEX LMP', model: 'proto', cls: 'PROTOTIPO', price: 1600,
      desc: 'Prototipo de resistencia con aleta de tiburón. Hecho para 24 horas sin parar.',
      colors: { body: '#F5F7FF', body2: '#9fb3d9', accent: '#00D9FF', dark: '#0d1424', light: '#FF36C8', stripe: '#00D9FF' },
    },
    {
      id: 'zenith', name: 'ZENITH', model: 'proto', cls: 'PROTOTIPO', price: 2000,
      desc: 'Verde voltio y blanco: el prototipo favorito de los equipos privados.',
      colors: { body: '#39FF88', body2: '#169c4f', accent: '#F5F7FF', dark: '#061a0e', light: '#39FF88', stripe: '#F5F7FF' },
    },
    {
      id: 'inferno', name: 'INFERNO', model: 'proto', cls: 'PROTOTIPO', price: 2600,
      desc: 'Rojo y negro con barra de luz incandescente.',
      colors: { body: '#1b0b0d', body2: '#0d0506', accent: '#ff3b2f', dark: '#050203', light: '#ff3b2f', stripe: '#ff3b2f' },
    },

    /* ---------- Muscle ---------- */
    {
      id: 'thunder', name: 'THUNDER', model: 'muscle', cls: 'MUSCLE', price: 550,
      desc: 'Amarillo eléctrico con franjas negras. Puro rugido retro.',
      colors: { body: '#ffd23f', body2: '#a88412', accent: '#16130a', dark: '#141005', light: '#FF3B3B', stripe: '#16130a' },
    },
    {
      id: 'rebel', name: 'REBEL 69', model: 'muscle', cls: 'MUSCLE', price: 1000,
      desc: 'Rojo cereza con franjas blancas de carreras.',
      colors: { body: '#c4142e', body2: '#6e0a19', accent: '#F5F7FF', dark: '#1a0306', light: '#FF3B3B', stripe: '#F5F7FF' },
    },
    {
      id: 'outlaw', name: 'OUTLAW', model: 'muscle', cls: 'MUSCLE', price: 3000,
      desc: 'Negro profundo con franjas doradas. La leyenda final del garaje.',
      colors: { body: '#121218', body2: '#07070a', accent: '#d9a830', dark: '#030304', light: '#FFB020', stripe: '#d9a830' },
    },
  ])));

  /** Pinturas: sustituyen los colores de carrocería del auto elegido. */
  const PAINTS = freeze([
    { id: 'factory', name: 'DE FÁBRICA', price: 0, colors: null, swatch: ['#E6EEFF', '#00D9FF'] },
    { id: 'chrome', name: 'CROMO', price: 250, colors: { body: '#c9d2e6', body2: '#7f8aa3', accent: '#F5F7FF' }, swatch: ['#c9d2e6', '#7f8aa3'] },
    { id: 'sunset', name: 'ATARDECER', price: 350, colors: { body: '#ff7a3d', body2: '#b8337a', accent: '#FFD23F' }, swatch: ['#ff7a3d', '#b8337a'] },
    { id: 'toxic', name: 'TÓXICO', price: 350, colors: { body: '#c6ff3d', body2: '#4f7a10', accent: '#0d1a05' }, swatch: ['#c6ff3d', '#4f7a10'] },
    { id: 'ice', name: 'HIELO', price: 450, colors: { body: '#bff4ff', body2: '#4aa7c9', accent: '#00D9FF' }, swatch: ['#bff4ff', '#4aa7c9'] },
    { id: 'midnight', name: 'MEDIANOCHE', price: 500, colors: { body: '#121a3a', body2: '#0a0f24', accent: '#FF36C8' }, swatch: ['#121a3a', '#FF36C8'] },
  ]);

  /** Estelas de energía detrás del auto. */
  const TRAILS = freeze([
    { id: 'stream', name: 'CYAN STREAM', price: 0, colors: ['#00D9FF'] },
    { id: 'pulse', name: 'PINK PULSE', price: 200, colors: ['#FF36C8'] },
    { id: 'volt', name: 'GREEN VOLT', price: 250, colors: ['#39FF88'] },
    { id: 'ion', name: 'ION VIOLET', price: 250, colors: ['#8B5CF6'] },
    { id: 'prism', name: 'PRISMA', price: 700, colors: ['#00D9FF', '#8B5CF6', '#FF36C8', '#39FF88'] },
  ]);

  /** Efectos visuales del auto. */
  const EFFECTS = freeze([
    { id: 'none', name: 'NINGUNO', price: 0, desc: 'Sin efecto adicional.' },
    { id: 'underglow', name: 'NEÓN INFERIOR', price: 300, desc: 'Luz de neón bajo el chasis.' },
    { id: 'sparks', name: 'CHISPAS', price: 450, desc: 'Chispas al rozar el asfalto.' },
    { id: 'aura', name: 'AURA HOLOGRÁFICA', price: 800, desc: 'Contorno holográfico pulsante.' },
  ]);

  const TRACKS = NR.TRACKS;

  const CATEGORIES = Object.freeze({ cars: CARS, paints: PAINTS, trails: TRAILS, effects: EFFECTS, tracks: TRACKS });

  /** Valor equipado por defecto de cada categoría (gratuito). */
  const DEFAULTS = Object.freeze({ cars: 'neo', paints: 'factory', trails: 'stream', effects: 'none', tracks: 'city' });

  const find = (category, id) => (CATEGORIES[category] || []).find((item) => item.id === id) || null;

  /* ---------------- Mejoras (taller) ---------------- */

  /** Niveles por cualidad y cuánto suma cada nivel (0,05 = +0,5 en la escala de 10). */
  const MAX_UPGRADE = 5;
  const UPGRADE_STEP = 0.05;

  /** Precio del siguiente nivel: sube con el nivel y con el valor del auto. */
  function upgradeCost(car, level) {
    return Math.round(((60 + car.price * 0.1) * (level + 1)) / 10) * 10;
  }

  /** Niveles comprados de un auto: { accel, top, brake, handling } (0..MAX_UPGRADE). */
  function upgradeLevels(carId, upgrades) {
    const u = (upgrades && upgrades[carId]) || {};
    const out = {};
    for (const { key } of STATS) out[key] = Math.max(0, Math.min(MAX_UPGRADE, Math.floor(u[key] || 0)));
    return out;
  }

  /** Cualidades finales = de serie + mejoras (tope 1,0 = 10). */
  function effectiveStats(carId, upgrades) {
    const car = find('cars', carId) || CARS[0];
    const lv = upgradeLevels(car.id, upgrades);
    const out = {};
    for (const { key } of STATS) out[key] = Math.min(1, Math.round((car.stats[key] + lv[key] * UPGRADE_STEP) * 100) / 100);
    return out;
  }

  /** Colores finales del auto: colores del modelo + pintura equipada. */
  function resolveColors(carId, paintId) {
    const car = find('cars', carId) || CARS[0];
    const paint = find('paints', paintId);
    return Object.assign({}, car.colors, paint && paint.colors ? paint.colors : null);
  }

  NR.CATALOG = Object.freeze({
    CARS, PAINTS, TRAILS, EFFECTS, TRACKS, CATEGORIES, DEFAULTS, STATS,
    MAX_UPGRADE, UPGRADE_STEP,
    rating, find, resolveColors, upgradeCost, upgradeLevels, effectiveStats,
  });
})(window.NR);
