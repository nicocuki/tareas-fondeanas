// Tenis Movido: la pelota y las reglas del punto, puras (sin dibujo ni red). Solo una pantalla las corre (la del anfitrión).
// Ejes: x a lo ancho, z a lo largo (el equipo 0 está en z > 0, el 1 en z < 0), y para arriba.
//
// Jugadores: en el 1v1 hay dos (índice 0 = equipo 0, 1 = equipo 1). En el 2v2 hay cuatro: 0 y 1 al fondo
// (los que sacan), 2 y 3 en la red. El equipo de cada uno es `índice % 2`.
export const STEP = 1 / 120;
export const HALF_W = 4.6;     // medio ancho de la cancha (un poco más generoso que el single)
export const HALF_W2 = 5.5;    // en el 2v2 se juega con los pasillos
export const HALF_L = 11.9;    // medio largo
export const NET_H = 0.95;
export const BALL_R = 0.07;
export const GRAVITY = 9.8;
export const BOUNCE = 0.72;
export const BASE_Z = 12.6;    // dónde se paran los del fondo (detrás de la línea)
export const NET_Z = 4.6;      // dónde se paran los de la red en el 2v2
export const MOVE = 6.5;       // m/s que se mueve solo cada jugador para ir a la pelota
export const REACH_Z = 1.7;    // qué tan cerca (a lo largo) tiene que pasar la pelota para poder pegarle
export const REACH_X = 1.9;
export const SWING_WINDOW = 0.28; // un golpe que llegó hace menos de esto todavía sirve si la pelota entra al alcance
export const BALL_SPEED = 11;     // velocidad de un golpe flojo (m/s); uno con fuerza 1 suma BALL_SPEED_PLUS
export const BALL_SPEED_PLUS = 9;

export const teamOf = (i) => i % 2;
export const isNet = (i) => i >= 2;
export const sideZ = (team) => (team === 0 ? BASE_Z : -BASE_Z);
export const sideOf = (z) => (z > 0 ? 0 : 1);
export const halfWidth = (r) => (r.players.length > 2 ? HALF_W2 : HALF_W);

// Dónde se para cada jugador cuando arranca el punto.
function homeOf(i, count) {
  const team = teamOf(i), dir = team === 0 ? 1 : -1;
  if (count <= 2) return { x: team === 0 ? 0.6 : -0.6, z: sideZ(team) };
  return isNet(i) ? { x: dir * -1.6, z: dir * NET_Z } : { x: dir * 1.4, z: sideZ(team) };
}

export function newRally(server, count = 2) {
  const players = [];
  for (let i = 0; i < count; i++) players.push({ ...homeOf(i, count), team: teamOf(i) });
  const s = players[server];
  const z = s.z - Math.sign(s.z) * 0.6;
  return {
    ball: { x: s.x + (server === 0 ? 0.6 : -0.6), y: 1.0, z, vx: 0, vy: 4.2, vz: 0 }, // la pelota sube del saque
    players, server, last: server, lastTeam: teamOf(server), serving: true, bounces: 0, bounceSide: -1, over: null, hits: 0, tossAt: 0,
  };
}

// Le pega el jugador `who` con `power` (0 a 1) y `aim` (-1 a 1: para dónde va a lo ancho). Calcula la velocidad para que pique en la otra mitad.
export function hitBall(r, who, power, aim) {
  const b = r.ball;
  const team = teamOf(who);
  const dir = team === 0 ? -1 : 1;
  const hw = halfWidth(r);
  const depth = 5 + power * 5.5;                        // cuanto más fuerte, más al fondo
  const tx = Math.max(-hw + 0.6, Math.min(hw - 0.6, aim * (hw - 1)));
  const tz = dir * depth;
  const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz);
  const speed = BALL_SPEED + power * BALL_SPEED_PLUS;
  const T = d / speed;
  b.vx = dx / T; b.vz = dz / T;
  b.vy = (BALL_R - b.y + 0.5 * GRAVITY * T * T) / T;
  // Que pase la red: si la parábola queda baja en z = 0, se la levanta un poco.
  const tNet = Math.abs(b.z / b.vz);
  const yNet = b.y + b.vy * tNet - 0.5 * GRAVITY * tNet * tNet;
  if (yNet < NET_H + 0.25) b.vy += (NET_H + 0.25 - yNet) / tNet;
  r.last = who; r.lastTeam = team; r.serving = false; r.bounces = 0; r.bounceSide = -1; r.hits += 1;
}

// ¿Puede pegarle el jugador `who` ahora? (la pelota viene hacia su lado y está a su alcance)
export function canReach(r, who) {
  const b = r.ball, p = r.players[who];
  if (r.over || !p) return false;
  if (r.serving) return r.server === who && b.vy < 1.5 && b.y > 0.6 && b.y < 2.6; // el saque: le pega cuando la pelota baja
  const team = teamOf(who);
  const coming = team === 0 ? b.vz > 0 : b.vz < 0;
  return coming && r.lastTeam !== team && Math.abs(b.z - p.z) < REACH_Z && Math.abs(b.x - p.x) < REACH_X && b.y < 2.8;
}

// Un paso. Devuelve null o el punto que se definió: { winner (equipo), why }.
export function stepRally(r, dt = STEP) {
  if (r.over) return null;
  const b = r.ball;
  const hw = halfWidth(r);
  const two = r.players.length > 2;
  // Los jugadores van solos hacia donde va a pasar la pelota (a lo ancho). En el 2v2, cada uno cubre su mitad.
  r.players.forEach((p, i) => {
    let want;
    if (r.serving && r.server === i) want = b.x - (p.team === 0 ? 0.6 : -0.6);
    else if (r.serving) want = homeOf(i, r.players.length).x;
    else {
      want = b.x + (p.team === 0 ? 0.5 : -0.5);
      if (two) {
        const mate = r.players[(i + 2) % 4];
        const left = p.x < mate.x || (p.x === mate.x && i < 2);
        want = left ? Math.min(want, 0.6) : Math.max(want, -0.6);
      }
      want = Math.max(-hw - 1, Math.min(hw + 1, want));
    }
    p.x += Math.max(-MOVE * dt, Math.min(MOVE * dt, want - p.x));
  });
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
    return finish(r, 1 - r.lastTeam, 'red');
  }
  // El pique.
  if (b.y <= BALL_R && b.vy < 0) {
    b.y = BALL_R; b.vy = -b.vy * BOUNCE; b.vx *= 0.86; b.vz *= 0.86;
    const side = sideOf(b.z);
    const inside = Math.abs(b.x) <= hw && Math.abs(b.z) <= HALF_L;
    if (r.bounces === 0) {
      if (side === r.lastTeam || !inside) return finish(r, 1 - r.lastTeam, inside ? 'pique propio' : 'afuera');
      r.bounces = 1; r.bounceSide = side;
    } else return finish(r, r.lastTeam, 'doble pique');
  }
  // Se fue lejos sin que nadie le pegue (pasó al jugador).
  if (Math.abs(b.z) > BASE_Z + 4 || Math.abs(b.x) > hw + 8) return finish(r, r.bounces ? r.lastTeam : 1 - r.lastTeam, r.bounces ? 'no llegó' : 'afuera');
  return null;
}

function finish(r, winner, why) {
  r.over = { winner, why };
  return r.over;
}

// ─── Para mandar la pelota y los jugadores a las otras pantallas (online) ────
const q = (v) => Math.round(v * 100) / 100;
export const packRally = (r) => ({ b: [q(r.ball.x), q(r.ball.y), q(r.ball.z)], p: r.players.map((p) => [q(p.x), q(p.z)]), s: r.serving ? r.server : -1, o: r.over ? [r.over.winner, r.over.why] : null });
export function unpackRally(snap, prev) {
  const r = prev && prev.players.length === snap.p.length ? prev : newRally(Math.max(0, snap.s), snap.p.length);
  r.ball.x = snap.b[0]; r.ball.y = snap.b[1]; r.ball.z = snap.b[2];
  snap.p.forEach(([x, z], i) => { r.players[i].x = x; r.players[i].z = z; });
  r.serving = snap.s >= 0; if (snap.s >= 0) r.server = snap.s;
  r.over = snap.o ? { winner: snap.o[0], why: snap.o[1] } : null;
  return r;
}

// ─── El golpe que viene del celular ──────────────────────────────────────────
// La fuerza sale del pico de aceleración (m/s², sin la gravedad) y el lado del giro de la muñeca. Puro, para probarlo.
export const SWING_MIN = 14;       // menos que esto no es un golpe
export const SWING_MAX = 45;       // con esto o más, fuerza 1
export const SWING_COOLDOWN = 0.45; // segundos entre un golpe y el siguiente
export const swingPower = (peak) => Math.max(0, Math.min(1, (peak - SWING_MIN) / (SWING_MAX - SWING_MIN)));
