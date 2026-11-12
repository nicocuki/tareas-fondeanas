// La Timba en vivo, en 3D y en primera persona: el teclado y el mouse, la red y lo que se ve encima (la caja, la cuota,
// el día, qué hacer y qué estás por tocar). Los juegos no se abren en ventanas: se juegan en la mesa, apretando sus botones
// con la mano (E o clic mirando el botón). El dibujo está en `render3d.js` y se carga recién al entrar.
//
// Cada pantalla es dueña de su jugador: lo mueve y manda su foto (posición y para dónde mira) directo a los demás (WebRTC)
// o, si no se puede, por el servidor. Todo lo que se comparte (la plata, el día, dónde está cada uno, las mesas) va por la
// sala (`game.js`) y se pide con `onDispatch`. Lo que se escribe en cada teclado de apuesta es de cada pantalla.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { backgroundInterval, everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { RUN, SCENES, TABLE_BY_ID, doorFor, nearTable, nearby, sceneKey, spawnPoint, stepWalk } from './scenes.js';
import { mainButton, newUi, press, splitBtn } from './controls.js';
import { SPIN_KINDS } from './games.js';
import { crashMultAt } from './newgames.js';
import './tbgame.css';
import { floorOfLoc, topFloor, floorsOfDay, locOfFloor } from './casinos.js';
import { TOTAL_DAYS } from './quota.js';
import { DAY_MS, dayLeftMs, findPlayer, fmtClock, fmtMoney, tableOfPlayer } from './game.js';

const ABOARD = ['limo', 'back']; // arriba de la limusina (de ida o de vuelta)
const SEND_EVERY = 1 / 15;
const SERVER_EVERY = 1 / 8;
const GONE_AFTER = 15;        // sin fotos de alguien, el anfitrión lo saca
const TABLE_REACH = 70;       // a esta distancia (unidades) de la mesa se sigue jugando; más lejos, se levanta
const ROLL_MS = 1300;         // lo que ruedan los dados del craps antes de avisar cómo cayeron
const LOOK = 0.0022;          // radianes por pixel de mouse
const KEYS = { fwd: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA'], right: ['KeyD'], turnL: ['ArrowLeft'], turnR: ['ArrowRight'], run: ['ShiftLeft', 'ShiftRight'] };
const round1 = (v) => Math.round(v * 10) / 10;
const SPIN_SET = new Set(SPIN_KINDS);

function TicketIcon() {
  return <svg className="tbg-ticket" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3h14v5a2.2 2.2 0 0 0 0 4.4V21H5v-8.6a2.2 2.2 0 0 0 0-4.4z" fill="#f0c33c" stroke="#8a5a10" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 8h6M9 12h6" stroke="#8a5a10" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

// Dónde aparece cada uno al cambiar de lugar, y para dónde mira (`yaw`: 0 mira a -y; π/2 a -x; -π/2 a +x).
function landing(loc, prev, index) {
  const base = spawnPoint(loc, index);
  const sc = SCENES[sceneKey(loc)];
  if (loc === 'outside' && prev === 'back') return { x: sc.limo.x + sc.limo.w + 40, y: 20, yaw: -Math.PI / 2 };
  if (loc === 'outside' && prev === 'elevator') return { x: sc.doorX - 20 - (index % 3) * 22, y: -40 + (index % 2) * 30, yaw: Math.PI * 0.6 };
  if (loc === 'outside') return { ...base, yaw: -Math.PI / 2 };
  if (loc === 'wait' && prev === 'limo') return { x: sc.limo.x - 60 + (index % 3) * 18, y: 30, yaw: Math.PI / 2 };
  if (loc === 'wait') return { ...base, yaw: -Math.PI / 2 };
  if (floorOfLoc(loc) !== null && prev === 'elevator') return { x: 112 + (index % 2) * 16, y: sc.spawn.y - 20 + (index % 4) * 14, yaw: -Math.PI / 2 };
  if (floorOfLoc(loc) !== null) return { ...base, yaw: -Math.PI / 2 };
  if (loc === 'elevator') return { x: 150 + ((index % 4) - 1.5) * 22, y: floorOfLoc(prev) !== null ? 175 : 190, yaw: 0 };
  return { ...base, yaw: 0 };
}

export default function TimbaGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const fadeRef = useRef(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const roomRef = useRef(room);
  roomRef.current = room;
  const dispatchRef = useRef(onDispatch);
  dispatchRef.current = onDispatch;
  const [modal, setModal] = useState(null); // null | 'van'
  const modalRef = useRef(null);
  modalRef.current = modal;
  const [hint, setHint] = useState(null);   // lo que estás por tocar: { label, key }
  const [toast, setToast] = useState('');
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [, setClock] = useState(0);
  const [seenDay, setSeenDay] = useState(room.day.n);

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      loc: null, p: { x: 0, y: 0, yaw: 0, pitch: -0.1, moving: false }, remotes: new Map(), lastSeen: new Map(),
      input: { fwd: false, back: false, left: false, right: false, turnL: false, turnR: false, run: false }, near: null, pendingAt: 0, sentAt: 0, serverAt: 0,
      tickAt: 0, settleAt: 0, standAt: 0, goneSent: new Set(), fade: 1, time: 0, mountedAt: performance.now() / 1000, mesh: null, chan: null,
      r3d: null, uis: new Map(), busy: false,
    };
  }
  const serverNow = () => Date.now() + offsetRef.current;
  const flash = (text) => { setToast(text); setTimeout(() => setToast((t) => (t === text ? '' : t)), 2400); };

  const act = async (action) => {
    const res = await dispatchRef.current(action);
    return Boolean(res?.committed);
  };

  // Lo que se está escribiendo en cada mesa (de esta pantalla).
  const uiFor = (spot) => {
    const s = sim.current;
    let ui = s.uis.get(spot.id);
    if (!ui) { ui = newUi(spot.kind, roomRef.current.day.n); s.uis.set(spot.id, ui); }
    return ui;
  };

  // ─── Red ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.timbaChannel(code);
    const s = sim.current;
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== roomRef.current.run) return;
      s.lastSeen.set(id, performance.now() / 1000);
      const prev = s.remotes.get(id);
      if (!prev || snap.t > prev.snap.t) {
        const jump = !prev || prev.snap.sc !== snap.sc || Math.hypot(snap.x - prev.x, snap.y - prev.y) > 120;
        s.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, yaw: jump ? snap.f : prev.yaw });
      }
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    s.mesh = mesh;
    s.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); s.mesh = null; s.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Reloj: terminar viajes y el día, cobrar lo que terminó de girar y sacar a los que se fueron ──────
  useEffect(() => {
    const s = sim.current;
    const stop = backgroundInterval(() => {
      setClock((c) => c + 1);
      const r = roomRef.current;
      const now = serverNow();
      const due = (r.trip && now >= r.trip.at + r.trip.ms + 120) || (!r.trip && r.day.endsAt && !r.day.over && now >= r.day.endsAt);
      if (due && now - s.tickAt > 1500) { s.tickAt = now; dispatchRef.current({ type: 'tick' }); }
      // mi mesa: la tirada que terminó de girar se cobra; el cohete que chocó se anota
      const [, t] = tableOfPlayer(r, me.id);
      if (t && now - s.settleAt > 800) {
        if (SPIN_SET.has(t.kind) && t.bet > 0 && !t.paid && now >= t.at + t.ms) { s.settleAt = now; dispatchRef.current({ type: 'settle' }); }
        if (t.kind === 'crash' && t.bet > 0 && !t.res && crashMultAt(now - t.at) >= t.point) { s.settleAt = now; dispatchRef.current({ type: 'crashEnd' }); }
      }
      if (r.hostId === me.id && r.phase === 'playing') {
        const tt = performance.now() / 1000;
        for (const pl of r.players) {
          if (pl.id === me.id || s.goneSent.has(pl.id)) continue;
          if (tt - (s.lastSeen.get(pl.id) ?? s.mountedAt) > GONE_AFTER) { s.goneSent.add(pl.id); dispatchRef.current({ type: 'gone', target: pl.id }); }
        }
      }
    }, 250);
    return stop;
  }, [me.id]);

  // Al cambiar de lugar se cierra lo que estuviera abierto.
  useEffect(() => { setModal(null); }, [me.loc]);

  // ─── Tocar una mesa ─────────────────────────────────────────────────────────
  // Apretar un botón de una mesa: si está libre se la toma (`sit`), y lo que diga `controls.js` se manda a la sala.
  const pressTable = async (btn) => {
    const s = sim.current;
    const r = roomRef.current;
    const spot = TABLE_BY_ID[btn.table];
    if (!spot || r.day.over) { if (r.day.over) flash('Se terminó el día: volvé al ascensor.'); return; }
    const t = r.tb[spot.id] || null;
    if (t && t.by !== me.id) { flash(`Está ocupada: juega ${r.players.find((p) => p.id === t.by)?.name || 'otro jugador'}.`); return; }
    const res = press(btn.id, uiFor(spot), { kind: spot.kind, t, room: r, now: serverNow() });
    s.uis.set(spot.id, res.ui);
    if (res.toast) flash(res.toast);
    if (s.busy) return;
    s.busy = true;
    try {
      if (!t) {
        const [other] = tableOfPlayer(r, me.id);
        if (other && other !== spot.id) await act({ type: 'stand' });
        if (!(await act({ type: 'sit', table: spot.id }))) { flash('Esa mesa ya la tomó otro.'); return; }
      }
      if (res.roll) {
        const dice = [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
        s.r3d?.rollDice(spot.id, dice, s.time);
        await new Promise((resolve) => setTimeout(resolve, ROLL_MS));
        await act({ type: 'crapsRoll', dice });
      } else if (res.action) await act(res.action);
    } finally { s.busy = false; }
  };

  // ─── Interactuar (E o clic) ─────────────────────────────────────────────────
  const interact = () => {
    const s = sim.current;
    const r = roomRef.current;
    if (modalRef.current) return;
    const btn = s.r3d?.target;
    if (btn) {
      s.r3d.press(s.time);
      if (btn.scope === 'elev') {
        const to = Number(btn.id.split(':')[1]);
        if (r.trip) flash('El ascensor se está moviendo.');
        else if (!r.players.every((p) => p.loc === 'elevator')) flash('Tienen que estar todos en el ascensor.');
        else if (r.day.over && to !== 0) flash('Se terminó el día: el único camino es la planta baja.');
        else if (to !== 0 && !floorsOfDay(r.day.n).includes(to)) flash(`El piso ${to} se abre el día ${(to - 1) * 3 + 1}.`);
        else act({ type: 'floor', to });
      } else pressTable(btn);
      return;
    }
    const n = s.near;
    if (!n) return;
    if (n.key === 'board') act({ type: 'loc', to: 'limo' });
    else if (n.key === 'unboard') act({ type: 'loc', to: 'wait' });
    else if (n.key === 'boardBack') act({ type: 'loc', to: 'back' });
    else if (n.key === 'unboardBack') act({ type: 'loc', to: 'outside' });
    else if (n.key === 'van') setModal('van');
    else if (n.key === 'npc') flash('«Todavía no compraste ningún item. ¡Pasá por la camioneta!»');
  };
  const interactRef = useRef(interact);
  interactRef.current = interact;

  // El teclado de la compu también escribe en el teclado de la mesa donde estás parado.
  const typeAtTable = (key) => {
    const s = sim.current;
    const r = roomRef.current;
    const meP = findPlayer(r, me.id);
    if (!meP || floorOfLoc(meP.loc) === null) return false;
    const spot = nearTable(meP.loc, s.p, TABLE_REACH);
    if (!spot) return false;
    const t = r.tb[spot.id] || null;
    const ctx = { kind: spot.kind, t, room: r, now: serverNow() };
    const id = key === 'Enter' ? mainButton(spot.kind, uiFor(spot), ctx) : key === 'Backspace' ? 'k:C' : `k:${key}`;
    pressTable({ scope: 'table', table: spot.id, id });
    return true;
  };
  const typeRef = useRef(typeAtTable);
  typeRef.current = typeAtTable;

  // ─── El dibujo (se carga aparte) ────────────────────────────────────────────
  useEffect(() => {
    let dead = false;
    const s = sim.current;
    import('./render3d.js').then(async (mod) => {
      try { await Promise.all(['40px "Lilita One"', '40px "Pixelify Sans"'].map((f) => document.fonts?.load(f))); } catch { /* sin fuentes, igual anda */ }
      if (dead || !canvasRef.current) return;
      s.r3d = mod.createTimba3D(canvasRef.current, { color: findPlayer(roomRef.current, me.id)?.color || '#f0c33c' });
      setLoading(false);
    });
    const onResize = () => s.r3d?.resize();
    window.addEventListener('resize', onResize);
    return () => { dead = true; window.removeEventListener('resize', onResize); s.r3d?.dispose(); s.r3d = null; };
  }, [me.id]);

  // ─── Bucle principal ────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    let last = performance.now() / 1000;

    function frame({ hidden }) {
      const r = roomRef.current;
      const meP = findPlayer(r, me.id);
      if (!meP) return;
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last);
      last = t;
      s.time += dt;
      const now = serverNow();
      const loc = meP.loc;
      const key = sceneKey(loc);
      const index = r.players.findIndex((x) => x.id === me.id);
      const aboard = ABOARD.includes(loc);

      // Cambió el lugar: aparezco donde corresponde y se hace un fundido.
      if (s.loc !== loc) {
        if (!aboard) {
          const sp = landing(loc, s.loc, index);
          s.p = { ...s.p, x: sp.x, y: sp.y, yaw: sp.yaw, pitch: -0.08, moving: false };
        } else {
          // sentado en la limusina, mirando para el otro lado del asiento
          const seat = Math.max(0, r.players.filter((pl) => pl.loc === loc).findIndex((pl) => pl.id === me.id));
          s.p = { ...s.p, yaw: seat % 2 ? 0 : Math.PI, pitch: -0.12, moving: false };
        }
        s.loc = loc;
        s.pendingAt = 0;
        s.fade = 1;
      }

      // Girar con las flechas y caminar (con el ascensor andando o una ventana abierta, no).
      const frozen = Boolean(modalRef.current) || Boolean(r.trip) || aboard;
      s.p.yaw += ((s.input.turnL ? 1 : 0) - (s.input.turnR ? 1 : 0)) * 2.2 * dt;
      const f = (s.input.fwd ? 1 : 0) - (s.input.back ? 1 : 0);
      const st = (s.input.right ? 1 : 0) - (s.input.left ? 1 : 0);
      if (frozen) s.p.moving = false;
      else {
        const sin = Math.sin(s.p.yaw); const cos = Math.cos(s.p.yaw);
        const dx = -sin * f + cos * st;
        const dy = -cos * f - sin * st;
        const before = { x: s.p.x, y: s.p.y };
        stepWalk(s.p, dx, dy, dt, key, 170 * (s.input.run ? RUN : 1));
        // en medio de una mano de blackjack no se puede ir de la mesa
        const [myT, myState] = tableOfPlayer(r, me.id);
        if (myT && myState.kind === 'bj' && myState.phase === 'play' && myState.st === 'play' && nearTable(loc, s.p, TABLE_REACH)?.id !== myT) {
          s.p.x = before.x; s.p.y = before.y;
          if (t - (s.lockToastAt || 0) > 2) { s.lockToastAt = t; flash('Terminá la mano antes de irte de la mesa.'); }
        }
      }

      // Alejarse de la mesa es levantarse (y se suelta para otro).
      const [myTable] = tableOfPlayer(r, me.id);
      if (myTable && floorOfLoc(loc) !== null && nearTable(loc, s.p, TABLE_REACH)?.id !== myTable && t - s.standAt > 1 && !s.busy) {
        s.standAt = t;
        dispatchRef.current({ type: 'stand' });
      }

      // Qué hay cerca para tocar con E (la limusina, la camioneta, el botones).
      const nb = r.trip ? null : nearby(loc, s.p, { home: r.day.endsAt > 0 });
      s.near = nb;

      // Puertas: entrar al casino, al ascensor, o salir de él.
      if (!frozen && !r.trip && performance.now() - s.pendingAt > 900) {
        const to = doorFor(loc, s.p, r.elev.floor);
        const here = locOfFloor(r.elev.floor);
        const allowed = to && ((loc === 'elevator' && (!r.day.over || here === 'outside') && to === here) || (to === 'elevator' && loc === here));
        if (allowed) { s.pendingAt = performance.now(); dispatchRef.current({ type: 'loc', to }); }
      }

      // Mandar mi foto.
      if (t - s.sentAt >= (s.p.moving ? SEND_EVERY : 0.5)) {
        s.sentAt = t;
        const snap = { n: r.run, t: now / 1000, sc: aboard ? 'limo' : key, x: round1(s.p.x), y: round1(s.p.y), f: Math.round(s.p.yaw * 100) / 100, m: s.p.moving ? 1 : 0 };
        s.mesh?.broadcast(snap);
        const others = r.players.filter((pl) => pl.id !== me.id);
        const needServer = !s.mesh || others.some((pl) => !s.mesh.isOpen(pl.id));
        if (needServer && t - s.serverAt >= SERVER_EVERY && s.chan) { s.serverAt = t; s.chan.publish(me.id, JSON.stringify(snap)).catch(() => {}); }
      }

      s.fade = Math.max(0, s.fade - dt * 2.4);
      if (!s.r3d) return;

      // Los demás: los que están en mi escena, suavizados hacia su última foto (o sentados en la limusina).
      const others = [];
      const boardLoc = key === 'outside' ? 'back' : 'limo';
      const seated = r.players.filter((pl) => pl.loc === boardLoc).map((pl) => pl.id);
      for (const pl of r.players) {
        if (pl.id === me.id || sceneKey(pl.loc) !== key) continue;
        if (ABOARD.includes(pl.loc)) { others.push({ id: pl.id, name: pl.name, color: pl.color, seat: seated.indexOf(pl.id), x: 0, y: 0, yaw: 0, moving: false }); continue; }
        const v = s.remotes.get(pl.id);
        if (!v || v.snap.sc !== key) continue;
        const k = Math.min(1, dt * 12);
        const moved = Math.hypot(v.snap.x - v.x, v.snap.y - v.y);
        v.x += (v.snap.x - v.x) * k; v.y += (v.snap.y - v.y) * k;
        let dyaw = v.snap.f - v.yaw;
        while (dyaw > Math.PI) dyaw -= Math.PI * 2;
        while (dyaw < -Math.PI) dyaw += Math.PI * 2;
        v.yaw += dyaw * k;
        others.push({ id: pl.id, name: pl.name, color: pl.color, seat: null, x: v.x, y: v.y, yaw: v.yaw, moving: Boolean(v.snap.m) && moved > 0.5 });
      }

      // El viaje en limusina (se cierra la puerta y arranca) y el del ascensor (tiembla, cambia el número).
      const trip = r.trip;
      const pr = trip ? Math.max(0, Math.min(1, (now - trip.at) / trip.ms)) : 0;
      const limoTrip = trip?.kind === 'limo' || trip?.kind === 'home';
      const elevTrip = trip?.kind === 'elev';
      const labelOf = (fl) => (fl === 0 ? 'L' : String(fl));
      const fadeOut = limoTrip ? Math.max(0, Math.min(1, (pr - 0.72) / 0.28)) : 0;
      if (fadeRef.current) fadeRef.current.style.opacity = String(Math.max(s.fade, fadeOut));
      const inElev = r.players.filter((pl) => pl.loc === 'elevator').length;
      const env = {
        limoGo: limoTrip ? Math.max(0, Math.min(1, (pr - 0.22) / 0.78)) : 0,
        limoDoor: limoTrip ? 1 - Math.max(0, Math.min(1, pr / 0.2)) : 1,
        doorOpen: elevTrip || (r.day.over && r.elev.floor > 0) ? 0 : 1,
        floorLabel: elevTrip ? (pr < 0.5 ? labelOf(r.elev.floor) : labelOf(trip.to)) : labelOf(r.elev.floor),
        moving: elevTrip, goingUp: elevTrip && trip.to > r.elev.floor, allIn: inElev === r.players.length, missing: r.players.length - inElev,
        elevFloor: r.elev.floor, tripTo: elevTrip ? trip.to : -1, floors: [0, ...floorsOfDay(r.day.n)],
      };
      s.r3d.frame({
        key, loc, me: s.p, seat: aboard ? Math.max(0, seated.indexOf(me.id)) : null, others, room: r, myId: me.id, uiFor, now, time: s.time, dt, env,
        hidden, frozen: Boolean(modalRef.current) || aboard,
      });

      // Lo que estás por tocar (para el cartelito del medio).
      const tgt = s.r3d.target;
      const label = tgt ? labelFor(tgt) : nb ? nb.label : '';
      const atTable = floorOfLoc(loc) !== null && Boolean(nearTable(loc, s.p, TABLE_REACH));
      const hintKey = `${label}|${tgt ? 'b' : nb ? 'n' : ''}|${atTable}`;
      if (hintKey !== s.hintKey) { s.hintKey = hintKey; setHint({ label, button: Boolean(tgt), atTable }); }
    }

    const stop = everyFrame(frame);
    s.room = () => roomRef.current;
    window.__timba = s; // para manejar la partida desde un navegador automatizado (con `room()`, la sala)
    return () => { stop(); if (window.__timba === s) delete window.__timba; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    const canvas = canvasRef.current;
    const down = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape' && modalRef.current) { e.preventDefault(); setModal(null); return; }
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (named) { s.input[named[0]] = true; if (named[0] !== 'run') e.preventDefault(); return; }
      if (e.code === 'KeyE') { if (!e.repeat) interactRef.current(); e.preventDefault(); return; }
      if (!e.repeat && (/^[0-9]$/.test(e.key) || e.key === 'Backspace' || e.key === 'Enter')) { if (typeRef.current(e.key)) e.preventDefault(); }
    };
    const up = (e) => { const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code)); if (named) s.input[named[0]] = false; };
    const blur = () => { for (const k of Object.keys(s.input)) s.input[k] = false; };
    const move = (e) => {
      if (document.pointerLockElement !== canvas) return;
      s.p.yaw -= e.movementX * LOOK;
      s.p.pitch = Math.max(-1.35, Math.min(1.2, s.p.pitch - e.movementY * LOOK));
    };
    const click = (e) => {
      if (e.button !== 0) return;
      if (document.pointerLockElement === canvas) interactRef.current();
      else { try { canvas.requestPointerLock?.(); } catch { /* sin bloqueo de mouse */ } }
    };
    const lockChange = () => setLocked(document.pointerLockElement === canvas);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    document.addEventListener('mousemove', move);
    document.addEventListener('pointerlockchange', lockChange);
    canvas.addEventListener('mousedown', click);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur);
      document.removeEventListener('mousemove', move); document.removeEventListener('pointerlockchange', lockChange); canvas.removeEventListener('mousedown', click);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    };
  }, []);
  // Con una ventana abierta se suelta el mouse.
  useEffect(() => { if (modal && document.pointerLockElement) document.exitPointerLock?.(); }, [modal]);

  // ─── Pantalla ───────────────────────────────────────────────────────────────
  const now = serverNow();
  const loc = me.loc;
  const trip = room.trip;
  const left = dayLeftMs(room, now);
  const boardLoc = loc === 'back' ? 'back' : 'limo';
  const aboard = room.players.filter((p) => p.loc === boardLoc).length;
  const inElev = room.players.filter((p) => p.loc === 'elevator').length;
  const showDay = room.day.endsAt && loc !== 'wait' && loc !== 'limo';
  const dayPassed = room.day.last && !room.day.last.lost && room.day.n > seenDay && loc === 'wait' && !trip;
  const tripText = trip?.kind === 'limo' ? 'Rumbo al casino' : trip?.kind === 'home' ? 'Volviendo a casa' : trip ? (trip.to === 0 ? 'Bajando a la planta baja' : `Subiendo al piso ${trip.to}`) : '';
  const quota = room.day.quota;
  const done = room.money >= quota;
  const pct = Math.max(0, Math.min(100, (room.money / quota) * 100));
  const cash = useMoneyFx(room.money);
  const goal = trip || modal || hint?.atTable ? '' : goalText(room, loc, aboard, inElev, done);

  return (
    <div className="tbg-stage" ref={wrapRef}>
      <canvas ref={canvasRef} className="tbg-canvas" data-timba-canvas />
      {loading && <p className="tbg-loading">Abriendo el casino…</p>}
      {!ABOARD.includes(loc) && !modal && <span className={`tbg-cross${hint?.button ? ' is-on' : ''}`} aria-hidden="true" />}

      <div className="tbg-cash tbg-panel" data-money>
        <span className="tbg-label">Caja de todos · Día {room.day.n}/{TOTAL_DAYS}</span>
        <div className="tbg-cash-row">
          <strong key={cash.k} className={`tbg-cash-amount${cash.dir ? ` is-${cash.dir}` : ''}`}>{fmtMoney(cash.shown)}</strong>
        </div>
        <div className={`tbg-quota${done ? ' is-done' : ''}`} title="La cuota del día">
          <div className="tbg-quota-fill" style={{ width: `${pct}%` }} />
          <span>{done ? '¡CUOTA LISTA! ' : ''}{fmtMoney(room.money).slice(1)}/{fmtMoney(quota).slice(1)}</span>
        </div>
        {cash.deltas.map((d) => <span key={d.id} className={`tbg-delta is-${d.v > 0 ? 'plus' : 'minus'}`}>{d.v > 0 ? '+' : '−'}{fmtMoney(Math.abs(d.v))}</span>)}
      </div>

      {showDay && (
        <div className={`tbg-day tbg-panel${room.day.over ? ' is-over' : left < 30000 ? ' is-low' : ''}`}>
          <span className="tbg-day-n">DÍA {room.day.n}</span>
          <strong className="tbg-day-time">{room.day.over ? 'TERMINÓ' : fmtClock(left)}</strong>
          {!room.day.over && <div className="tbg-day-bar"><i style={{ width: `${Math.max(0, Math.min(100, (left / DAY_MS) * 100))}%` }} /></div>}
        </div>
      )}

      <div className="tbg-side">
        <div className="tbg-tickets tbg-panel" title="Tickets dorados (de todos)"><small>TICKETS</small><b>{room.tickets} <TicketIcon /></b></div>
        <ul className="tbg-net tbg-panel">
          {room.players.map((p) => {
            const net = room.net[p.id] || 0;
            return <li key={p.id} style={{ '--c': p.color }}><span>{p.name}</span><b className={net < 0 ? 'is-neg' : ''}>{net < 0 ? '−' : '+'}{fmtMoney(Math.abs(net))}</b></li>;
          })}
        </ul>
      </div>

      {goal && <p className="tbg-goal" data-goal>{goal}</p>}
      {ABOARD.includes(loc) && !trip && (
        <div className="tbg-wait tbg-panel">
          EN LA LIMUSINA
          <small>Esperando a los demás ({aboard}/{room.players.length}) · E para bajar</small>
          <span className="tbg-dots">{room.players.map((p) => <i key={p.id} className={p.loc === boardLoc ? 'is-in' : ''} />)}</span>
        </div>
      )}
      {hint?.label && !modal && <p className={`tbg-prompt${hint.button ? ' is-button' : ''}`} data-near><span>{hint.label}</span><kbd>E</kbd></p>}
      {!locked && !modal && !loading && <button type="button" className="tbg-lock tbg-panel" onClick={() => { try { canvasRef.current?.requestPointerLock?.(); } catch { /* nada */ } }}>Hacé clic para mirar con el mouse</button>}
      {!modal && !trip && (
        <div className="tbg-keys tbg-panel">
          <div><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd><span>caminar</span><kbd>⇧</kbd><span>correr</span></div>
          <div><kbd>E</kbd><span>o clic: tocar</span><kbd>0-9</kbd><span>apostar</span></div>
        </div>
      )}
      {toast && <p className="tbg-toast" role="status">{toast}</p>}
      {tripText && <p className="tbg-trip tbg-panel">{tripText}</p>}

      {modal === 'van' && (
        <div className="tbg-modal tbg-small" role="dialog" aria-label="Camioneta">
          <button type="button" className="tbg-close" onClick={() => setModal(null)} aria-label="Cerrar">✕</button>
          <h2 className="tbg-title">LA CAMIONETA</h2>
          <p className="tbg-text">Acá se van a comprar items con los tickets dorados <TicketIcon />. Por ahora la camioneta está vacía: todavía no hay nada a la venta.</p>
          <p className="tbg-text is-dim">Tienen {room.tickets} tickets para cuando llegue la mercadería.</p>
        </div>
      )}
      {dayPassed && (
        <div className="tbg-modal tbg-small" role="dialog" aria-label="Día superado">
          <h2 className="tbg-title">¡DÍA {room.day.last.n} SUPERADO!</h2>
          <p className="tbg-text">Juntaron {fmtMoney(room.day.last.money)} de {fmtMoney(room.day.last.quota)}. La cuota de hoy es <b>{fmtMoney(room.day.quota)}</b>.</p>
          {topFloor(room.day.n) !== topFloor(room.day.last.n) && <p className="tbg-text">¡Ganaron acceso al <b>piso {topFloor(room.day.n)}</b>, más lujoso!</p>}
          <button type="button" className="tbg-btn" onClick={() => setSeenDay(room.day.n)}>¡A SEGUIR!</button>
        </div>
      )}
      <div className="tbg-fade" ref={fadeRef} />
    </div>
  );
}

// El cartelito de lo que se está mirando.
function labelFor(btn) {
  if (btn.scope === 'elev') return btn.label;
  const [type] = splitBtn(btn.id);
  if (type === 'k' || type === 'q') return btn.label === 'BORRAR' ? 'BORRAR' : `TECLA ${btn.label}`;
  return btn.label;
}

// Qué conviene hacer ahora, según dónde estás (la línea amarilla de arriba).
function goalText(room, loc, aboard, inElev, done) {
  if (loc === 'wait') return aboard ? `Subí a la limusina con los demás (${aboard}/${room.players.length} a bordo)` : 'Caminá hasta la limusina, a la derecha, y tocá E en la puerta de atrás';
  if (loc === 'outside') return room.day.endsAt ? 'Entrá al casino por la puerta giratoria, o volvé a casa en la limusina' : 'Seguí la alfombra roja y entrá por la puerta giratoria';
  if (loc === 'elevator') {
    if (room.day.over) return room.elev.floor === 0 ? 'Se acabó el día: salí por la puerta y subí a la limusina' : 'Se acabó el día: tocá la L en la botonera para bajar';
    if (inElev < room.players.length) return `Esperá a que suban todos al ascensor (${inElev}/${room.players.length})`;
    const first = floorsOfDay(room.day.n)[0];
    if (room.elev.floor === 0) return room.day.endsAt ? `Tocá el ${first} en la botonera de la derecha` : `Tocá el ${first} en la botonera de la derecha: ahí arranca el reloj del día`;
    return 'Salí del ascensor por la puerta';
  }
  if (floorOfLoc(loc) !== null) return done ? '¡Ya tienen la cuota! Sigan sumando o bajen y vuelvan a casa en la limusina' : 'Acercate a una mesa y apretá sus botones: escribí la apuesta en el teclado y tocá JUGAR';
  return '';
}

// La plata que se ve: sube o baja contando, parpadea y suelta un «+$100» que flota.
function useMoneyFx(value) {
  const [fx, setFx] = useState({ shown: value, dir: '', k: 0, deltas: [] });
  const last = useRef(value);
  useEffect(() => {
    const from = last.current;
    if (from === value) return undefined;
    last.current = value;
    const id = Math.random();
    const t0 = performance.now();
    setFx((f) => ({ ...f, dir: value > from ? 'up' : 'down', k: f.k + 1, deltas: [...f.deltas, { id, v: value - from }] }));
    const step = setInterval(() => {
      const u = Math.min(1, (performance.now() - t0) / 600);
      setFx((f) => ({ ...f, shown: Math.round(from + (value - from) * u) }));
      if (u >= 1) clearInterval(step);
    }, 40);
    const drop = setTimeout(() => setFx((f) => ({ ...f, deltas: f.deltas.filter((d) => d.id !== id) })), 1500);
    return () => { clearInterval(step); clearTimeout(drop); setFx((f) => ({ ...f, shown: value })); };
  }, [value]);
  return fx;
}
