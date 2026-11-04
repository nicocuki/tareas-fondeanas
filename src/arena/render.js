// Arena Royale: el dibujo de la arena en un canvas 2D. Es solo dibujo (no toca el estado de la partida), así que acá
// sí se puede usar trigonometría y animaciones. La arena imita el aspecto del original: pasto a cuadros, senderos de
// tierra, río con puentes de madera, árboles y vallas alrededor, torres de piedra con cañón y torre del rey.
// Las tropas, edificios y hechizos se dibujan con `sprites.js` (los mismos dibujos que las cartas).
import { CARD_BY_ID, DEPLOY_TICKS } from './cards.js';
import { drawSprite } from './sprites.js';
import { BAND, BRIDGES, BRIDGE_HALF, H, RIVER_Y, W } from './sim.js';

export const CELL = 28;                 // píxeles del canvas por casilla
export const MARGIN = 1.6;              // casillas de decorado alrededor de la arena
export const CANVAS_W = Math.round((W + 2 * MARGIN) * CELL);
export const CANVAS_H = Math.round((H + 2 * MARGIN) * CELL);
export const TEAM_COLORS = ['#3b82f6', '#ef4444'];
const TEAM_DARK = ['#1d4fb0', '#a11f2a'];
const TEAM_LIGHT = ['#7fb2ff', '#ff8a8a'];
const OUT = '#2b1a14';
const TAU = Math.PI * 2;

// El que juega en el equipo 1 ve la arena dada vuelta, para tener siempre su lado abajo.
export const toView = (flip, x, y) => (flip ? [W - x, H - y] : [x, y]);
export const fromView = (flip, x, y) => (flip ? [W - x, H - y] : [x, y]);
const pt = (o, x, y) => { const [vx, vy] = toView(o.flip, x, y); return [(vx + MARGIN) * CELL, (vy + MARGIN) * CELL]; };
// De un punto del canvas (en píxeles del canvas) a la arena.
export const canvasToWorld = (flip, px, py) => fromView(flip, px / CELL - MARGIN, py / CELL - MARGIN);

// ─── Formas sueltas ──────────────────────────────────────────────────────────
function path(ctx, build, fill, stroke, lw = 2) {
  ctx.beginPath(); build(ctx);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.stroke(); }
}
const ellipse = (ctx, x, y, rx, ry, fill, stroke, lw) => path(ctx, (c) => c.ellipse(x, y, rx, ry, 0, 0, TAU), fill, stroke, lw);
const disc = (ctx, x, y, r, fill, stroke, lw) => ellipse(ctx, x, y, Math.max(0.1, r), Math.max(0.1, r), fill, stroke, lw);
const rect = (ctx, x, y, w, h, rad, fill, stroke, lw) => path(ctx, (c) => c.roundRect(x, y, w, h, rad), fill, stroke, lw);
const seg = (ctx, x1, y1, x2, y2, color, w) => { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.stroke(); };

function crownIcon(ctx, x, y, s, fill = '#f5c518') {
  path(ctx, (c) => {
    c.moveTo(x - s, y + s * 0.6); c.lineTo(x - s * 1.05, y - s * 0.7); c.lineTo(x - s * 0.5, y - s * 0.05); c.lineTo(x, y - s * 0.95);
    c.lineTo(x + s * 0.5, y - s * 0.05); c.lineTo(x + s * 1.05, y - s * 0.7); c.lineTo(x + s, y + s * 0.6); c.closePath();
  }, fill, OUT, Math.max(1, s * 0.22));
  disc(ctx, x, y + s * 0.15, s * 0.16, '#e0443a');
}

function bar(ctx, x, y, w, h, ratio, color, label) {
  rect(ctx, x - w / 2, y, w, h, h / 2, 'rgba(20,12,10,0.8)', OUT, 1.5);
  if (ratio > 0) rect(ctx, x - w / 2 + 1, y + 1, Math.max(h - 2, (w - 2) * ratio), h - 2, (h - 2) / 2, color);
  if (label !== undefined) {
    ctx.font = `bold ${Math.round(h * 0.95)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,12,10,0.85)'; ctx.strokeText(label, x, y + h / 2 + 0.5);
    ctx.fillStyle = '#fff'; ctx.fillText(label, x, y + h / 2 + 0.5); ctx.textBaseline = 'alphabetic';
  }
}

function star(ctx, x, y, r, fill) {
  path(ctx, (c) => { for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r; const a = (i / 10) * TAU - Math.PI / 2; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); }, fill, OUT, 1);
}

// ─── Terreno (se dibuja una vez: es igual para los dos equipos, en coordenadas de pantalla) ──
let terrainCache = null;

function seeded(seed) {
  let a = seed;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) | 0; return ((a >>> 8) & 0xffff) / 65536; };
}

function tree(ctx, x, y, s) {
  ellipse(ctx, x, y + s * 0.85, s * 0.85, s * 0.28, 'rgba(0,0,0,0.25)');
  rect(ctx, x - s * 0.12, y + s * 0.2, s * 0.24, s * 0.6, 2, '#6b4423', OUT, 1.5);
  disc(ctx, x, y, s * 0.78, '#2f7a2c', OUT, 2);
  disc(ctx, x - s * 0.38, y + s * 0.12, s * 0.5, '#388a33', OUT, 1.5);
  disc(ctx, x + s * 0.4, y + s * 0.1, s * 0.5, '#2c7329', OUT, 1.5);
  disc(ctx, x - s * 0.15, y - s * 0.28, s * 0.38, '#58b348');
}
function bush(ctx, x, y, s) {
  ellipse(ctx, x, y + s * 0.5, s * 0.9, s * 0.25, 'rgba(0,0,0,0.2)');
  disc(ctx, x - s * 0.4, y, s * 0.5, '#3d9438', OUT, 1.5); disc(ctx, x + s * 0.4, y, s * 0.5, '#368a32', OUT, 1.5); disc(ctx, x, y - s * 0.25, s * 0.55, '#4aa844', OUT, 1.5);
}
function rock(ctx, x, y, s) {
  ellipse(ctx, x, y + s * 0.7, s, s * 0.3, 'rgba(0,0,0,0.22)');
  path(ctx, (c) => { c.moveTo(x - s, y + s * 0.6); c.lineTo(x - s * 0.7, y - s * 0.4); c.lineTo(x, y - s * 0.8); c.lineTo(x + s * 0.8, y - s * 0.3); c.lineTo(x + s, y + s * 0.6); c.closePath(); }, '#9aa0a8', OUT, 2);
  path(ctx, (c) => { c.moveTo(x - s * 0.7, y - s * 0.4); c.lineTo(x, y - s * 0.8); c.lineTo(x + s * 0.3, y - s * 0.2); c.lineTo(x - s * 0.3, y); c.closePath(); }, '#c5cad2');
}

function fence(ctx, x0, x1, y, S) {
  const n = Math.round((x1 - x0) / (S * 1.1));
  const step = (x1 - x0) / n;
  seg(ctx, x0, y - S * 0.35, x1, y - S * 0.35, OUT, 6); seg(ctx, x0, y + S * 0.05, x1, y + S * 0.05, OUT, 6);
  seg(ctx, x0, y - S * 0.35, x1, y - S * 0.35, '#c08a52', 3.5); seg(ctx, x0, y + S * 0.05, x1, y + S * 0.05, '#b27a45', 3.5);
  for (let i = 0; i <= n; i++) rect(ctx, x0 + i * step - 3, y - S * 0.6, 6, S * 0.85, 2, '#8a5a2b', OUT, 1.5);
}

function bridge(ctx, cx, S) {
  const top = (MARGIN + RIVER_Y - BAND - 0.2) * S;
  const hgt = (2 * BAND + 0.4) * S;
  const left = (MARGIN + cx - BRIDGE_HALF) * S;
  const width = 2 * BRIDGE_HALF * S;
  rect(ctx, left - 2, top + 5, width + 4, hgt, 4, 'rgba(0,0,0,0.25)');
  rect(ctx, left, top, width, hgt, 3, '#b98048', OUT, 2.5);
  ctx.save(); ctx.beginPath(); ctx.roundRect(left, top, width, hgt, 3); ctx.clip();
  for (let i = 1; i < 8; i++) seg(ctx, left, top + (hgt * i) / 8, left + width, top + (hgt * i) / 8, 'rgba(70,40,15,0.55)', 1.6);
  for (let i = 0; i < 8; i++) seg(ctx, left + width * 0.2, top + (hgt * (i + 0.5)) / 8, left + width * 0.45, top + (hgt * (i + 0.5)) / 8, 'rgba(255,230,180,0.22)', 2);
  ctx.restore();
  for (const sx of [left, left + width - 6]) { rect(ctx, sx, top - 2, 6, hgt + 4, 2, '#7a4b22', OUT, 1.5); }
  for (let i = 0; i <= 2; i++) for (const sx of [left + 3, left + width - 3]) disc(ctx, sx, top + (hgt * i) / 2, 4, '#9a6232', OUT, 1.5);
}

function buildTerrain() {
  const S = CELL;
  const cv = document.createElement('canvas');
  cv.width = CANVAS_W; cv.height = CANVAS_H;
  const ctx = cv.getContext('2d');
  const rnd = seeded(7);
  const ox = MARGIN * S;
  const oy = MARGIN * S;
  ctx.fillStyle = '#356f28'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // borde: pasto oscuro con árboles, arbustos y piedras
  for (let y = -1; y < H + 1.5; y += 1) for (let x = -MARGIN; x < W + MARGIN; x += 1) {
    if (x >= 0 && x < W && y >= 0 && y < H) continue;
    ctx.fillStyle = (Math.floor(x) + Math.floor(y)) % 2 ? '#3c7d2d' : '#387629';
    ctx.fillRect(ox + x * S, oy + y * S, S + 1, S + 1);
  }
  // arena
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    ctx.fillStyle = (x + y) % 2 ? '#7ab852' : '#86c15a';
    ctx.fillRect(ox + x * S, oy + y * S, S + 1, S + 1);
  }
  // senderos de tierra: de cada princesa al puente, y de ahí al rey
  const sand = '#dcc48e';
  const sandEdge = '#b8a06a';
  const lane = (x, y0, y1) => { rect(ctx, ox + (x - 1) * S, oy + y0 * S, 2 * S, (y1 - y0) * S, 6, sand, sandEdge, 2); };
  for (const bx of BRIDGES) { lane(bx, 6.2, RIVER_Y - BAND + 0.3); lane(bx, RIVER_Y + BAND - 0.3, H - 6.2); }
  rect(ctx, ox + (BRIDGES[0] - 1) * S, oy + (H - 6.2) * S - 1.6 * S, (BRIDGES[1] - BRIDGES[0] + 2) * S, 1.8 * S, 8, sand, sandEdge, 2);
  rect(ctx, ox + (BRIDGES[0] - 1) * S, oy + 6.2 * S - 0.2 * S, (BRIDGES[1] - BRIDGES[0] + 2) * S, 1.8 * S, 8, sand, sandEdge, 2);
  rect(ctx, ox + (W / 2 - 1) * S, oy + (H - 4.8) * S, 2 * S, 3.2 * S, 6, sand, sandEdge, 2);
  rect(ctx, ox + (W / 2 - 1) * S, oy + 1.6 * S, 2 * S, 3.2 * S, 6, sand, sandEdge, 2);
  // río
  const top = oy + (RIVER_Y - BAND) * S;
  rect(ctx, 0, top - 5, CANVAS_W, 2 * BAND * S + 10, 0, '#2a6aa8');
  const grad = ctx.createLinearGradient(0, top, 0, top + 2 * BAND * S);
  grad.addColorStop(0, '#5cb0f0'); grad.addColorStop(0.5, '#6ec0fa'); grad.addColorStop(1, '#4aa0e6');
  ctx.fillStyle = grad; ctx.fillRect(0, top, CANVAS_W, 2 * BAND * S);
  seg(ctx, 0, top - 2, CANVAS_W, top - 2, '#d8c48a', 4); seg(ctx, 0, top + 2 * BAND * S + 2, CANVAS_W, top + 2 * BAND * S + 2, '#d8c48a', 4);
  for (const bx of BRIDGES) bridge(ctx, bx, S);
  // piedras en las orillas
  for (const sx of [-0.2, W + 0.2]) for (const dy of [-1.5, 1.5]) rock(ctx, ox + sx * S, oy + (RIVER_Y + dy) * S, S * 0.62);
  for (const sx of [0.7, W - 0.7]) rock(ctx, ox + sx * S, oy + RIVER_Y * S + (sx < 5 ? -S * 1.2 : S * 1.2), S * 0.4);
  // vallas detrás de las torres
  for (const fy of [0.9, H - 0.5]) { fence(ctx, ox + 1.2 * S, ox + 6.6 * S, oy + fy * S, S); fence(ctx, ox + (W - 6.6) * S, ox + (W - 1.2) * S, oy + fy * S, S); }
  // arbustos dentro de la arena
  for (const [bx, by] of [[0.9, 3.4], [W - 0.9, 3.4], [0.9, H - 3.4], [W - 0.9, H - 3.4], [0.8, 10], [W - 0.8, 22]]) bush(ctx, ox + bx * S, oy + by * S, S * 0.5);
  // árboles alrededor
  const placed = [];
  for (let side = 0; side < 2; side++) for (let y = -1.2; y < H + 1.4; y += 1.9) {
    const x = side ? W + 0.55 + rnd() * 0.5 : -0.55 - rnd() * 0.5;
    placed.push([x, y + rnd() * 0.6, 0.85 + rnd() * 0.35]);
  }
  for (let side = 0; side < 2; side++) for (let x = -0.6; x < W + 0.8; x += 2.2) placed.push([x + rnd() * 0.5, side ? H + 0.85 + rnd() * 0.3 : -0.85 - rnd() * 0.3, 0.8 + rnd() * 0.3]);
  for (const [x, y, s] of placed.sort((a, b) => a[1] - b[1])) tree(ctx, ox + x * S, oy + y * S, s * S * 0.95);
  for (const [x, y] of [[-1.1, 8], [W + 1.1, 24], [-1.2, 26], [W + 1.2, 6]]) rock(ctx, ox + x * S, oy + y * S, S * 0.5);
  return cv;
}

function drawTerrain(ctx, o) {
  if (!terrainCache) terrainCache = buildTerrain();
  ctx.drawImage(terrainCache, 0, 0);
  // olitas del río, que se mueven
  const S = CELL;
  const top = (MARGIN + RIVER_Y - BAND) * S;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 10; i++) {
    const x = (((i * 2.3 + o.time * 0.7) % (W + 2)) - 1 + MARGIN) * S;
    ctx.beginPath(); ctx.moveTo(x, top + S * 0.65); ctx.quadraticCurveTo(x + S * 0.4, top + S * 0.35, x + S * 0.8, top + S * 0.65); ctx.stroke();
    const x2 = (((i * 2.3 + 1.2 + o.time * 0.5) % (W + 2)) - 1 + MARGIN) * S;
    ctx.beginPath(); ctx.moveTo(x2, top + S * 1.45); ctx.quadraticCurveTo(x2 + S * 0.4, top + S * 1.15, x2 + S * 0.8, top + S * 1.45); ctx.stroke();
  }
}

// La mitad (o el bolsillo) donde se puede poner una tropa, mientras se elige una carta.
function drawZone(ctx, st, o) {
  const S = CELL;
  const team = o.team;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  const area = (x0, y0, x1, y1) => {
    const [ax, ay] = pt(o, x0, y0);
    const [bx, by] = pt(o, x1, y1);
    ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
  };
  if (team === 0) area(0, RIVER_Y + BAND + 0.5, W, H); else area(0, 0, W, RIVER_Y - BAND - 0.5);
  for (const side of [0, 1]) {
    const down = st.towers.find((t) => t.team === 1 - team && t.kind === 'princess' && t.side === side)?.dead;
    if (!down) continue;
    const x0 = side === 0 ? 0 : W / 2;
    if (team === 0) area(x0, RIVER_Y - 5, x0 + W / 2, RIVER_Y - BAND - 0.5); else area(x0, RIVER_Y + BAND + 0.5, x0 + W / 2, RIVER_Y + 5);
  }
  void S;
}

// ─── Torres ──────────────────────────────────────────────────────────────────
function brackets(ctx, x, y, r, color) {
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.lineCap = 'round';
  const a = r * 1.3;
  const l = r * 0.42;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    ctx.beginPath(); ctx.moveTo(x + sx * a, y + sy * (a - l)); ctx.lineTo(x + sx * a, y + sy * a); ctx.lineTo(x + sx * (a - l), y + sy * a); ctx.stroke();
  }
}

function brickLines(ctx, x, y, w, h, rows) {
  ctx.strokeStyle = 'rgba(60,50,45,0.35)'; ctx.lineWidth = 1.2;
  for (let i = 1; i < rows; i++) { const yy = y + (h * i) / rows; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
  for (let i = 0; i < rows; i++) for (let j = 1; j < 4; j++) { const xx = x + (w * j) / 4 + (i % 2 ? w / 8 : 0); const yy = y + (h * i) / rows; ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + h / rows); ctx.stroke(); }
}

function aimAngle(st, tw, o) {
  const tg = tw.tg ? st.units.find((u) => u.id === tw.tg) : null;
  if (tg) { const [ax, ay] = pt(o, tw.x, tw.y); const [bx, by] = pt(o, tg.x, tg.y); return Math.atan2(by - ay, bx - ax); }
  return tw.team === o.team ? -Math.PI / 2 : Math.PI / 2;
}

function drawPrincess(ctx, st, tw, o, x, y) {
  const r = tw.r * CELL;
  const bw = r * 1.75;
  const bh = r * 1.5;
  rect(ctx, x - bw / 2, y - bh * 0.45, bw, bh, 7, '#a9b1bc', OUT, 2.5);
  brickLines(ctx, x - bw / 2, y - bh * 0.45, bw, bh, 5);
  rect(ctx, x - bw / 2, y + bh * 0.1, bw, bh * 0.2, 0, TEAM_COLORS[tw.team]); // franja del equipo
  rect(ctx, x - bw / 2, y + bh * 0.1, bw, bh * 0.2, 0, null, OUT, 1.5);
  path(ctx, (c) => { c.moveTo(x - bw * 0.2, y + bh * 0.55); c.lineTo(x - bw * 0.2, y + bh * 0.28); c.quadraticCurveTo(x, y + bh * 0.1, x + bw * 0.2, y + bh * 0.28); c.lineTo(x + bw * 0.2, y + bh * 0.55); c.closePath(); }, '#3a2e28', OUT, 1.5);
  // almenas
  const cw = bw / 5;
  for (let i = 0; i < 5; i++) rect(ctx, x - bw / 2 + i * cw + 1, y - bh * 0.7, cw - 3, bh * 0.3, 2, '#b9c1cc', OUT, 1.8);
  rect(ctx, x - bw * 0.46, y - bh * 0.52, bw * 0.92, bh * 0.14, 3, TEAM_DARK[tw.team], OUT, 1.5);
  // cañón
  const ang = aimAngle(st, tw, o);
  disc(ctx, x, y - bh * 0.62, r * 0.42, '#3e434c', OUT, 2);
  ctx.save(); ctx.translate(x, y - bh * 0.62); ctx.rotate(ang);
  rect(ctx, 0, -r * 0.2, r * 0.95, r * 0.4, 4, '#2b2e34', OUT, 2); rect(ctx, r * 0.78, -r * 0.27, r * 0.22, r * 0.54, 3, '#1c1e22', OUT, 1.5);
  ctx.restore();
  disc(ctx, x, y - bh * 0.62, r * 0.14, '#7a808c');
  // banderín
  seg(ctx, x - bw * 0.42, y - bh * 0.7, x - bw * 0.42, y - bh * 1.05, OUT, 3);
  path(ctx, (c) => { c.moveTo(x - bw * 0.42, y - bh * 1.05); c.lineTo(x - bw * 0.42 + r * 0.45, y - bh * 0.95); c.lineTo(x - bw * 0.42, y - bh * 0.85); c.closePath(); }, TEAM_COLORS[tw.team], OUT, 1.5);
}

function drawKing(ctx, st, tw, o, x, y) {
  const r = tw.r * CELL;
  const bw = r * 1.85;
  const bh = r * 1.6;
  rect(ctx, x - bw / 2, y - bh * 0.4, bw, bh, 9, '#a1a9b4', OUT, 2.5);
  brickLines(ctx, x - bw / 2, y - bh * 0.4, bw, bh, 6);
  rect(ctx, x - bw / 2, y + bh * 0.05, bw, bh * 0.22, 0, TEAM_COLORS[tw.team], OUT, 1.5);
  // torrecitas de las esquinas, con techo del color del equipo
  for (const sx of [-1, 1]) {
    rect(ctx, x + sx * bw * 0.5 - r * 0.2, y - bh * 0.62, r * 0.4, bh * 0.55, 4, '#b4bcc7', OUT, 2);
    path(ctx, (c) => { c.moveTo(x + sx * bw * 0.5 - r * 0.3, y - bh * 0.6); c.lineTo(x + sx * bw * 0.5, y - bh * 0.98); c.lineTo(x + sx * bw * 0.5 + r * 0.3, y - bh * 0.6); c.closePath(); }, TEAM_COLORS[tw.team], OUT, 2);
  }
  rect(ctx, x - bw * 0.36, y - bh * 0.62, bw * 0.72, bh * 0.4, 5, '#8f97a3', OUT, 2);
  const cw = bw * 0.72 / 4;
  for (let i = 0; i < 4; i++) rect(ctx, x - bw * 0.36 + i * cw + 1, y - bh * 0.76, cw - 3, bh * 0.2, 2, '#b9c1cc', OUT, 1.6);
  // puerta y escudo con corona
  path(ctx, (c) => { c.moveTo(x - bw * 0.17, y + bh * 0.6); c.lineTo(x - bw * 0.17, y + bh * 0.32); c.quadraticCurveTo(x, y + bh * 0.1, x + bw * 0.17, y + bh * 0.32); c.lineTo(x + bw * 0.17, y + bh * 0.6); c.closePath(); }, '#3a2e28', OUT, 1.5);
  crownIcon(ctx, x, y + bh * 0.88, r * 0.34);
  // el rey, arriba: dormido (ojos cerrados y «Z») hasta que lo lastiman
  const ky = y - bh * 0.78;
  path(ctx, (c) => { c.moveTo(x - r * 0.5, ky + r * 0.55); c.quadraticCurveTo(x, ky + r * 0.1, x + r * 0.5, ky + r * 0.55); c.lineTo(x + r * 0.4, ky + r * 0.85); c.lineTo(x - r * 0.4, ky + r * 0.85); c.closePath(); }, TEAM_COLORS[tw.team], OUT, 2);
  disc(ctx, x, ky + r * 0.1, r * 0.34, '#f6c9a0', OUT, 2);
  path(ctx, (c) => { c.moveTo(x - r * 0.32, ky + r * 0.12); c.quadraticCurveTo(x, ky + r * 0.75, x + r * 0.32, ky + r * 0.12); c.quadraticCurveTo(x, ky + r * 0.3, x - r * 0.32, ky + r * 0.12); }, '#e8e8f0', OUT, 1.2);
  path(ctx, (c) => { c.moveTo(x - r * 0.34, ky - r * 0.05); c.lineTo(x - r * 0.38, ky - r * 0.5); c.lineTo(x - r * 0.15, ky - r * 0.25); c.lineTo(x, ky - r * 0.55); c.lineTo(x + r * 0.15, ky - r * 0.25); c.lineTo(x + r * 0.38, ky - r * 0.5); c.lineTo(x + r * 0.34, ky - r * 0.05); c.closePath(); }, '#f5c518', OUT, 1.6);
  if (tw.awake) {
    for (const sx of [-1, 1]) { disc(ctx, x + sx * r * 0.14, ky + r * 0.08, r * 0.07, '#fff'); disc(ctx, x + sx * r * 0.14, ky + r * 0.1, r * 0.035, '#222'); }
  } else {
    for (const sx of [-1, 1]) seg(ctx, x + sx * r * 0.22, ky + r * 0.1, x + sx * r * 0.06, ky + r * 0.1, OUT, 1.6);
    ctx.font = `bold ${Math.round(r * 0.5)}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = OUT; ctx.lineWidth = 3;
    const zy = ky - r * 0.5 - ((o.time * 6) % 6);
    ctx.strokeText('Z', x + r * 0.65, zy); ctx.fillText('Z', x + r * 0.65, zy);
    ctx.font = `bold ${Math.round(r * 0.35)}px sans-serif`; ctx.strokeText('z', x + r * 0.95, zy - r * 0.35); ctx.fillText('z', x + r * 0.95, zy - r * 0.35);
  }
}

function drawTower(ctx, st, tw, o) {
  const [x, y] = pt(o, tw.x, tw.y);
  const r = tw.r * CELL;
  if (tw.dead) {
    ellipse(ctx, x, y + r * 0.3, r * 1.2, r * 0.8, 'rgba(40,30,20,0.45)');
    for (const [dx, dy, s, col] of [[-0.5, 0.1, 0.5, '#7d766a'], [0.4, 0.2, 0.42, '#9a9385'], [0, -0.3, 0.38, '#6b645a'], [0.1, 0.45, 0.3, '#8a8478'], [-0.2, 0.5, 0.26, '#a39d90']]) disc(ctx, x + dx * r, y + dy * r, s * r, col, OUT, 1.5);
    return;
  }
  ellipse(ctx, x, y + r * 0.78, r * 1.25, r * 0.5, 'rgba(0,0,0,0.3)');
  if (tw.kind === 'king') drawKing(ctx, st, tw, o, x, y); else drawPrincess(ctx, st, tw, o, x, y);
  if (tw.team !== o.team) brackets(ctx, x, y, r, '#e8334a');
  const by = y - r * (tw.kind === 'king' ? 2.05 : 1.65);
  const isMine = tw.team === o.team;
  bar(ctx, x + 6, by, 54, 13, tw.hp / tw.max, isMine ? '#3aa0ff' : '#ff5a7a', String(Math.max(0, Math.ceil(tw.hp))));
  crownIcon(ctx, x - 24, by + 6.5, 7.5, isMine ? '#7fc4ff' : '#ff9ab0');
}

// ─── Tropas ──────────────────────────────────────────────────────────────────
function sinceHit(st, u) {
  let best = Infinity;
  for (const e of st.ev) if (e.k === 'hit' && e.u === u.id) best = Math.min(best, st.tick - e.t);
  return best;
}

function drawUnit(ctx, st, u, o) {
  const d = CARD_BY_ID[u.card];
  const S = CELL;
  const [x, y0] = pt(o, u.x, u.y);
  const rr = u.r * S;
  const vis = rr * (d.kind === 'building' ? 1.1 : 1.25);
  const fy = y0 + rr * 0.55; // los pies
  const lift = d.fly ? rr * 1.5 : 0;
  const grow = u.wait > 0 ? 0.55 + 0.45 * (1 - u.wait / DEPLOY_TICKS) : 1;
  // sombra y marca del equipo
  ellipse(ctx, x, fy + 2, rr * 1.0, rr * 0.38, 'rgba(0,0,0,0.3)');
  ellipse(ctx, x, fy, rr * 1.15, rr * 0.5, `${TEAM_COLORS[u.team]}55`, TEAM_COLORS[u.team], 3);
  ctx.save();
  if (u.wait > 0) ctx.globalAlpha = 0.65;
  const since = sinceHit(st, u);
  const swing = since < 6 ? Math.sin((since / 6) * Math.PI) * 1.3 : 0;
  let aim = -Math.PI / 2;
  if (d.kind === 'building' && u.tg) {
    const tg = [...st.units, ...st.towers].find((e) => e.id === u.tg);
    if (tg) { const [tx, ty] = pt(o, tg.x, tg.y); aim = Math.atan2(ty - fy, tx - x); }
  }
  if (d.charge && u.charge >= d.charge) { // rayitas de velocidad
    for (let i = -1; i <= 1; i++) seg(ctx, x + i * rr * 0.6, fy + rr * 0.3, x + i * rr * 0.6, fy + rr * (1.6 + Math.sin(o.time * 30 + i)), 'rgba(255,255,255,0.7)', 2);
  }
  drawSprite(ctx, u.card, x, fy - lift, vis * grow, { t: o.time + u.id, swing, aim });
  ctx.restore();
  if (u.stun > 0) for (let i = 0; i < 3; i++) { const a = o.time * 6 + (i * TAU) / 3; star(ctx, x + Math.cos(a) * rr * 0.9, fy - lift - vis * 2.5 + Math.sin(a) * rr * 0.25, 5, '#ffe24a'); }
  if (u.hp < u.max || d.kind === 'building') {
    const bw = Math.max(30, rr * 2.2);
    bar(ctx, x + 4, fy - lift - vis * (d.fly && d.id === 'globo' ? 4.3 : 2.9) - 4, bw, 8, Math.max(0, u.hp / u.max), TEAM_COLORS[u.team]);
    crownIcon(ctx, x + 4 - bw / 2 - 2, fy - lift - vis * (d.fly && d.id === 'globo' ? 4.3 : 2.9), 5, '#f5c518');
  }
}

// ─── Efectos ─────────────────────────────────────────────────────────────────
function arrowShape(ctx, x, y, ang, len) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  seg(ctx, -len, 0, len * 0.6, 0, OUT, 4); seg(ctx, -len, 0, len * 0.6, 0, '#e8c65a', 2.4);
  path(ctx, (c) => { c.moveTo(len * 0.6, -3.5); c.lineTo(len, 0); c.lineTo(len * 0.6, 3.5); c.closePath(); }, '#dfe5ee', OUT, 1);
  path(ctx, (c) => { c.moveTo(-len, 0); c.lineTo(-len - 3, -3.5); c.lineTo(-len * 0.7, 0); c.lineTo(-len - 3, 3.5); c.closePath(); }, '#e0443a', OUT, 1);
  ctx.restore();
}

const AREA_TINT = {
  poison: 'rgba(110,200,70,0.28)', ice: 'rgba(150,215,255,0.25)', heal: 'rgba(110,255,150,0.22)', rocket: 'rgba(255,90,60,0.16)', log: 'rgba(168,112,58,0.18)', barrel: 'rgba(138,200,74,0.14)',
};

function drawPending(ctx, st, o) { // hechizos que todavía no cayeron
  const S = CELL;
  for (const f of st.fx) {
    const [x, y] = pt(o, f.x, f.y);
    const total = Math.max(1, f.at - f.t0);
    const k = Math.min(1, (st.tick - f.t0 + o.frac) / total);
    ctx.strokeStyle = f.style === 'zap' ? 'rgba(160,230,255,0.95)' : 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2.5; ctx.setLineDash([7, 6]);
    ctx.beginPath(); ctx.arc(x, y, f.r * S, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = AREA_TINT[f.style] || 'rgba(255,255,255,0.08)'; ctx.beginPath(); ctx.arc(x, y, f.r * S, 0, TAU); ctx.fill();
    if (f.style === 'poison') for (let i = 0; i < 6; i++) { const a = o.time * 1.5 + i * 1.05; disc(ctx, x + Math.cos(a) * f.r * S * 0.55, y + Math.sin(a * 1.3) * f.r * S * 0.45, S * (0.25 + (i % 3) * 0.08), 'rgba(140,220,80,0.5)'); }
    if (f.style === 'rocket') drawSprite(ctx, 'cohete', x + (1 - k) * S * 5, y - (1 - k) * S * 14 + S * 0.6, S * (0.55 + 0.4 * k), { t: o.time });
    if (f.style === 'barrel') { const arc = Math.sin(k * Math.PI) * S * 5; drawSprite(ctx, 'barril', x, y - arc + S * 0.5, S * 0.6, { t: o.time }); }
    if (f.style === 'heal') for (let i = 0; i < 5; i++) { const a = i * 1.3 + o.time * 2; seg(ctx, x + Math.cos(a) * f.r * S * 0.5 - 4, y - ((o.time * 25 + i * 20) % 40), x + Math.cos(a) * f.r * S * 0.5 + 4, y - ((o.time * 25 + i * 20) % 40), '#7dffa4', 3); }
    if (f.style === 'ice') for (let i = 0; i < 8; i++) { const hx = x + (((i * 41) % 13) - 6) * f.r * S / 8; const hy = y + (((i * 59) % 13) - 6) * f.r * S / 8 - (1 - k) * S * 8; disc(ctx, hx, hy, S * 0.2, '#dff6ff', '#6fb8e8', 1.5); }
    if (f.style === 'log') { const lx = x + (k - 0.5) * f.r * S * 2.4; ctx.save(); ctx.translate(lx, y); ctx.rotate(o.time * 8); rect(ctx, -S * 0.5, -S * 0.2, S, S * 0.4, 4, '#a8703a', OUT, 2); ctx.restore(); }
    if (f.style === 'fire') drawSprite(ctx, 'bola-de-fuego', x + (1 - k) * S * 6, y - (1 - k) * S * 12 + S * 0.9, S * (0.5 + 0.5 * k), { t: o.time });
    if (f.style === 'arrows') for (let i = 0; i < 12; i++) { const ax = x + (((i * 37) % 11) - 5) * f.r * S / 6; const ay = y + (((i * 53) % 11) - 5) * f.r * S / 6 - (1 - k) * S * 9; arrowShape(ctx, ax, ay, Math.PI / 2 + 0.12, S * 0.55); }
    if (f.style === 'bomb') disc(ctx, x, y - (1 - k) * S * 3, S * 0.28, '#2b2b30', OUT, 1.5);
  }
}

function projectile(ctx, e, age, x, y, tx, ty, o) {
  const k = Math.min(1, age / 4);
  const px = x + (tx - x) * k;
  const py = y + (ty - y) * k;
  const ang = Math.atan2(ty - y, tx - x);
  const c = e.c;
  if (c === 'arqueras') arrowShape(ctx, px, py, ang, 9);
  else if (c === 'mosquetera') { disc(ctx, px, py, 3.5, '#ffe08a', OUT, 1); }
  else if (c === 'mago' || c === 'bebe-dragon') { disc(ctx, px, py, 6, '#ff8a2e', OUT, 1.5); disc(ctx, px, py, 3, '#ffe28a'); }
  else if (c === 'mortero') { const arc = Math.sin(k * Math.PI) * 40; disc(ctx, px, py - arc, 6, '#4a463e', OUT, 1.5); }
  else if (c === 'canon') disc(ctx, px, py, 5, '#2b2b30', OUT, 1);
  else if (c === 'esbirros') disc(ctx, px, py, 3, '#c9d0e0', OUT, 1);
  else if (c === 'bruja') { disc(ctx, px, py, 6, '#b86ce0', OUT, 1.5); disc(ctx, px, py, 3, '#f0d4ff'); }
  else if (c === 'mago-de-hielo') { disc(ctx, px, py, 5.5, '#bfeaff', '#4aa8d8', 1.5); disc(ctx, px, py, 2.5, '#fff'); }
  else if (c === 'electromago' || c === 'tesla') { seg(ctx, x, y, px, py, '#bff4ff', 4); disc(ctx, px, py, 4, '#7fe8ff', OUT, 1); }
  else if (c === 'princesa') { arrowShape(ctx, px, py - Math.sin(k * Math.PI) * 24, ang, 9); disc(ctx, px, py - Math.sin(k * Math.PI) * 24, 3, '#ff8a2e'); }
  else if (c === 'verdugo') { ctx.save(); ctx.translate(px, py - Math.sin(k * Math.PI) * 16); ctx.rotate(age * 1.6); rect(ctx, -9, -2, 18, 4, 2, '#8a5a2b', OUT, 1); rect(ctx, 3, -7, 7, 14, 2, '#d6dce6', OUT, 1.2); ctx.restore(); }
  else if (c === 'cazador') { for (let i = -1; i <= 1; i++) disc(ctx, px, py + i * 4 * k, 2.5, '#ffe08a', OUT, 0.8); }
  else if (c === 'bombardero' || c === 'torre-bomba') { const arc = Math.sin(k * Math.PI) * 30; disc(ctx, px, py - arc, 5.5, '#2b2b30', OUT, 1.5); }
  else if (c === 'lanceros') { seg(ctx, px - Math.cos(ang) * 9, py - Math.sin(ang) * 9, px + Math.cos(ang) * 9, py + Math.sin(ang) * 9, OUT, 4); seg(ctx, px - Math.cos(ang) * 9, py - Math.sin(ang) * 9, px + Math.cos(ang) * 9, py + Math.sin(ang) * 9, '#c9a24a', 2); }
  else disc(ctx, px, py, 4.5, '#2b2b30', OUT, 1);
  void o;
}

function drawEvents(ctx, st, o) {
  const S = CELL;
  for (const e of st.ev) {
    const age = st.tick - e.t + o.frac;
    const [x, y] = pt(o, e.x, e.y);
    if (e.k === 'boom') {
      const k = Math.min(1, age / 8);
      ctx.globalAlpha = 1 - k;
      if (e.style === 'zap') {
        for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; const l = e.r * S * (0.5 + k * 0.5); seg(ctx, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, OUT, 6); seg(ctx, x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, '#bff0ff', 3); }
        disc(ctx, x, y, e.r * S * (0.3 + k * 0.7), 'rgba(160,230,255,0.3)');
      } else if (e.style === 'poison') {
        disc(ctx, x, y, e.r * S * (0.7 + k * 0.3), 'rgba(120,210,70,0.45)');
        for (let i = 0; i < 6; i++) { const a = i * 1.05; disc(ctx, x + Math.cos(a) * e.r * S * 0.5, y + Math.sin(a) * e.r * S * 0.5 - k * S, S * 0.28 * (1 - k * 0.5), 'rgba(160,235,90,0.7)'); }
      } else if (e.style === 'ice') {
        disc(ctx, x, y, e.r * S * (0.4 + k * 0.6), 'rgba(170,225,255,0.5)', '#6fb8e8', 3);
        for (let i = 0; i < 8; i++) { const a = i * 0.8; seg(ctx, x, y, x + Math.cos(a) * e.r * S * 0.8, y + Math.sin(a) * e.r * S * 0.8, '#eaf9ff', 3); }
      } else if (e.style === 'heal') {
        disc(ctx, x, y, e.r * S * (0.4 + k * 0.6), 'rgba(120,255,160,0.35)', '#3fcf72', 3);
        rect(ctx, x - 5, y - S * (0.3 + k), 10, 28, 3, '#e8fff0', '#3fcf72', 2); rect(ctx, x - 14, y - S * (0.3 + k) + 9, 28, 10, 3, '#e8fff0', '#3fcf72', 2);
      } else if (e.style === 'barrel') {
        disc(ctx, x, y, e.r * S * (0.5 + k * 0.5), 'rgba(138,200,74,0.45)');
        for (let i = 0; i < 5; i++) { const a = i * 1.3; disc(ctx, x + Math.cos(a) * e.r * S * k, y + Math.sin(a) * e.r * S * k, S * 0.15, '#b88048', OUT, 1); }
      } else if (e.style === 'log') {
        disc(ctx, x, y, e.r * S * (0.4 + k * 0.6), 'rgba(168,112,58,0.4)');
        for (let i = 0; i < 6; i++) { const a = i * 1.05; disc(ctx, x + Math.cos(a) * e.r * S * k, y + Math.sin(a) * e.r * S * k, S * 0.18, '#7a4b22'); }
      } else if (e.style === 'arrows') {
        disc(ctx, x, y, e.r * S, 'rgba(232,198,90,0.18)');
        for (let i = 0; i < 12; i++) arrowShape(ctx, x + (((i * 37) % 11) - 5) * e.r * S / 6, y + (((i * 53) % 11) - 5) * e.r * S / 6, Math.PI / 2 + 0.12, S * 0.45);
      } else {
        disc(ctx, x, y, e.r * S * (0.35 + k * 0.65), e.style === 'bomb' ? 'rgba(255,140,40,0.75)' : 'rgba(255,150,40,0.8)', '#b83a14', 3);
        disc(ctx, x, y, e.r * S * (0.2 + k * 0.45), 'rgba(255,230,140,0.9)');
        for (let i = 0; i < 6; i++) { const a = i * 1.05; disc(ctx, x + Math.cos(a) * e.r * S * k, y + Math.sin(a) * e.r * S * k, S * 0.22 * (1 - k), '#5a4a40'); }
      }
      ctx.globalAlpha = 1;
    } else if (e.k === 'hit') {
      const [tx, ty] = pt(o, e.x2, e.y2);
      const ranged = Math.abs(e.x - e.x2) + Math.abs(e.y - e.y2) > 1.8 || e.c === 'princess' || e.c === 'king';
      if (ranged && age < 4) projectile(ctx, e, age, x, y - (e.c === 'princess' ? S : 0), tx, ty, o);
      else if (!ranged && age < 3) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(tx, ty, S * 0.45 + age * 3, 0.3, 2.6); ctx.stroke();
      }
    } else if (e.k === 'die') {
      const k = Math.min(1, age / 10);
      ctx.globalAlpha = 1 - k;
      disc(ctx, x - 6, y - k * 12, 7 + k * 9, '#e4e4e4'); disc(ctx, x + 7, y - k * 8, 6 + k * 7, '#c8c8c8'); disc(ctx, x, y - k * 16, 5 + k * 6, '#f0f0f0');
      ctx.globalAlpha = 1;
    } else if (e.k === 'tdie') {
      const k = Math.min(1, age / 12);
      ctx.globalAlpha = 1 - k;
      disc(ctx, x, y, S * (1.5 + k * 2.8), 'rgba(255,150,40,0.75)', '#b83a14', 3); disc(ctx, x, y, S * (0.8 + k * 1.4), 'rgba(255,235,150,0.9)');
      for (let i = 0; i < 8; i++) { const a = i * 0.8; disc(ctx, x + Math.cos(a) * S * (1 + k * 3), y + Math.sin(a) * S * (1 + k * 3) - k * S, S * 0.4, '#6b645a', OUT, 1.5); }
      ctx.globalAlpha = 1;
    } else if (e.k === 'put') {
      const k = Math.min(1, age / 8);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = TEAM_COLORS[e.team]; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(x, y + S * 0.3, S * (0.6 + k * 1.4), S * (0.3 + k * 0.7), 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
// `o`: { flip, team, time (segundos), frac (0..1 entre pasos), hover: {x,y} | null, card: carta elegida | null, valid: bool }
export function draw(ctx, st, o) {
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
  drawTerrain(ctx, o);
  if (o.card && (o.card.kind !== 'spell' || o.card.drop) && !o.card.anywhere) drawZone(ctx, st, o);
  const sorted = [...st.units].sort((a, b) => (CARD_BY_ID[a.card].fly ? 1 : 0) - (CARD_BY_ID[b.card].fly ? 1 : 0) || (o.flip ? b.y - a.y : a.y - b.y) || a.id - b.id);
  const towers = [...st.towers].sort((a, b) => (o.flip ? b.y - a.y : a.y - b.y));
  for (const tw of towers) drawTower(ctx, st, tw, o);
  for (const u of sorted) drawUnit(ctx, st, u, o);
  drawPending(ctx, st, o);
  drawEvents(ctx, st, o);
  if (o.card && o.hover) { // la carta que vas a poner, en el lugar del mouse
    const [x, y] = pt(o, o.hover.x, o.hover.y);
    const spell = o.card.kind === 'spell';
    const radius = (spell ? o.card.radius : Math.max(o.card.radius, 0.7)) * CELL;
    ctx.fillStyle = o.valid ? 'rgba(80,220,120,0.28)' : 'rgba(240,70,70,0.3)';
    ctx.strokeStyle = o.valid ? 'rgba(80,230,120,0.95)' : 'rgba(240,70,70,0.95)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = o.valid ? 0.85 : 0.5;
    if (!spell) drawSprite(ctx, o.card.id, x, y + CELL * 0.35, o.card.radius * CELL * 1.25, { t: o.time });
    ctx.globalAlpha = 1;
  }
}
