// Worker de Cloudflare: sirve la página (dist/) y el servidor de salas.
//   /api/hora          → hora del servidor, para que todas las pantallas compartan el reloj
//   /api/sala/ABCD     → WebSocket con el Durable Object de esa sala
//   /api/salas         → salas públicas (WebSocket con la lista en vivo, o JSON)
//   /api/photon/…      → puente a Photon para Mario vs Luigi (ver photon.js)
//   /api/sugerencias   → buzón de sugerencias de la portada (POST las manda a Discord; ver sugerencias.js)
//   /api/admin/…      → modo admin, con la clave ADMIN_CLAVE (ver admin.js)
//   /api/photon-auth   → autenticación de nuestra app de Photon (deja pasar a todos)
//   /api/mvl/…         → puente al servidor de ipodtouch (autenticación y novedades de Mario vs Luigi)
//   cualquier otra ruta → los archivos de la página
import { photonAuth, proxyMvl, proxyPhoton } from './photon.js';
import { handleAdmin } from './admin.js';

export { Sala } from './sala.js';
export { Directorio } from './directorio.js';
export { Buzon } from './buzon.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/hora') return json({ now: Date.now() });
    if (url.pathname === '/api/salas') return env.DIRECTORIO.get(env.DIRECTORIO.idFromName('portada')).fetch(request);
    const sala = url.pathname.match(/^\/api\/sala\/([A-Z]{4})$/);
    if (sala) {
      if (request.headers.get('Upgrade') !== 'websocket') return json({ error: 'Se esperaba un WebSocket.' }, 426);
      const stub = env.SALA.get(env.SALA.idFromName(sala[1]));
      return stub.fetch(request);
    }
    if (url.pathname === '/api/sugerencias') {
      if (request.method !== 'POST' && request.method !== 'GET') return json({ error: 'No existe.' }, 405);
      // Un mensaje chico: se corta antes de leer cualquier cosa grande.
      if (Number(request.headers.get('content-length') || 0) > 4096) return json({ error: 'Es muy larga.' }, 413);
      const headers = new Headers(request.headers);
      headers.set('x-ip', request.headers.get('cf-connecting-ip') || '');
      return env.BUZON.get(env.BUZON.idFromName('buzon')).fetch(new Request(request, { headers }));
    }
    if (url.pathname.startsWith('/api/admin/')) return handleAdmin(request, env, url);
    if (url.pathname === '/api/photon-auth') return photonAuth();
    if (url.pathname.startsWith('/api/photon/')) return proxyPhoton(request, url);
    if (url.pathname.startsWith('/api/mvl/')) return proxyMvl(request, url);
    if (url.pathname.startsWith('/api/')) return json({ error: 'No existe.' }, 404);
    return env.ASSETS.fetch(request);
  },
};
