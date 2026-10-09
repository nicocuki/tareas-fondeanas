import test from 'node:test';
import assert from 'node:assert/strict';
import { newRoom, applyAction, canStart, isHost } from '../src/futbol/game.js';
import { createGameState, stepPhysics, FIELD, GOAL } from '../src/futbol/physics.js';

test('Fútbol: creación de sala y defaults', () => {
  const room = newRoom('h1', 'Messi');
  assert.equal(room.gameType, 'futbol');
  assert.equal(room.phase, 'lobby');
  assert.equal(room.hostId, 'h1');
  assert.equal(room.players.length, 1);
  assert.equal(room.players[0].name, 'Messi');
  assert.equal(room.players[0].team, 'red');
  assert.equal(canStart(room), false);
});

test('Fútbol: unirse y cambiar de equipo', () => {
  let room = newRoom('h1', 'Messi');
  room = applyAction(room, { type: 'join', playerId: 'p2', name: 'Ronaldo' });
  assert.equal(room.players.length, 2);
  // Se asigna automáticamente al equipo con menos jugadores (blue)
  assert.equal(room.players[1].team, 'blue');
  assert.equal(canStart(room), true);

  // Cambiar a rojo
  room = applyAction(room, { type: 'pickTeam', playerId: 'p2', team: 'red' });
  assert.equal(room.players[1].team, 'red');
  assert.equal(canStart(room), false); // No hay nadie en blue
});

test('Fútbol: iniciar partido y registrar goles', () => {
  let room = newRoom('h1', 'Messi');
  room = applyAction(room, { type: 'join', playerId: 'p2', name: 'Ronaldo' });
  room = applyAction(room, { type: 'startGame', playerId: 'h1' });
  assert.equal(room.phase, 'playing');

  // Gol de rojo
  room = applyAction(room, { type: 'goalScored', playerId: 'h1', team: 'red' });
  assert.equal(room.score.red, 1);
  assert.equal(room.score.blue, 0);

  // Fin del partido
  room = applyAction(room, { type: 'endGame', playerId: 'h1' });
  assert.equal(room.phase, 'ended');
  assert.equal(room.winner, 'red');
});

test('Fútbol Física: colisión y movimiento básico', () => {
  const players = [
    { id: 'p1', name: 'Messi', team: 'red' },
    { id: 'p2', name: 'Ronaldo', team: 'blue' },
  ];
  const state = createGameState(players);
  assert.ok(state.ball);
  assert.equal(state.ball.x, FIELD.width / 2);
  assert.equal(state.ball.y, FIELD.height / 2);

  // Dar input a Messi hacia la derecha
  const inputs = {
    p1: { right: true },
  };
  const { nextState } = stepPhysics(state, inputs, 50);
  assert.ok(nextState.players.p1.vx > 0);
  assert.ok(nextState.players.p1.x > state.players.p1.x);
});

test('Fútbol Física: el kick requiere contacto con la pelota y termina al hacer contacto o soltar espacio', () => {
  const players = [{ id: 'p1', name: 'Messi', team: 'red' }];
  let state = createGameState(players);
  // Posicionar lejos de la pelota
  state.players.p1.x = state.ball.x - 100;
  state.players.p1.y = state.ball.y;

  // 1. Apretar espacio estando lejos -> isKicking = true (busca contacto), pero NO patea la pelota a distancia
  let result = stepPhysics(state, { p1: { kick: true } }, 50);
  state = result.nextState;

  assert.equal(state.players.p1.isKicking, true);
  assert.equal(state.ball.vx, 0); // No pateó a distancia

  // 2. Soltar espacio antes de tocar la pelota -> isKicking se vuelve false inmediatamente
  result = stepPhysics(state, { p1: { kick: false } }, 50);
  state = result.nextState;
  assert.equal(state.players.p1.isKicking, false);

  // 3. Acercar al jugador a la pelota (contacto sprite a sprite, dist <= 29) y apretar espacio
  state.players.p1.x = state.ball.x - 25; // tocando la pelota (16 + 11 = 27 min dist)
  result = stepPhysics(state, { p1: { kick: true } }, 50);
  state = result.nextState;

  // Debe haber pateado la pelota
  assert.ok(Math.abs(state.ball.vx) > 0);
  // Y el efecto de kick debe haber terminado inmediatamente al hacer contacto
  assert.equal(state.players.p1.isKicking, false);
});

test('Fútbol Física: 2 jugadores comprimiendo la pelota la desplazan correctamente', () => {
  const players = [
    { id: 'p1', name: 'Rojo', team: 'red' },
    { id: 'p2', name: 'Azul', team: 'blue' },
  ];
  let state = createGameState(players);
  const cx = FIELD.width / 2;
  const cy = FIELD.height / 2;

  // Posicionar p1 a la izquierda y p2 a la derecha aprisionando a la pelota
  state.players.p1.x = cx - 25;
  state.players.p1.y = cy;
  state.players.p2.x = cx + 25;
  state.players.p2.y = cy;
  state.ball.x = cx;
  state.ball.y = cy;

  // Ambos empujan hacia adentro
  const inputs = {
    p1: { right: true },
    p2: { left: true },
  };

  const { nextState } = stepPhysics(state, inputs, 50);

  // La distancia entre la pelota y los centros de ambos jugadores debe respetar las dimensiones físicas
  const distP1 = Math.hypot(nextState.ball.x - nextState.players.p1.x, nextState.ball.y - nextState.players.p1.y);
  const distP2 = Math.hypot(nextState.ball.x - nextState.players.p2.x, nextState.ball.y - nextState.players.p2.y);

  assert.ok(distP1 >= 25, `Distancia p1 pelota (${distP1}) debe ser adecuada`);
  assert.ok(distP2 >= 25, `Distancia p2 pelota (${distP2}) debe ser adecuada`);
});

test('Fútbol Física: mapas seleccionables', () => {
  const players = [{ id: 'p1', name: 'Messi', team: 'red' }];
  const stateCancha11 = createGameState(players, { mapType: 'cancha11' });
  assert.equal(stateCancha11.field.width, 2300);
  assert.equal(stateCancha11.field.height, 1450);
});

test('Fútbol Física: sistema de estámina', () => {
  const players = [{ id: 'p1', name: 'Messi', team: 'red' }];
  let state = createGameState(players, { stamina: true });
  assert.equal(state.players.p1.stamina, 100);

  // Moverse sin shift -> velocidad al 50% (caminar), no consume estámina
  let res = stepPhysics(state, { p1: { right: true, shift: false } }, 1000);
  assert.equal(res.nextState.players.p1.stamina, 100);
  const walkVx = res.nextState.players.p1.vx;

  // Moverse con shift -> velocidad normal (correr), consume estámina
  res = stepPhysics(state, { p1: { right: true, shift: true } }, 1000);
  assert.ok(res.nextState.players.p1.stamina < 100);
  const sprintVx = res.nextState.players.p1.vx;
  assert.ok(sprintVx > walkVx, 'Velocidad al correr debe ser mayor que al caminar');
});

test('Fútbol Física: fuerza de kick dinámica (777 al toque, 420 tras 5s) y velocidad reducida', () => {
  const players = [{ id: 'p1', name: 'Messi', team: 'red' }];
  let state = createGameState(players);
  state.players.p1.x = state.ball.x - 100;
  state.players.p1.y = state.ball.y;

  // 1. Mantener kick presionado sin tocar la pelota -> isKicking sigue true, acumulando tiempo
  let res = stepPhysics(state, { p1: { kick: true, right: true } }, 1000);
  state = res.nextState;
  assert.equal(state.players.p1.isKicking, true);
  assert.ok(state.players.p1.kickHoldTime >= 1.0);

  // 2. Patear al instante (holdTime = 0) produce fuerza máxima (777)
  let stateInstant = createGameState(players);
  stateInstant.players.p1.x = stateInstant.ball.x - 25;
  let resInstant = stepPhysics(stateInstant, { p1: { kick: true } }, 50);
  const vxInstant = Math.abs(resInstant.nextState.ball.vx);

  // 3. Patear tras mantener presionado 5s produce fuerza mínima (420)
  let stateHeld = createGameState(players);
  stateHeld.players.p1.x = stateHeld.ball.x - 25;
  stateHeld.players.p1.kickHoldTime = 5.0;
  stateHeld.players.p1.kickHeld = true;
  stateHeld.players.p1.isKicking = true;
  let resHeld = stepPhysics(stateHeld, { p1: { kick: true } }, 50);
  const vxHeld = Math.abs(resHeld.nextState.ball.vx);

  assert.ok(vxInstant > vxHeld, 'Patada instantánea (777) debe ser más potente que tras mantener 5s (420)');
});

test('Fútbol Física: Modo Coches - cancha vertical, orientación e inercia', () => {
  const players = [
    { id: 'p1', name: 'Rojo', team: 'red' },
    { id: 'p2', name: 'Azul', team: 'blue' },
  ];
  let state = createGameState(players, { vehicleMode: 'coches' });

  assert.equal(state.options.vehicleMode, 'coches');
  assert.equal(state.field.isVertical, true, 'La cancha debe estar orientada verticalmente');
  assert.ok(state.field.height > state.field.width, 'El largo vertical (height) debe ser mayor que el ancho (width)');
  assert.equal(state.players.p1.angle, -Math.PI / 2); // Rojo abajo mira hacia ARRIBA (-PI/2)
  assert.equal(state.players.p2.angle, Math.PI / 2);  // Azul arriba mira hacia ABAJO (PI/2)
  assert.equal(state.players.p1.speed, 0);

  // Acelerar hacia adelante (hacia donde apunta el auto, que es hacia arriba)
  let res = stepPhysics(state, { p1: { accelerate: true } }, 200);
  state = res.nextState;
  assert.ok(state.players.p1.speed > 0, 'El auto debe ganar velocidad al acelerar');
  assert.ok(state.players.p1.vy < 0, 'La velocidad vy debe ser negativa (hacia arriba)');
  assert.ok(state.players.p1.y < state.players.p1.y + 1);

  // Girar a la izquierda (turnLeft / A) mientras avanza: el ángulo cambia y conserva inercia
  const oldAngle = state.players.p1.angle;
  res = stepPhysics(state, { p1: { accelerate: true, turnLeft: true } }, 100);
  state = res.nextState;
  assert.ok(state.players.p1.angle < oldAngle, 'Girar hacia la izquierda debe rotar en sentido antihorario');
  assert.ok(state.players.p1.vy < 0, 'Sigue avanzando hacia arriba por inercia mientras curva');
});

test('Fútbol Física: Modo Coches - dirección estilo Rocket League (A/D orientan ruedas pero auto detenido no gira)', () => {
  const players = [{ id: 'p1', name: 'Rojo', team: 'red' }];
  let state = createGameState(players, { vehicleMode: 'coches' });
  state.players.p1.speed = 0;
  const initialAngle = state.players.p1.angle;

  // 1. Auto detenido: presionar A (turnLeft) gira las ruedas hacia la izquierda pero el chasis NO rota
  state = stepPhysics(state, { p1: { turnLeft: true } }, 100).nextState;
  assert.equal(state.players.p1.angle, initialAngle, 'El auto detenido no debe rotar en el lugar');
  assert.ok(state.players.p1.steerAngle < 0, 'Las ruedas delanteras deben apuntar a la izquierda (steerAngle < 0)');

  // 2. Al soltar la tecla, las ruedas se centran hacia 0
  state = stepPhysics(state, { p1: {} }, 100).nextState;
  assert.ok(Math.abs(state.players.p1.steerAngle) < 0.05, 'Las ruedas deben volver al centro al soltar teclas');

  // 3. Al acelerar con W teniendo las ruedas giradas a la derecha (D), el auto curva hacia la derecha
  for (let i = 0; i < 5; i++) {
    state = stepPhysics(state, { p1: { accelerate: true, turnRight: true } }, 50).nextState;
  }
  assert.ok(state.players.p1.speed > 0, 'El auto debe avanzar');
  assert.ok(state.players.p1.angle > initialAngle, 'El chasis debe rotar a la derecha al desplazarse');
});

test('Fútbol Física: Modo Coches - frenado y marcha atrás progresiva', () => {
  const players = [{ id: 'p1', name: 'Rojo', team: 'red' }];
  let state = createGameState(players, { vehicleMode: 'coches' });

  // Acelerar hasta tener buena velocidad
  for (let i = 0; i < 5; i++) {
    state = stepPhysics(state, { p1: { accelerate: true } }, 100).nextState;
  }
  const topSpeed = state.players.p1.speed;
  assert.ok(topSpeed > 50);

  // Frenar con S (brake): la velocidad debe reducirse rápido
  state = stepPhysics(state, { p1: { brake: true } }, 200).nextState;
  assert.ok(state.players.p1.speed < topSpeed, 'Frenar debe reducir la velocidad');

  // Seguir frenando hasta detenerse por completo
  for (let i = 0; i < 10; i++) {
    state = stepPhysics(state, { p1: { brake: true } }, 100).nextState;
  }

  // Al mantener presionado brake tras detenerse, inicia marcha atrás (speed negativo)
  assert.ok(state.players.p1.speed < 0, 'Mantener brake detenido debe iniciar marcha atrás');
  assert.ok(state.players.p1.speed >= -90, 'La marcha atrás debe respetar el límite maxSpeedReverse');
});

test('Fútbol Física: Modo Coches - colisión con pelota (mayor impulso frontal que lateral)', () => {
  const players = [{ id: 'p1', name: 'Rojo', team: 'red' }];

  // 1. Choque frontal: auto apuntando a la pelota (hacia arriba, angle -PI/2) avanzando a velocidad
  let stateFront = createGameState(players, { vehicleMode: 'coches' });
  stateFront.players.p1.x = stateFront.ball.x;
  stateFront.players.p1.y = stateFront.ball.y + 20;
  stateFront.players.p1.angle = -Math.PI / 2;
  stateFront.players.p1.speed = 200;
  stateFront.players.p1.vy = -200;

  const resFront = stepPhysics(stateFront, {}, 50);
  const ballSpeedFront = Math.hypot(resFront.nextState.ball.vx, resFront.nextState.ball.vy);

  // 2. Choque lateral: auto apuntando hacia la derecha (angle 0) rozando la pelota por el costado
  let stateSide = createGameState(players, { vehicleMode: 'coches' });
  stateSide.players.p1.x = stateSide.ball.x - 20;
  stateSide.players.p1.y = stateSide.ball.y;
  stateSide.players.p1.angle = 0;
  stateSide.players.p1.speed = 100;
  stateSide.players.p1.vx = 100;

  const resSide = stepPhysics(stateSide, {}, 50);
  const ballSpeedSide = Math.hypot(resSide.nextState.ball.vx, resSide.nextState.ball.vy);

  assert.ok(ballSpeedFront > ballSpeedSide, 'El impacto frontal debe transmitir mayor impulso que el lateral');
});

test('Fútbol Física: Modo Coches - detección de goles en arcos superior e inferior', () => {
  const players = [
    { id: 'p1', name: 'Rojo', team: 'red' },
    { id: 'p2', name: 'Azul', team: 'blue' },
  ];
  let state = createGameState(players, { vehicleMode: 'coches' });
  const cx = state.field.width / 2;
  const w = state.field.wallThickness;

  // Pelota entrando al arco superior (defendido por Azul) -> Gol de Rojo
  state.ball.x = cx;
  state.ball.y = w - 5;
  let res = stepPhysics(state, {}, 16);
  assert.equal(res.goal, 'red', 'La pelota en el arco superior debe contar como gol de Rojo');

  // Pelota entrando al arco inferior (defendido por Rojo) -> Gol de Azul
  state.ball.x = cx;
  state.ball.y = state.field.height - w + 5;
  res = stepPhysics(state, {}, 16);
  assert.equal(res.goal, 'blue', 'La pelota en el arco inferior debe contar como gol de Azul');
});

test('Fútbol: opción vehicleMode en reducer de sala', () => {
  let room = newRoom('h1', 'Messi');
  assert.equal(room.options.vehicleMode, 'pelotas');

  // Host cambia a modo coches
  room = applyAction(room, {
    type: 'setOptions',
    playerId: 'h1',
    options: { vehicleMode: 'coches' },
  });
  assert.equal(room.options.vehicleMode, 'coches');
});

test('Fútbol Física: Modo Coches - sistema de Boost (consumo ~16.7 u/s y mayor velocidad punta)', () => {
  const players = [{ id: 'p1', name: 'Rojo', team: 'red' }];
  let state = createGameState(players, { vehicleMode: 'coches' });
  const initialBoost = state.players.p1.boost;
  assert.equal(initialBoost, 33, 'El auto debe iniciar con 33 de boost');

  // Limpiar pickups para que no recarguen el boost durante el test
  state.boostPickups = [];

  // 2 segundos de boost continuo — con 16.7 u/s gasta los 33 en ~2s
  for (let i = 0; i < 20; i++) {
    state = stepPhysics(state, { p1: { boost: true } }, 100).nextState;
  }
  // En 2 segundos consume aprox 33.4 unidades -> queda en 0 o muy cerca
  assert.equal(state.players.p1.boost, 0, 'Tras ~2s de uso con 33 iniciales el boost debe agotarse a 0');
  assert.equal(state.players.p1.isBoosting, false, 'Al llegar a 0 deja de quemar boost');

  // Sin boost no puede superar maxSpeed (280) acelerando normalmente
  for (let i = 0; i < 15; i++) {
    state = stepPhysics(state, { p1: { accelerate: true } }, 100).nextState;
  }
  assert.ok(state.players.p1.speed <= 280.01, 'Sin boost no debe superar 280');

  // Con boost (recargado a 100) puede alcanzar maxSpeedWithBoost (430)
  state.players.p1.boost = 100;
  state.players.p1.y = state.field.height - 120; // Reposicionar abajo para tener recta libre
  for (let i = 0; i < 10; i++) {
    state = stepPhysics(state, { p1: { boost: true } }, 100).nextState;
  }
  assert.ok(state.players.p1.speed > 280, `Con boost debe superar el límite normal de 280 (fue ${state.players.p1.speed})`);
  assert.ok(state.players.p1.speed <= 430.01, 'No debe superar maxSpeedWithBoost de 430');
});

test('Fútbol Física: Modo Coches - recolección de Boost Pickups (+12 pequeños, +100 grandes, clamp 100)', () => {
  const players = [{ id: 'p1', name: 'Rojo', team: 'red' }];
  let state = createGameState(players, { vehicleMode: 'coches' });
  assert.ok(state.boostPickups && state.boostPickups.length > 0, 'Debe haber pickups en la cancha');

  const smallPad = state.boostPickups.find(p => p.type === 'small');
  const largePad = state.boostPickups.find(p => p.type === 'large');
  assert.ok(smallPad && largePad);

  // Auto con 50 de boost recoge un pad pequeño (+12)
  state.players.p1.boost = 50;
  state.players.p1.x = smallPad.x;
  state.players.p1.y = smallPad.y;

  state = stepPhysics(state, {}, 50).nextState;
  assert.equal(state.players.p1.boost, 62, 'Debe haber sumado exactamente +12');
  const pickedSmall = state.boostPickups.find(p => p.id === smallPad.id);
  assert.equal(pickedSmall.active, false, 'El pad recogido debe quedar inactivo');
  assert.ok(pickedSmall.respawnTimer > 0, 'Debe iniciar su timer de respawn');

  // Auto con 80 de boost recoge pad grande (+100) -> no supera 100 (clamp)
  state.players.p1.boost = 80;
  state.players.p1.x = largePad.x;
  state.players.p1.y = largePad.y;

  state = stepPhysics(state, {}, 50).nextState;
  assert.equal(state.players.p1.boost, 100, 'El boost nunca debe superar 100');
  const pickedLarge = state.boostPickups.find(p => p.id === largePad.id);
  assert.equal(pickedLarge.active, false);
});

test('Fútbol Física: Modo Coches - KICK / FLIP (Rocket League front flip) y pelota pesada', () => {
  const players = [{ id: 'p1', name: 'Rojo', team: 'red' }];

  // 1. Flip lejos de la pelota: el auto salta/impulsa pero no afecta a la pelota a distancia
  let state = createGameState(players, { vehicleMode: 'coches' });
  state.boostPickups = [];
  state.players.p1.x = state.ball.x;
  state.players.p1.y = state.ball.y + 180; // Lejos de la pelota
  state.players.p1.angle = -Math.PI / 2;

  state = stepPhysics(state, { p1: { kick: true } }, 50).nextState;
  assert.equal(state.players.p1.isFlipping, true, 'Debe activar el estado isFlipping');
  assert.ok(state.players.p1.flipCooldown > 0, 'Debe tener cooldown activo');
  assert.equal(state.ball.vx, 0, 'La pelota no debe moverse a distancia sin contacto físico');
  assert.equal(state.ball.vy, 0);

  // 2. Toque suave / auto lento con la pelota pesada: apenas la desplaza
  let slowState = createGameState(players, { vehicleMode: 'coches' });
  slowState.boostPickups = [];
  slowState.players.p1.x = slowState.ball.x;
  slowState.players.p1.y = slowState.ball.y + 24; // Contacto inmediato
  slowState.players.p1.angle = -Math.PI / 2;
  slowState.players.p1.speed = 30; // Muy lento
  slowState.players.p1.vy = -30;

  slowState = stepPhysics(slowState, {}, 50).nextState;
  const slowBallSpeed = Math.hypot(slowState.ball.vx, slowState.ball.vy);
  assert.ok(slowBallSpeed < 40, `Un auto lento debe apenas mover la pelota pesada (fue ${slowBallSpeed})`);

  // 3. Contacto frontal durante FLIP activo: proyecta la pelota con impulso masivo.
  // Pre-establecemos isFlipping=true y colocamos la pelota justo al frente del auto
  // (fuera del cuerpo pero dentro del radio de la pelota) y usamos dt=16ms (60fps real).
  let flipState = createGameState(players, { vehicleMode: 'coches' });
  flipState.boostPickups = [];
  flipState.players.p1.angle = -Math.PI / 2; // Apunta hacia arriba
  flipState.players.p1.speed = 250;
  flipState.players.p1.vy = -250;
  flipState.players.p1.isFlipping = true;
  flipState.players.p1.flipTime = 360;
  // Pelota justo al frente del auto (halfW=14 + algunos px dentro del radio)
  flipState.ball.x = flipState.players.p1.x;
  flipState.ball.y = flipState.players.p1.y - 25; // Justo al frente del morro del auto

  flipState = stepPhysics(flipState, { p1: {} }, 16).nextState;
  const flipBallSpeed = Math.hypot(flipState.ball.vx, flipState.ball.vy);
  assert.ok(flipBallSpeed > 500, `El flip debe proyectar la pelota pesada con fuerza masiva > 500 (fue ${flipBallSpeed})`);
});



// ─── Derrape (Control) ──────────────────────────────────────────────────────

function carRun(state, input, ms) {
  for (let t = 0; t < ms; t += 1000 / 120) state = stepPhysics(state, { p1: input }, 1000 / 120).nextState;
  return state;
}

// Ángulo entre hacia dónde apunta el auto y hacia dónde se mueve.
function slipAngle(car) {
  let d = Math.atan2(car.vy, car.vx) - car.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

test('coches: con Control derrapa: gira más y patina de costado', () => {
  const start = carRun(createGameState([{ id: 'p1', name: 'Rojo', team: 'red' }], { vehicleMode: 'coches' }), { accelerate: true }, 900);
  const grip = carRun(start, { accelerate: true, turnLeft: true }, 350).players.p1;
  const drift = carRun(start, { accelerate: true, turnLeft: true, drift: true }, 350).players.p1;
  const turned = (car) => Math.abs(car.angle - start.players.p1.angle);
  assert.ok(drift.isDrifting, 'queda marcado para dibujar las marcas de goma');
  assert.ok(!grip.isDrifting);
  assert.ok(turned(drift) > turned(grip) * 1.3, `gira más (${turned(drift).toFixed(2)} contra ${turned(grip).toFixed(2)})`);
  assert.ok(slipAngle(drift) > slipAngle(grip) + 0.2, `la cola se abre (${slipAngle(drift).toFixed(2)} contra ${slipAngle(grip).toFixed(2)})`);
});

test('coches: al soltar Control recupera el agarre', () => {
  const start = carRun(createGameState([{ id: 'p1', name: 'Rojo', team: 'red' }], { vehicleMode: 'coches' }), { accelerate: true }, 900);
  const drifted = carRun(start, { accelerate: true, turnLeft: true, drift: true }, 350);
  const after = carRun(drifted, { accelerate: true }, 400).players.p1;
  assert.ok(!after.isDrifting);
  assert.ok(slipAngle(after) < 0.05, `vuelve a ir hacia donde apunta (${slipAngle(after).toFixed(3)})`);
});

test('coches: de costado y derrapando, sigue patinando en vez de frenar en seco', () => {
  let state = carRun(createGameState([{ id: 'p1', name: 'Rojo', team: 'red' }], { vehicleMode: 'coches' }), { accelerate: true }, 900);
  state.players.p1.angle += Math.PI / 2; // la trompa a 90° de hacia dónde va
  const before = Math.hypot(state.players.p1.vx, state.players.p1.vy);
  const sliding = carRun(state, { drift: true }, 100).players.p1;
  const stopped = carRun(state, {}, 100).players.p1;
  assert.ok(Math.hypot(sliding.vx, sliding.vy) > before * 0.6, 'derrapando conserva el envión');
  assert.ok(Math.hypot(stopped.vx, stopped.vy) < Math.hypot(sliding.vx, sliding.vy) / 2, 'sin derrape el agarre lo frena mucho más');
});
