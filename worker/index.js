// Worker de Cloudflare: sirve la página (dist/) y el servidor de salas.
//   /api/hora          → hora del servidor, para que todas las pantallas compartan el reloj
//   /api/sala/ABCD     → WebSocket con el Durable Object de esa sala
//   cualquier otra ruta → los archivos de la página
export { Sala } from './sala.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/hora') return json({ now: Date.now() });
    const sala = url.pathname.match(/^\/api\/sala\/([A-Z]{4})$/);
    if (sala) {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Se esperaba un WebSocket.' }, 426);
      const stub = env.SALA.get(env.SALA.idFromName(sala[1]));
      return stub.fetch(request);
    }
    if (url.pathname.startsWith('/api/')) return json({ error: 'No existe.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
