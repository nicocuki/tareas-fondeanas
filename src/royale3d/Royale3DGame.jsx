// La partida de Royale 3D en tiempo real: dibujo con Three.js, teclado y mouse, HUD y la conexión con los demás.
//
// Mismo esquema que Pixel Royale: la sala (`game.js`) guarda lo de a una vez (quién murió, qué cofres se abrieron, qué se agarró
// del piso) y todo lo demás va en vivo, directo entre navegadores (WebRTC) o, si no se puede, por el servidor. Cada pantalla es
// dueña de su jugador: lo mueve, lleva su vida y avisa `died`.
//
// Quién decide cada cosa: **los tiros los juzga la pantalla de quien tira** (con lo que ve en su pantalla, así pegar se siente
// justo) y la de quien los recibe se resta la vida; lo que rompe cosas (tiros, explosiones) lo decide la del que tiró y viaja en
// la foto para que todas rompan lo mismo; las explosiones las decide la del dueño y cada pantalla calcula el daño de su jugador.
// Entre amigos alcanza; no es a prueba de trampas.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { BUS_SPEED, DROP_ALT, DROP_FALL, MAX_DROPS, PREGAME, STORM_PHASES, busAt, busRoute, chestOf, dropInfo, makeWorld, spawnPoint, stormAt, stormCenters } from './map.js';
import {
  BLASTS, BUILD_GAP, BUILD_KINDS, BUILD_KIND_BY_CODE, GRENADE_FUSE, GRENADE_GAP, ITEMS, ITEM_LIST, LAUNCHER_FUSE, MAX_WOOD, OPEN_RANGE, OPEN_TIME, PICK_RANGE, RARITIES, SLOTS, STEP, WEAPONS,
  WOOD_BREAK, WOOD_HIT, aimPoint, aimShot, blastOn, blastSolids, boardBus, buildProblem, cameraFor, canShoot, finishCast, finishReload, floorAt, grenadeFor, groundItems, held, hurt, jumpOff,
  lookDir, magOf, newPlayer, openGlider, pelletDirs, pickAction, pickUp, pieceAt, pieceFor, placePiece, resolveShot, rocketFor, selectSlot, startCast, startReload, statsOf, stepAir,
  stepGrenade, stepGround, stepRocket,
} from './sim.js';
import * as SIM from './sim.js';
import { sfx, setSound, soundOn } from './sfx.js';
import { COLORS, alive as alivePlayers, findPlayer, stormSpeed } from './game.js';

const SEND_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 15;
const EVENT_KEEP = 1.6;     // segundos que un evento sigue viajando en las fotos (así una pantalla que se atrasa igual los recibe)
const GONE_AFTER = 12;      // sin fotos de alguien, el anfitrión lo da por muerto
const LAST_HIT_S = 8;       // cuánto tiempo después de un golpe cuenta como «lo mató»
const SENS = 0.0022;
const KEYS = { f: ['KeyW', 'ArrowUp'], b: ['KeyS', 'ArrowDown'], l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'], use: ['KeyE'] };
const MODE_CODE = { ground: 0, bus: 1, fall: 2, glide: 3 };
const MODE_NAME = ['ground', 'bus', 'fall', 'glide'];
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;
const WEAPON_ICON = { pickaxe: '⛏️', pistol: '🔫', revolver: '🔫', smg: '🔫', shotgun: '💥', rifle: '🔫', burst: '🎯', sniper: '🎯', bazooka: '🚀', launcher: '💣', minigun: '⚙️' };
const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export default function Royale3DGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const bigRef = useRef(null);
  const floatRef = useRef(null);
  const roomRef = useRef(room);
  const dispatchRef = useRef(onDispatch);
  const offsetRef = useRef(offset);
  roomRef.current = room;
  dispatchRef.current = onDispatch;
  offsetRef.current = offset;
  const match = room.match;
  const [sound, setSoundState] = useState(soundOn());
  const [bigMap, setBigMap] = useState(false);
  const [hud, setHud] = useState({ hp: 100, shield: 0, inv: [], sel: 0, items: {}, wood: 0, loading: true, mode: 'ground', count: 0, storm: null, prompt: null, cast: null, toast: '', hurt: 0, lobby: true });
  const sim = useRef({
    input: { f: false, b: false, l: false, r: false, jump: false, sprint: false, use: false, fire: false }, edges: { jump: false, fire: false, use: false },
    aim: false, reload: false, remotes: new Map(), seen: new Set(), lastSeen: new Map(), goneSent: new Set(), hits: 0, k: 0, dropN: 0,
    myShots: [], myRk: [], myGr: [], myEx: [], myBd: [], myDw: [], dw: new Map(), rockets: new Map(), grenades: new Map(), floaters: [], pending: new Set(),
    sentAt: 0, serverAt: 0, watch: null, groundCache: new Map(), dropCache: new Map(), scene: null, toastAt: 0, announced: new Set(), opening: null, swingAt: -9, kickPitch: 0,
  }).current;
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;
  const matchN = match?.n;

  // ─── Cargar el dibujo ──────────────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    import('./render.js').then((mod) => {
      if (dead || !canvasRef.current) return;
      sim.mod = mod;
      sim.r = mod.createRenderer(canvasRef.current);
      sim.rWorld = null;
      setHud((h) => ({ ...h, loading: false }));
    });
    return () => { dead = true; sim.r?.dispose(); sim.r = null; sim.mod = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Qué partida es esta ───────────────────────────────────────────────────
  useEffect(() => {
    const m = roomRef.current.match;
    if (!m) return;
    Object.assign(sim, {
      n: m.n, seed: m.seed, scene: null, world: null, local: null, route: busRoute(m.seed), centers: stormCenters(m.seed), remotes: new Map(), seen: new Set(), lastSeen: new Map(),
      goneSent: new Set(), hits: 0, myShots: [], myRk: [], myGr: [], myEx: [], myBd: [], myDw: [], dw: new Map(), rockets: new Map(), grenades: new Map(), floaters: [], pending: new Set(),
      groundCache: new Map(), dropCache: new Map(), announced: new Set(), opening: null, mountedAt: performance.now() / 1000, watch: null, lastDeaths: 0, outside: false, wasShrinking: false,
    });
  }, [matchN]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Red ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.royale3dChannel(code);
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== sim.n || !sim.local || snap.ph !== (sim.scene === 'lobby' ? 0 : 1)) return;
      applyRemote(id, snap);
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    sim.mesh = mesh;
    sim.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); sim.mesh = null; sim.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lo que llega de otra pantalla: su posición y los eventos de las últimas fotos.
  function applyRemote(id, snap) {
    const prev = sim.remotes.get(id);
    sim.lastSeen.set(id, performance.now() / 1000);
    const now = serverNow();
    if (!prev || snap.t > prev.snap.t) {
      const jump = !prev || Math.hypot(snap.x - prev.x, snap.z - prev.z) > 12 || Math.abs(snap.y - prev.y) > 12;
      sim.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, z: jump ? snap.z : prev.z, yaw: jump ? snap.yw : prev.yaw, pitch: snap.pt, speed: prev?.speed || 0, lx: prev?.lx ?? snap.x, lz: prev?.lz ?? snap.z, lt: prev?.lt ?? snap.t, swing: prev?.swing || -9 });
    }
    // Cada evento se cuenta una sola vez (por su número). No se mira cuántos segundos tiene: con las horas de dos pantallas que no coinciden
    // (o una compu lenta que lee las fotos tarde) se perdían tiros. Lo que trae la primera foto de alguien es de antes de que lo viéramos: no cuenta.
    const fresh = Boolean(prev);
    const first = (tag, ev) => { const key = `${id}:${tag}${ev.k}`; if (sim.seen.has(key)) return false; sim.seen.add(key); return fresh; };
    const rem = sim.remotes.get(id);
    const here = sim.local;
    const dist = (x, z) => Math.hypot(x - here.x, z - here.z);
    const vol = (d) => Math.max(0.05, 1 - d / 150);
    for (const ev of snap.sh || []) {
      if (!first('s', ev)) continue;
      const o = { x: ev.o[0], y: ev.o[1], z: ev.o[2] };
      const d = { x: ev.d[0], y: ev.d[1], z: ev.d[2] };
      if (ev.w === 'pickaxe') rem.swing = performance.now() / 1000;
      const muz = sim.r?.muzzleOf(id) || o;
      const dirs = ev.w === 'pickaxe' ? [d] : pelletDirs(d, Math.min(ev.pl || 1, 5), (ev.sp || 0), ev.sd | 0);
      for (const dir of dirs) sim.r?.tracer(muz, { x: o.x + dir.x * ev.l, y: o.y + dir.y * ev.l, z: o.z + dir.z * ev.l }, tracerOpts(ev.w, ev.r));
      sim.r?.muzzleFlash(muz, ev.w === 'sniper' ? 1.5 : 1);
      sfx.shot(ev.w, vol(dist(o.x, o.z)), Math.max(-1, Math.min(1, (o.x - here.x) / 60)) * 0.4);
      const endP = { x: o.x + d.x * ev.l, y: o.y + d.y * ev.l, z: o.z + d.z * ev.l };
      for (const [sid, dmg] of ev.s || []) { const sol = sim.world.byId.get(sid); sim.r?.impact(endP, sol?.mat || 'ground', 5); sim.world.damage(sid, dmg); }
      if (!ev.s?.length && !ev.h?.length) sim.r?.impact(endP, endP.y < 0.1 ? 'water' : 'ground', 5);
      // Si el tiro me da a mí, me resto la vida.
      for (const [victim, dmg, head] of ev.h || []) {
        if (victim !== me.id) { const v = sim.remotes.get(victim); if (v) sim.r?.impact({ x: v.x, y: v.y + 1.1, z: v.z }, 'flesh', 6); continue; }
        takeHit(dmg, id, ev.w, head);
      }
    }
    for (const ev of snap.rk || []) {
      if (!first('r', ev)) continue;
      sim.rockets.set(`${id}:${ev.k}`, rocketFor(ev, id));
      sim.r?.muzzleFlash(sim.r?.muzzleOf(id) || { x: ev.o[0], y: ev.o[1], z: ev.o[2] }, 1.6);
      sfx.shot('bazooka', vol(dist(ev.o[0], ev.o[2])));
    }
    for (const ev of snap.gr || []) {
      if (!first('g', ev)) continue;
      sim.grenades.set(`${id}:${ev.k}`, grenadeFor(ev, id));
      if (ev.w === 'launcher') sfx.shot('launcher', vol(dist(ev.o[0], ev.o[2])));
    }
    for (const ev of snap.ex || []) {
      if (!first('x', ev)) continue;
      sim.rockets.delete(`${id}:${ev.k}`); sim.grenades.delete(`${id}:${ev.k}`);
      blast(ev, id, false);
    }
    for (const ev of snap.bd || []) {
      if (!first('b', ev)) continue;
      const piece = pieceAt(sim.world, BUILD_KIND_BY_CODE[ev.c], ev.x, ev.z, ev.e, ev.l, ev.a);
      if (!sim.world.byId.has(piece.key) || sim.world.byId.get(piece.key).dead) { const s = placePiece(sim.world, piece); sim.r?.addSolid(s); sfx.build(); }
    }
    for (const ev of snap.dw || []) {
      if (sim.dw.has(ev.key) || sim.seen.has(`${id}:w${ev.key}`)) continue;
      sim.seen.add(`${id}:w${ev.key}`);
      sim.dw.set(ev.key, { w: ev.w, r: ev.r, mag: ev.mg, x: ev.x, y: ev.y, z: ev.z });
    }
    void rem;
  }

  const tracerOpts = (w, r) => (w === 'sniper' ? { color: 0x9fe8ff, width: 0.08, seg: 22 } : w === 'minigun' ? { color: 0xffb04a, width: 0.06 } : w === 'pickaxe' ? { color: 0xffffff, width: 0.01, seg: 0.3 } : { color: r >= 3 ? (r === 4 ? 0xffd27a : 0xe2b0ff) : 0xffe9a0, width: 0.045 });

  // Me pegaron: el escudo se gasta primero y se corta lo que estaba haciendo. Los tiros solo valen en el suelo y con la partida en marcha.
  function takeHit(dmg, by, weapon, head = false) {
    const p = sim.local;
    const m = roomRef.current.match;
    if (!p || p.dead || p.mode !== 'ground' || sim.scene === 'lobby' || serverNow() * 1000 < m.startsAt) return;
    hurt(p, dmg, by, weapon, serverNow());
    sim.r?.bump(0.18);
    sfx.hurt();
    sim.hurtFlash = 1;
    sim.hurtDir = by;
    void head;
  }

  // Una explosión (de un cohete o una granada): efectos, daño a mi jugador y a los sólidos. `owner` = esta pantalla la decidió.
  function blast(ev, by, owner) {
    const pos = { x: ev.x, y: ev.y, z: ev.z };
    const b = BLASTS[ev.w];
    sim.r?.explosion(pos, b.r);
    const d = Math.hypot(ev.x - sim.local.x, ev.z - sim.local.z);
    sfx.explosion(Math.max(0.15, 1 - d / 140), Math.max(-1, Math.min(1, (ev.x - sim.local.x) / 60)) * 0.5);
    const p = sim.local;
    const m = roomRef.current.match;
    if (p && !p.dead && p.mode === 'ground' && sim.scene !== 'lobby' && serverNow() * 1000 >= m.startsAt) {
      const res = blastOn(p, ev);
      if (res) {
        const dmg = by === me.id ? Math.round(res.damage * 0.55) : res.damage;
        hurt(p, dmg, by === me.id ? null : by, ev.w === 'launcher' ? 'launcher' : 'bazooka', serverNow());
        p.knock.x += res.vx; p.knock.z += res.vz; p.knock.y += res.vy * 3; p.grounded = false; p.vy = Math.max(p.vy, res.vy * 0.6);
        sim.r?.bump(0.5); sfx.hurt(); sim.hurtFlash = 1; sim.hurtDir = by;
      }
    }
    for (const [sid, dmg] of ev.dg || []) damageSolid(sid, dmg, owner, false);
  }

  // Daño a un sólido (árbol, caja, pared, lo construido). El que lo rompe se lleva la madera.
  function damageSolid(id, dmg, owner, pickaxe) {
    const res = sim.world.damage(id, dmg);
    if (!res || !owner) return res;
    const mat = res.s.mat;
    if (res.broken) { sim.local.wood = Math.min(MAX_WOOD, sim.local.wood + (WOOD_BREAK[mat] ?? 6)); sfx.breakWood(); } else if (pickaxe && WOOD_BREAK[mat] != null) { sim.local.wood = Math.min(MAX_WOOD, sim.local.wood + WOOD_HIT); sfx.chop(); }
    return res;
  }

  // ─── Cosas del piso ────────────────────────────────────────────────────────
  const speedOf = (m) => stormSpeed({ match: m, options: roomRef.current.options });
  function chestItems(i, ch) {
    let list = sim.groundCache.get(i);
    if (!list) { list = groundItems(sim.seed, ch); sim.groundCache.set(i, list); }
    return list;
  }
  function lootList() {
    const m = roomRef.current.match;
    const list = [];
    for (const key of Object.keys(m.loot || {})) {
      const i = Number(key);
      const ch = chestOf(sim.world, i, speedOf(m));
      if (!ch) continue;
      for (const it of chestItems(i, ch)) if (!m.took?.[it.key]) list.push(it);
    }
    for (const [key, d] of sim.dw) if (!m.took?.[key]) list.push({ key, kind: d.w, r: d.r, mag: d.mag, n: 1, x: d.x, y: d.y, z: d.z });
    return list;
  }
  function dropsView(now) {
    const m = roomRef.current.match;
    const sp = speedOf(m), out = [];
    for (let n = 0; n < MAX_DROPS; n++) {
      let info = sim.dropCache.get(n);
      if (!info) { info = dropInfo(sim.world, n, sp); sim.dropCache.set(n, info); }
      const land = m.startsAt / 1000 + PREGAME + info.at;
      const start = land - DROP_FALL;
      if (now < start - 8) break;
      if (now < start && !sim.announced.has(n)) { sim.announced.add(n); sim.toast('📦 ¡Viene un cofre del cielo! Mirá el mapa'); sfx.drop(); }
      if (now < start) continue;
      const altitude = now < land ? DROP_ALT * ((land - now) / DROP_FALL) : 0;
      out.push({ ...info, y: info.y + altitude, ground: info.y, landed: now >= land, open: Boolean(m.loot?.[info.i]) });
    }
    return out;
  }
  sim.toast = (text) => { sim.toastText = text; sim.toastAt = performance.now(); };

  function dropWeapon(entry, x, z) {
    const p = sim.local;
    const key = `w${++sim.dropN}.${Math.floor(Math.random() * 9)}`;
    const ang = Math.random() * Math.PI * 2;
    const px = x ?? p.x + Math.cos(ang) * 1.2, pz = z ?? p.z + Math.sin(ang) * 1.2;
    const item = { key, w: entry.w, r: entry.r || 0, mg: entry.mag, x: r1(px), y: r2(floorAt(sim.world, px, pz, p.y + 2)), z: r1(pz), t: serverNow() };
    sim.myDw.push(item);
    sim.dw.set(key, { w: item.w, r: item.r, mag: item.mg, x: item.x, y: item.y, z: item.z });
  }

  function tryPickup(it) {
    const p = sim.local;
    if (sim.pending.has(it.key)) return;
    const how = pickAction(p, it);
    if (how === 'full') { sim.toast('No tenés lugar: soltá o cambiá un arma'); return; }
    sim.pending.add(it.key);
    dispatchRef.current({ type: 'take', match: sim.n, key: it.key }).then((res) => {
      sim.pending.delete(it.key);
      if (!(res?.committed && res.room?.match?.took?.[it.key] === me.id)) return;
      const out = pickUp(p, it);
      if (!out) return;
      sfx.pickup();
      sim.toast(`+ ${out.name}`);
      if (out.dropped) dropWeapon(out.dropped);
    });
  }

  // ─── Un paso de la partida ─────────────────────────────────────────────────
  // Se arma el mundo (la isla de espera o la isla de verdad) y al jugador que corresponde.
  function enterScene(kind) {
    const m = roomRef.current.match;
    sim.scene = kind;
    sim.world = makeWorld(m.seed, kind === 'lobby' ? 'lobby' : 'island');
    sim.rWorld = null;
    sim.rockets.clear(); sim.grenades.clear(); sim.remotes.clear();
    const index = Math.max(0, m.order.indexOf(me.id));
    if (kind === 'lobby') {
      const sp = spawnPoint(m.seed, index, m.size, sim.world);
      const p = newPlayer(sp.x, sim.world.height(sp.x, sp.z), sp.z, sp.yaw);
      p.inv[1] = { w: 'pistol', r: 0, mag: 99 }; p.sel = 1;
      sim.local = p;
    } else {
      const p = newPlayer(0, 0, 0, sim.route.yaw);
      p.pitch = -0.25;
      const t = serverNow() - m.startsAt / 1000;
      if (t < sim.route.len / BUS_SPEED) boardBus(p, busAt(sim.route, Math.max(0, t)));
      else { p.mode = 'fall'; p.x = (Math.random() - 0.5) * 120; p.z = (Math.random() - 0.5) * 120; p.y = 200; p.vy = -20; }
      sim.local = p;
    }
  }

  const aimOpts = () => ({ aim: sim.aim && sim.local.mode === 'ground', dist: sim.local.mode === 'bus' ? 34 : sim.local.mode === 'ground' ? 3.7 : 7.5 });

  function step(now) {
    const r = roomRef.current;
    const m = r.match;
    const p = sim.local;
    if (!m || !p || !sim.world || r.phase !== 'playing' || p.dead) return;
    const t = now - m.startsAt / 1000;
    const lobby = sim.scene === 'lobby';
    const input = sim.input;
    const e = sim.edges;
    if (!lobby) {
      if (p.mode === 'bus') {
        const bus = busAt(sim.route, t);
        boardBus(p, bus);
        if ((e.jump && t > 0.8) || bus.done) { jumpOff(p, bus, sim.route); sfx.jump(); }
        e.jump = false;
        return;
      }
      if (p.mode === 'fall' || p.mode === 'glide') {
        if (e.jump && p.mode === 'fall') { openGlider(p); sfx.glider(); }
        e.jump = false;
        if (stepAir(p, input, STEP, sim.world) === 'landed') { sfx.land(); selectSlot(p, 0); sim.toast('¡A buscar cofres! Mantené E cerca de uno'); }
        return;
      }
    }
    e.jump = false;
    stepGround(p, input, STEP, sim.world);
    finishReload(p, now);
    if (finishCast(p, now)) { sfx.heal(); }
    if (sim.reload) { if (startReload(p, now)) sfx.reload(); sim.reload = false; }
    // Disparar, picar o construir.
    const gun = held(p);
    if (p.build) {
      if (input.fire && now - p.buildAt >= BUILD_GAP) tryBuild(now);
    } else if (gun) {
      const auto = WEAPONS[gun.w].auto;
      if ((input.fire && (auto || e.fire)) || (p.burstLeft > 0 && now >= p.burstAt)) tryFire(now);
    }
    e.fire = false;
    // La tormenta.
    if (!lobby) {
      const sTime = t - PREGAME;
      const st = stormAt(m.seed, Math.max(0, sTime), speedOf(m), sim.centers);
      sim.outside = Math.hypot(p.x - st.x, p.z - st.z) > st.r && sTime >= 0;
      if (sim.outside) p.hp -= st.dps * STEP;
      if (st.shrinking && !sim.wasShrinking) { sfx.storm(); sim.toast('🌀 ¡La tormenta se está cerrando!'); }
      sim.wasShrinking = st.shrinking;
    }
    if (p.hp <= 0 && !lobby) die(now);
    interact(now);
    for (const [k, rk] of sim.rockets) {
      const targets = [];
      if (rk.by === me.id) for (const pl of alivePlayers(r)) { const rem = sim.remotes.get(pl.id); if (pl.id !== me.id && rem && rem.snap.am === 0) targets.push({ x: rem.x, y: rem.y, z: rem.z }); }
      const hit = stepRocket(rk, STEP, sim.world, targets);
      if (hit && rk.by === me.id) { sim.rockets.delete(k); explode(rk, hit, rk.k); } else if (hit) sim.rockets.delete(k);
    }
    for (const [k, g] of sim.grenades) {
      const targets = [];
      if (g.by === me.id) for (const pl of alivePlayers(r)) { const rem = sim.remotes.get(pl.id); if (pl.id !== me.id && rem && rem.snap.am === 0) targets.push({ x: rem.x, y: rem.y, z: rem.z }); }
      if (stepGrenade(g, STEP, sim.world, targets) && g.by === me.id) { sim.grenades.delete(k); explode(g, { x: g.x, y: g.y, z: g.z }, g.k); }
    }
  }

  // Esta pantalla decide dónde explota lo suyo: lo anota para que las demás hagan lo mismo.
  function explode(proj, pos, k) {
    const w = proj.w === 'bazooka' ? 'rocket' : proj.w === 'launcher' ? 'launcher' : 'grenade';
    const ev = { k, t: serverNow(), x: r2(pos.x), y: r2(pos.y), z: r2(pos.z), w };
    ev.dg = blastSolids(sim.world, ev).map((d) => [d.id, d.dmg]);
    sim.myEx.push(ev);
    blast(ev, me.id, true);
  }

  function die(now) {
    const p = sim.local;
    p.hp = 0; p.dead = true; p.cast = null;
    const by = p.lastBy && now - p.lastHitAt < LAST_HIT_S ? p.lastBy : null;
    // Suelta las armas que tenía.
    for (let i = 1; i < SLOTS; i++) if (p.inv[i]) dropWeapon(p.inv[i], p.x + Math.cos(i * 1.6) * 1.4, p.z + Math.sin(i * 1.6) * 1.4);
    dispatchRef.current({ type: 'died', match: sim.n, by, w: by ? p.lastW : 'storm' });
    sfx.lose();
    sim.r?.explosion({ x: p.x, y: p.y + 1, z: p.z }, 1.2);
  }

  function tryFire(now) {
    const p = sim.local;
    const gun = held(p);
    const lobby = sim.scene === 'lobby';
    if (!canShoot(p, now)) {
      if (gun && !WEAPONS[gun.w].melee && gun.mag <= 0 && !p.reloadUntil) { if (startReload(p, now)) sfx.reload(); else sfx.click(); }
      return;
    }
    const st = statsOf(gun);
    const wp = WEAPONS[gun.w];
    if (!wp.melee && !lobby) gun.mag -= 1;
    if (lobby) gun.mag = 99;
    p.nextShot = now + st.rate;
    if (wp.burst) { if (p.burstLeft <= 0) p.burstLeft = wp.burst; p.burstLeft -= 1; p.burstAt = now + st.burstGap; if (p.burstLeft <= 0) p.nextShot = now + st.rate; else p.nextShot = now; }
    const k = ++sim.k;
    const cam = aimOpts();
    if (wp.melee) {
      sim.swingAt = performance.now() / 1000;
      const { o, d } = aimShot(sim.world, p, cam);
      const res = resolveShot(sim.world, o, d, gun, targetsFor(), 1, k);
      finishShot(res, o, d, gun, k, p, true);
      return;
    }
    const { o, d } = aimShot(sim.world, p, cam);
    if (wp.rocket || wp.grenade) {
      const muz = sim.r?.muzzleOf(me.id) || o;
      if (wp.rocket) {
        const ev = { k, t: serverNow(), w: gun.w, o: [r2(muz.x), r2(muz.y), r2(muz.z)], d: [r2(d.x), r2(d.y), r2(d.z)] };
        sim.myRk.push(ev);
        sim.rockets.set(`${me.id}:${k}`, rocketFor(ev, me.id));
        sfx.shot('bazooka');
      } else {
        const sp = wp.speed;
        const ev = { k, t: serverNow(), w: 'launcher', o: [r2(muz.x), r2(muz.y), r2(muz.z)], v: [r2(d.x * sp), r2(d.y * sp + 3), r2(d.z * sp)], f: LAUNCHER_FUSE };
        sim.myGr.push(ev);
        sim.grenades.set(`${me.id}:${k}`, grenadeFor(ev, me.id));
        sfx.shot('launcher');
      }
      sim.r?.muzzleFlash(muz, 1.6);
      kick(p, wp.kick);
      return;
    }
    const mul = (p.sprinting ? 2 : p.moving ? 1.4 : 1) * (p.grounded ? 1 : 2.2) * (sim.aim ? 0.45 : 1);
    const res = resolveShot(sim.world, o, d, gun, targetsFor(), mul, k);
    finishShot(res, o, d, gun, k, p, false, mul);
    kick(p, wp.kick);
  }

  const targetsFor = () => {
    const out = [];
    if (sim.scene === 'lobby') return out;
    for (const pl of alivePlayers(roomRef.current)) {
      const rem = sim.remotes.get(pl.id);
      if (pl.id !== me.id && rem && rem.snap.am === 0 && !rem.snap.dd) out.push({ id: pl.id, x: rem.x, y: rem.y, z: rem.z });
    }
    return out;
  };

  function kick(p, amount) {
    sim.kickPitch += amount * 1.0;
    p.pitch = Math.min(1.25, p.pitch + amount * 0.6);
    p.yaw += (Math.random() - 0.5) * amount * 0.5;
    sim.r?.bump(Math.min(0.35, amount * 5));
    sim.recoil = 1;
  }

  // Se resolvió un tiro (o un golpe de pico): efectos, daño a sólidos y el evento para los demás.
  function finishShot(res, o, d, gun, k, p, melee, mul = 1) {
    const st = res.st;
    const muz = sim.r?.muzzleOf(me.id) || o;
    const ev = { k, t: serverNow(), w: gun.w, r: gun.r, o: [r2(o.x), r2(o.y), r2(o.z)], d: [r2(d.x), r2(d.y), r2(d.z)], sd: k, l: r1(res.len), pl: st.pellets, sp: r2(st.spread * mul * 100) / 100 };
    if (res.hits.length) ev.h = res.hits.map((h) => [h.id, h.dmg, h.head ? 1 : 0]);
    if (res.solids.length) ev.s = res.solids.map((s) => [s.id, s.dmg]);
    sim.myShots.push(ev);
    const endP = { x: o.x + d.x * res.len, y: o.y + d.y * res.len, z: o.z + d.z * res.len };
    if (!melee) {
      for (const dir of res.dirs.slice(0, 5)) sim.r?.tracer(muz, { x: o.x + dir.x * res.len, y: o.y + dir.y * res.len, z: o.z + dir.z * res.len }, tracerOpts(gun.w, gun.r));
      sim.r?.muzzleFlash(muz, gun.w === 'sniper' ? 1.5 : 1);
      sfx.shot(gun.w);
    } else sfx.shot('pickaxe');
    for (const s of res.solids) {
      const sol = sim.world.byId.get(s.id);
      sim.r?.impact(endP, sol?.mat || 'ground', melee ? 8 : 5);
      damageSolid(s.id, s.dmg, true, melee);
    }
    if (!res.solids.length && !res.hits.length && res.len < st.range - 1) sim.r?.impact(endP, endP.y < 0.1 ? 'water' : 'ground', melee ? 5 : 4);
    for (const h of res.hits) {
      const rem = sim.remotes.get(h.id);
      sim.hits += 1; sim.hitHead = h.head;
      sfx.hit(h.head);
      if (rem) { sim.r?.impact({ x: rem.x, y: rem.y + 1.2, z: rem.z }, 'flesh', 8); sim.floaters.push({ x: rem.x + (Math.random() - 0.5) * 0.6, y: rem.y + 2.1, z: rem.z, text: String(h.dmg), head: h.head, age: 0 }); }
    }
  }

  function tryBuild(now) {
    const p = sim.local;
    const piece = sim.piece;
    if (!piece || sim.pieceProblem) { if (sim.pieceProblem && now - (sim.warnAt || 0) > 0.8) { sim.warnAt = now; sim.toast(sim.pieceProblem); } return; }
    p.buildAt = now;
    p.wood -= BUILD_KINDS[piece.kind].cost;
    const s = placePiece(sim.world, piece);
    sim.r?.addSolid(s);
    sim.myBd.push({ k: ++sim.k, t: serverNow(), c: piece.code, x: piece.cx, z: piece.cz, e: piece.e, l: piece.lvl, a: r2(piece.anchor) });
    sfx.build();
  }

  function throwGrenade(now) {
    const p = sim.local;
    if (p.mode !== 'ground' || p.items.grenade <= 0 || now < p.grenadeAt || p.cast) return;
    p.items.grenade -= 1;
    p.grenadeAt = now + GRENADE_GAP;
    const { o, d } = aimShot(sim.world, p, aimOpts());
    const k = ++sim.k;
    const hand = sim.r?.handOf(me.id) || o;
    const ev = { k, t: serverNow(), w: 'grenade', o: [r2(hand.x), r2(hand.y), r2(hand.z)], v: [r2(d.x * 15), r2(d.y * 15 + 4.5), r2(d.z * 15)], f: GRENADE_FUSE };
    sim.myGr.push(ev);
    sim.grenades.set(`${me.id}:${k}`, grenadeFor(ev, me.id));
  }

  // E: agarrar lo que tengas cerca o (manteniendo apretado) abrir un cofre.
  function interact(now) {
    const p = sim.local;
    const m = roomRef.current.match;
    const lobby = sim.scene === 'lobby';
    sim.prompt = null;
    if (lobby || p.mode !== 'ground') { sim.opening = null; sim.edges.use = false; return; }
    // Lo más cercano del piso.
    let item = null, bd = PICK_RANGE;
    for (const it of sim.lootCache || []) {
      const d = Math.hypot(it.x - p.x, it.z - p.z);
      if (d < bd && Math.abs(it.y - p.y) < 2.4) { item = it; bd = d; }
    }
    let chest = null, cd = OPEN_RANGE;
    const consider = (ch) => { if (!ch || m.loot?.[ch.i]) return; const d = Math.hypot(ch.x - p.x, ch.z - p.z); if (d < cd && Math.abs(ch.y - p.y) < 2.4) { chest = ch; cd = d; } };
    for (const ch of sim.world.chests) consider(ch);
    for (const dr of sim.dropsCache || []) if (dr.landed) consider(dr);
    if (item) {
      const wname = WEAPONS[item.kind] ? `${WEAPONS[item.kind].name} ${RARITIES[item.r || 0].name.toLowerCase()}` : `${ITEMS[item.kind]?.name} x${item.n}`;
      const how = pickAction(p, item);
      sim.prompt = { text: how === 'swap' ? `E · Cambiar por ${wname}` : how === 'full' ? `${wname} (no entra)` : `E · Agarrar ${wname}`, color: WEAPONS[item.kind] ? RARITIES[item.r || 0].color : '#fff' };
      if (sim.edges.use) tryPickup(item);
    } else if (chest) {
      sim.prompt = { text: chest.drop ? 'Mantené E · Abrir cofre del cielo' : 'Mantené E · Abrir cofre', progress: 0 };
      if (sim.input.use) {
        if (!sim.opening || sim.opening.i !== chest.i) sim.opening = { i: chest.i, t0: now };
        const k = (now - sim.opening.t0) / OPEN_TIME;
        sim.prompt.progress = Math.min(1, k);
        if (k >= 1 && !sim.opening.sent) {
          sim.opening.sent = true;
          dispatchRef.current({ type: 'loot', match: sim.n, i: chest.i }).then((res) => { if (res?.committed && res.room?.match?.loot?.[chest.i] === me.id) { sfx.chest(); sim.toast(chest.drop ? '¡Cofre del cielo!' : '¡Cofre abierto!'); } });
        }
      } else sim.opening = null;
    } else sim.opening = null;
    sim.edges.use = false;
  }

  // ─── Un cuadro ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let last = performance.now() / 1000, acc = 0, hudAt = 0, miniAt = 0, countSeen = -1;

    function frame({ hidden } = {}) {
      const now = serverNow();
      const t = performance.now() / 1000;
      sim.frames = (sim.frames || 0) + 1;
      const dt = Math.min(0.1, t - last);
      // Si esta pantalla se trabó un rato (pestaña tapada, compu lenta), no hay que dar por muerto a nadie por no haber visto fotos mientras tanto.
      if (t - last > 1.5) for (const id of sim.lastSeen.keys()) sim.lastSeen.set(id, t);
      last = t;
      const r = roomRef.current;
      const m = r.match;
      if (!m || sim.n !== m.n) return;
      // La isla de espera hasta que sale el bus, y después la isla de verdad.
      const want = now * 1000 < m.startsAt ? 'lobby' : 'island';
      if (sim.scene !== want) { enterScene(want); acc = 0; }
      const p = sim.local;
      if (!p || !sim.world) return;
      if (sim.r && sim.rWorld !== sim.world) { sim.r.setWorld(sim.world); sim.rWorld = sim.world; sim.r.resize(); }
      acc += dt;
      let guard = 0;
      while (acc >= STEP && guard++ < 8) { step(now - acc + STEP); acc -= STEP; }
      if (acc > 1) acc = 0;
      sim.lootCache = sim.scene === 'island' ? lootList() : [];
      sim.dropsCache = sim.scene === 'island' ? dropsView(now) : [];
      const lobby = sim.scene === 'lobby';
      const sTime = now - m.startsAt / 1000 - PREGAME;
      const storm = lobby ? null : stormAt(m.seed, Math.max(0, sTime), speedOf(m), sim.centers);
      for (const [key, d] of sim.dw) if (m.took?.[key]) sim.dw.delete(key);

      // Piezas fantasma para construir.
      sim.piece = null; sim.pieceProblem = null;
      if (p.build && p.mode === 'ground' && !p.dead && sim.r) {
        const ap = aimPoint(sim.world, p, aimOpts());
        const dir = lookDir(p.yaw, p.pitch);
        const pt = ap.dist <= 12 ? ap.point : { x: ap.cam.x + dir.x * 12, y: ap.cam.y + dir.y * 12, z: ap.cam.z + dir.z * 12 };
        sim.piece = pieceFor(sim.world, p.build, pt, p, p.lvl);
        const others = [];
        for (const rem of sim.remotes.values()) others.push({ x: rem.x, y: rem.y, z: rem.z });
        sim.pieceProblem = buildProblem(sim.world, sim.piece, p, others);
      }
      sim.r?.ghost(sim.piece, !sim.pieceProblem);

      // Mandar la foto.
      if (now - sim.sentAt >= SEND_EVERY) {
        sim.sentAt = now;
        const fresh = (list) => list.filter((e) => now - e.t < EVENT_KEEP);
        sim.myShots = fresh(sim.myShots); sim.myRk = fresh(sim.myRk); sim.myGr = fresh(sim.myGr); sim.myEx = fresh(sim.myEx); sim.myBd = fresh(sim.myBd); sim.myDw = sim.myDw.filter((e) => now - e.t < 6);
        const gun = held(p);
        const snap = {
          n: m.n, ph: lobby ? 0 : 1, t: now, x: r2(p.x), y: r2(p.y), z: r2(p.z), yw: r2(p.yaw), pt: r2(p.pitch), hp: Math.round(p.hp), sd: Math.round(p.shield), am: MODE_CODE[p.mode] ?? 0,
          mv: p.moving ? 1 : 0, dd: p.dead ? 1 : 0, w: gun?.w || '', r: gun?.r || 0, cs: p.cast ? 1 : 0,
          ...(sim.myShots.length ? { sh: sim.myShots } : {}), ...(sim.myRk.length ? { rk: sim.myRk } : {}), ...(sim.myGr.length ? { gr: sim.myGr } : {}), ...(sim.myEx.length ? { ex: sim.myEx } : {}),
          ...(sim.myBd.length ? { bd: sim.myBd } : {}), ...(sim.myDw.length ? { dw: sim.myDw } : {}),
        };
        sim.mesh?.broadcast(snap);
        const others = r.players.filter((pl) => pl.id !== me.id);
        const needServer = !sim.mesh || others.some((pl) => !sim.mesh.isOpen(pl.id));
        if (needServer && now - sim.serverAt >= SERVER_EVERY && sim.chan) { sim.serverAt = now; sim.chan.publish(me.id, JSON.stringify(snap)).catch(() => {}); }
        // El anfitrión da por muerto al que dejó de mandar fotos (pestaña cerrada sin salir).
        if (r.hostId === me.id && r.phase === 'playing' && now > m.startsAt / 1000 + GONE_AFTER) {
          for (const pl of alivePlayers(r)) {
            if (pl.id === me.id || sim.goneSent.has(pl.id)) continue;
            if (t - (sim.lastSeen.get(pl.id) ?? sim.mountedAt) > GONE_AFTER) { sim.goneSent.add(pl.id); dispatchRef.current({ type: 'died', target: pl.id, match: m.n }); }
          }
        }
      }

      // Los demás se acercan a su última foto.
      const kk = Math.min(1, dt * 14);
      for (const rem of sim.remotes.values()) {
        rem.x += (rem.snap.x - rem.x) * kk; rem.y += (rem.snap.y - rem.y) * kk; rem.z += (rem.snap.z - rem.z) * kk;
        let dy = rem.snap.yw - rem.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rem.yaw += dy * kk;
        rem.pitch += (rem.snap.pt - rem.pitch) * kk;
        const dts = rem.snap.t - rem.lt;
        if (dts > 0.02) { rem.speed += (Math.hypot(rem.snap.x - rem.lx, rem.snap.z - rem.lz) / dts - rem.speed) * 0.5; rem.lx = rem.snap.x; rem.lz = rem.snap.z; rem.lt = rem.snap.t; }
        if (now - rem.snap.t > 1) rem.speed = 0;
      }

      // Bajas nuevas: si eliminé a alguien, suena y avisa.
      const deaths = m.deaths || [];
      for (let i = sim.lastDeaths; i < deaths.length; i++) if (deaths[i].by === me.id) { sfx.kill(); sim.toast(`Eliminaste a ${findPlayer(r, deaths[i].id)?.name || '¿?'} 🎯`); }
      sim.lastDeaths = deaths.length;
      const countdown = Math.ceil(m.startsAt / 1000 - now);
      if (lobby && countdown !== countSeen && countdown <= 5 && countdown >= 0) { countSeen = countdown; sfx.count(countdown); }

      // A quién sigue la cámara y desde dónde.
      let focus = p, camPlayer = p, mode = p.mode;
      if (p.dead) {
        const target = alivePlayers(r).find((pl) => pl.id === (sim.watch || '') && pl.id !== me.id) || alivePlayers(r).find((pl) => pl.id !== me.id);
        const rem = target && sim.remotes.get(target.id);
        if (rem) { sim.watch = target.id; camPlayer = { x: rem.x, y: rem.y, z: rem.z, yaw: rem.yaw, pitch: Math.max(-0.3, rem.pitch || 0) }; focus = camPlayer; mode = 'ground'; }
      }
      const kind = held(p)?.w;
      const scoped = sim.aim && !p.dead && p.mode === 'ground' && WEAPONS[kind]?.scope;
      const cam = cameraFor(sim.world, camPlayer, { ...aimOpts(), aim: sim.aim && mode === 'ground' && !p.dead });
      const fov = scoped ? 24 : sim.aim && mode === 'ground' && !p.dead ? 56 : p.sprinting ? 80 : mode === 'fall' ? 84 : 72;
      sim.camState = cam;

      if (!hidden && sim.r) {
        const rr = sim.r;
        rr.setBus(!lobby && sim.local && now - m.startsAt / 1000 < sim.route.len / BUS_SPEED + 4 ? { ...busAt(sim.route, now - m.startsAt / 1000), yaw: sim.route.yaw } : null);
        for (const pl of r.players) {
          if (pl.id === me.id) {
            rr.setAvatar(pl.id, { name: pl.name, color: COLORS[pl.color], skin: pl.color, tagColor: COLORS[pl.color], x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, mode: p.mode, moving: p.moving, speed: p.sprinting ? 8.4 : 5.6, kind: kind, r: held(p)?.r || 0, hp: p.hp, shield: p.shield, dead: p.dead, hidden: p.mode === 'bus', self: true, cast: Boolean(p.cast), recoil: sim.recoil, swing: Math.max(0, 1 - (t - sim.swingAt) / 0.3), dt });
            continue;
          }
          const rem = sim.remotes.get(pl.id);
          const am = rem?.snap.am ?? 0;
          rr.setAvatar(pl.id, rem && pl.alive && !rem.snap.dd ? { name: pl.name, color: COLORS[pl.color], skin: pl.color, tagColor: COLORS[pl.color], x: rem.x, y: rem.y, z: rem.z, yaw: rem.yaw, pitch: rem.pitch, mode: MODE_NAME[am] || 'ground', moving: rem.speed > 0.6, speed: rem.speed, kind: rem.snap.w || undefined, r: rem.snap.r || 0, hp: rem.snap.hp, shield: rem.snap.sd, hidden: am === 1, cast: Boolean(rem.snap.cs), swing: Math.max(0, 1 - (t - rem.swing) / 0.3), dt } : null);
        }
        sim.recoil = Math.max(0, (sim.recoil || 0) - dt * 8);
        rr.syncChests(sim.world.chests.map((c) => ({ ...c, open: Boolean(m.loot?.[c.i]) })));
        rr.syncLoot(sim.lootCache);
        rr.syncDrops(sim.dropsCache);
        const projs = [];
        for (const [k, rk] of sim.rockets) projs.push({ id: `r${k}`, kind: 'rocket', x: rk.x, y: rk.y, z: rk.z, vx: rk.vx, vy: rk.vy, vz: rk.vz });
        for (const [k, g] of sim.grenades) projs.push({ id: `g${k}`, kind: g.w === 'launcher' ? 'launcher' : 'grenade', x: g.x, y: g.y, z: g.z, spin: g.spin });
        rr.syncProjectiles(projs);
        rr.draw({ pos: cam.pos, yaw: camPlayer.yaw, pitch: camPlayer.pitch, fov }, storm ? { x: storm.x, z: storm.z, r: storm.r } : null, dt, { x: focus.x, y: focus.y, z: focus.z });
        // Números de daño flotando.
        const box = floatRef.current;
        if (box) {
          while (box.children.length < sim.floaters.length) { const s = document.createElement('span'); box.appendChild(s); }
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
      if (miniRef.current && t - miniAt > 0.12) { miniAt = t; drawMini(miniRef.current, sim, storm, p, now, m); }
      if (bigRef.current) drawBig(bigRef.current, sim, storm, p, now, m);

      if (t - hudAt > 0.1) {
        hudAt = t;
        const st = storm;
        setHud({
          hp: Math.max(0, Math.ceil(p.hp)), shield: Math.ceil(p.shield), inv: p.inv.map((g) => (g ? { w: g.w, r: g.r, mag: g.mag, max: g.w === 'pickaxe' ? 0 : magOf(g) } : null)), sel: p.sel, items: { ...p.items }, wood: p.wood, build: p.build, lvl: p.lvl,
          mode: p.mode, dead: p.dead, loading: !sim.r, lobby, count: Math.max(0, countdown), reloading: now < p.reloadUntil, reloadK: p.reloadUntil ? 1 - (p.reloadUntil - now) / Math.max(0.1, statsOf(held(p) || { w: 'pistol' }).reload) : 0,
          cast: p.cast ? { kind: p.cast.kind, k: (now - p.cast.from) / (p.cast.until - p.cast.from) } : null, prompt: sim.prompt, scoped: Boolean(scoped), hit: sim.hits, hitHead: sim.hitHead,
          toast: performance.now() - sim.toastAt < 2600 ? sim.toastText : '', hurt: sim.hurtFlash || 0, outside: Boolean(sim.outside && !p.dead), locked: document.pointerLockElement === canvasRef.current,
          storm: st ? { phase: st.phase, shrinking: st.shrinking, next: Math.ceil(st.next), final: st.phase >= STORM_PHASES.length, pre: sTime < 0, preLeft: Math.ceil(-sTime), dps: st.dps } : null,
          bus: !lobby && p.mode === 'bus' ? Math.max(0, Math.ceil((sim.route.len / BUS_SPEED) - (now - m.startsAt / 1000))) : -1,
          piece: sim.piece ? { kind: sim.piece.kind, ok: !sim.pieceProblem, why: sim.pieceProblem } : null,
          alt: p.mode === 'fall' || p.mode === 'glide' ? Math.round(p.y - floorAt(sim.world, p.x, p.z, p.y)) : 0, kills: findPlayer(r, me.id)?.kills || 0,
        });
      }
    }

    sim.frame = frame;
    sim.SIM = SIM; // para manejar la partida desde un navegador automatizado
    const stop = everyFrame(frame);
    window.__royale3d = sim; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__royale3d === sim) delete window.__royale3d; };
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
        if (!sim.input[named[0]] && named[0] === 'jump') sim.edges.jump = true;
        if (!sim.input[named[0]] && named[0] === 'use') sim.edges.use = true;
        sim.input[named[0]] = true;
      } else if (!p) used = false;
      else if (e.code === 'KeyR') sim.reload = true;
      else if (e.code.startsWith('Digit') && +e.code[5] >= 1 && +e.code[5] <= SLOTS) { if (selectSlot(p, +e.code[5] - 1)) sfx.click(); }
      else if (e.code === 'KeyQ' || e.code === 'KeyF' || e.code === 'KeyH' || e.code === 'KeyJ') {
        const kind = ITEM_LIST.find((k) => ITEMS[k].key === e.code.slice(3));
        if (kind && startCast(p, kind, serverNow())) { p.build = null; sfx.click(); }
      } else if (e.code === 'KeyG') { if (!e.repeat) throwGrenade(serverNow()); }
      else if (e.code === 'KeyZ' || e.code === 'KeyX' || e.code === 'KeyC') {
        const kind = e.code === 'KeyZ' ? 'wall' : e.code === 'KeyX' ? 'floor' : 'ramp';
        if (!e.repeat && p.mode === 'ground') { p.build = p.build === kind ? null : kind; sfx.click(); }
      } else if (e.code === 'KeyV') { if (!e.repeat) p.lvl = (p.lvl + 1) % 3; }
      else if (e.code === 'KeyM') { if (!e.repeat) setBigMap((v) => !v); }
      else used = false;
      if (used) e.preventDefault();
    };
    const up = (e) => {
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (named) sim.input[named[0]] = false;
    };
    const move = (e) => {
      if (document.pointerLockElement !== canvas || !sim.local) return;
      const k = sim.aim ? 0.55 : 1;
      sim.local.yaw -= e.movementX * SENS * k;
      sim.local.pitch = Math.max(-1.35, Math.min(1.35, sim.local.pitch - e.movementY * SENS * k));
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
    const blur = () => { Object.keys(sim.input).forEach((k) => { sim.input[k] = false; }); sim.aim = false; };
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
  const aliveCount = alivePlayers(room).length;
  const feed = [...(match?.deaths || [])].slice(-5).reverse();
  const nameOf = (id) => findPlayer(room, id)?.name || '¿?';
  const st = hud.storm;
  const stormText = !st ? '' : st.pre ? `La tormenta empieza en ${fmt(st.preLeft)}` : st.final ? 'Zona final' : st.shrinking ? `La tormenta se cierra · ${fmt(st.next)}` : `Se cierra en ${fmt(st.next)}`;
  const gun = hud.inv[hud.sel];

  return (
    <div className={`r3-stage${hud.scoped ? ' is-scoped' : ''}`} data-royale3d data-mode={hud.mode}>
      <canvas ref={canvasRef} className="r3-canvas" data-royale3d-canvas onClick={lock} />
      {hud.outside && <div className="r3-storm-fx" />}
      <div className="r3-hurt" style={{ opacity: hud.hurt }} />
      {hud.scoped && <div className="r3-scope" />}
      {!hud.scoped && !hud.dead && hud.mode === 'ground' && !hud.build && <div className="r3-crosshair" aria-hidden="true"><i /><i /><i /><i /></div>}
      {hud.hit > 0 && <div key={hud.hit} className={`r3-hitmark${hud.hitHead ? ' is-head' : ''}`} aria-hidden="true" />}
      <div className="r3-floaters" ref={floatRef} />

      <div className="r3-top">
        <span className="r3-pill" data-alive>👥 {aliveCount}</span>
        <span className="r3-pill">🎯 {hud.kills}</span>
        {!hud.lobby && <span className={`r3-pill r3-storm${st && st.shrinking ? ' is-shrinking' : ''}`} data-storm>🌀 {stormText}</span>}
        <button type="button" className="r3-pill r3-btn" onClick={toggleSound} aria-label="Sonido">{sound ? '🔊' : '🔇'}</button>
      </div>
      <div className="r3-feed" data-feed>
        {feed.map((d, i) => <p key={`${d.id}-${i}`}>{d.by ? <><b>{nameOf(d.by)}</b> {d.w && WEAPON_ICON[d.w] ? WEAPON_ICON[d.w] : '→'} <b>{nameOf(d.id)}</b></> : d.w === 'storm' ? <>🌀 <b>{nameOf(d.id)}</b> cayó en la tormenta</> : <><b>{nameOf(d.id)}</b> quedó afuera</>}</p>)}
      </div>
      <canvas ref={miniRef} className="r3-mini" width="170" height="170" aria-label="Mapa" />
      <div className="r3-hint-m">M · mapa grande</div>

      <div className="r3-bars">
        <div className="r3-bar r3-shield"><i style={{ width: `${hud.shield}%` }} /><span>{hud.shield}</span></div>
        <div className="r3-bar r3-hp" data-hp={hud.hp}><i style={{ width: `${hud.hp}%` }} /><span>{hud.hp}</span></div>
        <div className="r3-wood" data-wood={hud.wood}>🪵 {hud.wood}{hud.build ? <b> · {BUILD_KINDS[hud.build].name}{hud.lvl ? ` (piso +${hud.lvl})` : ''}</b> : null}</div>
      </div>

      <div className="r3-hotbar" data-hotbar>
        {Array.from({ length: SLOTS }, (_, i) => {
          const g = hud.inv[i];
          return (
            <div key={i} className={`r3-slot${hud.sel === i && !hud.build ? ' is-sel' : ''}${g ? '' : ' is-empty'}`} style={g ? { '--rc': RARITIES[g.r || 0].color } : undefined} data-slot={i}>
              <small>{i + 1}</small>
              {g && <><span className="r3-ico">{WEAPON_ICON[g.w]}</span><em>{WEAPONS[g.w].name}</em>{g.max > 0 && <u>{hud.lobby ? '∞' : `${g.mag}/${g.max}`}</u>}</>}
            </div>
          );
        })}
      </div>
      <div className="r3-items" data-items>
        {['bandage', 'medkit', 'shield', 'bigshield', 'grenade'].map((k) => <span key={k} className={hud.items[k] ? '' : 'is-none'} title={ITEMS[k].name}>{ITEMS[k].icon} <b>{hud.items[k] || 0}</b><kbd>{ITEMS[k].key}</kbd></span>)}
      </div>
      <div className="r3-build-keys"><kbd>Z</kbd> pared <kbd>X</kbd> piso <kbd>C</kbd> rampa <kbd>V</kbd> altura</div>

      {hud.cast && <div className="r3-cast"><span>{ITEMS[hud.cast.kind].icon} {ITEMS[hud.cast.kind].name}…</span><i style={{ width: `${Math.min(100, hud.cast.k * 100)}%` }} /></div>}
      {hud.reloading && gun && <div className="r3-reload"><i style={{ width: `${Math.min(100, hud.reloadK * 100)}%` }} /><span>Recargando</span></div>}
      {hud.piece && !hud.piece.ok && <div className="r3-warn">{hud.piece.why}</div>}
      {hud.prompt && <div className="r3-prompt" style={hud.prompt.color ? { color: hud.prompt.color } : undefined} data-prompt>{hud.prompt.text}{hud.prompt.progress != null && <i style={{ width: `${hud.prompt.progress * 100}%` }} />}</div>}
      {hud.toast && <div className="r3-toast">{hud.toast}</div>}
      {hud.outside && <div className="r3-warn r3-storm-warn">⚠ Estás en la tormenta: volvé a la zona segura</div>}

      {hud.loading && <div className="r3-center">Cargando la isla…</div>}
      {!hud.loading && hud.lobby && hud.count > 0 && <div className="r3-center r3-count" data-count={hud.count}><small>El bus sale en</small>{hud.count}</div>}
      {!hud.loading && hud.mode === 'bus' && <div className="r3-center r3-bus"><b>🚌 En el bus de batalla</b><small>Espacio · saltar · mouse para mirar · salta solo en {hud.bus} s</small></div>}
      {!hud.loading && hud.mode === 'fall' && <div className="r3-center r3-bus"><b>Caída libre · {hud.alt} m</b><small>W picada · Espacio abre el planeador (se abre solo cerca del piso)</small></div>}
      {!hud.loading && hud.mode === 'glide' && <div className="r3-center r3-bus"><b>Planeando · {hud.alt} m</b><small>Elegí dónde aterrizar: mirá el mapa (M)</small></div>}
      {!hud.loading && !hud.lobby && hud.count === 0 && !hud.locked && !hud.dead && (
        <button type="button" className={`r3-center r3-lock${hud.mode === 'ground' ? '' : ' r3-lock-low'}`} onClick={lock}>Hacé clic para jugar<small>WASD moverte · mouse apuntar · clic disparar · clic derecho apuntar · Espacio saltar · Shift correr · E agarrar / abrir · R recargar · 1–5 armas · Esc soltar el mouse</small></button>
      )}
      {!hud.loading && hud.lobby && !hud.locked && <button type="button" className="r3-center r3-lock r3-lock-low" onClick={lock}>Hacé clic para tomar el mouse y probar tu pistola<small>En la isla de espera no se lastima a nadie · WASD · clic dispara · clic derecho apunta</small></button>}
      {hud.dead && <div className="r3-center r3-dead" data-dead>Quedaste afuera<small>Mirás a alguien que sigue en pie…</small></div>}

      {bigMap && (
        <div className="r3-bigmap" onClick={() => setBigMap(false)}>
          <canvas ref={bigRef} width="680" height="680" />
          <small>M o clic para cerrar · círculo violeta: tormenta · blanco: próxima zona · 📦: cofre del cielo</small>
        </div>
      )}
      <span hidden>{mine?.name}</span>
    </div>
  );
}

// ─── Mapas ───────────────────────────────────────────────────────────────────
// El dibujo del terreno se pinta una sola vez por isla (cuesta) y después solo se le pone encima lo que cambia.
function mapImage(sim, size) {
  const key = `${sim.n}:${size}:${sim.scene}`;
  if (sim.mapImg?.key === key) return sim.mapImg.cv;
  if (!sim.mod || !sim.world) return null;
  const cv = sim.mod.drawWorldMap(sim.world, size);
  sim.mapImg = { key, cv };
  return cv;
}

function drawOverlay(g, sim, storm, p, size, R, now, m, named) {
  const X = (x) => (x / R / 2 + 0.5) * size, Z = (z) => (z / R / 2 + 0.5) * size, S = (r) => (r / R / 2) * size;
  if (named) {
    g.font = `bold ${Math.round(size / 48)}px Inter, sans-serif`;
    g.textAlign = 'center';
    for (const pl of sim.world.places) { g.lineWidth = 4; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(pl.name, X(pl.x), Z(pl.z)); g.fillStyle = '#fff'; g.fillText(pl.name, X(pl.x), Z(pl.z)); }
  }
  if (storm) {
    g.fillStyle = 'rgba(120,40,190,0.34)';
    g.beginPath(); g.rect(0, 0, size, size); g.arc(X(storm.x), Z(storm.z), Math.max(1, S(storm.r)), 0, Math.PI * 2, true); g.fill('evenodd');
    g.strokeStyle = '#c690ff'; g.lineWidth = 2; g.beginPath(); g.arc(X(storm.x), Z(storm.z), Math.max(1, S(storm.r)), 0, Math.PI * 2); g.stroke();
    const next = sim.centers?.[storm.phase + 1];
    if (next) { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(X(next.x), Z(next.z), Math.max(1, S(next.r)), 0, Math.PI * 2); g.stroke(); }
  }
  for (const d of sim.dropsCache || []) if (!d.open) { g.font = `${Math.round(size / 22)}px sans-serif`; g.textAlign = 'center'; g.fillText('📦', X(d.x), Z(d.z) + size / 60); }
  if (sim.scene === 'island' && p.mode === 'bus') {
    g.strokeStyle = 'rgba(255,230,120,0.9)'; g.setLineDash([6, 5]); g.lineWidth = 2; g.beginPath(); g.moveTo(X(sim.route.x0), Z(sim.route.z0)); g.lineTo(X(sim.route.x1), Z(sim.route.z1)); g.stroke(); g.setLineDash([]);
  }
  void now; void m;
  g.save(); g.translate(X(p.x), Z(p.z)); g.rotate(-p.yaw);
  g.fillStyle = p.dead ? '#888' : '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -size / 40); g.lineTo(size / 60, size / 52); g.lineTo(-size / 60, size / 52); g.closePath(); g.fill(); g.stroke();
  g.restore();
}

function drawMini(cv, sim, storm, p, now, m) {
  const g = cv.getContext('2d');
  const size = cv.width;
  const img = mapImage(sim, 220);
  g.clearRect(0, 0, size, size);
  g.save();
  g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.clip();
  g.fillStyle = '#1d5a85'; g.fillRect(0, 0, size, size);
  if (img) {
    // Centrado en el jugador, con zoom.
    const R = sim.world.worldR, zoom = 2.1;
    const s = size * zoom;
    g.translate(size / 2 - ((p.x / R / 2 + 0.5) * s), size / 2 - ((p.z / R / 2 + 0.5) * s));
    g.drawImage(img, 0, 0, s, s);
    drawOverlay(g, sim, storm, p, s, R, now, m, false);
  }
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.beginPath(); g.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2); g.stroke();
  g.save(); g.translate(size / 2, size / 2); g.rotate(-p.yaw); g.fillStyle = '#ffd23f'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -8); g.lineTo(6, 7); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
}

function drawBig(cv, sim, storm, p, now, m) {
  if (!sim.world) return;
  const g = cv.getContext('2d');
  const size = cv.width;
  const img = mapImage(sim, 340);
  g.clearRect(0, 0, size, size);
  if (img) g.drawImage(img, 0, 0, size, size);
  drawOverlay(g, sim, storm, p, size, sim.world.worldR, now, m, true);
}
