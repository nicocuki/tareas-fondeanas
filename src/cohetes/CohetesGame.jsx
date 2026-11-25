// La partida de Cohete Royale en tiempo real: dibujo, teclado y mouse, y la conexión con los demás.
//
// Mismo esquema que A los Tiros: cada pantalla es dueña de su tanque (lo mueve, decide cuánto daño le
// hacen y avisa a la sala cuando muere) y manda su foto directo a los demás (WebRTC) o, si no se
// puede, por el servidor. Los tiros no viajan: la foto lleva los disparos de los últimos segundos (`sh`)
// y cada pantalla simula los proyectiles. **Dónde explota cada uno lo decide la pantalla del que tiró**
// y lo manda en la foto (`ex`): así todas cavan el mismo cráter, arman las mismas zonas (veneno, humo)
// y cada una calcula el daño de su propio tanque. Un escudo devuelve los tiros: los decide igual la
// pantalla del que tiró, que ve el escudo en la foto del otro (`sd`).
//
// Al empezar, cada uno va en uno de los dos helicópteros: con un tiro salta y baja en paracaídas.
// Roba la bandera no tiene helicópteros: cada uno aparece de su lado a una altura al azar y, si lo eliminan, reaparece.
// Las máquinas (modificador) las corre la pantalla del anfitrión y viajan en su foto (`bt`).
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { carve, decorations, fillCircle, makeTerrain, solid, waterY } from './terrain.js';
import { BOT_DRIVE, BOT_HP, BOT_RESPAWN, botCount, botId, isBot, botThink, newBot } from './bots.js';
import { RESPAWN_S, nearFlag, spawnSpot } from './ctf.js';
import {
  CHUTE_GAP, DEPLOY_AFTER, DRILL_R, HEAL, HP, ITEMS, ITEM_DESC, JET_MAX, JET_TIME, KILL_CREDIT, LASER_CHARGE, MAX_AMMO, MAX_DROPS, RECOIL, RELOAD, SHIELD_TIME,
  SHOT_GAP, SLOTS, STEP, STRIKE_BOMBS, STRIKE_DELAY, STRIKE_GAP, STRIKE_HEIGHT, STRIKE_SPREAD, ZONES, addItem, blastOn, chuteBoost, coinSpots, crateInfo,
  inWhirl, jetForce, mapItems, muzzle, newTank, overlaps, projectilesFor, push, reload, shipAt, shipFor, stepProjectile, stepTank, teleportTarget, thrust,
  turret, unstick, useItem, zoneFromShot,
} from './sim.js';
import { STORM_DPS, hasStorm, hasWater, inStorm, settingsOf, stormAt } from './modes.js';
import {
  burst, drawArrow, drawBadges, drawBase, drawCoin, drawCrate, drawDecorations, drawEffects, drawFlag, drawLabel, drawLaserAim, drawMinimap, drawProjectile, drawShip, drawSky,
  drawStorm, drawTank, drawTerrain, drawWater, drawZones, makeTerrainView, puff, repaint, setWorld,
} from './render.js';
import Icon from './Icon.jsx';
import { TEAMS, alive as alivePlayers, findPlayer, inGame, isCtf, sameTeam, teamsOn } from './game.js';

const SEND_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 15;
const EVENT_KEEP = 2;        // segundos que un disparo o una explosión siguen viajando en las fotos
const GONE_AFTER = 12;       // sin fotos de alguien, el anfitrión lo da por muerto
const VIEW_W = 430;          // cuánto mundo entra a lo ancho
const ITEM_GAP = 0.4;        // entre usar un objeto y el siguiente
const FLAG_COOLDOWN = 0.6;   // segundos entre un aviso de bandera y el siguiente (no repetir mientras la sala contesta)
const KEYS = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], shoot: ['Space'] };
// Cuánto empuja para atrás cada arma al dispararla (sobre RECOIL).
const KICK = { rocket: 1, nuke: 1.5, rapid: 0.35, flak: 1.2, laser: 0.6, whirl: 0.3, triple: 0.9, bounce: 0.9, cement: 0.5, strike: 0.4 };
const round1 = (v) => Math.round(v * 10) / 10;

export function ItemIcon({ w, size = 22 }) {
  return <Icon name={w || 'rocket'} size={size} />;
}

export default function CohetesGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const roomRef = useRef(room);
  roomRef.current = room;
  const dispatchRef = useRef(onDispatch);
  dispatchRef.current = onDispatch;
  const [hud, setHud] = useState({ ctfLeft: null, respawn: 0, hp: HP, maxHp: HP, zone: null, inStorm: false, turbo: 0, inv: [null, null, null], sel: 0, shots: MAX_AMMO, reloadF: 0, charge: 0, jet: 0, dead: false, mode: 'ship', elapsed: -5 });
  const [hits, setHits] = useState([]);
  const [notice, setNotice] = useState('');
  const [killLabel, setKillLabel] = useState('');
  const mode = settingsOf(room.options);
  const byTeams = teamsOn(room);
  const ctf = isCtf(room);
  // ¿Es compañero mío? No se lastiman entre sí (los empujones sí valen).
  const ally = (id) => sameTeam(roomRef.current, findPlayer(roomRef.current, me.id), findPlayer(roomRef.current, id));
  const teamColor = (id) => (teamsOn(roomRef.current) ? TEAMS[findPlayer(roomRef.current, id)?.team ?? 0].color : null);

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      n: 0, t: null, view: null, deco: [], coinSpots: [], crates: new Map(), zones: new Map(), local: null, remotes: new Map(), lastSeen: new Map(),
      projectiles: new Map(), seen: new Set(), myShots: [], myBooms: [], strikes: [], mode: settingsOf(null), mods: { g: 1 }, ctf: false, bots: null, hostBots: false, botViews: new Map(), flagAt: 0, tickAt: 0, aimDist: 260, effects: [], particles: [], shake: 0, seq: 0,
      input: { left: false, right: false, shoot: false }, pressed: false, mouse: { x: 0, y: 0, in: false }, angle: -Math.PI / 2, shootHeld: false,
      badges: [], hitEvents: [], hitDirty: false, sentAt: 0, serverAt: 0, deathSent: false, pendingCoins: new Set(), pendingCrates: new Set(), goneSent: new Set(), hudKey: '', mountedAt: 0,
    };
  }
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;
  const flash = (text) => { setNotice(text); setTimeout(() => setNotice((n) => (n === text ? '' : n)), 1800); };

  // Partida nueva: el mapa de la semilla, monedas, cajas y todos arriba de los helicópteros.
  const matchN = room.match?.n;
  useEffect(() => {
    const m = room.match;
    if (!m) return;
    const s = sim.current;
    s.n = m.n;
    s.ctf = m.mode === 'ctf';
    s.t = makeTerrain(m.seed, m.size, s.ctf);
    s.view = makeTerrainView(s.t);
    s.deco = decorations(s.t, m.seed);
    s.coinSpots = coinSpots(s.t, m.seed);
    s.crates = new Map(mapItems(s.t, m.seed).map((c) => [c.i, { x: c.x, y: c.y, falling: false, weapon: c.weapon, float: true }]));
    s.zones = new Map();
    s.mode = settingsOf(room.options);
    s.mods = { g: 1 };
    if (s.ctf) {
      // Sin helicópteros: aparece de su lado, a una altura al azar.
      const sp = spawnSpot(s.t, findPlayer(room, me.id)?.team ?? 0, Math.random);
      s.local = newTank(sp.x, sp.y, 'tank', s.mode.hp);
    } else s.local = newTank(0, 0, 'ship', s.mode.hp);
    s.bots = null; s.botViews.clear(); s.flagAt = 0; s.tickAt = 0;
    s.strikes = [];
    s.ship = shipFor(m.order, me.id);
    s.remotes.clear(); s.lastSeen.clear(); s.projectiles.clear(); s.seen.clear();
    s.myShots = []; s.myBooms = []; s.effects = []; s.particles = []; s.badges = []; s.hitEvents = []; s.hitDirty = true;
    s.storm = null; s.inStorm = false;
    s.deathSent = false; s.pendingCoins.clear(); s.pendingCrates.clear(); s.goneSent.clear();
    s.mountedAt = performance.now() / 1000;
  }, [matchN]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando alguien que eliminé aparece en la lista: «Eliminaste a X».
  const deaths = room.match?.deaths || [];
  const deathCount = room.match?.dn ?? deaths.length; // en roba la bandera la lista guarda solo las últimas
  const seenDeaths = useRef(0);
  useEffect(() => {
    for (const d of deaths.slice(Math.max(0, deaths.length - (deathCount - seenDeaths.current)))) {
      if (d.by === me.id && d.id !== me.id) {
        const text = `Eliminaste a ${findPlayer(room, d.id)?.name || '¿?'}`;
        setKillLabel(text);
        setTimeout(() => setKillLabel((l) => (l === text ? '' : l)), 2400);
        sim.current.badges.push({ kind: 'kill', at: performance.now() / 1000 });
      }
    }
    seenDeaths.current = deathCount;
  }, [deathCount]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { seenDeaths.current = 0; }, [matchN]);

  // Avisos de roba la bandera: quién la robó, cuándo vuelve y los puntos.
  const flagsKey = room.match?.flags?.join('|') || '';
  const scoreKey = room.match?.score?.join('-') || '';
  const prevCtf = useRef({ flags: [null, null], score: [0, 0], n: 0 });
  useEffect(() => {
    const m = room.match;
    if (!m?.flags) return;
    const prev = prevCtf.current.n === m.n ? prevCtf.current : { flags: [null, null], score: [0, 0], n: m.n };
    for (const i of [0, 1]) {
      if (m.score[i] > prev.score[i]) flash(`¡Punto para el equipo ${TEAMS[i].name.toLowerCase()}!`);
      else if (m.flags[i] && !prev.flags[i]) flash(`${findPlayer(room, m.flags[i])?.name || '¿?'} robó la bandera ${TEAMS[i].name.toLowerCase()}`);
      else if (!m.flags[i] && prev.flags[i]) flash(`La bandera ${TEAMS[i].name.toLowerCase()} volvió a su base`);
    }
    prevCtf.current = { flags: [...m.flags], score: [...m.score], n: m.n };
  }, [flagsKey, scoreKey, matchN]); // eslint-disable-line react-hooks/exhaustive-deps

  // Un disparo (mío o de otro): sus proyectiles, o el remolino que deja.
  function addShot(s, shot, owner, now) {
    if (shot.w === 'whirl') { s.zones.set(shot.k, zoneFromShot(shot)); return; }
    for (const b of projectilesFor(shot, owner)) {
      b.by = owner;
      b.sx = shot.x; b.sy = shot.y;
      // Llega tarde: se adelanta hasta ahora (solo se ve; explota cuando llega su `ex`).
      if (owner !== me.id) {
        const late = Math.min(0.5, Math.max(0, now - shot.t));
        for (let k = 0; k < late && !b.done; k += STEP) stepProjectile(b, STEP, s.t, [], s.mods.g);
      }
      if (!b.done) s.projectiles.set(b.k, b);
    }
  }

  // Si la explosión es de un tiro mío y alcanza a otro tanque: aviso en los eventos y el ícono sobre mi tanque.
  // El daño de verdad lo calcula la pantalla de quien lo recibe; acá es una estimación con su última posición.
  function registerHits(s, ex, w) {
    if (ex.o !== me.id || !w.radius) return;
    const t = performance.now() / 1000;
    for (const pl of alivePlayers(roomRef.current)) {
      if (pl.id === me.id || ally(pl.id)) continue;
      const v = s.remotes.get(pl.id);
      if (!v || v.snap.d || v.snap.m !== 'tank') continue;
      const hit = blastOn({ x: v.x, y: v.y }, ex);
      if (!hit) continue;
      const same = s.hitEvents.find((h) => h.id === pl.id && t - h.at < 1.2);
      if (same) { same.dmg += hit.damage; same.at = t; } else s.hitEvents.push({ k: ex.k, id: pl.id, name: pl.name, w: ex.w, dmg: hit.damage, at: t });
      s.badges.push({ kind: 'hit', at: t });
      s.hitDirty = true;
    }
  }

  // Una explosión (mía o de otro): cráter, zona, efecto y, si me alcanza, daño y empujón.
  function explode(s, ex, now) {
    const key = `x:${ex.k}`;
    if (s.seen.has(key) || !s.t) return;
    s.seen.add(key);
    s.projectiles.delete(ex.k);
    if (ex.w === 'drillseg') {
      // Un tramo del túnel del taladro: solo cava.
      const box = carve(s.t, ex.x, ex.y, DRILL_R);
      if (box) repaint(s.view, s.t, box);
      burst(s.particles, ex.x, ex.y, { n: 5, speed: 45, life: 0.5, colors: ['#e0e0e6', '#b8b8c2', '#9a5a2c', '#ffd27a'] });
      return;
    }
    const w = ITEMS[ex.w] || ITEMS.rocket;
    if (w.crater) {
      const box = carve(s.t, ex.x, ex.y, w.crater);
      if (box) repaint(s.view, s.t, box);
    }
    if (w.fill) {
      // Cemento: rellena de tierra alrededor de donde pegó (si me tapa, me saca para afuera).
      const box = fillCircle(s.t, ex.x, ex.y, w.fill);
      if (box) repaint(s.view, s.t, box);
      if (s.local && !s.local.dead && s.local.mode === 'tank' && overlaps(s.t, s.local.x, s.local.y)) { unstick(s.t, s.local); s.local.stuck = false; s.local.vx = 0; s.local.vy = 0; }
      burst(s.particles, ex.x, ex.y, { n: 18, speed: 50, life: 0.7, colors: ['#e8c79d', '#b0875a', '#8a6a44'] });
    }
    if (w.flare) s.zones.set(ex.k, { kind: 'strike', x: ex.x, y: ex.y, until: (ex.t || now) + STRIKE_DELAY + STRIKE_BOMBS * STRIKE_GAP + 1.2, o: ex.o });
    if (ex.w === 'shock') s.effects.push({ ring: true, x: ex.x, y: ex.y, r: w.radius, age: 0 });
    if (w.zone) s.zones.set(ex.k, { kind: w.zone, x: ex.x, y: ex.y, until: (ex.t || now) + ZONES[w.zone].time, o: ex.o });
    if (ex.w === 'laser' && ex.sx != null) s.effects.push({ beam: true, x0: ex.sx, y0: ex.sy, x: ex.x, y: ex.y, age: 0 });
    if (w.radius) {
      s.effects.push({ x: ex.x, y: ex.y, r: w.radius * 0.8, age: 0 });
      burst(s.particles, ex.x, ex.y, { n: Math.round(w.crater * 1.4) + 4, speed: 60 + w.crater * 4 });
    } else {
      burst(s.particles, ex.x, ex.y, { n: 14, speed: 50, colors: ex.w === 'poison' ? ['#7cf05a', '#c8ff9a'] : ['#d9dde3', '#aab2bd'] });
    }
    registerHits(s, ex, w);
    // Las máquinas las lastima la explosión de cualquiera de los jugadores; la vida la lleva la pantalla del anfitrión.
    if (s.hostBots && s.bots && w.radius && !isBot(ex.o)) {
      for (const b of s.bots) {
        const hitB = !b.dead && blastOn(b, ex);
        if (hitB) { b.hp -= hitB.damage; push(b, hitB.vx * 0.7, hitB.vy * 0.7); }
      }
    }
    const p = s.local;
    if (!p || p.dead || p.mode !== 'tank') return;
    if (w.noSelf && ex.o === me.id) return;
    const hit = blastOn(p, ex);
    if (!hit) return;
    // La explosión del tiro propio empuja menos: si no, un tiro al piso te mandaba al cielo.
    const own = ex.o === me.id ? 0.7 : 1;
    push(p, hit.vx * own, hit.vy * own);
    s.shake = Math.max(s.shake, Math.min(1, hit.damage / 40));
    if (ex.o !== me.id && !ally(ex.o)) {
      p.hp -= hit.damage;
      p.lastBy = ex.o;
      p.lastW = ex.w;
      p.lastHitAt = now;
      p.hurtUntil = performance.now() / 1000 + 0.15;
    }
  }

  // ─── Red ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.cohetesChannel(code);
    const s = sim.current;
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== s.n || !s.t) return;
      const prev = s.remotes.get(id);
      const t = performance.now() / 1000;
      if (prev && snap.bo && snap.bo !== prev.snap.bo) {
        const mz = muzzle(snap, snap.a || 0);
        puff(s.particles, mz.x, mz.y, snap.a || 0);
      }
      s.lastSeen.set(id, t);
      if (!prev || snap.t > prev.snap.t) {
        if (prev && !prev.snap.d && snap.d) burst(s.particles, snap.x, snap.y, { n: 40, colors: ['#ffe066', '#ff5a4f', '#555', '#fff'], speed: 140, life: 1 });
        const jump = !prev || prev.snap.m !== snap.m || Math.hypot(snap.x - prev.x, snap.y - prev.y) > 60;
        // Se teletransportó: chispas violetas donde estaba y donde apareció.
        if (prev && jump && prev.snap.m === 'tank' && snap.m === 'tank' && !snap.d) {
          for (const at of [prev, snap]) burst(s.particles, at.x, at.y, { n: 22, colors: ['#e5ccff', '#b86bff', '#ffffff'], speed: 70, life: 0.6 });
        }
        s.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, treads: (prev?.treads || 0) + Math.hypot(snap.x - (prev?.snap.x ?? snap.x), snap.y - (prev?.snap.y ?? snap.y)) });
      }
      const now = serverNow();
      for (const shot of snap.sh || []) {
        if (s.seen.has(shot.k)) continue;
        s.seen.add(shot.k);
        addShot(s, shot, shot.o || id, now); // `o`: los tiros de una máquina los manda el anfitrión, pero son de ella
      }
      for (const ex of snap.ex || []) explode(s, ex, now);
      // Las máquinas: las manda el anfitrión.
      if (snap.bt && id === roomRef.current.hostId) {
        for (const [i, x, y, nx, ny, a, hp, d] of snap.bt) {
          const bid = botId(i), v = s.botViews.get(bid);
          if (d && v && !v.d) burst(s.particles, v.x, v.y, { n: 36, colors: ['#ffe066', '#ff5a4f', '#9aa6b5', '#fff'], speed: 120, life: 0.9 });
          const jump = !v || Math.hypot(x - v.tx, y - v.ty) > 60;
          s.botViews.set(bid, { x: jump ? x : v.x, y: jump ? y : v.y, tx: x, ty: y, nx, ny, a, hp, d, treads: (v?.treads || 0) + (v ? Math.hypot(x - v.tx, y - v.ty) : 0) });
        }
      }
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
    let cam = { x: 0, y: 0, scale: 2, w: 1, h: 1 };
    // El agua: sube en los modos con agua; en los de tormenta se queda en su nivel de abajo (caerse sigue siendo morir).
    const waterLevel = (r, elapsed) => (hasWater(s.mode) ? waterY(Math.max(0, elapsed), s.t.H, r.options.water) : waterY(0, s.t.H));

    // Apuntar: del tanque al mouse (en el mundo). También al hacer clic, antes del paso que dispara.
    function aim() {
      const p = s.local, c0 = s.cam;
      if (!s.mouse.in || !p || !c0) return;
      const wx = (s.mouse.x * s.dpr - c0.w / 2) / c0.scale + c0.x;
      const wy = (s.mouse.y * s.dpr - c0.h / 2) / c0.scale + c0.y;
      const c = turret(p);
      s.angle = Math.atan2(wy - c.y, wx - c.x);
      s.aimDist = Math.hypot(wx - c.x, wy - c.y);
    }
    s.aim = aim;

    // Dispara el arma `w` hacia donde apunta (o con un desvío, en la ráfaga).
    function emit(p, m, now, w, spread = 0) {
      const a = s.angle + spread;
      const mz = muzzle(p, a);
      const shot = { k: `${me.id}:${m.n}:${s.seq++}`, t: now, x: round1(mz.x), y: round1(mz.y), a: Math.round(a * 1000) / 1000, w };
      s.seen.add(shot.k);
      addShot(s, shot, me.id, now);
      s.myShots.push(shot);
      const kick = (KICK[w] ?? 0.7) * RECOIL;
      push(p, -Math.cos(a) * kick, -Math.sin(a) * kick);
    }

    // Usa lo que hay en la casilla elegida.
    function use(p, m, now) {
      const slot = p.sel;
      const w = slot === 0 ? 'rocket' : p.inv[slot - 1]?.w;
      if (!w) { p.sel = 0; return; }
      if (w === 'rocket') {
        if (p.shots <= 0) return;
        p.shots -= 1;
        emit(p, m, now, 'rocket');
        p.readyAt = now + SHOT_GAP;
        return;
      }
      const item = ITEMS[w];
      if (w === 'teleport') {
        const from = turret(p);
        const dest = teleportTarget(s.t, from, s.angle, s.aimDist);
        if (!dest || Math.hypot(dest.x - from.x, dest.y - from.y) < 20) { flash('No hay lugar ahí'); return; }
        burst(s.particles, p.x, p.y, { n: 22, colors: ['#e5ccff', '#b86bff', '#ffffff'], speed: 70, life: 0.6 });
        Object.assign(p, { x: dest.x, y: dest.y, vx: 0, vy: 0, stuck: false, nx: 0, ny: -1 });
        burst(s.particles, p.x, p.y, { n: 22, colors: ['#e5ccff', '#b86bff', '#ffffff'], speed: 70, life: 0.6 });
        s.shake = Math.max(s.shake, 0.25);
      } else if (w === 'turbo') p.turboUntil = now + item.time;
      else if (w === 'medkit') {
        p.hp = Math.min(p.maxHp, p.hp + item.heal);
        burst(s.particles, p.x, p.y, { n: 18, colors: ['#2ecf8a', '#ffffff'], speed: 50 });
        flash(`+${item.heal} de vida`);
      } else if (w === 'shock') {
        const ex = { k: `${me.id}:${m.n}:${s.seq++}`, x: round1(p.x), y: round1(p.y), w: 'shock', o: me.id, t: now };
        s.myBooms.push(ex);
        explode(s, ex, now);
      } else if (w === 'rapid') { p.burst = item.burst; p.burstAt = now; }
      else if (w === 'shield') p.shieldUntil = now + SHIELD_TIME;
      else if (w === 'jetpack') { p.jetUntil = now + JET_TIME; p.jetA = s.angle; }
      else if (item.kind === 'charge') p.chargeUntil = now + LASER_CHARGE;
      else emit(p, m, now, w);
      p.inv = useItem(p.inv, slot);
      if (!p.inv[slot - 1]) p.sel = 0;
      p.readyAt = now + ITEM_GAP;
    }

    // Roba la bandera: el que murió vuelve a aparecer de su lado, a una altura al azar.
    function respawnTank() {
      const team = findPlayer(roomRef.current, me.id)?.team ?? 0;
      const sp = spawnSpot(s.t, team, Math.random);
      s.local = newTank(sp.x, sp.y, 'tank', s.mode.hp);
      s.deathSent = false;
      burst(s.particles, sp.x, sp.y, { n: 22, colors: ['#e5ccff', '#b86bff', '#ffffff'], speed: 70, life: 0.6 });
    }

    // Las máquinas: las corre solo el anfitrión (las demás pantallas las ven en su foto).
    const botTargets = () => {
      const list = [];
      const me0 = s.local;
      if (me0 && !me0.dead && me0.mode !== 'ship') list.push({ id: me.id, x: me0.x, y: me0.y });
      for (const [id, v] of s.remotes) if (!v.snap.d && v.snap.m !== 'ship' && findPlayer(roomRef.current, id)?.inGame) list.push({ id, x: v.x, y: v.y });
      return list;
    };
    function stepBots(r, m, now, elapsed) {
      s.hostBots = Boolean(s.mode.machines && r.hostId === me.id && elapsed > 0);
      if (!s.hostBots) { if (r.hostId !== me.id) s.bots = null; return; }
      const n = botCount(m.size);
      if (!s.bots) s.bots = Array.from({ length: n }, (_, i) => newBot(s.t, m.seed, i, n));
      const targets = botTargets();
      const level = waterLevel(r, elapsed);
      s.bots.forEach((b, i) => {
        if (b.dead) { if (now >= b.respawnAt) s.bots[i] = newBot(s.t, m.seed, i, n, b.round + 1); return; }
        const th = botThink(b, targets, now);
        stepTank(b, th.dir, STEP, s.t, { g: 1, drive: BOT_DRIVE });
        if (th.fire != null) {
          const mz = muzzle(b, th.fire);
          const shot = { k: `${b.id}:${m.n}:${s.seq++}`, t: now, x: round1(mz.x), y: round1(mz.y), a: Math.round(th.fire * 1000) / 1000, w: 'rocket', o: b.id };
          s.seen.add(shot.k);
          addShot(s, shot, b.id, now);
          s.myShots.push(shot);
        }
        if (b.hp <= 0 || b.y > level) {
          b.dead = true; b.respawnAt = now + BOT_RESPAWN;
          burst(s.particles, b.x, b.y, { n: 36, colors: ['#ffe066', '#ff5a4f', '#9aa6b5', '#fff'], speed: 120, life: 0.9 });
        }
      });
    }

    function step(now) {
      const r = roomRef.current;
      const m = r.match;
      if (m && s.t && s.ctf && s.local?.dead && now >= s.local.respawnAt) respawnTank();
      const p = s.local;
      if (!m || !p || !s.t) return;
      const elapsed = now - m.startsAt / 1000;
      const mine = findPlayer(r, me.id);
      // Un clic cortito (que empieza y termina entre dos pasos) también cuenta como un tiro.
      // En roba la bandera, durante la cuenta regresiva nadie dispara ni maneja.
      const frozen = s.ctf && elapsed < 0;
      const shoot = (s.input.shoot || s.pressed) && !frozen;
      s.pressed = false;
      stepBots(r, m, now, elapsed);

      if (!p.dead) {
        if (p.mode === 'ship') {
          // En el helicóptero: se viaja con él y un tiro te tira (o te tira solo al llegar al otro lado).
          const ship = shipAt(elapsed, s.t.W, s.t.H, s.ship);
          p.x = ship.x; p.y = ship.y + 18;
          if (!shoot) s.shootHeld = false;
          const wantOut = shoot && elapsed >= DEPLOY_AFTER && !s.shootHeld;
          // Si no saltaste, te tira solo antes de que baje hasta el agua.
          if (wantOut || ship.f > 0.75) {
            p.mode = 'chute'; p.vx = 0; p.vy = 0;
            // El que entra (o recarga la página) con los helicópteros ya idos cae adentro del mapa.
            p.x = Math.max(80, Math.min(s.t.W - 80, p.x));
            s.shootHeld = true;
          }
        } else {
          const dir = frozen ? 0 : (s.input.right ? 1 : 0) - (s.input.left ? 1 : 0);
          // Jetpack y remolinos: empujan mientras duran.
          if (p.mode === 'tank' && now < p.jetUntil) {
            const f = jetForce(p.jetA);
            thrust(p, f.x, f.y, STEP, JET_MAX);
            if (Math.random() < 0.7) burst(s.particles, p.x + Math.cos(p.jetA) * 6, p.y + Math.sin(p.jetA) * 6, { n: 1, colors: ['#ffe27a', '#ffb347', '#ff6a2a'], speed: 38, life: 0.4 });
          }
          for (const z of s.zones.values()) {
            if (now > z.until) continue;
            if (z.kind === 'whirl' && p.mode === 'tank' && inWhirl(z, p.x, p.y)) thrust(p, Math.cos(z.a) * ITEMS.whirl.push, Math.sin(z.a) * ITEMS.whirl.push, STEP);
            // El veneno lastima a todos los que están adentro, también al que lo tiró.
            if (z.kind === 'poison' && !(z.o && ally(z.o)) && Math.hypot(p.x - z.x, p.y - z.y) < ZONES.poison.radius) {
              p.hp -= ZONES.poison.dps * STEP;
              if (z.o && z.o !== me.id) { p.lastBy = z.o; p.lastW = 'poison'; p.lastHitAt = now; }
            }
          }
          stepTank(p, dir, STEP, s.t, { g: s.mods.g, drive: now < p.turboUntil ? ITEMS.turbo.mult : 1 });
          reload(p, now, RELOAD);
          if (now < p.turboUntil && p.mode === 'tank' && Math.random() < 0.5) burst(s.particles, p.x - p.nx * 2, p.y - p.ny * 2, { n: 1, colors: ['#ffd23f', '#ff8a22'], speed: 24, life: 0.35 });
          if (!shoot) s.shootHeld = false;
          if (p.mode === 'tank' && shoot && !s.shootHeld && now >= p.readyAt && !p.chargeUntil && !p.burst) use(p, m, now);
          // En paracaídas, el «disparo» es un impulso sin daño que saca humo (se puede mantener apretado).
          if (p.mode === 'chute' && shoot && !s.shootHeld && now >= p.readyAt) {
            chuteBoost(p, s.angle);
            p.readyAt = now + CHUTE_GAP;
            p.boostAt = round1(now);
            const mz = muzzle(p, s.angle);
            puff(s.particles, mz.x, mz.y, s.angle);
          }
          // Ráfaga: cinco cohetitos seguidos, apenas abiertos.
          if (p.burst > 0 && now >= p.burstAt) {
            emit(p, m, now, 'rapid', [0, -0.05, 0.05, -0.1, 0.1][5 - p.burst] || 0);
            p.burst -= 1;
            p.burstAt = now + 0.08;
          }
          // Láser: cuando termina de cargar, sale.
          if (p.chargeUntil && now >= p.chargeUntil) { p.chargeUntil = 0; emit(p, m, now, 'laser'); }
        }
        // La tormenta: no mata al toque, pero saca vida todo el tiempo que estés afuera del círculo.
        s.inStorm = false;
        if (hasStorm(s.mode) && elapsed > 0 && p.mode !== 'ship') {
          s.storm = stormAt(elapsed, m.seed, s.t.W, s.t.H, r.options.water);
          if (inStorm(s.storm, p.x, p.y)) { s.inStorm = true; p.hp -= STORM_DPS * STEP; p.stormTick = now; }
        }
        // Agua o sin vida: afuera.
        const level = waterLevel(r, elapsed);
        if (elapsed > 0 && p.mode !== 'ship' && (p.y > level || p.hp <= 0)) {
          p.dead = true;
          p.respawnAt = now + RESPAWN_S;
          burst(s.particles, p.x, p.y, { n: 46, colors: ['#ffe066', '#ff5a4f', '#555', '#fff'], speed: 150, life: 1 });
          if (!s.deathSent && mine?.alive) {
            s.deathSent = true;
            const recent = p.lastBy && now - p.lastHitAt < KILL_CREDIT;
            const byBot = recent && isBot(p.lastBy); // lo eliminó una máquina: no es un jugador, así que va como causa
            const byStorm = !recent && p.hp <= 0 && now - (p.stormTick ?? -99) < 0.5;
            dispatchRef.current({ type: 'died', match: m.n, by: recent && !byBot ? p.lastBy : null, w: byBot ? 'robot' : recent ? p.lastW : byStorm ? 'storm' : null });
          }
        }
        // Monedas.
        if (p.mode !== 'ship' && !p.dead) {
          s.coinSpots.forEach((c, i) => {
            if (m.coins[i] || s.pendingCoins.has(i)) return;
            if (Math.hypot(c.x - p.x, c.y - p.y) < 9) {
              s.pendingCoins.add(i);
              dispatchRef.current({ type: 'coin', match: m.n, i });
            }
          });
        }
        // Roba la bandera: al llegar a la del otro equipo la agarrás; con ella, al tocar la tuya (si está en su base) sumás un punto.
        if (s.ctf && elapsed > 0 && p.mode === 'tank' && !p.dead && mine && m.flags && now - s.flagAt > FLAG_COOLDOWN) {
          const my = mine.team, en = 1 - my;
          if (m.flags[en] == null && !m.flags.includes(me.id) && nearFlag(p, s.t.bases[en])) {
            s.flagAt = now;
            dispatchRef.current({ type: 'flagTake', match: m.n, team: en });
          } else if (m.flags[en] === me.id && m.flags[my] == null && nearFlag(p, s.t.bases[my])) {
            s.flagAt = now;
            dispatchRef.current({ type: 'flagCapture', match: m.n });
          }
        }
      }

      // Cajas: las que caen en paracaídas cada tanto, y las piezas sueltas que flotan en recintos cerrados del mapa
      // (`float`: no caen aunque rompas la roca, hay que ir a buscarlas).
      for (let i = 0; i < MAX_DROPS; i++) {
        const info = crateInfo(i, m.seed, s.t.W);
        if (info.at > elapsed) break;
        if (!s.crates.has(i) && !m.crates[i]) s.crates.set(i, { x: info.x, y: -20, falling: true, weapon: info.weapon, drop: true });
      }
      for (const [i, c] of s.crates) {
        if (m.crates[i]) { s.crates.delete(i); continue; }
        if (!c.float && !solid(s.t, c.x, c.y + 0.5)) { c.y += (c.falling ? 40 : 150) * STEP; if (c.y > s.t.H + 40) s.crates.delete(i); }
        else c.falling = false;
        if (p.dead || p.mode !== 'tank' || s.pendingCrates.has(i) || Math.hypot(c.x - p.x, (c.float ? c.y : c.y - 5) - p.y) > 12) continue;
        // La curita se usa al agarrarla; lo demás va al inventario (sin lugar, la caja queda ahí).
        const heal = c.weapon === 'heal';
        if (!heal && !addItem(p.inv, c.weapon)) continue;
        s.pendingCrates.add(i);
        dispatchRef.current({ type: 'crate', match: m.n, i }).then((res) => {
          if (res?.committed && res.room?.match?.crates?.[i] === me.id) {
            if (heal) {
              p.hp = Math.min(p.maxHp, p.hp + HEAL);
              burst(s.particles, p.x, p.y, { n: 16, colors: ['#ff4d5e', '#ffffff'], speed: 50 });
              flash(`+${HEAL} de vida`);
              return;
            }
            const inv = addItem(p.inv, c.weapon);
            if (inv) { p.inv = inv; flash(`${ITEMS[c.weapon].name}`); }
          } else s.pendingCrates.delete(i);
        });
      }

      // Proyectiles: los míos deciden dónde explotan; los de otros solo se ven.
      const others = [];
      for (const pl of alivePlayers(r)) {
        if (pl.id === me.id || ally(pl.id)) continue;
        const v = s.remotes.get(pl.id);
        if (v && !v.snap.d && v.snap.m === 'tank') others.push({ id: pl.id, x: v.x, y: v.y, shield: (v.snap.sd || 0) > now });
      }
      const self = !p.dead && p.mode === 'tank' ? { id: me.id, x: p.x, y: p.y, shield: p.shieldUntil > now } : null;
      // Las máquinas también son blanco de mis tiros; y los tiros de una máquina (que juzga el anfitrión) le pueden pegar a cualquiera.
      const botPts = s.hostBots && s.bots ? s.bots.filter((b) => !b.dead) : [...s.botViews.values()].filter((v) => !v.d);
      const botTargetsNow = botPts.map((v, i) => ({ id: v.id || `${botId(i)}~`, x: v.x, y: v.y, shield: false }));
      const everyone = [];
      for (const pl of inGame(r)) {
        const v = pl.id !== me.id && s.remotes.get(pl.id);
        if (v && !v.snap.d && v.snap.m === 'tank') everyone.push({ id: pl.id, x: v.x, y: v.y, shield: (v.snap.sd || 0) > now });
      }
      if (self) everyone.push(self);
      for (const b of s.projectiles.values()) {
        // En los remolinos, los proyectiles también se aceleran para ese lado.
        for (const z of s.zones.values()) {
          if (z.kind === 'whirl' && now < z.until && inWhirl(z, b.x, b.y)) { b.vx += Math.cos(z.a) * 500 * STEP; b.vy += Math.sin(z.a) * 500 * STEP; }
        }
        const botShot = isBot(b.by) && s.hostBots;
        const mineShot = b.by === me.id || botShot;
        // Uno devuelto por un escudo ya puede pegarle al que lo tiró (y no al del escudo).
        const targets = !mineShot ? [] : botShot ? everyone.filter((tk) => tk.id !== b.reflectedBy) : b.reflectedBy ? [...others, ...(self ? [self] : [])].filter((tk) => tk.id !== b.reflectedBy) : [...others, ...botTargetsNow];
        const hit = stepProjectile(b, STEP, s.t, targets, s.mods.g);
        if (mineShot) {
          for (const tn of b.tunnels) {
            const ex = { k: `${b.k}#${s.seq++}`, x: round1(tn.x), y: round1(tn.y), w: 'drillseg', o: me.id, t: now };
            s.myBooms.push(ex);
            explode(s, ex, now);
          }
          b.tunnels.length = 0;
          if (hit) {
            const ex = { k: b.k, x: round1(hit.x), y: round1(hit.y), w: b.w, o: b.owner, t: now };
            if (b.w === 'laser') { ex.sx = b.sx; ex.sy = b.sy; }
            s.myBooms.push(ex);
            explode(s, ex, now);
            // La bengala del ataque aéreo: unos instantes después caen las bombas desde arriba, repartidas.
            if (b.w === 'strike') {
              for (let i = 0; i < STRIKE_BOMBS; i++) {
                const off = (i - (STRIKE_BOMBS - 1) / 2) * (STRIKE_SPREAD / (STRIKE_BOMBS - 1)) * 2 + (((i * 37) % 11) - 5) * 1.5;
                s.strikes.push({ at: now + STRIKE_DELAY + i * STRIKE_GAP, x: round1(hit.x + off), y: round1(Math.max(-30, hit.y - STRIKE_HEIGHT)) });
              }
            }
          }
        } else b.tunnels.length = 0;
      }
      // Las bombas del ataque aéreo que ya les toca caer (las tiro yo, así que explotan donde yo decida).
      while (s.strikes.length && now >= s.strikes[0].at) {
        const st = s.strikes.shift();
        const shot = { k: `${me.id}:${m.n}:${s.seq++}`, t: now, x: st.x, y: st.y, a: 1.571, w: 'airbomb' };
        s.seen.add(shot.k);
        addShot(s, shot, me.id, now);
        s.myShots.push(shot);
      }
      for (const [k, b] of s.projectiles) if (b.done) s.projectiles.delete(k);
      for (const [k, z] of s.zones) if (now > z.until + 1) s.zones.delete(k);
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
        const k = Math.min(1, dt * 16);
        v.x += (tx - v.x) * k;
        v.y += (ty - v.y) * k;
      }

      for (const v of s.botViews.values()) { const k = Math.min(1, dt * 12); v.x += (v.tx - v.x) * k; v.y += (v.ty - v.y) * k; }

      // Roba la bandera: se acabó el tiempo (lo avisa cualquier pantalla; la sala deja pasar a una).
      if (s.ctf && m.endsAt && now * 1000 >= m.endsAt && r.phase === 'playing' && now - s.tickAt > 1) {
        s.tickAt = now;
        dispatchRef.current({ type: 'tick', match: m.n });
      }

      // Mandar la foto.
      if (now - s.sentAt >= SEND_EVERY) {
        s.sentAt = now;
        s.myShots = s.myShots.filter((e) => now - e.t < EVENT_KEEP);
        s.myBooms = s.myBooms.filter((e) => now - e.t < EVENT_KEEP);
        const snap = {
          n: m.n, t: now, x: round1(p.x), y: round1(p.y), vx: Math.round(p.vx), vy: Math.round(p.vy), nx: Math.round(p.nx * 100) / 100,
          ny: Math.round(p.ny * 100) / 100, m: p.mode, a: Math.round(s.angle * 100) / 100, hp: Math.max(0, Math.round(p.hp)), mh: p.maxHp, tu: now < p.turboUntil ? 1 : 0, d: p.dead ? 1 : 0,
          sd: p.shieldUntil > now ? round1(p.shieldUntil) : 0, bo: p.boostAt || 0, jt: now < p.jetUntil ? 1 : 0, ch: p.chargeUntil ? 1 : 0, sh: s.myShots, ex: s.myBooms,
        };
        // Las máquinas viajan en la foto del anfitrión: [número, x, y, nx, ny, ángulo, vida, ¿destruida?].
        if (s.hostBots && s.bots) snap.bt = s.bots.map((b) => [b.i, round1(b.x), round1(b.y), Math.round(b.nx * 100) / 100, Math.round(b.ny * 100) / 100, Math.round(b.aim * 100) / 100, Math.max(0, Math.round(b.hp)), b.dead ? 1 : 0]);
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
      const reloadF = p.shots < MAX_AMMO ? Math.round(Math.max(0, Math.min(1, 1 - (p.reloadAt - now) / RELOAD)) * 10) / 10 : 0;
      const charge = p.chargeUntil ? Math.round(Math.min(1, 1 - (p.chargeUntil - now) / LASER_CHARGE) * 10) / 10 : 0;
      const jet = now < p.jetUntil ? Math.round(((p.jetUntil - now) / JET_TIME) * 40) / 40 : 0;
      const turbo = now < p.turboUntil ? Math.round(((p.turboUntil - now) / ITEMS.turbo.time) * 40) / 40 : 0;
      const st = s.storm && elapsed > 0 ? s.storm : null;
      const zone = st ? { shrinking: st.shrinking, left: Math.ceil(st.left), final: !st.next } : null;
      const ctfLeft = s.ctf && m.endsAt ? Math.max(0, Math.ceil(m.endsAt / 1000 - now)) : null;
      const respawn = s.ctf && p.dead ? Math.max(0, Math.ceil(p.respawnAt - now)) : 0;
      const key = [ctfLeft, respawn, Math.round(p.hp), p.maxHp, JSON.stringify(p.inv), p.sel, p.shots, reloadF, charge, jet, turbo, p.dead, p.mode, Math.ceil(-elapsed), elapsed > 25 && elapsed < 32, !!s.inStorm, zone && `${zone.shrinking}${zone.left}${zone.final}`].join('|');
      if (key !== s.hudKey) {
        s.hudKey = key;
        setHud({ ctfLeft, respawn, hp: Math.max(0, Math.round(p.hp)), maxHp: p.maxHp, zone, inStorm: !!s.inStorm, turbo, inv: p.inv, sel: p.sel, shots: p.shots, reloadF, charge, jet, dead: p.dead, mode: p.mode, elapsed });
      }
      // Eventos de golpe (arriba a la derecha): duran unos segundos.
      const nowS = performance.now() / 1000;
      const kept = s.hitEvents.filter((h) => nowS - h.at < 4);
      if (kept.length !== s.hitEvents.length) { s.hitEvents = kept; s.hitDirty = true; }
      if (s.hitDirty) { s.hitDirty = false; setHits(s.hitEvents.slice(-4).reverse().map((h) => ({ ...h }))); }
      if (!hidden) draw(r, m, now, dt);
    }

    function draw(r, m, now, dt) {
      const canvas = canvasRef.current, wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(wrap.clientWidth * dpr), ch = Math.round(wrap.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const ctx = canvas.getContext('2d');
      const p = s.local;
      const elapsed = now - m.startsAt / 1000;
      const theme = s.t.theme;
      // Cámara: sigue a mi tanque; muerto, al que me mató o a alguien vivo.
      let follow = p;
      if (p.dead) {
        const ids = [p.lastBy, ...alivePlayers(r).map((pl) => pl.id)];
        const v = ids.map((id) => s.remotes.get(id)).find((x) => x && !x.snap.d && x.snap.m !== 'ship');
        if (v) follow = v;
      }
      const scale = cw / VIEW_W;
      const viewH = ch / scale;
      const tx = Math.max(VIEW_W / 2 - 40, Math.min(s.t.W - VIEW_W / 2 + 40, follow.x));
      const ty = Math.max(viewH / 2 - 40, Math.min(s.t.H - viewH / 2 + 30, follow.y));
      const k = cam.w > 1 && Math.hypot(tx - cam.x, ty - cam.y) < 400 ? Math.min(1, dt * 7) : 1;
      cam = { x: cam.x + (tx - cam.x) * k, y: cam.y + (ty - cam.y) * k, scale, w: cw, h: ch };
      s.shake = Math.max(0, s.shake - dt * 2.5);
      const shaken = { ...cam, x: cam.x + (Math.random() - 0.5) * s.shake * 5, y: cam.y + (Math.random() - 0.5) * s.shake * 5 };

      s.cam = cam;
      s.dpr = dpr;
      aim();

      const level = waterLevel(r, elapsed);
      drawSky(ctx, shaken, now, theme);
      drawTerrain(ctx, shaken, s.view);
      setWorld(ctx, shaken);
      drawDecorations(ctx, shaken, s.deco, s.t, now);
      drawZones(ctx, s.zones.values(), now, false);
      // Roba la bandera: las bases y las banderas que están en su lugar (las que se llevan van arriba de quien las lleva).
      if (s.ctf && s.t.bases) {
        for (const i of [0, 1]) {
          drawBase(ctx, s.t.bases[i], TEAMS[i].color, now);
          if (!m.flags?.[i]) drawFlag(ctx, s.t.bases[i].x, s.t.bases[i].y, TEAMS[i].color, now);
        }
      }
      s.coinSpots.forEach((c, i) => { if (!m.coins[i] && !s.pendingCoins.has(i)) drawCoin(ctx, c, now); });
      for (const c of s.crates.values()) drawCrate(ctx, c, now);
      if (!s.ctf) for (let kk = 0; kk < 2; kk++) { const ship = shipAt(elapsed, s.t.W, s.t.H, kk); if (!ship.gone) drawShip(ctx, ship, now, (back) => shipAt(elapsed - back, s.t.W, s.t.H, kk)); }
      for (const pl of alivePlayers(r)) {
        if (pl.id === me.id) continue;
        const v = s.remotes.get(pl.id);
        if (!v || v.snap.d || v.snap.m === 'ship') continue;
        drawTank(ctx, { x: v.x, y: v.y, nx: v.snap.nx, ny: v.snap.ny, treads: v.treads }, pl.color, v.snap.a, { chute: v.snap.m === 'chute', shield: (v.snap.sd || 0) > now, now, team: teamColor(pl.id) });
        if (v.snap.jt) burst(s.particles, v.x, v.y, { n: 1, colors: ['#ffb347', '#ff6a2a'], speed: 30, life: 0.3 });
        if (v.snap.tu && Math.random() < 0.5) burst(s.particles, v.x, v.y, { n: 1, colors: ['#ffd23f', '#ff8a22'], speed: 24, life: 0.35 });
        if (v.snap.ch) drawLaserAim(ctx, turret(v), v.snap.a, 0.5);
        drawLabel(ctx, v, pl.name, (v.snap.hp / (v.snap.mh || HP)) * 100, false, teamColor(pl.id));
        const carried = m.flags?.indexOf(pl.id);
        if (carried >= 0) drawFlag(ctx, v.x - 3, v.y + 2, TEAMS[carried].color, now, true);
      }
      // Las máquinas: las del anfitrión, o lo que él manda.
      const machines = s.hostBots && s.bots ? s.bots.filter((b) => !b.dead).map((b) => ({ x: b.x, y: b.y, nx: b.nx, ny: b.ny, treads: b.treads, a: b.aim, hp: b.hp }))
        : [...s.botViews.values()].filter((v) => !v.d).map((v) => ({ x: v.x, y: v.y, nx: v.nx, ny: v.ny, treads: v.treads, a: v.a, hp: v.hp }));
      for (const b of machines) {
        drawTank(ctx, b, '#8a95a3', b.a, { now, robot: true });
        drawLabel(ctx, b, '', (b.hp / BOT_HP) * 100, false, null);
      }
      const mine = findPlayer(r, me.id);
      if (!p.dead && mine && p.mode !== 'ship') {
        drawTank(ctx, p, mine.color, s.angle, { hurt: (p.hurtUntil || 0) > performance.now() / 1000, chute: p.mode === 'chute', shield: p.shieldUntil > now, now, team: teamColor(me.id) });
        if (p.chargeUntil) drawLaserAim(ctx, muzzle(p, s.angle), s.angle, 1 - (p.chargeUntil - now) / LASER_CHARGE);
        drawLabel(ctx, p, mine.name, (p.hp / p.maxHp) * 100, true, teamColor(me.id));
        const myFlag = m.flags?.indexOf(me.id);
        if (myFlag >= 0) drawFlag(ctx, p.x - 3, p.y + 2, TEAMS[myFlag].color, now, true);
        s.badges = s.badges.filter((b) => performance.now() / 1000 - b.at < 0.6);
        drawBadges(ctx, p, s.badges, performance.now() / 1000);
        // Flecha roja hacia el enemigo más cercano.
        let near = null, nd = Infinity;
        for (const pl of alivePlayers(r)) {
          const v = pl.id !== me.id && !ally(pl.id) && s.remotes.get(pl.id);
          if (!v || v.snap.d || v.snap.m === 'ship') continue;
          const d = Math.hypot(v.x - p.x, v.y - p.y);
          if (d < nd) { nd = d; near = v; }
        }
        if (near && nd > 60) drawArrow(ctx, p, Math.atan2(near.y - p.y, near.x - p.x));
      }
      for (const b of s.projectiles.values()) if (!b.done) drawProjectile(ctx, b);
      s.effects = s.effects.filter((e) => e.age < 0.35);
      s.particles = s.particles.filter((q) => q.age < q.life);
      drawEffects(ctx, s.effects, s.particles, dt);
      drawZones(ctx, s.zones.values(), now, true);
      drawWater(ctx, shaken, level, now, theme);
      if (s.storm && elapsed > 0 && hasStorm(s.mode)) drawStorm(ctx, shaken, s.storm, now);
      // En el helicóptero: un anillo que marca dónde estás, como en el original.
      if (p.mode === 'ship' && !p.dead) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(p.x, p.y - 12, 11, 0, Math.PI * 2); ctx.stroke();
      }
      // Mapa chico: la zona (agua o tormenta), mi tanque y los demás.
      if (p.mode !== 'ship') {
        const others = [];
        for (const pl of alivePlayers(r)) {
          const v = pl.id !== me.id && s.remotes.get(pl.id);
          if (v && !v.snap.d && v.snap.m !== 'ship') others.push({ x: v.x, y: v.y, color: teamColor(pl.id) || pl.color });
        }
        for (const b of machines) others.push({ x: b.x, y: b.y, color: '#9aa6b5', square: true });
        // Las banderas en el mapa chico: en su base, o donde está quien la lleva.
        const flags = [];
        if (s.ctf && s.t.bases) {
          for (const i of [0, 1]) {
            const carrier = m.flags?.[i];
            const at = !carrier ? s.t.bases[i] : carrier === me.id ? p : s.remotes.get(carrier);
            if (at) flags.push({ x: at.x, y: at.y, color: TEAMS[i].color });
          }
        }
        drawMinimap(ctx, { ...cam, dpr }, s.view, s.t, { me: p.dead ? null : p, others, storm: hasStorm(s.mode) && elapsed > 0 ? s.storm : null, level: hasWater(s.mode) ? level : null, theme, flags });
      }
    }

    const stop = everyFrame(frame);
    window.__cohetes = s; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__cohetes === s) delete window.__cohetes; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ──────────────────────────────────────────────────────
  function select(slot) {
    const p = sim.current.local;
    if (!p) return;
    if (slot === 0 || p.inv[slot - 1]) p.sel = slot;
  }
  const selectRef = useRef(select);
  selectRef.current = select;
  useEffect(() => {
    const s = sim.current;
    const set = (code, value) => {
      let used = false;
      for (const [name, codes] of Object.entries(KEYS)) if (codes.includes(code)) { s.input[name] = value; used = true; }
      return used;
    };
    const down = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (set(e.code, true)) { if (e.code === 'Space' && !e.repeat) s.pressed = true; e.preventDefault(); return; }
      const digit = /^Digit([1-4])$/.exec(e.code);
      if (digit) selectRef.current(Number(digit[1]) - 1);
    };
    const up = (e) => set(e.code, false);
    const blur = () => Object.assign(s.input, { left: false, right: false, shoot: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
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
  const feed = deaths.slice(-6).reverse().map((d, i) => ({
    k: `${d.id}:${deathCount - i}`, by: d.by ? findPlayer(room, d.by)?.name : null, w: d.w, victim: findPlayer(room, d.id)?.name || '¿?',
  }));
  const myDeath = [...deaths].reverse().find((d) => d.id === me.id); // en roba la bandera se muere varias veces: la última
  const myKiller = myDeath?.by ? findPlayer(room, myDeath.by) : null;
  const match = room.match;
  const myTeam = mine?.team ?? 0;
  const flagCarrier = (i) => (match?.flags?.[i] ? findPlayer(room, match.flags[i]) : null);
  const carrying = ctf && match?.flags?.[1 - myTeam] === me.id;
  const myFlagTaken = ctf && flagCarrier(myTeam);
  const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  const selected = hud.sel === 0 ? 'rocket' : hud.inv[hud.sel - 1]?.w;
  const selectedN = hud.sel === 0 ? 0 : hud.inv[hud.sel - 1]?.n || 0;
  return (
    <div className={`ck-stage${hud.inStorm && !hud.dead ? ' is-storm' : ''}`} ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="ck-canvas"
        data-cohetes-canvas
        onPointerMove={onPointer}
        onPointerDown={(e) => { onPointer(e); if (e.button === 0) { sim.current.input.shoot = true; sim.current.pressed = true; } e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerUp={(e) => { if (e.button === 0) sim.current.input.shoot = false; }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="ck-top">
        <span title="Monedas"><Icon name="coin" size={18} /> {mine?.coins || 0}</span>
        <span title="Bajas"><Icon name="skull" size={18} /> {mine?.kills || 0}</span>
        <span className="ck-mode" title={mode.mode.blurb} data-mode={mode.gameMode} data-zone-kind={mode.zone}>{mode.label}</span>
        {mode.machines && <span className="ck-mode ck-mode-robots" title="Hay máquinas patrullando el mapa" data-machines><Icon name="robot" size={16} /> Máquinas</span>}
      </div>
      {hud.zone && !hud.dead && (
        <p className={`ck-zone${hud.zone.shrinking ? ' is-closing' : ''}`} data-zone>
          <Icon name="storm" size={20} />
          {hud.zone.final ? 'La tormenta cerró' : hud.zone.shrinking ? `Cerrándose… ${hud.zone.left} s` : `Se cierra en ${hud.zone.left} s`}
        </p>
      )}
      {hud.inStorm && !hud.dead && <p className="ck-stormhit" data-in-storm>Estás en la tormenta: −10 por segundo. ¡Volvé al círculo!</p>}
      {ctf && match?.score && (
        <div className="ck-ctf" data-ctf>
          <span className="ck-ctf-team" style={{ background: TEAMS[0].color }} data-score="0" title={`Equipo ${TEAMS[0].name}`}>{match.score[0]}</span>
          <span className="ck-ctf-mid">
            <b data-clock>{hud.ctfLeft == null ? '∞' : clock(hud.ctfLeft)}</b>
            <small>{match.target ? `a ${match.target} banderas` : 'sin límite de puntos'}</small>
          </span>
          <span className="ck-ctf-team" style={{ background: TEAMS[1].color }} data-score="1" title={`Equipo ${TEAMS[1].name}`}>{match.score[1]}</span>
        </div>
      )}
      {ctf && !hud.dead && (carrying || myFlagTaken) && (
        <p className="ck-ctf-hint" data-ctf-hint>
          <Icon name="flag" size={18} />
          {carrying ? (myFlagTaken ? `¡Tenés la bandera! Pero ${myFlagTaken.name} se llevó la tuya: eliminalo para poder sumar.` : '¡Tenés la bandera! Llevala hasta tu base y tocá la tuya.') : `${myFlagTaken.name} se llevó tu bandera: ¡eliminalo para que vuelva!`}
        </p>
      )}
      {byTeams && !ctf && (
        <div className="ck-teamcount" data-teams>
          {TEAMS.map((t, i) => <span key={t.name} style={{ background: t.color }} title={`Equipo ${t.name}`}>{alivePlayers(room).filter((pl) => pl.team === i).length}</span>)}
        </div>
      )}
      {!ctf && <div className="ck-remaining" data-left><small>Tanques<br />quedan</small><strong>{left}</strong></div>}
      <ul className="ck-feed">
        {hits.map((h) => (
          <li key={h.k} className="is-hit" data-hit><Icon name="hit" size={16} /> Le pegaste a <b>{h.name}</b> <ItemIcon w={h.w} size={16} /> −{Math.round(h.dmg)}</li>
        ))}
        {feed.map((f) => (
          <li key={f.k}>{f.by ? <>{f.by} <ItemIcon w={f.w || 'rocket'} size={16} /> {f.victim}</> : <>{f.victim} <Icon name={f.w === 'storm' ? 'storm' : f.w === 'robot' ? 'robot' : 'wave'} size={16} /></>}</li>
        ))}
      </ul>
      {killLabel && <p className="ck-killed"><Icon name="skull" size={22} /> {killLabel}</p>}
      {!hud.dead && (
        <div className="ck-bottom">
          <div className="ck-ammo" aria-label={`${hud.shots} cohetes`}>
            {Array.from({ length: MAX_AMMO }, (_, i) => (
              <i key={i} className={i < hud.shots ? 'is-on' : i === hud.shots ? 'is-loading' : ''} style={i === hud.shots ? { '--f': hud.reloadF } : undefined} />
            ))}
          </div>
          {hud.charge > 0 && <div className="ck-charge"><i style={{ width: `${hud.charge * 100}%` }} /></div>}
          {hud.jet > 0 && <div className="ck-jet" data-jet><Icon name="jetpack" size={20} /><div><i style={{ width: `${hud.jet * 100}%` }} /></div></div>}
          {hud.turbo > 0 && <div className="ck-jet ck-turbo" data-turbo><Icon name="turbo" size={20} /><div><i style={{ width: `${hud.turbo * 100}%` }} /></div></div>}
          <div className="ck-slots">
            {Array.from({ length: SLOTS }, (_, i) => {
              const item = i === 0 ? { w: 'rocket' } : hud.inv[i - 1];
              return (
                <button key={i} type="button" className={`ck-slot${hud.sel === i ? ' is-sel' : ''}${item ? '' : ' is-empty'}`} onClick={() => select(i)} title={item ? ITEMS[item.w].name : 'Vacía'} data-slot={i + 1}>
                  <small>{i + 1}</small>
                  {item && <ItemIcon w={item.w} size={40} />}
                  {item?.n > 1 && <b>{item.n}</b>}
                </button>
              );
            })}
          </div>
          <div className="ck-hp"><i style={{ width: `${Math.min(100, (hud.hp / hud.maxHp) * 100)}%` }} className={hud.hp / hud.maxHp < 0.35 ? 'is-low' : ''} /><small>{hud.hp}</small></div>
        </div>
      )}
      {!hud.dead && selected && (
        <aside className="ck-iteminfo" data-iteminfo={selected}>
          <strong><ItemIcon w={selected} size={26} /> {ITEMS[selected].name}{selectedN > 1 ? ` ×${selectedN}` : ''}</strong>
          <p>{ITEM_DESC[selected]}</p>
        </aside>
      )}
      {notice && <p className="ck-notice">{notice}</p>}
      {hud.elapsed < 0 && <div className="ck-countdown"><small>¡PREPARATE!</small>{Math.ceil(-hud.elapsed)}</div>}
      {!ctf && hud.mode === 'ship' && hud.elapsed >= 0 && !hud.dead && <div className="ck-deploy">⌃<br />Disparo para saltar</div>}
      {(mode.zone === 'water' || mode.zone === 'storm' || mode.zone === 'both') && hud.elapsed > 25 && hud.elapsed < 32 && !hud.dead && <p className="ck-warning"><Icon name={mode.zone === 'water' ? 'wave' : 'storm'} size={20} /> {mode.zone === 'water' ? '¡El agua empieza a subir!' : mode.zone === 'storm' ? '¡La tormenta empieza a cerrarse!' : '¡La tormenta y el agua empiezan a avanzar!'}</p>}
      {hud.dead && mine && (
        <div className="ck-eliminated">
          <div className="ck-elim-text">
            <strong>{ctf ? '¡TE ELIMINARON!' : '¡ELIMINADO!'}</strong>
            <span>{myKiller ? <>por <b>{myKiller.name}</b> con <ItemIcon w={myDeath.w || 'rocket'} size={22} /></> : myDeath?.w === 'storm' ? 'Te llevó la tormenta' : myDeath?.w === 'robot' ? 'Te eliminó una máquina' : 'Te hundiste'}</span>
          </div>
          {ctf
            ? <div className="ck-elim-place" data-respawn><strong>{hud.respawn}</strong><small>reaparecés</small></div>
            : <div className="ck-elim-place"><strong>{mine.place || left + 1}</strong><small>de {total}</small></div>}
        </div>
      )}
    </div>
  );
}
