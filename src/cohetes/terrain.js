// El terreno de Cohete Royale: una isla con colinas, como en Rocket Bot Royale, guardada como grilla de
// «píxeles» (una casilla = una unidad del mundo; el mundo crece hacia abajo). Los cohetes cavan
// círculos. Todo sale de una semilla: todas las pantallas arman la misma isla, y como cavar es borrar
// (el orden no importa), con los mismos cráteres quedan iguales. Puro: sin React ni red.

export const H = 520;

// Ancho según cuántos juegan: con 25 hace falta lugar.
export const widthFor = (players) => Math.round(Math.max(900, Math.min(2400, 700 + players * 70)));

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

const smooth = (t) => t * t * (3 - 2 * t);

// Arma la isla: colinas (suma de senos con fases al azar), bordes que bajan al mar y algunas rocas
// flotando. `grid[y * W + x]` = 1 si hay tierra.
export function makeTerrain(seed, players) {
  const W = widthFor(players);
  const rand = seeded(seed);
  const waves = Array.from({ length: 5 }, (_, i) => ({ f: (i + 1) * (1.2 + rand() * 1.6), a: (70 / (i + 1)) * (0.6 + rand() * 0.8), p: rand() * Math.PI * 2 }));
  const surface = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    const t = x / W;
    let h = H * 0.5;
    for (const w of waves) h += Math.sin(t * Math.PI * 2 * w.f + w.p) * w.a;
    // Los bordes de la isla bajan hasta el agua.
    const edge = Math.min(x, W - 1 - x) / (W * 0.09);
    if (edge < 1) h += (1 - smooth(edge)) * H * 0.45;
    surface[x] = Math.max(H * 0.22, Math.min(H - 4, h));
  }
  const grid = new Uint8Array(W * H);
  for (let x = 0; x < W; x++) for (let y = Math.floor(surface[x]); y < H; y++) grid[y * W + x] = 1;
  const t = { W, H, grid };
  // Rocas flotando (para tener dónde subirse) y alguna cueva.
  const rocks = Math.round(W / 300);
  for (let i = 0; i < rocks; i++) {
    const x = W * (0.15 + rand() * 0.7);
    const y = surface[Math.floor(x)] - 70 - rand() * 60;
    const r = 14 + rand() * 12;
    fillEllipse(t, x, y, r * 1.8, r);
  }
  for (let i = 0; i < Math.round(W / 500); i++) {
    const x = W * (0.2 + rand() * 0.6);
    carve(t, x, surface[Math.floor(x)] + 50 + rand() * 40, 18 + rand() * 10);
  }
  return t;
}

function fillEllipse(t, cx, cy, rx, ry) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      if (x < 0 || y < 0 || x >= t.W || y >= t.H) continue;
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) t.grid[y * t.W + x] = 1;
    }
  }
}

// ¿Hay tierra en (x, y)? Fuera de los costados y arriba no hay; abajo de todo, sí.
export function solid(t, x, y) {
  const cx = Math.floor(x), cy = Math.floor(y);
  if (cx < 0 || cx >= t.W || cy < 0) return false;
  if (cy >= t.H) return true;
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

// La primera tierra de arriba para abajo en la columna x (H si no hay).
export function surfaceY(t, x) {
  const cx = Math.max(0, Math.min(t.W - 1, Math.floor(x)));
  for (let y = 0; y < t.H; y++) if (t.grid[y * t.W + cx]) return y;
  return t.H;
}

// Nivel del agua (y) a los `s` segundos de partida: arranca abajo y sube de a poco, hasta tapar casi todo.
// `speed`: 0,6 lenta, 1 normal, 1,6 rápida.
export function waterY(s, speed = 1) {
  const start = H - 30;
  const end = H * 0.12;
  const climb = Math.max(0, s - 20) * 1.15 * speed; // 20 s de gracia al empezar
  return Math.max(end, start - climb);
}
