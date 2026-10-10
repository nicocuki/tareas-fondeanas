// Durable Object: una instancia por código de sala, con WebSockets que hibernan.
// Mientras nadie manda nada, la sala se duerme y no gasta; los datos quedan guardados en su
// SQLite y las conexiones siguen abiertas (lo que cada una escucha va en su «attachment»).
import { DurableObject } from 'cloudflare:workers';
import { IDLE_CLEANUP_MS, SalaCore, newAttachment } from './core.js';

const ALARM_REFRESH_MS = 60 * 60 * 1000; // la alarma de limpieza se corre como mucho una vez por hora

export class Sala extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.atts = new WeakMap();
    this.alarmSetAt = 0;
    // Un "ping" del cliente se contesta solo, sin despertar a la sala.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.code = (await ctx.storage.get('code')) || null;
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
      onPersist: () => this.scheduleCleanup(),
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

  scheduleCleanup() {
    const now = Date.now();
    if (now - this.alarmSetAt < ALARM_REFRESH_MS) return;
    this.alarmSetAt = now;
    this.ctx.storage.setAlarm(now + IDLE_CLEANUP_MS);
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
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== 'string') return;
    await this.core.message(this.conn(ws), message);
  }

  async webSocketClose(ws, code) {
    this.core.close(this.conn(ws));
    const valid = code >= 1000 && code < 5000 && code !== 1005 && code !== 1006;
    try { ws.close(valid ? code : 1000, 'chau'); } catch {}
  }

  async webSocketError(ws) {
    this.core.close(this.conn(ws));
  }

  // Tres días sin escrituras: se borra la sala entera.
  async alarm() {
    if (this.ctx.getWebSockets().length > 0) {
      this.alarmSetAt = Date.now();
      await this.ctx.storage.setAlarm(Date.now() + IDLE_CLEANUP_MS);
      return;
    }
    await this.ctx.storage.deleteAll();
    this.core.wipe();
    this.code = null;
  }
}
