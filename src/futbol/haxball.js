// Motor de física de HaxBall, copiado del juego original.
// Sale de node-haxball (github.com/wxyz-abcd/node-haxball), que reconstruye el código de haxball.com:
// mismos números, mismo orden de las cuentas y mismos estadios por defecto. Lógica pura, sin DOM.
//
// Todo va en unidades de HaxBall: píxeles, y velocidades en píxeles por paso. El juego da 60 pasos
// por segundo (`TICK_MS`). El origen (0, 0) es el medio de la cancha.

export const TICK_MS = 1000 / 60;

// Grupos de choque: dos cosas chocan si `a.cMask & b.cGroup` y `b.cMask & a.cGroup`.
export const CF = { ball: 1, red: 2, blue: 4, redKO: 8, blueKO: 16, wall: 32, kick: 64, score: 128, all: 63 };

// `playerPhysics` por defecto de HaxBall.
export const PLAYER_PHYSICS = {
  radius: 15,
  bCoef: 0.5,
  invMass: 0.5,
  damping: 0.96,
  acceleration: 0.1,
  kickingAcceleration: 0.07,
  kickingDamping: 0.96,
  kickStrength: 5,
  kickback: 0,
};

// La pelota (el disco 0 de cada estadio).
export const BALL_PHYSICS = {
  radius: 10,
  bCoef: 0.5,
  invMass: 1,
  damping: 0.99,
  cMask: CF.all,
  cGroup: CF.ball | CF.kick | CF.score,
};

// Máscara de un jugador fuera del saque: pelota, jugadores y paredes.
const PLAYER_MASK = CF.ball | CF.red | CF.blue | CF.wall;
// Distancia entre bordes a la que la patada alcanza la pelota.
const KICK_REACH = 4;
// «kickRateLimit» por defecto (min 2): después de patear, dos pasos sin poder volver a patear.
export const KICK_COOLDOWN_TICKS = 2;

export const TEAMS = {
  red: { color: '#E56E56', cGroup: CF.red, ko: CF.redKO, dir: -1 },
  blue: { color: '#5689E5', cGroup: CF.blue, ko: CF.blueKO, dir: 1 },
};

// Los estadios por defecto de HaxBall con cancha de pasto (Hockey usa otro fondo y no está).
// width/height: hasta dónde llegan los jugadores; field*: las líneas; goal: medio arco;
// kickOff: radio del círculo central; corner: esquinas redondeadas.
export const STADIUMS = [
  { id: 'classic', name: 'Classic', width: 420, height: 200, fieldW: 370, fieldH: 170, goal: 64, kickOff: 75, corner: 0 },
  { id: 'easy', name: 'Easy', width: 420, height: 200, fieldW: 370, fieldH: 170, goal: 90, kickOff: 75, corner: 0 },
  { id: 'small', name: 'Small', width: 420, height: 200, fieldW: 320, fieldH: 130, goal: 55, kickOff: 70, corner: 0 },
  { id: 'big', name: 'Big', width: 600, height: 270, fieldW: 550, fieldH: 240, goal: 80, kickOff: 80, corner: 0 },
  { id: 'rounded', name: 'Rounded', width: 420, height: 200, fieldW: 370, fieldH: 170, goal: 64, kickOff: 75, corner: 75 },
  { id: 'bigEasy', name: 'Big Easy', width: 600, height: 270, fieldW: 550, fieldH: 240, goal: 95, kickOff: 80, corner: 0 },
  { id: 'bigRounded', name: 'Big Rounded', width: 600, height: 270, fieldW: 550, fieldH: 240, goal: 80, kickOff: 75, corner: 100 },
  { id: 'huge', name: 'Huge', width: 750, height: 350, fieldW: 700, fieldH: 320, goal: 100, kickOff: 80, corner: 0 },
];

const stadiumCache = new Map();

// Arma el estadio igual que `Stadium.WG` de HaxBall. Es inmutable: se comparte entre estados.
export function buildStadium(id) {
  const def = STADIUMS.find((s) => s.id === id) || STADIUMS[0];
  if (stadiumCache.has(def.id)) return stadiumCache.get(def.id);
  const { width: W, height: H, fieldW: I, fieldH: A, goal: G, kickOff: K, corner: C } = def;
  const st = {
    isHaxball: true,
    id: def.id,
    name: def.name,
    width: W,
    height: H,
    bg: { width: I, height: A, kickOffRadius: K, cornerRadius: C, color: '#718C5A' },
    spawnDistance: Math.min(0.75 * I, 400),
    vertices: [],
    segments: [],
    planes: [],
    goals: [],
    posts: [],
  };

  const vertex = (x, y, o = {}) => {
    const v = { x, y, bCoef: o.bCoef ?? 1, cMask: o.cMask ?? 63, cGroup: o.cGroup ?? 32 };
    st.vertices.push(v);
    return v;
  };
  const segment = (v0, v1, o = {}) => {
    const s = makeSegment(v0, v1, o);
    st.segments.push(s);
    return s;
  };
  const plane = (nx, ny, dist, o = {}) => {
    st.planes.push({ nx, ny, dist, bCoef: o.bCoef ?? 1, cMask: o.cMask ?? 63, cGroup: o.cGroup ?? 32 });
  };

  // Hasta dónde llegan todos (rebote 0).
  plane(0, 1, -H, { bCoef: 0 });
  plane(0, -1, -H, { bCoef: 0 });
  plane(1, 0, -W, { bCoef: 0 });
  plane(-1, 0, -W, { bCoef: 0 });

  // Arcos: primero el de la derecha (azul), después el de la izquierda (rojo).
  const goalNet = (x, dir, color, team) => {
    const opts = { cMask: CF.ball, cGroup: 32, bCoef: 0.1 };
    const a = vertex(x + 8 * dir, -G, opts);
    const b = vertex(x + 8 * dir, G, opts);
    const c = vertex(x + 30 * dir, 22 - G, opts);
    const d = vertex(x + 30 * dir, G - 22, opts);
    segment(a, c, { ...opts, curve: 90 * dir });
    segment(d, c, opts);
    segment(d, b, { ...opts, curve: 90 * dir });
    st.posts.push({ x, y: -G, radius: 8, invMass: 0, bCoef: 0.5, cMask: 63, cGroup: 63, color });
    st.posts.push({ x, y: G, radius: 8, invMass: 0, bCoef: 0.5, cMask: 63, cGroup: 63, color });
    st.goals.push({ x0: x, y0: -G, x1: x, y1: G, team });
  };
  goalNet(I, 1, '#CCCCFF', 'blue');
  goalNet(-I, -1, '#FFCCCC', 'red');

  // Barrera del saque: la línea del medio y el círculo central, solo para los jugadores.
  const ko = { bCoef: 0.1, cGroup: CF.redKO | CF.blueKO, cMask: CF.red | CF.blue };
  const k0 = vertex(0, -H, ko);
  const k1 = vertex(0, -K, ko);
  const k2 = vertex(0, K, ko);
  const k3 = vertex(0, H, ko);
  segment(k0, k1, { ...ko, vis: false });
  segment(k2, k3, { ...ko, vis: false });
  segment(k1, k2, { ...ko, cGroup: CF.redKO, vis: false, curve: 180 });
  segment(k2, k1, { ...ko, cGroup: CF.blueKO, vis: false, curve: 180 });

  // Laterales y fondos: solo para la pelota.
  plane(0, 1, -A, { cMask: CF.ball });
  plane(0, -1, -A, { cMask: CF.ball });
  const none = { cMask: 0 };
  const c0 = vertex(-I, -A, none);
  const c1 = vertex(I, -A, none);
  const c2 = vertex(I, -G, none);
  const c3 = vertex(I, G, none);
  const c4 = vertex(I, A, none);
  const c5 = vertex(-I, A, none);
  const c6 = vertex(-I, G, none);
  const c7 = vertex(-I, -G, none);
  segment(c1, c2, { cMask: CF.ball, vis: false });
  segment(c3, c4, { cMask: CF.ball, vis: false });
  segment(c5, c6, { cMask: CF.ball, vis: false });
  segment(c7, c0, { cMask: CF.ball, vis: false });

  // Esquinas redondeadas.
  if (C > 0) {
    const r0 = vertex(-I + C, -A, none);
    const r1 = vertex(-I, -A + C, none);
    const r2 = vertex(-I + C, A, none);
    const r3 = vertex(-I, A - C, none);
    const r4 = vertex(I - C, A, none);
    const r5 = vertex(I, A - C, none);
    const r6 = vertex(I - C, -A, none);
    const r7 = vertex(I, -A + C, none);
    segment(r0, r1, { cMask: CF.ball, vis: false, curve: -90 });
    segment(r2, r3, { cMask: CF.ball, vis: false, curve: 90 });
    segment(r4, r5, { cMask: CF.ball, vis: false, curve: -90 });
    segment(r6, r7, { cMask: CF.ball, vis: false, curve: 90 });
  }

  stadiumCache.set(def.id, st);
  return st;
}

// Segmento recto o curvo, con la geometría ya calculada (`Segment.YI` y `Segment.CE`).
function makeSegment(v0, v1, o) {
  const s = {
    v0,
    v1,
    bCoef: o.bCoef ?? 1,
    cMask: o.cMask ?? 63,
    cGroup: o.cGroup ?? 32,
    vis: o.vis ?? true,
    color: o.color ?? '#000000',
    bias: 0,
    curveF: Infinity,
  };
  if (o.curve) {
    let a = o.curve * 0.017453292519943295;
    if (a < 0) {
      a = -a;
      s.v0 = v1;
      s.v1 = v0;
      s.bias = -s.bias;
    }
    if (a > 0.17435839227423353 && a < 5.934119456780721) s.curveF = 1 / Math.tan(a / 2);
  }
  const p0 = s.v0;
  const p1 = s.v1;
  if (Number.isFinite(s.curveF)) {
    const q = s.curveF;
    const hx = 0.5 * (p1.x - p0.x);
    const hy = 0.5 * (p1.y - p0.y);
    const cx = p0.x + hx - hy * q;
    const cy = p0.y + hy + hx * q;
    s.arcCenter = { x: cx, y: cy };
    s.arcRadius = Math.hypot(p0.x - cx, p0.y - cy);
    s.v0Normal = { x: cy - p0.y, y: p0.x - cx };
    s.v1Normal = { x: p1.y - cy, y: cx - p1.x };
    if (q <= 0) {
      s.v0Normal = { x: -s.v0Normal.x, y: -s.v0Normal.y };
      s.v1Normal = { x: -s.v1Normal.x, y: -s.v1Normal.y };
    }
  } else {
    const dx = p0.x - p1.x;
    const dy = p0.y - p1.y;
    const l = Math.hypot(dx, dy);
    s.normal = { x: -dy / l, y: dx / l };
  }
  return s;
}

// ─── Discos ──────────────────────────────────────────────────────────────────
// Un disco del mundo: posición, velocidad (por paso) y cómo choca.
export function makeDisc(props) {
  return { x: 0, y: 0, vx: 0, vy: 0, radius: 10, bCoef: 0.5, invMass: 1, damping: 0.99, cMask: 63, cGroup: 63, ...props };
}

const canCollide = (a, b) => (a.cMask & b.cGroup) !== 0 && (a.cGroup & b.cMask) !== 0;

// Choque entre dos discos (`a` va antes que `b` en la lista, como en HaxBall).
export function collideDiscs(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const d2 = dx * dx + dy * dy;
  const r = a.radius + b.radius;
  if (!(d2 > 0 && d2 <= r * r)) return false;
  const sum = a.invMass + b.invMass;
  if (sum === 0) return false;
  const d = Math.sqrt(d2);
  const nx = dx / d;
  const ny = dy / d;
  const m = a.invMass / sum;
  let pen = r - d;
  const move = pen * m;
  a.x += nx * move;
  a.y += ny * move;
  pen -= move;
  b.x -= nx * pen;
  b.y -= ny * pen;
  let vn = nx * (a.vx - b.vx) + ny * (a.vy - b.vy);
  if (vn < 0) {
    vn *= a.bCoef * b.bCoef + 1;
    const ka = m * vn;
    a.vx -= nx * ka;
    a.vy -= ny * ka;
    const kb = vn - ka;
    b.vx += nx * kb;
    b.vy += ny * kb;
  }
  return true;
}

function collidePlane(d, p) {
  const pen = p.dist - (p.nx * d.x + p.ny * d.y) + d.radius;
  if (pen <= 0) return;
  d.x += p.nx * pen;
  d.y += p.ny * pen;
  let vn = d.vx * p.nx + d.vy * p.ny;
  if (vn < 0) {
    vn *= d.bCoef * p.bCoef + 1;
    d.vx -= vn * p.nx;
    d.vy -= vn * p.ny;
  }
}

function collideSegment(d, s) {
  let nx;
  let ny;
  let h;
  if (Number.isFinite(s.curveF)) {
    const vx = d.x - s.arcCenter.x;
    const vy = d.y - s.arcCenter.y;
    const inside = s.v0Normal.x * vx + s.v0Normal.y * vy > 0 && s.v1Normal.x * vx + s.v1Normal.y * vy > 0;
    if (inside === (s.curveF <= 0)) return;
    const l = Math.sqrt(vx * vx + vy * vy);
    if (l === 0) return;
    h = l - s.arcRadius;
    nx = vx / l;
    ny = vy / l;
  } else {
    const ex = s.v1.x - s.v0.x;
    const ey = s.v1.y - s.v0.y;
    const hx = d.x - s.v1.x;
    const hy = d.y - s.v1.y;
    if ((d.x - s.v0.x) * ex + (d.y - s.v0.y) * ey <= 0 || hx * ex + hy * ey >= 0) return;
    nx = s.normal.x;
    ny = s.normal.y;
    h = nx * hx + ny * hy;
  }
  let bias = s.bias;
  if (bias === 0) {
    if (h < 0) {
      h = -h;
      nx = -nx;
      ny = -ny;
    }
  } else {
    if (bias < 0) {
      bias = -bias;
      h = -h;
      nx = -nx;
      ny = -ny;
    }
    if (h < -bias) return;
  }
  if (h >= d.radius) return;
  const pen = d.radius - h;
  d.x += nx * pen;
  d.y += ny * pen;
  let vn = nx * d.vx + ny * d.vy;
  if (vn < 0) {
    vn *= d.bCoef * s.bCoef + 1;
    d.vx -= nx * vn;
    d.vy -= ny * vn;
  }
}

function collideVertex(d, v) {
  let lx = d.x - v.x;
  let ly = d.y - v.y;
  const l2 = lx * lx + ly * ly;
  if (!(l2 > 0 && l2 <= d.radius * d.radius)) return;
  const l = Math.sqrt(l2);
  lx /= l;
  ly /= l;
  const pen = d.radius - l;
  d.x += lx * pen;
  d.y += ly * pen;
  let vn = lx * d.vx + ly * d.vy;
  if (vn < 0) {
    vn *= d.bCoef * v.bCoef + 1;
    d.vx -= lx * vn;
    d.vy -= ly * vn;
  }
}

// Choques de un disco contra lo fijo del estadio: planos, segmentos y vértices, en ese orden.
export function collideStatic(d, st) {
  for (const p of st.planes) if (canCollide(p, d)) collidePlane(d, p);
  for (const s of st.segments) if (canCollide(s, d)) collideSegment(d, s);
  for (const v of st.vertices) if (canCollide(v, d)) collideVertex(d, v);
}

// Un paso del mundo (`World.LM`): todos avanzan, se frenan, y después se resuelven los choques en
// orden. `fixed(disc)` dice qué discos no se mueven en esta pantalla (los de otros jugadores: sus
// fotos dicen dónde están). Esos solo chocan con los jugadores de esta pantalla, y del choque solo se
// corrige al otro; la pelota los atraviesa, porque la toca cada uno en su propia pantalla.
// `f` es el largo del paso en pasos de HaxBall (1 = exacto); otro valor solo sirve para adivinar.
export function stepWorld(discs, st, f = 1, fixed = null, onHit = null) {
  for (const d of discs) {
    if (fixed?.(d)) continue;
    d.x += d.vx * f;
    d.y += d.vy * f;
    const damp = f === 1 ? d.damping : Math.pow(d.damping, f);
    d.vx *= damp;
    d.vy *= damp;
  }
  for (let i = 0; i < discs.length; i++) {
    const a = discs[i];
    const aFixed = fixed?.(a);
    for (let j = i + 1; j < discs.length; j++) {
      const b = discs[j];
      if (!canCollide(b, a)) continue;
      const bFixed = fixed?.(b);
      if (aFixed && (bFixed || !b.player)) continue;
      if (bFixed && !a.player) continue;
      const keep = aFixed ? { ...a } : bFixed ? { ...b } : null;
      if (collideDiscs(a, b)) onHit?.(a, b);
      if (keep) Object.assign(aFixed ? a : b, { x: keep.x, y: keep.y, vx: keep.vx, vy: keep.vy });
    }
    if (a.invMass !== 0 && !aFixed) collideStatic(a, st);
  }
}

// ¿La patada del jugador `p` alcanza al disco `b`? Si sí, lo empuja (`DynamicDisc.oP`).
export function tryKick(p, b, phys = PLAYER_PHYSICS) {
  const dx = b.x - p.x;
  const dy = b.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d - b.radius - p.radius >= KICK_REACH) return false;
  const nx = dx / d;
  const ny = dy / d;
  b.vx += phys.kickStrength * nx * b.invMass;
  b.vy += phys.kickStrength * ny * b.invMass;
  p.vx -= phys.kickback * nx * p.invMass;
  p.vy -= phys.kickback * ny * p.invMass;
  return true;
}

// Las teclas mueven al jugador (`PhysicsState._8`): en diagonal se normaliza, y con la patada
// apretada acelera y se frena distinto.
export function applyInput(p, input, kicking, f = 1, phys = PLAYER_PHYSICS) {
  let ix = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let iy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  if (ix !== 0 && iy !== 0) {
    ix *= Math.SQRT1_2;
    iy *= Math.SQRT1_2;
  }
  if (ix !== 0 || iy !== 0) {
    const acc = (kicking ? phys.kickingAcceleration : phys.acceleration) * f;
    p.vx += ix * acc;
    p.vy += iy * acc;
  }
  p.damping = kicking ? phys.kickingDamping : phys.damping;
}

// ¿La pelota cruzó la línea de gol entre `a` y `b`? (`Goal.p5`).
export function crossesGoal(goal, a, b) {
  let mx = b.x - a.x;
  let my = b.y - a.y;
  const s0 = my * (goal.x0 - a.x) - mx * (goal.y0 - a.y) > 0;
  const s1 = my * (goal.x1 - a.x) - mx * (goal.y1 - a.y) > 0;
  if (s0 === s1) return false;
  mx = goal.x1 - goal.x0;
  my = goal.y1 - goal.y0;
  return (my * (a.x - goal.x0) - mx * (a.y - goal.y0) > 0) !== (my * (b.x - goal.x0) - mx * (b.y - goal.y0) > 0);
}

// Máscara de choque de un jugador: en el saque se le suma la barrera del equipo que saca.
export function playerMask(kickoff) {
  return PLAYER_MASK | (kickoff?.pending ? TEAMS[kickoff.team]?.ko || 0 : 0);
}

// Lugar de salida (`GameState.Ah`): en fila sobre su lado, 0, 55, −55, 110, −110…
export function spawnPoint(st, team, index) {
  let h = (index + 1) >> 1;
  if (!(index & 1)) h = -h;
  return { x: st.spawnDistance * (TEAMS[team]?.dir ?? -1), y: 55 * h };
}
