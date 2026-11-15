// Tenis Movido: el celular como control. Lee el acelerómetro y el giróscopo (`devicemotion`), detecta el gesto acá mismo y
// le manda a la compu un solo mensaje por gesto: { k, f (fuerza 0 a 1) }. La compu decide qué es: si tenés la pelota en la
// mano para sacar, la tira para arriba; si no, es un golpe (le pega bien si la pelota está a tu alcance).
// Va directo por WebRTC (con respaldo por el servidor) y repite los gestos de los últimos segundos en cada mensaje,
// así uno que se pierde llega en el siguiente (la compu usa cada `k` una sola vez).
//
// Los sensores solo andan en HTTPS y, en iPhone, después de un toque que pide permiso: por eso el botón grande.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { createMesh } from '../futbol/p2p.js';
import { COLORS, pointText, slotCount } from './game.js';
import { LIFT_MIN, SWING_COOLDOWN, SWING_MIN, TWIST_MIN, swingPower } from './sim.js';

const KEEP_MS = 2500;     // cuánto tiempo sigue viajando un gesto en los mensajes
const PEAK_MS = 120;      // ventana para medir el pico del golpe
const PING_MS = 1000;     // aunque no golpee, manda señales de vida

export default function TenisControl({ room, me, code, onLeave }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState(null);   // { f, hit }
  const [noSensor, setNoSensor] = useState(false);
  const [holding, setHolding] = useState(false); // tenés la pelota en la mano para sacar
  const s = useRef({ k: 0, swings: [], peak: 0, twist: 0, startAt: 0, coolUntil: 0, gotMotion: false, holding: false }).current;
  const mine = room.players.find((p) => p.id === me.id);
  const slot = mine?.slot ?? 0;

  // ─── Red ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.tenisChannel(code);
    const onMsg = (id, raw) => {
      if (id !== room.hostId || !raw) return;
      let m = raw;
      if (typeof raw === 'string') { try { m = JSON.parse(raw); } catch { return; } }
      if (typeof m.hold === 'string') { const h = m.hold === me.id; if (h !== s.holding) { s.holding = h; setHolding(h); } }
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
    const msg = { t: now, sw: s.swings.map(({ k, f }) => ({ k, f })) };
    s.mesh?.broadcast(msg);
    if (!s.mesh || !s.mesh.isOpen(room.hostId)) s.chan?.publish(me.id, JSON.stringify(msg)).catch(() => {});
  }

  function swing(f) {
    const now = Date.now();
    if (now < s.coolUntil) return;
    s.coolUntil = now + SWING_COOLDOWN * 1000;
    const w = { k: ++s.k, f: Math.round(f * 100) / 100, t: now };
    s.swings.push(w);
    navigator.vibrate?.(15);
    setLast({ f: w.f, hit: false, toss: s.holding });
    send();
  }

  // ─── El sensor ─────────────────────────────────────────────────────────────
  // Un gesto: la aceleración (sin la gravedad) o el giro de la muñeca pasan del umbral; durante PEAK_MS se mide el pico.
  // Con la pelota en la mano alcanza con levantar el celular (umbral bajo); para pegarle hace falta un golpe de verdad.
  function onMotion(e) {
    s.gotMotion = true;
    const acc = e.acceleration;
    let mag;
    if (acc && acc.x != null) mag = Math.hypot(acc.x, acc.y, acc.z);
    else { const g = e.accelerationIncludingGravity || {}; mag = Math.abs(Math.hypot(g.x || 0, g.y || 0, g.z || 0) - 9.8); }
    const rr = e.rotationRate || {};
    const twist = Math.hypot(rr.alpha || 0, rr.beta || 0, rr.gamma || 0); // grados por segundo
    const now = Date.now();
    if (!s.startAt) {
      const go = s.holding ? mag > LIFT_MIN : mag > SWING_MIN || twist > TWIST_MIN;
      if (go && now >= s.coolUntil) { s.startAt = now; s.peak = mag; s.twist = twist; }
      return;
    }
    s.peak = Math.max(s.peak, mag); s.twist = Math.max(s.twist, twist);
    if (now - s.startAt >= PEAK_MS) {
      s.startAt = 0;
      swing(swingPower(s.peak, s.twist));
    }
  }

  async function arm() {
    setError('');
    try {
      const DME = window.DeviceMotionEvent;
      if (!DME) { setNoSensor(true); setArmed(true); return; }
      if (typeof DME.requestPermission === 'function') {
        const res = await DME.requestPermission();
        if (res !== 'granted') { setError('Sin permiso para los sensores. Podés usar el botón.'); setNoSensor(true); setArmed(true); return; }
      }
      window.addEventListener('devicemotion', onMotion);
      setArmed(true);
      // Si en un segundo no llegó ningún dato, el aparato no tiene sensores (o es una compu).
      setTimeout(() => { if (!s.gotMotion) setNoSensor(true); }, 1200);
    } catch {
      setError('No se pudieron activar los sensores. Podés usar el botón.');
      setNoSensor(true); setArmed(true);
    }
  }
  useEffect(() => () => window.removeEventListener('devicemotion', onMotion), []); // eslint-disable-line react-hooks/exhaustive-deps

  const color = COLORS[slot];
  const playing = room.phase === 'playing';
  return (
    <div className="tn-control" style={{ '--tn-color': color }} data-tenis-control>
      <header>
        <span className="tn-dot" />
        <b>{me.name}</b>
        <small>Equipo {slot % 2 === 0 ? 'Rojo' : 'Azul'}{slotCount(room) > 2 ? (slot >= 2 ? ' · en la red' : ' · al fondo') : ''} · sala {code}</small>
      </header>
      <p className="tn-ctrl-score" data-score>{playing ? `${room.score.g[0]} – ${room.score.g[1]} · ${pointText(room.score)}` : room.phase === 'final' ? 'Terminó el partido' : 'Esperando que arranque la cancha…'}</p>
      {!armed ? (
        <button type="button" className="tn-arm" onClick={arm} data-arm>🎾 Tocá para activar el control</button>
      ) : (
        <>
          {playing && holding && <p className="tn-serve" data-serve>🎾 ¡Sacás vos! Levantá el celular para tirar la pelota y pegale cuando baja.</p>}
          <div className={`tn-meter${last?.hit ? ' is-hit' : ''}`} data-last={last ? last.f : ''}>
            <i style={{ width: `${(last?.f || 0) * 100}%` }} />
            <span>{last ? (last.hit ? '¡Le pegaste!' : last.toss ? '¡Arriba!' : `Golpe ${Math.round(last.f * 100)} %`) : 'Hacé el gesto de pegarle a la pelota'}</span>
          </div>
          <button type="button" className="tn-swing" onClick={() => swing(0.5 + Math.random() * 0.2)} data-swing>{playing && holding ? 'TIRAR LA PELOTA' : 'GOLPEAR'}</button>
          <p className="tn-small">{noSensor ? 'Este aparato no manda movimiento: usá el botón.' : 'Agarrá el celular como una raqueta y hacé el golpe de tenis cuando la pelota te llega: antes la cruzás, más tarde la tirás paralela. Más fuerte, más rápida.'}</p>
        </>
      )}
      {error && <p className="tn-error" role="alert">{error}</p>}
      <button type="button" className="tf-btn tf-btn-soft tn-leave" onClick={onLeave}>Desconectar</button>
    </div>
  );
}
