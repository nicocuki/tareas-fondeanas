// Dibujo de Cohete Royale, sin estado de juego. Estilo pixelado como el original: el terreno es una
// imagen de una casilla por píxel que se agranda sin suavizar. Se dibuja en unidades del mundo:
// `cam` = { x, y, scale, w, h }.
import { TANK_H, TANK_HW, MUZZLE, WEAPONS } from './sim.js';

// ─── Terreno ─────────────────────────────────────────────────────────────────
const GRASS = [122, 208, 79], GRASS_DARK = [79, 158, 58];
const DIRT = [140, 90, 58], DIRT_DEEP = [104, 66, 44];
const hash = (x, y) => { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); };

function paintCell(data, t, x, y) {
  const i = (y * t.W + x) * 4;
  if (!t.grid[y * t.W + x]) { data[i + 3] = 0; return; }
  // Cuánta tierra hay arriba (hasta 7): arriba de todo va el pasto.
  let depth = 0;
  while (depth < 7 && y - depth - 1 >= 0 && t.grid[(y - depth - 1) * t.W + x]) depth++;
  let c;
  if (depth === 0) c = GRASS;
  else if (depth <= 2) c = GRASS_DARK;
  else {
    const deep = Math.min(1, (y - 200) / 260);
    const n = (hash(x >> 1, y >> 1) - 0.5) * 18;
    c = [0, 1, 2].map((k) => DIRT[k] + (DIRT_DEEP[k] - DIRT[k]) * Math.max(0, deep) + n);
  }
  data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
}

export function makeTerrainView(t) {
  const canvas = document.createElement('canvas');
  canvas.width = t.W;
  canvas.height = t.H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(t.W, t.H);
  for (let y = 0; y < t.H; y++) for (let x = 0; x < t.W; x++) paintCell(img.data, t, x, y);
  ctx.putImageData(img, 0, 0);
  return { canvas, ctx, img };
}

// Repinta lo que tocó un cráter (y un poco abajo, donde ahora puede aparecer pasto).
export function repaint(view, t, box) {
  const x0 = Math.max(0, box.x0 - 1), x1 = Math.min(t.W - 1, box.x1 + 1);
  const y0 = Math.max(0, box.y0 - 1), y1 = Math.min(t.H - 1, box.y1 + 8);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) paintCell(view.img.data, t, x, y);
  view.ctx.putImageData(view.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// ─── Escena ──────────────────────────────────────────────────────────────────
const MOUNTAINS = Array.from({ length: 40 }, (_, i) => ({ x: i * 90 + hash(i, 1) * 60, h: 60 + hash(i, 2) * 110, w: 120 + hash(i, 3) * 120 }));

export function setWorld(ctx, cam) {
  ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.w / 2 - cam.x * cam.scale, cam.h / 2 - cam.y * cam.scale);
}

export function drawSky(ctx, cam, t, now) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, cam.h);
  g.addColorStop(0, '#5fb4f0');
  g.addColorStop(1, '#c9ecff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.w, cam.h);
  // Montañas lejanas (paralaje) y nubes.
  const par = 0.35;
  ctx.fillStyle = '#9fd0ea';
  for (const m of MOUNTAINS) {
    const sx = (m.x - cam.x * par) * cam.scale * 0.6 + cam.w / 2;
    if (sx < -m.w * cam.scale || sx > cam.w + m.w * cam.scale) continue;
    const base = cam.h * 0.78 + (t.H / 2 - cam.y) * cam.scale * 0.15;
    ctx.beginPath();
    ctx.moveTo(sx - m.w * cam.scale * 0.5, base);
    ctx.lineTo(sx, base - m.h * cam.scale * 0.6);
    ctx.lineTo(sx + m.w * cam.scale * 0.5, base);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 9; i++) {
    const cx = ((i * 260 + now * 8 - cam.x * 0.2) % (cam.w / cam.scale + 300) + cam.w / cam.scale + 300) % (cam.w / cam.scale + 300) - 150;
    const cy = 30 + hash(i, 9) * 90;
    const s = cam.scale * 0.7;
    ctx.fillRect(cx * s, cy * s * 0.8, 46 * s, 10 * s);
    ctx.fillRect((cx + 8) * s, (cy - 7) * s * 0.8, 28 * s, 9 * s);
  }
}

export function drawTerrain(ctx, cam, view) {
  setWorld(ctx, cam);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(view.canvas, 0, 0);
}

export function drawWater(ctx, cam, t, level, now) {
  setWorld(ctx, cam);
  const x0 = cam.x - cam.w / cam.scale, x1 = cam.x + cam.w / cam.scale;
  ctx.fillStyle = 'rgba(38,120,215,0.62)';
  ctx.beginPath();
  ctx.moveTo(x0, t.H + 200);
  for (let x = Math.floor(x0 / 4) * 4; x <= x1; x += 4) ctx.lineTo(x, level + Math.sin(x * 0.05 + now * 2.2) * 2.2);
  ctx.lineTo(x1, t.H + 200);
  ctx.fill();
  ctx.strokeStyle = 'rgba(210,240,255,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  for (let x = Math.floor(x0 / 4) * 4; x <= x1; x += 4) {
    const y = level + Math.sin(x * 0.05 + now * 2.2) * 2.2;
    if (x === Math.floor(x0 / 4) * 4) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

const shadeRgb = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

// El tanquecito robot: orugas, cuerpo del color del jugador, cúpula con el ojo y el caño hacia `angle`.
export function drawTank(ctx, p, color, angle, { hurt = 0 } = {}) {
  const { x, y } = p;
  ctx.save();
  ctx.translate(x, y);
  // Orugas.
  ctx.fillStyle = '#2b2d33';
  ctx.beginPath(); ctx.roundRect(-TANK_HW, -3.4, TANK_HW * 2, 3.4, 1.7); ctx.fill();
  ctx.fillStyle = '#6b6f78';
  for (let i = 0; i < 5; i++) {
    const tx = -TANK_HW + 1.6 + ((i * 2.8 + (p.treads || 0) * 0.6) % (TANK_HW * 2 - 3.2));
    ctx.fillRect(tx, -2.4, 1.1, 1.4);
  }
  // Caño (detrás de la cúpula).
  const cx = 0, cy = -TANK_H * 0.7;
  ctx.strokeStyle = '#3a3d45';
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(angle) * MUZZLE, cy + Math.sin(angle) * MUZZLE);
  ctx.stroke();
  // Cuerpo y cúpula.
  ctx.fillStyle = hurt > 0 ? '#ffffff' : color;
  ctx.beginPath(); ctx.roundRect(-TANK_HW + 1, -6.2, TANK_HW * 2 - 2, 3.4, 1); ctx.fill();
  ctx.fillStyle = hurt > 0 ? '#ffffff' : shadeRgb(color, 0.25);
  ctx.beginPath(); ctx.arc(cx, -5.6, 4.6, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // Ojo, mirando para donde apunta.
  ctx.fillStyle = '#1b1d22';
  ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * 1.8, -7.6 + Math.sin(angle) * 0.8, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#7ff3ff';
  ctx.beginPath(); ctx.arc(cx + Math.cos(angle) * 2.1, -7.8 + Math.sin(angle) * 0.8, 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawLabel(ctx, p, name, hp, mine) {
  const y = p.y - TANK_H - 7;
  ctx.font = '700 5px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(name, p.x, y);
  ctx.fillStyle = mine ? '#ffe066' : '#ffffff';
  ctx.fillText(name, p.x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(p.x - 8, y + 1, 16, 2);
  ctx.fillStyle = hp > 35 ? '#7ad04f' : '#ff5a4f';
  ctx.fillRect(p.x - 8, y + 1, 16 * Math.max(0, hp) / 100, 2);
}

export function drawProjectile(ctx, b) {
  const w = WEAPONS[b.w] || WEAPONS.rocket;
  // Estela.
  if (b.trail.length >= 4) {
    ctx.strokeStyle = b.w === 'laser' ? 'rgba(255,60,90,0.9)' : 'rgba(255,255,255,0.55)';
    ctx.lineWidth = b.w === 'laser' ? 1.6 : 1.4;
    ctx.beginPath();
    ctx.moveTo(b.trail[0], b.trail[1]);
    for (let i = 2; i < b.trail.length; i += 2) ctx.lineTo(b.trail[i], b.trail[i + 1]);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(b.x, b.y);
  if (w.mine || b.w === 'grenade') {
    ctx.fillStyle = b.w === 'grenade' ? '#3f6b34' : '#2b2d33';
    ctx.beginPath(); ctx.arc(0, 0, 2.6, 0, Math.PI * 2); ctx.fill();
    if (w.mine) {
      ctx.fillStyle = Math.sin(b.age * 10) > 0 ? '#ff3b30' : '#5a1512';
      ctx.beginPath(); ctx.arc(0, -1.6, 1, 0, Math.PI * 2); ctx.fill();
    }
  } else {
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillStyle = b.w === 'laser' ? '#ff6b8a' : b.w === 'nuke' ? '#3a3d45' : '#e8e8ec';
    const len = b.w === 'nuke' ? 7 : 5;
    ctx.beginPath(); ctx.roundRect(-len / 2, -1.3, len, 2.6, 1.3); ctx.fill();
    ctx.fillStyle = '#ff6a2a';
    ctx.fillRect(-len / 2 - 1.5, -0.8, 1.5, 1.6);
  }
  ctx.restore();
}

export function drawCoin(ctx, c, now) {
  const s = Math.abs(Math.cos(now * 3 + c.x));
  ctx.fillStyle = '#f7c531';
  ctx.beginPath(); ctx.ellipse(c.x, c.y + Math.sin(now * 2 + c.x) * 1.2, 3 * Math.max(0.2, s), 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 0.6;
  ctx.stroke();
}

export function drawCrate(ctx, c) {
  if (c.falling) {
    ctx.strokeStyle = 'rgba(80,80,80,0.8)';
    ctx.lineWidth = 0.5;
    ctx.beginPath(); ctx.moveTo(c.x - 5, c.y - 6); ctx.lineTo(c.x - 9, c.y - 16); ctx.moveTo(c.x + 5, c.y - 6); ctx.lineTo(c.x + 9, c.y - 16); ctx.stroke();
    ctx.fillStyle = '#ff5a4f';
    ctx.beginPath(); ctx.arc(c.x, c.y - 16, 10, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(c.x, c.y - 16, 10, Math.PI * 1.33, Math.PI * 1.66); ctx.lineTo(c.x, c.y - 16); ctx.fill();
  }
  ctx.fillStyle = '#b07a3e';
  ctx.fillRect(c.x - 6, c.y - 11, 12, 11);
  ctx.strokeStyle = '#6b4520';
  ctx.lineWidth = 1;
  ctx.strokeRect(c.x - 5.5, c.y - 10.5, 11, 10);
  ctx.fillStyle = '#fff3d0';
  ctx.font = '900 7px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('?', c.x, c.y - 5.2);
}

// Explosiones y partículas: solo dibujo, no viajan por la red.
export function burst(list, x, y, { n = 18, colors = ['#ffcf4a', '#ff7a29', '#8c5a3a'], speed = 90, life = 0.7, size = 2 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life, age: 0, size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length] });
  }
}

export function drawEffects(ctx, effects, particles, dt) {
  for (const e of effects) {
    const f = e.age / 0.4;
    ctx.fillStyle = `rgba(255,${Math.round(220 - f * 120)},90,${0.85 * (1 - f)})`;
    ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.5 + f * 0.7), 0, Math.PI * 2); ctx.fill();
    e.age += dt;
  }
  for (const p of particles) {
    p.age += dt;
    p.vy += 260 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

// Mapa chico arriba: la silueta de la isla, el agua y cada tanque como un punto.
export function drawMinimap(ctx, w, h, view, t, level, dots) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(10,30,60,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(view.canvas, 0, 0, w, h);
  ctx.fillStyle = 'rgba(38,120,215,0.75)';
  const ly = (level / t.H) * h;
  ctx.fillRect(0, ly, w, h - ly);
  for (const d of dots) {
    ctx.fillStyle = d.color;
    ctx.fillRect((d.x / t.W) * w - 2, (d.y / t.H) * h - 4, 4, 4);
    if (d.mine) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.strokeRect((d.x / t.W) * w - 3, (d.y / t.H) * h - 5, 6, 6); }
  }
}
