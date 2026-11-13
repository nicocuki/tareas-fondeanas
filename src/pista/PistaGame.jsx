// Pista Loca: la partida en tiempo real. Cada pantalla mueve a su robot (paso fijo), lo manda en una foto
// (WebRTC directo, respaldo en pista/{sala}/p/{id}) y avisa a la sala cuando llega a la meta o se cae.
// Las barras, los martillos y los empujadores salen de la hora de la ronda: todas las pantallas los ven igual.
// Las baldosas que pisa cada uno viajan en su foto (`tb`) y todas las rompen.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { COURSES, startSpot } from './courses.js';
import { STEP, TILE_FALL_S, bumpRobots, checkpointFor, newRobot, stepRobot } from './sim.js';
import { COLORS, findPlayer } from './game.js';

const SEND_EVERY = 1 / 25;
const SERVER_EVERY = 1 / 12;
const TILE_KEEP = 3;   // segundos que una baldosa pisada sigue viajando en las fotos
const SENS = 0.0026;
const KEYS = { f: ['KeyW', 'ArrowUp'], b: ['KeyS', 'ArrowDown'], l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], jump: ['Space'], dive: ['KeyE', 'ShiftLeft', 'ShiftRight'] };
const r2 = (v) => Math.round(v * 100) / 100;
const fmt = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

export default function PistaGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const roomRef = useRef(room);
  const dispatchRef = useRef(onDispatch);
  const offsetRef = useRef(offset);
  roomRef.current = room;
  dispatchRef.current = onDispatch;
  offsetRef.current = offset;
  const round = room.round;
  const [hud, setHud] = useState({ loading: true, count: 0, left: 0, toast: '', locked: false, out: false, done: false, watching: null });
  const sim = useRef({ input: { f: false, b: false, l: false, r: false, jump: false, dive: false }, edges: { jump: false, dive: false }, camYaw: 0, camPitch: 0.35, remotes: new Map(), broken: new Set(), breaking: new Map(), myTiles: [], sentAt: 0, serverAt: 0, tickAt: 0, toastAt: 0 }).current;
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;
  const roundN = round?.n;

  useEffect(() => {
    let dead = false;
    import('./render.js').then((mod) => {
      if (dead || !canvasRef.current) return;
      sim.r = mod.createRenderer(canvasRef.current);
      sim.rCourse = null;
      setHud((h) => ({ ...h, loading: false }));
    });
    return () => { dead = true; sim.r?.dispose(); sim.r = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada ronda: la pista, los robots en la largada y las baldosas enteras.
  useEffect(() => {
    const r = roomRef.current.round;
    if (!r) return;
    const course = COURSES[r.kind];
    const idx = Math.max(0, r.players.indexOf(me.id));
    const sp = startSpot(course, idx, r.players.length);
    Object.assign(sim, {
      n: r.n, course, robot: r.players.includes(me.id) ? newRobot(sp.x, sp.y, sp.z, sp.yaw) : null, remotes: new Map(), broken: new Set(), breaking: new Map(), myTiles: [],
      sent: false, rCourse: null, camYaw: sp.yaw, camPitch: 0.35, watch: null,
    });
    sim.toast = (text) => { sim.toastText = text; sim.toastAt = performance.now(); };
  }, [roundN]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Red ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.pistaChannel(code);
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== sim.n) return;
      const prev = sim.remotes.get(id);
      if (!prev || snap.t > prev.snap.t) {
        const jump = !prev || Math.hypot(snap.x - prev.x, snap.z - prev.z) > 6;
        sim.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, z: jump ? snap.z : prev.z, yaw: jump ? snap.yw : prev.yaw, run: prev?.run || 0 });
      }
      for (const [tile, at] of snap.tb || []) breakTile(tile, at);
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    sim.mesh = mesh; sim.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); sim.mesh = null; sim.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Una baldosa pisada se cae al rato (la hora es de la ronda; gana la más temprana).
  function breakTile(tile, at) {
    const prev = sim.breaking.get(tile);
    if (prev == null || at < prev) sim.breaking.set(tile, at);
  }

  // ─── Un cuadro ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let last = performance.now() / 1000, acc = 0, hudAt = 0, countSeen = -1;
    function frame({ hidden } = {}) {
      const r = roomRef.current;
      const rd = r.round;
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - last);
      last = t;
      if (!rd || rd.n !== sim.n || !sim.course) return;
      const now = serverNow();
      const rt = now - rd.startsAt / 1000; // segundos desde la largada (negativo en la cuenta regresiva)
      const course = sim.course;
      const bot = sim.robot;
      const out = rd.out.includes(me.id), done = rd.done.includes(me.id);
      if (sim.r && sim.rCourse !== course) { sim.r.setCourse(course); sim.rCourse = course; sim.r.resize(); }
      for (const [tile, at] of sim.breaking) if (rt >= at) sim.broken.add(tile);

      // Mover al robot propio.
      if (bot && r.phase === 'playing' && !out && !done && !(rd.kind === 'survive' && bot.y < course.fallY - 4)) {
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard++ < 8) {
          acc -= STEP;
          const go = rt >= 0;
          const i = sim.input;
          const fx = (i.r ? 1 : 0) - (i.l ? 1 : 0), fz = (i.b ? 1 : 0) - (i.f ? 1 : 0);
          const len = Math.hypot(fx, fz) || 1;
          const cs = Math.cos(sim.camYaw), sn = Math.sin(sim.camYaw);
          // Adelante es para donde mira la cámara.
          const mx = go ? (fx * cs + fz * sn) / len : 0, mz = go ? (-fx * sn + fz * cs) / len : 0;
          const tile = stepRobot(bot, { mx, mz, jump: go && sim.edges.jump, dive: go && sim.edges.dive }, course, sim.broken, Math.max(0, rt));
          sim.edges.jump = false; sim.edges.dive = false;
          if (go && tile >= 0 && !sim.breaking.has(tile)) { const at = r2(rt + TILE_FALL_S); breakTile(tile, at); sim.myTiles.push([tile, at, now]); }
        }
        if (acc > 1) acc = 0;
        bumpRobots(bot, [...sim.remotes.values()].filter((o) => !o.snap.o));
        bot.cp = checkpointFor(course, bot);
        // Se cayó: en la carrera y en la final vuelve al último lugar seguro; en la supervivencia, queda afuera.
        if (bot.y < course.fallY) {
          if (rd.kind === 'survive') {
            if (!sim.sent) { sim.sent = true; dispatchRef.current({ type: 'fall', round: rd.n }).then((res) => { if (!res?.committed) sim.sent = false; }); sim.toast('¡Te caíste! Quedaste afuera'); }
          } else {
            const c = course.checkpoints[bot.cp] || course.checkpoints[0];
            Object.assign(bot, { x: c.x + (Math.random() - 0.5) * 3, y: 1, z: c.z - 1, vx: 0, vy: 0, vz: 0, stun: 0, diving: false, yaw: 0 });
            sim.camYaw = 0;
            sim.toast('¡Al agua! Volvés al último punto');
          }
        }
        if (course.finishZ != null && bot.z <= course.finishZ && bot.y > -1 && !sim.sent) {
          sim.sent = true;
          dispatchRef.current({ type: 'finish', round: rd.n }).then((res) => { if (!res?.committed) sim.sent = false; });
          sim.toast(rd.kind === 'final' ? '¡Llegaste!' : '¡Clasificaste! 🎉');
        }
      }

      // Se acabó el tiempo o la pausa: cualquiera lo avisa.
      if (((r.phase === 'playing' && now * 1000 >= rd.endsAt) || (r.phase === 'roundEnd' && now * 1000 >= rd.nextAt)) && t - sim.tickAt > 1) { sim.tickAt = t; dispatchRef.current({ type: 'tick', round: rd.n }); }

      // Mandar la foto.
      if (bot && now - sim.sentAt >= SEND_EVERY) {
        sim.sentAt = now;
        sim.myTiles = sim.myTiles.filter((e) => now - e[2] < TILE_KEEP);
        const snap = { n: rd.n, t: now, x: r2(bot.x), y: r2(bot.y), z: r2(bot.z), yw: r2(bot.yaw), g: bot.grounded ? 1 : 0, dv: bot.diving ? 1 : 0, st: bot.stun > 0 ? 1 : 0, mv: Math.hypot(bot.vx, bot.vz) > 0.6 ? 1 : 0, o: out || done ? 1 : 0, ...(sim.myTiles.length ? { tb: sim.myTiles.map(([a, b]) => [a, b]) } : {}) };
        sim.mesh?.broadcast(snap);
        const others = rd.players.filter((id) => id !== me.id);
        const needServer = !sim.mesh || others.some((id) => !sim.mesh.isOpen(id));
        if (needServer && now - sim.serverAt >= SERVER_EVERY && sim.chan) { sim.serverAt = now; sim.chan.publish(me.id, JSON.stringify(snap)).catch(() => {}); }
      }

      // Los demás se acercan a su última foto.
      const kk = Math.min(1, dt * 14);
      for (const rem of sim.remotes.values()) {
        rem.x += (rem.snap.x - rem.x) * kk; rem.y += (rem.snap.y - rem.y) * kk; rem.z += (rem.snap.z - rem.z) * kk;
        let dy = rem.snap.yw - rem.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rem.yaw += dy * kk;
        if (rem.snap.mv) rem.run += dt * 11;
      }

      const countdown = Math.ceil(-rt);
      if (r.phase === 'playing' && countdown !== countSeen && countdown >= 0 && countdown <= 3) { countSeen = countdown; }

      // La cámara: detrás del robot (o de alguien que sigue, si quedaste afuera o ya llegaste).
      let focus = bot && !out && !done ? bot : null;
      if (!focus) {
        const alive = rd.players.filter((id) => id !== me.id && !rd.out.includes(id) && !rd.done.includes(id));
        const id = alive.includes(sim.watch) ? sim.watch : alive[0];
        sim.watch = id;
        focus = id && sim.remotes.get(id);
        if (!focus) focus = bot || { x: 0, y: 0, z: 0 };
      }
      const dist = 7.5;
      const cx = focus.x + Math.sin(sim.camYaw) * Math.cos(sim.camPitch) * dist;
      const cz = focus.z + Math.cos(sim.camYaw) * Math.cos(sim.camPitch) * dist;
      const cy = focus.y + 1.2 + Math.sin(sim.camPitch) * dist;
      if (!hidden && sim.r) {
        for (const id of rd.players) {
          const pl = findPlayer(r, id);
          if (!pl) continue;
          if (id === me.id) { sim.r.setRobot(id, bot && !out ? { self: true, color: COLORS[pl.color], name: pl.name, x: bot.x, y: bot.y, z: bot.z, yaw: bot.yaw, moving: Math.hypot(bot.vx, bot.vz) > 0.6, grounded: bot.grounded, diving: bot.diving, stun: bot.stun > 0, run: bot.run } : null); continue; }
          const rem = sim.remotes.get(id);
          sim.r.setRobot(id, rem && !rd.out.includes(id) ? { color: COLORS[pl.color], name: pl.name, x: rem.x, y: rem.y, z: rem.z, yaw: rem.yaw, moving: Boolean(rem.snap.mv), grounded: Boolean(rem.snap.g), diving: Boolean(rem.snap.dv), stun: Boolean(rem.snap.st), run: rem.run } : null);
        }
        sim.r.draw({ x: cx, y: cy, z: cz, tx: focus.x, ty: focus.y + 1.3, tz: focus.z }, Math.max(0, rt), sim.broken, sim.breaking);
      }

      if (t - hudAt > 0.1) {
        hudAt = t;
        setHud({
          loading: !sim.r, count: r.phase === 'playing' ? Math.max(0, countdown) : 0, go: rt >= 0 && rt < 1.2, left: Math.max(0, rd.endsAt / 1000 - now), toast: performance.now() - sim.toastAt < 2600 ? sim.toastText : '',
          locked: document.pointerLockElement === canvasRef.current, out, done, racing: Boolean(bot), watching: !bot || out || done ? findPlayer(r, sim.watch)?.name : null, nextIn: Math.max(0, Math.ceil(rd.nextAt / 1000 - now)),
        });
      }
    }
    const stop = everyFrame(frame);
    window.__pista = sim; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__pista === sim) delete window.__pista; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ───────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const isField = (t) => t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement;
    const down = (e) => {
      if (isField(e.target)) return;
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (!named) return;
      if (!sim.input[named[0]] && (named[0] === 'jump' || named[0] === 'dive')) sim.edges[named[0]] = true;
      sim.input[named[0]] = true;
      e.preventDefault();
    };
    const up = (e) => { const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code)); if (named) sim.input[named[0]] = false; };
    const move = (e) => {
      if (document.pointerLockElement !== canvas) return;
      sim.camYaw -= e.movementX * SENS;
      sim.camPitch = Math.max(-0.1, Math.min(1.2, sim.camPitch + e.movementY * SENS));
    };
    const click = (e) => { if (document.pointerLockElement === canvas && e.button === 0) { const ids = roomRef.current.round?.players.filter((id) => id !== me.id) || []; if (ids.length) sim.watch = ids[(ids.indexOf(sim.watch) + 1) % ids.length]; } };
    const blur = () => { Object.keys(sim.input).forEach((k) => { sim.input[k] = false; }); };
    const resize = () => sim.r?.resize();
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('mousemove', move); window.addEventListener('mousedown', click);
    window.addEventListener('blur', blur); window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('mousemove', move); window.removeEventListener('mousedown', click);
      window.removeEventListener('blur', blur); window.removeEventListener('resize', resize);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lock = () => { try { canvasRef.current?.requestPointerLock?.(); } catch {} };
  const course = round ? COURSES[round.kind] : null;
  const nameOf = (id) => findPlayer(room, id)?.name || '¿?';
  const qualified = round?.kind === 'survive' ? round.players.length - round.out.length : round?.done.length;

  return (
    <div className="pl-stage" data-pista data-round={round?.kind}>
      <canvas ref={canvasRef} className="pl-canvas" data-pista-canvas onClick={lock} />
      {course && (
        <div className="pl-top">
          <span className="pl-pill pl-round">Ronda {round.i + 1} · {course.title}: {course.name}</span>
          <span className="pl-pill" data-clock>⏱ {fmt(hud.left)}</span>
          <span className="pl-pill" data-qualified>{round.kind === 'survive' ? `En pie ${qualified}/${round.players.length} · pasan ${round.quota}` : round.kind === 'final' ? '👑 Gana el primero' : `Clasificados ${qualified}/${round.quota}`}</span>
        </div>
      )}
      {hud.loading && <div className="pl-center">Cargando la pista…</div>}
      {!hud.loading && hud.count > 0 && <div className="pl-center pl-count" data-count={hud.count}><small>{course?.goal}</small>{hud.count}</div>}
      {!hud.loading && hud.go && room.phase === 'playing' && <div className="pl-center pl-go">¡YA!</div>}
      {hud.toast && <div className="pl-toast">{hud.toast}</div>}
      {hud.watching && room.phase === 'playing' && <div className="pl-watch">Mirando a <b>{hud.watching}</b> · clic para cambiar</div>}
      {!hud.loading && !hud.locked && room.phase === 'playing' && hud.racing && !hud.out && !hud.done && (
        <button type="button" className="pl-lock" onClick={lock}>Hacé clic para jugar<small>WASD correr · mouse mover la cámara · Espacio saltar · E o Shift tirarse de cabeza · Esc soltar el mouse</small></button>
      )}
      {room.phase === 'roundEnd' && round?.result && (
        <div className="pl-results" data-results>
          <h2>{round.last ? '🏁 ¡Terminó!' : `Fin de la ronda ${round.i + 1}`}</h2>
          {round.last ? <p className="pl-crown">👑 {room.winner ? nameOf(room.winner) : 'Nadie'}</p> : <p>Pasan a la siguiente ronda:</p>}
          {!round.last && <ul>{round.result.qualified.map((id) => <li key={id} className={id === me.id ? 'is-me' : ''}><i style={{ background: COLORS[findPlayer(room, id)?.color ?? 0] }} />{nameOf(id)}</li>)}</ul>}
          {round.result.eliminated.length > 0 && <p className="pl-out">Afuera: {round.result.eliminated.map(nameOf).join(', ')}</p>}
          <small>{round.last ? 'Ahora la tabla…' : `La próxima arranca en ${hud.nextIn}…`}</small>
        </div>
      )}
    </div>
  );
}
