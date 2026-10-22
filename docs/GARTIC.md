# Trazo Loco

Nuevo juego integrado al menú existente mediante `?juego=gartic`. Las invitaciones agregan `&sala=ABCD`. Usa React/JSX, el mismo servidor de salas que los otros juegos y el nombre guardado de la plataforma. Reutiliza LobbyLayout y Credits. La sesión de dibujo tiene su propia clave para no sobrescribir la sesión de Código Secreto.

## Modos disponibles

- Normal: texto, dibujo, descripción, dibujo, etc.
- Imitación: dibujos; la referencia desaparece después de cinco segundos y cada ronda reduce diez segundos el tiempo disponible, hasta un mínimo de quince.
- Historia: escritura en todas las rondas; solo se recibe la frase inmediatamente anterior.
- Sandwich: texto al principio y al final; todas las rondas intermedias son dibujos.

Las once modalidades restantes aparecen con candado. Una partida requiere de 3 a 20 participantes conectados. Cada participante inicia una cadena y todas las cadenas rotan una posición por ronda. La partida dura tantas rondas como participantes, de modo que nadie vuelve a recibir su propia cadena.

## Datos y privacidad

Todo vive en el Durable Object de la sala (ver `src/realtime.js` y `worker/`). Trazo Loco no usa el JSON público de `rooms/`: ese formato no permite proteger contenidos privados ni soporta dibujos grandes.

- `garticRooms/{code}`: anfitrión, jugadores, lugares del lobby, modo, configuración y estado público.
- `garticPresence/{code}/{uid}/{connection}`: conexiones; se eliminan con onDisconnect.
- `garticSteps/{code}/{match}/{round}/{uid}`: borrador/entrega privada, con tipo, contenido, autor y orden.
- `garticReady/{code}/{match}/{round}/{uid}`: confirmación individual.

El UID es propio de cada pestaña, sin registro: la pestaña guarda un secreto al azar en `sessionStorage` y su UID es el hash de ese secreto. El servidor recalcula el hash al conectarse, así nadie puede hacerse pasar por otro jugador.

Las reglas están en `worker/rules.js`. Nadie puede leer la colección de entregas durante la partida. Cada jugador lee sus propias entregas y, durante su tarea, la entrega anterior del participante que le corresponde. La lectura del conjunto se habilita solo en la revelación de esa partida. Solo el autor escribe su entrega, y queda inmóvil al confirmarla. Cada uno marca solo su propia conexión y su propia confirmación.

El reloj usa `serverTimestamp()` (lo reemplaza el servidor al escribir) y `.info/serverTimeOffset` (se estima con `/api/hora`). Un participante conectado coordina el avance; si se desconecta, otro toma esa tarea. Una conexión perdida conserva el participante, la tarea y el último borrador recibido. El borrador local permite recuperar cambios después de recargar.

Como cualquier contenido que ya se entregó a un navegador, una referencia de Imitación podría conservarse fuera de la interfaz. El modo la oculta al terminar la memorización; no pretende borrar algo que el jugador ya vio.

**Quién avanza la ronda** (cuando están todos listos o se acabó el tiempo más 5 s): una pantalla, la del primer participante conectado por id, enseguida. Si esa no puede (pasó en el colegio: la conexión se le trabó pero el servidor la seguía viendo conectada, y la partida quedaba frenada para todos), lo hace la segunda a los 4 s, la tercera a los 8, y así (`myTurnToAdvance`, `ADVANCE_BACKUP_MS`). El avance es una transacción que mira la ronda, así que pasa una sola vez.

No hay un servidor ejecutando rondas cuando todos están desconectados: al volver un participante, se procesa el plazo vencido y la partida continúa. Una sala sin escrituras durante tres días se borra sola.

## Editor y resultados

Lienzo de 960 × 600 con eventos Pointer para mouse y touch. Incluye lápiz, goma, línea, rectángulo/círculo con y sin relleno, balde, color, grosor, limpiar y veinte niveles de deshacer/rehacer (Ctrl+Z / Ctrl+Y, y una letra por herramienta). Las entregas son PNG con un máximo de 600.000 caracteres por dibujo; los textos tienen un máximo de 300.

Además del PNG, cada dibujo guarda sus **trazos** (`strokes`, texto JSON, hasta `MAX_STROKES`): una operación por paso del historial, `[herramienta, color, grosor, ...coordenadas]` (ver `drawing.js`). Deshacer saca la última, rehacer la devuelve. En el álbum `makeReplayer` los vuelve a dibujar en `REPLAY_MS` y después se muestra el PNG, que es el exacto. Si los trazos no están (un borrador recuperado sin ellos, o pesan demasiado), se muestra la imagen sola.

Los tiempos son dos (`settings.writeSeconds` para escribir, `settings.seconds` para dibujar), de `TIME_CHOICES` o uno escrito a mano entre 5 y 600 s. Las salas viejas, con un solo `seconds`, pasan por `roomSettings`.

**La presentación del final es una sola para todos.** `state.show = { index, playing, at }`: los pasos de todos los álbumes van en fila y `showPosition` calcula, con la hora del servidor, en cuál está cada pantalla. Si `playing`, avanza sola según `showDurations` (más tiempo en los dibujos, por la reproducción, y una pausa entre álbumes); si no, se queda en `index`. Solo el anfitrión la mueve (`showControl`: automático, pausa, paso y álbum siguiente/anterior). `settings.autoShow` decide si arranca sola al terminar la última ronda. Cuando termina, cada uno puede abrir el álbum que quiera tocando un jugador. El anfitrión puede preparar una revancha. Las capturas de la prueba están en `docs/gartic/`.

## Verificación

`npm test` incluye las pruebas puras de reparto, secuencias, reloj, álbumes y balde, y las de privacidad de las entregas contra el servidor de salas (`tests/realtime.test.js`). Para probar una partida de verdad hacen falta tres pantallas: `npm run servidor` y tres navegadores o ventanas privadas distintas en http://localhost:8787/?juego=gartic (cada pestaña es un jugador).
