// Fuego Cruzado: la partida en tiempo real, en primera persona. Usa el motor de Royale 3D (movimiento, choques, tiros,
// modelos y dibujo) sobre las arenas de `maps.js`.
//
// Mismo esquema que Royale 3D: la sala (`game.js`) guarda lo de a una vez (bajas, armas agarradas, el final) y todo lo
// demás va en vivo, directo entre navegadores (WebRTC) o, si no se puede, por el servidor. Cada pantalla es dueña de su
// jugador: lo mueve, juzga sus tiros (con lo que ve) y, cuando lo matan, avisa `died` y reaparece sola a los RESPAWN_S.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import {
  EYE_H, RARITIES, SLOTS, STEP, WEAPONS, canShoot, finishReload, floorAt, held, hurt, lookDir, magOf, newPlayer, pelletDirs, pickAction, pickUp, resolveShot,
  selectSlot, startReload, statsOf, stepGround,
} from '../royale3d/sim.js';
import { sfx, setSound, soundOn } from '../royale3d/sfx.js';
import { FLOOR, gunReady, gunsOf, makeArena, mapById } from './maps.js';
import { COLORS, findPlayer, inGame, ranking } from './game.js';

const SEND_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 15;
const EVENT_KEEP = 1.6;     // segundos que un tiro sigue viajando en las fotos
const RESPAWN_S = 3;
const SPAWN_SAFE_S = 1.5;   // al reaparecer, un ratito sin que te lastimen
const LAST_HIT_S = 8;
const PICK_RANGE = 1.8;
const SENS = 0.0022;
const KEYS = { f: ['KeyW', 'ArrowUp'], b: ['KeyS', 'ArrowDown'], l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], use: ['KeyE'] };
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const WEAPON_ICON = { pickaxe: '⛏️', pistol: '🔫', revolver: '🔫', smg: '🔫', shotgun: '💥', rifle: '🔫', burst: '🎯', sniper: '🎯' };
const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export default function FpsGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const floatRef = useRef(null);
  const roomRef = useRef(room);
  const dispatchRef = useRef(onDispatch);
  const offsetRef = useRef(offset);
  roomRef.current = room;
  dispatchRef.current = onDispatch;
  offsetRef.current = offset;
  const match = room.match;
  const [sound, setSoundState] = useState(soundOn());
  const [board, setBoard] = useState(false);
  const [hud, setHud] = useState({ hp: 100, inv: [], sel: 1, loading: true, count: 0, left: 0, prompt: null, toast: '', hurt: 0, dead: false, respawn: 0 });
  const sim = useRef({
    input: { f: false, b: false, l: false, r: false, jump: false, sprint: false, use: false, fire: false }, edges: { jump: false, fire: false, use: false },
    aim: false, reload: false, remotes: new Map(), seen: new Set(), hits: 0, k: 0, dropN: 0, myShots: [], myDw: [], dw: new Map(), floaters: [], pending: new Set(),
    sentAt: 0, serverAt: 0, toastAt: 0, swingAt: -9, tickAt: 0,
  }).current;
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;
  const matchN = match?.n;

  // ─── Cargar el dibujo ──────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    import('../royale3d/render.js').then((mod) => {
      if (dead || !canvasRef.current) return;
      sim.r = mod.createRenderer(canvasRef.current);
      sim.rWorld = null;
      setHud((h) => ({ ...h, loading: false }));
    });
    return () => { dead = true; sim.r?.dispose(); sim.r = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Qué partida es esta ───────────────────────────────────────────────────
  useEffect(() => {
    const m = roomRef.current.match;
    if (!m) return;
    Object.assign(sim, {
      n: m.n, map: m.map, world: makeArena(m.map), local: null, remotes: new Map(), seen: new Set(), hits: 0, myShots: [], myDw: [], dw: new Map(),
      floaters: [], pending: new Set(), lastFeed: m.feed.length, rWorld: null,
    });
    // Cada arma queda arriba de lo que tenga abajo (algunas están en las pasarelas o las torres).
    sim.guns = gunsOf(m.map).map((g) => ({ ...g, y: floorAt(sim.world, g.x, g.z, FLOOR + 20) }));
    spawn(true);
  }, [matchN]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Red ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.fpsChannel(code);
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== sim.n || !sim.local) return;
      applyRemote(id, snap);
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    sim.mesh = mesh;
    sim.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); sim.mesh = null; sim.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyRemote(id, snap) {
    const prev = sim.remotes.get(id);
    if (!prev || snap.t > prev.snap.t) {
      const jump = !prev || Math.hypot(snap.x - prev.x, snap.z - prev.z) > 6 || (prev.snap.dd && !snap.dd);
      sim.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, z: jump ? snap.z : prev.z, yaw: jump ? snap.yw : prev.yaw, pitch: snap.pt, speed: prev?.speed || 0, lx: prev?.lx ?? snap.x, lz: prev?.lz ?? snap.z, lt: prev?.lt ?? snap.t, swing: prev?.swing || -9 });
    }
    // Cada evento se cuenta una sola vez; lo que trae la primera foto de alguien es de antes de verlo y no cuenta.
    const fresh = Boolean(prev);
    const first = (tag, ev) => { const key = `${id}:${tag}${ev.k}`; if (sim.seen.has(key)) return false; sim.seen.add(key); return fresh; };
    const rem = sim.remotes.get(id);
    const here = sim.local;
    for (const ev of snap.sh || []) {
      if (!first('s', ev)) continue;
      const o = { x: ev.o[0], y: ev.o[1], z: ev.o[2] };
      const d = { x: ev.d[0], y: ev.d[1], z: ev.d[2] };
      if (ev.w === 'pickaxe') rem.swing = performance.now() / 1000;
      const muz = sim.r?.muzzleOf(id) || o;
      if (ev.w !== 'pickaxe') {
        for (const dir of pelletDirs(d, Math.min(ev.pl || 1, 5), ev.sp || 0, ev.sd | 0)) sim.r?.tracer(muz, { x: o.x + dir.x * ev.l, y: o.y + dir.y * ev.l, z: o.z + dir.z * ev.l }, tracerOpts(ev.w));
        sim.r?.muzzleFlash(muz, ev.w === 'sniper' ? 1.5 : 1);
      }
      const dist = Math.hypot(o.x - here.x, o.z - here.z);
      sfx.shot(ev.w, Math.max(0.08, 1 - dist / 70), Math.max(-1, Math.min(1, (o.x - here.x) / 30)) * 0.4);
      const endP = { x: o.x + d.x * ev.l, y: o.y + d.y * ev.l, z: o.z + d.z * ev.l };
      if (!ev.h?.length) sim.r?.impact(endP, 'ground', 5);
      for (const [victim, dmg, head] of ev.h || []) {
        if (victim !== me.id) { const v = sim.remotes.get(victim); if (v) sim.r?.impact({ x: v.x, y: v.y + 1.1, z: v.z }, 'flesh', 6); continue; }
        takeHit(dmg, id, ev.w, head);
      }
    }
    for (const ev of snap.dw || []) {
      if (sim.dw.has(ev.key) || sim.seen.has(`${id}:w${ev.key}`)) continue;
      sim.seen.add(`${id}:w${ev.key}`);
      sim.dw.set(ev.key, { w: ev.w, r: ev.r, mag: ev.mg, x: ev.x, y: ev.y, z: ev.z });
    }
  }

  const tracerOpts = (w) => (w === 'sniper' ? { color: 0x9fe8ff, width: 0.06, seg: 22 } : { color: 0xffe9a0, width: 0.035 });

  function takeHit(dmg, by, weapon, head) {
    const p = sim.local;
    const now = serverNow();
    if (!p || p.dead || now < p.safeUntil || now * 1000 < roomRef.current.match.startsAt) return;
    hurt(p, dmg, by, weapon, now);
    p.lastHead = Boolean(head);
    sim.r?.bump(0.12);
    sfx.hurt();
    sim.hurtFlash = 1;
  }

  // ─── Aparecer ──────────────────────────────────────────────────────────────
  // En el lugar del mapa más lejos de los demás (con un poco de azar, para no salir siempre en el mismo).
  function spawn(first) {
    const def = mapById(sim.map);
    const others = [...sim.remotes.values()].filter((r) => !r.snap.dd);
    const scored = def.spawns.map(([x, z]) => ({ x, z, d: others.length ? Math.min(...others.map((o) => Math.hypot(o.x - x, o.z - z))) : Math.random() * 10 }));
    scored.sort((a, b) => b.d - a.d);
    const sp = scored[Math.floor(Math.random() * Math.min(2, scored.length))];
    const p = newPlayer(sp.x, FLOOR, sp.z, Math.atan2(sp.x, sp.z));
    p.inv[1] = { w: 'pistol', r: 0, mag: magOf({ w: 'pistol', r: 0 }) };
    p.sel = 1;
    p.safeUntil = serverNow() + (first ? 0 : SPAWN_SAFE_S);
    p.respawnAt = 0;
    sim.local = p;
  }

  sim.toast = (text) => { sim.toastText = text; sim.toastAt = performance.now(); };

  function lootList(nowMs) {
    const m = roomRef.current.match;
    const list = [];
    for (const g of sim.guns) if (gunReady(m.took, g.key, nowMs)) list.push({ key: g.key, kind: g.w, r: g.r, mag: magOf({ w: g.w, r: g.r }), n: 1, x: g.x, y: g.y, z: g.z });
    for (const [key, d] of sim.dw) if (!m.took?.[key]) list.push({ key, kind: d.w, r: d.r, mag: d.mag, n: 1, x: d.x, y: d.y, z: d.z });
    return list;
  }

  function dropWeapon(entry, x, z) {
    const key = `w${++sim.dropN}.${Math.floor(Math.random() * 9)}`;
    const item = { key, w: entry.w, r: entry.r || 0, mg: entry.mag, x: r1(x), y: r2(floorAt(sim.world, x, z, sim.local.y + 1)), z: r1(z), t: serverNow() };
    sim.myDw.push(item);
    sim.dw.set(key, { w: item.w, r: item.r, mag: item.mg, x: item.x, y: item.y, z: item.z });
  }

  function tryPickup(it) {
    const p = sim.local;
    if (sim.pending.has(it.key)) return;
    if (pickAction(p, it) === 'full') return;
    sim.pending.add(it.key);
    dispatchRef.current({ type: 'take', match: sim.n, key: it.key }).then((res) => {
      sim.pending.delete(it.key);
      const took = res?.room?.match?.took?.[it.key];
      if (!res?.committed || !took) return;
      const out = pickUp(p, it);
      if (!out) return;
      sfx.pickup();
      sim.toast(`+ ${out.name}`);
      if (out.dropped) dropWeapon(out.dropped, p.x + 0.8, p.z + 0.8);
    });
  }

  // ─── Un paso de la partida ─────────────────────────────────────────────────
  function step(now) {
    const r = roomRef.current;
    const m = r.match;
    const p = sim.local;
    if (!m || !p || r.phase !== 'playing') return;
    if (p.dead) { if (now >= p.respawnAt) { spawn(false); sfx.count(0); } return; }
    const started = now * 1000 >= m.startsAt;
    const input = started ? sim.input : { ...sim.input, f: false, b: false, l: false, r: false, jump: false };
    stepGround(p, input, STEP, sim.world);
    finishReload(p, now);
    if (sim.reload) { if (startReload(p, now)) sfx.reload(); sim.reload = false; }
    const gun = held(p);
    if (gun && started) {
      const auto = WEAPONS[gun.w].auto;
      if ((sim.input.fire && (auto || sim.edges.fire)) || (p.burstLeft > 0 && now >= p.burstAt)) tryFire(now);
    }
    sim.edges.fire = false;
    if (p.hp <= 0) die(now);
    interact();
  }

  function die(now) {
    const p = sim.local;
    p.hp = 0; p.dead = true; p.respawnAt = now + RESPAWN_S;
    const by = p.lastBy && now - p.lastHitAt < LAST_HIT_S ? p.lastBy : null;
    // Suelta las armas que levantó (la pistola no: todos arrancan con una).
    for (let i = 1; i < SLOTS; i++) { const g = p.inv[i]; if (g && g.w !== 'pistol') dropWeapon(g, p.x + Math.cos(i * 1.6) * 1.1, p.z + Math.sin(i * 1.6) * 1.1); }
    dispatchRef.current({ type: 'died', match: sim.n, by, w: by ? p.lastW : null, h: by && p.lastHead ? 1 : 0 });
    sim.killer = by;
    sfx.lose();
  }

  const eye = (p) => ({ x: p.x, y: p.y + EYE_H, z: p.z });

  function tryFire(now) {
    const p = sim.local;
    const gun = held(p);
    if (!canShoot(p, now)) {
      if (gun && !WEAPONS[gun.w].melee && gun.mag <= 0 && !p.reloadUntil) { if (startReload(p, now)) sfx.reload(); else sfx.click(); }
      return;
    }
    const st = statsOf(gun);
    const wp = WEAPONS[gun.w];
    if (!wp.melee) gun.mag -= 1;
    p.nextShot = now + st.rate;
    if (wp.burst) { if (p.burstLeft <= 0) p.burstLeft = wp.burst; p.burstLeft -= 1; p.burstAt = now + st.burstGap; if (p.burstLeft <= 0) p.nextShot = now + st.rate; else p.nextShot = now; }
    const k = ++sim.k;
    const o = eye(p);
    const d = lookDir(p.yaw, p.pitch);
    const scoped = sim.aim && wp.scope;
    // Moverse, saltar y tirar sin apuntar desvía las balas (como en los shooters tácticos); quieto y con la mira, van derecho.
    const mul = wp.melee ? 1 : (p.sprinting ? 2.4 : p.moving ? 1.5 : 1) * (p.grounded ? 1 : 3) * (scoped ? 0.15 : sim.aim ? 0.55 : 1) * (wp.scope && !scoped ? 8 : 1);
    const res = resolveShot(sim.world, o, d, gun, targetsFor(), mul, k);
    if (wp.melee) sim.swingAt = performance.now() / 1000;
    const ev = { k, t: serverNow(), w: gun.w, r: gun.r, o: [r2(o.x), r2(o.y), r2(o.z)], d: [r2(d.x), r2(d.y), r2(d.z)], sd: k, l: r1(res.len), pl: res.st.pellets, sp: r2(res.st.spread * mul * 100) / 100 };
    if (res.hits.length) ev.h = res.hits.map((h) => [h.id, Math.round(h.dmg), h.head ? 1 : 0]);
    sim.myShots.push(ev);
    const muz = sim.r?.viewMuzzle() || o;
    if (!wp.melee) {
      for (const dir of res.dirs.slice(0, 5)) sim.r?.tracer(muz, { x: o.x + dir.x * res.len, y: o.y + dir.y * res.len, z: o.z + dir.z * res.len }, tracerOpts(gun.w));
      sim.r?.muzzleFlash(muz, 0.6);
      sfx.shot(gun.w);
      // Retroceso: la mira sube un poco y se mueve de costado.
      p.pitch = Math.min(1.3, p.pitch + (wp.kick || 0) * 0.55);
      p.yaw += (Math.random() - 0.5) * (wp.kick || 0) * 0.4;
      sim.recoil = 1;
    } else sfx.shot('pickaxe');
    const endP = { x: o.x + d.x * res.len, y: o.y + d.y * res.len, z: o.z + d.z * res.len };
    if (!res.hits.length && res.len < res.st.range - 1) sim.r?.impact(endP, 'ground', wp.melee ? 4 : 5);
    for (const h of res.hits) {
      const rem = sim.remotes.get(h.id);
      sim.hits += 1; sim.hitHead = h.head;
      sfx.hit(h.head);
      if (rem) { sim.r?.impact({ x: rem.x, y: rem.y + 1.2, z: rem.z }, 'flesh', 8); sim.floaters.push({ x: rem.x, y: rem.y + 2.1, z: rem.z, text: String(Math.round(h.dmg)), head: h.head, age: 0 }); }
    }
  }

  const targetsFor = () => {
    const out = [];
    for (const pl of inGame(roomRef.current)) {
      const rem = sim.remotes.get(pl.id);
      if (pl.id !== me.id && rem && !rem.snap.dd && !rem.snap.sf) out.push({ id: pl.id, x: rem.x, y: rem.y, z: rem.z });
    }
    return out;
  };

  // E: agarrar el arma que tengas cerca (si la mano está llena, cambia la que tenés en la mano).
  function interact() {
    const p = sim.local;
    sim.prompt = null;
    let item = null, bd = PICK_RANGE;
    for (const it of sim.lootCache || []) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < bd && Math.abs(it.y - p.y) < 2) { item = it; bd = d; }
    }
    if (item) {
      const wname = `${WEAPONS[item.kind].name}${item.r ? ` ${RARITIES[item.r].name.toLowerCase()}` : ''}`;
      const how = pickAction(p, item);
      sim.prompt = { text: how === 'swap' ? `E · Cambiar por ${wname}` : `E · Agarrar ${wname}`, color: RARITIES[item.r || 0].color };
      if (sim.edges.use) tryPickup(item);
    }
    sim.edges.use = false;
  }

  // ─── Un cuadro ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let last = performance.now() / 1000, acc = 0, hudAt = 0, countSeen = -1, bob = 0;

    function frame({ hidden } = {}) {
      const now = serverNow();
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - last);
      last = t;
      const r = roomRef.current;
      const m = r.match;
      if (!m || sim.n !== m.n) return;
      const p = sim.local;
      if (!p || !sim.world) return;
      if (sim.r && sim.rWorld !== sim.world) { sim.r.setWorld(sim.world); sim.rWorld = sim.world; sim.r.resize(); }
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 8) { step(now - acc + STEP); acc -= STEP; }
      if (acc > 1) acc = 0;
      sim.lootCache = lootList(now * 1000);
      for (const key of sim.dw.keys()) if (m.took?.[key]) sim.dw.delete(key);

      // Se acabó el tiempo: cualquier pantalla lo avisa (una vez por segundo como mucho).
      if (r.phase === 'playing' && now * 1000 >= m.endsAt && t - sim.tickAt > 1) { sim.tickAt = t; dispatchRef.current({ type: 'tick', match: m.n }); }

      // Mandar la foto.
      if (now - sim.sentAt >= SEND_EVERY) {
        sim.sentAt = now;
        sim.myShots = sim.myShots.filter((e) => now - e.t < EVENT_KEEP);
        sim.myDw = sim.myDw.filter((e) => now - e.t < 6);
        const gun = held(p);
        const snap = {
          n: m.n, t: now, x: r2(p.x), y: r2(p.y), z: r2(p.z), yw: r2(p.yaw), pt: r2(p.pitch), hp: Math.round(p.hp),
          mv: p.moving ? 1 : 0, dd: p.dead ? 1 : 0, sf: now < p.safeUntil ? 1 : 0, w: gun?.w || '', r: gun?.r || 0,
          ...(sim.myShots.length ? { sh: sim.myShots } : {}), ...(sim.myDw.length ? { dw: sim.myDw } : {}),
        };
        sim.mesh?.broadcast(snap);
        const others = r.players.filter((pl) => pl.id !== me.id);
        const needServer = !sim.mesh || others.some((pl) => !sim.mesh.isOpen(pl.id));
        if (needServer && now - sim.serverAt >= SERVER_EVERY && sim.chan) { sim.serverAt = now; sim.chan.publish(me.id, JSON.stringify(snap)).catch(() => {}); }
      }

      // Los demás se acercan a su última foto.
      const kk = Math.min(1, dt * 16);
      for (const rem of sim.remotes.values()) {
        rem.x += (rem.snap.x - rem.x) * kk; rem.y += (rem.snap.y - rem.y) * kk; rem.z += (rem.snap.z - rem.z) * kk;
        let dy = rem.snap.yw - rem.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rem.yaw += dy * kk;
        rem.pitch += (rem.snap.pt - rem.pitch) * kk;
        const dts = rem.snap.t - rem.lt;
        if (dts > 0.02) { rem.speed += (Math.hypot(rem.snap.x - rem.lx, rem.snap.z - rem.lz) / dts - rem.speed) * 0.5; rem.lx = rem.snap.x; rem.lz = rem.snap.z; rem.lt = rem.snap.t; }
        if (now - rem.snap.t > 1) rem.speed = 0;
      }

      // Bajas nuevas: si maté a alguien, suena y avisa.
      const feed = m.feed || [];
      if (sim.lastFeed > feed.length) sim.lastFeed = 0;
      for (let i = sim.lastFeed; i < feed.length; i++) if (feed[i].by === me.id) { sfx.kill(); sim.toast(`${feed[i].h ? '💀 ¡A la cabeza! ' : ''}Eliminaste a ${findPlayer(r, feed[i].id)?.name || '¿?'}`); }
      sim.lastFeed = feed.length;
      const countdown = Math.ceil(m.startsAt / 1000 - now);
      if (countdown !== countSeen && countdown <= 3 && countdown >= 0) { countSeen = countdown; sfx.count(countdown); }

      const kind = held(p)?.w;
      const scoped = sim.aim && !p.dead && WEAPONS[kind]?.scope;
      // Muerto: la cámara sube un poco y mira hacia el que te mató.
      let camPos = eye(p), yaw = p.yaw, pitch = p.pitch;
      if (p.dead) {
        const kr = sim.killer && sim.remotes.get(sim.killer);
        camPos = { x: p.x, y: p.y + 3.2, z: p.z };
        if (kr) { yaw = Math.atan2(-(kr.x - p.x), -(kr.z - p.z)); pitch = Math.atan2(kr.y + 1.2 - camPos.y, Math.hypot(kr.x - p.x, kr.z - p.z)); } else pitch = -0.6;
      }
      if (p.moving && p.grounded && !p.dead) bob += dt * (p.sprinting ? 13 : 9);
      const fov = scoped ? 22 : sim.aim && !p.dead ? 60 : 76;

      if (!hidden && sim.r) {
        const rr = sim.r;
        for (const pl of r.players) {
          if (pl.id === me.id) { rr.setAvatar(pl.id, null); continue; }
          const rem = sim.remotes.get(pl.id);
          rr.setAvatar(pl.id, rem && pl.inGame && !rem.snap.dd ? { name: pl.name, color: COLORS[pl.color], skin: pl.color, tagColor: COLORS[pl.color], x: rem.x, y: rem.y, z: rem.z, yaw: rem.yaw, pitch: rem.pitch, mode: 'ground', moving: rem.speed > 0.6, speed: rem.speed, kind: rem.snap.w || undefined, r: rem.snap.r || 0, hp: rem.snap.hp, shield: 0, swing: Math.max(0, 1 - (t - rem.swing) / 0.3), dt } : null);
        }
        sim.recoil = Math.max(0, (sim.recoil || 0) - dt * 9);
        const reloadK = p.reloadUntil ? Math.sin(Math.min(1, 1 - (p.reloadUntil - now) / Math.max(0.1, statsOf(held(p) || { w: 'pistol' }).reload)) * Math.PI) : 0;
        rr.setViewModel(p.dead || scoped ? null : { kind, r: held(p)?.r || 0, recoil: sim.recoil, bob, moving: p.moving && p.grounded, reload: reloadK, swing: Math.max(0, 1 - (t - sim.swingAt) / 0.3) });
        rr.syncLoot(sim.lootCache);
        rr.draw({ pos: camPos, yaw, pitch, fov }, null, dt, { x: p.x, y: p.y, z: p.z });
        // Números de daño flotando.
        const box = floatRef.current;
        if (box) {
          while (box.children.length < sim.floaters.length) box.appendChild(document.createElement('span'));
          for (let i = 0; i < box.children.length; i++) {
            const f = sim.floaters[i], el = box.children[i];
            if (!f) { el.style.display = 'none'; continue; }
            f.age += dt; f.y += dt * 1.6;
            const sp = rr.project(f.x, f.y, f.z);
            el.style.display = sp.visible && f.age < 0.9 ? '' : 'none';
            el.textContent = f.text;
            el.className = f.head ? 'is-head' : '';
            el.style.transform = `translate(${sp.x}px, ${sp.y}px)`;
            el.style.opacity = String(Math.max(0, 1 - f.age / 0.9));
          }
          sim.floaters = sim.floaters.filter((f) => f.age < 0.9);
        }
      } else if (hidden) sim.floaters.length = 0;

      if (sim.hurtFlash > 0) sim.hurtFlash = Math.max(0, sim.hurtFlash - dt * 3);
      if (t - hudAt > 0.1) {
        hudAt = t;
        setHud({
          hp: Math.max(0, Math.ceil(p.hp)), inv: p.inv.map((g) => (g ? { w: g.w, r: g.r, mag: g.mag, max: g.w === 'pickaxe' ? 0 : magOf(g) } : null)), sel: p.sel,
          loading: !sim.r, count: Math.max(0, countdown), left: Math.max(0, m.endsAt / 1000 - now), reloading: now < p.reloadUntil, prompt: p.dead ? null : sim.prompt,
          scoped: Boolean(scoped), hit: sim.hits, hitHead: sim.hitHead, toast: performance.now() - sim.toastAt < 2600 ? sim.toastText : '', hurt: sim.hurtFlash || 0,
          locked: document.pointerLockElement === canvasRef.current, dead: p.dead, respawn: Math.max(0, Math.ceil(p.respawnAt - now)), safe: now < p.safeUntil, killer: sim.killer,
        });
      }
    }

    sim.frame = frame;
    const stop = everyFrame(frame);
    window.__fps = sim; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__fps === sim) delete window.__fps; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const isField = (t) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const down = (e) => {
      if (isField(e.target)) return;
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      const p = sim.local;
      let used = true;
      if (named) {
        if (!sim.input[named[0]] && named[0] === 'use') sim.edges.use = true;
        sim.input[named[0]] = true;
      } else if (e.code === 'Tab') setBoard(true);
      else if (!p) used = false;
      else if (e.code === 'KeyR') sim.reload = true;
      else if (e.code.startsWith('Digit') && +e.code[5] >= 1 && +e.code[5] <= SLOTS) { if (selectSlot(p, +e.code[5] - 1)) sfx.click(); }
      else if (e.code === 'KeyQ') { const s = p.inv.findIndex((g, i) => g && i !== p.sel && i > 0); if (s > 0 && selectSlot(p, s)) sfx.click(); }
      else used = false;
      if (used) e.preventDefault();
    };
    const up = (e) => {
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (named) sim.input[named[0]] = false;
      if (e.code === 'Tab') setBoard(false);
    };
    const move = (e) => {
      if (document.pointerLockElement !== canvas || !sim.local || sim.local.dead) return;
      const k = sim.aim ? (WEAPONS[held(sim.local)?.w]?.scope ? 0.3 : 0.7) : 1;
      sim.local.yaw -= e.movementX * SENS * k;
      sim.local.pitch = Math.max(-1.45, Math.min(1.45, sim.local.pitch - e.movementY * SENS * k));
    };
    const mdown = (e) => {
      if (document.pointerLockElement !== canvas) return;
      if (e.button === 0) { if (!sim.input.fire) sim.edges.fire = true; sim.input.fire = true; } else if (e.button === 2) sim.aim = true;
    };
    const mup = (e) => { if (e.button === 0) sim.input.fire = false; if (e.button === 2) sim.aim = false; };
    const wheel = (e) => {
      const p = sim.local;
      if (!p || document.pointerLockElement !== canvas) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      for (let i = 1; i <= SLOTS; i++) { const s = (p.sel + dir * i + SLOTS * 4) % SLOTS; if (p.inv[s]) { selectSlot(p, s); break; } }
    };
    const blur = () => { Object.keys(sim.input).forEach((k) => { sim.input[k] = false; }); sim.aim = false; setBoard(false); };
    const resize = () => sim.r?.resize();
    const ctxm = (e) => e.preventDefault();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousemove', move);
    window.addEventListener('mousedown', mdown);
    window.addEventListener('mouseup', mup);
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('blur', blur);
    window.addEventListener('resize', resize);
    canvas.addEventListener('contextmenu', ctxm);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('mousemove', move); window.removeEventListener('mousedown', mdown);
      window.removeEventListener('mouseup', mup); window.removeEventListener('wheel', wheel); window.removeEventListener('blur', blur); window.removeEventListener('resize', resize); canvas.removeEventListener('contextmenu', ctxm);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lock = () => { try { canvasRef.current?.requestPointerLock?.(); } catch {} };
  const toggleSound = () => { const next = !sound; setSound(next); setSoundState(next); };
  const mine = findPlayer(room, me.id);
  const feed = [...(match?.feed || [])].slice(-5).reverse();
  const nameOf = (id) => findPlayer(room, id)?.name || '¿?';
  const colorOf = (id) => COLORS[findPlayer(room, id)?.color ?? 9];
  const gun = hud.inv[hud.sel];
  const rank = ranking(room);
  const leader = rank[0];

  return (
    <div className={`r3-stage fps-stage${hud.scoped ? ' is-scoped' : ''}`} data-fps>
      <canvas ref={canvasRef} className="r3-canvas" data-fps-canvas onClick={lock} />
      <div className="r3-hurt" style={{ opacity: hud.hurt }} />
      {hud.scoped && <div className="r3-scope" />}
      {!hud.scoped && !hud.dead && <div className="r3-crosshair fps-cross" aria-hidden="true"><i /><i /><i /><i /></div>}
      {hud.hit > 0 && <div key={hud.hit} className={`r3-hitmark${hud.hitHead ? ' is-head' : ''}`} aria-hidden="true" />}
      <div className="r3-floaters" ref={floatRef} />

      <div className="r3-top">
        <span className="r3-pill fps-clock" data-clock>⏱ {fmt(hud.left)}</span>
        <span className="r3-pill" data-score>🎯 {mine?.kills || 0} · 💀 {mine?.deaths || 0}</span>
        {leader && <span className="r3-pill">👑 {leader.name} {leader.kills}/{match?.limit}</span>}
        <button type="button" className="r3-pill r3-btn" onClick={toggleSound} aria-label="Sonido">{sound ? '🔊' : '🔇'}</button>
      </div>
      <div className="r3-feed" data-feed>
        {feed.map((d, i) => <p key={`${d.id}-${i}`}>{d.by ? <><b style={{ color: colorOf(d.by) }}>{nameOf(d.by)}</b> {WEAPON_ICON[d.w] || '→'}{d.h ? ' 💀' : ''} <b style={{ color: colorOf(d.id) }}>{nameOf(d.id)}</b></> : <><b style={{ color: colorOf(d.id) }}>{nameOf(d.id)}</b> se murió solo</>}</p>)}
      </div>

      <div className="r3-bars fps-bars">
        <div className="r3-bar r3-hp" data-hp={hud.hp}><i style={{ width: `${hud.hp}%` }} /><span>✚ {hud.hp}</span></div>
      </div>
      {gun && <div className="fps-ammo" data-ammo>{gun.max > 0 ? <><b>{gun.mag}</b> / {gun.max}</> : <b>—</b>}<small>{WEAPONS[gun.w].name}{gun.r ? ` · ${RARITIES[gun.r].name}` : ''}</small></div>}
      <div className="r3-hotbar fps-hotbar" data-hotbar>
        {Array.from({ length: SLOTS }, (_, i) => {
          const g = hud.inv[i];
          if (!g) return null;
          return (
            <div key={i} className={`r3-slot${hud.sel === i ? ' is-sel' : ''}`} style={{ '--rc': RARITIES[g.r || 0].color }} data-slot={i}>
              <small>{i + 1}</small><span className="r3-ico">{WEAPON_ICON[g.w]}</span><em>{WEAPONS[g.w].name}</em>
            </div>
          );
        })}
      </div>

      {hud.reloading && gun && <div className="r3-reload"><span>Recargando…</span></div>}
      {hud.prompt && <div className="r3-prompt" style={{ color: hud.prompt.color }} data-prompt>{hud.prompt.text}</div>}
      {hud.toast && <div className="r3-toast">{hud.toast}</div>}
      {hud.safe && !hud.dead && <div className="r3-warn fps-safe">Protegido unos segundos…</div>}

      {hud.loading && <div className="r3-center">Cargando el mapa…</div>}
      {!hud.loading && hud.count > 0 && <div className="r3-center r3-count" data-count={hud.count}><small>{mapById(match?.map).name} · arranca en</small>{hud.count}</div>}
      {hud.dead && <div className="r3-center r3-dead" data-dead>{hud.killer ? `Te mató ${nameOf(hud.killer)}` : 'Te moriste'}<small>Volvés en {hud.respawn}…</small></div>}
      {!hud.loading && !hud.locked && !hud.dead && hud.count === 0 && (
        <button type="button" className="r3-center r3-lock" onClick={lock}>Hacé clic para jugar<small>WASD moverte · mouse apuntar · clic disparar · clic derecho apuntar · Espacio saltar · Shift correr · E agarrar · R recargar · 1–5 o Q armas · Tab tabla · Esc soltar el mouse</small></button>
      )}

      {board && (
        <div className="fps-board" data-board>
          <h3>{mapById(match?.map).name} · gana el primero a {match?.limit}</h3>
          <table className="r3-table">
            <thead><tr><th>#</th><th>Jugador</th><th>🎯</th><th>💀</th><th>Cabezas</th></tr></thead>
            <tbody>{rank.map((pl, i) => <tr key={pl.id} className={pl.id === me.id ? 'is-me' : ''}><td>{i + 1}</td><td><span className="r3-chip" style={{ background: COLORS[pl.color] }} /> {pl.name}</td><td><b>{pl.kills}</b></td><td>{pl.deaths}</td><td>{pl.heads}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
