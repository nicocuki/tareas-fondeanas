// Durable Object del buzón de sugerencias (ver sugerencias.js).
import { DurableObject } from 'cloudflare:workers';
import { MAX_KEPT, allowSend, cleanSuggestion, discordPayload } from './sugerencias.js';

async function hashIp(ip) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`buzon:${ip}`));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
});

// Durable Object único (`idFromName('buzon')`): guarda las últimas sugerencias y los envíos de cada persona
// (por un hash de su IP, no la IP). El worker le pasa la IP en `x-ip`.
export class Buzon extends DurableObject {
  // Modo admin (RPC desde admin.js): todas, la más nueva primero, con su `id` para poder borrarla.
  async listar() {
    return [...(await this.ctx.storage.list({ prefix: 'm:' }))].map(([id, entry]) => ({ id, ...entry })).reverse();
  }

  async borrar(id) {
    if (typeof id === 'string' && id.startsWith('m:')) await this.ctx.storage.delete(id);
  }

  async fetch(request) {
    if (request.method === 'GET') {
      // Para leerlas desde el navegador: /api/sugerencias?clave=… (con el secreto SUGERENCIAS_CLAVE).
      const clave = new URL(request.url).searchParams.get('clave');
      if (!this.env.SUGERENCIAS_CLAVE || clave !== this.env.SUGERENCIAS_CLAVE) return json({ error: 'No existe.' }, 404);
      const all = [...(await this.ctx.storage.list({ prefix: 'm:' })).values()];
      return json(all.reverse());
    }
    let body;
    try { body = await request.json(); } catch { return json({ error: 'No se entendió el mensaje.' }, 400); }
    const clean = cleanSuggestion(body);
    if (clean.error) return json({ error: clean.error }, 400);

    const now = Date.now();
    const who = `r:${await hashIp(request.headers.get('x-ip') || 'sin-ip')}`;
    const verdict = allowSend((await this.ctx.storage.get(who)) || [], now);
    if (!verdict.ok) return json({ error: verdict.error }, 429);
    await this.ctx.storage.put(who, verdict.times);

    const entry = { text: clean.text, name: clean.name, at: now };
    await this.ctx.storage.put(`m:${String(now).padStart(15, '0')}`, entry);
    const keys = [...(await this.ctx.storage.list({ prefix: 'm:' })).keys()];
    if (keys.length > MAX_KEPT) await this.ctx.storage.delete(keys.slice(0, keys.length - MAX_KEPT));

    // A Discord. Si falla, igual queda guardada y la persona ve que se mandó.
    if (this.env.SUGERENCIAS_WEBHOOK) {
      try {
        await fetch(this.env.SUGERENCIAS_WEBHOOK, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(discordPayload(entry)) });
      } catch {}
    }
    return json({ ok: true });
  }
}
