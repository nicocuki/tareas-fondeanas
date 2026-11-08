// La partida de Bombardero en tiempo real: dibujo, teclado y la conexión con los demás.
//
// Mismo esquema que Pixel Royale: cada pantalla es dueña de su jugador (lo mueve, decide si el fuego lo
// alcanzó y avisa a la sala cuando muere) y manda su foto directo a los demás (WebRTC) o, si no se puede,
// por el servidor. Las bombas viajan como eventos en la foto (`bm`: puse una; `kk`: pateé una) y **cuándo y
// hasta dónde explota cada bomba lo decide la pantalla de su dueño**, que lo manda en `ex` (el centro, los
// cuatro brazos y los ladrillos rotos): todas pintan el mismo fuego y rompen lo mismo. Si el fuego de otro
// alcanza una bomba mía, mi pantalla la hace explotar al toque (la cadena). Los ítems los decide la sala
// (`take`: el primero que pisa se lo lleva) y lo que tiene cada uno se calcula de ahí, sin viajar.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { FLOOR, ITEMS as ITEM_INFO, PRESSED, SOFT, TILE, idx, itemAt, makeBoard, pressOrder } from './map.js';
import {
  CONTAGION_GAP, DIRS, FIRE_TIME, FUSE, HURRY_S, SKULLS, SKULL_LIST, SKULL_TIME, STEP, VEST_TIME,
  blastArms, blastCells, bombPos, bombsOf, canPlace, cellOf, effective, kickBomb, packCells, pressTime, pressedCount, newPlayer, slideBomb, statsFor, stepPlayer, unpackCells,
} from './sim.js';
import { burst, drawBomb, drawBomber, drawBreaking, drawDying, drawFalling, drawFire, drawItem, drawParticles, drawPressWarning, itemIcon, paintBoard } from './render.js';
import { COLORS, ROUND_END_MS, alive as alivePlayers, findPlayer, inGame, roundSeconds } from './game.js';

const SEND_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 15;
const EVENT_KEEP = 1.5;    // segundos que un evento sigue viajando en las fotos
const GONE_AFTER = 12;     // sin fotos de alguien, el anfitrión lo da por muerto
const DEATH_ANIM = 1.1;
const KEYS = { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'] };
const round2 = (v) => Math.round(v * 100) / 100;
const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// El ícono de un ítem para el HUD y la sala de espera.
export function ItemIcon({ kind, scale = 2 }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, icon = itemIcon(kind);
    if (!c || !icon) return;
    c.width = icon.width; c.height = icon.height;
    const g = c.getContext('2d');
    g.clearRect(0, 0, c.width, c.height);
    g.drawImage(icon, 0, 0);
  }, [kind]);
  return <canvas ref={ref} className="bb-icon" style={{ width: `${14 * scale}px` }} aria-label={ITEM_INFO[kind]?.name || kind} />;
}

export default function BomberGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const roomRef = useRef(room);
  roomRef.current = room;
  const dispatchRef = useRef(onDispatch);
  dispatchRef.current = onDispatch;
  const [hud, setHud] = useState({ elapsed: -5, left: 0, hurry: false, dead: false, stats: null, sick: '', sickLeft: 0, vest: false, watching: false, remoteBombs: 0 });
  const [notice, setNotice] = useState('');
  const [killLabel, setKillLabel] = useState('');

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      n: 0, round: 0, board: null, order: [], pressedN: 0, broken: new Set(), burned: new Set(), breaking: [], boardCanvas: null, dirty: false,
      local: null, remotes: new Map(), lastSeen: new Map(), bombs: new Map(), byKey: new Map(), fires: [], dying: new Map(),
      seen: new Set(), myBombs: [], myBooms: [], myKicks: [], pending: new Set(), particles: [], shake: 0, seq: 0,
      input: { up: false, down: false, left: false, right: false }, placeEdge: false, detEdge: false, autoAt: 0,
      sentAt: 0, serverAt: 0, tickAt: 0, deathSent: false, deathLog: [], goneSent: new Set(), hudKey: '', mountedAt: 0, eff: null, stats: null,
    };
  }
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;
  const flash = (text) => { setNotice(text); setTimeout(() => setNotice((n) => (n === text ? '' : n)), 2200); };

  // Ronda nueva: el tablero de la semilla y cada uno en su esquina.
  const roundKey = room.match ? `${room.match.n}:${room.match.round}` : '';
  useEffect(() => {
    const m = room.match;
    if (!m) return;
    const s = sim.current;
    s.n = m.n; s.round = m.round;
    s.board = makeBoard(m.seed, m.size);
    s.order = pressOrder(s.board.W, s.board.H);
    s.pressedN = 0;
    s.broken = new Set(); s.burned = new Set(); s.breaking = [];
    s.boardCanvas = null; s.dirty = true;
    s.bombs = new Map(); s.byKey = new Map(); s.fires = []; s.dying = new Map();
    s.seen = new Set(); s.myBombs = []; s.myBooms = []; s.myKicks = []; s.pending = new Set(); s.particles = [];
    s.remotes.clear(); s.lastSeen.clear();
    s.deathSent = false; s.goneSent.clear(); s.tickAt = 0;
    const mine = findPlayer(room, me.id);
    const at = m.order.indexOf(me.id);
    if (mine?.inGame && at >= 0) {
      const sp = s.board.spawns[at % s.board.spawns.length];
      s.local = newPlayer(sp.x, sp.y);
      if (!mine.alive) { s.local.dead = true; s.deathSent = true; } // recargó la página ya muerto
    } else s.local = null; // entró en medio de la ronda: mira, juega la que viene
    s.mountedAt = performance.now() / 1000;
  }, [roundKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // «Eliminaste a X» cuando aparece en la lista de la sala.
  const deaths = room.match?.deaths || [];
  const seenDeaths = useRef(0);
  useEffect(() => {
    for (const d of deaths.slice(seenDeaths.current)) {
      if (d.by === me.id && d.id !== me.id) {
        const text = `Volaste a ${findPlayer(room, d.id)?.name || '¿?'}`;
        setKillLabel(text);
        setTimeout(() => setKillLabel((l) => (l === text ? '' : l)), 2400);
      }
    }
    seenDeaths.current = deaths.length;
  }, [deaths.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { seenDeaths.current = 0; }, [roundKey]);

  // ─── Lo que pasa en el tablero (igual en todas las pantallas) ─────────────
  function breakCell(s, i, now, anim) {
    if (s.board.cells[i] !== SOFT) return;
    s.board.cells[i] = FLOOR;
    s.broken.add(i);
    s.dirty = true;
    if (anim) s.breaking.push({ cell: i, t: now });
  }
  // ¿Hay un ítem a la vista en la casilla? (Ladrillo roto con ítem, que nadie agarró ni se quemó.)
  function itemVisible(s, m, i) {
    return s.broken.has(i) && !s.burned.has(i) && !m.took?.[i] && s.board.cells[i] === FLOOR && Boolean(itemAt(m.seed, i, m.skulls));
  }
  function removeBomb(s, b) {
    if (s.bombs.get(b.c) === b) s.bombs.delete(b.c);
    s.byKey.delete(b.k);
  }
  // Alguien puso una bomba (yo o un remoto).
  function applyBomb(s, ev, by) {
    const key = `b:${ev.k}`;
    if (s.seen.has(key) || !Number.isInteger(ev.c) || ev.c < 0 || ev.c >= s.board.cells.length) return;
    s.seen.add(key);
    if (s.bombs.has(ev.c) || s.board.cells[ev.c] !== FLOOR) return;
    const b = { k: ev.k, c: ev.c, by, t: ev.t, fuse: ev.r ? Infinity : Math.max(0.3, Number(ev.fz) || FUSE), fire: Math.max(1, ev.f | 0), pierce: Boolean(ev.p), remote: Boolean(ev.r), slide: null };
    s.bombs.set(ev.c, b);
    s.byKey.set(ev.k, b);
  }
  // Una bomba explotó (la mía o la de otro): el fuego, los ladrillos rotos, los ítems quemados y la cadena.
  function applyBoom(s, ev, by, now) {
    const key = `x:${ev.k}`;
    if (s.seen.has(key) || !Number.isInteger(ev.c) || !Array.isArray(ev.a) || ev.a.length !== 4) return;
    s.seen.add(key);
    const b = s.byKey.get(ev.k);
    if (b) removeBomb(s, b);
    const m = roomRef.current.match;
    const W = s.board.W;
    const cells = blastCells(W, ev.c, ev.a.map((v) => Math.max(0, Math.min(12, v | 0))));
    const broke = Array.isArray(ev.br) ? ev.br : [];
    // Los ítems que ya estaban a la vista se queman; los que destapa este mismo fuego, no.
    for (const i of cells) if (!broke.includes(i) && s.broken.has(i) && itemAt(m.seed, i, m.skulls) && !m.took?.[i]) s.burned.add(i);
    for (const i of broke) breakCell(s, i, now, true);
    const t = Number(ev.t) || now;
    s.fires.push({ k: ev.k, c: ev.c, arms: ev.a, cells: new Set(cells), t, until: Math.max(t + FIRE_TIME, now + 0.3), by });
    const cx = (ev.c % W) + 0.5, cy = Math.floor(ev.c / W) + 0.5;
    burst(s.particles, cx, cy, { n: 10, speed: 4, life: 0.5, colors: ['#ffe14a', '#ff8c1a', '#fff9c4'], gravity: 6 });
    for (const i of broke) burst(s.particles, (i % W) + 0.5, Math.floor(i / W) + 0.5, { n: 5, speed: 2.5, life: 0.5, colors: ['#b6633a', '#d9b48c'], gravity: 9 });
    s.shake = Math.max(s.shake, 0.3);
    // Cadena: una bomba mía alcanzada explota ya.
    for (const i of cells) {
      const other = s.bombs.get(i);
      if (other && other.by === me.id) explode(s, other, now);
    }
  }
  // Mi bomba explota: hasta dónde llega lo calculo yo y lo mando.
  function explode(s, b, now) {
    if (s.bombs.get(b.c) !== b) return;
    const m = roomRef.current.match;
    const { arms, broke } = blastArms(s.board, s.bombs, b.c, b.fire, b.pierce, (i) => itemVisible(s, m, i));
    const ev = { k: b.k, c: b.c, t: now, a: arms, br: broke };
    s.myBooms.push(ev);
    applyBoom(s, ev, me.id, now);
  }
  function applyKick(s, ev) {
    const key = `k:${ev.k}:${ev.t}`;
    if (s.seen.has(key)) return;
    s.seen.add(key);
    const b = s.byKey.get(ev.k);
    if (!b || b.slide) return;
    // La bomba puede estar en otra casilla acá (una foto perdida): se la acomoda donde la pateó.
    if (Number.isInteger(ev.c) && ev.c !== b.c && !s.bombs.has(ev.c)) { s.bombs.delete(b.c); b.c = ev.c; s.bombs.set(ev.c, b); }
    kickBomb(s.board, s.bombs, b, ev.d | 0);
  }
  // Cae un bloque al final de la ronda: tapa la casilla, aplasta la bomba y el ítem que hubiera, y al que esté parado ahí.
  function pressCell(s, i, now) {
    s.board.cells[i] = PRESSED;
    s.dirty = true;
    s.burned.add(i);
    const b = s.bombs.get(i);
    if (b) removeBomb(s, b);
    const p = s.local;
    if (p && !p.dead && cellOf(s.board.W, p) === i) die(s, p, null, 'press', now);
    const W = s.board.W;
    burst(s.particles, (i % W) + 0.5, Math.floor(i / W) + 0.5, { n: 6, speed: 2, life: 0.4, colors: ['#80869a', '#3a3e4a'], gravity: 8 });
    s.shake = Math.max(s.shake, 0.15);
  }
  function die(s, p, by, w, now) {
    if (p.dead) return;
    p.dead = true;
    p.moving = false;
    s.deathLog.push({ by, w, now, x: p.x, y: p.y, round: s.round });
    s.dying.set(me.id, { x: p.x, y: p.y, t: now });
    const mine = findPlayer(roomRef.current, me.id);
    if (!s.deathSent && mine?.alive) {
      s.deathSent = true;
      const m = roomRef.current.match;
      dispatchRef.current({ type: 'died', match: m.n, round: m.round, by: by || null, w });
    }
  }
  function infect(s, p, kind, now) {
    if (!SKULLS[kind]) return;
    p.skull = kind;
    p.skullUntil = now + SKULL_TIME;
    flash(`☠ ${SKULLS[kind].name}: ${SKULLS[kind].info}`);
  }

  // ─── Red ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.bomberChannel(code);
    const s = sim.current;
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== s.n || snap.r !== s.round || !s.board) return;
      const now = serverNow();
      const prev = s.remotes.get(id);
      s.lastSeen.set(id, performance.now() / 1000);
      if (!prev || snap.t > prev.snap.t) {
        if (prev && !prev.snap.dd && snap.dd) s.dying.set(id, { x: prev.x, y: prev.y, t: now });
        const jump = !prev || Math.hypot(snap.x - prev.x, snap.y - prev.y) > 2;
        s.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, walked: (prev?.walked || 0) + Math.hypot(snap.x - (prev?.snap.x ?? snap.x), snap.y - (prev?.snap.y ?? snap.y)) });
      }
      for (const ev of snap.bm || []) applyBomb(s, ev, id);
      for (const ev of snap.kk || []) applyKick(s, ev);
      for (const ev of snap.ex || []) applyBoom(s, ev, id, now);
      if (snap.bk) for (const i of unpackCells(snap.bk)) if (i < s.board.cells.length) breakCell(s, i, now, false);
      if (snap.bi) for (const i of unpackCells(snap.bi)) if (i < s.board.cells.length) s.burned.add(i);
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

    function takeItem(s, m, c, p) {
      s.pending.add(c);
      dispatchRef.current({ type: 'take', match: m.n, round: m.round, c }).then((res) => {
        const won = res?.committed && res.room?.match?.took?.[c] === me.id;
        if (!won) { s.pending.delete(c); return; }
        const now = serverNow();
        const kind = itemAt(m.seed, c, m.skulls);
        if (kind === 'skull') infect(s, p, SKULL_LIST[Math.floor(Math.random() * SKULL_LIST.length)], now);
        else if (kind === 'vest') { p.vestUntil = now + VEST_TIME; flash('Chaleco: diez segundos a prueba de fuego'); }
        else flash(ITEM_INFO[kind]?.name || kind);
        const W = s.board.W;
        burst(s.particles, (c % W) + 0.5, Math.floor(c / W) + 0.5, { n: 8, speed: 2.5, life: 0.5, colors: ['#ffd23f', '#ffffff'], gravity: -2 });
      });
    }

    function step(now) {
      const r = roomRef.current;
      const m = r.match;
      if (!m || !s.board) return;
      const W = s.board.W;
      const elapsed = now - m.startsAt / 1000;
      const total = roundSeconds(r);
      const playing = r.phase === 'playing';

      // Caen los bloques del final.
      if (playing) {
        const count = pressedCount(elapsed, total, s.order);
        while (s.pressedN < count) pressCell(s, s.order[s.pressedN++], now);
      }

      const p = s.local;
      if (p) {
        const stats = statsFor(m.seed, m.took, me.id, m.skulls);
        if (p.skull && now >= p.skullUntil) { p.skull = null; p.curedAt = now; }
        const eff = effective(stats, p, now);
        s.stats = stats; s.eff = eff;
        if (!p.dead && playing && elapsed >= 0) {
          let ax = (s.input.right ? 1 : 0) - (s.input.left ? 1 : 0), ay = (s.input.down ? 1 : 0) - (s.input.up ? 1 : 0);
          if (eff.reverse) { ax = -ax; ay = -ay; }
          const pushed = stepPlayer(p, ax, ay, STEP, s.board, s.bombs, eff.speed);
          if (pushed >= 0 && eff.kick) {
            const [dx, dy] = DIRS[pushed];
            const b = s.bombs.get(idx(W, Math.floor(p.x) + dx, Math.floor(p.y) + dy));
            if (b && !b.slide && kickBomb(s.board, s.bombs, b, pushed)) s.myKicks.push({ k: b.k, d: pushed, c: b.c, t: now });
          }
          // Poner una bomba (o que se pongan solas, con la enfermedad).
          const auto = eff.auto && Math.floor(now * 3) !== s.autoAt;
          if (auto) s.autoAt = Math.floor(now * 3);
          if (s.placeEdge || auto) {
            const mineN = bombsOf(s.bombs, me.id).length;
            if (canPlace(s.board, s.bombs, p, eff, mineN)) {
              const c = cellOf(W, p);
              const ev = { k: `${me.id}:${m.n}:${m.round}:${s.seq++}`, c, t: now, f: eff.fire, p: eff.pierce ? 1 : 0, r: eff.remote ? 1 : 0, fz: eff.fuse };
              applyBomb(s, ev, me.id);
              p.onBomb = c;
              s.myBombs.push(ev);
            } else if (s.placeEdge && eff.bombs <= 0) flash('Con esta enfermedad no podés poner bombas');
          }
          s.placeEdge = false;
          // Control remoto: E hace explotar la más vieja.
          if (s.detEdge) {
            s.detEdge = false;
            const oldest = bombsOf(s.bombs, me.id).filter((b) => b.remote).sort((a, b) => a.t - b.t)[0];
            if (oldest) explode(s, oldest, now);
            else if (!eff.remote) flash('Eso es con el control remoto, que sale de los ladrillos');
          }
          // Ítems: el que pisa la casilla se lo pide a la sala.
          const c = cellOf(W, p);
          if (itemVisible(s, m, c) && !s.pending.has(c)) takeItem(s, m, c, p);
          // Contagio: tocar a un enfermo.
          if (!p.skull && now > p.curedAt + CONTAGION_GAP) {
            for (const v of s.remotes.values()) {
              if (v.snap.sk && !v.snap.dd && Math.abs(v.x - p.x) < 0.75 && Math.abs(v.y - p.y) < 0.75) { infect(s, p, v.snap.sk, now); break; }
            }
          }
          // El fuego: si estoy parado en una casilla que arde, me volé (salvo con el chaleco).
          if (now >= p.vestUntil) {
            for (const f of s.fires) {
              if (f.until > now && f.cells.has(c)) { die(s, p, f.by, 'bomb', now); burst(s.particles, p.x, p.y, { n: 20, speed: 4, life: 0.8, colors: ['#ffffff', COLORS[findPlayer(r, me.id)?.color || 0], '#ffd23f'] }); break; }
            }
          }
        } else {
          s.placeEdge = false; s.detEdge = false;
          p.moving = false;
        }
      }

      // Bombas: se deslizan, las mías explotan cuando se les acaba la mecha. Una ajena que no explotó nunca
      // (su dueño se fue) se saca sola.
      for (const b of [...s.bombs.values()]) {
        slideBomb(s.board, s.bombs, b, STEP);
        if (b.by === me.id) { if (now - b.t >= b.fuse) explode(s, b, now); }
        else if (now - b.t > (b.remote ? 90 : b.fuse + 3)) removeBomb(s, b);
      }
      s.fires = s.fires.filter((f) => f.until > now);
    }

    function frame({ hidden }) {
      const r = roomRef.current;
      const m = r.match;
      s.room = r;
      const t = performance.now() / 1000;
      acc = Math.min(acc + (t - last), 0.25);
      const dt = Math.min(0.05, t - last);
      last = t;
      const now = serverNow();
      while (acc >= STEP) { step(now - acc + STEP); acc -= STEP; }
      if (!m || !s.board) return;
      const p = s.local;
      const W = s.board.W;

      // Los demás: hacia su última foto.
      for (const v of s.remotes.values()) {
        const k = Math.min(1, dt * 18);
        v.x += (v.snap.x - v.x) * k;
        v.y += (v.snap.y - v.y) * k;
      }

      // Mandar la foto.
      if (p && now - s.sentAt >= SEND_EVERY) {
        s.sentAt = now;
        const fresh = (list) => list.filter((e) => now - e.t < EVENT_KEEP);
        s.myBombs = fresh(s.myBombs); s.myBooms = fresh(s.myBooms); s.myKicks = fresh(s.myKicks);
        const snap = {
          n: m.n, r: m.round, t: now, x: round2(p.x), y: round2(p.y), d: p.dir, mv: p.moving ? 1 : 0, dd: p.dead ? 1 : 0,
          sk: p.skull && now < p.skullUntil ? p.skull : '', vs: now < p.vestUntil ? 1 : 0,
          bm: s.myBombs, ex: s.myBooms, kk: s.myKicks, bk: packCells(s.broken, s.board.cells.length), bi: packCells(s.burned, s.board.cells.length),
        };
        s.mesh?.broadcast(snap);
        const players = r.players.filter((pl) => pl.id !== me.id);
        const needServer = !s.mesh || players.some((pl) => !s.mesh.isOpen(pl.id));
        if (needServer && now - s.serverAt >= SERVER_EVERY && s.chan) {
          s.serverAt = now;
          s.chan.publish(me.id, JSON.stringify(snap)).catch(() => {});
        }
        // El anfitrión da por muerto al que dejó de mandar fotos (pestaña cerrada sin salir).
        if (r.hostId === me.id && r.phase === 'playing' && now > m.startsAt / 1000 + GONE_AFTER) {
          for (const pl of alivePlayers(r)) {
            if (pl.id === me.id || s.goneSent.has(pl.id)) continue;
            if (t - (s.lastSeen.get(pl.id) ?? s.mountedAt) > GONE_AFTER) { s.goneSent.add(pl.id); dispatchRef.current({ type: 'died', target: pl.id, match: m.n, round: m.round }); }
          }
        }
      }
      // El reloj de la sala: cualquiera avisa cuando hay algo que cerrar (la transacción deja pasar a uno).
      const ms = now * 1000;
      const due = r.phase === 'playing'
        ? (m.endsAt && ms >= m.endsAt) || ms >= m.startsAt + roundSeconds(r) * 1000
        : r.phase === 'roundEnd' && ms >= m.endsAt + ROUND_END_MS;
      if (due && now - s.tickAt > 1 && !me.spectator) { s.tickAt = now; dispatchRef.current({ type: 'tick', match: m.n, round: m.round }); }

      // Lo que muestra la pantalla de React.
      const elapsed = now - m.startsAt / 1000;
      const total = roundSeconds(r);
      const left = Math.max(0, total - elapsed);
      const st = s.stats, eff = s.eff;
      const sick = p?.skull && now < p.skullUntil ? p.skull : '';
      const sickLeft = sick ? Math.ceil(p.skullUntil - now) : 0;
      const vest = Boolean(p && now < p.vestUntil);
      const remoteBombs = p ? bombsOf(s.bombs, me.id).filter((b) => b.remote).length : 0;
      const key = [Math.ceil(-elapsed), Math.ceil(left), elapsed >= total - HURRY_S, p?.dead, st && [st.fire, st.bombs, st.speed, st.kick, st.pierce, st.remote].join(), sick, sickLeft, vest, !p, remoteBombs, eff?.fire].join('|');
      if (key !== s.hudKey) {
        s.hudKey = key;
        setHud({ elapsed, left: Math.ceil(left), hurry: elapsed >= total - HURRY_S && elapsed < total, dead: Boolean(p?.dead), stats: st && { ...st, fireNow: eff.fire, bombsNow: eff.bombs }, sick, sickLeft, vest, watching: !p, remoteBombs });
      }
      if (!hidden) draw(r, m, now, dt, elapsed, total);
    }

    function draw(r, m, now, dt, elapsed, total) {
      const canvas = canvasRef.current, wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const { W, H } = s.board;
      const PW = W * TILE, PH = H * TILE;
      if (canvas.width !== PW || canvas.height !== PH) { canvas.width = PW; canvas.height = PH; }
      // Escala entera para que cada píxel quede parejo.
      const sw = wrap.clientWidth, sh = wrap.clientHeight;
      if (sw && sh) {
        const raw = Math.min(sw / PW, sh / PH);
        const scale = raw >= 1 && Math.floor(raw) / raw > 0.8 ? Math.floor(raw) : raw;
        const cw = `${Math.floor(PW * scale)}px`, ch = `${Math.floor(PH * scale)}px`;
        if (canvas.style.width !== cw) { canvas.style.width = cw; canvas.style.height = ch; }
      }
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      const time = performance.now() / 1000;
      if (s.dirty || !s.boardCanvas) { s.boardCanvas = paintBoard(s.board); s.dirty = false; }
      s.shake = Math.max(0, s.shake - dt * 1.5);
      g.save();
      if (s.shake > 0) g.translate(Math.round((Math.random() - 0.5) * s.shake * 4), Math.round((Math.random() - 0.5) * s.shake * 4));
      g.drawImage(s.boardCanvas, 0, 0);

      // Ítems a la vista.
      for (const i of s.broken) if (itemVisible(s, m, i)) drawItem(g, itemAt(m.seed, i, m.skulls), (i % W) + 0.5, Math.floor(i / W) + 0.5, time);
      // Ladrillos rompiéndose.
      s.breaking = s.breaking.filter((b) => now - b.t < 0.4);
      for (const b of s.breaking) drawBreaking(g, W, b.cell, (now - b.t) / 0.4);
      // El próximo bloque que cae.
      if (r.phase === 'playing' && elapsed >= total - HURRY_S && s.pressedN < s.order.length) {
        const next = s.order[s.pressedN];
        const at = pressTime(s.pressedN, total, s.order);
        drawPressWarning(g, W, next, time);
        if (at - elapsed < 0.35) drawFalling(g, W, next, 1 - (at - elapsed) / 0.35);
      }
      // Bombas.
      for (const b of s.bombs.values()) { const pos = bombPos(W, b); drawBomb(g, pos.x, pos.y, now - b.t, b.fuse, b.remote, time); }
      // Jugadores, de arriba a abajo.
      const list = [];
      for (const pl of r.players) {
        if (pl.id === me.id) { if (s.local && !s.local.dead) list.push({ x: s.local.x, y: s.local.y, color: COLORS[pl.color], dir: s.local.dir, walked: s.local.walked, moving: s.local.moving, sick: Boolean(s.local.skull && now < s.local.skullUntil), vest: now < s.local.vestUntil, name: null }); continue; }
        const v = s.remotes.get(pl.id);
        if (!v || v.snap.dd || !pl.alive) continue;
        list.push({ x: v.x, y: v.y, color: COLORS[pl.color], dir: v.snap.d, walked: v.walked, moving: Boolean(v.snap.mv), sick: Boolean(v.snap.sk), vest: Boolean(v.snap.vs), name: pl.name });
      }
      list.sort((a, b) => a.y - b.y);
      for (const q of list) drawBomber(g, q.x, q.y, q.color, q.dir, q.walked, { moving: q.moving, sick: q.sick, vest: q.vest, name: q.name, time });
      // Los que se acaban de volar.
      for (const [id, d] of s.dying) {
        const k = (now - d.t) / DEATH_ANIM;
        if (k >= 1) { s.dying.delete(id); continue; }
        drawDying(g, d.x, d.y, COLORS[findPlayer(r, id)?.color || 0], k);
      }
      // Fuego.
      for (const f of s.fires) drawFire(g, W, f.c, f.arms, Math.max(0, now - f.t));
      s.particles = s.particles.filter((q) => q.age < q.life);
      drawParticles(g, s.particles, dt);
      g.restore();
    }

    // Para manejar la partida desde un navegador automatizado: qué ítem hay a la vista en una casilla.
    s.itemVisibleAt = (i) => Boolean(roomRef.current.match) && itemVisible(s, roomRef.current.match, i);
    s.itemKind = (i) => (roomRef.current.match ? itemAt(roomRef.current.match.seed, i, roomRef.current.match.skulls) : null);
    const stop = everyFrame(frame);
    window.__bomber = s; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__bomber === s) delete window.__bomber; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    const down = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      let used = true;
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (named) s.input[named[0]] = true;
      else if (e.code === 'Space') { if (!e.repeat) s.placeEdge = true; }
      else if (e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') { if (!e.repeat) s.detEdge = true; }
      else used = false;
      if (used) e.preventDefault();
    };
    const up = (e) => { const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code)); if (named) s.input[named[0]] = false; };
    const blur = () => Object.assign(s.input, { up: false, down: false, left: false, right: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  // ─── Pantalla ──────────────────────────────────────────────────────────────
  const m = room.match;
  const mine = findPlayer(room, me.id);
  const players = inGame(room);
  const myDeath = deaths.find((d) => d.id === me.id);
  const myKiller = myDeath?.by ? findPlayer(room, myDeath.by) : null;
  const winner = room.phase === 'roundEnd' ? findPlayer(room, m?.winner) : null;
  const st = hud.stats;
  return (
    <div className="bb-stage" data-bomber-stage>
      <div className="bb-top">
        <ul className="bb-players" data-players>
          {players.map((p) => (
            <li key={p.id} className={`${p.alive ? '' : 'is-dead'}${p.id === me.id ? ' is-me' : ''}`} data-player={p.id} data-alive={p.alive ? 1 : 0}>
              <span className="bb-chip" style={{ background: COLORS[p.color] }} />
              <b>{p.name}</b>
              <small>{'★'.repeat(p.wins)}{p.alive ? '' : ' ☠'}</small>
            </li>
          ))}
        </ul>
        <div className="bb-clock" data-clock>
          <small>Ronda {m?.round} · a {room.options.wins}</small>
          <strong className={hud.hurry ? 'is-hurry' : ''}>{hud.elapsed < 0 ? fmtTime(roundSeconds(room)) : fmtTime(hud.left)}</strong>
        </div>
      </div>
      <div className="bb-arena" ref={wrapRef}>
        <canvas ref={canvasRef} className="bb-canvas" data-bomber-canvas />
        {hud.elapsed < 0 && m && <div className="bb-countdown"><small>RONDA {m.round}</small>{Math.ceil(-hud.elapsed) <= 3 ? Math.ceil(-hud.elapsed) : '¿Listos?'}</div>}
        {hud.hurry && !hud.dead && room.phase === 'playing' && <p className="bb-hurry">¡APURATE! Caen bloques</p>}
        {killLabel && <p className="bb-killed">💥 {killLabel}</p>}
        {notice && <p className="bb-notice">{notice}</p>}
        {hud.watching && <p className="bb-watching">Entrás en la próxima ronda. Mientras tanto, mirá.</p>}
        {hud.dead && mine && room.phase === 'playing' && (
          <div className="bb-eliminated" data-eliminated>
            <strong>¡TE VOLARON!</strong>
            <span>{myDeath?.w === 'press' ? 'Te aplastó un bloque' : myDeath?.w === 'self' || myKiller?.id === me.id ? 'Con tu propia bomba' : myKiller ? <>La bomba era de <b>{myKiller.name}</b></> : 'Quedaste afuera'}</span>
          </div>
        )}
        {room.phase === 'roundEnd' && (
          <div className="bb-roundend" data-roundend>
            <small>Ronda {m.round}</small>
            <strong>{winner ? <><span className="bb-chip" style={{ background: COLORS[winner.color] }} /> {winner.name} gana la ronda</> : 'Empate: no quedó nadie'}</strong>
            <ul>
              {[...room.players].sort((a, b) => b.wins - a.wins).map((p) => <li key={p.id}><span className="bb-chip" style={{ background: COLORS[p.color] }} /> {p.name} <b>{p.wins}</b></li>)}
            </ul>
            <em>Gana la partida el primero que llega a {room.options.wins}.</em>
          </div>
        )}
      </div>
      <div className="bb-bottom">
        {st ? (
          <div className="bb-stats" data-stats>
            <span title="Alcance del fuego"><ItemIcon kind="fire" /> <b>{st.fireNow}</b></span>
            <span title="Bombas a la vez"><ItemIcon kind="bomb" /> <b>{st.bombsNow}</b></span>
            <span title="Velocidad"><ItemIcon kind="speed" /> <b>{st.speed}</b></span>
            {st.kick && <span title="Patada"><ItemIcon kind="kick" /></span>}
            {st.pierce && <span title="Bomba perforante"><ItemIcon kind="pierce" /></span>}
            {st.remote && <span title="Control remoto"><ItemIcon kind="remote" /> <b>{hud.remoteBombs}</b> <kbd>E</kbd></span>}
            {hud.vest && <span className="is-vest" title="Chaleco"><ItemIcon kind="vest" /></span>}
            {hud.sick && <span className="is-sick" title={SKULLS[hud.sick].info}><ItemIcon kind="skull" /> {SKULLS[hud.sick].name} · {hud.sickLeft}s</span>}
          </div>
        ) : <span />}
        <p className="bb-keys"><kbd>W A S D</kbd> moverse · <kbd>Espacio</kbd> bomba{st?.remote ? <> · <kbd>E</kbd> detonar</> : null}</p>
      </div>
    </div>
  );
}
