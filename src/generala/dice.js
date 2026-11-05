// Generala: la física de los dados. Una tirada es una función pura: con los mismos parámetros (`throw`) y
// los mismos dados da exactamente la misma trayectoria en todas las pantallas, así que por la red solo viaja
// el gesto (dónde estaba el cubilete, para dónde y con cuánta fuerza, y una semilla). Nadie «decide» qué sale:
// lo que queda en la mesa es lo que dio la física, y si un dado queda montado, queda montado.
//
// El motor es Rapier (compilado a WebAssembly, versión determinista): llega por parámetro (`RAPIER`), así
// este archivo se puede probar con `node --test` y la página lo carga recién al entrar a una partida.
//
// **Acá no va `Math.random`, `Date.now` ni trigonometría** (`Math.sin`/`cos` pueden dar distinto entre
// navegadores, y con un bit de diferencia la tirada termina en otra cosa): solo sumas, productos, divisiones
// y raíces, que IEEE deja exactas. Lo mismo que `arena/sim.js`.
//
// Unidades: centímetros, gramos y segundos, a escala real. El origen es el centro del paño; `y` es hacia
// arriba. A esta escala todo es rápido de verdad: un dado que cae 5 cm tarda una décima de segundo.

export const DIE = 1.6;        // lado del dado (16 mm, el tamaño clásico)
export const DIE_ROUND = 0.2;  // radio del redondeo de aristas y puntas
export const HALF = DIE / 2;

// La bandeja: paño de 24 × 17 con paredes de madera. La de adelante (`front`, del lado del jugador, z
// positivo) es más baja para que no tape los dados que quedan contra ella. Pasando esa pared hay un estante
// angosto donde se apartan los dados que se guardan: ahí no llega ningún dado tirado.
export const TRAY = { hx: 12, hz: 8.5, wall: 4.4, front: 3, thick: 1.4 };
export const SHELF = { depth: 2.8, lip: 0.9 };
export const SHELF_Z = TRAY.hz + TRAY.thick + SHELF.depth / 2;
export const shelfSlot = (i) => [(i - 2) * 2.5, HALF, SHELF_Z];
// Dónde descansa el cubilete, parado sobre la mesa, a la derecha de la bandeja.
export const CUP = { x: TRAY.hx + TRAY.thick + 6, z: 3, height: 9.5, top: 3.7, bottom: 2.9 };
// Por dónde se puede llevar el cubilete en la mano antes de tirar (x y z, en cm): arriba de la mitad de
// adelante de la bandeja. `y` es la altura de la boca al volcarlo.
export const HAND = { x0: -9, x1: 9, z0: -1, z1: 6.5, y: 5.4 };
// Los dados salen siempre de adentro de la bandeja (hay un vidrio invisible arriba de las paredes).
const START_X = TRAY.hx - 1.5;
const START_Z = TRAY.hz - 1.5;

export const STEP = 1 / 600;     // paso de la física
export const FRAME_EVERY = 5;    // se guarda una foto cada 5 pasos: 120 por segundo
export const FRAME_DT = STEP * FRAME_EVERY;
export const POUR_GAP = 0.05;    // los dados salen del cubilete de a uno, cada 50 ms
const POUR_STEPS = Math.round(POUR_GAP / STEP);
const MAX_STEPS = 600 * 12;      // 12 s: no llega nunca, pero una tirada no puede no terminar
const QUIET_STEPS = 600 * 0.3;   // quieto 0,3 s seguidos = terminó
const QUIET_V = 0.12;            // cm/s
const QUIET_W = 0.12;            // rad/s
const GRAVITY = 981;
const CEILING = 45;
// Materiales (Rapier promedia los de las dos cosas que se tocan). El acrílico rebota mucho contra otro
// dado o contra la madera, y el paño amortigua y es resbaloso para el plástico.
const ACRYLIC = { friction: 0.25, bounce: 0.8 };
const FELT = { friction: 0.45, bounce: 0.25 };
const WOOD = { friction: 0.35, bounce: 0.38 };

// Qué cara mira para cada lado del dado: +x, -x, +y, -y, +z, -z. Las opuestas suman 7 y el 1, 2 y 3 giran
// en sentido antihorario alrededor de su esquina, como en un dado de verdad.
export const FACES = [3, 4, 1, 6, 2, 5];

// Un dado vale si quedó apoyado de plano sobre el paño. Si quedó inclinado contra una pared o arriba de
// otro dado, está montado: no vale ninguna cara y se tira de nuevo.
const FLAT_DOT = 0.99;         // coseno de ~8°
const FLOOR_Y = HALF + 0.12;   // el centro de un dado apoyado en el paño no está más alto que esto

// ─── Azar con semilla ────────────────────────────────────────────────────────
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampInt = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v) || 0)));

// El gesto de una tirada, todo en enteros para que viaje igual a todas las pantallas:
// `s` semilla, `x` y `z` dónde estaba el cubilete (mm), `a` y `b` para dónde se tiró (x, z) y `p` la fuerza (0 a 100).
export function cleanThrow(t) {
  if (!t || typeof t !== 'object') return null;
  const a = clampInt(t.a, -1000, 1000);
  const b = clampInt(t.b, -1000, 1000);
  return {
    s: (Number(t.s) || 0) >>> 0,
    x: clampInt(t.x, HAND.x0 * 10, HAND.x1 * 10),
    z: clampInt(t.z, HAND.z0 * 10, HAND.z1 * 10),
    a: a === 0 && b === 0 ? 0 : a,
    b: a === 0 && b === 0 ? -1000 : b,
    p: clampInt(t.p, 0, 100),
  };
}

// Un cuaternión al azar, parejo en todas las orientaciones, sin trigonometría: un punto al azar adentro de
// la esfera de 4 dimensiones, llevado a la superficie.
function randomQuat(rand) {
  for (;;) {
    const x = rand() * 2 - 1, y = rand() * 2 - 1, z = rand() * 2 - 1, w = rand() * 2 - 1;
    const n = x * x + y * y + z * z + w * w;
    if (n > 1 || n < 0.01) continue;
    const k = 1 / Math.sqrt(n);
    return [x * k, y * k, z * k, w * k];
  }
}

function randomDir(rand) {
  for (;;) {
    const x = rand() * 2 - 1, y = rand() * 2 - 1, z = rand() * 2 - 1;
    const n = x * x + y * y + z * z;
    if (n > 1 || n < 0.01) continue;
    const k = 1 / Math.sqrt(n);
    return [x * k, y * k, z * k];
  }
}

// Cómo sale cada dado del cubilete. Salen de la boca de a uno (el dado k, `POUR_GAP` × k segundos después
// de volcarlo), alternando un poco a cada costado, cada uno con su empujón y su giro. `thrown` son los
// índices de los dados que se tiran.
export function throwSetup(throwParams, thrown) {
  const t = cleanThrow(throwParams);
  const rand = mulberry32(t.s);
  const len = Math.sqrt(t.a * t.a + t.b * t.b);
  const dx = t.a / len, dz = t.b / len;      // para dónde va la tirada
  const sx = -dz, sz = dx;                   // el costado
  const speed = 58 + t.p * 0.85;             // cm/s
  const ox = Math.max(-START_X, Math.min(START_X, t.x / 10));
  const oz = Math.max(-START_Z, Math.min(START_Z, t.z / 10));
  return thrown.map((i, k) => {
    const side = (k & 1 ? -1 : 1) * (thrown.length === 1 ? 0 : 0.9) + (rand() - 0.5) * 0.2;
    const boost = 0.76 + rand() * 0.46;
    const drift = (rand() - 0.5) * 0.62 * speed;
    const spin = randomDir(rand);
    const turns = 20 + rand() * 34 + t.p * 0.12; // rad/s
    return {
      i,
      at: k * POUR_GAP,
      p: [
        Math.max(-START_X, Math.min(START_X, ox + sx * side)),
        HAND.y + rand() * 0.5,
        Math.max(-START_Z, Math.min(START_Z, oz + sz * side)),
      ],
      q: randomQuat(rand),
      v: [dx * speed * boost + sx * drift, -30 + rand() * 40, dz * speed * boost + sz * drift],
      w: [spin[0] * turns, spin[1] * turns, spin[2] * turns],
    };
  });
}

// ─── Leer el dado ────────────────────────────────────────────────────────────
// Cuánto mira para arriba cada eje del dado (la componente y de cada eje girado) y qué cara quedó arriba.
// `pose` = [x, y, z, qx, qy, qz, qw].
export function readDie(pose) {
  const [, py, , x, y, z, w] = pose;
  const up = [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)];
  let best = 0;
  for (let k = 1; k < 3; k++) if (Math.abs(up[k]) > Math.abs(up[best])) best = k;
  const dot = Math.abs(up[best]);
  const face = FACES[best * 2 + (up[best] > 0 ? 0 : 1)];
  const flat = dot >= FLAT_DOT && py <= FLOOR_Y;
  return { face, dot, flat, value: flat ? face : 0 };
}

const round4 = (n) => Math.round(n * 10000) / 10000;

// ─── La tirada ───────────────────────────────────────────────────────────────
// Qué golpeó cada dado (para el sonido).
export const HIT_FELT = 0;
export const HIT_WALL = 1;
export const HIT_DIE = 2;
const HIT_GLASS = 3;
const MIN_HIT = 4;     // cm/s: un golpe más suave que esto no se oye
const HIT_GAP = 0.012; // s: un mismo golpe dura varios pasos; queda una sola vez, con su pico

// Devuelve la trayectoria entera, con todo en el orden de `thrown`:
//   frames   7 números por dado y por foto (posición y cuaternión), `count` fotos cada `dt` segundos
//   release  en qué segundo sale del cubilete cada dado (antes no se dibuja)
//   events   los golpes: [segundo, contra qué, cm/s, x, z, dado]
//   poses    cómo quedó cada dado, y `values` qué cara vale (0 = montado)
export function simulate(RAPIER, throwParams, thrown) {
  const setup = throwSetup(throwParams, thrown);
  const world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
  world.timestep = STEP;
  world.numSolverIterations = 8;
  // 100 unidades = 1 metro. Sin esto Rapier cree que un dado mide 1,6 m: corrige los choques tan despacio
  // que el dado se hunde más de un milímetro en el paño.
  world.lengthUnit = 100;
  const kinds = new Map();
  const { hx, hz, wall, front, thick } = TRAY;
  const fixed = (desc, kind) => kinds.set(world.createCollider(desc).handle, kind);
  fixed(RAPIER.ColliderDesc.cuboid(hx + thick, 2, hz + thick).setTranslation(0, -2, 0).setFriction(FELT.friction).setRestitution(FELT.bounce), HIT_FELT);
  // Las cuatro paredes de madera, y arriba de cada una un vidrio invisible por si un dado quisiera irse.
  const side = (x, z, w, d, h = wall) => {
    fixed(RAPIER.ColliderDesc.cuboid(w, h / 2, d).setTranslation(x, h / 2, z).setFriction(WOOD.friction).setRestitution(WOOD.bounce), HIT_WALL);
    fixed(RAPIER.ColliderDesc.cuboid(w, (CEILING - h) / 2, d).setTranslation(x, (CEILING + h) / 2, z).setFriction(0.1).setRestitution(0.2), HIT_GLASS);
  };
  side(-hx - thick / 2, 0, thick / 2, hz + thick);
  side(hx + thick / 2, 0, thick / 2, hz + thick);
  side(0, -hz - thick / 2, hx + thick, thick / 2);
  side(0, hz + thick / 2, hx + thick, thick / 2, front);
  fixed(RAPIER.ColliderDesc.cuboid(60, 1, 60).setTranslation(0, CEILING + 1, 0), HIT_GLASS);

  const inner = HALF - DIE_ROUND;
  const dieOf = new Map(); // el collider de cada dado → su lugar en `thrown`
  const bodies = setup.map(() => null);
  let mass = 1;
  const pour = (k) => {
    const d = setup[k];
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(d.p[0], d.p[1], d.p[2])
        .setRotation({ x: d.q[0], y: d.q[1], z: d.q[2], w: d.q[3] })
        .setLinvel(d.v[0], d.v[1], d.v[2])
        .setAngvel({ x: d.w[0], y: d.w[1], z: d.w[2] })
        .setLinearDamping(0.02)
        .setAngularDamping(0.05)
        .setCcdEnabled(true)
        .setCanSleep(false),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.roundCuboid(inner, inner, inner, DIE_ROUND)
        .setDensity(1.15)
        .setFriction(ACRYLIC.friction)
        .setRestitution(ACRYLIC.bounce)
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setContactForceEventThreshold(1),
      body,
    );
    dieOf.set(collider.handle, k);
    bodies[k] = body;
    mass = body.mass();
  };

  const queue = new RAPIER.EventQueue(true);
  const frames = [];
  const events = [];
  const lastHit = new Map();
  let quiet = 0;
  let steps = 0;
  let glass = 0;
  let poured = 0;
  const record = () => {
    for (let k = 0; k < bodies.length; k++) {
      const b = bodies[k];
      if (!b) { const d = setup[k]; frames.push(d.p[0], d.p[1], d.p[2], d.q[0], d.q[1], d.q[2], d.q[3]); continue; }
      const p = b.translation(), q = b.rotation();
      frames.push(p.x, p.y, p.z, q.x, q.y, q.z, q.w);
    }
  };
  pour(poured++);
  record();
  while (steps < MAX_STEPS) {
    world.step(queue);
    steps += 1;
    // Cada golpe fuerte queda anotado para el sonido: cuánto le cambió la velocidad al dado (fuerza × paso ÷ masa).
    queue.drainContactForceEvents((ev) => {
      const h1 = ev.collider1(), h2 = ev.collider2();
      const a = dieOf.get(h1), b = dieOf.get(h2);
      const k = a !== undefined ? a : b;
      if (k === undefined) return;
      const other = a !== undefined && b !== undefined ? HIT_DIE : kinds.get(a !== undefined ? h2 : h1);
      const speed = (ev.maxForceMagnitude() * STEP) / mass;
      if (speed < MIN_HIT) return;
      if (other === HIT_GLASS) { glass += 1; return; }
      const key = k * 4 + other;
      const last = lastHit.get(key);
      const now = steps * STEP;
      if (last && now - last.seen < HIT_GAP) { last.hit[2] = Math.max(last.hit[2], Math.round(speed)); last.seen = now; return; }
      const p = bodies[k].translation();
      const hit = [round4(now), other, Math.round(speed), round4(p.x), round4(p.z), k];
      lastHit.set(key, { hit, seen: now });
      events.push(hit);
    });
    while (poured < setup.length && steps >= poured * POUR_STEPS) pour(poured++);
    if (steps % FRAME_EVERY === 0) record();
    let still = poured === setup.length;
    for (let k = 0; k < bodies.length && still; k++) {
      const v = bodies[k].linvel(), w = bodies[k].angvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > QUIET_V * QUIET_V || w.x * w.x + w.y * w.y + w.z * w.z > QUIET_W * QUIET_W) still = false;
    }
    quiet = still ? quiet + 1 : 0;
    if (quiet >= QUIET_STEPS) break;
  }
  if (steps % FRAME_EVERY !== 0) record();
  const poses = bodies.map((b) => {
    const p = b.translation(), q = b.rotation();
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w].map(round4);
  });
  queue.free();
  world.free();
  return {
    thrown: [...thrown], count: frames.length / (7 * thrown.length), dt: FRAME_DT, seconds: steps * STEP,
    settled: quiet >= QUIET_STEPS, glass, release: setup.map((d) => d.at),
    frames: new Float32Array(frames), events, poses, values: poses.map((p) => readDie(p).value),
  };
}
