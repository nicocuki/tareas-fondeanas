// Durable Object único con la lista de salas públicas (ver publicas.js).
// Las salas le avisan por RPC (`publicar`) y la portada lo escucha por un WebSocket que hiberna:
// al conectarse recibe la lista entera, y otra vez cada vez que cambia.
import { DurableObject } from 'cloudflare:workers';
import { LISTING_TTL_MS, visibleListings } from './publicas.js';

export class Directorio extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.entries = new Map();
    this.notice = null; // el último aviso del admin: { id, text, until }
    this.all = new Map(); // todas las salas con gente, para el modo admin (`a:` en disco)
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      for (const [key, value] of await ctx.storage.list({ prefix: 's:' })) this.entries.set(key.slice(2), value);
      for (const [key, value] of await ctx.storage.list({ prefix: 'a:' })) this.all.set(key.slice(2), value);
      this.notice = (await ctx.storage.get('aviso')) || null;
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

  // El aviso que ven todos (`/api/aviso`): `left` es lo que le queda a la vista, así cada pantalla lo cuenta con su reloj.
  noticeMessage() {
    const left = this.notice ? this.notice.until - Date.now() : 0;
    return JSON.stringify({ t: 'aviso', m: this.notice && left > 0 ? { id: this.notice.id, text: this.notice.text, left } : null });
  }

  async avisar(text, ms) {
    this.notice = text ? { id: crypto.randomUUID(), text, until: Date.now() + ms } : null;
    await this.ctx.storage.put('aviso', this.notice);
    const message = this.noticeMessage();
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
