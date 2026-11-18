// Íconos de Cohete Royale dibujados con código (nada de emojis): cada objeto es una chapa con relieve, su color y un dibujo blanco
// con contorno. Sirven igual en el HUD, en las cajas del mapa y en la sala de espera (`iconSprite` los guarda ya dibujados).
// Todos se arman en un cuadro de −1 a 1 que `drawIcon` agranda al tamaño pedido.

const INK = '#17121f';

// Color de cada objeto (el de la chapa). Los «pelados» (calavera, cruz, etc.) se dibujan sin chapa.
export const ICON_COLORS = {
  rocket: '#35b6ff', nuke: '#8fd13c', mine: '#f0813a', rapid: '#f2c230', shield: '#4fd3d9', flak: '#ff7d5c', grenade: '#5db84a',
  drill: '#9d8cff', homing: '#ff5d73', whirl: '#7ec8ff', jetpack: '#ff9a3c', poison: '#69d84f', laser: '#ff4f9a', smoke: '#9aa6b5',
  heal: '#ff4d5e', teleport: '#b86bff', turbo: '#ffb02e', shock: '#4d8bff', medkit: '#2ecf8a', triple: '#46d0c0', bounce: '#ff8fd0',
  cement: '#b0875a', strike: '#ff5a2e', airbomb: '#ff5a2e',
};
const BARE = new Set(['skull', 'hit', 'wave', 'storm', 'coin', 'crown']);
export const ICON_NAMES = [...Object.keys(ICON_COLORS), ...BARE];

const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
};

// Rellena y contornea lo que está armado (`c` ya tiene el path). Un contorno fino oscuro le da cuerpo al dibujo.
function fs(c, fill = '#ffffff') { c.fillStyle = fill; c.fill(); c.stroke(); }
const rr = (c, x, y, w, h, r) => { c.beginPath(); c.roundRect(x, y, w, h, r); };
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); };

// Un cohetecito apuntando hacia arriba (para el cohete, el trío…).
function miniRocket(c, s = 1) {
  c.beginPath();
  c.moveTo(0, -0.95 * s); c.quadraticCurveTo(0.34 * s, -0.35 * s, 0.28 * s, 0.4 * s); c.lineTo(-0.28 * s, 0.4 * s); c.quadraticCurveTo(-0.34 * s, -0.35 * s, 0, -0.95 * s);
  fs(c);
  c.beginPath(); c.moveTo(0.28 * s, 0.1 * s); c.lineTo(0.62 * s, 0.62 * s); c.lineTo(0.26 * s, 0.4 * s); c.closePath(); fs(c, '#ff6b5e');
  c.beginPath(); c.moveTo(-0.28 * s, 0.1 * s); c.lineTo(-0.62 * s, 0.62 * s); c.lineTo(-0.26 * s, 0.4 * s); c.closePath(); fs(c, '#ff6b5e');
  circ(c, 0, -0.2 * s, 0.14 * s); fs(c, '#35b6ff');
  c.beginPath(); c.moveTo(-0.17 * s, 0.4 * s); c.lineTo(0, 0.95 * s); c.lineTo(0.17 * s, 0.4 * s); c.closePath(); fs(c, '#ffd23f');
}

const GLYPHS = {
  rocket(c) { c.rotate(Math.PI / 4); miniRocket(c, 1); },
  triple(c) { for (const a of [-0.5, 0, 0.5]) { c.save(); c.translate(0, 0.25); c.rotate(a); c.translate(0, -0.25); miniRocket(c, 0.62); c.restore(); } },
  nuke(c) {
    for (let k = 0; k < 3; k++) {
      const a0 = (k * 120 - 90 - 30) * Math.PI / 180, a1 = a0 + Math.PI / 3;
      c.beginPath(); c.arc(0, 0, 0.92, a0, a1); c.arc(0, 0, 0.36, a1, a0, true); c.closePath(); fs(c);
    }
    circ(c, 0, 0, 0.2); fs(c);
  },
  mine(c) {
    for (let k = 0; k < 8; k++) {
      c.save(); c.rotate(k * Math.PI / 4);
      c.beginPath(); c.moveTo(-0.14, -0.4); c.lineTo(0, -0.95); c.lineTo(0.14, -0.4); c.closePath(); fs(c);
      c.restore();
    }
    circ(c, 0, 0, 0.56); fs(c, '#d6dae3');
    circ(c, 0, 0, 0.22); fs(c, '#ff3b30');
  },
  rapid(c) {
    for (const x of [-0.62, -0.1, 0.42]) {
      c.beginPath(); c.moveTo(x, -0.62); c.lineTo(x + 0.4, 0); c.lineTo(x, 0.62); c.lineTo(x + 0.2, 0); c.closePath(); fs(c);
    }
  },
  shield(c) {
    c.beginPath(); c.moveTo(0, -0.95); c.lineTo(0.8, -0.65); c.quadraticCurveTo(0.8, 0.4, 0, 0.98); c.quadraticCurveTo(-0.8, 0.4, -0.8, -0.65); c.closePath(); fs(c);
    c.beginPath(); c.moveTo(0, -0.7); c.lineTo(0.55, -0.48); c.quadraticCurveTo(0.55, 0.28, 0, 0.74); c.closePath(); fs(c, '#8fe9ee');
  },
  flak(c) {
    for (const [x, y, r] of [[-0.55, 0.45, 0.2], [-0.05, 0.1, 0.2], [0.5, -0.35, 0.2], [0.18, 0.6, 0.15], [0.6, 0.15, 0.15], [-0.4, -0.2, 0.14], [0.05, -0.62, 0.14]]) { circ(c, x, y, r); fs(c); }
  },
  grenade(c) {
    circ(c, 0, 0.18, 0.62); fs(c, '#e9f7e0');
    c.strokeStyle = 'rgba(23,18,31,0.55)'; c.lineWidth = 0.07;
    c.beginPath(); c.moveTo(-0.55, 0.18); c.lineTo(0.55, 0.18); c.moveTo(0, -0.42); c.lineTo(0, 0.8); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 0.1;
    rr(c, -0.2, -0.78, 0.4, 0.26, 0.06); fs(c, '#d6dae3');
    c.beginPath(); c.arc(0.42, -0.72, 0.2, 0, Math.PI * 2); c.stroke();
  },
  drill(c) {
    c.rotate(Math.PI / 4);
    c.beginPath(); c.moveTo(0, -1); c.lineTo(0.5, 0.35); c.lineTo(-0.5, 0.35); c.closePath(); fs(c, '#e8e6ff');
    c.strokeStyle = 'rgba(23,18,31,0.6)'; c.lineWidth = 0.09;
    for (const y of [-0.5, -0.1, 0.25]) { const hw = 0.5 * (y + 1) / 1.35; c.beginPath(); c.moveTo(-hw, y + 0.14); c.lineTo(hw, y - 0.1); c.stroke(); }
    c.strokeStyle = INK; c.lineWidth = 0.1;
    rr(c, -0.38, 0.35, 0.76, 0.5, 0.1); fs(c, '#6c5fd1');
  },
  homing(c) {
    c.lineWidth = 0.16; c.strokeStyle = INK; circ(c, 0, 0, 0.6); c.stroke();
    c.lineWidth = 0.09; c.strokeStyle = '#fff'; circ(c, 0, 0, 0.6); c.stroke();
    c.lineWidth = 0.13;
    for (const [x0, y0, x1, y1] of [[0, -0.98, 0, -0.34], [0, 0.98, 0, 0.34], [-0.98, 0, -0.34, 0], [0.98, 0, 0.34, 0]]) {
      c.strokeStyle = INK; c.lineWidth = 0.2; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = 0.1; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.lineWidth = 0.1; c.strokeStyle = INK; circ(c, 0, 0, 0.14); fs(c, '#fff');
  },
  whirl(c) {
    const spiral = () => { c.beginPath(); for (let a = 0; a < 11; a += 0.25) { const r = 0.07 + a * 0.078; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.stroke(); };
    c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 0.3; spiral();
    c.strokeStyle = '#fff'; c.lineWidth = 0.16; spiral();
  },
  jetpack(c) {
    for (const x of [-0.42, 0.42]) {
      rr(c, x - 0.26, -0.8, 0.52, 1.3, 0.26); fs(c, '#e6e9f0');
      c.beginPath(); c.moveTo(x - 0.2, 0.52); c.lineTo(x, 0.98); c.lineTo(x + 0.2, 0.52); c.closePath(); fs(c, '#ffd23f');
      c.beginPath(); c.moveTo(x - 0.1, 0.52); c.lineTo(x, 0.8); c.lineTo(x + 0.1, 0.52); c.closePath(); fs(c, '#ff5a2e');
      rr(c, x - 0.26, -0.5, 0.52, 0.16, 0.05); fs(c, '#ff7a29');
    }
    rr(c, -0.2, -0.32, 0.4, 0.14, 0.05); fs(c, '#8a8f9c');
  },
  poison(c) {
    c.beginPath(); c.moveTo(-0.22, -0.92); c.lineTo(0.22, -0.92); c.lineTo(0.22, -0.4); c.lineTo(0.78, 0.62); c.quadraticCurveTo(0.84, 0.9, 0.5, 0.9); c.lineTo(-0.5, 0.9); c.quadraticCurveTo(-0.84, 0.9, -0.78, 0.62); c.lineTo(-0.22, -0.4); c.closePath(); fs(c, '#e9fbe3');
    c.beginPath(); c.moveTo(-0.55, 0.22); c.lineTo(0.55, 0.22); c.lineTo(0.78, 0.62); c.quadraticCurveTo(0.84, 0.9, 0.5, 0.9); c.lineTo(-0.5, 0.9); c.quadraticCurveTo(-0.84, 0.9, -0.78, 0.62); c.closePath(); fs(c, '#6fe04f');
    circ(c, -0.12, 0.52, 0.12); fs(c, '#d7ffc6'); circ(c, 0.22, 0.4, 0.08); fs(c, '#d7ffc6');
    rr(c, -0.3, -1.02, 0.6, 0.18, 0.06); fs(c, '#b58a5a');
  },
  laser(c) {
    c.beginPath(); c.moveTo(0.25, -1); c.lineTo(-0.62, 0.12); c.lineTo(-0.08, 0.12); c.lineTo(-0.3, 1); c.lineTo(0.66, -0.18); c.lineTo(0.08, -0.18); c.closePath(); fs(c, '#fff3a8');
  },
  smoke(c) {
    c.beginPath(); c.arc(-0.42, 0.2, 0.36, Math.PI * 0.5, Math.PI * 1.5); c.arc(-0.1, -0.22, 0.42, Math.PI * 1.05, Math.PI * 1.95); c.arc(0.42, 0.04, 0.4, Math.PI * 1.5, Math.PI * 0.5); c.closePath(); fs(c, '#f3f5f8');
    c.beginPath(); c.moveTo(-0.5, 0.56); c.lineTo(0.42, 0.44); c.stroke();
  },
  heal(c) { c.beginPath(); c.roundRect(-0.28, -0.88, 0.56, 1.76, 0.14); c.roundRect(-0.88, -0.28, 1.76, 0.56, 0.14); fs(c); },
  medkit(c) {
    rr(c, -0.86, -0.5, 1.72, 1.34, 0.2); fs(c, '#f5f7fa');
    rr(c, -0.32, -0.9, 0.64, 0.5, 0.14); c.stroke(); c.fillStyle = 'rgba(0,0,0,0)';
    c.beginPath(); c.roundRect(-0.14, -0.28, 0.28, 0.86, 0.06); c.roundRect(-0.43, 0, 0.86, 0.28, 0.06); fs(c, '#ee3b4c');
  },
  teleport(c) {
    c.lineWidth = 0.14;
    for (const [r, col] of [[0.86, '#fff'], [0.56, '#e5ccff']]) { c.strokeStyle = INK; c.lineWidth = 0.26; circ(c, 0, 0, r); c.stroke(); c.strokeStyle = col; c.lineWidth = 0.12; circ(c, 0, 0, r); c.stroke(); }
    c.strokeStyle = INK; c.lineWidth = 0.1;
    c.beginPath(); c.moveTo(0, -0.5); c.quadraticCurveTo(0.12, -0.12, 0.5, 0); c.quadraticCurveTo(0.12, 0.12, 0, 0.5); c.quadraticCurveTo(-0.12, 0.12, -0.5, 0); c.quadraticCurveTo(-0.12, -0.12, 0, -0.5); c.closePath(); fs(c);
  },
  turbo(c) {
    c.lineCap = 'round';
    c.strokeStyle = INK; c.lineWidth = 0.34; c.beginPath(); c.arc(0, 0.3, 0.8, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 0.18; c.beginPath(); c.arc(0, 0.3, 0.8, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 0.28; c.beginPath(); c.moveTo(0, 0.3); c.lineTo(0.42, -0.34); c.stroke();
    c.strokeStyle = '#ff3b30'; c.lineWidth = 0.14; c.beginPath(); c.moveTo(0, 0.3); c.lineTo(0.42, -0.34); c.stroke();
    c.lineWidth = 0.1; c.strokeStyle = INK; circ(c, 0, 0.3, 0.17); fs(c, '#fff');
    c.fillStyle = '#fff';
    for (const x of [-0.5, -0.2, 0.1]) { c.beginPath(); c.roundRect(x - 0.12, 0.74, 0.5, 0.12, 0.06); c.fill(); }
  },
  shock(c) {
    c.lineCap = 'round';
    for (const [r, col] of [[0.88, '#e6f1ff'], [0.58, '#fff']]) {
      c.strokeStyle = INK; c.lineWidth = 0.28; c.beginPath(); c.arc(0, 0, r, -2.5, -0.64); c.moveTo(Math.cos(0.64) * r, Math.sin(0.64) * r); c.arc(0, 0, r, 0.64, 2.5); c.stroke();
      c.strokeStyle = col; c.lineWidth = 0.14; c.beginPath(); c.arc(0, 0, r, -2.5, -0.64); c.moveTo(Math.cos(0.64) * r, Math.sin(0.64) * r); c.arc(0, 0, r, 0.64, 2.5); c.stroke();
    }
    c.lineWidth = 0.1; c.strokeStyle = INK; circ(c, 0, 0, 0.22); fs(c, '#fff');
  },
  bounce(c) {
    c.lineCap = 'round'; c.lineJoin = 'round';
    const path = () => { c.beginPath(); c.moveTo(-0.85, -0.7); c.lineTo(-0.5, 0.5); c.lineTo(0, -0.3); c.lineTo(0.38, 0.5); c.lineTo(0.7, -0.1); c.stroke(); };
    c.strokeStyle = INK; c.lineWidth = 0.3; path(); c.strokeStyle = '#fff'; c.lineWidth = 0.15; path();
    rr(c, -0.95, 0.66, 1.9, 0.2, 0.08); fs(c, '#e9d4ff');
    c.lineWidth = 0.1; c.strokeStyle = INK; circ(c, 0.7, -0.25, 0.26); fs(c, '#ffe8f4');
  },
  cement(c) {
    c.lineWidth = 0.09;
    for (let row = 0; row < 3; row++) {
      const y = -0.8 + row * 0.55, off = row % 2 ? 0.42 : 0;
      for (let k = -1; k < 3; k++) {
        const x = -0.95 + off + k * 0.84;
        const x0 = Math.max(-0.95, x), x1 = Math.min(0.95, x + 0.78);
        if (x1 - x0 < 0.12) continue;
        rr(c, x0, y, x1 - x0, 0.46, 0.05); fs(c, row === 1 ? '#f1d6b4' : '#e8c79d');
      }
    }
  },
  strike(c) {
    c.lineWidth = 0.22; c.strokeStyle = INK; circ(c, 0, 0.45, 0.46); c.stroke(); c.lineWidth = 0.1; c.strokeStyle = '#fff'; circ(c, 0, 0.45, 0.46); c.stroke();
    c.lineWidth = 0.1; c.strokeStyle = INK; circ(c, 0, 0.45, 0.12); fs(c, '#fff');
    for (const x of [-0.6, 0, 0.6]) {
      c.beginPath(); c.moveTo(x - 0.17, -0.82); c.lineTo(x + 0.17, -0.82); c.lineTo(x + 0.17, -0.38); c.lineTo(x, -0.14); c.lineTo(x - 0.17, -0.38); c.closePath(); fs(c, '#fff');
    }
  },
  // Íconos sueltos (sin chapa).
  skull(c) {
    c.beginPath(); c.arc(0, -0.15, 0.78, Math.PI * 0.78, Math.PI * 2.22); c.lineTo(0.42, 0.62); c.lineTo(0.42, 0.88); c.lineTo(-0.42, 0.88); c.lineTo(-0.42, 0.62); c.closePath(); fs(c, '#f4f4fa');
    circ(c, -0.3, -0.12, 0.2); fs(c, INK); circ(c, 0.3, -0.12, 0.2); fs(c, INK);
    c.beginPath(); c.moveTo(0, 0.18); c.lineTo(-0.1, 0.4); c.lineTo(0.1, 0.4); c.closePath(); fs(c, INK);
    c.lineWidth = 0.07; c.beginPath(); c.moveTo(-0.14, 0.64); c.lineTo(-0.14, 0.88); c.moveTo(0.14, 0.64); c.lineTo(0.14, 0.88); c.stroke();
  },
  hit(c) {
    c.strokeStyle = INK; c.lineWidth = 0.34; circ(c, 0, 0, 0.62); c.stroke();
    c.strokeStyle = '#ff4d5e'; c.lineWidth = 0.17; circ(c, 0, 0, 0.62); c.stroke();
    for (const [x0, y0, x1, y1] of [[0, -1, 0, -0.34], [0, 1, 0, 0.34], [-1, 0, -0.34, 0], [1, 0, 0.34, 0]]) {
      c.strokeStyle = INK; c.lineWidth = 0.3; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.strokeStyle = '#ff4d5e'; c.lineWidth = 0.15; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
    }
    c.lineWidth = 0.1; c.strokeStyle = INK; circ(c, 0, 0, 0.14); fs(c, '#ffffff');
  },
  wave(c) {
    c.lineCap = 'round';
    for (const y of [-0.35, 0.15, 0.65]) {
      const path = () => { c.beginPath(); for (let x = -0.9; x <= 0.9; x += 0.1) c.lineTo(x, y + Math.sin(x * 4.2) * 0.17); c.stroke(); };
      c.strokeStyle = INK; c.lineWidth = 0.34; path(); c.strokeStyle = '#7fd6ff'; c.lineWidth = 0.2; path();
    }
  },
  storm(c) {
    c.beginPath(); c.arc(-0.4, 0.05, 0.4, Math.PI * 0.5, Math.PI * 1.5); c.arc(-0.05, -0.34, 0.46, Math.PI * 1.05, Math.PI * 1.95); c.arc(0.45, -0.1, 0.38, Math.PI * 1.5, Math.PI * 0.5); c.closePath(); fs(c, '#c9b8ff');
    c.beginPath(); c.moveTo(0.12, 0.1); c.lineTo(-0.28, 0.66); c.lineTo(0.0, 0.66); c.lineTo(-0.16, 1.0); c.lineTo(0.42, 0.36); c.lineTo(0.1, 0.36); c.closePath(); fs(c, '#ffe85a');
  },
  coin(c) {
    circ(c, 0, 0, 0.82); fs(c, '#ffd23f');
    c.strokeStyle = '#b8860b'; c.lineWidth = 0.1; circ(c, 0, 0, 0.56); c.stroke();
    c.fillStyle = '#b8860b'; c.beginPath(); c.roundRect(-0.09, -0.34, 0.18, 0.68, 0.06); c.fill();
  },
  crown(c) {
    c.beginPath(); c.moveTo(-0.85, 0.6); c.lineTo(-0.9, -0.55); c.lineTo(-0.42, -0.05); c.lineTo(0, -0.8); c.lineTo(0.42, -0.05); c.lineTo(0.9, -0.55); c.lineTo(0.85, 0.6); c.closePath(); fs(c, '#ffd23f');
    for (const x of [-0.5, 0, 0.5]) { circ(c, x, 0.28, 0.12); fs(c, '#ff4d5e'); }
  },
};
GLYPHS.airbomb = GLYPHS.strike;

// Dibuja el ícono `name` centrado en (cx, cy) con radio `r`.
export function drawIcon(ctx, name, cx, cy, r) {
  const glyph = GLYPHS[name] || GLYPHS.rocket;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (!BARE.has(name)) {
    const color = ICON_COLORS[name] || ICON_COLORS.rocket;
    const half = r * 0.92, rad = r * 0.46;
    // Sombra, borde oscuro, relieve y brillo.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.roundRect(-half, -half + r * 0.1, half * 2, half * 2, rad); ctx.fill();
    const g = ctx.createLinearGradient(0, -half, 0, half);
    g.addColorStop(0, shade(color, 0.28)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.32));
    ctx.fillStyle = g; ctx.strokeStyle = INK; ctx.lineWidth = r * 0.14;
    ctx.beginPath(); ctx.roundRect(-half, -half, half * 2, half * 2, rad); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath(); ctx.roundRect(-half * 0.8, -half * 0.86, half * 1.6, half * 0.58, [rad * 0.7, rad * 0.7, rad * 0.3, rad * 0.3]); ctx.fill();
    ctx.scale(r * 0.62, r * 0.62);
  } else {
    ctx.scale(r * 0.95, r * 0.95);
  }
  ctx.strokeStyle = INK;
  ctx.lineWidth = 0.1;
  glyph(ctx);
  ctx.restore();
}

// Íconos ya dibujados en un canvas chico (se guardan por nombre y tamaño): para el juego, que los pone cada cuadro.
const cache = new Map();
export function iconSprite(name, px) {
  const key = `${name}:${px}`;
  let c = cache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = c.height = px;
    drawIcon(c.getContext('2d'), name, px / 2, px / 2, px / 2 - 1);
    cache.set(key, c);
  }
  return c;
}
