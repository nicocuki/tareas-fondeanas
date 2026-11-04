// El mapa de Cohete Royale, como el de Rocket Bot Royale: formas flotando en el espacio acomodadas en
// una grilla, y abajo unas islas sobre el agua. Hay diez temas (los tres primeros, como en el original):
//   tierra  anillos y «U» huecas con esquinas redondeadas (tierra a cuadros, borde verde, fondo violeta)
//   hielo   triángulos, marcos triangulares y barras en diagonal (blanco con bordes celestes, fondo azul)
//   volcán  un volcán enorme en el medio, con el cráter abierto y cámaras selladas adentro, rodeado de
//           columnas de basalto, arcos y bóvedas (roca negra con vetas de lava, fondo rojo, la lava sube)
//   desierto  mesetas, dunas, arcos de arenisca, obeliscos y tumbas selladas
//   selva     islas con raíces colgando, troncos huecos, árboles enormes y cámaras de raíces
//   océano    ramas de coral, perlas (anillos con boca), arrecifes y almejas cerradas
//   espacio   asteroides, cristales, anillos de estación, cruces de satélite y asteroides con cráter hueco
//   cementerio  lápidas, criptas selladas, árboles muertos, vallas y túmulos
//   ruinas    edificios rotos, pisos apilados, vigas caídas, puentes cortados y búnkeres
//   dulces    donas, bastones de caramelo, tortas por pisos, chupetines y galletas
// Se guarda como grilla de «píxeles» (una casilla = una unidad; y crece hacia abajo) y los cohetes cavan
// círculos. Todo sale de una semilla: todas las pantallas arman el mismo mapa, y como cavar es borrar
// (el orden no importa), con los mismos cráteres quedan iguales. Puro: sin React ni red.

export const CELL = 230;      // cada forma ocupa una celda de la grilla
export const TOP = 190;       // lugar arriba para los helicópteros que traen a los jugadores
const MARGIN = 120;
const ROWS = 4;
export const THEMES = ['tierra', 'hielo', 'volcan', 'desierto', 'selva', 'oceano', 'espacio', 'cementerio', 'ruinas', 'dulces'];

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

// Una celda del tema volcán (afuera del volcán): columna con una losa flotando, arco, bóveda cerrada,
// piedra suelta o escalera.
function basaltCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const pad = 16;
  if (kind < 0.3) {
    const w = 62 + rand() * 34, h = 140 + rand() * 50;
    const x = x0 + (CELL - w) * (0.2 + rand() * 0.6), y = y0 + CELL - h - 6;
    paint(t, { x, y, w, h, r: 14 }, 1);
    paint(t, { x: x - 20 + rand() * 8, y: y - 32, w: w + 40 - rand() * 8, h: 20, r: 9 }, 1);
    return;
  }
  if (kind < 0.48) {
    const w = CELL - pad * 2, h = 150 + rand() * 40, x = x0 + pad, y = y0 + CELL - h - 10;
    const thick = 38 + rand() * 12;
    paint(t, { x, y, w, h, r: 70 }, 1);
    const inner = { x: x + thick, y: y + thick, w: w - thick * 2, h: h - thick + 12, r: 38 }; // se abre por abajo
    paint(t, inner, 0);
    t.holes.push({ x: inner.x, y: inner.y, w: inner.w, h: inner.h - 22 });
    return;
  }
  if (kind < 0.7) {
    // Bóveda cerrada: hay que romper la roca para entrar.
    const w = (CELL - pad * 2) * (0.8 + rand() * 0.2), h = (CELL - pad * 2) * (0.7 + rand() * 0.25);
    const x = x0 + (CELL - w) / 2, y = y0 + (CELL - h) / 2;
    const thick = 40 + rand() * 12;
    paint(t, { x, y, w, h, r: 34 }, 1);
    const inner = { x: x + thick, y: y + thick, w: w - thick * 2, h: h - thick * 2, r: 22 };
    if (inner.w < 36 || inner.h < 36) return;
    paint(t, inner, 0);
    t.holes.push(inner);
    return;
  }
  if (kind < 0.86) {
    const cx = x0 + CELL / 2 + (rand() - 0.5) * 24, cy = y0 + CELL / 2 + (rand() - 0.5) * 24, n = 5 + Math.floor(rand() * 2);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.4, r = CELL * (0.28 + rand() * 0.18);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.85]);
    }
    paintPoly(t, pts, 1);
    return;
  }
  // Escalera de tres escalones.
  const w = 150 + rand() * 40, step = 40;
  const left = rand() < 0.5;
  for (let i = 0; i < 3; i++) {
    const ww = w - i * 44, x = left ? x0 + pad : x0 + CELL - pad - ww;
    paint(t, { x, y: y0 + CELL - pad - step * (i + 1), w: ww, h: step + 2, r: 6 }, 1);
  }
}

// Un círculo (rectángulo redondeado con r = radio).
const disc = (cx, cy, r) => ({ x: cx - r, y: cy - r, w: r * 2, h: r * 2, r });
// Cámara sellada adentro de una forma: hay que romper la roca para entrar (ahí quedan piezas sueltas).
function chamber(t, box, thick, r) {
  const inner = { x: box.x + thick, y: box.y + thick, w: box.w - thick * 2, h: box.h - thick * 2, r };
  if (inner.w < 36 || inner.h < 36) return false;
  paint(t, inner, 0);
  t.holes.push(inner);
  return true;
}
// Un bloque sellado, igual en todos los temas pero con otra redondez (r) y grosor.
function vaultCell(t, rand, x0, y0, r = 34) {
  const pad = 16, w = (CELL - pad * 2) * (0.8 + rand() * 0.2), h = (CELL - pad * 2) * (0.7 + rand() * 0.25);
  const box = { x: x0 + (CELL - w) / 2, y: y0 + (CELL - h) / 2, w, h, r };
  paint(t, box, 1);
  chamber(t, box, 40 + rand() * 12, Math.max(8, r * 0.6));
}

// Desierto: meseta de cima plana, duna, arco de arenisca, obelisco o tumba sellada.
function desertCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const pad = 14;
  if (kind < 0.3) {
    const w = CELL - pad * 2 - rand() * 30, h = 90 + rand() * 60, x = x0 + (CELL - w) / 2, by = y0 + CELL - pad;
    paintPoly(t, [[x, by], [x + w, by], [x + w - 26, by - h], [x + 26, by - h]], 1);
    paint(t, { x: x + 14, y: by - h - 12, w: w - 28, h: 22, r: 8 }, 1);
    return;
  }
  if (kind < 0.5) {
    const x = x0 + pad, w = CELL - pad * 2, base = y0 + CELL - pad, h = 70 + rand() * 60, pts = [[x, base]];
    for (let i = 0; i <= 10; i++) pts.push([x + (w * i) / 10, base - h * Math.sin((Math.PI * i) / 10) ** 1.4]);
    pts.push([x + w, base]);
    paintPoly(t, pts, 1);
    return;
  }
  if (kind < 0.68) {
    const w = CELL - pad * 2, h = 150 + rand() * 30, x = x0 + pad, y = y0 + CELL - h - 8, thick = 42;
    paint(t, { x, y, w, h, r: 60 }, 1);
    paint(t, { x: x + thick, y: y + thick, w: w - thick * 2, h: h - thick + 10, r: 34 }, 0);
    return;
  }
  if (kind < 0.8) {
    const w = 44 + rand() * 20, h = 160 + rand() * 30, x = x0 + (CELL - w) / 2, by = y0 + CELL - 8;
    paintPoly(t, [[x, by], [x + w, by], [x + w * 0.72, by - h], [x + w / 2, by - h - 22], [x + w * 0.28, by - h]], 1);
    return;
  }
  vaultCell(t, rand, x0, y0, 12);
}

// Selva: isla con raíces colgando, tronco hueco abierto de lado a lado, árbol gigante o cámara de raíces.
function jungleCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const pad = 14;
  if (kind < 0.35) {
    const w = CELL - pad * 2 - rand() * 40, h = 46 + rand() * 20, x = x0 + (CELL - w) / 2, y = y0 + 40 + rand() * 40;
    paint(t, { x, y, w, h, r: 22 }, 1);
    const n = 3 + Math.floor(rand() * 3);
    for (let i = 0; i < n; i++) paint(t, { x: x + 14 + rand() * (w - 40), y: y + h - 6, w: 7 + rand() * 4, h: 34 + rand() * 50, r: 3.5 }, 1);
    return;
  }
  if (kind < 0.55) {
    const w = CELL - pad * 2, h = 100 + rand() * 24, x = x0 + pad, y = y0 + (CELL - h) / 2, thick = 32;
    paint(t, { x, y, w, h, r: h / 2 }, 1);
    paint(t, { x: x - 4, y: y + thick, w: w + 8, h: h - thick * 2, r: 0 }, 0);
    t.holes.push({ x: x + 30, y: y + thick, w: w - 60, h: h - thick * 2 });
    return;
  }
  if (kind < 0.72) {
    const tw = 40 + rand() * 20, th = 130 + rand() * 40, tx = x0 + (CELL - tw) / 2, by = y0 + CELL - 6;
    paint(t, { x: tx, y: by - th, w: tw, h: th, r: 12 }, 1);
    const cx = tx + tw / 2, cy = by - th;
    paint(t, disc(cx, cy, 52 + rand() * 12), 1);
    paint(t, disc(cx - 46, cy + 12, 34), 1);
    paint(t, disc(cx + 46, cy + 16, 32), 1);
    return;
  }
  vaultCell(t, rand, x0, y0, 56);
}

// Océano: rama de coral con tres puntas, perla (anillo con boca), arrecife con arco, abanico o almeja sellada.
function coralCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const pad = 14, cx = x0 + CELL / 2, by = y0 + CELL - 8;
  if (kind < 0.32) {
    const th = 30 + rand() * 8, h = 130 + rand() * 40;
    paintPoly(t, bar(cx, by, cx, by - h, th), 1);
    paintPoly(t, bar(cx, by - h * 0.45, cx - 70, by - h * 0.9, th * 0.8), 1);
    paintPoly(t, bar(cx, by - h * 0.55, cx + 66, by - h * 0.95, th * 0.8), 1);
    return;
  }
  if (kind < 0.55) {
    const r = 74 + rand() * 12, cy = y0 + CELL / 2 + (rand() - 0.5) * 20, thick = 34;
    paint(t, disc(cx, cy, r), 1);
    const inner = disc(cx, cy, r - thick);
    paint(t, inner, 0);
    t.holes.push(inner);
    const side = rand() < 0.5 ? -1 : 1;
    paint(t, { x: side < 0 ? cx - r - 2 : cx + r - thick - 2, y: cy - 24, w: thick + 4, h: 48, r: 0 }, 0);
    return;
  }
  if (kind < 0.72) {
    const w = CELL - pad * 2, h = 110 + rand() * 30, x = x0 + pad;
    paint(t, { x, y: by - h, w, h: h + 6, r: 40 }, 1);
    paint(t, { x: cx - 30, y: by - h * 0.55, w: 60, h: h * 0.55 + 8, r: 28 }, 0);
    return;
  }
  if (kind < 0.84) {
    for (let i = -2; i <= 2; i++) paintPoly(t, bar(cx, by, cx + i * 38, by - 110 + Math.abs(i) * 16, 22), 1);
    return;
  }
  vaultCell(t, rand, x0, y0, 64);
}

// Espacio: asteroide, asteroide con cráter hueco, cristal, anillo de estación o cruz de satélite.
function spaceCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const cx = x0 + CELL / 2 + (rand() - 0.5) * 20, cy = y0 + CELL / 2 + (rand() - 0.5) * 20;
  if (kind < 0.4) {
    const n = 7 + Math.floor(rand() * 3), pts = [], R = CELL * (0.3 + rand() * 0.12);
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + rand() * 0.3, r = R * (0.72 + rand() * 0.4); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.86]); }
    paintPoly(t, pts, 1);
    return;
  }
  if (kind < 0.58) {
    const r = 80 + rand() * 12;
    paint(t, disc(cx, cy, r), 1);
    const inner = disc(cx + (rand() - 0.5) * 14, cy + (rand() - 0.5) * 14, r - 38 - rand() * 6);
    paint(t, inner, 0);
    t.holes.push(inner);
    return;
  }
  if (kind < 0.72) {
    const w = 52 + rand() * 18, h = 150 + rand() * 30;
    paintPoly(t, [[cx, cy - h / 2 - 20], [cx + w / 2, cy - h * 0.15], [cx + w * 0.38, cy + h / 2], [cx - w * 0.38, cy + h / 2], [cx - w / 2, cy - h * 0.15]], 1);
    return;
  }
  if (kind < 0.86) {
    const r = 76, thick = 28;
    paint(t, disc(cx, cy, r), 1);
    paint(t, disc(cx, cy, r - thick), 0);
    t.holes.push(disc(cx, cy, r - thick));
    paint(t, { x: cx - 22, y: cy - r - 2, w: 44, h: thick + 4, r: 0 }, 0);
    paint(t, { x: cx - 22, y: cy + r - thick - 2, w: 44, h: thick + 4, r: 0 }, 0);
    return;
  }
  paintPoly(t, bar(cx - 80, cy, cx + 80, cy, 28), 1);
  paintPoly(t, bar(cx, cy - 80, cx, cy + 80, 28), 1);
  paint(t, disc(cx, cy, 30), 1);
}

// Cementerio: lápida, cripta sellada con techo a dos aguas, árbol muerto, valla de hierro o túmulo.
function graveCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const pad = 14, cx = x0 + CELL / 2, by = y0 + CELL - 8;
  if (kind < 0.3) {
    const w = 70 + rand() * 24, h = 130 + rand() * 40;
    paint(t, { x: cx - w / 2, y: by - h, w, h: h + 6, r: w / 2 }, 1);
    paint(t, { x: cx - w / 2 - 14, y: by - 18, w: w + 28, h: 24, r: 6 }, 1);
    return;
  }
  if (kind < 0.55) {
    const w = CELL - pad * 2, h = 120 + rand() * 20, x = x0 + pad, y = by - h;
    paint(t, { x, y, w, h: h + 6, r: 6 }, 1);
    paintPoly(t, [[x - 10, y + 6], [x + w + 10, y + 6], [cx, y - 56]], 1);
    chamber(t, { x, y, w, h: h + 6 }, 36, 8);
    return;
  }
  if (kind < 0.72) {
    const th = 22 + rand() * 8, h = 150 + rand() * 30;
    paintPoly(t, bar(cx, by, cx + 4, by - h, th), 1);
    paintPoly(t, bar(cx + 2, by - h * 0.55, cx - 64, by - h * 0.95, th * 0.55), 1);
    paintPoly(t, bar(cx + 3, by - h * 0.7, cx + 60, by - h * 1.05, th * 0.5), 1);
    return;
  }
  if (kind < 0.84) {
    for (let i = -3; i <= 3; i++) {
      const x = cx + i * 28;
      paintPoly(t, [[x - 6, by], [x + 6, by], [x + 6, by - 100], [x, by - 124], [x - 6, by - 100]], 1);
    }
    paint(t, { x: cx - 100, y: by - 66, w: 200, h: 12, r: 3 }, 1);
    return;
  }
  vaultCell(t, rand, x0, y0, 22);
}

// Ruinas: edificio con un mordisco, pisos apilados, viga caída, puente cortado o búnker sellado.
function ruinsCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const pad = 14, cx = x0 + CELL / 2, by = y0 + CELL - 6;
  if (kind < 0.32) {
    const w = 110 + rand() * 40, h = 170 + rand() * 24, x = cx - w / 2;
    paint(t, { x, y: by - h, w, h, r: 4 }, 1);
    paint(t, { x: x + w * 0.45, y: by - h - 4, w: w * 0.7, h: 60 + rand() * 30, r: 0 }, 0);
    for (let i = 0; i < 2; i++) paint(t, { x: x + 22 + i * (w / 2 - 6), y: by - h + 46, w: 26, h: 34, r: 0 }, 0);
    return;
  }
  if (kind < 0.52) {
    for (let i = 0; i < 3; i++) paint(t, { x: x0 + pad + (i % 2) * 14, y: by - 40 - i * 62, w: CELL - pad * 2 - (i % 2) * 28, h: 18, r: 3 }, 1);
    for (const dx of [-1, 1]) paint(t, { x: cx + dx * 70 - 8, y: by - 190, w: 16, h: 190, r: 3 }, 1);
    return;
  }
  if (kind < 0.66) {
    paintPoly(t, bar(x0 + pad, by - 20, x0 + CELL - pad, by - 120, 24), 1);
    paint(t, { x: x0 + pad, y: by - 14, w: 70, h: 18, r: 3 }, 1);
    return;
  }
  if (kind < 0.8) {
    const y = y0 + CELL / 2;
    paint(t, { x: x0 + pad, y, w: 78, h: 26, r: 4 }, 1);
    paint(t, { x: x0 + CELL - pad - 70, y: y - 6, w: 70, h: 26, r: 4 }, 1);
    paint(t, { x: x0 + pad + 8, y: y + 26, w: 18, h: 70, r: 3 }, 1);
    return;
  }
  vaultCell(t, rand, x0, y0, 6);
}

// Dulces: dona, bastón de caramelo, torta de tres pisos, chupetín o galleta.
function candyCell(t, rand, x0, y0) {
  const kind = rand();
  if (kind < 0.1) return;
  const pad = 14, cx = x0 + CELL / 2, by = y0 + CELL - 6;
  if (kind < 0.34) {
    const r = 78 + rand() * 10, cy = y0 + CELL / 2, hole = 30 + rand() * 8;
    paint(t, disc(cx, cy, r), 1);
    paint(t, disc(cx, cy, hole), 0);
    t.holes.push(disc(cx, cy, hole));
    if (rand() < 0.5) paint(t, { x: cx - 18, y: cy - r - 2, w: 36, h: r - hole + 4, r: 0 }, 0); // un mordisco: se abre
    return;
  }
  if (kind < 0.5) {
    paintPoly(t, bar(cx - 20, by, cx - 20, by - 150, 30), 1);
    paint(t, { x: cx - 20, y: by - 196, w: 96, h: 96, r: 48 }, 1);
    paint(t, { x: cx + 4, y: by - 172, w: 48, h: 48, r: 24 }, 0);
    return;
  }
  if (kind < 0.68) {
    for (let i = 0; i < 3; i++) paint(t, { x: cx - (96 - i * 24), y: by - 44 - i * 48, w: (96 - i * 24) * 2, h: 46, r: 12 }, 1);
    return;
  }
  if (kind < 0.82) {
    paint(t, { x: cx - 7, y: by - 120, w: 14, h: 126, r: 5 }, 1);
    paint(t, disc(cx, by - 150, 52 + rand() * 8), 1);
    return;
  }
  const r = 62 + rand() * 14;
  paint(t, disc(cx, y0 + CELL / 2, r), 1);
  paint(t, disc(cx - r * 0.85, y0 + CELL / 2 - r * 0.6, 24), 1);
  if (rand() < 0.5) vaultCell(t, rand, x0, y0, 70);
}

// El volcán del medio: cono con el cráter abierto arriba, una chimenea tapada por un tapón de roca y,
// debajo, la cámara de magma sellada (el tesoro grande). Cuatro bóvedas más chicas en los flancos,
// cornisas para trepar y dos cuernos en el borde del cráter.
function volcano(t, rand) {
  const cx = Math.round(t.W / 2);
  const half = Math.min(430, (t.W - MARGIN * 2) * 0.3);
  const halfTop = half * 0.36;
  const top = TOP + 95, base = t.H - 70;
  const halfAt = (y) => halfTop + ((y - top) / (base - top)) * (half - halfTop);
  // Isla ancha abajo y cono con los flancos un poco irregulares.
  paint(t, { x: cx - half - 120, y: t.H - 110, w: (half + 120) * 2, h: 130, r: 40 }, 1);
  const left = [], right = [];
  for (let k = 0; k <= 6; k++) {
    const y = base - (k * (base - top)) / 6;
    left.push([cx - halfAt(y) - (k % 2 ? rand() * 16 : 0), y]);
    right.push([cx + halfAt(y) + (k % 2 ? rand() * 16 : 0), y]);
  }
  paintPoly(t, [...left, ...right.reverse()], 1);
  // Cornisas en los flancos.
  for (const [dy, side] of [[300, -1], [470, 1], [640, -1]]) {
    const y = top + dy;
    paint(t, { x: side < 0 ? cx - halfAt(y) - 46 : cx + halfAt(y) - 34, y, w: 80, h: 26, r: 10 }, 1);
  }
  // Cráter abierto y cuernos.
  const rim = halfTop * 0.78;
  paintPoly(t, [[cx - rim, top - 4], [cx + rim, top - 4], [cx + rim * 0.55, top + 140], [cx - rim * 0.55, top + 140]], 0);
  for (const s of [-1, 1]) paintPoly(t, [[cx + s * (halfTop + 6), top + 12], [cx + s * (halfTop - 30), top - 78], [cx + s * (halfTop - 58), top + 12]], 1);
  // Chimenea que baja del cráter y se frena en un tapón de roca, y la cámara de magma.
  const cyc = top + 380;
  paint(t, { x: cx - 28, y: top + 130, w: 56, h: cyc - 30 - (top + 130), r: 0 }, 0);
  const chamber = { x: cx - 125, y: cyc, w: 250, h: 210, r: 90 };
  paint(t, chamber, 0);
  t.holes.push(chamber);
  // Bóvedas selladas en los flancos.
  for (const [dy, k, w, h] of [[230, 0.5, 80, 70], [560, 0.58, 100, 84]]) {
    const y = top + dy, off = halfAt(y) * k;
    for (const s of [-1, 1]) {
      const v = { x: cx + s * off - w / 2, y, w, h, r: 30 };
      paint(t, v, 0);
      t.holes.push(v);
    }
  }
}

const CELLS = { desierto: desertCell, selva: jungleCell, oceano: coralCell, espacio: spaceCell, cementerio: graveCell, ruinas: ruinsCell, dulces: candyCell };

// El tema que le toca a una semilla (es lo primero que sale de su sucesión al azar).
export const themeFor = (seed) => THEMES[Math.floor(seeded(seed)() * THEMES.length)];

// Arma el mapa. Devuelve { W, H, grid, holes, theme }.
export function makeTerrain(seed, players) {
  const { W, H } = sizeFor(players);
  const cols = colsFor(players);
  const rand = seeded(seed);
  const theme = THEMES[Math.floor(rand() * THEMES.length)]; // = themeFor(seed)
  const t = { W, H, grid: new Uint8Array(W * H), holes: [], theme };
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = MARGIN + col * CELL, y0 = TOP + row * CELL;
      if (theme === 'hielo') iceCell(t, rand, x0, y0);
      else if (theme in CELLS) CELLS[theme](t, rand, x0, y0);
      else if (theme === 'volcan') { if (Math.abs(x0 + CELL / 2 - W / 2) >= Math.min(430, (W - MARGIN * 2) * 0.3) + CELL * 0.35) basaltCell(t, rand, x0, y0); }
      else earthCell(t, rand, x0, y0);
    }
  }
  if (theme === 'volcan') volcano(t, rand);
  // Islas bajas, apenas arriba del agua (o de la lava) del principio.
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

// Qué adorno sale en cada tema nuevo: [tipo, hasta qué valor al azar].
const DECO = {
  desierto: [['cactus', 0.55], ['dry', 1]],
  selva: [['palm', 0.3], ['fern', 0.7], ['mushroom', 1]],
  oceano: [['coral', 0.5], ['kelp', 1]],
  espacio: [['gem', 0.6], ['flag', 1]],
  cementerio: [['tomb', 0.4], ['cross', 0.7], ['bare', 1]],
  ruinas: [['rebar', 0.35], ['cone', 0.55], ['rubble', 1]],
  dulces: [['lolli', 0.35], ['gumdrop', 0.7], ['cane', 1]],
};

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
        const kind = DECO[t.theme] ? DECO[t.theme].find(([, lim]) => r < lim)[0] : t.theme === 'volcan' ? (r < 0.6 ? 'shard' : 'vent') : t.theme === 'hielo' ? (r < 0.6 ? 'spike' : 'crystal') : r < 0.35 ? 'pine' : r < 0.5 ? 'birch' : r < 0.75 ? 'flower' : 'grass';
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
