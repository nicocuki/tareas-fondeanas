// Puente para Mario vs Luigi: en el cole las compus bloquean los servidores de Photon (y quizás el
// de ipodtouch en Azure), pero Cloudflare abre. Entonces la página no les habla directo: le habla a
// este Worker y el Worker reenvía.
//   /api/photon/<host>/<ruta>  → wss://<host>/<ruta> (solo servidores de Photon)
//   /api/mvl/<ruta>            → https://mariovsluigi.azurewebsites.net/<ruta> (autenticación y novedades)
// Al devolver la respuesta del `fetch` tal cual, Cloudflare une los dos WebSocket por su cuenta:
// los mensajes no pasan por este código y no gastan CPU del Worker.
// `public/mvl/index.html` reescribe las direcciones antes de que Unity abra las conexiones.

const PHOTON_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(photonengine\.io|exitgames\.com)(:\d{2,5})?$/i;
const MVL_SERVER = 'https://mariovsluigi.azurewebsites.net';
const MVL_PATHS = /^\/(auth\/init|news(\/[a-z0-9-]+)?|desync)$/;

const fail = (status, text) => new Response(text, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

export function photonTarget(pathname, search) {
  const m = pathname.match(/^\/api\/photon\/([^/]+)(\/.*)?$/);
  if (!m || !PHOTON_HOST.test(m[1])) return null;
  return `https://${m[1].toLowerCase()}${m[2] || '/'}${search}`;
}

export function mvlTarget(pathname, search) {
  const m = pathname.match(/^\/api\/mvl(\/.*)$/);
  if (!m || !MVL_PATHS.test(m[1])) return null;
  return `${MVL_SERVER}${m[1]}${search}`;
}

export async function proxyPhoton(request, url) {
  const target = photonTarget(url.pathname, url.search);
  if (!target) return fail(404, 'Ese servidor no es de Photon.');
  if (request.headers.get('Upgrade') !== 'websocket') return fail(426, 'Se esperaba un WebSocket.');
  // Mismos encabezados (Upgrade, Sec-WebSocket-Key, Sec-WebSocket-Protocol: GpBinaryV18…).
  return fetch(target, { headers: request.headers });
}

// Autenticación personalizada de nuestra app de Photon (se configura en el panel de Photon con la
// dirección /api/photon-auth). El juego siempre pide autenticación «Custom» y una app sin ninguna
// configurada lo rechaza; acá se deja pasar a todos, como si fuera anónimo.
export function photonAuth() {
  return new Response(JSON.stringify({ ResultCode: 1 }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function proxyMvl(request, url) {
  const target = mvlTarget(url.pathname, url.search);
  if (!target) return fail(404, 'No existe.');
  const res = await fetch(target, {
    method: request.method,
    headers: { 'content-type': request.headers.get('content-type') || 'text/plain' },
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : await request.arrayBuffer(),
  });
  return new Response(res.body, {
    status: res.status,
    headers: { 'content-type': res.headers.get('content-type') || 'text/plain', 'cache-control': 'no-store' },
  });
}
