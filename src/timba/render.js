// Dibujo de La Timba: todo con código sobre un canvas (sin imágenes). Sin estado de juego: reciben lo que hay
// que mostrar y lo dibujan. Los colores son fijos (el casino se ve igual en los dos temas).
import { GROUND, SCENES, SIDE_H, seatPos } from './scenes.js';
import { isRed, rankOf, suitOf } from './bj.js';

const TAU = Math.PI * 2;

function mulberry(seed) {
  let a = seed;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
const fillRR = (ctx, x, y, w, h, r, fill) => { rr(ctx, x, y, w, h, r); ctx.fillStyle = fill; ctx.fill(); };

function outlinedText(ctx, text, x, y, size, fill = '#fff', stroke = '#0a0814', align = 'center') {
  ctx.font = `800 ${size}px Inter, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(2, size * 0.28);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

// ─── Personajes (bolitas con traje, como en el original) ────────────────────
const HEAD = '#dfe6ee';

function eyes(ctx, x, y, dx, dy, r = 4.2) {
  for (const s of [-1, 1]) {
    const ex = x + s * r * 1.15;
    ctx.beginPath(); ctx.arc(ex, y, r, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = '#14101c'; ctx.stroke();
    ctx.beginPath(); ctx.arc(ex + dx * 1.6, y + dy * 1.6, r * 0.5, 0, TAU); ctx.fillStyle = '#14101c'; ctx.fill();
    // cejas enojadas, como las del original
    ctx.beginPath(); ctx.moveTo(ex - s * r * 1.1, y - r * 1.5 - 1); ctx.lineTo(ex + s * r * 0.9, y - r * 0.9); ctx.lineWidth = 1.6; ctx.strokeStyle = '#14101c'; ctx.stroke();
  }
}

// De costado: `face` es 1 (derecha) o -1.
export function drawBlobSide(ctx, x, y, color, face, phase, name, extra = {}) {
  const walk = extra.moving ? Math.sin(phase * 11) : 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, 1, 15, 3.5, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fill();
  // piernas
  ctx.fillStyle = '#17141f';
  fillRR(ctx, -7 + walk * 3, -16, 6, 16, 2, '#17141f');
  fillRR(ctx, 1 - walk * 3, -16, 6, 16, 2, '#17141f');
  // cuerpo con traje, saco y corbata
  fillRR(ctx, -11, -34, 22, 22, 7, color);
  ctx.beginPath(); ctx.moveTo(0, -34); ctx.lineTo(face * 4, -22); ctx.lineTo(0, -12); ctx.lineTo(-face * 4, -22); ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fill();
  fillRR(ctx, -1.5, -32, 3, 14, 1, '#14101c');
  ctx.fillStyle = '#e8c15a'; ctx.beginPath(); ctx.arc(face * 6, -19, 1.3, 0, TAU); ctx.arc(face * 6, -25, 1.3, 0, TAU); ctx.fill();
  // brazos
  fillRR(ctx, -14 - walk * 2, -32, 5, 15, 2.5, color);
  fillRR(ctx, 9 + walk * 2, -32, 5, 15, 2.5, color);
  // cabeza
  ctx.beginPath(); ctx.arc(0, -43, 12.5, 0, TAU); ctx.fillStyle = HEAD; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = '#14101c'; ctx.stroke();
  eyes(ctx, face * 3, -45, face * 0.9, 0.2, 4);
  if (extra.hat) { fillRR(ctx, -12, -58, 24, 5, 2, extra.hat); fillRR(ctx, -8, -66, 16, 10, 3, extra.hat); }
  ctx.restore();
  if (name) outlinedText(ctx, name, x, y - 72, 9);
}

// Desde arriba: `face` es el ángulo hacia donde mira.
export function drawBlobTop(ctx, x, y, color, face, phase, name, extra = {}) {
  const walk = extra.moving ? Math.sin(phase * 11) : 0;
  const cx = Math.cos(face);
  const cy = Math.sin(face);
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath(); ctx.ellipse(0, 7, 11, 5, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
  // manos
  ctx.fillStyle = HEAD;
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 10 - cy * walk * 2 * s, 5 + cx * walk * 2 * s, 3.2, 0, TAU); ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#14101c'; ctx.stroke(); }
  // cuerpo
  ctx.beginPath(); ctx.ellipse(0, 4, 9.5, 7.5, 0, 0, TAU); ctx.fillStyle = color; ctx.fill(); ctx.lineWidth = 1.4; ctx.strokeStyle = '#14101c'; ctx.stroke();
  // cabeza
  ctx.beginPath(); ctx.arc(0, -2, 9.5, 0, TAU); ctx.fillStyle = HEAD; ctx.fill(); ctx.stroke();
  eyes(ctx, cx * 2.5, -2 + cy * 2.5, cx * 0.9, cy * 0.9, 3.1);
  if (extra.hat) { ctx.beginPath(); ctx.arc(0, -5, 7, 0, TAU); ctx.fillStyle = extra.hat; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#14101c'; ctx.stroke(); }
  ctx.restore();
  if (name) outlinedText(ctx, name, x, y - 20, 8);
}

// ─── Cosas sueltas ──────────────────────────────────────────────────────────
function palm(ctx, x, base, h, t, seed = 0) {
  const sway = Math.sin(t * 0.9 + seed) * 5;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, base); ctx.quadraticCurveTo(x + 10 + sway * 0.4, base - h * 0.5, x + sway, base - h); ctx.lineWidth = 8; ctx.strokeStyle = '#5a3b2a'; ctx.stroke();
  ctx.lineWidth = 1;
  for (let k = 0; k < 8; k++) {
    const a = -Math.PI + (k / 7) * Math.PI;
    const tx = x + sway + Math.cos(a) * 52;
    const ty = base - h + Math.sin(a) * 26 + 14;
    ctx.beginPath();
    ctx.moveTo(x + sway, base - h);
    ctx.quadraticCurveTo(x + sway + Math.cos(a) * 28, base - h - 22 + Math.abs(Math.cos(a)) * 6, tx, ty);
    ctx.quadraticCurveTo(x + sway + Math.cos(a) * 28, base - h - 6, x + sway, base - h + 3);
    ctx.fillStyle = k % 2 ? '#2f8a3f' : '#3da34c'; ctx.fill();
  }
}

function drawStars(ctx, camX, viewW) {
  const rnd = mulberry(11);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 90; i++) {
    const sx = rnd() * 3300;
    const sy = rnd() * 230;
    const s = rnd() * 1.4 + 0.4;
    if (sx > camX - 10 && sx < camX + viewW + 10) ctx.fillRect(sx, sy, s, s);
  }
}

const SKYLINE = (() => {
  const r = mulberry(5);
  return Array.from({ length: 60 }, (_, i) => ({ x: i * 90 + r() * 30, w: 40 + r() * 60, h: 40 + r() * 130, seed: r() }));
})();

function drawSkyline(ctx, color, lit) {
  for (const b of SKYLINE) {
    ctx.fillStyle = color;
    ctx.fillRect(b.x, GROUND - b.h, b.w, b.h + 2);
    ctx.fillStyle = lit;
    for (let wy = GROUND - b.h + 8; wy < GROUND - 8; wy += 14) for (let wx = b.x + 6; wx < b.x + b.w - 6; wx += 12) if (((wx * 7 + wy * 3) | 0) % 5 < 2) ctx.fillRect(wx, wy, 4, 5);
  }
  // la torre Eiffel de Las Vegas
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.moveTo(1120, GROUND); ctx.lineTo(1146, GROUND - 190); ctx.lineTo(1152, GROUND - 190); ctx.lineTo(1178, GROUND); ctx.lineTo(1160, GROUND); ctx.lineTo(1149, GROUND - 120); ctx.lineTo(1138, GROUND); ctx.closePath(); ctx.fill();
  ctx.fillRect(1148, GROUND - 230, 2, 40);
}

// ─── Escenas de costado ─────────────────────────────────────────────────────
function drawHouse(ctx, h) {
  const top = GROUND - 112;
  fillRR(ctx, h.x, top, h.w, 112, 4, '#ead9b4');
  ctx.beginPath(); ctx.moveTo(h.x - 18, top + 2); ctx.lineTo(h.x + h.w / 2, top - 84); ctx.lineTo(h.x + h.w + 18, top + 2); ctx.closePath(); ctx.fillStyle = '#8a2f3a'; ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#5a1d26'; ctx.stroke();
  fillRR(ctx, h.x + h.w - 90, top - 70, 26, 50, 3, '#a9a08a');
  // puerta
  const dx = h.x + h.w * 0.54;
  fillRR(ctx, dx, GROUND - 82, 48, 82, 4, '#5a3a2a');
  fillRR(ctx, dx + 6, GROUND - 76, 36, 30, 3, '#7a5238');
  ctx.beginPath(); ctx.arc(dx + 38, GROUND - 38, 3, 0, TAU); ctx.fillStyle = '#e8c15a'; ctx.fill();
  // ventanas con luz
  for (const wx of [h.x + 46, h.x + h.w - 110]) {
    fillRR(ctx, wx, top + 28, 56, 46, 3, '#ffdf8a');
    ctx.strokeStyle = '#5a3a2a'; ctx.lineWidth = 3; ctx.strokeRect(wx, top + 28, 56, 46);
    ctx.beginPath(); ctx.moveTo(wx + 28, top + 28); ctx.lineTo(wx + 28, top + 74); ctx.moveTo(wx, top + 51); ctx.lineTo(wx + 56, top + 51); ctx.stroke();
  }
  fillRR(ctx, h.x - 6, GROUND - 8, h.w + 12, 8, 2, '#b9ab8c');
  outlinedText(ctx, 'CASITA', h.x + h.w / 2, top - 28, 14, '#ffe9b0', '#3a1018');
}

function drawVan(ctx, v, t) {
  const y = GROUND;
  // toldo de rayas
  for (let i = 0; i < 8; i++) fillRR(ctx, v.x + 34 + i * 20, y - 118, 20, 22, 2, i % 2 ? '#fff' : '#d8403a');
  fillRR(ctx, v.x, y - 100, v.w, 84, 14, '#f2efe6');
  fillRR(ctx, v.x, y - 54, v.w, 14, 0, '#2fbf9f');
  // cabina del frente (derecha)
  fillRR(ctx, v.x + v.w - 82, y - 100, 82, 84, 14, '#e6e2d6');
  fillRR(ctx, v.x + v.w - 70, y - 90, 58, 34, 8, '#6b86a8');
  // ventana de venta con mostrador y mercadería
  fillRR(ctx, v.x + 30, y - 94, 150, 48, 4, '#23202b');
  const colors = ['#e0525a', '#f0c33c', '#4a9be8', '#5ec46b', '#b46bf0'];
  for (let i = 0; i < 5; i++) fillRR(ctx, v.x + 38 + i * 28, y - 86, 20, 16 + (i % 2) * 6, 3, colors[i]);
  fillRR(ctx, v.x + 24, y - 48, 162, 7, 2, '#8a6a46');
  outlinedText(ctx, 'TIENDA', v.x + 106, y - 28, 13, '#1a6b5a', '#f2efe6');
  // ruedas
  for (const wx of [v.x + 62, v.x + v.w - 62]) {
    ctx.beginPath(); ctx.arc(wx, y - 12, 18, 0, TAU); ctx.fillStyle = '#17141f'; ctx.fill();
    ctx.beginPath(); ctx.arc(wx, y - 12, 8, 0, TAU); ctx.fillStyle = '#b8bdc8'; ctx.fill();
  }
  ctx.beginPath(); ctx.arc(v.x + v.w - 4, y - 36, 5, 0, TAU); ctx.fillStyle = Math.sin(t * 3) > -0.9 ? '#ffe9a0' : '#c8b46a'; ctx.fill();
}

// La limusina: el frente apunta a la derecha y la parte de atrás (de donde se sube) es la izquierda.
function drawLimo(ctx, l, { door = 1, go = 0, heads = 0, t = 0 }) {
  const e = go * go * go * 3600;
  const x = l.x + e;
  const y = GROUND;
  ctx.save();
  ctx.translate(x, 0);
  // sombra
  ctx.beginPath(); ctx.ellipse(l.w / 2, y + 2, l.w / 2 + 10, 7, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  // carrocería
  const g = ctx.createLinearGradient(0, y - 66, 0, y - 10);
  g.addColorStop(0, '#2a2a38'); g.addColorStop(0.5, '#0f0f17'); g.addColorStop(1, '#07070c');
  fillRR(ctx, 0, y - 64, l.w, 48, 20, g);
  fillRR(ctx, 60, y - 82, l.w - 190, 24, 12, '#14141f');
  // ventanas y gente adentro
  const nWin = 6;
  const ww = (l.w - 250) / nWin;
  for (let i = 0; i < nWin; i++) {
    fillRR(ctx, 78 + i * (ww + 4), y - 78, ww - 2, 17, 4, '#26356b');
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(80 + i * (ww + 4), y - 77, ww * 0.35, 4);
    if (i < heads) { ctx.beginPath(); ctx.arc(78 + i * (ww + 4) + ww / 2, y - 66, 7, 0, TAU); ctx.fillStyle = HEAD; ctx.fill(); }
  }
  ctx.fillStyle = '#9aa0b8'; ctx.fillRect(14, y - 40, l.w - 28, 2);
  // luces
  fillRR(ctx, 0, y - 56, 8, 14, 3, '#e0303a');
  fillRR(ctx, l.w - 9, y - 54, 9, 12, 3, '#ffe9a0');
  ctx.beginPath(); ctx.moveTo(l.w, y - 52); ctx.lineTo(l.w + 70, y - 66); ctx.lineTo(l.w + 70, y - 28); ctx.closePath(); ctx.fillStyle = 'rgba(255,240,170,0.13)'; ctx.fill();
  // ruedas
  for (const wx of [92, l.w / 2 + 30, l.w - 104]) {
    ctx.beginPath(); ctx.arc(wx, y - 14, 17, 0, TAU); ctx.fillStyle = '#0a0a0e'; ctx.fill();
    ctx.save(); ctx.translate(wx, y - 14); ctx.rotate(go * 18);
    ctx.beginPath(); ctx.arc(0, 0, 9, 0, TAU); ctx.fillStyle = '#c3c8d4'; ctx.fill();
    ctx.fillStyle = '#6a7080'; for (let k = 0; k < 5; k++) { ctx.rotate(TAU / 5); ctx.fillRect(2, -1, 6, 2); }
    ctx.restore();
  }
  // la puerta de atrás (el baúl): abierta se levanta hacia arriba
  ctx.save();
  ctx.translate(2, y - 64);
  ctx.rotate(-door * 1.05);
  fillRR(ctx, 0, -6, 62, 8, 3, '#1c1c28');
  ctx.restore();
  ctx.restore();
  void t;
}

function drawSide(ctx, view, key, st) {
  const sc = SCENES[key];
  const { camX, scale, w } = view;
  const viewW = w / scale;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, -camX * scale, 0);
  const night = key === 'outside';
  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  if (night) { sky.addColorStop(0, '#050818'); sky.addColorStop(0.6, '#1a1650'); sky.addColorStop(1, '#4a2a6a'); } else { sky.addColorStop(0, '#2a1b5e'); sky.addColorStop(0.45, '#b8467a'); sky.addColorStop(0.78, '#ff9a6a'); sky.addColorStop(1, '#ffd08a'); }
  ctx.fillStyle = sky; ctx.fillRect(camX - 5, -400, viewW + 10, GROUND + 402);
  if (night) drawStars(ctx, camX, viewW);
  else {
    // el sol, bajito
    ctx.save(); ctx.translate(camX * 0.8, 0);
    const sg = ctx.createRadialGradient(560, 250, 6, 560, 250, 120);
    sg.addColorStop(0, '#fff6c8'); sg.addColorStop(0.35, '#ffd27a'); sg.addColorStop(1, 'rgba(255,170,100,0)');
    ctx.fillStyle = sg; ctx.fillRect(400, 100, 320, 320);
    ctx.restore();
  }
  // edificios lejanos
  ctx.save(); ctx.translate(camX * 0.62, 0);
  drawSkyline(ctx, night ? '#161235' : '#4a2a62', night ? '#ffd27a' : '#ffd9a0');
  ctx.restore();
  // piso
  const gg = ctx.createLinearGradient(0, GROUND, 0, SIDE_H);
  if (night) { gg.addColorStop(0, '#2b2236'); gg.addColorStop(1, '#17121f'); } else { gg.addColorStop(0, '#9a6a4e'); gg.addColorStop(1, '#6b4636'); }
  ctx.fillStyle = gg; ctx.fillRect(camX - 5, GROUND, viewW + 10, SIDE_H - GROUND + 40);
  ctx.fillStyle = night ? '#3a2e4a' : '#b5805e'; ctx.fillRect(camX - 5, GROUND, viewW + 10, 5);

  if (key === 'wait') {
    for (const px of [560, 880, 1420, 1600, 2480]) palm(ctx, px, GROUND, 150 + (px % 40), st.time, px);
    drawHouse(ctx, sc.house);
    drawVan(ctx, sc.van, st.time);
    drawLimo(ctx, sc.limo, { door: st.limoDoor, go: st.limoGo, heads: st.heads, t: st.time });
    // rayas del camino
    ctx.fillStyle = 'rgba(255,230,170,0.5)';
    for (let x = 0; x < sc.w; x += 80) ctx.fillRect(x, GROUND + 34, 40, 4);
  } else {
    drawEntrance(ctx, sc, st);
    drawLimo(ctx, sc.limo, { door: 1, go: 0, heads: 0, t: st.time });
  }
  for (const p of [...st.players].sort((a, b) => a.x - b.x)) drawBlobSide(ctx, p.x, GROUND, p.color, p.face || 1, p.phase || 0, p.name, { moving: p.moving, hat: p.hat });
  ctx.restore();
}

function drawEntrance(ctx, sc, st) {
  const e = sc.entrance;
  // la torre
  ctx.fillStyle = '#241a3a'; ctx.fillRect(e.x - 120, -400, e.w + 240, GROUND + 400);
  const rnd = mulberry(23);
  for (let y = -380; y < GROUND - 160; y += 22) for (let x = e.x - 100; x < e.x + e.w + 100; x += 22) {
    ctx.fillStyle = rnd() < 0.55 ? '#ffe3a0' : '#3a3560';
    ctx.fillRect(x, y, 14, 12);
  }
  for (const lx of [e.x + 40, e.x + e.w - 52]) {
    const lg = ctx.createLinearGradient(lx, 0, lx + 12, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0.0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.95)'); lg.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = lg; ctx.fillRect(lx - 4, -400, 20, GROUND + 400);
  }
  // alfombra roja
  fillRR(ctx, sc.entrance.x - 260, GROUND - 4, e.w + 360, 34, 3, '#8a1d2a');
  ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = 2; ctx.strokeRect(e.x - 258, GROUND - 2, e.w + 356, 30);
  ctx.beginPath(); ctx.ellipse(e.x + e.w / 2, GROUND + 14, 160, 12, 0, 0, TAU); ctx.strokeStyle = '#e8a23a'; ctx.stroke();
  // techo rojo con luces
  fillRR(ctx, e.x + 20, GROUND - 214, e.w - 40, 62, 12, '#a8242e');
  for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.moveTo(e.x + 60 + i * 48, GROUND - 152); ctx.lineTo(e.x + 84 + i * 48, GROUND - 140); ctx.lineTo(e.x + 108 + i * 48, GROUND - 152); ctx.closePath(); ctx.fillStyle = Math.sin(st.time * 2 + i) > -0.6 ? '#ffd27a' : '#c8923a'; ctx.fill(); }
  // columnas
  for (const cx of [e.x + 36, e.x + e.w - 58]) {
    fillRR(ctx, cx, GROUND - 156, 22, 156, 4, '#f0dcb4');
    fillRR(ctx, cx - 6, GROUND - 166, 34, 14, 3, '#e8a23a');
    fillRR(ctx, cx - 6, GROUND - 8, 34, 8, 3, '#e8a23a');
  }
  // las puertas
  const dx = sc.doorX - 62;
  fillRR(ctx, dx, GROUND - 120, 124, 120, 6, '#2a1a12');
  for (const [i, off] of [[0, 8], [1, 64]]) { void i; fillRR(ctx, dx + off, GROUND - 112, 52, 108, 4, '#2c6b52'); ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fillRect(dx + off + 6, GROUND - 106, 12, 94); }
  ctx.beginPath(); ctx.arc(dx + 62, GROUND - 120, 62, Math.PI, TAU); ctx.fillStyle = '#e8a23a'; ctx.fill();
  const lamp = ctx.createRadialGradient(dx + 62, GROUND - 60, 4, dx + 62, GROUND - 60, 140);
  lamp.addColorStop(0, 'rgba(255,220,140,0.35)'); lamp.addColorStop(1, 'rgba(255,220,140,0)');
  ctx.fillStyle = lamp; ctx.fillRect(dx - 80, GROUND - 200, 290, 260);
  outlinedText(ctx, 'Jeff Booth', e.x + e.w / 2, GROUND - 200, 20, '#ffe9b0', '#4a0a14');
  outlinedText(ctx, 'PARADISE PLEASURE', e.x + e.w / 2, GROUND - 184, 8, '#ffd9a0', '#4a0a14');
  for (const px of [120, 860, 1500, 2240, 2620]) palm(ctx, px, GROUND, 140 + (px % 30), st.time, px);
}

// ─── Escenas desde arriba ───────────────────────────────────────────────────
let carpetPattern; let wallPattern; let metalPattern;
function patterns(ctx) {
  if (carpetPattern) return;
  const mk = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); return ctx.createPattern(c, 'repeat'); };
  carpetPattern = mk(96, 96, (g) => {
    g.fillStyle = '#0f1630'; g.fillRect(0, 0, 96, 96);
    for (const [cx, cy, r, c] of [[24, 24, 22, '#a85a22'], [72, 72, 22, '#a85a22'], [72, 24, 16, '#8a2f5a'], [24, 72, 16, '#8a2f5a']]) {
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(cx, cy, r - k * 5, 0, TAU); g.lineWidth = 2.2; g.strokeStyle = k % 2 ? '#175a68' : c; g.stroke(); }
    }
    g.fillStyle = '#b8902c'; for (const [x, y] of [[48, 48], [0, 0], [96, 0], [0, 96], [96, 96]]) { g.beginPath(); g.ellipse(x, y, 7, 4, 0.6, 0, TAU); g.fill(); }
  });
  wallPattern = mk(48, 48, (g) => {
    g.fillStyle = '#4a3a22'; g.fillRect(0, 0, 48, 48);
    g.fillStyle = '#6a5630'; g.fillRect(0, 0, 24, 24); g.fillRect(24, 24, 24, 24);
    g.fillStyle = '#8a7240'; g.fillRect(8, 8, 8, 8); g.fillRect(32, 32, 8, 8);
  });
  metalPattern = mk(40, 40, (g) => {
    g.fillStyle = '#9aa2b0'; g.fillRect(0, 0, 40, 40);
    g.fillStyle = '#7e8696'; g.fillRect(0, 0, 20, 20); g.fillRect(20, 20, 20, 20);
  });
}

function drawCard(ctx, x, y, c, hidden) {
  fillRR(ctx, x, y, 14, 20, 2, hidden ? '#8a1d2a' : '#fff');
  ctx.lineWidth = 0.8; ctx.strokeStyle = '#14101c'; rr(ctx, x, y, 14, 20, 2); ctx.stroke();
  if (hidden) { ctx.fillStyle = '#e8c15a'; ctx.fillRect(x + 3, y + 3, 8, 14); return; }
  ctx.font = '800 7px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = isRed(c) ? '#d8303a' : '#14101c';
  ctx.fillText(rankOf(c), x + 7, y + 6);
  ctx.font = '8px Inter, sans-serif'; ctx.fillText(suitOf(c), x + 7, y + 14);
}

function drawTable(ctx, sc, st) {
  const t = sc.table;
  ctx.beginPath(); ctx.ellipse(t.x + 4, t.y + 8, t.rx + 20, t.ry + 20, 0, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(t.x, t.y, t.rx + 14, t.ry + 14, 0, 0, TAU); ctx.fillStyle = '#5a3420'; ctx.fill();
  ctx.beginPath(); ctx.ellipse(t.x, t.y, t.rx + 8, t.ry + 8, 0, 0, TAU); ctx.fillStyle = '#7a4a2c'; ctx.fill();
  const fg = ctx.createRadialGradient(t.x, t.y, 20, t.x, t.y, t.rx);
  fg.addColorStop(0, '#2a8a5a'); fg.addColorStop(1, '#16603e');
  ctx.beginPath(); ctx.ellipse(t.x, t.y, t.rx, t.ry, 0, 0, TAU); ctx.fillStyle = fg; ctx.fill();
  ctx.beginPath(); ctx.ellipse(t.x, t.y, t.rx - 16, t.ry - 14, 0, 0, Math.PI); ctx.strokeStyle = 'rgba(255,240,200,0.55)'; ctx.lineWidth = 1.6; ctx.stroke();
  outlinedText(ctx, 'BLACKJACK', t.x, t.y - 12, 12, '#f4e6b0', '#0c3a26');
  outlinedText(ctx, 'PAGA 3 A 2', t.x, t.y + 2, 7, '#d8e8c8', '#0c3a26');
  // el lugar, la apuesta y las cartas del que juega (la mesa es de uno solo)
  const bj = st.bj;
  const seat = bj.seats[0];
  const px = t.x;
  const py = t.y + t.ry - 24;
  ctx.beginPath(); ctx.arc(px, py + 14, 9, 0, TAU); ctx.strokeStyle = seat ? 'rgba(255,230,150,0.9)' : 'rgba(255,240,200,0.28)'; ctx.lineWidth = 1.4; ctx.stroke();
  if (seat?.bet) { ctx.beginPath(); ctx.arc(px, py + 14, 6.5, 0, TAU); ctx.fillStyle = '#d8403a'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.setLineDash([2, 2]); ctx.stroke(); ctx.setLineDash([]); }
  if (seat) seat.hand.forEach((c, k) => drawCard(ctx, px - 7 + (k - (seat.hand.length - 1) / 2) * 10, py - 22, c, false));
  bj.dealer.forEach((c, k) => drawCard(ctx, t.x - 7 + (k - (bj.dealer.length - 1) / 2) * 18, t.y - 54, c, k === 1 && bj.phase === 'play'));
}

function drawFloor(ctx, view, key, st) {
  const sc = SCENES[key];
  ctx.fillStyle = '#2a2014'; ctx.fillRect(-20, -20, sc.w + 40, sc.h + 40);
  ctx.fillStyle = wallPattern; ctx.fillRect(0, 0, sc.w, sc.h);
  for (const a of sc.areas) {
    ctx.fillStyle = carpetPattern; ctx.fillRect(a.x, a.y, a.w, a.h);
    ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = 3; ctx.strokeRect(a.x - 1.5, a.y - 1.5, a.w + 3, a.h + 3);
  }
  // luces del techo, suaves
  for (const [lx, ly, c] of [[400, 300, '120,80,255'], [1200, 300, '255,120,60'], [400, 760, '255,120,60'], [1200, 760, '120,80,255'], [800, 500, '90,200,255']]) {
    const lg = ctx.createRadialGradient(lx, ly, 10, lx, ly, 260);
    lg.addColorStop(0, `rgba(${c},0.2)`); lg.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = lg; ctx.fillRect(lx - 260, ly - 260, 520, 520);
  }
  // tragamonedas (de adorno por ahora)
  const strip = sc.blocks[1];
  for (let x = strip.x; x + 70 <= strip.x + strip.w; x += 72) {
    fillRR(ctx, x + 2, strip.y, 66, strip.h, 5, '#1b1b2b');
    const hue = (x * 2.3 + st.time * 60) % 360;
    fillRR(ctx, x + 10, strip.y + 8, 50, 22, 3, `hsl(${hue},80%,55%)`);
    fillRR(ctx, x + 6, strip.y + strip.h - 8, 58, 5, 2, '#f0c33c');
  }
  // columnas y plantas
  for (const b of [sc.blocks[2], sc.blocks[3], sc.blocks[4], sc.blocks[5]]) {
    ctx.beginPath(); ctx.arc(b.x + 24, b.y + 26, 24, 0, TAU); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(b.x + 22, b.y + 22, 22, 0, TAU); ctx.fillStyle = '#f0dcb4'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = '#e8a23a'; ctx.stroke();
    ctx.beginPath(); ctx.arc(b.x + 22, b.y + 22, 12, 0, TAU); ctx.strokeStyle = '#c8a05a'; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const b of sc.blocks.slice(6)) {
    ctx.beginPath(); ctx.arc(b.x + 20, b.y + 20, 19, 0, TAU); ctx.fillStyle = '#8a4a2a'; ctx.fill();
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; ctx.beginPath(); ctx.ellipse(b.x + 20 + Math.cos(a) * 11, b.y + 20 + Math.sin(a) * 11, 10, 5, a, 0, TAU); ctx.fillStyle = k % 2 ? '#2f8a3f' : '#3da34c'; ctx.fill(); }
  }
  // el ascensor, en la pared de la izquierda
  const d = sc.door;
  fillRR(ctx, 20, d.y, 44, d.w, 3, '#c8a05a');
  fillRR(ctx, 24, d.y + 6, 18, d.w - 12, 2, '#9aa2b0');
  fillRR(ctx, 42, d.y + 6, 18, d.w - 12, 2, '#8a929f');
  ctx.save(); ctx.translate(36, d.y - 12); outlinedText(ctx, 'ASCENSOR', 0, 0, 8, '#f4e6b0', '#2a1a0a'); ctx.restore();
  drawTable(ctx, sc, st);
  // el croupier
  drawBlobTop(ctx, sc.dealer.x, sc.dealer.y, '#7a1f2a', Math.PI / 2, 0, 'Croupier', { hat: '#14101c' });
}

function drawElevatorScene(ctx, view, st) {
  const sc = SCENES.elevator;
  ctx.fillStyle = '#1a1420'; ctx.fillRect(-40, -40, sc.w + 80, sc.h + 120);
  ctx.fillStyle = '#d8c079'; ctx.fillRect(10, 10, 280, 238);
  ctx.fillStyle = metalPattern; ctx.fillRect(30, 30, 240, 192);
  // el piso brilla
  const fg = ctx.createRadialGradient(150, 120, 10, 150, 120, 160);
  fg.addColorStop(0, 'rgba(255,240,200,0.25)'); fg.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = fg; ctx.fillRect(30, 30, 240, 192);
  // pared de atrás con espejo
  const mg = ctx.createLinearGradient(0, 14, 0, 30);
  mg.addColorStop(0, '#9fd0e8'); mg.addColorStop(1, '#5a8fb0');
  ctx.fillStyle = mg; ctx.fillRect(34, 14, 232, 16);
  ctx.strokeStyle = '#e8c15a'; ctx.lineWidth = 3; ctx.strokeRect(30, 30, 240, 192);
  // indicador del piso
  fillRR(ctx, 126, 8, 48, 16, 3, '#14101c');
  outlinedText(ctx, st.floorLabel, 150, 16.5, 12, '#5aff7a', '#04200c');
  // la puerta que se abre y se cierra
  const open = st.doorOpen;
  const gap = 44 * open;
  ctx.fillStyle = '#5a4a2a'; ctx.fillRect(128, 222, 44, 26);
  fillRR(ctx, 128, 220, 22 - gap / 2, 8, 2, '#c8a05a');
  fillRR(ctx, 150 + gap / 2, 220, 22 - gap / 2, 8, 2, '#c8a05a');
  ctx.beginPath(); ctx.moveTo(150, 246); ctx.lineTo(144, 238); ctx.lineTo(156, 238); ctx.closePath(); ctx.fillStyle = open > 0.5 ? '#5aff7a' : '#e0525a'; ctx.fill();
  // el panel de botones
  const pn = sc.panel;
  fillRR(ctx, pn.x - 12, pn.y - 14, 24, 34, 4, '#23202b');
  for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(pn.x - 4 + (i % 2) * 8, pn.y - 6 + Math.floor(i / 2) * 9, 2.6, 0, TAU); ctx.fillStyle = i === 0 ? '#e8742a' : i < 3 ? '#f0c33c' : '#c8c8d0'; ctx.fill(); }
  // el botones, con su carrito
  fillRR(ctx, 40, 78, 38, 14, 3, '#b88a3a');
  ctx.strokeStyle = '#6a4a1a'; ctx.lineWidth = 1.5; rr(ctx, 40, 78, 38, 14, 3); ctx.stroke();
  fillRR(ctx, 44, 70, 14, 8, 2, '#4a9be8'); fillRR(ctx, 60, 72, 12, 6, 2, '#e0525a');
  drawBlobTop(ctx, sc.npc.x, sc.npc.y, '#a8242e', Math.PI / 2, 0, 'Botones', { hat: '#a8242e' });
}

function drawTop(ctx, view, key, st) {
  patterns(ctx);
  const { scale, w, h, cx, cy } = view;
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, w / 2 - cx * scale + (st.shake || 0), h / 2 - cy * scale + (st.shake ? st.shake * 0.7 : 0));
  if (key === 'elevator') drawElevatorScene(ctx, view, st); else drawFloor(ctx, view, key, st);
  for (const p of [...st.players].sort((a, b) => a.y - b.y)) drawBlobTop(ctx, p.x, p.y, p.color, p.face ?? Math.PI / 2, p.phase || 0, p.name, { moving: p.moving, hat: p.hat });
  ctx.restore();
}

// Dibuja la escena `key`. `view` trae el tamaño del canvas y la cámara; `st` lo que cambia (ver TimbaGame.jsx).
export function drawScene(ctx, view, key, st) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, view.w, view.h);
  ctx.fillStyle = '#0b0a14'; ctx.fillRect(0, 0, view.w, view.h);
  if (SCENES[key].kind === 'side') drawSide(ctx, view, key, st); else drawTop(ctx, view, key, st);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export { seatPos };
