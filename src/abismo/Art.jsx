// Pixel art de Abismo, dibujado con rectángulos en SVG (`shape-rendering: crispEdges`): el barquito, el sol,
// las nubes, los peces, el krill (el marcador del jugador) y las algas. Sin imágenes.
import React from 'react';

// Un dibujo a partir de filas de texto: cada letra es un color del mapa, el punto es transparente.
function Pixels({ rows, palette, scale = 3, className, style }) {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const rects = [];
  rows.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === '.' || !palette[ch]) return;
      rects.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={palette[ch]} />);
    });
  });
  return (
    <svg className={className} style={style} width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} shapeRendering="crispEdges" aria-hidden="true">
      {rects}
    </svg>
  );
}

const BOAT = [
  '......r.........',
  '......rr........',
  '......rrr.......',
  '......h.........',
  '......h.........',
  '....hhhhhh......',
  '....hwwwwh......',
  '....hhhhhh......',
  'hhhhhhhhhhhhhhhh',
  '.hhhhhhhhhhhhhh.',
  '..hhhhhhhhhhhh..',
];
export const Boat = (props) => <Pixels rows={BOAT} palette={{ h: '#1a2233', w: '#4de3ff', r: '#ff5d8f' }} {...props} />;

const SUN = [
  '...yyyy...',
  '.yyyyyyyy.',
  '.yyyyyyyy.',
  'yyyyyyyyyy',
  'yyyyyyyyyy',
  'yyyyyyyyyy',
  'yyyyyyyyyy',
  '.yyyyyyyy.',
  '.yyyyyyyy.',
  '...yyyy...',
];
export const Sun = (props) => <Pixels rows={SUN} palette={{ y: '#ffd166' }} {...props} />;

const CLOUD = [
  '....wwww......',
  '..wwwwwwww....',
  '.wwwwwwwwwww..',
  'wwwwwwwwwwwwww',
  '.wwwwwwwwwwww.',
];
export const Cloud = (props) => <Pixels rows={CLOUD} palette={{ w: '#ffffff' }} {...props} />;

const FISH = [
  '..ffff..f',
  '.ffffffff',
  'fffeffff.',
  '.ffffffff',
  '..ffff..f',
];
export const Fish = ({ color = '#0b1a2e', flip, ...props }) => (
  <Pixels rows={FISH} palette={{ f: color, e: '#c7e9ff' }} style={flip ? { transform: 'scaleX(-1)' } : undefined} {...props} />
);

// El krill: el marcador de cada jugador, rosa como en el original.
const KRILL = [
  '.....pp.....',
  '....pppp.p..',
  '...pppppp...',
  '..ppppppp.p.',
  '.pppppppp...',
  'pp.pppppp...',
  '...pp.pp.p..',
  '..p..p..p...',
];
export const Krill = ({ color = '#ff5d8f', ...props }) => <Pixels rows={KRILL} palette={{ p: color }} {...props} />;

const WEED = [
  '..g..',
  '.gg..',
  '..g..',
  '..gg.',
  '..g..',
  '.gg..',
  '..g..',
  '..gg.',
  '..g..',
  '.ggg.',
];
export const Weed = (props) => <Pixels rows={WEED} palette={{ g: '#0b2a3a' }} {...props} />;

// Las flechitas de los botones, como en el original.
export const Down = () => <span aria-hidden="true">▼</span>;
