# 🎮 Tareas Fondeanas

**Juegos multijugador para jugar con los del fondo.** Armá una sala, compartí el código y jueguen desde sus propios dispositivos: gratis, sin cuentas y sin instalar nada.

👉 **[Entrar a Tareas Fondeanas](https://tareas-fondeanas.nicocukier.workers.dev)**

## 🕹️ Juegos disponibles

- **Mario vs Luigi:** el modo de New Super Mario Bros DS, online de 2 a 10 (el remake de la comunidad, de ipodtouch0218, tal cual).
- **A los Tiros:** duelos de 2 a 4 a los tiros y saltos. El que pierde la ronda elige una carta que lo hace más fuerte. Inspirado en ROUNDS.
- **Armá el Meme:** completá una plantilla con el texto más gracioso y voten las mejores respuestas. También pueden jugar en modo «todos el mismo meme».
- **T.E.G.:** de 2 a 6 jugadores. Conquistá el mapa país por país: repartí ejércitos, atacá con dados, juntá cartas y cumplí tu objetivo secreto antes que los demás.
- **Monopoly:** de 2 a 8 jugadores. Comprá propiedades de un tablero de barrios de Buenos Aires, cobrá alquileres, construí casas y hoteles, subastá, hipotecá y negociá hasta dejar a todos en la quiebra.
- **La Mecha:** la bomba pasa de jugador en jugador. Escribí una palabra que contenga las letras indicadas antes de que se termine el tiempo.
- **Trazo Loco:** teléfono descompuesto con dibujos. Escribí, dibujá y descubrí cómo fue cambiando la idea. Tiene modos Normal, Imitación, Historia y Sandwich.
- **Código Secreto:** juego de palabras, pistas y equipos. El espía da una pista de una palabra y un número para ayudar a su equipo a encontrar las palabras correctas sin tocar una bomba.
- **Café o Té:** juego de asociación y adivinanza por eliminación, en formato 2 contra 2: Pensadores y Adivinadores.
- **Fútbol:** partido de fútbol 2D con física, dos equipos y controles de teclado.

## 🚀 Cómo empezar a jugar

1. Entrá a [la página](https://tareas-fondeanas.nicocukier.workers.dev).
2. Elegí un juego y creá una sala.
3. Compartí el código o el enlace de la sala con tus amigos.
4. Cada persona entra desde su propio dispositivo y ¡a jugar!

No hace falta crear una cuenta ni instalar una aplicación.

## 🧑‍💻 Desarrollo local

### Requisitos

- **Node.js 20.19 o superior**.
- **npm**.

### Instalación

Cloná el repositorio e instalá las dependencias:

```bash
git clone https://github.com/nicocuki/tareas-fondeanas.git
cd tareas-fondeanas
npm install
```

### Comandos

| Comando | Para qué sirve |
| --- | --- |
| `npm test` | Ejecuta los tests de la lógica de los juegos y del servidor de salas. |
| `npm run servidor` | Compila la página y levanta el sitio junto con el servidor local de salas en `http://localhost:8787`. |
| `npm run dev` | Inicia Vite con recarga automática en `http://localhost:5173`. Requiere tener `npm run servidor` ejecutándose para que las llamadas a `/api` se dirijan al servidor local. |
| `npm run build` | Genera la versión de producción en `dist/`. |
| `npm run deploy` | Compila y despliega manualmente en Cloudflare; requiere haber iniciado sesión con Wrangler. |

El servidor local usa su propia base de Durable Objects, por lo que las salas de prueba no afectan las partidas del sitio publicado.

## 🧱 Tecnologías y arquitectura

- **React 19** para la interfaz.
- **Vite** para desarrollo y compilación.
- **Cloudflare Workers** para servir la aplicación y gestionar las salas online.
- **Durable Objects** para mantener el estado de cada sala y coordinar a los jugadores mediante WebSockets.
- **WebRTC** para la conexión entre navegadores durante los partidos de Fútbol, con el servidor como apoyo.
- **Node.js Test Runner** para las pruebas automatizadas.

La lógica de los juegos está separada de la interfaz para poder probar las reglas sin depender de React ni de la conexión de red.

## 📦 Despliegue

El repositorio está conectado a **Cloudflare Workers Builds**. Los cambios que se suben a la rama `master` se publican automáticamente mediante el proceso de build y despliegue configurado.

Para comprobar el estado de una publicación, revisá el check del commit en GitHub o la sección **Workers & Pages → tareas-fondeanas → Deployments** en Cloudflare.
