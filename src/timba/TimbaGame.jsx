// La Timba en vivo: el dibujo, el teclado, la red y todo lo que se ve encima (el HUD, la ventana del ascensor,
// la del blackjack, los viajes).
//
// Cada pantalla es dueña de su jugador: lo mueve y manda su foto (posición y para dónde mira) directo a los demás
// (WebRTC) o, si no se puede, por el servidor. Todo lo que se comparte (la plata, el día, dónde está cada uno, la
// mesa) va por la sala (`game.js`) y se pide con `onDispatch`.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { backgroundInterval, everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { SCENES, SIDE_H, doorFor, nearby, sceneKey, seatPos, spawnPoint, stepSide, stepTop } from './scenes.js';
import { drawScene } from './render.js';
import BjPanel from './BjPanel.jsx';
import { allAt, dayLeftMs, findPlayer, fmtClock, fmtMoney, locOfFloor } from './game.js';

const SEND_EVERY = 1 / 15;
const SERVER_EVERY = 1 / 8;
const GONE_AFTER = 15; // sin fotos de alguien, el anfitrión lo saca
const KEYS = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'] };
const round1 = (v) => Math.round(v * 10) / 10;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function TicketIcon() {
  return <svg className="tb-ticket" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M5 3h14v5a2.2 2.2 0 0 0 0 4.4V21H5v-8.6a2.2 2.2 0 0 0 0-4.4z" fill="#f0c33c" stroke="#8a5a10" strokeWidth="1.6" strokeLinejoin="round" /><path d="M9 8h6M9 12h6" stroke="#8a5a10" strokeWidth="1.6" strokeLinecap="round" /></svg>;
}

// Dónde aparece cada uno al cambiar de lugar.
function landing(loc, prev, index) {
  const base = spawnPoint(loc, index);
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
  const [modal, setModal] = useState(null); // null | 'bj' | 'elev' | 'van'
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
    if (modalRef.current === 'bj') {
      const r = roomRef.current;
      const seat = r.bj.seats.find((x) => x.id === me.id);
      if (seat) {
        if (r.bj.phase === 'play' && seat.st === 'play') { flash('Terminá la mano antes de levantarte.'); return; }
        if (await act({ type: 'bjLeave' }) && roomRef.current.players.length) sim.current.p.y += 34; // se levanta y da un paso atrás
      }
    }
    setModal(null);
  };
  const closeRef = useRef(closeModal);
  closeRef.current = closeModal;

  // Al cambiar de lugar se cierra lo que estuviera abierto.
  useEffect(() => { setModal(null); }, [me.loc]);
  // Si se terminó el día mientras se jugaba, la mesa ya se cerró.
  useEffect(() => { if (room.day.over && modalRef.current === 'bj') setModal(null); }, [room.day.over]);

  // ─── Interactuar (E) ────────────────────────────────────────────────────────
  const interact = async () => {
    const s = sim.current;
    const r = roomRef.current;
    if (modalRef.current) return;
    const n = s.near;
    if (!n) return;
    if (n.key === 'board') act({ type: 'loc', to: 'limo' });
    else if (n.key === 'unboard') act({ type: 'loc', to: 'wait' });
    else if (n.key === 'van') setModal('van');
    else if (n.key === 'npc') flash('«Todavía no compraste ningún item. ¡Pasá por la camioneta!»');
    else if (n.key === 'panel') { if (r.trip) flash('El ascensor se está moviendo.'); else setModal('elev'); }
    else if (n.key === 'bj') {
      if (r.day.over) return;
      const taken = r.bj.seats.find((x) => x.id !== me.id);
      if (taken) { flash(`La mesa está ocupada por ${r.players.find((p) => p.id === taken.id)?.name || 'otro jugador'}.`); return; }
      const ok = await act({ type: 'bjSit' });
      if (ok) setModal('bj'); else flash('La mesa está ocupada.');
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
        if (loc !== 'limo') {
          const sp = landing(loc, s.loc, index);
          s.p = { x: sp.x, y: sp.y, face: sc.kind === 'side' ? 1 : Math.PI / 2, moving: false, phase: 0 };
        }
        s.prevLoc = s.loc;
        s.loc = loc;
        s.pendingAt = 0;
        s.fade = 1;
      }

      // Moverse (con el ascensor andando, la limusina esperando o una ventana abierta, no).
      const frozen = Boolean(modalRef.current) || Boolean(r.trip) || loc === 'limo';
      const dx = (s.input.right ? 1 : 0) - (s.input.left ? 1 : 0);
      const dy = (s.input.down ? 1 : 0) - (s.input.up ? 1 : 0);
      // Cada uno tiene su silla fija en la mesa (según su lugar en la sala), así no saltan cuando alguien se levanta.
      const seated = r.bj.seats.some((x) => x.id === me.id);
      if (loc === 'f1' && seated && modalRef.current === 'bj') {
        const sp = seatPos();
        s.p.x = sp.x; s.p.y = sp.y; s.p.moving = false; s.p.face = Math.atan2(SCENES.f1.table.y - sp.y, SCENES.f1.table.x - sp.x);
      } else if (frozen) s.p.moving = false;
      else if (sc.kind === 'side') stepSide(s.p, dx, dt, key);
      else stepTop(s.p, dx, dy, dt, key);
      if (s.p.moving) s.p.phase += dt;

      // Qué hay cerca para tocar con E.
      const nb = r.trip || (frozen && loc !== 'limo') ? null : nearby(loc, s.p);
      const nbKey = nb ? nb.key : '';
      if (nbKey !== (s.near?.key || '')) { s.near = nb; setNear(nb); }

      // Puertas: entrar al casino, al ascensor, o salir de él.
      if (!frozen && !r.trip && performance.now() - s.pendingAt > 900) {
        const to = doorFor(loc, s.p, r.elev.floor);
        const here = locOfFloor(r.elev.floor);
        const allowed = to && ((loc === 'elevator' && !r.day.over && to === here) || (to === 'elevator' && loc === here));
        if (allowed) { s.pendingAt = performance.now(); dispatchRef.current({ type: 'loc', to }); }
      }

      // Mandar mi foto.
      if (t - s.sentAt >= (s.p.moving ? SEND_EVERY : 0.5)) {
        s.sentAt = t;
        const snap = { n: r.run, t: now / 1000, sc: loc === 'limo' ? 'limo' : key, x: round1(s.p.x), y: round1(s.p.y), f: Math.round(s.p.face * 100) / 100, m: s.p.moving ? 1 : 0 };
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
      const heads = r.players.filter((pl) => pl.loc === 'limo').length;
      if (loc !== 'limo') players.push({ x: s.p.x, y: s.p.y, face: s.p.face, phase: s.p.phase, moving: s.p.moving, color: meP.color, name: me.id === meP.id ? '' : meP.name });
      for (const pl of r.players) {
        if (pl.id === me.id || sceneKey(pl.loc) !== key || pl.loc === 'limo') continue;
        const v = s.remotes.get(pl.id);
        const seated = key === 'f1' && r.bj.seats.some((x) => x.id === pl.id);
        let x; let y; let face; let moving = false;
        if (seated) {
          const sp = seatPos();
          x = sp.x; y = sp.y; face = Math.atan2(SCENES.f1.table.y - sp.y, SCENES.f1.table.x - sp.x);
        } else if (v && v.snap.sc === key) {
          const k = Math.min(1, dt * 14);
          v.x += (v.snap.x - v.x) * k; v.y += (v.snap.y - v.y) * k;
          moving = Boolean(v.snap.m) && Math.hypot(v.snap.x - v.x, v.snap.y - v.y) > 0.5;
          if (moving) v.phase += dt;
          x = v.x; y = v.y; face = v.snap.f;
        } else continue;
        players.push({ x, y, face, phase: v?.phase || 0, moving, color: pl.color, name: pl.name });
      }

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(wrap.clientWidth * dpr);
      const ch = Math.round(wrap.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const ctx = canvas.getContext('2d');
      const view = { w: cw, h: ch };
      if (sc.kind === 'side') {
        view.scale = ch / SIDE_H;
        const viewW = cw / view.scale;
        const focus = loc === 'limo' ? SCENES.wait.limo.x + 120 : s.p.x;
        view.camX = clamp(focus - viewW / 2, 0, Math.max(0, sc.w - viewW));
      } else if (key === 'elevator') {
        view.scale = Math.min(cw / 520, ch / 400);
        view.cx = 150; view.cy = 150;
      } else {
        view.scale = ch / 440;
        const vw = cw / view.scale;
        const vh = ch / view.scale;
        view.cx = vw >= sc.w ? sc.w / 2 : clamp(s.p.x, vw / 2, sc.w - vw / 2);
        view.cy = vh >= sc.h ? sc.h / 2 : clamp(s.p.y, vh / 2, sc.h - vh / 2);
      }

      // El viaje en limusina (se cierra la puerta y arranca) y el del ascensor (tiembla, cambia el número).
      const p = trip ? clamp((now - trip.at) / trip.ms, 0, 1) : 0;
      const limoGo = trip?.kind === 'limo' ? clamp((p - 0.22) / 0.78, 0, 1) : 0;
      const limoDoor = trip?.kind === 'limo' ? 1 - clamp(p / 0.2, 0, 1) : 1;
      const moving = trip && (trip.kind === 'elev' || trip.kind === 'home');
      const labelOf = (f) => (f === 0 ? 'L' : String(f));
      const floorLabel = moving ? (p < 0.5 ? labelOf(r.elev.floor) : labelOf(trip.to === 'wait' ? 0 : trip.to)) : labelOf(r.elev.floor);
      const doorOpen = moving || r.day.over ? 0 : 1;
      const fadeOut = trip?.kind === 'limo' || trip?.kind === 'home' ? clamp((p - 0.72) / 0.28, 0, 1) : 0;
      if (fadeRef.current) fadeRef.current.style.opacity = String(Math.max(s.fade, fadeOut));

      const slots = Object.fromEntries(r.players.map((pl, i) => [pl.id, i]));
      drawScene(ctx, view, key, {
        time: s.time, players, bj: r.bj, slots, heads, limoGo, limoDoor, floorLabel, doorOpen,
        shake: moving ? (Math.sin(s.time * 60) * 0.8) : 0,
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
  const aboard = room.players.filter((p) => p.loc === 'limo').length;
  const inElev = room.players.filter((p) => p.loc === 'elevator').length;
  const showDay = room.day.endsAt && loc !== 'wait' && loc !== 'limo';
  const dayPassed = room.day.last && !room.day.last.lost && room.day.n > seenDay && loc === 'wait' && !trip;
  const tripText = trip?.kind === 'limo' ? 'Rumbo al casino…' : trip?.kind === 'home' ? 'Volviendo a casa…' : trip ? (trip.to === 0 ? 'Bajando al lobby…' : `Subiendo al piso ${trip.to}…`) : '';

  return (
    <div className="tb-stage" ref={wrapRef}>
      <canvas ref={canvasRef} className="tb-canvas" data-timba-canvas />

      <div className="tb-tickets" title="Tickets dorados (de todos)"><b>{room.tickets}</b><TicketIcon /></div>
      <div className="tb-money" data-money>
        <small>DÍA {room.day.n}</small>
        <strong>{fmtMoney(room.money)}</strong>
        <em>/ {fmtMoney(room.day.quota)}</em>
      </div>
      <ul className="tb-net">
        {room.players.map((p) => {
          const net = room.net[p.id] || 0;
          return <li key={p.id} style={{ '--c': p.color }}><b className={net < 0 ? 'is-neg' : ''}>{net < 0 ? '−' : '+'}{fmtMoney(Math.abs(net))}</b><span>{p.name.toUpperCase()}</span></li>;
        })}
      </ul>
      {showDay && (
        <div className={`tb-clock${room.day.over ? ' is-over' : left < 30000 ? ' is-low' : ''}`}>
          <small>{room.day.over ? 'EL DÍA TERMINÓ' : 'EL DÍA TERMINA EN'}</small>
          {!room.day.over && <strong>{fmtClock(left)}</strong>}
        </div>
      )}

      {loc === 'wait' && !trip && <p className="tb-hint">← → o A D para caminar · E para tocar. Cuando estén todos en la limusina, salen al casino.</p>}
      {loc === 'limo' && !trip && <p className="tb-hint is-big">En la limusina · esperando a los demás ({aboard}/{room.players.length}) · <kbd>E</kbd> para bajar</p>}
      {loc === 'elevator' && !trip && <p className="tb-hint">{room.day.over ? 'El ascensor se cerró: solo se puede ir al lobby.' : `En el ascensor: ${inElev}/${room.players.length}. Usá el panel con E.`}</p>}
      {near && !modal && <p className="tb-near" data-near><kbd>E</kbd> {near.label}</p>}
      {toast && <p className="tb-toast" role="status">{toast}</p>}
      {tripText && <p className="tb-trip">{tripText}</p>}

      {modal === 'bj' && <BjPanel room={room} me={me} now={now} toast={flash} onClose={closeModal} onAct={act} />}
      {modal === 'elev' && <ElevatorPanel room={room} inElev={inElev} onPick={async (to) => { if (await act({ type: 'floor', to })) setModal(null); else flash('Tienen que estar todos en el ascensor.'); }} onClose={() => setModal(null)} />}
      {modal === 'van' && (
        <div className="tb-modal tb-small" role="dialog" aria-label="Camioneta">
          <button type="button" className="tb-close" onClick={() => setModal(null)} aria-label="Cerrar">✕</button>
          <h2 className="tb-title">LA CAMIONETA</h2>
          <p className="tb-text">Acá se van a comprar items con los tickets dorados <TicketIcon />. Por ahora la camioneta está vacía: todavía no hay nada a la venta.</p>
          <p className="tb-text is-dim">Tienen {room.tickets} tickets para cuando llegue la mercadería.</p>
        </div>
      )}
      {dayPassed && (
        <div className="tb-modal tb-small" role="dialog" aria-label="Día superado">
          <h2 className="tb-title">¡DÍA {room.day.last.n} SUPERADO!</h2>
          <p className="tb-text">Juntaron {fmtMoney(room.day.last.money)} de {fmtMoney(room.day.last.quota)}. La cuota de hoy sube a <b>{fmtMoney(room.day.quota)}</b>.</p>
          <button type="button" className="tb-btn" onClick={() => setSeenDay(room.day.n)}>¡A seguir!</button>
        </div>
      )}
      <div className="tb-fade" ref={fadeRef} />
    </div>
  );
}

function ElevatorPanel({ room, inElev, onPick, onClose }) {
  const all = allAt(room, 'elevator');
  const floors = [0, ...Array.from({ length: room.floors }, (_, i) => i + 1)];
  return (
    <div className="tb-modal tb-small tb-elev" role="dialog" aria-label="Ascensor" data-elevator>
      <button type="button" className="tb-close" onClick={onClose} aria-label="Cerrar">✕</button>
      <h2 className="tb-title">ASCENSOR</h2>
      <p className={`tb-text${all ? '' : ' is-warn'}`}>{all ? 'Están todos a bordo.' : `Faltan subir: ${room.players.length - inElev}. El ascensor solo viaja con todos adentro.`}</p>
      <div className="tb-floors">
        {floors.slice().reverse().map((f) => {
          const disabled = !all || (room.day.over ? f !== 0 : f === room.elev.floor);
          return (
            <button key={f} type="button" className={`tb-floor${f === room.elev.floor ? ' is-here' : ''}`} disabled={disabled} onClick={() => onPick(f)} data-floor={f}>
              <b>{f === 0 ? 'L' : f}</b><span>{f === 0 ? 'Lobby' : `Piso ${f}`}</span>
            </button>
          );
        })}
      </div>
      {room.day.over && <p className="tb-text is-warn">Se terminó el día: el único camino es el lobby.</p>}
    </div>
  );
}
