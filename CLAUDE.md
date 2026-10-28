# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Idioma y preferencias del autor

- **Escribí todo en español rioplatense**: la interfaz, los comentarios del código, los mensajes
  de error, los nombres de los tests y las respuestas al usuario. Usá "vos/tenés/podés", no "tú/tienes".
  Los identificadores del código quedan en inglés (`currentTeam`, `spymaster`), los textos visibles en español.
- **Mantené el repo limpio**: si un archivo deja de usarse, borralo en vez de dejarlo al costado.
  Ya se eliminó un prototipo viejo (`codigo-secreto.jsx`) por esto. No dejes archivos de respaldo,
  `.old`, ni código muerto. `dist/` y `.wrangler/` son artefactos: no se versionan ni se dejan en el árbol.
- **Siempre publicá los cambios.** Todo cambio termina desplegado (ver *Desplegar*), aunque el
  pedido no lo diga y sin preguntar. Un cambio que no está publicado no está terminado.
  El orden es: tests → navegador → commit y push (eso publica) → revisar el sitio → borrar `dist/` y `.wrangler/`.
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
npm test             # tests de la lógica de los juegos y del servidor de salas
npm run servidor     # build + wrangler dev: página y salas juntas en http://localhost:8787
npm run dev          # Vite con recarga (necesita `npm run servidor` corriendo: le pasa /api)
npm run build        # genera dist/
```

`npm run servidor` corre el Durable Object en la compu, con una base local en `.wrangler/`:
no toca las salas publicadas.

Un test solo (el patrón matchea contra el nombre del test, en español):

```bash
node --test-name-pattern="la pista N da exactamente N intentos" --test tests/game.test.js
```

### Desplegar

**Un `git push` a `master` publica solo.** El repo (`nicocuki/tareas-fondeanas`) está conectado a
Cloudflare Workers Builds: corre `npm run build` y `npx wrangler deploy` con lo que diga
`wrangler.jsonc`. El resultado se ve como check en el commit de GitHub y en el panel de Cloudflare
(Workers & Pages → tareas-fondeanas → Deployments).

Sitio: https://tareas-fondeanas.nicocukier.workers.dev · Cuenta de Cloudflare: la de Nico.

`npm run deploy` publica a mano desde una compu con `npx wrangler login` hecho; normalmente no hace falta.

No hay base aparte que limpiar: **una sala sin actividad durante 15 minutos se cierra y se borra sola**
(`IDLE_CLOSE_MS` en `worker/core.js`, alarma del Durable Object en `worker/sala.js`), aunque haya pestañas
abiertas: antes había que esperar tres días y que no quedara nadie conectado, y una pestaña olvidada la dejaba
(y en la portada, si era pública) para siempre. Cuenta como actividad cualquier escritura de un jugador o una
conexión nueva; lo que escribe el servidor solo (`onDisconnect`) no. Al cerrarla se saca de la portada, se
cierran los WebSocket (código 4000) y las pantallas que quedaron muestran «Esa sala ya no existe». Para
probarlo en local sin esperar: `npx wrangler dev --var IDLE_CLOSE_MS:60000` (un minuto).

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

Esto importa porque el reducer **corre dentro de una transacción**
(`runTransaction` en `storage.js`, ver *El servidor de salas*): si dos jugadores mandan una jugada al mismo tiempo,
la segunda se reaplica sobre el estado ya actualizado. Consecuencias al tocar el código:

- Nada de `Math.random()`, `Date.now()`, `fetch` ni estado de React dentro de `game.js`.
- Toda validación va en el reducer, no en la interfaz. Lo de la interfaz es para avisar antes;
  lo que realmente protege la partida es el `return null`.
- Las acciones de jugada llevan `round` y `turn`; si no coinciden con los de la sala, se descartan.
  Así una jugada de un turno viejo que llega tarde no hace nada.

### La sala entera es un string JSON

Cada sala se guarda como **un solo string** en `rooms/<CÓDIGO>`, no como un objeto.
Es a propósito: el servidor (igual que Firebase, que se usaba antes) borra los arrays vacíos y los
`null`, y eso rompía el tablero.
`serializeRoom` / `parseRoom` hacen la conversión.

`worker/rules.js` limita cada sala a **30.000 caracteres**. Si una escritura lo pasa,
el servidor la rechaza, y como todo vive en la misma sala **se traba la partida entera**, no solo
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
| `src/cafeote/` | Componentes y lógica del juego Café o Té |
| `src/futbol/` | Fútbol: el motor de HaxBall (`haxball.js`) y su dibujo (`haxRender.js`), la física de coches (`physics.js`), la red y las pantallas (ver *Fútbol: HaxBall*) |
| `src/lobby/` | Componentes unificados y reutilizables para las salas de espera de todos los juegos |
| `src/App.jsx` | Enrutador: qué juego se muestra, dentro del marco común |
| `src/codigo-secreto/CodigoSecretoApp.jsx` | Pantallas de Código Secreto (entrada, sala de espera, partida) |
| `src/ui/` | Marco común: header, menú hamburguesa, portada, catálogo de juegos, perfil, temas y novedades (ver *Diseño*) |
| `src/codigo-secreto/Options.jsx` `Chat.jsx` `Rules.jsx` `Players.jsx` | Paneles de la interfaz de Código Secreto |
| `src/theme.js` | Colores y estilos para los estilos en línea de los juegos (apuntan a las variables de `src/ui/tokens.css`) |
| `src/gartic/` | Trazo Loco: lógica (`game.js`), trazos y balde (`drawing.js`), red (`storage.js`), pantallas (ver `docs/GARTIC.md`) |
| `src/teg/` | T.E.G.: mapa, cartas y objetivos (`board.js`), reducer (`game.js`), bitácora (`log.js`), el mapa en SVG (`Map.jsx`), ventanas de combate (`Dialogs.jsx`), paneles y pantallas (ver *T.E.G.*) |
| `src/monopoly/` | Monopoly: tablero y mazos (`board.js`), reducer (`game.js`), bitácora en texto (`log.js`), pantallas (ver *Monopoly*) |
| `src/mecha/` | La Mecha: reducer (`game.js`), palabras y diccionario (`words.js`, `dictionary.js`), pantallas |
| `src/meme/` | Armá el Meme: reducer (`game.js`), catálogo de plantillas (`catalog.js`), el meme con textos (`MemeView.jsx`), pantallas |
| `src/tiros/` | A los Tiros: reducer de la sala (`game.js`), cartas (`cards.js`), mapas (`maps.js`), formas y choques (`shapes.js`), física (`sim.js`), cajas sueltas (`boxes.js`), dibujo (`render.js`), sprites de los efectos (`sprites/`, `sprites.js`), pelea en tiempo real (`TirosGame.jsx`) |
| `src/nave/` | Entre Nosotros (Among Us): mapa (`map.js`), tareas (`tasks.js`), reducer (`game.js`), movimiento y vista (`sim.js`), dibujo (`render.js`), la nave en vivo (`NaveGame.jsx`), minijuegos, reunión (ver *Entre Nosotros*) |
| `src/pixel/` | Pixel Royale: mapa y tormenta (`map.js`), armas, botín y balas (`sim.js`), reducer (`game.js`), dibujo pixelado (`render.js`), la partida en vivo (`PixelGame.jsx`) (ver *Pixel Royale*) |
| `src/cohetes/` | Cohete Royale (Rocket Bot Royale): mapa (`terrain.js`), tanque pegajoso, nave y armas (`sim.js`), reducer (`game.js`), dibujo (`render.js`), la partida en vivo (`CohetesGame.jsx`) (ver *Cohete Royale*) |
| `src/mvl/` `public/mvl/` | Mario vs Luigi: la pantalla con el iframe y la compilación web de Unity (ver *Mario vs Luigi*) |
| `worker/photon.js` | Puente de Mario vs Luigi a Photon y al servidor de ipodtouch, para redes que los bloquean |
| `diccionario/` `scripts/armar-diccionario.mjs` | Fuente del diccionario de La Mecha (RLA-ES es_AR) y el script que arma la lista |
| `src/storage.js` | Salas (`rooms/`) y canales en tiempo real del fútbol y de A los Tiros sobre el servidor de salas |
| `src/realtime.js` | Cliente del servidor de salas, con la misma forma que Firebase Realtime Database |
| `src/ticker.js` | Relojes que siguen andando con la pestaña de fondo (ver *Pestañas de fondo*) |
| `worker/index.js` | Worker de Cloudflare: `/api/hora`, `/api/sala/ABCD` (WebSocket) y la página |
| `worker/sala.js` | Durable Object de una sala: WebSockets que hibernan y SQLite propio |
| `worker/core.js` | El servidor de una sala sin nada de Cloudflare (se prueba con `node --test`) |
| `worker/rules.js` | Quién lee y escribe cada rama, qué se guarda en disco y qué no |
| `worker/tree.js` | Árbol de datos compartido por servidor y cliente: rutas, nulls, poda, `push` |
| `worker/publicas.js` `worker/directorio.js` | Salas públicas: qué sala se lista y el Durable Object con la lista (ver *Salas públicas*) |
| `src/ui/publicas.js` | La lista en vivo de la portada y la marca de «pública» de cada sala |
| `src/ui/JoinInvite.jsx` `src/ui/rooms.js` `src/ui/roomSummary.js` | Pantalla de «te estás uniendo a la sala de…» y qué se sabe de una sala por su código |
| `wrangler.jsonc` | Configuración de Cloudflare |
| `src/session.js` | Quién sos: `sessionStorage` por pestaña, `localStorage` por dispositivo |

La partida tiene tres columnas: jugadores a la izquierda (cada nombre del color de su equipo),
tablero al medio, reglas/chat/bitácora a la derecha. El reparto está en `index.css` con
`grid-template-areas`: en pantallas medianas los jugadores suben a la columna derecha y en
celular va todo apilado con el tablero primero.

`docs/captura.png` es la imagen del README: una partida armada a mano con `game.js`, escrita en
la base y abierta como el espía rojo. Si la interfaz cambia mucho, conviene rehacerla.

### Diseño (src/ui)

Todo pasa por **variables CSS** en `src/ui/tokens.css`: tema oscuro (pizarrón con resaltador amarillo) y
claro (hoja con birome roja), elegidos en Ajustes y guardados en `tf:preferencias`. `theme.js`
traduce `COLORS` a esas variables, así los estilos en línea viejos cambian de tema solos.
**No escribas colores fijos en un componente**: usá `COLORS` o `var(--…)`. Las excepciones son los
colores de equipo, las casillas de Código Secreto, el tablero de Monopoly (papel y verde, igual en los dos temas), el mapa del T.E.G. (mar, continentes y ejércitos fijos), la cancha del fútbol, la partida de Cohete Royale, la de Entre Nosotros (la nave,
el HUD y la reunión, oscuros como el original) y Trazo Loco (copia el look
de Gartic Phone, con sus variables `--gp-*` en `src/gartic/gartic.css`), que son iguales en los dos temas.

- `games.js` es el catálogo (nombre, emoji, color, jugadores con `min`/`max` en números, «cómo jugar»). **Un juego nuevo se
  agrega ahí, en `SCREENS` de `App.jsx` y en `ROOTS` de `worker/rules.js`.**
- `store.js`: preferencias, perfil (el nombre usa la misma clave que `session.js`), la sala actual y
  los avisos. Cada juego llama a `useRegisterRoom(juego, código, salir)`: con eso el header muestra
  el código y el menú ofrece «Salir de la partida».
- `GameHero` es el encabezado de la pantalla de entrada de cada juego; `LobbyLayout`, el de la sala de espera.
- **Pantalla completa** (botón del header): toda la página, salvo que el juego marque su ventana con
  `useFullscreenTarget(ref)`; ahí agranda solo ese elemento. A los Tiros lo usa con un contenedor que no
  cambia entre cartas, pelea y final (`tt-screen`), así no se sale al cambiar de fase. Los estilos van
  con `:fullscreen` en el CSS del juego.
- **Entrar con el link de una sala** (`?sala=ABCD`) muestra `JoinInvite` en vez de la entrada normal:
  «Te estás uniendo a la sala de X», el código, cuántos hay, tu nombre (y avatar) y un solo botón.
  «Prefiero crear mi propia sala» vuelve a la entrada normal y saca el código de la dirección. Trazo
  Loco tiene su propia versión con su diseño (`Invite` en `GarticApp.jsx`). Lo que se sabe de una sala
  sale de `summarizeRoom` (`roomSummary.js`, puro): lo usan `useRoomInfo` (en vivo) y el servidor
  para las salas públicas. Si el link es de otro juego, avisa y ofrece ir a esa sala.
- La versión que se muestra sale del archivo `updates` (la entrada `LATEST`), que también alimenta «Novedades».
- La sesión guarda `game`: `loadSession(código, juego)` no devuelve la de otro juego (todos usan la misma clave).
- Fuentes: Bricolage Grotesque (títulos, `.cs-mono`) e Inter (texto), de Google Fonts.

### El servidor de salas (Cloudflare)

Antes todo iba por Firebase Realtime Database. Ahora cada código de sala es un **Durable Object**
(`worker/sala.js`) y cada pantalla tiene un WebSocket con la sala en la que está. `src/realtime.js`
imita la parte de Firebase que se usaba (`ref`, `onValue`, `onChild*`, `set`, `update`, `push`,
`runTransaction`, `onDisconnect`, `serverTimestamp`, `.info/connected`, `.info/serverTimeOffset`),
así los juegos siguieron casi iguales. **Para un juego nuevo, usá esas mismas funciones.**

- **La ruta elige la sala**: el segundo tramo es el código (`rooms/ABCD`, `futbol/ABCD/ball`,
  `garticSteps/ABCD/…`). Solo se aceptan las raíces de `ROOTS` en `worker/rules.js`: **un juego
  nuevo tiene que agregar la suya ahí** o el servidor rechaza todo.
- **Las transacciones son optimistas**, como en Firebase: el cliente corre el `updater` con el
  valor que conoce y manda el resultado junto con ese valor (en texto canónico). Si en el servidor
  ya había otra cosa, le devuelve lo actual y el cliente reintenta (hasta 50 veces).
- **Las escrituras se avisan después de aplicarse en el servidor**, no al instante en la pantalla
  que escribe (Firebase sí lo hacía). En la práctica es una ida y vuelta: decenas de ms.
- **Las fotos del fútbol (`players`, `ball`, `signal`, `peers`) no se guardan en disco**
  (`isEphemeral`): si la sala se duerme se pierden, y está bien. Lo demás se guarda por unidades
  (`unitDepth`): cada sala entera, cada rama del fútbol, cada entrega de Trazo Loco.
- **Identidad sin cuentas**: cada pestaña guarda un secreto en `sessionStorage` y su uid es el hash
  (`uidFromSecret`). Lo usa Trazo Loco para las reglas de privacidad.
- **Plan gratis**: 100.000 pedidos por día, y cada 20 mensajes de WebSocket entrantes cuentan como
  uno. Por eso el fútbol sigue yendo directo entre navegadores y no por el servidor.

### Pestañas de fondo

Con la pestaña oculta (o la ventana minimizada o tapada) el navegador **deja de llamar a
`requestAnimationFrame`** y frena `setInterval`/`setTimeout` a uno por segundo y, a los pocos minutos, a uno
por minuto. Pasaba: el que cambiaba de pestaña no entraba a la ronda de Trazo Loco (la sala lo veía
desconectado) y en A los Tiros quedaba congelado, sin recibir daño, hasta que el anfitrión lo daba por muerto.

- **`src/ticker.js`** pide los relojes a un Web Worker, que el navegador no frena así: `everyFrame(fn)`
  (bucle de juego: `requestAnimationFrame` mientras llega, el Worker cuando se traba más de 100 ms; `fn` recibe
  `{ hidden }` para no dibujar), `backgroundInterval` y `backgroundTimeout`. Sin Worker (Node) usa los comunes.
- **Un juego nuevo**: el bucle de una pelea en tiempo real va con `everyFrame`, no con `requestAnimationFrame`;
  el reloj que cierra turnos o manda `tick`/`timeout`, con `backgroundInterval`; una entrega automática al
  acabarse el tiempo, con `backgroundTimeout`. Para lo que es solo de pantalla (un «¡Copiado!») da igual.
- `realtime.js` usa el Worker para el latido y la reconexión, y da la conexión por muerta solo si **un ping
  quedó sin respuesta** `DEAD_MS`. Antes contaba desde el último mensaje recibido, y con el latido atrasado
  cortaba conexiones que andaban bien.
- En el navegador de pruebas, la pestaña de fondo dice `visibilityState: 'visible'` pero igual frena
  `requestAnimationFrame`: por eso `everyFrame` mira si los cuadros dejaron de llegar, no la visibilidad.

### Salas públicas

La portada muestra, arriba de los juegos, las salas que el anfitrión marcó como públicas; se entra
con un clic (lleva a `?juego=…&sala=ABCD`, igual que un link de invitación).

- **La marca va aparte de la sala**: `publica/{código}` = `true` o nada (root en `ROOTS`), así
  ningún reducer tuvo que cambiar. La escribe `PublicSwitch` (`src/lobby/PublicRoom.jsx`, solo el anfitrión), que va dentro de
  `LobbyLayout` (recibe `host` y `players` de cada juego); Trazo Loco, con su diseño propio, lo pone a
  mano. «Crear la sala como pública» (`PublicCheckbox`, en `GameHero` y en Trazo Loco) es la
  preferencia `publicRooms`: se aplica la primera vez que el anfitrión ve su sala con un solo jugador.
- **Decide el servidor**: después de cada escritura en `rooms`, `garticRooms` o `publica`, y al
  abrirse o cerrarse un WebSocket, `Sala.publish()` calcula `roomListing` (pública, no llena, con alguien conectado;
  empezada solo si el juego está en `JOIN_IN_PROGRESS` de `roomSummary.js`, y ahí va con `playing` y la portada
  le pone «En curso») y, si cambió, se lo manda por RPC al
  **Directorio**: un Durable Object único (`idFromName('portada')`).
- La portada escucha `/api/salas` por WebSocket (hiberna; un GET devuelve el JSON). Una entrada sin
  avisos en seis horas se descarta (`LISTING_TTL_MS`). **Un juego nuevo** que guarde la sala en
  `rooms/` con `phase`, `hostId` y `players` se lista solo; si tiene tope, sumalo a `MAX` en
  `worker/publicas.js`.

### Cambiar de juego

En la sala de espera, el anfitrión puede pasar a todos a otro juego (`ChangeGame` en `src/lobby/ChangeGame.jsx`, que va
dentro de `LobbyLayout`; Trazo Loco lo pone a mano). Todo está en `src/ui/mudanza.js` y, como la marca de pública,
**va aparte de las salas**: ningún reducer cambió.

- El anfitrión elige el juego: se anota en `sessionStorage` (`tf:mudanza`) y va a `?juego=X&mudanza=1`. La entrada de
  ese juego crea la sala sola (`useAutoCreate`) con el nombre del perfil.
- Cuando el juego registra la sala nueva (`useRegisterRoom` → `finishMove`), se escribe `mudanza/{sala vieja}` =
  «juego/CÓDIGO» (root en `ROOTS`) y la marca de pública pasa a la nueva.
- Los de la sala de espera vieja lo ven (`useMoveWatch`) y van al link de la nueva con `&auto=1`: `JoinInvite`
  entra solo (`useAutoJoin`). La sala vieja queda sola y se cierra por inactividad.
- Los juegos donde no entran los que son quedan deshabilitados con el porqué (`playersProblem` en `games.js`).
  Mario vs Luigi no aparece (`lobby: false`: no usa nuestras salas).
- **Un juego nuevo**: `min`/`max` en `games.js` y `useAutoCreate` en su pantalla de entrada; si usa `JoinInvite` y
  `LobbyLayout`, lo demás viene solo.

### Sacar a alguien

El anfitrión puede sacar jugadores desde la sala de espera («🚫 Sacar a alguien», `KickPlayers` dentro de `LobbyLayout`,
que recibe `roster`, `me` y `onKick`). Cada reducer atiende la acción `kick` igual (`src/lobby/kick.js`): solo el
anfitrión, a otro, en la sala de espera; se aplica el `leave` de ese jugador y se lo anota en `kicked` (tope
`MAX_KICKED`), así un `join` con ese mismo id se rechaza y su pantalla dice «El anfitrión te sacó de la sala». Con
otra pestaña puede volver a entrar: alcanza entre amigos. Trazo Loco, sin reducer, lo hace en `kickPlayer`
(`garticRooms/{sala}/kicked/{uid}`). **Un juego nuevo**: el bloque de `kick` al principio de su `applyAction`
(hay un test que recorre todos) y `roster`/`onKick` en su `LobbyLayout`.

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

## T.E.G.

Pedido de Nico, después del Monopoly: «el TEG, bien piola». Es el T.E.G. (Táctica y Estrategia de la Guerra) de mesa. De 2 a 6, mejor en compu.
`id`: `teg` (`?juego=teg`, `gameType: 'teg'`). Como el Monopoly, **no tiene raíz propia en `ROOTS`**: todo vive en `rooms/{código}`.
Los 50 países, los 6 continentes y sus bonus son los del juego de mesa; **los vecinos y las posiciones del dibujo son nuestros**.

- **Mismo patrón que los demás**: reducer puro `applyAction(room, action, { now, rand })` (`ctx.dice = { a, d }` solo lo usan los tests).
  Fases `lobby` → `playing` → `ended`; dentro de `playing`, `room.stage`: `setup1` y `setup2` (los ejércitos iniciales, **todos a la vez**, cada
  uno con su `pend`), y por turno `reinforce` → `attack` → `regroup`. Opción de la sala: `goal` (`secret` o `conquer30`).
- **El estado del mapa son dos listas de 50** (`room.own[c]` = posición del dueño en `room.players`, `room.arm[c]` = ejércitos). El orden de
  `players` se sortea al empezar y **no cambia durante la partida** (los que se van quedan con `left`/`out`), por eso la bitácora guarda
  posiciones y no ids. Una sala entera pesa ~5.000 caracteres en el peor caso (hay un test).
- **Combate**: el atacante elige 1, 2 o 3 dados (siempre queda un ejército), el defensor tira hasta 3 sin pasarse de sus ejércitos, se comparan
  de mayor a menor y **los empates los gana el defensor**. Al conquistar, el país pasa a ser del atacante con 0 ejércitos y `room.pending` obliga a
  pasarle entre `min` (los dados que tiró) y `max` (todos menos uno): hasta entonces no se puede hacer otra cosa. `blitz` repite hasta
  conquistar o quedarse con uno. `attack` y `blitz` llevan `seen` (= `room.rollN`) para que dos clics seguidos no tiren dos veces.
- **Cartas**: mazo de 52 (`room.deck`: un país cada una, con símbolo cañón/barco/globo repartido de a tres, y 2 comodines). Al terminar el turno
  se roba una si hubo conquista (`room.conq`). Canje (`trade`): 3 iguales, 3 distintas o con comodín; da 4, 7, 10 y de ahí +5 (`room.tradeN`,
  **un solo contador para toda la partida**) y +2 en cada país de las cartas que sea tuyo. Con `FORCED_TRADE` (5) cartas no se puede poner ni
  pasar a atacar sin canjear: con 5 siempre hay un canje posible. Quien elimina a alguien se queda con sus cartas.
- **Reagrupe**: queda un ejército en cada país y los que llegan (`room.locked`) no se vuelven a mover en el turno (`movable`).
- **Objetivos** (`OBJECTIVES` en `board.js`): 8 de continentes y países, «24 países», «18 países con 2 ejércitos» y uno de destruir a cada color.
  Al repartirlos nadie recibe destruirse a sí mismo ni a un color que no juega. Si otro jugador elimina al que tenías que destruir, tu objetivo
  pasa a `c30`. **Siempre vale ocupar 30 países**, tengas el objetivo que tengas. Se chequea al terminar de pasar ejércitos tras una conquista
  (`occupy`), que es el único momento en que algo puede cumplirse. Los objetivos son secretos **solo en la interfaz**: la sala viaja entera
  (igual que el chat de equipo de Código Secreto), alcanza para jugar entre amigos.
- **Salirse o que te saquen** (`leave`, `kick` también en `playing`): sus países se quedan donde están, sin jugar, y se salta su turno (no se
  reparten al azar). Si queda uno solo en pie, gana. En los ejércitos iniciales, el que se va no frena a los demás.
- **El mapa** (`Map.jsx`) es un SVG de 1000 × 600: una mancha por continente (envolvente convexa con borde redondeado), líneas de frontera
  (punteadas las que cruzan el mar; Alaska–Kamchatka da la vuelta por los bordes) y una ficha por país. Cada país se toca directamente: en
  refuerzos pone ejércitos (por toque 1, 5, 10 o todos), en ataque se elige el origen y después un vecino enemigo (se marcan en rojo), en
  reagrupe origen y vecino propio. El zoom es solo de pantalla (en celular arranca en 2,2 y el mapa se desplaza).
- **Las animaciones de los anillos no pueden mover la caja del elemento** (`stroke-dashoffset` y `opacity`, no `rotate`): con un `rotate`
  el navegador automatizado nunca daba el país por «estable» y no se podía tocar.
- **`.tg-card` es de las tarjetas de la sala; las cartas de la mano son `.tg-hcard`**: usaron el mismo nombre y la sala de espera quedaba rota.
- `data-act`, `data-country` (con `data-armies` y `data-owner`), `data-amount`, `data-card`, `data-pend`, `data-reinf`, `data-stage`, `data-map`,
  `data-players`, `data-hand` y `data-log` existen para manejar el juego desde un navegador automatizado. No los saques.
- Los países son nombres geográficos, pero el juego imita al T.E.G. de Yetem: entre amigos está bien; si llegara un pedido de bajarlo, se saca
  la entrada de `games.js`.
- **Todavía no tiene**: pactos entre jugadores, chat, relojes de turno ni entrar a mitad de partida (el anfitrión puede sacar a un ausente).

## Monopoly

Pedido de Nico: «el monopoly, bien hecho y que se entienda claro cada cosa». De 2 a 8, cualquier pantalla. `id`: `monopoly`
(`?juego=monopoly`, `gameType: 'monopoly'`). **No tiene raíz propia en `ROOTS`**: todo vive en `rooms/{código}`, no hay fotos en
tiempo real. Las reglas son las del Monopoly clásico; los barrios (Buenos Aires), las estaciones y los textos de las cartas son nuestros.

- **Mismo patrón que los demás**: reducer puro `applyAction(room, action, { now, rand })` (`ctx.dice` solo lo usan los tests para fijar
  los dados). Fases `lobby` → `playing` → `ended`. Opciones: `startCash`, `auctions`, `freeParking` (pozo del Descanso).
- **El turno es una máquina de pasos** (`room.step`): `roll` → (`buy` | `auction`) → `act` → `endTurn`. Sacar dobles vuelve a `roll`
  (`room.doubles` > 0). Cada paso valida quién y cuándo; las acciones llevan contadores que impiden la doble pulsación: `roll` lleva
  `seen` (= `room.rollN`: dos clics seguidos no tiran dos veces) y `endTurn` lleva `turn` (= `room.turnNo`).
- **Las deudas frenan todo** (`room.debts`): si no alcanza el efectivo, no se paga a medias; queda una deuda, nadie tira, compra ni
  termina el turno hasta que se pague (`payDebt`) o se quiebre (`bankrupt`, solo si ni vendiendo todo alcanza: `liquidation`).
  Hipotecar y vender casas se puede en cualquier momento (también fuera de turno) justamente para esto. Las deudas son por jugador,
  así «cada uno te paga $10» o «pagale a cada jugador» funcionan sin casos especiales.
- **Quiebra** (`eliminate`): contra un jugador, se queda con todo (las hipotecadas siguen hipotecadas y paga el 10 %); contra el
  banco, las propiedades vuelven sin hipoteca y se subastan una por una (`room.queue`). Los edificios se venden al banco a la mitad
  antes. Salirse en plena partida (`leave`) o que el anfitrión te saque (`kick`, también en `playing`) es quebrar contra el banco.
  Los que se van quedan en `players` con `out` y `left` hasta volver a la sala, para el ranking (`room.eliminated`).
- **Subasta por turnos** (`room.auction`): cada uno sube la oferta o se baja; gana el último que queda con la oferta más alta. El que
  queda solo sin oferta decide si pone algo o nadie la compra. `auction.resume` es el paso al que se vuelve cuando termina.
- **Tratos** (`room.trade`, uno a la vez): `give` es lo que da quien propone y `take` lo que recibe. Se revalida entero al aceptar.
  Las propiedades con edificios en su color no se tratan. Quien recibe una hipotecada paga al banco el 10 % de su hipoteca.
- **Cuentas con el 10 %: nada de decimales** (`mortgageFee` = `ceil(hipoteca / 10)`): `200 * 1.1` da `220.00000000000003` y
  `Math.ceil` lo subía a 221. Ya mordió.
- **Mazos**: `room.deck.chance|chest` son el orden de las cartas (índices de `CARDS`); al sacar una vuelve al fondo, salvo
  «Salir gratis», que se la queda el jugador (`jf`) y vuelve al mazo al usarla. Una carta puede encadenar casilleros (retroceder 3
  desde Suerte puede caer en Caja comunal): `land` lleva un `depth` con tope.
- **Peor caso de sala** (8 jugadores con las 28 propiedades con hotel, bitácora llena, trato, subasta y deudas): ~7.500 caracteres,
  muy por debajo de los 30.000. Hay un test. La bitácora (`MAX_LOG` 60) guarda entradas chicas `{ k, p, … }` y `log.js` las pasa a
  texto con los nombres.
- **Interfaz**: el tablero (`Board.jsx`) es una grilla de 11 × 11 con esquinas más grandes; los textos se miden en `cqw` (unidades del
  contenedor) y por debajo de 470 px de ancho se esconden los nombres (queda color, precio y tocar para ver la ficha). En pantallas
  de 860 px o más, el panel «qué hacer ahora» (`ActionPanel.jsx`) va en el centro del tablero; en celular, debajo. Las fichas
  caminan casillero por casillero (solo dibujo). `Modals.jsx`: ficha de propiedad, subasta (no se puede cerrar), tratos y la carta
  recién sacada (la ven todos unos segundos). **Un `Modal` solo enfoca al abrirse**: si enfocara en cada render, escribir en un campo
  perdería el foco a cada letra. Los problemas de cada acción salen de las funciones `*Problem` de `game.js`, las mismas que usa el
  reducer, así un botón deshabilitado dice por qué.
- **Con `st.m` valiendo `0` (no `false`) no uses `{st.m && …}` en JSX**: React dibuja el «0». Pasó en el tablero y en la ficha.
- `data-act`, `data-square`, `data-player`, `data-cash`, `data-log`, `data-board`, `data-prop`, `data-pos` existen para manejar el juego
  desde un navegador automatizado. No los saques.
- Es una imitación entre amigos (Monopoly es de Hasbro): si llegara un pedido de bajarlo, se saca la entrada de `games.js`.
- **Todavía no tiene**: chat, relojes de turno ni entrar a mitad de partida (a propósito: el anfitrión puede sacar a un ausente).

## La Mecha

Bomba de palabras: la bomba muestra una sílaba y el que la tiene escribe una palabra que la
contenga (`mode: 'anywhere'`) o que empiece con ella (`'start'`) antes de que explote.

- **Mismo patrón que Código Secreto**: la sala es un string en `rooms/{código}` con
  `gameType: 'la-mecha'`, y `applyAction(room, action, { now, rand, dict })` corre dentro de la
  transacción. **El diccionario entra por `ctx.dict`**: el reducer valida la palabra en la pantalla
  que la manda. Entre amigos alcanza; no es a prueba de trampas.
- **La mecha**: `fuse.deadline` es un momento al azar entre los valores de `FUSES` desde que se
  enciende. Pasar la bomba no la reinicia, pero el que la recibe tiene al menos `MIN_TURN_MS`.
  Cualquier pantalla manda `explode` cuando ve el reloj en cero (con la hora del servidor); el
  reducer exige `now >= deadline` y el `turn` actual, así entra uno solo.
- **Lo que se escribe en vivo** va por `mecha/{código}/typing`, fuera de la sala y sin guardarse en
  disco (`isEphemeral`).
- **El diccionario** (`public/mecha/palabras.txt`, ~586.000 palabras normalizadas: minúsculas, sin
  tildes, con ñ) se baja una vez en el navegador (~1,4 MB comprimido) y se busca por bisección
  sobre un solo texto, para no ocupar memoria en celulares. Se arma con `npm run diccionario` desde
  `diccionario/` (ver `diccionario/LEEME.md`, licencia MPL 1.1). Palabras extra: `diccionario/agregadas.txt`.
  **Va siempre con finales `\n`** (`.gitattributes`): con `core.autocrlf` en Windows quedaba con `\r\n`,
  cada palabra llevaba un `\r` pegado y se rechazaban todas (fallaban 7 tests y el juego en local).
- **Las sílabas** (`src/mecha/syllables.js`, generado) son solo las que tienen cientos de palabras,
  ordenadas de más a menos comunes; la dificultad elige de qué tramo sacar (`POOLS` en `game.js`).
- `used` (palabras ya dichas) tiene tope `MAX_USED`, por el límite de 30.000 caracteres de la sala.
- Con tres jugadores la flecha de la bomba queda a 0°, 120° y 240°: por eso el triángulo es
  angosto. Uno equilátero se ve igual rotado 120° y parecía que no giraba.

## Armá el Meme

Clon de Make It Meme: a cada uno le toca una plantilla, le escribe los textos y después se votan
todos, uno por uno, de 1 a 5 estrellas.

- **Mismo patrón que los demás**: la sala es un string en `rooms/{código}` con `gameType: 'meme'` y
  `applyAction(room, action, { now, rand })`. Fases: `lobby` → `making` → `voting` → `results` →
  (otra ronda o) `final`. Los relojes los cierra cualquier pantalla con `tick` (lleva `round`,
  `phase` y, en la votación, `index`).
- **Las plantillas son un catálogo propio** (`src/meme/catalog.js`, ~80): elegidas a mano entre las
  más usadas de Imgflip, sin las que no se entienden, las que traen texto en inglés pegado ni las de
  política yanqui. Las imágenes se cargan de `i.imgflip.com`. Cada una tiene nombre en castellano,
  `hint` (cómo se usa) y sus cajas: posición, ancho, tamaño, `k: 1` (letra negra) y `label` (qué va
  ahí). **Para agregar una**, mirala con las cajas encima antes de publicar: los `x/y` a ojo fallan.
  Antes se pedía la lista entera a la API de Imgflip (`/api/memes`) y había muchas sin contexto.
- El reducer no conoce el catálogo: la pantalla que arranca la ronda manda un `pool` (y en el `tick`
  que abre la siguiente), y `reroll` trae la plantilla nueva. En la sala viaja `toRoomTemplate`
  (id, url, tamaño, cantidad de cajas); `cleanTemplate` solo acepta URLs de `https://i.imgflip.com/`.
- **Modos** (`options.mode`): `normal` reparte una plantilla distinta a cada uno; `same` le da la misma a
  todos y no deja cambiarla. **Cuántas veces puede cambiarla cada uno por ronda** lo elige el anfitrión
  (`options.rerolls`: 0, 1, 2, 3, 5, 10 o `UNLIMITED` = −1); `rerolled[id]` cuenta las que usó.
  `rerollsLeft` lo calcula para el reducer y la pantalla; una sala de antes (sin la opción y con `true`)
  queda en uno por persona.
- **Los textos no se dibujan en la imagen**: se guardan como `{ t, x, y, w, s, k }` (texto, posición y
  ancho en %, tamaño en `cqw`, letra negra) y `MemeView` los pone encima con CSS, en Anton con borde negro. Así no hace
  falta subir imágenes a ningún lado.
- Un meme sin texto no entra a la votación. Nadie vota el suyo; cuando votaron todos, pasa al siguiente.
- `history` guarda solo el mejor meme de cada ronda (últimos 5). El peor caso de sala da ~20.000
  caracteres: hay un test.
- `data-opt` y `data-stars` existen para manejar la app desde un navegador automatizado.

## A los Tiros

Inspirado en ROUNDS (de Landfall): duelos de 2 a 15 con bolitas armadas (hasta 15 desde la 1.12.2; los mapas tienen
4 lugares de aparición y del 5.º en adelante salen al costado, ver `spawnPoint` en `maps.js`). Los nombres de las cartas son
nuestros; los números (daño, vida, recarga, munición, rebotes) siguen los del original.

- **Lo que es por turnos va en la sala** (`rooms/{código}`, `gameType: 'tiros'`, reducer `game.js`):
  `lobby` → `picking` (todos eligen una carta al empezar) → `fight` → `battleEnd` → otra pelea, o
  `picking` de los que perdieron la ronda, o `final`. Cada pelea tiene número (`battle.n`), mapa,
  lugares y `startsAt` (cuenta regresiva de 3 s). Gana la pelea el último vivo; `options.battles`
  peleas ganadas = un punto; `options.rounds` puntos = partida.
- **Las cartas se eligen de a uno**, como en el original: `picking = { order, at, hand, chosen, chosenAt }`.
  Le toca a `order[at]` (`currentPicker`); `pick` lleva `turn` (= `at`) y deja `chosen` a la vista
  `REVEAL_MS`; el `tick` pasa al siguiente (o, si se le acabó `PICK_MS`, le da una al azar). La pantalla
  es `PickStage.jsx`: lienzo de 1600 × 900 unidades (cartas en %, personaje y brazo en un SVG con el
  mismo viewBox, textos en `cqw`). **A qué carta apunta el que elige no pasa por la sala**: va por
  `tiros/{código}/elige` (`{ k: turno, i }`, efímero), así se ve en vivo sin transacciones.
- **La pelea va en tiempo real, fuera del reducer**, con el mismo esquema que el fútbol: WebRTC
  directo (`futbol/p2p.js`, se reusa tal cual) y respaldo por `tiros/{código}/p/{id}` (texto JSON, sin
  guardarse en disco: `isEphemeral`). La señalización usa `signalingAt` de `storage.js`, compartida
  con el fútbol.
- **Cada pantalla es dueña de su jugador**: lo mueve, decide si una bala le pegó y cuánta vida le
  queda, y avisa a la sala con `died` cuando muere. El anfitrión puede mandar `died` con `target` por
  alguien que dejó de mandar fotos 8 s (pestaña cerrada sin salir).
- **Las balas no viajan por la red**: la foto lleva los disparos de los últimos 1,5 s
  (`{ k, t, x, y, a, sd }`) y cada pantalla las simula con `bulletsForShot` + `stepBullet` y las
  cartas del que tiró (`statsFor`). La semilla `sd` hace que el abanico y el desvío salgan iguales en
  todas. Una bala que llega tarde se adelanta **revisando si me pega en el camino** (`bulletTick`): sin
  eso, de cerca, el tiro atravesaba al otro sin hacerle nada.
- La foto también lleva los golpes recibidos (`hi`, para robo de vida, Carroñero, Sed de sangre del
  que tiró) y los escudos usados (`fx`, para los efectos sobre los demás). Todo se deduplica por `k`.
- Física a paso fijo (`STEP` 1/120 s). Mundo de 64 × 36; fuera de él no hay paredes. **El que se cae
  pierde el 20 % de la vida (`OUT_DAMAGE`) y sale disparado para arriba (`OUT_LAUNCH`) hasta casi el
  techo**, como en el original; mientras sube (`launching`) atraviesa los bloques, porque debajo de un
  piso que llega al borde rebotaba contra él y se moría cayéndose una y otra vez. Pedido explícito de
  Nico: que caerse siga haciendo daño y lanzando para arriba. **Con el escudo activo en ese momento no
  pierde vida** (`outDamage`), como en el original: sale disparado igual y las chispas salen blancas. Ojo con el salto corto (soltar el salto
  corta la subida a la mitad): `jumpCut` arranca en `true` y se pone en `true` al lanzar, si no
  también cortaba el lanzamiento.
- **Más vida, más grande** (pedido de Nico, como en ROUNDS): `sizeFor(maxHp)` en `sim.js` agranda el
  círculo de choque (`radiusFor`) y el dibujo, y frena el movimiento (÷ raíz del tamaño). Crece con la raíz
  quinta, entre ×0,8 y ×1,5. Los remotos usan `snap.mh`, que ya viajaba en la foto.
- **El personaje**: el círculo de choque (`PLAYER_R` 0,8 con 100 de vida) abarca cuerpo y piernas; la bolita se dibuja
  arriba (`BODY_R`) y los pies terminan en el borde de abajo, que es donde toca el piso (antes el cuerpo
  era todo el círculo y las piernas quedaban metidas en el piso). Piernas curvas, paso según lo que
  avanza, aplastado al caer, estirado al saltar, inclinación y sacudón al recibir un golpe: es solo
  dibujo (`animate` en `render.js`, un estado por jugador que no viaja por la red).
- **Movimiento y balas medidos de videos del original** (720 px de alto = 36 unidades): gravedad 110,
  salto 38, frenada exponencial (`MOVE_RESPONSE`), agarrarse de la pared (`WALL_SLIDE` 1,2), bala
  común a 37 u/s con gravedad 64; las cartas de velocidad de bala dividen la gravedad por el cuadrado
  del multiplicador. El salto lo subió Nico a pedido («más alto»).
- **Los mapas son copia de capturas del original**: los cuatro primeros, de capturas que mandó Nico
  (1920 px = 64 unidades: 30 px cada una); después pidió más y se sumaron Corona, Andamios, Hielo y
  Pradera, de la wiki de ROUNDS y del press kit de Landfall (Round7/8/9, 1280 × 720). **Los mapas
  nuevos van al final de `MAPS`**: la sala guarda el índice (`battle.map`). `ground` arma un piso con
  entrantes en franjas convexas; `accent` pinta piezas con `theme.accent`. Las piezas no son solo rectángulos: `shapes.js` tiene polígonos convexos y
  círculos (y con eso arma `rect`, `poly`, `capsule` y `group`, una pieza compuesta que se pinta de un
  solo color). `hitSolid` es el choque de un círculo (jugador, bala) contra un sólido. Contra el piso
  (normal hacia arriba) al jugador se lo sube derecho y, bajando una rampa caminando, se lo pega al
  piso: si no, en las rampas de 45° se resbalaba quieto y bajando iba a los saltitos. `decor` son
  pilares de fondo que no chocan.
- **Cajas sueltas** (`boxes.js`, en el Castillo son los postes de las U y las de los pedestales):
  cuadrados con masa y giro, impulsos acumulados (resolverlos sueltos hacía girar una caja apoyada),
  y se duermen quietas. Las simula la pantalla del último que las tocó o les pegó un tiro (`claimBox`:
  sube `s`; gana el `s` mayor y si empatan el id mayor, como la pelota del fútbol) y van en su foto
  (`bx`, `encodeBox`/`applyBox`); las demás pantallas las siguen con la última velocidad. El jugador
  las empuja con la velocidad que *quiere* tener (`pushVx`): la que le queda después de chocar ya
  viene frenada y apenas las movía.
- **Los efectos de las cartas son sprites** (`src/tiros/sprites/*.svg`, dibujados a mano; pedido de Nico: «que no
  sea todo arte de código»): sierra, nube tóxica, tormenta y rayo, campo curativo y cruz, remolino (Supernova), sol
  (Resplandor), explosión y humo, escudo, runas (Cuenta abisal), bombita, PEM, copo, onda, gota, estrella y globo
  tachado. `sprites.js` los carga con `import.meta.glob` y los pasa una vez a un canvas chico; `sprite(ctx, nombre,
  x, y, lado, giro, alfa)` los dibuja en unidades del mundo. **La nube tóxica son muchas partículas del mismo
  sprite**, como en ROUNDS. Lo que se ve al cubrirse (copos, onda, rayos, Silencio) va en `s.marks`, que llena
  `blockEffects` en todas las pantallas; no viaja por la red. Las balas de ¡Bombas! y del PEM llevan `kind`.
  Un sprite nuevo: un SVG de `viewBox="0 0 100 100"` en esa carpeta (y en `RES` si se ve grande).
- **El dibujo está en `render.js`** (sin estado de juego): fondo, haces de luz, sombras y piezas se
  pintan una vez por pelea en un canvas aparte (`background`); cajas, personajes, balas (una rayita,
  como en el original), explosiones y chispas (`burst`, partículas que no viajan por la red) cada
  cuadro. Las sombras salen de un punto de luz (`LIGHT`, arriba al medio) y se pintan juntas en otra
  capa para no oscurecer dos veces. Cada parte de una pieza se recorta por separado: recortarlas
  todas juntas anulaba donde se superponen (salían medias lunas negras en las cápsulas). Los colores
  de cada mapa están en `THEMES` de `maps.js`. Mientras sube lanzado después de caerse, el jugador
  lleva un anillo punteado y una estela blanca, como en el original.
- **Están las 67 cartas del ROUNDS de base** (lista de la wiki «All Cards») más Empujón, que es nuestra.
  Cómo viajan las que no son balas, sin tocar el reducer:
  - Los efectos de escudo pasan por `blockEffects(dueño, ev)`, que corre en **todas** las pantallas (también
    la del que se cubrió): deja en el mapa lo que se ve (campos, supernova) y, si el escudo es de otro,
    aplica lo que me hace a mí. PEM y ¡Bombas! son balas en anillo (`ringBullets`) con sus propias
    estadísticas en `b.st`, iguales en todas las pantallas a partir del evento. El tiro potenciado
    (Potenciar) lleva `em` en el disparo y dispara `blockEffects` donde pega.
  - Eco, Embestida, ¡Escudo arriba! y Cuenta abisal se cubren solos con `doBlock(..., { auto, quiet })`:
    `auto` no gasta el enfriamiento y `quiet` no vuelve a disparar Eco ni Embestida (se encadenaban).
  - Lo que se hace estando cerca (Sierra, Cuenta abisal cargada) viaja como marca en la foto (`sw`, `ab`) y
    el daño lo decide la pantalla del que está cerca; Presencia helada y Robavidas se calculan con las
    cartas del otro. Resplandor manda cada onda como evento (`w`). El aturdido/silenciado viaja en `su` (solo dibujo).
  - Descomposición reparte en 4 s el daño directo (`damageMe(..., dot)`: lo que ya entra de a poco no se
    reparte otra vez). Perseverancia prístina multiplica por 5 la vida actual y la máxima juntas, así
    entrar y salir del 90 % no se traba. Peleador suma y saca vida máxima.
- **Fila de cartas** (`options.cardLimit`, 0 = apagado, hasta `MAX_CARD_LIMIT`): pedido de Nico. Con el
  tope lleno, elegir una carta saca la primera de `cards` (en `choose`). El número es libre, por eso
  no está en `OPTION_VALUES`.
- `window.__tiros` (el estado de la pelea) y `data-tiros-canvas`, `data-card` existen para manejar el
  juego desde un navegador automatizado. Para probar el respaldo por el servidor, borrá
  `window.RTCPeerConnection` antes de cargar la página en uno de los navegadores.

## Entre Nosotros

Among Us en The Skeld, pedido de Nico: «tareas, impostores y tripulantes, mecánicas, personajitos», con
ventilaciones, sabotajes, fantasmas y visión limitada; solo compu (teclado). De 4 a 10 jugadores. El
`id` del juego es `nave` (`?juego=nave`, `gameType: 'nave'`, raíz `nave/` en `ROOTS`).

- **Mismo esquema que A los Tiros**: lo que es por turnos va en la sala (`game.js`, reducer puro con
  `{ now, rand }`): roles, tareas, muertes, cuerpos, reuniones, votos, sabotajes y quién gana. Las
  posiciones van en vivo, directo entre navegadores (`futbol/p2p.js`) y con respaldo en
  `nave/{sala}/p/{id}` (`naveChannel`, efímero). **Cada pantalla es dueña de su jugador**; el impostor
  manda en `kill` la posición de la víctima que ve, y ahí queda el cuerpo.
- Fases: `lobby` → `roles` (5 s) → `playing` ⇄ `meeting` → `ejection` (3 s de resultados y la
  expulsión) → `final`. `round` sube cada vez que se vuelve a jugar: con eso cada pantalla manda a su
  jugador alrededor de la mesa del botón (`spawnPoint`). Los relojes los cierra cualquiera con `tick`.
- **El mapa es una grilla** (`map.js`): salas y pasillos son rectángulos que se tocan de costado; lo
  de afuera es pared. Los obstáculos (mesas, cajas) no se pisan pero no tapan la vista. Las estaciones
  de tareas (`STATIONS`, `tarea:sala`), las ventilaciones (`VENTS`, con `to` en los dos sentidos),
  el botón, el tablero de luces y los lectores del reactor tienen que estar en el piso y libres: **hay un
  test** que lo revisa, y otro que recorre el mapa para ver que se llega a todas las salas.
- **Choques y vista** (`sim.js`): caja de choque a la altura de los pies, moviendo primero en x y
  después en y (así se desliza por las paredes). La vista son rayos por la grilla (DDA) que frenan en
  las paredes; la niebla se pinta en un canvas aparte y los que se ven se dibujan **después** de la
  niebla, enteros. Los fantasmas no tienen niebla, atraviesan paredes y solo los ven otros fantasmas.
- **Tareas** (`tasks.js`): las comunes son iguales para todos; cada tarea es `{ k, s: [estaciones],
  d: pasos hechos }`. Los impostores tienen una lista de mentira y no pueden hacerlas. El minijuego de
  cada una está en `Minigames.jsx`; la sala solo se entera del paso (`task`). Escanearse se ve desde
  afuera (`sc` en la foto), como la tarea visual del original.
- **Sabotajes**: luces (los tripulantes ven `LIGHTS_OUT` de su radio; se arreglan subiendo las 5
  palancas de Electricidad, estado compartido en la sala) y fusión del reactor (30 s; dos personas
  distintas en los dos lectores a la vez; si se acaba el tiempo ganan los impostores). Una reunión
  cancela el reactor, no las luces. Con el reactor no se toca el botón de emergencia.
- **Ventilaciones**: solo en la pantalla del impostor (`v` en la foto); los demás no lo dibujan y, si
  lo ven, ven abrirse la tapa.
- El anfitrión saca de la partida (`gone`) al que no manda su posición en 15 s (pestaña cerrada).
- **El que entra tarde solo mira** (`inGame: false`); por eso no está en `JOIN_IN_PROGRESS`.
- El peor caso de sala (10 jugadores con todas las tareas, chat lleno de comillas) queda por debajo de
  26.000 caracteres: hay un test. El chat tiene `MAX_CHAT` y `CHAT_BUDGET`.
- `window.__nave` (el estado de la pantalla: posición propia, demás, ventilación) y `data-act`,
  `data-vote`, `data-color`, `data-chat-list` existen para manejar el juego desde un navegador
  automatizado. **Con el panel del navegador oculto no hay cuadros de `requestAnimationFrame`**: el
  juego sigue (`everyFrame`), pero el canvas no se redibuja; para capturas, mostrá el panel.
- Los dibujos son nuestros (el poroto con visor de `render.js` y `Bean.jsx`), pero el juego, el mapa y
  los nombres de las tareas copian a Among Us (de Innersloth): entre amigos está bien; si llegara un
  pedido de bajarlo, se saca la entrada de `games.js`.

## Cohete Royale

Clon de Rocket Bot Royale (de Winterpixel), pedido de Nico: battle royale de tanquecitos en un mapa que se
rompe a cohetazos mientras sube el agua. De 2 a 25, solo compu. `id`: `cohetes` (`?juego=cohetes`,
`gameType: 'cohetes'`, raíz `cohetes/` en `ROOTS`). **La primera versión estaba mal entendida** (colinas,
cohetes en arco); Nico mandó un video del original y se rehízo con esto, que es como funciona de verdad:

- **El mapa** (`terrain.js`): bloques flotando en el espacio, acomodados en una grilla (`CELL`). Dos temas
  (`THEMES`, sale de la semilla): **tierra** (anillos y «U» huecas, tierra a cuadros con **borde verde en todos
  los lados, también en los cráteres**, fondo violeta) y **hielo** (triángulos llenos y huecos, barras en
  diagonal y «V», blanco con borde celeste en capas, fondo azul, picos de hielo). El borde se calcula con la
  distancia al aire (`render.js`). Es una grilla de «píxeles» armada desde la semilla: todas las pantallas
  tienen el mismo mapa, y como cavar es borrar, con los mismos cráteres (en cualquier orden) queda igual.
- **El tanque se pega a cualquier superficie** (`stepTank` en `sim.js`): maneja por el piso, las paredes y los
  techos y gira con ella (`nx`, `ny` = la normal). **Cada tecla lleva siempre para el mismo lado del tanque**
  (por la tangente `(-ny, nx)`, con signo fijo): cabeza abajo en el techo de un cuadrado, D va para la
  izquierda aunque se suelte y se vuelva a apretar. Pedido explícito de Nico: antes el sentido se decidía al
  apretar y al soltar cambiaba. **No hay propulsor**: se despega solo con un empujón fuerte (`push`, más que
  `UNSTICK`): el retroceso de un tiro (`KICK` por arma) o una explosión (la propia empuja al 70 %). Nico pidió
  tanque más lento, menos gravedad y menos empujón (`DRIVE`, `GRAVITY`, `RECOIL`, `KNOCK`) y cámara más lejos (`VIEW_W`).
- **Inventario** (`addItem`/`useItem`): 4 casillas (`SLOTS`), con 1 a 4 o un clic. La 1 es el cohete, infinito,
  con cargador de 3 (`MAX_AMMO`) que se recarga de a uno cada 1,85 s (`RELOAD`); en las otras tres se apila lo que agarrás
  (`{ w, n }`). Con las tres llenas no se agarra una caja de otra cosa: queda ahí.
- **Los objetos** (`ITEMS`, de la wiki del original) tienen `kind`: `shot` (proyectiles: nuclear, mina, ráfaga de
  5, metralla, granadas, taladro, teledirigido, veneno y humo, que dejan una zona `ZONES`), `self` (escudo,
  jetpack; la curita +30 se usa al agarrarla, no entra al inventario), `charge` (láser: 2 s cargando, después un rayo instantáneo) y `zone` (remolino, que se
  arma en todas las pantallas desde el disparo con `zoneFromShot`). El escudo devuelve los tiros: lo decide la
  pantalla del que tiró, que lo ve en la foto del otro (`sd`), y desde ahí el tiro es del dueño del escudo. El
  taladro manda cada tramo del túnel como explosión `drillseg` (solo cava).
- **Al empezar**, dos helicópteros (`shipAt(s, W, H, k)`): el 0 sale de la izquierda y el 1 de la derecha, al ras
  del agua; van derecho hasta que la cuenta llega a 2 (`SHIP_FLAT`), suben hasta el medio del mapa (de ancho y de
  alto, no hasta arriba: pedido de Nico) y bajan hasta el agua de la otra punta. `shipFor` reparte a los jugadores de a uno.
  5 s de «¡Preparate!» y después «Disparo para saltar»; se baja en paracaídas (`mode: chute`). Si no saltás,
  te tira solo pasados los tres cuartos del recorrido, antes de que baje hasta el agua. Un clic cortito cuenta igual (`pressed`).
- **La sala** (`game.js`) guarda lo de a una vez: la semilla (`match.seed`), cuántos eran al empezar
  (`match.size`, define el ancho), quién murió, quién lo mató y con qué (`died`, con `by` y `w`), las monedas y
  cajas agarradas (`coin`/`crate`: el primero gana) y el ranking (`place`, `kills`, `coins`, `score`). Gana el
  último vivo. El que entra tarde mira.
- **En tiempo real, como A los Tiros**: cada pantalla es dueña de su tanque (paso de 1/120 s) y manda una foto
  (WebRTC directo, respaldo en `cohetes/{sala}/p/{id}`) con posición, normal, `m` (helicóptero, paracaídas o
  tanque), escudo (`sd`), jetpack (`jt`) y láser cargando (`ch`). Los disparos viajan en la foto (`sh`) y cada
  pantalla simula los proyectiles, pero **dónde explota cada uno lo decide la pantalla del que tiró** y lo manda
  en `ex`: todas cavan ese cráter y arman la misma zona, y cada una calcula el daño y el empujón de su propio
  tanque (`blastOn`); el veneno lo calcula cada una para el suyo. Las copias de los demás solo se ven.
- **El agua** sube con el tiempo de partida (`waterY`: 30 s quieta mientras bajan todos, después sube según la
  opción de velocidad). Hundirse o quedarse sin vida es quedar afuera; si alguien te pegó en los últimos 6 s,
  la baja es suya (y con su arma).
- **Todos los tiros tienen gravedad** (pedido de Nico: «no pueden ser lineales»), menos el láser.
- **Monedas** en fila (de la semilla) y **cajas de metal**: `MAP_ITEMS` (8) tiradas por el mapa solo al empezar
  (`mapItems`, índices desde `MAX_DROPS`) y una cada 10 s en paracaídas (`crateInfo`).
- La pantalla imita la del original: los 3 cohetes y las 4 casillas abajo al medio, el círculo «tanques quedan»
  arriba a la derecha con las bajas abajo («X [arma] Y»), «Eliminaste a X» en el medio, una flecha roja alrededor de tu tanque hacia el enemigo más cercano (`drawArrow`), el cartel
  «¡ELIMINADO! por X con [arma]» con el puesto («N de M») y «X GANA» al final. No hay mapa chico.
- El anfitrión da por muerto al que no manda fotos en 12 s (pestaña cerrada).
- `window.__cohetes` (estado de la pantalla: tanque, demás, proyectiles, cajas) y `data-cohetes-canvas`
  existen para manejar el juego desde un navegador automatizado.
- Los dibujos son nuestros, pero el juego copia a Rocket Bot Royale: entre amigos está bien; si llegara un
  pedido de bajarlo, se saca la entrada de `games.js`.

## Pixel Royale

Battle royale 2D con cámara de arriba y pixel art, pedido de Nico. De 2 a 10, solo compu. `id`: `pixel` (`?juego=pixel`,
`gameType: 'pixel'`, raíz `pixel/` en `ROOTS`). Dos mapas (`MAPS` en `map.js`): **Isla Grande** (100 × 100 casillas, hasta 10) e
**Isla Chica** (60 × 60, hasta 5; `startProblem` no deja arrancar con más). Mapas nuevos: agregalos a `MAPS`.

- **Mismo esquema que Cohete Royale**: lo de a una vez va en la sala (`game.js`: semilla, muertos, botín levantado, ranking) y lo
  en vivo, directo entre navegadores (`futbol/p2p.js`) con respaldo en `pixel/{sala}/p/{id}` (`pixelChannel`, efímero). Cada pantalla es
  dueña de su jugador y avisa `died`. El anfitrión da por muerto al que no manda fotos en 12 s.
- **El mapa sale de la semilla** (`makeMap`, sin `Math.random()`): isla con ruido, casas con puertas, bosques, rocas y cajas. **No uses
  `sort` con comparador aleatorio** (cada navegador ordena distinto y los mapas dejan de coincidir). Árboles, cajas y paredes se rompen
  (`damageTile`, `TILE_HP`); la vida de cada casilla vive en `t.hp` de cada pantalla.
- **Quién decide cada cosa**: una bala común la juzga la pantalla de **a quien le pega** (avisa en `hi` para que desaparezca en las demás);
  lo que rompe casillas (balas contra paredes, cohetes, granadas) lo decide la del **que tiró** y viaja en `ex` (`{k, x, y, w, o}`): todas
  rompen lo mismo y cada víctima calcula su daño (`blastOn`). Los eventos se deduplican por `k` (`s.seen`).
- **La tormenta** (`zoneAt`, `PHASES`) y las **cajas del cielo** (`dropInfo`, índices de botín desde `DROP_BASE`) son determinísticas: todas
  las pantallas calculan lo mismo a partir de la semilla y la hora de inicio. El botín (`lootSpots`) lo levanta el primero que llega (`loot`).
- **Dibujo**: todo va a un canvas de 384 px de ancho que el CSS agranda con `image-rendering: pixelated`. Los sprites se arman con código
  (`render.js`, sin imágenes) y el texto del mundo usa una fuente propia de 3 × 5 píxeles (`drawText`). El borde de la zona se pinta fila por fila para que quede en píxeles.
- `window.__pixel` y `data-pixel-canvas` existen para manejar el juego desde un navegador automatizado. No los saques.

## Mario vs Luigi

No es un juego nuestro: es la compilación web (Unity WebGL, Unity 6000.3.10f1) de
[NSMB-MarioVsLuigi](https://github.com/ipodtouch0218/NSMB-MarioVsLuigi), sin cambios, en `public/mvl/`.
`src/mvl/MvlApp.jsx` solo la muestra en un iframe (`/mvl/`) con pantalla completa.

- **El online es el de Photon Quantum, pero con nuestra app** (no la de ipodtouch): las salas son
  solo nuestras, separadas de las de itch.io, y no pasan por las salas de Tareas Fondeanas.
- **Todo pasa por nuestro Worker** (`worker/photon.js`), porque en el cole bloquean Photon pero
  Cloudflare abre. `public/mvl/index.html` reemplaza `WebSocket`, `fetch` y `XMLHttpRequest` antes de
  que arranque Unity: `wss://ns.photonengine.io/…` y `wss://gc….exitgames.com/Master|game/…` pasan a
  `/api/photon/<host>/…`, y `mariovsluigi.azurewebsites.net` (el token de ipodtouch y las novedades)
  pasa a `/api/mvl/…`. El Worker devuelve la respuesta del `fetch` tal cual, así Cloudflare une los
  dos WebSocket sin que los mensajes pasen por nuestro código (no gasta CPU). Solo acepta hosts de
  Photon y esas rutas de Azure: no es un proxy abierto. **Para ver si anda**, en la pestaña Red no
  tiene que aparecer ninguna conexión a `photonengine.io`, `exitgames.com` ni `azurewebsites.net`.
- **Nuestra app de Photon Quantum 3** («TF MVL», `097c581c-…`, de Nico) se usa sin recompilar: el
  App ID viaja en texto en los primeros mensajes de cada conexión y `index.html` lo cambia ahí
  (`OLD_APP` → `NEW_APP`). En su panel de Photon tiene:
  - **Autenticación personalizada** con la URL `https://tareas-fondeanas.nicocukier.workers.dev/api/photon-auth`
    (deja pasar a todos). El juego siempre pide autenticación «Custom»: sin proveedor, Photon
    responde «Authentication type not supported (none configured)»; con la URL mal escrita
    (pasó: `https://https://…`), «CustomAuth service error». Los cambios tardan unos minutos en llegar.
  - **Solo la región `sa`** (Regions Allowlist). La «mejor región» se mide pasando por Cloudflare y
    salía Asia; así todos caen en Sudamérica y se ven las salas entre ellos.
  - Plan gratis: **20 jugadores conectados a la vez**.
  Para volver a la app de ipodtouch alcanza con `NEW_APP = OLD_APP`.
- **Cloudflare acepta archivos de hasta 25 MB** y `web-mvl.data.unityweb` pesa 43: está partido en
  `.part0` y `.part1` (`split -b 22000000 -d -a 1`) y `public/mvl/index.html` lo vuelve a juntar en el
  navegador (un Blob) antes de `createUnityInstance`. La compilación usa compresión Brotli con
  «decompression fallback» (archivos `.unityweb`), así que no depende de los encabezados del servidor.
- **Para actualizarlo**: compilar en Unity para Web en `web-mvl/` (está en `.gitignore`), copiar
  `Build/`, `StreamingAssets/` y `TemplateData/` a `public/mvl/`, partir de nuevo el `.data` y revisar
  que los nombres en `index.html` coincidan (`productVersion` incluido).
- En Chromium de pruebas (Playwright) el audio tira «Unable to decode audio data»: le faltan los
  códecs. En Chrome/Edge/Firefox normales anda.
- Los dibujos y sonidos son de Nintendo: entre amigos está bien, pero si llegara un pedido de bajarlo,
  se saca la entrada de `games.js` y la carpeta `public/mvl/`.

## Fútbol: HaxBall

El modo pelotas es **HaxBall tal cual**: pedido de Nico, «que se vea exactamente igual y funcione igual
que haxball». El modo coches es nuestro y no cambió.

- **`src/futbol/haxball.js` es el motor de HaxBall copiado del original**, sacado de
  [node-haxball](https://github.com/wxyz-abcd/node-haxball) (reconstruye el código de haxball.com; el
  motor está en `src/api.js`, minificado, y el dibujo en `examples/renderers/defaultRenderer.js`). Mismos
  números (`PLAYER_PHYSICS`, `BALL_PHYSICS`), mismo orden de las cuentas (`stepWorld` = `World.LM`:
  todos avanzan y se frenan, después choques disco–disco y contra planos, segmentos y vértices), mismos
  grupos de choque (`CF`) y los estadios por defecto (`STADIUMS`, armados como `Stadium.WG`). **No
  «mejores» nada de ahí**: si algo se juega distinto que en HaxBall, compará contra node-haxball.
- **Unidades de HaxBall**: píxeles y pasos de 1/60 s (`TICK_MS`), origen en el medio de la cancha. En el
  estado y en las fotos de la red las velocidades van en píxeles **por segundo** (×60), como antes;
  `stepPhysics` las convierte. Con `dt = TICK_MS` el paso es exacto; otro `dt` (adivinar a un remoto) es
  aproximado.
- **La patada** (`isKicking`, borde blanco): se arma al apretar, se gasta al pegarle (alcance: 4 entre
  bordes) y no vuelve hasta soltar. Mientras está armada se acelera 0,07 en vez de 0,1.
- **El saque** (`state.kickoff = { team, pending }`): saca el equipo al que le hicieron el gol
  (`kickoffTeam` en `FutbolGame.jsx`). Mientras la pelota no se movió, los jugadores llevan en su máscara
  la barrera del que saca (`playerMask`): la línea del medio y medio círculo central.
- **Después del gol se sigue jugando 2,5 s** y el saque es enseguida: `goalMatch(..., HAX_PAUSES)`
  guarda `gp` (cuánto dura el festejo) en el partido. Durante el festejo `stepOnline` no declara goles.
- **Al terminar el partido cada uno vuelve a la sala cuando quiere** (pedido de Nico): «Volver al lobby» manda
  `backToLobby`, que marca solo a ese jugador (`back`). La fase sigue en `ended`: el que volvió ve la sala de espera
  (puede elegir equipo; el anfitrión, cambiar opciones), los que siguen en el final aparecen «(Esperando...)»
  (`waitingPlayers`) y `canStart` da falso. Cuando volvieron todos (o se fueron, o los sacaron) la sala pasa a
  `lobby`. «Volver a la sala» del menú de pausa, con el partido en juego, sigue llevando a todos (`toLobby`).
- En red, **la pelota atraviesa a los jugadores remotos** (`fixed` en `stepWorld`): cada uno la toca en
  su pantalla y la reclama, como antes.
- `haxRender.js` es el dibujo del renderer por defecto de HaxBall: cámara que sigue al medio entre la
  pelota y vos, halo en tu jugador, número en cada uno, flechas hacia lo que no se ve, carteles con
  `Animator` (curvas de Hermite). El pasto es una textura propia parecida, no la imagen de HaxBall.

## Fútbol: sincronización en tiempo real

Todo en `src/futbol/net.js` (lógica pura, con tests en `tests/futbol-net.test.js`), `src/futbol/p2p.js`
(conexión directa) y el bucle de `FutbolGame.jsx`.

**Las fotos van directo entre navegadores (WebRTC DataChannel, sin orden ni reenvíos)**, una por cuadro.
Por conexión directa tarda lo que tarda la red entre las dos pantallas; por Firebase (antes) cada
foto tardaba de 200 a 1.200 ms. El servidor de salas queda para tres cosas: la señalización (presentar
a las pantallas), el partido (`match`, con transacción) y el **respaldo**: si con alguien no se arma el
canal directo (redes que lo bloquean; no hay servidor TURN), las fotos para esa persona van por el
WebSocket cada 50 ms. Si todos reciben directo, igual se escribe una foto por segundo. Lo mismo puede llegar por los
dos caminos: la copia más vieja se descarta sola en `receiveSnapshot` (hora anterior a la última).

- Cada par de pantallas arma un solo canal y **lo inicia la de id menor**. Cada montaje tiene una
  sesión (`sid`) nueva; un mensaje dirigido a una sesión vieja se ignora. Solo el que inicia reintenta
  (hasta 4 veces, si no abre en 8 s).
- «¿Todos reciben directo?» se pregunta por **los jugadores de la sala**, no por los anunciados: alguien
  sin WebRTC nunca se anuncia, y si se lo contara por los anunciados se le dejaría de mandar por Firebase.
- El HUD muestra el estado bajo el reloj (`data-link`: `directo`, `mixto` o `servidor`).
- Por el canal viajan `{ c: 'p' | 'b' | 'm' | 'u', d }`: jugador, pelota, partido (tras un gol) y turbo.

**La física corre a paso fijo** (`fixedSteps`): 1/60 s en pelotas (`TICK_MS`, el de HaxBall) y 1/120 s
en coches (`PHYSICS_STEP_MS`), online y en el 1v1 local. Con el paso igual al largo del cuadro, una pantalla de 144 Hz y otra de 60 Hz resolvían distinto
los choques y las patadas, y cada una veía otra pelota. Lo propio se dibuja interpolado entre los dos
últimos pasos (`captureBodies` / `blendBodies`), así no hay tirones.

En la base, todo va por `futbol/{sala}`, **fuera** de `rooms/`: son fotos que se pisan
muchas veces por segundo y no pasan por el reducer ni por el tope de 30.000 caracteres.

| Rama | Quién escribe | Qué es |
|---|---|---|
| `players/{id}` | solo ese jugador | Su foto: posición, velocidad, ángulo/turbo/flip o patada, y sus teclas en bits |
| `ball` | quien la tocó último | Posición y velocidad, con dueño `o` y cambios de dueño `s` |
| `match` | cualquiera, con transacción | Saque `k`, hora del servidor en que se juega `at`, reloj `c`, marcador `sr`/`sb` |
| `pickups/{i}` | quien agarró el turbo | Hora a la que reaparece (modo coches) |
| `peers/{id}` | solo ese jugador | Su sesión, para armar la conexión directa. Se borra al desconectarse |
| `signal/{id}` | cualquiera | Buzón de oferta, respuesta y candidatos WebRTC para ese jugador. Se borra al leerse |

`worker/rules.js` permite `futbol/{código}`; sin eso el online no anda.

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
  infladas (daba ~300 ms donde en realidad había 50). Para probar el respaldo por el servidor, borrá
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