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
    const fill = pieceFill(ctx, th, i, x0, y0, x1, y1);
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
// Una bolita de color con cara, dos piernas que caminan y dos brazos: el de adelante sostiene el arma
// y apunta hacia el mouse. No copia a ningún personaje: es el estilo, no el dibujo.
function drawCharacter(ctx, c, now) {
  const { x, y, color, angle } = c;
  const facing = Math.cos(angle) >= 0 ? 1 : -1;
  const dark = shade(color, -0.45);
  ctx.save();
  // Piernas.
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.26;
  ctx.lineCap = 'round';
  const walking = c.onGround && Math.abs(c.vx) > 1;
  const phase = walking ? Math.sin(x * 1.6) : 0;
  for (const side of [-1, 1]) {
    const hipX = x + side * 0.38;
    const hipY = y + PLAYER_R * 0.75;
    const swing = walking ? phase * side * 0.45 : 0;
    const footX = c.onGround ? hipX + swing : hipX + side * 0.25;
    const footY = c.onGround ? y + PLAYER_R + 0.75 : y + PLAYER_R + 0.45;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(footX, footY);
    ctx.stroke();
  }
  // Brazo de atrás (mano libre).
  const backA = angle + Math.PI * 0.8 * facing;
  const bx = x + Math.cos(backA) * 1.35, by = y + Math.sin(backA) * 1.0 + 0.3;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.22;
  ctx.beginPath(); ctx.moveTo(x, y + 0.2); ctx.lineTo(bx, by); ctx.stroke();
  ctx.fillStyle = '#f4f1ea';
  circle(ctx, bx, by, 0.3); ctx.fill();
  // Cuerpo.
  const bodyG = ctx.createRadialGradient(x - 0.35, y - 0.4, 0.2, x, y, PLAYER_R * 1.1);
  bodyG.addColorStop(0, shade(color, 0.18));
  bodyG.addColorStop(1, color);
  ctx.fillStyle = bodyG;
  circle(ctx, x, y, PLAYER_R);
  ctx.fill();
  // Cara: cejas, ojos y boca que miran hacia donde apunta.
  const lx = Math.cos(angle) * 0.32, ly = Math.sin(angle) * 0.22;
  ctx.fillStyle = '#1b1b24';
  ctx.beginPath(); ctx.ellipse(x - 0.34 + lx, y - 0.12 + ly, 0.17, 0.24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(x + 0.34 + lx, y - 0.12 + ly, 0.17, 0.24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1b1b24';
  ctx.lineWidth = 0.1;
  const angry = c.hurtUntil > now;
  ctx.beginPath();
  ctx.moveTo(x - 0.55 + lx, y - (angry ? 0.52 : 0.45) + ly); ctx.lineTo(x - 0.15 + lx, y - (angry ? 0.38 : 0.47) + ly);
  ctx.moveTo(x + 0.55 + lx, y - (angry ? 0.52 : 0.45) + ly); ctx.lineTo(x + 0.15 + lx, y - (angry ? 0.38 : 0.47) + ly);
  ctx.stroke();
  ctx.beginPath();
  if (angry) ctx.arc(x + lx, y + 0.42 + ly, 0.18, Math.PI, 0);
  else ctx.arc(x + lx, y + 0.22 + ly, 0.2, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  // Brazo de adelante con el arma.
  const hx = x + Math.cos(angle) * 1.75, hy = y + Math.sin(angle) * 1.75;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.22;
  ctx.beginPath(); ctx.moveTo(x + Math.cos(angle) * 0.7, y + Math.sin(angle) * 0.7); ctx.lineTo(hx, hy); ctx.stroke();
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  ctx.fillStyle = '#20212a';
  rrect(ctx, -0.15, -0.17, 1.0, 0.34, 0.08); ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#f4f1ea';
  circle(ctx, hx, hy, 0.3); ctx.fill();
  // Saliendo disparado desde abajo (después de caerse): anillo punteado que gira y estela blanca.
  if (c.launching) {
    const tg = ctx.createLinearGradient(x, y, x, y + 5);
    tg.addColorStop(0, 'rgba(255,255,255,0.75)');
    tg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = tg;
    ctx.lineWidth = 0.22;
    ctx.beginPath(); ctx.moveTo(x, y + PLAYER_R); ctx.lineTo(x, y + 5); ctx.stroke();
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
  const w = 2.6, top = y - PLAYER_R - 1.1;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  rrect(ctx, x - w / 2, top, w, 0.3, 0.15); ctx.fill();
  ctx.fillStyle = c.hp / c.maxHp > 0.3 ? '#9be15d' : '#ff5c4d';
  rrect(ctx, x - w / 2, top, Math.max(0, (w * c.hp) / c.maxHp), 0.3, 0.15); ctx.fill();
  const n = Math.min(c.maxAmmo, 16);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = c.reloading ? 'rgba(255,255,255,0.18)' : i < c.ammo ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.18)';
    circle(ctx, x - ((n - 1) * 0.36) / 2 + i * 0.36, top + 0.65, 0.11); ctx.fill();
  }
  ctx.font = '600 0.85px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillText(c.name, x + 0.05, top - 0.33);
  ctx.fillStyle = c.mine ? '#ffffff' : 'rgba(255,255,255,0.85)';
  ctx.fillText(c.name, x, top - 0.38);
  ctx.restore();
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
    const g = ctx.createRadialGradient(c.x, c.y, 0.5, c.x, c.y, c.r);
    g.addColorStop(0, 'rgba(150,70,210,0.45)');
    g.addColorStop(1, 'rgba(150,70,210,0)');
    ctx.fillStyle = g; circle(ctx, c.x, c.y, c.r); ctx.fill();
  }

  // Personajes.
  for (const c of v.characters) drawCharacter(ctx, c, v.now);

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
