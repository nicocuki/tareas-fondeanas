// Fondo Kart: la carrera en una compu. Cada compu es dueña de sus karts (el suyo en el online; los de los celulares y el
// teclado en el local; los bots, la del anfitrión): los mueve con la física al instante, sin esperar a nadie, y manda una
// foto 30 veces por segundo, directo entre navegadores (WebRTC, kart/{sala}), con respaldo por el servidor.
//
// Por qué no se ve trabado: los karts ajenos no se dibujan donde dijo la última foto (eso es lo que hacía saltar al tenis),
// sino un poco en el pasado, interpolando entre las dos fotos que rodean ese momento; el retraso se ajusta solo con lo
// que tardan en llegar (`lagDelay`). Si las fotos se atrasan, se siguen moviendo con su velocidad (extrapolación) un rato.
//
// Ítems: los dispara la compu del dueño y viajan como eventos dentro de las fotos (se repiten 3 s y se usan una vez por
// `k`). Cada compu simula los proyectiles; lo que golpea a un kart lo decide la compu de ese kart, y avisa (`pop`).
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { skinById } from '../wii/skins.js';
import { SkinFace } from '../wii/SkinPicker.jsx';
import { buildTrack, LAPS, TRACKS, obstacleParts } from './tracks.js';
import {
  STEP, ITEMS, BOX_R, BOX_RESPAWN, BOMB_FUSE, BOMB_R, BLUE_R, HORN_R, ROLL_TIME, STAR_TIME, GOLD_TIME, SHRINK_TIME, KART_R,
  botInput, bump, hitKart, mtLevel, newKart, rankingOf, rollItem, slipstream, spawnShot, stepKart, stepShot, fwd,
} from './sim.js';

const SNAP_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 10;
const EVENT_KEEP = 3;
const PAD_EVERY = 0.25;
const ORD = (n) => `${n}°`;
const COIN_RESPAWN = 10;
const COIN_R = 2.2;
export const MEDAL = ['🥇', '🥈', '🥉'];

// Teclas: WASD o flechas para manejar, Espacio o Shift derrapa, E / Ctrl / X usa el ítem.
function useKeys() {
  const keys = useRef({ s: 0, a: false, b: false, d: false, i: 0 }).current;
  useEffect(() => {
    const held = new Set();
    const sync = () => {
      keys.s = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0);
      keys.a = held.has('KeyW') || held.has('ArrowUp');
      keys.b = held.has('KeyS') || held.has('ArrowDown');
      keys.d = held.has('Space') || held.has('ShiftLeft') || held.has('ShiftRight');
    };
    const down = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      if (!e.repeat && ['KeyE', 'KeyX', 'ControlLeft', 'ControlRight'].includes(e.code)) keys.i += 1;
      held.add(e.code); sync();
    };
    const up = (e) => { held.delete(e.code); sync(); };
    const blur = () => { held.clear(); sync(); };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, [keys]);
  return keys;
}

// Kart en foto: lo mínimo para dibujarlo y para que los demás choquen con él.
const pack = (k) => [k.id, +k.x.toFixed(2), +k.z.toFixed(2), +k.y.toFixed(2), +k.yaw.toFixed(3), +k.speed.toFixed(1), +k.steer.toFixed(2), k.drift, mtLevel(k.charge),
  k.lap, +k.prog.toFixed(1), +k.boost.toFixed(2), +k.star.toFixed(1), +k.spin.toFixed(2), +k.shrink.toFixed(1), +k.fall.toFixed(2), k.finished ? 1 : 0,
  (k.air ? 1 : 0) | (k.glide ? 2 : 0) | (k.trick ? 4 : 0), +(k.gy ?? k.y).toFixed(2), k.coins || 0];
const unpack = (a) => ({ id: a[0], x: a[1], z: a[2], y: a[3], yaw: a[4], speed: a[5], steer: a[6], drift: a[7], mt: a[8], lap: a[9], prog: a[10], boost: a[11], star: a[12], spin: a[13], shrink: a[14], fall: a[15], finished: a[16] === 1, air: Boolean(a[17] & 1), glide: Boolean(a[17] & 2), trick: Boolean(a[17] & 4), gy: a[18] ?? a[3], coins: a[19] || 0 });
const lerpAngle = (a, b, u) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * u; };

export default function KartRace({ room, me, code, offset, onDispatch, pads }) {
  const canvasRef = useRef(null);
  const roomRef = useRef(room); roomRef.current = room;
  const dispatchRef = useRef(onDispatch); dispatchRef.current = onDispatch;
  const offRef = useRef(offset); offRef.current = offset;
  const keys = useKeys();
  const race = room.race;
  const track = buildTrack(race.track);
  const local = room.options.mode === 'local';
  const mine = race.racers.filter((r) => r.screen === me.id);
  const humansHere = mine.filter((r) => !r.bot);
  const views = (local ? humansHere.slice(0, 4) : humansHere.filter((r) => r.id === me.id)).map((r) => r.id);
  const [hud, setHud] = useState({ views: [], ranking: [], t: -9 });
  const S = useRef(null);
  if (!S.current || S.current.n !== race.n) {
    S.current = {
      n: race.n, karts: new Map(), remote: new Map(), shots: new Map(), seen: new Set(), out: [], seq: 0, boxUntil: track.boxes.map(() => -99), coinUntil: track.coins.map(() => -99), zoneSeen: {}, lapSeen: {}, track,
      booms: [], usedI: {}, coinFx: {}, lags: [], sentFinish: new Set(), endTry: 0, snapAt: 0, serverAt: 0, padAt: 0, hits: {},
    };
    race.racers.forEach((r, i) => { if (r.screen === me.id) { const k = newKart(r.id, i, track); k.line = (i % 3 - 1) * track.half * 0.3; k.bot = Boolean(r.bot); S.current.karts.set(r.id, k); } });
  }
  const s = S.current;

  const raceT = () => (Date.now() + offRef.current - roomRef.current.race.startsAt) / 1000;

  // ─── Red ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.kartChannel(code);
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let m = raw;
      if (typeof raw === 'string') { try { m = JSON.parse(raw); } catch { return; } }
      if (m.n !== S.current.n || !Array.isArray(m.k)) return;
      const st = S.current, now = raceT();
      // Cuánto tardó (con la diferencia de relojes incluida: se compensa sola al restar).
      st.lags.push({ at: now, lag: now - m.t });
      while (st.lags.length && st.lags[0].at < now - 3) st.lags.shift();
      for (const a of m.k) {
        const k = unpack(a);
        if (st.karts.has(k.id)) continue;
        let r = st.remote.get(k.id);
        if (!r) { r = { buf: [], show: { ...k } }; st.remote.set(k.id, r); }
        if (r.buf.length && r.buf[r.buf.length - 1].t >= m.t) continue; // vieja o repetida (llegó por los dos caminos)
        r.buf.push({ t: m.t, ...k });
        if (r.buf.length > 40) r.buf.shift();
      }
      for (const ev of m.e || []) handleEvent(ev);
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    s.mesh = mesh; s.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); s.mesh = null; s.chan = null; };
  }, [code, me.id, race.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // El retraso con que se dibuja a los demás: el 90 % de lo que tardaron las fotos de los últimos 3 s, más un hueco.
  function lagDelay() {
    const l = s.lags.map((x) => x.lag).sort((a, b) => a - b);
    if (!l.length) return 0.12;
    const p90 = l[Math.min(l.length - 1, Math.floor(l.length * 0.9))];
    const lo = l[0];
    return p90 + Math.max(0.035, Math.min(0.25, (p90 - lo) * 0.5)) + SNAP_EVERY;
  }
  function remoteAt(r, t) {
    const b = r.buf;
    if (!b.length) return r.show;
    if (t >= b[b.length - 1].t) {
      // Extrapolación: hasta 0,35 s con su velocidad y dirección.
      const last = b[b.length - 1], dt = Math.min(0.35, t - last.t);
      const [fx, fz] = fwd(last.yaw + (last.drift ? last.drift * 0.32 : 0));
      return { ...last, x: last.x + fx * last.speed * dt, z: last.z + fz * last.speed * dt };
    }
    let i = b.length - 1;
    while (i > 0 && b[i - 1].t > t) i--;
    const B = b[i], A = b[i - 1] || B;
    const u = A === B ? 1 : Math.max(0, Math.min(1, (t - A.t) / (B.t - A.t)));
    const far = Math.hypot(B.x - A.x, B.z - A.z) > 25; // volvió a la pista después de caerse
    const l = (x, y) => (far ? y : x + (y - x) * u);
    return { ...B, x: l(A.x, B.x), z: l(A.z, B.z), y: l(A.y, B.y), yaw: far ? B.yaw : lerpAngle(A.yaw, B.yaw, u), steer: l(A.steer, B.steer), speed: l(A.speed, B.speed) };
  }

  // ─── Eventos ───────────────────────────────────────────────────────────────
  function emit(ev) {
    const e = { ...ev, k: `${me.id}:${++s.seq}`, t: +raceT().toFixed(3) };
    s.out.push(e);
    handleEvent(e);
    return e;
  }
  function allKarts() {
    const list = [...s.karts.values()];
    for (const [id, r] of s.remote) if (r.show) list.push({ ...r.show, id });
    return list;
  }
  const findKart = (id) => s.karts.get(id) || s.remote.get(id)?.show || null;
  function handleEvent(ev) {
    if (!ev || s.seen.has(ev.k)) return;
    s.seen.add(ev.k);
    const now = raceT();
    switch (ev.y) {
      case 'shot': {
        const p = { key: ev.k, w: ev.w, o: ev.o, x: ev.x, z: ev.z, y: ev.h, yaw: ev.yaw, v: ev.v, vy: ev.vy || 0, born: ev.t, tgt: ev.tgt || '', idx: ev.i, landed: ev.w === 'banana' };
        for (let t = ev.t; t < now - STEP / 2; t += STEP) if (!stepShot(p, STEP, track, findKart, t)) { p.gone = true; break; }
        if (!p.gone) s.shots.set(p.key, p);
        break;
      }
      case 'pop': { const p = s.shots.get(ev.p); if (p) p.gone = true; break; }
      case 'box': s.boxUntil[ev.b] = ev.t + BOX_RESPAWN; break;
      case 'coin': s.coinUntil[ev.c] = ev.t + COIN_RESPAWN; break;
      case 'boom': {
        const p = s.shots.get(ev.p); if (p) p.gone = true;
        s.booms.push({ key: ev.k, x: ev.x, z: ev.z, r: ev.r, at: now, color: ev.w === 'azul' ? 0x4ab4ff : 0xffa63c });
        for (const k of s.karts.values()) if (Math.hypot(k.x - ev.x, k.z - ev.z) < ev.r) hit(k, ev.w || 'bomba');
        break;
      }
      case 'horn': {
        s.booms.push({ key: ev.k, x: ev.x, z: ev.z, r: HORN_R, at: now, color: 0xffe14a });
        for (const k of s.karts.values()) if (k.id !== ev.o && Math.hypot(k.x - ev.x, k.z - ev.z) < HORN_R) hit(k, 'bocina');
        for (const p of s.shots.values()) if (Math.hypot(p.x - ev.x, p.z - ev.z) < HORN_R) p.gone = true;
        break;
      }
      case 'zap': {
        s.zapAt = now;
        for (const k of s.karts.values()) if (k.id !== ev.o && k.star <= 0) { hitKart(k, 'banana'); k.shrink = SHRINK_TIME; k.item = ''; k.itemN = 0; k.pending = ''; k.rolling = 0; }
        break;
      }
      default:
    }
  }
  function hit(k, kind) {
    if (hitKart(k, kind)) { s.hits[k.id] = performance.now(); return true; }
    return false;
  }

  // ─── Ítems ─────────────────────────────────────────────────────────────────
  function shoot(k, w, tgt = '') {
    const p = spawnShot(w, k.id, k, '', raceT(), tgt);
    emit({ y: 'shot', w, o: k.id, x: +p.x.toFixed(2), z: +p.z.toFixed(2), h: +p.y.toFixed(2), yaw: +p.yaw.toFixed(3), v: +p.v.toFixed(1), vy: p.vy, tgt, i: p.idx });
  }
  function useItem(k, ranking) {
    const it = k.item;
    if (!it || k.spin > 0 || k.fall > 0) return;
    const rank = ranking.indexOf(k.id);
    switch (it) {
      case 'banana': case 'banana3': shoot(k, 'banana'); break;
      case 'verde': case 'verde3': shoot(k, 'verde'); break;
      case 'rojo': case 'rojo3': shoot(k, 'rojo', rank > 0 ? ranking[rank - 1] : ''); break;
      case 'hongo': case 'hongo3': k.boost = Math.max(k.boost, 1.25); k.boostPow = 1.42; break;
      case 'dorado':
        if (!k.goldOn) { k.goldOn = true; k.gold = GOLD_TIME; }
        k.boost = Math.max(k.boost, 1.0); k.boostPow = 1.42;
        return; // se gasta solo cuando se acaba el tiempo
      case 'estrella': k.star = STAR_TIME; break;
      case 'rayo': emit({ y: 'zap', o: k.id }); break;
      case 'bomba': shoot(k, 'bomba'); break;
      case 'azul': shoot(k, 'azul', ranking[0] === k.id ? ranking[0] : ranking[0]); break;
      case 'bocina': emit({ y: 'horn', o: k.id, x: +k.x.toFixed(2), z: +k.z.toFixed(2) }); break;
      default:
    }
    k.itemN -= 1;
    if (k.itemN <= 0) { k.item = ''; k.itemN = 0; }
  }

  // ─── Un paso de simulación ─────────────────────────────────────────────────
  // Lo que maneja a cada kart: el celular (si mandó algo hace poco) y, para el que corre con el teclado de esta compu, las
  // teclas. El ítem se cuenta: cada vez que sube el número se usa uno.
  function inputFor(k) {
    if (k.bot || k.finished) return botInput(k, track);
    const pad = pads?.current?.get(k.id);
    const p = pad && performance.now() - pad.at < 1500 ? pad : { s: 0, a: false, b: false, d: false };
    const kb = k.id === me.id ? keys : { s: 0, a: false, b: false, d: false, i: 0 };
    return { s: Math.abs(p.s) > Math.abs(kb.s) ? p.s : kb.s, a: p.a || kb.a, b: p.b || kb.b, d: p.d || kb.d, i: (pad?.i || 0) + kb.i };
  }

  // Lo que se anuncia en el medio de la vista: la zona en la que entraste (2,5 s) o la última vuelta.
  function banner(id, k, t) {
    const zi = track.zoneAt[k.idx ?? 0] ?? 0;
    const zs = s.zoneSeen[id];
    if (!zs || zs.zi !== zi) s.zoneSeen[id] = { zi, at: zs ? t : -9 };
    const lap = Math.max(1, k.lap || 0);
    const ls = s.lapSeen[id];
    if (!ls || ls.lap !== lap) s.lapSeen[id] = { lap, at: ls ? t : -9 };
    if (lap === LAPS && t - s.lapSeen[id].at < 2.5 && !k.finished) return { banner: '¡Última vuelta!', bannerKind: 'lap' };
    if (lap > 1 && lap < LAPS && t - s.lapSeen[id].at < 2) return { banner: `Vuelta ${lap}`, bannerKind: 'lap' };
    if (t > 0 && t - s.zoneSeen[id].at < 2.5 && track.zones[zi]) return { banner: track.zones[zi].name, bannerKind: 'zone' };
    return {};
  }

  function step(t) {
    const room = roomRef.current;
    const env = { cc: room.race.cc, t };
    const all = allKarts();
    const ranking = rankingOf(all, room.race.finish);
    const humans = all.filter((k) => !String(k.id).startsWith('bot-'));
    const bestHuman = humans.reduce((m, k) => Math.max(m, k.prog), -Infinity);
    for (const r of room.race.racers) {
      const k = s.karts.get(r.id);
      if (!k) continue;
      // Bots: un poco más lentos si van muy adelante de las personas y un poco más rápidos si quedaron atrás.
      if (k.bot) {
        const ccBase = { 50: 0.9, 100: 0.94, 150: 0.97 }[room.race.cc] || 0.94;
        const gap = humans.length ? k.prog - bestHuman : 0;
        k.botMul = ccBase + (gap > 120 ? -0.07 : gap < -80 ? 0.05 : 0);
      }
      const inp = inputFor(k);
      stepKart(k, inp, STEP, track, env);
      if (t < 0) continue;
      slipstream(k, all, STEP);
      for (const o of all) if (o.id !== k.id && o.fall <= 0 && k.fall <= 0) {
        if (bump(k, o) && o.star > 0) hit(k, 'estrella');
      }
      // Cajas de ítems.
      if (room.race.items && k.fall <= 0) track.boxes.forEach((b, i) => {
        if (s.boxUntil[i] > t || (b.x - k.x) ** 2 + (b.z - k.z) ** 2 > (BOX_R + KART_R) ** 2) return;
        emit({ y: 'box', b: i });
        if (!k.item && !k.pending && !k.rolling) {
          k.pending = rollItem(Math.max(0, ranking.indexOf(k.id)), ranking.length, Math.random);
          k.rolling = k.bot ? 0.6 : ROLL_TIME;
          if (k.bot) k.useAt = t + 1.5 + Math.random() * 5;
        }
      });
      // Monedas (hasta 10: cada una suma velocidad máxima).
      if (k.fall <= 0) track.coins.forEach((c, i) => {
        if (s.coinUntil[i] > t || (c.x - k.x) ** 2 + (c.z - k.z) ** 2 > COIN_R * COIN_R || Math.abs(c.y - k.y - 0.6) > 2.2) return;
        emit({ y: 'coin', c: i });
        k.coins = Math.min(10, (k.coins || 0) + 1);
        s.coinFx[k.id] = performance.now();
      });
      // Obstáculos (los de una fase, desde su vuelta).
      if (k.fall <= 0) for (const o of track.obstacles) {
        if (o.lap && Math.max(1, k.lap) < o.lap) continue;
        for (const pt of obstacleParts(track, o, t)) {
          if (!pt.r || Math.abs(pt.y - k.y) > (pt.kind === 'geyser' ? 6 : 3) || (pt.x - k.x) ** 2 + (pt.z - k.z) ** 2 > (pt.r + KART_R) ** 2) continue;
          if (hit(k, 'obst')) {
            if (pt.kind === 'geyser') { k.vy = 13; k.air = true; }
            if (pt.kind === 'crusher') k.shrink = Math.max(k.shrink, 2.5);
            const dx = k.x - pt.x, dz = k.z - pt.z, d = Math.hypot(dx, dz) || 1;
            k.kx += (dx / d) * 6; k.kz += (dz / d) * 6;
          }
          break;
        }
      }
      if (k.goldOn && k.gold <= 0) { k.goldOn = false; k.item = ''; k.itemN = 0; }
      // Usar el ítem: las personas con el botón (cuenta cuántas veces se apretó), los bots cuando les toca.
      if (k.bot) { if (k.item && !k.rolling && t >= (k.useAt || 0)) { useItem(k, ranking); k.useAt = t + (k.goldOn ? 0.6 : 1 + Math.random() * 2); } }
      else {
        const prev = s.usedI[k.id];
        if (prev == null) s.usedI[k.id] = inp.i;
        else if (inp.i !== prev) { s.usedI[k.id] = inp.i; if (inp.i > prev) useItem(k, ranking); }
      }
      // Proyectiles que me tocan (los míos recién tirados, no).
      for (const p of s.shots.values()) {
        if (p.gone || k.fall > 0) continue;
        if (p.o === k.id && t - p.born < 0.6) continue;
        const d = Math.hypot(p.x - k.x, p.z - k.z);
        if (p.w === 'azul') { if (p.tgt === k.id && d < 3 && p.y < 2.5) { emit({ y: 'boom', p: p.key, w: 'azul', x: +k.x.toFixed(2), z: +k.z.toFixed(2), r: BLUE_R }); } continue; }
        if (p.w === 'bomba') { if (p.landed && d < KART_R + 0.8) emit({ y: 'boom', p: p.key, w: 'bomba', x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: BOMB_R }); continue; }
        if (d < KART_R + 0.6 && Math.abs(p.y - k.y) < 1.6) { hit(k, p.w); emit({ y: 'pop', p: p.key }); }
      }
      if (k.finished && !s.sentFinish.has(k.id)) {
        s.sentFinish.add(k.id);
        dispatchRef.current({ type: 'finish', n: room.race.n, id: k.id, ms: Math.round(k.finishT * 1000) });
      }
    }
    // Las bombas explotan solas a su hora: la compu del que la tiró lo avisa.
    for (const p of s.shots.values()) {
      if (!p.gone && !stepShot(p, STEP, track, findKart, t)) p.gone = true;
      if (!p.gone && p.w === 'bomba' && t - p.born >= BOMB_FUSE && s.karts.has(p.o)) emit({ y: 'boom', p: p.key, w: 'bomba', x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: BOMB_R });
    }
    for (const [key, p] of s.shots) if (p.gone && t - p.born > 1) s.shots.delete(key);
  }

  // ─── El bucle ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    import('./render.js').then((mod) => {
      if (dead || !canvasRef.current) return;
      s.r = mod.createRenderer(canvasRef.current, track, race.racers);
    });
    let last = performance.now() / 1000, acc = 0, hudAt = 0, simT = null;
    const stop = everyFrame(({ hidden } = {}) => {
      const now = performance.now() / 1000;
      const dt = Math.min(0.1, now - last); last = now;
      const room = roomRef.current;
      if (room.phase !== 'race' || room.race?.n !== s.n) return;
      const t = raceT();
      if (simT == null) simT = t;
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 12) { acc -= STEP; simT += STEP; step(simT); }
      if (acc > 0.5) acc = 0;
      if (Math.abs(simT - t) > 0.25) simT = t; // se trabó la pestaña: vuelve a la hora de la carrera
      // Los demás, en el pasado interpolado.
      const delay = lagDelay();
      for (const r of s.remote.values()) r.show = remoteAt(r, t - delay);
      // Foto.
      const sendT = now;
      if (sendT - s.snapAt >= SNAP_EVERY) {
        s.snapAt = sendT;
        s.out = s.out.filter((e) => t - e.t < EVENT_KEEP);
        const msg = { n: s.n, t: +t.toFixed(3), k: [...s.karts.values()].map(pack), e: s.out };
        s.mesh?.broadcast(msg);
        const others = [...new Set(room.race.racers.map((r) => r.screen))].filter((id) => id !== me.id);
        if (others.length && others.some((id) => !s.mesh || !s.mesh.isOpen(id)) && sendT - s.serverAt >= SERVER_EVERY) { s.serverAt = sendT; s.chan?.publish(me.id, JSON.stringify(msg)).catch(() => {}); }
      }
      // Lo que ve cada celular (puesto, vuelta, ítem) y si lo golpearon (vibra).
      const all = allKarts();
      const ranking = rankingOf(all, room.race.finish);
      if (now - s.padAt > PAD_EVERY && pads?.send) {
        s.padAt = now;
        for (const k of s.karts.values()) if (!k.bot) pads.send(k.id, { pos: ranking.indexOf(k.id) + 1, lap: Math.max(1, Math.min(LAPS, k.lap)), item: k.rolling ? '?' : k.item, n: k.itemN, hit: s.hits[k.id] || 0, done: k.finished, mt: k.drift ? mtLevel(k.charge) : 0 });
      }
      // La compu del anfitrión cierra la carrera cuando corresponde.
      if (room.hostId === me.id && now - s.endTry > 1) {
        const rc = room.race, srv = Date.now() + offRef.current;
        if ((rc.allAt && srv >= rc.allAt + 2600) || (rc.firstAt && srv >= rc.firstAt + 30000) || srv >= rc.startsAt + 6 * 60000) { s.endTry = now; dispatchRef.current({ type: 'end', n: rc.n, order: ranking }); }
      }
      if (!hidden && s.r) {
        const frame = {
          karts: all.map((k) => ({ ...k, mt: k.mt ?? (k.drift ? mtLevel(k.charge || 0) : 0) })),
          shots: [...s.shots.values()].filter((p) => !p.gone),
          boxes: s.boxUntil.map((u) => u <= t || !room.race.items),
          booms: s.booms.filter((b) => t - b.at < 0.7),
          coins: s.coinUntil.map((u) => u <= t),
          t, lap: Math.max(1, ...(views.length ? views : [ranking[0]]).map((id) => findKart(id)?.lap || 1)),
          views: views.length ? views : [ranking[0]],
        };
        s.r.draw(frame);
      }
      if (now - hudAt > 0.1) {
        hudAt = now;
        setHud({
          t, ranking, zap: s.zapAt && t - s.zapAt < 0.4,
          views: (views.length ? views : [ranking[0]]).map((id) => { const k = s.karts.get(id) || findKart(id); return k ? { id, pos: ranking.indexOf(id) + 1, lap: k.lap, item: k.rolling ? '?' : k.item, n: k.itemN, gold: k.goldOn ? k.gold : 0, finished: k.finished, finishT: k.finishT, boost: k.boost > 0, mt: k.drift ? mtLevel(k.charge || 0) : 0, start: k.startBoost && t < 1.5, spin: k.spin > 0, coins: k.coins || 0, coinFx: performance.now() - (s.coinFx[id] || 0) < 300, glide: Boolean(k.glide), trick: k.trickAt != null && t - k.trickAt < 1, ...banner(id, k, t) } : null; }),
        });
      }
    });
    window.__kart = s; // para manejar la carrera desde un navegador automatizado
    return () => { dead = true; stop(); s.r?.dispose(); s.r = null; if (window.__kart === s) delete window.__kart; };
  }, [race.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // La votación termina sola; si la carrera se pasa del tope, cualquiera la cierra.
  const t = hud.t;
  const def = TRACKS[race.track];
  const nameOf = (id) => race.racers.find((r) => r.id === id)?.name || '?';
  const cols = hud.views.length > 1 ? 2 : 1, rows = hud.views.length > 2 ? 2 : 1;
  return (
    <div className="kt-race" data-kart-race>
      <canvas ref={canvasRef} className="kt-canvas" data-kart-canvas />
      <div className="kt-views" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
        {hud.views.map((v, i) => v && (
          <div key={v.id} className="kt-view" data-view={i}>
            <div className="kt-pos" data-pos={v.pos}><b>{v.pos}</b><small>°</small></div>
            <div className="kt-lap" data-lap>Vuelta <b>{Math.max(1, Math.min(LAPS, v.lap))}</b>/{LAPS}</div>
            <div className={`kt-item${v.item === '?' ? ' is-rolling' : ''}`} data-item={v.item || ''}>
              {v.item === '?' ? <span className="kt-roll">{['🍌', '🍄', '🔴', '⭐', '💣', '🟢'][Math.floor(t * 12) % 6]}</span> : v.item ? <span>{ITEMS[v.item]?.icon}</span> : null}
              {v.n > 1 && <em>×{v.n}</em>}
              {v.gold > 0 && <i style={{ width: `${(v.gold / GOLD_TIME) * 100}%` }} />}
            </div>
            {hud.views.length > 1 && <div className="kt-name" style={{ '--sh': skinById(race.racers.find((r) => r.id === v.id)?.skin).shirt }}>{nameOf(v.id)}</div>}
            {v.mt > 0 && <div className={`kt-mt is-${v.mt}`}>{['', 'Turbo azul', 'Turbo naranja', '¡Turbo violeta!'][v.mt]}</div>}
            {v.start && <div className="kt-pop">¡Turbo de largada!</div>}
            {v.trick && <div className="kt-pop">¡Pirueta!</div>}
            {v.glide && <div className="kt-glide">🪂 Planeando · doblá para juntar monedas</div>}
            {v.banner && !v.finished && <div className={`kt-banner-zone is-${v.bannerKind}`} key={v.banner}>{v.banner}</div>}
            <div className={`kt-coins${v.coinFx ? ' is-pop' : ''}`} data-coins={v.coins}><i />{v.coins}</div>
            {v.finished && <div className="kt-finish" data-finished>{MEDAL[v.pos - 1] || '🏁'} ¡Llegaste {ORD(v.pos)}!<small>{fmtTime(v.finishT)}</small></div>}
          </div>
        ))}
      </div>
      {t < 0 && t > -6.5 && (
        <div className="kt-intro">
          {t < -3.2 ? <div className="kt-trackname"><span>{def.emoji}</span><b>{def.name}</b><small>{room.race.items ? 'Con ítems' : 'Sin ítems'} · {room.race.cc}cc · {LAPS} vueltas</small></div>
            : <div className="kt-count" key={Math.ceil(-t)} data-count={Math.ceil(-t)}>{Math.ceil(-t)}</div>}
          {t >= -3.2 && t < -1.4 && <p className="kt-hint">Acelerá justo cuando aparece el 2 para salir con turbo</p>}
        </div>
      )}
      {t >= 0 && t < 1 && <div className="kt-intro"><div className="kt-count is-go">¡YA!</div></div>}
      {hud.zap && <div className="kt-zap" />}
      <ol className="kt-board" data-board>
        {hud.ranking.map((id, i) => {
          const r = race.racers.find((x) => x.id === id);
          return r ? <li key={id} className={views.includes(id) ? 'is-me' : ''}><span>{i + 1}</span><SkinFace skin={skinById(r.skin)} size={20} /><b>{r.name}</b>{room.race.finish[id] != null && <em>🏁</em>}</li> : null;
        })}
      </ol>
      <Minimap track={track} kartsRef={s} views={views} racers={race.racers} />
    </div>
  );
}

export function fmtTime(sec) {
  if (sec == null || !Number.isFinite(sec)) return '—';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}

// El mapa chico de la esquina: la pista y un punto por kart, del color de su remera.
function Minimap({ track, kartsRef, views, racers }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return undefined;
    const g = cv.getContext('2d');
    const xs = track.samples.map((p) => p.x), zs = track.samples.map((p) => p.z);
    const minX = Math.min(...xs) - 10, maxX = Math.max(...xs) + 10, minZ = Math.min(...zs) - 10, maxZ = Math.max(...zs) + 10;
    const W = cv.width, H = cv.height, k = Math.min(W / (maxX - minX), H / (maxZ - minZ));
    const P = (x, z) => [(x - minX) * k + (W - (maxX - minX) * k) / 2, (z - minZ) * k + (H - (maxZ - minZ) * k) / 2];
    const skin = new Map(racers.map((r) => [r.id, skinById(r.skin).shirt]));
    return everyFrame(({ hidden } = {}) => {
      if (hidden) return;
      g.clearRect(0, 0, W, H);
      g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); track.samples.forEach((p, i) => { const [x, y] = P(p.x, p.z); if (i) g.lineTo(x, y); else g.moveTo(x, y); }); g.closePath();
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 9; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5; g.stroke();
      const draw = (k2) => { const [x, y] = P(k2.x, k2.z); const big = views.includes(k2.id); g.beginPath(); g.arc(x, y, big ? 6 : 4.5, 0, Math.PI * 2); g.fillStyle = skin.get(k2.id) || '#fff'; g.fill(); g.lineWidth = big ? 2.5 : 1.5; g.strokeStyle = big ? '#ffe14a' : '#111'; g.stroke(); };
      for (const [id, r] of kartsRef.remote) if (r.show) draw({ ...r.show, id });
      for (const k2 of kartsRef.karts.values()) draw(k2);
    });
  }, [track, kartsRef, views, racers]);
  return <canvas ref={ref} className="kt-minimap" width={180} height={180} data-minimap />;
}
