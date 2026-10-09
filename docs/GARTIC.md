# Trazo Loco

Nuevo juego integrado al menú existente mediante `?juego=gartic`. Las invitaciones agregan `&sala=ABCD`. Usa React/JSX, la misma app y conexión Firebase que los otros juegos y el nombre guardado de la plataforma. Reutiliza LobbyLayout y Credits. La sesión de dibujo tiene su propia clave para no sobrescribir la sesión de Código Secreto.

## Modos disponibles

- Normal: texto, dibujo, descripción, dibujo, etc.
- Imitación: dibujos; la referencia desaparece después de cinco segundos y cada ronda reduce diez segundos el tiempo disponible, hasta un mínimo de quince.
- Historia: escritura en todas las rondas; solo se recibe la frase inmediatamente anterior.
- Sandwich: texto al principio y al final; todas las rondas intermedias son dibujos.

Las once modalidades restantes aparecen con candado. Una partida requiere de 3 a 20 participantes conectados. Cada participante inicia una cadena y todas las cadenas rotan una posición por ronda. La partida dura tantas rondas como participantes, de modo que nadie vuelve a recibir su propia cadena.

## Firebase y privacidad

`src/firebase.js` centraliza la app existente; no se crea otro proyecto Firebase. Los otros juegos conservan sus ramas y reglas originales. Trazo Loco no usa el JSON público de `rooms/`: ese formato no permite proteger contenidos privados ni soporta dibujos grandes.

- `garticRooms/{code}`: anfitrión, jugadores, lugares del lobby, modo, configuración y estado público.
- `garticPresence/{code}/{uid}/{connection}`: conexiones; se eliminan con onDisconnect.
- `garticSteps/{code}/{match}/{round}/{uid}`: borrador/entrega privada, con tipo, contenido, autor y orden.
- `garticReady/{code}/{match}/{round}/{uid}`: confirmación individual.

El UID proviene de Firebase Authentication anónimo con persistencia por pestaña; el jugador no completa un registro. **Habilitá el proveedor Anónimo en Firebase Console → Authentication → Sign-in method.**

Las reglas impiden leer la colección de entregas durante la partida. Cada jugador puede leer sus propias entregas y, durante su tarea, la entrega anterior del participante que le corresponde. La lectura del conjunto se habilita solo en la revelación de esa partida. El contenido enviado queda inmóvil al confirmar. Los cambios de configuración solo se admiten al anfitrión en el lobby. Los lugares se reclaman atómicamente para validar el máximo de participantes incluso cuando se unen a la vez.

El reloj usa serverTimestamp y .info/serverTimeOffset. El servidor valida cada avance: todos confirmaron o venció el plazo más cinco segundos de margen para envíos. Un participante conectado coordina el avance; si se desconecta, otro toma esa tarea. Una conexión perdida conserva el participante, la tarea y el último borrador recibido por Firebase. El borrador local permite recuperar cambios después de recargar; si el navegador se queda sin espacio, eso no bloquea el envío.

Como cualquier contenido que ya se entregó a un navegador, una referencia de Imitación podría conservarse fuera de la interfaz. El modo la oculta al terminar la memorización; no pretende borrar algo que el jugador ya vio.

No hay un servidor ejecutando rondas cuando todos están desconectados: al volver un participante, se procesa el plazo vencido y la partida continúa. Los datos de partidas quedan guardados; una política de retención de salas antiguas puede agregarse por separado.

## Editor y resultados

Lienzo de 960 × 600 con eventos Pointer para mouse y touch. Incluye lápiz, goma, línea, rectángulo/círculo con y sin relleno, balde, color, grosor, limpiar y veinte niveles de deshacer/rehacer. Las entregas son PNG con un máximo de 600.000 caracteres por dibujo; los textos tienen un máximo de 300.

La revelación presenta progresivamente los pasos y permite anterior/siguiente, reproducir/pausar y abrir los álbumes completos. El anfitrión puede preparar una revancha. Las capturas de la prueba están en `docs/gartic/`.

## Verificación local

Necesitás Java 21 o superior para Firebase Emulator Suite. Las pruebas no requieren credenciales de producción.

1. `npm install`
2. `npx firebase-tools emulators:start --only database,auth --project demo-secreto`
3. `npm run test:gartic:rules`
4. En otra terminal de Windows: `set VITE_FIREBASE_EMULATORS=true&& npm run dev -- --host 127.0.0.1 --port 5187`
5. `npm run test:gartic:browser`

La prueba de navegador usa Microsoft Edge instalado en Windows en modo headless. Carga las mismas reglas en la base emulada, abre contextos separados (uno móvil), completa los cuatro modos y elimina su sala local al terminar. No escribe en la base publicada.

`npm test` incluye las pruebas puras de reparto, secuencias, reloj, álbumes y balde, además de los tests existentes. `npm run build` genera la versión de producción sin conexión a emuladores.

## Publicación

Esta incorporación requiere **hosting y las nuevas reglas**, además del proveedor Anónimo. Antes de publicar las reglas, descargá las reglas vigentes del proyecto y conservá cualquier diferencia de las ramas existentes; agregá únicamente las ramas nuevas de Trazo Loco. No publiques reglas locales sobre reglas vigentes sin esa comparación.

Después de iniciar sesión con `npx firebase-tools login`, comparar/fusionar las reglas y habilitar Anónimo:

```sh
npm test
npm run build
npx firebase-tools deploy --only database,hosting --project secreto-aed7e
```

El código y las reglas se publicaron el 08/10/2026 en https://secreto-aed7e.web.app/?juego=gartic. Las reglas vigentes de los otros juegos fueron comparadas y se conservaron. Queda pendiente inicializar Authentication desde Firebase Console y habilitar Anónimo: la API pública de inicialización exige facturación, que no se habilitó. El usuario pidió continuar ese paso en otra sesión; el estado completo está en ../CONTINUAR_GARTIC.md.

Referencias: [reglas de acceso](https://firebase.google.com/docs/database/security/core-syntax), [presencia y hora del servidor](https://firebase.google.com/docs/database/web/offline-capabilities), [autenticación anónima](https://firebase.google.com/docs/auth/web/anonymous-auth).
