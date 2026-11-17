// Tenis Movido: una compu. Muestra la cancha y el QR para conectar los celulares.
//
// La compu del anfitrión es la única que simula la pelota: recibe los golpes de todos los celulares (directo por WebRTC
// o por tenis/{sala}/p/{id}), le avisa al celular que pegó (`hit`, para que vibre) y, en el online, le manda a la otra
// compu cómo está la pelota y los jugadores (`r`, 30 veces por segundo). La otra compu solo dibuja, desde su lado.
// En el modo local la pantalla se parte en dos: a la izquierda detrás del equipo 0 y a la derecha detrás del equipo 1.
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { PublicSwitch } from '../lobby/PublicRoom.jsx';
import { SKIN_IDS } from '../wii/skins.js';
import { COLORS, TEAM_COLORS, findScreen, playerAt, pointText, slotCount, startProblem, teamOf } from './game.js';
import { STEP, SWING_WINDOW, canReach, canReachWide, hitBall, hitSwing, swingQuality, swingTiming, EARLY_S, SWING_LAG, BUTTON_LAG, tossBall, newRally, packRally, stepRally, unpackRally } from './sim.js';

const POINT_PAUSE = 1.6;   // segundos entre que se define el punto y el saque siguiente
const SWING_ANIM = 0.75; // lo que dura la animación del golpe (SWING_TIME de render.js)
// De qué lado le queda la pelota a un jugador diestro: 1 drive, −1 revés (y 0 si está sacando).
function ballSide(r, i) {
  if (r.serving && r.server === i) return 0;
  const p = r.players[i]; if (!p) return 1;
  const right = (r.ball.x - p.x) * (i % 2 === 0 ? 1 : -1);
  return right > -0.15 ? 1 : -1;
}
const SEND_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 12;
const WHY = { red: 'a la red', afuera: 'afuera', 'pique propio': 'picó de su lado', 'doble pique': 'doble pique', 'no llegó': 'no llegó' };
const TEAM_NAME = ['Rojo', 'Azul'];
const SLOT_NAME = ['al fondo', 'al fondo', 'en la red', 'en la red'];

export function controlUrl(code, team) {
  return `${window.location.origin}/?juego=tenis&control=${code}${team === 0 || team === 1 ? `&equipo=${team}` : ''}`;
}

export default function TenisScreen({ room, me, code, onDispatch, onLeave }) {
  const canvasRef = useRef(null);
  const roomRef = useRef(room);
  const dispatchRef = useRef(onDispatch);
  roomRef.current = room;
  dispatchRef.current = onDispatch;
  const host = room.hostId === me.id;
  const online = room.options?.mode === 'online';
  const myTeam = findScreen(room, me.id)?.team ?? 0;
  const [qr, setQr] = useState('');
  const [hud, setHud] = useState({ loading: true, msg: '' });
  const sim = useRef({ seen: new Set(), pending: [null, null, null, null], swingAt: [-9, -9, -9, -9], swingSide: [1, 1, 1, 1], rally: null, overAt: 0, sentPoint: -1, cpuAt: [0, 0, 0, 0], msg: '', msgAt: 0, sentAt: 0, serverAt: 0 }).current;
  const playing = room.phase === 'playing';
  const qrUrl = controlUrl(code, online ? myTeam : null);

  useEffect(() => { QRCode.toDataURL(qrUrl, { margin: 1, width: 360 }).then(setQr).catch(() => setQr('')); }, [qrUrl]);

  useEffect(() => {
    let dead = false;
    import('./render.js').then((mod) => {
      if (dead || !canvasRef.current) return;
      sim.r = mod.createRenderer(canvasRef.current);
      setHud((h) => ({ ...h, loading: false }));
    });
    return () => { dead = true; sim.r?.dispose(); sim.r = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada partido nuevo (o si cambia el formato) arranca con el saque del equipo que le toca.
  const count = slotCount(room);
  useEffect(() => {
    sim.rally = newRally(roomRef.current.score.server, count, Boolean(playerAt(roomRef.current, roomRef.current.score.server)));
    sim.overAt = 0; sim.sentPoint = -1;
  }, [room.n, playing, count]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Red ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.tenisChannel(code);
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      const r = roomRef.current;
      // La otra compu recibe la pelota de la del anfitrión.
      if (snap.r && id === r.hostId && r.hostId !== me.id) {
        // Se guarda con la hora de llegada y se dibuja un poco en el pasado, interpolando entre dos fotos (ver `smooth`):
        // aplicarla tal cual llegaba hacía que la pelota avanzara a los saltos.
        const t = performance.now() / 1000;
        sim.buf ||= [];
        const lastAt = sim.buf.length ? sim.buf[sim.buf.length - 1].at : 0;
        if (lastAt) sim.gap = (sim.gap || 1 / 30) * 0.9 + Math.min(0.5, t - lastAt) * 0.1;
        sim.buf.push({ at: t, r: unpackRally(snap.r, null) });
        if (sim.buf.length > 30) sim.buf.shift();
        (snap.sw || []).forEach((age, i) => { if (age >= 0) { sim.swingAt[i] = t - age; sim.swingSide[i] = snap.sd?.[i] ?? 1; } });
        if (snap.m && snap.m !== sim.msg) { sim.msg = snap.m; sim.msgAt = t; }
        return;
      }
      // Los golpes de los celulares los procesa solo la compu del anfitrión.
      if (r.hostId !== me.id) return;
      const pl = r.players.find((p) => p.id === id);
      if (!pl) return;
      for (const sw of snap.sw || []) {
        if (typeof sw !== 'object') continue;
        const key = `${id}:${sw.k}`;
        if (sim.seen.has(key)) continue;
        sim.seen.add(key);
        // Cuándo fue el golpe respecto de la pelota se mide al llegar (descontando el retraso del celular).
        const rally = sim.rally;
        const held = rally && rally.serving && rally.held && rally.server === pl.slot;
        const dt = rally && !held ? swingTiming(rally, pl.slot, sw.b ? BUTTON_LAG : SWING_LAG) : 0;
        if (!held && dt == null) continue; // la pelota no viene para él: es un movimiento cualquiera
        if (!held && (dt > EARLY_S || dt < -EARLY_S)) { ack(id, sw.k, dt > 0 ? 'pasó' : 'tarde', false); continue; }
        sim.pending[pl.slot] = { at: performance.now() / 1000, f: sw.f, a: 0, dt, real: true, k: sw.k, id };
        // La animación: el lado lo dice el celular (por cómo giró) y, si no se supo, de qué lado viene la pelota.
        if (!held) { sim.swingAt[pl.slot] = performance.now() / 1000; sim.swingSide[pl.slot] = rally?.serving ? 0 : sw.s || ballSide(rally, pl.slot); }
      }
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    sim.mesh = mesh; sim.chan = chan;
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); sim.mesh = null; sim.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // La otra compu: la pelota y los jugadores a `delay` segundos en el pasado, entre las dos fotos que lo rodean.
  function smooth(t) {
    const buf = sim.buf;
    const delay = Math.min(0.3, Math.max(0.07, (sim.gap || 1 / 30) * 2.5));
    const at = t - delay;
    let i = buf.length - 1;
    while (i > 0 && buf[i - 1].at > at) i--;
    const b = buf[i], a = buf[i - 1] || b;
    const u = b === a ? 1 : Math.max(0, Math.min(1, (at - a.at) / (b.at - a.at)));
    if (!sim.rally || sim.rally.players.length !== b.r.players.length) sim.rally = unpackRally(packRally(b.r), null);
    const r = sim.rally, l = (x, y) => x + (y - x) * u;
    // Si la pelota cambió de lado de golpe (saque nuevo) no se interpola: va directo.
    const jump = Math.hypot(b.r.ball.x - a.r.ball.x, b.r.ball.z - a.r.ball.z) > 8;
    r.ball.x = jump ? b.r.ball.x : l(a.r.ball.x, b.r.ball.x); r.ball.y = jump ? b.r.ball.y : l(a.r.ball.y, b.r.ball.y); r.ball.z = jump ? b.r.ball.z : l(a.r.ball.z, b.r.ball.z);
    b.r.players.forEach((p, k) => { r.players[k].x = l(a.r.players[k].x, p.x); r.players[k].z = l(a.r.players[k].z, p.z); });
    r.serving = b.r.serving; r.server = b.r.server; r.over = b.r.over; r.held = b.r.held;
    while (buf.length > 2 && buf[1].at < at - 0.5) buf.shift();
  }

  // Quién tiene la pelota en la mano para sacar (el celular lo muestra). Va en todos los mensajes de la compu del anfitrión.
  function holdId() {
    const r = sim.rally, room = roomRef.current;
    return r && r.serving && r.held && room.phase === 'playing' ? playerAt(room, r.server)?.id || '' : '';
  }
  // Le avisa al celular cómo le salió (q) y si le pegó (ok: vibra).
  function ack(id, k, q = '', ok = true) {
    const msg = { hit: k, to: id, q, ok, t: Date.now(), hold: holdId() };
    sim.mesh?.broadcast(msg);
    sim.chan?.publish(me.id, JSON.stringify(msg)).catch(() => {});
  }

  // Para probar sin celular: Espacio le pega el del fondo de tu equipo y, en el local, K el del otro equipo.
  useEffect(() => {
    const down = (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat || roomRef.current.hostId !== me.id) return;
      const team = findScreen(roomRef.current, me.id)?.team ?? 0;
      const slot = e.code === 'Space' ? team : e.code === 'KeyK' && roomRef.current.options?.mode !== 'online' ? 1 - team : -1;
      if (slot < 0) return;
      e.preventDefault();
      // El de la red de ese equipo también puede: el que esté más cerca de la pelota.
      const r = sim.rally;
      const mate = slot + 2;
      const who = r && r.players[mate] && Math.abs(r.ball.z - r.players[mate].z) < Math.abs(r.ball.z - r.players[slot].z) ? mate : slot;
      sim.pending[who] = { at: performance.now() / 1000, f: 0.6, a: (Math.random() - 0.5) * 1.6, k: -1 };
      sim.swingAt[who] = performance.now() / 1000; sim.swingSide[who] = r ? ballSide(r, who) : 1;
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, [me.id]);

  // ─── Un cuadro ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let last = performance.now() / 1000, acc = 0, hudAt = 0;
    function frame({ hidden } = {}) {
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - last);
      last = t;
      const r = roomRef.current;
      const isHost = r.hostId === me.id;
      const n = slotCount(r);
      if (!sim.rally || sim.rally.players.length !== n) sim.rally = newRally(r.score?.server || 0, n, Boolean(playerAt(r, r.score?.server || 0)));
      const rally = sim.rally;
      if (isHost && r.phase === 'playing') {
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard++ < 20) {
          acc -= STEP;
          for (let i = 0; i < n; i++) {
            if (playerAt(r, i)) {
              const sw = sim.pending[i];
              // Con la pelota en la mano, el primer gesto (levantar el celular) la tira para arriba.
              if (sw && rally.serving && rally.held && rally.server === i) {
                tossBall(rally); sim.pending[i] = null; if (sw.id) ack(sw.id, sw.k, 'arriba', false);
              } else if (sw && t - sw.at < (sw.real ? EARLY_S + 0.1 : SWING_WINDOW) && (sw.real ? canReachWide(rally, i) : canReach(rally, i))) {
                // El del celular depende de cómo le pegaste: justo entra; temprano se abre, tarde va a la red, flojo queda corto.
                const q = sw.real ? hitSwing(rally, i, sw.f, sw.dt) : (hitBall(rally, i, sw.f, sw.a), '');
                sim.pending[i] = null;
                if (sw.id) ack(sw.id, sw.k, q);
              } else if (sw && t - sw.at >= (sw.real ? EARLY_S + 0.1 : SWING_WINDOW)) {
                if (sw.id) ack(sw.id, sw.k, swingQuality(sw.f, sw.dt) === 'temprano' ? 'pasó' : 'tarde', false);
                sim.pending[i] = null;
              }
            } else if (canReach(rally, i)) {
              // La máquina: le pega con un poco de demora y a veces la erra.
              if (!sim.cpuAt[i]) sim.cpuAt[i] = t + 0.08 + Math.random() * 0.15;
              if (t >= sim.cpuAt[i]) { sim.cpuAt[i] = 0; if (rally.serving || Math.random() > 0.12) { sim.swingSide[i] = ballSide(rally, i); hitBall(rally, i, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 1.8); sim.swingAt[i] = t - 0.18; } }
            }
          }
          const over = stepRally(rally);
          if (over && !sim.overAt) {
            sim.overAt = t;
            sim.msg = `Punto para el equipo ${TEAM_NAME[over.winner]} (${WHY[over.why] || over.why})`; sim.msgAt = t;
          }
        }
        if (acc > 1) acc = 0;
        if (sim.overAt && t - sim.overAt > POINT_PAUSE && sim.sentPoint !== (r.score.k || 0)) {
          sim.sentPoint = r.score.k || 0;
          dispatchRef.current({ type: 'point', n: r.n, side: rally.over.winner, k: r.score.k || 0 });
        }
        // A los celulares: quién tiene la pelota en la mano (por el canal directo seguido; por el servidor, solo cuando cambia).
        const hold = holdId();
        if (t - (sim.holdAt || 0) > 0.3 || hold !== sim.hold) {
          sim.holdAt = t; sim.mesh?.broadcast({ hold });
          if (hold !== sim.hold) { sim.hold = hold; sim.chan?.publish(me.id, JSON.stringify({ hold })).catch(() => {}); }
        }
        // En el online, la pelota va a la otra compu.
        if (r.options?.mode === 'online' && t - sim.sentAt >= SEND_EVERY) {
          sim.sentAt = t;
          const snap = { r: packRally(rally), sw: sim.swingAt.slice(0, n).map((s) => (t - s < SWING_ANIM ? Math.round((t - s) * 100) / 100 : -1)), sd: sim.swingSide.slice(0, n), m: t - sim.msgAt < 2.5 ? sim.msg : '', hold };
          sim.mesh?.broadcast(snap);
          const other = (r.screens || []).find((s) => s.id !== me.id);
          if (other && (!sim.mesh || !sim.mesh.isOpen(other.id)) && t - sim.serverAt >= SERVER_EVERY && sim.chan) { sim.serverAt = t; sim.chan.publish(me.id, JSON.stringify(snap)).catch(() => {}); }
        }
      }
      if (!isHost && sim.buf?.length) smooth(t);
      if (!hidden && sim.r) {
        const team = findScreen(r, me.id)?.team ?? 0;
        const names = [], colors = [], skins = [];
        for (let i = 0; i < n; i++) { names.push(playerAt(r, i)?.name || 'Máquina'); colors.push(COLORS[i]); skins.push(playerAt(r, i)?.skin || SKIN_IDS[(i + 4) % SKIN_IDS.length]); }
        sim.r.draw({ rally: sim.rally, skins, views: r.options?.mode === 'online' ? [team] : [0, 1], names, colors, swing: [0, 1, 2, 3].map((s) => ({ age: t - sim.swingAt[s], side: sim.swingSide[s] })) });
      }
      if (t - hudAt > 0.15) { hudAt = t; setHud({ loading: !sim.r, msg: t - sim.msgAt < 2.5 ? sim.msg : '' }); }
    }
    const stop = everyFrame(frame);
    window.__tenis = sim; // para manejar la cancha desde un navegador automatizado
    return () => { stop(); if (window.__tenis === sim) delete window.__tenis; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando la sala anota el punto, saque nuevo (lo arma la compu del anfitrión; la otra lo recibe).
  useEffect(() => {
    if (!playing || !sim.overAt) return;
    sim.rally = newRally(room.score.server, slotCount(room), Boolean(playerAt(room, room.score.server)));
    sim.overAt = 0; sim.cpuAt = [0, 0, 0, 0]; sim.pending = [null, null, null, null];
  }, [room.score?.k]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = startProblem(room);
  const teamNames = (team) => { const ns = []; for (let s = team; s < count; s += 2) ns.push(playerAt(room, s)?.name || 'Máquina'); return ns.join(' y '); };
  const split = !online;
  return (
    <div className={`tn-stage${split ? ' is-split' : ''}`} data-tenis-screen data-mode={online ? 'online' : 'local'}>
      <canvas ref={canvasRef} className="tn-canvas" data-tenis-canvas />
      {split && <div className="tn-divider" />}
      <div className="tn-score" data-score>
        <span className="tn-team" style={{ '--tc': TEAM_COLORS[0] }}>{teamNames(0)}</span>
        <span className="tn-games"><b>{room.score.g[0]}</b> – <b>{room.score.g[1]}</b></span>
        <em>{pointText(room.score)}</em>
        <span className="tn-team" style={{ '--tc': TEAM_COLORS[1] }}>{teamNames(1)}</span>
      </div>
      {hud.msg && <div className="tn-msg">{hud.msg}</div>}

      {room.phase !== 'playing' && (
        <div className="tn-panel" data-panel>
          {room.phase === 'final' && <h2 className="tn-win">🏆 ¡Ganó el equipo {TEAM_NAME[room.winner]}: {teamNames(room.winner)}!</h2>}
          {host ? (
            <div className="tn-opts">
              <div className="tn-seg" role="group" aria-label="Modo">
                {[['local', '🖥️ Local (una compu)'], ['online', '🌐 Online (una compu por equipo)']].map(([v, l]) => <button key={v} type="button" className={room.options.mode === v ? 'is-on' : ''} onClick={() => onDispatch({ type: 'setOptions', options: { mode: v } })} data-mode-opt={v}>{l}</button>)}
              </div>
              <div className="tn-seg" role="group" aria-label="Formato">
                {[['1v1', '1 contra 1'], ['2v2', '2 contra 2']].map(([v, l]) => <button key={v} type="button" className={room.options.format === v ? 'is-on' : ''} onClick={() => onDispatch({ type: 'setOptions', options: { format: v } })} data-format-opt={v}>{l}</button>)}
              </div>
            </div>
          ) : <p className="tn-small">Sos la compu del equipo {TEAM_NAME[myTeam]}. El anfitrión elige el formato y arranca.</p>}
          <PublicSwitch code={code} host={host} players={room.players.length + 1} />
          <h2>{online ? `Celulares del equipo ${TEAM_NAME[myTeam]}` : 'Conectá los celulares'}</h2>
          <div className="tn-connect">
            {qr ? <img src={qr} alt="QR para conectar el celular" className="tn-qr" data-qr /> : <div className="tn-qr" />}
            <div>
              <p>Escaneá el QR con la cámara del celular, o entrá a <b>{window.location.host}</b> y escribí el código:</p>
              <p className="tn-code" data-code>{code}</p>
              {online && host && <p className="tn-small">La compu del otro equipo entra a Tenis Movido, toca «Unirme con esta compu» y escribe este mismo código. {(room.screens || []).length > 1 ? <b>✅ Ya está conectada.</b> : <b>Todavía no entró.</b>}</p>}
              <ul className="tn-slots">
                {Array.from({ length: count }, (_, s) => (online && teamOf(s) !== myTeam && !host ? null : (
                  <li key={s} style={{ borderColor: COLORS[s] }} data-slot={s}>{TEAM_NAME[teamOf(s)]} {count > 2 ? SLOT_NAME[s] : ''}: {playerAt(room, s) ? <b>📱 {playerAt(room, s).name}</b> : <em>juega la máquina</em>}</li>
                )))}
              </ul>
            </div>
          </div>
          <p className="tn-small">Con el celular en la mano como una raqueta, hacé el gesto de pegarle cuando la pelota llega. Para probar sin celular: <kbd>Espacio</kbd>{online ? '' : <> y <kbd>K</kbd></>}.</p>
          <div className="tn-actions">
            {host && <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(problem)} onClick={() => onDispatch({ type: 'start' })} data-start>🎾 {room.phase === 'final' ? 'Otro partido' : '¡A jugar!'}</button>}
            <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>{host ? 'Cerrar la cancha' : 'Salir'}</button>
          </div>
          {host && problem && <p className="tn-small">{problem}</p>}
        </div>
      )}
      {playing && host && <button type="button" className="tn-corner tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Pausa / QR</button>}
    </div>
  );
}
