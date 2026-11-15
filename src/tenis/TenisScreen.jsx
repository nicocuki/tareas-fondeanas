// Tenis Movido: la compu. Muestra la cancha, el QR para conectar los celulares, recibe los golpes y simula la pelota.
// Los golpes llegan directo del celular (WebRTC) o, si no se puede, por el servidor (tenis/{sala}/p/{id}); cada uno
// trae un número `k` y se usa una sola vez. Al pegarle, la compu le avisa al celular (`hit`) para que vibre.
import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { COLORS, playerAt, pointText, startProblem } from './game.js';
import { STEP, SWING_WINDOW, canReach, hitBall, newRally, stepRally } from './sim.js';

const POINT_PAUSE = 1.6;   // segundos entre que se define el punto y el saque siguiente
const SWING_ANIM = 0.3;
const WHY = { red: 'a la red', afuera: 'afuera', 'pique propio': 'picó de su lado', 'doble pique': 'doble pique', 'no llegó': 'no llegó' };

export function controlUrl(code) {
  return `${window.location.origin}/?juego=tenis&control=${code}`;
}

export default function TenisScreen({ room, me, code, onDispatch, onLeave }) {
  const canvasRef = useRef(null);
  const roomRef = useRef(room);
  const dispatchRef = useRef(onDispatch);
  roomRef.current = room;
  dispatchRef.current = onDispatch;
  const [qr, setQr] = useState('');
  const [hud, setHud] = useState({ loading: true, msg: '', last: [null, null] });
  const sim = useRef({ seen: new Set(), pending: [null, null], swingAt: [-9, -9], lastSwing: [null, null], rally: null, overAt: 0, sentPoint: -1, cpuAt: 0, msg: '', msgAt: 0 }).current;
  const playing = room.phase === 'playing';

  useEffect(() => { QRCode.toDataURL(controlUrl(code), { margin: 1, width: 360 }).then(setQr).catch(() => setQr('')); }, [code]);

  useEffect(() => {
    let dead = false;
    import('./render.js').then((mod) => {
      if (dead || !canvasRef.current) return;
      sim.r = mod.createRenderer(canvasRef.current);
      setHud((h) => ({ ...h, loading: false }));
    });
    return () => { dead = true; sim.r?.dispose(); sim.r = null; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cada partido nuevo arranca con el saque del lado que le toca.
  useEffect(() => {
    if (!playing) return;
    sim.rally = newRally(roomRef.current.score.server);
    sim.overAt = 0; sim.sentPoint = -1;
  }, [room.n, playing]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Red: los golpes de los celulares ─────────────────────────────────────
  useEffect(() => {
    const chan = backend.tenisChannel(code);
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      const pl = roomRef.current.players.find((p) => p.id === id);
      if (!pl) return;
      for (const sw of snap.sw || []) {
        const key = `${id}:${sw.k}`;
        if (sim.seen.has(key)) continue;
        sim.seen.add(key);
        sim.pending[pl.slot] = { at: performance.now() / 1000, f: sw.f, a: sw.a, k: sw.k, id };
        sim.swingAt[pl.slot] = performance.now() / 1000;
        sim.lastSwing[pl.slot] = sw.f;
      }
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    sim.mesh = mesh; sim.chan = chan;
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); sim.mesh = null; sim.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Le avisa al celular que le pegó (para que vibre).
  function ack(id, k) {
    const msg = { hit: k, to: id, t: Date.now() };
    sim.mesh?.broadcast(msg);
    sim.chan?.publish(me.id, JSON.stringify(msg)).catch(() => {});
  }

  // Para probar en la compu sin celular: Espacio le pega con el lado cercano y K con el de enfrente.
  useEffect(() => {
    const down = (e) => {
      if (e.target instanceof HTMLInputElement || e.repeat) return;
      const slot = e.code === 'Space' ? 0 : e.code === 'KeyK' ? 1 : -1;
      if (slot < 0) return;
      e.preventDefault();
      sim.pending[slot] = { at: performance.now() / 1000, f: 0.6, a: (Math.random() - 0.5) * 1.6, k: -1 };
      sim.swingAt[slot] = performance.now() / 1000;
      sim.lastSwing[slot] = 0.6;
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Un cuadro ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let last = performance.now() / 1000, acc = 0, hudAt = 0;
    function frame({ hidden } = {}) {
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - last);
      last = t;
      const r = roomRef.current;
      if (!sim.rally) sim.rally = newRally(r.score?.server || 0);
      const rally = sim.rally;
      if (r.phase === 'playing') {
        acc += dt;
        let guard = 0;
        while (acc >= STEP && guard++ < 20) {
          acc -= STEP;
          for (const side of [0, 1]) {
            const human = playerAt(r, side);
            if (human) {
              const sw = sim.pending[side];
              if (sw && t - sw.at < SWING_WINDOW && canReach(rally, side)) {
                hitBall(rally, side, sw.f, sw.a);
                sim.pending[side] = null;
                if (sw.id) ack(sw.id, sw.k);
              } else if (sw && t - sw.at >= SWING_WINDOW) sim.pending[side] = null;
            } else if (canReach(rally, side)) {
              // La máquina: le pega con un poco de demora y a veces la erra.
              if (!sim.cpuAt) sim.cpuAt = t + 0.08 + Math.random() * 0.15;
              if (t >= sim.cpuAt) { sim.cpuAt = 0; if (rally.serving || Math.random() > 0.12) { hitBall(rally, side, 0.35 + Math.random() * 0.4, (Math.random() - 0.5) * 1.8); sim.swingAt[side] = t; } }
            }
          }
          const over = stepRally(rally);
          if (over && !sim.overAt) {
            sim.overAt = t;
            const name = playerAt(r, over.winner)?.name || 'la máquina';
            sim.msg = `Punto para ${name} (${WHY[over.why] || over.why})`; sim.msgAt = t;
          }
        }
        if (acc > 1) acc = 0;
        // Se anota el punto y se vuelve a sacar.
        if (sim.overAt && t - sim.overAt > POINT_PAUSE && sim.sentPoint !== (r.score.k || 0)) {
          sim.sentPoint = r.score.k || 0;
          dispatchRef.current({ type: 'point', n: r.n, side: rally.over.winner, k: r.score.k || 0 });
        }
      }
      if (!hidden && sim.r) sim.r.draw({ rally, swing: [0, 1].map((s) => Math.max(0, 1 - (t - sim.swingAt[s]) / SWING_ANIM)) });
      if (t - hudAt > 0.15) {
        hudAt = t;
        setHud({ loading: !sim.r, msg: t - sim.msgAt < 2.5 ? sim.msg : '', last: [...sim.lastSwing], serving: rally.serving ? rally.last : -1 });
      }
    }
    const stop = everyFrame(frame);
    window.__tenis = sim; // para manejar la cancha desde un navegador automatizado
    return () => { stop(); if (window.__tenis === sim) delete window.__tenis; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Cuando la sala anota el punto, saque nuevo.
  useEffect(() => {
    if (!playing || !sim.overAt) return;
    sim.rally = newRally(room.score.server);
    sim.overAt = 0; sim.cpuAt = 0; sim.pending = [null, null];
  }, [room.score?.k]); // eslint-disable-line react-hooks/exhaustive-deps

  const problem = startProblem(room);
  const nameAt = (s) => playerAt(room, s)?.name || 'Máquina';
  return (
    <div className="tn-stage" data-tenis-screen>
      <canvas ref={canvasRef} className="tn-canvas" data-tenis-canvas />
      <div className="tn-score" data-score>
        <span style={{ color: COLORS[0] }}>{nameAt(0)} <b>{room.score.g[0]}</b></span>
        <em>{pointText(room.score)}</em>
        <span style={{ color: COLORS[1] }}><b>{room.score.g[1]}</b> {nameAt(1)}</span>
      </div>
      {hud.msg && <div className="tn-msg">{hud.msg}</div>}
      {playing && hud.serving >= 0 && <div className="tn-hint">Saca {nameAt(hud.serving)}: {playerAt(room, hud.serving) ? '¡hacé el gesto del golpe con el celular!' : 'ya va…'}</div>}

      {room.phase !== 'playing' && (
        <div className="tn-panel" data-panel>
          {room.phase === 'final' && <h2 className="tn-win">🏆 ¡Ganó {nameAt(room.winner)}!</h2>}
          <h2>Conectá los celulares</h2>
          <div className="tn-connect">
            {qr ? <img src={qr} alt="QR para conectar el celular" className="tn-qr" data-qr /> : <div className="tn-qr" />}
            <div>
              <p>Escaneá el QR con la cámara del celular, o entrá a <b>{window.location.host}</b> y escribí el código:</p>
              <p className="tn-code" data-code>{code}</p>
              <ul className="tn-slots">
                {[0, 1].map((s) => <li key={s} style={{ borderColor: COLORS[s] }} data-slot={s}>{s === 0 ? 'Cerca' : 'Enfrente'}: {playerAt(room, s) ? <b>📱 {playerAt(room, s).name}</b> : <em>{s === 1 ? 'juega la máquina' : 'esperando…'}</em>}</li>)}
              </ul>
            </div>
          </div>
          <p className="tn-small">Con el celular en la mano como una raqueta, hacé el gesto de pegarle cuando la pelota llega. Para probar sin celular: <kbd>Espacio</kbd> le pega el de cerca y <kbd>K</kbd> el de enfrente.</p>
          <div className="tn-actions">
            <button type="button" className="tf-btn tf-btn-primary" disabled={Boolean(problem)} onClick={() => onDispatch({ type: 'start' })} data-start>🎾 {room.phase === 'final' ? 'Otro partido' : '¡A jugar!'}</button>
            <button type="button" className="tf-btn tf-btn-soft" onClick={onLeave}>Cerrar la cancha</button>
          </div>
          {problem && <p className="tn-small">{problem}</p>}
        </div>
      )}
      {playing && <button type="button" className="tn-corner tf-btn tf-btn-soft" onClick={() => onDispatch({ type: 'toLobby' })}>Pausa / QR</button>}
    </div>
  );
}
