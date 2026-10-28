// Pixel Royale: los lugares con nombre de la isla. Cada uno se «estampa» sobre el terreno ya armado
// (makeMap les da un contexto `c` con las herramientas) y el nombre dice cómo es: un muelle, una
// cancha, un puente sobre un río. Lógica pura, sin azar propio: todo sale de `c.rng`.

// pos: centro en casillas por mapa (null = ese mapa no lo tiene). k: escala en el mapa chico.
// size: lo que ocupa a escala 1 (sirve para saber «dónde estás» y para que las casas sueltas no pisen).
export const PLACE_DEFS = [
  { id: 'polvorin', name: 'Pibes Polvorín Polvoriento', size: [18, 15], pos: { grande: [13, 55], chica: [8, 32] }, k: { chica: 0.6 }, stamp: polvorin },
  { id: 'muelle', name: 'Muelle Mojito', size: [19, 22], pos: { grande: [52, 90], chica: [31, 52] }, k: { chica: 0.6 }, anchor: (cx, cy, k) => [cx, cy - Math.round(7 * k)], stamp: muelle },
  { id: 'frontera', name: 'Frontera del Fondo', size: [46, 12], pos: { grande: [52, 15], chica: null }, k: {}, stamp: frontera },
  { id: 'puente', name: 'Puente Pollín', size: [24, 38], pos: { grande: [80, 28], chica: null }, k: {}, stamp: puente },
  { id: 'cover', name: 'Cover', size: [22, 18], pos: { grande: [72, 72], chica: [44, 40] }, k: { chica: 0.6 }, stamp: cover },
  { id: 'arboleada', name: 'Arboleada Alianza', size: [22, 22], pos: { grande: [24, 30], chica: [17, 14] }, k: { chica: 0.6 }, stamp: arboleada },
  { id: 'judia', name: 'Juvenil Judía', size: [20, 14], pos: { grande: [30, 76], chica: null }, k: {}, stamp: judia },
  { id: 'villa', name: 'Villa Vermut', size: [26, 22], pos: { grande: [50, 50], chica: [30, 28] }, k: { chica: 0.6 }, center: true, stamp: villa },
  { id: 'penasco', name: 'Peñasco Pelado', size: [13, 13], pos: { grande: [87, 56], chica: null }, k: {}, stamp: penasco },
];

const scale = (k) => (n) => Math.max(1, Math.round(n * k));

// Una playa con un búnker de ladrillo, pilas de cajas de munición y sacos de arena.
function polvorin(c, cx, cy, k) {
  const { T } = c, K = scale(k);
  const w = K(18), h = K(15);
  c.ellipse(cx, cy, w / 2, h / 2, (x, y) => c.set(x, y, T.SAND));
  const bw = K(9), bh = Math.max(5, K(6));
  const bx = cx - (bw >> 1), by = cy - (bh >> 1);
  c.house(bx, by, bw, bh, { chests: 3, tier: 2, crates: false });
  const outside = (x, y) => x < bx - 2 || x > bx + bw + 1 || y < by - 2 || y > by + bh + 1;
  for (let n = 0, tries = 0; n < K(9) && tries < 80; tries++) {
    const x = cx + Math.round((c.rng() * 2 - 1) * (w / 2 - 1)), y = cy + Math.round((c.rng() * 2 - 1) * (h / 2 - 1));
    if (!outside(x, y) || c.get(x, y) !== T.SAND) continue;
    c.set(x, y, T.CRATE);
    if (c.rng() < 0.5 && outside(x + 1, y) && c.get(x + 1, y) === T.SAND) c.set(x + 1, y, T.CRATE);
    n++;
  }
  for (let i = 0; i < K(5); i++) { c.set(bx + i, by - 3, T.ROCK); c.set(bx + bw - 1 - i, by + bh + 2, T.ROCK); }
  c.chest(cx - (w >> 1) + 2, cy + 1, 2);
}

// Un muelle de madera que se mete en el mar, con una plataforma al final y dos cabañas en la costa.
function muelle(c, cx, cy, k) {
  const { T } = c, K = scale(k);
  const baseY = cy - K(7);
  c.land(cx, baseY, K(11), K(5));
  c.fill(cx - 1, baseY, 3, K(16), T.PLANK);
  const endY = baseY + K(14);
  c.fill(cx - K(5), endY, K(11), 4, T.PLANK);
  c.fill(cx - K(6), baseY + K(7), K(5), 2, T.PLANK);
  c.house(cx - 9, baseY - 3, 5, 5, { chests: 1, tier: 1 });
  c.house(cx + 5, baseY - 3, 5, 5, { chests: 1, tier: 1 });
  c.set(cx - K(4), endY + 1, T.CRATE); c.set(cx + K(4), endY + 2, T.CRATE);
  for (const [dx, dy] of [[-7, 4], [8, 4], [-3, 5], [4, 5]]) if (c.get(cx + dx, baseY + dy) >= T.SAND && c.get(cx + dx, baseY + dy) <= T.GRASS) c.set(cx + dx, baseY + dy, T.TREE);
  c.chest(cx, endY + 2, 2);
  c.chest(cx - K(6), baseY + K(7), 1);
}

// Un muro largo de frontera con dos portones, torres en las puntas y un puesto de guardia.
function frontera(c, cx, cy) {
  const { T } = c;
  const half = 20;
  c.land(cx, cy, half + 5, 9);
  const gates = [cx - 9, cx + 8];
  for (let x = cx - half; x <= cx + half; x++) {
    if (gates.some((g) => x >= g && x < g + 3)) continue;
    c.set(x, cy, T.WALL);
  }
  c.house(cx - half - 3, cy - 3, 6, 7, { chests: 1, tier: 2, crates: false });
  c.house(cx + half - 2, cy - 3, 6, 7, { chests: 1, tier: 2, crates: false });
  c.house(cx - 3, cy + 3, 6, 5, { chests: 1, tier: 2 });
  for (const g of gates) for (const dy of [-2, 2]) { c.set(g - 1, cy + dy, T.ROCK); c.set(g + 3, cy + dy, T.ROCK); }
}

// Un río de norte a sur con un puente de madera, dos gallineros y un charco al final.
function puente(c, cx, cy) {
  const { T } = c;
  c.land(cx, cy - 4, 11, 22);
  const top = cy - 22, bot = cy + 14;
  for (let y = top; y <= bot; y++) {
    for (let dx = -3; dx <= 3; dx++) {
      const x = cx + dx;
      if (Math.abs(dx) <= 2) c.set(x, y, T.DEEP);
      else if (c.get(x, y) >= T.SAND) c.set(x, y, T.SHALLOW);
    }
  }
  c.ellipse(cx, bot, 5, 4, (x, y, d) => { if (d <= 0.7) c.set(x, y, T.DEEP); else if (c.get(x, y) >= T.SAND) c.set(x, y, T.SHALLOW); });
  c.fill(cx - 4, cy - 1, 9, 3, T.PLANK);
  c.house(cx - 11, cy - 7, 5, 4, { chests: 1, tier: 1 });
  c.house(cx + 7, cy + 4, 5, 4, { chests: 1, tier: 1 });
  for (const [dx, dy] of [[-11, -2], [-10, -2], [-9, -2], [7, 9], [8, 9], [9, 9]]) c.set(cx + dx, cy + dy, T.CRATE);
  for (const [dx, dy] of [[-8, 5], [9, -6], [-6, -12], [8, 10], [-8, 12]]) if (c.get(cx + dx, cy + dy) >= T.SAND) c.set(cx + dx, cy + dy, T.TREE);
  c.chest(cx, cy, 2);
}

// Una cancha de fútbol: pasto cortado, líneas, áreas, arcos con red y dos vestuarios.
function cover(c, cx, cy, k) {
  const { T } = c, K = scale(k);
  const w = K(20), h = K(12);
  const x0 = cx - (w >> 1), y0 = cy - (h >> 1);
  c.land(cx, cy - 1, w / 2 + 5, h / 2 + 7);
  c.fill(x0 - 2, y0 - 2, w + 4, h + 4, T.GRASS);
  c.fill(x0, y0, w, h, T.FIELD);
  for (let x = x0; x < x0 + w; x++) { c.set(x, y0, T.LINE); c.set(x, y0 + h - 1, T.LINE); }
  for (let y = y0; y < y0 + h; y++) { c.set(x0, y, T.LINE); c.set(x0 + w - 1, y, T.LINE); c.set(cx, y, T.LINE); }
  const R = Math.max(2, K(3));
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; c.set(cx + Math.round(Math.cos(a) * R), cy + Math.round(Math.sin(a) * R), T.LINE); }
  const bw = K(4), bh = K(6), by = cy - (bh >> 1);
  for (let i = 0; i < bw; i++) { c.set(x0 + i, by, T.LINE); c.set(x0 + i, by + bh - 1, T.LINE); c.set(x0 + w - 1 - i, by, T.LINE); c.set(x0 + w - 1 - i, by + bh - 1, T.LINE); }
  for (let y = by; y < by + bh; y++) { c.set(x0 + bw - 1, y, T.LINE); c.set(x0 + w - bw, y, T.LINE); }
  const gh = K(4), gy = cy - (gh >> 1);
  for (let y = gy; y < gy + gh; y++) { c.set(x0 - 1, y, T.NET); c.set(x0 + w, y, T.NET); }
  c.house(x0, y0 - 6, 6, 4, { chests: 1, tier: 2, crates: false });
  if (k >= 1) c.house(x0 + w - 6, y0 - 6, 6, 4, { chests: 1, tier: 2, crates: false });
  c.fill(x0 + 2, y0 + h + 2, Math.max(4, w - 4), 2, T.PLANK);
  c.chest(x0 - 4, cy, 1);
}

// Dos anillos de árboles entrelazados («alianza») con una cabaña en el cruce.
function arboleada(c, cx, cy, k) {
  const { T } = c, K = scale(k);
  const R = K(10);
  c.land(cx, cy, R + 3, R + 3);
  c.ellipse(cx, cy, R + 1, R + 1, (x, y) => c.set(x, y, T.FOREST));
  const ra = R * 0.62, off = R * 0.35;
  const centers = [cx - off, cx + off];
  for (let y = cy - R - 1; y <= cy + R + 1; y++) {
    for (let x = cx - R - 2; x <= cx + R + 2; x++) {
      for (const ax of centers) {
        const d = Math.hypot(x - ax, y - cy);
        if (d <= ra - 0.8) c.set(x, y, T.GRASS);
      }
    }
  }
  for (let y = cy - R - 1; y <= cy + R + 1; y++) {
    for (let x = cx - R - 2; x <= cx + R + 2; x++) {
      for (const ax of centers) {
        const d = Math.hypot(x - ax, y - cy);
        if (Math.abs(d - ra) >= 0.8) continue;
        const ang = Math.atan2(y - cy, x - ax) + Math.PI;
        if ((ang % (Math.PI / 2)) < 0.4) continue;
        c.set(x, y, T.TREE);
      }
    }
  }
  for (let n = 0; n < K(14); n++) {
    const x = cx + Math.round((c.rng() * 2 - 1) * R), y = cy + Math.round((c.rng() * 2 - 1) * R);
    if (Math.hypot(x - cx, y - cy) > R - 1 && c.get(x, y) === T.FOREST && c.rng() < 0.6) c.set(x, y, T.TREE);
  }
  c.house(cx - 2, cy - 2, 5, 5, { chests: 2, tier: 2, crates: false });
  c.chest(cx - Math.round(ra + off) + 1, cy, 2);
  c.chest(cx + Math.round(ra + off) - 1, cy, 2);
}

// Una chacra: surcos de judías (porotos verdes), un granero con paja y un espantapájaros.
function judia(c, cx, cy) {
  const { T } = c;
  const x0 = cx - 10, y0 = cy - 7;
  c.land(cx, cy, 13, 10);
  c.fill(x0, y0, 20, 14, T.GRASS);
  for (let y = y0; y < y0 + 14; y++) if ((y - y0) % 2 === 0) c.fill(x0, y, 11, 1, T.CROP);
  c.house(x0 + 12, cy - 3, 8, 6, { chests: 3, tier: 1 });
  for (const [dx, dy] of [[11, -5], [11, 6], [13, 6], [18, -5]]) c.set(x0 + dx, cy + dy, T.CRATE);
  c.set(x0 + 5, cy, T.ROCK);
  c.chest(x0 + 5, y0 + 1, 1);
}

// Un pueblito: plaza de arena con fuente y seis casas alrededor.
function villa(c, cx, cy, k) {
  const { T } = c;
  c.land(cx, cy, k >= 1 ? 16 : 10, k >= 1 ? 13 : 9);
  if (k >= 1) {
    c.fill(cx - 6, cy - 3, 13, 7, T.SAND);
    c.fill(cx - 1, cy - 1, 2, 2, T.SHALLOW);
    c.house(cx - 12, cy - 10, 7, 6, { chests: 2, tier: 2 });
    c.house(cx - 3, cy - 10, 6, 6, { chests: 2, tier: 2 });
    c.house(cx + 5, cy - 10, 7, 6, { chests: 2, tier: 2 });
    c.house(cx - 12, cy + 5, 6, 6, { chests: 2, tier: 2 });
    c.house(cx - 3, cy + 5, 7, 6, { chests: 2, tier: 2 });
    c.house(cx + 5, cy + 5, 7, 6, { chests: 2, tier: 2 });
  } else {
    c.fill(cx - 4, cy - 2, 9, 5, T.SAND);
    c.house(cx - 9, cy - 8, 6, 5, { chests: 2, tier: 2 });
    c.house(cx + 3, cy - 8, 6, 5, { chests: 2, tier: 2 });
    c.house(cx - 3, cy + 4, 6, 5, { chests: 2, tier: 2 });
  }
}

// Un cerro de piedras con tres entradas y el mejor cofre de la isla al medio.
function penasco(c, cx, cy) {
  const { T } = c;
  c.land(cx, cy, 8, 8);
  c.ellipse(cx, cy, 6, 6, (x, y, d) => {
    if (d <= 0.4) { c.set(x, y, T.GRASS); return; }
    const ang = Math.atan2(y - cy, x - cx) + Math.PI;
    if ((ang % (Math.PI * 2 / 3)) < 0.5) { c.set(x, y, T.GRASS); return; }
    if (c.rng() < 0.8) c.set(x, y, T.ROCK);
  });
  c.chest(cx, cy, 3);
}
