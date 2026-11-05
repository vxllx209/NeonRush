/**
 * NEON RUSH — Utilidades puras (sin estado, sin DOM).
 */
(function (NR) {
  'use strict';

  const clamp = (v, min, max) => (v < min ? min : v > max ? max : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const fract = (v) => v - Math.floor(v);

  /** PRNG determinista (mulberry32): mismo seed => misma ciudad en cada carga. */
  function seededRandom(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const randRange = (min, max, rng = Math.random) => min + (max - min) * rng();
  const pick = (list, rng = Math.random) => list[Math.floor(rng() * list.length)];

  function debounce(fn, wait) {
    let id = 0;
    return function (...args) {
      clearTimeout(id);
      id = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  const numberFormat = new Intl.NumberFormat('en-US');
  const formatNumber = (n) => numberFormat.format(Math.floor(Number(n) || 0));

  const deepClone = (obj) =>
    typeof structuredClone === 'function' ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));

  NR.util = Object.freeze({
    clamp, lerp, fract, seededRandom, randRange, pick, debounce, formatNumber, deepClone,
  });
})(window.NR);
