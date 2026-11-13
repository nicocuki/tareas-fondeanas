// Royale 3D: la isla. Todo sale de la semilla de la partida, sin `Math.random()`: todas las pantallas arman
// el mismo terreno, los mismos lugares, árboles y cofres, y la misma tormenta sin mandarse nada por la red.
// Unidades: metros. El agua está en y = 0.
//
// El mundo guarda los **sólidos** (cajas, cilindros y rampas) en una grilla de celdas para consultarlos
// rápido. Cada uno tiene `hp` (los árboles, cajas y lo construido se rompen) y se esconde al romperse.

export const ISLAND_R = 165;     // el terreno se hunde en el mar desde acá
export const WORLD_R = 205;      // más lejos no se puede ir
export const LOBBY_R = 26;       // la isla de espera
export const WADE_MIN = -0.9;    // se camina por la orilla hasta esta profundidad; más hondo es mar abierto
export const CELL = 8;           // lado de las celdas de la grilla de sólidos
export const STEP_H = 0.6;       // lo más alto que se sube de un paso

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (t) => t * t * (3 - 2 * t);

// Número al azar de a uno (mulberry32), parejo en todos los navegadores.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruido de valores: una grilla de números al azar con interpolación suave (solo sumas y productos).
function lattice(seed, ix, iz) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function noise(seed, x, z) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = lattice(seed, ix, iz), b = lattice(seed, ix + 1, iz), c = lattice(seed, ix, iz + 1), d = lattice(seed, ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}

// Altura del terreno sin lugares: colinas suaves en el medio y playa que se hunde hacia el borde.
function baseHeight(seed, kind, x, z) {
  const r = Math.sqrt(x * x + z * z);
  if (kind === 'lobby') {
    const e = clamp((LOBBY_R - 3 - r) / 5, 0, 1);
    return smooth(e) * 2.2 - (1 - smooth(e)) * 3;
  }
  const edge = clamp((ISLAND_R - r) / 32, 0, 1);
  const hills = noise(seed, x / 38, z / 38) * 10 + noise(seed + 101, x / 12, z / 12) * 3 - 3;
  const land = 2.2 + Math.max(0, hills) * edge;
  return smooth(edge) * land - (1 - smooth(edge)) * 3.2;
}

// ─── Sólidos ─────────────────────────────────────────────────────────────────
// Cada sólido: { id, k: 'box' | 'cyl' | 'ramp', mat, hp, maxHp, dead, bx0..bz1 (límites en planta), y0, y1, … }
//   box:  x0 x1 z0 z1 (y0 y1 abajo y arriba)
//   cyl:  cx cz r
//   ramp: x0 x1 z0 z1 y0 (base), rise, dir (0 = sube hacia +x, 1 = +z, 2 = -x, 3 = -z); y1 = y0 + rise
const key = (ix, iz) => (ix + 512) * 2048 + (iz + 512);

export function makeWorld(seed, kind = 'island') {
  const lobby = kind === 'lobby';
  const R = lobby ? LOBBY_R : ISLAND_R;
  const w = {
    seed, kind, R, worldR: lobby ? LOBBY_R + 14 : WORLD_R,
    solids: [], byId: new Map(), cells: new Map(), flats: [], places: [], roads: [], streets: [], chests: [], props: [], trees: [],
    nextId: 1, stamp: 0, onBreak: null,
  };

  w.height = (x, z) => {
    let h = baseHeight(seed, kind, x, z);
    for (const f of w.flats) {
      let d;
      if (f.rect) d = Math.hypot(Math.max(0, Math.abs(x - f.x) - f.w), Math.max(0, Math.abs(z - f.z) - f.d));
      else d = Math.max(0, Math.hypot(x - f.x, z - f.z) - f.r);
      if (d >= f.blend) continue;
      h += (f.y - h) * smooth(1 - d / f.blend);
    }
    return h;
  };

  const insert = (s) => {
    s.id = s.id ?? w.nextId++;
    s.dead = false;
    s.maxHp = s.hp;
    if (s.k === 'cyl') { s.bx0 = s.cx - s.r; s.bx1 = s.cx + s.r; s.bz0 = s.cz - s.r; s.bz1 = s.cz + s.r; } else { s.bx0 = s.x0; s.bx1 = s.x1; s.bz0 = s.z0; s.bz1 = s.z1; }
    if (s.k === 'ramp') s.y1 = s.y0 + s.rise;
    for (let ix = Math.floor(s.bx0 / CELL); ix <= Math.floor(s.bx1 / CELL); ix++) {
      for (let iz = Math.floor(s.bz0 / CELL); iz <= Math.floor(s.bz1 / CELL); iz++) {
        const k = key(ix, iz);
        let list = w.cells.get(k);
        if (!list) w.cells.set(k, (list = []));
        list.push(s);
      }
    }
    w.solids.push(s);
    w.byId.set(s.id, s);
    return s;
  };
  w.insert = insert;
  w.addBox = (x0, x1, z0, z1, y0, y1, o = {}) => insert({ k: 'box', x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y0, y1, mat: 'wood', hp: 0, ...o });
  w.addCyl = (cx, cz, r, y0, y1, o = {}) => insert({ k: 'cyl', cx, cz, r, y0, y1, mat: 'rock', hp: 0, ...o });
  w.addRamp = (x0, x1, z0, z1, y0, rise, dir, o = {}) => insert({ k: 'ramp', x0, x1, z0, z1, y0, rise, dir, mat: 'build', hp: 120, ...o });

  // Los sólidos vivos que tocan el rectángulo (en planta). `out` se reusa si se pasa.
  w.near = (x0, z0, x1, z1, out = []) => {
    out.length = 0;
    const q = ++w.stamp;
    for (let ix = Math.floor(x0 / CELL); ix <= Math.floor(x1 / CELL); ix++) {
      for (let iz = Math.floor(z0 / CELL); iz <= Math.floor(z1 / CELL); iz++) {
        const list = w.cells.get(key(ix, iz));
        if (!list) continue;
        for (const s of list) if (!s.dead && s.q !== q && s.bx1 >= x0 && s.bx0 <= x1 && s.bz1 >= z0 && s.bz0 <= z1) { s.q = q; out.push(s); }
      }
    }
    return out;
  };

  // Daño a un sólido. Devuelve null si no se rompe (o ya estaba roto) o `{ s, broken }`.
  w.damage = (id, dmg) => {
    const s = w.byId.get(id);
    if (!s || s.dead || !(s.hp > 0)) return null;
    s.hp -= dmg;
    if (s.hp > 0) return { s, broken: false };
    s.dead = true;
    for (let ix = Math.floor(s.bx0 / CELL); ix <= Math.floor(s.bx1 / CELL); ix++) {
      for (let iz = Math.floor(s.bz0 / CELL); iz <= Math.floor(s.bz1 / CELL); iz++) {
        const list = w.cells.get(key(ix, iz));
        const at = list ? list.indexOf(s) : -1;
        if (at >= 0) list.splice(at, 1);
      }
    }
    w.onBreak?.(s);
    return { s, broken: true };
  };
  w.remove = (id) => { const s = w.byId.get(id); if (s && !s.dead) w.damage(id, s.hp || 1e9); };

  if (lobby) { stampLobby(w); return w; }
  stampIsland(w);
  return w;
}

// ─── La isla de espera ───────────────────────────────────────────────────────
// Una islita redonda para caminar y probar la pistola mientras llegan todos: cajas de cobertura, palmeras y rocas.
function stampLobby(w) {
  const rand = rng(w.seed ^ 0x6c0b);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3, r = 10 + rand() * 6;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    w.addBox(x - 0.8, x + 0.8, z - 0.8, z + 0.8, w.height(x, z), w.height(x, z) + 1.6, { mat: 'crate', hp: 0 });
    w.props.push({ k: 'crateface', x, z });
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.9, r = 17 + rand() * 4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    w.addCyl(x, z, 0.4, w.height(x, z), w.height(x, z) + 6, { mat: 'palm', hp: 0 });
    w.trees.push({ x, z, y: w.height(x, z), h: 6, k: rand(), palm: true, id: w.solids[w.solids.length - 1].id });
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.2, x = Math.cos(a) * 4, z = Math.sin(a) * 4;
    w.addCyl(x, z, 1.3, w.height(x, z) - 0.3, w.height(x, z) + 1.5, { mat: 'rock', hp: 0 });
    w.props.push({ k: 'rock', x, z, r: 1.3, h: 1.8, y: w.height(x, z) - 0.3, rot: rand() * 6 });
  }
  w.props.push({ k: 'sign', x: 0, z: 0 });
}

// Dónde aparece el jugador número `index` de `size` en la isla de espera: repartidos en un anillo, mirando al centro.
export function spawnPoint(seed, index, size, world) {
  const a = (index / Math.max(1, size)) * Math.PI * 2 + 0.4;
  for (let r = 13; r > 4; r -= 1) {
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (world.height(x, z) > 1 && world.solids.every((s) => (s.k === 'cyl' ? (s.cx - x) ** 2 + (s.cz - z) ** 2 > (s.r + 1.4) ** 2 : x < s.x0 - 1.4 || x > s.x1 + 1.4 || z < s.z0 - 1.4 || z > s.z1 + 1.4))) return { x, z, yaw: Math.atan2(x, z) };
  }
  return { x: 0, z: 6, yaw: 0 };
}

// ─── Los lugares con nombre ──────────────────────────────────────────────────
const dirVec = (d) => (d === 'n' ? [0, -1] : d === 's' ? [0, 1] : d === 'e' ? [1, 0] : [-1, 0]);

// Una casa con interior: piso, cuatro paredes con una puerta, techo y, adentro, cofres y cajas.
// `door` es el lado de la puerta ('n', 's', 'e', 'o'). Todo se rompe menos el piso.
function house(w, rand, x, z, ww, dd, door, o = {}) {
  const y = w.height(x, z) + 0.05;
  const t = 0.4, h = o.h || 3.2, mat = o.mat || 'wood', gap = 1.9;
  const x0 = x - ww / 2, x1 = x + ww / 2, z0 = z - dd / 2, z1 = z + dd / 2;
  w.addBox(x0, x1, z0, z1, y - 1.2, y + 0.15, { mat: 'floor', hp: 0, kind: 'floor' });
  const hp = o.hp ?? 220;
  const wall = (ax0, ax1, az0, az1, side) => {
    if (side !== door) { w.addBox(ax0, ax1, az0, az1, y - 1.2, y + h, { mat, hp, wall: true }); return; }
    const horiz = side === 'n' || side === 's';
    const mid = horiz ? (ax0 + ax1) / 2 : (az0 + az1) / 2;
    if (horiz) {
      w.addBox(ax0, mid - gap / 2, az0, az1, y - 1.2, y + h, { mat, hp, wall: true });
      w.addBox(mid + gap / 2, ax1, az0, az1, y - 1.2, y + h, { mat, hp, wall: true });
      w.addBox(mid - gap / 2, mid + gap / 2, az0, az1, y + 2.4, y + h, { mat, hp, wall: true });
    } else {
      w.addBox(ax0, ax1, az0, mid - gap / 2, y - 1.2, y + h, { mat, hp, wall: true });
      w.addBox(ax0, ax1, mid + gap / 2, az1, y - 1.2, y + h, { mat, hp, wall: true });
      w.addBox(ax0, ax1, mid - gap / 2, mid + gap / 2, y + 2.4, y + h, { mat, hp, wall: true });
    }
  };
  wall(x0, x1, z0, z0 + t, 'n'); wall(x0, x1, z1 - t, z1, 's'); wall(x1 - t, x1, z0 + t, z1 - t, 'e'); wall(x0, x0 + t, z0 + t, z1 - t, 'o');
  w.addBox(x0 - 0.5, x1 + 0.5, z0 - 0.5, z1 + 0.5, y + h, y + h + 0.3, { mat: o.roofMat || mat, hp: 0, roof: true, gable: o.flat ? 0 : 1, ww: ww + 1, dd: dd + 1, rc: o.rc });
  w.props.push({ k: 'door', x, z, y, door, w: ww, d: dd });
  const [dx, dz] = dirVec(door === 'o' ? 'w' : door);
  const chests = o.chests ?? 0;
  for (let i = 0; i < chests; i++) {
    const cx = x - dx * (ww / 2 - 1.1) + (i - (chests - 1) / 2) * 1.8 * Math.abs(dz), cz = z - dz * (dd / 2 - 1.1) + (i - (chests - 1) / 2) * 1.8 * Math.abs(dx);
    chest(w, cx, cz, o.tier || 1, y + 0.15);
  }
  if (o.crates !== false) {
    const n = 1 + Math.floor(rand() * 2);
    for (let i = 0; i < n; i++) {
      const cx = x + (dz ? (rand() < 0.5 ? -1 : 1) * (ww / 2 - 1.1) : (dx ? -dx : 1) * (ww / 2 - 1.1));
      const cz = z + (dx ? (rand() < 0.5 ? -1 : 1) * (dd / 2 - 1.1) : (dz ? -dz : 1) * (dd / 2 - 1.1));
      crate(w, cx, cz, y + 0.15);
    }
  }
  return { x0, x1, z0, z1, y };
}

function crate(w, x, z, y = w.height(x, z)) {
  w.addBox(x - 0.6, x + 0.6, z - 0.6, z + 0.6, y, y + 1.2, { mat: 'crate', hp: 60 });
}

function chest(w, x, z, tier, y = w.height(x, z)) {
  const c = { i: w.chests.length, x, z, y, tier };
  w.chests.push(c);
  // Un bulto bajo que se pisa y no estorba (se ve el cofre arriba).
  return c;
}

function tree(w, rand, x, z, o = {}) {
  const y = w.height(x, z);
  if (y < 0.7) return null;
  const h = 5 + rand() * 3.5;
  const s = w.addCyl(x, z, 0.5, y - 0.2, y + h, { mat: 'tree', hp: 90 });
  w.trees.push({ x, z, y, h, k: rand(), id: s.id, kind: o.kind || (rand() < 0.35 ? 'round' : 'pine') });
  return s;
}

function rock(w, rand, x, z, r, h) {
  const y = w.height(x, z) - 0.4;
  w.addCyl(x, z, r, y, y + h, { mat: 'rock', hp: 0 });
  w.props.push({ k: 'rock', x, z, r, h, y, rot: rand() * 6 });
}

function sandbag(w, x, z, ww, dd) {
  const y = w.height(x, z);
  w.addBox(x - ww / 2, x + ww / 2, z - dd / 2, z + dd / 2, y - 0.2, y + 1.0, { mat: 'sand', hp: 120 });
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
// Distancia de (x, z) a un tramo de camino { x0, z0, x1, z1 }.
export function segDist(x, z, r) {
  const dx = r.x1 - r.x0, dz = r.z1 - r.z0, L = dx * dx + dz * dz || 1;
  const t = clamp(((x - r.x0) * dx + (z - r.z0) * dz) / L, 0, 1);
  return Math.hypot(x - (r.x0 + dx * t), z - (r.z0 + dz * t));
}

// Cada lugar: radio plano `r`, y qué pone. `ring` = en qué anillo de la isla puede caer (fracción de ISLAND_R).
const PLACES = [
  { id: 'ciudad', name: 'Ciudad Cuki', r: 40, ring: [0.0, 0.22], stamp: ciudad },
  { id: 'barrio', name: 'Barrio Bichito', r: 30, ring: [0.3, 0.68], stamp: barrio },
  { id: 'pueblo', name: 'Pueblo Polenta', r: 27, ring: [0.3, 0.68], stamp: pueblo },
  { id: 'fabrica', name: 'Fábrica Fernet', r: 22, ring: [0.3, 0.7], stamp: fabrica },
  { id: 'villa', name: 'Villa Vermut', r: 24, ring: [0.3, 0.66], stamp: villa },
  { id: 'frontera', name: 'Frontera del Fondo', r: 25, ring: [0.25, 0.72], stamp: frontera },
  { id: 'cover', name: 'Cover', r: 20, ring: [0.25, 0.72], stamp: cover },
  { id: 'judia', name: 'Juvenil Judía', r: 20, ring: [0.25, 0.74], stamp: judia },
  { id: 'puente', name: 'Puente Pollín', r: 28, flat: 19, ring: [0.25, 0.7], stamp: puente },
  { id: 'arboleada', name: 'Arboleada Alianza', r: 15, ring: [0.25, 0.74], stamp: arboleada },
  { id: 'polvorin', name: 'Pibes Polvorín Polvoriento', r: 13, ring: [0.45, 0.76], stamp: polvorin },
  { id: 'estacion', name: 'Estación Escabio', r: 12, ring: [0.3, 0.72], stamp: estacion },
  { id: 'penasco', name: 'Peñasco Pelado', r: 11, ring: [0.3, 0.7], stamp: penasco, lift: 5 },
  { id: 'muelle', name: 'Muelle Mojito', r: 9, ring: [0.8, 0.8], stamp: muelle, coast: true },
];

function stampIsland(w) {
  const seed = w.seed, rand = rng(seed ^ 0x51ed);
  const placed = [];
  // 1) Elegir dónde va cada lugar (sin que se pisen) y aplanar el terreno ahí.
  for (const def of PLACES) {
    let spot = null;
    for (let tries = 0; tries < 400 && !spot; tries++) {
      const ang = rand() * Math.PI * 2;
      const rr = (def.ring[0] + (def.ring[1] - def.ring[0]) * rand()) * ISLAND_R;
      const x = Math.cos(ang) * rr, z = Math.sin(ang) * rr;
      const y = baseHeight(seed, 'island', x, z);
      if (!def.coast && y < 1.5) continue;
      if (placed.some((p) => dist(p, { x, z }) < p.r + def.r + 8)) continue;
      spot = { x, z, y, r: def.r, def };
    }
    if (!spot) { // sin lugar: se pone donde entre (menos cuidado), mejor eso que perderlo
      const ang = rand() * Math.PI * 2, rr = (def.ring[0] + def.ring[1]) / 2 * ISLAND_R;
      spot = { x: Math.cos(ang) * rr, z: Math.sin(ang) * rr, y: 2.2, r: def.r, def };
    }
    const y = def.coast ? 1.2 : Math.max(2.2, spot.y) + (def.lift || 0);
    spot.y = y;
    placed.push(spot);
    w.flats.push({ x: spot.x, z: spot.z, r: def.flat ?? def.r, blend: def.lift ? 16 : 9, y });
    w.places.push({ id: def.id, name: def.name, x: spot.x, z: spot.z, r: def.r, y });
  }
  // El río del Puente Pollín: una franja baja que corta el plano (se agrega después para que gane sobre el plano).
  const pu = placed.find((p) => p.def.id === 'puente');
  if (pu) w.flats.push({ rect: true, x: pu.x, z: pu.z, w: 4, d: 24, blend: 5, y: -2.6 });

  // Caminos de tierra: de la ciudad a cada lugar (solo color del terreno, se camina igual).
  const hub = placed.find((p) => p.def.id === 'ciudad') || placed[0];
  for (const p of placed) if (p !== hub) w.roads.push({ x0: hub.x, z0: hub.z, x1: p.x, z1: p.z, w: 2.6 });

  // 2) Estampar cada lugar.
  for (const spot of placed) spot.def.stamp(w, rand, spot.x, spot.z, spot.y);

  // 3) Árboles, rocas y cajas sueltos: el bosque esquiva los lugares.
  const onRoad = (x, z) => w.roads.some((r) => segDist(x, z, r) < r.w + 1.5);
  const free = (x, z, r = 0) => !onRoad(x, z) && placed.every((p) => dist(p, { x, z }) > p.r + 2 + r) && w.solids.every((s) => !(s.k === 'cyl' && (s.cx - x) ** 2 + (s.cz - z) ** 2 < (s.r + r + 0.8) ** 2));
  let n = 0;
  for (let tries = 0; n < 520 && tries < 5000; tries++) {
    const x = (rand() * 2 - 1) * (ISLAND_R - 12), z = (rand() * 2 - 1) * (ISLAND_R - 12);
    if (x * x + z * z > (ISLAND_R - 14) ** 2) continue;
    const dens = noise(seed + 7, x / 24, z / 24); // manchas de bosque
    if (rand() > 0.15 + dens * 0.95) continue;
    if (!free(x, z, 1)) continue;
    if (tree(w, rand, x, z)) n++;
  }
  n = 0;
  for (let tries = 0; n < 80 && tries < 900; tries++) {
    const x = (rand() * 2 - 1) * (ISLAND_R - 14), z = (rand() * 2 - 1) * (ISLAND_R - 14);
    if (!free(x, z, 2) || w.height(x, z) < 0.9) continue;
    rock(w, rand, x, z, 1 + rand() * 1.4, 1.5 + rand() * 2);
    n++;
  }
  n = 0;
  for (let tries = 0; n < 40 && tries < 800; tries++) { // cofres sueltos por el campo
    const x = (rand() * 2 - 1) * (ISLAND_R - 18), z = (rand() * 2 - 1) * (ISLAND_R - 18);
    if (!free(x, z, 1.5) || w.height(x, z) < 1.2) continue;
    chest(w, x, z, rand() < 0.2 ? 2 : 1);
    n++;
  }
  for (let tries = 0, k = 0; k < 60 && tries < 1000; tries++) { // cajas de madera sueltas (dan madera)
    const x = (rand() * 2 - 1) * (ISLAND_R - 14), z = (rand() * 2 - 1) * (ISLAND_R - 14);
    if (!free(x, z, 1.5) || w.height(x, z) < 1) continue;
    crate(w, x, z);
    k++;
  }
  // Decorado que no choca: arbustos y flores.
  for (let i = 0, tries = 0; i < 620 && tries < 3600; tries++) {
    const x = (rand() * 2 - 1) * (ISLAND_R - 10), z = (rand() * 2 - 1) * (ISLAND_R - 10);
    const y = w.height(x, z);
    if (y < 1.1 || !free(x, z, -1)) continue;
    w.props.push({ k: rand() < 0.75 ? 'bush' : 'flowers', x, z, y, s: 0.6 + rand() * 0.8, c: rand() });
    i++;
  }
}

// Villa Vermut: un pueblito de casas alrededor de una plaza con un pozo.
function villa(w, rand, cx, cz) {
  const slots = [[-14, -11], [0, -12], [14, -11], [-14, 11], [0, 12], [14, 11]];
  slots.forEach(([dx, dz], i) => {
    const ww = 8 + Math.floor(rand() * 3), dd = 7 + Math.floor(rand() * 3);
    house(w, rand, cx + dx, cz + dz, ww, dd, dz < 0 ? 's' : 'n', { chests: i % 2 === 0 ? 1 : 0, tier: 2 });
  });
  w.addCyl(cx, cz, 1.2, w.height(cx, cz), w.height(cx, cz) + 1.1, { mat: 'stone', hp: 0 });
  w.props.push({ k: 'well', x: cx, z: cz, y: w.height(cx, cz) });
  chest(w, cx + 4, cz, 2);
  for (let i = 0; i < 5; i++) { const a = rand() * 6.28; crate(w, cx + Math.cos(a) * 7, cz + Math.sin(a) * 6); }
}

// Una playa con un búnker, pilas de cajas y sacos de arena.
function polvorin(w, rand, cx, cz, y) {
  house(w, rand, cx, cz, 10, 7, 's', { chests: 3, tier: 3, mat: 'stone', hp: 400, crates: false });
  for (let i = 0; i < 7; i++) {
    const a = rand() * 6.28, r = 7 + rand() * 4;
    const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
    if (Math.abs(x - cx) < 6.5 && Math.abs(z - cz) < 5) continue;
    crate(w, x, z, y);
    if (rand() < 0.5) crate(w, x + 1.3, z, y);
  }
  for (let i = -3; i <= 3; i++) { sandbag(w, cx + i * 2.2, cz + 9, 2, 0.9); if (i % 2 === 0) sandbag(w, cx + i * 2.2, cz - 9, 2, 0.9); }
  chest(w, cx - 9, cz + 3, 2);
}

// Peñasco Pelado: una loma pelada con rocas grandes y un santuario de piedra en la cima.
function penasco(w, rand, cx, cz, y) {
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, x = cx + Math.cos(a) * 8.5, z = cz + Math.sin(a) * 8.5;
    rock(w, rand, x, z, 1.6 + rand() * 1.2, 2.6 + rand() * 2);
  }
  house(w, rand, cx, cz, 7, 6, 's', { chests: 2, tier: 3, mat: 'stone', hp: 400, crates: false, flat: true });
}

// Cover: la cancha de fútbol, con sus dos arcos y unas tribunas.
function cover(w, rand, cx, cz, y) {
  w.props.push({ k: 'field', x: cx, z: cz, y: y + 0.03, w: 30, d: 18 });
  for (const sx of [-1, 1]) {
    const gx = cx + sx * 15;
    w.addBox(gx - 0.2, gx + 0.2, cz - 3.4, cz - 3, y, y + 2.4, { mat: 'metal', hp: 0 });
    w.addBox(gx - 0.2, gx + 0.2, cz + 3, cz + 3.4, y, y + 2.4, { mat: 'metal', hp: 0 });
    w.addBox(gx - 0.2, gx + 0.2, cz - 3.4, cz + 3.4, y + 2.4, y + 2.7, { mat: 'metal', hp: 0 });
    w.props.push({ k: 'goal', x: gx, z: cz, y, dir: sx });
  }
  for (let i = -1; i <= 1; i++) w.addBox(cx + i * 7 - 2.5, cx + i * 7 + 2.5, cz + 11.2, cz + 12, y, y + 0.8, { mat: 'wood', hp: 90 });
  chest(w, cx - 12, cz + 11, 1); chest(w, cx + 12, cz - 11, 1);
}

// Arboleada Alianza: dos anillos de árboles con un cofre grande en el medio.
function arboleada(w, rand, cx, cz) {
  for (const [r, n] of [[7, 16], [12.5, 26]]) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      if (r < 10 && (i === 0 || i === 8)) continue; // un paso
      if (r > 10 && (i === 4 || i === 17)) continue;
      tree(w, rand, cx + Math.cos(a) * r, cz + Math.sin(a) * r, { kind: 'round' });
    }
  }
  chest(w, cx, cz, 3);
  for (let i = 0; i < 4; i++) crate(w, cx + Math.cos(i * 1.57 + 0.7) * 3.2, cz + Math.sin(i * 1.57 + 0.7) * 3.2);
}

// Juvenil Judía: la chacra, con su galpón, filas de cultivo y fardos de heno.
function judia(w, rand, cx, cz, y) {
  house(w, rand, cx - 5, cz - 4, 13, 9, 's', { chests: 2, tier: 2, crates: false });
  for (let r = 0; r < 4; r++) w.props.push({ k: 'crops', x: cx + 2, z: cz + 4 + r * 3, y: y + 0.02, w: 16 });
  for (let i = 0; i < 6; i++) crate(w, cx - 12 + (i % 3) * 1.4, cz + 6 + Math.floor(i / 3) * 1.4);
  chest(w, cx + 10, cz + 1, 1);
  sandbag(w, cx - 12, cz + 3, 0.6, 5);
}

// Frontera del Fondo: un muro largo con portones y dos torres.
function frontera(w, rand, cx, cz, y) {
  const len = 40, gates = [-8, 11];
  for (const [a, b] of [[-len / 2, gates[0] - 2.5], [gates[0] + 2.5, gates[1] - 2.5], [gates[1] + 2.5, len / 2]]) {
    w.addBox(cx + a, cx + b, cz - 0.6, cz + 0.6, y - 1, y + 3.4, { mat: 'stone', hp: 500 });
  }
  for (const g of gates) { w.addBox(cx + g - 2.5, cx + g + 2.5, cz - 0.6, cz + 0.6, y + 2.8, y + 3.4, { mat: 'stone', hp: 500 }); }
  house(w, rand, cx - len / 2 - 1, cz + 5, 6, 6, 's', { chests: 1, tier: 2, mat: 'stone', hp: 400 });
  house(w, rand, cx + len / 2 + 1, cz + 5, 6, 6, 's', { chests: 1, tier: 2, mat: 'stone', hp: 400 });
  for (let i = 0; i < 4; i++) sandbag(w, cx - 14 + i * 2.5, cz - 4, 2, 0.9);
  chest(w, cx + 2, cz + 5, 2);
}

// Puente Pollín: un río que corta el terreno de punta a punta, con un puente de madera para cruzarlo.
function puente(w, rand, cx, cz) {
  const y = w.flats.find((f) => !f.rect && f.x === cx && f.z === cz)?.y ?? 2.2;
  w.addBox(cx - 9.5, cx + 9.5, cz - 3.5, cz + 3.5, y - 0.4, y + 0.15, { mat: 'floor', hp: 0 });
  w.addBox(cx - 9.5, cx + 9.5, cz - 3.8, cz - 3.5, y + 0.15, y + 1.1, { mat: 'wood', hp: 0 });
  w.addBox(cx - 9.5, cx + 9.5, cz + 3.5, cz + 3.8, y + 0.15, y + 1.1, { mat: 'wood', hp: 0 });
  w.props.push({ k: 'bridge', x: cx, z: cz, y, w: 19, d: 7 });
  house(w, rand, cx - 15, cz - 9, 6, 6, 's', { chests: 1, tier: 2 });
  house(w, rand, cx + 15, cz + 9, 6, 6, 'n', { chests: 1, tier: 1 });
  crate(w, cx - 12, cz + 8); crate(w, cx + 12, cz - 8);
  chest(w, cx + 13, cz - 3, 1);
}

// Muelle Mojito: un muelle de madera que se mete en el mar, con una plataforma al final y cabañas en la costa.
function muelle(w, rand, cx, cz, y) {
  // El muelle sale hacia afuera de la isla, sobre el eje más cercano.
  const horiz = Math.abs(cx) > Math.abs(cz);
  const sx = horiz ? Math.sign(cx) || 1 : 0, sz = horiz ? 0 : Math.sign(cz) || 1;
  const len = 30;
  const px0 = horiz ? cx : cx - 1.6, px1 = horiz ? cx + sx * len : cx + 1.6;
  const pz0 = horiz ? cz - 1.6 : cz, pz1 = horiz ? cz + 1.6 : cz + sz * len;
  w.addBox(px0, px1, pz0, pz1, y - 0.5, y + 0.2, { mat: 'floor', hp: 0 });
  const ex = horiz ? cx + sx * len : cx, ez = horiz ? cz : cz + sz * len;
  w.addBox(ex - 6, ex + 6, ez - 6, ez + 6, y - 0.5, y + 0.2, { mat: 'floor', hp: 0 });
  w.props.push({ k: 'pier', x0: Math.min(px0, px1), x1: Math.max(px0, px1), z0: Math.min(pz0, pz1), z1: Math.max(pz0, pz1), y, end: [ex, ez] });
  chest(w, ex + 2, ez + 2, 2, y + 0.2);
  chest(w, ex - 2, ez - 3, 1, y + 0.2);
  crate(w, ex + 3.5, ez - 3, y + 0.2); crate(w, ex - 4, ez + 3.5, y + 0.2);
  house(w, rand, cx - sx * 8 + (horiz ? 0 : 7), cz - sz * 8 + (horiz ? 7 : 0), 6, 6, horiz ? (sx > 0 ? 'e' : 'o') : (sz > 0 ? 's' : 'n'), { chests: 1, tier: 1 });
}

// ─── Los cofres del cielo ────────────────────────────────────────────────────
// ─── Pueblos y ciudad ────────────────────────────────────────────────────────
const WALLS = ['plaster', 'brick', 'plaster', 'wood'];
const ROOFS = [0xb6492f, 0x3f6fa8, 0x4f7f3f, 0x8a4f9e, 0x5c5f66, 0xc77b2e];
const pick = (rand, list) => list[Math.floor(rand() * list.length) % list.length];

// Una calle asfaltada (rectángulo en planta, solo dibujo: se camina igual que el piso).
function street(w, x, z, ww, dd, y) { w.streets.push({ x, z, w: ww, d: dd, y: y + 0.04 }); }

// Un auto estacionado: choca como una caja de metal y no se rompe. `rot` 0 = a lo largo de x.
function car(w, rand, x, z, rot) {
  const y = w.height(x, z), lx = rot ? 1.0 : 2.1, lz = rot ? 2.1 : 1.0;
  w.addBox(x - lx, x + lx, z - lz, z + lz, y, y + 1.5, { mat: 'metal', hp: 0, hide: true });
  w.props.push({ k: 'car', x, z, y, rot, c: Math.floor(rand() * 6) });
}

// Un edificio de dos pisos: planta baja con la puerta y un entrepiso al fondo, al que se sube por una rampa.
// La puerta solo va al norte o al sur. Arriba hay un cofre mejor.
function edificio(w, rand, x, z, ww, dd, door, o = {}) {
  const t = 0.4, h = 8;
  const b = house(w, rand, x, z, ww, dd, door, { h, flat: true, mat: o.mat || 'concrete', hp: 320, chests: 1, tier: 2, crates: false });
  const y = b.y, top = y + 4.1, mid = z;
  const back = door === 's' ? -1 : 1; // del lado del fondo
  const sz0 = back < 0 ? b.z0 + t : mid, sz1 = back < 0 ? mid : b.z1 - t;
  w.addBox(b.x0 + t, b.x1 - t, sz0, sz1, top - 0.3, top, { mat: 'floor', hp: 0, kind: 'floor' });
  const rx0 = b.x1 - t - 2.2, rx1 = b.x1 - t;
  if (back < 0) w.addRamp(rx0, rx1, mid, mid + 4.4, y + 0.15, top - y - 0.15, 3, { mat: 'wood', hp: 0 });
  else w.addRamp(rx0, rx1, mid - 4.4, mid, y + 0.15, top - y - 0.15, 1, { mat: 'wood', hp: 0 });
  chest(w, x - ww / 4, back < 0 ? b.z0 + 1.2 : b.z1 - 1.2, 3, top);
  if (rand() < 0.6) crate(w, x - ww / 4 + 2, back < 0 ? b.z0 + 1.3 : b.z1 - 1.3, top);
}

// Ciudad Cuki: una grilla de 3 × 3 manzanas con calles; edificios de dos pisos, casas y una plaza con fuente en el medio.
function ciudad(w, rand, cx, cz, y) {
  for (const k of [-12, 12]) { street(w, cx + k, cz, 7, 78, y); street(w, cx, cz + k, 78, 7, y); }
  street(w, cx, cz - 37.5, 78, 4, y); street(w, cx, cz + 37.5, 78, 4, y); street(w, cx - 37.5, cz, 4, 78, y); street(w, cx + 37.5, cz, 4, 78, y);
  // La plaza.
  w.addCyl(cx, cz, 1.6, y, y + 1.2, { mat: 'stone', hp: 0 });
  w.props.push({ k: 'fountain', x: cx, z: cz, y });
  chest(w, cx + 4.5, cz + 4.5, 3); chest(w, cx - 4.5, cz - 4.5, 2);
  for (const [dx, dz] of [[-6, 0], [6, 0], [0, -6], [0, 6]]) w.addBox(cx + dx - (dz ? 1.2 : 0.4), cx + dx + (dz ? 1.2 : 0.4), cz + dz - (dz ? 0.4 : 1.2), cz + dz + (dz ? 0.4 : 1.2), y, y + 0.6, { mat: 'wood', hp: 60 });
  for (const [dx, dz] of [[-6, -6], [6, 6], [6, -6], [-6, 6]]) tree(w, rand, cx + dx, cz + dz, { kind: 'round' });
  // Las manzanas.
  for (const bx of [-24, 0, 24]) for (const bz of [-24, 0, 24]) {
    if (!bx && !bz) continue;
    const x = cx + bx, z = cz + bz;
    const door = bz > 0 ? 'n' : bz < 0 ? 's' : (rand() < 0.5 ? 'n' : 's');
    if (rand() < 0.55) edificio(w, rand, x, z, 12 + Math.floor(rand() * 3), 12 + Math.floor(rand() * 2), door, { mat: rand() < 0.5 ? 'concrete' : 'brick' });
    else for (const sx of [-1, 1]) house(w, rand, x + sx * 4.3, z, 7.4, 8, door, { mat: pick(rand, WALLS), rc: pick(rand, ROOFS), chests: rand() < 0.6 ? 1 : 0, tier: 2 });
  }
  // Autos en las calles.
  for (let i = 0; i < 9; i++) {
    const along = (rand() * 2 - 1) * 30, lane = rand() < 0.5 ? -12 : 12, side = rand() < 0.5 ? -2 : 2;
    if (Math.abs(along) < 7 || Math.abs(Math.abs(along) - 12) < 5) continue;
    if (rand() < 0.5) car(w, rand, cx + along, cz + lane + side, 0); else car(w, rand, cx + lane + side, cz + along, 1);
  }
}

// Barrio Bichito: dos calles que se cruzan y casitas de colores con su jardín, autos y árboles.
function barrio(w, rand, cx, cz, y) {
  street(w, cx, cz, 60, 6, y); street(w, cx, cz, 6, 50, y);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const k of [9.5, 21]) {
    const x = cx + sx * k, z = cz + sz * 9.5;
    house(w, rand, x, z, 8, 7, sz > 0 ? 'n' : 's', { mat: pick(rand, WALLS), rc: pick(rand, ROOFS), chests: rand() < 0.5 ? 1 : 0, tier: rand() < 0.3 ? 2 : 1 });
    tree(w, rand, x + sx * 3, z + sz * 6.2, { kind: 'round' });
    if (rand() < 0.45) car(w, rand, x - sx * 3, cz + sz * 4.6, 0);
  }
  chest(w, cx + 4.5, cz + 4.5, 2);
}

// Pueblo Polenta: una calle principal con casitas a los dos lados y la iglesia con su campanario al fondo.
function pueblo(w, rand, cx, cz, y) {
  street(w, cx - 2, cz, 44, 6, y);
  for (const k of [-17, -6, 5]) for (const sz of [-1, 1]) {
    house(w, rand, cx + k, cz + sz * 8, 7, 6, sz > 0 ? 'n' : 's', { mat: pick(rand, ['plaster', 'brick']), rc: pick(rand, ROOFS), chests: rand() < 0.6 ? 1 : 0, tier: 1 });
  }
  house(w, rand, cx + 19, cz, 9, 10, 'o', { mat: 'stone', hp: 450, h: 5.5, chests: 2, tier: 3, crates: false });
  const yt = w.height(cx + 25, cz);
  w.addBox(cx + 23.5, cx + 26.5, cz - 1.5, cz + 1.5, yt - 1, yt + 12, { mat: 'stone', hp: 0 });
  w.props.push({ k: 'spire', x: cx + 25, z: cz, y: yt + 12 });
  w.props.push({ k: 'well', x: cx - 2, z: cz - 14.5, y: w.height(cx - 2, cz - 14.5) });
  w.addCyl(cx - 2, cz - 14.5, 1.2, w.height(cx - 2, cz - 14.5), w.height(cx - 2, cz - 14.5) + 1.1, { mat: 'stone', hp: 0 });
  car(w, rand, cx - 11, cz + 1.8, 0);
}

// Fábrica Fernet: un galpón grande, contenedores apilados y una chimenea.
function fabrica(w, rand, cx, cz, y) {
  house(w, rand, cx - 3, cz - 4, 20, 13, 's', { mat: 'metal', hp: 400, h: 6, flat: true, chests: 2, tier: 2 });
  const yc = w.height(cx + 13, cz - 9);
  w.addCyl(cx + 13, cz - 9, 1.3, yc - 0.5, yc + 16, { mat: 'stone', hp: 0 });
  w.props.push({ k: 'chimney', x: cx + 13, z: cz - 9, y: yc, h: 16 });
  for (let i = 0; i < 6; i++) {
    const x = cx - 12 + i * 3.3, z = cz + 9;
    const yy = w.height(x, z);
    w.addBox(x - 1.2, x + 1.2, z - 3, z + 3, yy - 0.3, yy + 2.6, { mat: i % 2 ? 'container' : 'containerB', hp: 300 });
    if (i % 3 === 1) w.addBox(x - 1.2, x + 1.2, z - 3, z + 3, yy + 2.6, yy + 5.2, { mat: 'container', hp: 300 });
  }
  chest(w, cx + 9, cz + 9, 3);
  for (let i = 0; i < 4; i++) crate(w, cx + 10 + (i % 2) * 1.3, cz + 2 + Math.floor(i / 2) * 1.3);
}

// Estación Escabio: la estación de servicio, con el techito sobre los surtidores y el almacén.
function estacion(w, rand, cx, cz, y) {
  street(w, cx, cz + 1, 22, 9, y);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) w.addCyl(cx + sx * 4.5, cz + 1 + sz * 3, 0.25, y, y + 4.5, { mat: 'metal', hp: 0 });
  w.addBox(cx - 5.5, cx + 5.5, cz - 2.8, cz + 4.8, y + 4.5, y + 4.9, { mat: 'metal', hp: 0, canopy: true });
  for (const sx of [-1.5, 1.5]) { w.addBox(cx + sx - 0.4, cx + sx + 0.4, cz + 0.7, cz + 1.3, y, y + 1.6, { mat: 'metal', hp: 0, hide: true }); w.props.push({ k: 'pump', x: cx + sx, z: cz + 1, y }); }
  house(w, rand, cx, cz - 8, 9, 6, 's', { mat: 'plaster', rc: 0xd23b3b, flat: true, chests: 1, tier: 2 });
  car(w, rand, cx + 7.5, cz + 2, 1);
}

export const DROP_BASE = 200;  // los números de los cofres del cielo empiezan acá
export const MAX_DROPS = 8;
export const LOOT_LIMIT = DROP_BASE + MAX_DROPS;
export const DROP_FIRST = 75;  // segundos desde que empieza la tormenta (después del bus)
export const DROP_EVERY = 60;
export const DROP_FALL = 14;   // segundos que tarda en bajar con paracaídas
export const DROP_ALT = 140;

// Un cofre del cielo: cuándo termina de caer, dónde cae (adentro de la zona de ese momento) y qué trae de más.
export function dropInfo(w, n, speed = 1) {
  const land = (DROP_FIRST + n * DROP_EVERY) * speed;
  const rand = rng(w.seed ^ (0x7f4a7c15 + n * 977));
  const st = stormAt(w.seed, land, speed);
  let x = 0, z = 0;
  for (let i = 0; i < 20; i++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * st.r * 0.7;
    x = st.x + Math.cos(a) * d; z = st.z + Math.sin(a) * d;
    if (w.height(x, z) > 1.2 && x * x + z * z < (ISLAND_R - 12) ** 2) break;
  }
  return { n, i: DROP_BASE + n, at: land, x, z, y: w.height(x, z), tier: 3, extra: { medkit: 1, bigshield: 1, grenade: 2 }, drop: true };
}
// Todos los cofres de la partida (los del mapa y los del cielo).
export const chestOf = (w, i, speed = 1) => (i >= DROP_BASE ? dropInfo(w, i - DROP_BASE, speed) : w.chests[i]);

// ─── El bus de batalla ───────────────────────────────────────────────────────
// Cruza la isla en línea recta, a gran altura. Sale de la semilla, así que todas las pantallas lo ven en el
// mismo lugar. Cada uno decide cuándo saltar; si no, lo tira al llegar al final.
export const BUS_ALT = 240;
export const BUS_SPEED = 40;
export const PREGAME = 28;     // segundos del bus y la caída antes de que corra la tormenta
export function busRoute(seed) {
  const rand = rng(seed ^ 0x1b873593);
  const ang = rand() * Math.PI * 2;
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const off = (rand() - 0.5) * ISLAND_R * 0.9;
  const half = WORLD_R + 20;
  const mx = -dz * off, mz = dx * off;
  return { x0: mx - dx * half, z0: mz - dz * half, x1: mx + dx * half, z1: mz + dz * half, dx, dz, len: half * 2, yaw: Math.atan2(-dx, -dz) };
}
export function busAt(route, elapsed) {
  const d = Math.min(route.len, Math.max(0, elapsed) * BUS_SPEED);
  return { x: route.x0 + route.dx * d, y: BUS_ALT, z: route.z0 + route.dz * d, d, done: d >= route.len };
}

// ─── La tormenta ─────────────────────────────────────────────────────────────
// Círculos que se achican y se meten uno dentro del otro. Cada fase: espera, achica y deja el círculo nuevo.
export const STORM_PHASES = [
  { wait: 60, shrink: 55, r: 110, dps: 1.5 },
  { wait: 45, shrink: 45, r: 66, dps: 2.5 },
  { wait: 35, shrink: 38, r: 36, dps: 4 },
  { wait: 26, shrink: 30, r: 15, dps: 6 },
  { wait: 18, shrink: 22, r: 3, dps: 9 },
];
export const STORM_START_R = 245;
export const STORM_SPEEDS = { lenta: 1.5, normal: 1, rapida: 0.65 };

// Centros de cada fase: cada círculo nuevo cabe adentro del anterior.
export function stormCenters(seed) {
  const rand = rng(seed ^ 0x7a31);
  let cx = 0, cz = 0, r0 = STORM_START_R;
  const out = [{ x: 0, z: 0, r: STORM_START_R }];
  for (const ph of STORM_PHASES) {
    let ox = 0, oz = 0;
    for (let i = 0; i < 20; i++) { ox = rand() * 2 - 1; oz = rand() * 2 - 1; if (ox * ox + oz * oz <= 1) break; }
    const reach = Math.max(0, r0 - ph.r) * 0.8;
    cx += ox * reach; cz += oz * reach; r0 = ph.r;
    out.push({ x: cx, z: cz, r: ph.r });
  }
  return out;
}

const centersCache = new Map();
const centersFor = (seed) => { let c = centersCache.get(seed); if (!c) { if (centersCache.size > 8) centersCache.clear(); c = stormCenters(seed); centersCache.set(seed, c); } return c; };

// La tormenta a los `t` segundos de empezar: { x, z, r, phase (0 = antes de la primera), shrinking, next (segundos para que cambie), dps }.
export function stormAt(seed, t, speed = 1, centers = centersFor(seed)) {
  let left = Math.max(0, t);
  for (let i = 0; i < STORM_PHASES.length; i++) {
    const ph = STORM_PHASES[i];
    const wait = ph.wait * speed, shrink = ph.shrink * speed;
    const from = centers[i], to = centers[i + 1];
    if (left < wait) return { x: from.x, z: from.z, r: from.r, phase: i, shrinking: false, next: wait - left, dps: i === 0 ? 1 : STORM_PHASES[i - 1].dps };
    left -= wait;
    if (left < shrink) {
      const k = left / shrink;
      return { x: from.x + (to.x - from.x) * k, z: from.z + (to.z - from.z) * k, r: from.r + (to.r - from.r) * k, phase: i, shrinking: true, next: shrink - left, dps: ph.dps };
    }
    left -= shrink;
  }
  const last = centers[centers.length - 1];
  return { x: last.x, z: last.z, r: last.r, phase: STORM_PHASES.length, shrinking: false, next: 0, dps: STORM_PHASES[STORM_PHASES.length - 1].dps };
}
