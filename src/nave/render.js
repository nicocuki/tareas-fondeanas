// Dibujo de Entre Nosotros en un canvas, sin estado de juego. Se dibuja en unidades del mundo
// (casillas): `cam` = { x, y, scale (píxeles por casilla), w, h (píxeles del canvas) }.
import { BUTTON, H, HALLS, LIGHTS_PANEL, OBSTACLES, REACTOR_HANDS, ROOMS, STATIONS, VENTS, W, isFloor } from './map.js';

const HALL_FLOOR = '#575c66';
const WALL_FACE = '#3a3f4b';
const WALL_TOP = '#1d2029';
const OUTLINE = '#0b0d12';

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

// Estrellas del fondo: fijas en la pantalla, con un poco de paralaje.
const STARS = Array.from({ length: 160 }, (_, i) => {
  const r = (n) => { const x = Math.sin(i * 127.1 + n * 311.7) * 43758.5453; return x - Math.floor(x); };
  return { x: r(1), y: r(2), s: 0.6 + r(3) * 1.6, a: 0.3 + r(4) * 0.6 };
});

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

// ─── La nave ─────────────────────────────────────────────────────────────────
export function drawWorld(ctx, cam, { now, myStations, lights, reactor, ventOpen }) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05060b';
  ctx.fillRect(0, 0, cam.w, cam.h);
  for (const s of STARS) {
    const px = (((s.x * cam.w - cam.x * cam.scale * 0.15) % cam.w) + cam.w) % cam.w;
    const py = (((s.y * cam.h - cam.y * cam.scale * 0.15) % cam.h) + cam.h) % cam.h;
    ctx.fillStyle = `rgba(255,255,255,${s.a})`;
    ctx.fillRect(px, py, s.s, s.s);
  }
  worldTransform(ctx, cam);
  const v = viewBounds(cam);

  // Pisos: pasillos y salas, con la grilla de baldosas.
  ctx.fillStyle = HALL_FLOOR;
  for (const r of HALLS) if (overlaps(r, v)) ctx.fillRect(r.x, r.y, r.w, r.h);
  for (const r of ROOMS) if (overlaps(r, v)) { ctx.fillStyle = r.floor; ctx.fillRect(r.x, r.y, r.w, r.h); }
  ctx.strokeStyle = 'rgba(0,0,0,0.13)';
  ctx.lineWidth = 0.04;
  ctx.beginPath();
  for (const r of [...ROOMS, ...HALLS]) {
    if (!overlaps(r, v)) continue;
    for (let x = r.x + 1; x < r.x + r.w; x++) { ctx.moveTo(x, r.y); ctx.lineTo(x, r.y + r.h); }
    for (let y = r.y + 1; y < r.y + r.h; y++) { ctx.moveTo(r.x, y); ctx.lineTo(r.x + r.w, y); }
  }
  ctx.stroke();

  // Paredes: el frente de la pared de arriba (como en el original) y un borde en las demás.
  const cx0 = Math.max(0, Math.floor(v.x0)), cx1 = Math.min(W - 1, Math.ceil(v.x1));
  const cy0 = Math.max(0, Math.floor(v.y0)), cy1 = Math.min(H - 1, Math.ceil(v.y1));
  for (let cy = cy0; cy <= cy1; cy++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      if (!isFloor(cx, cy)) continue;
      if (!isFloor(cx, cy - 1)) {
        ctx.fillStyle = WALL_FACE; ctx.fillRect(cx, cy - 1.15, 1, 1.15);
        ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fillRect(cx, cy - 0.5, 1, 0.08);
        ctx.fillStyle = WALL_TOP; ctx.fillRect(cx - 0.02, cy - 1.35, 1.04, 0.25);
      }
      ctx.fillStyle = WALL_TOP;
      if (!isFloor(cx - 1, cy)) ctx.fillRect(cx - 0.25, cy - (isFloor(cx, cy - 1) ? 0 : 1.35), 0.25, isFloor(cx, cy - 1) ? 1 : 2.35);
      if (!isFloor(cx + 1, cy)) ctx.fillRect(cx + 1, cy - (isFloor(cx, cy - 1) ? 0 : 1.35), 0.25, isFloor(cx, cy - 1) ? 1 : 2.35);
      if (!isFloor(cx, cy + 1)) ctx.fillRect(cx - (isFloor(cx - 1, cy) ? 0 : 0.25), cy + 1, 1 + (isFloor(cx - 1, cy) ? 0 : 0.25) + (isFloor(cx + 1, cy) ? 0 : 0.25), 0.3);
    }
  }

  // Nombres de las salas.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 0.72px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  for (const r of ROOMS) if (overlaps(r, v)) ctx.fillText(r.name.toUpperCase(), r.x + r.w / 2, r.y + 1.2);

  // Consolas de las tareas (las mías, marcadas en amarillo).
  for (const [id, [x, y]] of Object.entries(STATIONS)) {
    if (x < v.x0 || x > v.x1 || y < v.y0 || y > v.y1) continue;
    const mine = myStations?.has(id);
    ctx.fillStyle = '#353c48';
    rrect(ctx, x - 0.45, y - 0.85, 0.9, 0.7, 0.12); ctx.fill();
    ctx.fillStyle = mine ? '#ffe58a' : '#7d8b9c';
    ctx.fillRect(x - 0.32, y - 0.75, 0.64, 0.38);
    if (mine) {
      ctx.strokeStyle = `rgba(255,214,64,${0.65 + Math.sin(now * 6) * 0.35})`;
      ctx.lineWidth = 0.12;
      rrect(ctx, x - 0.55, y - 0.95, 1.1, 0.9, 0.18); ctx.stroke();
    }
  }

  // Ventilaciones.
  VENTS.forEach((vent, i) => {
    if (vent.x < v.x0 || vent.x > v.x1 || vent.y < v.y0 || vent.y > v.y1) return;
    const open = ventOpen?.get(i) || 0;
    ctx.fillStyle = '#23272f';
    rrect(ctx, vent.x - 0.65, vent.y - 0.38, 1.3, 0.76, 0.12); ctx.fill();
    if (open > 0) {
      ctx.fillStyle = '#05060a';
      rrect(ctx, vent.x - 0.55, vent.y - 0.3, 1.1, 0.6, 0.1); ctx.fill();
    } else {
      ctx.strokeStyle = '#5b6370';
      ctx.lineWidth = 0.07;
      ctx.beginPath();
      for (let k = -2; k <= 2; k++) { ctx.moveTo(vent.x + k * 0.22, vent.y - 0.26); ctx.lineTo(vent.x + k * 0.22, vent.y + 0.26); }
      ctx.stroke();
    }
  });

  // Tablero de luces y lectores del reactor.
  if (overlaps({ x: LIGHTS_PANEL.x - 1, y: LIGHTS_PANEL.y - 1, w: 2, h: 2 }, v)) {
    ctx.fillStyle = '#4a5160';
    rrect(ctx, LIGHTS_PANEL.x - 0.6, LIGHTS_PANEL.y - 1, 1.2, 0.9, 0.1); ctx.fill();
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = lights ? (lights[k] ? '#5ef08a' : '#3a2a2a') : '#5ef08a';
      ctx.fillRect(LIGHTS_PANEL.x - 0.48 + k * 0.2, LIGHTS_PANEL.y - 0.8, 0.13, 0.13);
    }
    if (lights) {
      ctx.strokeStyle = `rgba(255,214,64,${0.6 + Math.sin(now * 6) * 0.4})`;
      ctx.lineWidth = 0.12;
      rrect(ctx, LIGHTS_PANEL.x - 0.72, LIGHTS_PANEL.y - 1.12, 1.44, 1.14, 0.16); ctx.stroke();
    }
  }
  REACTOR_HANDS.forEach((h, i) => {
    if (h.x > v.x1 || h.x < v.x0 - 2 || h.y < v.y0 || h.y > v.y1) return;
    ctx.fillStyle = '#3c4350';
    rrect(ctx, h.x - 0.5, h.y - 0.9, 1, 0.9, 0.1); ctx.fill();
    ctx.fillStyle = reactor ? (reactor.hold[i] ? '#5ef08a' : '#ff5a4f') : '#7fc8ff';
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(h.x, h.y - 0.45, 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  });

  // Obstáculos: mesas, cajas, camas, el núcleo del reactor.
  for (const o of OBSTACLES) {
    if (!overlaps(o, v)) continue;
    drawObstacle(ctx, o, now, reactor);
  }
}

function drawObstacle(ctx, o, now, reactor) {
  const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
  if (o.kind === 'table' || o.kind === 'button') {
    const r = Math.min(o.w, o.h) / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.ellipse(cx, cy + 0.25, r, r * 0.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b6bcc7';
    ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.97, r * 0.88, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#7d8592'; ctx.lineWidth = 0.1; ctx.stroke();
    if (o.kind === 'button') {
      ctx.fillStyle = '#d3d9e2';
      ctx.beginPath(); ctx.ellipse(cx, cy, 0.95, 0.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d4231d';
      ctx.beginPath(); ctx.ellipse(cx, cy - 0.12, 0.62, 0.5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(cx - 0.18, cy - 0.3, 0.2, 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
    }
  } else if (o.kind === 'crate') {
    ctx.fillStyle = '#8b6a3e';
    ctx.fillRect(o.x + 0.08, o.y + 0.08, o.w - 0.16, o.h - 0.16);
    ctx.strokeStyle = '#5d4424'; ctx.lineWidth = 0.12;
    ctx.strokeRect(o.x + 0.08, o.y + 0.08, o.w - 0.16, o.h - 0.16);
    ctx.beginPath(); ctx.moveTo(o.x + 0.1, o.y + 0.1); ctx.lineTo(o.x + o.w - 0.1, o.y + o.h - 0.1); ctx.stroke();
  } else if (o.kind === 'core') {
    const pulse = 0.5 + Math.sin(now * (reactor ? 9 : 2)) * 0.5;
    ctx.fillStyle = '#2b3442';
    rrect(ctx, o.x + 0.1, o.y + 0.1, o.w - 0.2, o.h - 0.2, 0.6); ctx.fill();
    ctx.fillStyle = reactor ? `rgba(255,80,60,${0.5 + pulse * 0.5})` : `rgba(90,200,255,${0.5 + pulse * 0.4})`;
    rrect(ctx, o.x + 0.7, o.y + 0.6, o.w - 1.4, o.h - 1.2, 0.5); ctx.fill();
  } else if (o.kind === 'bed') {
    ctx.fillStyle = '#dfe6ee'; rrect(ctx, o.x + 0.05, o.y + 0.1, o.w - 0.1, o.h - 0.2, 0.2); ctx.fill();
    ctx.fillStyle = '#9fb3c8'; rrect(ctx, o.x + 0.15, o.y + 0.25, 0.7, o.h - 0.5, 0.15); ctx.fill();
  } else if (o.kind === 'desk') {
    ctx.fillStyle = '#4b5563'; ctx.fillRect(o.x, o.y + 0.2, o.w, o.h - 0.2);
    ctx.fillStyle = '#7dd3fc';
    for (let k = 0; k < 3; k++) ctx.fillRect(o.x + 0.3 + k * 1.25, o.y + 0.4, 0.9, 0.6);
  }
}

// ─── Personajes ──────────────────────────────────────────────────────────────
// El poroto con visor, parado en (x, y) (los pies). `facing` 1 = mira a la derecha.
export function drawCrewmate(ctx, x, y, color, { facing = 1, phase = 0, moving = false, alpha = 1, ghost = false, scanning = false, now = 0 } = {}) {
  const dark = shade(color, -0.4);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.globalAlpha = alpha;
  const bob = moving ? Math.abs(Math.sin(phase)) * 0.06 : 0;
  if (!ghost) {
    // Sombra.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 0.32, 0.55, 0.16, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.translate(0, -bob - (ghost ? 0.25 + Math.sin(now * 3) * 0.08 : 0));
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = OUTLINE;
  // Mochila.
  ctx.fillStyle = dark;
  rrect(ctx, -0.72, -0.95, 0.34, 0.78, 0.14); ctx.fill(); ctx.stroke();
  // Piernas.
  if (!ghost) {
    const swing = moving ? Math.sin(phase) * 0.16 : 0;
    ctx.fillStyle = color;
    rrect(ctx, -0.42 + swing, -0.15, 0.36, 0.48 - Math.max(0, swing) * 0.6, 0.14); ctx.fill(); ctx.stroke();
    rrect(ctx, 0.06 - swing, -0.15, 0.36, 0.48 - Math.max(0, -swing) * 0.6, 0.14); ctx.fill(); ctx.stroke();
  }
  // Cuerpo (los fantasmas terminan en una cola ondulada). El camino se arma dos veces: para
  // pintarlo (y recortar la sombra) y para el contorno, que si no tomaba el de la sombra.
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-0.48, -0.1);
    ctx.lineTo(-0.48, -0.95);
    ctx.bezierCurveTo(-0.48, -1.55, 0.48, -1.55, 0.48, -0.95);
    if (ghost) {
      ctx.lineTo(0.48, 0.1);
      for (let k = 0; k < 4; k++) {
        const x0 = 0.48 - k * 0.24, wob = Math.sin(now * 5 + k) * 0.06;
        ctx.quadraticCurveTo(x0 - 0.06, 0.25 + wob, x0 - 0.12, 0.08);
        ctx.quadraticCurveTo(x0 - 0.18, -0.05, x0 - 0.24, 0.1);
      }
    } else {
      ctx.lineTo(0.48, -0.1);
      ctx.quadraticCurveTo(0.48, 0.05, 0.3, 0.05);
      ctx.lineTo(-0.3, 0.05);
      ctx.quadraticCurveTo(-0.48, 0.05, -0.48, -0.1);
    }
    ctx.closePath();
  };
  ctx.fillStyle = color;
  body();
  ctx.fill();
  // Sombra de la espalda.
  ctx.save();
  ctx.clip();
  ctx.fillStyle = dark;
  ctx.globalAlpha = alpha * 0.55;
  ctx.beginPath(); ctx.ellipse(-0.55, -0.45, 0.3, 0.9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.globalAlpha = alpha;
  body();
  ctx.stroke();
  // Visor.
  ctx.fillStyle = '#93c9da';
  ctx.beginPath(); ctx.ellipse(0.16, -0.95, 0.34, 0.21, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#d9f3fb';
  ctx.beginPath(); ctx.ellipse(0.26, -1.02, 0.14, 0.07, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#5f8ea0';
  ctx.beginPath(); ctx.ellipse(0.1, -0.86, 0.22, 0.05, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Escaneo (tarea visual): un haz verde que sube y baja.
  if (scanning) {
    const t = (Math.sin(now * 3) + 1) / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(70,255,140,0.22)';
    ctx.fillRect(x - 0.65, y - 1.6, 1.3, 1.95);
    ctx.fillStyle = 'rgba(120,255,170,0.85)';
    ctx.fillRect(x - 0.7, y - 1.6 + t * 1.9, 1.4, 0.07);
    ctx.restore();
  }
}

// Un cuerpo: medio poroto con el hueso asomando.
export function drawBody(ctx, x, y, color) {
  const dark = shade(color, -0.4);
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = OUTLINE;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.ellipse(0, 0.32, 0.6, 0.16, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = color;
  rrect(ctx, -0.42, -0.1, 0.36, 0.42, 0.14); ctx.fill(); ctx.stroke();
  rrect(ctx, 0.06, -0.1, 0.36, 0.42, 0.14); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.48, -0.05);
  ctx.lineTo(-0.48, -0.5);
  ctx.lineTo(-0.3, -0.42); ctx.lineTo(-0.15, -0.55); ctx.lineTo(0.05, -0.43); ctx.lineTo(0.22, -0.56); ctx.lineTo(0.48, -0.45);
  ctx.lineTo(0.48, -0.05);
  ctx.quadraticCurveTo(0.48, 0.08, 0.3, 0.08);
  ctx.lineTo(-0.3, 0.08);
  ctx.quadraticCurveTo(-0.48, 0.08, -0.48, -0.05);
  ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = dark;
  ctx.fillRect(-0.44, -0.4, 0.88, 0.1);
  // Hueso.
  ctx.fillStyle = '#f2efe6';
  ctx.fillRect(-0.05, -0.95, 0.12, 0.5);
  ctx.beginPath(); ctx.arc(-0.04, -0.98, 0.1, 0, Math.PI * 2); ctx.arc(0.08, -0.98, 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

export function drawName(ctx, x, y, text, color, scaleUp = 1) {
  ctx.save();
  ctx.font = `700 ${0.5 * scaleUp}px Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.lineWidth = 0.12;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.strokeText(text, x, y - 1.6);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y - 1.6);
  ctx.restore();
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
  f.fillStyle = 'rgba(6,8,14,0.86)';
  f.fillRect(0, 0, cam.w, cam.h);
  worldTransform(f, cam);
  f.globalCompositeOperation = 'destination-out';
  const g = f.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius);
  g.addColorStop(0, 'rgba(0,0,0,1)');
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

// ─── Mapa chico (Tab) ────────────────────────────────────────────────────────
// Todo el plano en el canvas `ctx` de w × h, con marcas: { me: {x,y}, tasks: [[x,y]], sabotage }.
export function drawMinimap(ctx, w, h, { me, tasks, sabotage, now }) {
  const s = Math.min(w / W, h / H);
  const ox = (w - W * s) / 2, oy = (h - H * s) / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.setTransform(s, 0, 0, s, ox, oy);
  ctx.fillStyle = 'rgba(120,170,230,0.35)';
  for (const r of HALLS) ctx.fillRect(r.x, r.y, r.w, r.h);
  for (const r of ROOMS) {
    ctx.fillStyle = 'rgba(120,170,230,0.55)';
    ctx.fillRect(r.x, r.y, r.w, r.h);
  }
  ctx.strokeStyle = 'rgba(200,225,255,0.9)';
  ctx.lineWidth = 0.35;
  for (const r of ROOMS) ctx.strokeRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const r of ROOMS) {
    ctx.font = `700 ${Math.min(2.1, (r.w * 1.6) / r.name.length)}px Inter, sans-serif`;
    ctx.fillText(r.name, r.x + r.w / 2, r.y + r.h / 2);
  }
  for (const [x, y] of tasks || []) {
    ctx.fillStyle = '#ffd23f';
    ctx.font = '900 3.2px Inter, sans-serif';
    ctx.fillText('!', x, y - 1);
  }
  if (sabotage?.kind === 'lights') {
    ctx.fillStyle = `rgba(255,70,60,${0.6 + Math.sin(now * 8) * 0.4})`;
    ctx.beginPath(); ctx.arc(LIGHTS_PANEL.x, LIGHTS_PANEL.y - 2, 1.6, 0, Math.PI * 2); ctx.fill();
  }
  if (sabotage?.kind === 'reactor') {
    ctx.fillStyle = `rgba(255,70,60,${0.6 + Math.sin(now * 8) * 0.4})`;
    for (const r of REACTOR_HANDS) { ctx.beginPath(); ctx.arc(r.x + 1, r.y, 1.6, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath(); ctx.arc(BUTTON.x, BUTTON.y, 0.9, 0, Math.PI * 2); ctx.fill();
  if (me) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.arc(me.x, me.y, 1.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  return { s, ox, oy };
}
