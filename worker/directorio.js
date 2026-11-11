// Durable Object único con la lista de salas públicas (ver publicas.js).
// Las salas le avisan por RPC (`publicar`) y la portada lo escucha por un WebSocket que hiberna:
// al conectarse recibe la lista entera, y otra vez cada vez que cambia.
import { DurableObject } from 'cloudflare:workers';
import { LISTING_TTL_MS, visibleListings } from './publicas.js';

const MAX_NOTICES = 10; // avisos a la vista a la vez

export class Directorio extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.entries = new Map();
    this.notices = []; // los avisos del admin que siguen a la vista: { id, text, until, to? } (to = { room, name? }; sin to, van a todos)
    this.all = new Map(); // todas las salas con gente, para el modo admin (`a:` en disco)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      for (const [key, value] of await ctx.storage.list({ prefix: 's:' })) this.entries.set(key.slice(2), value);
      for (const [key, value] of await ctx.storage.list({ prefix: 'a:' })) this.all.set(key.slice(2), value);
      const saved = await ctx.storage.get('avisos');
      this.notices = Array.isArray(saved) ? saved : [];
    });
  }

  list() {
    return visibleListings([...this.entries.values()], Date.now());
  }

  message() {
    return JSON.stringify({ t: 'salas', l: this.list() });
  }

  async publicar(code, listing) {
    if (!/^[A-Z]{4}$/.test(code)) return;
    if (listing) {
      const entry = { ...listing, code, at: Date.now() };
      this.entries.set(code, entry);
      await this.ctx.storage.put('s:' + code, entry);
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + LISTING_TTL_MS);
    } else {
      if (!this.entries.has(code)) return;
      this.entries.delete(code);
      await this.ctx.storage.delete('s:' + code);
    }
    const text = this.message();
    for (const ws of this.ctx.getWebSockets('salas')) {
      try { ws.send(text); } catch {}
    }
  }

  // Los avisos que están a la vista (`/api/aviso`): `left` es lo que le queda, así cada pantalla lo cuenta con su reloj.
  // Cada pantalla se queda solo con los que van a ella (a todos, a su sala o a ella): el filtro es de la interfaz, como el chat de equipo.
  live() {
    const now = Date.now();
    this.notices = this.notices.filter((n) => n.until > now);
    return this.notices.map((n) => ({ id: n.id, text: n.text, left: n.until - now, ...(n.to ? { to: n.to } : {}) }));
  }

  noticeMessage() {
    return JSON.stringify({ t: 'aviso', l: this.live() });
  }

  async avisar(text, ms, to = null) {
    this.live();
    if (!text) this.notices = [];
    else this.notices = [...this.notices, { id: crypto.randomUUID(), text, until: Date.now() + ms, ...(to ? { to } : {}) }].slice(-MAX_NOTICES);
    await this.ctx.storage.put('avisos', this.notices);
    const message = text ? JSON.stringify({ t: 'aviso', m: this.live().at(-1) }) : JSON.stringify({ t: 'aviso', m: null });
    for (const ws of this.ctx.getWebSockets('aviso')) {
      try { ws.send(message); } catch {}
    }
  }

  // Modo admin: cada sala avisa lo suyo (`adminListing`) o null cuando ya no hay nadie.
  async registrar(code, listing) {
    if (!/^[A-Z]{4}$/.test(code)) return;
    if (listing) {
      const entry = { ...listing, code, at: Date.now() };
      this.all.set(code, entry);
      await this.ctx.storage.put('a:' + code, entry);
      if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + LISTING_TTL_MS);
    } else if (this.all.delete(code)) {
      await this.ctx.storage.delete('a:' + code);
    }
  }

  todas() {
    const now = Date.now();
    return [...this.all.values()].filter((e) => now - e.at < LISTING_TTL_MS).sort((a, b) => b.at - a.at);
  }

  async fetch(request) {
    const notice = new URL(request.url).pathname === '/api/aviso';
    if (request.headers.get('Upgrade') !== 'websocket') {
      if (notice) return new Response(JSON.stringify({ error: 'Se esperaba un WebSocket.' }), { status: 426, headers: { 'content-type': 'application/json' } });
      return new Response(JSON.stringify(this.list()), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [notice ? 'aviso' : 'salas']);
    server.send(notice ? this.noticeMessage() : this.message());
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage() {}

  async webSocketClose(ws, code) {
    const valid = code >= 1000 && code < 5000 && code !== 1005 && code !== 1006;
    try { ws.close(valid ? code : 1000, 'chau'); } catch {}
  }

  // Limpieza de las vencidas.
  async alarm() {
    const now = Date.now();
    for (const [code, entry] of this.entries) {
      if (now - entry.at < LISTING_TTL_MS) continue;
      this.entries.delete(code);
      await this.ctx.storage.delete('s:' + code);
    }
    for (const [code, entry] of this.all) {
      if (now - entry.at < LISTING_TTL_MS) continue;
      this.all.delete(code);
      await this.ctx.storage.delete('a:' + code);
    }
    if (this.entries.size || this.all.size) await this.ctx.storage.setAlarm(now + LISTING_TTL_MS);
  }
}
