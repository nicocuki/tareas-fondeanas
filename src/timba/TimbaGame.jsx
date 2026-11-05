// La Timba en vivo: el dibujo, el teclado, la red y todo lo que se ve encima (el HUD, la ventana del ascensor,
// las de los juegos, los viajes).
//
// Cada pantalla es dueña de su jugador: lo mueve y manda su foto (posición y para dónde mira) directo a los demás
// (WebRTC) o, si no se puede, por el servidor. Todo lo que se comparte (la plata, el día, dónde está cada uno, la
// mesa) va por la sala (`game.js`) y se pide con `onDispatch`.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { backgroundInterval, everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { SCENES, SEAT_FACE, TABLE_BY_ID, doorFor, nearby, sceneKey, spawnPoint, standAt, stepSide, stepTop } from './scenes.js';
import { Q, drawScene } from './render.js';
import BjPanel from './BjPanel.jsx';
import CrapsPanel from './CrapsPanel.jsx';
import DuckPanel from './DuckPanel.jsx';
import RoulettePanel from './RoulettePanel.jsx';
import SlotsPanel from './SlotsPanel.jsx';
import WheelPanel from './WheelPanel.jsx';
import './tbgame.css';
import { TOTAL_DAYS } from './quota.js';
import { DAY_MS, allAt, dayLeftMs, findPlayer, fmtClock, fmtMoney, locOfFloor, tableOfPlayer } from './game.js';

const PANELS = { bj: BjPanel, slots: SlotsPanel, wheel: WheelPanel, roulette: RoulettePanel, duck: DuckPanel, craps: CrapsPanel };
const ABOARD = ['limo', 'back']; // arriba de la limusina (de ida o de vuelta)

const SEND_EVERY = 1 / 15;
const SERVER_EVERY = 1 / 8;
const GONE_AFTER = 15; // sin fotos de alguien, el anfitrión lo saca
const KEYS = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'] };
const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function TicketIcon() {
  return <svg className="tbg-ticket" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3h14v5a2.2 2.2 0 0 0 0 4.4V21H5v-8.6a2.2 2.2 0 0 0 0-4.4z" fill="#f0c33c" stroke="#8a5a10" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 8h6M9 12h6" stroke="#8a5a10" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

// Dónde aparece cada uno al cambiar de lugar.
function landing(loc, prev, index) {
  const base = spawnPoint(loc, index);
  if (loc === 'outside' && prev === 'back') return { ...base, x: SCENES.outside.limo.x + SCENES.outside.limo.w + 40 };
  if (loc === 'wait' && prev === 'limo') return { ...base, x: SCENES.wait.limo.x - 70 + (index % 3) * 18 };
  if (loc === 'outside' && prev === 'elevator') return { ...base, x: SCENES.outside.doorX - 90 - (index % 3) * 18 };
  if (loc === 'f1' && prev === 'elevator') return { x: 112 + (index % 2) * 16, y: 492 + (index % 4) * 10 };
  if (loc === 'elevator' && prev === 'f1') return { x: 150 + ((index % 4) - 1.5) * 18, y: 150 };
  return base;
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
  const [modal, setModal] = useState(null); // null | 'elev' | 'van' | 't:{mesa}' (la ventana de la mesa donde estoy sentado)
  const modalRef = useRef(null);
  modalRef.current = modal;
  const [near, setNear] = useState(null);
  const [toast, setToast] = useState('');
  const [, setClock] = useState(0);
  const [seenDay, setSeenDay] = useState(room.day.n);

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      loc: null, prevLoc: null, p: { x: 0, y: 0, face: 1, moving: false, phase: 0 }, remotes: new Map(), lastSeen: new Map(),
      input: { left: false, right: false, up: false, down: false }, near: null, pendingAt: 0, sentAt: 0, serverAt: 0, tickAt: 0,
      goneSent: new Set(), fade: 1, time: 0, mountedAt: performance.now() / 1000, mesh: null, chan: null,
    };
  }
  const serverNow = () => Date.now() + offsetRef.current;
  const flash = (text) => { setToast(text); setTimeout(() => setToast((t) => (t === text ? '' : t)), 2400); };

  const act = async (action) => {
    const res = await dispatchRef.current(action);
    return Boolean(res?.committed);
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
        s.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, phase: prev?.phase || 0 });
      }
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    s.mesh = mesh;
    s.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); s.mesh = null; s.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Reloj: terminar viajes y el día, y sacar a los que se fueron ──────────────
  useEffect(() => {
    const s = sim.current;
    const stop = backgroundInterval(() => {
      setClock((c) => c + 1);
      const r = roomRef.current;
      const now = serverNow();
      const due = (r.trip && now >= r.trip.at + r.trip.ms + 120) || (!r.trip && r.day.endsAt && !r.day.over && now >= r.day.endsAt);
      if (due && now - s.tickAt > 1500) { s.tickAt = now; dispatchRef.current({ type: 'tick' }); }
      if (r.hostId === me.id && r.phase === 'playing') {
        const t = performance.now() / 1000;
        for (const pl of r.players) {
          if (pl.id === me.id || s.goneSent.has(pl.id)) continue;
          if (t - (s.lastSeen.get(pl.id) ?? s.mountedAt) > GONE_AFTER) { s.goneSent.add(pl.id); dispatchRef.current({ type: 'gone', target: pl.id }); }
        }
      }
    }, 500);
    return stop;
  }, [me.id]);

  // ─── Cerrar ventanas ────────────────────────────────────────────────────────
  const closeModal = async () => {
    if (modalRef.current?.startsWith('t:')) {
      const [, t] = tableOfPlayer(roomRef.current, me.id);
      if (t) {
        if (t.kind === 'bj' && t.phase === 'play' && t.st === 'play') { flash('Terminá la mano antes de levantarte.'); return; }
        if (await act({ type: 'stand' }) && roomRef.current.players.length) sim.current.p.y += 34; // se levanta y da un paso atrás
      }
    }
    setModal(null);
  };
  const closeRef = useRef(closeModal);
  closeRef.current = closeModal;

  // Al cambiar de lugar se cierra lo que estuviera abierto.
  useEffect(() => { setModal(null); }, [me.loc]);
  // Si se terminó el día mientras se jugaba, la mesa ya se cerró.
  useEffect(() => { if (room.day.over && modalRef.current?.startsWith('t:')) setModal(null); }, [room.day.over]);

  // ─── Interactuar (E) ────────────────────────────────────────────────────────
  const interact = async () => {
    const s = sim.current;
    const r = roomRef.current;
    if (modalRef.current) return;
    const n = s.near;
    if (!n) return;
    if (n.key === 'board') act({ type: 'loc', to: 'limo' });
    else if (n.key === 'unboard') act({ type: 'loc', to: 'wait' });
    else if (n.key === 'boardBack') act({ type: 'loc', to: 'back' });
    else if (n.key === 'unboardBack') act({ type: 'loc', to: 'outside' });
    else if (n.key === 'van') setModal('van');
    else if (n.key === 'npc') flash('«Todavía no compraste ningún item. ¡Pasá por la camioneta!»');
    else if (n.key === 'panel') { if (r.trip) flash('El ascensor se está moviendo.'); else setModal('elev'); }
    else if (n.key.startsWith('t:')) {
      if (r.day.over) return;
      const id = n.key.slice(2);
      const taken = r.tb[id];
      if (taken && taken.by !== me.id) { flash(`Está ocupada: juega ${r.players.find((p) => p.id === taken.by)?.name || 'otro jugador'}.`); return; }
      if (await act({ type: 'sit', table: id })) setModal(n.key); else flash('Ya está ocupada o estás jugando en otra.');
    }
  };
  const interactRef = useRef(interact);
  interactRef.current = interact;

  // ─── Bucle principal ────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    let last = performance.now() / 1000;

    function frame({ hidden }) {
      const r = roomRef.current;
      const meP = findPlayer(r, me.id);
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      if (!meP || !canvas || !wrap) return;
      const t = performance.now() / 1000;
      const dt = Math.min(0.05, t - last);
      last = t;
      s.time += dt;
      const now = serverNow();
      const loc = meP.loc;
      const key = sceneKey(loc);
      const sc = SCENES[key];
      const index = r.players.findIndex((x) => x.id === me.id);

      // Cambió el lugar: aparezco donde corresponde y se hace un fundido.
      if (s.loc !== loc) {
        if (!ABOARD.includes(loc)) {
          const sp = landing(loc, s.loc, index);
          s.p = { x: sp.x, y: sp.y, face: sc.kind === 'side' ? 1 : Math.PI / 2, moving: false, phase: 0 };
        }
        s.prevLoc = s.loc;
        s.loc = loc;
        s.pendingAt = 0;
        s.fade = 1;
      }

      // Moverse (con el ascensor andando, la limusina esperando o una ventana abierta, no).
      const frozen = Boolean(modalRef.current) || Boolean(r.trip) || ABOARD.includes(loc);
      const dx = (s.input.right ? 1 : 0) - (s.input.left ? 1 : 0);
      const dy = (s.input.down ? 1 : 0) - (s.input.up ? 1 : 0);
      // El que juega en una mesa se queda parado en su lugar, mirándola.
      const [myTable] = tableOfPlayer(r, me.id);
      if (loc === 'f1' && myTable && modalRef.current === `t:${myTable}`) {
        const sp = standAt(TABLE_BY_ID[myTable]);
        s.p.x = sp.x; s.p.y = sp.y; s.p.moving = false; s.p.face = SEAT_FACE;
      } else if (frozen) s.p.moving = false;
      else if (sc.kind === 'side') stepSide(s.p, dx, dt, key);
      else stepTop(s.p, dx, dy, dt, key);
      if (s.p.moving) s.p.phase += dt;

      // Qué hay cerca para tocar con E.
      const nb = r.trip || (frozen && !ABOARD.includes(loc)) ? null : nearby(loc, s.p, { home: r.day.endsAt > 0 });
      const nbKey = nb ? nb.key : '';
      if (nbKey !== (s.near?.key || '')) { s.near = nb; setNear(nb); }

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
        const snap = { n: r.run, t: now / 1000, sc: ABOARD.includes(loc) ? 'limo' : key, x: round1(s.p.x), y: round1(s.p.y), f: Math.round(s.p.face * 100) / 100, m: s.p.moving ? 1 : 0 };
        s.mesh?.broadcast(snap);
        const others = r.players.filter((pl) => pl.id !== me.id);
        const needServer = !s.mesh || others.some((pl) => !s.mesh.isOpen(pl.id));
        if (needServer && t - s.serverAt >= SERVER_EVERY && s.chan) { s.serverAt = t; s.chan.publish(me.id, JSON.stringify(snap)).catch(() => {}); }
      }

      s.fade = Math.max(0, s.fade - dt * 2.4);
      if (hidden) return;

      // Los demás: los que están en mi escena, suavizados hacia su última foto.
      const players = [];
      const trip = r.trip;
      const heads = r.players.filter((pl) => pl.loc === (key === 'outside' ? 'back' : 'limo')).length;
      if (!ABOARD.includes(loc)) players.push({ me: true, x: s.p.x, y: s.p.y, face: s.p.face, phase: s.p.phase, moving: s.p.moving, color: meP.color, name: '' });
      for (const pl of r.players) {
        if (pl.id === me.id || sceneKey(pl.loc) !== key || ABOARD.includes(pl.loc)) continue;
        const v = s.remotes.get(pl.id);
        const [theirTable] = key === 'f1' ? tableOfPlayer(r, pl.id) : [null];
        let x; let y; let face; let moving = false;
        if (theirTable) {
          const sp = standAt(TABLE_BY_ID[theirTable]);
          x = sp.x; y = sp.y; face = SEAT_FACE;
        } else if (v && v.snap.sc === key) {
          const k = Math.min(1, dt * 14);
          v.x += (v.snap.x - v.x) * k; v.y += (v.snap.y - v.y) * k;
          moving = Boolean(v.snap.m) && Math.hypot(v.snap.x - v.x, v.snap.y - v.y) > 0.5;
          if (moving) v.phase += dt;
          x = v.x; y = v.y; face = v.snap.f;
        } else continue;
        players.push({ x, y, face, phase: v?.phase || 0, moving, color: pl.color, name: pl.name });
      }

      // El canvas es chico (un pixel del juego = `ps` pixeles de pantalla) y el CSS lo agranda sin suavizar.
      const ps = clamp(Math.round(wrap.clientHeight / (key === 'elevator' ? 170 : key === 'f1' ? 330 : 260)), 2, 8);
      const cw = Math.ceil(wrap.clientWidth / ps);
      const ch = Math.ceil(wrap.clientHeight / ps);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; canvas.style.width = `${cw * ps}px`; canvas.style.height = `${ch * ps}px`; }
      const ctx = canvas.getContext('2d');
      const view = { w: cw, h: ch };
      const vw = cw * Q;
      const vh = ch * Q;
      let tx; let ty = 0;
      if (sc.kind === 'side') {
        tx = clamp((loc === 'limo' ? SCENES.wait.limo.x + 120 : loc === 'back' ? SCENES.outside.limo.x + 200 : s.p.x) - vw / 2, 0, Math.max(0, sc.w - vw));
      } else if (key === 'elevator') {
        tx = 150; ty = 130;
      } else {
        tx = vw >= sc.w ? sc.w / 2 : clamp(s.p.x, vw / 2, sc.w - vw / 2);
        ty = vh >= sc.h ? sc.h / 2 : clamp(s.p.y, vh / 2, sc.h - vh / 2);
      }
      // La cámara persigue al jugador con un poco de suavidad (y salta de una al cambiar de lugar).
      if (!s.cam || s.camKey !== key) { s.cam = { x: tx, y: ty }; s.camKey = key; } else { const k = Math.min(1, dt * 9); s.cam.x += (tx - s.cam.x) * k; s.cam.y += (ty - s.cam.y) * k; }
      if (sc.kind === 'side') view.camX = s.cam.x; else { view.cx = s.cam.x; view.cy = s.cam.y; }

      // El viaje en limusina (se cierra la puerta y arranca) y el del ascensor (tiembla, cambia el número).
      const p = trip ? clamp((now - trip.at) / trip.ms, 0, 1) : 0;
      const limoTrip = trip?.kind === 'limo' || trip?.kind === 'home';
      const limoGo = limoTrip ? clamp((p - 0.22) / 0.78, 0, 1) : 0;
      const limoDoor = limoTrip ? 1 - clamp(p / 0.2, 0, 1) : 1;
      const moving = trip?.kind === 'elev';
      const labelOf = (f) => (f === 0 ? 'L' : String(f));
      const floorLabel = moving ? (p < 0.5 ? labelOf(r.elev.floor) : labelOf(trip.to)) : labelOf(r.elev.floor);
      const doorOpen = moving || (r.day.over && r.elev.floor > 0) ? 0 : 1;
      const fadeOut = limoTrip ? clamp((p - 0.72) / 0.28, 0, 1) : 0;
      if (fadeRef.current) fadeRef.current.style.opacity = String(Math.max(s.fade, fadeOut));

      const slots = Object.fromEntries(r.players.map((pl, i) => [pl.id, i]));
      drawScene(ctx, view, key, {
        time: s.time, now, players, tables: r.tb, slots, heads, limoGo, limoDoor, floorLabel, doorOpen, near: Boolean(s.near),
        shake: moving ? (Math.sin(s.time * 60) > 0 ? 1 : -1) : 0,
      });
    }

    const stop = everyFrame(frame);
    window.__timba = s; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__timba === s) delete window.__timba; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    const down = (e) => {
      if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.code === 'Escape') { if (modalRef.current) { e.preventDefault(); closeRef.current(); } return; }
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (named) { s.input[named[0]] = true; e.preventDefault(); } else if (e.code === 'KeyE') { if (!e.repeat) interactRef.current(); e.preventDefault(); }
    };
    const up = (e) => { const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code)); if (named) s.input[named[0]] = false; };
    const blur = () => Object.assign(s.input, { left: false, right: false, up: false, down: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

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
  const tripText = trip?.kind === 'limo' ? 'Rumbo al casino' : trip?.kind === 'home' ? 'Volviendo a casa' : trip ? (trip.to === 0 ? 'Bajando al lobby' : `Subiendo al piso ${trip.to}`) : '';
  const [, myT] = tableOfPlayer(room, me.id);
  const Panel = modal?.startsWith('t:') && myT ? PANELS[myT.kind] : null;
  const quota = room.day.quota;
  const done = room.money >= quota;
  const pct = Math.max(0, Math.min(100, (room.money / quota) * 100));
  const cash = useMoneyFx(room.money);
  const goal = trip || modal ? '' : goalText(room, loc, aboard, inElev, done);
  const topScene = SCENES[sceneKey(loc)]?.kind === 'top';

  return (
    <div className="tbg-stage" ref={wrapRef} style={{ overflow: 'hidden' }}>
      <canvas ref={canvasRef} className="tbg-canvas" data-timba-canvas />

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
          <span className="tbg-dots">{room.players.map((p) => <i key={p.id} className={p.loc === 'limo' ? 'is-in' : ''} />)}</span>
        </div>
      )}
      {near && !modal && <p className="tbg-prompt tbg-panel" data-near><kbd>E</kbd> {near.label}</p>}
      {!modal && !ABOARD.includes(loc) && !trip && (
        <div className="tbg-keys tbg-panel">
          <div>{topScene ? <><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></> : <><kbd>A</kbd><kbd>D</kbd></>}<span>moverse</span></div>
          <div><kbd>E</kbd><span>tocar / usar</span></div>
        </div>
      )}
      {toast && <p className="tbg-toast" role="status">{toast}</p>}
      {tripText && <p className="tbg-trip tbg-panel">{tripText}</p>}

      {Panel && <Panel room={room} me={me} table={myT} now={now} clock={serverNow} toast={flash} onClose={closeModal} onAct={act} />}
      {modal === 'elev' && <ElevatorPanel room={room} inElev={inElev} onPick={async (to) => { if (await act({ type: 'floor', to })) setModal(null); else flash('Tienen que estar todos en el ascensor.'); }} onClose={() => setModal(null)} />}
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
          <p className="tbg-text">Juntaron {fmtMoney(room.day.last.money)} de {fmtMoney(room.day.last.quota)}. La cuota de hoy sube a <b>{fmtMoney(room.day.quota)}</b>.</p>
          <button type="button" className="tbg-btn" onClick={() => setSeenDay(room.day.n)}>¡A SEGUIR!</button>
        </div>
      )}
      <div className="tbg-fade" ref={fadeRef} />
    </div>
  );
}

// Qué conviene hacer ahora, según dónde estás (la línea amarilla de arriba).
function goalText(room, loc, aboard, inElev, done) {
  if (loc === 'wait') return aboard ? `Subí a la limusina con los demás (${aboard}/${room.players.length} a bordo)` : 'Caminá a la derecha hasta la limusina y tocá E para subir';
  if (loc === 'outside') return room.day.endsAt ? 'Entrá al casino por la puerta de la derecha, o volvé a casa en la limusina de la izquierda' : 'Entrá al casino por la puerta de la derecha';
  if (loc === 'elevator') {
    if (room.day.over) return room.elev.floor === 0 ? 'Se acabó el día: salí por la puerta y subí a la limusina' : 'Se acabó el día: usá el panel y bajá al lobby';
    if (inElev < room.players.length) return `Esperá a que suban todos al ascensor (${inElev}/${room.players.length})`;
    if (room.elev.floor === 0) return room.day.endsAt ? 'Usá el panel (E) y subí al piso 1' : 'Usá el panel (E) y subí al piso 1: ahí arranca el reloj del día';
    return 'Salí del ascensor por la puerta de abajo';
  }
  if (loc === 'f1') return done ? '¡Ya tienen la cuota! Sigan sumando o bajen y vuelvan a casa en la limusina' : 'Acercate a una mesa o máquina y tocá E para jugar';
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

function ElevatorPanel({ room, inElev, onPick, onClose }) {
  const all = allAt(room, 'elevator');
  const floors = [0, ...Array.from({ length: room.floors }, (_, i) => i + 1)];
  return (
    <div className="tbg-modal tbg-small tbg-elev" role="dialog" aria-label="Ascensor" data-elevator>
      <button type="button" className="tbg-close" onClick={onClose} aria-label="Cerrar">✕</button>
      <h2 className="tbg-title">ASCENSOR</h2>
      <p className={`tbg-text${all ? '' : ' is-warn'}`}>{all ? 'Están todos a bordo.' : `Faltan subir: ${room.players.length - inElev}. El ascensor solo viaja con todos adentro.`}</p>
      <div className="tbg-floors">
        {floors.slice().reverse().map((f) => {
          const disabled = !all || (room.day.over ? f !== 0 : f === room.elev.floor);
          return (
            <button key={f} type="button" className={`tbg-floor${f === room.elev.floor ? ' is-here' : ''}`} disabled={disabled} onClick={() => onPick(f)} data-floor={f}>
              <b>{f === 0 ? 'L' : f}</b><span>{f === 0 ? 'Lobby' : `Piso ${f}`}</span>
            </button>
          );
        })}
      </div>
      {room.day.over && <p className="tbg-text is-warn">Se terminó el día: el único camino es el lobby.</p>}
    </div>
  );
}
