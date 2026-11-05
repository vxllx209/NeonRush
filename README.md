# NEON RUSH

Carreras arcade infinitas de estética cyberpunk. Conduce un auto por una autopista
de neón de tres carriles: esquiva, recoge energía y supera tu récord.
**RUN. SURVIVE. REPEAT.**

HTML5 + CSS3 + JavaScript ES6+ + Canvas API + WebAudio, sin frameworks ni build
ni archivos de imagen o sonido: todo se dibuja y se sintetiza en tiempo real.

## Cómo ejecutarlo

Abre `index.html` en un navegador moderno (doble clic). Los scripts son clásicos
(no ES modules), así que funciona también con `file://`.

Opcional, con servidor local:

```bash
python -m http.server 8000   # y abre http://localhost:8000
```

Las fuentes (Orbitron, Rajdhani) se cargan de Google Fonts; sin conexión se usan
fuentes del sistema como respaldo.

## Flujo del juego

`MENU → PLAY NOW → GARAGE (elige auto, pintura, estela y efecto) → RACE → (tutorial la primera vez) → carrera → GAME OVER → TRY AGAIN / GARAGE / MENU`

## Controles

| Acción | Teclado | Táctil |
|---|---|---|
| Cambiar de carril | ← → / A D | Deslizar izquierda / derecha |
| Nitro (con la barra llena) | ↑ / W / Espacio | Deslizar hacia arriba |
| Frenar (mantener; se sobrecalienta) | ↓ / S | Deslizar hacia abajo y mantener |
| Pausa / reanudar | ESC / P | Botón ❚❚ |
| Cambiar de auto en el garaje | ← → | Flechas o deslizar sobre el auto |

El auto **no salta**: todos los obstáculos se evitan cambiando de carril o
calculando el momento (frenando).

## Contenido

**Autos:** 21 skins en 5 carrocerías. Son cosméticos, todos con la misma hitbox
(sin ventajas). El garaje los recorre del más barato al más caro.

| Carrocería | Autos |
|---|---|
| Fórmula | NEO-1 (gratis), REDLINE F, BLAZE R, AURORA, COBALT 9, PHANTOM |
| Deportivo | NOVA GT, VOLT GT, EMBER GT, GLACIER, VIPER RS |
| Hiperdeportivo | SHADOW X, ECLIPSE, SPECTER, NEBULA |
| Prototipo | APEX LMP, ZENITH, INFERNO |
| Muscle | THUNDER, REBEL 69, OUTLAW (3.000) |

**Tienda:** autos, 6 pinturas, 5 estelas y 4 efectos (neón inferior, chispas,
aura). Comprueba el saldo antes de comprar, impide compras duplicadas y nunca
deja el saldo en negativo.

**Obstáculos:**
- Barricada: cambiar de carril.
- Campo de energía de 1-2 carriles: se anuncia con marcas rosas en el suelo.
- Compuerta láser intermitente: solo se cruza en verde y parpadea en ámbar antes
  de encenderse.
- Tráfico lento: algunos autos cambian de carril tras encender el intermitente.
- Secuencias combinadas.

**Power-ups:**
- ESCUDO (5 s): absorbe un choque.
- IMÁN (8 s): atrae los orbes.
- x2 (10 s): duplica los puntos.

**Puntuación:**
- Distancia × multiplicador.
- Nitro: distancia ×2.
- Orbes: +10 (+50 los verdes).
- +5 por fila esquivada.
- +50 por power-up.
- +100 cada 15 s de supervivencia.
- +500 por misión completada durante la carrera.
- El multiplicador de nivel sube x0,5 cada 450 m, hasta x3.

**Dificultad:**
- La velocidad sube suavemente de 13 a 32.
- El tiempo de reacción baja de 1,2 s a 0,62 s.
- Aparecen patrones nuevos a los 14 s y a los 42 s.

**Misiones:** 12 contratos (orbes, supervivencia, puntos, escudo, esquivas, nitro,
etc.). La recompensa se cobra en MISSIONS y solo una vez.

**Audio:**
- Música electrónica procedural (menú y carrera).
- Motor que responde a la velocidad.
- Efectos de sonido.
- Volumen y silencio por separado para música y efectos.
- No suena nada hasta la primera interacción.

## Arquitectura

- Espacio de nombres global `window.NR`; cada archivo de `js/` registra un módulo.
- Un solo `requestAnimationFrame` con delta time limitado (`MAX_DT`). Se detiene
  y pausa la carrera cuando la pestaña se oculta.
- Máquina de estados (`js/state.js`) con transiciones explícitas:
  `MENU, CHARACTER_SELECT (GARAGE), SHOP, MISSIONS, SETTINGS, TUTORIAL, PLAYING, PAUSED, GAME_OVER`.
- Cada pantalla es un `<section data-screen="ESTADO">`; las inactivas quedan `inert`.
- Un único listener delegado para `[data-action]`: reiniciar no acumula eventos.
- Generación por posiciones absolutas de la pista (independiente de los FPS),
  con reglas de equidad: cada fila deja un carril libre y el tráfico se programa
  por su punto de encuentro exacto.
- Persistencia versionada (v2, con migración desde v1) y saneada.
- Pools y compactación en sitio: no se crean objetos por frame en el bucle.

```
index.html
css/
  style.css        tokens, reset, botones, chips, toasts
  animations.css   keyframes y entradas
  menu.css         menú principal
  screens.css      paneles: tutorial, ajustes, tienda, misiones, pausa
  garage.css       garaje (landing de selección de auto)
  game.css         HUD, medidores, power-ups, cuenta atrás, game over
js/
  config.js        constantes: paleta, gameplay, dificultad, puntuación
  catalog.js       autos, pinturas, estelas, efectos
  utils.js         utilidades puras
  storage.js       LocalStorage seguro y versionado
  state.js         máquina de estados
  audio.js         música, motor y efectos (WebAudio)
  effects.js       pool de partículas
  background.js    ciudad con parallax (menús y fondo de carrera)
  world.js         cámara en perspectiva + autopista
  car.js           física del auto, estela y renderizador de autos
  obstacles.js     barricadas, campos, compuertas láser y tráfico
  collectibles.js  orbes y power-ups
  spawner.js       generador de patrones con reglas de equidad
  game.js          núcleo de la carrera
  input.js         teclado + gestos táctiles
  missions.js      misiones y recompensas
  garage.js        garaje: vista previa animada y selección
  shop.js          tienda y economía
  tutorial.js      tutorial de 5 pasos
  interface.js     pantallas, HUD, paneles, toasts
  main.js          arranque, navegación y bucle
assets/icons/      favicon
```

## Estado del desarrollo

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Estructura, sistema visual, escena de fondo | ✅ |
| 2 | Navegación, tutorial, ajustes | ✅ |
| 3 | Carrera básica y conducción | ✅ |
| 4 | Obstáculos, colisiones, orbes | ✅ |
| 5 | Puntuación y dificultad | ✅ |
| 6 | Power-ups y efectos | ✅ |
| 7 | Autos, garaje y tienda | ✅ |
| 8 | Misiones, audio, ajustes, persistencia | ✅ |
| 9 | Responsive, rendimiento, pruebas | ✅ |

**Pruebas realizadas:**
- Bot de equidad: 8 carreras simuladas de hasta 4 minutos. Sin patrones
  imposibles; el tráfico nunca provocó un choque.
- Escritorio, móvil vertical y móvil horizontal.
- Gestos táctiles.
- Compras (saldo insuficiente y compras duplicadas).
- Misiones (cobro único).
- Audio y silencio.
- Migración del guardado.
- Rendimiento: ~3 ms por frame.
- Consola sin errores.

Depuración: `NR.app` en la consola expone `fsm`, `game`, `garage`, `shop`,
`storage`, `audio`, etc.
