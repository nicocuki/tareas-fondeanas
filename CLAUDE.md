# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma y preferencias del autor

- **Escribí todo en español rioplatense**: la interfaz, los comentarios del código, los mensajes
  de error, los nombres de los tests y las respuestas al usuario. Usá "vos/tenés/podés", no "tú/tienes".
  Los identificadores del código quedan en inglés (`currentTeam`, `spymaster`), los textos visibles en español.
- **Mantené el repo limpio**: si un archivo deja de usarse, borralo en vez de dejarlo al costado.
  Ya se eliminó un prototipo viejo (`codigo-secreto.jsx`) por esto. No dejes archivos de respaldo,
  `.old`, ni código muerto. `dist/` y `.firebase/` son artefactos: no se versionan ni se dejan en el árbol.
- **Siempre subí los cambios a Firebase.** Todo cambio termina desplegado (ver *Desplegar*),
  aunque el pedido no lo diga y sin preguntar. Un cambio que no está publicado no está terminado.
  El orden es: tests → navegador → deploy → borrar las salas de prueba → borrar `dist/` y `.firebase/`.
- **Verificá en un navegador de verdad**, no solo con los tests. Varias cosas del juego (votación,
  chat por equipo, revelado diferido) necesitan varios jugadores simultáneos para probarse.

## Vocabulario del juego

El autor usa estos nombres; la interfaz los refleja:

| En el código | Como lo dice el usuario | Qué hace |
|---|---|---|
| `spymaster` | **espía**, líder, capitán | Ve los colores del tablero y da la pista |
| `operative` | **agente**, miembro | Toca las casillas sin ver los colores |

## Comandos

```bash
npm install
npm run dev          # servidor de desarrollo (Vite)
npm test             # tests de la lógica del juego
npm run build        # genera dist/
npm run preview      # sirve dist/ localmente
```

Un test solo (el patrón matchea contra el nombre del test, en español):

```bash
node --test-name-pattern="la pista N da exactamente N intentos" --test tests/game.test.js
```

### Desplegar

`firebase` no está instalado globalmente, pero las credenciales sí están guardadas en
`~/.config/configstore/firebase-tools.json`. **Siempre buildear antes**, porque `dist/` no existe
en un árbol limpio:

```bash
npm run build && npx firebase-tools@latest deploy --only hosting --non-interactive
```

Proyecto: `secreto-aed7e` · Sitio: https://secreto-aed7e.web.app

Desplegá **solo hosting**. `database.rules.json` casi nunca cambia y mandarlo pisaría las reglas vivas.

Para borrar una sala de prueba de la base:

```bash
curl -X DELETE https://secreto-aed7e-default-rtdb.firebaseio.com/rooms/ABCD.json
```

## De qué se trata el juego

Es un Codenames online. Cada jugador entra desde su propia pantalla a una sala de 4 letras.

- El tablero tiene palabras repartidas entre los equipos, casillas **neutrales** (blancas) y
  **bombas** (negras). Solo los espías ven de quién es cada palabra.
- El espía de turno manda **una sola palabra** y un número: "playa 3" significa "tres palabras
  del tablero se relacionan con playa". La pista no puede ser una palabra del tablero ni tener espacios.
- Los agentes tocan casillas. **El número da exactamente esa cantidad de intentos** (no N+1).
- Gana el equipo que destapa todas sus palabras. Tocar una bomba elimina al equipo: con 2 equipos
  gana el otro, con 3 o 4 la partida sigue sin él.

### Modificadores del lobby (solo el anfitrión)

| Opción | Valores | Efecto |
|---|---|---|
| `teamCount` | 2 / 3 / 4 | Rojo, azul, amarillo, verde. Tablero 5×5, 6×6 o 7×7 |
| `bombs` | 1 a 5 | Casillas negras |
| `keepAfterNeutral` | bool | Si tocar una blanca corta o no los intentos que quedan. Solo «al instante» |
| `keepAfterOpponent` | bool | Ídem, pero con una casilla de otro equipo. Solo «al instante» |
| `clueMinutes` | 0/1/2/3/5/10 | Reloj del espía. 0 = sin límite |
| `guessMinutes` | 0/1/2/3/5/10 | Reloj de los agentes |
| `instantReveal` | bool | Cómo se eligen las casillas: ver *Los dos modos de elegir* |

**Cada equipo siempre aporta la misma cantidad de palabras**: 9 el que abre y 8 los demás.
Lo que crece con más equipos son las neutrales, para llenar el tablero cuadrado.

### Chat

Dos canales, en pestañas:

- **Global**: todos los jugadores, solo con mensajes rápidos (`CHAT_MESSAGES`: Apurate, Dale
  rapido, Mish, Virgo). No se escribe.
- **Equipo**: solo los agentes de un mismo equipo, **con texto libre** (hasta 140 caracteres).
  Es para discutir qué casillas elegir, así que ahí sí se pueden nombrar palabras del tablero.
  El espía no entra: la pestaña le aparece deshabilitada y el reducer rechaza sus mensajes.

Los nombres aparecen del color del equipo. Un mensaje global guarda el índice del mensaje
rápido en `m`; uno de equipo guarda el texto en `x`.

### Los dos modos de elegir (`instantReveal`)

En los dos, tocar una casilla abre una ✕ y un ✓, y el ✓ es un **voto**. Con un solo agente la
mayoría es 1, así que votar equivale a elegir: el mismo código sirve para uno o para varios.

**Al instante** (`true`, el modo clásico):
- La casilla se destapa apenas la vota la mayoría del equipo, y el turno sigue o se corta
  según de quién era (y según `keepAfterNeutral` / `keepAfterOpponent`).
- **El voto es definitivo**: cada agente vota una sola casilla y no la puede sacar. Por eso existe
  la regla 5 («No se puede cambiar una elección después de confirmarla»).
- Si votan todos sin mayoría, los votos se borran y se vota de nuevo (`voteReset`), si no el turno
  se trabaría.

**Al terminar el turno** (`false`):
- Una casilla con mayoría queda **elegida**, pero **no se destapa**. Nada se resuelve solo, ni
  siquiera al llegar al número de la pista.
- Cada agente vota hasta `clue.number` casillas y puede **sacar sus votos** (acción `unvote`)
  volviendo a tocarlas. El equipo nunca tiene más elegidas que intentos.
- **Solo «Terminar turno» destapa** (o el reloj, si se acaba). Ahí se ven todas las elegidas juntas
  y el turno siempre pasa. Si entre ellas hay una bomba, eso pesa más que cualquier otra cosa.
- La regla 5 no se muestra, y `keepAfterNeutral` / `keepAfterOpponent` se deshabilitan en el lobby:
  como todo se ve a la vez, no hay «después de una blanca».
- `pickedCards(room)` calcula las elegidas a partir de los votos; la interfaz y el reducer usan la
  misma función para no ofrecer un ✓ que después se rechace.

## Arquitectura

### La regla de oro: `src/codigo-secreto/game.js` es lógica pura

Todo el juego es un **reducer sin React ni red**. `applyAction(room, action, { rand, now })`
devuelve la sala nueva, o `null` si la acción no es válida para ese estado. No lee el reloj ni
el random por su cuenta: los recibe, y por eso se puede testear con valores fijos.

Esto importa porque el reducer **corre dentro de la transacción de Firebase**
(`runTransaction` en `storage-firebase.js`): si dos jugadores mandan una jugada al mismo tiempo,
la segunda se reaplica sobre el estado ya actualizado. Consecuencias al tocar el código:

- Nada de `Math.random()`, `Date.now()`, `fetch` ni estado de React dentro de `game.js`.
- Toda validación va en el reducer, no en la interfaz. Lo de la interfaz es para avisar antes;
  lo que realmente protege la partida es el `return null`.
- Las acciones de jugada llevan `round` y `turn`; si no coinciden con los de la sala, se descartan.
  Así una jugada de un turno viejo que llega tarde no hace nada.

### La sala entera es un string JSON

Firebase guarda cada sala como **un solo string** en `rooms/<CÓDIGO>`, no como un objeto.
Es a propósito: Realtime Database borra los arrays vacíos y los `null`, y eso rompía el tablero.
`serializeRoom` / `parseRoom` hacen la conversión.

`database.rules.json` limita cada sala a **30.000 caracteres**. Si una escritura lo pasa,
Firebase la rechaza, y como todo vive en la misma sala **se traba la partida entera**, no solo
ese campo. El peor caso hoy (4 equipos, 20 jugadores, los cuatro chats de equipo llenos de
texto con comillas, bitácora llena) da ~19.500. Hay un test que lo verifica.

Cualquier campo nuevo que crezca tiene que llevar su tope. El chat tiene dos: cantidad por
canal (`MAX_CHAT` para el global, `MAX_TEAM_CHAT` para cada equipo) y un presupuesto en
caracteres (`CHAT_BUDGET`) que tira los mensajes más viejos si el texto libre pesa demasiado.
La bitácora tiene `MAX_LOG`.

`parseRoom` pasa por `normalizeRoom`, que rellena lo que falte. Eso deja que una sala guardada
por una versión anterior siga abriéndose sin romper.

### Los archivos

| Archivo | Qué es |
|---|---|
| `src/codigo-secreto/game.js` | Reducer, reglas, validaciones, generación del tablero de Código Secreto |
| `src/codigo-secreto/words.js` | 980 palabras únicas del pozo |
| `src/menu/MainMenu.jsx` `src/menu/Credits.jsx` | Menú principal de selección de juegos y créditos |
| `src/cafeote/` | Componentes y lógica del juego Café o Té |
| `src/futbol/` | Componentes, física y lógica del juego Fútbol 2D |
| `src/lobby/` | Componentes unificados y reutilizables para las salas de espera de todos los juegos |
| `src/App.jsx` | Pantalla principal, enrutador de juegos y estado local |
| `src/codigo-secreto/Options.jsx` `Chat.jsx` `Rules.jsx` `Players.jsx` | Paneles de la interfaz de Código Secreto |
| `src/theme.js` | Colores y estilos compartidos |
| `src/storage.js` | Elige el backend según haya o no Firebase configurado |
| `src/storage-firebase.js` | Transacciones y suscripciones contra Realtime Database |
| `src/storage-local.js` | Backend de desarrollo en localStorage, solo entre pestañas |
| `src/session.js` | Quién sos: `sessionStorage` por pestaña, `localStorage` por dispositivo |

La partida tiene tres columnas: jugadores a la izquierda (cada nombre del color de su equipo),
tablero al medio, reglas/chat/bitácora a la derecha. El reparto está en `index.css` con
`grid-template-areas`: en pantallas medianas los jugadores suben a la columna derecha y en
celular va todo apilado con el tablero primero.

`docs/captura.png` es la imagen del README: una partida armada a mano con `game.js`, escrita en
la base y abierta como el espía rojo. Si la interfaz cambia mucho, conviene rehacerla.

Si `firebaseConfig.databaseURL` queda vacío, la app arranca en modo local automáticamente y
avisa con un cartel. Sirve para desarrollar sin tocar la base real.

### Acciones del reducer

`join` `leave` `pickRole` `setOptions` `start` `setPaused` `chat` `clue` `vote` `unvote` `endTurn`
`timeout` `newRound` `toLobby`

Notas sobre algunas:

- **`vote`** / **`unvote`**: ver *Los dos modos de elegir*. `unvote` solo existe al terminar el turno.
- **`endTurn`**: al instante pasa el turno (exige haber destapado una); al terminar el turno
  destapa las elegidas con `resolvePicks` (exige tener al menos una).
- **`timeout`** la manda cualquier cliente cuando ve el reloj en cero. El reducer verifica
  `now >= timer.deadline`, y la transacción deja pasar solo al primero. Al terminar el turno,
  destapa lo que ya estuviera elegido antes de pasar.
- **`setPaused`** congela el reloj guardando lo que quedaba en `timer.left`, y al reanudar lo
  convierte de nuevo en `deadline`.

### Cosas que ya mordieron

- **La pista de los tests no puede existir en el pozo de palabras.** `tests/game.test.js` usa
  `CLUE_WORD = 'zarpadisimo'` justamente por eso: antes usaba `'pista'`, que está entre las 980
  palabras, y los tests fallaban al azar cuando caía en el tablero.
- **El equipo que abre sale al azar.** El helper `playingRoom()` rearma la sala hasta que empiece
  rojo, porque el que abre tiene 9 palabras y el resto 8. Forzar `currentTeam` a mano deja el
  tablero inconsistente con el reparto.
- **El chat de equipo es un filtro de la interfaz, no un secreto criptográfico.** Todo el estado
  de la sala viaja junto, así que alguien mirando la base podría leerlo. Alcanza para jugar entre
  amigos; no lo presentes como más que eso.
- **En «al terminar el turno» las elegidas siguen sin destapar.** Un test o un script que busque
  «la primera casilla roja sin destapar» va a encontrar otra vez la que ya eligió. Pasó.
- **Los atributos `data-pick`, `data-opt`, `data-chat-list` y `data-players`** existen para poder
  manejar la app desde un navegador automatizado. No los saques.

## Fútbol: sincronización en tiempo real

Todo en `src/futbol/net.js` (lógica pura, con tests en `tests/futbol-net.test.js`), `src/futbol/p2p.js`
(conexión directa) y el bucle de `FutbolGame.jsx`.

**Las fotos van directo entre navegadores (WebRTC DataChannel, sin orden ni reenvíos)**, una por cuadro.
El hosting es estático, así que no hay servidor WebSocket propio; y por Firebase cada foto tardaba de
200 a 1.200 ms. Firebase queda para tres cosas: la señalización (presentar a las pantallas), el partido
(`match`, con transacción) y el **respaldo**: si con alguien no se arma el canal directo (redes que lo
bloquean; no hay servidor TURN), las fotos para esa persona siguen yendo por Firebase cada 50 ms. Si
todos reciben directo, igual se escribe en Firebase una foto por segundo. Lo mismo puede llegar por los
dos caminos: la copia más vieja se descarta sola en `receiveSnapshot` (hora anterior a la última).

- Cada par de pantallas arma un solo canal y **lo inicia la de id menor**. Cada montaje tiene una
  sesión (`sid`) nueva; un mensaje dirigido a una sesión vieja se ignora. Solo el que inicia reintenta
  (hasta 4 veces, si no abre en 8 s).
- «¿Todos reciben directo?» se pregunta por **los jugadores de la sala**, no por los anunciados: alguien
  sin WebRTC nunca se anuncia, y si se lo contara por los anunciados se le dejaría de mandar por Firebase.
- El HUD muestra el estado bajo el reloj (`data-link`: `directo`, `mixto` o `firebase`).
- Por el canal viajan `{ c: 'p' | 'b' | 'm' | 'u', d }`: jugador, pelota, partido (tras un gol) y turbo.

**La física corre a paso fijo** (`PHYSICS_STEP_MS`, 1/120 s, con `fixedSteps`), online y en el 1v1
local. Con el paso igual al largo del cuadro, una pantalla de 144 Hz y otra de 60 Hz resolvían distinto
los choques y las patadas, y cada una veía otra pelota. Lo propio se dibuja interpolado entre los dos
últimos pasos (`captureBodies` / `blendBodies`), así no hay tirones.

En la base, todo va por `futbol/{sala}`, **fuera** de `rooms/`: son fotos que se pisan
muchas veces por segundo y no pasan por el reducer ni por el tope de 30.000 caracteres.

| Rama | Quién escribe | Qué es |
|---|---|---|
| `players/{id}` | solo ese jugador | Su foto: posición, velocidad, ángulo/turbo/flip o patada/estámina, y sus teclas en bits |
| `ball` | quien la tocó último | Posición y velocidad, con dueño `o` y cambios de dueño `s` |
| `match` | cualquiera, con transacción | Saque `k`, hora del servidor en que se juega `at`, reloj `c`, marcador `sr`/`sb` |
| `pickups/{i}` | quien agarró el turbo | Hora a la que reaparece (modo coches) |
| `peers/{id}` | solo ese jugador | Su sesión, para armar la conexión directa. Se borra al desconectarse |
| `signal/{id}` | cualquiera | Buzón de oferta, respuesta y candidatos WebRTC para ese jugador. Se borra al leerse |

Las reglas de `database.rules.json` ya permiten `futbol/{4 letras}`; sin eso el online no anda.

**La regla central: cada pantalla es dueña de su jugador.** Lo mueve con la física local en el mismo
cuadro en que se aprieta la tecla, y publica una foto por cuadro por el canal directo (quieto, cada 500 ms). **Nunca** se
aplica sobre el jugador local nada que venga de la red: eso era exactamente el lag del segundo
jugador en la versión anterior, donde el host corregía a todos hacia su propia vista atrasada.

- `stepPhysics(state, inputs, dt, { local })` simula solo a los de `local`. Los remotos quedan
  donde dijo su foto, no tocan la pelota, y en un choque solo se corrige al local (el remoto se
  corrige en su pantalla). Sin `local` simula a todos, como antes: los tests viejos usan eso.
- Los remotos se dibujan **interpolando** entre fotos, un poco en el pasado. El retraso se ajusta
  solo con el percentil 95 de las demoras de los últimos 3 s más el hueco típico entre fotos: sube
  rápido y baja despacio. Por conexión directa queda en unos 50 ms.
- Si las fotos se atrasan, el remoto se sigue simulando con la física y sus teclas
  (`guessPlayer`) y, cuando llegan las reales, la diferencia se funde en ~120 ms.
- **La pelota la simula quien la tocó último.** Tocarla la reclama al instante (`claimBeats`: gana
  el `s` mayor; si empatan, el id mayor). Mientras la tiene otro, se interpola en el mismo tiempo
  que su dueño, así coincide con su auto.
- **El gol lo declara solo quien tiene la pelota**, con transacción sobre `match` (uno por saque),
  y la sala lo registra con `goalScored { kickoff }`, que es idempotente. `room.matchNumber` separa
  un partido del anterior: las fotos viejas se ignoran.
- Las escrituras pasan por `latestWriter`: como mucho 20 sin confirmar; si hay más, se descartan las
  viejas. Nunca se arma una cola.

### Cosas que ya mordieron (Fútbol)

- **Firebase entrega en ráfagas y con mucha variación**: desde acá, una escritura tardó de 200 a
  1.200 ms según el momento, y a veces no llega nada por medio segundo y después todo junto. Por
  eso el retraso usa el percentil 95 en una ventana *de tiempo* (con el máximo, un solo pico dejaba
  a los remotos un segundo atrasados por medio minuto) y por eso existe la extrapolación con física.
- **Las horas de servidor de dos pantallas no coinciden**: la estimación de Firebase puede errar
  tanto como la latencia, así que las demoras medidas (y el retraso de `net.remotes`) pueden dar
  negativas o muy grandes. No importa, porque se compensa al restar; no intentes corregirlo. **Pero
  cualquier tope tiene que ser relativo a lo medido**: un mínimo fijo de 35 ms convertía esa
  diferencia de relojes en atraso de verdad (se veía al otro ~300 ms tarde por conexión directa).
  Por lo mismo, el número de `delay` no es el atraso que se ve.
- **La copia de respaldo por Firebase no tiene que contar su demora** si con ese jugador hay canal
  directo (`receiveSnapshot(..., countLag)`). Con el jugador quieto, a veces llega más nueva que el
  último latido directo, entra al búfer, y si contara su demora (~400 ms) se lo dibujaba así de
  atrasado al arrancar.
- **Para medir el atraso real** no uses `delay`: las dos pantallas de una prueba corren en la misma
  máquina, así que se puede cruzar por `Date.now()` cuándo pasó el jugador por un punto y cuándo el
  otro lo dibujó ahí. Para provocar la diferencia de relojes, sumale ±300 a `window.__futbol.net.offset`.
- **Con 4 escrituras en vuelo** (el primer intento) la latencia normal frenaba el envío a ~10 fotos
  por segundo y las fotos esperaban en cola antes de salir.
- **Al abrirse el canal directo hay que olvidar las demoras medidas por Firebase** (`switchToDirect`).
  Si no, con el jugador quieto (una foto cada 500 ms) las demoras viejas de 300–400 ms seguían en la
  ventana y se lo dibujaba con 440 ms de atraso varios segundos, aunque el canal ya diera 15 ms.
- **Derrape (modo coches, Control)**: `inp.drift` baja el agarre lateral a `driftLateralFriction` y
  multiplica el giro por `driftTurnBoost`; el avance responde igual. `isDrifting` viaja en la foto
  (`dr`) y las marcas de goma son solo dibujo (`drawSkidMarks`, no están en el estado). **Ctrl+W
  cierra la pestaña y ninguna página lo puede frenar**: por eso en coches hay un `beforeunload`.
- **Para probar con dos jugadores en un navegador automatizado, usá dos navegadores separados**, no
  dos pestañas del mismo: la pestaña de fondo recibe menos cuadros y las demoras medidas salen
  infladas (daba ~300 ms donde en realidad había 50). Para probar el respaldo por Firebase, borrá
  `window.RTCPeerConnection` antes de cargar la página en uno de los dos.
- Para medir fluidez hay un gancho **solo en desarrollo**: `window.__futbol` (`stateRef`, `meId`,
  `net` con los búferes, retrasos y contadores, `mesh` con `isOpen(id)`). Vite lo saca del build de producción. La métrica
  que sirve es la *aspereza*: cuánto se aparta la velocidad dibujada de cada cuadro del promedio de
  sus vecinos. Una aceleración pareja da ~0%; un tirón, mucho.

### Importante por cada nueva adicion al proyecto
- El archivo `updates` (sin extensión, en la raíz) lleva un registro de las actualizaciones, por cada cambio que hagas, quiero que lo agregues ahi.
- Si es un cambio muy pequeño, como un fix bug, a la version x.y.z sumale a Z+0.5
- Si es un cambio pequeño, a la version x.y.z sumale a Z+1.
- Si es un cambio grande, a la version x.y.z, sumale Y+1 y establece el Z en 0. 
- Si es un cambio gigantesco, como una gran actualizacion, a la version x.y.z sumale a X+1, y establece ambas Y,Z en 0.