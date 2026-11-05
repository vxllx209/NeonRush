/**
 * NEON RUSH — Pistas (escenarios).
 *
 * Cada pista define:
 *  - theme: aspecto visual completo (cielo, horizonte, suelo, carretera,
 *    partículas, niebla). Lo usan CityBackdrop (fondo) y World (carretera).
 *  - mods: cómo cambia la carrera. Las pistas más exigentes multiplican los puntos.
 *      score     multiplicador de puntos
 *      speed     multiplicador de la velocidad base
 *      handling  multiplicador de la rapidez del cambio de carril
 *      grip      eficacia del freno (1 = normal, <1 = resbala)
 *      orbs      probabilidad extra de orbes
 *      patterns  pesos extra para ciertos patrones de obstáculos
 *  - tags: resumen de los efectos para la interfaz.
 */
(function (NR) {
  'use strict';

  const C = NR.CONFIG.COLORS;

  const CITY_LAYERS = [
    {
      kind: 'buildings', speed: 5, minH: 0.34, maxH: 0.86, minW: 30, maxW: 80, gap: 0,
      body: '#0c1228', edge: 'rgba(139,92,246,0.35)',
      windows: ['rgba(139,92,246,0.38)', 'rgba(0,217,255,0.22)'], lit: 0.16,
    },
    {
      kind: 'buildings', speed: 12, minH: 0.22, maxH: 0.62, minW: 44, maxW: 110, gap: 6,
      body: '#090e20', edge: 'rgba(0,217,255,0.45)',
      windows: ['rgba(0,217,255,0.55)', 'rgba(255,54,200,0.45)', 'rgba(245,247,255,0.32)'], lit: 0.2,
      signs: true,
    },
    {
      kind: 'buildings', speed: 24, minH: 0.1, maxH: 0.36, minW: 70, maxW: 160, gap: 18,
      body: '#060914', edge: 'rgba(255,54,200,0.65)',
      windows: ['rgba(0,217,255,0.75)', 'rgba(255,54,200,0.6)', 'rgba(57,255,136,0.5)', 'rgba(245,247,255,0.55)'], lit: 0.13,
    },
  ];

  const CITY = {
    sky: [[0, '#04060d'], [0.55, '#080B16'], [0.85, '#141433'], [1, '#2a1442']],
    haze: ['255,54,200', '139,92,246'],
    beams: true,
    layers: CITY_LAYERS,
    ground: ['#140f2e', '#0b0e1f', '#05070f'],
    grid: '139,92,246',
    road: ['rgba(46,22,78,0.96)', 'rgba(15,19,42,0.97)', 'rgba(8,11,22,0.98)'],
    reflect: '255,54,200',
    band: '0,217,255',
    edges: [C.cyan, C.pink],
    dash: C.white,
    horizon: '255,54,200',
    pylons: [C.cyan, C.pink],
    particles: 'motes',
    particleColors: [C.cyan, C.pink, C.purple, C.cyan],
  };

  const TRACKS = [
    {
      id: 'city', name: 'NEON CITY', price: 0,
      desc: 'La autopista elevada del Sector 07. Luces de neón, carteles holográficos y tráfico nocturno.',
      tags: ['CLÁSICA'],
      mods: { score: 1 },
      theme: CITY,
    },
    {
      id: 'sunset', name: 'SUNSET COAST', price: 400,
      desc: 'Costa synthwave al atardecer: sol rayado, palmeras y montañas violetas. Más energía en la pista.',
      tags: ['MÁS ORBES'],
      mods: { score: 1, orbs: 1, patterns: { orbRun: 3 } },
      theme: {
        sky: [[0, '#1a0b3d'], [0.45, '#5a1a6e'], [0.78, '#d63c7a'], [1, '#ff9a3c']],
        haze: ['255,154,60', '255,54,200'],
        sun: { top: '#ffe259', bottom: '#ff3c8e', r: 0.2, stripes: true, stripe: '#c43a78', lift: 0.32 },
        layers: [
          { kind: 'ridge', speed: 3, minH: 0.12, maxH: 0.34, body: '#3b145a', edge: 'rgba(255,140,180,0.55)' },
          { kind: 'ridge', speed: 7, minH: 0.06, maxH: 0.2, body: '#28103f', edge: 'rgba(255,90,160,0.5)' },
          { kind: 'palms', speed: 22, minH: 0.22, maxH: 0.42, body: '#12051c' },
        ],
        ground: ['#4a1458', '#200a33', '#0b0514'],
        grid: '255,90,160',
        road: ['rgba(90,26,96,0.95)', 'rgba(34,12,50,0.97)', 'rgba(12,6,20,0.98)'],
        reflect: '255,154,60',
        band: '255,180,90',
        edges: ['#ffb347', C.pink],
        dash: '#ffe6c4',
        horizon: '255,180,90',
        pylons: ['#ffb347', C.pink],
        particles: 'motes',
        particleColors: ['#ffb347', C.pink, '#ffe259'],
      },
    },
    {
      id: 'dune', name: 'DUNE STORM', price: 900,
      desc: 'Desierto rojo con dunas y mesetas. La tormenta de arena oculta lo que viene de lejos.',
      tags: ['VISIBILIDAD REDUCIDA', 'x1.25 PUNTOS'],
      mods: { score: 1.25 },
      theme: {
        sky: [[0, '#2b0d0a'], [0.5, '#6e2a12'], [0.85, '#c4572a'], [1, '#e8913f']],
        haze: ['255,170,90', '255,110,60'],
        sun: { top: '#fff1c9', bottom: '#ffb070', r: 0.07, stripes: false, lift: 1.6 },
        layers: [
          { kind: 'dunes', speed: 3, minH: 0.12, maxH: 0.34, body: '#6a2a14', edge: 'rgba(255,190,120,0.45)', mesas: 3 },
          { kind: 'dunes', speed: 9, minH: 0.06, maxH: 0.2, body: '#4a1c0d', edge: 'rgba(255,160,90,0.4)' },
          { kind: 'dunes', speed: 20, minH: 0.02, maxH: 0.1, body: '#2e1007', edge: 'rgba(255,140,70,0.35)' },
        ],
        ground: ['#5a2412', '#2e1208', '#120604'],
        grid: '255,140,60',
        road: ['rgba(110,50,25,0.95)', 'rgba(50,22,12,0.97)', 'rgba(18,8,4,0.98)'],
        reflect: '255,170,90',
        band: '255,190,120',
        edges: ['#ffb347', '#ff5a3c'],
        dash: '#ffe0b0',
        horizon: '255,170,90',
        pylons: ['#ffb347', '#ff5a3c'],
        particles: 'sand',
        particleColors: ['#ffcf8a', '#e8a060', '#ffe7c0'],
        fog: { color: '186,104,58', near: 12, far: 40 },
      },
    },
    {
      id: 'frost', name: 'FROST GRID', price: 1400,
      desc: 'Cordillera helada bajo la aurora boreal. El asfalto congelado hace que giros y frenadas cuesten más.',
      tags: ['ASFALTO HELADO', 'x1.3 PUNTOS'],
      mods: { score: 1.3, handling: 0.7, grip: 0.65 },
      theme: {
        sky: [[0, '#020814'], [0.5, '#06203a'], [0.85, '#0e4a66'], [1, '#3aa6c4']],
        haze: ['120,230,255', '0,217,255'],
        stars: 140,
        aurora: true,
        layers: [
          { kind: 'ridge', speed: 3, minH: 0.3, maxH: 0.78, body: '#0b2238', edge: 'rgba(160,240,255,0.6)', cap: '#d8f6ff' },
          { kind: 'ridge', speed: 9, minH: 0.14, maxH: 0.44, body: '#071829', edge: 'rgba(0,217,255,0.5)', cap: '#bfefff' },
          {
            kind: 'buildings', speed: 22, minH: 0.05, maxH: 0.15, minW: 50, maxW: 120, gap: 40,
            body: '#05101c', edge: 'rgba(191,244,255,0.6)', windows: ['rgba(0,217,255,0.7)', 'rgba(245,247,255,0.6)'], lit: 0.12,
          },
        ],
        ground: ['#0d2a3d', '#071a29', '#030b13'],
        grid: '160,240,255',
        road: ['rgba(40,90,120,0.95)', 'rgba(14,40,60,0.97)', 'rgba(5,15,25,0.98)'],
        reflect: '160,240,255',
        band: '220,250,255',
        edges: ['#bff4ff', C.cyan],
        dash: '#ffffff',
        horizon: '160,240,255',
        pylons: ['#bff4ff', C.cyan],
        particles: 'snow',
        particleColors: ['#ffffff', '#cdefff'],
      },
    },
    {
      id: 'orbital', name: 'ORBITAL RING', price: 2200,
      desc: 'Autopista orbital entre estaciones espaciales. Más velocidad, más tráfico y más compuertas.',
      tags: ['TRÁFICO DENSO', '+10% VELOCIDAD', 'x1.45 PUNTOS'],
      mods: {
        score: 1.45, speed: 1.1,
        patterns: { traffic: 1.8, trafficPair: 1.8, trafficSwitch: 1.8, gates: 1.6, fieldGate: 1.5 },
      },
      theme: {
        sky: [[0, '#000004'], [0.6, '#05031a'], [1, '#1a0b3a']],
        haze: ['139,92,246', '46,242,208'],
        stars: 280,
        planet: { x: 0.78, y: 0.28, r: 0.13, c1: '#8B5CF6', c2: '#2ef2d0', ring: '#2ef2d0' },
        layers: [
          {
            kind: 'stations', speed: 4, body: '#120d2a', edge: 'rgba(46,242,208,0.6)',
            windows: ['rgba(46,242,208,0.7)', 'rgba(255,54,200,0.6)'], lit: 0.35,
          },
          {
            kind: 'buildings', speed: 18, minH: 0.05, maxH: 0.2, minW: 40, maxW: 120, gap: 10,
            body: '#07051a', edge: 'rgba(139,92,246,0.7)', windows: ['rgba(46,242,208,0.6)', 'rgba(139,92,246,0.6)'], lit: 0.2,
          },
        ],
        ground: ['#0a0620', '#05031a', '#020108'],
        grid: '46,242,208',
        road: ['rgba(34,22,80,0.95)', 'rgba(12,8,35,0.97)', 'rgba(4,3,14,0.98)'],
        reflect: '46,242,208',
        band: '139,92,246',
        edges: ['#2ef2d0', C.purple],
        dash: '#c9fff5',
        horizon: '46,242,208',
        pylons: ['#2ef2d0', C.purple],
        particles: 'stars',
        particleColors: ['#ffffff', '#2ef2d0', '#b79bff'],
      },
    },
  ].map((t) => Object.freeze(t));

  NR.TRACKS = Object.freeze(TRACKS);
  NR.CITY_THEME = CITY;
})(window.NR);
