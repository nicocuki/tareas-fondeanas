# La Timba: juegos pendientes de explicar y agregar

> **Para Claude:** estos juegos de la wiki de Gamble With Your Friends **todavía no están en el juego** porque Nico no
> los explicó y yo no los entiendo. **No los inventes.** Cuando Nico los explique (o diga «agregá X»), se agregan al
> casino 2 en adelante (ver *Los 4 casinos* en `CLAUDE.md`). Si no entendés alguno, preguntale.
>
> La wiki (`gamblewithyourfriends.wiki.gg`) la bloquea el filtro de la red del trabajo (FortiGuard): no se puede leer
> desde acá, así que la lista sale de lo que cuente Nico.

## Pendientes de explicar

| Juego | Qué falta saber |
|---|---|
| **Poker 1P** | Cómo es exactamente. Una guía dice «cuatro cartas para armar un patrón y un segundo reparto», que no parece póker normal: cuántas cartas, qué manos pagan y cuánto. |
| **Torre del dragón** (Dragon Tower) | Cuántas filas y casilleros por fila, cuántas trampas, cómo crece el multiplicador y si se puede retirar en cualquier fila. |
| **Pachinko** | Si está en la wiki y cómo se juega. |
| **Ringo** | Ídem. |
| **Key Roulette** | Ídem. |
| **Number Roller** | Ídem. |
| **Carrera de galgos** (Greyhound Racing) | Si está en la wiki y en qué se diferencia de la carrera de patos. |
| **Otros de la wiki** | Cualquier juego de la wiki que no esté en esta lista ni en el juego: Nico lo cuenta cuando se acuerde. |

Los cinco del medio (Pachinko, Ringo, Key Roulette, Number Roller y galgos) salieron de un blog dudoso: puede que ni
existan. Preguntarle a Nico antes de hacer nada.

## Ya agregados en el casino 2 en adelante (con valores estándar a confirmar)

Los hice con las reglas de siempre y números míos donde Nico no dio datos. Si en la wiki son distintos, se corrigen en
`src/timba/newgames.js`:

- **Crash** y **Penguin Cross**: reglas de Nico (ver `CLAUDE.md`). Lo que no dijo: velocidad (60 pasos por segundo,
  +0,01 cada uno), cómo se elige dónde choca (distribución típica de crash, casa 5 %, tope 100×).
- **Keno** (40 números, elegís hasta 10 y salen 10), **Plinko** (8 filas), **Rueda del dinero**, **Baccarat**,
  **Mayor o menor** y **Buscaminas** (5 × 5, vos elegís cuántas minas): reglas estándar y pagos propios con la casa
  quedándose ~5 %.

## Otras cosas que quedaron para después

- El **palco VIP** del casino 4 (con su escalera) hoy es solo decoración de la pared; la idea era hacerlo caminable.
- La **camioneta** y el **botones** (items comprados con los tickets dorados) siguen sin items.
