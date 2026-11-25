# Lobbys nuevos: dónde quedó el trabajo

Pedido de Nico: un diseño de sala de espera propio para cada juego, acorde al juego, **sin cambiar la funcionalidad** y con una regla
firme: **toda la info en la primera pantalla, sin scrollear** (repartida en horizontal) y con el **botón de empezar siempre a la vista**.

Estado: a medio hacer, **sin versionar en `updates` y sin publicar**. Está en la rama `claude/zealous-hypatia-diddsr`, no en `master`.
Los tests pasan (784) y el build compila. Borrar este archivo cuando se termine.

## Cómo está armado (ya hecho)

- `src/lobby/LobbyLayout.jsx` se reescribió: panel del juego a la izquierda (nombre, código, copiar link, salir, sala pública, cambiar de juego,
  sacar a alguien, «Cómo se juega») y a la derecha jugadores y opciones en horizontal, con el botón de empezar abajo.
- `src/lobby/themes.js`: la identidad de cada juego (colores, dibujo de fondo, tipografía, forma de las fichas del código, emojis que flotan,
  si la sala es oscura). Nombre, emoji y frase salen de `games.js`.
- `src/lobby/lobby.css`: todo el estilo. `src/lobby/context.js`: `InLobby`, para que `LobbyOptions` y `LobbyActionSection` sepan que están
  adentro del lobby aunque estén dentro de otro componente.
- Cada juego le dice a `LobbyLayout` qué es cada pieza con `data-lb="players" | "options" | "help" | "start"` (`LobbyOptions` cuenta como
  opciones y `LobbyActionSection` como empezar; un `data-lb` en cualquiera manda sobre el tipo). «help» (cómo se juega) va en una ventana
  que abre un botón del panel. Prop `layout="teams"` (Código Secreto, Café o Té, Fútbol): los equipos arriba a todo lo ancho.
- Los 20 juegos que usan `LobbyLayout` ya tienen `game="..."` y sus `data-lb` (ver `git diff` de las `*App.jsx`).
- Compactaciones por juego en su CSS, con `.lb[data-game='...']`: `cohetes.css`, `arena.css`, `nave.css`.
- En pantallas bajas (≤ 780 px de alto) todo se achica con `zoom` (0,92 a 0,68); en ≤ 900 px de ancho o ≤ 480 de alto se apila y el botón de
  empezar queda pegado abajo (en celular no se puede evitar el scroll).

## Cómo se probó

Un script de Playwright (no versionado) entra a cada juego, crea la sala y mide el desborde de `.lb-col`, `.lb-rail` y la página. Con servidor
local: `wrangler dev` con el `wrangler.jsonc` sin la línea `"ai"` (ver CLAUDE.md) más `npx vite --port 5173` (pasa `/api` al 8787). Ir a
`http://localhost:5173/?juego=ID`, poner el nombre, «Crear sala». Medido en 1366×768, 1366×650, 1280×720, 1280×600 y 1920×950.
En la última pasada completa (antes de agregar el `zoom`) fallaban: Código Secreto (10 px en 1366×768), Arena (44 px en 1280×720), Nave
(67 px en 1280×720). Con el `zoom` la pasada en 1366×650, 1280×600 y 1920×950 dio todo sin desborde. **Falta repetir la pasada completa en
1366×768 y 1280×720 después del último cambio de `nave.css`** (los botones de color de Nave se achicaron) y mirar las capturas.

## Lo que falta

1. **Mirar cada lobby en una captura** (solo se vieron Meme, Cohete, Arena, Código Secreto y Nave). Revisar que ninguno tenga cosas cortadas,
   que el botón de empezar se lea con texto y que cada juego se vea distinto. Faltan por mirar: Abismo, Bombardero, Café o Té, Fuego Cruzado,
   Fútbol, Generala, La Mecha, Cubolandia, Monopoly, Pista Loca, Pixel Royale, Royale 3D, T.E.G., La Timba y A los Tiros.
2. **La Mecha no se pudo probar con el script** (no encuentra el botón de crear sala en su entrada): probarla a mano.
3. **Las salas de «Retomar partida» de La Timba y Monopoly** (fase `resume`, `data-seats`): verlas, nunca se miraron con el diseño nuevo.
4. **Fútbol en modo entrenamiento y partida local** (cambian `gameTitle`, que ahora sale como el texto chico arriba del nombre).
5. **Código Secreto con 3 y 4 equipos**: las tarjetas de equipo y el tablero de opciones pueden desbordar en pantallas bajas.
6. **Cohete Royale por equipos y Roba la bandera** (aparecen la tarjeta de equipos y las opciones de tiempo y banderas): medir el desborde.
7. **Arena en los modos «doble» y «triple»** (en vez del mazo sale una tarjeta de aviso) y con las 50 cartas: medir el desborde.
8. **Los lobbys que no usan `LobbyLayout`** (Trazo Loco ya tiene el suyo; Fondo Kart, Tenis Movido y Juegos Wii tienen pantallas propias):
   decidir si se les da el mismo tratamiento. Hoy no se tocaron.
9. **Limpiar `ui.css`**: las clases `.tf-lobby-head`, `.tf-code-tiles`, `.tf-lobby-actions` y `.tf-lobby-subtitle` ya no las usa
   `LobbyLayout`; confirmar con `grep` que nadie más las usa y borrarlas (`.tf-eyebrow` sí se usa en otros lados).
10. **Revisar la lista de «cómo se juega» dentro de la ventana** (Abismo, Bombardero, Cohete, Nave, Cubolandia, Pixel, Tiros, Generala, Timba,
    Royale 3D, FPS, Pista): que se lea bien con el estilo de cada juego.
11. **Terminar según el CLAUDE.md**: agregar la entrada en `updates` (cambio grande: sube Y; la última es la 1.74.2, o sea 1.75.0), actualizar
    el CLAUDE.md (sección *Diseño* y la de salas de espera: el `LobbyLayout` nuevo, `themes.js`, `data-lb`, `layout`), commit, push a `master`
    para publicar y revisar el sitio. Un juego nuevo con sala tiene que sumar su tema en `themes.js`.
