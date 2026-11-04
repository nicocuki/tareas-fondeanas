// T.E.G.: la geografía del tablero. Cada continente es una silueta dibujada a mano (en un lienzo de 1000 × 715) y cada país es
// el pedazo de su continente más cercano a su «semilla» (un diagrama de Voronoi recortado a la silueta). Así los países encajan
// sin huecos, comparten frontera de verdad y se sabe con quién limitan mirando el dibujo. Después se les ondula el borde con un
// campo de ruido que depende solo de la posición: dos países que comparten una frontera quedan con exactamente la misma línea.
// Todo es puro y determinista (sin azar): se calcula una vez al cargar.

export const MAP_W = 1000;
export const MAP_H = 715;

// Siluetas de los continentes. Europa y Asia comparten la frontera de los Urales (los mismos puntos, de norte a sur).
const URALES = [[775, 148], [790, 205], [782, 262], [766, 306], [742, 338], [722, 372]];

export const SILHOUETTES = {
  norteamerica: [[6, 250], [14, 205], [42, 170], [86, 140], [146, 122], [206, 118], [246, 140], [268, 175], [272, 215], [268, 262], [250, 292], [232, 318], [218, 345], [205, 372], [222, 398], [250, 420], [266, 432], [256, 438], [232, 418], [190, 394], [160, 364], [118, 350], [76, 326], [42, 302], [16, 282]],
  sudamerica: [[266, 432], [298, 405], [348, 408], [398, 422], [442, 450], [448, 488], [420, 525], [378, 565], [348, 603], [320, 622], [304, 585], [290, 532], [268, 482], [256, 445], [256, 438]],
  europa: [[600, 160], [650, 130], [715, 132], ...URALES, [705, 412], [684, 448], [662, 440], [650, 410], [630, 398], [612, 432], [585, 448], [550, 436], [545, 400], [562, 366], [570, 335], [585, 300], [598, 250], [592, 205]],
  asia: [...URALES.slice(0, 1), [802, 108], [852, 84], [912, 72], [962, 90], [994, 132], [998, 190], [978, 214], [948, 230], [944, 292], [935, 330], [950, 372], [938, 410], [918, 432], [902, 402], [884, 388], [880, 418], [868, 456], [856, 476], [842, 458], [830, 466], [818, 494], [792, 490], [772, 452], [766, 444], [744, 436], [750, 428], [734, 402], ...URALES.slice(5).reverse().slice(0, 1), ...URALES.slice(1, 5).reverse()],
  africa: [[560, 500], [592, 470], [640, 462], [700, 468], [724, 460], [744, 436], [766, 444], [762, 478], [760, 505], [752, 545], [730, 580], [700, 612], [660, 640], [625, 635], [612, 598], [598, 560], [570, 535]],
};

// Las islas: un país cada una, con su propia silueta (continente: el de abajo).
const ISLANDS = {
  groenlandia: ['norteamerica', [[300, 112], [338, 102], [372, 118], [384, 152], [372, 190], [346, 212], [318, 200], [298, 168], [292, 138]]],
  islandia: ['europa', [[408, 262], [438, 240], [470, 246], [478, 280], [460, 312], [428, 318], [404, 296]]],
  granbretana: ['europa', [[512, 300], [532, 262], [560, 255], [575, 292], [562, 335], [532, 345], [510, 325]]],
  madagascar: ['africa', [[790, 540], [812, 528], [828, 550], [820, 585], [800, 592], [788, 568]]],
  japon: ['asia', [[958, 236], [982, 244], [994, 272], [984, 306], [962, 298], [952, 266]]],
  sumatra: ['oceania', [[830, 505], [868, 498], [892, 515], [884, 545], [850, 552], [826, 532]]],
  borneo: ['oceania', [[915, 490], [955, 484], [985, 500], [990, 535], [960, 552], [925, 545], [908, 515]]],
  java: ['oceania', [[850, 578], [895, 570], [930, 580], [925, 605], [880, 612], [850, 600]]],
  australia: ['oceania', [[905, 645], [945, 628], [990, 640], [995, 680], [960, 705], [920, 698], [900, 670]]],
};

// Las semillas: de dónde «crece» cada país dentro de su continente (y dónde va su ficha, más o menos).
export const SEEDS = {
  alaska: [16,249], yukon: [96,175], canada: [197,153], labrador: [244,165], terranova: [263,243], oregon: [119,280],
  nuevayork: [178,301], california: [146,307], mexico: [160,343], colombia: [321,418], brasil: [399,461], peru: [330,463],
  chile: [294,525], argentina: [352,530], uruguay: [388,543], suecia: [633,147], rusia: [751,291], alemania: [620,347],
  polonia: [664,353], francia: [597,372], espana: [574,422], italia: [653,364], sahara: [609,519], egipto: [746,497],
  etiopia: [735,550], zaire: [648,593], sudafrica: [661,608], aral: [810,160], tartaria: [832,148], taimir: [846,119],
  siberia: [869,136], kamchatka: [944,123], mongolia: [933,181], gobi: [933,221], china: [904,274], iran: [846,320],
  india: [854,316], malasia: [927,316], turquia: [741,352], israel: [795,438], arabia: [803,447], groenlandia: [338,155],
  islandia: [440,278], granbretana: [540,300], madagascar: [806,560], japon: [970,270], sumatra: [860,525], borneo: [948,518],
  java: [890,592], australia: [948,668],
};

const CONTINENT_OF = {};
for (const [key, list] of Object.entries({
  norteamerica: ['alaska', 'yukon', 'canada', 'labrador', 'terranova', 'oregon', 'nuevayork', 'california', 'mexico', 'groenlandia'],
  sudamerica: ['colombia', 'brasil', 'peru', 'chile', 'argentina', 'uruguay'],
  europa: ['suecia', 'rusia', 'alemania', 'polonia', 'francia', 'espana', 'italia', 'islandia', 'granbretana'],
  africa: ['sahara', 'egipto', 'etiopia', 'zaire', 'sudafrica', 'madagascar'],
  asia: ['aral', 'tartaria', 'taimir', 'siberia', 'kamchatka', 'mongolia', 'gobi', 'china', 'iran', 'india', 'malasia', 'turquia', 'israel', 'arabia', 'japon'],
  oceania: ['sumatra', 'borneo', 'java', 'australia'],
})) for (const id of list) CONTINENT_OF[id] = key;

// ─── Geometría ───────────────────────────────────────────────────────────────
// Recorta el polígono a la mitad del plano de los puntos más cercanos a `a` que a `b` (Sutherland–Hodgman).
function clipCloser(poly, a, b) {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const side = (p) => (p[0] - mx) * nx + (p[1] - my) * ny; // ≤ 0: del lado de `a`
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export function area(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    s += p[0] * q[1] - q[0] * p[1];
  }
  return s / 2;
}

export function centroid(poly) {
  let cx = 0;
  let cy = 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p[0] * q[1] - q[0] * p[1];
    cx += (p[0] + q[0]) * f;
    cy += (p[1] + q[1]) * f;
    a += f;
  }
  return [cx / (3 * a), cy / (3 * a)];
}

export function inside(poly, [x, y]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

// El ruido que ondula bordes y costas: depende solo de (x, y), así lo comparten los vecinos.
function wobble([x, y]) {
  return [
    x + 3.4 * Math.sin(y * 0.071 + Math.sin(x * 0.043) * 2.0) + 1.7 * Math.sin(y * 0.19 + x * 0.07),
    y + 3.4 * Math.sin(x * 0.067 + Math.sin(y * 0.039) * 2.0) + 1.7 * Math.sin(x * 0.17 - y * 0.09),
  ];
}

// Parte cada lado en tramos de ~9 unidades (siempre en los mismos puntos, vaya para el lado que vaya) y aplica el ruido.
function organic(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const k = Math.max(1, Math.round(Math.hypot(q[0] - p[0], q[1] - p[1]) / 9));
    for (let s = 0; s < k; s++) {
      const t = s / k;
      out.push(wobble([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]));
    }
  }
  return out;
}

const toPath = (poly) => `M${poly.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`;

// ─── Los países ──────────────────────────────────────────────────────────────
// Polígonos «crudos» (rectos, sin ruido) de cada país a partir de sus semillas: sirven para saber quién limita con quién.
export function buildRaw(seeds = SEEDS) {
  const out = {};
  for (const [continent, outline] of Object.entries(SILHOUETTES)) {
    const ids = Object.keys(seeds).filter((id) => CONTINENT_OF[id] === continent && !ISLANDS[id]);
    for (const id of ids) {
      let poly = outline;
      for (const other of ids) if (other !== id) poly = clipCloser(poly, seeds[id], seeds[other]);
      out[id] = poly;
    }
  }
  for (const [id, [, poly]] of Object.entries(ISLANDS)) out[id] = poly;
  return out;
}
const rawShapes = buildRaw();
export const RAW_SHAPES = rawShapes;

export const SHAPES = {};
export const PLACE = {};
for (const [id, raw] of Object.entries(rawShapes)) {
  const shape = organic(raw);
  const c = centroid(raw);
  const at = inside(raw, c) ? c : SEEDS[id];
  SHAPES[id] = { d: toPath(shape), poly: shape, continent: CONTINENT_OF[id] };
  PLACE[id] = { x: Math.round(at[0]), y: Math.round(at[1]) };
}

// Las siluetas completas (para la costa y la sombra de cada continente).
export const COAST = Object.fromEntries(Object.keys(SILHOUETTES).map((k) => [k, toPath(organic(SILHOUETTES[k]))]));
export const ISLAND_COAST = Object.fromEntries(Object.entries(ISLANDS).map(([id, [, poly]]) => [id, toPath(organic(poly))]));
export const continentOfId = CONTINENT_OF;

// Pares de países que se tocan en el dibujo (comparten un tramo de frontera de más de 3 unidades).
export function touchingPairs(shapes = rawShapes) {
  const ids = Object.keys(shapes);
  const edges = (poly) => poly.map((p, i) => [p, poly[(i + 1) % poly.length]]);
  const overlap = ([a, b], [c, d]) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 0.5) return 0;
    const ux = (b[0] - a[0]) / len;
    const uy = (b[1] - a[1]) / len;
    const dist = (p) => Math.abs((p[0] - a[0]) * uy - (p[1] - a[1]) * ux);
    if (dist(c) > 0.6 || dist(d) > 0.6) return 0;
    const proj = (p) => (p[0] - a[0]) * ux + (p[1] - a[1]) * uy;
    const lo = Math.max(0, Math.min(proj(c), proj(d)));
    const hi = Math.min(len, Math.max(proj(c), proj(d)));
    return Math.max(0, hi - lo);
  };
  const out = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const A = edges(shapes[ids[i]]);
      const B = edges(shapes[ids[j]]);
      if (A.some((ea) => B.some((eb) => overlap(ea, eb) > 3))) out.push([ids[i], ids[j]]);
    }
  }
  return out;
}
