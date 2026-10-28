// El mapa: 50 países como fichas de color sobre los continentes, unidos por sus fronteras (las punteadas cruzan el mar).
import React, { useMemo } from 'react';
import { ARMY_COLORS, CONTINENTS, COUNTRIES, LINKS, indexOf } from './board.js';

export const MAP_W = 1000;
export const MAP_H = 600;
const R = 19;

// Envolvente convexa de unos puntos (cadena monótona), para dibujar la mancha de cada continente.
function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const build = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(pts), ...build([...pts].reverse())];
}

const WRAP = [indexOf.alaska, indexOf.kamchatka]; // esta frontera da la vuelta por el borde del mapa

const BLOBS = Object.entries(CONTINENTS).map(([key, c]) => ({
  key, ...c, path: `M${hull(COUNTRIES.filter((x) => x.continent === key).map((x) => [x.x, x.y])).map((p) => p.join(',')).join('L')}Z`,
}));

// `info`: { from, targets: Set, placeable: Set } lo que se ilumina según lo que se esté haciendo.
export default function WorldMap({ room, me, onPick, from, targets, placeable, zoom }) {
  const ownerColor = (c) => ARMY_COLORS[room.players[room.own[c]]?.color ?? 0];
  const links = useMemo(() => LINKS.filter((l) => !(l.a === WRAP[0] && l.b === WRAP[1]) && !(l.a === WRAP[1] && l.b === WRAP[0])), []);
  const a = COUNTRIES[WRAP[0]];
  const k = COUNTRIES[WRAP[1]];
  return (
    <div className="tg-map-scroll">
      <svg className="tg-map" viewBox={`0 0 ${MAP_W} ${MAP_H}`} style={{ width: `${zoom * 100}%` }} role="group" aria-label="Mapa" data-map>
        <rect x="0" y="0" width={MAP_W} height={MAP_H} className="tg-sea" />
        {BLOBS.map((b) => (
          <path key={b.key} d={b.path} fill={b.color} stroke={b.color} strokeWidth="62" strokeLinejoin="round" className="tg-blob" opacity="0.55" />
        ))}
        <g className="tg-links">
          {links.map((l) => (
            <line key={`${l.a}-${l.b}`} x1={COUNTRIES[l.a].x} y1={COUNTRIES[l.a].y} x2={COUNTRIES[l.b].x} y2={COUNTRIES[l.b].y} className={l.sea ? 'is-sea' : ''} />
          ))}
          <line x1={a.x} y1={a.y} x2={0} y2={a.y - 12} className="is-sea" />
          <line x1={k.x} y1={k.y} x2={MAP_W} y2={k.y - 12} className="is-sea" />
        </g>
        {BLOBS.map((b) => <text key={b.key} x={b.label[0]} y={b.label[1]} className="tg-continent" textAnchor="middle">{b.name} · +{b.bonus}</text>)}
        {COUNTRIES.map((c, i) => {
          const col = ownerColor(i);
          const mine = room.players[room.own[i]]?.id === me?.id;
          const pending = room.pending && room.pending.to === i;
          const cls = ['tg-node', mine ? 'is-mine' : '', from === i ? 'is-from' : '', targets?.has(i) ? 'is-target' : '', placeable?.has(i) ? 'is-placeable' : '', pending ? 'is-pending' : ''].filter(Boolean).join(' ');
          const owner = room.players[room.own[i]];
          return (
            <g
              key={c.id} className={cls} transform={`translate(${c.x} ${c.y})`} role="button" tabIndex={0}
              data-country={c.id} data-armies={room.arm[i]} data-owner={owner?.name}
              aria-label={`${c.name}: ${room.arm[i]} ejércitos de ${owner?.name || 'nadie'}`}
              onClick={() => onPick(i)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i); } }}
            >
              <title>{`${c.name} · ${CONTINENTS[c.continent].name} · ${room.arm[i]} ejército${room.arm[i] === 1 ? '' : 's'} de ${owner?.name || 'nadie'}`}</title>
              <circle r={R + 7} className="tg-ring" />
              <circle r={R} fill={col.color} className="tg-disc" />
              <text className="tg-armies" fill={col.ink} textAnchor="middle" dy="0.35em">{room.arm[i]}</text>
              <text className="tg-name" textAnchor="middle" y={R + 12}>{c.name}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
