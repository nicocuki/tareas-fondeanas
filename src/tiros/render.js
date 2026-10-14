// Dibujo de A los Tiros en un canvas, con el estilo del juego en el que se inspira: fondo oscuro con
// haces de luz desde arriba, bloques de color con facetas y sombra, personajes de color con brazos y
// piernas, balas que brillan y dejan estela, explosiones con chispas. Todo en unidades del mundo.
import { WORLD_H, WORLD_W, kindOf, themeOf } from './maps.js';
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
  // Sombras: cada bloque tapa la luz de arriba y deja una franja oscura hacia abajo.
  for (const [x, y, w, h] of map.rects) {
    const sg = ctx.createLinearGradient(0, y + h, 0, y + h + 14);
    sg.addColorStop(0, 'rgba(0,0,0,0.38)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w + w * 0.25 + 1, y + h + 14);
    ctx.lineTo(x - w * 0.25 - 1, y + h + 14);
    ctx.closePath();
    ctx.fill();
  }
  // Sogas de los bloques colgados.
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 0.08;
  for (const r of map.rects) {
    if (kindOf(r) !== 'r') continue;
    ctx.beginPath();
    ctx.moveTo(r[0] + r[2] / 2, 0);
    ctx.lineTo(r[0] + r[2] / 2, r[1]);
    ctx.stroke();
  }
  // Bloques: color plano con facetas (triángulos un poco más claros u oscuros) y la cara de arriba iluminada.
  map.rects.forEach((r, i) => {
    const [x, y, w, h] = r;
    const kind = kindOf(r);
    const base = kind === 'd' ? th.dark : th.block;
    ctx.fillStyle = base;
    ctx.fillRect(x, y, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (let f = 0; f < 3; f++) {
      const a = hash(i, f), b = hash(f, i + 7);
      ctx.fillStyle = shade(base.startsWith('#') ? base : '#888888', (a - 0.5) * 0.16);
      ctx.beginPath();
      ctx.moveTo(x + w * a, y);
      ctx.lineTo(x + w, y + h * b);
      ctx.lineTo(x + w * (1 - b), y + h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    if (kind !== 'd') {
      ctx.fillStyle = th.top;
      ctx.fillRect(x, y, w, Math.min(0.35, h * 0.3));
    }
  });
  backCache.set(key, canvas);
  return canvas;
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
// `v`: { map, mapIndex, now, dt, bullets, explosions, clouds, fields, particles, characters, aim,
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

  // Balas: estela y núcleo que brillan.
  ctx.globalCompositeOperation = 'lighter';
  for (const b of v.bullets) {
    const glow = b.glow || '#ffd27a';
    if (b.trail?.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < b.trail.length; i++) {
        ctx.strokeStyle = hexA(glow, (i / b.trail.length) * 0.5);
        ctx.lineWidth = b.r * 1.6 * (i / b.trail.length);
        ctx.beginPath();
        ctx.moveTo(b.trail[i - 1][0], b.trail[i - 1][1]);
        ctx.lineTo(b.trail[i][0], b.trail[i][1]);
        ctx.stroke();
      }
    }
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 3.2);
    g.addColorStop(0, hexA(glow, 0.7));
    g.addColorStop(1, hexA(glow, 0));
    ctx.fillStyle = g;
    circle(ctx, b.x, b.y, b.r * 3.2); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#fffaf0';
  for (const b of v.bullets) { circle(ctx, b.x, b.y, b.r); ctx.fill(); }

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
