// El mapa de Cohete Royale, como el de Rocket Bot Royale: bloques flotando en el espacio (anillos y «U»
// huecas con las esquinas redondeadas) acomodados en una grilla, y abajo unas islas sobre el agua. Se
// guarda como grilla de «píxeles» (una casilla = una unidad; y crece hacia abajo) y los cohetes cavan
// círculos. Todo sale de una semilla: todas las pantallas arman el mismo mapa, y como cavar es borrar
// (el orden no importa), con los mismos cráteres quedan iguales. Puro: sin React ni red.

export const CELL = 230;      // cada bloque ocupa una celda de la grilla
export const TOP = 170;       // lugar arriba para la nave que trae a los jugadores
export const SHIP_Y = 80;     // altura por la que pasa la nave
const MARGIN = 120;
const ROWS = 4;

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

// Arma el mapa. Devuelve { W, H, grid, holes } (`holes`: el hueco de cada anillo, para las monedas).
export function makeTerrain(seed, players) {
  const { W, H } = sizeFor(players);
  const cols = colsFor(players);
  const rand = seeded(seed);
  const t = { W, H, grid: new Uint8Array(W * H), holes: [] };
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < cols; col++) {
      const kind = rand();
      if (kind < 0.12) continue; // celda vacía
      const w = CELL * (0.68 + rand() * 0.27), h = CELL * (0.62 + rand() * 0.3);
      const x = MARGIN + col * CELL + (CELL - w) * rand();
      const y = TOP + row * CELL + (CELL - h) * rand();
      const thick = 38 + rand() * 18;
      const outer = { x, y, w, h, r: 26 + rand() * 18 };
      paint(t, outer, 1);
      if (kind < 0.22) continue; // bloque lleno
      const inner = { x: x + thick, y: y + thick, w: w - thick * 2, h: h - thick * 2, r: Math.max(8, outer.r - thick * 0.5) };
      if (inner.w < 30 || inner.h < 30) continue;
      paint(t, inner, 0);
      t.holes.push(inner);
      // Algunas son «U»: el anillo con un lado abierto.
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
  if (x0 > x1 || y0 > y1) return null;
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

// Plantitas sobre las superficies de arriba: pinos, abedules, flores y pasto (solo dibujo).
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
        list.push({ x, y, kind: r < 0.35 ? 'pine' : r < 0.5 ? 'birch' : r < 0.75 ? 'flower' : 'grass', s: 0.7 + rand() * 0.6, c: Math.floor(rand() * 3) });
      }
    }
  }
  return list;
}

// Nivel del agua (y) a los `s` segundos de partida: arranca abajo y sube de a poco hasta casi arriba.
// `speed`: 0,6 lenta, 1 normal, 1,6 rápida. Los primeros 30 s no sube (la nave y los paracaídas).
export function waterY(s, H, speed = 1) {
  const start = H - 40;
  const end = TOP * 0.6;
  const climb = Math.max(0, s - 30) * ((H - TOP) / 230) * speed;
  return Math.max(end, start - climb);
}
