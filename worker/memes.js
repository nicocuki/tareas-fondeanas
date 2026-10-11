// /api/memes: las plantillas populares de Imgflip, guardadas un rato para no pedirlas en cada partida.
import { IMGFLIP_URL, parseImgflip } from '../src/meme/templates.js';

const TTL_MS = 6 * 60 * 60 * 1000;
let cached = null; // { at, body } en la memoria del Worker mientras esté despierto

export async function memesResponse() {
  if (cached && Date.now() - cached.at < TTL_MS) return respond(cached.body);
  try {
    const res = await fetch(IMGFLIP_URL, { cf: { cacheTtl: 21600, cacheEverything: true } });
    const templates = parseImgflip(await res.json());
    if (!templates.length) throw new Error('Imgflip no devolvió memes');
    cached = { at: Date.now(), body: JSON.stringify({ templates }) };
    return respond(cached.body);
  } catch {
    if (cached) return respond(cached.body); // mejor viejos que nada
    return new Response(JSON.stringify({ templates: [], error: 'No se pudieron traer los memes.' }), {
      status: 502, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
    });
  }
}

const respond = (body) => new Response(body, {
  headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
});
