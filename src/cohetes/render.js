// Dibujo de Cohete Royale, sin estado de juego, con el estilo de Rocket Bot Royale. Dos temas:
//   tierra  tierra a cuadros grandes, borde verde brillante, franja marrón oscura, fondo violeta
//   hielo   blanco con bandas celestes hacia el borde, fondo azul
// En los dos, el borde también aparece en los cráteres (se calcula con la distancia al aire). El terreno
// es una imagen de un píxel por casilla que se agranda sin suavizar. Se dibuja en unidades del mundo:
// `cam` = { x, y, scale, w, h }.
import { ITEMS, MUZZLE, SHIELD_R, TANK_R, ZONES, turret } from './sim.js';

// ─── Terreno ─────────────────────────────────────────────────────────────────
const EARTH = { edge: [61, 240, 110], band: [86, 48, 26], checks: [[176, 110, 58], [150, 88, 44], [196, 128, 70], [132, 76, 38]] };
const ICE = [[94, 214, 255], [150, 228, 255], [205, 244, 255], [255, 255, 255]]; // del borde para adentro
const CHECK = 9;                      // tamaño de cada cuadro (tierra)
const MAXD = 11;
const hash = (x, y) => { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); };

function color(theme, d, x, y) {
  if (theme === 'hielo') return d <= 3 ? ICE[0] : d <= 6 ? ICE[1] : d <= 10 ? ICE[2] : ICE[3];
  if (d <= 2) return EARTH.edge;
  if (d <= 6) return EARTH.band;
  const bx = Math.floor(x / CHECK), by = Math.floor(y / CHECK);
  return EARTH.checks[((bx + by) & 1) * 2 + (hash(bx, by) > 0.5 ? 1 : 0)];
}

// Distancia (en casillas, hasta MAXD) de cada casilla de tierra al aire más cercano, en una ventana.
function distances(t, x0, y0, x1, y1) {
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const d = new Uint8Array(w * h);
  const g = t.grid, W = t.W;
  const air = (x, y) => x < 0 || y < 0 || x >= W || y >= t.H || !g[y * W + x];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const gx = x + x0, gy = y + y0;
      if (air(gx, gy)) { d[y * w + x] = 0; continue; }
      let v = MAXD;
      if (air(gx - 1, gy) || air(gx, gy - 1) || air(gx + 1, gy) || air(gx, gy + 1)) v = 1;
      else {
        if (x > 0) v = Math.min(v, d[y * w + x - 1] + 1);
        if (y > 0) v = Math.min(v, d[(y - 1) * w + x] + 1);
      }
      d[y * w + x] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      let v = d[y * w + x];
      if (!v) continue;
      if (x < w - 1) v = Math.min(v, d[y * w + x + 1] + 1);
      if (y < h - 1) v = Math.min(v, d[(y + 1) * w + x] + 1);
      d[y * w + x] = v;
    }
  }
  return d;
}

function paintRect(view, t, x0, y0, x1, y1) {
  // La distancia se calcula con margen: si no, cerca del límite no se vería el aire de afuera.
  const px0 = Math.max(0, x0 - MAXD), py0 = Math.max(0, y0 - MAXD);
  const px1 = Math.min(t.W - 1, x1 + MAXD), py1 = Math.min(t.H - 1, y1 + MAXD);
  const d = distances(t, px0, py0, px1, py1);
  const w = px1 - px0 + 1;
  const data = view.img.data;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = (y * t.W + x) * 4;
      const dv = d[(y - py0) * w + (x - px0)];
      if (!dv) { data[i + 3] = 0; continue; }
      const c = color(t.theme, dv, x, y);
      data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = 255;
    }
  }
}

export function makeTerrainView(t) {
  const canvas = document.createElement('canvas');
  canvas.width = t.W;
  canvas.height = t.H;
  const ctx = canvas.getContext('2d');
  const view = { canvas, ctx, img: ctx.createImageData(t.W, t.H) };
  paintRect(view, t, 0, 0, t.W - 1, t.H - 1);
  ctx.putImageData(view.img, 0, 0);
  return view;
}

// Repinta lo que tocó un cráter, con margen para el borde nuevo.
export function repaint(view, t, box) {
  const m = MAXD + 2;
  const x0 = Math.max(0, box.x0 - m), x1 = Math.min(t.W - 1, box.x1 + m);
  const y0 = Math.max(0, box.y0 - m), y1 = Math.min(t.H - 1, box.y1 + m);
  paintRect(view, t, x0, y0, x1, y1);
  view.ctx.putImageData(view.img, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// ─── Fondo ───────────────────────────────────────────────────────────────────
const PILLARS = Array.from({ length: 60 }, (_, i) => ({ x: i * 70 + hash(i, 4) * 50, w: 26 + hash(i, 5) * 40, top: 0.1 + hash(i, 6) * 0.5 }));
const SNOW = Array.from({ length: 140 }, (_, i) => ({ x: hash(i, 7), y: hash(i, 8), s: 0.6 + hash(i, 9) * 1.6, v: 0.3 + hash(i, 10) * 0.7 }));
const SKIES = {
  tierra: { stops: ['#2e2346', '#5a4479', '#7d5f97'], pillar: 'rgba(40,28,64,0.35)' },
  hielo: { stops: ['#0b3f78', '#1673c4', '#2aa0ea'], pillar: 'rgba(8,48,100,0.35)' },
};

export function setWorld(ctx, cam) {
  ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.w / 2 - cam.x * cam.scale, cam.h / 2 - cam.y * cam.scale);
}

export function drawSky(ctx, cam, now, theme) {
  const sky = SKIES[theme] || SKIES.tierra;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, cam.h);
  sky.stops.forEach((c, i) => g.addColorStop(i / (sky.stops.length - 1), c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.w, cam.h);
  // Columnas oscuras de fondo, con paralaje.
  ctx.fillStyle = sky.pillar;
  const span = 70 * PILLARS.length;
  for (const p of PILLARS) {
    const sx = ((((p.x - cam.x * 0.25) % span) + span) % span) * cam.scale * 0.5;
    if (sx > cam.w + 60) continue;
    const w = p.w * cam.scale * 0.5;
    const top = cam.h * p.top;
    ctx.beginPath();
    ctx.roundRect(sx, top, w, cam.h - top + 20, w / 2);
    ctx.fill();
  }
  // Nieve que cae.
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  for (const f of SNOW) {
    const x = ((f.x * cam.w - cam.x * cam.scale * 0.4 + Math.sin(now * f.v + f.y * 9) * 20) % cam.w + cam.w) % cam.w;
    const y = ((f.y * cam.h + now * 30 * f.v - cam.y * cam.scale * 0.4) % cam.h + cam.h) % cam.h;
    ctx.beginPath(); ctx.arc(x, y, f.s * Math.max(1, cam.scale / 3), 0, Math.PI * 2); ctx.fill();
  }
}

export function drawTerrain(ctx, cam, view) {
  setWorld(ctx, cam);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(view.canvas, 0, 0);
}

// Adornos: solo se dibujan si sigue habiendo tierra abajo.
export function drawDecorations(ctx, cam, list, t) {
  const x0 = cam.x - cam.w / cam.scale, x1 = cam.x + cam.w / cam.scale;
  const y0 = cam.y - cam.h / cam.scale, y1 = cam.y + cam.h / cam.scale;
  for (const d of list) {
    if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
    if (!t.grid[d.y * t.W + d.x] || t.grid[(d.y - 1) * t.W + d.x]) continue;
    const s = d.s;
    if (d.kind === 'spike' || d.kind === 'crystal') {
      ctx.fillStyle = d.kind === 'spike' ? '#bff0ff' : '#5ed6ff';
      const h = (d.kind === 'spike' ? 7 : 10) * s, w = (d.kind === 'spike' ? 3 : 2.4) * s;
      ctx.beginPath(); ctx.moveTo(d.x - w, d.y + 0.5); ctx.lineTo(d.x + (d.c - 1) * 0.8, d.y - h); ctx.lineTo(d.x + w, d.y + 0.5); ctx.fill();
    } else if (d.kind === 'pine') {
      ctx.fillStyle = ['#1f6b4a', '#2a7d55', '#185c40'][d.c];
      ctx.fillRect(d.x - 0.5, d.y - 3 * s, 1, 3 * s);
      for (let k = 0; k < 3; k++) {
        const w = (5 - k * 1.4) * s, y = d.y - (3 + k * 3.2) * s;
        ctx.beginPath(); ctx.moveTo(d.x - w / 2, y); ctx.lineTo(d.x, y - 4 * s); ctx.lineTo(d.x + w / 2, y); ctx.fill();
      }
    } else if (d.kind === 'birch') {
      ctx.fillStyle = '#e9e9e9';
      ctx.fillRect(d.x - 0.6, d.y - 12 * s, 1.2, 12 * s);
      ctx.fillStyle = '#8fd18a';
      for (let k = 0; k < 6; k++) ctx.fillRect(d.x - 3 * s + hash(d.x, k) * 6 * s, d.y - 13 * s + hash(k, d.x) * 6 * s, 1.6, 1.6);
    } else if (d.kind === 'flower') {
      ctx.fillStyle = '#2f8a4c';
      ctx.fillRect(d.x - 0.3, d.y - 4 * s, 0.6, 4 * s);
      ctx.fillStyle = ['#ff8fd0', '#c28bff', '#ffd36b'][d.c];
      ctx.fillRect(d.x - 1.2, d.y - 5.4 * s, 2.4, 2.4);
    } else {
      ctx.fillStyle = '#2fa35a';
      ctx.fillRect(d.x - 1.5, d.y - 2 * s, 0.8, 2 * s);
      ctx.fillRect(d.x, d.y - 3 * s, 0.8, 3 * s);
      ctx.fillRect(d.x + 1.4, d.y - 2 * s, 0.8, 2 * s);
    }
  }
}

export function drawWater(ctx, cam, level, now, theme) {
  setWorld(ctx, cam);
  const x0 = cam.x - cam.w / cam.scale, x1 = cam.x + cam.w / cam.scale;
  const wave = (x) => level + Math.sin(x * 0.045 + now * 2) * 2;
  ctx.fillStyle = theme === 'hielo' ? 'rgba(40,210,230,0.55)' : 'rgba(58,150,235,0.6)';
  ctx.beginPath();
  ctx.moveTo(x0, level + 2000);
  for (let x = Math.floor(x0 / 4) * 4; x <= x1; x += 4) ctx.lineTo(x, wave(x));
  ctx.lineTo(x1, level + 2000);
  ctx.fill();
  ctx.strokeStyle = 'rgba(220,245,255,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let x = Math.floor(x0 / 4) * 4; x <= x1; x += 4) { if (x === Math.floor(x0 / 4) * 4) ctx.moveTo(x, wave(x)); else ctx.lineTo(x, wave(x)); }
  ctx.stroke();
}

// ─── Personajes ──────────────────────────────────────────────────────────────
const shadeRgb = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

// El tanquecito: orugas abajo, cúpula arriba y el caño hacia `angle`. Gira con la superficie
// (`nx`, `ny` = hacia dónde es «arriba» para el tanque).
export function drawTank(ctx, p, color, angle, { hurt = false, chute = false, shield = false, now = 0 } = {}) {
  const up = Math.atan2(p.nx ?? 0, -(p.ny ?? -1));
  const c = turret(p);
  // Caño (atrás del cuerpo).
  ctx.strokeStyle = '#1d2a33';
  ctx.lineWidth = 3.4;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(angle) * MUZZLE, c.y + Math.sin(angle) * MUZZLE); ctx.stroke();
  ctx.strokeStyle = hurt ? '#fff' : color;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x + Math.cos(angle) * (MUZZLE - 0.6), c.y + Math.sin(angle) * (MUZZLE - 0.6)); ctx.stroke();
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(up);
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = '#1d2a33';
  // Cúpula.
  ctx.fillStyle = hurt ? '#fff' : '#ffffff';
  ctx.beginPath(); ctx.arc(0, -1.2, 4.6, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  // Cuerpo con orugas.
  ctx.fillStyle = hurt ? '#fff' : color;
  ctx.beginPath(); ctx.roundRect(-TANK_R - 0.5, -1.4, (TANK_R + 0.5) * 2, 6.2, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shadeRgb(color, -0.35);
  for (let i = 0; i < 4; i++) {
    const x = -TANK_R + 1.6 + (((i * 3.3 + (p.treads || 0) * 0.5) % 11) + 11) % 11;
    ctx.beginPath(); ctx.arc(x, 1.7, 1.1, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  if (chute) drawChute(ctx, p.x, p.y - 4);
  if (shield) {
    ctx.strokeStyle = `rgba(140,230,255,${0.7 + Math.sin(now * 8) * 0.2})`;
    ctx.fillStyle = 'rgba(140,230,255,0.18)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(p.x, p.y, SHIELD_R, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

function drawChute(ctx, x, y) {
  ctx.strokeStyle = 'rgba(30,40,50,0.7)';
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 10, y - 13); ctx.moveTo(x + 5, y); ctx.lineTo(x + 10, y - 13); ctx.stroke();
  ctx.fillStyle = '#7fe3ff';
  ctx.beginPath(); ctx.arc(x, y - 13, 11, Math.PI, 0); ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(x, y - 13); ctx.arc(x, y - 13, 11, Math.PI * 1.35, Math.PI * 1.65); ctx.fill();
  ctx.strokeStyle = '#1d2a33';
  ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.arc(x, y - 13, 11, Math.PI, 0); ctx.stroke();
}

// Un helicóptero verde con hélice, el motor prendido fuego y una estela de humo negro (como el original).
export function drawShip(ctx, ship, now) {
  const { x, y, dir } = ship;
  for (let i = 0; i < 8; i++) {
    const a = ((now * 0.7 + i / 8) % 1);
    ctx.fillStyle = `rgba(20,16,24,${0.5 * (1 - a)})`;
    ctx.beginPath(); ctx.arc(x - dir * (30 + a * 110), y - 12 - a * 18 + Math.sin(i * 2) * 5, 7 + a * 16, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.rotate(0.12 + Math.sin(now * 1.3) * 0.04);
  ctx.strokeStyle = '#163d24';
  ctx.lineWidth = 1.2;
  // Cola.
  ctx.fillStyle = '#2f7d4a';
  ctx.beginPath(); ctx.moveTo(-18, -6); ctx.lineTo(-46, -10); ctx.lineTo(-46, -4); ctx.lineTo(-18, 4); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#e8eef3';
  ctx.beginPath(); ctx.ellipse(-46, -9, 2, 6 * Math.abs(Math.sin(now * 30)) + 1, 0, 0, Math.PI * 2); ctx.fill();
  // Cuerpo.
  ctx.fillStyle = '#2f8a4f';
  ctx.beginPath(); ctx.roundRect(-24, -12, 52, 24, 12); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#9fe6ff';
  ctx.beginPath(); ctx.roundRect(12, -8, 12, 9, 4); ctx.fill(); ctx.stroke();
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(-14 + i * 8, -2, 2.2, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  // Patines.
  ctx.strokeStyle = '#1d2a33';
  ctx.beginPath(); ctx.moveTo(-14, 16); ctx.lineTo(20, 16); ctx.moveTo(-6, 12); ctx.lineTo(-6, 16); ctx.moveTo(12, 12); ctx.lineTo(12, 16); ctx.stroke();
  // Hélice.
  ctx.fillStyle = '#1d2a33';
  ctx.fillRect(1, -16, 3, 5);
  ctx.strokeStyle = 'rgba(230,240,245,0.85)';
  ctx.lineWidth = 2;
  const blade = 30 * Math.abs(Math.cos(now * 28));
  ctx.beginPath(); ctx.moveTo(2.5 - blade, -16); ctx.lineTo(2.5 + blade, -16); ctx.stroke();
  // Fuego en el motor.
  ctx.fillStyle = '#ff6a2a';
  for (let i = 0; i < 3; i++) ctx.fillRect(-12 + i * 5 + Math.sin(now * 20 + i) * 1.2, -20 - Math.abs(Math.sin(now * 15 + i)) * 5, 2.4, 7);
  ctx.restore();
}

export function drawLabel(ctx, p, name, hp, mine) {
  const y = p.y - 13;
  ctx.font = '800 5px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeText(name, p.x, y);
  ctx.fillStyle = mine ? '#ffffff' : '#e8e8ff';
  ctx.fillText(name, p.x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(p.x - 7, y + 1, 14, 1.8);
  ctx.fillStyle = hp > 35 ? '#3df06e' : '#ff5a4f';
  ctx.fillRect(p.x - 7, y + 1, 14 * Math.max(0, hp) / 100, 1.8);
}

// Carga del láser: una línea finita que titila hacia donde va a salir.
export function drawLaserAim(ctx, from, angle, f) {
  ctx.strokeStyle = `rgba(255,80,120,${0.25 + f * 0.6})`;
  ctx.lineWidth = 0.5 + f * 1.2;
  ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(from.x + Math.cos(angle) * 400, from.y + Math.sin(angle) * 400); ctx.stroke();
  ctx.setLineDash([]);
}

export function drawProjectile(ctx, b) {
  const w = ITEMS[b.w] || ITEMS.rocket;
  if (b.trail.length >= 4) {
    const grad = ctx.createLinearGradient(b.trail[0], b.trail[1], b.x, b.y);
    const col = b.w === 'laser' ? '255,80,120' : b.w === 'poison' ? '120,240,90' : '90,230,255';
    grad.addColorStop(0, `rgba(${col},0)`);
    grad.addColorStop(1, `rgba(${col},0.95)`);
    ctx.strokeStyle = grad;
    ctx.lineWidth = w.big ? 4 : w.small ? 1.4 : b.w === 'laser' ? 2.6 : 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.trail[0], b.trail[1]);
    for (let i = 2; i < b.trail.length; i += 2) ctx.lineTo(b.trail[i], b.trail[i + 1]);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  ctx.save();
  ctx.translate(b.x, b.y);
  if (w.mine || w.ball) {
    ctx.fillStyle = b.w === 'poison' ? '#5bdc4a' : b.w === 'smoke' ? '#9aa3ad' : w.mine ? '#2b2d33' : '#3f6b34';
    ctx.beginPath(); ctx.arc(0, 0, w.ball ? 2.2 : 2.8, 0, Math.PI * 2); ctx.fill();
    if (w.mine) { ctx.fillStyle = Math.sin(b.age * 10) > 0 ? '#ff3b30' : '#5a1512'; ctx.beginPath(); ctx.arc(0, -1.6, 1, 0, Math.PI * 2); ctx.fill(); }
  } else if (b.w !== 'laser') {
    ctx.rotate(Math.atan2(b.vy, b.vx));
    const len = w.big ? 9 : w.small ? 3.2 : 5;
    const r = w.big ? 2.4 : w.small ? 1 : 1.4;
    ctx.fillStyle = w.big ? '#3a3d45' : '#ffffff';
    ctx.beginPath(); ctx.roundRect(-len / 2, -r, len, r * 2, r); ctx.fill();
    ctx.fillStyle = b.w === 'drill' ? '#c9ced8' : '#35d7ff';
    ctx.fillRect(-len / 2, -r, 1.4, r * 2);
  }
  ctx.restore();
}

// Zonas que quedan en el mapa: veneno (círculo verde), humo (nube gris) y remolino.
export function drawZones(ctx, zones, now, top) {
  for (const z of zones) {
    const left = z.until - now;
    if (left <= 0) continue;
    const fade = Math.min(1, left / 0.6);
    if (z.kind === 'poison' && !top) {
      const r = ZONES.poison.radius;
      ctx.fillStyle = `rgba(110,230,70,${0.28 * fade})`;
      ctx.beginPath(); ctx.arc(z.x, z.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = `rgba(150,255,100,${0.7 * fade})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < 8; i++) {
        const a = i * 0.8 + now * 0.6, d = (Math.sin(now * 1.3 + i) * 0.5 + 0.5) * r * 0.85;
        ctx.fillStyle = `rgba(160,255,120,${0.5 * fade})`;
        ctx.beginPath(); ctx.arc(z.x + Math.cos(a) * d, z.y + Math.sin(a) * d - ((now * 8 + i * 5) % 12), 1.4, 0, Math.PI * 2); ctx.fill();
      }
    } else if (z.kind === 'smoke' && top) {
      // El humo tapa todo lo que tiene abajo (por eso va encima de los tanques).
      const r = ZONES.smoke.radius;
      for (let i = 0; i < 14; i++) {
        const a = i * 2.39996, d = Math.sqrt(i / 14) * r * 0.8;
        ctx.fillStyle = `rgba(${200 + (i % 3) * 15},${200 + (i % 3) * 15},${205 + (i % 3) * 15},${0.92 * fade})`;
        ctx.beginPath(); ctx.arc(z.x + Math.cos(a + now * 0.1) * d, z.y + Math.sin(a + now * 0.1) * d, r * 0.42, 0, Math.PI * 2); ctx.fill();
      }
    } else if (z.kind === 'whirl' && !top) {
      const w = ITEMS.whirl;
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(z.a);
      for (let i = 0; i < 9; i++) {
        const along = -w.length / 2 + (((i / 9) + now * 1.4) % 1) * w.length;
        const r = w.width / 2 * (0.45 + 0.55 * ((along + w.length / 2) / w.length));
        ctx.strokeStyle = `rgba(230,250,255,${0.55 * fade})`;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.ellipse(along, 0, 3, r, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
  }
}

export function drawCoin(ctx, c, now) {
  const s = Math.abs(Math.cos(now * 3 + c.x));
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath(); ctx.ellipse(c.x, c.y + Math.sin(now * 2 + c.x) * 1, 2.4 * Math.max(0.25, s), 2.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#b8860b';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

// Caja de arma: metálica con una X y destellos, como en el original (con paracaídas si viene cayendo).
export function drawCrate(ctx, c, now) {
  if (c.falling) drawChute(ctx, c.x, c.y - 10);
  const x = c.x - 6, y = c.y - 10;
  ctx.fillStyle = '#c9ced6';
  ctx.strokeStyle = '#2b2f37';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(x, y, 12, 10, 1.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#5b6170';
  ctx.fillRect(x + 9, y + 0.5, 2.5, 9);
  ctx.strokeStyle = '#6b7280';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x + 1.5, y + 1.5); ctx.lineTo(x + 8, y + 8.5); ctx.moveTo(x + 8, y + 1.5); ctx.lineTo(x + 1.5, y + 8.5); ctx.stroke();
  // Destellos.
  ctx.strokeStyle = `rgba(160,235,255,${0.5 + Math.sin(now * 6 + c.x) * 0.4})`;
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05 + now * 0.5, r0 = 9, r1 = 12 + Math.sin(now * 5 + i) * 1.5;
    ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r0, c.y - 5 + Math.sin(a) * r0); ctx.lineTo(c.x + Math.cos(a) * r1, c.y - 5 + Math.sin(a) * r1); ctx.stroke();
  }
}

// Explosiones y partículas: solo dibujo, no viajan por la red.
export function burst(list, x, y, { n = 18, colors = ['#ffe066', '#ffffff', '#c9c9c9', '#9a5a2c'], speed = 90, life = 0.7, size = 2 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, age: 0, size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length] });
  }
}

export function drawEffects(ctx, effects, particles, dt) {
  for (const e of effects) {
    const f = e.age / 0.35;
    if (e.beam) {
      ctx.strokeStyle = `rgba(255,90,130,${1 - f})`;
      ctx.lineWidth = 3 * (1 - f) + 0.5;
      ctx.beginPath(); ctx.moveTo(e.x0, e.y0); ctx.lineTo(e.x, e.y); ctx.stroke();
    } else {
      ctx.fillStyle = `rgba(255,255,255,${0.75 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * (0.4 + f * 0.6), 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,214,64,${0.9 * (1 - f)})`;
      ctx.beginPath(); ctx.arc(e.x, e.y, e.r * 0.35 * (1 - f * 0.5), 0, Math.PI * 2); ctx.fill();
    }
    e.age += dt;
  }
  for (const p of particles) {
    p.age += dt;
    p.vx *= 1 - dt * 2;
    p.vy = p.vy * (1 - dt * 2) + 60 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}
