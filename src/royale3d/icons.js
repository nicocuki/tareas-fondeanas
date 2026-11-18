// Los íconos de armas y objetos de Royale 3D, dibujados con formas en un canvas (sin emojis ni imágenes).
// `iconURL(tipo, color)` devuelve una imagen (data URL) lista para un <img>; `color` es el acento (el de la rareza del arma).
// Todas las armas miran a la derecha, en un cuadro de 100 × 50.

const C = { m: '#464c55', d: '#1e2126', s: '#aab2bb', w: '#8a5a2e', g: '#6fb3ff', r: '#e63946', o: '#ff9a3c', y: '#ffd23f', k: '#2e8f4e', t: '#f4f1e8', b: '#2f7bff', l: '#7cc0ff', n: '#5b6b3a' };

// r = rectángulo, c = círculo, p = polígono, l = línea
const ART = {
  pickaxe: [['l', 14, 40, 78, 14, 'w', 4], ['p', [[58, 6], [72, 4], [92, 16], [86, 20], [70, 12], [58, 14]], 's'], ['p', [[58, 6], [46, 10], [40, 22], [47, 18], [58, 14]], 's']],
  pistol: [['r', 26, 16, 48, 9, 'm'], ['r', 26, 14, 48, 3, 's'], ['p', [[34, 25], [50, 25], [46, 46], [32, 46]], 'd'], ['r', 74, 17, 12, 6, 's'], ['r', 52, 25, 10, 3, 'm'], ['r', 26, 12, 48, 2, 'a']],
  deagle: [['r', 20, 14, 58, 12, 'm'], ['r', 20, 12, 58, 3, 's'], ['p', [[30, 26], [48, 26], [44, 46], [28, 46]], 'd'], ['r', 78, 15, 14, 8, 's'], ['r', 52, 26, 12, 3, 'm'], ['r', 20, 10, 58, 2, 'a']],
  revolver: [['r', 22, 16, 34, 12, 'm'], ['c', 38, 22, 11, 's'], ['r', 56, 17, 36, 6, 's'], ['p', [[24, 28], [38, 28], [32, 46], [20, 44]], 'w'], ['r', 22, 13, 34, 3, 'a']],
  tmp: [['r', 22, 16, 50, 11, 'm'], ['r', 72, 18, 20, 5, 'd'], ['r', 40, 27, 8, 22, 'd'], ['p', [[28, 27], [38, 27], [34, 40], [26, 40]], 'd'], ['r', 10, 18, 14, 4, 's'], ['r', 22, 13, 50, 3, 'a']],
  smg: [['r', 18, 15, 56, 12, 'm'], ['r', 74, 17, 18, 6, 's'], ['r', 40, 27, 9, 20, 'd'], ['p', [[28, 27], [38, 27], [32, 44], [24, 44]], 'd'], ['r', 6, 18, 14, 6, 'd'], ['r', 18, 12, 56, 3, 'a']],
  carbine: [['r', 16, 17, 62, 9, 'm'], ['r', 78, 18, 14, 5, 's'], ['p', [[4, 18], [18, 18], [18, 34], [8, 36]], 'w'], ['r', 42, 26, 8, 18, 'd'], ['r', 52, 12, 18, 5, 'd'], ['r', 16, 14, 62, 3, 'a']],
  rifle: [['r', 18, 17, 56, 10, 'm'], ['r', 74, 19, 20, 5, 's'], ['p', [[2, 17], [20, 17], [20, 34], [4, 38]], 'd'], ['r', 42, 27, 9, 20, 'd'], ['r', 48, 11, 22, 6, 's'], ['r', 18, 14, 56, 3, 'a']],
  burst: [['r', 16, 16, 58, 11, 'd'], ['r', 74, 18, 20, 5, 's'], ['p', [[2, 16], [18, 16], [18, 34], [4, 38]], 'm'], ['r', 40, 27, 8, 20, 'm'], ['r', 46, 10, 24, 6, 'm'], ['r', 22, 28, 12, 8, 's'], ['r', 16, 13, 58, 3, 'a']],
  pump: [['r', 16, 17, 30, 10, 'm'], ['r', 46, 16, 48, 5, 's'], ['r', 46, 22, 40, 5, 's'], ['r', 52, 24, 20, 8, 'w'], ['p', [[2, 18], [18, 18], [18, 32], [4, 38]], 'w'], ['r', 16, 14, 30, 3, 'a']],
  shotgun: [['r', 16, 17, 30, 10, 'm'], ['r', 46, 16, 48, 5, 's'], ['r', 46, 22, 44, 5, 's'], ['r', 52, 24, 18, 7, 'w'], ['p', [[2, 18], [18, 18], [18, 32], [4, 38]], 'w'], ['r', 16, 14, 30, 3, 'a']],
  dmr: [['r', 16, 19, 60, 8, 'm'], ['r', 76, 20, 20, 4, 's'], ['p', [[2, 19], [18, 19], [18, 34], [4, 38]], 'm'], ['r', 40, 27, 8, 16, 'd'], ['r', 36, 9, 26, 7, 'd'], ['c', 36, 12.5, 4, 'g'], ['r', 16, 16, 60, 3, 'a']],
  sniper: [['r', 10, 20, 70, 7, 'n'], ['r', 80, 21, 16, 3, 's'], ['p', [[0, 20], [14, 20], [14, 34], [2, 38]], 'n'], ['r', 36, 27, 7, 14, 'd'], ['r', 30, 8, 32, 8, 'd'], ['c', 30, 12, 5, 'g'], ['l', 56, 28, 50, 42, 's', 2], ['l', 62, 28, 68, 42, 's', 2], ['r', 10, 17, 70, 3, 'a']],
  crossbow: [['r', 14, 22, 62, 8, 'w'], ['r', 20, 20, 54, 3, 's'], ['r', 72, 6, 5, 38, 'd'], ['l', 74, 7, 90, 14, 'd', 3], ['l', 74, 43, 90, 36, 'd', 3], ['l', 90, 14, 76, 25, 't', 1], ['l', 90, 36, 76, 25, 't', 1], ['r', 50, 18, 20, 3, 'a'], ['p', [[24, 30], [34, 30], [30, 44], [22, 42]], 'd']],
  bazooka: [['r', 12, 14, 76, 18, 'n'], ['r', 6, 12, 14, 22, 'd'], ['r', 86, 10, 10, 26, 'd'], ['r', 44, 32, 7, 14, 'd'], ['r', 30, 8, 24, 6, 's'], ['r', 60, 12, 5, 22, 'a']],
  launcher: [['r', 16, 15, 44, 18, 'm'], ['c', 44, 24, 12, 'n'], ['r', 58, 19, 36, 8, 's'], ['p', [[2, 18], [18, 18], [18, 34], [4, 38]], 'd'], ['r', 28, 33, 8, 14, 'd'], ['r', 56, 17, 6, 12, 'a']],
  minigun: [['r', 30, 12, 64, 4, 's'], ['r', 30, 19, 64, 4, 's'], ['r', 30, 26, 64, 4, 's'], ['r', 14, 10, 24, 26, 'm'], ['r', 6, 14, 12, 18, 'd'], ['r', 18, 36, 8, 12, 'd'], ['r', 20, 6, 14, 4, 'a'], ['c', 36, 23, 8, 'd']],
  // Consumibles y otros
  bandage: [['r', 22, 12, 56, 26, 't'], ['r', 22, 12, 56, 4, 'r'], ['r', 22, 34, 56, 4, 'r'], ['c', 22, 25, 13, 't'], ['c', 22, 25, 6, 'd'], ['r', 44, 12, 12, 26, 'r']],
  medkit: [['r', 16, 14, 68, 32, 't'], ['r', 16, 14, 68, 5, 's'], ['r', 40, 6, 20, 8, 'd'], ['r', 44, 20, 12, 22, 'r'], ['r', 34, 26, 32, 10, 'r']],
  shield: [['r', 40, 6, 20, 8, 'd'], ['r', 42, 12, 16, 8, 's'], ['p', [[42, 20], [58, 20], [74, 36], [68, 46], [32, 46], [26, 36]], 'b'], ['p', [[42, 24], [48, 24], [34, 38], [32, 36]], 'l']],
  bigshield: [['r', 42, 2, 16, 8, 'd'], ['r', 44, 8, 12, 8, 's'], ['p', [[42, 16], [58, 16], [82, 32], [74, 48], [26, 48], [18, 32]], 'b'], ['p', [[42, 20], [49, 20], [30, 36], [26, 33]], 'l'], ['r', 46, 32, 8, 8, 'y']],
  grenade: [['p', [[34, 18], [66, 18], [76, 32], [66, 46], [34, 46], [24, 32]], 'k'], ['r', 42, 8, 16, 10, 's'], ['r', 56, 10, 22, 4, 's'], ['c', 80, 14, 6, 'd'], ['l', 34, 30, 66, 30, 'd', 1.5], ['l', 34, 38, 66, 38, 'd', 1.5]],
  chest: [['r', 12, 20, 76, 26, 'w'], ['p', [[12, 20], [20, 8], [80, 8], [88, 20]], 'w'], ['r', 12, 20, 76, 5, 'y'], ['r', 44, 24, 12, 11, 'y'], ['r', 12, 38, 76, 3, 'd']],
  wood: [['r', 12, 10, 60, 14, 'w'], ['c', 12, 17, 7, 'y'], ['r', 30, 28, 60, 14, 'w'], ['c', 30, 35, 7, 'y'], ['c', 12, 17, 3, 'w'], ['c', 30, 35, 3, 'w']],
};

const cache = new Map();

export function iconURL(kind, accent = '#c9ccd6') {
  const art = ART[kind];
  if (!art || typeof document === 'undefined') return '';
  const key = `${kind}|${accent}`;
  if (cache.has(key)) return cache.get(key);
  const cv = document.createElement('canvas');
  cv.width = 200; cv.height = 100;
  const g = cv.getContext('2d');
  g.scale(2, 2);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const col = (c) => (c === 'a' ? accent : C[c] || '#fff');
  for (const op of art) {
    const [t] = op;
    if (t === 'l') {
      const [, x1, y1, x2, y2, c, w] = op;
      g.strokeStyle = '#0c0d10'; g.lineWidth = w + 2; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = col(c); g.lineWidth = w; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      continue;
    }
    g.fillStyle = col(op[op.length - 1]);
    g.strokeStyle = 'rgba(8,9,12,0.9)';
    g.lineWidth = 1.2;
    g.beginPath();
    if (t === 'r') { const [, x, y, w, h] = op; g.rect(x, y, w, h); } else if (t === 'c') { const [, x, y, r] = op; g.arc(x, y, r, 0, Math.PI * 2); } else if (t === 'p') { const pts = op[1]; g.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) g.lineTo(x, y); g.closePath(); }
    g.fill();
    g.stroke();
  }
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

export const hasIcon = (kind) => Boolean(ART[kind]);

// El token pirata: una moneda de oro con una calavera y dos huesos cruzados.
let token = '';
export function tokenURL() {
  if (token || typeof document === 'undefined') return token;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 320;
  const g = cv.getContext('2d');
  g.translate(160, 160);
  const rim = g.createLinearGradient(-150, -150, 150, 150);
  rim.addColorStop(0, '#fff2a8'); rim.addColorStop(0.5, '#e0a82c'); rim.addColorStop(1, '#8a5a10');
  g.fillStyle = rim; g.beginPath(); g.arc(0, 0, 150, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#5c3a08'; g.lineWidth = 6; g.stroke();
  const face = g.createRadialGradient(-40, -50, 20, 0, 0, 125);
  face.addColorStop(0, '#ffe27a'); face.addColorStop(1, '#c58a1c');
  g.fillStyle = face; g.beginPath(); g.arc(0, 0, 122, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#7a4d0c'; g.lineWidth = 4; g.setLineDash([10, 9]); g.beginPath(); g.arc(0, 0, 132, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  // Huesos cruzados.
  g.strokeStyle = '#5c3a08'; g.lineWidth = 26; g.lineCap = 'round';
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-70 * s, 78); g.lineTo(70 * s, 8); g.stroke(); }
  g.strokeStyle = '#fff6dd'; g.lineWidth = 16;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(-70 * s, 78); g.lineTo(70 * s, 8); g.stroke(); }
  g.fillStyle = '#fff6dd'; g.strokeStyle = '#5c3a08'; g.lineWidth = 5;
  for (const s of [-1, 1]) for (const e of [[-74 * s, 82], [74 * s, 6]]) for (const o of [-9, 9]) { g.beginPath(); g.arc(e[0] + o * 0.6, e[1] + o, 11, 0, Math.PI * 2); g.fill(); g.stroke(); }
  // Calavera.
  g.fillStyle = '#fff6dd'; g.beginPath(); g.arc(0, -26, 48, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.rect(-26, 8, 52, 30); g.fill(); g.stroke();
  g.fillStyle = '#2a1a04';
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 20, -26, 12, 15, 0, 0, Math.PI * 2); g.fill(); }
  g.beginPath(); g.moveTo(0, -4); g.lineTo(-7, 10); g.lineTo(7, 10); g.closePath(); g.fill();
  g.lineWidth = 3; g.strokeStyle = '#2a1a04';
  for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 10, 18); g.lineTo(i * 10, 36); g.stroke(); }
  token = cv.toDataURL('image/png');
  return token;
}
