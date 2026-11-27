// Dibujo de Entre Nosotros en un canvas, sin estado de juego. Se dibuja en unidades del mundo
// (casillas): `cam` = { x, y, scale (píxeles por casilla), w, h (píxeles del canvas) }.
import { BUTTON, H, HALLS, LIGHTS_PANEL, OBSTACLES, REACTOR_HANDS, ROOMS, STATIONS, VENTS, W, isFloor, roomAt } from './map.js';

const OUTLINE = '#0b0d12';
const TAU = Math.PI * 2;

export function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.max(0, Math.min(255, Math.round(amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

export function worldTransform(ctx, cam) {
  ctx.setTransform(cam.scale, 0, 0, cam.scale, cam.w / 2 - cam.x * cam.scale, cam.h / 2 - cam.y * cam.scale);
}

// Qué parte del mundo entra en pantalla (con un margen).
export function viewBounds(cam, margin = 2) {
  const hw = cam.w / cam.scale / 2, hh = cam.h / cam.scale / 2;
  return { x0: cam.x - hw - margin, x1: cam.x + hw + margin, y0: cam.y - hh - margin, y1: cam.y + hh + margin };
}
const overlaps = (r, v) => r.x + r.w >= v.x0 && r.x <= v.x1 && r.y + r.h >= v.y0 && r.y <= v.y1;

// Un número al azar que depende solo de la posición (así cada baldosa se ve siempre igual).
const hash = (x, y, n = 0) => { const s = Math.sin(x * 127.1 + y * 311.7 + n * 74.7) * 43758.5453; return s - Math.floor(s); };

function rrect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ─── Cómo se ve cada sala ────────────────────────────────────────────────────
// `kind`: dibujo del piso. `a`/`b`: colores de las baldosas. `accent`: luces de la pared.
const LOOKS = {
  cafeteria: { kind: 'diamond', a: '#aaa795', b: '#c4c1ad', accent: '#ffd98a' },
  upperEngine: { kind: 'plate', a: '#74685c', b: '#80736a', accent: '#ff9a3c', hazard: true },
  lowerEngine: { kind: 'plate', a: '#74685c', b: '#80736a', accent: '#ff9a3c', hazard: true },
  reactor: { kind: 'plate', a: '#566a80', b: '#607689', accent: '#58c7ff', hazard: true },
  security: { kind: 'checker', a: '#5f6a7c', b: '#69758a', accent: '#6bffb0' },
  medbay: { kind: 'checker', a: '#a9bdc6', b: '#b9cbd3', accent: '#7dffd0' },
  electrical: { kind: 'plate', a: '#71695a', b: '#7b7363', accent: '#ffe14d', hazard: true },
  storage: { kind: 'plate', a: '#80745f', b: '#8b7f69', accent: '#ffb347' },
  admin: { kind: 'checker', a: '#6a8574', b: '#739080', accent: '#9dffb8' },
  weapons: { kind: 'plate', a: '#63708a', b: '#6d7b96', accent: '#ff6b5e' },
  o2: { kind: 'checker', a: '#668884', b: '#6f918d', accent: '#7bf5ff' },
  navigation: { kind: 'plate', a: '#617796', b: '#6b82a2', accent: '#79b8ff' },
  shields: { kind: 'plate', a: '#657792', b: '#6f829e', accent: '#a58bff' },
  communications: { kind: 'checker', a: '#646e82', b: '#6e788d', accent: '#ff7bd5' },
};
const HALL_LOOK = { a: '#555d6b', b: '#5d6574', accent: '#8fd7ff' };
const lookAt = (cx, cy) => LOOKS[roomAt(cx + 0.5, cy + 0.5)?.id] || null;

// ─── La nave ─────────────────────────────────────────────────────────────────
export function drawWorld(ctx, cam, { now, myStations, lights, reactor, ventOpen }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  drawSpace(ctx, cam, now);
  worldTransform(ctx, cam);
  const v = viewBounds(cam);
  const cx0 = Math.max(0, Math.floor(v.x0)), cx1 = Math.min(W - 1, Math.ceil(v.x1));
  const cy0 = Math.max(0, Math.floor(v.y0)), cy1 = Math.min(H - 1, Math.ceil(v.y1));

  // Pisos: cada baldosa con el dibujo de su sala.
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (!isFloor(cx, cy)) continue;
      drawTile(ctx, cx, cy);
    }
  }
  // Sombras de las paredes sobre el piso (oclusión ambiental).
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (!isFloor(cx, cy)) continue;
      if (!isFloor(cx - 1, cy)) { ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fillRect(cx, cy, 0.22, 1); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(cx + 0.22, cy, 0.22, 1); }
      if (!isFloor(cx + 1, cy)) { ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fillRect(cx + 0.78, cy, 0.22, 1); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(cx + 0.56, cy, 0.22, 1); }
      if (!isFloor(cx, cy + 1)) { ctx.fillStyle = 'rgba(0,0,0,0.26)'; ctx.fillRect(cx, cy + 0.78, 1, 0.22); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(cx, cy + 0.56, 1, 0.22); }
      if (!isFloor(cx, cy - 1)) { ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(cx, cy, 1, 0.3); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(cx, cy + 0.3, 1, 0.3); }
    }
  }

  // Detalles de cada sala: alfombra, franjas de peligro, luz del techo y nombre.
  for (const r of ROOMS) {
    if (!overlaps(r, v)) continue;
    drawRoomDetails(ctx, r, now, reactor);
  }

  // Paredes: el frente de la pared de arriba (como en el original) y un borde en las demás.
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (!isFloor(cx, cy)) continue;
      drawWalls(ctx, cx, cy, now, reactor);
    }
  }

  // Consolas de las tareas, ventilaciones, tablero de luces y lectores del reactor.
  drawStations(ctx, v, now, myStations);
  drawVents(ctx, v, ventOpen);
  drawPanels(ctx, v, now, lights, reactor);

  // Obstáculos: mesas, cajas, camas, el núcleo del reactor.
  for (const o of OBSTACLES) {
    if (!overlaps(o, v)) continue;
    drawObstacle(ctx, o, now, reactor);
  }
}

// El espacio de afuera: estrellas que titilan, con un poco de paralaje, y alguna fugaz.
const STARS = Array.from({ length: 220 }, (_, i) => ({ x: hash(i, 1), y: hash(i, 2), s: 0.6 + hash(i, 3) * 1.8, a: 0.25 + hash(i, 4) * 0.65, k: 0.1 + hash(i, 5) * 0.3, tw: hash(i, 6) * TAU }));
function drawSpace(ctx, cam, now) {
  const g = ctx.createLinearGradient(0, 0, 0, cam.h);
  g.addColorStop(0, '#070a16');
  g.addColorStop(1, '#03040a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const unit = cam.w / 1000;
  for (const s of STARS) {
    const px = (((s.x * cam.w - cam.x * cam.scale * s.k) % cam.w) + cam.w) % cam.w;
    const py = (((s.y * cam.h - cam.y * cam.scale * s.k) % cam.h) + cam.h) % cam.h;
    ctx.globalAlpha = s.a * (0.65 + 0.35 * Math.sin(now * 1.6 + s.tw));
    ctx.fillStyle = s.s > 1.9 ? '#cfe3ff' : '#ffffff';
    ctx.fillRect(px, py, s.s * Math.max(1, unit * 1.4), s.s * Math.max(1, unit * 1.4));
  }
  ctx.globalAlpha = 1;
  // Estrella fugaz cada tanto.
  const cycle = (now % 9) / 1.1;
  if (cycle < 1) {
    const sx = cam.w * (0.15 + hash(Math.floor(now / 9), 7) * 0.6) + cycle * cam.w * 0.25;
    const sy = cam.h * 0.1 + cycle * cam.h * 0.3;
    const tail = ctx.createLinearGradient(sx, sy, sx - cam.w * 0.08, sy - cam.h * 0.1);
    tail.addColorStop(0, `rgba(255,255,255,${0.9 * (1 - cycle)})`);
    tail.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = tail;
    ctx.lineWidth = 2 * Math.max(1, unit * 1.4);
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx - cam.w * 0.08, sy - cam.h * 0.1); ctx.stroke();
  }
}

function drawTile(ctx, cx, cy) {
  const look = lookAt(cx, cy) || HALL_LOOK;
  const room = roomAt(cx + 0.5, cy + 0.5);
  const kind = room ? look.kind : 'grate';
  const h = hash(cx, cy);
  if (kind === 'diamond') {
    ctx.fillStyle = look.a; ctx.fillRect(cx, cy, 1, 1);
    ctx.fillStyle = look.b;
    ctx.beginPath(); ctx.moveTo(cx + 0.5, cy + 0.03); ctx.lineTo(cx + 0.97, cy + 0.5); ctx.lineTo(cx + 0.5, cy + 0.97); ctx.lineTo(cx + 0.03, cy + 0.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.moveTo(cx + 0.5, cy + 0.03); ctx.lineTo(cx + 0.97, cy + 0.5); ctx.lineTo(cx + 0.5, cy + 0.5); ctx.closePath(); ctx.fill();
  } else if (kind === 'checker') {
    ctx.fillStyle = (cx + cy) % 2 ? look.a : look.b; ctx.fillRect(cx, cy, 1, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(cx, cy, 1, 0.07);
    ctx.fillStyle = 'rgba(0,0,0,0.07)'; ctx.fillRect(cx, cy + 0.93, 1, 0.07);
  } else if (kind === 'grate') {
    ctx.fillStyle = (cx + cy) % 2 ? look.a : look.b; ctx.fillRect(cx, cy, 1, 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.05;
    ctx.beginPath();
    for (let k = 1; k < 4; k++) { ctx.moveTo(cx + k / 4, cy); ctx.lineTo(cx + k / 4, cy + 1); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(cx, cy, 1, 0.06);
  } else {
    ctx.fillStyle = h > 0.5 ? look.a : look.b; ctx.fillRect(cx, cy, 1, 1);
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.06; ctx.strokeRect(cx + 0.03, cy + 0.03, 0.94, 0.94);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(cx + 0.06, cy + 0.06, 0.88, 0.05);
    if (h > 0.82) { // remaches
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (const [rx, ry] of [[0.14, 0.14], [0.86, 0.14], [0.14, 0.86], [0.86, 0.86]]) { ctx.beginPath(); ctx.arc(cx + rx, cy + ry, 0.04, 0, TAU); ctx.fill(); }
    }
  }
}

function drawRoomDetails(ctx, r, now, reactor) {
  const look = LOOKS[r.id];
  if (!look) return;
  // Alfombra: un rectángulo hundido con borde de luz.
  if (r.w >= 10 && r.h >= 9) {
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 0.09;
    rrect(ctx, r.x + 1.6, r.y + 1.9, r.w - 3.2, r.h - 3.5, 0.6); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.12)'; ctx.lineWidth = 0.05;
    rrect(ctx, r.x + 1.85, r.y + 2.15, r.w - 3.7, r.h - 4, 0.45); ctx.stroke();
  }
  // Franjas de peligro (amarillo y negro) contra la pared de abajo.
  if (look.hazard) {
    const y = r.y + r.h - 0.55;
    ctx.save();
    ctx.beginPath(); ctx.rect(r.x + 0.3, y, r.w - 0.6, 0.42); ctx.clip();
    ctx.fillStyle = '#e8c232'; ctx.fillRect(r.x, y, r.w, 0.42);
    ctx.fillStyle = '#1b1d22';
    for (let x = r.x - 1; x < r.x + r.w + 1; x += 0.9) {
      ctx.beginPath(); ctx.moveTo(x, y + 0.42); ctx.lineTo(x + 0.45, y + 0.42); ctx.lineTo(x + 0.87, y); ctx.lineTo(x + 0.42, y); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  // Luz del techo: un charco de luz del color de la sala.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = Math.max(r.w, r.h) * 0.62;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
  const warm = reactor && r.id === 'reactor' ? '255,60,50' : hexRgb(look.accent);
  g.addColorStop(0, `rgba(${warm},${0.13 + (reactor ? 0.07 * Math.sin(now * 8) : 0)})`);
  g.addColorStop(1, `rgba(${warm},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
  // Nombre pintado en el piso.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '800 0.78px "Bricolage Grotesque", Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.20)';
  ctx.fillText(r.name.toUpperCase(), r.x + r.w / 2, r.y + 1.4);
}
const hexRgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`; };

// El frente de la pared (la que se ve de adelante) y las tapas de los costados.
function drawWalls(ctx, cx, cy, now, reactor) {
  const look = lookAt(cx, cy) || HALL_LOOK;
  const topOpen = !isFloor(cx, cy - 1);
  if (topOpen) {
    const y = cy - 1.15;
    ctx.fillStyle = '#4b5365'; ctx.fillRect(cx, y, 1, 0.4);
    ctx.fillStyle = '#3d4455'; ctx.fillRect(cx, y + 0.4, 1, 0.45);
    ctx.fillStyle = '#313744'; ctx.fillRect(cx, y + 0.85, 1, 0.3);
    // Separación de paneles y remaches.
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(cx, y, 0.04, 1.15);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(cx + 0.04, y + 0.06, 0.02, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.arc(cx + 0.14, y + 0.14, 0.04, 0, TAU); ctx.arc(cx + 0.86, y + 0.14, 0.04, 0, TAU); ctx.fill();
    // Franja de luz y, de vez en cuando, una pantallita o un respiradero.
    const flick = reactor ? 0.55 + 0.45 * Math.sin(now * 9) : 1;
    ctx.globalAlpha = 0.28 * flick; ctx.fillStyle = reactor ? '#ff4b3d' : look.accent; ctx.fillRect(cx, y + 0.55, 1, 0.14);
    ctx.globalAlpha = 0.9 * flick; ctx.fillRect(cx, y + 0.59, 1, 0.05);
    ctx.globalAlpha = 1;
    const h = hash(cx, cy, 3);
    if (h > 0.84) {
      ctx.fillStyle = '#10141c'; rrect(ctx, cx + 0.18, y + 0.14, 0.64, 0.34, 0.05); ctx.fill();
      ctx.fillStyle = look.accent; ctx.globalAlpha = 0.5 + 0.4 * Math.sin(now * 3 + cx);
      ctx.fillRect(cx + 0.25, y + 0.2, 0.18 + 0.2 * hash(cx, cy, 4), 0.04);
      ctx.fillRect(cx + 0.25, y + 0.3, 0.34, 0.04);
      ctx.globalAlpha = 1;
    } else if (h < 0.08) {
      ctx.fillStyle = '#20242d'; rrect(ctx, cx + 0.2, y + 0.2, 0.6, 0.3, 0.05); ctx.fill();
      ctx.strokeStyle = '#59616f'; ctx.lineWidth = 0.04; ctx.beginPath();
      for (let k = 1; k < 5; k++) { ctx.moveTo(cx + 0.2 + k * 0.12, y + 0.24); ctx.lineTo(cx + 0.2 + k * 0.12, y + 0.46); }
      ctx.stroke();
    }
    // Tapa de arriba.
    ctx.fillStyle = '#171a22'; ctx.fillRect(cx - 0.02, y - 0.2, 1.04, 0.2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(cx - 0.02, y - 0.2, 1.04, 0.04);
  }
  ctx.fillStyle = '#171a22';
  const leftWall = !isFloor(cx - 1, cy), rightWall = !isFloor(cx + 1, cy);
  if (leftWall) ctx.fillRect(cx - 0.25, cy - (topOpen ? 1.35 : 0), 0.25, topOpen ? 2.35 : 1);
  if (rightWall) ctx.fillRect(cx + 1, cy - (topOpen ? 1.35 : 0), 0.25, topOpen ? 2.35 : 1);
  if (!isFloor(cx, cy + 1)) {
    const x = cx - (leftWall ? 0.25 : 0), wd = 1 + (leftWall ? 0.25 : 0) + (rightWall ? 0.25 : 0);
    ctx.fillRect(x, cy + 1, wd, 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x, cy + 1, wd, 0.05);
  }
  // Luz de borde en las paredes de los costados.
  if (leftWall) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(cx - 0.04, cy, 0.04, 1); }
  if (rightWall) { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(cx + 1, cy, 0.04, 1); }
}

// ─── Consolas, ventilaciones y tableros ─────────────────────────────────────
function drawStations(ctx, v, now, myStations) {
  for (const [id, [x, y]] of Object.entries(STATIONS)) {
    if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
    const mine = myStations?.has(id);
    // Cuerpo de la consola.
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(x, y - 0.02, 0.62, 0.16, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2b323e'; rrect(ctx, x - 0.5, y - 0.95, 1, 0.82, 0.12); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.06; ctx.stroke();
    ctx.fillStyle = '#434c5c'; ctx.fillRect(x - 0.44, y - 0.2, 0.88, 0.07);
    // Pantalla: la mía brilla en amarillo y parpadea.
    const flick = 0.7 + 0.3 * Math.sin(now * 5 + x);
    ctx.fillStyle = mine ? `rgba(255,226,120,${0.75 + 0.25 * flick})` : '#35607a';
    rrect(ctx, x - 0.36, y - 0.85, 0.72, 0.5, 0.07); ctx.fill();
    ctx.fillStyle = mine ? 'rgba(120,70,0,0.45)' : 'rgba(255,255,255,0.18)';
    ctx.fillRect(x - 0.28, y - 0.76, 0.34 + 0.1 * Math.sin(now * 2 + x), 0.05);
    ctx.fillRect(x - 0.28, y - 0.66, 0.5, 0.05);
    ctx.fillRect(x - 0.28, y - 0.56, 0.28, 0.05);
    if (mine) {
      // Aro que respira y signo de exclamación que flota.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(x, y - 0.5, 0.1, x, y - 0.5, 1.7);
      g.addColorStop(0, `rgba(255,210,70,${0.32 + 0.12 * Math.sin(now * 4)})`);
      g.addColorStop(1, 'rgba(255,210,70,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 2, y - 2.2, 4, 4);
      ctx.restore();
      ctx.strokeStyle = `rgba(255,214,64,${0.7 + Math.sin(now * 6) * 0.3})`; ctx.lineWidth = 0.1;
      rrect(ctx, x - 0.6, y - 1.05, 1.2, 1.02, 0.18); ctx.stroke();
      const by = y - 1.7 - Math.abs(Math.sin(now * 3)) * 0.22;
      ctx.fillStyle = '#ffd23f'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.07;
      ctx.beginPath(); ctx.arc(x, by, 0.3, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = OUTLINE; ctx.font = '900 0.46px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('!', x, by + 0.03);
    }
  }
}

function drawVents(ctx, v, ventOpen) {
  VENTS.forEach((vent, i) => {
    if (vent.x < v.x0 || vent.x > v.x1 || vent.y < v.y0 || vent.y > v.y1) return;
    const open = ventOpen?.get(i) || 0;
    ctx.fillStyle = '#1b1f27'; rrect(ctx, vent.x - 0.72, vent.y - 0.44, 1.44, 0.88, 0.14); ctx.fill();
    ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 0.07; ctx.stroke();
    ctx.fillStyle = '#05060a'; rrect(ctx, vent.x - 0.6, vent.y - 0.34, 1.2, 0.68, 0.1); ctx.fill();
    // La tapa: cerrada con rejilla, o levantada si alguien entra o sale.
    const lift = open > 0 ? 0.85 : 0;
    ctx.save();
    ctx.translate(0, -lift * 0.34);
    ctx.fillStyle = '#4a515e'; rrect(ctx, vent.x - 0.6, vent.y - 0.34, 1.2, 0.68 - lift * 0.4, 0.1); ctx.fill();
    ctx.strokeStyle = '#2a2f38'; ctx.lineWidth = 0.07;
    ctx.beginPath();
    for (let k = -2; k <= 2; k++) { ctx.moveTo(vent.x + k * 0.22, vent.y - 0.26); ctx.lineTo(vent.x + k * 0.22, vent.y + 0.26 - lift * 0.4); }
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(vent.x - 0.55, vent.y - 0.32, 1.1, 0.05);
    ctx.restore();
  });
}

function drawPanels(ctx, v, now, lights, reactor) {
  // Tablero de luces de Electricidad.
  if (overlaps({ x: LIGHTS_PANEL.x - 1, y: LIGHTS_PANEL.y - 1, w: 2, h: 2 }, v)) {
    const { x, y } = LIGHTS_PANEL;
    ctx.fillStyle = '#394050'; rrect(ctx, x - 0.65, y - 1.05, 1.3, 0.98, 0.1); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.06; ctx.stroke();
    ctx.fillStyle = '#12151c'; ctx.fillRect(x - 0.55, y - 0.95, 1.1, 0.5);
    for (let k = 0; k < 5; k++) {
      const on = lights ? lights[k] : true;
      ctx.fillStyle = on ? '#5ef08a' : '#6b2b2b';
      ctx.fillRect(x - 0.5 + k * 0.21, y - 0.88, 0.14, 0.36);
      ctx.fillStyle = '#c9ced8'; ctx.fillRect(x - 0.47 + k * 0.21, y - (on ? 0.88 : 0.66), 0.08, 0.14);
    }
    if (lights) {
      ctx.strokeStyle = `rgba(255,90,70,${0.6 + Math.sin(now * 7) * 0.4})`; ctx.lineWidth = 0.14;
      rrect(ctx, x - 0.8, y - 1.2, 1.6, 1.28, 0.18); ctx.stroke();
    }
  }
  // Lectores de mano del reactor.
  REACTOR_HANDS.forEach((h, i) => {
    if (h.x > v.x1 || h.x < v.x0 - 2 || h.y < v.y0 || h.y > v.y1) return;
    ctx.fillStyle = '#323a48'; rrect(ctx, h.x - 0.55, h.y - 0.95, 1.1, 0.95, 0.12); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.06; ctx.stroke();
    const col = reactor ? (reactor.hold[i] ? '#5ef08a' : '#ff5a4f') : '#7fc8ff';
    const pulse = reactor ? 0.6 + 0.4 * Math.sin(now * 8 + i) : 0.85;
    ctx.globalAlpha = pulse; ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(h.x, h.y - 0.48, 0.3, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 0.05; ctx.stroke();
    if (reactor && !reactor.hold[i]) {
      ctx.strokeStyle = `rgba(255,90,70,${pulse})`; ctx.lineWidth = 0.12; rrect(ctx, h.x - 0.7, h.y - 1.1, 1.4, 1.25, 0.18); ctx.stroke();
    }
  });
}

// ─── Obstáculos ──────────────────────────────────────────────────────────────
// Un banco curvo alrededor de una mesa redonda (como los de la cafetería).
function bench(ctx, cx, cy, rx, ry, from, to, color) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = shade(color, -0.45); ctx.lineWidth = 0.62;
  ctx.beginPath(); ctx.ellipse(cx, cy + 0.06, rx, ry, 0, from, to); ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, from, to); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 0.09;
  ctx.beginPath(); ctx.ellipse(cx, cy - 0.12, rx, ry, 0, from, to); ctx.stroke();
  ctx.lineCap = 'butt';
}

function drawObstacle(ctx, o, now, reactor) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  if ((o.kind === 'table' && Math.abs(o.w - o.h) < 1) || o.kind === 'button') {
    const r = Math.min(o.w, o.h) / 2;
    const gaps = o.kind === 'button' ? 4 : 3;
    for (let k = 0; k < gaps; k++) {
      const a0 = (k / gaps) * TAU + 0.35, a1 = ((k + 1) / gaps) * TAU - 0.35;
      bench(ctx, cx, cy, r + 0.55, (r + 0.55) * 0.9, a0, a1, '#3a6fb8');
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(cx, cy + 0.3, r, r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7d8592'; ctx.beginPath(); ctx.ellipse(cx, cy + 0.12, r, r * 0.9, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c4cad4'; ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.97, r * 0.88, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(cx - r * 0.2, cy - r * 0.3, r * 0.55, r * 0.22, -0.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#6a7280'; ctx.lineWidth = 0.08;
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.97, r * 0.88, 0, 0, TAU); ctx.stroke();
    if (o.kind === 'button') {
      const pulse = 0.5 + 0.5 * Math.sin(now * 3);
      ctx.fillStyle = '#2a2e38'; ctx.beginPath(); ctx.ellipse(cx, cy - 0.2, 1.15, 0.92, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8c23a';
      for (let k = 0; k < 14; k++) { // marco amarillo y negro del botón
        const a = (k / 14) * TAU;
        if (k % 2) continue;
        ctx.beginPath(); ctx.ellipse(cx, cy - 0.2, 1.1, 0.88, 0, a, a + TAU / 14); ctx.lineTo(cx, cy - 0.2); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#2a2e38'; ctx.beginPath(); ctx.ellipse(cx, cy - 0.2, 0.86, 0.68, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#b3181a'; ctx.beginPath(); ctx.ellipse(cx, cy - 0.1, 0.7, 0.54, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgb(${220 + pulse * 30},${40 + pulse * 20},${40 + pulse * 20})`; ctx.beginPath(); ctx.ellipse(cx, cy - 0.28, 0.7, 0.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(cx - 0.2, cy - 0.45, 0.24, 0.12, -0.4, 0, TAU); ctx.fill();
      ctx.fillStyle = '#e8c23a'; ctx.font = '800 0.3px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('EMERGENCIA', cx, cy + 1.25);
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(cx, cy - 0.2, 0.3, cx, cy - 0.2, 2.6);
      g.addColorStop(0, `rgba(255,60,50,${0.12 + 0.1 * pulse})`); g.addColorStop(1, 'rgba(255,60,50,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 3, cy - 3, 6, 6); ctx.restore();
    }
  } else if (o.kind === 'table') { // mesa larga de Administración, con el mapa holográfico
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, o.x, o.y + 0.25, o.w, o.h, 0.3); ctx.fill();
    ctx.fillStyle = '#2d3442'; rrect(ctx, o.x, o.y, o.w, o.h, 0.3); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.07; ctx.stroke();
    ctx.fillStyle = '#0f2a3a'; rrect(ctx, o.x + 0.25, o.y + 0.25, o.w - 0.5, o.h - 0.55, 0.15); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.rect(o.x + 0.25, o.y + 0.25, o.w - 0.5, o.h - 0.55); ctx.clip();
    ctx.strokeStyle = `rgba(110,220,255,${0.35 + 0.15 * Math.sin(now * 2)})`; ctx.lineWidth = 0.05;
    for (let x = o.x + 0.6; x < o.x + o.w; x += 0.6) { ctx.beginPath(); ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); ctx.stroke(); }
    const sweep = o.x + 0.25 + ((now * 1.2) % (o.w - 0.5));
    ctx.fillStyle = 'rgba(120,230,255,0.28)'; ctx.fillRect(sweep, o.y + 0.25, 0.14, o.h);
    ctx.restore();
  } else if (o.kind === 'crate') {
    const top = Math.min(0.5, o.h * 0.28);
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(o.x + 0.1, o.y + o.h - 0.05, o.w, 0.3);
    ctx.fillStyle = '#6d5230'; rrect(ctx, o.x + 0.05, o.y + top, o.w - 0.1, o.h - top, 0.06); ctx.fill();
    ctx.fillStyle = '#a07c48'; rrect(ctx, o.x + 0.05, o.y + 0.05, o.w - 0.1, top + 0.15, 0.06); ctx.fill();
    ctx.strokeStyle = '#46341d'; ctx.lineWidth = 0.08;
    rrect(ctx, o.x + 0.05, o.y + 0.05, o.w - 0.1, o.h - 0.1, 0.06); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(o.x + 0.1, o.y + top + 0.1); ctx.lineTo(o.x + o.w - 0.1, o.y + o.h - 0.1); ctx.moveTo(o.x + o.w - 0.1, o.y + top + 0.1); ctx.lineTo(o.x + 0.1, o.y + o.h - 0.1); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(o.x + 0.1, o.y + 0.1, o.w - 0.2, 0.06);
    ctx.fillStyle = '#d9b343'; // esquinas con refuerzo
    for (const [px, py] of [[0.1, 0.1], [o.w - 0.34, 0.1], [0.1, o.h - 0.34], [o.w - 0.34, o.h - 0.34]]) ctx.fillRect(o.x + px, o.y + py, 0.24, 0.24);
  } else if (o.kind === 'core') {
    const rate = reactor ? 9 : 2;
    const pulse = 0.5 + Math.sin(now * rate) * 0.5;
    const col = reactor ? '255,80,60' : '90,200,255';
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; rrect(ctx, o.x + 0.1, o.y + 0.3, o.w - 0.2, o.h - 0.2, 0.7); ctx.fill();
    ctx.fillStyle = '#222a37'; rrect(ctx, o.x + 0.1, o.y + 0.1, o.w - 0.2, o.h - 0.2, 0.7); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.08; ctx.stroke();
    ctx.fillStyle = `rgba(${col},${0.5 + pulse * 0.4})`; rrect(ctx, o.x + 0.65, o.y + 0.65, o.w - 1.3, o.h - 1.3, 0.5); ctx.fill();
    // Anillos que giran alrededor del núcleo.
    ctx.strokeStyle = `rgba(${col},0.9)`; ctx.lineWidth = 0.09;
    for (let k = 0; k < 3; k++) {
      const a = now * (reactor ? 4 : 1.2) + (k * TAU) / 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, 1.2, 2.1, 0, a, a + 1.4); ctx.stroke();
    }
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(cx, cy, 0.4, cx, cy, 5);
    g.addColorStop(0, `rgba(${col},${0.25 + pulse * 0.2})`); g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g; ctx.fillRect(cx - 5, cy - 5, 10, 10); ctx.restore();
  } else if (o.kind === 'bed') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; rrect(ctx, o.x + 0.08, o.y + 0.25, o.w - 0.1, o.h - 0.1, 0.25); ctx.fill();
    ctx.fillStyle = '#7da6c4'; rrect(ctx, o.x + 0.05, o.y + 0.1, o.w - 0.1, o.h - 0.2, 0.25); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.06; ctx.stroke();
    ctx.fillStyle = '#e9f1f7'; rrect(ctx, o.x + 0.18, o.y + 0.25, 0.8, o.h - 0.5, 0.18); ctx.fill();
    ctx.fillStyle = '#bcd6e8'; ctx.fillRect(o.x + 1.15, o.y + 0.2, o.w - 1.35, o.h - 0.4);
    ctx.fillStyle = '#4ad9a6'; ctx.fillRect(o.x + o.w - 0.5, o.y + 0.28, 0.25, 0.06 + 0.04 * Math.sin(now * 4));
  } else if (o.kind === 'desk') {
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fillRect(o.x, o.y + 0.5, o.w, o.h - 0.1);
    ctx.fillStyle = '#3a414f'; rrect(ctx, o.x, o.y + 0.2, o.w, o.h - 0.2, 0.1); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.06; ctx.stroke();
    for (let k = 0; k < 3; k++) {
      const x = o.x + 0.2 + k * 1.28;
      ctx.fillStyle = '#10141c'; rrect(ctx, x, o.y + 0.28, 1.0, 0.7, 0.08); ctx.fill();
      ctx.fillStyle = `rgba(110,255,170,${0.45 + 0.35 * hash(k, Math.floor(now * 3))})`;
      ctx.fillRect(x + 0.1, o.y + 0.38, 0.8, 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x + 0.1, o.y + 0.38 + ((now * 0.8 + k * 0.3) % 0.5), 0.8, 0.05);
    }
  }
}

// ─── Personajes ──────────────────────────────────────────────────────────────
// El poroto con visor, parado en (x, y) (los pies). `facing` 1 = mira a la derecha.
export function drawCrewmate(ctx, x, y, color, { facing = 1, phase = 0, moving = false, alpha = 1, ghost = false, scanning = false, now = 0 } = {}) {
  const dark = shade(color, -0.4);
  const light = shade(color, 0.4);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.globalAlpha = alpha;
  // Rebote al caminar y respiración quieto: el cuerpo se estira y se achata un poquito.
  const stride = Math.sin(phase);
  const bob = moving ? Math.abs(stride) * 0.075 : 0;
  const squash = moving ? 1 + Math.cos(phase * 2) * 0.025 : 1 + Math.sin(now * 2.2) * 0.012;
  if (!ghost) {
    const sh = 1 - bob * 2.5;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(0, 0.34, 0.58 * sh, 0.17 * sh, 0, 0, TAU); ctx.fill();
  }
  const float = ghost ? 0.3 + Math.sin(now * 3) * 0.1 : 0;
  ctx.translate(0, -bob - float);
  if (moving && !ghost) ctx.rotate(Math.sign(stride) * 0.03);
  ctx.scale(1 / squash, squash);
  ctx.lineWidth = 0.1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  // Mochila.
  ctx.fillStyle = dark;
  rrect(ctx, -0.76, -1.0, 0.36, 0.84, 0.15); ctx.fill(); ctx.stroke();
  ctx.fillStyle = shade(color, -0.15);
  rrect(ctx, -0.7, -0.94, 0.14, 0.7, 0.07); ctx.fill();
  // Piernas: se turnan al caminar (una adelanta mientras la otra se acorta).
  if (!ghost) {
    const sw = moving ? stride * 0.17 : 0;
    const lift = (s) => (moving ? Math.max(0, s) * 0.16 : 0);
    ctx.fillStyle = color;
    rrect(ctx, -0.44 + sw, -0.16, 0.38, 0.5 - lift(stride), 0.15); ctx.fill(); ctx.stroke();
    rrect(ctx, 0.07 - sw, -0.16, 0.38, 0.5 - lift(-stride), 0.15); ctx.fill(); ctx.stroke();
  }
  // Cuerpo (los fantasmas terminan en una cola ondulada). El camino se arma dos veces: para
  // pintarlo (y recortar la sombra) y para el contorno, que si no tomaba el de la sombra.
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-0.5, -0.1);
    ctx.lineTo(-0.5, -0.98);
    ctx.bezierCurveTo(-0.5, -1.62, 0.5, -1.62, 0.5, -0.98);
    if (ghost) {
      ctx.lineTo(0.5, 0.1);
      for (let k = 0; k < 4; k++) {
        const x0 = 0.5 - k * 0.25, wob = Math.sin(now * 5 + k * 1.3) * 0.08;
        ctx.quadraticCurveTo(x0 - 0.06, 0.28 + wob, x0 - 0.125, 0.08);
        ctx.quadraticCurveTo(x0 - 0.19, -0.06, x0 - 0.25, 0.1);
      }
    } else {
      ctx.lineTo(0.5, -0.1);
      ctx.quadraticCurveTo(0.5, 0.06, 0.32, 0.06);
      ctx.lineTo(-0.32, 0.06);
      ctx.quadraticCurveTo(-0.5, 0.06, -0.5, -0.1);
    }
    ctx.closePath();
  };
  ctx.fillStyle = color;
  body();
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Sombra de la espalda y brillo de arriba.
  ctx.fillStyle = dark;
  ctx.globalAlpha = alpha * 0.5;
  ctx.beginPath(); ctx.ellipse(-0.6, -0.5, 0.34, 0.95, 0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.ellipse(0, 0.2, 0.6, 0.22, 0, 0, TAU); ctx.fill();
  ctx.globalAlpha = alpha * 0.55;
  ctx.fillStyle = light;
  ctx.beginPath(); ctx.ellipse(-0.1, -1.36, 0.3, 0.12, -0.35, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;
  body();
  ctx.stroke();
  // Visor con degradé y reflejos.
  const vg = ctx.createLinearGradient(0, -1.2, 0, -0.72);
  vg.addColorStop(0, '#c4f0ff');
  vg.addColorStop(0.55, '#7fc4dc');
  vg.addColorStop(1, '#3f7f98');
  ctx.fillStyle = vg;
  ctx.beginPath(); ctx.ellipse(0.17, -0.96, 0.36, 0.23, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(0.28, -1.05, 0.14, 0.065, -0.2, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath(); ctx.ellipse(0.05, -0.86, 0.1, 0.035, -0.2, 0, TAU); ctx.fill();
  ctx.restore();
  // Escaneo (tarea visual): un haz verde que sube y baja.
  if (scanning) {
    const t = (Math.sin(now * 3) + 1) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(70,255,140,0.2)';
    ctx.fillRect(x - 0.7, y - 1.7, 1.4, 2.05);
    ctx.fillStyle = 'rgba(150,255,190,0.95)';
    ctx.fillRect(x - 0.75, y - 1.7 + t * 2, 1.5, 0.08);
    ctx.globalAlpha = 0.25; ctx.fillRect(x - 0.75, y - 1.7 + t * 2 - 0.16, 1.5, 0.16);
    ctx.restore();
  }
}

// Un cuerpo: medio poroto con el hueso asomando. `age` (segundos desde que cayó) anima la caída.
export function drawBody(ctx, x, y, color, age = 9) {
  const dark = shade(color, -0.4);
  const fall = Math.min(1, age / 0.4);
  const drop = (1 - fall) * (1 - fall) * 0.9;
  const bounce = age > 0.4 && age < 0.62 ? Math.sin(((age - 0.4) / 0.22) * Math.PI) * 0.12 : 0;
  ctx.save();
  ctx.translate(x, y);
  // Charco de sangre que se va abriendo.
  const pool = Math.min(1, age / 1.2);
  ctx.fillStyle = 'rgba(120,8,8,0.8)';
  ctx.beginPath(); ctx.ellipse(0.1, 0.32, 0.4 + pool * 0.45, 0.12 + pool * 0.14, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 0.32, 0.62, 0.16, 0, 0, TAU); ctx.fill();
  ctx.translate(0, -drop - bounce);
  ctx.lineWidth = 0.1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = color;
  rrect(ctx, -0.44, -0.1, 0.38, 0.44, 0.15); ctx.fill(); ctx.stroke();
  rrect(ctx, 0.07, -0.1, 0.38, 0.44, 0.15); ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark; rrect(ctx, -0.76, -0.5, 0.34, 0.5, 0.14); ctx.fill(); ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-0.5, -0.05);
  ctx.lineTo(-0.5, -0.52);
  ctx.lineTo(-0.3, -0.43); ctx.lineTo(-0.15, -0.58); ctx.lineTo(0.05, -0.44); ctx.lineTo(0.22, -0.59); ctx.lineTo(0.5, -0.46);
  ctx.lineTo(0.5, -0.05);
  ctx.quadraticCurveTo(0.5, 0.09, 0.32, 0.09);
  ctx.lineTo(-0.32, 0.09);
  ctx.quadraticCurveTo(-0.5, 0.09, -0.5, -0.05);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark;
  ctx.fillRect(-0.45, -0.4, 0.9, 0.1);
  // Hueso.
  ctx.fillStyle = '#f4f0e4'; ctx.strokeStyle = OUTLINE; ctx.lineWidth = 0.05;
  ctx.fillRect(-0.06, -1.0, 0.14, 0.56);
  ctx.beginPath(); ctx.arc(-0.05, -1.03, 0.11, 0, TAU); ctx.arc(0.09, -1.03, 0.11, 0, TAU); ctx.fill();
  ctx.restore();
}

export function drawName(ctx, x, y, text, color, scaleUp = 1) {
  ctx.save();
  ctx.font = `800 ${0.52 * scaleUp}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 0.15;
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.strokeText(text, x, y - 1.75);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y - 1.75);
  ctx.restore();
}

// ─── Partículas (solo dibujo) ────────────────────────────────────────────────
// { x, y, vx, vy, life, max, size, color, kind: 'dust' | 'blood' | 'spark' | 'puff' | 'ring', g }
export function stepParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life -= dt;
    if (p.life <= 0) { list.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += (p.g || 0) * dt;
    if (p.kind === 'blood' && p.y > p.floor) { p.y = p.floor; p.vx *= 0.3; p.vy = 0; p.g = 0; }
  }
}
export function drawParticles(ctx, list) {
  for (const p of list) {
    const k = p.life / p.max;
    ctx.globalAlpha = Math.max(0, p.kind === 'ring' ? k * 0.8 : k);
    if (p.kind === 'ring') {
      ctx.strokeStyle = p.color; ctx.lineWidth = 0.1;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 - k) + 0.2, 0, TAU); ctx.stroke();
    } else {
      ctx.fillStyle = p.color;
      const s = p.kind === 'dust' || p.kind === 'puff' ? p.size * (1.6 - k * 0.6) : p.size * (0.5 + k * 0.5);
      ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ─── Niebla ──────────────────────────────────────────────────────────────────
// Oscurece todo menos el polígono de la vista (con el borde suave). `poly` en unidades del mundo.
let fog = null;
export function drawFog(ctx, cam, poly, cx, cy, radius) {
  if (!fog) fog = document.createElement('canvas');
  if (fog.width !== cam.w || fog.height !== cam.h) { fog.width = cam.w; fog.height = cam.h; }
  const f = fog.getContext('2d');
  f.setTransform(1, 0, 0, 1, 0, 0);
  f.globalCompositeOperation = 'source-over';
  f.clearRect(0, 0, cam.w, cam.h);
  f.fillStyle = 'rgba(5,7,14,0.88)';
  f.fillRect(0, 0, cam.w, cam.h);
  worldTransform(f, cam);
  f.globalCompositeOperation = 'destination-out';
  const g = f.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.75)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  f.fillStyle = g;
  f.beginPath();
  f.moveTo(poly[0], poly[1]);
  for (let i = 2; i < poly.length; i += 2) f.lineTo(poly[i], poly[i + 1]);
  f.closePath();
  f.fill();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(fog, 0, 0);
}

// ─── El mapa de la nave (Tab) ────────────────────────────────────────────────
// Plano azul translúcido como el del juego original: salas azules, pasillos claros, nombres, un «!»
// en cada tarea que te toca y vos como un poroto chiquito. Se dibuja en el canvas `ctx` de w × h
// (con la misma proporción que el mapa). `me` = { x, y, color }.
export function drawShipMap(ctx, w, h, { me, tasks, sabotage, now, alarms = [] }) {
  const s = Math.min(w / W, h / H);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(s, 0, 0, s, (w - W * s) / 2, (h - H * s) / 2);
  ctx.lineJoin = 'round';
  // Resplandor del casco.
  ctx.fillStyle = 'rgba(120,150,255,0.22)';
  for (const r of [...HALLS, ...ROOMS]) { rrect(ctx, r.x - 1, r.y - 1, r.w + 2, r.h + 2, 1.6); ctx.fill(); }
  // Pasillos y salas.
  ctx.fillStyle = 'rgba(176,196,255,0.55)';
  for (const r of HALLS) ctx.fillRect(r.x, r.y, r.w, r.h);
  for (const r of ROOMS) {
    ctx.fillStyle = 'rgba(22,52,236,0.92)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = 'rgba(140,170,255,0.9)'; ctx.lineWidth = 0.45;
    ctx.strokeRect(r.x + 0.2, r.y + 0.2, r.w - 0.4, r.h - 0.4);
  }
  // Muebles: sombras más oscuras adentro de las salas.
  ctx.fillStyle = 'rgba(6,20,150,0.9)';
  for (const o of OBSTACLES) { rrect(ctx, o.x, o.y, o.w, o.h, 0.8); ctx.fill(); }
  // Nombres.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = 'rgba(0,10,80,0.8)';
  ctx.fillStyle = '#ffffff';
  for (const r of ROOMS) {
    ctx.font = `700 ${Math.min(2.3, (r.w * 1.55) / r.name.length)}px Inter, sans-serif`;
    const ty = r.id === 'cafeteria' ? r.y + r.h - 3.2 : r.y + r.h / 2 + 1.2;
    ctx.strokeText(r.name, r.x + r.w / 2, ty);
    ctx.fillText(r.name, r.x + r.w / 2, ty);
  }
  // Botón de emergencia.
  ctx.fillStyle = '#ff4d4d'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.3;
  ctx.beginPath(); ctx.arc(BUTTON.x, BUTTON.y, 1, 0, TAU); ctx.fill(); ctx.stroke();
  // Tareas: cartelito amarillo con «!» que rebota.
  for (const [x, y] of tasks || []) badge(ctx, x, y - 2.8 - Math.abs(Math.sin(now * 3 + x)) * 0.7, '!', '#ffd23f', '#1a1400', 1.8);
  // Sabotaje en marcha: avisos rojos que titilan.
  const flash = 0.55 + Math.sin(now * 8) * 0.45;
  if (sabotage?.kind === 'lights') badge(ctx, LIGHTS_PANEL.x, LIGHTS_PANEL.y - 2.4, '!', `rgba(255,70,60,${flash})`, '#fff', 2.3);
  if (sabotage?.kind === 'reactor') for (const r of REACTOR_HANDS) badge(ctx, r.x + 1.5, r.y - 1.4, '!', `rgba(255,70,60,${flash})`, '#fff', 2.3);
  for (const [x, y] of alarms) badge(ctx, x, y, '!', `rgba(255,70,60,${flash})`, '#fff', 2.3);
  // Vos.
  if (me) {
    ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.2 * Math.sin(now * 4)})`;
    ctx.beginPath(); ctx.arc(me.x, me.y, 2.6 + Math.sin(now * 4) * 0.4, 0, TAU); ctx.fill();
    ctx.save();
    ctx.translate(me.x, me.y + 1.3);
    ctx.scale(1.55, 1.55);
    drawCrewmate(ctx, 0, 0, me.color || '#ffffff', { facing: me.facing || 1, now });
    ctx.restore();
  }
}

function badge(ctx, x, y, text, fill, ink, r) {
  ctx.fillStyle = fill; ctx.strokeStyle = '#0b0d12'; ctx.lineWidth = 0.35;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink; ctx.font = `900 ${r * 1.35}px Inter, sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y + r * 0.06);
}
