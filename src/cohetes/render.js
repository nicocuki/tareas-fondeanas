// Dibujo de Cohete Royale, sin estado de juego, con el estilo de Rocket Bot Royale. Diez temas:
//   tierra  tierra a cuadros grandes, borde verde brillante, franja marrón oscura, fondo violeta
//   hielo   blanco con bandas celestes hacia el borde, fondo azul
//   volcán  basalto oscuro con vetas de lava y borde incandescente, fondo rojo, lava en vez de agua
//   desierto arenisca en franjas, cielo naranja, arena movediza · selva tierra con musgo, cielo verde oscuro, pantano
//   océano  coral rosado con perlas, fondo turquesa, burbujas · espacio  roca meteorítica con cráteres y cristales, estrellas, plasma
//   cementerio  piedra gris con musgo, noche con luna, niebla verde · ruinas  ladrillos y concreto, cielo gris, agua sucia
//   dulces  bizcochuelo con glaseado y granas, cielo rosa, chocolate
// En los dos, el borde también aparece en los cráteres (se calcula con la distancia al aire). El terreno
// es una imagen de un píxel por casilla que se agranda sin suavizar. Se dibuja en unidades del mundo:
// `cam` = { x, y, scale, w, h }.
import { ITEMS, MUZZLE, SHIELD_R, TANK_R, ZONES, turret } from './sim.js';

// ─── Terreno ─────────────────────────────────────────────────────────────────
const EARTH = { edge: [61, 240, 110], band: [86, 48, 26], checks: [[176, 110, 58], [150, 88, 44], [196, 128, 70], [132, 76, 38]] };
const ICE = [[94, 214, 255], [150, 228, 255], [205, 244, 255], [255, 255, 255]]; // del borde para adentro
const VOLC = { edge: [255, 138, 40], glow: [214, 70, 28], rock: [[58, 44, 58], [48, 36, 50], [70, 54, 66], [40, 30, 44]], vein: [236, 96, 30] };
const DESERT = { edge: [250, 214, 128], band: [214, 150, 72], rock: [[230, 176, 98], [218, 160, 84], [240, 190, 110], [204, 146, 74]] };
const JUNGLE = { edge: [104, 222, 76], band: [70, 48, 28], rock: [[96, 66, 38], [82, 56, 32], [108, 76, 44], [68, 48, 28]] };
const CORAL = { edge: [255, 176, 190], band: [255, 120, 140], rock: [[238, 108, 142], [255, 150, 122], [222, 100, 162], [250, 172, 140]], pearl: [255, 238, 242] };
const SPACE = { edge: [180, 200, 255], band: [96, 108, 170], rock: [[72, 78, 108], [62, 68, 94], [86, 92, 122], [54, 60, 84]], crater: [34, 38, 62], gem: [120, 232, 255] };
const GRAVE = { edge: [168, 190, 160], band: [66, 62, 78], rock: [[98, 98, 112], [86, 86, 100], [110, 110, 124], [74, 74, 88]], crack: [46, 44, 58] };
const RUINS = { edge: [178, 178, 184], band: [112, 112, 120], brick: [[170, 98, 78], [152, 86, 68], [184, 110, 86], [142, 80, 64]], mortar: [96, 92, 96] };
const CANDY = { edge: [255, 168, 212], band: [255, 238, 246], rock: [[255, 206, 132], [242, 188, 112], [255, 222, 152], [234, 172, 102]], sprinkle: [[255, 80, 120], [80, 200, 255], [255, 240, 80], [120, 240, 130]] };
const CHECK = 9;                      // tamaño de cada cuadro (tierra)
const MAXD = 11;
const hash = (x, y) => { const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453; return n - Math.floor(n); };

function color(theme, d, x, y) {
  if (theme === 'hielo') return d <= 3 ? ICE[0] : d <= 6 ? ICE[1] : d <= 10 ? ICE[2] : ICE[3];
  if (theme === 'volcan') {
    if (d <= 2) return VOLC.edge;
    if (d <= 4) return VOLC.glow;
    // Vetas de lava: manchas finas que salen de un hash de bloques de 3 casillas.
    if (hash(Math.floor(x / 3), Math.floor(y / 3)) > 0.965 && d > 6) return VOLC.vein;
    const bx = Math.floor(x / CHECK), by = Math.floor(y / CHECK);
    return VOLC.rock[((bx + by) & 1) * 2 + (hash(bx, by) > 0.5 ? 1 : 0)];
  }
  if (theme === 'desierto') {
    if (d <= 2) return DESERT.edge;
    if (d <= 5) return DESERT.band;
    const row = Math.floor(y / 5);
    return DESERT.rock[(row + (hash(row, 1) > 0.5 ? 1 : 0)) & 3];
  }
  if (theme === 'selva') {
    if (d <= 2) return JUNGLE.edge;
    if (d <= 6) return JUNGLE.band;
    const bx = Math.floor(x / 4);
    return JUNGLE.rock[(bx + (hash(bx, Math.floor(y / 9)) > 0.6 ? 1 : 0)) & 3];
  }
  if (theme === 'oceano') {
    if (d <= 2) return CORAL.edge;
    if (d <= 5) return CORAL.band;
    if (hash(x, y) > 0.985) return CORAL.pearl;
    const bx = Math.floor(x / 6), by = Math.floor(y / 6);
    return CORAL.rock[((bx + by) & 1) * 2 + (hash(bx, by) > 0.5 ? 1 : 0)];
  }
  if (theme === 'espacio') {
    if (d <= 2) return SPACE.edge;
    if (d <= 4) return SPACE.band;
    if (hash(Math.floor(x / 4), Math.floor(y / 4)) > 0.975) return SPACE.crater;
    if (d > 5 && hash(Math.floor(x / 5) + 9, Math.floor(y / 5)) > 0.99) return SPACE.gem;
    const bx = Math.floor(x / CHECK), by = Math.floor(y / CHECK);
    return SPACE.rock[((bx + by) & 1) * 2 + (hash(bx, by) > 0.5 ? 1 : 0)];
  }
  if (theme === 'cementerio') {
    if (d <= 2) return GRAVE.edge;
    if (d <= 5) return GRAVE.band;
    if (hash(Math.floor(x / 2), Math.floor(y / 7)) > 0.93) return GRAVE.crack;
    const bx = Math.floor(x / 11), by = Math.floor(y / 11);
    return GRAVE.rock[((bx + by) & 1) * 2 + (hash(bx, by) > 0.5 ? 1 : 0)];
  }
  if (theme === 'ruinas') {
    if (d <= 2) return RUINS.edge;
    if (d <= 4) return RUINS.band;
    const row = Math.floor(y / 5), off = (row & 1) * 6, bx = Math.floor((x + off) / 12);
    if (y % 5 === 0 || (x + off) % 12 === 0) return RUINS.mortar;
    return RUINS.brick[(hash(bx, row) > 0.5 ? 2 : 0) + ((bx + row) & 1)];
  }
  if (theme === 'dulces') {
    if (d <= 2) return CANDY.edge;
    if (d <= 5) return CANDY.band;
    if (hash(x * 1.3, y * 1.7) > 0.985) return CANDY.sprinkle[Math.floor(hash(y, x) * 4)];
    const bx = Math.floor(x / CHECK), by = Math.floor(y / CHECK);
    return CANDY.rock[((bx + by) & 1) * 2 + (hash(bx, by) > 0.5 ? 1 : 0)];
  }
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
  volcan: { stops: ['#14070e', '#4a1519', '#b04a1c'], pillar: 'rgba(18,5,10,0.5)' },
  desierto: { stops: ['#7b2f2a', '#d9683a', '#f3b25b'], pillar: 'rgba(110,40,30,0.3)' },
  selva: { stops: ['#06241a', '#0e4a34', '#1d7a4c'], pillar: 'rgba(4,30,20,0.4)' },
  oceano: { stops: ['#032b4d', '#04607e', '#12a3b3'], pillar: 'rgba(2,40,70,0.35)' },
  espacio: { stops: ['#04030f', '#10083a', '#2a1260'], pillar: 'rgba(90,70,170,0.1)' },
  cementerio: { stops: ['#0d0a1c', '#251838', '#4a2f5c'], pillar: 'rgba(10,6,24,0.5)' },
  ruinas: { stops: ['#2b2d33', '#4a4d55', '#7b7d82'], pillar: 'rgba(30,30,36,0.4)' },
  dulces: { stops: ['#ff9fd0', '#ffc9e6', '#fff1b8'], pillar: 'rgba(255,255,255,0.28)' },
};
// Lo que flota en el aire de cada tema: colores, velocidad vertical (px/s en pantalla, negativa = sube), viento y titileo.
const PARTS = {
  tierra: { colors: ['rgba(255,255,255,0.8)'], vy: 30 },
  hielo: { colors: ['rgba(255,255,255,0.8)'], vy: 30 },
  volcan: { colors: ['rgba(255,150,50,0.85)'], vy: -42 },
  desierto: { colors: ['rgba(255,226,160,0.7)', 'rgba(255,200,120,0.6)'], vy: 6, wind: 46 },
  selva: { colors: ['rgba(210,255,120,0.9)', 'rgba(150,255,170,0.7)'], vy: -7, twinkle: true },
  oceano: { colors: ['rgba(225,250,255,0.6)', 'rgba(180,240,255,0.5)'], vy: -26 },
  espacio: { colors: ['rgba(255,255,255,0.95)', 'rgba(190,200,255,0.8)', 'rgba(255,220,240,0.8)'], vy: 1.5, twinkle: true },
  cementerio: { colors: ['rgba(170,255,190,0.5)', 'rgba(200,190,255,0.4)'], vy: -10, twinkle: true },
  ruinas: { colors: ['rgba(205,205,212,0.6)', 'rgba(150,150,158,0.55)'], vy: 14, wind: 14 },
  dulces: { colors: ['rgba(255,80,120,0.9)', 'rgba(80,200,255,0.9)', 'rgba(255,230,70,0.9)', 'rgba(110,240,130,0.9)'], vy: 24 },
};
const WATERS = {
  tierra: ['rgba(58,150,235,0.6)', 'rgba(220,245,255,0.9)'],
  hielo: ['rgba(40,210,230,0.55)', 'rgba(220,245,255,0.9)'],
  volcan: ['rgba(255,96,24,0.74)', 'rgba(255,224,130,0.95)'],
  desierto: ['rgba(214,160,80,0.82)', 'rgba(255,232,168,0.95)'],
  selva: ['rgba(70,110,40,0.78)', 'rgba(170,230,110,0.9)'],
  oceano: ['rgba(10,90,190,0.62)', 'rgba(190,240,255,0.95)'],
  espacio: ['rgba(160,60,255,0.6)', 'rgba(232,176,255,0.95)'],
  cementerio: ['rgba(80,200,140,0.5)', 'rgba(190,255,210,0.85)'],
  ruinas: ['rgba(100,90,60,0.72)', 'rgba(214,204,154,0.8)'],
  dulces: ['rgba(92,52,30,0.85)', 'rgba(190,130,90,0.95)'],
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
  // Cosas del fondo que dependen del tema: planeta, luna, rayos de luz bajo el agua, sol.
  skyExtra(ctx, cam, now, theme);
  // Lo que flota: nieve, brasas, arena, luciérnagas, burbujas, estrellas, granas…
  const part = PARTS[theme] || PARTS.tierra;
  SNOW.forEach((f, i) => {
    ctx.globalAlpha = part.twinkle ? 0.35 + 0.65 * Math.abs(Math.sin(now * (0.6 + f.v * 1.6) + i)) : 1;
    ctx.fillStyle = part.colors[i % part.colors.length];
    const x = ((f.x * cam.w - cam.x * cam.scale * 0.4 + (part.wind || 0) * now * f.v + Math.sin(now * f.v + f.y * 9) * 20) % cam.w + cam.w) % cam.w;
    const y = ((f.y * cam.h + now * part.vy * f.v - cam.y * cam.scale * 0.4) % cam.h + cam.h) % cam.h;
    ctx.beginPath(); ctx.arc(x, y, f.s * Math.max(1, cam.scale / 3), 0, Math.PI * 2); ctx.fill();
  });
  ctx.globalAlpha = 1;
}

function skyExtra(ctx, cam, now, theme) {
  const W = cam.w, H = cam.h, u = Math.min(W, H * 1.6);
  if (theme === 'espacio') {
    // Un planeta con anillo, lejos (casi no se mueve con la cámara).
    const x = W * 0.78 - cam.x * 0.03, y = H * 0.26 - cam.y * 0.02, r = u * 0.1;
    const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffb98a'); g.addColorStop(1, '#8a3a7a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,230,200,0.55)'; ctx.lineWidth = r * 0.12;
    ctx.beginPath(); ctx.ellipse(x, y, r * 1.7, r * 0.42, -0.35, 0, Math.PI * 2); ctx.stroke();
  } else if (theme === 'cementerio') {
    const x = W * 0.2 - cam.x * 0.02, y = H * 0.2, r = u * 0.07;
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 3.2);
    g.addColorStop(0, 'rgba(255,250,214,0.5)'); g.addColorStop(1, 'rgba(255,250,214,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff8d6'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(200,190,150,0.5)';
    ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.arc(x + r * 0.35, y + r * 0.3, r * 0.15, 0, Math.PI * 2); ctx.fill();
  } else if (theme === 'desierto') {
    const x = W * 0.7 - cam.x * 0.02, y = H * 0.72, r = u * 0.13;
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2.4);
    g.addColorStop(0, 'rgba(255,240,170,0.85)'); g.addColorStop(1, 'rgba(255,170,80,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
  } else if (theme === 'oceano') {
    // Rayos de luz que se mecen desde arriba.
    for (let i = 0; i < 5; i++) {
      const x = ((i * 0.27 + 0.05) * W - cam.x * 0.08 + Math.sin(now * 0.35 + i * 1.7) * 30 + W) % W;
      ctx.fillStyle = 'rgba(200,255,255,0.07)';
      ctx.beginPath(); ctx.moveTo(x - 10, 0); ctx.lineTo(x + 16, 0); ctx.lineTo(x + 90 + Math.sin(now * 0.3 + i) * 20, H); ctx.lineTo(x - 60, H); ctx.fill();
    }
  } else if (theme === 'dulces') {
    // Nubes de algodón de azúcar.
    for (let i = 0; i < 5; i++) {
      const x = ((i * 0.31 + 0.1) * W - cam.x * 0.06 + now * 3 + W * 2) % (W + 200) - 100, y = H * (0.12 + (i % 3) * 0.14), r = u * 0.05;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.arc(x + r * 1.1, y + r * 0.2, r * 0.8, 0, Math.PI * 2); ctx.arc(x - r * 1.1, y + r * 0.25, r * 0.7, 0, Math.PI * 2); ctx.fill();
    }
  }
}

export function drawTerrain(ctx, cam, view) {
  setWorld(ctx, cam);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(view.canvas, 0, 0);
}

// Adornos de los temas nuevos. Cada uno se dibuja con la base en (d.x, d.y); `s` es la escala y `c` una variante (0 a 2).
const rr = (ctx, x, y, w, h, r) => { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill(); };
const DECO = {
  cactus(ctx, d, s) {
    ctx.fillStyle = ['#2f9a52', '#3aa85e', '#278a48'][d.c];
    rr(ctx, d.x - 1.4 * s, d.y - 11 * s, 2.8 * s, 11.5 * s, 1.4 * s);
    rr(ctx, d.x - 4.6 * s, d.y - 8 * s, 1.9 * s, 5.4 * s, 0.95 * s); ctx.fillRect(d.x - 4.6 * s, d.y - 4.2 * s, 3.4 * s, 1.7 * s);
    rr(ctx, d.x + 2.7 * s, d.y - 9.5 * s, 1.9 * s, 5.2 * s, 0.95 * s); ctx.fillRect(d.x + 1.2 * s, d.y - 5.7 * s, 3.4 * s, 1.7 * s);
    ctx.fillStyle = '#ffe8a0'; ctx.fillRect(d.x - 0.2, d.y - 10 * s, 0.5, 0.5); ctx.fillRect(d.x + 0.5, d.y - 6 * s, 0.5, 0.5);
  },
  dry(ctx, d, s) {
    ctx.strokeStyle = '#a8782f'; ctx.lineWidth = 0.55; ctx.lineCap = 'round';
    for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(d.x + k * 1.2 * s, d.y - 3 * s, d.x + k * 2 * s, d.y - (5 - Math.abs(k) * 0.5) * s); ctx.stroke(); }
  },
  palm(ctx, d, s, now) {
    ctx.strokeStyle = '#7a5230'; ctx.lineWidth = 1.5 * s; ctx.lineCap = 'round';
    const tx = d.x + (d.c - 1) * 3 * s, ty = d.y - 13 * s;
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(d.x + (d.c - 1) * 0.5 * s, d.y - 7 * s, tx, ty); ctx.stroke();
    ctx.strokeStyle = '#2fa04e'; ctx.lineWidth = 1.2 * s;
    for (let k = -2; k <= 2; k++) {
      const sway = Math.sin(now * 1.2 + d.x + k) * 0.8;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.quadraticCurveTo(tx + k * 3.2 * s, ty - 4 * s + sway, tx + k * 5.2 * s, ty + (Math.abs(k) * 1.6 - 1) * s); ctx.stroke();
    }
  },
  fern(ctx, d, s, now) {
    ctx.strokeStyle = ['#3cc25a', '#2fa04e', '#58d46e'][d.c]; ctx.lineWidth = 0.7; ctx.lineCap = 'round';
    for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(d.x + k * 1.5 * s, d.y - 5 * s, d.x + k * 3 * s + Math.sin(now + d.x) * 0.5, d.y - (6 - Math.abs(k)) * s); ctx.stroke(); }
  },
  mushroom(ctx, d, s) {
    ctx.fillStyle = '#f1e6d2'; ctx.fillRect(d.x - 0.9 * s, d.y - 3.5 * s, 1.8 * s, 3.6 * s);
    ctx.fillStyle = ['#e0453a', '#d6812e', '#9a5ad6'][d.c];
    ctx.beginPath(); ctx.arc(d.x, d.y - 3.5 * s, 3.2 * s, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(d.x - 1.6 * s, d.y - 5.4 * s, 0.9, 0.9); ctx.fillRect(d.x + 0.6 * s, d.y - 4.6 * s, 0.9, 0.9);
  },
  coral(ctx, d, s) {
    ctx.strokeStyle = ['#ff7a9a', '#ff9a5a', '#c777ff'][d.c]; ctx.fillStyle = ctx.strokeStyle; ctx.lineWidth = 1.2 * s; ctx.lineCap = 'round';
    for (const [dx, h] of [[-3, 7], [0, 10], [3, 6.5]]) {
      ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(d.x + dx * 0.4 * s, d.y - h * 0.5 * s, d.x + dx * s, d.y - h * s); ctx.stroke();
      ctx.beginPath(); ctx.arc(d.x + dx * s, d.y - h * s, 1.1 * s, 0, Math.PI * 2); ctx.fill();
    }
  },
  kelp(ctx, d, s, now) {
    ctx.strokeStyle = ['#2fae6a', '#27965a', '#47c47c'][d.c]; ctx.lineWidth = 1.1 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x, d.y);
    for (let k = 1; k <= 6; k++) ctx.lineTo(d.x + Math.sin(now * 1.6 + k * 0.9 + d.x) * (0.4 + k * 0.28) * s, d.y - k * 2.2 * s);
    ctx.stroke();
  },
  gem(ctx, d, s) {
    for (const [dx, h, col] of [[-2.6, 6, '#9a7cff'], [0, 10, '#63e6ff'], [2.6, 5.5, '#c58bff']]) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(d.x + dx * s - 1.5 * s, d.y + 0.5); ctx.lineTo(d.x + dx * s, d.y - h * s); ctx.lineTo(d.x + dx * s + 1.5 * s, d.y + 0.5); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.moveTo(d.x + dx * s - 0.2, d.y); ctx.lineTo(d.x + dx * s, d.y - h * s); ctx.lineTo(d.x + dx * s - 0.8 * s, d.y); ctx.fill();
    }
  },
  flag(ctx, d, s, now) {
    ctx.fillStyle = '#d8dcff'; ctx.fillRect(d.x - 0.3, d.y - 11 * s, 0.6, 11 * s);
    ctx.fillStyle = ['#ff5a6a', '#5affb0', '#ffd84a'][d.c];
    ctx.beginPath(); ctx.moveTo(d.x + 0.3, d.y - 11 * s); ctx.lineTo(d.x + 6 * s, d.y - 9.4 * s + Math.sin(now * 3 + d.x) * 0.5); ctx.lineTo(d.x + 0.3, d.y - 7.4 * s); ctx.fill();
  },
  cross(ctx, d, s) {
    ctx.fillStyle = ['#8d8da0', '#7a7a8c', '#a0a0b2'][d.c];
    ctx.fillRect(d.x - 0.9 * s, d.y - 9 * s, 1.8 * s, 9 * s); ctx.fillRect(d.x - 3 * s, d.y - 6.6 * s, 6 * s, 1.7 * s);
  },
  tomb(ctx, d, s) {
    ctx.fillStyle = ['#9a9aae', '#868699', '#aeaec0'][d.c];
    ctx.beginPath(); ctx.roundRect(d.x - 3.2 * s, d.y - 8 * s, 6.4 * s, 8.5 * s, [3.2 * s, 3.2 * s, 0, 0]); ctx.fill();
    ctx.fillStyle = 'rgba(40,36,56,0.55)'; ctx.fillRect(d.x - 1.6 * s, d.y - 5.6 * s, 3.2 * s, 0.6); ctx.fillRect(d.x - 1.1 * s, d.y - 4 * s, 2.2 * s, 0.6);
  },
  bare(ctx, d, s) {
    ctx.strokeStyle = '#2c2438'; ctx.lineWidth = 1.2 * s; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - 11 * s);
    ctx.moveTo(d.x, d.y - 6 * s); ctx.lineTo(d.x - 4.5 * s, d.y - 10.5 * s); ctx.moveTo(d.x, d.y - 8 * s); ctx.lineTo(d.x + 4 * s, d.y - 12.5 * s);
    ctx.moveTo(d.x - 3 * s, d.y - 9 * s); ctx.lineTo(d.x - 4.4 * s, d.y - 7.6 * s); ctx.stroke();
  },
  rebar(ctx, d, s) {
    ctx.strokeStyle = '#8a5a3a'; ctx.lineWidth = 0.6; ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(d.x + k * 1.8 * s, d.y); ctx.lineTo(d.x + k * 1.8 * s + k * 0.8, d.y - (8 + (k + 1) * 1.6) * s); ctx.stroke(); }
  },
  cone(ctx, d, s) {
    ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.moveTo(d.x - 2.6 * s, d.y + 0.3); ctx.lineTo(d.x - 0.7 * s, d.y - 7 * s); ctx.lineTo(d.x + 0.7 * s, d.y - 7 * s); ctx.lineTo(d.x + 2.6 * s, d.y + 0.3); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillRect(d.x - 1.6 * s, d.y - 4.2 * s, 3.2 * s, 1.1 * s);
  },
  rubble(ctx, d, s) {
    ctx.fillStyle = '#9a9aa2';
    ctx.beginPath(); ctx.moveTo(d.x - 3 * s, d.y + 0.4); ctx.lineTo(d.x - 1.5 * s, d.y - 3 * s); ctx.lineTo(d.x + 0.5 * s, d.y - 1.6 * s); ctx.lineTo(d.x + 2.6 * s, d.y - 2.6 * s); ctx.lineTo(d.x + 3.4 * s, d.y + 0.4); ctx.fill();
    ctx.fillStyle = '#b25a46'; ctx.fillRect(d.x - 0.5 * s, d.y - 1.2 * s, 2.2 * s, 1.4 * s);
  },
  lolli(ctx, d, s) {
    ctx.fillStyle = '#f4efe6'; ctx.fillRect(d.x - 0.35, d.y - 8 * s, 0.7, 8 * s);
    const cx = d.x, cy = d.y - 10.5 * s, r = 3.2 * s;
    ctx.fillStyle = ['#ff6fa5', '#6fc8ff', '#ffd84a'][d.c]; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.6;
    ctx.beginPath(); for (let a = 0; a < 9; a += 0.4) ctx.lineTo(cx + Math.cos(a) * a * 0.34 * s, cy + Math.sin(a) * a * 0.34 * s); ctx.stroke();
  },
  gumdrop(ctx, d, s) {
    ctx.fillStyle = ['#ff5f8f', '#5fd0ff', '#8cf06a'][d.c];
    ctx.beginPath(); ctx.arc(d.x, d.y, 3.6 * s, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    for (const [dx, dy] of [[-1.8, -1.2], [0.2, -2.6], [1.8, -1], [-0.4, -0.6]]) ctx.fillRect(d.x + dx * s, d.y + dy * s, 0.6, 0.6);
  },
  cane(ctx, d, s) {
    ctx.lineCap = 'round'; ctx.lineWidth = 1.8 * s;
    const path = () => { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - 9 * s); ctx.arc(d.x + 2.6 * s, d.y - 9 * s, 2.6 * s, Math.PI, 0); ctx.stroke(); };
    ctx.strokeStyle = '#fff'; path();
    ctx.strokeStyle = '#ff3b55'; ctx.setLineDash([1.3 * s, 1.5 * s]); path(); ctx.setLineDash([]);
  },
};

// Adornos: solo se dibujan si sigue habiendo tierra abajo.
export function drawDecorations(ctx, cam, list, t, now = 0) {
  const x0 = cam.x - cam.w / cam.scale, x1 = cam.x + cam.w / cam.scale;
  const y0 = cam.y - cam.h / cam.scale, y1 = cam.y + cam.h / cam.scale;
  for (const d of list) {
    if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
    if (!t.grid[d.y * t.W + d.x] || t.grid[(d.y - 1) * t.W + d.x]) continue;
    const s = d.s;
    if (d.kind === 'shard') {
      ctx.fillStyle = '#2a1830';
      const h = 9 * s, w = 3.2 * s;
      ctx.beginPath(); ctx.moveTo(d.x - w, d.y + 0.5); ctx.lineTo(d.x + (d.c - 1) * 0.9, d.y - h); ctx.lineTo(d.x + w, d.y + 0.5); ctx.fill();
      ctx.strokeStyle = '#ff9a3c'; ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(d.x - w, d.y + 0.5); ctx.lineTo(d.x + (d.c - 1) * 0.9, d.y - h); ctx.stroke();
    } else if (d.kind === 'vent') {
      ctx.fillStyle = '#2a1a22';
      ctx.beginPath(); ctx.moveTo(d.x - 4 * s, d.y + 0.5); ctx.lineTo(d.x - 1.5 * s, d.y - 3 * s); ctx.lineTo(d.x + 1.5 * s, d.y - 3 * s); ctx.lineTo(d.x + 4 * s, d.y + 0.5); ctx.fill();
      ctx.fillStyle = '#ff7a1f';
      ctx.fillRect(d.x - 1.2 * s, d.y - 3.6 * s, 2.4 * s, 0.9 * s);
    } else if (d.kind === 'spike' || d.kind === 'crystal') {
      ctx.fillStyle = d.kind === 'spike' ? '#bff0ff' : '#5ed6ff';
      const h = (d.kind === 'spike' ? 7 : 10) * s, w = (d.kind === 'spike' ? 3 : 2.4) * s;
      ctx.beginPath(); ctx.moveTo(d.x - w, d.y + 0.5); ctx.lineTo(d.x + (d.c - 1) * 0.8, d.y - h); ctx.lineTo(d.x + w, d.y + 0.5); ctx.fill();
    } else if (DECO[d.kind]) {
      DECO[d.kind](ctx, d, s, now);
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
  const [fill, line] = WATERS[theme] || WATERS.tierra;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x0, level + 2000);
  for (let x = Math.floor(x0 / 4) * 4; x <= x1; x += 4) ctx.lineTo(x, wave(x));
  ctx.lineTo(x1, level + 2000);
  ctx.fill();
  ctx.strokeStyle = line;
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
// Una llama de motor: tres capas de lenguas (roja, naranja y amarilla) que titilan e inclinan hacia atrás.
function flame(ctx, x, y, size, now, seed) {
  const glow = ctx.createRadialGradient(x, y - size * 0.4, 1, x, y - size * 0.4, size * 1.5);
  glow.addColorStop(0, 'rgba(255,170,60,0.55)'); glow.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y - size * 0.4, size * 1.5, 0, Math.PI * 2); ctx.fill();
  for (const [col, k] of [['#e8321c', 1], ['#ff8a22', 0.72], ['#ffe27a', 0.42]]) {
    ctx.fillStyle = col;
    for (let i = 0; i < 3; i++) {
      const ph = now * (13 + i * 3) + seed + i * 2.1;
      const h = size * k * (0.8 + 0.3 * Math.sin(ph) + 0.12 * Math.sin(ph * 2.3));
      const w = size * k * (0.3 + 0.05 * Math.sin(ph * 1.7));
      const ox = (i - 1) * size * 0.34 * k;
      const lean = -size * 0.3 + Math.sin(ph * 0.9) * size * 0.16; // se echa hacia atrás con el viento
      ctx.beginPath();
      ctx.moveTo(x + ox - w, y);
      ctx.quadraticCurveTo(x + ox - w * 0.9 + lean * 0.4, y - h * 0.55, x + ox + lean, y - h);
      ctx.quadraticCurveTo(x + ox + w * 0.9 + lean * 0.4, y - h * 0.55, x + ox + w, y);
      ctx.closePath(); ctx.fill();
    }
  }
  // Chispas que salen volando hacia atrás.
  for (let i = 0; i < 7; i++) {
    const a = (now * 1.7 + i / 7 + seed) % 1;
    ctx.fillStyle = `rgba(255,${190 - a * 90 | 0},60,${1 - a})`;
    ctx.beginPath(); ctx.arc(x - a * 26 - size * 0.2, y - size * 0.6 - a * 12 + Math.sin(now * 9 + i * 3) * 1.4, 1.3 * (1 - a * 0.6), 0, Math.PI * 2); ctx.fill();
  }
}

// `past(s)`: dónde estaba el helicóptero s segundos antes (el humo sigue su recorrido real).
export function drawShip(ctx, ship, now, past = null) {
  const { x, y, dir } = ship;
  for (let i = 0; i < 16; i++) {
    const a = (now * 0.8 + i / 16) % 1;
    const at = past ? past(a * 2.4) : { x: x - dir * a * 110, y };
    ctx.fillStyle = `rgba(${24 + a * 40 | 0},${20 + a * 38 | 0},${28 + a * 40 | 0},${0.62 * (1 - a) * (a < 0.06 ? a / 0.06 : 1)})`;
    ctx.beginPath(); ctx.arc(at.x - dir * 24, at.y - 14 - a * 20 + Math.sin(i * 2 + now) * 2, 4 + a * 15, 0, Math.PI * 2); ctx.fill();
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.rotate(0.06 + (ship.pitch || 0) * 0.9 + Math.sin(now * 1.3) * 0.03);
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
  flame(ctx, -6, -11, 15, now, ship.dir);
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
      // Un tornado en forma de embudo: angosto donde sale y ancho adelante, con vientos que giran en espiral,
      // restos que vuelan y un anillo que gira en la boca.
      const w = ITEMS.whirl;
      const born = Math.min(1, Math.max(0, (now - (z.until - w.time)) / 0.35));
      const L = w.length * (0.3 + 0.7 * born), hw = (u) => (w.width / 2) * (0.18 + 0.82 * u) * (0.6 + 0.4 * born);
      ctx.save();
      ctx.translate(z.x, z.y);
      ctx.rotate(z.a);
      const body = ctx.createLinearGradient(-L / 2, 0, L / 2, 0);
      body.addColorStop(0, `rgba(210,235,250,${0.05 * fade})`); body.addColorStop(1, `rgba(210,235,250,${0.3 * fade})`);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.moveTo(-L / 2, -hw(0)); ctx.lineTo(L / 2, -hw(1)); ctx.ellipse(L / 2, 0, hw(1) * 0.3, hw(1), 0, -Math.PI / 2, Math.PI / 2); ctx.lineTo(-L / 2, hw(0));
      ctx.closePath(); ctx.fill();
      ctx.lineCap = 'round';
      for (let i = 0; i < 22; i++) {
        const u = (i / 22 + now * (0.55 + (i % 3) * 0.12)) % 1;
        const ang = now * 11 + i * 0.95 + u * 7, depth = Math.cos(ang), x = -L / 2 + u * L;
        const edge = Math.sin(Math.PI * u) * fade;
        ctx.strokeStyle = `rgba(238,250,255,${(0.28 + 0.55 * (depth + 1) / 2) * edge})`;
        ctx.lineWidth = depth > 0 ? 1.5 : 0.8;
        ctx.beginPath(); ctx.moveTo(x - 5 * u, Math.sin(ang - 0.7) * hw(u)); ctx.lineTo(x, Math.sin(ang) * hw(u)); ctx.stroke();
      }
      for (let i = 0; i < 7; i++) {
        const u = (i / 7 + now * 0.7) % 1, ang = now * 8 + i * 2.4;
        ctx.fillStyle = i % 2 ? `rgba(150,120,90,${0.9 * fade})` : `rgba(120,150,110,${0.9 * fade})`;
        ctx.fillRect(-L / 2 + u * L - 0.8, Math.sin(ang) * hw(u) * 1.15 - 0.8, 1.6, 1.6);
      }
      ctx.strokeStyle = `rgba(235,250,255,${0.55 * fade})`; ctx.lineWidth = 1.1;
      ctx.setLineDash([4, 5]); ctx.lineDashOffset = -now * 34;
      ctx.beginPath(); ctx.ellipse(L / 2, 0, hw(1) * 0.3, hw(1), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
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
// Pieza suelta flotando en un recinto cerrado: el ítem en sí (sin caja), con un halo que late y chispas que giran.
function drawLoose(ctx, c, now) {
  const bob = Math.sin(now * 2.2 + c.x * 0.1) * 1.6, y = c.y + bob;
  const pulse = 0.5 + 0.5 * Math.sin(now * 3 + c.x);
  const halo = ctx.createRadialGradient(c.x, y, 1, c.x, y, 15);
  halo.addColorStop(0, `rgba(255,236,150,${0.55 + pulse * 0.25})`);
  halo.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = halo;
  ctx.beginPath(); ctx.arc(c.x, y, 15, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(255,245,200,${0.5 + pulse * 0.4})`;
  ctx.lineWidth = 0.6;
  for (let i = 0; i < 4; i++) {
    const a = i * (Math.PI / 2) + now * 0.9, r0 = 9, r1 = 12.5 + pulse * 2;
    ctx.beginPath(); ctx.moveTo(c.x + Math.cos(a) * r0, y + Math.sin(a) * r0); ctx.lineTo(c.x + Math.cos(a) * r1, y + Math.sin(a) * r1); ctx.stroke();
  }
  if (c.weapon === 'heal') {
    ctx.fillStyle = '#ff4d5e'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.roundRect(c.x - 1.7, y - 5, 3.4, 10, 0.8); ctx.roundRect(c.x - 5, y - 1.7, 10, 3.4, 0.8); ctx.fill(); ctx.stroke();
    return;
  }
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(ITEMS[c.weapon]?.icon || '🚀', c.x, y + 0.5);
}

export function drawCrate(ctx, c, now) {
  if (c.float) { drawLoose(ctx, c, now); return; }
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

// La flecha roja que apunta al enemigo más cercano, alrededor de mi tanque.
export function drawArrow(ctx, p, angle) {
  ctx.save();
  ctx.translate(p.x + Math.cos(angle) * 26, p.y + Math.sin(angle) * 26);
  ctx.rotate(angle);
  ctx.fillStyle = '#ff2d3d';
  ctx.strokeStyle = '#5a0010';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(7, 0); ctx.lineTo(-4, -5.5); ctx.lineTo(-1.5, 0); ctx.lineTo(-4, 5.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Explosiones y partículas: solo dibujo, no viajan por la red.
export function burst(list, x, y, { n = 18, colors = ['#ffe066', '#ffffff', '#c9c9c9', '#9a5a2c'], speed = 90, life = 0.7, size = 2 } = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
    list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, age: 0, size: size * (0.6 + Math.random() * 0.8), color: colors[i % colors.length] });
  }
}

// Humo del impulso en paracaídas: una nube que sale en cono hacia donde apunta y se queda flotando.
export function puff(list, x, y, angle, n = 9) {
  for (let i = 0; i < n; i++) {
    const a = angle + (Math.random() - 0.5) * 0.9, s = 18 + Math.random() * 40;
    list.push({ x: x + Math.cos(a) * 2, y: y + Math.sin(a) * 2, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.55 + Math.random() * 0.4, age: 0, size: 2.2 + Math.random() * 2, grow: 1.8, g: -16, round: true, a: 0.8, color: ['#f4f5f9', '#d6d9e0', '#b6bbc6'][i % 3] });
  }
}

// Íconos sobre mi tanque durante medio segundo: 🎯 cuando le pego a alguien y 💀 cuando lo elimino.
export function drawBadges(ctx, p, badges, t) {
  for (const kind of ['hit', 'kill']) {
    let b = null;
    for (const x of badges) if (x.kind === kind && (!b || x.at > b.at)) b = x;
    if (!b) continue;
    const age = t - b.at;
    if (age < 0 || age > 0.5) continue;
    const f = age / 0.5;
    const pop = f < 0.22 ? (f / 0.22) * 1.3 : 1.3 - 0.3 * Math.min(1, (f - 0.22) / 0.2);
    ctx.save();
    ctx.globalAlpha = f > 0.7 ? (1 - f) / 0.3 : 1;
    ctx.translate(p.x, p.y - 27 - f * 10 - (kind === 'kill' ? 7 : 0));
    ctx.rotate(Math.sin(f * 16) * 0.28 * (1 - f));
    ctx.scale(pop, pop);
    ctx.font = `${kind === 'kill' ? 15 : 12}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(kind === 'kill' ? '💀' : '🎯', 0, 0);
    ctx.restore();
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
    p.vy = p.vy * (1 - dt * 2) + (p.g ?? 60) * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    ctx.globalAlpha = Math.max(0, (p.a ?? 1) * (1 - p.age / p.life));
    ctx.fillStyle = p.color;
    const sz = p.size * (1 + (p.grow || 0) * (p.age / p.life));
    if (p.round) { ctx.beginPath(); ctx.arc(p.x, p.y, sz / 2, 0, Math.PI * 2); ctx.fill(); } else ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
  }
  ctx.globalAlpha = 1;
}
