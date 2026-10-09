import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { COLORS, panelStyle, ghostButton } from '../theme.js';
import {
  FIELD, PLAYER_CONFIG, CAR_CONFIG, BALL_CONFIG, CAR_BALL_CONFIG, advanceBall, createGameState, resetPositions, stepPhysics,
} from './physics.js';
import {
  BALL_SMOOTH_MS, CLAIM_COOLDOWN_MS, FIREBASE_BACKUP_MS, FIRST_COUNTDOWN_MS, HEARTBEAT_MS, P2P_SEND_INTERVAL_MS,
  PHYSICS_STEP_MS, REMOTE_SMOOTH_MS, SEND_INTERVAL_MS,
  applyPlayerSnapshot, claimBeats, createRemote, fixedSteps, goalMatch, initialMatch, latestWriter, matchPhase,
  packBall, packPlayer, receiveSnapshot, sameMotion, sampleRemote, switchToDirect, unpackInput, updateDelay,
} from './net.js';
import { createMesh } from './p2p.js';

const TEAM_COLOR = {
  red: '#e05050',
  blue: '#4a90d9',
  white: '#ffffff',
};
const TEAM_NAME = { red: 'ROJO', blue: 'AZUL', white: 'ENTRENAMIENTO' };
const LINK_LABEL = { directo: '● conexión directa', mixto: '● conexión mixta', firebase: '● conexión lenta' };
const LINK_HINT = {
  directo: 'Las jugadas van directo de pantalla a pantalla.',
  mixto: 'Con algunos jugadores no se pudo conectar directo: sus jugadas pasan por el servidor y llegan más tarde.',
  firebase: 'No se pudo conectar directo con nadie (puede ser la red): las jugadas pasan por el servidor y llegan más tarde.',
};

// ─── Constantes de render ──────────────────────────────────────────────────
const GRASS_COLOR = '#3a7d44';
const GRASS_STRIPE = '#3f8a4b';
const LINE_COLOR = 'rgba(255,255,255,0.75)';
const LINE_WIDTH = 2;

// Espacio jugable detrás de cada arco.
const GOAL_RUNOFF_MARGIN = 70;

export default function FutbolGame({ room, code, me, onGoal, onTimeEnd, onBackToLobby, onLeave }) {
  const isCarMode = room.options?.vehicleMode === 'coches';
  const isLocalGame = Boolean(room?.isLocalGame);
  const matchMinutes = Number(room.options?.matchMinutes ?? 0);
  const timed = matchMinutes > 0;
  const initialTimeMs = timed ? matchMinutes * 60 * 1000 : 0;
  const meId = me?.id ?? null;
  const matchNumber = room.matchNumber ?? 0;

  // El partido corre en un único bucle que dura todo el montaje. Lo que cambia de la sala se lee de
  // refs: así una actualización (un gol, alguien que se va) no reinicia la simulación.
  const roomRef = useRef(room);
  roomRef.current = room;
  const callbacksRef = useRef({ onGoal, onTimeEnd });
  callbacksRef.current = { onGoal, onTimeEnd };

  const canvasRef = useRef(null);
  const stateRef = useRef(null);
  const myInputRef = useRef({});
  const p1InputRef = useRef({});
  const p2InputRef = useRef({});
  const camRef = useRef({ x: FIELD.width / 2, y: FIELD.height / 2 });
  const zoomScaleRef = useRef(1.0);
  const zoomKeysRef = useRef({ zoomIn: false, zoomOut: false });
  const [rotateCamera, setRotateCamera] = useState(isCarMode);
  const rotateCameraRef = useRef(isCarMode);
  const skidRef = useRef(new Map()); // id → marcas de goma que deja al derrapar

  // HUD: se actualiza solo cuando cambia lo que se ve, no en cada cuadro.
  const [hud, setHud] = useState({ time: formatTime(initialTimeMs), red: room.score.red, blue: room.score.blue });
  // Cómo llegan las fotos de los demás: 'directo' (WebRTC), 'mixto' o 'firebase'. Vacío si juego solo.
  const [link, setLink] = useState('');
  const [showMenu, setShowMenu] = useState(false);

  const [canvasSize, setCanvasSize] = useState({ w: FIELD.width, h: FIELD.height });
  const canvasSizeRef = useRef(canvasSize);
  canvasSizeRef.current = canvasSize;

  useEffect(() => {
    function computeSize() {
      const maxW = Math.min(window.innerWidth - 8, 1200);
      const maxH = Math.min(window.innerHeight - 90, 750);
      setCanvasSize({ w: Math.max(600, maxW), h: Math.max(400, maxH) });
    }
    computeSize();
    window.addEventListener('resize', computeSize);
    return () => window.removeEventListener('resize', computeSize);
  }, []);

  // Si alguien se va a mitad del partido, deja de dibujarse.
  const rosterKey = room.players.map((p) => `${p.id}:${p.team}`).join('|');
  useEffect(() => {
    const state = stateRef.current;
    if (!state) return;
    const ids = new Set(roomRef.current.players.map((p) => p.id));
    for (const id of Object.keys(state.players)) {
      if (!ids.has(id)) delete state.players[id];
    }
  }, [rosterKey]);

  // ─── Controles: solo tocan el input local. Nada de esto espera a la red. ─────
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowMenu((prev) => !prev);
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Enter'].includes(e.key) || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
      }
      // Con Control apretado para derrapar, las teclas del juego no tienen que disparar atajos del
      // navegador (Ctrl+D, Ctrl+S, Ctrl+A…). Ctrl+W no se puede frenar: para eso está el aviso al salir.
      if (isCarMode && (e.key === 'Control' || (e.ctrlKey && isGameKey(e)))) {
        e.preventDefault();
      }

      if (isLocalGame) {
        handleLocalKeyDown(e, isCarMode, p1InputRef.current, p2InputRef.current);
      } else {
        const field = inputField(e.key, isCarMode);
        if (field) myInputRef.current[field] = true;
      }

      if (e.key === 'q' || e.key === 'Q') zoomKeysRef.current.zoomOut = true;
      if (e.key === 'e' || e.key === 'E') zoomKeysRef.current.zoomIn = true;
      if (isCarMode && (e.key === 'c' || e.key === 'C')) {
        setRotateCamera((prev) => {
          rotateCameraRef.current = !prev;
          return !prev;
        });
      }
    }
    function onKeyUp(e) {
      if (isLocalGame) {
        handleLocalKeyUp(e, isCarMode, p1InputRef.current, p2InputRef.current);
      } else {
        const field = inputField(e.key, isCarMode);
        if (field) myInputRef.current[field] = false;
      }
      if (e.key === 'q' || e.key === 'Q') zoomKeysRef.current.zoomOut = false;
      if (e.key === 'e' || e.key === 'E') zoomKeysRef.current.zoomIn = false;
    }
    // Si la ventana pierde el foco con una tecla apretada, el keyup no llega nunca: se suelta todo.
    function onBlur() {
      myInputRef.current = {};
      p1InputRef.current = {};
      p2InputRef.current = {};
      zoomKeysRef.current = { zoomIn: false, zoomOut: false };
    }
    // En coches se acelera con W y se derrapa con Control: Ctrl+W cierra la pestaña y ninguna página
    // puede evitarlo. Por lo menos el navegador pregunta antes de cerrarla.
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    if (isCarMode) window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [isCarMode, isLocalGame]);

  // ─── Red + bucle del partido ─────────────────────────────────────────────
  // Mi jugador: tecla → movimiento → dibujo, todo en el mismo cuadro; a la red va una foto por
  // cuadro por conexión directa (o cada 50 ms por Firebase, si la directa no se pudo armar).
  // La física corre a paso fijo, así la pelota se comporta igual en todas las pantallas.
  // Los demás: foto → búfer → interpolación → dibujo suave, un poco en el pasado.
  // La pelota la simula quien la tocó último; mientras la tiene otro, se interpola como a él.
  useEffect(() => {
    stateRef.current = createGameState(roomRef.current.players, roomRef.current.options);

    if (isLocalGame) {
      let localKickoff = -1;
      let goalSentFor = -1;
      let endNotified = false;
      const mountedAt = performance.now();
      const localPlayers = roomRef.current.players;
      const p1Player = localPlayers.find((p) => p.team === 'red' || p.team === 'white') || localPlayers[0];
      const p2Player = localPlayers.find((p) => p.team === 'blue');
      const p1Id = p1Player?.id || 'p1';
      const p2Id = p2Player?.id || 'p2';
      const localSet = new Set(p2Player ? [p1Id, p2Id] : [p1Id]);

      const localMatch = initialMatch(matchNumber, Date.now(), initialTimeMs);

      function applyLocalKickoff(k) {
        localKickoff = k;
        stateRef.current = resetPositions(stateRef.current, roomRef.current.players);
      }

      function declareLocalGoal(team, k) {
        goalSentFor = k;
        const goalsToWin = Number(roomRef.current.options?.goalsToWin || 0);
        const updated = goalMatch(localMatch, team, Date.now(), timed, goalsToWin);
        Object.assign(localMatch, updated);
        callbacksRef.current.onGoal(team, k);
      }

      let lastHud = null;
      function updateHud(time, red, blue) {
        const key = `${time}|${red}|${blue}`;
        if (key === lastHud) return;
        lastHud = key;
        setHud({ time, red, blue });
      }

      const canvas = canvasRef.current;
      function onWheel(e) {
        e.preventDefault();
        if (e.deltaY > 0) zoomScaleRef.current = Math.max(0.4, zoomScaleRef.current - 0.08);
        else if (e.deltaY < 0) zoomScaleRef.current = Math.min(2.5, zoomScaleRef.current + 0.08);
      }
      canvas?.addEventListener('wheel', onWheel, { passive: false });

      let raf = 0;
      let lastTs = null;
      const clock = { acc: 0 };
      let prev = null;
      function frame(ts) {
        raf = requestAnimationFrame(frame);
        const dt = lastTs === null ? 16 : Math.min(ts - lastTs, 50);
        lastTs = ts;
        const now = Date.now();
        const view = matchPhase(localMatch, now, timed);

        if (localMatch.k !== localKickoff && view.phase !== 'goal') {
          applyLocalKickoff(localMatch.k);
          prev = null;
        }

        let state = stateRef.current;
        const { steps, alpha } = fixedSteps(clock, dt);

        if (view.phase === 'playing') {
          const inputs = {
            [p1Id]: p1InputRef.current,
          };
          if (p2Player && p2Id !== p1Id) {
            inputs[p2Id] = p2InputRef.current;
          }
          for (let i = 0; i < steps; i++) {
            if (i === steps - 1) prev = captureBodies(state, localSet, true);
            const result = stepPhysics(state, inputs, PHYSICS_STEP_MS, { local: localSet });
            state = result.nextState;
            if (result.goal && goalSentFor !== localMatch.k) {
              // Stop the remaining physics steps so the same goal cannot be detected twice.
              declareLocalGoal(result.goal, localMatch.k);
              break;
            }
          }
          stateRef.current = state;
        } else {
          prev = null;
        }
        const shown = blendBodies(state, prev, alpha);

        if (view.phase === 'ended' && !endNotified) {
          endNotified = true;
          callbacksRef.current.onTimeEnd();
        }

        updateHud(formatTime(view.clock), localMatch.sr, localMatch.sb);

        if (zoomKeysRef.current.zoomOut) zoomScaleRef.current = Math.max(0.4, zoomScaleRef.current - 0.02 * (dt / 16));
        if (zoomKeysRef.current.zoomIn) zoomScaleRef.current = Math.min(2.5, zoomScaleRef.current + 0.02 * (dt / 16));

        updateCamera(shown, dt);
        renderScene(canvas.getContext('2d'), shown, shown.ball, overlayText(view, localMatch, ts - mountedAt));
      }

      raf = requestAnimationFrame(frame);
      return () => {
        cancelAnimationFrame(raf);
        canvas?.removeEventListener('wheel', onWheel);
      };
    }

    const channel = backend.futbolChannel(code);
    const net = {
      offset: 0,
      offsetReady: false,
      match: null,
      kickoff: -1,                               // último saque aplicado en esta pantalla
      remotes: new Map(),                        // id → fotos recibidas de ese jugador
      ball: { o: roomRef.current.hostId, s: 0 }, // quién simula la pelota y cuántas veces cambió de dueño
      ballRemote: createRemote(),                // fotos de la pelota mientras la tiene otro
      maxSeq: 0,
      lastClaimAt: -Infinity,
      ballOffset: { x: 0, y: 0 },                // corrección visual que se disuelve sola
      ballJump: false,
      ballWasGuess: false,
      lastRenderBall: null,
      lastPlayerSnap: null,
      lastPlayerAt: 0,
      lastBallSnap: null,
      lastBallAt: 0,
      directPlayerSnap: null,
      directPlayerAt: 0,
      directBallSnap: null,
      directBallAt: 0,
      clock: { acc: 0 },                         // paso fijo de la física
      prev: null,                                // mis cuerpos antes del último paso, para dibujar entre pasos
      goalSentFor: -1,
      endNotified: false,
      mountedAt: performance.now(),
      stats: { sent: 0, sentBytes: 0, sentDirect: 0, received: 0 },
    };
    const serverNow = () => Date.now() + net.offset;
    const localSet = new Set(meId ? [meId] : []);
    const sendPlayer = latestWriter((snap) => channel.publishPlayer(meId, snap));
    const sendBall = latestWriter((snap) => channel.publishBall(snap));

    // Canal directo con cada pantalla. Firebase solo los presenta; si con alguien no se puede,
    // sus fotos siguen yendo y viniendo por Firebase.
    const mesh = createMesh({
      signaling: channel.signaling,
      myId: meId ?? `v${Math.random().toString(36).slice(2, 10)}`,
      onMessage(id, msg) {
        if (msg?.c === 'p') handlers.onPlayer(id, msg.d, true);
        else if (msg?.c === 'b') handlers.onBall(msg.d, true);
        else if (msg?.c === 'm') handlers.onMatch(msg.d);
        else if (msg?.c === 'u') handlers.onPickups({ [msg.i]: msg.d });
      },
    });
    if (import.meta.env.DEV) window.__futbol = { stateRef, meId, net, mesh };

    function countSent(snap) {
      net.stats.sent += 1;
      net.stats.sentBytes += JSON.stringify(snap).length;
    }

    // Cualquiera puede arrancar el partido; la transacción deja pasar al primero. Así no depende
    // de que el host haya cargado.
    function ensureMatch() {
      channel.updateMatch((current) => (
        current && current.m === matchNumber ? undefined : initialMatch(matchNumber, serverNow(), initialTimeMs)
      )).catch(() => {});
    }

    const offOffset = backend.subscribeServerOffset((offset) => {
      net.offset = offset;
      if (!net.offsetReady) {
        net.offsetReady = true;
        ensureMatch();
      }
    });

    // Lo mismo llega por los dos caminos: por conexión directa y por Firebase. La copia repetida o
    // más vieja se descarta sola (una foto con hora anterior a la última no entra al búfer).
    const handlers = {
      onPlayer(id, snap, direct = false) {
        if (id === meId || !snap || snap.m !== matchNumber) return;
        if (net.match && snap.k < net.match.k) return; // foto de antes del último gol
        let remote = net.remotes.get(id);
        if (!remote) {
          remote = createRemote();
          net.remotes.set(id, remote);
        }
        if (direct) switchToDirect(remote);
        // Con el canal directo abierto, lo que llega por Firebase es el respaldo de una vez por
        // segundo. Si el jugador está quieto, esa copia a veces es más nueva que el último latido
        // directo y entra; si además contara su demora (~400 ms), al arrancar se lo dibujaba
        // varios segundos atrasado.
        const backup = !direct && Boolean(mesh?.isOpen(id));
        if (receiveSnapshot(remote, snap, serverNow(), !backup)) net.stats.received += 1;
      },
      onPlayerGone(id) {
        net.remotes.delete(id);
      },
      onBall(snap, direct = false) {
        if (!snap || snap.m !== matchNumber || snap.k !== net.kickoff) return;
        if (snap.o === meId) return; // mi propia foto que vuelve
        net.maxSeq = Math.max(net.maxSeq, snap.s);
        const sameOwner = snap.o === net.ball.o && snap.s === net.ball.s;
        if (!sameOwner && !claimBeats(snap, net.ball)) return; // un reclamo que ya perdió
        if (!sameOwner) {
          // Cambió de dueño: la pelota pasa a seguir el tiempo del nuevo dueño.
          net.ball = { o: snap.o, s: snap.s };
          net.ballRemote = createRemote();
          net.ballJump = true;
        }
        if (direct) switchToDirect(net.ballRemote);
        receiveSnapshot(net.ballRemote, snap, serverNow(), direct || !mesh?.isOpen(snap.o));
      },
      onMatch(match) {
        if (!match || match.m !== matchNumber) return;
        if (net.match && net.match.m === match.m && match.k < net.match.k) return; // llegó tarde
        net.match = match;
      },
      onPickups(pickups) {
        const list = stateRef.current?.boostPickups;
        if (!list) return;
        const now = serverNow();
        for (const [index, pickup] of Object.entries(pickups)) {
          const target = list[Number(index)];
          if (!target || !pickup || !(pickup.r > now)) continue;
          target.active = false;
          target.respawnTimer = Math.max(target.respawnTimer || 0, pickup.r - now);
        }
      },
    };
    const offChannel = channel.subscribe(handlers);
    if (meId) channel.leaveOnDisconnect(meId).catch(() => {});

    // Saque nuevo (arranque o después de un gol): todos a su lugar y la pelota al medio.
    function applyKickoff(k) {
      net.kickoff = k;
      stateRef.current = resetPositions(stateRef.current, roomRef.current.players);
      for (const remote of net.remotes.values()) {
        remote.snaps.length = 0;
        remote.guess = null;
        remote.shown = null;
        remote.offset = null;
      }
      net.ball = { o: roomRef.current.hostId, s: 0 };
      net.ballRemote = createRemote();
      net.maxSeq = 0;
      net.ballOffset = { x: 0, y: 0 };
      net.ballJump = false;
      net.lastPlayerSnap = null;
      net.lastBallSnap = null;
      net.directPlayerSnap = null;
      net.directBallSnap = null;
      net.prev = null;
    }

    // Cada foto sale por dos caminos con su propio ritmo: por conexión directa, una por cuadro; por
    // Firebase cada 50 ms, o una por segundo de respaldo si todos ya reciben directo.
    function due(now, snap, lastSnap, lastAt, interval) {
      if (now - lastAt < interval) return false;
      return !sameMotion(snap, lastSnap) || now - lastAt >= HEARTBEAT_MS;
    }

    function publish(now, snap, kind, force, allDirect) {
      const [directSnap, directAt] = kind === 'p' ? ['directPlayerSnap', 'directPlayerAt'] : ['directBallSnap', 'directBallAt'];
      const [slowSnap, slowAt] = kind === 'p' ? ['lastPlayerSnap', 'lastPlayerAt'] : ['lastBallSnap', 'lastBallAt'];
      if (mesh && (force || due(now, snap, net[directSnap], net[directAt], P2P_SEND_INTERVAL_MS))) {
        net[directSnap] = snap;
        net[directAt] = now;
        mesh.broadcast({ c: kind, d: snap });
        net.stats.sentDirect += 1;
      }
      const interval = allDirect ? FIREBASE_BACKUP_MS : SEND_INTERVAL_MS;
      if (force || due(now, snap, net[slowSnap], net[slowAt], interval)) {
        net[slowSnap] = snap;
        net[slowAt] = now;
        (kind === 'p' ? sendPlayer : sendBall)(snap);
        countSent(snap);
      }
    }

    function publishMe(now, allDirect) {
      if (!meId || !net.match) return;
      const mine = stateRef.current.players[meId];
      if (!mine) return;
      publish(now, packPlayer(mine, isCarMode, matchNumber, net.kickoff, now, myInputRef.current), 'p', false, allDirect);
    }

    function publishBall(now, force, allDirect) {
      publish(now, packBall(stateRef.current.ball, matchNumber, net.kickoff, meId, net.ball.s, now), 'b', force, allDirect);
    }

    // El gol lo declara solo quien simula la pelota, y con transacción: un gol por saque.
    function declareGoal(team, k) {
      net.goalSentFor = k;
      const goalsToWin = Number(roomRef.current.options?.goalsToWin || 0);
      channel.updateMatch((current) => {
        if (current === null) return null;
        if (current.m !== matchNumber || current.k !== k) return undefined;
        return goalMatch(current, team, serverNow(), timed, goalsToWin);
      }).then(({ committed, match }) => {
        if (!committed) return;
        // Los demás se enteran del gol por el canal directo, sin esperar a que Firebase se lo avise.
        if (match) mesh?.broadcast({ c: 'm', d: match });
        callbacksRef.current.onGoal(team, k);
      }).catch(() => {});
    }

    let lastHud = null;
    function updateHud(time, red, blue) {
      const key = `${time}|${red}|${blue}`;
      if (key === lastHud) return;
      lastHud = key;
      setHud({ time, red, blue });
    }

    const canvas = canvasRef.current;
    function onWheel(e) {
      e.preventDefault();
      if (e.deltaY > 0) zoomScaleRef.current = Math.max(0.4, zoomScaleRef.current - 0.08);
      else if (e.deltaY < 0) zoomScaleRef.current = Math.min(2.5, zoomScaleRef.current + 0.08);
    }
    canvas?.addEventListener('wheel', onWheel, { passive: false });

    const otherIds = () => roomRef.current.players.map((p) => p.id).filter((id) => id !== meId);

    let lastLink = null;
    let lastLinkCheck = -Infinity;
    function updateLink(ts) {
      if (ts - lastLinkCheck < 1000) return;
      lastLinkCheck = ts;
      const others = otherIds();
      const direct = others.filter((id) => mesh?.isOpen(id)).length;
      let value = 'firebase';
      if (others.length === 0) value = '';
      else if (direct === others.length) value = 'directo';
      else if (direct > 0) value = 'mixto';
      if (value !== lastLink) {
        lastLink = value;
        setLink(value);
      }
    }

    // Un paso fijo de física. Mi jugador se mueve con mis teclas; la pelota, solo si es mía o si la
    // acabo de tocar (entonces pasa a ser mía).
    function stepOnline(state, now, ts, match, allDirect) {
      const ballIsMine = meId !== null && net.ball.o === meId;
      const seen = ballIsMine ? null : { ...state.ball };
      const inputs = meId ? { [meId]: myInputRef.current } : {};
      const result = stepPhysics(state, inputs, PHYSICS_STEP_MS, { local: localSet });
      const next = result.nextState;
      stateRef.current = next;

      if (!ballIsMine) {
        if (result.touched && meId && ts - net.lastClaimAt >= CLAIM_COOLDOWN_MS) {
          // La toqué yo: desde ya la simulo yo, sin esperar la confirmación de nadie.
          net.lastClaimAt = ts;
          net.maxSeq += 1;
          net.ball = { o: meId, s: net.maxSeq };
          publishBall(now, true, allDirect);
        } else {
          // La tiene otro: el paso de física solo servía para ver si la toqué.
          Object.assign(next.ball, seen);
        }
      }

      for (const index of result.pickupsTaken || []) {
        const pickup = next.boostPickups?.[index];
        if (!pickup) continue;
        const taken = { r: Math.round(now + pickup.respawnDelay) };
        mesh?.broadcast({ c: 'u', i: index, d: taken });
        channel.publishPickup(index, taken).catch(() => {});
      }

      if (result.goal && net.ball.o === meId && net.goalSentFor !== match.k) {
        net.goalSentFor = match.k;
        declareGoal(result.goal, match.k);
      }
      return next;
    }

    let raf = 0;
    let lastTs = null;
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const dt = lastTs === null ? 16 : Math.min(ts - lastTs, 50);
      lastTs = ts;
      const now = serverNow();
      const allDirect = Boolean(mesh) && otherIds().every((id) => mesh.isOpen(id));
      updateLink(ts);
      const match = net.match;
      const view = match
        ? matchPhase(match, now, timed)
        : { phase: 'waiting', clock: initialTimeMs };

      if (match && match.k !== net.kickoff && view.phase !== 'goal') applyKickoff(match.k);
      let state = stateRef.current;

      // 1. Los demás jugadores, donde estaban hace un instante (interpolado). Si sus fotos se
      //    atrasan, se los sigue simulando con sus teclas, y cuando llegan se funde la diferencia.
      for (const [id, remote] of net.remotes) {
        const target = state.players[id];
        if (!target) continue;
        const snap = sampleRemote(remote, now - updateDelay(remote, dt), (last, ms) => guessPlayer(remote, target, last, ms, state));
        if (!snap) continue;
        applyPlayerSnapshot(target, snap, isCarMode);
        blendRemote(remote, target, Boolean(snap.ex), dt);
      }

      // 2. La pelota, si la tiene otro: en el mismo tiempo que su dueño, para que coincida con su auto.
      const ballIsMine = meId !== null && net.ball.o === meId;
      if (!ballIsMine) {
        const ownerDelay = net.remotes.get(net.ball.o)?.delay;
        const delay = ownerDelay ?? updateDelay(net.ballRemote, dt);
        const snap = sampleRemote(net.ballRemote, now - delay, (b, ms) => advanceBall({ ...b }, state.field, ms));
        if (snap) {
          if (net.ballWasGuess && !snap.ex) net.ballJump = true;
          net.ballWasGuess = Boolean(snap.ex);
          state.ball.x = snap.x;
          state.ball.y = snap.y;
          state.ball.vx = snap.vx;
          state.ball.vy = snap.vy;
        }
      }

      // 3. Mi jugador: física local con mis teclas, a paso fijo (120 por segundo), en este mismo cuadro.
      const { steps, alpha } = fixedSteps(net.clock, dt);
      if (view.phase === 'playing') {
        for (let i = 0; i < steps; i++) {
          if (i === steps - 1) net.prev = captureBodies(state, localSet, net.ball.o === meId);
          const goalBefore = net.goalSentFor;
          state = stepOnline(state, now, ts, match, allDirect);
          // stepOnline marca goalSentFor inmediatamente al declarar un gol.
          // No ejecutar mas pasos de este mismo frame con la pelota dentro del arco.
          if (net.goalSentFor !== goalBefore) break;
        }
        if (meId !== null && net.ball.o === meId) publishBall(now, false, allDirect);
      } else {
        net.prev = null;
      }

      publishMe(now, allDirect);

      if (view.phase === 'ended' && !net.endNotified) {
        net.endNotified = true;
        callbacksRef.current.onTimeEnd();
      }

      const score = match ? { red: match.sr, blue: match.sb } : roomRef.current.score;
      updateHud(formatTime(view.clock), score.red, score.blue);

      if (zoomKeysRef.current.zoomOut) zoomScaleRef.current = Math.max(0.4, zoomScaleRef.current - 0.02 * (dt / 16));
      if (zoomKeysRef.current.zoomIn) zoomScaleRef.current = Math.min(2.5, zoomScaleRef.current + 0.02 * (dt / 16));

      // Entre dos pasos de física se dibuja lo propio a mitad de camino: con 144 Hz no hay tirones.
      const shown = blendBodies(state, net.prev, alpha);
      updateCamera(shown, dt);
      renderScene(canvas.getContext('2d'), shown, smoothBall(shown.ball, dt), overlayText(view, match, ts - net.mountedAt));
    }

    // Sigue a un remoto más allá de su última foto con la física y las teclas que tenía apretadas.
    // Se avanza de a poco desde lo ya calculado, no se rehace desde cero en cada cuadro.
    function guessPlayer(remote, template, last, ms, state) {
      let guess = remote.guess;
      if (!guess || guess.from !== last || ms < guess.ms) {
        const player = { ...template };
        applyPlayerSnapshot(player, last, isCarMode);
        guess = { from: last, ms: 0, player, input: unpackInput(last.in || 0), local: new Set([player.id]) };
        remote.guess = guess;
      }
      while (guess.ms < ms) {
        const step = Math.min(16, ms - guess.ms);
        const alone = { field: state.field, options: state.options, players: { [guess.player.id]: guess.player }, ball: { ...state.ball } };
        guess.player = stepPhysics(alone, { [guess.player.id]: guess.input }, step, { local: guess.local }).nextState.players[guess.player.id];
        guess.ms += step;
      }
      return packPlayer(guess.player, isCarMode, last.m, last.k, last.t + ms, guess.input);
    }

    // Cuando un remoto venía adivinado y llegan sus fotos reales, puede haber una diferencia: se
    // dibuja como un desvío que se disuelve, en vez de un salto.
    function blendRemote(remote, target, guessed, dt) {
      const offset = remote.offset || (remote.offset = { x: 0, y: 0, a: 0 });
      if (remote.wasGuessed && !guessed && remote.shown) {
        offset.x = remote.shown.x - target.x;
        offset.y = remote.shown.y - target.y;
        offset.a = isCarMode ? angleDiff(remote.shown.a, target.angle) : 0;
        if (Math.hypot(offset.x, offset.y) > 120) {
          offset.x = 0;
          offset.y = 0;
          offset.a = 0;
        }
      }
      remote.wasGuessed = guessed;
      const decay = Math.exp(-dt / REMOTE_SMOOTH_MS);
      offset.x *= decay;
      offset.y *= decay;
      offset.a *= decay;
      target.x += offset.x;
      target.y += offset.y;
      if (isCarMode) target.angle += offset.a;
      remote.shown = { x: target.x, y: target.y, a: target.angle };
    }

    // Cuando la pelota cambia de dueño, su posición salta un poco (pasa a otro tiempo). Esa
    // diferencia se dibuja como un desvío que se disuelve en unos 90 ms, en vez de un salto.
    function smoothBall(ball, dt) {
      const offset = net.ballOffset;
      if (net.ballJump && net.lastRenderBall) {
        offset.x = net.lastRenderBall.x - ball.x;
        offset.y = net.lastRenderBall.y - ball.y;
        if (Math.hypot(offset.x, offset.y) > 150) {
          offset.x = 0;
          offset.y = 0;
        }
      }
      net.ballJump = false;
      const decay = Math.exp(-dt / BALL_SMOOTH_MS);
      offset.x *= decay;
      offset.y *= decay;
      const render = { x: ball.x + offset.x, y: ball.y + offset.y, vx: ball.vx, vy: ball.vy };
      net.lastRenderBall = render;
      return render;
    }

    function overlayText(view, match, sinceMount) {
      if (view.phase === 'waiting') return sinceMount < 1500 ? countdownText(FIRST_COUNTDOWN_MS) : 'Conectando…';
      if (view.phase === 'countdown') return countdownText(view.left);
      if (view.phase === 'goal') return `¡GOL DE ${TEAM_NAME[match.g] || ''}!`;
      if (view.phase === 'ended') return '¡FIN DEL PARTIDO!';
      return null;
    }

    function updateCamera(state, dt) {
      // En modo entrenamiento enfocar al jugador; en partida local 1v1 enfocar la pelota; en online a me / primer jugador
      const isTraining = Boolean(roomRef.current?.isTrainingMode);
      const target = isTraining
        ? (Object.values(state.players)[0] || state.ball)
        : isLocalGame
        ? state.ball
        : ((meId && state.players[meId]) || Object.values(state.players)[0] || state.ball);
      if (!target) return;

      const isRotatingCam = isCarMode && rotateCameraRef.current;
      if (isRotatingCam) {
        // En modo cámara rotativa nos fijamos directamente al auto para máxima estabilidad sin temblores
        camRef.current.x = target.x;
        camRef.current.y = target.y;
      } else {
        // Movimiento suave con lerp (más alto = más rápido, 0.08 es muy fluido)
        const factor = 1 - Math.pow(0.01, dt / 1000);
        camRef.current.x += (target.x - camRef.current.x) * factor;
        camRef.current.y += (target.y - camRef.current.y) * factor;
      }
    }

    function renderScene(ctx, state, ball, overlayMessage) {
      const size = canvasSizeRef.current;
      ctx.clearRect(0, 0, size.w, size.h);

      const field = state.field || FIELD;
      const isRotatingCam = isCarMode && rotateCameraRef.current;
      const myCar = (meId && state.players[meId]) || Object.values(state.players)[0];

      // Calcular zoom de la cámara teniendo en cuenta la orientación y modo de cámara
      const baseZoom = isRotatingCam
        ? Math.max(0.72, Math.min(size.w / 720, size.h / 720))
        : (field.isVertical
            ? Math.max(0.65, Math.min(size.w / 750, size.h / 1050))
            : Math.max(0.8, Math.min(size.w / 900, size.h / 580)));
      const zoom = baseZoom * 1.15 * zoomScaleRef.current;

      let cx;
      let cy;
      if (isRotatingCam && myCar) {
        cx = camRef.current.x;
        cy = camRef.current.y;
      } else {
        // Clamp de la cámara para que no se salga excesivamente del campo
        const sm = field.sideMargin || 0;
        const gm = goalRunoffMargin(field);
        const viewW = size.w / zoom;
        const viewH = size.h / zoom;
        const pad = 60;
        const extraX = field.isVertical ? sm : gm;
        const extraY = field.isVertical ? gm : sm;
        const totalW = field.width + extraX * 2;
        const totalH = field.height + extraY * 2;
        const minX = Math.min(viewW / 2, totalW / 2) - extraX;
        const maxX = Math.max(viewW / 2, totalW - viewW / 2) - extraX;
        const minY = Math.min(viewH / 2, totalH / 2) - extraY;
        const maxY = Math.max(viewH / 2, totalH - viewH / 2) - extraY;

        cx = Math.max(minX - pad, Math.min(maxX + pad, camRef.current.x));
        cy = Math.max(minY - pad, Math.min(maxY + pad, camRef.current.y));
      }

      ctx.save();
      // En cámara rotativa ubicamos el auto ligeramente debajo del centro (h * 0.58) para mayor visión frontal
      const screenCenterX = size.w / 2;
      const screenCenterY = isRotatingCam ? size.h * 0.58 : size.h / 2;
      ctx.translate(screenCenterX, screenCenterY);
      ctx.scale(zoom, zoom);

      if (isRotatingCam && myCar) {
        // Rotar la escena: el auto SIEMPRE se ve yendo hacia adelante (arriba en la pantalla)
        const carAngle = myCar.angle ?? -Math.PI / 2;
        ctx.rotate(-Math.PI / 2 - carAngle);
      }

      ctx.translate(-cx, -cy);

      // Dibujar mundo
      drawField(ctx, field);
      if (isCarMode && state.boostPickups) {
        drawBoostPickups(ctx, state.boostPickups);
      }
      drawGoals(ctx, field);
      if (isCarMode) drawSkidMarks(ctx, state.players, skidRef.current, performance.now());
      drawBall(ctx, ball, isCarMode);
      Object.values(state.players).forEach((p) => {
        if (isCarMode) {
          drawCar(ctx, p);
        } else {
          drawPlayer(ctx, p, state.options?.stamina);
        }
      });

      ctx.restore();

      // Indicador de pelota fuera de pantalla (flecha + mini pelota si el balón no se ve)
      drawOffscreenBallIndicator(ctx, ball, myCar, size, zoom, screenCenterX, screenCenterY, cx, cy, isRotatingCam);

      // HUD de Coches (Rocket League Boost Meter & Flip Status)
      if (isCarMode && myCar) {
        drawCarHUD(ctx, myCar, size);
      }

      // Overlay de mensaje (Cuenta regresiva o GOL)
      if (overlayMessage) {
        ctx.save();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
        ctx.fillRect(0, size.h / 2 - 50, size.w, 100);

        ctx.font = 'bold 42px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#f0d36b';
        ctx.shadowColor = '#000';
        ctx.shadowBlur = 10;
        ctx.fillText(overlayMessage, size.w / 2, size.h / 2);
        ctx.restore();
      }
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      canvas?.removeEventListener('wheel', onWheel);
      offChannel();
      offOffset();
      mesh?.close();
      if (meId) channel.removePlayer(meId).catch(() => {});
      if (import.meta.env.DEV && window.__futbol?.net === net) delete window.__futbol;
    };
  }, [code, meId, matchNumber, isCarMode, timed, initialTimeMs]);

  return (
    <div style={{ background: '#121212', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      {/* HUD: ROJO  0 - 0  AZUL y tiempo visible */}
      <div style={{
        width: canvasSize.w,
        padding: '10px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#181818',
        borderBottom: '2px solid #2e2e2e',
        fontFamily: 'monospace',
      }}>
        {/* Lado Rojo / Entrenamiento */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: room?.isTrainingMode ? TEAM_COLOR.white : TEAM_COLOR.red, boxShadow: `0 0 8px ${room?.isTrainingMode ? TEAM_COLOR.white : TEAM_COLOR.red}` }} />
          <span style={{ color: room?.isTrainingMode ? TEAM_COLOR.white : TEAM_COLOR.red, fontWeight: 700, fontSize: 20 }}>
            {room?.isTrainingMode ? 'ENTRENAMIENTO' : 'ROJO'}
          </span>
        </div>

        {/* Marcador central y Reloj */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontWeight: 900, fontSize: 32, letterSpacing: 4, lineHeight: 1 }}>
            {room?.isTrainingMode ? `${hud.red + hud.blue} Goles` : `${hud.red} - ${hud.blue}`}
          </div>
          <div style={{ color: '#d4af37', fontSize: 16, fontWeight: 700, marginTop: 4 }}>
            {hud.time}
          </div>
          {link && (
            <div
              data-link={link}
              title={LINK_HINT[link]}
              style={{ color: link === 'directo' ? '#6fcf7f' : '#e0a050', fontSize: 11, marginTop: 3 }}
            >
              {LINK_LABEL[link]}
            </div>
          )}
        </div>

        {/* Lado Azul / Modo Solo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {room?.isTrainingMode ? (
            <span style={{ color: '#aaa', fontWeight: 700, fontSize: 14, marginRight: 6 }}>🎯 MODO SOLO</span>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginRight: 6 }}>
              <span style={{ color: TEAM_COLOR.blue, fontWeight: 700, fontSize: 20 }}>AZUL</span>
              <div style={{ width: 14, height: 14, borderRadius: '50%', background: TEAM_COLOR.blue, boxShadow: `0 0 8px ${TEAM_COLOR.blue}` }} />
            </div>
          )}
          {isCarMode && (
            <button
              type="button"
              className="cs-btn"
              onClick={() => setRotateCamera((prev) => {
                const next = !prev;
                rotateCameraRef.current = next;
                return next;
              })}
              title="Presiona 'C' para alternar la cámara en cualquier momento"
              style={{
                ...ghostButton,
                padding: '5px 10px',
                fontSize: 12,
                fontFamily: 'monospace',
                cursor: 'pointer',
                borderColor: rotateCamera ? '#ffd700' : '#444',
                color: rotateCamera ? '#ffd700' : '#888',
              }}
            >
              🎥 {rotateCamera ? 'Cám. Auto (C)' : 'Cám. Fija (C)'}
            </button>
          )}
          <button
            type="button"
            className="cs-btn"
            onClick={() => setShowMenu((prev) => !prev)}
            style={{
              ...ghostButton,
              padding: '5px 10px',
              fontSize: 12,
              fontFamily: 'monospace',
              cursor: 'pointer',
            }}
          >
            ⚙️ Menú (ESC)
          </button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={canvasSize.w}
        height={canvasSize.h}
        style={{ display: 'block', borderRadius: 4, boxShadow: '0 4px 20px rgba(0,0,0,0.6)', marginTop: 4 }}
      />

      {/* Indicador de controles */}
      <div style={{ color: '#888', fontSize: 13, fontFamily: 'monospace', marginTop: 10, textAlign: 'center' }}>
        {isLocalGame ? (
          <>
            <span style={{ color: '#e05050', fontWeight: 700 }}>🔴 J1 (Rojo):</span> WASD (mover) · <b>ESPACIO</b> (patada)
            {room.options.stamina && <> · <b>SHIFT Izq</b> (correr)</>}
            {isCarMode && <> · <b>CTRL Izq</b> (derrape)</>}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <span style={{ color: '#4a90d9', fontWeight: 700 }}>🔵 J2 (Azul):</span> Flechas (mover) · <b>ENTER</b> (patada)
            {room.options.stamina && <> · <b>SHIFT Der</b> (correr)</>}
            {isCarMode && <> · <b>CTRL Der</b> (derrape)</>}
            &nbsp;&nbsp;|&nbsp;&nbsp;
            <b>ESC</b> menú
          </>
        ) : isCarMode ? (
          <>
            Controles: <b>W</b> acelerar &nbsp;·&nbsp;
            <b>A / D</b> direccionar ruedas (flecha) &nbsp;·&nbsp;
            <b>S</b> reversa / frenar &nbsp;·&nbsp;
            <b>Shift</b> BOOST &nbsp;·&nbsp;
            <b>Ctrl</b> DERRAPE &nbsp;·&nbsp;
            <b>Espacio</b> KICK / FLIP &nbsp;·&nbsp;
            <b>C</b> cambiar cámara (auto/fija) &nbsp;·&nbsp;
            <b>Ruedita / Q / E</b> zoom &nbsp;·&nbsp;
            <b>ESC</b> menú
          </>
        ) : (
          <>
            Controles: <b>WASD</b> moverte &nbsp;·&nbsp;
            {room.options.stamina && <><b>Shift</b> correr &nbsp;·&nbsp;</>}
            <b>Espacio</b> patear &nbsp;·&nbsp;
            <b>Ruedita / Q / E</b> zoom &nbsp;·&nbsp;
            <b>ESC</b> menú
          </>
        )}
      </div>

      {/* Menú de opciones (ESC) - No pausa el partido */}
      {showMenu && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(2px)',
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowMenu(false);
          }}
        >
          <div
            style={{
              ...panelStyle,
              padding: '28px 24px',
              maxWidth: 360,
              width: '90%',
              textAlign: 'center',
              boxShadow: '0 12px 36px rgba(0,0,0,0.85)',
              border: `1px solid ${COLORS.gold}`,
            }}
          >
            <div className="cs-mono" style={{ fontSize: 12, color: COLORS.gold, marginBottom: 6, letterSpacing: 1 }}>
              OPCIONES (ESC)
            </div>
            <h2 className="cs-mono" style={{ fontSize: 24, margin: '0 0 20px', color: COLORS.cream }}>
              ⚽ Menú de Partida
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                className="cs-btn"
                onClick={() => setShowMenu(false)}
                style={{
                  padding: '12px 18px',
                  borderRadius: 4,
                  background: COLORS.gold,
                  color: COLORS.ink,
                  fontWeight: 700,
                  fontSize: 15,
                  border: `1px solid ${COLORS.gold}`,
                  cursor: 'pointer',
                }}
              >
                Volver al juego
              </button>

              <button
                type="button"
                className="cs-btn"
                onClick={() => {
                  setShowMenu(false);
                  if (onBackToLobby) onBackToLobby();
                }}
                style={{
                  ...ghostButton,
                  padding: '12px 18px',
                  fontSize: 15,
                  cursor: 'pointer',
                }}
              >
                Volver a la sala
              </button>

              <button
                type="button"
                className="cs-btn"
                onClick={() => {
                  setShowMenu(false);
                  if (onLeave) onLeave();
                }}
                style={{
                  ...ghostButton,
                  padding: '12px 18px',
                  fontSize: 15,
                  color: COLORS.error,
                  borderColor: COLORS.error,
                  cursor: 'pointer',
                }}
              >
                Salir
              </button>
            </div>

            <div style={{ marginTop: 14, fontSize: 12, color: COLORS.muted }}>
              El partido sigue en curso de fondo
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Posiciones de los cuerpos que simula esta pantalla, antes del último paso de física.
function captureBodies(state, local, withBall) {
  const players = {};
  for (const id of local) {
    const p = state.players[id];
    if (p) players[id] = { x: p.x, y: p.y, angle: p.angle };
  }
  return { players, ball: withBall ? { x: state.ball.x, y: state.ball.y } : null };
}

// El estado para dibujar: lo capturado, avanzado `alpha` hacia el último paso.
function blendBodies(state, prev, alpha) {
  if (!prev) return state;
  const lerp = (a, b) => a + (b - a) * alpha;
  const players = { ...state.players };
  for (const [id, before] of Object.entries(prev.players)) {
    const current = players[id];
    if (!current) continue;
    players[id] = { ...current, x: lerp(before.x, current.x), y: lerp(before.y, current.y) };
    if (current.angle !== undefined && before.angle !== undefined) {
      players[id].angle = current.angle - angleDiff(current.angle, before.angle) * (1 - alpha);
    }
  }
  const ball = prev.ball ? { ...state.ball, x: lerp(prev.ball.x, state.ball.x), y: lerp(prev.ball.y, state.ball.y) } : state.ball;
  return { ...state, players, ball };
}

// Teclas que usa el juego, para no dejar que Control + tecla dispare un atajo del navegador.
function isGameKey(e) {
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  return ['w', 'a', 's', 'd', 'q', 'e', 'c', 'x', ' ', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k);
}

// ─── Marcas de goma ─────────────────────────────────────────────────────────
// Mientras un auto derrapa, sus ruedas traseras dejan una huella que se borra en un par de segundos.
// Es solo dibujo: no está en el estado del partido ni viaja por la red (cada pantalla la arma sola
// con el `isDrifting` de cada auto).
const SKID_FADE_MS = 2200;
const SKID_MAX_POINTS = 240;

function drawSkidMarks(ctx, players, skids, now) {
  const halfW = (CAR_CONFIG.width || 28) / 2;
  const halfH = (CAR_CONFIG.height || 18) / 2;
  for (const car of Object.values(players)) {
    let marks = skids.get(car.id);
    if (!marks) {
      marks = [];
      skids.set(car.id, marks);
    }
    if (car.isDrifting) {
      const cos = Math.cos(car.angle || 0);
      const sin = Math.sin(car.angle || 0);
      const back = -halfW + 4;
      const side = halfH - 2;
      marks.push({
        t: now,
        l: { x: car.x + back * cos + side * sin, y: car.y + back * sin - side * cos },
        r: { x: car.x + back * cos - side * sin, y: car.y + back * sin + side * cos },
      });
    } else if (marks.length && marks[marks.length - 1]) {
      marks.push(null); // corte: la próxima huella empieza aparte
    }
    while (marks.length && (!marks[0] || now - marks[0].t > SKID_FADE_MS)) marks.shift();
    if (marks.length > SKID_MAX_POINTS) marks.splice(0, marks.length - SKID_MAX_POINTS);
  }
  for (const [id, marks] of skids) {
    if (!players[id]) skids.delete(id);
  }

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.5;
  for (const marks of skids.values()) {
    for (let i = 1; i < marks.length; i++) {
      const a = marks[i - 1];
      const b = marks[i];
      if (!a || !b) continue;
      const alpha = 0.32 * (1 - (now - b.t) / SKID_FADE_MS);
      if (alpha <= 0) continue;
      ctx.strokeStyle = `rgba(20, 20, 20, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(a.l.x, a.l.y);
      ctx.lineTo(b.l.x, b.l.y);
      ctx.moveTo(a.r.x, a.r.y);
      ctx.lineTo(b.r.x, b.r.y);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function angleDiff(a, b) {
  let d = (a ?? 0) - (b ?? 0);
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function handleLocalKeyDown(e, isCarMode, p1Input, p2Input) {
  const code = e.code;
  const key = e.key;
  const k = key.length === 1 ? key.toLowerCase() : key;

  // Jugador 1: WASD, Space, ShiftLeft
  if (isCarMode) {
    if (k === 'w' || code === 'KeyW') p1Input.accelerate = true;
    if (k === 's' || code === 'KeyS') p1Input.brake = true;
    if (k === 'a' || code === 'KeyA') p1Input.turnLeft = true;
    if (k === 'd' || code === 'KeyD') p1Input.turnRight = true;
    if (code === 'Space' || k === ' ') p1Input.kick = true;
    if (code === 'ShiftLeft') p1Input.boost = true;
    if (code === 'ControlLeft') p1Input.drift = true;
  } else {
    if (k === 'w' || code === 'KeyW') p1Input.up = true;
    if (k === 's' || code === 'KeyS') p1Input.down = true;
    if (k === 'a' || code === 'KeyA') p1Input.left = true;
    if (k === 'd' || code === 'KeyD') p1Input.right = true;
    if (code === 'Space' || k === ' ') p1Input.kick = true;
    if (code === 'ShiftLeft') p1Input.shift = true;
  }

  // Jugador 2: Arrow keys, Enter, ShiftRight
  if (isCarMode) {
    if (code === 'ArrowUp' || k === 'ArrowUp') p2Input.accelerate = true;
    if (code === 'ArrowDown' || k === 'ArrowDown') p2Input.brake = true;
    if (code === 'ArrowLeft' || k === 'ArrowLeft') p2Input.turnLeft = true;
    if (code === 'ArrowRight' || k === 'ArrowRight') p2Input.turnRight = true;
    if (code === 'Enter' || k === 'Enter') p2Input.kick = true;
    if (code === 'ShiftRight') p2Input.boost = true;
    if (code === 'ControlRight') p2Input.drift = true;
  } else {
    if (code === 'ArrowUp' || k === 'ArrowUp') p2Input.up = true;
    if (code === 'ArrowDown' || k === 'ArrowDown') p2Input.down = true;
    if (code === 'ArrowLeft' || k === 'ArrowLeft') p2Input.left = true;
    if (code === 'ArrowRight' || k === 'ArrowRight') p2Input.right = true;
    if (code === 'Enter' || k === 'Enter') p2Input.kick = true;
    if (code === 'ShiftRight') p2Input.shift = true;
  }
}

function handleLocalKeyUp(e, isCarMode, p1Input, p2Input) {
  const code = e.code;
  const key = e.key;
  const k = key.length === 1 ? key.toLowerCase() : key;

  // Jugador 1
  if (isCarMode) {
    if (k === 'w' || code === 'KeyW') p1Input.accelerate = false;
    if (k === 's' || code === 'KeyS') p1Input.brake = false;
    if (k === 'a' || code === 'KeyA') p1Input.turnLeft = false;
    if (k === 'd' || code === 'KeyD') p1Input.turnRight = false;
    if (code === 'Space' || k === ' ') p1Input.kick = false;
    if (code === 'ShiftLeft') p1Input.boost = false;
    if (code === 'ControlLeft') p1Input.drift = false;
  } else {
    if (k === 'w' || code === 'KeyW') p1Input.up = false;
    if (k === 's' || code === 'KeyS') p1Input.down = false;
    if (k === 'a' || code === 'KeyA') p1Input.left = false;
    if (k === 'd' || code === 'KeyD') p1Input.right = false;
    if (code === 'Space' || k === ' ') p1Input.kick = false;
    if (code === 'ShiftLeft') p1Input.shift = false;
  }

  // Jugador 2
  if (isCarMode) {
    if (code === 'ArrowUp' || k === 'ArrowUp') p2Input.accelerate = false;
    if (code === 'ArrowDown' || k === 'ArrowDown') p2Input.brake = false;
    if (code === 'ArrowLeft' || k === 'ArrowLeft') p2Input.turnLeft = false;
    if (code === 'ArrowRight' || k === 'ArrowRight') p2Input.turnRight = false;
    if (code === 'Enter' || k === 'Enter') p2Input.kick = false;
    if (code === 'ShiftRight') p2Input.boost = false;
    if (code === 'ControlRight') p2Input.drift = false;
  } else {
    if (code === 'ArrowUp' || k === 'ArrowUp') p2Input.up = false;
    if (code === 'ArrowDown' || k === 'ArrowDown') p2Input.down = false;
    if (code === 'ArrowLeft' || k === 'ArrowLeft') p2Input.left = false;
    if (code === 'ArrowRight' || k === 'ArrowRight') p2Input.right = false;
    if (code === 'Enter' || k === 'Enter') p2Input.kick = false;
    if (code === 'ShiftRight') p2Input.shift = false;
  }
}

// Qué acción del input local controla cada tecla.
function inputField(key, isCarMode) {
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === ' ' || k === 'Enter' || k === 'x') return 'kick';
  if (isCarMode) {
    if (k === 'w' || k === 'ArrowUp') return 'accelerate';
    if (k === 's' || k === 'ArrowDown') return 'brake';
    if (k === 'a' || k === 'ArrowLeft') return 'turnLeft';
    if (k === 'd' || k === 'ArrowRight') return 'turnRight';
    if (k === 'Shift') return 'boost';
    if (k === 'Control') return 'drift';
    return null;
  }
  if (k === 'w' || k === 'ArrowUp') return 'up';
  if (k === 's' || k === 'ArrowDown') return 'down';
  if (k === 'a' || k === 'ArrowLeft') return 'left';
  if (k === 'd' || k === 'ArrowRight') return 'right';
  if (k === 'Shift') return 'shift';
  return null;
}

function countdownText(ms) {
  const sec = Math.ceil(ms / 1000);
  if (sec <= 0) return '¡A JUGAR!';
  return String(sec);
}

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ─── Funciones de dibujo ───────────────────────────────────────────────────
// ─── Funciones de dibujo ───────────────────────────────────────────────────
function goalRunoffMargin(field = FIELD) {
  return Number(field.goalMargin ?? field.sideMargin ?? GOAL_RUNOFF_MARGIN);
}

function drawField(ctx, field = FIELD) {
  const w = field.width;
  const h = field.height;
  const sm = field.sideMargin || 0;
  const gm = goalRunoffMargin(field);

  if (field.isVertical) {
    // Área exterior completa del jugador, incluyendo las cuatro esquinas.
    if (sm > 0 || gm > 0) {
      ctx.fillStyle = '#1a3a1f';
      ctx.fillRect(-sm, -gm, w + sm * 2, h + gm * 2);

      ctx.strokeStyle = 'rgba(255,255,255,0.28)';
      ctx.lineWidth = 3;
      ctx.setLineDash([]);
      ctx.strokeRect(-sm, -gm, w + sm * 2, h + gm * 2);
    }

    // Fondo de césped
    ctx.fillStyle = GRASS_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Rayas horizontales de césped
    const stripeH = 70;
    ctx.fillStyle = GRASS_STRIPE;
    for (let y = 0; y < h; y += stripeH * 2) {
      ctx.fillRect(0, y, w, stripeH);
    }

    const wt = field.wallThickness;

    // Paredes exteriores (solo del campo)
    ctx.fillStyle = '#224a2b';
    ctx.fillRect(0, 0, w, wt);               // arriba
    ctx.fillRect(0, h - wt, w, wt);           // abajo
    ctx.fillRect(0, wt, wt, h - wt * 2);      // izquierda
    ctx.fillRect(w - wt, wt, wt, h - wt * 2); // derecha

    // Líneas del campo
    ctx.strokeStyle = LINE_COLOR;
    ctx.lineWidth = LINE_WIDTH;
    ctx.strokeRect(wt, wt, w - wt * 2, h - wt * 2);

    // Línea del medio (horizontal)
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.moveTo(wt, cy);
    ctx.lineTo(w - wt, cy);
    ctx.stroke();

    // Círculo central
    ctx.beginPath();
    ctx.arc(cx, cy, 80, 0, Math.PI * 2);
    ctx.stroke();

    // Punto central
    ctx.fillStyle = LINE_COLOR;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();

    // Áreas de penal (arriba y abajo)
    const areaW = (field.goalWidth || 180) + 80;
    const areaH = 120;
    // Área superior (defiende Azul)
    ctx.strokeRect(cx - areaW / 2, wt, areaW, areaH);
    // Área inferior (defiende Rojo)
    ctx.strokeRect(cx - areaW / 2, h - wt - areaH, areaW, areaH);
    return;
  }

  // Área exterior completa del jugador, incluyendo las cuatro esquinas.
  if (sm > 0 || gm > 0) {
    ctx.fillStyle = '#1a3a1f';
    ctx.fillRect(-gm, -sm, w + gm * 2, h + sm * 2);

    ctx.strokeStyle = 'rgba(255,255,255,0.28)';
    ctx.lineWidth = 3;
    ctx.setLineDash([]);
    ctx.strokeRect(-gm, -sm, w + gm * 2, h + sm * 2);
  }

  // Fondo de césped con rayas verticales
  ctx.fillStyle = GRASS_COLOR;
  ctx.fillRect(0, 0, w, h);

  const stripeW = 70;
  ctx.fillStyle = GRASS_STRIPE;
  for (let x = 0; x < w; x += stripeW * 2) {
    ctx.fillRect(x, 0, stripeW, h);
  }

  const wt = field.wallThickness;

  // Paredes exteriores
  ctx.fillStyle = '#224a2b';
  ctx.fillRect(0, 0, w, wt);               // arriba
  ctx.fillRect(0, h - wt, w, wt);           // abajo
  ctx.fillRect(0, wt, wt, h - wt * 2);      // izquierda
  ctx.fillRect(w - wt, wt, wt, h - wt * 2); // derecha

  // Líneas del campo
  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = LINE_WIDTH;
  ctx.strokeRect(wt, wt, w - wt * 2, h - wt * 2);

  // Línea del medio
  const cx = w / 2;
  const cy = h / 2;
  ctx.beginPath();
  ctx.moveTo(cx, wt);
  ctx.lineTo(cx, h - wt);
  ctx.stroke();

  // Círculo central
  ctx.beginPath();
  ctx.arc(cx, cy, 80, 0, Math.PI * 2);
  ctx.stroke();

  // Punto central
  ctx.fillStyle = LINE_COLOR;
  ctx.beginPath();
  ctx.arc(cx, cy, 4, 0, Math.PI * 2);
  ctx.fill();

  // Áreas de gol
  const areaW = 120;
  const areaH = field.goalHeight + 80;
  ctx.strokeRect(wt, cy - areaH / 2, areaW, areaH);
  ctx.strokeRect(w - wt - areaW, cy - areaH / 2, areaW, areaH);
}

function drawGoals(ctx, field = FIELD) {
  const w = field.width;
  const h = field.height;
  const wt = field.wallThickness;
  const cx = w / 2;
  const cy = h / 2;

  if (field.isVertical) {
    const goalW = field.goalWidth || 180;
    const goalHalf = goalW / 2;
    const goalDepth = field.goalDepth || 28;

    // Arco superior (el equipo AZUL defiende este arco)
    ctx.fillStyle = 'rgba(74, 144, 217, 0.18)';
    ctx.fillRect(cx - goalHalf, 0, goalW, wt + goalDepth);
    ctx.strokeStyle = TEAM_COLOR.blue;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - goalHalf, wt);
    ctx.lineTo(cx - goalHalf, wt - goalDepth);
    ctx.lineTo(cx + goalHalf, wt - goalDepth);
    ctx.lineTo(cx + goalHalf, wt);
    ctx.stroke();

    // Postes del arco superior
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - goalHalf, wt, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + goalHalf, wt, 5, 0, Math.PI * 2);
    ctx.fill();

    // Arco inferior (el equipo ROJO defiende este arco)
    ctx.fillStyle = 'rgba(224, 80, 80, 0.18)';
    ctx.fillRect(cx - goalHalf, h - wt - goalDepth, goalW, wt + goalDepth);
    ctx.strokeStyle = TEAM_COLOR.red;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(cx - goalHalf, h - wt);
    ctx.lineTo(cx - goalHalf, h - wt + goalDepth);
    ctx.lineTo(cx + goalHalf, h - wt + goalDepth);
    ctx.lineTo(cx + goalHalf, h - wt);
    ctx.stroke();

    // Postes del arco inferior
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(cx - goalHalf, h - wt, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + goalHalf, h - wt, 5, 0, Math.PI * 2);
    ctx.fill();
    return;
  }

  const goalHalf = field.goalHeight / 2;
  const goalDepth = field.goalDepth || 28;

  // Arco izquierdo (el equipo ROJO defiende este arco)
  ctx.fillStyle = 'rgba(224, 80, 80, 0.18)';
  ctx.fillRect(0, cy - goalHalf, wt + goalDepth, field.goalHeight);
  ctx.strokeStyle = TEAM_COLOR.red;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(wt, cy - goalHalf);
  ctx.lineTo(wt - goalDepth, cy - goalHalf);
  ctx.lineTo(wt - goalDepth, cy + goalHalf);
  ctx.lineTo(wt, cy + goalHalf);
  ctx.stroke();

  // Postes del arco izquierdo
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(wt, cy - goalHalf, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(wt, cy + goalHalf, 5, 0, Math.PI * 2);
  ctx.fill();

  // Arco derecho (el equipo AZUL defiende este arco)
  ctx.fillStyle = 'rgba(74, 144, 217, 0.18)';
  ctx.fillRect(w - wt - goalDepth, cy - goalHalf, wt + goalDepth, field.goalHeight);
  ctx.strokeStyle = TEAM_COLOR.blue;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(w - wt, cy - goalHalf);
  ctx.lineTo(w - wt + goalDepth, cy - goalHalf);
  ctx.lineTo(w - wt + goalDepth, cy + goalHalf);
  ctx.lineTo(w - wt, cy + goalHalf);
  ctx.stroke();

  // Postes del arco derecho
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(w - wt, cy - goalHalf, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(w - wt, cy + goalHalf, 5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(ctx, player, showStaminaBar = false) {
  const color = TEAM_COLOR[player.team] || '#888';
  const r = PLAYER_CONFIG.radius;

  // Sombra
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(player.x + 2, player.y + 4, r, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Efecto kick (anillo blanco alrededor del jugador cuando el kick está activo)
  if (player.isKicking) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(player.x, player.y, r + 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Cuerpo del jugador
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(player.x, player.y, r, 0, Math.PI * 2);
  ctx.fill();

  // Borde
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Inicial del nombre
  const initial = (player.name || '?')[0].toUpperCase();
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${r}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, player.x, player.y);

  // Barra de estámina
  if (showStaminaBar) {
    const st = player.stamina ?? 100;
    const barW = 28;
    const barH = 4;
    const bx = player.x - barW / 2;
    const by = player.y + r + 6;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);

    ctx.fillStyle = st > 50 ? '#4cd964' : st > 20 ? '#ffcc00' : '#ff3b30';
    ctx.fillRect(bx, by, (barW * Math.max(0, Math.min(100, st))) / 100, barH);
  }
}

function drawBall(ctx, ball, isCarMode = false) {
  const r = isCarMode ? (CAR_BALL_CONFIG?.radius || 14.5) : BALL_CONFIG.radius;

  // Sombra más profunda para pelota pesada
  ctx.fillStyle = isCarMode ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(ball.x + 2, ball.y + 3, r, r * 0.6, 0, 0, Math.PI * 2);
  ctx.fill();

  if (isCarMode) {
    // Pelota pesada modo Coches: textura técnica / balón estilizado de fútbol
    ctx.fillStyle = '#f5f5f5';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Pentágono central
    ctx.fillStyle = '#23252a';
    ctx.beginPath();
    const hexR = r * 0.42;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const hx = ball.x + Math.cos(a) * hexR;
      const hy = ball.y + Math.sin(a) * hexR;
      if (i === 0) ctx.moveTo(hx, hy);
      else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.fill();

    // Costuras exteriores
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
      const hx = ball.x + Math.cos(a) * hexR;
      const hy = ball.y + Math.sin(a) * hexR;
      const ox = ball.x + Math.cos(a) * r;
      const oy = ball.y + Math.sin(a) * r;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(ox, oy);
      ctx.stroke();
    }

    // Borde exterior metálico
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    // Pelota normal limpia
    ctx.fillStyle = '#f0f0f0';
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawBoostPickups(ctx, pickups) {
  const now = Date.now();
  pickups.forEach((p) => {
    if (p.type === 'large') {
      // ─── Pad Grande (+100) ─────────────────────────────────
      ctx.fillStyle = p.active ? 'rgba(35, 25, 12, 0.75)' : 'rgba(20, 20, 20, 0.4)';
      ctx.strokeStyle = p.active ? '#f59e0b' : '#444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (p.active) {
        // Halo exterior pulsante
        const pulse = Math.sin(now * 0.006 + p.x * 0.1) * 3;
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius + 3 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Orbe central brillante
        const grad = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.radius * 0.65);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.4, '#fbbf24');
        grad.addColorStop(1, '#d97706');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.65, 0, Math.PI * 2);
        ctx.fill();

        // Texto '100'
        ctx.fillStyle = '#1a1005';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('100', p.x, p.y);
      } else {
        // Inactivo: arco de cuenta regresiva de respawn
        const pct = 1 - Math.max(0, p.respawnTimer / p.respawnDelay);
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.6, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
        ctx.stroke();
      }
    } else {
      // ─── Pad Pequeño (+12) ─────────────────────────────────
      ctx.fillStyle = p.active ? 'rgba(12, 28, 42, 0.7)' : 'rgba(20, 20, 20, 0.4)';
      ctx.strokeStyle = p.active ? '#38bdf8' : '#333';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (p.active) {
        // Rombo central luminoso
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y - 6);
        ctx.lineTo(p.x + 6, p.y);
        ctx.lineTo(p.x, p.y + 6);
        ctx.lineTo(p.x - 6, p.y);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const pct = 1 - Math.max(0, p.respawnTimer / p.respawnDelay);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 0.6, -Math.PI / 2, -Math.PI / 2 + pct * Math.PI * 2);
        ctx.stroke();
      }
    }
  });
}

function drawExhaustFlame(ctx, x, y, len, w) {
  // Llama exterior naranja/fuego
  ctx.fillStyle = '#ff6200';
  ctx.beginPath();
  ctx.moveTo(x, y - w / 2);
  ctx.lineTo(x - len, y);
  ctx.lineTo(x, y + w / 2);
  ctx.closePath();
  ctx.fill();

  // Núcleo amarillo brillante
  ctx.fillStyle = '#ffea00';
  ctx.beginPath();
  ctx.moveTo(x, y - w / 3);
  ctx.lineTo(x - len * 0.65, y);
  ctx.lineTo(x, y + w / 3);
  ctx.closePath();
  ctx.fill();

  // Centro blanco incandescente
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(x, y - w / 5);
  ctx.lineTo(x - len * 0.35, y);
  ctx.lineTo(x, y + w / 5);
  ctx.closePath();
  ctx.fill();
}

function drawCar(ctx, car) {
  const w = CAR_CONFIG.width || 28;
  const h = CAR_CONFIG.height || 18;
  const halfW = w / 2;
  const halfH = h / 2;
  const color = TEAM_COLOR[car.team] || '#888';
  const roofColor = car.team === 'red' ? '#b83232' : '#2f6fa8';
  const angle = car.angle || 0;

  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(angle);

  // 0. Efecto de Front Flip (Rocket League 3D Pitch Illusion)
  if (car.isFlipping) {
    // Estelas de rotación aérea en los laterales
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, halfW + 6, -0.65, 0.65);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, halfW + 6, Math.PI - 0.65, Math.PI + 0.65);
    ctx.stroke();

    // Compresión longitudinal para dar efecto de vuelta aérea vertical
    const flipFrac = (car.flipTime || 0) / (CAR_CONFIG.flipDuration || 360);
    const pitchScale = Math.cos((1 - flipFrac) * Math.PI * 2);
    ctx.scale(1, Math.max(0.25, Math.abs(pitchScale)));
  }

  // 0.5. Llamas de Boost en los dos escapes traseros
  if (car.isBoosting) {
    const flameLen = 15 + Math.random() * 9;
    const flameW = 4.5;
    drawExhaustFlame(ctx, -halfW - 2, -halfH + 4, flameLen, flameW);
    drawExhaustFlame(ctx, -halfW - 2, halfH - 4, flameLen, flameW);
  }

  // 1. Sombra bajo el auto
  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-halfW + 1, -halfH + 2, w, h, 4);
  } else {
    ctx.rect(-halfW + 1, -halfH + 2, w, h);
  }
  ctx.fill();

  // 2. Ruedas (4 neumáticos oscuros)
  ctx.fillStyle = '#1e1e1e';
  const wheelW = 7;
  const wheelH = 3.5;
  const steer = car.steerAngle || 0;

  // Ruedas traseras (fijas)
  ctx.fillRect(-halfW + 2, -halfH - 2, wheelW, wheelH);
  ctx.fillRect(-halfW + 2, halfH - 1.5, wheelW, wheelH);

  // Ruedas delanteras (rotadas con steerAngle de dirección)
  const frontX = halfW - wheelW / 2 - 1;
  const frontTopY = -halfH - 2 + wheelH / 2;
  const frontBotY = halfH - 1.5 + wheelH / 2;

  ctx.save();
  ctx.translate(frontX, frontTopY);
  ctx.rotate(steer);
  ctx.fillRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH);
  ctx.restore();

  ctx.save();
  ctx.translate(frontX, frontBotY);
  ctx.rotate(steer);
  ctx.fillRect(-wheelW / 2, -wheelH / 2, wheelW, wheelH);
  ctx.restore();

  // 3. Carrocería principal (color del equipo)
  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(-halfW, -halfH, w, h, [3, 6, 6, 3]);
  } else {
    ctx.rect(-halfW, -halfH, w, h);
  }
  ctx.fill();

  // Borde nítido
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // 4. Luces delanteras (faros amarillos brillantes en el frente +X)
  ctx.fillStyle = '#fff9a6';
  ctx.fillRect(halfW - 2, -halfH + 2, 2.5, 3);
  ctx.fillRect(halfW - 2, halfH - 5, 2.5, 3);

  // 5. Luces traseras (rojas en la parte trasera -X)
  ctx.fillStyle = '#ff2a2a';
  ctx.fillRect(-halfW, -halfH + 2, 2, 3);
  ctx.fillRect(-halfW, halfH - 5, 2, 3);

  // 6. Alerón trasero
  ctx.fillStyle = '#181818';
  ctx.fillRect(-halfW - 2, -halfH + 1, 2.5, h - 2);

  // 7. Parabrisas delantero
  ctx.fillStyle = '#1a2634';
  ctx.beginPath();
  ctx.moveTo(1, -halfH + 3);
  ctx.lineTo(halfW - 5, -halfH + 4);
  ctx.lineTo(halfW - 5, halfH - 4);
  ctx.lineTo(1, halfH - 3);
  ctx.closePath();
  ctx.fill();

  // Reflejo en parabrisas
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(3, -halfH + 4);
  ctx.lineTo(halfW - 7, halfH - 5);
  ctx.stroke();

  // 8. Ventana trasera
  ctx.fillStyle = '#141d27';
  ctx.fillRect(-halfW + 3, -halfH + 3.5, 3.5, h - 7);

  // 9. Techo (cabina central)
  ctx.fillStyle = roofColor;
  ctx.fillRect(-halfW + 7, -halfH + 3, w - 15, h - 6);

  // 10. Letra inicial del jugador en el techo
  const initial = (car.name || '?')[0].toUpperCase();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initial, 0, 0);

  // 11. Pequeña barra de Boost sobre el auto
  const bVal = car.boost ?? 33;
  const barW = 24;
  const barH = 3;
  const bx = -barW / 2;
  const by = -halfH - 8;
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
  ctx.fillStyle = bVal > 50 ? '#f59e0b' : bVal > 20 ? '#fbbf24' : '#ef4444';
  ctx.fillRect(bx, by, (barW * Math.max(0, Math.min(100, bVal))) / 100, barH);

  // 12. Flecha indicadora de dirección de las ruedas (estilo Rocket League)
  // Muestra hacia dónde apuntan las ruedas y hacia dónde irá el auto al presionar W
  const arrowDist = halfW + 3;
  const arrowLength = 17;
  const isTurned = Math.abs(steer) > 0.04;
  const arrowColor = isTurned ? '#ffea00' : 'rgba(255, 255, 255, 0.75)';

  ctx.save();
  ctx.translate(arrowDist, 0);
  ctx.rotate(steer);

  // Sombra negra para máxima visibilidad sobre el césped
  ctx.shadowColor = 'rgba(0,0,0,0.85)';
  ctx.shadowBlur = 4;

  // Tallo de la flecha
  ctx.strokeStyle = arrowColor;
  ctx.lineWidth = isTurned ? 2.5 : 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(1, 0);
  ctx.lineTo(arrowLength - 5, 0);
  ctx.stroke();

  // Cabeza de flecha puntiaguda
  ctx.fillStyle = arrowColor;
  ctx.beginPath();
  ctx.moveTo(arrowLength, 0);
  ctx.lineTo(arrowLength - 6.5, -4);
  ctx.lineTo(arrowLength - 5, 0);
  ctx.lineTo(arrowLength - 6.5, 4);
  ctx.closePath();
  ctx.fill();

  ctx.restore();

  ctx.restore();
}

function drawCarHUD(ctx, car, canvasSize) {
  const boostVal = Math.round(car.boost ?? 0);
  const isCooldown = (car.flipCooldown ?? 0) > 0;
  const cdSec = ((car.flipCooldown ?? 0) / 1000).toFixed(1);

  const cx = canvasSize.w - 78;
  const cy = canvasSize.h - 76;
  const r = 46;

  ctx.save();

  // Fondo circular oscuro translúcido
  ctx.fillStyle = 'rgba(14, 16, 22, 0.82)';
  ctx.beginPath();
  ctx.arc(cx, cy, r + 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Pista de fondo del medidor de boost (arco 270 grados)
  const startAngle = 0.75 * Math.PI;
  const totalSweep = 1.5 * Math.PI;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  ctx.lineWidth = 8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, startAngle, startAngle + totalSweep);
  ctx.stroke();

  // Arco activo de boost con color según carga
  if (boostVal > 0) {
    const sweep = totalSweep * Math.min(1, boostVal / 100);
    ctx.strokeStyle = boostVal > 50 ? '#f59e0b' : boostVal > 20 ? '#fbbf24' : '#ef4444';
    ctx.shadowColor = boostVal > 50 ? '#f59e0b' : '#ef4444';
    ctx.shadowBlur = 10;
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, startAngle + sweep);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Valor numérico de Boost en el centro
  ctx.font = '900 32px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000';
  ctx.shadowBlur = 6;
  ctx.fillText(`${boostVal}`, cx, cy - 6);

  // Etiqueta BOOST
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = boostVal > 0 ? '#f59e0b' : '#888';
  ctx.fillText('BOOST (Shift)', cx, cy + 18);

  // Badge / Pastilla de FLIP a la izquierda del medidor
  const pillW = 120;
  const pillH = 24;
  const pillX = cx - r - pillW - 12;
  const pillY = cy - pillH / 2;

  ctx.fillStyle = 'rgba(14, 16, 22, 0.85)';
  ctx.strokeStyle = isCooldown ? 'rgba(239, 68, 68, 0.65)' : 'rgba(34, 197, 94, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(pillX, pillY, pillW, pillH, 6);
  } else {
    ctx.rect(pillX, pillY, pillW, pillH);
  }
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isCooldown ? '#f87171' : '#4ade80';
  ctx.fillText(isCooldown ? `FLIP: ${cdSec}s` : 'FLIP: LISTO (Espacio)', pillX + pillW / 2, pillY + pillH / 2);

  ctx.restore();
}

/**
 * Dibuja un indicador perimetral estilo Rocket League cuando la pelota sale de la pantalla visible.
 * Incluye flecha apuntando a la pelota, mini-balón y distancia en metros.
 */
function drawOffscreenBallIndicator(ctx, ball, myCar, canvasSize, zoom, screenCenterX, screenCenterY, cx, cy, isRotatingCam) {
  if (!ball) return;

  const bx = ball.x - cx;
  const by = ball.y - cy;

  let ballScreenX, ballScreenY;
  if (isRotatingCam && myCar) {
    const carAngle = myCar.angle ?? -Math.PI / 2;
    const rot = -Math.PI / 2 - carAngle;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const rx = bx * cosR - by * sinR;
    const ry = bx * sinR + by * cosR;
    ballScreenX = screenCenterX + rx * zoom;
    ballScreenY = screenCenterY + ry * zoom;
  } else {
    ballScreenX = screenCenterX + bx * zoom;
    ballScreenY = screenCenterY + by * zoom;
  }

  // Comprobar si la pelota está fuera del área visible de la pantalla
  const margin = 26;
  const isOffscreen = (
    ballScreenX < margin ||
    ballScreenX > canvasSize.w - margin ||
    ballScreenY < margin ||
    ballScreenY > canvasSize.h - margin
  );

  if (!isOffscreen) return; // Si la pelota ya se ve en pantalla, no dibujamos el indicador

  // Vector desde el centro de la pantalla hacia la pelota
  const dx = ballScreenX - screenCenterX;
  const dy = ballScreenY - screenCenterY;
  if (dx === 0 && dy === 0) return;

  // Intersección ray-box con los bordes de la pantalla
  const edgeMargin = 42;
  const minX = edgeMargin;
  const maxX = canvasSize.w - edgeMargin;
  const minY = edgeMargin;
  const maxY = canvasSize.h - edgeMargin;

  let t = Infinity;
  if (dx > 0) t = Math.min(t, (maxX - screenCenterX) / dx);
  else if (dx < 0) t = Math.min(t, (minX - screenCenterX) / dx);

  if (dy > 0) t = Math.min(t, (maxY - screenCenterY) / dy);
  else if (dy < 0) t = Math.min(t, (minY - screenCenterY) / dy);

  const indX = Math.max(minX, Math.min(maxX, screenCenterX + dx * t));
  const indY = Math.max(minY, Math.min(maxY, screenCenterY + dy * t));
  const angle = Math.atan2(dy, dx);

  // Distancia del auto a la pelota
  const distWorld = myCar ? Math.hypot(ball.x - myCar.x, ball.y - myCar.y) : Math.hypot(dx, dy) / zoom;
  const distMeters = Math.round(distWorld / 14);

  ctx.save();
  ctx.translate(indX, indY);

  // Sombra negra para destacar sobre cualquier textura del mapa
  ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
  ctx.shadowBlur = 8;

  // 1. Flecha exterior apuntando directamente hacia la pelota
  const pulse = 1 + Math.sin(Date.now() / 200) * 0.08;
  ctx.save();
  ctx.rotate(angle);
  ctx.scale(pulse, pulse);
  ctx.fillStyle = '#f59e0b';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(10, -9);
  ctx.lineTo(13, 0);
  ctx.lineTo(10, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 2. Círculo / Badge de la pelota
  const badgeR = 15;
  ctx.beginPath();
  ctx.arc(0, 0, badgeR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#f59e0b';
  ctx.stroke();

  // 3. Patrón de pelota de fútbol en el badge
  ctx.fillStyle = '#1e1e1e';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const px = Math.cos(a) * 4.5;
    const py = Math.sin(a) * 4.5;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = '#1e1e1e';
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 4.5, Math.sin(a) * 4.5);
    ctx.lineTo(Math.cos(a) * badgeR, Math.sin(a) * badgeR);
    ctx.stroke();
  }

  // 4. Etiqueta de distancia en metros debajo del badge
  ctx.shadowColor = 'rgba(0, 0, 0, 1)';
  ctx.shadowBlur = 4;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#fef08a';
  ctx.fillText(`${distMeters}m`, 0, badgeR + 3);

  ctx.restore();
}


