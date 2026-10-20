// Dibujo de A los Tiros en un canvas, con el estilo del juego en el que se inspira: fondo oscuro con
// haces de luz desde arriba, bloques de color con facetas y sombra, personajes de color con brazos y
// piernas, balas que brillan y dejan estela, explosiones con chispas. Todo en unidades del mundo.
import { LIGHT, WORLD_H, WORLD_W, themeOf } from './maps.js';
import { compileShape, outline } from './shapes.js';
import { PLAYER_R } from './sim.js';
import { CARDS } from './cards.js';

// ─── Partículas ──────────────────────────────────────────────────────────────
// Chispas, humo y pedazos. Se guardan en `list` y se mueven acá; no viajan por la red.
export function burst(list, x, y, { n = 12, color = '#ffcf5a', speed = 18, life = 0.6, size = 0.25, up = 0, gravity = 30 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.75);
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - up, life: life * (0.6 + Math.random() * 0.6), age: 0, color, size: size * (0.6 + Math.random() * 0.8), gravity });
  }
  if (list.length > 900) list.splice(0, list.length - 900);
}

function stepParticles(list, dt) {
  for (const p of list) {
    p.age += dt;
    p.vy += p.gravity * dt;
    p.vx *= 1 - 1.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].age >= list[i].life) list.splice(i, 1);
}

// ─── Utilidades ──────────────────────────────────────────────────────────────
const circle = (ctx, x, y, r) => { ctx.beginPath(); ctx.arc(x, y, Math.max(0.001, r), 0, Math.PI * 2); };
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2)); }
export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(f > 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
// Número fijo por bloque, para que las facetas no cambien de un cuadro a otro.
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

// Fondo, haces de luz y el mapa se dibujan una vez por pelea en un canvas aparte (son siempre iguales).
const backCache = new Map();
function background(map, mapIndex, scale) {
  const key = `${mapIndex}:${scale}`;
  if (backCache.has(key)) return backCache.get(key);
  backCache.clear();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WORLD_W * scale);
  canvas.height = Math.round(WORLD_H * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const th = themeOf(map);
  const g = ctx.createLinearGradient(0, 0, 0, WORLD_H);
  g.addColorStop(0, th.bg[0]);
  g.addColorStop(1, th.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // Un resplandor grande, apenas visible.
  const glow = ctx.createRadialGradient(WORLD_W * 0.5, WORLD_H * 0.35, 1, WORLD_W * 0.5, WORLD_H * 0.35, 34);
  glow.addColorStop(0, 'rgba(255,255,255,0.06)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // Haces de luz que bajan desde el techo.
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 5; i++) {
    const x = 6 + i * 13 + hash(mapIndex, i) * 6;
    const spread = 3.5 + hash(i, mapIndex) * 5;
    const lg = ctx.createLinearGradient(0, 0, 0, WORLD_H);
    lg.addColorStop(0, th.light);
    lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(x - 0.8, -1);
    ctx.lineTo(x + 0.8, -1);
    ctx.lineTo(x + spread, WORLD_H);
    ctx.lineTo(x - spread, WORLD_H);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // Sombras: cada pieza tapa la luz (un punto arriba y al medio) y deja una franja oscura que se abre
  // hacia abajo. Se pintan juntas en otra capa y se aplican una sola vez, así no se oscurecen dos veces.
  const shadow = document.createElement('canvas');
  shadow.width = canvas.width; shadow.height = canvas.height;
  const sh = shadow.getContext('2d');
  sh.setTransform(scale, 0, 0, scale, 0, 0);
  sh.fillStyle = th.shadow[0];
  const far = 30;
  for (const solid of map.solids) {
    const pts = outline(solid);
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      const pr = (v) => [v[0] + (v[0] - LIGHT[0]) * far, v[1] + (v[1] - LIGHT[1]) * far];
      const [p2, q2] = [pr(p), pr(q)];
      sh.beginPath(); sh.moveTo(p[0], p[1]); sh.lineTo(q[0], q[1]); sh.lineTo(q2[0], q2[1]); sh.lineTo(p2[0], p2[1]); sh.closePath(); sh.fill();
    });
  }
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = th.shadow[1];
  ctx.drawImage(shadow, 0, 0);
  ctx.restore();
  // Pilares de fondo (no chocan).
  for (const shape of map.decor) {
    ctx.fillStyle = th.dark || '#1d2633';
    for (const solid of compileShape(shape)) { solidPath(ctx, solid); ctx.fill(); }
  }
  // Piezas: color (o degradé) y textura recortada a la forma.
  map.shapes.forEach((shape, i) => {
    const solids = compileShape(shape);
    const [x0, y0, x1, y1] = solids.reduce((bb, sd) => [Math.min(bb[0], sd.box[0]), Math.min(bb[1], sd.box[1]), Math.max(bb[2], sd.box[2]), Math.max(bb[3], sd.box[3])], [Infinity, Infinity, -Infinity, -Infinity]);
    // Cada parte por separado (recortar todas juntas anula donde se superponen), con el color de la pieza entera.
    const fill = map.accent?.includes(i) && th.accent ? th.accent : pieceFill(ctx, th, i, x0, y0, x1, y1);
    for (const sd of solids) {
      ctx.save();
      solidPath(ctx, sd);
      ctx.clip();
      ctx.fillStyle = fill;
      ctx.fillRect(x0 - 1, y0 - 1, x1 - x0 + 2, y1 - y0 + 2);
      texture(ctx, th, i, x0, y0, x1, y1);
      ctx.restore();
    }
  });
  backCache.set(key, canvas);
  return canvas;
}

// El contorno de un sólido.
function solidPath(ctx, solid) {
  ctx.beginPath();
  if (solid.t === 'c') { ctx.moveTo(solid.x + solid.r, solid.y); ctx.arc(solid.x, solid.y, solid.r, 0, Math.PI * 2); return; }
  ctx.moveTo(solid.v[0][0], solid.v[0][1]);
  for (const [x, y] of solid.v.slice(1)) ctx.lineTo(x, y);
  ctx.closePath();
}

// Color de una pieza: plano, o un degradé en diagonal entre dos colores del mapa (uno distinto por pieza).
function pieceFill(ctx, th, i, x0, y0, x1, y1) {
  if (th.fill.length === 1) return th.fill[0];
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, th.fill[i % th.fill.length]);
  g.addColorStop(1, th.fill[(i + 1) % th.fill.length]);
  return g;
}

// Facetas (triángulos un poco más claros u oscuros) o manchas de pintura de otro color.
function texture(ctx, th, i, x0, y0, x1, y1) {
  const w = x1 - x0, h = y1 - y0;
  if (th.texture === 'facets') {
    const n = Math.max(3, Math.round((w * h) / 18));
    for (let f = 0; f < n; f++) {
      const a = hash(i, f), b = hash(f, i + 7), c = hash(i + 3, f + 11);
      ctx.fillStyle = shade(th.fill[0], (a - 0.5) * 0.22);
      ctx.beginPath();
      ctx.moveTo(x0 + w * a, y0 + h * c);
      ctx.lineTo(x0 + w * b, y0 + h * a);
      ctx.lineTo(x0 + w * c, y0 + h * b);
      ctx.closePath();
      ctx.fill();
    }
  } else if (th.texture === 'paint') {
    const n = Math.max(2, Math.round((w * h) / 10));
    for (let f = 0; f < n; f++) {
      const a = hash(i, f), b = hash(f + 5, i), c = hash(i + 9, f + 2);
      ctx.fillStyle = hexA(th.paint, 0.08 + c * 0.16);
      ctx.beginPath();
      ctx.ellipse(x0 + w * a, y0 + h * b, 0.6 + c * Math.min(4, w * 0.3), 0.25 + a * 0.8, -0.5 + b, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// Las cajas sueltas: se dibujan en cada cuadro (se mueven y giran), del color del mapa.
function drawBoxes(ctx, boxes, th) {
  for (const b of boxes) {
    if (b.gone) continue;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.a);
    ctx.fillStyle = th.fill[b.i % th.fill.length];
    ctx.fillRect(-b.h, -b.h, b.h * 2, b.h * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(-b.h, b.h * 0.55, b.h * 2, b.h * 0.45);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 0.06;
    ctx.strokeRect(-b.h + 0.03, -b.h + 0.03, b.h * 2 - 0.06, b.h * 2 - 0.06);
    ctx.restore();
  }
}

// ─── Personaje ───────────────────────────────────────────────────────────────
// Una bolita de color con cara, dos piernas curvas y dos brazos: el de adelante sostiene el arma y
// apunta hacia el mouse. No copia a ningún personaje: es el estilo, no el dibujo.
// El círculo de choque (`PLAYER_R`) abarca cuerpo y piernas: la bolita va arriba y los pies terminan
// justo en su borde de abajo, que es donde toca el piso.
const BODY_R = PLAYER_R * 0.7;
const LEG = 2 * PLAYER_R - 2 * BODY_R;   // largo de las piernas (cadera a piso)
const ART = BODY_R / 1.1;                // los brazos y la cara se dibujaron para una bolita de radio 1,1
const clampN = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Animación de cada personaje (solo dibujo, no viaja por la red): paso, aplastado al caer, estirado al
// saltar, inclinación según la velocidad y sacudón al recibir un golpe.
const anims = new Map();
function animate(c, now) {
  let a = anims.get(c.id);
  if (!a) { a = { phase: 0, x: c.x, ground: c.onGround, vy: 0, squash: 0, lean: 0, hit: 0, hurt: 0, t: now }; anims.set(c.id, a); }
  const dt = clampN(now - a.t, 0, 0.05);
  a.t = now;
  if (c.onGround) a.phase += Math.abs(c.x - a.x) * 2.4;
  a.x = c.x;
  if (c.onGround && !a.ground) a.squash = clampN(0.1 + Math.abs(a.vy) * 0.008, 0.1, 0.38);   // aterrizó
  if (!c.onGround && a.ground && c.vy < -4) a.squash = -0.24;                                   // saltó
  a.ground = c.onGround;
  a.vy = c.vy;
  a.squash *= Math.exp(-dt * 9);
  const lean = clampN(c.vx / 14, -1.4, 1.4) * 0.17;
  a.lean += (lean - a.lean) * Math.min(1, dt * 10);
  if (c.hurtUntil > now && a.hurt !== c.hurtUntil) { a.hurt = c.hurtUntil; a.hit = 1; }
  a.hit *= Math.exp(-dt * 5);
  return a;
}

function drawCharacter(ctx, c, now) {
  const { x, y, color, angle } = c;
  const an = animate(c, now);
  const facing = Math.cos(angle) >= 0 ? 1 : -1;
  const ahead = Math.abs(c.vx) > 0.6 ? Math.sign(c.vx) : facing;
  const dark = shade(color, -0.45);
  const sq = an.squash;                                   // + aplastado, − estirado
  const lean = an.lean + Math.sin(now * 40) * an.hit * 0.4;
  const walking = c.onGround && Math.abs(c.vx) > 0.8;
  const floor = y + PLAYER_R;
  const bob = walking ? Math.abs(Math.sin(an.phase)) * 0.06 : 0;
  const legs = LEG * (1 - Math.max(0, sq) * 0.7);
  const bx = x + lean * 0.4;
  const by = floor - legs - BODY_R * (1 - sq * 0.4) - bob - (c.onGround ? 0 : 0.04);
  ctx.save();
  // Piernas: curvas, con la rodilla hacia adelante; caminando se alternan y levantan el pie.
  ctx.strokeStyle = dark;
  ctx.fillStyle = dark;
  ctx.lineWidth = 0.15;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    const hx = bx + side * BODY_R * 0.4, hy = by + BODY_R * 0.75;
    const ph = an.phase + (side > 0 ? 0 : Math.PI);
    let fx, fy, bend;
    if (c.onGround) {
      fx = hx + (walking ? Math.sin(ph) * 0.3 * ahead : side * 0.07);
      fy = floor - (walking ? Math.max(0, Math.cos(ph)) * 0.14 : 0);
      bend = (0.1 + Math.max(0, sq) * 0.35 + (walking ? Math.max(0, Math.cos(ph)) * 0.12 : 0)) * ahead;
    } else if (c.vy < 0) {
      fx = hx - ahead * 0.1 + side * 0.04;                // subiendo: rodillas arriba
      fy = hy + legs * 0.55;
      bend = 0.24 * ahead;
    } else {
      fx = hx + side * 0.1 - ahead * 0.06;                // cayendo: piernas estiradas, un poco abiertas
      fy = hy + legs * 0.95 + 0.06;
      bend = 0.06 * ahead;
    }
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.quadraticCurveTo((hx + fx) / 2 + bend, (hy + fy) / 2, fx, fy);
    ctx.stroke();
    ctx.beginPath(); ctx.ellipse(fx + ahead * 0.06, fy - 0.04, 0.12, 0.07, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Lo de arriba se dibujó para una bolita de radio 1,1 en el origen: se achica y se lleva al cuerpo.
  ctx.translate(bx, by);
  ctx.scale(ART, ART);
  // Brazo de atrás (mano libre): se balancea al caminar.
  const backA = angle + Math.PI * 0.8 * facing + (walking ? Math.sin(an.phase) * 0.35 : 0) + an.hit * 0.6;
  const bhx = Math.cos(backA) * 1.35, bhy = Math.sin(backA) * 1.0 + 0.3;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.22;
  ctx.beginPath(); ctx.moveTo(0, 0.2); ctx.quadraticCurveTo(bhx * 0.5, 0.2 + (bhy - 0.2) * 0.5 + 0.25, bhx, bhy); ctx.stroke();
  ctx.fillStyle = '#f4f1ea';
  circle(ctx, bhx, bhy, 0.3); ctx.fill();
  // Cuerpo y cara: se aplastan, se estiran y se inclinan.
  ctx.save();
  ctx.rotate(lean);
  ctx.scale(1 + sq * 0.5, 1 - sq * 0.5);
  const bodyG = ctx.createRadialGradient(-0.35, -0.4, 0.2, 0, 0, 1.2);
  bodyG.addColorStop(0, shade(color, 0.18));
  bodyG.addColorStop(1, color);
  ctx.fillStyle = bodyG;
  circle(ctx, 0, 0, 1.1);
  ctx.fill();
  const lx = Math.cos(angle) * 0.32, ly = Math.sin(angle) * 0.22;
  const angry = c.hurtUntil > now;
  ctx.fillStyle = '#1b1b24';
  const blink = angry ? 0.12 : 0.24;
  ctx.beginPath(); ctx.ellipse(-0.34 + lx, -0.12 + ly, 0.17, blink, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0.34 + lx, -0.12 + ly, 0.17, blink, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1b1b24';
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  ctx.moveTo(-0.55 + lx, -(angry ? 0.52 : 0.45) + ly); ctx.lineTo(-0.15 + lx, -(angry ? 0.38 : 0.47) + ly);
  ctx.moveTo(0.55 + lx, -(angry ? 0.52 : 0.45) + ly); ctx.lineTo(0.15 + lx, -(angry ? 0.38 : 0.47) + ly);
  ctx.stroke();
  ctx.beginPath();
  if (angry) ctx.arc(lx, 0.42 + ly, 0.18, Math.PI, 0);
  else ctx.arc(lx, 0.22 + ly, 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.restore();
  // Brazo de adelante con el arma (apunta derecho al mouse; un golpe lo sacude).
  const aim = angle + Math.sin(now * 40) * an.hit * 0.25;
  const hx = Math.cos(aim) * 1.75, hy = Math.sin(aim) * 1.75;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.22;
  ctx.beginPath(); ctx.moveTo(Math.cos(aim) * 0.7, Math.sin(aim) * 0.7); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(aim);
  ctx.fillStyle = '#20212a';
  rrect(ctx, -0.15, -0.17, 1.0, 0.34, 0.08); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f4f1ea';
  circle(ctx, hx, hy, 0.3); ctx.fill();
  ctx.restore();
  ctx.save();
  // Saliendo disparado desde abajo (después de caerse): anillo punteado que gira y estela blanca.
  if (c.launching) {
    const tg = ctx.createLinearGradient(x, y, x, y + 5);
    tg.addColorStop(0, 'rgba(255,255,255,0.75)');
    tg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = tg;
    ctx.lineWidth = 0.22;
    ctx.beginPath(); ctx.moveTo(x, floor); ctx.lineTo(x, y + 5); ctx.stroke();
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 0.16;
    ctx.setLineDash([0.45, 0.3]);
    ctx.lineDashOffset = -now * 3;
    circle(ctx, x, y, PLAYER_R + 0.55); ctx.stroke();
    ctx.restore();
  }
  // Escudo.
  if (c.blocking) {
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createRadialGradient(x, y, PLAYER_R * 0.5, x, y, PLAYER_R + 1.1);
    sg.addColorStop(0, 'rgba(255,255,255,0)');
    sg.addColorStop(0.7, 'rgba(220,240,255,0.35)');
    sg.addColorStop(1, 'rgba(220,240,255,0)');
    ctx.fillStyle = sg;
    circle(ctx, x, y, PLAYER_R + 1.1); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 0.18;
    circle(ctx, x, y, PLAYER_R + 0.6); ctx.stroke();
  }
  // Escudo recargándose: un arco finito.
  if (c.cdLeft > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.12;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_R + 0.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - c.cdLeft));
    ctx.stroke();
  }
  // Vida, munición y nombre.
  const w = 1.9, top = by - BODY_R - 0.85;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  rrect(ctx, x - w / 2, top, w, 0.3, 0.15); ctx.fill();
  ctx.fillStyle = c.hp / c.maxHp > 0.3 ? '#9be15d' : '#ff5c4d';
  rrect(ctx, x - w / 2, top, Math.max(0, (w * c.hp) / c.maxHp), 0.3, 0.15); ctx.fill();
  const n = Math.min(c.maxAmmo, 16);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = c.reloading ? 'rgba(255,255,255,0.18)' : i < c.ammo ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.18)';
    circle(ctx, x - ((n - 1) * 0.36) / 2 + i * 0.36, top + 0.65, 0.11); ctx.fill();
  }
  ctx.font = '600 0.62px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(c.name, x + 0.05, top - 0.33);
  ctx.fillStyle = c.mine ? '#ffffff' : 'rgba(255,255,255,0.85)';
  ctx.fillText(c.name, x, top - 0.38);
  ctx.restore();
}

// Lo que rodea al personaje por sus cartas: la sierra que gira, el aura oscura de la Cuenta abisal (y
// cuánto le falta cargarla) y el brillo del tiro potenciado.
function drawAura(ctx, c, now, sawR) {
  const { x, y } = c;
  if (c.abyss) {
    const g = ctx.createRadialGradient(x, y, PLAYER_R, x, y, 6);
    g.addColorStop(0, 'rgba(120,40,200,0.45)');
    g.addColorStop(1, 'rgba(40,0,80,0)');
    ctx.fillStyle = g; circle(ctx, x, y, 6); ctx.fill();
  } else if (c.abyssCharge > 0.02) {
    ctx.strokeStyle = 'rgba(180,90,255,0.8)';
    ctx.lineWidth = 0.14;
    ctx.beginPath();
    ctx.arc(x, y, PLAYER_R + 0.9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c.abyssCharge);
    ctx.stroke();
  }
  if (c.empowered) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.08;
    circle(ctx, x, y, PLAYER_R + 0.25 + Math.sin(now * 10) * 0.08); ctx.stroke();
  }
  if (c.saw) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(now * 14);
    ctx.fillStyle = 'rgba(220,225,235,0.9)';
    ctx.beginPath();
    const teeth = 14;
    for (let i = 0; i < teeth * 2; i++) {
      const a = (i / (teeth * 2)) * Math.PI * 2;
      const r = i % 2 ? sawR - 0.5 : sawR;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.moveTo(sawR - 0.9, 0);
    ctx.arc(0, 0, sawR - 0.9, 0, Math.PI * 2);
    ctx.fill('evenodd');
    ctx.restore();
  }
}

// Estrellitas girando arriba de la cabeza: aturdido o silenciado.
function drawStars(ctx, c, now) {
  ctx.fillStyle = '#ffe066';
  for (let i = 0; i < 3; i++) {
    const a = now * 6 + (i * Math.PI * 2) / 3;
    circle(ctx, c.x + Math.cos(a) * 0.9, c.y - 2.3 + Math.sin(a) * 0.25, 0.14); ctx.fill();
  }
}

// ─── Escena completa ─────────────────────────────────────────────────────────
// `v`: { map, mapIndex, now, dt, bullets, boxes, explosions, clouds, fields, particles, characters, aim,
//        hud: { players, rounds, battles }, texts: [{ text, size, y }], shake }
export function drawScene(ctx, canvas, v) {
  const k = canvas.width / WORLD_W;
  stepParticles(v.particles, v.dt);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const sx = v.shake ? (Math.random() - 0.5) * v.shake * k : 0;
  const sy = v.shake ? (Math.random() - 0.5) * v.shake * k : 0;
  ctx.drawImage(background(v.map, v.mapIndex, k), sx, sy);
  ctx.setTransform(k, 0, 0, k, sx, sy);

  // Campos que curan y nubes tóxicas.
  for (const f of v.fields) {
    const g = ctx.createRadialGradient(f.x, f.y, 0.5, f.x, f.y, 5);
    g.addColorStop(0, 'rgba(120,255,160,0.28)');
    g.addColorStop(1, 'rgba(120,255,160,0)');
    ctx.fillStyle = g; circle(ctx, f.x, f.y, 5); ctx.fill();
  }
  for (const c of v.clouds) {
    const tint = c.kind === 'static' ? '90,190,255' : '150,70,210';
    const g = ctx.createRadialGradient(c.x, c.y, 0.5, c.x, c.y, c.r);
    g.addColorStop(0, `rgba(${tint},0.45)`);
    g.addColorStop(1, `rgba(${tint},0)`);
    ctx.fillStyle = g; circle(ctx, c.x, c.y, c.r); ctx.fill();
    // El campo estático chisporrotea: rayitos cortos que cambian cada cuadro.
    if (c.kind === 'static') {
      ctx.strokeStyle = 'rgba(190,235,255,0.8)';
      ctx.lineWidth = 0.08;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.random() * c.r * 0.8;
        let px = c.x + Math.cos(a) * d, py = c.y + Math.sin(a) * d;
        ctx.beginPath(); ctx.moveTo(px, py);
        for (let j = 0; j < 3; j++) { px += (Math.random() - 0.5) * 1.4; py += (Math.random() - 0.5) * 1.4; ctx.lineTo(px, py); }
        ctx.stroke();
      }
    }
  }
  // Supernova: un remolino oscuro que se achica hasta que revienta.
  for (const n of v.novas || []) {
    const f = Math.min(1, (v.now - n.t) / (v.novaTime || 1.5));
    if (f >= 1) continue;
    const r = 14 * (1 - f * 0.6);
    const g = ctx.createRadialGradient(n.x, n.y, 0.3, n.x, n.y, r);
    g.addColorStop(0, `rgba(255,240,255,${0.5 + f * 0.4})`);
    g.addColorStop(0.25, 'rgba(160,80,255,0.35)');
    g.addColorStop(1, 'rgba(60,20,120,0)');
    ctx.fillStyle = g; circle(ctx, n.x, n.y, r); ctx.fill();
    ctx.strokeStyle = 'rgba(210,170,255,0.6)';
    ctx.lineWidth = 0.12;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * (0.35 + i * 0.22), v.now * (4 + i) + i, v.now * (4 + i) + i + 2.2);
      ctx.stroke();
    }
  }
  // Ondas de Resplandor: un anillo de sol que se agranda.
  for (const w of v.waves || []) {
    const f = Math.min(1, (v.now - w.t) / 0.5);
    ctx.strokeStyle = `rgba(255,214,90,${0.85 * (1 - f)})`;
    ctx.lineWidth = 0.35 * (1 - f) + 0.05;
    circle(ctx, w.x, w.y, (v.waveR || 7) * f); ctx.stroke();
  }

  // Personajes (con lo que llevan alrededor: sierra, Cuenta abisal, aturdido).
  for (const c of v.characters) {
    drawAura(ctx, c, v.now, v.sawR || 3.6);
    drawCharacter(ctx, c, v.now);
    if (c.stunned) drawStars(ctx, c, v.now);
  }

  // Cajas sueltas.
  if (v.boxes?.length) drawBoxes(ctx, v.boxes, themeOf(v.map));

  // Balas: una rayita corta en la dirección en que van (como en el original), con un brillo apenas.
  ctx.lineCap = 'round';
  for (const b of v.bullets) {
    const glow = b.glow || '#ffd27a';
    const sp = Math.hypot(b.vx, b.vy) || 1;
    const len = Math.max(0.45, Math.min(1.1, sp * 0.014));
    const tx = b.x - (b.vx / sp) * len, ty = b.y - (b.vy / sp) * len;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(glow, 0.35);
    ctx.lineWidth = b.r * 1.9;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = glow;
    ctx.lineWidth = b.r * 0.9;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.strokeStyle = '#fffbe8';
    ctx.lineWidth = b.r * 0.45;
    ctx.beginPath(); ctx.moveTo(b.x - (b.vx / sp) * len * 0.4, b.y - (b.vy / sp) * len * 0.4); ctx.lineTo(b.x, b.y); ctx.stroke();
  }

  // Explosiones: una bola de luz que crece y se apaga.
  ctx.globalCompositeOperation = 'lighter';
  for (const e of v.explosions) {
    const f = Math.min(1, (v.now - e.t) / 0.45);
    const r = e.r * (0.55 + f * 0.6);
    const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
    g.addColorStop(0, `rgba(255,255,235,${0.95 * (1 - f)})`);
    g.addColorStop(0.35, `rgba(255,214,90,${0.8 * (1 - f)})`);
    g.addColorStop(0.75, `rgba(255,120,30,${0.45 * (1 - f)})`);
    g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g;
    circle(ctx, e.x, e.y, r); ctx.fill();
  }
  // Chispas.
  ctx.lineCap = 'round';
  for (const p of v.particles) {
    const f = 1 - p.age / p.life;
    ctx.strokeStyle = p.color.startsWith('#') ? hexA(p.color, f) : p.color;
    ctx.lineWidth = p.size * f + 0.04;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Mira.
  if (v.aim) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 0.1;
    circle(ctx, v.aim.x, v.aim.y, 0.45); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    circle(ctx, v.aim.x, v.aim.y, 0.07); ctx.fill();
  }

  // Viñeta: los bordes un poco más oscuros.
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const vg = ctx.createRadialGradient(WORLD_W / 2, WORLD_H / 2, 18, WORLD_W / 2, WORLD_H / 2, 40);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  drawHud(ctx, v.hud);
  for (const t of v.texts) bigText(ctx, t.text, t.size, t.y);
}

// Marcador arriba a la izquierda (puntos grandes, peleas ganadas chiquitas) y las cartas de cada uno
// arriba a la derecha, con las dos primeras letras, como en el original.
function drawHud(ctx, hud) {
  if (!hud) return;
  hud.players.forEach((p, row) => {
    const y = 1.5 + row * 1.45;
    for (let i = 0; i < hud.rounds; i++) {
      ctx.fillStyle = i < p.points ? p.color : hexA(p.color, 0.28);
      circle(ctx, 1.5 + i * 1.25, y, i < p.points ? 0.5 : 0.24); ctx.fill();
    }
    if (hud.battles > 1) {
      for (let i = 0; i < hud.battles; i++) {
        ctx.fillStyle = i < p.wins ? '#ffffff' : 'rgba(255,255,255,0.18)';
        circle(ctx, 1.5 + hud.rounds * 1.25 + 0.5 + i * 0.6, y, 0.16); ctx.fill();
      }
    }
    const cards = p.cards.slice(-12);
    cards.forEach((id, i) => {
      const bx = WORLD_W - 1 - (cards.length - i) * 1.55;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      rrect(ctx, bx, y - 0.6, 1.4, 1.2, 0.25); ctx.fill();
      ctx.strokeStyle = hexA(p.color, 0.85);
      ctx.lineWidth = 0.08;
      rrect(ctx, bx, y - 0.6, 1.4, 1.2, 0.25); ctx.stroke();
      ctx.font = '600 0.62px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = hexA(p.color, 0.95);
      ctx.fillText((CARDS[id]?.name || '?').replace(/^(La|El|Las|Los|A) /, '').slice(0, 2), bx + 0.7, y + 0.22);
    });
  });
}

function bigText(ctx, text, size, y = WORLD_H / 2) {
  ctx.font = `800 ${size}px 'Bricolage Grotesque', Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillText(text, WORLD_W / 2 + size * 0.04, y + size * 0.4);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, WORLD_W / 2, y + size * 0.35);
}
