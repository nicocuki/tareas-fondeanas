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
import SkinPicker from '../wii/SkinPicker.jsx';
import { LIFT_MIN, SWING_COOLDOWN, SWING_MIN, TWIST_MIN, swingPower } from './sim.js';

const KEEP_MS = 2500;     // cuánto tiempo sigue viajando un gesto en los mensajes
const PEAK_MS = 120;      // ventana para medir el pico del golpe
const PING_MS = 1000;     // aunque no golpee, manda señales de vida
// Cómo te salió el golpe (lo dice la compu).
const QUALITY = { justo: '¡Justo! 🎯', temprano: 'Temprano: se te abrió', tarde: 'Tarde: la pelota ya pasaba', flojo: 'Flojo: pegale con ganas', 'pasó': 'Muy temprano: le pasaste por al lado', arriba: '¡Arriba! Pegale cuando baja' };

export default function TenisControl({ room, me, code, onLeave, onDispatch }) {
  const [armed, setArmed] = useState(false);
  const [error, setError] = useState('');
  const [last, setLast] = useState(null);   // { f, hit }
  const [noSensor, setNoSensor] = useState(false);
  const [holding, setHolding] = useState(false); // tenés la pelota en la mano para sacar
  const [lefty, setLefty] = useState(() => { try { return localStorage.getItem('tf:tenis:zurdo') === '1'; } catch { return false; } });
  const s = useRef({ k: 0, swings: [], peak: 0, twist: 0, startAt: 0, coolUntil: 0, gotMotion: false, holding: false }).current;
  s.lefty = lefty;
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
      if (m.ok) navigator.vibrate?.([40, 30, 80]);
      setLast((l) => ({ ...(l || { f: 0 }), hit: m.ok !== false && m.q !== 'arriba', q: m.q || '' }));
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
    const msg = { t: now, sw: s.swings.map(({ k, f, b, sd }) => ({ k, f, ...(b ? { b } : {}), ...(sd ? { s: sd } : {}) })) };
    s.mesh?.broadcast(msg);
    if (!s.mesh || !s.mesh.isOpen(room.hostId)) s.chan?.publish(me.id, JSON.stringify(msg)).catch(() => {});
  }

  // `button`: vino del botón (sin la ventana del pico del sensor, llega antes).
  function swing(f, button = false, side = 0) {
    const now = Date.now();
    if (now < s.coolUntil) return;
    s.coolUntil = now + SWING_COOLDOWN * 1000;
    const w = { k: ++s.k, f: Math.round(f * 100) / 100, t: now, b: button ? 1 : 0, sd: side };
    s.swings.push(w);
    navigator.vibrate?.(15);
    setLast({ f: w.f, hit: false, toss: s.holding, side });
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
    // Para saber si fue drive o revés: hacia dónde queda «arriba» (la gravedad, promediada mientras no hay golpe) y cuánto
    // giró el celular alrededor de ese eje durante el golpe (positivo = contra las agujas del reloj visto desde arriba).
    // No depende de cómo agarres el celular: para un diestro, el drive gira para un lado y el revés para el otro.
    const g = e.accelerationIncludingGravity;
    if (!s.startAt && g && g.x != null) { const k = 0.1; s.up = s.up ? s.up.map((v, i) => v + ([g.x, g.y, g.z][i] - v) * k) : [g.x, g.y, g.z]; }
    const up = s.up, n = up ? Math.hypot(up[0], up[1], up[2]) || 1 : 1;
    const yaw = up ? ((rr.beta || 0) * up[0] + (rr.gamma || 0) * up[1] + (rr.alpha || 0) * up[2]) / n : 0;
    if (!s.startAt) {
      const go = s.holding ? mag > LIFT_MIN : mag > SWING_MIN || twist > TWIST_MIN;
      if (go && now >= s.coolUntil) { s.startAt = now; s.peak = mag; s.twist = twist; s.yaw = yaw; }
      return;
    }
    s.peak = Math.max(s.peak, mag); s.twist = Math.max(s.twist, twist); s.yaw += yaw;
    if (now - s.startAt >= PEAK_MS) {
      s.startAt = 0;
      // Lado: solo si giró claro para un lado (si no, la compu lo decide por dónde viene la pelota). Zurdos al revés.
      const side = Math.abs(s.yaw) < 300 ? 0 : (s.yaw > 0 ? 1 : -1) * (s.lefty ? -1 : 1);
      swing(swingPower(s.peak, s.twist), false, side);
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
      {!playing && <SkinPicker value={mine?.skin} onPick={(skin) => onDispatch?.({ type: 'setSkin', skin })} compact />}
      {!armed ? (
        <button type="button" className="tn-arm" onClick={arm} data-arm>🎾 Tocá para activar el control</button>
      ) : (
        <>
          {playing && holding && <p className="tn-serve" data-serve>🎾 ¡Sacás vos! Levantá el celular para tirar la pelota y pegale cuando baja.</p>}
          <div className={`tn-meter${last?.hit ? ' is-hit' : ''}`} data-last={last ? last.f : ''}>
            <i style={{ width: `${(last?.f || 0) * 100}%` }} />
            <span data-quality={last?.q || ''}>{last ? `${last.side ? (last.side > 0 ? 'Drive · ' : 'Revés · ') : ''}${QUALITY[last.q] || (last.toss ? '¡Arriba!' : `Golpe ${Math.round(last.f * 100)} %`)}` : 'Hacé el gesto de pegarle a la pelota'}</span>
          </div>
          <button type="button" className="tn-swing" onClick={() => swing(0.5 + Math.random() * 0.2, true)} data-swing>{playing && holding ? 'TIRAR LA PELOTA' : 'GOLPEAR'}</button>
          <label className="tn-lefty"><input type="checkbox" checked={lefty} onChange={(e) => { setLefty(e.target.checked); try { localStorage.setItem('tf:tenis:zurdo', e.target.checked ? '1' : '0'); } catch { /* sin guardar */ } }} data-lefty /> Soy zurdo</label>
          <p className="tn-small">{noSensor ? 'Este aparato no manda movimiento: usá el botón.' : 'Agarrá el celular como una raqueta y hacé el golpe de tenis justo cuando la pelota llega a tu jugador. Si te adelantás se te abre, si llegás tarde va a la red, y un golpecito flojo queda corto.'}</p>
        </>
      )}
      {error && <p className="tn-error" role="alert">{error}</p>}
      <button type="button" className="tf-btn tf-btn-soft tn-leave" onClick={onLeave}>Desconectar</button>
    </div>
  );
}
