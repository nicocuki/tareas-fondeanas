// Modo admin: rutas `/api/admin/…` para ver las sugerencias y las salas activas, y cerrar salas.
//
// El modo admin se activa en la pantalla (nombre «cuki», avatar 🤖 y «CUKI» en el campo del código),
// pero eso está a la vista de cualquiera que lea el código de la página. Por eso lo que hace el
// servidor pide además la clave del secreto `ADMIN_CLAVE` (o `SUGERENCIAS_CLAVE`, si no hay otra) en el
// encabezado `x-admin-clave`. Sin clave configurada, o con otra, todo da 404.
//
// Sin nada de Cloudflare: los Durable Objects entran por `env` y se prueba con `node --test`.
import { getAt } from './tree.js';
import { summarizeRoom } from '../src/ui/roomSummary.js';

export const adminKey = (env) => String(env?.ADMIN_CLAVE || env?.SUGERENCIAS_CLAVE || '');

// Compara sin cortar en la primera letra distinta, para no dar pistas por el tiempo de respuesta.
export function isAdminKey(env, given) {
  const key = adminKey(env);
  if (!key || typeof given !== 'string' || given.length !== key.length) return false;
  let diff = 0;
  for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}

// Lo que el admin ve de una sala con gente conectada (o null si no hay sala o nadie conectado).
export function adminListing(tree, code, connections) {
  if (!code || connections < 1) return null;
  const sum = summarizeRoom(code, getAt(tree, ['garticRooms', code]), getAt(tree, ['rooms', code]));
  if (!sum || sum.local) return null;
  return {
    code, game: sum.game, host: sum.host, players: sum.players, max: sum.max, phase: sum.phase,
    conns: connections, ...(getAt(tree, ['publica', code]) === true ? { pub: true } : {}),
  };
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

async function body(request) {
  try { return await request.json(); } catch { return {}; }
}

export async function handleAdmin(request, env, url) {
  if (!isAdminKey(env, request.headers.get('x-admin-clave'))) return json({ error: 'No existe.' }, 404);
  const buzon = () => env.BUZON.get(env.BUZON.idFromName('buzon'));
  const directorio = () => env.DIRECTORIO.get(env.DIRECTORIO.idFromName('portada'));
  const route = `${request.method} ${url.pathname.replace(/^\/api\/admin/, '')}`;

  if (route === 'GET /estado') return json({ ok: true });
  if (route === 'GET /sugerencias') return json(await buzon().listar());
  if (route === 'POST /sugerencias/borrar') {
    const { id } = await body(request);
    if (typeof id !== 'string' || !id.startsWith('m:')) return json({ error: 'Falta cuál borrar.' }, 400);
    await buzon().borrar(id);
    return json({ ok: true });
  }
  if (route === 'GET /salas') return json(await directorio().todas());
  if (route === 'POST /salas/cerrar') {
    const { code } = await body(request);
    if (typeof code !== 'string' || !/^[A-Z]{4}$/.test(code)) return json({ error: 'El código tiene 4 letras.' }, 400);
    await env.SALA.get(env.SALA.idFromName(code)).cerrar();
    return json({ ok: true });
  }
  return json({ error: 'No existe.' }, 404);
}
