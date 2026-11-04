// La bandeja de dados: cada tirada se ve como en la mesa. Los dados rojos (ataque) y blancos (defensa) entran rodando por una bandeja
// de paño, rebotan en los bordes y entre ellos, y siguen girando un rato mientras uno espera el resultado. Cuando se frenan, se
// acomodan enfrentados de mayor a menor y se marca quién gana cada pareja. Es solo dibujo: la sala ya tiene los dados (`room.last`).
// La física va con `everyFrame` (sigue andando con la pestaña de fondo) y escribe directo en el DOM, sin re-renderizar por cuadro.
import React, { useEffect, useRef, useState } from 'react';
import { backgroundTimeout, everyFrame } from '../ticker.js';
import { COUNTRIES } from './board.js';

// Hacia dónde hay que girar el cubo para que `v` quede de cara (rotateX, rotateY).
const FACE_TURN = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const FACES = [1, 2, 3, 4, 5, 6];

export function Cube({ kind }) {
  return (
    <div className={`tg-cube is-${kind}`}>
      {FACES.map((v) => (
        <div key={v} className={`tg-face f${v}`}>
          {Array.from({ length: 9 }, (_, i) => <i key={i} className={PIPS[v].includes(i) ? 'on' : ''} />)}
        </div>
      ))}
    </div>
  );
}

const nearest = (target, current) => target + 360 * Math.round((current - target) / 360); // la vuelta más corta hasta el mismo ángulo
const rand = (a, b) => a + Math.random() * (b - a);
const ROLL_MIN = 2300; // cuánto ruedan como mínimo
const ROLL_SPREAD = 1100; // y cuánto más puede tardar cada dado (suspenso: no se frenan todos juntos)
const RESULT_MS = 2600;

export default function DiceTray({ last, names, onDone }) {
  const tray = useRef(null);
  const els = useRef([]); // [{ wrap, cube, shadow }]
  const [phase, setPhase] = useState('roll'); // roll → sort → result
  const [boxSize, setBoxSize] = useState(0);
  const dice = useRef([]);
  const done = useRef(onDone);
  done.current = onDone;
  const all = useRef([...last.a.map((v) => ({ v, side: 'a' })), ...last.d.map((v) => ({ v, side: 'd' }))]);
  const skipNow = useRef(false);

  useEffect(() => {
    const box = tray.current;
    const W = box.clientWidth;
    const H = box.clientHeight;
    const s = Math.max(46, Math.min(86, Math.min(W, H) * 0.2));
    setBoxSize(s);
    const half = s / 2;
    const rows = Math.max(last.a.length, last.d.length);
    // La mesa: cada dado arranca fuera de la bandeja, del lado de su bando, con un envión hacia adentro.
    dice.current = all.current.map((d, i) => {
      const left = d.side === 'a';
      const idx = d.side === 'a' ? i : i - last.a.length;
      const row = Math.min(rows - 1, idx);
      return {
        ...d, idx,
        x: left ? -half : W + half, y: H * (0.25 + 0.5 * Math.random()),
        vx: (left ? 1 : -1) * rand(620, 980), vy: rand(-380, 380),
        z: rand(40, 120), vz: rand(0, 200),
        rx: rand(0, 360), ry: rand(0, 360), rz: rand(0, 360),
        wx: rand(500, 900) * (Math.random() < 0.5 ? -1 : 1), wy: rand(500, 900) * (Math.random() < 0.5 ? -1 : 1), wz: rand(-300, 300),
        end: ROLL_MIN + Math.random() * ROLL_SPREAD, settled: false,
        tx: W * (left ? 0.3 : 0.7), ty: H * (0.5 + (row - (rows - 1) / 2) * 0.27),
      };
    });
    let t = 0;
    let last_ = performance.now();
    let settledAll = 0;
    let sorted = false;

    const paint = (d, e) => {
      e.wrap.style.transform = `translate(${(d.x - half).toFixed(1)}px, ${(d.y - half - d.z * 0.35).toFixed(1)}px) scale(${(1 + d.z / 420).toFixed(3)})`;
      e.cube.style.transform = `rotateX(${d.rx.toFixed(1)}deg) rotateY(${d.ry.toFixed(1)}deg) rotateZ(${d.rz.toFixed(1)}deg)`;
      e.shadow.style.transform = `translate(${(d.x - half * 0.9 + d.z * 0.12).toFixed(1)}px, ${(d.y + half * 0.45).toFixed(1)}px) scale(${(1 + d.z / 260).toFixed(3)})`;
      e.shadow.style.opacity = String(Math.max(0.15, 0.55 - d.z / 380));
    };
    const settle = (d, e) => {
      d.settled = true;
      d.vx = 0; d.vy = 0; d.z = 0; d.vz = 0;
      const [fx, fy] = FACE_TURN[d.v];
      d.rx = nearest(fx, d.rx); d.ry = nearest(fy, d.ry); d.rz = nearest(Math.round(rand(-18, 18)), d.rz);
      e.cube.style.transition = 'transform 0.5s cubic-bezier(0.2, 0.9, 0.3, 1.2)';
      e.wrap.style.transition = 'transform 0.35s ease-out';
      paint(d, e);
      settledAll += 1;
    };
    const sortOut = () => {
      sorted = true;
      for (const [i, d] of dice.current.entries()) {
        const e = els.current[i];
        d.x = d.tx; d.y = d.ty; d.z = 0;
        e.wrap.style.transition = 'transform 0.8s cubic-bezier(0.3, 0.8, 0.2, 1)';
        e.shadow.style.transition = 'transform 0.8s cubic-bezier(0.3, 0.8, 0.2, 1)';
        d.rz = nearest(0, d.rz);
        e.cube.style.transition = 'transform 0.8s ease-out';
        paint(d, e);
      }
      setPhase('sort');
      backgroundTimeout(() => setPhase('result'), 950);
    };

    const stop = everyFrame(() => {
      const now = performance.now();
      const dt = Math.min(0.033, (now - last_) / 1000);
      t += (now - last_);
      last_ = now;
      if (sorted) return;
      if (skipNow.current) {
        for (const [i, d] of dice.current.entries()) if (!d.settled) { d.x = d.tx; d.y = d.ty; settle(d, els.current[i]); }
      }
      for (const [i, d] of dice.current.entries()) {
        const e = els.current[i];
        if (!e || d.settled) continue;
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.vz -= 2600 * dt; d.z += d.vz * dt;
        if (d.z < 0) { d.z = 0; d.vz = Math.abs(d.vz) > 160 ? -d.vz * 0.5 : 0; if (d.vz) { d.wx *= 0.9; d.wy *= 0.9; } }
        const r = half * 0.95;
        if (d.x < r && d.vx < 0 && d.x > 0) { d.x = r; d.vx = -d.vx * 0.7; d.wz = rand(-400, 400); }
        if (d.x > W - r && d.vx > 0 && d.x < W) { d.x = W - r; d.vx = -d.vx * 0.7; d.wz = rand(-400, 400); }
        if (d.y < r) { d.y = r; d.vy = Math.abs(d.vy) * 0.7; }
        if (d.y > H - r) { d.y = H - r; d.vy = -Math.abs(d.vy) * 0.7; }
        const damp = Math.exp(-(d.z > 0 ? 0.35 : 1.5) * dt);
        d.vx *= damp; d.vy *= damp;
        const spin = Math.exp(-1.15 * dt);
        d.wx *= spin; d.wy *= spin; d.wz *= spin;
        d.rx += d.wx * dt; d.ry += d.wy * dt; d.rz += d.wz * dt;
      }
      // choques entre dados
      const list = dice.current;
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const A = list[i];
          const B = list[j];
          if (A.settled && B.settled) continue;
          const dx = B.x - A.x;
          const dy = B.y - A.y;
          const dist = Math.hypot(dx, dy) || 1;
          if (dist < s * 0.92) {
            const nx = dx / dist;
            const ny = dy / dist;
            const push = (s * 0.92 - dist) / 2;
            if (!A.settled) { A.x -= nx * push; A.y -= ny * push; }
            if (!B.settled) { B.x += nx * push; B.y += ny * push; }
            const va = A.vx * nx + A.vy * ny;
            const vb = B.vx * nx + B.vy * ny;
            if (!A.settled) { A.vx += (vb - va) * nx * 0.85; A.vy += (vb - va) * ny * 0.85; A.wx += rand(-200, 200); A.wy += rand(-200, 200); }
            if (!B.settled) { B.vx += (va - vb) * nx * 0.85; B.vy += (va - vb) * ny * 0.85; B.wx += rand(-200, 200); B.wy += rand(-200, 200); }
          }
        }
      }
      for (const [i, d] of dice.current.entries()) {
        const e = els.current[i];
        if (!e || d.settled) continue;
        const slow = Math.hypot(d.vx, d.vy) < 90 && d.z < 2;
        if ((t > d.end && slow) || t > d.end + 1500) settle(d, e);
        else paint(d, e);
      }
      // todos quietos: un instante de suspenso y se acomodan
      if (!sorted && settledAll === dice.current.length) {
        sorted = true;
        backgroundTimeout(() => { sorted = false; sortOut(); }, skipNow.current ? 60 : 650);
      }
    });
    return stop;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'result') return undefined;
    return backgroundTimeout(() => done.current(), RESULT_MS);
  }, [phase]);

  const rows = Math.max(last.a.length, last.d.length);
  const pairWin = (k) => (last.a[k] !== undefined && last.d[k] !== undefined ? last.a[k] > last.d[k] : undefined);
  const from = COUNTRIES[last.f].name;
  const to = COUNTRIES[last.t].name;
  return (
    <div className="tg-battle" role="dialog" aria-modal="true" aria-label="Los dados" data-battle={phase}>
      <div className="tg-battle-card">
        <header>
          <span className="tg-badge atk">⚔️ {names.att}</span>
          <b>{from} ➜ {to}</b>
          <span className="tg-badge def">🛡️ {names.def}</span>
        </header>
        <div className="tg-tray" ref={tray} style={{ '--s': `${boxSize}px` }}>
          <div className="tg-felt-label l">ATAQUE</div>
          <div className="tg-felt-label r">DEFENSA</div>
          {all.current.map((d, i) => {
            const k = d.side === 'a' ? i : i - last.a.length;
            const win = phase === 'result' ? pairWin(k) : undefined;
            const res = win === undefined ? '' : (d.side === 'a' ? win : !win) ? ' is-win' : ' is-lose';
            return (
              <React.Fragment key={i}>
                <div className="tg-die-shadow" ref={(el) => { els.current[i] = { ...(els.current[i] || {}), shadow: el }; }} />
                <div className={`tg-die3${res}`} ref={(el) => { els.current[i] = { ...(els.current[i] || {}), wrap: el, cube: el?.firstChild }; }}>
                  <Cube kind={d.side === 'a' ? 'atk' : 'def'} />
                </div>
              </React.Fragment>
            );
          })}
          {phase === 'result' && Array.from({ length: rows }, (_, k) => (
            <span key={k} className={`tg-vsmark${pairWin(k) === undefined ? ' is-none' : pairWin(k) ? ' is-atk' : ' is-def'}`} style={{ top: `${50 + (k - (rows - 1) / 2) * 27}%` }}>
              {pairWin(k) === undefined ? '' : pairWin(k) ? '◀ gana el ataque' : 'gana la defensa ▶'}
            </span>
          ))}
        </div>
        <footer>
          {phase !== 'result'
            ? <p className="tg-suspense" aria-live="polite">{phase === 'roll' ? '🎲 Ruedan los dados…' : 'Se acomodan de mayor a menor…'}</p>
            : (
              <p className="tg-verdict" aria-live="polite" data-verdict>
                {last.rounds > 1 ? `${last.rounds} tiradas seguidas. ` : ''}
                <b className="atk">{names.att} pierde {last.rounds > 1 ? last.tl : last.al}</b> · <b className="def">{names.def} pierde {last.rounds > 1 ? last.td : last.dl}</b>
                {last.won ? ' · 🚩 ¡Territorio conquistado!' : ''}
              </p>
            )}
          {phase !== 'result' && <button type="button" className="tg-link" data-act="skipDice" onClick={() => { skipNow.current = true; }}>Saltar</button>}
          {phase === 'result' && <button type="button" className="tg-link" data-act="closeDice" onClick={() => done.current()}>Seguir</button>}
        </footer>
      </div>
    </div>
  );
}

// Muestra la bandeja cada vez que sale una tirada nueva (todos la ven). Devuelve la tirada que se está mostrando (o null) y cierra
// con `finish`: sirve para que las ventanas de ataque y conquista esperen a que termine.
export function useBattle(room) {
  const [seen, setSeen] = useState(room.rollN); // al entrar no rueda una batalla vieja
  const showing = room.rollN !== seen && room.last && room.last.n === room.rollN ? room.last : null;
  useEffect(() => { if (room.rollN !== seen && !showing) setSeen(room.rollN); }, [room.rollN, seen, showing]);
  return { showing, finish: () => setSeen(room.rollN) };
}
