/**
 * NEON RUSH — Arranque, navegación y bucle principal.
 *
 * Un único requestAnimationFrame para toda la app, con delta time limitado.
 * Qué se actualiza depende del estado:
 *   MENU / SHOP / MISSIONS / SETTINGS / TUTORIAL -> ciudad animada
 *   CHARACTER_SELECT (GARAGE)                    -> ciudad + vista previa del auto
 *   PLAYING                                      -> carrera (update + render)
 *   PAUSED / GAME_OVER                           -> escena congelada
 * El bucle se detiene con la pestaña oculta; si había carrera, se pausa.
 */
(function (NR) {
  'use strict';

  const S = NR.STATES;
  const G = NR.CONFIG.GAME;
  const { debounce, formatNumber } = NR.util;
  const Audio = NR.Audio;

  function boot() {
    const root = document.getElementById('app');
    const canvas = document.getElementById('backdrop');
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const screen = (state) => root.querySelector(`[data-screen="${state}"]`);

    NR.Storage.load();
    const save = () => NR.Storage.get();
    const effectsReduced = () => reducedMotionQuery.matches || save().settings.reducedEffects;
    Audio.applySettings(save().settings);

    const fsm = new NR.StateMachine(S.MENU);
    const backdrop = new NR.CityBackdrop(canvas, { reducedMotion: effectsReduced() });
    let frozenDirty = true;   // la escena congelada necesita redibujarse
    let actionLockUntil = 0;  // evita pulsaciones accidentales al cambiar de pantalla
    let runSave = save();     // guardado al empezar la carrera (para misiones en vivo)
    let missionTimer = 0;

    /* ---------------- Carrera ---------------- */
    const game = new NR.Game({
      backdrop,
      events: {
        onHud: (g) => ui.updateHud(g),
        onBanner: (text, tone) => ui.banner(text, tone),
        onCountdown: (label) => ui.countdown(label),
        onSfx: (name) => Audio.play(name),
        onCrash: () => Audio.engine(false),
        onGameOver: (results) => {
          commitRun();
          Audio.play('gameover');
          fsm.go(S.GAME_OVER, results);
        },
      },
    });

    const input = new NR.Input(root, (action) => game.handleAction(action));

    /** Guarda récord, energía, estadísticas y misiones una sola vez por carrera. */
    function commitRun() {
      const r = game.commit();
      if (!r) return null;
      const s = NR.Storage.update((d) => {
        NR.Missions.applyRun(d, r); // antes de sumar estadísticas (no contar dos veces)
        d.bestScore = Math.max(d.bestScore, r.score);
        d.bestDistance = Math.max(d.bestDistance, r.distance);
        d.coins += r.energy;
        d.stats.gamesPlayed += 1;
        d.stats.totalOrbs += r.orbs;
        d.stats.totalDistance += r.distance;
        d.stats.shieldsUsed += r.shields;
        d.stats.magnetsUsed += r.magnets;
        d.stats.multipliersUsed += r.multipliers;
        d.stats.nitrosUsed += r.nitros;
        d.stats.obstaclesDodged += r.dodged;
      });
      refreshMenu(s);
      return r;
    }

    function refreshMenu(s = save()) {
      ui.bindValues(s);
      ui.setBadge(NR.Missions.claimableCount(s));
    }

    /* ---------------- Pantallas con lógica propia ---------------- */
    const garage = new NR.Garage(screen(S.CHARACTER_SELECT));
    const shop = new NR.Shop(screen(S.SHOP));
    const missionsList = screen(S.MISSIONS).querySelector('[data-missions="list"]');
    const missionsSummary = screen(S.MISSIONS).querySelector('[data-missions="summary"]');
    const renderMissions = () => {
      const s = save();
      NR.Missions.render(missionsList, s);
      const done = NR.Missions.defs.filter((d) => NR.Missions.isDone(d, s)).length;
      missionsSummary.textContent = `${done} / ${NR.Missions.defs.length}`;
    };
    const tutorial = new NR.Tutorial(screen(S.TUTORIAL), {
      onFinish: () => {
        NR.Storage.update((d) => { d.settings.tutorialDone = true; });
        fsm.go(S.PLAYING);
      },
    });

    /* ---------------- Acciones ---------------- */
    const pause = () => {
      if (fsm.is(S.PLAYING) && game.canPause) fsm.go(S.PAUSED);
    };
    const resume = () => fsm.go(S.PLAYING, { resume: true });
    const startRace = () => fsm.go(save().settings.tutorialDone ? S.PLAYING : S.TUTORIAL);

    const buy = (cat, id) => {
      const res = NR.Economy.purchase(cat, id);
      if (res.ok) {
        Audio.play('purchase');
        ui.toast(`${res.item.name} desbloqueado y equipado.`, { tag: 'UNLOCKED', tone: 'green' });
      } else if (res.reason === 'funds') {
        Audio.play('deny');
        ui.toast(`Te faltan ${formatNumber(res.missing)} de energía. ¡Sigue corriendo!`, { tag: 'ENERGY', tone: 'pink' });
      }
      return res;
    };

    const refreshShops = () => {
      const s = save();
      if (fsm.is(S.SHOP)) shop.render(s);
      if (fsm.is(S.CHARACTER_SELECT)) garage.setSave(s);
      refreshMenu(s);
    };

    const setSetting = (key, value) => {
      const s = NR.Storage.update((d) => { d.settings[key] = value; });
      Audio.applySettings(s.settings);
      ui.syncSettings(s.settings);
      backdrop.setReducedMotion(effectsReduced());
    };

    let resetConfirmTimer = 0;
    const ACTIONS = {
      play: () => fsm.go(S.CHARACTER_SELECT),
      garage: () => fsm.go(S.CHARACTER_SELECT),
      shop: () => fsm.go(S.SHOP, { tab: 'cars' }),
      'open-shop': (el) => fsm.go(S.SHOP, { tab: el.dataset.tab || 'cars' }),
      missions: () => fsm.go(S.MISSIONS),
      settings: () => fsm.go(S.SETTINGS),
      back: () => fsm.go(fsm.is(S.SHOP) && fsm.previous === S.CHARACTER_SELECT ? S.CHARACTER_SELECT : S.MENU),

      'car-prev': () => garage.step(-1),
      'car-next': () => garage.step(1),
      'garage-primary': (el) => {
        if (el.dataset.mode === 'race') startRace();
        else if (el.dataset.mode === 'unlock' && buy('cars', garage.car.id).ok) garage.setSave(save());
      },
      equip: (el) => {
        NR.Economy.equip(el.dataset.cat, el.dataset.id);
        refreshShops();
      },
      buy: (el) => {
        if (buy(el.dataset.cat, el.dataset.id).ok) refreshShops();
      },
      'shop-tab': (el) => shop.setTab(el.dataset.tab, save()),
      claim: (el) => {
        const paid = NR.Missions.claim(el.dataset.id);
        if (paid) {
          Audio.play('purchase');
          ui.toast(`+${formatNumber(paid)} de energía cobrada.`, { tag: 'MISSION', tone: 'green' });
          renderMissions();
          refreshMenu();
        }
      },

      'tut-next': () => tutorial.next(),
      'tut-prev': () => tutorial.prev(),
      'tut-skip': () => tutorial.onFinish(),
      pause,
      resume,
      restart: () => { commitRun(); fsm.go(S.PLAYING); },
      retry: () => fsm.go(S.PLAYING),
      'to-menu': () => { commitRun(); fsm.go(S.MENU); },
      'replay-tutorial': () => fsm.go(S.TUTORIAL),

      'toggle-reduced': () => setSetting('reducedEffects', !save().settings.reducedEffects),
      'toggle-music': () => setSetting('musicMuted', !save().settings.musicMuted),
      'toggle-sfx': () => setSetting('sfxMuted', !save().settings.sfxMuted),
      'reset-progress': (el) => {
        // Confirmación en dos pasos sin diálogos del navegador.
        if (el.dataset.confirm !== '1') {
          el.dataset.confirm = '1';
          el.textContent = '¿SEGURO?';
          clearTimeout(resetConfirmTimer);
          resetConfirmTimer = setTimeout(() => {
            el.dataset.confirm = '';
            el.textContent = 'BORRAR';
          }, 3000);
          return;
        }
        clearTimeout(resetConfirmTimer);
        el.dataset.confirm = '';
        el.textContent = 'BORRAR';
        const s = NR.Storage.reset();
        refreshMenu(s);
        ui.syncSettings(s.settings);
        Audio.applySettings(s.settings);
        backdrop.setReducedMotion(effectsReduced());
        ui.toast('Progreso borrado.', { tag: 'SYSTEM', tone: 'pink' });
      },
    };

    const SILENT = new Set(['pause', 'resume', 'buy', 'claim', 'garage-primary', 'car-prev', 'car-next']);
    const ui = new NR.Interface(root, {
      onAction(action, el) {
        if (performance.now() < actionLockUntil) return;
        const handler = ACTIONS[action];
        if (!handler) {
          console.warn(`[NeonRush] Acción sin manejador: ${action}`);
          return;
        }
        if (!SILENT.has(action)) Audio.play('click');
        handler(el);
      },
    });

    // Deslizadores de volumen.
    root.addEventListener('input', (e) => {
      const key = e.target.dataset && e.target.dataset.setting;
      if (!key) return;
      setSetting(key, Number(e.target.value) / 100);
    });

    /* ---------------- Estados ---------------- */
    fsm.define(S.MENU, { enter: () => refreshMenu() });
    fsm.define(S.SETTINGS, { enter: () => ui.syncSettings(save().settings) });
    fsm.define(S.TUTORIAL, { enter: () => tutorial.open() });
    fsm.define(S.MISSIONS, { enter: renderMissions });
    fsm.define(S.SHOP, { enter: (from, payload) => shop.open(save(), payload && payload.tab) });
    fsm.define(S.CHARACTER_SELECT, { enter: () => garage.open(save()) });
    fsm.define(S.PLAYING, {
      enter: (from, payload) => {
        if (payload && payload.resume) {
          game.startCountdown(3);
        } else {
          runSave = save();
          NR.Missions.beginRun();
          missionTimer = 0;
          ui.resetHud();
          game.newRun({
            equipped: runSave.equipped,
            bestScore: runSave.bestScore,
            reducedEffects: effectsReduced(),
          });
        }
        input.setEnabled(true);
      },
      exit: () => input.setEnabled(false),
    });
    fsm.define(S.PAUSED, {
      enter: () => {
        ui.showPause(game);
        frozenDirty = true;
        actionLockUntil = performance.now() + 200;
      },
    });
    fsm.define(S.GAME_OVER, {
      enter: (from, results) => {
        ui.showGameOver(results);
        frozenDirty = true;
        actionLockUntil = performance.now() + 700;
      },
    });

    fsm.onChange((to) => {
      ui.showScreen(to);
      Audio.setMusic(to === S.PLAYING ? 'race' : 'menu');
      if (to !== S.PLAYING) Audio.engine(false);
    });
    ui.showScreen(fsm.current);
    refreshMenu();
    document.getElementById('version').textContent = NR.CONFIG.VERSION;

    /* ---------------- Audio: solo tras interacción del usuario ---------------- */
    const unlockAudio = () => {
      Audio.unlock();
      if (Audio.ready) {
        Audio.setMusic(fsm.is(S.PLAYING) ? 'race' : 'menu');
        window.removeEventListener('pointerdown', unlockAudio, true);
        window.removeEventListener('keydown', unlockAudio, true);
      }
    };
    window.addEventListener('pointerdown', unlockAudio, true);
    window.addEventListener('keydown', unlockAudio, true);

    /* ---------------- Teclado global (navegación) ---------------- */
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const s = fsm.current;
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (s === S.PLAYING) pause();
        else if (s === S.PAUSED) resume();
        else if (s === S.SHOP) ACTIONS.back();
        else if ([S.SETTINGS, S.TUTORIAL, S.MISSIONS, S.CHARACTER_SELECT].includes(s)) fsm.go(S.MENU);
        return;
      }
      if (s === S.TUTORIAL) {
        if (e.code === 'ArrowRight') tutorial.next();
        else if (e.code === 'ArrowLeft') tutorial.prev();
      } else if (s === S.CHARACTER_SELECT) {
        if (e.code === 'ArrowRight' || e.code === 'KeyD') garage.step(1);
        else if (e.code === 'ArrowLeft' || e.code === 'KeyA') garage.step(-1);
      } else if (s === S.MENU && e.code === 'Enter' && document.activeElement === document.body) {
        fsm.go(S.CHARACTER_SELECT);
      }
    });

    /* ---------------- Bucle ---------------- */
    let rafId = 0;
    let last = 0;

    function frame(now) {
      rafId = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, NR.CONFIG.MAX_DT);
      last = now;

      switch (fsm.current) {
        case S.PLAYING:
          game.update(dt);
          if (fsm.is(S.PLAYING)) {
            game.render();
            const running = !game.crashed && game.countdown <= 0;
            Audio.engine(running, (game.speed - G.SPEED_MIN * 0.6) / (G.SPEED_MAX * 1.4), game.car.nitroActive, game.car.braking);
            missionTimer += dt;
            if (running && game.time > 1 && missionTimer > 0.3) {
              missionTimer = 0;
              for (const def of NR.Missions.checkLive(runSave, game.results())) {
                game.bonus(G.MISSION_BONUS, 'MISIÓN');
                Audio.play('mission');
                ui.toast(`Misión completada: ${def.name}. Cobra la recompensa en MISSIONS.`, { tag: 'MISSION', tone: 'green' });
              }
            }
          }
          break;
        case S.PAUSED:
        case S.GAME_OVER:
          if (frozenDirty) {
            game.render();
            frozenDirty = false;
          }
          break;
        case S.CHARACTER_SELECT:
          backdrop.update(dt);
          backdrop.render();
          garage.update(dt);
          garage.render();
          break;
        default:
          backdrop.update(dt);
          backdrop.render();
      }
    }

    function start() {
      if (rafId) return;
      last = performance.now();
      rafId = requestAnimationFrame(frame);
    }

    function stop() {
      cancelAnimationFrame(rafId);
      rafId = 0;
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        pause();
        stop();
        Audio.suspend();
      } else {
        start();
        Audio.resume();
      }
    });
    window.addEventListener('blur', pause);
    window.addEventListener('resize', debounce(() => {
      backdrop.resize();
      game.resize();
      garage.resize();
      frozenDirty = true;
    }, 120));
    reducedMotionQuery.addEventListener?.('change', () => backdrop.setReducedMotion(effectsReduced()));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    start();

    // Acceso para depuración desde la consola: NR.app
    NR.app = { fsm, ui, backdrop, game, input, garage, shop, storage: NR.Storage, audio: Audio };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(window.NR);
