// Dibujo del modo pelotas, igual que el de HaxBall (el renderer por defecto de basro, reconstruido en
// node-haxball): pasto, líneas, arcos, jugadores con número, nombre abajo, pelota blanca, flechas
// hacia lo que queda fuera de la pantalla y los carteles animados de «¡Gol!».
// Sin estado de juego: recibe lo que tiene que dibujar.

import { PLAYER_PHYSICS, BALL_PHYSICS, TEAMS } from './haxball.js';

const LINE_COLOR = '#C7E6BD';
const LINE_WIDTH = 3;
const DISC_LINE_WIDTH = 2;
const AVATAR_FONT = "900 34px 'Arial Black','Arial Bold',Gadget,sans-serif";
const BIG_FONT = '900 70px Arial Black,Arial Bold,Gadget,sans-serif';

// ─── Cámara ──────────────────────────────────────────────────────────────────
// Sigue al punto medio entre la pelota y tu jugador (sin dejarte afuera de la pantalla), se acerca
// de a poco (4 % por cuadro a 60 Hz) y no muestra más allá de los bordes del estadio.
export function updateHaxCamera(cam, st, ball, me, viewW, viewH, dt) {
  let x = ball.x;
  let y = ball.y;
  if (me) {
    x = 0.5 * (x + me.x);
    y = 0.5 * (y + me.y);
    const w = 0.5 * viewW;
    const h = 0.5 * viewH;
    x = clamp(x, me.x - w + 50, me.x + w - 50);
    y = clamp(y, me.y - h + 50, me.y + h - 50);
  }
  const t = Math.min(1, (60 * dt) / 1000) * 0.04;
  cam.x += (x - cam.x) * t;
  cam.y += (y - cam.y) * t;

  if (viewW > 2 * st.width) cam.x = 0;
  else if (cam.x + 0.5 * viewW > st.width) cam.x = st.width - 0.5 * viewW;
  else if (cam.x - 0.5 * viewW < -st.width) cam.x = -st.width + 0.5 * viewW;
  if (viewH > 2 * st.height) cam.y = 0;
  else if (cam.y + 0.5 * viewH > st.height) cam.y = st.height - 0.5 * viewH;
  else if (cam.y - 0.5 * viewH < -st.height) cam.y = -st.height + 0.5 * viewH;
  if (!Number.isFinite(cam.x)) cam.x = 0;
  if (!Number.isFinite(cam.y)) cam.y = 0;
}

function clamp(v, lo, hi) {
  return v > hi ? hi : v < lo ? lo : v;
}

// ─── Escena ──────────────────────────────────────────────────────────────────
// `players`: lista de jugadores ({ x, y, team, name, number, isKicking }); `meId` se dibuja sin
// nombre y con un halo. `banner`: cartel animado (ver `createBanner`), o `still` para uno quieto.
export function drawHaxScene(ctx, { st, players, ball, meId, cam, zoom, width, height, banner, still }) {
  const viewW = width / zoom;
  const viewH = height / zoom;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = st.bg.color;
  ctx.fillRect(0, 0, width, height);
  ctx.translate(width / 2, height / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-cam.x, -cam.y);
  ctx.lineWidth = LINE_WIDTH;

  drawBackground(ctx, st);
  for (const s of st.segments) if (s.vis) drawSegment(ctx, s);

  // Flechas hacia la pelota y los jugadores que no se ven.
  indicate(ctx, ball, '#FFFFFF', cam, viewW, viewH);
  for (const p of players) indicate(ctx, p, TEAMS[teamOf(p)].color, cam, viewW, viewH);

  for (const p of players) {
    if (p.id !== meId) drawName(ctx, p);
  }
  const me = players.find((p) => p.id === meId);
  if (me) drawHalo(ctx, me);

  ctx.lineWidth = DISC_LINE_WIDTH;
  for (const p of players) drawPlayer(ctx, p);
  drawDisc(ctx, ball.x, ball.y, BALL_PHYSICS.radius, '#FFFFFF', 'black');
  for (const post of st.posts) drawDisc(ctx, post.x, post.y, post.radius, post.color, 'black');
  ctx.restore();

  if (banner || still) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(width / 2, height / 2);
    if (banner) banner.draw(ctx);
    else drawStill(ctx, still);
    ctx.restore();
  }
}

function teamOf(p) {
  return p.team === 'blue' ? 'blue' : 'red';
}

// ─── Pasto ───────────────────────────────────────────────────────────────────
// HaxBall pinta la cancha con una textura de pasto. Acá se arma una parecida una sola vez: franjas
// apenas más claras y más oscuras sobre el verde del fondo.
let grassCanvas = null;
function grassPattern(ctx) {
  if (!grassCanvas) {
    grassCanvas = document.createElement('canvas');
    grassCanvas.width = 128;
    grassCanvas.height = 128;
    const g = grassCanvas.getContext('2d');
    g.fillStyle = '#718C5A';
    g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#6E8958';
    g.fillRect(0, 0, 64, 128);
    // Un poco de grano, siempre igual (no al azar) para que el dibujo no cambie entre cuadros.
    let seed = 7;
    for (let i = 0; i < 420; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 128;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 128;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.035)';
      g.fillRect(x, y, 2, 2);
    }
  }
  return ctx.createPattern(grassCanvas, 'repeat');
}

function roundedRect(ctx, x, y, w, h, r) {
  const x2 = x + w;
  const y2 = y + h;
  ctx.beginPath();
  ctx.moveTo(x2 - r, y);
  ctx.arcTo(x2, y, x2, y + r, r);
  ctx.lineTo(x2, y2 - r);
  ctx.arcTo(x2, y2, x2 - r, y2, r);
  ctx.lineTo(x + r, y2);
  ctx.arcTo(x, y2, x, y2 - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawBackground(ctx, st) {
  const { width: w, height: h, cornerRadius, kickOffRadius } = st.bg;
  ctx.strokeStyle = LINE_COLOR;
  ctx.fillStyle = grassPattern(ctx);
  roundedRect(ctx, -w, -h, 2 * w, 2 * h, cornerRadius);
  ctx.save();
  ctx.scale(2, 2);
  ctx.fill();
  ctx.restore();
  ctx.moveTo(0, -h);
  ctx.lineTo(0, h);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 0, kickOffRadius, 0, 2 * Math.PI);
  ctx.stroke();
}

function drawSegment(ctx, s) {
  ctx.beginPath();
  ctx.strokeStyle = s.color;
  const a = s.v0;
  const b = s.v1;
  if (!Number.isFinite(s.curveF)) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  } else {
    const c = s.arcCenter;
    ctx.arc(c.x, c.y, Math.hypot(a.x - c.x, a.y - c.y), Math.atan2(a.y - c.y, a.x - c.x), Math.atan2(b.y - c.y, b.x - c.x));
  }
  ctx.stroke();
}

// ─── Discos ──────────────────────────────────────────────────────────────────
function drawDisc(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 2 * Math.PI, false);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

// El jugador: el color del equipo con su número en blanco. Mientras tiene la patada lista, el
// borde se pone blanco.
function drawPlayer(ctx, p) {
  const r = PLAYER_PHYSICS.radius;
  drawDisc(ctx, p.x, p.y, r, TEAMS[teamOf(p)].color, p.isKicking ? 'white' : 'black');
  if (p.number == null) return;
  const s = r / 32;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(s, s);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = AVATAR_FONT;
  ctx.fillText(String(p.number), 0, 12);
  ctx.restore();
}

function drawName(ctx, p) {
  ctx.save();
  ctx.font = '13px sans-serif';
  ctx.fillStyle = 'white';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(p.name || '', p.x, p.y + 30.5, 80);
  ctx.restore();
}

function drawHalo(ctx, p) {
  ctx.beginPath();
  ctx.strokeStyle = 'white';
  ctx.globalAlpha = 0.3;
  ctx.arc(p.x, p.y, 25, 0, 2 * Math.PI, false);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function indicate(ctx, pos, color, cam, viewW, viewH) {
  const w = 0.5 * viewW - 25;
  const h = 0.5 * viewH - 25;
  const x = cam.x + clamp(pos.x - cam.x, -w, w);
  const y = cam.y + clamp(pos.y - cam.y, -h, h);
  const dx = pos.x - x;
  const dy = pos.y - y;
  if (dx * dx + dy * dy <= 900) return;
  const angle = Math.atan2(dy, dx);
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  arrow(ctx, x + 2, y + 2, angle);
  ctx.fillStyle = color;
  arrow(ctx, x - 2, y - 2, angle);
}

function arrow(ctx, x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(15, 0);
  ctx.lineTo(0, 7);
  ctx.lineTo(0, -7);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ─── Carteles ────────────────────────────────────────────────────────────────
// Curvas de Hermite por tramos, como el `Animator` de HaxBall: cada tramo son 5 números
// (tiempo, valor, pendiente, valor siguiente, pendiente siguiente).
function animator(values) {
  return (x) => {
    const last = values.length - 1;
    if (x <= values[0]) return values[1];
    if (x >= values[last]) return values[last - 2];
    let lo = 0;
    let hi = (last / 5) | 0;
    do {
      const mid = (hi + lo) >>> 1;
      if (x > values[5 * mid]) lo = mid + 1;
      else hi = mid - 1;
    } while (lo <= hi);
    const i = 5 * hi;
    const t0 = values[i];
    const t = (x - t0) / (values[i + 5] - t0);
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * values[i + 1] + (t3 - 2 * t2 + t) * values[i + 2]
      + (-2 * t3 + 3 * t2) * values[i + 3] + (t3 - t2) * values[i + 4];
  };
}
const alphaAt = animator([0, 0, 2, 1, 0, 0.35, 1, 0, 1, 0, 0.7, 1, 0, 0, 0, 1]);
const slideAt = animator([0, -1, 3, 0, 0, 0.35, 0, 0, 0, 0, 0.65, 0, 0, 1, 3, 1]);

const lineCache = new Map();
function textLine(text, color) {
  const key = `${color}|${text}`;
  if (lineCache.has(key)) return lineCache.get(key);
  const canvas = document.createElement('canvas');
  const c = canvas.getContext('2d');
  c.font = BIG_FONT;
  canvas.width = Math.ceil(c.measureText(text).width) + 7;
  canvas.height = 90;
  c.font = BIG_FONT;
  c.textAlign = 'left';
  c.textBaseline = 'middle';
  c.fillStyle = 'black';
  c.fillText(text, 7, 52);
  c.fillStyle = color;
  c.fillText(text, 0, 45);
  lineCache.set(key, canvas);
  return canvas;
}

// Cartel que entra deslizándose, se queda y se va (≈ 2,4 s), como «Red Scores!».
export function createBanner(lines, color, startedAt) {
  const canvases = lines.map((l) => textLine(l, color));
  const duration = 2.31 + 0.1155 * (canvases.length - 1);
  return {
    done: (now) => (now - startedAt) / 1000 > duration,
    draw(ctx, now = performance.now()) {
      const k = (now - startedAt) / 1000 / 2.31;
      canvases.forEach((canvas, i) => {
        const t = k - 0.05 * i;
        const x = (i & 1 ? -1 : 1) * 180 * slideAt(t);
        ctx.globalAlpha = alphaAt(t);
        ctx.drawImage(canvas, x - 0.5 * canvas.width, 35 * (1 - canvases.length) + 70 * i - 0.5 * canvas.height);
      });
      ctx.globalAlpha = 1;
    },
  };
}

function drawStill(ctx, { lines, color }) {
  lines.forEach((l, i) => {
    const canvas = textLine(l, color);
    ctx.drawImage(canvas, -0.5 * canvas.width, 35 * (1 - lines.length) + 70 * i - 0.5 * canvas.height);
  });
}
