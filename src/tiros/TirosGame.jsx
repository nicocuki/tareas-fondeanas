// La pelea de A los Tiros: dibujo, teclado y mouse, y la conexión en tiempo real.
//
// Cada pantalla es dueña de su jugador (como en el fútbol): lo mueve con su física, decide si una
// bala le pegó y cuánta vida le queda. Por la red viaja una foto por cuadro con su posición y lo
// último que pasó (disparos, golpes recibidos, escudos). Las balas no viajan: cada pantalla las
// simula a partir del disparo y de las cartas del que tiró (ver `sim.js`).
// La foto va directo entre navegadores (WebRTC); si con alguien no se puede, va por el servidor.
// Las cajas sueltas las simula la pantalla del último que las tocó y van en su foto (ver `boxes.js`).
import React, { useEffect, useMemo, useRef } from 'react';
import { backend } from '../storage.js';
import { createMesh } from '../futbol/p2p.js';
import { MAPS, WORLD_H, WORLD_W } from './maps.js';
import { burst, drawScene } from './render.js';
import { applyBox, boxSolid, claimBox, driftBoxes, encodeBox, newBoxes, pushBox, stepBoxes } from './boxes.js';
import { statsFor } from './cards.js';
import {
  BLOCK_TIME, FX_RADIUS, PLAYER_R, STEP, bulletDamage, bulletsForShot, newPlayerState, outDamage, ringBullets, stepBullet, stepPlayer,
  teleportTarget, touches,
} from './sim.js';
import { hitSolid } from './shapes.js';

const SEND_EVERY = 1 / 30;      // fotos por conexión directa
const SERVER_EVERY = 1 / 20;    // fotos de respaldo por el servidor
const EVENT_KEEP = 1.5;         // segundos que un evento sigue viajando en las fotos (por si se pierde una)
const IDLE_RELOAD = 0.6;        // sin tirar este tiempo, empieza a recargar
const GONE_AFTER = 8;           // sin fotos de alguien este tiempo, el anfitrión lo da por muerto
// Efectos de las cartas que no son balas (alcance en unidades, daño por segundo).
const SAW_R = 3.6, SAW_DPS = 80;          // Sierra
const ABYSS_R = 6, ABYSS_DPS = 25;        // Cuenta abisal cargada
const ABYSS_CHARGE = 2.5, ABYSS_TIME = 4; // segundos quieto para cargarla y cuánto dura
const DRAIN_R = 6, DRAIN_DPS = 15;        // Robavidas
const CHILL_R = 10;                       // Presencia helada
const WAVE_R = 7;                         // ondas de Resplandor
const NOVA_R = 14, NOVA_STUN_R = 7, NOVA_TIME = 1.5; // Supernova: atrae, y al final aturde
const ECHO_DELAY = 0.35;                  // Eco
const CHARGE_SPEED = 45, CHARGE_TIME = 0.25; // Embestida
const RADAR_RANGE = 40;                   // Disparo radar
const BLOOD_COST = 10;                    // Pacto demoníaco: vida por tiro

const KEYS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'ArrowUp', 'Space'], block: ['ShiftLeft', 'ShiftRight', 'KeyS', 'ArrowDown'],
};

export default function TirosGame({ room, me, code, offset, onDied, onReportGone }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const roomRef = useRef(room);
  roomRef.current = room;
  const callbacks = useRef({ onDied, onReportGone });
  callbacks.current = { onDied, onReportGone };

  const battle = room.battle;
  const statsById = useMemo(() => Object.fromEntries(room.players.map((p) => [p.id, statsFor(p.cards)])), [room.players]);
  const statsRef = useRef(statsById);
  statsRef.current = statsById;

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      n: 0, mapSolids: [], solids: [], boxes: [], local: null, bullets: new Map(), seen: new Set(), remotes: new Map(),
      explosions: [], clouds: [], fields: [], novas: [], waves: [], particles: [], shake: 0, myShots: [], myHits: [], myFx: [], seq: 0, lastBy: null,
      input: { left: false, right: false, jump: false, shoot: false, block: false, blockWas: false }, aim: { x: 32, y: 18 },
      sentAt: 0, serverAt: 0, deathSent: false, goneSent: new Set(), msg: '', msgUntil: 0,
    };
  }

  // Pelea nueva: cada uno a su lugar, con sus cartas, y se borra todo lo anterior.
  useEffect(() => {
    if (!battle) return;
    const s = sim.current;
    if (s.n === battle.n) return;
    const map = MAPS[battle.map];
    const [x, y] = map.spawns[battle.spawns[me.id] ?? 0];
    s.n = battle.n;
    s.mapSolids = map.solids;
    s.boxes = newBoxes(map.boxes);
    s.solids = map.solids;
    s.local = newPlayerState(x, y, statsRef.current[me.id]);
    s.bullets.clear();
    s.remotes.clear();
    s.explosions = []; s.clouds = []; s.fields = []; s.novas = []; s.waves = []; s.particles = []; s.myShots = []; s.myHits = []; s.myFx = [];
    s.deathSent = false;
    s.goneSent.clear();
    s.lastBy = null;
  }, [battle?.n]); // eslint-disable-line react-hooks/exhaustive-deps

  // Red: canal directo entre navegadores y foto de respaldo por el servidor.
  useEffect(() => {
    const chan = backend.tirosChannel(code);
    const s = sim.current;
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      receive(s, id, snap);
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    s.mesh = mesh;
    s.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => {
      off();
      mesh?.close();
      chan.remove(me.id).catch(() => {});
      s.mesh = null;
      s.chan = null;
    };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function serverNow() { return (Date.now() + offsetRef.current) / 1000; }

  // Lo que llega de otro jugador.
  function receive(s, id, snap) {
    if (snap.n !== s.n) return;
    const prev = s.remotes.get(id);
    if (prev && !prev.snap.d && snap.d) {
      s.explosions.push({ x: prev.x, y: prev.y, r: 5, t: serverNow() });
      burst(s.particles, prev.x, prev.y, { n: 40, color: colorOf(id), speed: 26, life: 0.9, size: 0.35 });
      s.shake = Math.max(s.shake, 0.6);
    }
    if (!prev || snap.t > prev.snap.t) {
      const hurt = prev && snap.hp < prev.snap.hp ? performance.now() / 1000 + 0.6 : prev?.hurt || 0;
      s.remotes.set(id, { snap, at: performance.now() / 1000, x: prev?.x ?? snap.x, y: prev?.y ?? snap.y, hurt });
    }
    const now = serverNow();
    const stats = statsRef.current[id];
    for (const shot of snap.sh || []) {
      if (s.seen.has(shot.k) || !stats) continue;
      s.seen.add(shot.k);
      addBullets(s, bulletsForShot(shot, id, stats), now);
    }
    for (const hit of snap.hi || []) {
      const key = `h:${hit.k}`;
      if (s.seen.has(key)) continue;
      s.seen.add(key);
      const hb = s.bullets.get(hit.k);
      if (hb) hb.done = true;
      if (hit.o === me.id && hit.dm > 0) onMyHitLanded(s, hit.dm, now);
    }
    for (const e of snap.bx || []) applyBox(s.boxes, e, id, now);
    for (const ev of snap.fx || []) {
      if (s.seen.has(ev.k)) continue;
      s.seen.add(ev.k);
      if (ev.o) burst(s.particles, ev.x, ev.y, { n: 26, color: ev.sb ? '#ffffff' : colorOf(id), speed: 24, life: 0.7, up: 12 });
      else if (ev.w) onWave(s, id, ev, now);
      else blockEffects(s, id, ev, now);
    }
  }

  // Las balas que llegan tarde se adelantan hasta ahora, así se ven donde tienen que estar.
  function addBullets(s, list, now) {
    for (const b of list) {
      s.bullets.set(b.k, b);
      // Mientras se adelanta también puede pegarme: si no, una bala que llega tarde me atravesaría.
      const late = Math.min(0.5, now - b.t0);
      for (let t = 0; t < late && !b.done; t += STEP) bulletTick(s, b, b.t0 + t, STEP, null);
    }
  }

  // Un paso de una bala: se mueve, explota, y si me toca a mí, me hace daño (lo decide esta pantalla).
  function bulletTick(s, b, now, dt, targets) {
    const p = s.local;
    const bst = b.st || statsRef.current[b.owner];
    if (!bst || !p) { b.done = true; return; }
    const active = isActive(now);
    const alive = !p.dead;
    const aim = b.owner === me.id ? s.aim : s.remotes.get(b.owner)?.snap.am;
    if (b.stuckAt) {
      if (now >= b.stuckAt + 0.5) { b.done = true; onImpact(s, b, b.x, b.y, now, false); }
      return;
    }
    const res = stepBullet(b, dt, { solids: s.solids, stats: bst, aim, targets, onBox: (i, bl) => hitBox(s, i, bl, bst) });
    if (res?.impact) { onImpact(s, b, res.impact.x, res.impact.y, now, false); return; }
    if (b.done) return;
    if (b.owner !== me.id && active && alive && touches(b, p.x, p.y)) {
      b.done = true;
      if (now < p.blockUntil) { s.myHits.push({ k: b.k, o: b.owner, dm: 0, t: now }); return; }
      const dm = bulletDamage(b, bst);
      if (bst.poison) {
        p.poison.push({ dps: dm / bst.poison, until: now + bst.poison, by: b.owner });
        s.myHits.push({ k: b.k, o: b.owner, dm: Math.round(dm), t: now });
        s.lastBy = b.owner;
      } else damageMe(s, dm, b.owner, b.k, now);
      burst(s.particles, b.x, b.y, { n: 12, color: colorOf(me.id), speed: 18, life: 0.5 });
      if (bst.slow) { p.slowUntil = now + 1.5; p.slowAmount = Math.max(p.slowAmount, bst.slow * Math.min(1, b.st ? 1 : dm / 55)); }
      if (bst.stun) p.stunUntil = Math.max(p.stunUntil, now + bst.stun);
      const sp = Math.hypot(b.vx, b.vy) || 1;
      const push = Math.min(40, (dm / 55) * 9 * bst.knock);
      p.vx += (b.vx / sp) * push;
      p.vy += (b.vy / sp) * push - 3;
      // Propulsor: la bala lo sigue empujando un rato, más fuerte cuanto más daño hace.
      if (bst.thrust) {
        const f = 110 * bst.thrust * Math.min(1.5, Math.max(0.4, dm / 55));
        p.thrust = { ax: (b.vx / sp) * f, ay: (b.vy / sp) * f, until: now + 0.35 };
      }
      onImpact(s, b, b.x, b.y, now, true);
      return;
    }
    // Contra los demás solo se ve: el daño lo decide la pantalla de cada uno.
    for (const [id, v] of s.remotes) {
      if (id === b.owner || v.snap.d || !active) continue;
      if (touches(b, v.x, v.y)) {
        b.done = true;
        burst(s.particles, b.x, b.y, { n: 12, color: colorOf(id), speed: 18, life: 0.5 });
        if (!(v.snap.bl > now)) onImpact(s, b, b.x, b.y, now, false);
        return;
      }
    }
  }

  // Una bala pegó en una caja: si es mía la reclamo, y si la simulo yo, la empujo.
  function hitBox(s, i, b, bst) {
    const box = s.boxes[i];
    if (!box || box.gone) return;
    if (b.owner === me.id) claimBox(box, me.id);
    if (box.o !== me.id) return;
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const k = Math.min(14, (bulletDamage(b, bst) / 55) * 5 * bst.knock);
    pushBox(box, b.x, b.y, (b.vx / sp) * k, (b.vy / sp) * k);
  }

  function onMyHitLanded(s, dm, now) {
    const st = statsRef.current[me.id];
    const p = s.local;
    if (!p || p.dead) return;
    if (st.lifesteal) p.hp = Math.min(p.maxHp, p.hp + dm * st.lifesteal);
    if (st.bloodRush) p.rushUntil = now + 3;
    if (st.reloadOnHit) { p.ammo = st.ammo; p.reloadAt = 0; }
    if (st.refresh && now >= p.refreshAt) { p.blockReadyAt = now; p.refreshAt = now + 1; }
    // Peleador: +200 % de vida (la máxima y la actual) por 3 s; pegar otra vez lo estira.
    if (st.brawler) {
      if (!p.brawlExtra) {
        p.brawlExtra = 2 * st.hp;
        p.maxHp += p.brawlExtra;
        p.hp += p.brawlExtra;
      }
      p.brawlUntil = now + 3;
    }
  }

  // `dot`: daño que ya entra de a poco (veneno, nubes, auras), así Descomposición no lo vuelve a repartir.
  function damageMe(s, dm, by, key, now, dot = false) {
    const p = s.local;
    if (!p || p.dead || dm <= 0) return;
    if (!dot && statsRef.current[me.id]?.decay) {
      p.poison.push({ dps: dm / 4, until: now + 4, by });
      if (by) s.lastBy = by;
      if (key) s.myHits.push({ k: key, o: by, dm: Math.round(dm), t: now });
      return;
    }
    p.hp -= dm;
    p.hurtUntil = performance.now() / 1000 + 0.6;
    if (by) s.lastBy = by;
    if (key) s.myHits.push({ k: key, o: by, dm: Math.round(dm), t: now });
  }

  // Los efectos de un escudo en el lugar `ev`, en todas las pantallas (también en la del que se cubrió):
  // lo que deja en el mapa (campos, bombitas, PEM, supernova) y, si es de otro, lo que me hace a mí.
  // También lo dispara el tiro potenciado (Potenciar) donde pega.
  function blockEffects(s, id, ev, now) {
    const owner = statsRef.current[id];
    if (!owner) return;
    const has = (name) => owner.blockFx.includes(name);
    if (has('heal')) s.fields.push({ x: ev.x, y: ev.y, until: now + 3, owner: id });
    if (has('static')) s.clouds.push({ x: ev.x, y: ev.y, until: now + 3, owner: id, r: 5, kind: 'static' });
    if (has('bombs')) addBullets(s, ringBullets(ev, id, 'bombs'), now);
    if (has('emp')) addBullets(s, ringBullets(ev, id, 'emp'), now);
    if (has('nova')) s.novas.push({ x: ev.x, y: ev.y, t: ev.t ?? now, owner: id });
    if (id === me.id) return;
    const p = s.local;
    if (!p || p.dead || !isActive(now)) return;
    const dx = p.x - ev.x, dy = p.y - ev.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d > FX_RADIUS) return;
    if (has('frost')) { p.slowUntil = now + 2.5; p.slowAmount = Math.max(p.slowAmount, 0.6); }
    if (has('shock')) { p.vx += (dx / d) * 38; p.vy += (dy / d) * 38 - 8; }
    if (has('implode')) { p.vx -= (dx / d) * 30; p.vy -= (dy / d) * 30; }
    if (has('overpower')) damageMe(s, 0.15 * (ev.mh || owner.hp), id, ev.k, now);
    if (has('silence')) p.silenceUntil = Math.max(p.silenceUntil, now + 2);
  }

  // Una onda de Resplandor de otro: se ve, y si me alcanza, me daña.
  function onWave(s, id, ev, now) {
    s.waves.push({ x: ev.x, y: ev.y, t: now, color: colorOf(id) });
    const p = s.local;
    const owner = statsRef.current[id];
    if (!p || p.dead || !owner || !isActive(now) || now < p.blockUntil) return;
    if (Math.hypot(p.x - ev.x, p.y - ev.y) < WAVE_R) damageMe(s, Math.max(8, 0.25 * owner.dmg), id, ev.k, now);
  }

  function isActive(now) {
    const r = roomRef.current;
    return r.phase === 'fight' && r.battle && now >= r.battle.startsAt / 1000;
  }

  function explode(s, x, y, radius, owner, dmg, key, skipMe, now) {
    s.explosions.push({ x, y, r: radius, t: now });
    burst(s.particles, x, y, { n: 28, color: '#ffc94d', speed: 26, life: 0.7 });
    burst(s.particles, x, y, { n: 10, color: '#ff7a2e', speed: 14, life: 0.9, size: 0.4 });
    s.shake = Math.max(s.shake, Math.min(1.2, radius * 0.15));
    for (const box of s.boxes) {
      const d = Math.hypot(box.x - x, box.y - y);
      if (box.gone || d > radius + box.h) continue;
      if (owner === me.id) claimBox(box, me.id);
      if (box.o === me.id) pushBox(box, x, y, ((box.x - x) / Math.max(0.5, d)) * 10, ((box.y - y) / Math.max(0.5, d)) * 10 - 4);
    }
    const p = s.local;
    if (!p || p.dead || skipMe || owner === me.id || !isActive(now)) return;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d > radius + PLAYER_R) return;
    if (now < p.blockUntil) return;
    damageMe(s, dmg, owner, `${key}x`, now);
    const k = 25 / Math.max(1, d);
    p.vx += ((p.x - x) / Math.max(0.5, d)) * Math.min(30, k * 4);
    p.vy += ((p.y - y) / Math.max(0.5, d)) * Math.min(30, k * 4) - 6;
  }

  function onImpact(s, b, x, y, now, skipMe) {
    const st = b.st || statsRef.current[b.owner];
    if (!st) return;
    burst(s.particles, x, y, { n: 7, color: '#ffe066', speed: 16, life: 0.3, size: 0.16 });
    if (st.explode) explode(s, x, y, st.explode, b.owner, bulletDamage(b, st), b.k, skipMe, now);
    if (st.cloud) s.clouds.push({ x, y, until: now + 5, owner: b.owner, r: 4.5 });
    // Tiro potenciado: donde pega se activan los efectos del escudo (con Teletransporte, te lleva ahí).
    if (b.em) {
      const mine = b.owner === me.id;
      const mh = mine ? s.local?.maxHp : s.remotes.get(b.owner)?.snap.mh;
      burst(s.particles, x, y, { n: 18, color: '#ffffff', speed: 20, life: 0.5 });
      blockEffects(s, b.owner, { k: `${b.k}e`, t: now, x, y, mh }, now);
      if (mine && st.blockFx.includes('teleport') && s.local && !s.local.dead) landAt(s, s.local, x, y);
    }
  }

  // Lleva al jugador a (x, y), subiéndolo de a poco si quedaría adentro de una pared.
  function landAt(s, p, x, y) {
    for (let up = 0; up < 4; up += 0.25) {
      if (!s.solids.some((sol) => hitSolid(x, y - up, PLAYER_R, sol))) { p.x = x; p.y = y - up; p.vy = Math.min(p.vy, 0); return; }
    }
  }

  function colorOf(id) { return roomRef.current.players.find((p) => p.id === id)?.color || '#888'; }

  // Un disparo propio hacia el ángulo `a`. El tiro potenciado (Potenciar) se gasta en el primero.
  function fire(s, p, st, a, now) {
    const shot = { k: `${me.id}:${s.n}:${s.seq++}`, t: now, x: p.x, y: p.y, a, sd: Math.floor(Math.random() * 2 ** 31) };
    if (p.empowered) { shot.em = 1; p.empowered = false; }
    s.seen.add(shot.k);
    s.myShots.push(shot);
    burst(s.particles, p.x + Math.cos(a) * 2.6, p.y + Math.sin(a) * 2.6, { n: 3, color: '#ffe3a1', speed: 10, life: 0.18, size: 0.15, gravity: 0 });
    addBullets(s, bulletsForShot(shot, me.id, st), now);
  }

  // Cubrirse. `auto`: no lo apretó el jugador (Eco, Embestida, ¡Escudo arriba!, Cuenta abisal), así que
  // no gasta el enfriamiento. `quiet`: no vuelve a disparar Eco ni Embestida (si no, se encadenarían).
  function doBlock(s, p, st, now, { auto = false, quiet = false } = {}) {
    p.blockUntil = Math.max(p.blockUntil, now + BLOCK_TIME);
    if (!auto) p.blockReadyAt = now + st.blockCooldown;
    const a = Math.atan2(s.aim.y - p.y, s.aim.x - p.x);
    const ev = { k: `${me.id}:b${s.seq++}`, t: now, x: p.x, y: p.y, a, mh: p.maxHp };
    s.myFx.push(ev);
    s.seen.add(ev.k);
    const has = (name) => st.blockFx.includes(name);
    blockEffects(s, me.id, ev, now);
    if (has('teleport')) Object.assign(p, teleportTarget(p, a, s.solids));
    if (has('reload')) { p.ammo = st.ammo; p.reloadAt = 0; }
    if (has('saw')) p.sawUntil = now + 2.5;
    if (has('echo') && !quiet) p.echoAt = now + ECHO_DELAY;
    if (has('charge') && !quiet) {
      p.vx = Math.cos(a) * CHARGE_SPEED;
      p.vy = Math.sin(a) * CHARGE_SPEED - 4;
      p.onGround = false;
      p.chargeUntil = now + CHARGE_TIME;
    }
    if (has('radar')) {
      for (const [, v] of s.remotes) {
        if (v.snap.d || Math.hypot(v.x - p.x, v.y - p.y) > RADAR_RANGE) continue;
        fire(s, p, st, Math.atan2(v.y - p.y, v.x - p.x), now);
      }
    }
    // Después del radar: el tiro potenciado es el próximo que tire el jugador.
    if (has('empower')) p.empowered = true;
  }

  // ─── Bucle principal ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    let raf = 0;
    let last = performance.now() / 1000;
    let acc = 0;

    function step(now) {
      const r = roomRef.current;
      const st = statsRef.current[me.id];
      const p = s.local;
      if (!p || !st) return;
      const active = isActive(now);
      const alive = !p.dead;
      const targets = [{ id: me.id, x: p.x, y: p.y }, ...[...s.remotes].filter(([, v]) => !v.snap.d).map(([id, v]) => ({ id, x: v.x, y: v.y }))];
      const enemy = targets.filter((t) => t.id !== me.id).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x))[0];

      // Sólidos de este paso: el mapa y las cajas donde están ahora.
      s.solids = s.boxes.some((bx) => !bx.gone) ? [...s.mapSolids, ...s.boxes.filter((bx) => !bx.gone).map(boxSolid)] : s.mapSolids;
      // En la cuenta regresiva solo cae al piso: todavía no se mueve ni tira.
      if (!active && alive && r.phase === 'fight') stepPlayer(p, {}, STEP, { solids: s.solids, stats: st, now: 0 });
      if (active && alive) {
        if (now >= p.slowUntil) p.slowAmount = 0;
        const stunned = now < p.stunUntil;
        const silenced = now < p.silenceUntil;
        // Embestida: mientras sale disparado no frena; al terminar, se cubre otra vez solo.
        const charging = now < p.chargeUntil;
        const ev = stepPlayer(p, stunned || charging ? {} : s.input, STEP, { solids: s.solids, stats: st, now, enemyX: enemy?.x });
        if (p.chargeUntil && now >= p.chargeUntil) { p.chargeUntil = 0; doBlock(s, p, st, now, { auto: true, quiet: true }); }
        if (p.echoAt && now >= p.echoAt) { p.echoAt = 0; doBlock(s, p, st, now, { auto: true, quiet: true }); }
        if (p.thrust && now < p.thrust.until) { p.vx += p.thrust.ax * STEP; p.vy += p.thrust.ay * STEP; }
        // Tocar una caja la reclama: desde ahora la simula esta pantalla.
        for (const i of p.touching || []) claimBox(s.boxes[i], me.id);
        if (ev.out) {
          const dm = outDamage(p, now);
          damageMe(s, dm, s.lastBy, null, now);
          burst(s.particles, p.x, Math.min(p.y, WORLD_H), { n: 26, color: dm ? colorOf(me.id) : '#ffffff', speed: 24, life: 0.7, up: 12 });
          s.shake = Math.max(s.shake, 0.8);
          const ev3 = { k: `${me.id}:o${s.seq++}`, t: now, x: p.x, y: Math.min(p.y, WORLD_H), o: 1, sb: dm ? 0 : 1 };
          s.myFx.push(ev3);
          s.seen.add(ev3.k);
        }
        // Veneno (y Descomposición): el daño entra de a poco.
        for (const po of p.poison) if (now < po.until) damageMe(s, po.dps * STEP, po.by, null, now, true);
        p.poison = p.poison.filter((po) => now < po.until);
        // Disparo. Con ¡Escudo arriba! no se recarga de a poco: solo con el cargador vacío.
        if (p.reloadAt && now >= p.reloadAt) { p.ammo = st.ammo; p.reloadAt = 0; }
        if (!p.reloadAt && p.ammo < st.ammo && !st.shieldsUp && now - p.lastShotAt > IDLE_RELOAD) p.reloadAt = now + st.reload;
        const canPay = !st.bloodShot || p.hp > BLOOD_COST;
        if (s.input.shoot && !stunned && !silenced && canPay && p.ammo > 0 && now >= p.nextShotAt) {
          fire(s, p, st, Math.atan2(s.aim.y - p.y, s.aim.x - p.x), now);
          if (st.bloodShot) { p.hp -= BLOOD_COST; p.hurtUntil = performance.now() / 1000 + 0.3; }
          p.ammo -= 1;
          p.nextShotAt = now + st.cooldown;
          p.lastShotAt = now;
          p.reloadAt = p.ammo <= 0 ? now + st.reload : 0;
          if (p.ammo <= 0 && st.shieldsUp) doBlock(s, p, st, now, { auto: true });
        }
        // Resplandor: mientras recarga suelta ondas, cada vez más seguido.
        if (st.radiance && p.reloadAt) {
          if (now >= p.waveAt) {
            const left = Math.max(0, Math.min(1, (p.reloadAt - now) / st.reload));
            p.waveAt = now + 0.2 + 0.4 * left;
            const wave = { k: `${me.id}:w${s.seq++}`, t: now, x: p.x, y: p.y, w: 1 };
            s.myFx.push(wave);
            s.seen.add(wave.k);
            s.waves.push({ x: p.x, y: p.y, t: now, color: colorOf(me.id) });
          }
        } else p.waveAt = 0;
        // Escudo.
        const blockPressed = s.input.block && !s.input.blockWas;
        s.input.blockWas = s.input.block;
        if (blockPressed && !stunned && !silenced && now >= p.blockReadyAt) doBlock(s, p, st, now);
        // Cuenta abisal: quieto se carga; cargada, se cubre sin parar y daña a los de cerca (en sus pantallas).
        if (st.abyss) {
          const still = p.onGround && Math.abs(p.vx) < 1.5 && !s.input.left && !s.input.right;
          if (now < p.abyssUntil) {
            if (now >= p.abyssBlockAt) { p.abyssBlockAt = now + 0.45; doBlock(s, p, st, now, { auto: true, quiet: true }); }
          } else if (still) {
            p.abyssCharge += STEP / ABYSS_CHARGE;
            if (p.abyssCharge >= 1) { p.abyssCharge = 0; p.abyssUntil = now + ABYSS_TIME; p.abyssBlockAt = now; }
          } else p.abyssCharge = Math.max(0, p.abyssCharge - STEP / 1.5);
        }
        // Peleador: se termina la vida extra.
        if (p.brawlUntil && now >= p.brawlUntil) {
          p.maxHp -= p.brawlExtra;
          p.hp = Math.min(p.hp, p.maxHp);
          p.brawlExtra = 0;
          p.brawlUntil = 0;
        }
        // Perseverancia prístina: arriba del 90 % la vida vale ×5 (se escala la actual y la máxima juntas).
        if (st.pristine) {
          if (!p.boosted && p.hp >= 0.9 * p.maxHp) { p.boosted = true; p.maxHp *= 5; p.hp *= 5; }
          else if (p.boosted && p.hp < 0.9 * p.maxHp) { p.boosted = false; p.maxHp /= 5; p.hp /= 5; }
        }
        // Campos que curan y nubes tóxicas (o campos estáticos).
        if (s.fields.some((f) => now < f.until && Math.hypot(f.x - p.x, f.y - p.y) < 5)) p.hp = Math.min(p.maxHp, p.hp + 25 * STEP);
        for (const c of s.clouds) {
          if (c.owner !== me.id && now < c.until && Math.hypot(c.x - p.x, c.y - p.y) < c.r) {
            damageMe(s, 30 * STEP, c.owner, null, now, true);
            p.slowUntil = now + 0.3; p.slowAmount = Math.max(p.slowAmount, 0.5);
          }
        }
        // Lo que hacen los demás estando cerca: sierra, Cuenta abisal, Presencia helada, Robavidas.
        for (const [id, v] of s.remotes) {
          const ost = statsRef.current[id];
          if (v.snap.d || !ost) continue;
          const dx = p.x - v.x, dy = p.y - v.y;
          const d = Math.hypot(dx, dy) || 1;
          const shielded = now < p.blockUntil;
          if (v.snap.sw > now && d < SAW_R + PLAYER_R && !shielded) damageMe(s, SAW_DPS * STEP, id, null, now, true);
          if (v.snap.ab && d < ABYSS_R) {
            if (!shielded) damageMe(s, ABYSS_DPS * STEP, id, null, now, true);
            p.vx -= (dx / d) * 25 * STEP; p.vy -= (dy / d) * 25 * STEP;
          }
          if (ost.chill && d < CHILL_R) { p.slowUntil = now + 0.1; p.slowAmount = Math.max(p.slowAmount, Math.min(0.8, ost.chill * (1 - d / CHILL_R))); }
          if (ost.drain && d < DRAIN_R) damageMe(s, DRAIN_DPS * STEP, id, null, now, true);
          if (st.drain && d < DRAIN_R) p.hp = Math.min(p.maxHp, p.hp + DRAIN_DPS * STEP);
        }
        // Supernova: atrae a los de alrededor y al final aturde a los que quedaron cerca.
        for (const n of s.novas) {
          if (n.done) continue;
          const dx = n.x - p.x, dy = n.y - p.y;
          const d = Math.hypot(dx, dy) || 1;
          if (now - n.t >= NOVA_TIME) {
            n.done = true;
            s.explosions.push({ x: n.x, y: n.y, r: NOVA_STUN_R, t: now });
            s.shake = Math.max(s.shake, 0.7);
            if (n.owner !== me.id && d < NOVA_STUN_R && now >= p.blockUntil) p.stunUntil = Math.max(p.stunUntil, now + 1.2);
          } else if (n.owner !== me.id && d < NOVA_R) { p.vx += (dx / d) * 55 * STEP; p.vy += (dy / d) * 55 * STEP; }
        }
      }

      // Balas.
      for (const b of s.bullets.values()) {
        if (!b.done && now >= b.t0) bulletTick(s, b, now, STEP, targets);
      }
      for (const [k, b] of s.bullets) if (b.done) s.bullets.delete(k);

      // Cajas: las mías con física (las de otros, quietas para ellas); las de otros, con su última velocidad.
      if (s.boxes.length) {
        const mine = (bx) => bx.o === me.id;
        const fixed = [...s.mapSolids, ...s.boxes.filter((bx) => !bx.gone && !mine(bx)).map(boxSolid)];
        const pushers = [];
        if (alive) pushers.push({ x: p.x, y: p.y, vx: p.pushVx || 0, vy: p.pushVy || 0 });
        for (const v of s.remotes.values()) if (!v.snap.d) pushers.push({ x: v.x, y: v.y, vx: v.snap.vx, vy: v.snap.vy });
        stepBoxes(s.boxes, STEP, fixed, pushers, mine);
        driftBoxes(s.boxes, STEP, mine, now);
      }

      // Muerte (con Fénix se revive una vez).
      if (alive && p.hp <= 0 && active) {
        if (p.phoenix > 0) {
          p.phoenix -= 1;
          p.hp = p.maxHp;
          p.poison = [];
          s.msg = '¡Fénix!'; s.msgUntil = now + 1.2;
        } else {
          p.dead = true;
          p.hp = 0;
          s.explosions.push({ x: p.x, y: p.y, r: 5, t: now });
          burst(s.particles, p.x, p.y, { n: 40, color: colorOf(me.id), speed: 26, life: 0.9, size: 0.35 });
          s.shake = Math.max(s.shake, 0.6);
        }
      }
      if (p.dead && !s.deathSent && r.phase === 'fight') {
        s.deathSent = true;
        callbacks.current.onDied(r.battle.n, s.lastBy);
      }
    }

    function snapshot(now) {
      const p = s.local;
      const keep = (list) => list.filter((e) => now - e.t < EVENT_KEEP);
      s.myShots = keep(s.myShots); s.myHits = keep(s.myHits); s.myFx = keep(s.myFx);
      const round = (v) => Math.round(v * 100) / 100;
      return {
        n: s.n, t: round(now), x: round(p.x), y: round(p.y), vx: round(p.vx), vy: round(p.vy),
        a: round(Math.atan2(s.aim.y - p.y, s.aim.x - p.x)), am: { x: round(s.aim.x), y: round(s.aim.y) },
        hp: Math.max(0, Math.round(p.hp)), mh: p.maxHp, d: p.dead ? 1 : 0, bl: round(p.blockUntil),
        am2: p.ammo, rl: p.reloadAt ? round(p.reloadAt) : 0,
        sh: s.myShots, hi: s.myHits, fx: s.myFx, ln: p.launching ? 1 : 0, bx: myBoxes(now),
        sw: p.sawUntil > now ? round(p.sawUntil) : 0, ab: p.abyssUntil > now ? 1 : 0, su: p.stunUntil > now || p.silenceUntil > now ? 1 : 0,
      };
    }

    // Las cajas que simulo: las que se mueven, y las quietas una vez por segundo (por si alguien llegó tarde).
    function myBoxes(now) {
      const out = [];
      for (const bx of s.boxes) {
        if (bx.o !== me.id) continue;
        if (bx.sleep && now - (bx.sentAt || 0) < 1) continue;
        bx.sentAt = now;
        out.push(encodeBox(bx));
      }
      return out;
    }

    function frame() {
      raf = requestAnimationFrame(frame);
      const t = performance.now() / 1000;
      acc = Math.min(acc + (t - last), 0.25);
      last = t;
      const now = serverNow();
      let steps = 0;
      while (acc >= STEP) {
        step(now - acc + STEP);
        acc -= STEP;
        steps += 1;
      }
      // Los demás: hacia su última foto, un poco adelantada con su velocidad.
      const rt = performance.now() / 1000;
      for (const v of s.remotes.values()) {
        const age = Math.min(0.1, Math.max(0, rt - v.at));
        const tx = v.snap.x + v.snap.vx * age;
        const ty = v.snap.y + v.snap.vy * age;
        const k = Math.min(1, (t - (v.drawn || t)) * 18 + 0.15);
        v.x += (tx - v.x) * k;
        v.y += (ty - v.y) * k;
        v.drawn = t;
        if (Math.hypot(tx - v.x, ty - v.y) > 6) { v.x = tx; v.y = ty; }
      }
      // Fotos.
      if (s.local && steps >= 0) {
        if (now - s.sentAt >= SEND_EVERY && s.mesh) { s.sentAt = now; s.mesh.broadcast(snapshot(now)); }
        const r = roomRef.current;
        const others = r.players.filter((p) => p.inGame && p.id !== me.id);
        const needServer = !s.mesh || others.some((p) => !s.mesh.isOpen(p.id));
        if (needServer && now - s.serverAt >= SERVER_EVERY && s.chan) {
          s.serverAt = now;
          s.chan.publish(me.id, JSON.stringify(snapshot(now))).catch(() => {});
        }
        // El anfitrión da por muerto al que dejó de mandar fotos (pestaña cerrada sin salir).
        if (r.hostId === me.id && isActive(now) && now - r.battle.startsAt / 1000 > GONE_AFTER) {
          for (const o of others) {
            if (r.battle.dead[o.id] || s.goneSent.has(o.id)) continue;
            const v = s.remotes.get(o.id);
            if (!v || rt - v.at > GONE_AFTER) { s.goneSent.add(o.id); callbacks.current.onReportGone(r.battle.n, o.id); }
          }
        }
      }
      draw(now);
    }

    let lastDraw = performance.now() / 1000;
    function draw(now) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const wrap = wrapRef.current;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = wrap.clientWidth;
      const cssH = Math.round((cssW * WORLD_H) / WORLD_W);
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        canvas.style.height = `${cssH}px`;
      }
      const rt = performance.now() / 1000;
      const dt = Math.min(0.05, rt - lastDraw);
      lastDraw = rt;
      s.shake = Math.max(0, s.shake - dt * 3);
      const r = roomRef.current;
      const b = r.battle;
      s.explosions = s.explosions.filter((e) => now - e.t < 0.45);
      s.fields = s.fields.filter((f) => now < f.until);
      s.clouds = s.clouds.filter((c) => now < c.until);
      s.novas = s.novas.filter((n) => now - n.t < NOVA_TIME + 0.5);
      s.waves = s.waves.filter((w) => now - w.t < 0.5);
      const bullets = [];
      for (const bl of s.bullets.values()) {
        if (now < bl.t0) continue;
        bl.glow = bl.glow || lighten(colorOf(bl.owner));
        bullets.push(bl);
      }
      const characters = [];
      for (const pl of r.players) {
        if (!pl.inGame) continue;
        const st = statsRef.current[pl.id];
        if (pl.id === me.id) {
          const p = s.local;
          if (!p || p.dead) continue;
          characters.push({
            id: pl.id, name: pl.name, color: pl.color, mine: true, x: p.x, y: p.y, vx: p.vx, vy: p.vy, onGround: p.onGround, launching: Boolean(p.launching),
            angle: Math.atan2(s.aim.y - p.y, s.aim.x - p.x), hp: p.hp, maxHp: p.maxHp, blocking: now < p.blockUntil,
            cdLeft: Math.max(0, (p.blockReadyAt - now) / st.blockCooldown), ammo: p.ammo, maxAmmo: st.ammo, reloading: Boolean(p.reloadAt), hurtUntil: p.hurtUntil || 0,
            saw: now < p.sawUntil, abyss: now < p.abyssUntil, abyssCharge: p.abyssCharge, stunned: now < p.stunUntil || now < p.silenceUntil, empowered: p.empowered,
          });
        } else {
          const v = s.remotes.get(pl.id);
          if (!v || v.snap.d || b?.dead?.[pl.id]) continue;
          characters.push({
            id: pl.id, name: pl.name, color: pl.color, mine: false, x: v.x, y: v.y, vx: v.snap.vx, vy: v.snap.vy, onGround: Math.abs(v.snap.vy) < 0.5, launching: Boolean(v.snap.ln),
            angle: v.snap.a, hp: v.snap.hp, maxHp: v.snap.mh, blocking: v.snap.bl > now, cdLeft: 0,
            ammo: v.snap.am2 ?? st.ammo, maxAmmo: st.ammo, reloading: Boolean(v.snap.rl), hurtUntil: v.hurt || 0,
            saw: v.snap.sw > now, abyss: Boolean(v.snap.ab), stunned: Boolean(v.snap.su),
          });
        }
      }
      const texts = [];
      if (b && r.phase === 'fight' && now < b.startsAt / 1000) texts.push({ text: String(Math.ceil(b.startsAt / 1000 - now)), size: 9, y: WORLD_H / 2 });
      else if (b && r.phase === 'fight' && now < b.startsAt / 1000 + 0.7) texts.push({ text: '¡YA!', size: 9, y: WORLD_H / 2 });
      if (r.phase === 'battleEnd') {
        const w = r.players.find((p) => p.id === b?.winner);
        texts.push({ text: w ? `${w.name} gana la pelea` : 'Empate', size: 4.2, y: WORLD_H / 2 });
      }
      if (s.local?.dead && r.phase === 'fight') texts.push({ text: 'Te mataron · mirando…', size: 2.4, y: 7 });
      if (now < s.msgUntil) texts.push({ text: s.msg, size: 3, y: 9 });
      const hud = {
        rounds: r.options.rounds, battles: r.options.battles,
        players: r.players.filter((p) => p.inGame).map((p) => ({ color: p.color, points: p.points, wins: p.wins, cards: p.cards })),
      };
      drawScene(canvas.getContext('2d'), canvas, {
        map: MAPS[b?.map ?? 0], mapIndex: b?.map ?? 0, now, dt, bullets, explosions: s.explosions, clouds: s.clouds, fields: s.fields,
        novas: s.novas, waves: s.waves, novaTime: NOVA_TIME, waveR: WAVE_R, sawR: SAW_R,
        particles: s.particles, characters, aim: s.aim, hud, texts, shake: s.shake, boxes: s.boxes,
      });
    }

    raf = requestAnimationFrame(frame);
    window.__tiros = s; // para manejar la pelea desde un navegador automatizado
    return () => { cancelAnimationFrame(raf); if (window.__tiros === s) delete window.__tiros; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    const set = (code, value) => {
      let used = false;
      for (const [name, codes] of Object.entries(KEYS)) if (codes.includes(code)) { s.input[name] = value; used = true; }
      return used;
    };
    const down = (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if (set(e.code, true)) e.preventDefault();
    };
    const up = (e) => { set(e.code, false); };
    const blur = () => { Object.assign(s.input, { left: false, right: false, jump: false, shoot: false, block: false }); };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  function onPointer(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const s = sim.current;
    s.aim.x = ((e.clientX - rect.left) / rect.width) * WORLD_W;
    s.aim.y = ((e.clientY - rect.top) / rect.height) * WORLD_H;
  }
  function onDown(e) {
    onPointer(e);
    if (e.button === 0) sim.current.input.shoot = true;
    if (e.button === 2) sim.current.input.block = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  function onUp(e) {
    if (e.button === 0) sim.current.input.shoot = false;
    if (e.button === 2) sim.current.input.block = false;
  }

  return (
    <div ref={wrapRef} className="tt-stage">
      <canvas
        ref={canvasRef}
        className="tt-canvas"
        data-tiros-canvas
        onPointerMove={onPointer}
        onPointerDown={onDown}
        onPointerUp={onUp}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

// Color de la bala: el del jugador, más claro (brilla sobre el fondo oscuro).
function lighten(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.round(v + (255 - v) * 0.45).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}
