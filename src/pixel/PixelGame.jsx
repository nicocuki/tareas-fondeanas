// La partida de Pixel Royale en tiempo real: dibujo, teclado y mouse, y la conexión con los demás.
//
// Mismo esquema que Cohete Royale: cada pantalla es dueña de su jugador (lo mueve, decide cuánto
// daño le hacen y avisa a la sala cuando muere) y manda su foto directo a los demás (WebRTC) o, si no
// se puede, por el servidor. Los tiros no viajan: la foto lleva los disparos de los últimos segundos
// (`sh`) y cada pantalla simula las balas. Una bala común la juzga **la pantalla de a quien le pega**
// (y avisa en `hi` para que desaparezca en las demás). Lo que rompe cosas (balas contra casillas,
// cohetes, granadas) lo decide la pantalla del que tiró y lo manda en `ex`: todas rompen lo mismo.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { TILE, TILE_HP, circleBlocked, damageTile, makeMap, placeAt, tileAt, zoneAt } from './map.js';
import {
  BLASTS, BUILD_CODE, BUILD_COST, BUILD_GAP, DROP_BASE, DROP_FALL, GRENADE_GAP, HP, ITEMS, ITEM_LIST, MAX_DROPS, MAX_WOOD, OPEN_RANGE, OPEN_TIME, PLAYER_R, PREGAME, SLOTS, STEP, WEAPONS, WOOD_BREAK, WOOD_HIT,
  blastOn, blastTiles, boardBus, buildProblem, bulletHits, bulletsForShot, busAt, busRoute, contentsOf, dropInfo, finishCast, finishReload, giveContents, grenadeFor, held, hurt,
  jump, landSpot, newPlayer, openGlider, placePiece, selectSlot, shove, spawnPoint, startCast, startReload, stepAir, stepBullet, stepGrenade, stepPlayer,
} from './sim.js';
import {
  VIEW_W, buildMinimap, burst, drawAirPlayer, drawAirdrop, drawBigMap, drawBullet, drawBus, drawCanopies, drawChests, drawClouds, drawDead, drawExplosions,
  drawFloaters, drawGhost, drawGrenade, drawGround, drawMinimap, drawParticles, drawPlaceLabels, drawPlayer, drawRoute, drawText, drawWind, drawZone, lootIcon,
} from './render.js';
import { alive as alivePlayers, findPlayer, inGame } from './game.js';

const SEND_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 15;
const EVENT_KEEP = 1.2;     // segundos que un disparo o una explosión siguen viajando en las fotos
const GONE_AFTER = 12;      // sin fotos de alguien, el anfitrión lo da por muerto
const KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] };
const round1 = (v) => Math.round(v * 10) / 10;
const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// El ícono de un arma o consumible en el HUD (un <canvas> chico con el mismo sprite del mundo).
export function LootIcon({ kind, scale = 3 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    const icon = lootIcon(kind);
    if (!c || !icon) return;
    c.width = icon.width; c.height = icon.height;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(icon, 0, 0);
  }, [kind]);
  return <canvas ref={ref} className="px-icon" style={{ width: `${(lootIcon(kind)?.width || 10) * scale}px` }} aria-label={kind} />;
}

export default function PixelGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const roomRef = useRef(room);
  roomRef.current = room;
  const dispatchRef = useRef(onDispatch);
  dispatchRef.current = onDispatch;
  const [hud, setHud] = useState({ hp: HP, shield: 0, inv: [null, null, null, null], sel: 0, items: {}, wood: 0, build: null, reloadF: 0, dead: false, elapsed: -15, zone: null, storm: false, near: null, grenade: 0, mode: 'wait', place: '', openF: 0 });
  const [placeBanner, setPlaceBanner] = useState('');
  const [notice, setNotice] = useState('');
  const [killLabel, setKillLabel] = useState('');

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      n: 0, t: null, real: null, wait: null, stage: 'wait', route: null, mini: null, big: null, showMap: false, local: null, drops: [], remotes: new Map(), lastSeen: new Map(),
      myBuilds: [], buildAt: 0, build: null, hold: false, spaceEdge: false, openT: 0, openFor: null, placeId: '',
      bullets: new Map(), grenades: new Map(), seen: new Set(), myShots: [], myBooms: [], myGren: [], myHits: [],
      particles: [], floaters: [], blasts: [], shake: 0, seq: 0, cam: { x: 0, y: 0 }, angle: 0,
      input: { up: false, down: false, left: false, right: false, shoot: false }, pressed: false, mouse: { x: 0, y: 0, in: false },
      sentAt: 0, serverAt: 0, deathSent: false, pending: new Set(), goneSent: new Set(), hudKey: '', mountedAt: 0, hitFlash: 0,
    };
  }
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;
  const flash = (text) => { setNotice(text); setTimeout(() => setNotice((n) => (n === text ? '' : n)), 1800); };

  // Partida nueva: el mapa de la semilla, el botín y cada uno en su lugar.
  const matchN = room.match?.n;
  useEffect(() => {
    const m = room.match;
    if (!m) return;
    const s = sim.current;
    s.n = m.n;
    s.real = makeMap(m.map, m.seed);
    s.wait = makeMap('espera', m.seed);
    s.mini = buildMinimap(s.real);
    s.big = buildMinimap(s.real, s.real.N <= 60 ? 120 : 150);
    s.route = busRoute(s.real, m.seed);
    s.drops = Array.from({ length: MAX_DROPS }, (_, n) => dropInfo(s.real, m.seed, n, m.zone));
    s.openT = 0; s.openFor = null; s.hold = false; s.showMap = false; s.placeId = ''; s.build = null; s.myBuilds = [];
    const at = Math.max(0, m.order.indexOf(me.id));
    const elapsed = serverNow() - m.startsAt / 1000;
    if (elapsed < 0) {
      // Isla de espera: se camina y se prueba el pico hasta que sale el bus.
      s.t = s.wait; s.stage = 'wait';
      const sp = spawnPoint(s.t, m.seed, at, m.size);
      s.local = newPlayer(sp.x, sp.y);
    } else {
      // Entró tarde (recargó la página): si el bus sigue, se sube; si no, aparece en el mapa.
      s.t = s.real; s.stage = 'play';
      const bus = busAt(s.route, elapsed);
      s.local = newPlayer(bus.x, bus.y);
      if (!bus.done) boardBus(s.local, bus);
      else { const sp = spawnPoint(s.t, m.seed, at, m.size); s.local.x = sp.x; s.local.y = sp.y; }
    }
    s.cam = { x: s.local.x - VIEW_W / 2, y: s.local.y - 100 };
    s.remotes.clear(); s.lastSeen.clear(); s.bullets.clear(); s.grenades.clear(); s.seen.clear();
    s.myShots = []; s.myBooms = []; s.myGren = []; s.myHits = []; s.particles = []; s.floaters = []; s.blasts = [];
    s.deathSent = false; s.pending.clear(); s.goneSent.clear();
    s.mountedAt = performance.now() / 1000;
  }, [matchN]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando alguien que eliminé aparece en la lista: «Eliminaste a X».
  const deaths = room.match?.deaths || [];
  const seenDeaths = useRef(0);
  useEffect(() => {
    for (const d of deaths.slice(seenDeaths.current)) {
      if (d.by === me.id && d.id !== me.id) {
        const text = `Eliminaste a ${findPlayer(room, d.id)?.name || '¿?'}`;
        setKillLabel(text);
        setTimeout(() => setKillLabel((l) => (l === text ? '' : l)), 2400);
      }
    }
    seenDeaths.current = deaths.length;
  }, [deaths.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { seenDeaths.current = 0; }, [matchN]);

  // Un disparo (mío o de otro): sus balas.
  function addShot(s, shot, owner, now) {
    for (const b of bulletsForShot(shot, owner)) {
      // Llega tarde: se adelanta hasta ahora (solo se ve; el daño lo decide quien corresponda).
      if (owner !== me.id) {
        const late = Math.min(0.4, Math.max(0, now - shot.t));
        for (let k = 0; k < late && !b.done; k += STEP) stepBullet(b, STEP, s.t);
        b.px = b.x; b.py = b.y;
      }
      if (!b.done) s.bullets.set(b.k, b);
    }
    if (owner !== me.id) {
      const sx = shot.x, sy = shot.y;
      burst(s.particles, sx + Math.cos(shot.a) * 8, sy + Math.sin(shot.a) * 8, { n: 4, speed: 40, life: 0.12, colors: ['#fff3a0', '#ffd23f'], angle: shot.a, arc: 0.8 });
    }
  }

  // Madera: lo que rompés (con el pico, a tiros o con explosiones) te la da.
  function gainWood(s, n) {
    const p = s.local;
    if (!p || n <= 0) return;
    const got = Math.min(MAX_WOOD - p.wood, n);
    if (got <= 0) return;
    p.wood += got;
    s.floaters.push({ x: p.x, y: p.y - 10, text: `+${got}`, color: '#e2b070', age: 0 });
  }

  // Una pieza construida (mía o de otro): se pone en el mapa de todos y, si queda arriba mío, me saca.
  function applyBuild(s, ev) {
    const key = `b:${ev.k}`;
    if (s.seen.has(key) || !s.t) return;
    s.seen.add(key);
    if (ev.g !== (s.stage === 'play' ? 1 : 0)) return;
    if (!placePiece(s.t, ev.c, ev.x, ev.y)) return;
    burst(s.particles, ev.x * TILE + 8, ev.y * TILE + 8, { n: 6, speed: 30, life: 0.4, colors: ['#e2c288', '#c58a4a', '#8a5a2c'], gravity: 30 });
    const p = s.local;
    if (p && !p.dead && !p.air && !p.aboard && circleBlocked(s.t, p.x, p.y, PLAYER_R)) { const sp = landSpot(s.t, p.x, p.y); p.x = sp.x; p.y = sp.y; }
  }

  // Una explosión o un impacto (mío o de otro): rompe casillas y, si me alcanza, me lastima.
  function boom(s, ex, now) {
    const key = `x:${ex.k}`;
    if (s.seen.has(key) || !s.t) return;
    s.seen.add(key);
    if (ex.w === 'tile') {
      const tx = Math.floor(ex.x / TILE), ty = Math.floor(ex.y / TILE);
      const kind = tileAt(s.t, tx, ty);
      const broke = damageTile(s.t, tx, ty, ex.d);
      if (ex.o === me.id && TILE_HP[kind]) gainWood(s, (ex.pk ? WOOD_HIT : 0) + (broke ? WOOD_BREAK[kind] || 0 : 0));
      burst(s.particles, ex.x, ex.y, { n: broke ? 12 : 3, speed: 38, life: 0.4, colors: broke ? ['#c99350', '#8d5d2a', '#b0583d', '#3f9a48'] : ['#e9edf2', '#c9ccd6'], gravity: 40 });
      if (broke) s.shake = Math.max(s.shake, 0.25);
      return;
    }
    s.bullets.delete(ex.k);
    s.grenades.delete(ex.k);
    const b = BLASTS[ex.w];
    if (!b) return;
    const broke = blastTiles(s.t, ex);
    if (ex.o === me.id) for (const { kind } of broke) gainWood(s, WOOD_BREAK[kind] || 0);
    for (const { tx, ty } of broke) burst(s.particles, tx * TILE + 8, ty * TILE + 8, { n: 6, speed: 60, life: 0.6, colors: ['#c99350', '#8d5d2a', '#b0583d', '#3f9a48'], gravity: 50 });
    s.blasts.push({ x: ex.x, y: ex.y, r: b.r * 0.8, age: 0 });
    burst(s.particles, ex.x, ex.y, { n: 24, speed: 110, life: 0.7, colors: ['#ffd23f', '#ff9a3c', '#ff5a2a', '#3a3340'], size: 2 });
    s.shake = Math.max(s.shake, Math.min(1, 40 / (20 + Math.hypot(ex.x - (s.local?.x ?? 0), ex.y - (s.local?.y ?? 0)))));
    const p = s.local;
    if (!p || p.dead || p.air || p.aboard || now < roomRef.current.match.startsAt / 1000) return;
    const hit = blastOn(p, ex);
    if (!hit) return;
    shove(p, hit.vx, hit.vy);
    // La propia explosión lastima menos, pero lastima.
    const dmg = ex.o === me.id ? Math.round(hit.damage * 0.5) : hit.damage;
    hurt(p, dmg, ex.o === me.id ? null : ex.o, ex.w === 'rocket' ? 'bazooka' : 'grenade', now);
    s.hitFlash = 0.25;
    s.floaters.push({ x: p.x, y: p.y - 8, text: String(dmg), color: '#ff5a5f', age: 0 });
  }

  // ─── Red ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.pixelChannel(code);
    const s = sim.current;
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== s.n || !s.t) return;
      const prev = s.remotes.get(id);
      s.lastSeen.set(id, performance.now() / 1000);
      if (!prev || snap.t > prev.snap.t) {
        if (prev && !prev.snap.d && snap.d) burst(s.particles, snap.x, snap.y, { n: 30, colors: ['#ffe066', '#ff5a4f', '#e9edf2', '#555'], speed: 90, life: 0.9, size: 2 });
        const jump = !prev || Math.hypot(snap.x - prev.x, snap.y - prev.y) > 60;
        s.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, walked: (prev?.walked || 0) + Math.hypot(snap.x - (prev?.snap.x ?? snap.x), snap.y - (prev?.snap.y ?? snap.y)) });
      }
      const now = serverNow();
      for (const shot of snap.sh || []) {
        if (s.seen.has(shot.k)) continue;
        s.seen.add(shot.k);
        addShot(s, shot, id, now);
      }
      for (const gr of snap.gr || []) {
        if (s.seen.has(`g:${gr.k}`)) continue;
        s.seen.add(`g:${gr.k}`);
        s.grenades.set(gr.k, grenadeFor(gr, id));
      }
      for (const k of snap.hi || []) s.bullets.delete(k);
      for (const ex of snap.ex || []) boom(s, ex, now);
      for (const bd of snap.bd || []) applyBuild(s, bd);
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    s.mesh = mesh;
    s.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); s.mesh = null; s.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Bucle principal ────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    let last = performance.now() / 1000;
    let acc = 0;

    // Apuntar: del jugador al mouse (el canvas es de 384 px de ancho, el mouse viene en píxeles de pantalla).
    function aim() {
      const p = s.local, c = canvasRef.current;
      if (!p || !c || !s.mouse.in) return;
      const rect = c.getBoundingClientRect();
      const wx = (s.mouse.x / rect.width) * c.width + s.cam.x;
      const wy = (s.mouse.y / rect.height) * c.height + s.cam.y;
      s.aimAt = { x: wx, y: wy };
      s.angle = Math.atan2(wy - p.y, wx - p.x);
    }
    s.aim = aim;

    function fire(p, m, now) {
      const gun = held(p), wp = WEAPONS[gun.w];
      const a = s.angle;
      const shot = {
        k: `${me.id}:${m.n}:${s.seq++}`, t: now, x: round1(p.x + Math.cos(a) * 6), y: round1(p.y + Math.sin(a) * 6),
        a: Math.round(a * 1000) / 1000, w: gun.w, sd: Math.floor(Math.random() * 2 ** 30),
      };
      s.seen.add(shot.k);
      addShot(s, shot, me.id, now);
      s.myShots.push(shot);
      if (wp.melee) {
        p.readyAt = now + wp.rate;
        burst(s.particles, p.x + Math.cos(a) * 12, p.y + Math.sin(a) * 12, { n: 4, speed: 35, life: 0.18, colors: ['#ffffff', '#c9ccd6'], angle: a, arc: 1.2 });
        return;
      }
      gun.mag -= 1;
      p.readyAt = now + wp.rate;
      shove(p, -Math.cos(a) * wp.kick, -Math.sin(a) * wp.kick);
      s.shake = Math.max(s.shake, wp.kick / 120);
      burst(s.particles, shot.x, shot.y, { n: 5, speed: 55, life: 0.14, colors: ['#fff3a0', '#ffd23f', '#ffffff'], angle: a, arc: 0.7 });
      // Cápsula que sale hacia un costado.
      burst(s.particles, p.x, p.y, { n: 1, speed: 45, life: 0.5, colors: ['#ffd23f'], angle: a + Math.PI / 2, arc: 0.5, gravity: 80 });
      if (gun.mag <= 0) startReload(p, now);
    }

    function throwGrenade(p, m, now) {
      if (p.items.grenade <= 0 || now < p.grenadeAt || !s.aimAt) { flash('No tenés granadas'); return; }
      p.items.grenade -= 1;
      p.grenadeAt = now + GRENADE_GAP;
      p.cast = null;
      const d = Math.hypot(s.aimAt.x - p.x, s.aimAt.y - p.y);
      const ev = { k: `${me.id}:${m.n}:${s.seq++}`, t: now, x: round1(p.x), y: round1(p.y), a: Math.round(s.angle * 1000) / 1000, d: Math.round(d) };
      s.seen.add(`g:${ev.k}`);
      s.grenades.set(ev.k, grenadeFor(ev, me.id));
      s.myGren.push(ev);
    }

    // Cofres: se abren manteniendo Espacio cerca. Lo que traen va directo al inventario (nada cae al piso).
    function chestList(m, now) {
      const list = s.real.chests.filter((ch) => !m.loot[ch.i]);
      for (const d of s.drops) if (now >= m.startsAt / 1000 + PREGAME + d.at && !m.loot[d.i]) list.push(d);
      return list;
    }
    function chests(p, m, now) {
      let near = null, nd = Infinity;
      for (const ch of chestList(m, now)) {
        if (s.pending.has(ch.i)) continue;
        const d = Math.hypot(ch.x - p.x, ch.y - p.y);
        if (d < OPEN_RANGE && d < nd) { near = ch; nd = d; }
      }
      s.near = near;
      if (!near || !s.hold || p.cast) { s.openT = Math.max(0, s.openT - STEP * 3); if (!near) s.openFor = null; return; }
      if (s.openFor !== near.i) { s.openFor = near.i; s.openT = 0; }
      s.openT += STEP / OPEN_TIME;
      if (s.openT < 1) return;
      s.openT = 0; s.openFor = null;
      s.pending.add(near.i);
      dispatchRef.current({ type: 'loot', match: m.n, i: near.i }).then((res) => {
        const won = res?.committed && res.room?.match?.loot?.[near.i] === me.id;
        if (!won) { s.pending.delete(near.i); return; }
        const got = giveContents(p, contentsOf(s.real, m.seed, near.i, m.zone));
        flash(got.length ? got.join(' · ') : 'Cofre vacío');
        burst(s.particles, near.x, near.y, { n: 16, speed: 70, life: 0.7, colors: ['#ffd23f', '#fff0a0', '#ffffff'], gravity: 30 });
      });
    }

    // Sale el bus: se pasa de la isla de espera al mapa de verdad y todos suben.
    function toBus(p, m, elapsed) {
      s.stage = 'play';
      s.t = s.real;
      s.bullets.clear(); s.grenades.clear();
      s.particles = []; s.floaters = []; s.blasts = [];
      p.wood = 0; s.build = null; s.myBuilds = [];
      p.reloadUntil = 0; p.cast = null;
      boardBus(p, busAt(s.route, elapsed));
      s.cam = { x: p.x - VIEW_W / 2, y: p.y - 100 };
      s.showMap = false;
    }

    function step(now) {
      const r = roomRef.current;
      const m = r.match;
      const p = s.local;
      if (!m || !p || !s.t) return;
      const elapsed = now - m.startsAt / 1000;
      const mine = findPlayer(r, me.id);
      const shoot = s.input.shoot || s.pressed;
      const edge = s.pressed;
      s.pressed = false;
      const space = s.spaceEdge;
      s.spaceEdge = false;
      const ax = (s.input.right ? 1 : 0) - (s.input.left ? 1 : 0), ay = (s.input.down ? 1 : 0) - (s.input.up ? 1 : 0);
      const gun0 = () => {
        const gun = held(p);
        if (gun && now >= p.readyAt && !p.reloadUntil && gun.mag > 0 && shoot && (WEAPONS[gun.w].auto || edge)) { p.cast = null; fire(p, m, now); }
        else if (gun && shoot && edge && gun.mag <= 0) startReload(p, now);
      };

      const buildTick = () => {
        if (!shoot || now < s.buildAt || !s.aimAt) return;
        const tx = Math.floor(s.aimAt.x / TILE), ty = Math.floor(s.aimAt.y / TILE);
        const others = [];
        for (const v of s.remotes.values()) if (!v.snap.d && !v.snap.am) others.push({ x: v.x, y: v.y });
        const bad = buildProblem(s.t, s.build, tx, ty, p, others);
        if (bad) { if (edge) flash(bad); return; }
        if (p.wood < BUILD_COST[s.build]) { if (edge) flash('Te falta madera: rompé árboles, cajas y paredes con el pico'); return; }
        p.wood -= BUILD_COST[s.build];
        s.buildAt = now + BUILD_GAP;
        const ev = { k: `${me.id}:${m.n}:${s.seq++}`, t: now, x: tx, y: ty, c: BUILD_CODE[s.build], g: s.stage === 'play' ? 1 : 0 };
        applyBuild(s, ev);
        s.myBuilds.push(ev);
      };
      const act0 = () => (s.build ? buildTick() : gun0());

      if (p.dead) {
        // Espectando: no hay nada que mover, pero las balas y granadas de los demás tienen que seguir viajando.
      } else if (elapsed < 0) {
        // Isla de espera: caminás y probás la pistola (sin daño y con balas de sobra) hasta que sale el bus.
        stepPlayer(p, ax, ay, STEP, s.t);
        act0();
        const gun = held(p);
        if (gun) gun.mag = WEAPONS[gun.w].mag;
      } else {
        if (s.stage === 'wait') toBus(p, m, elapsed);
        const bus = busAt(s.route, elapsed);
        if (p.aboard) {
          // En el bus: vas pegado a él hasta que saltás (o hasta que se acaba el camino).
          p.x = bus.x; p.y = bus.y;
          if (space || bus.done) {
            jump(p, bus, s.route);
            s.build = null;
            burst(s.particles, p.x, p.y, { n: 14, speed: 60, life: 0.6, colors: ['#ffffff', '#bfe4ff'], size: 2 });
            s.showMap = false;
          }
        } else if (p.air) {
          if (space && openGlider(p)) flash('¡Planeador abierto!');
          if (stepAir(p, ax, ay, STEP, s.t) === 'landed') {
            burst(s.particles, p.x, p.y, { n: 16, speed: 70, life: 0.6, colors: ['#e7d08c', '#58b04b', '#ffffff'], gravity: 20 });
            s.shake = Math.max(s.shake, 0.45);
            flash('¡Aterrizaste!');
          }
        } else {
          stepPlayer(p, ax, ay, STEP, s.t);
          finishReload(p, now);
          const done = finishCast(p, now);
          if (done) { burst(s.particles, p.x, p.y, { n: 10, speed: 30, life: 0.5, colors: done === 'shield' ? ['#5ab4ff', '#ffffff'] : ['#5ed36b', '#ffffff'], gravity: -30 }); }
          act0();
          chests(p, m, now);
          if (s.throwNow) { s.throwNow = false; throwGrenade(p, m, now); }

          // Tormenta: lastima a los que quedan afuera. Su reloj arranca cuando ya bajó todo el mundo.
          const z = zoneAt(s.t, Math.max(0, elapsed - PREGAME), m.zone);
          s.zone = z;
          s.storm = Math.hypot(p.x - z.cx, p.y - z.cy) > z.r && elapsed >= PREGAME;
          if (s.storm) {
            p.hp -= z.dps * STEP;
            p.cast = null;
          }
        }
      }


      // Balas: las de otros, las juzgo yo si me pegan; las mías rompen casillas y explotan.
      const targets = [];
      for (const pl of alivePlayers(r)) {
        if (pl.id === me.id) continue;
        const v = s.remotes.get(pl.id);
        if (v && !v.snap.d && !v.snap.am) targets.push({ id: pl.id, x: v.x, y: v.y });
      }
      for (const b of s.bullets.values()) {
        const mineShot = b.by === me.id;
        const res = stepBullet(b, STEP, s.t);
        const wp = WEAPONS[b.w];
        if (wp.blast) {
          // El cohete lo decide quien lo tiró: explota contra una casilla, contra alguien o al agotarse.
          if (!mineShot) continue;
          let hit = res;
          if (!hit) {
            const target = targets.find((tk) => bulletHits(b, tk.x, tk.y, PLAYER_R));
            if (target) { hit = { x: b.x, y: b.y }; b.done = true; }
          }
          if (!hit && !b.done && !p.dead && !p.air && !p.aboard && b.age > 0.25 && bulletHits(b, p.x, p.y, PLAYER_R)) { hit = { x: b.x, y: b.y }; b.done = true; }
          if (hit) {
            const ex = { k: b.k, x: round1(hit.x), y: round1(hit.y), w: 'rocket', o: me.id, t: now };
            s.myBooms.push(ex);
            boom(s, ex, now);
          } else if (b.age % 0.04 < STEP) burst(s.particles, b.x, b.y, { n: 1, speed: 8, life: 0.5, colors: ['#bbb', '#777', '#ffb347'] });
          continue;
        }
        if (mineShot) {
          if (res?.kind === 'tile') {
            const ex = { k: b.k, x: round1(res.x), y: round1(res.y), w: 'tile', d: WEAPONS[b.w].tileDmg ?? b.dmg, pk: b.w === 'pickaxe' ? 1 : 0, o: me.id, t: now };
            s.myBooms.push(ex);
            boom(s, ex, now);
          }
          continue;
        }
        // Una bala ajena: si me toca, me lastima y avisa para que desaparezca en las demás.
        if (!p.dead && elapsed >= 0 && !p.air && !p.aboard && bulletHits(b, p.x, p.y, PLAYER_R)) {
          b.done = true;
          hurt(p, b.dmg, b.by, b.w, now);
          s.myHits.push({ k: b.k, t: now });
          s.shake = Math.max(s.shake, 0.3);
          s.hitFlash = 0.2;
          s.floaters.push({ x: p.x, y: p.y - 8, text: String(b.dmg), color: '#ff5a5f', age: 0 });
          burst(s.particles, p.x, p.y, { n: 6, speed: 50, life: 0.45, colors: ['#ff5a4f', '#d93a3a', '#ffffff'] });
        }
      }
      for (const [k, b] of s.bullets) if (b.done) s.bullets.delete(k);

      // Granadas: la que tiré yo explota cuando se le acaba la mecha.
      for (const [k, g] of s.grenades) {
        const fused = stepGrenade(g, STEP, s.t);
        if (!fused) continue;
        if (g.by === me.id) {
          const ex = { k, x: round1(g.x), y: round1(g.y), w: 'grenade', o: me.id, t: now };
          s.myBooms.push(ex);
          boom(s, ex, now);
        } else if (fused && g.fuse < -1) s.grenades.delete(k);
      }

      // Agua, tormenta o sin vida: afuera.
      if (elapsed > 0 && p.hp <= 0 && !p.dead) {
        p.dead = true;
        burst(s.particles, p.x, p.y, { n: 40, colors: ['#ffe066', '#ff5a4f', '#e9edf2', '#555'], speed: 100, life: 1, size: 2 });
        if (!s.deathSent && mine?.alive) {
          s.deathSent = true;
          const recent = p.lastBy && now - p.lastHitAt < 8;
          dispatchRef.current({ type: 'died', match: m.n, by: recent ? p.lastBy : null, w: recent ? p.lastW : s.storm ? 'storm' : null });
        }
      }
    }

    function frame({ hidden }) {
      const r = roomRef.current;
      const m = r.match;
      const t = performance.now() / 1000;
      acc = Math.min(acc + (t - last), 0.25);
      const dt = Math.min(0.05, t - last);
      last = t;
      const now = serverNow();
      while (acc >= STEP) { step(now - acc + STEP); acc -= STEP; }
      const p = s.local;
      if (!m || !p || !s.t) return;

      // Los demás: hacia su última foto, un poco adelantada.
      for (const v of s.remotes.values()) {
        const age = Math.min(0.1, Math.max(0, now - v.snap.t));
        const tx = v.snap.x + (v.snap.vx || 0) * age, ty = v.snap.y + (v.snap.vy || 0) * age;
        const k = Math.min(1, dt * 18);
        v.x += (tx - v.x) * k;
        v.y += (ty - v.y) * k;
      }

      // Mandar la foto.
      if (now - s.sentAt >= SEND_EVERY) {
        s.sentAt = now;
        const fresh = (list) => list.filter((e) => now - e.t < EVENT_KEEP);
        s.myShots = fresh(s.myShots); s.myBooms = fresh(s.myBooms); s.myGren = fresh(s.myGren); s.myHits = fresh(s.myHits); s.myBuilds = fresh(s.myBuilds);
        const gun = held(p);
        const span = Math.max(0.001, now - (s.prevT ?? now - SEND_EVERY));
        const snap = {
          n: m.n, t: now, x: round1(p.x), y: round1(p.y), vx: Math.round((p.x - (s.prevX ?? p.x)) / span), vy: Math.round((p.y - (s.prevY ?? p.y)) / span),
          a: Math.round(s.angle * 100) / 100, hp: Math.max(0, Math.round(p.hp)), sd: Math.round(p.shield), d: p.dead ? 1 : 0, am: p.aboard ? 1 : p.air ? (p.air.glide ? 3 : 2) : 0, z: p.air ? Math.round(p.air.z * 100) / 100 : 0, w: gun?.w || '',
          cs: p.cast ? p.cast.kind : '', sh: s.myShots, ex: s.myBooms, gr: s.myGren, bd: s.myBuilds, hi: s.myHits.map((h) => h.k),
        };
        s.prevX = p.x; s.prevY = p.y; s.prevT = now;
        s.mesh?.broadcast(snap);
        const players = inGame(r).filter((pl) => pl.id !== me.id);
        const needServer = !s.mesh || players.some((pl) => !s.mesh.isOpen(pl.id));
        if (needServer && now - s.serverAt >= SERVER_EVERY && s.chan) {
          s.serverAt = now;
          s.chan.publish(me.id, JSON.stringify(snap)).catch(() => {});
        }
        // El anfitrión da por muerto al que dejó de mandar fotos (pestaña cerrada sin salir).
        if (r.hostId === me.id && r.phase === 'playing' && now > m.startsAt / 1000 + GONE_AFTER) {
          for (const pl of alivePlayers(r)) {
            if (pl.id === me.id || s.goneSent.has(pl.id)) continue;
            if (t - (s.lastSeen.get(pl.id) ?? s.mountedAt) > GONE_AFTER) { s.goneSent.add(pl.id); dispatchRef.current({ type: 'died', target: pl.id, match: m.n }); }
          }
        }
      }

      // Lo que muestra la pantalla de React.
      const elapsed = now - m.startsAt / 1000;
      const gun = held(p);
      const reloadF = p.reloadUntil && gun ? Math.round(Math.max(0, Math.min(1, 1 - (p.reloadUntil - now) / WEAPONS[gun.w].reload)) * 10) / 10 : 0;
      const zone = s.zone ? { state: s.zone.state, left: Math.ceil(s.zone.left), phase: s.zone.phase } : null;
      const sky = p.aboard || p.air;
      const near = s.near && !sky ? s.near.i : null;
      const mode = elapsed < 0 ? 'wait' : p.aboard ? 'bus' : p.air ? (p.air.glide ? 'glide' : 'fall') : 'ground';
      const place = mode === 'ground' ? placeAt(s.t, p.x, p.y)?.name || '' : '';
      const openF = Math.round(Math.min(1, s.openT) * 10) / 10;
      const key = [Math.round(p.hp), Math.round(p.shield), JSON.stringify(p.inv), p.sel, JSON.stringify(p.items), reloadF, p.dead, Math.ceil(-elapsed), zone?.state, zone?.left, zone?.phase, s.storm, near, p.cast?.kind, mode, place, openF, s.showMap, p.wood, s.build].join('|');
      if (key !== s.hudKey) {
        s.hudKey = key;
        setHud({ hp: Math.max(0, Math.round(p.hp)), shield: Math.round(p.shield), inv: p.inv.map((g) => g && { ...g }), sel: p.sel, items: { ...p.items }, reloadF, dead: p.dead, elapsed, zone, storm: s.storm, near, wood: p.wood, build: s.build, cast: p.cast?.kind || null, mode, place, openF, altitude: p.air ? Math.round(p.air.z * 100) : 0, map: s.showMap });
      }
      if (!hidden) draw(r, m, now, dt, elapsed);
    }

    function draw(r, m, now, dt, elapsed) {
      const canvas = canvasRef.current, wrap = wrapRef.current;
      if (!canvas || !wrap || !wrap.clientWidth) return;
      const W = VIEW_W;
      const H = Math.max(180, Math.min(320, Math.round((W * wrap.clientHeight) / wrap.clientWidth)));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      const p = s.local;
      const t = s.t;
      const time = performance.now() / 1000;

      // Cámara: sigue al jugador (muerto, a quien me mató o a alguien vivo) y se adelanta hacia donde apunto.
      let follow = p;
      let look = 0;
      if (p.dead) {
        const ids = [p.lastBy, ...alivePlayers(r).map((pl) => pl.id)];
        const v = ids.map((id) => s.remotes.get(id)).find((x) => x && !x.snap.d);
        if (v) follow = v;
      } else if (s.aimAt && held(p) && !p.aboard && !p.air) look = WEAPONS[held(p).w].look;
      const lx = look ? (s.aimAt.x - p.x) * look * 0.5 : 0, ly = look ? (s.aimAt.y - p.y) * look * 0.5 : 0;
      const tx = follow.x + Math.max(-90 * look, Math.min(90 * look, lx)) - W / 2;
      const ty = follow.y + Math.max(-60 * look, Math.min(60 * look, ly)) - H / 2;
      const k = Math.min(1, dt * 7);
      s.cam.x += (tx - s.cam.x) * k;
      s.cam.y += (ty - s.cam.y) * k;
      s.shake = Math.max(0, s.shake - dt * 2.2);
      const cam = {
        x: Math.round(Math.max(-40, Math.min(t.W - W + 40, s.cam.x)) + (Math.random() - 0.5) * s.shake * 6),
        y: Math.round(Math.max(-40, Math.min(t.H - H + 40, s.cam.y)) + (Math.random() - 0.5) * s.shake * 6),
      };
      aim();

      g.fillStyle = '#2b5fb4';
      g.fillRect(0, 0, W, H);
      drawGround(g, t, cam, W, H, time);
      if (s.build && !p.dead && !p.air && !p.aboard && s.aimAt) {
        const gx = Math.floor(s.aimAt.x / TILE), gy = Math.floor(s.aimAt.y / TILE);
        const others = [];
        for (const v of s.remotes.values()) if (!v.snap.d && !v.snap.am) others.push({ x: v.x, y: v.y });
        drawGhost(g, gx, gy, s.build, !buildProblem(t, s.build, gx, gy, p, others) && p.wood >= BUILD_COST[s.build], cam, time);
      }

      // Cofres del mapa y cofres del cielo.
      const airdrops = [];
      const opened = m.loot;
      if (s.stage === 'play') {
        drawChests(g, s.real.chests, opened, cam, W, H, time, s.near?.i, s.openT);
        for (const d of s.drops) {
          const start = m.startsAt / 1000 + PREGAME + d.at - DROP_FALL;
          if (now < start) continue;
          const landed = Math.min(1, (now - start) / DROP_FALL);
          if (landed >= 1 && opened[d.i]) continue;
          drawAirdrop(g, d, cam, time, landed, Boolean(opened[d.i]));
          airdrops.push(d);
        }
      }

      for (const gr of s.grenades.values()) drawGrenade(g, gr, cam);
      // Jugadores en el piso (los que están en el bus o en el aire se dibujan más abajo, por encima de todo).
      const skyPlayers = [];
      for (const pl of inGame(r)) {
        if (pl.id === me.id) continue;
        const v = s.remotes.get(pl.id);
        if (!v) continue;
        if (v.snap.d || !pl.alive) { drawDead(g, v, cam, pl.color); continue; }
        if (v.snap.am === 1) continue;
        if (v.snap.am >= 2) { skyPlayers.push({ x: v.x, y: v.y, color: pl.color, z: v.snap.z || 0.5, glide: v.snap.am === 3, name: pl.name }); continue; }
        const mx = Math.hypot(v.x - p.x, v.y - p.y);
        drawPlayer(g, v, cam, pl.color, { angle: v.snap.a, weapon: v.snap.w, walked: v.walked, name: mx < 260 ? pl.name : null, hp: v.snap.hp, shield: v.snap.sd, casting: Boolean(v.snap.cs), cast: v.snap.cs ? 0.5 : null });
      }
      const mine = findPlayer(r, me.id);
      if (mine) {
        if (p.dead) drawDead(g, p, cam, mine.color);
        else if (p.aboard) { /* va en el bus */ }
        else if (p.air) skyPlayers.push({ x: p.x, y: p.y, color: mine.color, z: p.air.z, glide: p.air.glide, name: null });
        else {
          const casting = p.cast ? Math.min(1, 1 - (p.cast.until - now) / (p.cast.until - p.cast.from)) : null;
          drawPlayer(g, p, cam, mine.color, {
            angle: s.angle, weapon: held(p)?.w, walked: p.walked, hurt: p.hurtUntil > now && Math.floor(now * 30) % 2 === 0, shield: p.shield,
            casting: Boolean(p.cast), cast: casting, castColor: p.cast?.kind === 'shield' ? '#5ab4ff' : '#5ed36b',
          });
          if (p.reloadUntil && held(p)) {
            const f = 1 - (p.reloadUntil - now) / WEAPONS[held(p).w].reload;
            const sx = Math.round(p.x - cam.x), sy = Math.round(p.y - cam.y);
            g.fillStyle = '#14101c'; g.fillRect(sx - 8, sy + 8, 17, 3);
            g.fillStyle = '#ffd23f'; g.fillRect(sx - 7, sy + 9, Math.round(15 * Math.max(0, Math.min(1, f))), 1);
          }
        }
      }
      for (const b of s.bullets.values()) if (!b.done) drawBullet(g, b, cam);
      drawCanopies(g, t, cam, W, H);
      s.blasts = s.blasts.filter((e) => e.age < 0.4);
      drawExplosions(g, s.blasts, cam, dt);
      s.particles = s.particles.filter((q) => q.age < q.life);
      drawParticles(g, s.particles, cam, dt);
      s.floaters = s.floaters.filter((f) => f.age < 0.8);
      drawFloaters(g, s.floaters, cam, dt);

      // El cielo: ruta y bus, los que caen, nubes y viento. Todo esto va por encima del piso y de las copas.
      const matchT = Math.max(0, elapsed - PREGAME);
      const sky = p.aboard || p.air;
      const bus = s.stage === 'play' ? busAt(s.route, elapsed) : null;
      drawClouds(g, cam, W, H, p.aboard ? 0.6 : p.air ? Math.min(0.6, p.air.z) : 0, m.seed);
      if (bus && !bus.done) {
        drawRoute(g, s.route, bus, cam, W, H);
        const riders = inGame(r).filter((pl) => (pl.id === me.id ? p.aboard : s.remotes.get(pl.id)?.snap.am === 1)).map((pl) => pl.color);
        drawBus(g, bus, s.route, cam, time, riders);
      }
      for (const sp of skyPlayers) drawAirPlayer(g, sp, cam, sp.color, sp.z, sp.glide, { name: sp.name });
      const height = p.aboard ? 1 : p.air ? p.air.z : 0;
      if (p.air) drawWind(g, W, H, time, !p.air.glide);
      if (sky && height > 0.12) drawPlaceLabels(g, s.real, cam, W, H, height > 0.5);

      // Tormenta, y el minimapa arriba de todo.
      const z = zoneAt(t, matchT, m.zone);
      s.zone = z;
      if (s.stage === 'play') {
        drawZone(g, z, cam, W, H, time);
        const showBus = bus && !bus.done;
        if (s.showMap || p.aboard) drawBigMap(g, s.big, s.real, follow, z, { route: showBus ? s.route : null, bus: showBus ? bus : null, corner: !s.showMap }, time, W, H);
        else drawMinimap(g, s.mini, t, follow, z, airdrops, time, showBus ? { route: s.route, bus } : {});
      }
      // Mira.
      if (s.mouse.in && !p.dead) {
        const rect = canvas.getBoundingClientRect();
        const mx = Math.round((s.mouse.x / rect.width) * W), my = Math.round((s.mouse.y / rect.height) * H);
        g.fillStyle = '#ffffff';
        g.fillRect(mx - 3, my, 2, 1); g.fillRect(mx + 2, my, 2, 1); g.fillRect(mx, my - 3, 1, 2); g.fillRect(mx, my + 2, 1, 2);
        g.fillStyle = '#14101c';
        g.fillRect(mx, my, 1, 1);
      }
    }

    const stop = everyFrame(frame);
    window.__pixel = s; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__pixel === s) delete window.__pixel; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ──────────────────────────────────────────────────────
  const act = (fn) => { const s = sim.current; const p = s.local; const m = roomRef.current.match; if (p && !p.dead && !p.air && !p.aboard && m) fn(s, p, serverNow()); };
  const actRef = useRef(act);
  actRef.current = act;
  function toggleBuild(kind) {
    actRef.current((s) => { s.build = s.build === kind ? null : kind; });
  }
  function useItem(kind) {
    actRef.current((s, p, now) => {
      if (kind === 'grenade') { s.throwNow = true; return; }
      if (!startCast(p, kind, now)) flash(p.items[kind] > 0 ? 'No hace falta' : `No tenés ${ITEMS[kind].name.toLowerCase()}`);
    });
  }
  useEffect(() => {
    const s = sim.current;
    const down = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      let used = true;
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (named) s.input[named[0]] = true;
      else if (e.code === 'Space') { s.hold = true; if (!e.repeat) s.spaceEdge = true; }
      else if (e.code === 'KeyM') { if (!e.repeat) s.showMap = !s.showMap; }
      else if (e.code === 'KeyR') actRef.current((st, p, now) => startReload(p, now));
      else if (e.code === 'KeyQ') useItem('bandage');
      else if (e.code === 'KeyE') useItem('medkit');
      else if (e.code === 'KeyF') useItem('shield');
      else if (e.code === 'KeyG') { if (!e.repeat) useItem('grenade'); }
      else if (e.code === 'KeyZ') { if (!e.repeat) toggleBuild('wall'); }
      else if (e.code === 'KeyX') { if (!e.repeat) toggleBuild('floor'); }
      else if (/^Digit[1-4]$/.test(e.code)) actRef.current((st, p) => { st.build = null; selectSlot(p, Number(e.code.slice(5)) - 1); });
      else used = false;
      if (used) e.preventDefault();
    };
    const up = (e) => { if (e.code === 'Space') s.hold = false; const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code)); if (named) s.input[named[0]] = false; };
    const blur = () => { s.hold = false; Object.assign(s.input, { up: false, down: false, left: false, right: false, shoot: false }); };
    const wheel = (e) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      actRef.current((st, p) => {
        st.build = null;
        const dir = e.deltaY > 0 ? 1 : -1;
        for (let k = 1; k <= SLOTS; k++) { const i = (p.sel + dir * k + SLOTS * 2) % SLOTS; if (p.inv[i]) { selectSlot(p, i); break; } }
      });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('wheel', wheel, { passive: true });
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('wheel', wheel); };
  }, []);

  function onPointer(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    Object.assign(sim.current.mouse, { x: e.clientX - rect.left, y: e.clientY - rect.top, in: true });
    sim.current.aim?.();
  }

  // ─── Pantalla ──────────────────────────────────────────────────────────────
  const left = alivePlayers(room).length;
  const total = inGame(room).length;
  const mine = findPlayer(room, me.id);
  const feed = deaths.slice(-5).reverse().map((d) => ({
    k: d.id, by: d.by ? findPlayer(room, d.by)?.name : null, w: d.w, victim: findPlayer(room, d.id)?.name || '¿?',
  }));
  const myDeath = deaths.find((d) => d.id === me.id);
  const myKiller = myDeath?.by ? findPlayer(room, myDeath.by) : null;
  const gun = hud.inv[hud.sel];
  const zone = hud.zone;
  return (
    <div className="px-stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="px-canvas"
        data-pixel-canvas
        onPointerMove={onPointer}
        onPointerDown={(e) => { onPointer(e); if (e.button === 0) { sim.current.input.shoot = true; sim.current.pressed = true; } e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerUp={(e) => { if (e.button === 0) sim.current.input.shoot = false; }}
        onContextMenu={(e) => e.preventDefault()}
      />
      {hud.storm && !hud.dead && <div className="px-storm" aria-hidden />}
      <div className="px-top">
        <span title="Bajas">☠ {mine?.kills || 0}</span>
        <span title="Cofres abiertos">📦 {mine?.loot || 0}</span>
      </div>
      <div className="px-remaining" data-left><small>Quedan</small><strong>{left}</strong></div>
      {zone && !hud.dead && hud.elapsed >= 0 && (
        <p className={`px-zone${zone.state === 'shrink' ? ' is-shrinking' : ''}`}>
          {zone.state === 'wait' ? `Zona se achica en ${fmtTime(zone.left)}` : zone.state === 'shrink' ? '⚠ La zona se está cerrando' : 'Zona final'}
        </p>
      )}
      <ul className="px-feed">
        {feed.map((f) => (
          <li key={f.k}>{f.by ? <><b>{f.by}</b> <i>{f.w && WEAPONS[f.w] ? WEAPONS[f.w].name : f.w === 'grenade' ? '💣' : '→'}</i> {f.victim}</> : <>{f.victim} <i>{f.w === 'storm' ? '🌀' : '👋'}</i></>}</li>
        ))}
      </ul>
      {killLabel && <p className="px-killed">☠ {killLabel}</p>}
      {hud.near !== null && !hud.dead && <p className="px-near">📦 Mantené <kbd>Espacio</kbd> para abrir el cofre{hud.openF > 0 && <i className="px-open"><b style={{ width: `${hud.openF * 100}%` }} /></i>}</p>}
      {hud.mode === 'bus' && !hud.dead && <p className="px-sky"><b>🚌 Estás en el bus de batalla</b>Mirá el mapa, elegí un lugar y apretá <kbd>Espacio</kbd> para saltar. <kbd>M</kbd> agranda o achica el mapa.</p>}
      {hud.mode === 'fall' && !hud.dead && <p className="px-sky"><b>Caída libre · altura {hud.altitude}%</b>Se abre el planeador solo, o antes con <kbd>Espacio</kbd>. Movete con <kbd>W A S D</kbd>.</p>}
      {hud.mode === 'glide' && !hud.dead && <p className="px-sky"><b>Planeando · altura {hud.altitude}%</b>Apuntá a tu lugar con <kbd>W A S D</kbd>.</p>}
      {hud.place && !hud.dead && <p className="px-place" key={hud.place}>{hud.place}</p>}
      {!hud.dead && (
        <div className="px-bottom">
          <div className="px-bars">
            <div className="px-bar px-bar-shield" title="Escudo"><i style={{ width: `${hud.shield}%` }} /><span>{hud.shield}</span></div>
            <div className="px-bar px-bar-hp" title="Vida"><i style={{ width: `${hud.hp}%` }} /><span>{hud.hp}</span></div>
          </div>
          <div className="px-build">
            <span className="px-wood" title="Madera">🪵 {hud.wood}</span>
            <button type="button" className={hud.build === 'wall' ? 'is-on' : ''} data-build="wall" onClick={() => toggleBuild('wall')}><kbd>Z</kbd> Pared · {BUILD_COST.wall}</button>
            <button type="button" className={hud.build === 'floor' ? 'is-on' : ''} data-build="floor" onClick={() => toggleBuild('floor')}><kbd>X</kbd> Piso · {BUILD_COST.floor}</button>
          </div>
          <div className="px-slots">
            {Array.from({ length: SLOTS }, (_, i) => {
              const gn = hud.inv[i];
              return (
                <button key={i} type="button" className={`px-slot${hud.sel === i ? ' is-sel' : ''}${gn ? '' : ' is-empty'}`} data-slot={i + 1} title={gn ? WEAPONS[gn.w].name : 'Vacío'}
                  onClick={() => act((s, p) => selectSlot(p, i))}>
                  <small>{i + 1}</small>
                  {gn && <LootIcon kind={gn.w} scale={3} />}
                  {gn && gn.w !== 'pickaxe' && <b>{gn.mag}</b>}
                </button>
              );
            })}
          </div>
          <div className="px-consumables">
            {ITEM_LIST.map((k) => (
              <button key={k} type="button" className={`px-item${hud.items[k] ? '' : ' is-empty'}${hud.cast === k ? ' is-casting' : ''}`} title={`${ITEMS[k].name} (${ITEMS[k].key})`} data-item={k} onClick={() => useItem(k)}>
                <small>{ITEMS[k].key}</small>
                <LootIcon kind={k} scale={2} />
                <b>{hud.items[k] || 0}</b>
              </button>
            ))}
          </div>
          {gun && gun.w !== 'pickaxe' && <p className="px-ammo">{hud.reloadF > 0 ? 'Recargando…' : <>{gun.mag}<small> / {WEAPONS[gun.w].mag}</small> <em>R recarga</em></>}</p>}
        </div>
      )}
      {notice && <p className="px-notice">{notice}</p>}
      {hud.elapsed < 0 && <div className="px-countdown"><small>ISLA DE ESPERA · EL BUS SALE EN</small>{Math.ceil(-hud.elapsed)}<em>Probá el pico: rompé árboles y cajas para juntar madera, y construí con Z (pared) y X (piso).</em></div>}
      {hud.dead && mine && (
        <div className="px-eliminated">
          <div className="px-elim-text">
            <strong>¡ELIMINADO!</strong>
            <span>{myKiller ? <>por <b>{myKiller.name}</b>{myDeath.w && WEAPONS[myDeath.w] ? <> con {WEAPONS[myDeath.w].name}</> : null}</> : myDeath?.w === 'storm' ? 'Te agarró la tormenta' : 'Quedaste afuera'}</span>
          </div>
          <div className="px-elim-place"><strong>{mine.place || left + 1}</strong><small>de {total}</small></div>
        </div>
      )}
    </div>
  );
}
