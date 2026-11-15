// Tenis Movido: el celular como control. Lee el acelerómetro y el giróscopo (`devicemotion`), detecta el golpe acá
// mismo y le manda a la compu un solo mensaje por golpe: { k, f (fuerza 0 a 1), a (para dónde, -1 a 1) }.
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

export default function TenisControl({ room, me, code, onLeave }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState(null);   // { f, a, hit }
  const [noSensor, setNoSensor] = useState(false);
  const s = useRef({ k: 0, swings: [], peak: 0, rot: 0, startAt: 0, coolUntil: 0, gotMotion: false }).current;
  const slot = room.players.find((p) => p.id === me.id)?.slot ?? 0;

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
    const msg = { t: now, sw: s.swings.map(({ k, f, a }) => ({ k, f, a })) };
    s.mesh?.broadcast(msg);
    if (!s.mesh || !s.mesh.isOpen(room.hostId)) s.chan?.publish(me.id, JSON.stringify(msg)).catch(() => {});
  }

  function swing(f, a) {
    const now = Date.now();
    if (now < s.coolUntil) return;
    s.coolUntil = now + SWING_COOLDOWN * 1000;
    const w = { k: ++s.k, f: Math.round(f * 100) / 100, a: Math.round(a * 100) / 100, t: now };
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
      const f = Math.max(0.15, swingPower(s.peak));
      const a = Math.max(-1, Math.min(1, s.rot / 1500));
      s.startAt = 0;
      swing(f, a);
    }
  }

  async function arm() {
    setError('');
    try {
      const DME = window.DeviceMotionEvent;
      if (!DME) { setNoSensor(true); setArmed(true); return; }
      if (typeof DME.requestPermission === 'function') {
        const res = await DME.requestPermission();
        if (res !== 'granted') { setError('Sin permiso para los sensores. Podés usar el botón GOLPEAR.'); setNoSensor(true); setArmed(true); return; }
      }
      window.addEventListener('devicemotion', onMotion);
      setArmed(true);
      // Si en un segundo no llegó ningún dato, el aparato no tiene sensores (o es una compu).
      setTimeout(() => { if (!s.gotMotion) setNoSensor(true); }, 1200);
    } catch {
      setError('No se pudieron activar los sensores. Podés usar el botón GOLPEAR.');
      setNoSensor(true); setArmed(true);
    }
  }
  useEffect(() => () => window.removeEventListener('devicemotion', onMotion), []); // eslint-disable-line react-hooks/exhaustive-deps

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
      ) : (
        <>
          <div className={`tn-meter${last?.hit ? ' is-hit' : ''}`} data-last={last ? last.f : ''}>
            <i style={{ width: `${(last?.f || 0) * 100}%` }} />
            <span>{last ? (last.hit ? '¡Le pegaste!' : `Golpe ${Math.round(last.f * 100)} %`) : 'Hacé el gesto de pegarle a la pelota'}</span>
          </div>
          <button type="button" className="tn-swing" onClick={() => swing(0.6, 0)} data-swing>GOLPEAR</button>
          <p className="tn-small">{noSensor ? 'Este aparato no manda movimiento: usá el botón.' : 'Agarrá el celular como una raqueta y hacé el golpe cuando la pelota te llega. El botón también sirve.'}</p>
        </>
      )}
      {error && <p className="tn-error" role="alert">{error}</p>}
      <button type="button" className="tf-btn tf-btn-soft tn-leave" onClick={onLeave}>Desconectar</button>
    </div>
  );
}
