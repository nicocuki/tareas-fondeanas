// Formas de A los Tiros, sin React ni red: polígonos convexos y círculos, y sus choques. Todo lo
// demás se arma con eso. Un mapa describe sus piezas así (unidades del mundo, y crece hacia abajo):
//   ['rect', x, y, ancho, alto]        ['poly', [[x, y], …]]   (convexo, en cualquier sentido)
//   ['circle', x, y, radio]            ['capsule', x1, y1, x2, y2, radio]   (palo de puntas redondas)
//   ['group', [pieza, …]]              (varias que forman una sola: se pintan del mismo color)
// `compileShape` las pasa a sólidos: { t: 'p', v: [[x, y]…], n: [[nx, ny]…], box } o
// { t: 'c', x, y, r, box }, donde `box` es [minX, minY, maxX, maxY] para descartar rápido.

// Polígono convexo con las normales de cada lado hacia afuera (el lado i va de v[i] a v[i+1]).
export function polygon(points) {
  const v = points.map(([x, y]) => [x, y]);
  const cx = v.reduce((s, p) => s + p[0], 0) / v.length;
  const cy = v.reduce((s, p) => s + p[1], 0) / v.length;
  const n = v.map((a, i) => {
    const b = v[(i + 1) % v.length];
    let nx = b[1] - a[1], ny = a[0] - b[0];
    const len = Math.hypot(nx, ny) || 1;
    nx /= len; ny /= len;
    if (nx * ((a[0] + b[0]) / 2 - cx) + ny * ((a[1] + b[1]) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
    return [nx, ny];
  });
  const xs = v.map((p) => p[0]), ys = v.map((p) => p[1]);
  return { t: 'p', v, n, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
}

export const disc = (x, y, r) => ({ t: 'c', x, y, r, box: [x - r, y - r, x + r, y + r] });

const rectPoints = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

// Una pieza del mapa → uno o más sólidos.
export function compileShape(shape) {
  const [type, ...a] = shape;
  if (type === 'rect') return [polygon(rectPoints(a[0], a[1], a[2], a[3]))];
  if (type === 'poly') return [polygon(a[0])];
  if (type === 'circle') return [disc(a[0], a[1], a[2])];
  if (type === 'group') return a[0].flatMap(compileShape);
  if (type === 'capsule') {
    const [x1, y1, x2, y2, r] = a;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    const px = (-(y2 - y1) / len) * r, py = ((x2 - x1) / len) * r;
    return [polygon([[x1 + px, y1 + py], [x2 + px, y2 + py], [x2 - px, y2 - py], [x1 - px, y1 - py]]), disc(x1, y1, r), disc(x2, y2, r)];
  }
  throw new Error(`Forma desconocida: ${type}`);
}

const overlaps = (box, x, y, r) => x + r > box[0] && x - r < box[2] && y + r > box[1] && y - r < box[3];

// Choque de un círculo contra un sólido: la normal (del sólido hacia el círculo) y cuánto se mete.
export function hitSolid(x, y, r, s) {
  if (!overlaps(s.box, x, y, r)) return null;
  if (s.t === 'c') {
    const dx = x - s.x, dy = y - s.y;
    const d = Math.hypot(dx, dy);
    if (d >= r + s.r) return null;
    if (d < 1e-9) return { nx: 0, ny: -1, depth: r + s.r };
    return { nx: dx / d, ny: dy / d, depth: r + s.r - d };
  }
  // Polígono: el lado más separado del centro, y si el centro cae frente a una punta, la punta.
  let best = -Infinity, edge = 0;
  for (let i = 0; i < s.v.length; i++) {
    const sep = s.n[i][0] * (x - s.v[i][0]) + s.n[i][1] * (y - s.v[i][1]);
    if (sep > r) return null;
    if (sep > best) { best = sep; edge = i; }
  }
  const [nx, ny] = s.n[edge];
  if (best < 1e-9) return { nx, ny, depth: r - best };
  const a = s.v[edge], b = s.v[(edge + 1) % s.v.length];
  const u1 = (x - a[0]) * (b[0] - a[0]) + (y - a[1]) * (b[1] - a[1]);
  const u2 = (x - b[0]) * (a[0] - b[0]) + (y - b[1]) * (a[1] - b[1]);
  const corner = u1 <= 0 ? a : u2 <= 0 ? b : null;
  if (!corner) return { nx, ny, depth: r - best };
  const dx = x - corner[0], dy = y - corner[1];
  const d = Math.hypot(dx, dy);
  if (d >= r) return null;
  return { nx: dx / (d || 1), ny: dy / (d || 1), depth: r - d };
}

// ¿El punto está adentro de algún sólido (o a menos de `r`)?
export const touchesAny = (x, y, r, solids) => solids.some((s) => hitSolid(x, y, r, s));

// Choque de un polígono que se mueve (una caja) contra un sólido. Devuelve hasta dos contactos
// { nx, ny, depth, x, y }: la normal empuja la caja hacia afuera del sólido.
export function polyContacts(p, s) {
  if (p.box[2] <= s.box[0] || p.box[0] >= s.box[2] || p.box[3] <= s.box[1] || p.box[1] >= s.box[3]) return [];
  if (s.t === 'c') {
    const hit = hitSolid(s.x, s.y, s.r, p);
    if (!hit) return [];
    return [{ nx: -hit.nx, ny: -hit.ny, depth: hit.depth, x: s.x - hit.nx * s.r, y: s.y - hit.ny * s.r }];
  }
  // Separación de B respecto de las caras de A: la mayor de las «menores distancias» de B a cada cara.
  const face = (A, B) => {
    let best = -Infinity, at = 0;
    for (let i = 0; i < A.v.length; i++) {
      const [nx, ny] = A.n[i];
      let min = Infinity;
      for (const q of B.v) min = Math.min(min, nx * (q[0] - A.v[i][0]) + ny * (q[1] - A.v[i][1]));
      if (min > best) { best = min; at = i; }
    }
    return { sep: best, at };
  };
  const fp = face(p, s);
  if (fp.sep >= 0) return [];
  const fs = face(s, p);
  if (fs.sep >= 0) return [];
  // La cara de referencia es la de menor penetración; las puntas del otro que la cruzan son los contactos.
  const useSolid = fs.sep >= fp.sep - 1e-4;
  const ref = useSolid ? s : p, inc = useSolid ? p : s, i = useSolid ? fs.at : fp.at;
  const [nx, ny] = ref.n[i];
  const [ax, ay] = ref.v[i];
  const out = [];
  for (const q of inc.v) {
    const d = nx * (q[0] - ax) + ny * (q[1] - ay);
    if (d < 0) out.push({ nx: useSolid ? nx : -nx, ny: useSolid ? ny : -ny, depth: -d, x: q[0], y: q[1] });
  }
  out.sort((a, b) => b.depth - a.depth);
  return out.slice(0, 2);
}

// Los puntos de un sólido (los círculos, como polígonos de 20 lados) para dibujar sombras.
export function outline(s) {
  if (s.t === 'p') return s.v;
  return Array.from({ length: 20 }, (_, i) => [s.x + Math.cos((i / 20) * Math.PI * 2) * s.r, s.y + Math.sin((i / 20) * Math.PI * 2) * s.r]);
}
