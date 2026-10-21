// Movimiento y vista de Entre Nosotros, sin React ni red. Unidades: casillas del mapa y segundos.
import { H, W, isBlocked, isOpaque } from './map.js';

export const HALF = 0.36;        // medio ancho de la caja de choque (a la altura de los pies)
export const BASE_SPEED = 6.5;   // casillas por segundo con velocidad ×1
export const BASE_VISION = 7.5;  // radio de la vista con visión ×1
export const LIGHTS_OUT = 0.25;  // con las luces saboteadas, los tripulantes ven esta fracción

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ¿La caja de choque centrada en (x, y) toca alguna casilla que no se puede pisar?
export function boxFree(x, y) {
  const x0 = Math.floor(x - HALF), x1 = Math.floor(x + HALF);
  const y0 = Math.floor(y - HALF), y1 = Math.floor(y + HALF);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (isBlocked(cx, cy)) return false;
  return true;
}

// Un paso del jugador. `dir` = { x, y } con lo que se aprieta (−1, 0 o 1); `speed` en casillas/s.
// Los fantasmas atraviesan todo, pero no se salen del mapa. Se mueve primero en x y después en y,
// así se desliza contra las paredes en vez de frenarse.
export function step(p, dir, dt, { speed, ghost }) {
  const len = Math.hypot(dir.x, dir.y);
  const vx = len ? (dir.x / len) * speed : 0;
  const vy = len ? (dir.y / len) * speed : 0;
  p.vx = vx;
  p.vy = vy;
  if (vx) p.facing = vx > 0 ? 1 : -1;
  if (ghost) {
    p.x = clamp(p.x + vx * dt, 1, W - 1);
    p.y = clamp(p.y + vy * dt, 1, H - 1);
    return;
  }
  p.x = slide(p.x, p.y, vx * dt, true);
  p.y = slide(p.y, p.x, vy * dt, false);
}

function slide(pos, other, d, horizontal) {
  if (!d) return pos;
  const next = pos + d;
  const free = horizontal ? boxFree(next, other) : boxFree(other, next);
  if (free) return next;
  // Hasta el borde de la casilla que frena.
  const edge = d > 0 ? Math.floor(next + HALF) - HALF - 0.001 : Math.floor(next - HALF) + 1 + HALF + 0.001;
  const ok = horizontal ? boxFree(edge, other) : boxFree(other, edge);
  return ok && (d > 0 ? edge >= pos : edge <= pos) ? edge : pos;
}

// Hasta dónde llega un rayo desde (x, y) en la dirección (dx, dy) antes de chocar una pared (DDA).
export function castRay(x, y, dx, dy, max) {
  let cx = Math.floor(x), cy = Math.floor(y);
  const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx ? Math.abs(1 / dx) : Infinity;
  const tDeltaY = dy ? Math.abs(1 / dy) : Infinity;
  let tMaxX = dx ? (dx > 0 ? cx + 1 - x : x - cx) * tDeltaX : Infinity;
  let tMaxY = dy ? (dy > 0 ? cy + 1 - y : y - cy) * tDeltaY : Infinity;
  let t = 0;
  while (t < max) {
    if (tMaxX < tMaxY) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; }
    else { t = tMaxY; tMaxY += tDeltaY; cy += stepY; }
    if (t >= max) return max;
    if (isOpaque(cx, cy)) return t;
  }
  return max;
}

// El polígono de lo que se ve desde (x, y): un rayo cada tanto, cortado por las paredes.
export function visionPolygon(x, y, radius, rays = 240) {
  const pts = [];
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    const d = castRay(x, y, dx, dy, radius);
    // Un poquito más allá del borde, así se ve la cara de la pared que frena el rayo.
    const e = d < radius ? Math.min(radius, d + 0.6) : d;
    pts.push(x + dx * e, y + dy * e);
  }
  return pts;
}

// ¿Desde (x1, y1) se ve el punto (x2, y2)? Dentro del radio y sin paredes en el medio.
export function canSee(x1, y1, x2, y2, radius) {
  const d = Math.hypot(x2 - x1, y2 - y1);
  if (d > radius) return false;
  if (d < 0.01) return true;
  return castRay(x1, y1, (x2 - x1) / d, (y2 - y1) / d, d) >= d - 0.05;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
