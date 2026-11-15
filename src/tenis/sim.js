// Tenis Movido: la pelota y las reglas del punto, puras (sin dibujo ni red). Solo la cancha (la compu) las corre.
// Ejes: x a lo ancho, z a lo largo (el lado 0 está en z > 0, cerca de la pantalla; el 1 en z < 0), y para arriba.
export const STEP = 1 / 120;
export const HALF_W = 4.6;     // medio ancho de la cancha (single, un poco más generoso)
export const HALF_L = 11.9;    // medio largo
export const NET_H = 0.95;
export const BALL_R = 0.07;
export const GRAVITY = 9.8;
export const BOUNCE = 0.72;
export const BASE_Z = 12.6;    // dónde se paran los jugadores (detrás de la línea de fondo)
export const MOVE = 6.5;       // m/s que se mueve solo cada jugador para ir a la pelota
export const REACH_Z = 1.7;    // qué tan cerca (a lo largo) tiene que pasar la pelota para poder pegarle
export const REACH_X = 1.9;
export const SWING_WINDOW = 0.28; // un golpe que llegó hace menos de esto todavía sirve si la pelota entra al alcance

export const sideZ = (side) => (side === 0 ? BASE_Z : -BASE_Z);
export const sideOf = (z) => (z > 0 ? 0 : 1);

export function newRally(server) {
  const z = sideZ(server) - Math.sign(sideZ(server)) * 0.6;
  return {
    ball: { x: server === 0 ? 1.2 : -1.2, y: 1.0, z, vx: 0, vy: 4.2, vz: 0 }, // la pelota sube del saque
    players: [{ x: 0.6, z: sideZ(0) }, { x: -0.6, z: sideZ(1) }],
    last: server, serving: true, bounces: 0, bounceSide: -1, over: null, hits: 0, tossAt: 0,
  };
}

// Le pega `side` con `power` (0 a 1) y `aim` (-1 a 1: para dónde va a lo ancho). Calcula la velocidad para que pique en la otra mitad.
export function hitBall(r, side, power, aim) {
  const b = r.ball;
  const dir = side === 0 ? -1 : 1;
  const depth = 5 + power * 5.5;                        // cuanto más fuerte, más al fondo
  const tx = Math.max(-HALF_W + 0.6, Math.min(HALF_W - 0.6, aim * 3.6));
  const tz = dir * depth;
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  const speed = 15 + power * 13;
  const T = d / speed;
  b.vx = dx / T; b.vz = dz / T;
  b.vy = (BALL_R - b.y + 0.5 * GRAVITY * T * T) / T;
  // Que pase la red: si la parábola queda baja en z = 0, se la levanta un poco.
  const tNet = Math.abs(b.z / b.vz);
  const yNet = b.y + b.vy * tNet - 0.5 * GRAVITY * tNet * tNet;
  if (yNet < NET_H + 0.25) b.vy += (NET_H + 0.25 - yNet) / tNet;
  r.last = side; r.serving = false; r.bounces = 0; r.bounceSide = -1; r.hits += 1;
}

// ¿Puede pegarle el jugador `side` ahora? (la pelota viene hacia él y está a su alcance)
export function canReach(r, side) {
  const b = r.ball, p = r.players[side];
  if (r.over) return false;
  if (r.serving) return r.last === side && b.vy < 1.5 && b.y > 0.6 && b.y < 2.6; // el saque: le pega cuando la pelota baja
  const coming = side === 0 ? b.vz > 0 : b.vz < 0;
  return coming && r.last !== side && Math.abs(b.z - p.z) < REACH_Z && Math.abs(b.x - p.x) < REACH_X && b.y < 2.8;
}

// Un paso. Devuelve null o el punto que se definió: { winner, why }.
export function stepRally(r, dt = STEP) {
  if (r.over) return null;
  const b = r.ball;
  // Los jugadores van solos hacia donde va a pasar la pelota (a lo ancho).
  for (const side of [0, 1]) {
    const p = r.players[side];
    const want = r.serving && r.last === side ? b.x - (side === 0 ? 0.6 : -0.6) : Math.max(-HALF_W - 1, Math.min(HALF_W + 1, b.x + (side === 0 ? 0.5 : -0.5)));
    p.x += Math.max(-MOVE * dt, Math.min(MOVE * dt, want - p.x));
  }
  if (r.serving) {
    // La pelota del saque sube y baja en la mano; si nadie le pega, se vuelve a tirar.
    b.vy -= GRAVITY * dt; b.y += b.vy * dt;
    if (b.y < 0.9) { b.y = 0.9; b.vy = 4.2; r.tossAt += 1; }
    return null;
  }
  const pz = b.z;
  b.vy -= GRAVITY * dt;
  b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
  // La red.
  if (Math.sign(pz) !== Math.sign(b.z) && b.y < NET_H) {
    b.z = pz; b.vz *= -0.2; b.vx *= 0.3;
    return finish(r, 1 - r.last, 'red');
  }
  // El pique.
  if (b.y <= BALL_R && b.vy < 0) {
    b.y = BALL_R; b.vy = -b.vy * BOUNCE; b.vx *= 0.86; b.vz *= 0.86;
    const side = sideOf(b.z);
    const inside = Math.abs(b.x) <= HALF_W && Math.abs(b.z) <= HALF_L;
    if (r.bounces === 0) {
      if (side === r.last || !inside) return finish(r, 1 - r.last, inside ? 'pique propio' : 'afuera');
      r.bounces = 1; r.bounceSide = side;
    } else return finish(r, r.last, 'doble pique');
  }
  // Se fue lejos sin que nadie le pegue (pasó al jugador).
  if (Math.abs(b.z) > BASE_Z + 4 || Math.abs(b.x) > HALF_W + 8) return finish(r, r.bounces ? r.last : 1 - r.last, r.bounces ? 'no llegó' : 'afuera');
  return null;
}

function finish(r, winner, why) {
  r.over = { winner, why };
  return r.over;
}

// ─── El golpe que viene del celular ──────────────────────────────────────────
// La fuerza sale del pico de aceleración (m/s², sin la gravedad) y el lado del giro de la muñeca. Puro, para probarlo.
export const SWING_MIN = 14;       // menos que esto no es un golpe
export const SWING_MAX = 45;       // con esto o más, fuerza 1
export const SWING_COOLDOWN = 0.45; // segundos entre un golpe y el siguiente
export const swingPower = (peak) => Math.max(0, Math.min(1, (peak - SWING_MIN) / (SWING_MAX - SWING_MIN)));
