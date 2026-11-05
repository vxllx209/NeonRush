/**
 * NEON RUSH — Persistencia segura en LocalStorage.
 *
 * - Esquema versionado (v2) con migración desde v1.
 * - Todo lo que se lee se sanea: tipos, rangos, enteros no negativos,
 *   ids que existen en el catálogo, equipamiento siempre desbloqueado.
 * - Si LocalStorage no está disponible (modo privado, cuota llena), el juego
 *   sigue funcionando en memoria.
 * - Un guardado corrupto se respalda en `<KEY>.corrupt` y se restablece.
 *
 * Uso: Storage.update(d => { d.coins += 10; });
 */
(function (NR) {
  'use strict';

  const { STORAGE_KEY, SAVE_VERSION } = NR.CONFIG;
  const { clamp, deepClone } = NR.util;
  const CAT = NR.CATALOG;

  const EQUIP_KEYS = { cars: 'car', paints: 'paint', trails: 'trail', effects: 'effect' };

  function defaults() {
    return {
      version: SAVE_VERSION,
      bestScore: 0,
      bestDistance: 0,
      coins: 0,
      starterChosen: false, // el primer auto (gratis) se elige en la pantalla STARTER
      unlocked: {
        cars: [],
        paints: [CAT.DEFAULTS.paints],
        trails: [CAT.DEFAULTS.trails],
        effects: [CAT.DEFAULTS.effects],
      },
      equipped: {
        car: null, // ningún auto hasta elegir el primero
        paint: CAT.DEFAULTS.paints,
        trail: CAT.DEFAULTS.trails,
        effect: CAT.DEFAULTS.effects,
      },
      missions: {},
      settings: {
        musicVolume: 0.6,
        sfxVolume: 0.8,
        musicMuted: false,
        sfxMuted: false,
        reducedEffects: false,
        tutorialDone: false,
      },
      stats: {
        gamesPlayed: 0,
        totalOrbs: 0,
        totalDistance: 0,
        shieldsUsed: 0,
        magnetsUsed: 0,
        multipliersUsed: 0,
        nitrosUsed: 0,
        obstaclesDodged: 0,
      },
    };
  }

  const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const toInt = (v, fallback) =>
    Number.isFinite(v) ? clamp(Math.floor(v), 0, Number.MAX_SAFE_INTEGER) : fallback;

  function sanitize(raw) {
    const d = defaults();
    if (!isObject(raw)) return d;

    d.bestScore = toInt(raw.bestScore, d.bestScore);
    d.bestDistance = toInt(raw.bestDistance, d.bestDistance);
    d.coins = toInt(raw.coins, d.coins);
    d.starterChosen = raw.starterChosen === true;

    // Inventario: solo ids existentes, sin duplicados. Pinturas, estelas y
    // efectos incluyen siempre el gratuito; los autos NO (el primero se elige).
    if (isObject(raw.unlocked)) {
      for (const cat of Object.keys(d.unlocked)) {
        const list = Array.isArray(raw.unlocked[cat]) ? raw.unlocked[cat] : [];
        const valid = list.filter((id) => typeof id === 'string' && CAT.find(cat, id));
        d.unlocked[cat] = [...new Set(cat === 'cars' ? valid : [CAT.DEFAULTS[cat], ...valid])];
      }
    }

    // Equipamiento: solo se puede equipar lo desbloqueado.
    if (isObject(raw.equipped)) {
      for (const [cat, key] of Object.entries(EQUIP_KEYS)) {
        const id = raw.equipped[key];
        if (typeof id === 'string' && d.unlocked[cat].includes(id)) d.equipped[key] = id;
      }
    }
    // Si hay autos pero el equipado no es válido, se equipa el primero que se posea.
    if (!d.equipped.car && d.unlocked.cars.length) d.equipped.car = d.unlocked.cars[0];

    // Misiones: { id: { progress, done, claimed } }
    if (isObject(raw.missions)) {
      for (const [id, m] of Object.entries(raw.missions)) {
        if (!isObject(m) || id.length > 40) continue;
        d.missions[id] = {
          progress: toInt(m.progress, 0),
          done: m.done === true,
          claimed: m.claimed === true && m.done === true,
        };
      }
    }

    if (isObject(raw.settings)) {
      for (const key of Object.keys(d.settings)) {
        const value = raw.settings[key];
        const def = d.settings[key];
        if (typeof def === 'number' && Number.isFinite(value)) d.settings[key] = clamp(value, 0, 1);
        else if (typeof def === 'boolean' && typeof value === 'boolean') d.settings[key] = value;
      }
    }

    if (isObject(raw.stats)) {
      for (const key of Object.keys(d.stats)) d.stats[key] = toInt(raw.stats[key], d.stats[key]);
    }

    return d;
  }

  /** Migraciones entre versiones del guardado. */
  function migrate(raw) {
    if (!isObject(raw)) return raw;
    if (!raw.version || raw.version < 2) {
      // v1: `unlocked` era un array de personajes y existía `selectedCharacter`.
      // Los personajes de v1 (neo, volt, shadow) pasan a ser los autos homónimos.
      const oldUnlocked = Array.isArray(raw.unlocked) ? raw.unlocked : [];
      raw.unlocked = { cars: oldUnlocked };
      raw.equipped = { car: raw.selectedCharacter };
      delete raw.selectedCharacter;
      raw.version = 2;
    }
    if (raw.version < 3) {
      // v3: el primer auto se elige gratis en la pantalla STARTER. Las partidas
      // existentes conservan sus autos y también reciben esa elección gratuita.
      raw.starterChosen = false;
      raw.version = 3;
    }
    return raw;
  }

  function probeLocalStorage() {
    try {
      const k = '__nr_probe__';
      window.localStorage.setItem(k, '1');
      window.localStorage.removeItem(k);
      return true;
    } catch {
      return false;
    }
  }

  const Storage = {
    available: false,
    _data: defaults(),

    load() {
      this.available = probeLocalStorage();
      if (!this.available) {
        console.warn('[NeonRush] LocalStorage no disponible: el progreso no se guardará.');
        this._data = defaults();
        return this.get();
      }

      let rawText = null;
      try {
        rawText = window.localStorage.getItem(STORAGE_KEY);
        this._data = rawText ? sanitize(migrate(JSON.parse(rawText))) : defaults();
        if (rawText) this._persist(); // reescribe con el esquema actual
      } catch (err) {
        console.warn('[NeonRush] Guardado corrupto; se restablece.', err);
        try { window.localStorage.setItem(`${STORAGE_KEY}.corrupt`, String(rawText)); } catch { /* sin espacio */ }
        this._data = defaults();
        this._persist();
      }
      return this.get();
    },

    /** Copia profunda: modificarla no altera el estado guardado. */
    get() {
      return deepClone(this._data);
    },

    /** Aplica una mutación sobre un borrador, sanea y persiste. */
    update(mutator) {
      const draft = deepClone(this._data);
      mutator(draft);
      this._data = sanitize(draft);
      this._persist();
      return this.get();
    },

    reset() {
      this._data = defaults();
      this._persist();
      return this.get();
    },

    _persist() {
      if (!this.available) return false;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
        return true;
      } catch (err) {
        console.warn('[NeonRush] No se pudo guardar el progreso.', err);
        return false;
      }
    },
  };

  NR.Storage = Storage;
  NR.EQUIP_KEYS = EQUIP_KEYS;
})(window.NR);
