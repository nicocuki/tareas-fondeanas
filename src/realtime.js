// Cliente del servidor de salas (Cloudflare Durable Objects), con la misma forma que la parte de
// Firebase Realtime Database que usaban los juegos: ref, onValue, set, update, runTransaction,
// onDisconnect, serverTimestamp, '.info/connected' y '.info/serverTimeOffset'.
//
// Cada código de sala es un Durable Object aparte y tiene su propio WebSocket: la ruta
// «rooms/ABCD», «futbol/ABCD/…» o «garticSteps/ABCD/…» va siempre a la sala ABCD (el segundo
// tramo de la ruta). Si se corta, se reconecta solo y vuelve a pedir lo que estaba escuchando.
import {
  SERVER_TIMESTAMP, canonical, childEntries, clone, joinPath, normalize, pushKey, setAt, splitPath, uidFromSecret,
} from '../worker/tree.js';
import { backgroundInterval, backgroundTimeout } from './ticker.js';

const SECRET_KEY = 'tareas:secreto';
// Latido para que ni el navegador ni Cloudflare corten la conexión, y para notar rápido una conexión que
// quedó colgada (pasó en el colegio: con 20 s y 30 s se tardaba casi un minuto en reconectar).
const PING_MS = 10000;
const DEAD_MS = 15000;         // un ping sin respuesta en este tiempo: la conexión se da por muerta
const IDLE_CLOSE_MS = 20000;   // una sala que ya nadie escucha se desconecta
const MAX_TX_ATTEMPTS = 50;

const defaults = () => ({
  WebSocket: globalThis.WebSocket,
  url: (code) => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/sala/${code}`,
  fetchTime: async () => (await fetch('/api/hora', { cache: 'no-store' })).json(),
  storage: () => globalThis.sessionStorage,
});
let config = defaults();

// Solo para tests: cambiar el transporte, la URL o el reloj.
export function configureRealtime(options) {
  config = { ...defaults(), ...options };
  shards.forEach((shard) => shard.destroy());
  shards.clear();
  secret = null;
}

// ─── Identidad (una por pestaña, como el acceso anónimo de Firebase) ─────────
let secret = null;
function tabSecret() {
  if (secret) return secret;
  try {
    secret = config.storage()?.getItem(SECRET_KEY);
    if (!secret) {
      secret = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
      config.storage()?.setItem(SECRET_KEY, secret);
    }
  } catch {
    secret ||= Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
  }
  return secret;
}
let identityPromise = null;
export function identity() {
  identityPromise ||= uidFromSecret(tabSecret()).then((uid) => ({ uid }));
  return identityPromise;
}

// ─── Referencias y fotos ─────────────────────────────────────────────────────
export function ref(path = '') {
  const segs = splitPathAllowInfo(path);
  const full = joinPath(segs);
  return { path: full, segs, key: segs.length ? segs[segs.length - 1] : null, toString: () => full };
}
export const child = (parent, path) => ref(`${parent.path}/${path}`);

function splitPathAllowInfo(path) {
  const text = String(path ?? '');
  if (text.startsWith('.info/')) return text.split('/');
  return splitPath(text);
}

function snapshot(r, value) {
  let cached;
  let done = false;
  return {
    key: r.key,
    ref: r,
    exists: () => value !== null && value !== undefined,
    val: () => {
      if (!done) { cached = value === undefined ? null : clone(value); done = true; }
      return cached;
    },
  };
}

export const serverTimestamp = () => SERVER_TIMESTAMP;

// ─── Conexión con una sala ───────────────────────────────────────────────────
const shards = new Map();

function shardFor(r) {
  const code = r.segs[1];
  if (!/^[A-Z]{4}$/.test(code || '')) throw new Error(`Ruta sin código de sala: ${r.path}`);
  let shard = shards.get(code);
  if (!shard) { shard = new Shard(code); shards.set(code, shard); }
  return shard;
}

class Shard {
  constructor(code) {
    this.code = code;
    this.ws = null;
    this.ready = false;
    this.dead = false;
    this.counter = 0;
    this.pending = new Map();  // r → { msg, resolve }
    this.subs = new Map();     // ruta → Sub
    this.odPaths = new Set();  // rutas con algo anotado para la desconexión
    this.retries = 0;
    this.lastSeen = 0;
    this.pingAt = 0;
    this.idleTimer = null;
    this.connect();
    // Con el reloj del Worker (ticker.js): con la pestaña de fondo, setInterval se frena a uno por
    // minuto y la sala daba al jugador por desconectado.
    this.stopHeartbeat = backgroundInterval(() => this.beat(), PING_MS);
  }

  connect() {
    if (this.dead) return;
    let ws;
    try { ws = new config.WebSocket(config.url(this.code)); } catch { this.scheduleReconnect(); return; }
    this.ws = ws;
    this.lastSeen = Date.now();
    this.pingAt = 0;
    ws.onopen = () => {
      this.lastSeen = Date.now();
      ws.send(JSON.stringify({ op: 'hello', secret: tabSecret(), r: 0 }));
    };
    ws.onmessage = (e) => this.receive(e.data);
    ws.onclose = () => this.dropped(ws);
    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  dropped(ws) {
    if (ws !== this.ws) return;
    this.ws = null;
    const wasReady = this.ready;
    this.ready = false;
    this.partial = null;
    // Lo anotado para la desconexión ya lo ejecutó el servidor.
    this.odPaths.clear();
    if (wasReady) notifyConnected();
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.dead) return;
    const delay = Math.min(5000, 400 * 2 ** this.retries) * (0.75 + Math.random() * 0.5);
    this.retries += 1;
    backgroundTimeout(() => this.connect(), delay);
  }

  beat() {
    if (!this.ws) return;
    // Muerta solo si el ping anterior no tuvo respuesta. Contar desde el último mensaje recibido
    // fallaba con la pestaña de fondo: si el latido se atrasaba, cortaba una conexión que andaba bien.
    const now = Date.now();
    const unanswered = this.ready ? this.pingAt && this.lastSeen < this.pingAt && now - this.pingAt > DEAD_MS : now - this.lastSeen > DEAD_MS;
    if (unanswered) { try { this.ws.close(); } catch {} this.dropped(this.ws); return; }
    if (this.ready && (!this.pingAt || this.lastSeen >= this.pingAt)) { this.pingAt = now; try { this.ws.send('ping'); } catch {} }
  }

  receive(data) {
    this.lastSeen = Date.now();
    if (data === 'pong') return;
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (msg.t === 'r' && msg.r === 0) { this.helloDone(); return; }
    if (msg.t === 'r') {
      const entry = this.pending.get(msg.r);
      if (entry) { this.pending.delete(msg.r); entry.resolve(msg); this.checkIdle(); }
      return;
    }
    if (msg.t === 'd') {
      // Algo grande llega partido en varios mensajes: se aplica todo junto al final.
      this.partial = (this.partial || []).concat(msg.l);
      if (msg.more) return;
      const entries = this.partial;
      this.partial = null;
      const bySub = new Map();
      for (const [s, path, value] of entries) {
        const sub = [...this.subs.values()].find((x) => x.id === s);
        if (!sub) continue;
        if (!bySub.has(sub)) bySub.set(sub, []);
        bySub.get(sub).push([path, value]);
      }
      bySub.forEach((entries, sub) => sub.apply(entries));
      return;
    }
    if (msg.t === 'x') {
      const sub = [...this.subs.values()].find((x) => x.id === msg.s);
      if (sub) { this.subs.delete(sub.path); sub.fail(new Error(msg.e || 'Permiso denegado.')); this.checkIdle(); }
    }
  }

  helloDone() {
    this.ready = true;
    this.retries = 0;
    for (const sub of this.subs.values()) this.raw({ op: 'sub', s: sub.id, path: sub.path });
    for (const [r, { msg }] of [...this.pending].sort(([a], [b]) => a - b)) this.raw({ ...msg, r });
    notifyConnected();
  }

  raw(msg) {
    try { this.ws?.send(JSON.stringify(msg)); } catch {}
  }

  request(msg) {
    clearTimeout(this.idleTimer);
    const r = ++this.counter;
    return new Promise((resolve) => {
      this.pending.set(r, { msg, resolve });
      if (this.ready) this.raw({ ...msg, r });
    });
  }

  subscribe(path) {
    clearTimeout(this.idleTimer);
    let sub = this.subs.get(path);
    if (!sub) {
      sub = new Sub(this, `s${++this.counter}`, path);
      this.subs.set(path, sub);
      if (this.ready) this.raw({ op: 'sub', s: sub.id, path });
    }
    return sub;
  }

  unsubscribe(sub) {
    if (this.subs.get(sub.path) !== sub) return;
    this.subs.delete(sub.path);
    if (this.ready) this.raw({ op: 'unsub', s: sub.id });
    this.checkIdle();
  }

  checkIdle() {
    clearTimeout(this.idleTimer);
    if (this.subs.size || this.pending.size || this.odPaths.size) return;
    this.idleTimer = setTimeout(() => {
      if (this.subs.size || this.pending.size || this.odPaths.size) return;
      this.destroy();
      if (shards.get(this.code) === this) shards.delete(this.code);
      notifyConnected();
    }, IDLE_CLOSE_MS);
  }

  destroy() {
    this.dead = true;
    this.stopHeartbeat();
    clearTimeout(this.idleTimer);
    const ws = this.ws;
    this.ws = null;
    this.ready = false;
    try { ws?.close(1000); } catch {}
  }
}

// Una ruta escuchada. Varias escuchas sobre la misma ruta comparten una sola suscripción.
class Sub {
  constructor(shard, id, path) {
    this.shard = shard;
    this.id = id;
    this.path = path;
    this.segs = splitPath(path);
    this.ref = ref(path);
    this.value = null;
    this.loaded = false;
    this.listeners = new Set();
    this.children = null; // clave → [texto canónico, valor], para los eventos de hijos
  }

  apply(entries) {
    for (const [path, value] of entries) {
      const rel = splitPath(path).slice(this.segs.length);
      this.value = rel.length ? setAt(this.value, rel, normalize(value)) : value;
    }
    this.loaded = true;
    this.emit();
  }

  emit() {
    const snap = snapshot(this.ref, this.value);
    const hasChild = [...this.listeners].some((l) => l.type !== 'value');
    let added = [], changed = [], removed = [];
    if (hasChild) {
      const next = new Map(childEntries(this.value).map(([k, v]) => [k, [canonical(v), v]]));
      const prev = this.children || new Map();
      for (const [k, [text, v]] of next) {
        if (!prev.has(k)) added.push([k, v]);
        else if (prev.get(k)[0] !== text) changed.push([k, v]);
      }
      for (const [k, [, v]] of prev) if (!next.has(k)) removed.push([k, v]);
      this.children = next;
    }
    for (const l of [...this.listeners]) {
      if (!this.listeners.has(l)) continue;
      if (l.type === 'value') l.cb(snap);
      else if (l.type === 'child_added') added.forEach(([k, v]) => l.cb(snapshot(child(this.ref, k), v)));
      else if (l.type === 'child_changed') changed.forEach(([k, v]) => l.cb(snapshot(child(this.ref, k), v)));
      else if (l.type === 'child_removed') removed.forEach(([k, v]) => l.cb(snapshot(child(this.ref, k), v)));
    }
  }

  add(listener) {
    if (listener.type !== 'value' && !this.children && this.loaded) {
      this.children = new Map(childEntries(this.value).map(([k, v]) => [k, [canonical(v), v]]));
    }
    this.listeners.add(listener);
    if (this.loaded) {
      // Una escucha nueva sobre algo ya cargado recibe el estado actual, como en Firebase.
      queueMicrotask(() => {
        if (!this.listeners.has(listener)) return;
        if (listener.type === 'value') listener.cb(snapshot(this.ref, this.value));
        else if (listener.type === 'child_added') {
          childEntries(this.value).forEach(([k, v]) => listener.cb(snapshot(child(this.ref, k), v)));
        }
      });
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) this.shard.unsubscribe(this);
    };
  }

  fail(error) {
    for (const l of this.listeners) l.onError?.(error);
    this.listeners.clear();
  }
}

// ─── '.info/connected' y '.info/serverTimeOffset' ────────────────────────────
const connectedListeners = new Set();
let lastConnected = null;
function isConnected() {
  for (const shard of shards.values()) if (!shard.dead && !shard.ready) return false;
  return true;
}
function notifyConnected() {
  const now = isConnected();
  if (now === lastConnected) return;
  lastConnected = now;
  connectedListeners.forEach((cb) => cb(now));
}

const offsetListeners = new Set();
let offset = null;
let offsetTimer = null;
async function syncOffset() {
  let best = null;
  for (let i = 0; i < 3; i++) {
    try {
      const t0 = Date.now();
      const { now } = await config.fetchTime();
      const t1 = Date.now();
      if (!best || t1 - t0 < best.rtt) best = { rtt: t1 - t0, offset: now - (t0 + t1) / 2 };
    } catch {}
  }
  const value = best ? Math.round(best.offset) : (offset ?? 0);
  if (value !== offset) {
    offset = value;
    offsetListeners.forEach((cb) => cb(offset));
  }
}
function watchOffset(cb) {
  offsetListeners.add(cb);
  if (offset !== null) queueMicrotask(() => offsetListeners.has(cb) && cb(offset));
  if (!offsetTimer) {
    syncOffset();
    offsetTimer = setInterval(syncOffset, 5 * 60 * 1000);
  }
  return () => {
    offsetListeners.delete(cb);
    if (!offsetListeners.size) { clearInterval(offsetTimer); offsetTimer = null; }
  };
}

// ─── Escuchar ────────────────────────────────────────────────────────────────
function listen(r, type, cb, onError) {
  if (r.path === '.info/connected') {
    if (type !== 'value') return () => {};
    const fn = (v) => cb(snapshot(r, v));
    connectedListeners.add(fn);
    queueMicrotask(() => connectedListeners.has(fn) && fn(isConnected()));
    return () => connectedListeners.delete(fn);
  }
  if (r.path === '.info/serverTimeOffset') {
    return watchOffset((v) => cb(snapshot(r, v)));
  }
  let sub;
  try { sub = shardFor(r).subscribe(r.path); } catch (error) {
    queueMicrotask(() => onError?.(error));
    return () => {};
  }
  return sub.add({ type, cb, onError });
}

export const onValue = (r, cb, onError) => listen(r, 'value', cb, onError);
export const onChildAdded = (r, cb, onError) => listen(r, 'child_added', cb, onError);
export const onChildChanged = (r, cb, onError) => listen(r, 'child_changed', cb, onError);
export const onChildRemoved = (r, cb, onError) => listen(r, 'child_removed', cb, onError);

// ─── Leer y escribir ─────────────────────────────────────────────────────────
function check(result) {
  if (!result.ok) throw new Error(result.e || 'El servidor rechazó la operación.');
  return result;
}

async function currentValue(r) {
  const shard = shardFor(r);
  const sub = shard.subs.get(r.path);
  if (sub?.loaded) return clone(sub.value);
  return check(await shard.request({ op: 'get', path: r.path })).v ?? null;
}

export async function get(r) {
  return snapshot(r, await currentValue(r));
}

export async function set(r, value) {
  check(await shardFor(r).request({ op: 'set', path: r.path, v: value ?? null }));
}

export const remove = (r) => set(r, null);

export async function update(r, values) {
  check(await shardFor(r).request({ op: 'update', path: r.path, v: values }));
}

export async function push(r, value) {
  const target = child(r, pushKey());
  await set(target, value);
  return target;
}

// Como en Firebase: `fn` recibe el valor actual y devuelve el nuevo, o undefined para no hacer nada.
// Si otra pantalla escribió en el medio, se vuelve a llamar con el valor nuevo.
export async function runTransaction(r, fn) {
  const shard = shardFor(r);
  let current = await currentValue(r);
  for (let attempt = 0; attempt < MAX_TX_ATTEMPTS; attempt++) {
    const next = fn(clone(current));
    if (next === undefined) return { committed: false, snapshot: snapshot(r, current) };
    const result = await shard.request({ op: 'tx', path: r.path, base: canonical(current), v: next });
    if (result.ok) return { committed: true, snapshot: snapshot(r, result.v ?? null) };
    if (!result.retry) throw new Error(result.e || 'El servidor rechazó la operación.');
    current = result.v ?? null;
  }
  throw new Error('Demasiados intentos: la sala cambia muy rápido.');
}

export function onDisconnect(r) {
  const shard = shardFor(r);
  const send = async (a, v) => {
    if (a === 'cancel') shard.odPaths.delete(r.path); else shard.odPaths.add(r.path);
    check(await shard.request({ op: 'od', path: r.path, a, v: v ?? null }));
  };
  return {
    set: (v) => send('set', v),
    remove: () => send('remove'),
    cancel: () => send('cancel'),
  };
}
