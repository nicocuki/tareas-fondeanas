// Corazón del servidor de una sala, sin nada de Cloudflare: así se puede probar con `node --test`.
// `sala.js` lo envuelve en un Durable Object con WebSockets que hibernan.
//
// Protocolo (JSON por WebSocket). El cliente manda `{ op, r?, ... }` y, si lleva `r`, recibe
// `{ t: 'r', r, ok, v?, e? }`:
//   hello  { secret }              → identidad de la pestaña (uid = hash del secreto)
//   sub    { s, path }             → empieza a escuchar; llega { t: 'd', l: [[s, path, valor]] }
//   unsub  { s }
//   get    { path }                → v = valor actual
//   set    { path, v }             → escribe (null borra)
//   update { path, v: { rel: x } } → varias rutas de una vez, todo o nada
//   tx     { path, base, v }       → escribe solo si el valor actual es `base` (texto canónico); si no, v = actual
//   od     { path, a, v }          → al desconectarse: a = 'set' | 'remove' | 'cancel'
// Cada cambio llega a quien escucha esa rama como { t: 'd', l: [[s, ruta, valor], ...] }.
import {
  canonical, getAt, isWithin, joinPath, normalize, resolveServerValues, setAt, splitPath, uidFromSecret,
} from './tree.js';
import { canRead, checkPath, isEphemeral, unitDepth, writeError } from './rules.js';

export const MAX_STORED_CHARS = 40_000_000; // tope de lo guardado por sala (~40 MB)
export const IDLE_CLEANUP_MS = 3 * 24 * 60 * 60 * 1000; // una sala sin uso se borra a los 3 días
// Un mensaje de WebSocket no puede pasar de 1 MiB: lo más grande (los álbumes de Trazo Loco) se
// parte por ramas y viaja en varios mensajes; el cliente los junta antes de avisar.
export const MAX_MESSAGE_CHARS = 700_000;

// [s, ruta, valor] → varias entradas más chicas, si hace falta. La primera borra la rama entera.
function splitEntry(s, path, value, size = JSON.stringify(value ?? null).length) {
  if (size <= MAX_MESSAGE_CHARS || value === null || typeof value !== 'object') return [[s, path, value]];
  const out = [[s, path, null]];
  for (const [key, child] of Object.entries(value)) {
    out.push(...splitEntry(s, `${path}/${key}`, child));
  }
  return out;
}

const unitKey = (segs) => joinPath(segs.slice(0, unitDepth(segs[0])));

export class SalaCore {
  // storage: { put(key, value), delete(key) } — se guarda con el prefijo 'd:'.
  // connections(): lista de conexiones; cada una con send(texto), att() y saveAtt(att).
  constructor({ code, storage, connections, now = () => Date.now(), onPersist = () => {} }) {
    this.code = code;
    this.storage = storage;
    this.connections = connections;
    this.now = now;
    this.onPersist = onPersist;
    this.tree = null;
    this.units = new Map(); // unidad guardada → tamaño aproximado
    this.stored = 0;
  }

  load(entries) {
    for (const [key, value] of entries) {
      const segs = splitPath(key);
      this.tree = setAt(this.tree, segs, normalize(value));
      const size = JSON.stringify(value).length;
      this.units.set(key, size);
      this.stored += size;
    }
  }

  get(segs) { return getAt(this.tree, segs); }

  send(conn, msg) {
    try { conn.send(JSON.stringify(msg)); } catch {}
  }

  sendData(conn, list) {
    const entries = list.flatMap(([s, path, value]) => splitEntry(s, path, value));
    const batches = [];
    let batch = [], size = 0;
    for (const entry of entries) {
      const length = JSON.stringify(entry).length;
      if (batch.length && size + length > MAX_MESSAGE_CHARS) { batches.push(batch); batch = []; size = 0; }
      batch.push(entry);
      size += length;
    }
    if (batch.length) batches.push(batch);
    batches.forEach((l, i) => this.send(conn, i < batches.length - 1 ? { t: 'd', l, more: true } : { t: 'd', l }));
  }

  async message(conn, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;
    const reply = (ok, extra = {}) => { if (msg.r !== undefined) this.send(conn, { t: 'r', r: msg.r, ok, ...extra }); };
    try {
      const att = conn.att();
      if (msg.op === 'hello') {
        att.uid = await uidFromSecret(msg.secret ?? Math.random());
        conn.saveAtt(att);
        reply(true, { v: { uid: att.uid, now: this.now() } });
        return;
      }
      const segs = msg.path === undefined ? null : splitPath(msg.path);
      if (segs && !checkPath(segs, this.code)) { reply(false, { e: 'Ruta fuera de esta sala.' }); return; }
      switch (msg.op) {
        case 'sub': {
          if (!canRead(segs, att.uid, this.tree)) {
            this.send(conn, { t: 'x', s: msg.s, e: 'Permiso denegado.' });
            return;
          }
          att.subs[msg.s] = joinPath(segs);
          conn.saveAtt(att);
          this.sendData(conn, [[msg.s, joinPath(segs), this.get(segs)]]);
          return;
        }
        case 'unsub':
          delete att.subs[msg.s];
          conn.saveAtt(att);
          return;
        case 'get':
          if (!canRead(segs, att.uid, this.tree)) { reply(false, { e: 'Permiso denegado.' }); return; }
          reply(true, { v: this.get(segs) });
          return;
        case 'set': {
          const error = this.write([[segs, msg.v]], att.uid);
          reply(!error, error ? { e: error } : {});
          return;
        }
        case 'update': {
          const writes = Object.entries(msg.v || {}).map(([rel, v]) => [[...segs, ...splitPath(rel)], v]);
          const error = this.write(writes, att.uid);
          reply(!error, error ? { e: error } : {});
          return;
        }
        case 'tx': {
          if (!canRead(segs, att.uid, this.tree)) { reply(false, { e: 'Permiso denegado.' }); return; }
          const current = this.get(segs);
          if (canonical(current) !== msg.base) { reply(false, { v: current, retry: true }); return; }
          const error = this.write([[segs, msg.v]], att.uid);
          if (error) { reply(false, { e: error }); return; }
          reply(true, { v: this.get(segs) });
          return;
        }
        case 'od': {
          const path = joinPath(segs);
          att.od = att.od.filter(([, p]) => p !== path);
          if (msg.a === 'set' || msg.a === 'remove') att.od.push([msg.a, path, msg.a === 'set' ? msg.v : null]);
          conn.saveAtt(att);
          reply(true);
          return;
        }
        default:
          reply(false, { e: 'Operación desconocida.' });
      }
    } catch (error) {
      reply(false, { e: String(error?.message || error) });
    }
  }

  // Lo que la pantalla dejó anotado para cuando se fuera (presencia, buzones, fotos).
  close(conn) {
    const att = conn.att();
    if (!att?.od?.length) return;
    const writes = att.od.map(([, path, v]) => [splitPath(path), v]);
    att.od = [];
    att.subs = {};
    conn.saveAtt(att);
    // Igual que en Firebase, estas escrituras ya se aceptaron al anotarlas.
    this.write(writes, att.uid, { trusted: true });
  }

  // Aplica todas las escrituras o ninguna. Devuelve el motivo si alguna no se permite.
  write(writes, uid, { trusted = false } = {}) {
    const now = this.now();
    const prepared = [];
    let added = 0;
    for (const [segs, raw] of writes) {
      if (!checkPath(segs, this.code)) return 'Ruta fuera de esta sala.';
      const value = normalize(resolveServerValues(raw ?? null, now));
      if (!trusted) {
        const error = writeError(segs, uid, value, this.tree);
        if (error) return error;
      }
      if (!isEphemeral(segs) && value !== null) added += JSON.stringify(value).length;
      prepared.push([segs, value]);
    }
    if (added && this.stored + added > MAX_STORED_CHARS) return 'La sala se quedó sin espacio.';
    for (const [segs, value] of prepared) this.tree = setAt(this.tree, segs, value);
    this.broadcast(prepared.map(([segs]) => segs));
    this.persist(prepared.map(([segs]) => segs));
    return null;
  }

  broadcast(changed) {
    for (const conn of this.connections()) {
      const att = conn.att();
      if (!att) continue;
      const list = [];
      for (const [s, path] of Object.entries(att.subs || {})) {
        const sub = splitPath(path);
        let whole = false;
        for (const w of changed) {
          if (isWithin(sub, w)) whole = true;          // se reescribió la rama entera (o una de más arriba)
          else if (isWithin(w, sub)) list.push([s, joinPath(w), this.get(w)]); // cambió algo adentro
        }
        if (whole) list.push([s, path, this.get(sub)]);
      }
      if (list.length) this.sendData(conn, list);
    }
  }

  persist(changed) {
    const keys = new Set();
    for (const segs of changed) {
      if (isEphemeral(segs)) continue;
      const depth = unitDepth(segs[0]);
      if (segs.length >= depth) { keys.add(unitKey(segs)); continue; }
      // Se tocó algo más arriba que una unidad: revisar las guardadas y las que haya ahora.
      const prefix = joinPath(segs) + '/';
      for (const key of this.units.keys()) if (key.startsWith(prefix)) keys.add(key);
      this.collectUnits(segs, depth, keys);
    }
    if (!keys.size) return;
    for (const key of keys) {
      const segs = splitPath(key);
      if (isEphemeral(segs)) continue;
      const value = this.get(segs);
      this.stored -= this.units.get(key) || 0;
      if (value === null) {
        this.units.delete(key);
        this.storage.delete('d:' + key);
      } else {
        const size = JSON.stringify(value).length;
        this.units.set(key, size);
        this.stored += size;
        this.storage.put('d:' + key, value);
      }
    }
    this.onPersist();
  }

  collectUnits(segs, depth, keys) {
    const value = this.get(segs);
    if (value === null) return;
    if (segs.length >= depth) { keys.add(joinPath(segs)); return; }
    if (typeof value !== 'object') { keys.add(joinPath(segs)); return; }
    for (const key of Object.keys(value)) this.collectUnits([...segs, key], depth, keys);
  }

  // Borra todo (sala abandonada).
  wipe() {
    this.tree = null;
    this.units.clear();
    this.stored = 0;
  }
}

export const newAttachment = (code) => ({ code, uid: null, subs: {}, od: [] });
