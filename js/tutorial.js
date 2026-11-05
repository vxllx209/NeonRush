/**
 * NEON RUSH — Tutorial breve (5 pasos, se puede omitir).
 * Muestra los controles de teclado o los gestos táctiles según el dispositivo.
 */
(function (NR) {
  'use strict';

  const STEPS = [
    {
      id: 'lanes', title: 'CAMBIA DE CARRIL',
      text: 'Tu auto acelera solo por una autopista de tres carriles. Muévete entre ellos para esquivar.',
      keys: ['←', '→', 'A', 'D'], touch: 'Desliza a izquierda o derecha',
    },
    {
      id: 'nitro', title: 'NITRO',
      text: 'Cada orbe carga el nitro. Con la barra llena: más velocidad y puntos dobles durante 3 s.',
      keys: ['↑', 'W', 'SPACE'], touch: 'Desliza hacia arriba',
    },
    {
      id: 'brake', title: 'FRENA',
      text: 'Mantén el freno para ganar tiempo de reacción. Si lo abusas se sobrecalienta y deja de funcionar un momento.',
      keys: ['↓', 'S'], keysLabel: 'mantener', touch: 'Desliza hacia abajo y mantén el dedo',
    },
    {
      id: 'orbs', title: 'ENERGÍA Y POWER-UPS',
      text: 'Los orbes dan puntos y energía para el garaje (los verdes ×5). Power-ups: ESCUDO, IMÁN y x2.',
      keys: [], touch: '',
    },
    {
      id: 'avoid', title: 'NO TE ESTRELLES',
      text: 'Bloques y campos de energía no se atraviesan. Las compuertas láser solo se cruzan en verde y el tráfico avisa con el intermitente antes de cambiar de carril.',
      keys: ['ESC'], keysLabel: 'Pausa', touch: 'Pausa con el botón ❚❚',
    },
  ];

  class Tutorial {
    constructor(root, { onFinish }) {
      this.root = root;
      this.onFinish = onFinish;
      this.step = 0;
      this.coarse = window.matchMedia('(pointer: coarse)');
      this.el = {
        scene: root.querySelector('.tut-scene'),
        title: root.querySelector('[data-tut="title"]'),
        text: root.querySelector('[data-tut="text"]'),
        controls: root.querySelector('[data-tut="controls"]'),
        count: root.querySelector('[data-tut="count"]'),
        dots: root.querySelector('[data-tut="dots"]'),
        prev: root.querySelector('[data-action="tut-prev"]'),
        next: root.querySelector('[data-action="tut-next"]'),
      };
      this.el.dots.replaceChildren(...STEPS.map(() => document.createElement('i')));
    }

    open() {
      this.step = 0;
      this._render();
    }

    next() {
      if (this.step >= STEPS.length - 1) return this.onFinish();
      this.step++;
      this._render();
    }

    prev() {
      if (this.step === 0) return;
      this.step--;
      this._render();
    }

    _render() {
      const s = STEPS[this.step];
      const last = this.step === STEPS.length - 1;
      this.el.scene.dataset.step = s.id;
      this.el.title.textContent = s.title;
      this.el.text.textContent = s.text;
      this.el.count.textContent = `${this.step + 1} / ${STEPS.length}`;
      [...this.el.dots.children].forEach((d, i) => d.classList.toggle('is-on', i <= this.step));
      this.el.prev.disabled = this.step === 0;
      this.el.next.textContent = last ? 'START RACE' : 'NEXT';
      this.el.next.classList.toggle('btn--primary', last);

      const c = this.el.controls;
      c.replaceChildren();
      if (this.coarse.matches && s.touch) {
        const span = document.createElement('span');
        span.className = 'tut-touch';
        span.textContent = s.touch;
        c.append(span);
      } else if (s.keys.length) {
        for (const k of s.keys) {
          const kbd = document.createElement('kbd');
          kbd.textContent = k;
          c.append(kbd);
        }
        if (s.keysLabel) {
          const span = document.createElement('span');
          span.className = 'tut-touch';
          span.textContent = s.keysLabel;
          c.append(span);
        }
      }
      this.el.scene.classList.remove('is-playing');
      void this.el.scene.offsetWidth; // reinicia la animación
      this.el.scene.classList.add('is-playing');
    }
  }

  NR.Tutorial = Tutorial;
})(window.NR);
