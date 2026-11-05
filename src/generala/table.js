// Generala: la mesa en 3D. Dibuja la bandeja, el cubilete y los dados con Three.js y reproduce cada tirada
// con la trayectoria que calcula la física (`simulate` de dice.js). No decide nada del juego: recibe el turno
// de la sala (`sync`) y acomoda lo que se ve; cuando el jugador tira, calcula la tirada y avisa (`onThrow`).
//
// Este archivo y Three.js se cargan recién al entrar a una partida (`import('./table.js')` en
// GeneralaGame.jsx): no pesan en la portada ni en los otros juegos. La física (Rapier) corre aparte, en un
// Web Worker (`simWorker.js`): calcular una tirada lleva decenas de milisegundos y en la página la trababa.
//
// Los colores son fijos (madera, paño verde, cuero): la mesa se ve igual en los dos temas.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { everyFrame } from '../ticker.js';
import {
  CUP, DIE, FACES, HALF, HAND, SHELF, SHELF_Z, TRAY, cleanThrow, mulberry32, shelfSlot, simulate,
} from './dice.js';
import { diceToThrow } from './game.js';
import { hit, rattle, tap } from './sound.js';

const TABLE_Y = -0.6;          // la mesa está un poco más abajo que el paño: la bandeja tiene base
const LIP = 0.8;               // grosor del borde de adelante del estante
const UP = new THREE.Vector3(0, 1, 0);
const POUR_TILT = 0.38;        // rad: cuánto apunta para abajo la boca del cubilete al volcarlo
const POUR_LEAD = 90;          // ms entre que se vuelca el cubilete y sale el primer dado
const SCOOP_MS = 300;
const MOVE_MS = 260;
const SHAKE_MS = 420;          // cuánto se ve sacudir el cubilete en la tirada de otro, si no se lo vio antes
const LOCAL_WAIT_MS = 6000;    // cuánto se espera que la sala confirme una tirada propia

// ─── Texturas hechas con canvas (no hay imágenes) ────────────────────────────
function texture(size, draw, { repeat, color = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const t = new THREE.CanvasTexture(canvas);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 8;
  return t;
}

function speckle(ctx, s, rnd, count, alpha, light = '#ffffff', dark = '#000000') {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = rnd() * alpha;
    ctx.fillStyle = rnd() < 0.5 ? light : dark;
    ctx.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 1.6, 1 + rnd() * 1.6);
  }
  ctx.globalAlpha = 1;
}

// Madera: vetas onduladas a lo largo de u. Con `planks`, además, las juntas de las tablas.
function wood(base, vein, seed, planks = 0, strength = 1) {
  return (ctx, s) => {
    const rnd = mulberry32(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 110; i++) {
      const y = rnd() * s, amp = 1 + rnd() * 4, wave = 200 + rnd() * 500, phase = rnd() * 6.28;
      ctx.strokeStyle = rnd() < 0.9 ? vein : '#e8c9a0';
      ctx.globalAlpha = Math.min(1, (0.04 + rnd() * 0.15) * strength);
      ctx.lineWidth = 0.5 + rnd() * 2.6;
      ctx.beginPath();
      for (let x = 0; x <= s; x += 8) {
        const yy = y + Math.sin((x / wave) * 6.28 + phase) * amp;
        if (x) ctx.lineTo(x, yy); else ctx.moveTo(x, yy);
      }
      ctx.stroke();
    }
    speckle(ctx, s, rnd, 5000, 0.07);
    if (planks) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = '#000000';
      for (let p = 0; p < planks; p++) {
        ctx.fillRect(0, (p * s) / planks, s, 2);
        ctx.fillRect(((p % 2) * 0.5 + 0.2 + rnd() * 0.1) * s, (p * s) / planks, 2, s / planks);
      }
      ctx.globalAlpha = 1;
    }
  };
}

const feltColor = (ctx, s) => {
  const rnd = mulberry32(11);
  ctx.fillStyle = '#125a37';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, rnd, 34000, 0.13, '#4aa877', '#02110a');
};
const grain = (seed, count, alpha) => (ctx, s) => {
  const rnd = mulberry32(seed);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, s, s);
  speckle(ctx, s, rnd, count, alpha);
};

// Dónde van los puntos de cada cara (en fracciones del lado).
const A = 0.27, B = 0.5, C = 0.73;
const PIPS = {
  1: [[B, B]],
  2: [[A, A], [C, C]],
  3: [[A, A], [B, B], [C, C]],
  4: [[A, A], [C, A], [A, C], [C, C]],
  5: [[A, A], [C, A], [B, B], [A, C], [C, C]],
  6: [[A, A], [C, A], [A, B], [C, B], [A, C], [C, C]],
};

function faceColor(value) {
  return (ctx, s) => {
    const g = ctx.createRadialGradient(s / 2, s / 2, s * 0.1, s / 2, s / 2, s * 0.75);
    g.addColorStop(0, '#f7f3e8');
    g.addColorStop(1, '#e6dfcc');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, s, s);
    for (const [x, y] of PIPS[value]) {
      const r = s * (value === 1 ? 0.1 : 0.082);
      const pip = ctx.createRadialGradient(x * s - r * 0.2, y * s - r * 0.25, r * 0.1, x * s, y * s, r);
      pip.addColorStop(0, '#2a2622');
      pip.addColorStop(0.75, '#100e0c');
      pip.addColorStop(1, '#050404');
      ctx.fillStyle = pip;
      ctx.beginPath();
      ctx.arc(x * s, y * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}
// El relieve: cada punto es un hoyito.
function faceBump(value) {
  return (ctx, s) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, s, s);
    for (const [x, y] of PIPS[value]) {
      const r = s * (value === 1 ? 0.1 : 0.082) * 1.12;
      const pip = ctx.createRadialGradient(x * s, y * s, 0, x * s, y * s, r);
      pip.addColorStop(0, '#000000');
      pip.addColorStop(0.7, '#3a3a3a');
      pip.addColorStop(1, '#ffffff');
      ctx.fillStyle = pip;
      ctx.beginPath();
      ctx.arc(x * s, y * s, r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
}

const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - ((-2 * k + 2) ** 2) / 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// La física, fuera de la página. `simulate` devuelve una promesa con lo mismo que `simulate` de dice.js.
// Si el navegador no deja crear el Worker (o se rompe), la calcula la página, como antes.
class Physics {
  constructor() {
    this.jobs = new Map();
    this.next = 1;
    this.main = null;
    try {
      this.worker = new Worker(new URL('./simWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        const job = this.jobs.get(data.id);
        if (!job) return;
        this.jobs.delete(data.id);
        if (data.error) job.reject(new Error(data.error)); else job.resolve(data.result);
      };
      this.worker.onerror = () => {
        this.worker = null;
        for (const job of this.jobs.values()) job.reject(new Error('El Worker de la física no arrancó.'));
        this.jobs.clear();
      };
    } catch {
      this.worker = null;
    }
  }

  async onPage(gesture, thrown) {
    this.main ||= import('@dimforge/rapier3d-deterministic-compat').then(async (m) => { await m.default.init(); return m.default; });
    return simulate(await this.main, gesture, thrown);
  }

  simulate(gesture, thrown) {
    if (!this.worker) return this.onPage(gesture, thrown);
    return new Promise((resolve, reject) => {
      const id = this.next++;
      this.jobs.set(id, { resolve, reject });
      this.worker.postMessage({ id, gesture, thrown });
    }).catch(() => this.onPage(gesture, thrown));
  }

  dispose() {
    this.worker?.terminate();
    this.jobs.clear();
  }
}

export async function createTable(canvas, handlers) {
  return new Table(canvas, handlers);
}

class Table {
  constructor(canvas, handlers) {
    this.canvas = canvas;
    this.handlers = handlers;
    this.view = null;        // lo último que mandó la sala: { turn, canRoll, canHold }
    this.started = false;
    this.shown = 0;          // hasta qué tirada (rollN) ya se mostró
    this.play = null;        // la tirada que se está reproduciendo
    this.hand = null;        // el cubilete en la mano: { x, z, t0, remote, samples }
    this.local = null;       // tirada propia que la sala todavía no confirmó: { rollN, until }
    this.timers = [];
    this.waiting = 0;        // tiradas que la física todavía está calculando
    this.physics = new Physics();
    this.dirty = true;
    this.pick = null;
    this.slow = 1;           // para capturas: con 20 todo va veinte veces más lento
    this.time = 0;           // el reloj de la mesa, en ms (avanza en cada cuadro)
    this.real = performance.now();

    this.buildScene();
    this.fit();
    this.resizer = new ResizeObserver(() => this.fit());
    this.resizer.observe(canvas);
    this.listen();
    this.stop = everyFrame(({ hidden }) => this.frame(hidden));
  }

  // ─── Armado de la escena ───────────────────────────────────────────────────
  buildScene() {
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#0d0907');
    scene.fog = new THREE.Fog('#0d0907', 85, 190);
    const pmrem = new THREE.PMREMGenerator(renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = this.envMap;
    scene.environmentIntensity = 0.42;
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 400);

    // Una lámpara arriba y un poco adelante a la izquierda: es la que hace las sombras.
    const lamp = new THREE.DirectionalLight('#fff0d8', 3.7);
    lamp.position.set(-14, 44, 16);
    lamp.target.position.set(3, 0, 2);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(2048, 2048);
    Object.assign(lamp.shadow.camera, { left: -30, right: 34, top: 26, bottom: -26, near: 5, far: 120 });
    lamp.shadow.bias = -0.0006;
    lamp.shadow.normalBias = 0.03;
    lamp.shadow.radius = 5;
    this.lamp = lamp;
    scene.add(lamp, lamp.target, new THREE.HemisphereLight('#ffe9cf', '#20140c', 0.32));

    const { hx, hz, wall, front, thick } = TRAY;
    const add = (mesh, cast = true) => { mesh.castShadow = cast; mesh.receiveShadow = true; scene.add(mesh); return mesh; };

    // La mesa: tablas oscuras.
    const tableMat = new THREE.MeshStandardMaterial({ map: texture(1024, wood('#33200f', '#0d0603', 3, 4, 0.5), { repeat: [5, 5] }), roughness: 0.55, metalness: 0 });
    const table = add(new THREE.Mesh(new THREE.PlaneGeometry(420, 420), tableMat), false);
    table.rotation.x = -Math.PI / 2;
    table.position.y = TABLE_Y;

    // La bandeja: base, paño y marco de madera barnizada.
    const frontEdge = hz + thick + SHELF.depth + LIP;
    const along = texture(512, wood('#6b3619', '#210d04', 5, 0, 1.5));
    const across = along.clone();
    across.needsUpdate = true;
    across.center.set(0.5, 0.5);
    across.rotation = Math.PI / 2;
    const varnish = (map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.38, clearcoat: 0.55, clearcoatRoughness: 0.2 });
    const woodX = varnish(along), woodZ = varnish(across);
    const beam = (w, h, d, x, z, mat) => {
      const m = add(new THREE.Mesh(new RoundedBoxGeometry(w, h - TABLE_Y, d, 3, 0.2), mat));
      m.position.set(x, (h + TABLE_Y) / 2, z);
      return m;
    };
    beam(2 * (hx + thick) - 0.12, 0.05, hz + thick + frontEdge - 0.12, 0, (frontEdge - hz - thick) / 2, woodX); // la base
    beam(thick, wall, 2 * (hz + thick), -hx - thick / 2, 0, woodZ);
    beam(thick, wall, 2 * (hz + thick), hx + thick / 2, 0, woodZ);
    beam(2 * hx, wall, thick, 0, -hz - thick / 2, woodX);
    beam(2 * hx, front, thick, 0, hz + thick / 2, woodX);                  // la pared de adelante, más baja
    beam(thick, SHELF.lip, SHELF.depth + LIP, -hx - thick / 2, hz + thick + (SHELF.depth + LIP) / 2, woodZ);
    beam(thick, SHELF.lip, SHELF.depth + LIP, hx + thick / 2, hz + thick + (SHELF.depth + LIP) / 2, woodZ);
    beam(2 * hx, SHELF.lip, LIP, 0, frontEdge - LIP / 2, woodX);

    const feltMat = new THREE.MeshPhysicalMaterial({
      map: texture(512, feltColor, { repeat: [3, 2] }),
      bumpMap: texture(512, grain(13, 30000, 0.5), { repeat: [3, 2], color: false }),
      bumpScale: 0.8, roughness: 1, sheen: 0.45, sheenRoughness: 0.8, sheenColor: new THREE.Color('#3f9468'),
    });
    const felt = add(new THREE.Mesh(new THREE.PlaneGeometry(2 * hx, 2 * hz), feltMat), false);
    felt.rotation.x = -Math.PI / 2;
    felt.position.y = 0.06;
    const shelfFelt = add(new THREE.Mesh(new THREE.PlaneGeometry(2 * hx, SHELF.depth), feltMat), false);
    shelfFelt.rotation.x = -Math.PI / 2;
    shelfFelt.position.set(0, 0.06, SHELF_Z);

    // Los dados: marfil, con los puntos hundidos.
    const dieGeo = new RoundedBoxGeometry(DIE, DIE, DIE, 5, 0.24);
    const dieMats = FACES.map((value) => new THREE.MeshPhysicalMaterial({
      map: texture(256, faceColor(value)), bumpMap: texture(256, faceBump(value), { color: false }), bumpScale: 1.6,
      roughness: 0.24, clearcoat: 0.7, clearcoatRoughness: 0.14,
    }));
    this.dice = [0, 1, 2, 3, 4].map((i) => {
      const mesh = add(new THREE.Mesh(dieGeo, dieMats));
      mesh.userData.die = i;
      return { i, mesh, place: 'cup', pose: null, anim: null, jitter: new THREE.Vector3(), spin: new THREE.Quaternion(), jitterTo: new THREE.Vector3(), spinTo: new THREE.Quaternion() };
    });
    // Aro rojo debajo de un dado montado.
    const ringGeo = new THREE.RingGeometry(1.35, 1.7, 40);
    const ringMat = new THREE.MeshBasicMaterial({ color: '#ff4b3e', transparent: true, opacity: 0.85, depthWrite: false });
    this.rings = this.dice.map(() => {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      scene.add(ring);
      return ring;
    });

    // El cubilete de cuero.
    const H = CUP.height;
    const profile = [
      [0, 0], [CUP.bottom - 0.3, 0], [CUP.bottom, 0.3], [CUP.top, H - 0.2], [CUP.top + 0.02, H], [CUP.top - 0.16, H + 0.05],
      [CUP.top - 0.3, H - 0.1], [CUP.bottom - 0.28, 0.55], [0, 0.55],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const leather = new THREE.MeshStandardMaterial({
      color: '#4a2817', roughness: 0.6, side: THREE.DoubleSide,
      bumpMap: texture(256, grain(17, 9000, 0.9), { repeat: [6, 3], color: false }), bumpScale: 0.9,
    });
    const cup = new THREE.Group();
    const body = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), leather);
    body.castShadow = true;
    body.receiveShadow = true;
    cup.add(body);
    const trim = new THREE.MeshStandardMaterial({ color: '#b98a52', roughness: 0.5 });
    for (const y of [H - 0.75, 0.9]) {
      const r = CUP.bottom + ((CUP.top - CUP.bottom) * y) / H + 0.03; // el radio del cubilete a esa altura
      const band = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 8, 72), trim);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      cup.add(band);
    }
    scene.add(cup);
    this.cup = { group: cup, anim: null, mode: 'rest' };
    cup.position.set(CUP.x, TABLE_Y, CUP.z);
    // Dónde se acomoda cada dado adentro del cubilete (cuatro abajo y uno arriba), cada uno girado a su modo.
    const rnd = mulberry32(21);
    this.slots = [[-0.85, -0.85, 0], [0.85, -0.85, 0], [-0.85, 0.85, 0], [0.85, 0.85, 0], [0, 0, 1]].map(([x, z, level]) => ({
      p: new THREE.Vector3(x, 0.55 + HALF + level * DIE, z),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.floor(rnd() * 4) * Math.PI / 2, rnd() * 6.28, Math.floor(rnd() * 4) * Math.PI / 2)),
    }));
    this.ray = new THREE.Raycaster();
    this.tmp = { p: new THREE.Vector3(), q: new THREE.Quaternion(), e: new THREE.Euler() };
  }

  // La cámara mira de arriba y de adelante, y se aleja lo justo para que entren la bandeja y el cubilete.
  fit() {
    const w = this.canvas.clientWidth || 1, h = this.canvas.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    const cam = this.camera;
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
    const { hx, hz, thick, wall } = TRAY;
    const x0 = -hx - thick - 0.6, x1 = CUP.x + CUP.top + 0.6;
    const z0 = -hz - thick - 0.6, z1 = hz + thick + SHELF.depth + LIP + 0.6;
    const corners = [];
    for (const x of [x0, x1]) for (const z of [z0, z1]) corners.push(new THREE.Vector3(x, 0, z));
    for (const x of [x0, hx + thick]) corners.push(new THREE.Vector3(x, wall, z0));
    corners.push(new THREE.Vector3(CUP.x, CUP.height, CUP.z - CUP.top), new THREE.Vector3(x1, CUP.height, CUP.z));
    const target = new THREE.Vector3((x0 + x1) / 2, 0, (z0 + z1) / 2 - 0.5);
    const dir = new THREE.Vector3(0, Math.sin(1.08), Math.cos(1.08)); // 62° de elevación
    const v = new THREE.Vector3();
    // Arriba va el cartel del turno y abajo los botones: la mesa se encuadra en lo que queda libre.
    const top = 60, bottom = w < 700 ? 196 : 128;
    const free = Math.max(0.35, (h - top - bottom) / h);
    cam.clearViewOffset();
    for (let d = 24; d < 400; d *= 1.02) {
      cam.position.copy(target).addScaledVector(dir, d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      if (corners.every((c) => { v.copy(c).project(cam); return Math.abs(v.x) < 0.96 && Math.abs(v.y) < free; })) break;
    }
    cam.setViewOffset(w, h, 0, (bottom - top) / 2, w, h);
    this.dirty = true;
  }

  // ─── Poses del cubilete ────────────────────────────────────────────────────
  restPose() {
    return { p: new THREE.Vector3(CUP.x, TABLE_Y, CUP.z), q: new THREE.Quaternion() };
  }

  // En la mano: levantado arriba de la bandeja, un poco inclinado hacia el jugador.
  handPose(hand, now) {
    const t = (now - hand.t0) / 1000;
    const shake = Math.min(1, t / 0.15);
    const p = new THREE.Vector3(hand.cx + Math.sin(t * 47) * 0.6 * shake, 7 + 0.35 * (1 - Math.cos(t * 94 + 1)) * shake, hand.cz + 5 + Math.cos(t * 38) * 0.4 * shake);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3 + Math.sin(t * 47) * 0.07 * shake, 0, Math.sin(t * 38) * 0.13 * shake));
    return { p, q };
  }

  // Volcado: la boca queda donde salen los dados, apuntando para donde va la tirada y un poco para abajo.
  pourPose(g) {
    const len = Math.hypot(g.a, g.b);
    const dx = g.a / len, dz = g.b / len;
    const u = new THREE.Vector3(dx * Math.cos(POUR_TILT), -Math.sin(POUR_TILT), dz * Math.cos(POUR_TILT));
    const mouth = new THREE.Vector3(g.x / 10, HAND.y + 0.3, g.z / 10);
    return { p: mouth.addScaledVector(u, -CUP.height), q: new THREE.Quaternion().setFromUnitVectors(UP, u) };
  }

  moveCup(to, ms, mode, now = this.time) {
    const g = this.cup.group;
    this.cup.mode = mode;
    this.cup.anim = { p0: g.position.clone(), q0: g.quaternion.clone(), to, t0: now, ms };
  }

  // ─── Dónde va cada dado ────────────────────────────────────────────────────
  // El lugar de un dado según el turno: en el cubilete, en el paño (donde cayó) o apartado en el estante.
  target(die, out) {
    if (die.place === 'cup') {
      const slot = this.slots[die.i];
      this.cup.group.updateMatrixWorld();
      out.p.copy(slot.p).add(die.jitter).applyMatrix4(this.cup.group.matrixWorld);
      out.q.copy(this.cup.group.quaternion).multiply(slot.q).multiply(die.spin);
    } else {
      const pose = die.pose;
      out.q.set(pose[3], pose[4], pose[5], pose[6]);
      if (die.place === 'shelf') { const s = shelfSlot(die.i); out.p.set(s[0], s[1] + 0.06, s[2]); } else out.p.set(pose[0], pose[1] + 0.06, pose[2]);
    }
    return out;
  }

  place(die, place, pose, animate, now = this.time) {
    const same = die.place === place && (place === 'cup' || (die.pose && pose && die.pose.every((n, k) => Math.abs(n - pose[k]) < 1e-3)));
    if (same) return;
    const from = die.place;
    die.place = place;
    die.pose = pose || die.pose;
    if (!animate) { die.anim = null; this.dirty = true; return; }
    die.anim = {
      p0: die.mesh.position.clone(), q0: die.mesh.quaternion.clone(), t0: now,
      ms: place === 'cup' || from === 'cup' ? SCOOP_MS : MOVE_MS, arc: place === 'cup' || from === 'cup' ? 5 : 2.4, sound: place !== 'cup',
    };
  }

  wanted(turn, i) {
    if (!turn || !turn.poses[i]) return ['cup', null];
    return [turn.held[i] ? 'shelf' : 'tray', turn.poses[i]];
  }

  // Deja la mesa como dice la sala. Si hay una tirada que todavía no se mostró, la reproduce.
  reconcile(animate = true) {
    const turn = this.view?.turn;
    const now = this.time;
    if (turn && turn.rollN !== this.shown) {
      if (this.local) {
        // Mi tirada todavía no llegó a la sala: los dados quedan como cayeron.
        if (turn.rollN === this.local.rollN - 1 && now < this.local.until) return;
        this.local = null;
      }
      if (animate && turn.rollN > this.shown && turn.throw && turn.thrown.length) { this.playRemote(turn); return; }
      this.setShown(turn.rollN);
    }
    if (turn && this.local?.rollN === turn.rollN) this.local = null;
    for (const die of this.dice) {
      const [place, pose] = this.wanted(turn, die.i);
      this.place(die, place, pose, animate, now);
    }
    this.rings.forEach((ring, i) => {
      const pose = turn?.poses[i];
      ring.visible = Boolean(turn?.cocked && pose && !turn.dice[i] && turn.thrown.includes(i));
      if (ring.visible) ring.position.set(pose[0], 0.09, pose[2]);
    });
    this.syncHand();
    this.dirty = true;
  }

  setShown(rollN) {
    this.shown = rollN;
    this.handlers.onShown?.(rollN);
  }

  busy() {
    return Boolean(this.play || this.timers.length || this.waiting);
  }

  // Lo que manda la sala en cada cambio.
  sync(view) {
    this.view = view;
    if (!this.started) {
      this.started = true;
      this.reconcile(false);
      for (const die of this.dice) { const t = this.target(die, this.tmp); die.mesh.position.copy(t.p); die.mesh.quaternion.copy(t.q); }
      return;
    }
    if (this.busy() || (this.hand && !this.hand.remote)) return;
    this.reconcile();
  }

  // ─── El cubilete en la mano de otro ────────────────────────────────────────
  // `hand` = { n: turno, r: tirada, x, z } de la pantalla del que está por tirar (o null).
  setRemoteHand(hand) {
    this.remote = hand ? { ...hand, at: this.time } : null;
    if (!this.busy() && !(this.hand && !this.hand.remote)) this.syncHand();
  }

  syncHand() {
    const turn = this.view?.turn;
    const r = this.remote;
    const live = Boolean(r && turn && !this.view.mine && r.n === turn.n && r.r === turn.rollN && r.r === this.shown && this.time - r.at < 5000);
    if (live) {
      if (!this.hand) this.raise({ x: r.x, z: r.z }, true);
      else if (this.hand.remote) { this.hand.x = r.x; this.hand.z = r.z; }
    } else if (this.hand?.remote) this.lower();
  }

  // Levanta el cubilete: los dados que se van a tirar se meten adentro.
  raise(point, remote) {
    const now = this.time;
    const turn = this.view.turn;
    for (const i of diceToThrow({ turn })) this.place(this.dice[i], 'cup', null, true, now);
    for (const ring of this.rings) ring.visible = false;
    this.hand = { x: point.x, z: point.z, cx: point.x, cz: point.z, t0: now, remote, samples: [], rattleAt: now + 120 };
    this.cup.anim = null;
    this.cup.mode = 'hand';
    this.cup.rise = { p0: this.cup.group.position.clone(), q0: this.cup.group.quaternion.clone(), t0: now };
  }

  lower() {
    this.hand = null;
    this.moveCup(this.restPose(), 420, 'rest');
    this.reconcile();
  }

  // ─── Tirar ─────────────────────────────────────────────────────────────────
  canRoll() {
    return Boolean(this.view?.canRoll && this.view.turn && !this.busy() && this.view.turn.rollN === this.shown);
  }

  canHold() {
    return Boolean(this.view?.canHold && this.view.turn && !this.busy() && !this.hand && this.view.turn.rollN === this.shown);
  }

  // Apretar (el mouse sobre la mesa, el botón o Espacio): agarrar el cubilete y sacudir.
  press(point) {
    if (this.hand && !this.hand.remote) return true;
    if (!this.canRoll()) return false;
    if (this.hand) this.hand = null;
    this.raise(point || { x: 3, z: 5.5 }, false);
    this.handlers.onHand?.({ x: this.hand.x, z: this.hand.z });
    return true;
  }

  drag(point) {
    const h = this.hand;
    if (!h || h.remote) return;
    const now = this.time;
    h.x = point.x;
    h.z = point.z;
    h.samples.push([now, point.x, point.z]);
    while (h.samples.length > 2 && now - h.samples[0][0] > 120) h.samples.shift();
    if (!h.sentAt || now - h.sentAt > 140) { h.sentAt = now; this.handlers.onHand?.({ x: h.x, z: h.z }); }
  }

  // Soltar: se vuelca el cubilete. El gesto sale de dónde estaba la mano, para dónde se movía y cuánto se sacudió.
  release() {
    const h = this.hand;
    if (!h || h.remote) return;
    const now = this.time;
    const turn = this.view.turn;
    let vx = 0, vz = 0;
    if (h.samples.length > 1) {
      const a = h.samples[0], b = h.samples[h.samples.length - 1];
      const dt = Math.max(0.016, (b[0] - a[0]) / 1000);
      if (now - b[0] < 90) { vx = (b[1] - a[1]) / dt; vz = (b[2] - a[2]) / dt; }
    }
    const speed = Math.hypot(vx, vz);
    let ax = h.x * 0.3 - h.x + vx * 0.06, az = -3.5 - h.z + vz * 0.06;
    if (Math.hypot(ax, az) < 0.5) { ax = 0; az = -1; }
    const len = Math.hypot(ax, az);
    const power = 26 + 24 * Math.min(1, (now - h.t0) / 1200) + Math.min(38, speed * 0.4) + Math.random() * 12;
    const seed = new Uint32Array(1);
    (window.crypto || window.msCrypto).getRandomValues(seed);
    const gesture = cleanThrow({ s: seed[0], x: h.x * 10, z: h.z * 10, a: (ax / len) * 1000, b: (az / len) * 1000, p: power });
    const thrown = diceToThrow({ turn });
    const rollN = turn.rollN + 1;
    const seen = turn.rollN;
    this.hand = null;
    this.local = { rollN, until: now + LOCAL_WAIT_MS };
    // El cubilete se vuelca ya; la física calcula la tirada aparte y los dados salen cuando está lista
    // (llega antes de que el cubilete termine de inclinarse).
    this.moveCup(this.pourPose(gesture), 110, 'pour', now);
    this.waiting += 1;
    this.physics.simulate(gesture, thrown).then((sim) => {
      this.waiting -= 1;
      if (this.dead) return;
      this.startPlay(sim, gesture, rollN, Math.max(this.time, now + POUR_LEAD));
      Promise.resolve(this.handlers.onThrow?.({ throw: gesture, values: sim.values, poses: sim.poses, seen })).then((ok) => {
        // La sala no la tomó (se cortó la conexión): la mesa vuelve a lo que dice la sala.
        if (ok !== false || this.local?.rollN !== rollN) return;
        this.local.until = 0;
        if (!this.busy()) this.reconcile();
      });
    }, (err) => {
      console.error(err);
      this.waiting -= 1;
      if (this.dead) return;
      this.local = null;
      this.moveCup(this.restPose(), 420, 'rest');
      this.reconcile();
    });
  }

  // La tirada de otro (o una propia que llega de la sala después de recargar): la misma física, desde el gesto.
  playRemote(turn) {
    const now = this.time;
    const thrown = [...turn.thrown];
    const gesture = turn.throw;
    const rollN = turn.rollN;
    const expected = thrown.map((i) => turn.dice[i]);
    // La física la va calculando mientras se ve sacudir el cubilete.
    const ready = this.physics.simulate(gesture, thrown);
    this.waiting += 1;
    const wait = this.hand ? 0 : SCOOP_MS + SHAKE_MS;
    if (!this.hand) {
      this.raise({ x: gesture.x / 10, z: gesture.z / 10 }, true);
      this.hand.t0 = now + SCOOP_MS * 0.6;
    }
    this.after(wait, () => ready.then((sim) => {
      this.waiting -= 1;
      if (this.dead) return;
      if (sim.values.some((v, k) => v !== expected[k])) console.warn('Generala: la tirada no dio igual que en la pantalla del que tiró', sim.values, expected);
      this.hand = null;
      this.startPlay(sim, gesture, rollN, this.time + POUR_LEAD);
    }, (err) => {
      console.error(err);
      this.waiting -= 1;
      if (this.dead) return;
      this.hand = null;
      this.moveCup(this.restPose(), 420, 'rest');
      this.setShown(rollN);
      this.reconcile();
    }));
  }

  // `t0`: en qué momento (del reloj de la mesa) sale el primer dado.
  startPlay(sim, gesture, rollN, t0) {
    if (this.cup.mode !== 'pour') this.moveCup(this.pourPose(gesture), 110, 'pour');
    this.play = { sim, rollN, t0, next: 0, out: sim.thrown.map(() => false) };
    this.after(t0 - this.time + sim.release[sim.release.length - 1] * 1000 + 380, () => this.moveCup(this.restPose(), 520, 'rest'));
  }

  endPlay() {
    const { sim, rollN } = this.play;
    sim.thrown.forEach((i, k) => {
      const die = this.dice[i];
      die.place = 'tray';
      die.pose = sim.poses[k];
      die.anim = null;
    });
    this.play = null;
    this.setShown(rollN);
    this.reconcile();
  }

  after(ms, fn) {
    this.timers.push({ at: this.time + ms, fn });
    this.timers.sort((a, b) => a.at - b.at);
  }

  // ─── Cada cuadro ───────────────────────────────────────────────────────────
  frame(hidden) {
    const real = performance.now();
    this.time += (real - this.real) / this.slow;
    this.real = real;
    const now = this.time;
    const dt = Math.min(100, now - (this.last ?? now));
    this.last = now;
    let moving = this.dirty || this.waiting > 0;
    while (this.timers.length && this.timers[0].at <= now) { this.timers.shift().fn(); moving = true; }
    if (this.timers.length) moving = true;

    // El cubilete.
    const cup = this.cup;
    const g = cup.group;
    if (this.hand) {
      const h = this.hand;
      h.cx += (h.x - h.cx) * 0.25;
      h.cz += (h.z - h.cz) * 0.25;
      const pose = this.handPose(h, Math.max(now, h.t0));
      const rise = cup.rise;
      const k = rise ? clamp((now - rise.t0) / SCOOP_MS, 0, 1) : 1;
      if (k < 1) { g.position.lerpVectors(rise.p0, pose.p, ease(k)); g.quaternion.slerpQuaternions(rise.q0, pose.q, ease(k)); } else { g.position.copy(pose.p); g.quaternion.copy(pose.q); }
      if (now >= h.rattleAt && now >= h.t0) {
        h.rattleAt = now + 70 + Math.random() * 70;
        rattle(h.cx);
        for (const die of this.dice) {
          if (die.place !== 'cup' || die.anim) continue;
          die.jitterTo.set((Math.random() - 0.5) * 0.7, Math.random() * 0.9, (Math.random() - 0.5) * 0.7);
          die.spinTo.setFromEuler(this.tmp.e.set((Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2));
        }
      }
      // Los dados de adentro van hacia su lugar nuevo de a poco: saltando de golpe se veía trabado.
      const follow = 1 - Math.exp(-dt / 28);
      for (const die of this.dice) { die.jitter.lerp(die.jitterTo, follow); die.spin.slerp(die.spinTo, follow); }
      if (h.remote && !this.busy() && this.remote && now - this.remote.at > 5000) this.lower();
      moving = true;
    } else if (cup.anim) {
      const a = cup.anim;
      const k = clamp((now - a.t0) / a.ms, 0, 1);
      g.position.lerpVectors(a.p0, a.to.p, ease(k));
      g.quaternion.slerpQuaternions(a.q0, a.to.q, ease(k));
      if (k >= 1) cup.anim = null;
      moving = true;
    }
    if (!this.hand && cup.mode === 'rest' && !cup.anim) for (const die of this.dice) { die.jitter.set(0, 0, 0); die.spin.identity(); die.jitterTo.set(0, 0, 0); die.spinTo.identity(); }

    // La tirada: cada dado sigue la trayectoria que calculó la física.
    const play = this.play;
    if (play) {
      const { sim } = play;
      const t = (now - play.t0) / 1000;
      const n = sim.thrown.length;
      const f = clamp(t / sim.dt, 0, sim.count - 1);
      const f0 = Math.floor(f), f1 = Math.min(sim.count - 1, f0 + 1), mix = f - f0;
      sim.thrown.forEach((i, k) => {
        if (t < sim.release[k]) return;
        const die = this.dice[i];
        if (!play.out[k]) { play.out[k] = true; die.place = 'air'; die.anim = null; }
        const a = (f0 * n + k) * 7, b = (f1 * n + k) * 7, fr = sim.frames;
        die.mesh.position.set(fr[a] + (fr[b] - fr[a]) * mix, fr[a + 1] + (fr[b + 1] - fr[a + 1]) * mix + 0.06, fr[a + 2] + (fr[b + 2] - fr[a + 2]) * mix);
        this.tmp.q.set(fr[b + 3], fr[b + 4], fr[b + 5], fr[b + 6]);
        die.mesh.quaternion.set(fr[a + 3], fr[a + 4], fr[a + 5], fr[a + 6]).slerp(this.tmp.q, mix);
      });
      // Los golpes suenan un instante antes, programados a su momento exacto.
      while (play.next < sim.events.length && sim.events[play.next][0] <= t + 0.03) {
        const e = sim.events[play.next++];
        if (!hidden && e[0] > t - 0.1) hit(e[1], e[2], e[3], e[0] - t);
      }
      if (t >= sim.seconds) this.endPlay();
      moving = true;
    }

    // Los dados que no están en el aire: en su lugar, o yendo hacia él.
    for (const die of this.dice) {
      if (die.place === 'air') continue;
      const to = this.target(die, this.tmp);
      const a = die.anim;
      if (!a) {
        if (die.place === 'cup' || this.dirty) { die.mesh.position.copy(to.p); die.mesh.quaternion.copy(to.q); }
        continue;
      }
      const k = clamp((now - a.t0) / a.ms, 0, 1);
      const e = ease(k);
      die.mesh.position.lerpVectors(a.p0, to.p, e);
      die.mesh.position.y += Math.sin(Math.PI * k) * a.arc;
      die.mesh.quaternion.slerpQuaternions(a.q0, to.q, e);
      if (k >= 1) { die.anim = null; if (a.sound && !hidden) tap(to.p.x); }
      moving = true;
    }

    // Si no se está viendo (pestaña de fondo) no se dibuja, pero queda pendiente para cuando vuelva.
    this.dirty = moving && hidden;
    if (moving && !hidden) {
      this.renderer.render(this.scene, this.camera);
      this.pace(real);
    } else this.drawnAt = 0;
  }

  // Si la compu o el celu no llega a dibujar parejo (menos de ~35 cuadros por segundo sostenidos mientras algo
  // se mueve), la mesa se aliviana sola una vez: menos resolución y sombras más chicas. No vuelve a subir.
  pace(real) {
    if (this.light) return;
    const gap = this.drawnAt ? real - this.drawnAt : 0;
    this.drawnAt = real;
    if (gap <= 0 || gap > 250) return; // el primer cuadro, o una pausa: no cuenta
    this.slowFrames = gap > 28 ? (this.slowFrames || 0) + 1 : Math.max(0, (this.slowFrames || 0) - 2);
    if (this.slowFrames < 40) return;
    this.light = true;
    this.renderer.setPixelRatio(1);
    this.lamp.shadow.mapSize.set(1024, 1024);
    this.lamp.shadow.map?.dispose();
    this.lamp.shadow.map = null;
    this.fit();
  }

  // ─── Mouse y dedo ──────────────────────────────────────────────────────────
  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  dieAt(e) {
    this.ray.setFromCamera(this.pointer(e), this.camera);
    const found = this.ray.intersectObjects(this.dice.filter((d) => d.place === 'tray' || d.place === 'shelf').map((d) => d.mesh), false)[0];
    return found ? found.object.userData.die : -1;
  }

  // Dónde queda la mano si el puntero está ahí: sobre un plano a la altura del cubilete, dentro de su zona.
  handAt(e) {
    this.ray.setFromCamera(this.pointer(e), this.camera);
    const { origin, direction } = this.ray.ray;
    const k = (9 - origin.y) / direction.y;
    return { x: clamp(origin.x + direction.x * k, HAND.x0, HAND.x1), z: clamp(origin.z + direction.z * k - 5, HAND.z0, HAND.z1) };
  }

  listen() {
    const c = this.canvas;
    const down = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const i = this.dieAt(e);
      if (i >= 0 && this.canHold()) { this.pick = { i, x: e.clientX, y: e.clientY }; return; }
      if (this.press(this.handAt(e))) {
        this.pointerId = e.pointerId;
        try { c.setPointerCapture(e.pointerId); } catch { /* da igual */ }
        e.preventDefault();
      }
    };
    const move = (e) => {
      if (this.hand && !this.hand.remote && this.pointerId === e.pointerId) { this.drag(this.handAt(e)); return; }
      if (e.pointerType === 'mouse') c.style.cursor = this.canHold() && this.dieAt(e) >= 0 ? 'pointer' : this.canRoll() ? 'grab' : 'default';
    };
    const up = (e) => {
      if (this.pick) {
        const p = this.pick;
        this.pick = null;
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 12 && this.dieAt(e) === p.i) this.handlers.onHold?.(p.i);
        return;
      }
      if (this.pointerId === e.pointerId) { this.pointerId = null; this.release(); }
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    this.unlisten = () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
    };
  }

  // Para manejar la mesa desde un navegador automatizado (window.__generala).
  debug() {
    return { shown: this.shown, busy: this.busy(), hand: Boolean(this.hand), places: this.dice.map((d) => d.place), cup: this.cup.mode, light: Boolean(this.light) };
  }

  dispose() {
    this.dead = true;
    this.physics.dispose();
    this.stop();
    this.unlisten();
    this.resizer.disconnect();
    this.timers = [];
    this.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      for (const m of [].concat(o.material)) {
        for (const key of ['map', 'bumpMap']) m[key]?.dispose();
        m.dispose();
      }
    });
    this.envMap.dispose();
    this.renderer.dispose();
  }
}
