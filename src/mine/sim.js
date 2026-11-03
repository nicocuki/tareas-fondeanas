// Cubolandia: la simulación de cada pantalla. Física del jugador contra la grilla del mundo, picar,
// hambre y vida, ítems en el piso, bichos, luz y día. Todo puro: sin red ni React, y sin
// Math.random() ni reloj propios (reciben `rand` y los tiempos).
import { B, BLOCKS, ITEMS, breakInfo, isFluid, isSolid, reduceDamage } from './blocks.js';
import { H, W, at } from './world.js';

export const STEP = 1 / 120;
export const GRAVITY = 30;
export const JUMP = 8.7;
export const WALK = 4.3;
export const SPRINT = 5.7;
export const SNEAK = 1.5;
export const PLAYER_W = 0.6;
export const PLAYER_H = 1.8;
export const SNEAK_H = 1.5;
export const REACH = 5;
export const ATTACK_REACH = 3.6;
export const ATTACK_GAP = 0.5;
export const MAX_HP = 20;
export const DAY_S = 480; // un día entero (de amanecer a amanecer), en segundos
export const LOCATOR_RANGE = 160;
const EPS = 1e-4;

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function hash01(x, y, t) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(t | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// ─── Colisiones ──────────────────────────────────────────────────────────────
// Una caja de ancho `hw * 2` y alto `h` con los pies en (x, y). y crece hacia abajo.
function boxHits(w, x, y, hw, h) {
  const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - EPS), y0 = Math.floor(y - h), y1 = Math.floor(y - EPS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (isSolid(at(w, tx, ty))) return true;
  return false;
}
// ¿La caja (agrandada un poco) toca un bloque de ese tipo?
function touches(w, x, y, hw, h, id) {
  const x0 = Math.floor(x - hw - 0.06), x1 = Math.floor(x + hw + 0.06), y0 = Math.floor(y - h), y1 = Math.floor(y - EPS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (at(w, tx, ty) === id) return true;
  return false;
}

export function newPlayer(x, y) {
  return {
    x, y, vx: 0, vy: 0, onGround: false, sneak: false, face: 1, hp: MAX_HP, food: 20, air: 10, dead: false,
    inv: Array.from({ length: 36 }, () => null), sel: 0, armor: [null, null, null, null], cursor: null,
    peak: y, walked: 0, hurtAt: -9, lastBy: null, lastW: null, lastHitAt: -9, atkAt: -9, mine: null, eat: null,
    foodT: 0, regenT: 0, starveT: 0, cactusT: 0, swim: false, wet: false, inLava: false, fuel: 0, smelt: null,
  };
}

export const heldKey = (p) => p.inv[p.sel]?.i || null;

// Un paso de física (1/120 s). input: { left, right, jump, sneak, sprint }.
// Devuelve eventos: { landed: daño por caída } cuando aterriza.
export function stepPlayer(w, p, input, dt) {
  const out = {};
  const h = p.sneak ? SNEAK_H : PLAYER_H;
  const hw = PLAYER_W / 2;
  p.sneak = Boolean(input.sneak);
  const body = at(w, Math.floor(p.x), Math.floor(p.y - 0.5));
  const feet = at(w, Math.floor(p.x), Math.floor(p.y - 0.1));
  const head = at(w, Math.floor(p.x), Math.floor(p.y - PLAYER_H + 0.2));
  p.wet = body === B.water || feet === B.water;
  p.inLava = body === B.lava || feet === B.lava;
  p.swim = p.wet || p.inLava;
  p.headWet = head === B.water;

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (dir) p.face = dir;
  let speed = p.sneak ? SNEAK : input.sprint && p.food > 6 ? SPRINT : WALK;
  if (p.swim) speed *= 0.6;
  const target = dir * speed;
  const accel = p.onGround ? 14 : p.swim ? 6 : 4;
  p.vx += (target - p.vx) * Math.min(1, dt * accel);
  if (!dir && Math.abs(p.vx) < 0.05) p.vx = 0;

  // Saltar / nadar.
  if (p.swim) {
    p.vy += (GRAVITY * 0.25) * dt;
    p.vy = clamp(p.vy, -4.5, 3.2);
    if (input.jump) p.vy = Math.max(-4.2, p.vy - 26 * dt);
    p.peak = p.y;
  } else {
    p.vy = Math.min(40, p.vy + GRAVITY * dt);
    if (input.jump && p.onGround) { p.vy = -JUMP; p.onGround = false; }
  }

  // Horizontal, de a poco para no atravesar nada.
  let dx = p.vx * dt;
  if (dx) {
    const nx = p.x + dx;
    if (p.onGround && p.sneak && !boxHits(w, nx, p.y + 0.12, hw, h)) { p.vx = 0; }
    else if (!boxHits(w, nx, p.y, hw, h)) { p.x = nx; p.walked += Math.abs(dx); }
    else if (p.onGround && dir && !boxHits(w, nx, p.y - 1.001, hw, h) && !boxHits(w, p.x, p.y - 1.001, hw, h)) {
      // Escalón de un bloque: se sube solo, como en Terraria.
      p.x = nx; p.y -= 1.001; p.vy = 0;
    } else {
      p.x = dx > 0 ? Math.floor(nx + hw) - hw - EPS : Math.floor(nx - hw) + 1 + hw + EPS;
      p.vx = 0;
    }
  }
  p.x = clamp(p.x, hw + 0.01, W - hw - 0.01);

  // Vertical.
  const dy = p.vy * dt;
  const ny = p.y + dy;
  const was = p.onGround;
  if (!boxHits(w, p.x, ny, hw, h)) { p.y = ny; p.onGround = false; }
  else if (dy > 0) {
    p.y = Math.floor(ny) - EPS;
    p.onGround = true;
    if (!was) {
      const dist = p.y - p.peak;
      const dmg = Math.floor(dist - 3);
      if (dmg > 0 && !p.swim) out.landed = dmg;
      p.peak = p.y;
    }
    p.vy = 0;
  } else {
    p.y = Math.floor(ny - h) + 1 + h + EPS;
    p.vy = 0;
  }
  if (p.onGround) p.peak = p.y;
  else if (p.y < p.peak || p.vy < 0) p.peak = Math.min(p.peak, p.y);
  if (p.y > H + 4) p.hp = 0; // por si se cae al vacío
  return out;
}

// ─── Vida, hambre y entorno ──────────────────────────────────────────────────
export function hurt(p, dmg, by, cause, now) {
  if (p.dead || dmg <= 0) return 0;
  p.hp -= dmg;
  p.hurtAt = now;
  if (by) { p.lastBy = by; p.lastHitAt = now; }
  p.lastW = cause || null;
  return dmg;
}

// Daño del ambiente, hambre, regeneración y aire. `dt` en segundos.
export function stepVitals(w, p, dt, now, moving) {
  if (p.dead) return;
  if (p.inLava) { p.hp -= 6 * dt; p.lastW = 'lava'; p.hurtAt = now; p.lastHitAt = now; }
  p.cactusT -= dt;
  if (p.cactusT <= 0 && touches(w, p.x, p.y, PLAYER_W / 2, PLAYER_H, B.cactus)) { p.cactusT = 0.5; hurt(p, 1, null, 'cactus', now); }
  if (p.headWet) {
    p.air -= dt;
    if (p.air <= 0) { p.air = 1; hurt(p, 2, null, 'drown', now); }
  } else p.air = Math.min(10, p.air + dt * 4);
  // Hambre: baja sola (más si corrés) y con la panza llena te curás de a poco.
  p.foodT += dt * (moving ? 1 : 0.45);
  if (p.foodT >= 26) { p.foodT = 0; p.food = Math.max(0, p.food - 1); }
  p.regenT += dt;
  if (p.food >= 18 && p.hp < MAX_HP) {
    if (p.regenT >= 4) { p.regenT = 0; p.hp = Math.min(MAX_HP, p.hp + 1); p.foodT += 5; }
  } else if (p.food <= 0) {
    if (p.regenT >= 4) { p.regenT = 0; if (p.hp > 1) hurt(p, 1, null, 'hunger', now); }
  } else p.regenT = Math.min(p.regenT, 3);
}

// Daño que me hace otro jugador o un bicho: lo frena la armadura.
export function takeHit(p, dmg, by, cause, now, kx, ky = -5.5) {
  const real = Math.max(0.5, reduceDamage(dmg, p.armor));
  hurt(p, real, by, cause, now);
  p.vx = kx * 6;
  p.vy = ky;
  p.onGround = false;
  return real;
}

// ─── Picar y poner ───────────────────────────────────────────────────────────
// Avanza el picado del bloque (x, y). Devuelve true cuando se rompe. `p.mine` guarda el avance.
export function mineStep(w, p, x, y, dt) {
  const block = at(w, x, y);
  const info = breakInfo(block, heldKey(p));
  if (!Number.isFinite(info.time) || block === B.air || isFluid(block)) { p.mine = null; return false; }
  if (!p.mine || p.mine.x !== x || p.mine.y !== y) p.mine = { x, y, t: 0, need: info.time };
  p.mine.need = info.time;
  p.mine.t += dt;
  if (p.mine.t < info.time) return false;
  p.mine = null;
  return true;
}

export function wearTool(p, n) {
  const st = p.inv[p.sel];
  if (!st || !ITEMS[st.i]?.tool) return false;
  st.d = (st.d ?? ITEMS[st.i].dur) - n;
  if (st.d <= 0) { p.inv[p.sel] = null; return true; }
  return false;
}

// ¿Se puede poner un bloque en (x, y)? Devuelve el motivo si no.
export function placeProblem(w, p, x, y, id) {
  const cur = at(w, x, y);
  if (!(cur === B.air || isFluid(cur) || BLOCKS[cur]?.plant)) return 'Ahí ya hay algo';
  if (Math.hypot(x + 0.5 - p.x, y + 0.5 - (p.y - 0.9)) > REACH) return 'Muy lejos';
  if (y < 0 || y >= H - 1) return 'No se puede ahí';
  if (isSolid(id)) {
    const hw = PLAYER_W / 2;
    if (x + 1 > p.x - hw && x < p.x + hw && y + 1 > p.y - PLAYER_H && y < p.y) return 'Estás en el medio';
  }
  const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const n = at(w, x + dx, y + dy); return n !== B.air && !isFluid(n) && !BLOCKS[n]?.plant; });
  if (!near && !isFluid(id)) return 'Tiene que apoyarse en algo';
  return null;
}

// ─── Ítems en el piso ────────────────────────────────────────────────────────
export function newDrop(k, key, n, x, y, vx = 0, vy = -3, d) {
  return { k, i: key, n, x, y, vx, vy, age: 0, d };
}
export function stepDrop(w, it, dt) {
  it.age += dt;
  it.vy = Math.min(20, it.vy + GRAVITY * dt);
  const ny = it.y + it.vy * dt;
  if (isSolid(at(w, Math.floor(it.x), Math.floor(ny + 0.15)))) { it.y = Math.floor(ny + 0.15) - 0.15; it.vy = 0; it.vx *= 1 - Math.min(1, dt * 10); }
  else it.y = ny;
  const nx = it.x + it.vx * dt;
  if (isSolid(at(w, Math.floor(nx), Math.floor(it.y - 0.1)))) it.vx = 0; else it.x = nx;
  if (isFluid(at(w, Math.floor(it.x), Math.floor(it.y))) && it.vy > 0) it.vy *= 0.7;
}

// ─── Bichos ──────────────────────────────────────────────────────────────────
export const MOBS = {
  cow: { name: 'Vaca', hp: 10, w: 1.2, h: 1.1, speed: 1.1, drops: [['raw_beef', 1, 3], ['leather', 0, 2]] },
  pig: { name: 'Cerdo', hp: 10, w: 0.9, h: 0.9, speed: 1.2, drops: [['raw_pork', 1, 3]] },
  zombie: { name: 'Zombi', hp: 20, w: 0.6, h: 1.8, speed: 2.6, hostile: true, dmg: 3, drops: [] },
};

export function newMob(id, kind, x, y) {
  return { id, kind, x, y, vx: 0, vy: 0, hp: MOBS[kind].hp, dir: 0, think: 0, face: 1, fleeUntil: 0, atkAt: 0, onGround: false };
}

// Un paso de un bicho (solo lo corre la pantalla del anfitrión). `players`: [{x, y}] vivos.
export function stepMob(w, m, dt, now, rand, players) {
  const def = MOBS[m.kind];
  const hw = def.w / 2;
  let want = 0;
  let speed = def.speed;
  if (def.hostile) {
    let best = null, bd = 22;
    for (const pl of players) { const d = Math.hypot(pl.x - m.x, pl.y - m.y); if (d < bd) { bd = d; best = pl; } }
    if (best && Math.abs(best.x - m.x) > 0.5) want = best.x > m.x ? 1 : -1;
    else if (!best) want = m.dir;
  } else if (now < m.fleeUntil) {
    want = m.dir;
    speed = def.speed * 2.4;
  } else {
    m.think -= dt;
    if (m.think <= 0) { m.think = 2 + rand() * 4; m.dir = rand() < 0.4 ? 0 : rand() < 0.5 ? -1 : 1; }
    want = m.dir;
  }
  if (want) m.face = want;
  m.vx += (want * speed - m.vx) * Math.min(1, dt * 8);
  m.vy = Math.min(30, m.vy + GRAVITY * dt);
  const body = at(w, Math.floor(m.x), Math.floor(m.y - def.h / 2));
  if (body === B.water) { m.vy = Math.min(m.vy, 1.5); if (want || def.hostile) m.vy = -2.5; }
  const nx = m.x + m.vx * dt;
  if (!boxHits(w, nx, m.y, hw, def.h)) m.x = nx;
  else if (m.onGround && !boxHits(w, nx, m.y - 1.05, hw, def.h) && !boxHits(w, m.x, m.y - 1.05, hw, def.h)) { m.vy = -8.2; m.onGround = false; }
  else { m.vx = 0; if (!def.hostile) m.dir = -m.dir; }
  m.x = clamp(m.x, hw + 0.1, W - hw - 0.1);
  const ny = m.y + m.vy * dt;
  if (!boxHits(w, m.x, ny, hw, def.h)) { m.y = ny; m.onGround = false; }
  else if (m.vy > 0) { m.y = Math.floor(ny) - EPS; m.vy = 0; m.onGround = true; }
  else { m.y = Math.floor(ny - def.h) + 1 + def.h + EPS; m.vy = 0; }
}

// ─── Hora del día y luz ──────────────────────────────────────────────────────
// 0 = noche cerrada, 1 = mediodía. Arranca de mañana.
export function daylight(t) {
  const phase = (((t / DAY_S) % 1) + 1) % 1;
  return clamp(0.5 + 0.9 * Math.sin(phase * Math.PI * 2), 0, 1);
}
export const dayPhase = (t) => (((t / DAY_S) % 1) + 1) % 1;

// Luz del sol por casilla (0 a 15): baja desde el cielo y se va apagando al meterse en cuevas. Las
// casillas sólidas reciben un poco de la luz de las de aire vecinas (se apaga más rápido): así la
// tierra de la superficie se ve iluminada y de a poco se oscurece hacia adentro.
export function computeLight(w, light) {
  light.fill(0);
  const queue = new Int32Array(W * H);
  let head = 0, tail = 0;
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) {
      if (isSolid(w.t[y * W + x])) break;
      light[y * W + x] = 15;
      queue[tail++] = y * W + x;
    }
  }
  while (head < tail) {
    const c = queue[head++];
    const l = light[c];
    if (l <= 1) continue;
    const x = c % W, y = (c - x) / W;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0), ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
      const n = ny * W + nx;
      if (isSolid(w.t[n]) || light[n] >= l - 1) continue;
      light[n] = l - 1;
      queue[tail++] = n;
    }
  }
  // Las sólidas: primero las de la orilla, después hacia adentro.
  for (let pass = 0; pass < 5; pass++) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = y * W + x;
        if (!isSolid(w.t[c])) continue;
        let m = light[c];
        const side = (n) => { const v = isSolid(w.t[n]) ? light[n] - 3 : light[n] - 2; if (v > m) m = v; };
        if (x > 0) side(c - 1);
        if (x < W - 1) side(c + 1);
        if (y > 0) side(c - W);
        if (y < H - 1) side(c + W);
        light[c] = Math.max(0, m);
      }
    }
  }
}
// Brillo de una casilla para dibujar.
export function lightAt(w, light, x, y) {
  if (x < 0 || x >= W || y < 0) return 15;
  if (y >= H) return 0;
  return light[y * W + x];
}

// ─── Barra localizadora (UHC) ────────────────────────────────────────────────
// De los demás vivos que no se están agachando y están a menos de LOCATOR_RANGE, dónde se dibuja
// cada uno en la barra: pos de -1 (a la izquierda) a 1 (a la derecha), más "arriba" / "abajo".
export function locatorMarks(me, others) {
  const marks = [];
  for (const o of others) {
    if (o.sneak || o.dead) continue;
    const dx = o.x - me.x, dy = o.y - me.y;
    const dist = Math.hypot(dx, dy);
    if (dist > LOCATOR_RANGE || dist < 0.01) continue;
    const f = Math.min(1, Math.abs(dx) / LOCATOR_RANGE);
    marks.push({ id: o.id, pos: Math.sign(dx) * Math.pow(f, 0.65), dist, vert: Math.abs(dy) > 8 ? Math.sign(dy) : 0, color: o.color, name: o.name });
  }
  return marks.sort((a, b) => b.dist - a.dist);
}

// ─── Combate ─────────────────────────────────────────────────────────────────
export function attackDamage(key, falling) {
  const base = ITEMS[key]?.dmg ?? 1;
  return falling ? base * 1.5 : base;
}
// ¿El punto (px, py) está dentro de la caja de un jugador/bicho?
export function inBox(px, py, e, ew, eh) {
  return Math.abs(px - e.x) <= ew / 2 + 0.1 && py >= e.y - eh - 0.1 && py <= e.y + 0.1;
}
