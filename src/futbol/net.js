// Sincronización en tiempo real del Fútbol. Lógica pura: sin React ni Firebase, para poder testearla.
//
// Cada pantalla es dueña de su jugador: lo mueve al instante con sus teclas y publica una foto
// compacta unas 20 veces por segundo. Los jugadores ajenos se dibujan interpolando entre las fotos
// recibidas, un poco en el pasado, así se ven suaves aunque los paquetes lleguen desparejos.
// La pelota la simula quien la tocó último; los demás la interpolan igual que a su dueño.
// El host no tiene ningún rol especial en el movimiento.

export const SEND_INTERVAL_MS = 50;   // 20 fotos por segundo por Firebase mientras hay movimiento
export const P2P_SEND_INTERVAL_MS = 15; // por conexión directa: una foto por cuadro (~60 por segundo)
// Si todos reciben por conexión directa, Firebase queda como respaldo y recibe una foto por segundo.
export const FIREBASE_BACKUP_MS = 1000;
export const HEARTBEAT_MS = 500;      // quieto, igual avisa que sigue ahí
export const MIN_DELAY_MS = 35;       // retraso con que se dibuja a un remoto antes de tener demoras medidas
// Paso fijo de la física: todas las pantallas simulan igual, tengan 60 o 144 cuadros por segundo.
export const PHYSICS_STEP_MS = 1000 / 120;
const MAX_STEPS_PER_FRAME = 8;
export const MAX_DELAY_MS = 1000;     // como mucho, esto más que la demora típica, aunque la conexión esté muy mal
// Si faltan fotos (Firebase a veces no entrega nada por medio segundo y después manda todo junto),
// el remoto se sigue simulando con la física y sus teclas hasta este límite.
export const EXTRAP_MAX_MS = 700;
export const REMOTE_SMOOTH_MS = 120;  // al llegar las fotos reales, la diferencia se funde en este tiempo
export const CLAIM_COOLDOWN_MS = 120; // entre dos reclamos de la pelota del mismo jugador
export const BALL_SMOOTH_MS = 90;     // la corrección visual de la pelota se disuelve en este tiempo
// Escrituras sin confirmar antes de empezar a descartar viejas: un segundo de fotos. Con menos, la
// latencia normal de Firebase (confirmaciones de 300 ms o más) ya frenaba el envío.
export const MAX_IN_FLIGHT = 20;

export const FIRST_COUNTDOWN_MS = 2000;
export const GOAL_PAUSE_MS = 2000;
export const KICKOFF_COUNTDOWN_MS = 1500;
export const WIN_DELAY_MS = 1800;

const BUFFER_SIZE = 40;      // 2 s de fotos: alcanza aunque el retraso llegue al máximo
const LAG_WINDOW_MS = 3000;  // para elegir el retraso se miran las demoras de los últimos 3 s...
const LAG_KEEP_MIN = 10;     // ...pero siempre al menos las 10 últimas

const round1 = (n) => Math.round(n * 10) / 10;
const round3 = (n) => Math.round(n * 1000) / 1000;
const int = (n) => Math.round(n);
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// ─── Teclas ─────────────────────────────────────────────────────────────────
// Viajan como un número de pocos bits. Sirven para seguir simulando a un remoto si sus fotos se
// atrasan: con las teclas que tenía apretadas, la física adivina muy bien por dónde va.
const INPUT_BITS = ['up', 'down', 'left', 'right', 'kick', 'shift', 'accelerate', 'brake', 'turnLeft', 'turnRight', 'boost', 'drift'];

export function packInput(input) {
  let bits = 0;
  INPUT_BITS.forEach((key, i) => {
    if (input?.[key]) bits |= 1 << i;
  });
  return bits;
}

export function unpackInput(bits) {
  const input = {};
  INPUT_BITS.forEach((key, i) => {
    if (bits & (1 << i)) input[key] = true;
  });
  return input;
}

// ─── Fotos de jugadores ─────────────────────────────────────────────────────
// Solo lo que hace falta para dibujar y chocar. Nombre y equipo ya los tiene todos en la sala.
// `m` es el número de partido y `k` el saque: una foto de otro partido o de antes del último gol
// se descarta.
export function packPlayer(p, isCar, m, k, t, input) {
  const snap = { m, k, t: int(t), x: round1(p.x), y: round1(p.y), vx: int(p.vx), vy: int(p.vy) };
  const bits = packInput(input);
  if (bits) snap.in = bits;
  if (isCar) {
    snap.a = round3(p.angle);
    snap.sa = round3(p.steerAngle || 0);
    snap.b = int(p.boost || 0);
    if (p.isBoosting) snap.bo = 1;
    if (p.isDrifting) snap.dr = 1;
    if (p.isFlipping) {
      snap.f = 1;
      snap.ft = int(p.flipTime || 0);
    }
  } else {
    if (p.isKicking) snap.ki = 1;
    if (p.stamina !== undefined && p.stamina < 100) snap.st = int(p.stamina);
  }
  return snap;
}

// ¿Cambió algo además de la hora? Si no, no hace falta mandarla (salvo el latido).
export function sameMotion(a, b) {
  if (!a || !b) return false;
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key !== 't' && a[key] !== b[key]) return false;
  }
  return true;
}

export function applyPlayerSnapshot(target, snap, isCar) {
  target.x = snap.x;
  target.y = snap.y;
  target.vx = snap.vx;
  target.vy = snap.vy;
  if (isCar) {
    target.angle = snap.a;
    target.steerAngle = snap.sa ?? 0;
    target.boost = snap.b ?? 0;
    target.isBoosting = Boolean(snap.bo);
    target.isDrifting = Boolean(snap.dr);
    target.isFlipping = Boolean(snap.f);
    target.flipTime = snap.ft ?? 0;
    target.speed = snap.vx * Math.cos(snap.a) + snap.vy * Math.sin(snap.a);
  } else {
    target.isKicking = Boolean(snap.ki);
    target.stamina = snap.st ?? 100;
  }
}

// ─── Fotos de la pelota ─────────────────────────────────────────────────────
// `o` es quien la simula y `s` cuántas veces cambió de dueño en este saque.
export function packBall(ball, m, k, owner, seq, t) {
  return { m, k, t: int(t), o: owner, s: seq, x: round1(ball.x), y: round1(ball.y), vx: int(ball.vx), vy: int(ball.vy) };
}

// ¿El reclamo `a` le gana al `b`? Gana el que tiene más cambios de dueño; si empatan (dos tocaron a
// la vez), el id mayor. Las dos pantallas llegan a la misma conclusión sin hablar entre ellas.
export function claimBeats(a, b) {
  if (!b) return true;
  if (a.s !== b.s) return a.s > b.s;
  return String(a.o) > String(b.o);
}

// ─── Cuerpos remotos: búfer de fotos e interpolación ────────────────────────
// `lags` guarda cuánto tardaron en llegar las últimas fotos; con eso se elige a qué distancia en el
// pasado dibujar, para tener casi siempre dos fotos entre las cuales interpolar.
export function createRemote() {
  return { snaps: [], lags: [], delay: null };
}

// `countLag: false` para una copia de respaldo que llegó por Firebase cuando con ese jugador hay
// conexión directa: la foto puede entrar al búfer, pero su demora no es la del camino que se está
// usando y no tiene que decidir cuánto atrasar el dibujo.
export function receiveSnapshot(remote, snap, serverNow, countLag = true) {
  const snaps = remote.snaps;
  let last = snaps[snaps.length - 1];
  // Otro saque u otro partido: vuelve a su lugar de golpe, no se desliza por la cancha.
  if (last && (snap.k !== last.k || snap.m !== last.m)) {
    snaps.length = 0;
    last = undefined;
  }
  if (last && snap.t <= last.t) return false; // repetida o desordenada
  // Si estuvo quieto (sin fotos salvo el latido), se agrega una copia de la última justo antes de
  // la nueva: así el arranque se interpola en un intervalo normal y no se estira. Si se estaba
  // moviendo y se perdió una foto, conviene interpolar a través del hueco.
  const wasStill = last && Math.hypot(last.vx, last.vy) < 1;
  if (wasStill && snap.t - last.t > SEND_INTERVAL_MS * 3) {
    snaps.push({ ...last, t: snap.t - SEND_INTERVAL_MS });
  }
  snaps.push(snap);
  if (snaps.length > BUFFER_SIZE) snaps.splice(0, snaps.length - BUFFER_SIZE);

  // La ventana es por tiempo y no por cantidad: con el jugador quieto llega una foto cada medio
  // segundo, y un pico viejo no tiene que seguir pesando medio minuto después.
  if (!countLag) return true;
  // `gap` es cada cuánto manda fotos: por conexión directa, mucho más seguido que por Firebase.
  const gap = last ? snap.t - last.t : SEND_INTERVAL_MS;
  remote.lags.push({ lag: serverNow - snap.t, at: serverNow, gap });
  while (remote.lags.length > LAG_KEEP_MIN && remote.lags[0].at < serverNow - LAG_WINDOW_MS) remote.lags.shift();
  return true;
}

// Primera foto que llega por conexión directa: lo medido hasta ahí vino por Firebase, con mucha más
// demora. Si no se olvida, con el jugador quieto (una foto cada medio segundo) esas demoras viejas
// seguían mandando varios segundos y se lo dibujaba con 400 ms de atraso en vez de 50.
export function switchToDirect(remote) {
  if (remote.direct) return false;
  remote.direct = true;
  remote.lags.length = 0;
  remote.delay = null;
  return true;
}

// Cuánto en el pasado conviene dibujar. Firebase entrega las fotos en ráfagas (a veces llegan
// varias juntas, la más vieja con bastante demora), así que no alcanza con el promedio: se usa el
// percentil 95. Una ráfaga de fotos tardías lo sube; un pico aislado, no. Encima se suma cuánto
// hay entre dos fotos (la mediana), para tener casi siempre una foto más nueva que la que se dibuja.
export function targetDelay(remote) {
  if (remote.lags.length === 0) return MIN_DELAY_MS + SEND_INTERVAL_MS;
  const lags = remote.lags.map((l) => l.lag).sort((a, b) => a - b);
  const p95 = lags[Math.min(lags.length - 1, Math.floor(lags.length * 0.95))];
  const gaps = remote.lags.map((l) => clamp(l.gap ?? SEND_INTERVAL_MS, 1, SEND_INTERVAL_MS)).sort((a, b) => a - b);
  const gap = gaps[Math.floor(gaps.length / 2)];
  // Las demoras se miden con la hora de servidor que estima cada pantalla, y esas estimaciones
  // pueden diferir cientos de ms: todo el valor queda corrido por esa diferencia, que se compensa
  // sola al restar. Por eso los topes van relativos a lo medido y nunca absolutos: con un piso fijo,
  // si el reloj propio estaba atrás, el piso convertía la diferencia de relojes en atraso de verdad
  // (se dibujaba al otro ~300 ms tarde con una conexión directa de 15 ms).
  const median = lags[Math.floor(lags.length / 2)];
  return Math.min(p95 + gap + 15, median + MAX_DELAY_MS);
}

// Cuántos pasos fijos de física tocan en este cuadro. Lo que sobra queda para el cuadro siguiente,
// y `alpha` dice cuánto se avanzó hacia el próximo paso (sirve para dibujar entre dos pasos).
// Si la pestaña estuvo trabada, no se intenta recuperar todo: se descarta lo que pase del tope.
export function fixedSteps(clock, dt) {
  clock.acc = (clock.acc || 0) + dt;
  let steps = Math.floor(clock.acc / PHYSICS_STEP_MS);
  if (steps > MAX_STEPS_PER_FRAME) {
    steps = MAX_STEPS_PER_FRAME;
    clock.acc = PHYSICS_STEP_MS * steps;
  }
  clock.acc -= steps * PHYSICS_STEP_MS;
  return { steps, alpha: clock.acc / PHYSICS_STEP_MS };
}

// El retraso sube rápido (si faltan fotos, el remoto se vería congelado) y baja más despacio (para
// no oscilar): 100 ms por segundo, así después de un pico de la red se recupera en pocos segundos.
// Mientras sube, el reloj del remoto corre más lento un momento; mientras baja, un 10% más rápido.
// Nunca salta de golpe.
export function updateDelay(remote, dt) {
  const target = targetDelay(remote);
  if (remote.delay === null || remote.lags.length < 4) remote.delay = target;
  else if (target > remote.delay) remote.delay = Math.min(target, remote.delay + dt * 0.6);
  else remote.delay = Math.max(target, remote.delay - dt * 0.1);
  return remote.delay;
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

function lerpAngle(a, b, u) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}

const LINEAR = ['x', 'y', 'vx', 'vy', 'b', 'st', 'ft'];
const ANGLES = ['a', 'sa'];

function interpolate(a, b, u) {
  const out = { ...(u < 0.5 ? a : b) };
  for (const key of LINEAR) {
    if (a[key] !== undefined && b[key] !== undefined) out[key] = lerp(a[key], b[key], u);
  }
  for (const key of ANGLES) {
    if (a[key] !== undefined && b[key] !== undefined) out[key] = lerpAngle(a[key], b[key], u);
  }
  return out;
}

// Cómo estaba el cuerpo en `renderT`. Entre dos fotos, interpola. Si todavía no llegó la foto de ese
// momento, lo sigue desde la última: `extrapolate(ultima, ms)` permite usar la física de verdad (y no
// debe modificar `ultima`). Lo extrapolado vuelve marcado con `ex: true`.
export function sampleRemote(remote, renderT, extrapolate) {
  const snaps = remote.snaps;
  if (snaps.length === 0) return null;
  const first = snaps[0];
  const last = snaps[snaps.length - 1];
  if (renderT <= first.t) return { ...first };
  if (renderT >= last.t) {
    const ahead = Math.min(renderT - last.t, EXTRAP_MAX_MS);
    if (ahead <= 0) return { ...last };
    const guess = extrapolate
      ? extrapolate(last, ahead)
      : { ...last, x: last.x + (last.vx * ahead) / 1000, y: last.y + (last.vy * ahead) / 1000 };
    return { ...guess, ex: true };
  }
  for (let i = snaps.length - 1; i > 0; i--) {
    const a = snaps[i - 1];
    const b = snaps[i];
    if (renderT >= a.t) return interpolate(a, b, (renderT - a.t) / (b.t - a.t));
  }
  return { ...first };
}

// ─── Escrituras sin cola ────────────────────────────────────────────────────
// Firebase no descarta escrituras: si la conexión no da abasto, se encolan y todo llega cada vez
// más tarde. Este escritor deja como mucho `maxInFlight` sin confirmar; si hay más, se queda solo
// con la más nueva y la manda apenas se libera un lugar. Nunca se acumulan fotos viejas.
export function latestWriter(write, maxInFlight = MAX_IN_FLIGHT) {
  let inFlight = 0;
  let pending = null;
  const send = (data) => {
    inFlight += 1;
    Promise.resolve()
      .then(() => write(data))
      .catch(() => {})
      .finally(() => {
        inFlight -= 1;
        if (pending !== null) {
          const next = pending;
          pending = null;
          send(next);
        }
      });
  };
  const writer = (data) => {
    if (inFlight >= maxInFlight) pending = data;
    else send(data);
  };
  writer.stats = () => ({ inFlight, pending: pending !== null });
  return writer;
}

// ─── Estado del partido ─────────────────────────────────────────────────────
// Lo comparten todos en `futbol/{sala}/match`, con horas del servidor, así el reloj, los festejos y
// las cuentas regresivas pasan al mismo tiempo en todas las pantallas.
//   m: número de partido · k: saque (sube con cada gol) · at: hora en que se juega
//   c: reloj del partido en `at` (lo que queda, o lo transcurrido si es sin límite)
//   g, gt: último gol · sr, sb: marcador · end: hora de fin si alguien llegó a los goles
export function initialMatch(m, serverNow, clockMs) {
  return { m, k: 0, at: serverNow + FIRST_COUNTDOWN_MS, c: clockMs, g: '', gt: 0, sr: 0, sb: 0, end: 0 };
}

export function clockAt(match, serverNow, timed) {
  const played = Math.max(0, serverNow - match.at);
  return timed ? Math.max(0, match.c - played) : match.c + played;
}

export function goalMatch(match, team, serverNow, timed, goalsToWin) {
  const sr = match.sr + (team === 'red' ? 1 : 0);
  const sb = match.sb + (team === 'blue' ? 1 : 0);
  const won = goalsToWin > 0 && (sr >= goalsToWin || sb >= goalsToWin);
  return {
    ...match,
    k: match.k + 1,
    g: team,
    gt: serverNow,
    at: serverNow + GOAL_PAUSE_MS + KICKOFF_COUNTDOWN_MS,
    c: clockAt(match, serverNow, timed),
    sr,
    sb,
    end: won ? serverNow + WIN_DELAY_MS : 0,
  };
}

// Qué pasa ahora: 'goal' (festejo), 'countdown', 'playing' o 'ended'.
export function matchPhase(match, serverNow, timed) {
  if (match.end && serverNow >= match.end) return { phase: 'ended', clock: match.c };
  if (match.gt && serverNow < match.gt + GOAL_PAUSE_MS) return { phase: 'goal', clock: match.c };
  if (serverNow < match.at) return { phase: 'countdown', clock: match.c, left: match.at - serverNow };
  const clock = clockAt(match, serverNow, timed);
  if (timed && clock <= 0) return { phase: 'ended', clock: 0 };
  return { phase: 'playing', clock };
}
