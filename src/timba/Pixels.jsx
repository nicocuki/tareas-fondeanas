// Dibujos de pixel art de las ventanas del casino (los símbolos de la tragamonedas y los patos de la carrera): mapas de
// bits de 12 × 12 con una letra por color, que se arman como un SVG sin suavizar.
import React, { useMemo } from 'react';

const PALETTE = {
  y: '#f0c33c', p: '#e8569a', g: '#3fa65a', b: '#3a7be8', d: '#1a1030', c: '#4fd8e8', w: '#f4f0e6', o: '#f08a3c',
};

export const SLOT_ART = {
  lotus: [
    '.....yy.....', '....yppy....', '..y.yppy.y..', '.yp.yppy.py.', '.ypyyppyypy.', '.yppyppyppy.',
    '..yppppppy..', '...yppppy...', '....yyyy....', '.gg.gggg.gg.', '..gggggggg..', '............',
  ],
  scarab: [
    '....dbbd....', '...dbbbbd...', 'y..dbyybd..y', '.y.dbyybd.y.', '..ydbbbbdy..', 'y..dbbbbd..y',
    '.y.dbbbbd.y.', '...dbbbbd...', '..y.dbbd.y..', '.y..dyyd..y.', 'y...dddd...y', '............',
  ],
  ankh: [
    '....yyyy....', '...yccccy...', '..yc....cy..', '..yc....cy..', '..yc....cy..', '...yccccy...',
    '....yccy....', '..yyyccyyy..', '..cccccccc..', '....yccy....', '....yccy....', '....yyyy....',
  ],
  eye: [
    '............', '...yyyyyy...', '.yydwwwwdyy.', 'yydwwbbwwdyy', 'ydwwbddbwwdy', 'yydwwbbwwdyy',
    '.yydwwwwdyy.', '...yyyyyy...', '....y..y....', '.....yy.....', '............', '............',
  ],
};

export const DUCK_ART = [
  '....yyy.....', '...yyyyy....', '...yydyyoo..', '...yyyyyoo..', 'y..yyyyy....', 'yyyyyyyyy...',
  'yyyyyyyyy...', '.yyyyyyyy...', '..yyyyyy....', '............',
];

// Une las celdas del mismo color de una fila en un solo rectángulo.
function rects(art, body) {
  const out = [];
  art.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let n = 1;
      while (x + n < row.length && row[x + n] === ch) n++;
      if (ch !== '.') out.push({ x, y, w: n, fill: ch === 'y' && body ? body : PALETTE[ch] });
      x += n;
    }
  });
  return out;
}

export function Pixels({ art, size = 48, body, className = '' }) {
  const list = useMemo(() => rects(art, body), [art, body]);
  const h = art.length;
  const w = art[0].length;
  return (
    <svg className={`tbg-pixels ${className}`} viewBox={`0 0 ${w} ${h}`} width={size} height={(size * h) / w} shapeRendering="crispEdges" aria-hidden="true">
      {list.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height="1" fill={r.fill} />)}
    </svg>
  );
}
