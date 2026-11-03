// Cubolandia: bloques, ítems, herramientas, armaduras, comida y recetas. Datos puros, sin red ni React.
// Las unidades del juego son bloques (1 bloque = 1 casilla del mundo).

// ─── Bloques ─────────────────────────────────────────────────────────────────
// hard: segundos para romperlo a mano con la herramienta justa (se multiplica según la herramienta).
// tool: con cuál se rompe rápido; need: nivel mínimo de la herramienta para que suelte algo.
// drop: ítem que suelta ('self' = el mismo bloque, null = nada).
const DEFS = [
  { key: 'air', name: 'Aire', solid: false },
  { key: 'grass', name: 'Pasto', hard: 0.6, tool: 'shovel', drop: 'dirt', solid: true },
  { key: 'dirt', name: 'Tierra', hard: 0.5, tool: 'shovel', drop: 'self', solid: true },
  { key: 'stone', name: 'Piedra', hard: 1.5, tool: 'pickaxe', need: 1, drop: 'cobble', solid: true },
  { key: 'cobble', name: 'Roca', hard: 2, tool: 'pickaxe', need: 1, drop: 'self', solid: true },
  { key: 'sand', name: 'Arena', hard: 0.5, tool: 'shovel', drop: 'self', solid: true },
  { key: 'gravel', name: 'Grava', hard: 0.6, tool: 'shovel', drop: 'self', solid: true },
  { key: 'log', name: 'Tronco', hard: 2, tool: 'axe', drop: 'self', solid: true },
  { key: 'leaves', name: 'Hojas', hard: 0.2, tool: null, drop: 'leaves', solid: true },
  { key: 'planks', name: 'Tablones', hard: 2, tool: 'axe', drop: 'self', solid: true },
  { key: 'table', name: 'Mesa de crafteo', hard: 2.5, tool: 'axe', drop: 'self', solid: true, use: 'table' },
  { key: 'furnace', name: 'Horno', hard: 3.5, tool: 'pickaxe', need: 1, drop: 'self', solid: true, use: 'furnace' },
  { key: 'coal_ore', name: 'Mena de carbón', hard: 3, tool: 'pickaxe', need: 1, drop: 'coal', solid: true },
  { key: 'iron_ore', name: 'Mena de hierro', hard: 3, tool: 'pickaxe', need: 2, drop: 'self', solid: true },
  { key: 'gold_ore', name: 'Mena de oro', hard: 3, tool: 'pickaxe', need: 3, drop: 'self', solid: true },
  { key: 'diamond_ore', name: 'Mena de diamante', hard: 3, tool: 'pickaxe', need: 3, drop: 'diamond', solid: true },
  { key: 'bedrock', name: 'Lecho de roca', hard: Infinity, solid: true },
  { key: 'water', name: 'Agua', fluid: true, solid: false },
  { key: 'lava', name: 'Lava', fluid: true, solid: false },
  { key: 'snow', name: 'Nieve', hard: 0.3, tool: 'shovel', drop: 'self', solid: true },
  { key: 'cactus', name: 'Cactus', hard: 0.4, tool: null, drop: 'self', solid: true, hurts: true },
  { key: 'sandstone', name: 'Arenisca', hard: 0.8, tool: 'pickaxe', need: 1, drop: 'self', solid: true },
  { key: 'flower', name: 'Flor', hard: 0, drop: null, solid: false, plant: true },
  { key: 'tallgrass', name: 'Pasto alto', hard: 0, drop: null, solid: false, plant: true },
  // Los árboles del mundo se atraviesan (para moverse fácil) pero se rompen como cualquier bloque.
  // Los troncos y hojas que ponés vos son los de arriba y son sólidos.
  { key: 'treelog', name: 'Tronco', hard: 2, tool: 'axe', drop: 'log', solid: false, natural: true },
  { key: 'treeleaves', name: 'Hojas', hard: 0.2, tool: null, drop: 'leaves', solid: false, natural: true },
];
export const BLOCKS = DEFS.map((d, id) => ({ id, hard: 0, tool: null, need: 0, drop: null, ...d }));
export const B = Object.fromEntries(BLOCKS.map((b) => [b.key, b.id]));
export const BLOCK_BY_KEY = Object.fromEntries(BLOCKS.map((b) => [b.key, b]));
export const isSolid = (id) => BLOCKS[id]?.solid ?? true;
export const isFluid = (id) => id === B.water || id === B.lava;

// ─── Ítems ───────────────────────────────────────────────────────────────────
export const TIERS = {
  wood: { name: 'madera', tier: 1, speed: 2, dur: 59, sword: 4, axe: 3 },
  stone: { name: 'piedra', tier: 2, speed: 4, dur: 131, sword: 5, axe: 4 },
  iron: { name: 'hierro', tier: 3, speed: 6, dur: 250, sword: 6, axe: 5 },
  gold: { name: 'oro', tier: 1, speed: 12, dur: 32, sword: 4, axe: 3 },
  diamond: { name: 'diamante', tier: 4, speed: 8, dur: 1561, sword: 7, axe: 6 },
};
const TOOL_NAMES = { pickaxe: 'Pico', axe: 'Hacha', shovel: 'Pala', sword: 'Espada' };
// Piezas de armadura: puntos de defensa por material (como en el original).
const ARMOR_SLOTS = ['helmet', 'chestplate', 'leggings', 'boots'];
const ARMOR_NAMES = { helmet: 'Casco', chestplate: 'Pechera', leggings: 'Pantalón', boots: 'Botas' };
const ARMOR_POINTS = {
  leather: { name: 'de cuero', pts: [1, 3, 2, 1] },
  gold: { name: 'de oro', pts: [2, 5, 3, 1] },
  iron: { name: 'de hierro', pts: [2, 6, 5, 2] },
  diamond: { name: 'de diamante', pts: [3, 8, 6, 3] },
};

export const ITEMS = {};
for (const b of BLOCKS) if (b.key !== 'air' && b.key !== 'water' && b.key !== 'lava' && b.key !== 'bedrock' && !b.natural) ITEMS[b.key] = { key: b.key, name: b.name, block: b.id };
const plain = (key, name, extra = {}) => { ITEMS[key] = { key, name, ...extra }; };
plain('stick', 'Palo');
plain('coal', 'Carbón');
plain('diamond', 'Diamante');
plain('iron_ingot', 'Lingote de hierro');
plain('gold_ingot', 'Lingote de oro');
plain('leather', 'Cuero');
plain('apple', 'Manzana', { food: 4 });
plain('raw_beef', 'Carne cruda', { food: 3 });
plain('beef', 'Bife', { food: 8 });
plain('raw_pork', 'Cerdo crudo', { food: 3 });
plain('pork', 'Chuleta', { food: 8 });
plain('golden_apple', 'Manzana dorada', { food: 4, heal: 8 });
plain('bucket', 'Balde');
plain('water_bucket', 'Balde de agua', { pour: 'water' });
plain('lava_bucket', 'Balde de lava', { pour: 'lava' });
// Las menas se funden: la de hierro y la de oro son ítems aparte del bloque.
for (const [kind, tier] of Object.entries(TIERS)) {
  for (const t of Object.keys(TOOL_NAMES)) {
    ITEMS[`${kind}_${t}`] = { key: `${kind}_${t}`, name: `${TOOL_NAMES[t]} de ${tier.name}`, tool: t, tier: tier.tier, speed: tier.speed, dur: tier.dur, kind, dmg: t === 'sword' ? tier.sword : t === 'axe' ? tier.axe : t === 'pickaxe' ? 2 : 1 };
  }
}
for (const [mat, info] of Object.entries(ARMOR_POINTS)) {
  ARMOR_SLOTS.forEach((slot, i) => { ITEMS[`${mat}_${slot}`] = { key: `${mat}_${slot}`, name: `${ARMOR_NAMES[slot]} ${info.name}`, armor: i, pts: info.pts[i], kind: mat }; });
}
export const ARMOR_SLOT_NAMES = ['Casco', 'Pechera', 'Pantalón', 'Botas'];
export const itemName = (key) => ITEMS[key]?.name || key;
export const isTool = (key) => Boolean(ITEMS[key]?.tool);
export const maxStack = (key) => (ITEMS[key]?.tool || ITEMS[key]?.armor !== undefined ? 1 : ITEMS[key]?.pour || key === 'bucket' ? 1 : 64);

// Defensa total de las piezas puestas (0 a 20): cada punto frena un 4 % del daño.
export function armorPoints(armor) {
  return (armor || []).reduce((s, k) => s + (ITEMS[k]?.pts || 0), 0);
}
export const reduceDamage = (dmg, armor) => dmg * (1 - Math.min(20, armorPoints(armor)) * 0.04);

// Cuánto tarda en romperse un bloque con lo que se tiene en la mano; `drops` dice si suelta algo.
export function breakInfo(block, held) {
  const def = BLOCKS[block];
  if (!def || def.hard === Infinity) return { time: Infinity, drops: false };
  const it = held ? ITEMS[held] : null;
  const right = def.tool && it?.tool === def.tool ? it : null;
  const canHarvest = !def.need || Boolean(right && right.tier >= def.need);
  const speed = right ? right.speed : 1;
  const time = def.hard * (canHarvest ? 1.5 : 5) / speed;
  return { time: Math.max(0.05, time), drops: canHarvest, tool: Boolean(right) };
}

// Qué suelta un bloque roto (el ítem y la cantidad), o null.
export function dropOf(block, canHarvest, rand = Math.random) {
  const def = BLOCKS[block];
  if (!def || !canHarvest) return null;
  if (block === B.leaves || block === B.treeleaves) return rand() < 0.08 ? 'apple' : null;
  if (!def.drop) return null;
  return def.drop === 'self' ? def.key : def.drop;
}

// ─── Recetas ─────────────────────────────────────────────────────────────────
// `table`: hace falta una mesa de crafteo cerca. Las de 2×2 se hacen desde el inventario.
export const RECIPES = [];
const rec = (out, n, inp, table = true) => RECIPES.push({ out, n, in: inp, table });
rec('planks', 4, { log: 1 }, false);
rec('stick', 4, { planks: 2 }, false);
rec('table', 1, { planks: 4 }, false);
rec('furnace', 1, { cobble: 8 });
rec('bucket', 1, { iron_ingot: 3 });
rec('golden_apple', 1, { gold_ingot: 8, apple: 1 });
for (const mat of ['wood', 'stone', 'iron', 'gold', 'diamond']) {
  const m = mat === 'wood' ? 'planks' : mat === 'stone' ? 'cobble' : mat === 'iron' ? 'iron_ingot' : mat === 'gold' ? 'gold_ingot' : 'diamond';
  rec(`${mat}_pickaxe`, 1, { [m]: 3, stick: 2 });
  rec(`${mat}_axe`, 1, { [m]: 3, stick: 2 });
  rec(`${mat}_shovel`, 1, { [m]: 1, stick: 2 });
  rec(`${mat}_sword`, 1, { [m]: 2, stick: 1 }, false);
}
for (const mat of ['leather', 'iron', 'gold', 'diamond']) {
  const m = mat === 'leather' ? 'leather' : mat === 'iron' ? 'iron_ingot' : mat === 'gold' ? 'gold_ingot' : 'diamond';
  rec(`${mat}_helmet`, 1, { [m]: 5 });
  rec(`${mat}_chestplate`, 1, { [m]: 8 });
  rec(`${mat}_leggings`, 1, { [m]: 7 });
  rec(`${mat}_boots`, 1, { [m]: 4 });
}

// Fundiciones: de qué a qué. Cuestan 10 unidades de combustible.
export const SMELT = [
  { from: 'iron_ore', to: 'iron_ingot' },
  { from: 'gold_ore', to: 'gold_ingot' },
  { from: 'raw_beef', to: 'beef' },
  { from: 'raw_pork', to: 'pork' },
  { from: 'cobble', to: 'stone' },
  { from: 'sand', to: 'sandstone' },
];
export const SMELT_COST = 10;
export const SMELT_TIME = 4; // segundos por ítem (más rápido que el original)
export const FUEL = { coal: 80, log: 15, planks: 15, stick: 5 };

// ─── Inventario ──────────────────────────────────────────────────────────────
export const HOTBAR = 9;
export const INV_SIZE = 36;
export const emptyInv = () => Array.from({ length: INV_SIZE }, () => null);

export const count = (inv, key) => inv.reduce((s, st) => s + (st?.i === key ? st.n : 0), 0);

// Mete un ítem; devuelve lo que no entró.
export function addItem(inv, key, n = 1, d) {
  const max = maxStack(key);
  let left = n;
  if (max > 1) for (const st of inv) { if (left > 0 && st?.i === key && st.n < max) { const t = Math.min(max - st.n, left); st.n += t; left -= t; } }
  for (let i = 0; i < inv.length && left > 0; i++) {
    if (inv[i]) continue;
    const t = Math.min(max, left);
    inv[i] = { i: key, n: t };
    if (d !== undefined) inv[i].d = d;
    else if (ITEMS[key]?.dur) inv[i].d = ITEMS[key].dur;
    left -= t;
  }
  return left;
}

export function removeItem(inv, key, n = 1) {
  if (count(inv, key) < n) return false;
  let left = n;
  for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
    const st = inv[i];
    if (st?.i !== key) continue;
    const t = Math.min(st.n, left);
    st.n -= t; left -= t;
    if (st.n <= 0) inv[i] = null;
  }
  return true;
}

export const canCraft = (inv, r) => Object.entries(r.in).every(([k, n]) => count(inv, k) >= n);
export function craft(inv, r) {
  if (!canCraft(inv, r)) return false;
  // Si no entra el resultado, no se gasta nada.
  const probe = inv.map((s) => s && { ...s });
  for (const [k, n] of Object.entries(r.in)) removeItem(probe, k, n);
  if (addItem(probe, r.out, r.n) > 0) return false;
  for (const [k, n] of Object.entries(r.in)) removeItem(inv, k, n);
  addItem(inv, r.out, r.n);
  return true;
}
