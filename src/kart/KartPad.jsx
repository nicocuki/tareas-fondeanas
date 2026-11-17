// Fondo Kart: el celular como volante. Se usa acostado (horizontal) y tiene dos modos, que se eligen acá mismo:
//   - Joystick: el pulgar izquierdo mueve una palanca para doblar; a la derecha, ACELERAR (grande), DERRAPAR, ÍTEM, FRENO y
//     ATRÁS (mantenido: mira para atrás y el ítem sale para atrás).
//   - Inclinar: se agarra como un volante y se dobla girándolo; DERRAPAR queda bajo el pulgar izquierdo y ACELERAR bajo el
//     derecho, con ÍTEM y FRENO arriba.
// Manda lo que apretás 30 veces por segundo a su compu, directo (WebRTC por kartpad/{sala}/{compu}) o por el servidor si no
// se puede. El ítem viaja como un contador (`i`): si un mensaje se pierde, el siguiente igual lo trae.
//
// El giro del modo inclinar: se mira hacia dónde queda «arriba» (la gravedad) en el plano de la pantalla. Girar el celular
// para la derecha mueve ese ángulo siempre para el mismo lado, en Android y en iPhone; se calibra al activar.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { createMesh } from '../futbol/p2p.js';
import { ITEMS } from './sim.js';

const SEND_MS = 33;
const SERVER_MS = 70;
const TILT_MAX = 32 * (Math.PI / 180); // grados de giro para doblar a fondo
const MT_TEXT = ['', 'Turbo azul', 'Turbo naranja', '¡Violeta!'];
const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin guardar */ } } };

export default function KartPad({ code, screenId, playerId, name, children, onLeave }) {
  const [mode, setMode] = useState(() => store.get('tf:kart:volante', 'joystick'));
  const [auto, setAuto] = useState(() => store.get('tf:kart:solo', '0') === '1');
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState(null); // lo que dice la compu: { pos, lap, item, n, done, mt }
  const [linked, setLinked] = useState(false);
  const [tiltView, setTiltView] = useState(0);
  const [portrait, setPortrait] = useState(() => typeof window !== 'undefined' && window.innerHeight > window.innerWidth);
  const s = useRef({ s: 0, a: false, b: false, d: false, r: false, i: 0, rest: null, angle: 0, lastHit: 0, gotAt: 0 }).current;
  s.mode = mode; s.auto = auto;
  const padId = useRef(`pad-${playerId}-${Math.random().toString(36).slice(2, 7)}`).current;

  useEffect(() => {
    const onResize = () => setPortrait(window.innerHeight > window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ─── Red ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.kartPadChannel(code, screenId);
    const onMsg = (from, raw) => {
      if (from !== screenId || !raw) return;
      let m = raw;
      if (typeof raw === 'string') { try { m = JSON.parse(raw); } catch { return; } }
      const mine = m.all ? m.all[playerId] : m.to === playerId ? m : null;
      if (!mine) return;
      s.gotAt = Date.now();
      if (mine.hit && mine.hit !== s.lastHit) { if (s.lastHit) navigator.vibrate?.([60, 40, 120]); s.lastHit = mine.hit; }
      setState(mine);
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: padId, onMessage: onMsg });
    const off = chan.subscribe(onMsg);
    chan.leaveOnDisconnect(padId).catch(() => {});
    let serverAt = 0;
    const timer = setInterval(() => {
      const msg = { p: playerId, s: +s.s.toFixed(2), a: s.a || s.auto, b: s.b, d: s.d, r: s.r, i: s.i };
      mesh?.broadcast(msg);
      const now = Date.now();
      const direct = mesh?.isOpen(screenId);
      setLinked(direct ? 'directo' : now - s.gotAt < 2000 ? 'servidor' : false);
      if (!direct && now - serverAt > SERVER_MS) { serverAt = now; chan.publish(padId, JSON.stringify(msg)).catch(() => {}); }
    }, SEND_MS);
    return () => { clearInterval(timer); off(); mesh?.close(); chan.remove(padId).catch(() => {}); };
  }, [code, screenId, playerId, padId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Inclinar ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!armed) return undefined;
    const onMotion = (e) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x == null) return;
      const a = Math.atan2(g.y, g.x);
      if (s.rest == null) s.rest = a;
      let d = a - s.rest;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      s.angle = d;
      if (s.mode === 'tilt') {
        const v = Math.max(-1, Math.min(1, d / TILT_MAX));
        s.s = Math.abs(v) < 0.06 ? 0 : v;
      }
    };
    window.addEventListener('devicemotion', onMotion);
    const view = setInterval(() => setTiltView(s.s), 60);
    return () => { window.removeEventListener('devicemotion', onMotion); clearInterval(view); };
  }, [armed]); // eslint-disable-line react-hooks/exhaustive-deps

  async function arm() {
    try { await document.documentElement.requestFullscreen?.(); } catch { /* no siempre se puede */ }
    try { await window.screen?.orientation?.lock?.('landscape'); } catch { /* iPhone no deja */ }
    try { if (typeof window.DeviceMotionEvent?.requestPermission === 'function') await window.DeviceMotionEvent.requestPermission(); } catch { /* sin sensores: queda el joystick */ }
    s.rest = null;
    setArmed(true);
  }
  function pickMode(m) { setMode(m); store.set('tf:kart:volante', m); s.s = 0; s.rest = null; }

  const capture = (e) => { try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* el dedo ya se fue */ } };
  // Botón que se mantiene apretado (con varios dedos a la vez: pointer events por botón).
  const hold = (key) => ({
    onPointerDown: (e) => { e.preventDefault(); s[key] = true; capture(e); navigator.vibrate?.(8); },
    onPointerUp: () => { s[key] = false; },
    onPointerCancel: () => { s[key] = false; },
    onContextMenu: (e) => e.preventDefault(),
  });
  const item = { onPointerDown: (e) => { e.preventDefault(); s.i += 1; navigator.vibrate?.(15); }, onContextMenu: (e) => e.preventDefault() };

  // Joystick: arrastre horizontal desde donde apoyás el dedo.
  const stick = useRef({ id: null, x0: 0 });
  const [knob, setKnob] = useState(0);
  const joy = {
    onPointerDown: (e) => { e.preventDefault(); stick.current = { id: e.pointerId, x0: e.clientX }; capture(e); },
    onPointerMove: (e) => {
      if (stick.current.id !== e.pointerId) return;
      const v = Math.max(-1, Math.min(1, (e.clientX - stick.current.x0) / 70));
      s.s = Math.abs(v) < 0.08 ? 0 : v; setKnob(v);
    },
    onPointerUp: () => { stick.current.id = null; s.s = 0; setKnob(0); },
    onPointerCancel: () => { stick.current.id = null; s.s = 0; setKnob(0); },
  };

  const info = state && (
    <div className="kp-info">
      <b data-pad-pos>{state.done ? '🏁 ' : ''}{state.pos}°</b>
      <span>Vuelta {state.lap}/3</span>
      <span className="kp-item">{state.item === '?' ? '🎲' : state.item ? ITEMS[state.item]?.icon : '—'}{state.n > 1 ? `×${state.n}` : ''}</span>
      {state.mt > 0 && <span className={`kp-mt is-${state.mt}`}>{MT_TEXT[state.mt]}</span>}
    </div>
  );

  if (!armed) {
    return (
      <div className="kp-root kp-setup" data-kart-pad>
        <p className="kp-title">🏎️ Volante de <b>{name}</b> · sala {code}</p>
        {children}
        <div className="kp-modes" role="group" aria-label="Cómo manejar">
          <button type="button" className={mode === 'joystick' ? 'is-on' : ''} onClick={() => pickMode('joystick')} data-pad-mode="joystick">🕹️ Joystick</button>
          <button type="button" className={mode === 'tilt' ? 'is-on' : ''} onClick={() => pickMode('tilt')} data-pad-mode="tilt">🔄 Inclinar como volante</button>
        </div>
        <label className="kp-check"><input type="checkbox" checked={auto} onChange={(e) => { setAuto(e.target.checked); store.set('tf:kart:solo', e.target.checked ? '1' : '0'); }} /> Acelerar solo</label>
        <button type="button" className="kp-arm" onClick={arm} data-pad-arm>Tocá para usar el volante</button>
        <p className="kp-small">Usalo acostado (horizontal). En iPhone el navegador pide permiso para los sensores la primera vez.</p>
        <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Salir</button>
      </div>
    );
  }
  return (
    <div className={`kp-root kp-play is-${mode}`} data-kart-pad data-mode={mode}>
      {portrait && <div className="kp-rotate">📱↻ Girá el celular para manejar acostado</div>}
      <div className="kp-top">
        <button type="button" className="kp-small-btn kp-gear" onClick={() => setArmed(false)}>⚙️</button>
        {info || <span className="kp-wait">{linked ? 'Conectado a la compu' : 'Buscando la compu…'}</span>}
        <span className={`kp-link${linked ? ' is-on' : ''}`} title={linked ? `Conexión ${linked}` : 'Sin conexión'} />
        {mode === 'tilt' && <button type="button" className="kp-small-btn kp-center" onClick={() => { s.rest = null; }}>Centrar</button>}
      </div>
      {mode === 'joystick' ? (
        <>
          <div className="kp-joy" {...joy} data-pad-joy><div className="kp-joy-base"><i style={{ transform: `translateX(${knob * 60}px)` }} /></div><span>◀ doblar ▶</span></div>
          <div className="kp-right">
            <button type="button" className="kp-btn kp-item-btn" {...item} data-pad="item">ÍTEM</button>
            <div className="kp-pair">
              <button type="button" className="kp-btn kp-brake" {...hold('b')} data-pad="brake">FRENO</button>
              <button type="button" className="kp-btn kp-rear" {...hold('r')} data-pad="rear">👀 ATRÁS</button>
            </div>
            <button type="button" className="kp-btn kp-drift" {...hold('d')} data-pad="drift">DERRAPAR</button>
            <button type="button" className="kp-btn kp-gas" {...hold('a')} data-pad="gas">ACELERAR</button>
          </div>
        </>
      ) : (
        <>
          <button type="button" className="kp-btn kp-drift kp-tilt-left" {...hold('d')} data-pad="drift">DERRAPAR</button>
          <div className="kp-wheel" style={{ transform: `rotate(${tiltView * 90}deg)` }}><i /></div>
          <div className="kp-tilt-right">
            <button type="button" className="kp-btn kp-item-btn" {...item} data-pad="item">ÍTEM</button>
            <div className="kp-pair">
              <button type="button" className="kp-btn kp-brake" {...hold('b')} data-pad="brake">FRENO</button>
              <button type="button" className="kp-btn kp-rear" {...hold('r')} data-pad="rear">👀 ATRÁS</button>
            </div>
            <button type="button" className="kp-btn kp-gas" {...hold('a')} data-pad="gas">ACELERAR</button>
          </div>
        </>
      )}
    </div>
  );
}
