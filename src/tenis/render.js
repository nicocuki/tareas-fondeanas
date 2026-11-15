// Tenis Movido: la cancha en 3D (Three.js, todo con código y con personajes propios). Se carga con import() recién al abrir
// la cancha: no lo importes desde nada que cargue la portada. Colores fijos, iguales en los dos temas.
//
// `draw` recibe qué equipos mirar: uno (online: la cámara detrás de tu equipo) o dos (local: la pantalla partida, a la
// izquierda detrás del equipo 0 y a la derecha detrás del equipo 1).
import * as THREE from 'three';
import { HALF_L, HALF_W, HALF_W2, NET_H } from './sim.js';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
function mesh(geo, color, shadow = true) { const m = new THREE.Mesh(geo, mat(color)); m.castShadow = shadow; m.receiveShadow = true; return m; }

// ─── El jugador ──────────────────────────────────────────────────────────────
// Un muñeco propio (cabeza redonda con vincha, remera del color de su lugar, pantalón y zapatillas blancas) armado con
// articulaciones: caderas, rodillas, torso, hombros, codos y muñeca. Mira hacia −z y su derecha es +x; los del equipo 1
// se giran 180°. La pose sale de mezclar poses clave (`POSES`): listo para recibir, preparación, impacto y terminación
// del drive, del revés y del saque.
const SKIN = 0xffd6b0, WHITE = 0xf4f4f4, HAIR = 0x5a3a22;
function seg(len, r, color) { // un tramo que cuelga hacia −y desde su articulación
  const g = new THREE.Group();
  const m = mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 10), color); m.position.y = -len / 2; g.add(m);
  const j = mesh(new THREE.SphereGeometry(r * 1.05, 10, 8), color); g.add(j);
  const end = new THREE.Group(); end.position.y = -len; g.add(end);
  g.userData.end = end;
  return g;
}
function racketModel() {
  const r = new THREE.Group();
  const handle = mesh(new THREE.CylinderGeometry(0.028, 0.032, 0.26, 8), 0x2a2a2a); handle.position.y = -0.1; r.add(handle);
  const throat = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 6), 0x3b7dd8); throat.position.y = -0.3; r.add(throat);
  const frame = mesh(new THREE.TorusGeometry(0.16, 0.02, 8, 24), 0x3b7dd8); frame.scale.set(0.82, 1.1, 1); frame.position.y = -0.55; r.add(frame);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.155, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));
  strings.scale.set(0.82, 1.1, 1); strings.position.y = -0.55; r.add(strings);
  return r;
}
function playerModel(color) {
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.86; root.add(hips);
  const pelvis = mesh(new THREE.SphereGeometry(0.2, 12, 10), WHITE); pelvis.scale.set(1.25, 0.7, 0.9); hips.add(pelvis);
  const legs = [-1, 1].map((sx) => {
    const thigh = seg(0.42, 0.075, WHITE); thigh.position.x = sx * 0.12; hips.add(thigh);
    const shin = seg(0.4, 0.065, WHITE); thigh.userData.end.add(shin);
    const foot = mesh(new THREE.BoxGeometry(0.13, 0.08, 0.26), WHITE); foot.position.set(0, -0.02, -0.06);
    const ankle = new THREE.Group(); ankle.add(foot); shin.userData.end.add(ankle);
    return { thigh, shin, ankle, sx };
  });
  const torso = new THREE.Group(); hips.add(torso);
  const body = mesh(new THREE.CapsuleGeometry(0.25, 0.32, 6, 14), color); body.position.y = 0.36; body.scale.set(1, 1, 0.8); torso.add(body);
  const head = new THREE.Group(); head.position.y = 0.98; torso.add(head);
  head.add(mesh(new THREE.SphereGeometry(0.3, 18, 14), SKIN));
  const hair = mesh(new THREE.SphereGeometry(0.31, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), HAIR); hair.position.y = 0.02; head.add(hair);
  const band = mesh(new THREE.TorusGeometry(0.3, 0.04, 8, 22), WHITE); band.rotation.x = Math.PI / 2; band.position.y = 0.08; head.add(band);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const sx of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), eyeM); e.position.set(sx, 0.02, -0.28); head.add(e); }
  const arms = [-1, 1].map((sx) => {
    const upper = seg(0.3, 0.06, color); upper.position.set(sx * 0.31, 0.6, 0); torso.add(upper);
    const fore = seg(0.27, 0.052, SKIN); upper.userData.end.add(fore);
    const hand = new THREE.Group(); fore.userData.end.add(hand);
    hand.add(mesh(new THREE.SphereGeometry(0.07, 10, 8), SKIN));
    return { upper, fore, hand };
  });
  const racket = racketModel(); arms[1].hand.add(racket);
  root.userData = { hips, legs, torso, head, arms, racket, x: null, run: 0 };
  return root;
}

// Poses clave: c agacharse (0 parado … 1 rodillas bien flexionadas), tw giro del torso (+ hacia la izquierda), ln inclinación
// (− hacia adelante), hombros [x adelante, y, z afuera] y codos (x) de cada brazo, y la muñeca derecha [x, y, z].
const P = (o) => ({ c: 0.7, tw: 0, ln: -0.2, rs: [0, 0, 0], re: 0, ls: [0, 0, 0], le: 0, wr: [0, 0, 0], ...o });
const POSES = {
  ready: P({ c: 0.85, ln: -0.3, rs: [0.55, 0, 0.18], re: 1.25, ls: [0.75, 0, -0.35], le: 1.05, wr: [1.25, 0, -0.35] }),
  // Drive (de derecha): la raqueta va atrás a la derecha, pega adelante del cuerpo y termina sobre el hombro izquierdo.
  fhBack: P({ c: 0.8, tw: -1.15, ln: -0.15, rs: [-0.35, 0, 1.05], re: 0.5, ls: [0.9, 0, -0.2], le: 0.4, wr: [0.6, 0, 0.6] }),
  fhHit: P({ c: 0.65, tw: 0.1, ln: -0.2, rs: [0.85, 0, 1.25], re: 0.25, ls: [0.5, 0, -0.9], le: 0.4, wr: [0.2, 0, 0.3] }),
  fhFollow: P({ c: 0.55, tw: 1.2, ln: -0.15, rs: [1.9, 0, 0.1], re: 1.6, ls: [0.2, 0, -0.7], le: 0.9, wr: [0.6, 0, -0.5] }),
  // Revés: la raqueta cruza al lado izquierdo, pega adelante y termina arriba a la derecha.
  bhBack: P({ c: 0.85, tw: 1.25, ln: -0.2, rs: [0.85, 0, -0.75], re: 1.0, ls: [0.75, 0, -0.5], le: 1.2, wr: [0.7, 0, -0.9] }),
  bhHit: P({ c: 0.7, tw: 0.3, ln: -0.2, rs: [1.05, 0, -0.15], re: 0.15, ls: [0.2, 0, -0.6], le: 0.5, wr: [0.25, 0, -0.4] }),
  bhFollow: P({ c: 0.55, tw: -0.9, ln: -0.1, rs: [2.2, 0, 0.75], re: 0.4, ls: [-0.2, 0, -0.9], le: 0.3, wr: [0.5, 0, 0.5] }),
  // Saque: brazo izquierdo arriba (la tirada), raqueta atrás de la cabeza, pega bien arriba y baja cruzando el cuerpo.
  srvHold: P({ c: 0.3, ln: -0.05, rs: [0.3, 0, 0.35], re: 0.9, ls: [0.9, 0, -0.1], le: 0.7, wr: [0.9, 0, 0] }),
  srvToss: P({ c: 0.55, tw: -0.5, ln: 0.12, rs: [3.4, 0, 0.5], re: 2.0, ls: [2.9, 0, -0.15], le: 0.05, wr: [0.6, 0, 0] }),
  srvHit: P({ c: 0.05, tw: 0.15, ln: -0.1, rs: [2.85, 0, 0.2], re: 0.05, ls: [1.2, 0, -0.4], le: 0.6, wr: [0.3, 0, 0] }),
  srvFollow: P({ c: 0.45, tw: 0.8, ln: -0.35, rs: [0.7, 0, -0.6], re: 0.4, ls: [0.2, 0, -0.5], le: 0.5, wr: [0.5, 0, -0.3] }),
};
const KEYS = { 1: ['fhBack', 'fhHit', 'fhFollow'], [-1]: ['bhBack', 'bhHit', 'bhFollow'], 0: ['srvToss', 'srvHit', 'srvFollow'] };
// El golpe dura SWING_TIME: preparación, impacto (a los 0,2 s), terminación y vuelta a esperar.
export const SWING_TIME = 0.75;
const TIMES = [0, 0.1, 0.2, 0.34, 0.75];
const ease = (u) => u * u * (3 - 2 * u);
function mix(a, b, u) {
  const l = (x, y) => x + (y - x) * u;
  const v = (x, y) => [l(x[0], y[0]), l(x[1], y[1]), l(x[2], y[2])];
  return { c: l(a.c, b.c), tw: l(a.tw, b.tw), ln: l(a.ln, b.ln), rs: v(a.rs, b.rs), re: l(a.re, b.re), ls: v(a.ls, b.ls), le: l(a.le, b.le), wr: v(a.wr, b.wr) };
}
// La pose de un jugador: el golpe en curso (age segundos desde que empezó, side 1 drive, −1 revés, 0 saque) o la de espera.
export function poseFor(age, side, base = 'ready') {
  const rest = POSES[base];
  if (age == null || age < 0 || age >= SWING_TIME) return rest;
  const k = KEYS[side] || KEYS[1];
  const seq = [side === 0 ? POSES.srvToss : rest, POSES[k[0]], POSES[k[1]], POSES[k[2]], rest];
  let i = 0; while (i < TIMES.length - 2 && age > TIMES[i + 1]) i++;
  return mix(seq[i], seq[i + 1], ease(Math.min(1, (age - TIMES[i]) / (TIMES[i + 1] - TIMES[i]))));
}
function applyPose(m, p, run) {
  const u = m.userData;
  const c = p.c;
  u.hips.position.y = 0.86 - 0.24 * c;
  u.legs.forEach(({ thigh, shin, ankle, sx }) => {
    const stride = run ? Math.sin(u.run + (sx > 0 ? Math.PI : 0)) * 0.55 : 0;
    thigh.rotation.set(0.85 * c + stride, 0, sx * (0.2 + 0.14 * c));
    shin.rotation.set(-1.55 * c - (run ? Math.max(0, -Math.sin(u.run + (sx > 0 ? Math.PI : 0))) * 0.7 : 0), 0, -sx * 0.06);
    ankle.rotation.set(0.7 * c - stride * 0.5, 0, -sx * 0.1 * c);
  });
  u.torso.rotation.set(p.ln, p.tw, 0, 'YXZ');
  u.head.rotation.set(-p.ln * 0.7, -p.tw * 0.6, 0, 'YXZ');
  const [L, R] = u.arms;
  R.upper.rotation.set(p.rs[0], p.rs[1], p.rs[2], 'ZXY'); R.fore.rotation.set(p.re, 0, 0);
  L.upper.rotation.set(p.ls[0], p.ls[1], p.ls[2], 'ZXY'); L.fore.rotation.set(p.le, 0, 0);
  u.racket.rotation.set(p.wr[0], p.wr[1], p.wr[2]);
}

// Un cartel que flota y mira siempre a la cámara (el nombre de cada uno, «Saca»).
function makeTag() {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.renderOrder = 20; s.scale.set(1.9, 0.48, 1);
  s.userData = { cv, tex, key: '' };
  return s;
}
function paintTag(s, text, bg, fg) {
  const key = `${text}|${bg}|${fg}`;
  if (s.userData.key === key) return;
  s.userData.key = key;
  const g = s.userData.cv.getContext('2d');
  g.clearRect(0, 0, 256, 64);
  if (!text) { s.userData.tex.needsUpdate = true; return; }
  g.font = 'bold 30px Inter, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 30);
  g.fillStyle = bg; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 52, 12); g.fill();
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  s.userData.tex.needsUpdate = true;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ad7ff);
  scene.fog = new THREE.Fog(0x9ad7ff, 60, 140);
  const cameras = [new THREE.PerspectiveCamera(50, 1, 0.1, 300), new THREE.PerspectiveCamera(50, 1, 0.1, 300)];
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f5a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(8, 25, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun);

  // Pasto alrededor, la cancha y sus líneas (con los pasillos del dobles).
  const grass = mesh(new THREE.PlaneGeometry(200, 200), 0x5fae4b, false); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.01; scene.add(grass);
  const surround = mesh(new THREE.PlaneGeometry(HALF_W2 * 2 + 8, HALF_L * 2 + 10), 0x3d8fc4, false); surround.rotation.x = -Math.PI / 2; surround.position.y = 0; scene.add(surround);
  const court = mesh(new THREE.PlaneGeometry(HALF_W2 * 2, HALF_L * 2), 0x2f6fbf, false); court.rotation.x = -Math.PI / 2; court.position.y = 0.005; scene.add(court);
  const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineM); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); scene.add(m); };
  for (const z of [-HALF_L, HALF_L]) line(HALF_W2 * 2 + 0.1, 0.1, 0, z);
  for (const x of [-HALF_W2, HALF_W2, -HALF_W, HALF_W]) line(0.08, HALF_L * 2, x, 0);
  for (const z of [-6.4, 6.4]) line(HALF_W * 2, 0.08, 0, z);
  line(0.08, 12.8, 0, 0);
  // La red con sus postes.
  const netM = new THREE.MeshLambertMaterial({ color: 0x111111, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W2 * 2 + 1, NET_H), netM); net.position.set(0, NET_H / 2, 0); scene.add(net);
  const tape = mesh(new THREE.BoxGeometry(HALF_W2 * 2 + 1, 0.06, 0.04), 0xffffff); tape.position.set(0, NET_H, 0); scene.add(tape);
  for (const x of [-HALF_W2 - 0.5, HALF_W2 + 0.5]) { const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, NET_H + 0.1, 8), 0x444444); post.position.set(x, (NET_H + 0.1) / 2, 0); scene.add(post); }
  // Paredón bajo alrededor y gradas a los costados.
  for (const z of [-HALF_L - 6, HALF_L + 6]) { const w = mesh(new THREE.BoxGeometry(HALF_W2 * 2 + 10, 1.4, 0.4), 0x2f7a4a); w.position.set(0, 0.7, z); scene.add(w); }
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const st = mesh(new THREE.BoxGeometry(2, 0.5 + i * 0.5, 30), [0xe0e0e0, 0xd0d0d0][i % 2]); st.position.set(sx * (HALF_W2 + 6 + i * 2), (0.5 + i * 0.5) / 2, 0); scene.add(st); }

  const players = [];
  const ball = mesh(new THREE.SphereGeometry(0.11, 14, 10), 0xd8f040); scene.add(ball);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);
  const serveTag = makeTag(); scene.add(serveTag);

  function ensurePlayers(view) {
    while (players.length < view.rally.players.length) {
      const i = players.length;
      const m = playerModel(new THREE.Color(view.colors[i]).getHex());
      if (i % 2 === 1) m.rotation.y = Math.PI;
      const tag = makeTag(); tag.position.y = -0.35; m.add(tag);
      m.userData.tag = tag;
      scene.add(m); players.push(m);
    }
    for (let i = 0; i < players.length; i++) players[i].visible = i < view.rally.players.length;
  }

  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false);
  }
  resize();

  // Cámara detrás del equipo `team`, a la altura de los hombros de un espectador, con el jugador propio de espaldas abajo
  // y toda la cancha adelante; sigue un poco al jugador y a la pelota a lo ancho.
  function aim(cam, team, r) {
    const dir = team === 0 ? 1 : -1;
    const p = r.players[team];
    cam.position.set((p ? p.x : 0) * 0.45, 3.6, dir * (HALF_L + 7));
    cam.lookAt((p ? p.x : 0) * 0.3 + r.ball.x * 0.15, 0, dir * 3);
  }

  // `view`: { rally, views: [equipo, …], names, colors, swing: [{ age, side } por jugador], camera?: { p, t } (para mirar de cerca) }
  let lastT = performance.now() / 1000;
  function draw(view) {
    const r = view.rally;
    const now = performance.now() / 1000, dt = Math.min(0.1, now - lastT); lastT = now;
    ensurePlayers(view);
    r.players.forEach((p, i) => {
      const m = players[i], u = m.userData;
      const speed = u.x == null ? 0 : Math.abs(p.x - u.x) / Math.max(dt, 1e-3);
      u.x = p.x;
      const run = speed > 0.6;
      if (run) u.run += dt * 11;
      m.position.set(p.x, 0, p.z);
      const sw = view.swing[i] || {};
      const serving = r.serving && r.server === i;
      const base = serving ? (r.held !== false && r.ball.vy === 0 ? 'srvHold' : 'srvToss') : 'ready';
      applyPose(m, poseFor(sw.age, sw.side, base), run && !(sw.age >= 0 && sw.age < SWING_TIME));
      paintTag(m.userData.tag, view.names[i] || '', 'rgba(15,25,50,0.85)', view.colors[i]);
    });
    const b = r.ball;
    ball.position.set(b.x, b.y, b.z);
    shadow.position.set(b.x, 0.012, b.z);
    shadow.scale.setScalar(Math.max(0.4, 1 - b.y * 0.1));
    // «Saca» arriba del que tiene que sacar.
    if (r.serving && r.players[r.server]) { const p = r.players[r.server]; serveTag.visible = true; serveTag.position.set(p.x, 2.35, p.z); paintTag(serveTag, 'Saca', '#ffd23f', '#1d2333'); } else serveTag.visible = false;

    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    const parts = view.views.length;
    renderer.setScissorTest(parts > 1);
    view.views.forEach((team, k) => {
      const cam = cameras[k];
      const vw = w / parts;
      cam.aspect = vw / h; cam.updateProjectionMatrix();
      if (view.camera) { cam.position.set(...view.camera.p); cam.lookAt(...view.camera.t); } else aim(cam, team, r);
      renderer.setViewport(vw * k, 0, vw, h);
      renderer.setScissor(vw * k, 0, vw, h);
      renderer.render(scene, cam);
    });
  }
  return { draw, resize, dispose() { renderer.dispose(); scene.traverse((o) => o.geometry?.dispose?.()); } };
}
