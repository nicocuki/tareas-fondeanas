// Durable Object: una instancia por código de sala, con WebSockets que hibernan.
// Mientras nadie manda nada, la sala se duerme y no gasta; los datos quedan guardados en su
// SQLite y las conexiones siguen abiertas (lo que cada una escucha va en su «attachment»).
import { DurableObject } from 'cloudflare:workers';
import { IDLE_CLOSE_MS, SalaCore, newAttachment } from './core.js';
import { roomListing } from './publicas.js';

// Ramas que cambian lo que la sala muestra en la lista de salas públicas.
const LISTING_ROOTS = new Set(['rooms', 'garticRooms', 'publica']);

// La actividad se anota (en disco y en la alarma) como mucho una vez por minuto: el cierre puede
// llegar hasta un minuto tarde, y a cambio no se escribe en disco con cada movimiento.
const ACTIVITY_SAVE_MS = 60 * 1000;
export const CLOSED_BY_IDLE = 4000; // código con el que se cierran los WebSocket de una sala inactiva

export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.atts = new WeakMap();
    this.activeAt = Date.now();
    this.activeSavedAt = 0;
    // Un "ping" del cliente se contesta solo, sin despertar a la sala.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.code = (await ctx.storage.get('code')) || null;
      this.listing = (await ctx.storage.get('listing')) ?? 'null'; // lo último que se le avisó al Directorio
      this.activeAt = (await ctx.storage.get('activeAt')) || Date.now();
      // `IDLE_CLOSE_MS` se puede achicar para probar: `wrangler dev --var IDLE_CLOSE_MS:60000`.
      this.idleMs = Number(env.IDLE_CLOSE_MS) || IDLE_CLOSE_MS;
      this.core = this.makeCore(this.code);
      this.core.load(await ctx.storage.list({ prefix: 'd:' }).then((m) => [...m].map(([k, v]) => [k.slice(2), v])));
    });
  }

  makeCore(code) {
    return new SalaCore({
      code,
      storage: {
        put: (key, value) => { this.ctx.storage.put(key, value); },
        delete: (key) => { this.ctx.storage.delete(key); },
      },
      connections: () => this.ctx.getWebSockets().map((ws) => this.conn(ws)),
      // Las escrituras del propio servidor (lo anotado para la desconexión) no cuentan como actividad.
      onWrite: (changed, trusted) => {
        if (!trusted) this.markActive();
        if (changed.some((segs) => LISTING_ROOTS.has(segs[0]))) this.publish();
      },
    });
  }

  conn(ws) {
    return {
      send: (text) => ws.send(text),
      att: () => {
        let att = this.atts.get(ws);
        if (!att) { att = ws.deserializeAttachment() || newAttachment(this.code); this.atts.set(ws, att); }
        return att;
      },
      saveAtt: (att) => { this.atts.set(ws, att); ws.serializeAttachment(att); },
    };
  }

  // Alguien hizo algo: la sala sigue viva otros IDLE_CLOSE_MS.
  markActive() {
    const now = Date.now();
    this.activeAt = now;
    if (now - this.activeSavedAt < ACTIVITY_SAVE_MS) return;
    this.activeSavedAt = now;
    this.ctx.storage.put('activeAt', now);
    this.ctx.storage.setAlarm(now + this.idleMs);
  }

  // Le avisa al Directorio si cambió lo que esta sala muestra en la portada.
  // `closing`: el WebSocket que se está cerrando, que todavía figura entre los abiertos.
  publish(closing = null) {
    if (!this.code) return;
    const open = this.ctx.getWebSockets().filter((ws) => ws !== closing).length;
    const listing = roomListing(this.core.tree, this.code, open);
    const text = JSON.stringify(listing);
    if (text === this.listing) return;
    this.listing = text;
    this.ctx.storage.put('listing', text);
    const directorio = this.env.DIRECTORIO.get(this.env.DIRECTORIO.idFromName('portada'));
    this.ctx.waitUntil(directorio.publicar(this.code, listing).catch(() => {}));
  }

  async fetch(request) {
    const code = new URL(request.url).pathname.split('/').pop();
    if (this.code !== code) {
      this.code = code;
      this.core.code = code;
      await this.ctx.storage.put('code', code);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    const att = newAttachment(code);
    server.serializeAttachment(att);
    this.atts.set(server, att);
    this.markActive();
    this.publish();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') return;
    await this.core.message(this.conn(ws), message);
  }

  async webSocketClose(ws, code) {
    this.core.close(this.conn(ws));
    this.publish(ws);
    const valid = code >= 1000 && code < 5000 && code !== 1005 && code !== 1006;
    try { ws.close(valid ? code : 1000, 'chau'); } catch {}
  }

  async webSocketError(ws) {
    this.core.close(this.conn(ws));
    this.publish(ws);
  }

  // Sin actividad en IDLE_CLOSE_MS: se cierran las conexiones, se saca de la portada y se borra todo.
  // Las pantallas que quedaron abiertas se reconectan a una sala vacía y muestran que ya no existe.
  async alarm() {
    const left = this.activeAt + this.idleMs - Date.now();
    if (left > 1000) { await this.ctx.storage.setAlarm(Date.now() + left); return; }
    if (this.code && this.listing !== 'null') {
      const directorio = this.env.DIRECTORIO.get(this.env.DIRECTORIO.idFromName('portada'));
      await directorio.publicar(this.code, null).catch(() => {});
    }
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.close(CLOSED_BY_IDLE, 'Sala cerrada por inactividad'); } catch {}
    }
    await this.ctx.storage.deleteAll();
    this.core.wipe();
    this.code = null;
    this.listing = 'null';
  }
}
