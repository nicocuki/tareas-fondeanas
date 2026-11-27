// La nave en tiempo real: dibujo, teclado, red y los botones de acción (usar, matar, reportar,
// sabotear, ventilaciones).
//
// Cada pantalla es dueña de su jugador (como en A los Tiros): lo mueve y manda su posición directo
// a los demás (WebRTC) o, si con alguien no se puede, por el servidor. Lo que cambia la partida
// (matar, reportar, una tarea, un sabotaje) va a la sala con una acción del reducer (game.js).
// Este componente queda montado durante toda la partida, también en las reuniones: así la conexión
// y las posiciones siguen vivas.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { BUTTON, LIGHTS_PANEL, REACTOR_HANDS, ROOM_BY_ID, STATIONS, VENTS, spawnPoint } from './map.js';
import { TASKS, currentStation, taskDone } from './tasks.js';
import {
  BUTTON_RANGE, KILL_RANGE, REPORT_RANGE, USE_RANGE, colorOf, findPlayer, inGame, taskLabel, taskProgress,
} from './game.js';
import { BASE_SPEED, BASE_VISION, LIGHTS_OUT, canSee, step, visionPolygon } from './sim.js';
import { drawBody, drawCrewmate, drawFog, drawName, drawParticles, drawWorld, stepParticles, worldTransform } from './render.js';
import Minigame, { capture } from './Minigames.jsx';
import Bean from './Bean.jsx';
import { ChatBox } from './Meeting.jsx';
import { ActionPad, Icon, SabotageBanner, ShipMap, TaskPanel } from './Hud.jsx';

const SEND_EVERY = 1 / 20;    // posiciones por el canal directo
const SERVER_EVERY = 1 / 10;  // posiciones de respaldo por el servidor
const GONE_AFTER = 15;        // sin noticias de alguien este tiempo, el anfitrión lo saca
const TILES_ACROSS = 26;      // cuántas casillas entran a lo ancho de la pantalla
const VENT_RANGE = 1.4;

const KEYS = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
};
// Partículas (solo dibujo): polvo al caminar, sangre, humo de ventilación y destellos.
const rnd = (a, b) => a + Math.random() * (b - a);
function addFx(s, p) { if (s.fx.length < 320) s.fx.push({ max: p.life, g: 0, ...p }); }
function dust(s, x, y) { for (let i = 0; i < 2; i++) addFx(s, { kind: 'dust', x: x + rnd(-0.2, 0.2), y: y + 0.3, vx: rnd(-0.5, 0.5), vy: rnd(-0.7, -0.2), life: rnd(0.3, 0.5), size: rnd(0.08, 0.14), color: 'rgba(225,225,215,0.55)' }); }
function bloodBurst(s, x, y) {
  addFx(s, { kind: 'ring', x, y: y - 0.3, vx: 0, vy: 0, life: 0.45, size: 1.6, color: '#ff4040' });
  for (let i = 0; i < 22; i++) addFx(s, { kind: 'blood', x, y: y - 0.3, vx: rnd(-3.2, 3.2), vy: rnd(-4.6, -1), g: 13, life: rnd(0.6, 1.1), size: rnd(0.07, 0.17), color: i % 3 ? '#b71212' : '#e02424', floor: y + 0.3 + rnd(-0.1, 0.2) });
}
function ventPuff(s, x, y) { for (let i = 0; i < 8; i++) addFx(s, { kind: 'puff', x: x + rnd(-0.5, 0.5), y: y + rnd(-0.2, 0.2), vx: rnd(-0.8, 0.8), vy: rnd(-1.6, -0.5), life: rnd(0.5, 0.9), size: rnd(0.14, 0.28), color: 'rgba(170,175,185,0.6)' }); }
function sparkle(s, x, y, color = '#7dffa1') { for (let i = 0; i < 14; i++) addFx(s, { kind: 'spark', x: x + rnd(-0.3, 0.3), y: y - rnd(0.2, 1.2), vx: rnd(-1.6, 1.6), vy: rnd(-2.6, -0.6), g: 3, life: rnd(0.5, 0.9), size: rnd(0.06, 0.13), color }); }

const roomName = (station) => ROOM_BY_ID[station?.split(':')[1]]?.name || '';
const stationPoint = (id) => ({ x: STATIONS[id][0], y: STATIONS[id][1] });

export default function NaveGame({ room, me, code, offset, onDispatch, paused }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const roomRef = useRef(room);
  roomRef.current = room;
  const dispatchRef = useRef(onDispatch);
  dispatchRef.current = onDispatch;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const [hud, setHud] = useState({});
  const [overlay, setOverlay] = useState(null); // { kind: 'task' | 'lights' | 'reactor', … }: ventanas que frenan al jugador
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  // El mapa no es una ventana: se ve encima del juego y te podés seguir moviendo.
  const [mapOpen, setMapOpen] = useState(false);
  const mapOpenRef = useRef(false);
  mapOpenRef.current = mapOpen;
  const [note, setNote] = useState('');
  const [killedBy, setKilledBy] = useState(null);

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      game: -1, round: -1, local: { x: BUTTON.x, y: BUTTON.y + 5, vx: 0, vy: 0, facing: 1, phase: 0 },
      remotes: new Map(), lastSeen: new Map(), input: { up: false, down: false, left: false, right: false },
      vent: -1, scanning: false, sentAt: 0, serverAt: 0, mountedAt: performance.now() / 1000, goneSent: new Set(),
      ventAnim: new Map(), hudKey: '', hudAt: 0, wasAlive: true,
      fx: [], bodySeen: new Map(), cam: null, dustAt: new Map(),
    };
  }
  const serverNow = () => Date.now() + offsetRef.current;

  // ─── Red ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.naveChannel(code);
    const s = sim.current;
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      const r = roomRef.current;
      if (snap.n !== r.game || snap.r < r.round) return;
      const prev = s.remotes.get(id);
      if (prev && snap.t <= prev.snap.t) return;
      const t = performance.now() / 1000;
      s.lastSeen.set(id, t);
      // Entró o salió de una ventilación: se ve abrirse la tapa.
      const pv = prev?.snap.v ?? -1;
      if (prev && pv !== snap.v) {
        const vent = snap.v >= 0 ? snap.v : pv;
        if (vent >= 0) { s.ventAnim.set(vent, t + 0.6); ventPuff(s, VENTS[vent].x, VENTS[vent].y); }
      }
      const jump = !prev || snap.r !== prev.snap.r || Math.hypot(snap.x - prev.x, snap.y - prev.y) > 4;
      s.remotes.set(id, { snap, at: t, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, phase: prev?.phase || 0 });
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
  }, [code, me.id]);

  // ─── Lo que hay cerca: qué se puede usar, a quién matar, qué reportar ───────
  function nearby(r, mine, local) {
    const s = sim.current;
    const o = r.options;
    const now = serverNow();
    const alive = mine.alive;
    const out = { use: null, kill: null, report: null };
    if (r.phase !== 'playing') return out;
    if (s.vent >= 0) { out.use = { kind: 'exitVent', label: 'Salir' }; return out; }
    let best = Infinity;
    const offer = (d, range, use) => { if (d <= range && d < best) { best = d; out.use = use; } };
    if (!mine.impostor) {
      mine.tasks.forEach((t, i) => {
        const st = currentStation(t);
        if (!st) return;
        const p = stationPoint(st);
        offer(Math.hypot(p.x - local.x, p.y - local.y), USE_RANGE, { kind: 'task', task: i, station: st, game: TASKS[t.k].game, label: TASKS[t.k].name });
      });
    }
    if (alive) {
      offer(Math.hypot(BUTTON.x - local.x, BUTTON.y - local.y), BUTTON_RANGE, { kind: 'button', label: 'Reunión' });
      if (r.sabotage?.kind === 'lights') offer(Math.hypot(LIGHTS_PANEL.x - local.x, LIGHTS_PANEL.y - local.y), USE_RANGE + 0.4, { kind: 'lights', label: 'Luces' });
      if (r.sabotage?.kind === 'reactor') REACTOR_HANDS.forEach((h, i) => offer(Math.hypot(h.x - local.x, h.y - local.y), USE_RANGE + 0.4, { kind: 'reactor', side: i, label: 'Reactor' }));
      if (mine.impostor) VENTS.forEach((v, i) => offer(Math.hypot(v.x - local.x, v.y - local.y), VENT_RANGE, { kind: 'vent', vent: i, label: 'Ventilación' }));
      // Reportar: el cuerpo más cerca que se ve.
      const radius = visionRadius(r, mine);
      let bd = Infinity;
      for (const b of r.bodies) {
        const d = Math.hypot(b.x - local.x, b.y - local.y);
        if (d <= REPORT_RANGE && d < bd && canSee(local.x, local.y, b.x, b.y, radius)) { bd = d; out.report = b.id; }
      }
      // Matar: el tripulante vivo más cerca que se ve.
      if (mine.impostor) {
        let kd = Infinity;
        for (const p of inGame(r)) {
          if (p.id === mine.id || !p.alive || p.impostor) continue;
          const v = s.remotes.get(p.id);
          if (!v || v.snap.v >= 0) continue;
          const d = Math.hypot(v.x - local.x, v.y - local.y);
          if (d <= KILL_RANGE[o.killDistance] && d < kd && canSee(local.x, local.y, v.x, v.y, radius)) { kd = d; out.kill = p.id; }
        }
        out.killLeft = Math.max(0, (r.killReadyAt[mine.id] || 0) - now);
      }
    }
    return out;
  }

  // ─── Bucle principal ────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    let last = performance.now() / 1000;
    function frame({ hidden }) {
      const r = roomRef.current;
      const mine = findPlayer(r, me.id);
      if (!mine?.inGame) return;
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last);
      last = t;
      const local = s.local;

      // Partida nueva o vuelta de una reunión: todos a la cafetería.
      if (r.game !== s.game || r.round !== s.round) {
        const ids = inGame(r).map((p) => p.id).sort();
        const sp = spawnPoint(Math.max(0, ids.indexOf(me.id)), ids.length);
        local.x = sp.x; local.y = sp.y;
        local.facing = sp.x < BUTTON.x ? 1 : -1;
        if (r.game !== s.game) { s.remotes.clear(); s.lastSeen.clear(); s.goneSent.clear(); s.mountedAt = t; s.bodySeen.clear(); s.bodiesInit = false; s.fx.length = 0; }
        s.cam = null;
        s.game = r.game;
        s.round = r.round;
        s.vent = -1;
        s.scanning = false;
      }

      // Moverse.
      const ghost = !mine.alive;
      const free = r.phase === 'playing' && !pausedRef.current && !overlayRef.current && s.vent < 0;
      const dir = free ? { x: (s.input.right ? 1 : 0) - (s.input.left ? 1 : 0), y: (s.input.down ? 1 : 0) - (s.input.up ? 1 : 0) } : { x: 0, y: 0 };
      const px = local.x, py = local.y;
      step(local, dir, dt, { speed: BASE_SPEED * r.options.speed * (ghost ? 1.2 : 1), ghost });
      const moved = Math.hypot(local.x - px, local.y - py);
      local.phase += moved * 3.2;
      local.moving = moved > 0.001;
      if (local.moving && !ghost && s.vent < 0) {
        const k = Math.floor(local.phase / Math.PI);
        if (s.dustAt.get('me') !== k) { s.dustAt.set('me', k); dust(s, local.x, local.y); }
      }

      // Mandar la posición.
      const now = serverNow();
      if (t - s.sentAt >= SEND_EVERY) {
        s.sentAt = t;
        const snap = { n: r.game, r: r.round, t: now, x: Math.round(local.x * 100) / 100, y: Math.round(local.y * 100) / 100, f: local.facing, m: local.moving ? 1 : 0, v: s.vent, sc: s.scanning ? 1 : 0 };
        s.mesh?.broadcast(snap);
        const others = inGame(r).filter((p) => p.id !== me.id);
        const needServer = !s.mesh || others.some((p) => !s.mesh.isOpen(p.id));
        if (needServer && t - s.serverAt >= SERVER_EVERY && s.chan) {
          s.serverAt = t;
          s.chan.publish(me.id, JSON.stringify(snap)).catch(() => {});
        }
        // El anfitrión saca al que dejó de mandar (pestaña cerrada sin salir).
        if (r.hostId === me.id && (r.phase === 'playing' || r.phase === 'meeting')) {
          for (const p of others) {
            if (s.goneSent.has(p.id)) continue;
            if (t - (s.lastSeen.get(p.id) ?? s.mountedAt) > GONE_AFTER) { s.goneSent.add(p.id); dispatchRef.current({ type: 'gone', target: p.id }); }
          }
        }
      }

      // Los demás: hacia su última posición.
      for (const v of s.remotes.values()) {
        const k = Math.min(1, dt * 14);
        const ox = v.x, oy = v.y;
        v.x += (v.snap.x - v.x) * k;
        v.y += (v.snap.y - v.y) * k;
        const mv = Math.hypot(v.x - ox, v.y - oy);
        v.phase += mv * 3.2;
        if (mv > 0.001 && v.snap.v < 0 && s.visible?.has(v)) {
          const kk = Math.floor(v.phase / Math.PI);
          if (v.dk !== kk) { v.dk = kk; dust(s, v.x, v.y); }
        }
      }
      stepParticles(s.fx, dt);

      // Botones de acción: se recalculan 10 veces por segundo y solo se avisa si cambió algo.
      if (t - s.hudAt > 0.1) {
        s.hudAt = t;
        const n = nearby(r, mine, local);
        const key = JSON.stringify([n.use, n.kill, n.report, Math.ceil((n.killLeft || 0) / 1000), s.vent]);
        if (key !== s.hudKey) { s.hudKey = key; setHud(n); }
      }

      if (!hidden) draw(r, mine, now / 1000);
    }

    function draw(r, mine, nowS) {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cssW = wrap.clientWidth, cssH = wrap.clientHeight;
      if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      const ctx = canvas.getContext('2d');
      const local = s.local;
      const t = performance.now() / 1000;
      // La cámara te sigue con suavidad (y salta de golpe si te teletransportás: ventilación, reunión).
      const tx = local.x, ty = local.y - 0.6;
      if (!s.cam || Math.hypot(tx - s.cam.x, ty - s.cam.y) > 5) s.cam = { x: tx, y: ty, t };
      else { const k = 1 - Math.exp(-(t - s.cam.t) * 14); s.cam.x += (tx - s.cam.x) * k; s.cam.y += (ty - s.cam.y) * k; s.cam.t = t; }
      const cam = { x: s.cam.x, y: s.cam.y, scale: canvas.width / TILES_ACROSS, w: canvas.width, h: canvas.height };
      const ghost = !mine.alive;
      const myStations = new Set(mine.impostor ? [] : mine.tasks.map(currentStation).filter(Boolean));
      const ventOpen = new Map();
      for (const [i, until] of s.ventAnim) if (until > t) ventOpen.set(i, 1);
      if (s.vent >= 0) ventOpen.set(s.vent, 1);
      drawWorld(ctx, cam, {
        now: nowS, myStations, lights: r.sabotage?.kind === 'lights' ? r.sabotage.switches : null,
        reactor: r.sabotage?.kind === 'reactor' ? r.sabotage : null, ventOpen,
      });

      const radius = visionRadius(r, mine);
      const sees = (x, y) => ghost || canSee(local.x, local.y, x, y, radius);
      const items = [];
      // Los cuerpos que ya estaban (recarga de la página) no hacen la animación de caída.
      if (!s.bodiesInit) { for (const b of r.bodies) s.bodySeen.set(b.id, t - 99); s.bodiesInit = true; }
      for (const b of r.bodies) {
        const p = findPlayer(r, b.id);
        const seen = sees(b.x, b.y);
        if (!s.bodySeen.has(b.id)) { s.bodySeen.set(b.id, t); if (seen) bloodBurst(s, b.x, b.y); }
        const age = t - s.bodySeen.get(b.id);
        if (seen) items.push({ y: b.y, draw: () => drawBody(ctx, b.x, b.y, colorOf(p).body, age) });
      }
      s.visible = new Set();
      const names = [];
      for (const p of inGame(r)) {
        if (p.id === me.id) continue;
        const v = s.remotes.get(p.id);
        if (!v) continue;
        if (!p.alive) {
          // Los fantasmas solo los ven los fantasmas.
          if (!ghost) continue;
          items.push({ y: v.y, draw: () => drawCrewmate(ctx, v.x, v.y, colorOf(p).body, { facing: v.snap.f, ghost: true, alpha: 0.5, now: nowS }) });
          names.push([v.x, v.y, p.name, 'rgba(255,255,255,0.6)']);
          continue;
        }
        if (v.snap.v >= 0 || !sees(v.x, v.y)) continue;
        s.visible.add(v);
        items.push({ y: v.y, draw: () => drawCrewmate(ctx, v.x, v.y, colorOf(p).body, { facing: v.snap.f, phase: v.phase, moving: Boolean(v.snap.m), scanning: Boolean(v.snap.sc), now: nowS }) });
        names.push([v.x, v.y, p.name, mine.impostor && p.impostor ? '#ff4d4d' : '#ffffff']);
      }
      if (s.vent < 0) {
        items.push({ y: local.y, draw: () => drawCrewmate(ctx, local.x, local.y, colorOf(mine).body, { facing: local.facing, phase: local.phase, moving: local.moving, ghost, alpha: ghost ? 0.55 : 1, scanning: s.scanning, now: nowS }) });
        names.push([local.x, local.y, mine.name, mine.impostor ? '#ff4d4d' : '#ffffff']);
      }
      // Primero la niebla y después los que se ven: así se ven enteros aunque estén en el borde.
      if (!ghost) drawFog(ctx, cam, visionPolygon(local.x, local.y, radius), local.x, local.y, radius);
      worldTransform(ctx, cam);
      items.sort((a, b) => a.y - b.y).forEach((it) => it.draw());
      drawParticles(ctx, s.fx);
      for (const [x, y, text, color] of names) drawName(ctx, x, y, text, color);

      // Dentro de una ventilación: flechas hacia las que conectan.
      if (s.vent >= 0) {
        const v = VENTS[s.vent];
        for (const to of v.to) {
          const w = VENTS[to];
          const a = Math.atan2(w.y - v.y, w.x - v.x);
          ctx.save();
          const nudge = 2.8 + Math.sin(t * 6) * 0.18;
          ctx.translate(v.x + Math.cos(a) * nudge, v.y + Math.sin(a) * nudge);
          ctx.rotate(a);
          ctx.fillStyle = '#ff4d4d'; ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 0.08; ctx.lineJoin = 'round';
          ctx.beginPath(); ctx.moveTo(0.7, 0); ctx.lineTo(-0.35, -0.55); ctx.lineTo(-0.35, 0.55); ctx.closePath(); ctx.fill(); ctx.stroke();
          ctx.restore();
        }
      }
    }

    const stop = everyFrame(frame);
    window.__nave = s; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__nave === s) delete window.__nave; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Cambios de la sala que tocan la pantalla ──────────────────────────────
  const mine = findPlayer(room, me.id);
  useEffect(() => {
    // Fuera de la partida (reunión, final) se cierra todo y se sale de la ventilación.
    if (room.phase !== 'playing') { closeOverlay(); setMapOpen(false); sim.current.vent = -1; }
  }, [room.phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const s = sim.current;
    if (s.wasAlive && !mine.alive && room.phase === 'playing') {
      const body = room.bodies.find((b) => b.id === me.id);
      if (body) { setKilledBy(body.by); setTimeout(() => setKilledBy(null), 2600); }
      if (overlayRef.current?.kind !== 'task') closeOverlay();
    }
    s.wasAlive = mine.alive;
  }, [mine.alive]); // eslint-disable-line react-hooks/exhaustive-deps
  // Las luces o el reactor arreglados (o una tarea ya hecha): se cierra su ventana.
  useEffect(() => {
    if (overlay?.kind === 'lights' && room.sabotage?.kind !== 'lights') closeOverlay();
    if (overlay?.kind === 'reactor' && room.sabotage?.kind !== 'reactor') closeOverlay();
  }, [room.sabotage]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeOverlay() {
    const o = overlayRef.current;
    if (o?.kind === 'reactor') release(o.side);
    sim.current.scanning = false;
    overlayRef.current = null;
    setOverlay(null);
  }
  function release(side) {
    const r = roomRef.current;
    if (r.sabotage?.kind === 'reactor' && r.sabotage.hold[side] === me.id) onDispatch({ type: 'holdReactor', side, on: false });
  }
  function flash(text) { setNote(text); setTimeout(() => setNote((n) => (n === text ? '' : n)), 2200); }

  // ─── Acciones ──────────────────────────────────────────────────────────────
  function use() {
    const u = hud.use;
    const s = sim.current;
    if (!u || room.phase !== 'playing' || paused) return;
    if (u.kind === 'exitVent') { s.ventAnim.set(s.vent, performance.now() / 1000 + 0.6); ventPuff(s, VENTS[s.vent].x, VENTS[s.vent].y); s.vent = -1; return; }
    if (u.kind === 'vent') {
      const v = VENTS[u.vent];
      s.vent = u.vent;
      s.local.x = v.x; s.local.y = v.y;
      s.ventAnim.set(u.vent, performance.now() / 1000 + 0.6);
      ventPuff(s, v.x, v.y);
      return;
    }
    if (u.kind === 'button') {
      const left = room.emergencyReadyAt - serverNow();
      if (mine.meetingsLeft <= 0) flash('Ya usaste tus reuniones de emergencia.');
      else if (room.sabotage?.kind === 'reactor') flash('¡No hay tiempo! Primero arreglen el reactor.');
      else if (left > 0) flash(`El botón se puede usar en ${Math.ceil(left / 1000)} s.`);
      else onDispatch({ type: 'emergency' });
      return;
    }
    if (u.kind === 'task') { setMapOpen(false); sim.current.scanning = u.game === 'scan'; setOverlay({ kind: 'task', task: u.task, station: u.station, game: u.game, label: u.label }); return; }
    if (u.kind === 'lights') { setOverlay({ kind: 'lights' }); return; }
    if (u.kind === 'reactor') setOverlay({ kind: 'reactor', side: u.side });
  }
  function moveVent(to) {
    const s = sim.current;
    if (s.vent < 0 || !VENTS[s.vent].to.includes(to)) return;
    s.vent = to;
    s.local.x = VENTS[to].x; s.local.y = VENTS[to].y;
  }
  async function kill() {
    if (!hud.kill || hud.killLeft > 0) return;
    const v = sim.current.remotes.get(hud.kill);
    if (!v) return;
    const result = await onDispatch({ type: 'kill', target: hud.kill, x: v.x, y: v.y });
    // Como en el original: el impostor queda parado donde estaba la víctima.
    if (result?.committed) { sim.current.local.x = v.x; sim.current.local.y = v.y; }
  }
  function report() { if (hud.report) onDispatch({ type: 'report', body: hud.report }); }
  function sabotage(kind) { onDispatch({ type: 'sabotage', kind }); setMapOpen(false); }
  function taskDoneStep(o) {
    const t = mine.tasks[o.task];
    if (t && !taskDone(t) && t.s[t.d] === o.station) { onDispatch({ type: 'task', task: o.task, step: t.d }); sparkle(sim.current, sim.current.local.x, sim.current.local.y); }
    closeOverlay();
  }

  // ─── Teclado ───────────────────────────────────────────────────────────────
  const actions = useRef({});
  actions.current = { use, kill, report, moveVent, closeOverlay, toggleMap: () => { if (!overlayRef.current) setMapOpen((o) => !o); }, escape: () => { if (overlayRef.current) closeOverlay(); else setMapOpen(false); } };
  useEffect(() => {
    const s = sim.current;
    const set = (code, value) => {
      let used = false;
      for (const [name, codes] of Object.entries(KEYS)) if (codes.includes(code)) { s.input[name] = value; used = true; }
      return used;
    };
    const down = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (set(e.code, true)) { e.preventDefault(); return; }
      if (e.repeat) return;
      const a = actions.current;
      if (e.code === 'KeyE' || e.code === 'Space') { e.preventDefault(); a.use(); }
      else if (e.code === 'KeyQ') a.kill();
      else if (e.code === 'KeyR') a.report();
      else if (e.code === 'Tab' || e.code === 'KeyM') { e.preventDefault(); a.toggleMap(); }
      else if (e.code === 'Escape') a.escape();
      else if (/^Digit[1-3]$/.test(e.code) && s.vent >= 0) a.moveVent(VENTS[s.vent].to[Number(e.code.slice(5)) - 1]);
    };
    const up = (e) => { set(e.code, false); };
    const blur = () => Object.assign(s.input, { up: false, down: false, left: false, right: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  // ─── Pantalla ──────────────────────────────────────────────────────────────
  const now = Date.now() + offset;
  const progress = taskProgress(room);
  const sab = room.sabotage;
  const killer = killedBy && findPlayer(room, killedBy);
  const inVent = sim.current.vent >= 0;
  const playing = room.phase === 'playing';
  const sabotageLeft = Math.max(0, (room.sabotageReadyAt || 0) - now);
  const mapTasks = useMemo(() => (mine.impostor ? [] : mine.tasks.map(currentStation).filter(Boolean).map((id) => STATIONS[id])), [mine.tasks, mine.impostor]);
  return (
    <div className="nv-stage" ref={wrapRef}>
      <canvas ref={canvasRef} className="nv-canvas" data-nave-canvas />

      {sab?.kind === 'reactor' && <div className="nv-alarm" />}
      {sab?.kind === 'lights' && <div className="nv-dimmer" />}

      <TaskPanel room={room} mine={mine} progress={progress} now={now} roomName={roomName} />
      <SabotageBanner sab={sab} now={now} mine={mine} />

      {note && <p className="nv-note" role="status">{note}</p>}
      {!mine.alive && playing && !killer && (
        <p className="nv-ghost-banner"><Icon name="alarm" size={18} /> Sos un fantasma. {mine.impostor ? 'Todavía podés sabotear.' : 'Terminá tus tareas para ayudar a los tripulantes.'}</p>
      )}

      {inVent && (
        <div className="nv-vent-moves">
          {VENTS[sim.current.vent].to.map((to, i) => (
            <button key={to} type="button" className="nv-ventbtn" onClick={() => moveVent(to)}><kbd>{i + 1}</kbd> {ROOM_BY_ID[VENTS[to].room]?.name || 'Pasillo'} <span aria-hidden="true">➜</span></button>
          ))}
        </div>
      )}

      {mapOpen && playing && (
        <ShipMap simRef={sim} color={colorOf(mine).body} tasks={mapTasks} sabotage={sab} impostor={mine.impostor} cooldown={sabotageLeft}
          onSabotage={sabotage} onClose={() => setMapOpen(false)} />
      )}

      <ActionPad mine={mine} hud={hud} options={room.options} sabotageLeft={sabotageLeft} mapOpen={mapOpen} onUse={use} onKill={kill} onReport={report}
        onToggleMap={() => { if (!overlayRef.current) setMapOpen((o) => !o); }} />

      {!mine.alive && playing && (
        <div className="nv-ghost-chat"><ChatBox room={room} me={mine} ghostOnly onSend={(text) => onDispatch({ type: 'chat', text })} /></div>
      )}

      {overlay && (
        <div className="nv-overlay" onPointerDown={(e) => { if (e.target === e.currentTarget) closeOverlay(); }}>
          <div className="nv-window">
            <header>
              <strong>{overlay.kind === 'task' ? `${roomName(overlay.station)}: ${overlay.label}` : overlay.kind === 'lights' ? 'Electricidad: arreglar las luces' : 'Reactor: lector de mano'}</strong>
              <button type="button" className="nv-close" onClick={closeOverlay} aria-label="Cerrar"><Icon name="close" size={18} /></button>
            </header>
            {overlay.kind === 'task' && <Minigame key={`${overlay.task}-${overlay.station}`} station={overlay.station} game={overlay.game} onDone={() => taskDoneStep(overlay)} />}
            {overlay.kind === 'lights' && sab?.kind === 'lights' && <Lights switches={sab.switches} onFlip={(i) => onDispatch({ type: 'fixLights', switch: i })} />}
            {overlay.kind === 'reactor' && sab?.kind === 'reactor' && <ReactorHand sab={sab} side={overlay.side} me={me.id} room={room} now={now} onHold={(on) => onDispatch({ type: 'holdReactor', side: overlay.side, on })} />}
          </div>
        </div>
      )}

      {killer && (
        <div className="nv-killed">
          <div className="nv-killed-scene">
            <Bean color={colorOf(killer).body} size={130} motion="idle" />
            <i className="nv-slash" />
            <Bean color={colorOf(mine).body} size={130} dead />
          </div>
          <p>Te mataron</p>
          <small>{killer.name} era el impostor</small>
        </div>
      )}
    </div>
  );
}

function visionRadius(r, mine) {
  const o = r.options;
  let radius = BASE_VISION * (mine.impostor ? o.impostorVision : o.crewVision);
  if (r.sabotage?.kind === 'lights' && !mine.impostor) radius = Math.max(1.8, radius * LIGHTS_OUT);
  return radius;
}

// ─── Tablero de luces ────────────────────────────────────────────────────────
function Lights({ switches, onFlip }) {
  return (
    <div className="nv-lights">
      {switches.map((on, i) => (
        <button key={i} type="button" className={`nv-switch${on ? ' is-on' : ''}`} onClick={() => onFlip(i)} aria-label={`Palanca ${i + 1}`}>
          <i className="nv-switch-led" /><i className="nv-switch-lever" />
        </button>
      ))}
      <p className="nv-hint">Subí todas las palancas.</p>
    </div>
  );
}

// ─── Lector de mano del reactor ──────────────────────────────────────────────
function ReactorHand({ sab, side, me, room, now, onHold }) {
  const holding = sab.hold[side] === me;
  const other = sab.hold[1 - side] ? findPlayer(room, sab.hold[1 - side]) : null;
  return (
    <div className="nv-reactor">
      <p className="nv-reactor-clock">Fusión en {Math.max(0, Math.ceil((sab.endsAt - now) / 1000))} s</p>
      <button type="button" className={`nv-hand${holding ? ' is-on' : ''}`}
        onPointerDown={(e) => { capture(e.currentTarget, e); onHold(true); }}
        onPointerUp={() => onHold(false)} onPointerCancel={() => onHold(false)}>🖐️</button>
      <p className="nv-hint">{holding ? (other ? '¡Listo!' : 'Mantené la mano… falta alguien en el otro lector.') : 'Mantené apretado. Hace falta otra persona en el otro lector a la vez.'}</p>
    </div>
  );
}
