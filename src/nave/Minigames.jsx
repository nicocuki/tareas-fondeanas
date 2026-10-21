// Los minijuegos de las tareas, como en The Skeld. Cada uno recibe `onDone` y lo llama una sola vez
// cuando se terminó; cerrar la ventana antes no cuenta. Todo es de pantalla: la sala solo se entera
// del paso hecho (acción `task` del reducer).
import React, { useEffect, useMemo, useRef, useState } from 'react';

const rnd = (n) => Math.floor(Math.random() * n);
function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// Llama a `onDone` una sola vez, con un respiro para que se vea que quedó bien.
function useFinish(onDone, delay = 450) {
  const done = useRef(false);
  return () => {
    if (done.current) return;
    done.current = true;
    setTimeout(onDone, delay);
  };
}

// Sigue al puntero aunque salga del elemento. Si el puntero ya no está activo, el navegador tira
// error: se ignora (el arrastre sigue igual mientras esté adentro).
export function capture(el, e) {
  try { el?.setPointerCapture(e.pointerId); } catch { /* puntero que ya no está */ }
}

// Posición del puntero dentro de un elemento, de 0 a 1.
function relative(e, el) {
  const r = el.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
}

// Un botón que hay que mantener apretado `ms` milisegundos.
function HoldButton({ label, ms, onDone, color = '#4caf50' }) {
  const [p, setP] = useState(0);
  const holding = useRef(false);
  const finish = useFinish(onDone);
  useEffect(() => {
    let raf = 0, last = performance.now();
    const loop = (t) => {
      const dt = t - last; last = t;
      setP((v) => {
        const nv = holding.current ? Math.min(1, v + dt / ms) : Math.max(0, v - dt / (ms * 2));
        if (nv >= 1) finish();
        return nv;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nv-hold">
      <div className="nv-gauge"><i style={{ height: `${p * 100}%`, background: color }} /></div>
      <button
        type="button"
        className="nv-big-btn"
        onPointerDown={(e) => { holding.current = true; capture(e.currentTarget, e); }}
        onPointerUp={() => { holding.current = false; }}
        onPointerCancel={() => { holding.current = false; }}
      >{label}</button>
    </div>
  );
}

// ─── Arreglar cables ─────────────────────────────────────────────────────────
const WIRE_COLORS = ['#e53935', '#1e88e5', '#fdd835', '#d81b60'];
function Wires({ onDone }) {
  const left = useMemo(() => shuffle([0, 1, 2, 3]), []);
  const right = useMemo(() => shuffle([0, 1, 2, 3]), []);
  const [links, setLinks] = useState({});
  const [drag, setDrag] = useState(null); // { c, x, y }
  const box = useRef(null);
  const finish = useFinish(onDone);
  const yOf = (i) => 0.16 + i * 0.23;
  function up(e) {
    if (!drag) return;
    const p = relative(e, box.current);
    const i = right.findIndex((_, k) => Math.abs(p.y - yOf(k)) < 0.09);
    if (p.x > 0.8 && i >= 0 && right[i] === drag.c) {
      const next = { ...links, [drag.c]: i };
      setLinks(next);
      if (Object.keys(next).length === 4) finish();
    }
    setDrag(null);
  }
  return (
    <svg ref={box} className="nv-mg-svg" viewBox="0 0 1 1" preserveAspectRatio="none"
      onPointerMove={(e) => drag && setDrag({ ...drag, ...relative(e, box.current) })} onPointerUp={up}>
      <rect x="0" y="0" width="1" height="1" fill="#2a2f3a" />
      {left.map((c, i) => links[c] !== undefined && (
        <line key={`l${c}`} x1="0.08" y1={yOf(i)} x2="0.92" y2={yOf(links[c])} stroke={WIRE_COLORS[c]} strokeWidth="0.035" vectorEffect="none" />
      ))}
      {drag && <line x1="0.08" y1={yOf(left.indexOf(drag.c))} x2={drag.x} y2={drag.y} stroke={WIRE_COLORS[drag.c]} strokeWidth="0.035" />}
      {left.map((c, i) => (
        <rect key={c} x="0.02" y={yOf(i) - 0.04} width="0.08" height="0.08" fill={WIRE_COLORS[c]} style={{ cursor: 'grab' }}
          onPointerDown={(e) => { if (links[c] === undefined) { capture(e.currentTarget.ownerSVGElement, e); setDrag({ c, ...relative(e, box.current) }); } }} />
      ))}
      {right.map((c, i) => <rect key={c} x="0.9" y={yOf(i) - 0.04} width="0.08" height="0.08" fill={WIRE_COLORS[c]} />)}
    </svg>
  );
}

// ─── Pasar la tarjeta ────────────────────────────────────────────────────────
function Card({ onDone }) {
  const [x, setX] = useState(0);
  const [msg, setMsg] = useState('Arrastrá la tarjeta por el lector, ni muy rápido ni muy lento.');
  const start = useRef(null);
  const box = useRef(null);
  const finish = useFinish(onDone, 700);
  return (
    <div className="nv-card-reader" ref={box}
      // La tarjeta recorre el 75 % del ancho: x = 1 es la tarjeta al final del lector.
      onPointerMove={(e) => { if (start.current) setX(Math.max(0, Math.min(1, start.current.x0 + (relative(e, box.current).x - start.current.px) / 0.75))); }}
      onPointerUp={() => {
        if (!start.current) return;
        const t = (performance.now() - start.current.t) / 1000;
        if (x < 0.95) setMsg('Mala lectura. Probá de nuevo.');
        else if (t < 0.5) setMsg('Muy rápido. Probá de nuevo.');
        else if (t > 1.4) setMsg('Muy lento. Probá de nuevo.');
        else { setMsg('Aceptada. ¡Gracias!'); finish(); }
        start.current = null;
        if (x < 0.95 || t < 0.5 || t > 1.4) setX(0);
      }}>
      <div className="nv-card-screen">{msg}</div>
      <div className="nv-card-slot" />
      <div className="nv-swipe-card" style={{ left: `${x * 75}%` }}
        onPointerDown={(e) => { capture(e.currentTarget.parentElement, e); start.current = { t: performance.now(), px: relative(e, box.current).x, x0: x }; }}>
        💳 TARJETA
      </div>
    </div>
  );
}

// ─── Descargar / subir datos y escanearse: una barra que se llena ─────────────
function Progress({ label, button, seconds, onDone, auto }) {
  const [p, setP] = useState(auto ? 0.001 : 0);
  const finish = useFinish(onDone, 300);
  useEffect(() => {
    if (!p) return undefined;
    const id = setInterval(() => setP((v) => {
      const nv = Math.min(1, v + 0.05 / seconds);
      if (nv >= 1) finish();
      return nv;
    }), 50);
    return () => clearInterval(id);
  }, [p > 0]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="nv-progress-task">
      <p>{p >= 1 ? '¡Listo!' : p ? `${label}… ${Math.round(p * 100)} %` : label}</p>
      <div className="nv-bar"><i style={{ width: `${p * 100}%` }} /></div>
      {!p && <button type="button" className="nv-big-btn" onClick={() => setP(0.001)}>{button}</button>}
    </div>
  );
}

// ─── Alinear el motor ────────────────────────────────────────────────────────
function Engines({ onDone }) {
  const [y, setY] = useState(() => (Math.random() < 0.5 ? 0.15 : 0.85));
  const drag = useRef(false);
  const box = useRef(null);
  const finish = useFinish(onDone);
  const ok = Math.abs(y - 0.5) < 0.035;
  return (
    <div className="nv-engine" ref={box}
      onPointerMove={(e) => drag.current && setY(Math.max(0.05, Math.min(0.95, relative(e, box.current).y)))}
      onPointerUp={() => { drag.current = false; if (ok) finish(); }}>
      <div className="nv-engine-line" />
      <div className={`nv-engine-handle${ok ? ' is-ok' : ''}`} style={{ top: `${y * 100}%` }}
        onPointerDown={(e) => { drag.current = true; capture(e.currentTarget.parentElement, e); }}>◀ motor</div>
      <p className="nv-hint">Llevá la flecha a la línea del medio.</p>
    </div>
  );
}

// ─── Calibrar el distribuidor ────────────────────────────────────────────────
function Distributor({ onDone }) {
  const [row, setRow] = useState(0);
  const [angle, setAngle] = useState(0);
  const [msg, setMsg] = useState('');
  const finish = useFinish(onDone);
  useEffect(() => {
    let raf = 0;
    const loop = (t) => { setAngle((t / 1000) * (200 + row * 90) % 360); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [row]);
  const colors = ['#ffd23f', '#4fc3f7', '#81c784'];
  return (
    <div className="nv-distributor">
      {colors.map((c, i) => (
        <div key={c} className={`nv-dial${i < row ? ' is-done' : ''}`}>
          <div className="nv-dial-face" style={{ '--c': c }}>
            <i className="nv-dial-target" />
            <i className="nv-dial-hand" style={{ transform: `rotate(${i === row ? angle : i < row ? 0 : 140}deg)` }} />
          </div>
          <button type="button" className="nv-big-btn" disabled={i !== row} onClick={() => {
            const off = Math.min(angle, 360 - angle);
            if (off < 28) { setMsg(''); if (row === 2) { setRow(3); finish(); } else setRow(row + 1); }
            else setMsg('¡Casi! Esperá a que pase por arriba.');
          }}>Calibrar</button>
        </div>
      ))}
      <p className="nv-hint">{msg || 'Apretá cuando la aguja pasa por la marca de arriba.'}</p>
    </div>
  );
}

// ─── Destruir asteroides ─────────────────────────────────────────────────────
function Asteroids({ onDone }) {
  const [rocks, setRocks] = useState([]);
  const [hits, setHits] = useState(0);
  const need = 15;
  const finish = useFinish(onDone);
  useEffect(() => {
    let raf = 0, last = performance.now(), spawn = 0, id = 0;
    const loop = (t) => {
      const dt = (t - last) / 1000; last = t; spawn -= dt;
      setRocks((list) => {
        let next = list.map((r) => ({ ...r, x: r.x - r.v * dt })).filter((r) => r.x > -0.1);
        if (spawn <= 0) { spawn = 0.55; next = [...next, { id: id++, x: 1.05, y: 0.1 + Math.random() * 0.8, v: 0.18 + Math.random() * 0.15, s: 0.05 + Math.random() * 0.04 }]; }
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="nv-asteroids">
      <svg className="nv-mg-svg" viewBox="0 0 1 1" preserveAspectRatio="none">
        <rect width="1" height="1" fill="#06101c" />
        {rocks.map((r) => (
          <circle key={r.id} cx={r.x} cy={r.y} r={r.s} fill="#9a8b7a" stroke="#5a4e40" strokeWidth="0.008" style={{ cursor: 'crosshair' }}
            onPointerDown={() => {
              setRocks((list) => list.filter((k) => k.id !== r.id));
              setHits((h) => { const n = h + 1; if (n >= need) finish(); return n; });
            }} />
        ))}
      </svg>
      <p className="nv-hint">Destruidos: {Math.min(hits, need)} / {need}</p>
    </div>
  );
}

// ─── Encender el reactor (Simón dice) ────────────────────────────────────────
function Simon({ onDone }) {
  const [seq] = useState(() => Array.from({ length: 4 }, () => rnd(9)));
  const [round, setRound] = useState(1);
  const [replay, setReplay] = useState(0); // sube al equivocarse: se vuelve a mostrar la secuencia
  const [showing, setShowing] = useState(-1);
  const [input, setInput] = useState([]);
  const [flash, setFlash] = useState(-1);
  const busy = useRef(true);
  const finish = useFinish(onDone);
  useEffect(() => {
    let k = 0;
    busy.current = true;
    setInput([]);
    const id = setInterval(() => {
      if (k >= round) { setShowing(-1); busy.current = false; clearInterval(id); return; }
      setShowing(seq[k]); setTimeout(() => setShowing(-1), 380); k += 1;
    }, 650);
    return () => clearInterval(id);
  }, [round, replay]); // eslint-disable-line react-hooks/exhaustive-deps
  function press(i) {
    if (busy.current) return;
    setFlash(i); setTimeout(() => setFlash(-1), 160);
    const next = [...input, i];
    if (seq[next.length - 1] !== i) { busy.current = true; setTimeout(() => setReplay((r) => r + 1), 400); return; }
    setInput(next);
    if (next.length === round) {
      busy.current = true;
      if (round === seq.length) finish();
      else setTimeout(() => setRound(round + 1), 400);
    }
  }
  return (
    <div className="nv-simon">
      <div className="nv-simon-grid is-show">{Array.from({ length: 9 }, (_, i) => <i key={i} className={showing === i ? 'is-on' : ''} />)}</div>
      <div className="nv-simon-grid">{Array.from({ length: 9 }, (_, i) => <button key={i} type="button" className={flash === i ? 'is-on' : ''} onClick={() => press(i)} />)}</div>
      <p className="nv-hint">Repetí la secuencia de la izquierda. Ronda {round} de {seq.length}.</p>
    </div>
  );
}

// ─── Desbloquear el colector ─────────────────────────────────────────────────
function Manifolds({ onDone }) {
  const [order, setOrder] = useState(() => shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]));
  const [next, setNext] = useState(1);
  const [bad, setBad] = useState(false);
  const finish = useFinish(onDone);
  return (
    <div className="nv-manifolds">
      <div className={`nv-num-grid${bad ? ' is-bad' : ''}`}>
        {order.map((n) => (
          <button key={n} type="button" className={n < next ? 'is-on' : ''} onClick={() => {
            if (n === next) { if (n === 10) finish(); setNext(n + 1); }
            else if (n > next) { setBad(true); setTimeout(() => { setBad(false); setNext(1); setOrder(shuffle(order)); }, 350); }
          }}>{n}</button>
        ))}
      </div>
      <p className="nv-hint">Tocá los números del 1 al 10, en orden.</p>
    </div>
  );
}

// ─── Activar los escudos ─────────────────────────────────────────────────────
function Shields({ onDone }) {
  const [red, setRed] = useState(() => {
    const r = Array.from({ length: 7 }, () => Math.random() < 0.5);
    if (r.filter(Boolean).length < 2) { r[0] = true; r[3] = true; }
    return r;
  });
  const finish = useFinish(onDone);
  const pos = [[0.5, 0.5], [0.5, 0.2], [0.76, 0.35], [0.76, 0.65], [0.5, 0.8], [0.24, 0.65], [0.24, 0.35]];
  return (
    <svg className="nv-mg-svg" viewBox="0 0 1 1">
      <rect width="1" height="1" fill="#1d2430" />
      {pos.map(([x, y], i) => (
        <polygon key={i} points={Array.from({ length: 6 }, (_, k) => `${x + Math.cos((k * Math.PI) / 3) * 0.13},${y + Math.sin((k * Math.PI) / 3) * 0.13}`).join(' ')}
          fill={red[i] ? '#e53935' : '#e8eef6'} stroke="#0e1218" strokeWidth="0.012" style={{ cursor: 'pointer' }}
          onPointerDown={() => {
            const next = red.map((v, k) => (k === i ? !v : v));
            setRed(next);
            if (next.every((v) => !v)) finish();
          }} />
      ))}
    </svg>
  );
}

// ─── Estabilizar la dirección ────────────────────────────────────────────────
function Steering({ onDone }) {
  const [p, setP] = useState(() => ({ x: 0.2 + Math.random() * 0.15, y: 0.25 + Math.random() * 0.5 }));
  const drag = useRef(false);
  const box = useRef(null);
  const finish = useFinish(onDone);
  return (
    <div className="nv-steering" ref={box}
      onPointerDown={(e) => { drag.current = true; capture(box.current, e); setP(relative(e, box.current)); }}
      onPointerMove={(e) => drag.current && setP(relative(e, box.current))}
      onPointerUp={() => { drag.current = false; if (Math.hypot(p.x - 0.5, p.y - 0.5) < 0.04) finish(); }}>
      <i className="nv-steer-center" />
      <i className="nv-steer-cross" style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }} />
      <p className="nv-hint">Arrastrá la mira al centro.</p>
    </div>
  );
}

// ─── Trazar el rumbo ─────────────────────────────────────────────────────────
function Chart({ onDone }) {
  const pts = useMemo(() => Array.from({ length: 5 }, (_, i) => ({ x: 0.1 + i * 0.2, y: 0.2 + Math.random() * 0.6 })), []);
  const [at, setAt] = useState(0);
  const finish = useFinish(onDone);
  return (
    <svg className="nv-mg-svg" viewBox="0 0 1 1">
      <rect width="1" height="1" fill="#0f2a3d" />
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.008" strokeDasharray="0.02 0.015" />
      {pts.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="0.04" fill={i <= at ? '#ffd23f' : '#ffffff'} style={{ cursor: i === at + 1 ? 'pointer' : 'default' }}
          onPointerDown={() => { if (i === at + 1) { setAt(i); if (i === pts.length - 1) finish(); } }} />
      ))}
      <text x={pts[at].x} y={pts[at].y - 0.07} fontSize="0.07" textAnchor="middle">🚀</text>
    </svg>
  );
}

// ─── Limpiar el filtro de O2 ─────────────────────────────────────────────────
function Leaves({ onDone }) {
  const [leaves, setLeaves] = useState(() => Array.from({ length: 6 }, (_, i) => ({ id: i, x: 0.35 + Math.random() * 0.55, y: 0.1 + Math.random() * 0.8, gone: false })));
  const finish = useFinish(onDone);
  return (
    <div className="nv-leaves">
      <div className="nv-leaves-vent">⬅ salida</div>
      {leaves.map((l) => (
        <button key={l.id} type="button" className={`nv-leaf${l.gone ? ' is-gone' : ''}`} style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}
          onClick={() => {
            const next = leaves.map((k) => (k.id === l.id ? { ...k, gone: true } : k));
            setLeaves(next);
            if (next.every((k) => k.gone)) finish();
          }}>🍂</button>
      ))}
      <p className="nv-hint">Tocá las hojas para sacarlas por la salida.</p>
    </div>
  );
}

// ─── Desviar energía (en Electricidad) y aceptarla (en otra sala) ────────────
function Divert({ onDone, accept }) {
  const [target] = useState(() => rnd(8));
  const [level, setLevel] = useState(0);
  const finish = useFinish(onDone);
  if (accept) {
    return (
      <div className="nv-progress-task">
        <p>Llega energía desviada desde Electricidad.</p>
        <button type="button" className="nv-big-btn" onClick={finish}>⚡ Aceptar energía</button>
      </div>
    );
  }
  return (
    <div className="nv-divert">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={`nv-divert-col${i === target ? ' is-target' : ''}`}>
          <input type="range" min="0" max="100" value={i === target ? level : 0} disabled={i !== target}
            onChange={(e) => { const v = Number(e.target.value); setLevel(v); if (v >= 95) finish(); }} />
        </div>
      ))}
      <p className="nv-hint">Subí la palanca que titila hasta arriba.</p>
    </div>
  );
}

// Qué minijuego va en cada estación.
export default function Minigame({ station, game, onDone }) {
  switch (game) {
    case 'wires': return <Wires onDone={onDone} />;
    case 'card': return <Card onDone={onDone} />;
    case 'download': return station.startsWith('upload')
      ? <Progress label="Subiendo los datos" button="Subir" seconds={6} onDone={onDone} />
      : <Progress label="Descargando los datos" button="Descargar" seconds={6} onDone={onDone} />;
    case 'garbage': return <HoldButton label="Mantené apretada la palanca" ms={2600} onDone={onDone} color="#8d6e63" />;
    case 'engines': return <Engines onDone={onDone} />;
    case 'distributor': return <Distributor onDone={onDone} />;
    case 'scan': return <Progress label="Escaneando" seconds={8} auto onDone={onDone} />;
    case 'asteroids': return <Asteroids onDone={onDone} />;
    case 'simon': return <Simon onDone={onDone} />;
    case 'manifolds': return <Manifolds onDone={onDone} />;
    case 'shields': return <Shields onDone={onDone} />;
    case 'steering': return <Steering onDone={onDone} />;
    case 'chart': return <Chart onDone={onDone} />;
    case 'fuel': return <HoldButton label={station.startsWith('fuel:storage') ? 'Llenar el bidón' : 'Cargar el motor'} ms={2800} onDone={onDone} color="#ffb300" />;
    case 'leaves': return <Leaves onDone={onDone} />;
    case 'divert': return <Divert onDone={onDone} accept={station.startsWith('accept')} />;
    default: return <button type="button" className="nv-big-btn" onClick={onDone}>Hecho</button>;
  }
}
