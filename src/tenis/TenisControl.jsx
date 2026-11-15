// Tenis Movido: el celular como control. Lee el acelerómetro y el giróscopo (`devicemotion`), detecta el golpe acá
// mismo y le manda a la compu un solo mensaje por golpe: { k, f (fuerza 0 a 1), a (para dónde apuntaba, radianes),
// l (inclinación de la cara, radianes), s (1 drive, -1 revés) }. Para saber dónde es «adelante» se calibra antes de jugar:
// el celular derecho apuntando a la compu y quieto un segundo (`deviceorientation`).
// Va directo por WebRTC (con respaldo por el servidor) y repite los golpes de los últimos segundos en cada mensaje,
// así uno que se pierde llega en el siguiente (la compu usa cada `k` una sola vez).
//
// Los sensores solo andan en HTTPS y, en iPhone, después de un toque que pide permiso: por eso el botón grande.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { createMesh } from '../futbol/p2p.js';
import { COLORS, pointText, slotCount } from './game.js';
import { SWING_COOLDOWN, SWING_MIN, swingPower } from './sim.js';

const KEEP_MS = 2500;     // cuánto tiempo sigue viajando un golpe en los mensajes
const PEAK_MS = 120;      // ventana para medir el pico del golpe
const PING_MS = 1000;     // aunque no golpee, manda señales de vida

const STILL_MS = 1000;     // cuánto tiene que quedarse quieto para calibrar
const STILL_DEG = 4;       // cuánto puede temblar mientras tanto
const wrap = (d) => ((d + 540) % 360) - 180;

export default function TenisControl({ room, me, code, onLeave, onDispatch }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState(null);   // { f, a, hit }
  const [noSensor, setNoSensor] = useState(false);
  const [calib, setCalib] = useState(0); // 0 a 1: cuánto falta para quedar calibrado
  const s = useRef({ ori: null, ref: null, stillAt: 0, stillFrom: null, k: 0, swings: [], peak: 0, rot: 0, startAt: 0, coolUntil: 0, gotMotion: false }).current;
  const mine = room.players.find((p) => p.id === me.id);
  const slot = mine?.slot ?? 0;

  // ─── Red ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.tenisChannel(code);
    const onMsg = (id, raw) => {
      if (id !== room.hostId || !raw) return;
      let m = raw;
      if (typeof raw === 'string') { try { m = JSON.parse(raw); } catch { return; } }
      if (m.to !== me.id || m.hit == null || s.lastHit === m.hit) return;
      s.lastHit = m.hit;
      navigator.vibrate?.([40, 30, 80]);
      setLast((l) => (l ? { ...l, hit: true } : l));
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onMsg });
    s.mesh = mesh; s.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onMsg);
    const ping = setInterval(() => send(), PING_MS);
    return () => { clearInterval(ping); off(); mesh?.close(); chan.remove(me.id).catch(() => {}); s.mesh = null; s.chan = null; };
  }, [code, me.id, room.hostId]); // eslint-disable-line react-hooks/exhaustive-deps

  function send() {
    const now = Date.now();
    s.swings = s.swings.filter((w) => now - w.t < KEEP_MS);
    const msg = { t: now, sw: s.swings.map(({ k, f, a, l, sd }) => ({ k, f, a, l, s: sd })) };
    s.mesh?.broadcast(msg);
    if (!s.mesh || !s.mesh.isOpen(room.hostId)) s.chan?.publish(me.id, JSON.stringify(msg)).catch(() => {});
  }

  function swing(f, a, l = 0, sd = 1) {
    const now = Date.now();
    if (now < s.coolUntil) return;
    s.coolUntil = now + SWING_COOLDOWN * 1000;
    const r2 = (v) => Math.round(v * 100) / 100;
    const w = { k: ++s.k, f: r2(f), a: r2(a), l: r2(l), sd, t: now };
    s.swings.push(w);
    navigator.vibrate?.(15);
    setLast({ f: w.f, a: w.a, hit: false });
    send();
  }

  // ─── El sensor ─────────────────────────────────────────────────────────────
  // Un golpe: la aceleración (sin la gravedad) pasa de SWING_MIN; se mide el pico durante PEAK_MS y para qué lado giró la muñeca.
  function onMotion(e) {
    s.gotMotion = true;
    const acc = e.acceleration;
    let mag;
    if (acc && acc.x != null) mag = Math.hypot(acc.x, acc.y, acc.z);
    else { const g = e.accelerationIncludingGravity || {}; mag = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.8); }
    const rot = e.rotationRate ? (e.rotationRate.alpha || 0) + (e.rotationRate.gamma || 0) * 0.5 : 0;
    const now = Date.now();
    if (!s.startAt) {
      if (mag > SWING_MIN && now >= s.coolUntil) { s.startAt = now; s.peak = mag; s.rot = rot; }
      return;
    }
    if (mag > s.peak) s.peak = mag;
    s.rot += rot;
    if (now - s.startAt >= PEAK_MS) {
      // Sin ayuda: la fuerza es la del brazo (puede pasarse y mandarla afuera), la dirección es para dónde apuntaba el
      // celular respecto de la calibración y la inclinación abre o cierra la cara de la raqueta.
      const f = Math.max(0.1, swingPower(s.peak));
      let a = 0, l = 0;
      if (s.ori && s.ref) {
        a = Math.max(-1.3, Math.min(1.3, (-wrap(s.ori.alpha - s.ref.alpha) * Math.PI) / 180));
        l = Math.max(-0.8, Math.min(0.8, ((s.ori.beta - s.ref.beta) * Math.PI) / 180 * 0.5));
      } else a = Math.max(-1, Math.min(1, s.rot / 1500)) * 0.6;
      const sd = s.rot >= 0 ? 1 : -1;
      s.startAt = 0;
      swing(f, a, l, sd);
    }
  }

  // Calibración: el celular derecho, apuntando a la compu, quieto STILL_MS. Ahí se guarda dónde es «adelante».
  function onOrient(e) {
    if (e.alpha == null) return;
    const o = { alpha: e.alpha, beta: e.beta || 0 };
    s.ori = o;
    if (s.ref) return;
    const now = Date.now();
    const f = s.stillFrom;
    if (!f || Math.abs(wrap(o.alpha - f.alpha)) > STILL_DEG || Math.abs(o.beta - f.beta) > STILL_DEG) { s.stillFrom = o; s.stillAt = now; setCalib(0); return; }
    const k = Math.min(1, (now - s.stillAt) / STILL_MS);
    setCalib(k);
    if (k >= 1) finishCalib(o);
  }
  function finishCalib(o) {
    s.ref = o || { alpha: 0, beta: 0 };
    navigator.vibrate?.([30, 40, 30]);
    setCalib(1);
    onDispatch?.({ type: 'calibrate' });
  }
  function recalibrate() { s.ref = null; s.stillFrom = null; setCalib(0); }

  async function arm() {
    setError('');
    try {
      const DME = window.DeviceMotionEvent;
      if (!DME) { setNoSensor(true); setArmed(true); return; }
      if (typeof DME.requestPermission === 'function') {
        const res = await DME.requestPermission();
        if (res !== 'granted') { setError('Sin permiso para los sensores. Podés usar el botón GOLPEAR.'); setNoSensor(true); setArmed(true); return; }
      }
      const DOE = window.DeviceOrientationEvent;
      if (DOE && typeof DOE.requestPermission === 'function') { try { await DOE.requestPermission(); } catch { /* sigue sin orientación */ } }
      window.addEventListener('devicemotion', onMotion);
      window.addEventListener('deviceorientation', onOrient);
      setArmed(true);
      // Si en un segundo no llegó ningún dato, el aparato no tiene sensores (o es una compu).
      setTimeout(() => { if (!s.gotMotion) setNoSensor(true); }, 1200);
    } catch {
      setError('No se pudieron activar los sensores. Podés usar el botón GOLPEAR.');
      setNoSensor(true); setArmed(true);
    }
  }
  useEffect(() => () => { window.removeEventListener('devicemotion', onMotion); window.removeEventListener('deviceorientation', onOrient); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const color = COLORS[slot];
  return (
    <div className="tn-control" style={{ '--tn-color': color }} data-tenis-control>
      <header>
        <span className="tn-dot" />
        <b>{me.name}</b>
        <small>Equipo {slot % 2 === 0 ? 'Rojo' : 'Azul'}{slotCount(room) > 2 ? (slot >= 2 ? ' · en la red' : ' · al fondo') : ''} · sala {code}</small>
      </header>
      <p className="tn-ctrl-score" data-score>{room.phase === 'playing' ? `${room.score.g[0]} – ${room.score.g[1]} · ${pointText(room.score)}` : room.phase === 'final' ? 'Terminó el partido' : 'Esperando que arranque la cancha…'}</p>
      {!armed ? (
        <button type="button" className="tn-arm" onClick={arm} data-arm>🎾 Tocá para activar el control</button>
      ) : !s.ref ? (
        <div className="tn-calib" data-calib={Math.round(calib * 100)}>
          <div className="tn-calib-phone" style={{ '--k': calib }}>📱</div>
          <p><b>Calibrá el control</b></p>
          <p className="tn-small">Agarrá el celular como una raqueta, <b>derecho y apuntando a la compu</b>, y quedate quieto un segundo.</p>
          <div className="tn-calib-bar"><i style={{ width: `${calib * 100}%` }} /></div>
          {(noSensor || !s.ori) && <button type="button" className="tf-btn tf-btn-primary" onClick={() => finishCalib(null)} data-calib-now>Ya está derecho</button>}
        </div>
      ) : (
        <>
          {mine?.cal && <p className="tn-calib-ok" data-calibrated>✅ ¡Calibrado! <button type="button" className="tn-link" onClick={recalibrate} data-recalib>Recalibrar</button></p>}
          <div className={`tn-meter${last?.hit ? ' is-hit' : ''}`} data-last={last ? last.f : ''}>
            <i style={{ width: `${(last?.f || 0) * 100}%` }} />
            <span>{last ? (last.hit ? '¡Le pegaste!' : `Golpe ${Math.round(last.f * 100)} %`) : 'Hacé el gesto de pegarle a la pelota'}</span>
          </div>
          <button type="button" className="tn-swing" onClick={() => swing(0.45 + Math.random() * 0.25, (Math.random() - 0.5) * 0.5)} data-swing>GOLPEAR</button>
          <p className="tn-small">{noSensor ? 'Este aparato no manda movimiento: usá el botón.' : 'Agarrá el celular como una raqueta y hacé el golpe cuando la pelota te llega. El botón también sirve.'}</p>
        </>
      )}
      {error && <p className="tn-error" role="alert">{error}</p>}
      <button type="button" className="tf-btn tf-btn-soft tn-leave" onClick={onLeave}>Desconectar</button>
    </div>
  );
}
