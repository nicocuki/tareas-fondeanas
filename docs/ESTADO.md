# Estado del trabajo: hasta dónde llegamos y qué falta

Última actualización: versión **1.22.1**, todo subido a `master` (commit `473f880`). No queda nada sin commitear.

## Pendiente ya mismo: que las sugerencias lleguen a Discord

El buzón de la portada **ya está programado y publicado**, pero todavía **no te llega nada**, porque falta cargar el link del webhook como secreto:

1. En Discord: canal donde querés recibirlas → Ajustes del canal → Integraciones → Webhooks → Nuevo webhook → Copiar URL.
2. En Cloudflare: Workers & Pages → `tareas-fondeanas` → Configuración → Variables y secretos → agregar **secreto** `SUGERENCIAS_WEBHOOK` con ese link.
3. Opcional, para leer el respaldo en el navegador: otro secreto `SUGERENCIAS_CLAVE` (una clave a elección) y abrir `/api/sugerencias?clave=TU_CLAVE`.

Mientras no esté el secreto, las sugerencias igual se guardan (últimas 200) pero no avisan. El link del webhook es un secreto: no va al repo ni al chat público.

Cómo funciona: ver la sección *Buzón de sugerencias* de `CLAUDE.md`.

También falta confirmar que Cloudflare terminó de publicar la 1.22.1 (Workers & Pages → Deployments, el último commit debe decir *Ready*). Esa versión agrega un Durable Object nuevo (`Buzon`, migración v3).

## Pixel Royale: lo que ya está (1.21.0 a 1.22.0)

- Isla grande con 9 lugares con nombre: Pibes Polvorín Polvoriento (playa), Muelle Mojito, Frontera del Fondo, Puente Pollín, Cover (cancha), Arboleada Alianza, Juvenil Judía (chacra de judías), Villa Vermut y Peñasco Pelado. La isla chica tiene una versión reducida.
- Solo cofres (nada en el piso). Se abren manteniendo Espacio; el contenido va directo al inventario. Los cofres dorados caen del cielo.
- Isla de espera de 15 s, bus de batalla con globo, salto con Espacio, caída libre y planeador (planeo ya enlentecido). Mapa grande con nombres (tecla M).
- Textos del canvas con fuente normal (no de píxeles).
- 4 slots: el 1 es siempre el pico (no se arranca con pistola). Romper cualquier cosa da madera (un solo material).
- Construcción: **Z** pared, **X** piso (también sobre el agua), con click. Se sincroniza entre jugadores.
- Arreglado: espectando, las balas de los demás ya se ven moverse.

Detalle técnico de todo esto en la sección *Pixel Royale* de `CLAUDE.md`.

## Pixel Royale: lo que falta (de la lista de mecánicas de Nico)

- **Rampas** de construcción (no entraron: en vista de arriba no tienen una forma clara; hay que pensarlas).
- **Opción en el lobby para activar/desactivar la construcción** (ahora está siempre activa).
- **Rarezas de armas** (gris, verde, azul, violeta y dorada), con más daño cuanto más raras.
- **Munición por tipo** (liviana, media, pesada, escopeta, cohetes), que se junta por separado.
- **Derribados y revivir** (solo en dúos/escuadras).
- **Dúos y escuadras** (equipos de 2 a 4, colores, mapa compartido).
- **Vehículos** (autos, motos o carritos).
- Lo construido no lo ve quien recarga la página después (limitación conocida, igual que el daño a casillas).

## Para retomar

Decile a Claude «seguí con Pixel Royale» y la mecánica que sigue; este archivo y `CLAUDE.md` tienen el contexto. Flujo del repo: tests → navegador → commit y push (eso publica) → revisar el sitio → borrar `dist/` y `.wrangler/`.
