# Continuar Trazo Loco (Gartic)

Estado al cerrar la sesión: 8 de octubre de 2026, aproximadamente 10:45 (Argentina).
El usuario pidió detener el trabajo, guardar esta continuidad y seguir en otra sesión. Indicó que ya hizo push a Git. No hacer cambios ni publicaciones adicionales hasta que retome el trabajo.

## Estado actual

Se implementó el prompt completo de los cuatro modos disponibles en el proyecto React existente, con identidad propia: **Trazo Loco**.

**El código y las reglas ya están publicados** en:
https://secreto-aed7e.web.app/?juego=gartic

Firebase Hosting: versión `34c6903deedb37c5`, publicada el 08/10/2026 a las 10:44 (Argentina).
Proyecto: `secreto-aed7e`.
Antes de publicar se descargaron las reglas vigentes y se comprobó que las ramas originales `rooms` y `futbol`, y los permisos raíz, coincidían con el archivo local. Se conservaron esas reglas y se agregaron únicamente las ramas del nuevo juego.

**Pendiente obligatorio: inicializar Firebase Authentication y habilitar el proveedor Anónimo.**
Mientras ese paso esté pendiente, el sitio muestra el juego pero no puede crear/unirse a salas de Trazo Loco. Los demás juegos conservan su infraestructura.

## Paso pendiente de Authentication

El usuario ya autorizó explícitamente:
“Autorizar configuración y publicación”, para habilitar acceso anónimo en `secreto-aed7e` y publicar hosting/reglas.
No pedir de nuevo esa autorización para la misma acción. No hay autorización para cambiar el plan ni habilitar facturación.

Hay sesión autenticada de Firebase CLI disponible en este equipo; si expiró, revisar si la CLI puede renovar antes de pedir otro login.

La lectura oficial:
`GET https://identitytoolkit.googleapis.com/admin/v2/projects/secreto-aed7e/config`
devolvió `404 CONFIGURATION_NOT_FOUND`.

El PATCH dirigido únicamente a `signIn.anonymous.enabled` también devolvió 404.
El intento de inicialización por la API pública `identityPlatform:initializeAuth` devolvió:
`400 BILLING_NOT_ENABLED : Identity Platform feature requires billing to be enabled.`

**No se habilitó facturación ni se cambió el plan.**
Para continuar, el usuario debe abrir:
https://console.firebase.google.com/project/secreto-aed7e/authentication
pulsar **Comenzar** y activar **Anónimo** en los métodos de acceso usando la configuración estándar de Firebase.

Cuando esté hecho, comprobar el acceso anónimo desde el sitio publicado y completar una partida real con tres navegadores/dispositivos separados. Limpiar únicamente las salas y usuarios de prueba creados en esa verificación, nunca datos de terceros.

## Implementación terminada

- Menú y navegación existentes: `?juego=gartic`, invitaciones con `&sala=ABCD`.
- Lobby con código/enlace, nombre compartido de la plataforma, avatares, participantes y anfitrión.
- Máximo configurable hasta 20; mínimo 3 para empezar.
- Normal, Imitación, Historia y Sandwich con secuencias propias.
- Las otras once modalidades quedan con candado, según el prompt. No implementarlas ni desbloquearlas sin un nuevo pedido.
- Reparto simultáneo y rotación de cadenas sin devolverlas al creador.
- Editor con lápiz, goma, línea, rectángulo/círculo con y sin relleno, balde, colores, grosor, limpiar, deshacer y rehacer.
- Mouse y touch; responsive móvil.
- Borradores, recuperación tras recargar, envío al vencer el reloj y espera colectiva.
- Hora del servidor, validación de avances en reglas y transferencia de anfitrión.
- Revelación progresiva, reproducción/pausa, álbumes y revancha.
- Auth anónimo con persistencia por pestaña y conexión Firebase compartida.
- El nuevo juego no usa el JSON público de `rooms/`: sus contenidos privados están en ramas separadas y protegidas por reglas.
- Versión visual y changelog: 0.11.0.

## Archivos relevantes

- `src/gartic/GarticApp.jsx`: flujo, lobby y coordinación.
- `src/gartic/game.js`: lógica pura de modos, reparto y álbumes.
- `src/gartic/storage.js`: listeners, transacciones, autenticación y presencia.
- `src/gartic/DrawingCanvas.jsx`, `drawing.js`, `Task.jsx`, `Reveal.jsx`, `gartic.css`.
- `src/firebase.js`: app y conexión compartidas; soporte opcional de emuladores.
- `src/App.jsx`, `src/menu/MainMenu.jsx`: integración.
- `src/menu/Credits.jsx`: versión y variante de créditos debajo del juego para no tapar controles.
- `database.rules.json`: nuevas reglas y originales conservadas.
- `docs/GARTIC.md`: arquitectura, límites y verificación.
- `docs/gartic/`: capturas del lobby, móvil y resultados.
- `updates`: registro de la actualización.
- `tests/gartic.test.js`, `gartic.rules.mjs`, `gartic.browser.mjs`.

## Verificación completada

- 116 tests de lógica (incluidos los 110 existentes).
- 5 tests de reglas en Firebase Emulator Suite.
- Partidas completas en Microsoft Edge headless con contextos separados, uno móvil/táctil:
  Normal, Historia, Imitación y Sandwich (este último con cuatro jugadores).
- Verificados espera colectiva, frases reales recibidas por otro jugador, recuperación al recargar, dibujo con mouse/touch, deshacer/rehacer, referencia de Imitación ocultada, álbumes y transferencia del anfitrión.
- Sin errores de React ni alertas de la partida al finalizar.
- `npm run build` pasó. Hay una advertencia de Vite por un bundle de unos 644 kB; no es un error.
- `git diff --check` pasó.
- Deploy de hosting y database completado con código 0.
- **Falta la prueba multiplayer en producción después de activar Authentication.**

Durante las pruebas se corrigió el uso de confirmaciones de una ronda anterior, se eligió un único coordinador conectado y se controlaron las cancelaciones esperadas de listeners al revocar acceso a álbumes/listos durante una revancha.

## Git y cambios del usuario

Al comenzar había una modificación del usuario en los créditos:
“Nicolas Cukier · Alan Vitas”. Se conservó.
Durante esta sesión apareció el commit `0bb87dd gartic`, realizado externamente. No lo creó el asistente.
Después de ese commit se hicieron correcciones finales y se actualizaron capturas/documentación: revisar `git status` y `git diff` antes de continuar. No asumir que todo lo publicado está incluido en el push del usuario. No hacer commit/push automáticamente.

## Entorno de pruebas

Windows / PowerShell bloqueado por política de grupo. Los comandos funcionaron con:
`shell: C:\\Windows\\System32\\cmd.exe`, `login: false`.
El sandbox es de solo lectura; las escrituras y ejecución con red requieren escalación.
Para scripts Node, codificar el script en base64 y ejecutarlo con `node -e eval(Buffer.from(...,'base64').toString())` evita problemas de comillas y operadores de cmd. La línea de cmd no debe superar ~8.000 caracteres.

Node 24.13.1. Firebase CLI 15.33.0 mediante `npx --yes firebase-tools`.
En esta red fue necesario `NODE_USE_SYSTEM_CA=1` o `node --use-system-ca`; no deshabilitar TLS.
Java 21 temporal descargado en:
`C:\\Users\\49006840\\AppData\\Local\\Temp\\gartic-jdk21\\jdk-21.0.12.1+1`.
El Java del sistema es 8 y no alcanza para el emulador actual.

Los tests de navegador usan Edge instalado, no Chromium descargado.
Para pruebas locales:
1. Java 21 en PATH.
2. `npx firebase-tools emulators:start --only database,auth --project demo-secreto`.
3. `npm run test:gartic:rules`.
4. `set VITE_FIREBASE_EMULATORS=true&& npm run dev -- --host 127.0.0.1 --port 5187`.
5. `npm run test:gartic:browser`.

La prueba de navegador carga las reglas solo en localhost y limpia su propia sala al terminar. No usar estas instrucciones para reemplazar reglas de producción sin comparar las vigentes.

Los servidores locales de prueba fueron cerrados al terminar. Se limpiaron dist/, .firebase/ y el log del emulador; las capturas y el código se conservan. El archivo de créditos figura modificado otra vez al cerrar: revisar esa diferencia del usuario antes de tocarlo.
