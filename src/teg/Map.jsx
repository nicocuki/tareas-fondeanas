// El tablero: un mapamundi como el del T.E.G. de mesa (países con forma y frontera de verdad, continentes de colores, rutas de
// navegación punteadas y fichas redondas), en un SVG que ocupa toda la pantalla y se puede acercar y arrastrar.
// La forma de cada país sale de geo.js. Cada país tiene dos zonas tocables: su territorio y su ficha (las dos con `onPick`).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ARMY_COLORS, CONTINENTS, COUNTRIES, LINKS } from './board.js';
import { COAST, ISLAND_COAST, MAP_H, MAP_W, SHAPES } from './geo.js';

export { MAP_H, MAP_W };
const NEUTRAL = { color: '#d8d2bf', ink: '#6f6850' }; // país que todavía no salió en el reparto
const MAX_ZOOM = 4;

// Las rutas por mar: curvas punteadas con un barquito en el medio. Alaska–Kamchatka da la vuelta por los bordes del mapa.
const wrapA = COUNTRIES.findIndex((c) => c.id === 'alaska');
const wrapK = COUNTRIES.findIndex((c) => c.id === 'kamchatka');
const SEA_ROUTES = LINKS.filter((l) => l.sea).flatMap((l) => {
  const a = COUNTRIES[l.a];
  const b = COUNTRIES[l.b];
  if ((l.a === wrapA && l.b === wrapK) || (l.a === wrapK && l.b === wrapA)) {
    const k = COUNTRIES[wrapK];
    const al = COUNTRIES[wrapA];
    return [
      { key: 'w1', d: `M${al.x},${al.y} Q${al.x * 0.4},${al.y - 40} 0,${al.y - 22}`, boat: [al.x * 0.45, al.y - 24, 200] },
      { key: 'w2', d: `M${k.x},${k.y} Q${(k.x + MAP_W) / 2},${k.y - 40} ${MAP_W},${k.y - 22}`, boat: [(k.x + MAP_W) / 2 + 4, k.y - 22, -20] },
    ];
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const bend = Math.min(26, len * 0.16) * (l.a % 2 ? 1 : -1);
  const cx = mx - ((b.y - a.y) / len) * bend;
  const cy = my + ((b.x - a.x) / len) * bend;
  const bx = 0.25 * a.x + 0.5 * cx + 0.25 * b.x;
  const by = 0.25 * a.y + 0.5 * cy + 0.25 * b.y;
  return [{ key: `${l.a}-${l.b}`, d: `M${a.x},${a.y} Q${cx.toFixed(1)},${cy.toFixed(1)} ${b.x},${b.y}`, boat: [bx, by, (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI] }];
});

// Lo que adorna el tablero: marco, título, rosa de los vientos, sol, nombres de los mares y barcos.
function Decor() {
  return (
    <g className="tg-decor" aria-hidden="true">
      <circle cx="255" cy="380" r="330" className="tg-hemi" />
      <circle cx="745" cy="380" r="330" className="tg-hemi" />
      <text x="355" y="338" className="tg-sea-name" textAnchor="middle">MAR DEL</text>
      <text x="355" y="368" className="tg-sea-name big" textAnchor="middle">NORTE</text>
      <text x="165" y="488" className="tg-sea-name" textAnchor="middle">MAR DEL</text>
      <text x="165" y="518" className="tg-sea-name big" textAnchor="middle">SUR</text>
      <g transform="translate(500 92)" className="tg-sun">
        {Array.from({ length: 16 }, (_, i) => <path key={i} d="M-4,-24 L0,-54 L4,-24Z" transform={`rotate(${i * 22.5})`} />)}
        <circle r="21" />
        <circle r="14" className="in" />
        <path d="M-6,-3 q3,3 6,0 M0,-3 q3,3 6,0 M-5,6 q5,4 10,0" className="face" />
      </g>
      <g transform="translate(70 70)" className="tg-compass">
        <circle r="38" className="ring" />
        <path d="M0,-44 L7,0 L0,44 L-7,0Z" className="a" />
        <path d="M-44,0 L0,-7 L44,0 L0,7Z" className="b" />
        <path d="M0,-44 L7,0 L-7,0Z" className="n" />
        <text y="-48" textAnchor="middle">N</text>
      </g>
      <g transform="translate(500 662)" className="tg-plaque">
        <rect x="-86" y="-30" width="172" height="52" rx="14" />
        <text y="-5" textAnchor="middle" className="t1">T.E.G.</text>
        <text y="13" textAnchor="middle" className="t2">táctica y estrategia de la guerra</text>
      </g>
      {[[120, 598, 1], [405, 626, -1], [610, 690, 1]].map(([x, y, f]) => (
        <g key={x} transform={`translate(${x} ${y}) scale(${f} 1)`} className="tg-ship">
          <path d="M-16,0 L16,0 L11,9 L-11,9Z" />
          <path d="M0,-26 L0,0 M0,-24 L14,-4 L0,-4Z M-2,-20 L-13,-4 L-2,-4Z" />
        </g>
      ))}
    </g>
  );
}

// Una ficha: cilindro del color del jugador con el número arriba. Cae con rebote la primera vez que aparece y «pop» cuando suma.
function Token({ x, y, arm, color, ink, name, flash }) {
  const prev = useRef(arm);
  const [fx, setFx] = useState({ n: 0, kind: '' });
  useEffect(() => {
    if (arm > prev.current) setFx((s) => ({ n: s.n + 1, kind: prev.current === 0 ? 'drop' : 'pop' }));
    prev.current = arm;
  }, [arm]);
  if (!arm) return <g transform={`translate(${x} ${y})`}><text className="tg-name" textAnchor="middle" y="4">{name}</text></g>;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g key={fx.n} className={`tg-token${fx.kind ? ` is-${fx.kind}` : ''}${flash ? ' is-flash' : ''}`} style={{ '--tok': color }}>
        {fx.kind === 'drop' && <circle className="tg-ripple" r="14" />}
        <ellipse className="tg-tok-shadow" cx="1" cy="11" rx="15" ry="5.5" />
        <path className="tg-tok-side" d="M-14,0 v9 a14,6 0 0 0 28,0 v-9z" />
        <ellipse className="tg-tok-top" cx="0" cy="0" rx="14" ry="9.5" />
        <ellipse className="tg-tok-gloss" cx="-3.5" cy="-3" rx="8" ry="3.4" />
        <text className="tg-armies" fill={ink} textAnchor="middle" dy="0.36em">{arm}</text>
        {fx.kind === 'pop' && <text className="tg-plus" textAnchor="middle" y="-14">+</text>}
      </g>
      <text className="tg-name" textAnchor="middle" y="27">{name}</text>
    </g>
  );
}

// `from`, `targets`, `placeable`, `hover`: lo que se ilumina según lo que se esté haciendo. `overlay`: dibujos SVG extra (las cartas
// del reparto). `deckRef`: se llena con el centro del tablero para que el reparto sepa de dónde salen las cartas.
export default function WorldMap({ room, me, onPick, from, targets, placeable, hover, overlay }) {
  const svg = useRef(null);
  const [view, setView] = useState({ s: 1, cx: MAP_W / 2, cy: MAP_H / 2 });
  const drag = useRef(null);
  const moved = useRef(false);
  const w = MAP_W / view.s;
  const h = MAP_H / view.s;
  const x0 = Math.min(MAP_W - w, Math.max(0, view.cx - w / 2));
  const y0 = Math.min(MAP_H - h, Math.max(0, view.cy - h / 2));

  const ownerColor = (c) => (room.players[room.own[c]] ? ARMY_COLORS[room.players[room.own[c]].color] : NEUTRAL);
  const toMap = (clientX, clientY) => {
    const r = svg.current.getBoundingClientRect();
    const scale = Math.min(r.width / w, r.height / h);
    const ox = r.left + (r.width - w * scale) / 2;
    const oy = r.top + (r.height - h * scale) / 2;
    return { x: x0 + (clientX - ox) / scale, y: y0 + (clientY - oy) / scale, scale };
  };
  const zoomTo = (factor, at) => setView((v) => {
    const s = Math.min(MAX_ZOOM, Math.max(1, v.s * factor));
    const ww = MAP_W / v.s;
    const hh = MAP_H / v.s;
    const px = at ? at.x : v.cx;
    const py = at ? at.y : v.cy;
    const vx = Math.min(MAP_W - ww, Math.max(0, v.cx - ww / 2));
    const vy = Math.min(MAP_H - hh, Math.max(0, v.cy - hh / 2));
    // el punto bajo el cursor se queda donde está
    const rx = (px - vx) / ww;
    const ry = (py - vy) / hh;
    return { s, cx: px - rx * (MAP_W / s) + MAP_W / s / 2, cy: py - ry * (MAP_H / s) + MAP_H / s / 2 };
  });

  useEffect(() => {
    const el = svg.current;
    const onWheel = (e) => {
      e.preventDefault();
      zoomTo(e.deltaY < 0 ? 1.18 : 1 / 1.18, toMap(e.clientX, e.clientY));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy, scale: toMap(e.clientX, e.clientY).scale };
    moved.current = false;
    const move = (ev) => {
      const d = drag.current;
      if (!d) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      if (!moved.current && Math.hypot(dx, dy) < 7) return;
      moved.current = true;
      setView((v) => ({ ...v, cx: d.cx - dx / d.scale, cy: d.cy - dy / d.scale }));
    };
    const up = () => {
      drag.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  const lit = useMemo(() => {
    const out = [];
    COUNTRIES.forEach((c, i) => {
      const kinds = [];
      if (from === i) kinds.push('from');
      if (targets?.has(i)) kinds.push('target');
      if (placeable?.has(i)) kinds.push('placeable');
      if (hover === i) kinds.push('hover');
      if (room.pending && room.pending.to === i) kinds.push('pending');
      if (kinds.length) out.push({ i, d: SHAPES[c.id].d, cls: kinds.join(' ') });
    });
    return out;
  }, [from, targets, placeable, hover, room.pending]);

  const pick = (i) => { if (!moved.current) onPick(i); };
  const press = (i) => (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i); } };

  return (
    <div className="tg-map-wrap">
      <svg
        ref={svg} className="tg-map" viewBox={`${x0} ${y0} ${w} ${h}`} preserveAspectRatio="xMidYMid meet"
        role="group" aria-label="Mapa" data-map data-zoom={view.s} onPointerDown={onPointerDown}
      >
        <defs>
          <radialGradient id="tg-sea-g" cx="50%" cy="48%" r="75%">
            <stop offset="0" stopColor="#d3e8ee" />
            <stop offset="1" stopColor="#a9cddb" />
          </radialGradient>
          <pattern id="tg-waves" width="26" height="14" patternUnits="userSpaceOnUse">
            <path d="M0,7 q6.5,-6 13,0 t13,0" fill="none" stroke="#7fb0c4" strokeOpacity="0.28" strokeWidth="1" />
          </pattern>
          <filter id="tg-soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="3.2" /></filter>
        </defs>
        <rect x="-200" y="-200" width={MAP_W + 400} height={MAP_H + 400} fill="url(#tg-sea-g)" />
        <rect x="-200" y="-200" width={MAP_W + 400} height={MAP_H + 400} fill="url(#tg-waves)" />
        <Decor />
        <g className="tg-coast">
          {Object.entries(COAST).map(([k, d]) => <path key={k} d={d} className="shade" filter="url(#tg-soft)" transform="translate(3 5)" />)}
          {Object.entries(ISLAND_COAST).map(([k, d]) => <path key={k} d={d} className="shade" filter="url(#tg-soft)" transform="translate(3 5)" />)}
        </g>
        <g className="tg-lands">
          {COUNTRIES.map((c, i) => {
            const cont = CONTINENTS[c.continent];
            return (
              <path
                key={c.id} d={SHAPES[c.id].d} className="tg-land" data-land={c.id} data-land-i={i}
                style={{ '--cont': cont.color }} onClick={() => pick(i)}
              />
            );
          })}
        </g>
        <g className="tg-sea-routes" aria-hidden="true">
          {SEA_ROUTES.map((r) => (
            <g key={r.key}>
              <path d={r.d} />
              <g transform={`translate(${r.boat[0].toFixed(1)} ${r.boat[1].toFixed(1)})`} className="tg-route-boat"><path d="M-6,2 h12 l-3,4 h-6z M0,-8 v10 M0,-8 l6,8 h-6z" /></g>
            </g>
          ))}
        </g>
        {Object.entries(CONTINENTS).map(([key, c]) => (
          <text key={key} x={c.label[0]} y={c.label[1]} className="tg-continent" textAnchor="middle">{c.name.toUpperCase()} · +{c.bonus}</text>
        ))}
        <g className="tg-lit" pointerEvents="none">
          {lit.map((l) => <path key={l.i} d={l.d} className={`tg-hl ${l.cls}`} />)}
        </g>
        <g className="tg-tokens">
          {COUNTRIES.map((c, i) => {
            const col = ownerColor(i);
            const owner = room.players[room.own[i]];
            const mine = owner?.id === me?.id;
            return (
              <g
                key={c.id} className={`tg-c${mine ? ' is-mine' : ''}`} role="button" tabIndex={0} data-country={c.id} data-i={i}
                data-armies={room.arm[i]} data-owner={owner?.name}
                aria-label={`${c.name}: ${room.arm[i]} ejércitos de ${owner?.name || 'nadie'}`}
                onClick={() => pick(i)} onKeyDown={press(i)}
              >
                <title>{`${c.name} · ${CONTINENTS[c.continent].name} · ${room.arm[i]} ejército${room.arm[i] === 1 ? '' : 's'} de ${owner?.name || 'nadie'}`}</title>
                <circle cx={c.x} cy={c.y} r="22" className="tg-hit" />
                <Token x={c.x} y={c.y} arm={room.arm[i]} color={col.color} ink={col.ink} name={c.name} />
              </g>
            );
          })}
        </g>
        {overlay}
      </svg>
      <div className="tg-zoom" role="group" aria-label="Zoom del mapa">
        <button type="button" onClick={() => zoomTo(1.4)} aria-label="Acercar" disabled={view.s >= MAX_ZOOM}>+</button>
        <button type="button" onClick={() => zoomTo(1 / 1.4)} aria-label="Alejar" disabled={view.s <= 1}>−</button>
        <button type="button" onClick={() => setView({ s: 1, cx: MAP_W / 2, cy: MAP_H / 2 })} aria-label="Ver todo el mapa" disabled={view.s === 1}>⤢</button>
      </div>
    </div>
  );
}
