// Royale 3D: movimiento, choques y tiros. Todo puro (sin React, sin red, sin Three.js): cada pantalla
// simula a su propio jugador con esto, y los tiros se juzgan acá mismo. Sin `Math.random()`.
import { WADE_MIN, WORLD_R, heightAt } from './map.js';

export const STEP = 1 / 60;
export const COUNTDOWN_MS = 6000;     // de la sala de espera a poder moverse
export const PLAYER_R = 0.45;
export const PLAYER_H = 1.8;
export const EYE_H = 1.55;
export const MAX_HP = 100;
export const WALK = 5.5;
export const SPRINT = 8.2;
export const JUMP_V = 7.2;
export const GRAVITY = 21;
export const FIRE_GAP = 0.13;         // segundos entre tiros
export const MAG = 30;
export const RELOAD_S = 1.7;
export const RANGE = 140;
export const DAMAGE = 14;
export const HEAD_MULT = 2;
export const HIT_R = 0.55;            // qué tan ancho es el cuerpo para un tiro
export const HEAD_Y = 1.42;           // por encima de esto (desde los pies) es la cabeza

export const newPlayer = (spawn) => ({
  x: spawn.x, y: 0, z: spawn.z, vy: 0, yaw: spawn.yaw, pitch: 0,
  hp: MAX_HP, ammo: MAG, reloadUntil: 0, nextShot: 0, grounded: false, moving: false, dead: false,
});

// Pone al jugador sobre el piso de su semilla.
export function groundPlayer(seed, p) { p.y = heightAt(seed, p.x, p.z); p.grounded = true; return p; }

// Empuja el círculo (x, z, PLAYER_R) fuera de los árboles, rocas y cabañas.
function pushOut(world, p) {
  for (const list of [world.trees, world.rocks]) {
    for (const o of list) {
      if (p.y > o.y + o.h - 0.1) continue; // por arriba de una roca baja se pasa saltando
      const dx = p.x - o.x, dz = p.z - o.z, min = o.r + PLAYER_R;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.0001;
      p.x = o.x + (dx / d) * min; p.z = o.z + (dz / d) * min;
    }
  }
  for (const c of world.cabins) {
    const hx = c.w / 2, hz = c.d / 2;
    const nx = Math.max(c.x - hx, Math.min(p.x, c.x + hx)), nz = Math.max(c.z - hz, Math.min(p.z, c.z + hz));
    const dx = p.x - nx, dz = p.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= PLAYER_R * PLAYER_R) continue;
    if (d2 > 0.000001) {
      const d = Math.sqrt(d2);
      p.x = nx + (dx / d) * PLAYER_R; p.z = nz + (dz / d) * PLAYER_R;
    } else { // adentro de la caja: salir por el lado más cercano
      const out = [[p.x - (c.x - hx), 'l'], [c.x + hx - p.x, 'r'], [p.z - (c.z - hz), 'b'], [c.z + hz - p.z, 'f']].sort((a, b) => a[0] - b[0])[0][1];
      if (out === 'l') p.x = c.x - hx - PLAYER_R; else if (out === 'r') p.x = c.x + hx + PLAYER_R;
      else if (out === 'b') p.z = c.z - hz - PLAYER_R; else p.z = c.z + hz + PLAYER_R;
    }
  }
}

// Un paso de movimiento. `input`: { f, b, l, r (adelante, atrás, izquierda, derecha), jump, sprint }.
// Adelante es (-sin yaw, -cos yaw), como mira una cámara de Three.js con rotation.y = yaw.
export function stepPlayer(p, input, dt, world) {
  const seed = world.seed;
  const fwd = (input.f ? 1 : 0) - (input.b ? 1 : 0), side = (input.r ? 1 : 0) - (input.l ? 1 : 0);
  p.moving = Boolean(fwd || side);
  if (p.moving) {
    const len = Math.hypot(fwd, side);
    const speed = input.sprint ? SPRINT : WALK;
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    const mx = (-sy * fwd + cy * side) / len, mz = (-cy * fwd - sy * side) / len;
    const air = p.grounded ? 1 : 0.7;
    for (const [dx, dz] of [[mx * speed * air * dt, 0], [0, mz * speed * air * dt]]) {
      const nx = p.x + dx, nz = p.z + dz;
      if (nx * nx + nz * nz > WORLD_R * WORLD_R || heightAt(seed, nx, nz) < WADE_MIN) continue;
      // Las lomas muy empinadas no se suben caminando (más de medio metro de un paso).
      if (p.grounded && heightAt(seed, nx, nz) - p.y > 0.6) continue;
      p.x = nx; p.z = nz;
    }
  }
  if (input.jump && p.grounded) { p.vy = JUMP_V; p.grounded = false; }
  p.vy -= GRAVITY * dt;
  p.y += p.vy * dt;
  pushOut(world, p);
  const ground = heightAt(seed, p.x, p.z);
  if (p.y <= ground) { p.y = ground; p.vy = 0; p.grounded = true; } else if (p.y > ground + 0.08) p.grounded = false;
}

// ─── Tiros ───────────────────────────────────────────────────────────────────
// Un punto del rayo ¿pegó contra el terreno o contra algo sólido?
export function solidAt(world, x, y, z) {
  if (y < heightAt(world.seed, x, z)) return true;
  for (const o of world.trees) if (y < o.y + o.h && y > o.y && (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return true;
  for (const o of world.rocks) if (y < o.y + o.h && y > o.y && (x - o.x) ** 2 + (z - o.z) ** 2 < o.r * o.r) return true;
  for (const c of world.cabins) if (y < c.y + c.h && y > c.y - 1 && Math.abs(x - c.x) < c.w / 2 && Math.abs(z - c.z) < c.d / 2) return true;
  return false;
}

// Hasta dónde llega un rayo antes de chocar (o `max`): se camina de a medio metro.
export function rayLength(world, o, d, max = RANGE) {
  let t = 0;
  for (; t < max; t += 0.5) if (solidAt(world, o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)) return Math.max(0, t - 0.25);
  return max;
}

export const unit = (v) => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };

// Hacia dónde mira la cámara (yaw y pitch), como vector.
export const lookDir = (yaw, pitch) => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });

export const eyeOf = (p) => ({ x: p.x, y: p.y + EYE_H, z: p.z });

// Cámara por encima del hombro: detrás y arriba del jugador, y nunca adentro del terreno.
export function cameraFor(world, p, dist = 3.6) {
  const dir = lookDir(p.yaw, p.pitch);
  const eye = eyeOf(p);
  const right = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
  const base = { x: eye.x + right.x * 0.7, y: eye.y + 0.25, z: eye.z + right.z * 0.7 };
  const back = unit({ x: -dir.x, y: -dir.y, z: -dir.z });
  const len = Math.min(dist, rayLength(world, base, back, dist));
  const pos = { x: base.x + back.x * len, y: base.y + back.y * len, z: base.z + back.z * len };
  const ground = heightAt(world.seed, pos.x, pos.z) + 0.35;
  if (pos.y < ground) pos.y = ground;
  return { pos, dir };
}

// El tiro sale del ojo del jugador hacia donde apunta la mira de la cámara.
export function aimShot(world, p) {
  const { pos, dir } = cameraFor(world, p);
  // La mira de la cámara: el punto que se ve en el medio de la pantalla (empezando por delante del jugador).
  const eye = eyeOf(p);
  const start = { x: pos.x + dir.x * 3.7, y: pos.y + dir.y * 3.7, z: pos.z + dir.z * 3.7 };
  const len = rayLength(world, start, dir, RANGE);
  const target = { x: start.x + dir.x * len, y: start.y + dir.y * len, z: start.z + dir.z * len };
  return { o: eye, d: unit({ x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z }) };
}

// ¿A quién le da este tiro? `targets`: [{ id, x, y, z }] (los pies). Devuelve { id, head, dist } o null.
// Frena en lo primero sólido que encuentra el rayo.
export function hitscan(world, o, d, targets, max = RANGE) {
  const wall = rayLength(world, o, d, max);
  let best = null;
  for (const t of targets) {
    for (let s = 0; s <= wall; s += 0.25) {
      const px = o.x + d.x * s, py = o.y + d.y * s, pz = o.z + d.z * s;
      const dy = py - t.y;
      if (dy < 0 || dy > PLAYER_H) continue;
      if ((px - t.x) ** 2 + (pz - t.z) ** 2 > HIT_R * HIT_R) continue;
      if (!best || s < best.dist) best = { id: t.id, head: dy > HEAD_Y, dist: s };
      break;
    }
  }
  return best;
}

export const damageFor = (head) => Math.round(DAMAGE * (head ? HEAD_MULT : 1));

// Recarga y disparo: `now` en segundos. Devuelve true si el tiro salió.
export function tryShoot(p, now) {
  if (p.dead || now < p.nextShot || now < p.reloadUntil) return false;
  if (p.ammo <= 0) { startReload(p, now); return false; }
  p.ammo -= 1;
  p.nextShot = now + FIRE_GAP;
  return true;
}
export function startReload(p, now) {
  if (p.ammo >= MAG || now < p.reloadUntil) return false;
  p.reloadUntil = now + RELOAD_S;
  return true;
}
export function finishReload(p, now) {
  if (p.reloadUntil && now >= p.reloadUntil) { p.reloadUntil = 0; p.ammo = MAG; return true; }
  return false;
}
