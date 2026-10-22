// El mapa de Cohete Royale, como el de Rocket Bot Royale: formas flotando en el espacio acomodadas en
// una grilla, y abajo unas islas sobre el agua. Hay dos temas, como en el original:
//   tierra  anillos y «U» huecas con esquinas redondeadas (tierra a cuadros, borde verde, fondo violeta)
//   hielo   triángulos, marcos triangulares y barras en diagonal (blanco con bordes celestes, fondo azul)
// Se guarda como grilla de «píxeles» (una casilla = una unidad; y crece hacia abajo) y los cohetes cavan
// círculos. Todo sale de una semilla: todas las pantallas arman el mismo mapa, y como cavar es borrar
// (el orden no importa), con los mismos cráteres quedan iguales. Puro: sin React ni red.

export const CELL = 230;      // cada forma ocupa una celda de la grilla
export const TOP = 190;       // lugar arriba para los helicópteros que traen a los jugadores
const MARGIN = 120;
const ROWS = 4;
export const THEMES = ['tierra', 'hielo'];

// Columnas según cuántos juegan: con 25 hace falta lugar.
export const colsFor = (players) => Math.max(5, Math.min(14, 4 + Math.ceil(players / 2.2)));
export const sizeFor = (players) => ({ W: colsFor(players) * CELL + MARGIN * 2, H: TOP + ROWS * CELL + 150 });

// Números al azar repetibles (mulberry32).
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ¿(x, y) cae adentro del rectángulo redondeado?
function inRound(x, y, r) {
  if (x < r.x || y < r.y || x >= r.x + r.w || y >= r.y + r.h) return false;
  const cx = Math.max(r.x + r.r, Math.min(r.x + r.w - r.r, x));
  const cy = Math.max(r.y + r.r, Math.min(r.y + r.h - r.r, y));
  return (x - cx) ** 2 + (y - cy) ** 2 <= r.r * r.r;
}
function paint(t, r, value) {
  const x0 = Math.max(0, Math.floor(r.x)), x1 = Math.min(t.W - 1, Math.ceil(r.x + r.w));
  const y0 = Math.max(0, Math.floor(r.y)), y1 = Math.min(t.H - 1, Math.ceil(r.y + r.h));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inRound(x + 0.5, y + 0.5, r)) t.grid[y * t.W + x] = value;
}

// Polígono convexo o no (regla par-impar).
function inPoly(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function paintPoly(t, pts, value) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.floor(Math.min(...xs))), x1 = Math.min(t.W - 1, Math.ceil(Math.max(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys))), y1 = Math.min(t.H - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (inPoly(x + 0.5, y + 0.5, pts)) t.grid[y * t.W + x] = value;
}
// Una barra gruesa de (ax, ay) a (bx, by).
function bar(ax, ay, bx, by, width) {
  const len = Math.hypot(bx - ax, by - ay) || 1;
  const nx = (-(by - ay) / len) * (width / 2), ny = ((bx - ax) / len) * (width / 2);
  return [[ax + nx, ay + ny], [bx + nx, by + ny], [bx - nx, by - ny], [ax - nx, ay - ny]];
}
// El mismo polígono achicado hacia su centro (para hacer un marco).
function shrink(pts, thick) {
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => {
    const d = Math.hypot(x - cx, y - cy) || 1;
    const k = Math.max(0, (d - thick * 1.9) / d);
    return [cx + (x - cx) * k, cy + (y - cy) * k];
  });
}

// Una celda del tema tierra: anillo, «U» o bloque lleno.
function earthCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.12) return;
  const w = CELL * (0.68 + rand() * 0.27), h = CELL * (0.62 + rand() * 0.3);
  const x = x0 + (CELL - w) * rand();
  const y = y0 + (CELL - h) * rand();
  const thick = 38 + rand() * 18;
  const outer = { x, y, w, h, r: 26 + rand() * 18 };
  paint(t, outer, 1);
  if (kind < 0.22) return;
  const inner = { x: x + thick, y: y + thick, w: w - thick * 2, h: h - thick * 2, r: Math.max(8, outer.r - thick * 0.5) };
  if (inner.w < 30 || inner.h < 30) return;
  paint(t, inner, 0);
  t.holes.push(inner);
  if (kind > 0.72) {
    const side = Math.floor(rand() * 4);
    const gap = 0.35 + rand() * 0.3;
    if (side < 2) {
      const gw = inner.w * gap, gx = inner.x + (inner.w - gw) / 2;
      paint(t, { x: gx, y: side === 0 ? y - 2 : inner.y + inner.h - 2, w: gw, h: thick + 4, r: 0 }, 0);
    } else {
      const gh = inner.h * gap, gy = inner.y + (inner.h - gh) / 2;
      paint(t, { x: side === 2 ? x - 2 : inner.x + inner.w - 2, y: gy, w: thick + 4, h: gh, r: 0 }, 0);
    }
  }
}

// Una celda del tema hielo: triángulo lleno, marco triangular, barra en diagonal o «V».
function iceCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const pad = 14;
  const x = x0 + pad, y = y0 + pad, w = CELL - pad * 2, h = CELL - pad * 2;
  const thick = 34 + rand() * 16;
  const up = rand() < 0.5;
  const tip = x + w * (0.2 + rand() * 0.6);
  const tri = up ? [[x, y + h], [x + w, y + h], [tip, y]] : [[x, y], [x + w, y], [tip, y + h]];
  if (kind < 0.35) { paintPoly(t, tri.map(([px, py]) => [x + (px - x) * 0.7 + w * 0.15, y + (py - y) * 0.75 + h * 0.12]), 1); return; }
  if (kind < 0.65) {
    paintPoly(t, tri, 1);
    const inner = shrink(tri, thick);
    paintPoly(t, inner, 0);
    const xs = inner.map((p) => p[0]), ys = inner.map((p) => p[1]);
    t.holes.push({ x: Math.min(...xs) + 20, y: Math.min(...ys) + 10, w: Math.max(...xs) - Math.min(...xs) - 40, h: Math.max(...ys) - Math.min(...ys) - 20, tri: true });
    return;
  }
  if (kind < 0.85) {
    const flip = rand() < 0.5;
    paintPoly(t, bar(x, flip ? y : y + h, x + w, flip ? y + h : y, thick), 1);
    return;
  }
  // «V» (o «Λ»): dos barras que se juntan.
  const mx = x + w / 2;
  paintPoly(t, bar(x, up ? y : y + h, mx, up ? y + h : y, thick), 1);
  paintPoly(t, bar(mx, up ? y + h : y, x + w, up ? y : y + h, thick), 1);
}

// Arma el mapa. Devuelve { W, H, grid, holes, theme }.
export function makeTerrain(seed, players) {
  const { W, H } = sizeFor(players);
  const cols = colsFor(players);
  const rand = seeded(seed);
  const theme = THEMES[Math.floor(rand() * THEMES.length)];
  const t = { W, H, grid: new Uint8Array(W * H), holes: [], theme };
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = MARGIN + col * CELL, y0 = TOP + row * CELL;
      if (theme === 'hielo') iceCell(t, rand, x0, y0); else earthCell(t, rand, x0, y0);
    }
  }
  // Islas bajas, apenas arriba del agua del principio.
  const islands = Math.ceil(cols / 2);
  for (let i = 0; i < islands; i++) {
    const w = 140 + rand() * 160;
    const x = MARGIN + (i + rand() * 0.6) * ((W - MARGIN * 2) / islands);
    paint(t, { x, y: H - 95 - rand() * 25, w, h: 120, r: 30 }, 1);
  }
  return t;
}

// ¿Hay tierra en (x, y)? Fuera del mapa, no.
export function solid(t, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cx >= t.W || cy < 0 || cy >= t.H) return false;
  return t.grid[cy * t.W + cx] === 1;
}

// Cava un círculo. Devuelve el rectángulo tocado (para redibujar solo eso), o null si no tocó nada.
export function carve(t, cx, cy, r) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(t.W - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(t.H - 1, Math.ceil(cy + r));
  if (x0 > x1 || y0 > y1 || r <= 0) return null;
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) t.grid[y * t.W + x] = 0;
    }
  }
  return { x0, y0, x1, y1 };
}

// La primera tierra de arriba para abajo en la columna x, desde `from` (H si no hay).
export function surfaceY(t, x, from = 0) {
  const cx = Math.max(0, Math.min(t.W - 1, Math.floor(x)));
  for (let y = Math.max(0, Math.floor(from)); y < t.H; y++) if (t.grid[y * t.W + cx]) return y;
  return t.H;
}

// Adornos sobre las superficies de arriba: plantas en tierra, picos de hielo en hielo (solo dibujo).
export function decorations(t, seed) {
  const rand = seeded(seed ^ 0xdec0);
  const list = [];
  for (let x = 4; x < t.W - 4; x += 6 + Math.floor(rand() * 16)) {
    for (let y = 1; y < t.H; y++) {
      if (!t.grid[y * t.W + x] || t.grid[(y - 1) * t.W + x]) continue;
      // Que arriba haya aire de verdad (no una cueva chiquita) y que el piso sea parejo.
      let free = true;
      for (let k = 2; k < 22 && free; k++) if (y - k < 0 || t.grid[(y - k) * t.W + x]) free = false;
      if (free && t.grid[y * t.W + x - 3] && t.grid[y * t.W + x + 3] && rand() < 0.55) {
        const r = rand();
        const kind = t.theme === 'hielo' ? (r < 0.6 ? 'spike' : 'crystal') : r < 0.35 ? 'pine' : r < 0.5 ? 'birch' : r < 0.75 ? 'flower' : 'grass';
        list.push({ x, y, kind, s: 0.7 + rand() * 0.6, c: Math.floor(rand() * 3) });
      }
    }
  }
  return list;
}

// Nivel del agua (y) a los `s` segundos de partida: arranca abajo y sube de a poco hasta casi arriba.
// `speed`: 0,6 lenta, 1 normal, 1,6 rápida. Los primeros 30 s no sube (helicópteros y paracaídas).
export function waterY(s, H, speed = 1) {
  const start = H - 40;
  const end = TOP * 0.55;
  const climb = Math.max(0, s - 30) * ((H - TOP) / 230) * speed;
  return Math.max(end, start - climb);
}
