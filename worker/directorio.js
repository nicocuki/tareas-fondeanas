// Durable Object único con la lista de salas públicas (ver publicas.js).
// Las salas le avisan por RPC (`publicar`) y la portada lo escucha por un WebSocket que hiberna:
// al conectarse recibe la lista entera, y otra vez cada vez que cambia.
import { DurableObject } from 'cloudflare:workers';
import { LISTING_TTL_MS, visibleListings } from './publicas.js';

export class Directorio extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.entries = new Map();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      for (const [key, value] of await ctx.storage.list({ prefix: 's:' })) this.entries.set(key.slice(2), value);
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
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(text); } catch {}
    }
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response(JSON.stringify(this.list()), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.send(this.message());
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
    if (this.entries.size) await this.ctx.storage.setAlarm(now + LISTING_TTL_MS);
  }
}
