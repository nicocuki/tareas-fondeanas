// Tenis Movido: la cancha en 3D (Three.js, todo con código). Se carga con import() recién al abrir la cancha:
// no lo importes desde nada que cargue la portada. Colores fijos, iguales en los dos temas.
import * as THREE from 'three';
import { HALF_L, HALF_W, NET_H } from './sim.js';

const mat = (color) => new THREE.MeshLambertMaterial({ color });
function mesh(geo, color, shadow = true) { const m = new THREE.Mesh(geo, mat(color)); m.castShadow = shadow; m.receiveShadow = true; return m; }

// El jugador: un muñeco redondo con vincha y raqueta, del color de su lado. Diseño nuestro.
function playerModel(color) {
  const g = new THREE.Group();
  const body = mesh(new THREE.CapsuleGeometry(0.32, 0.55, 6, 14), color); body.position.y = 0.75;
  const head = mesh(new THREE.SphereGeometry(0.3, 16, 12), 0xffd6b0); head.position.y = 1.45;
  const band = mesh(new THREE.TorusGeometry(0.29, 0.05, 8, 20), 0xffffff); band.rotation.x = Math.PI / 2; band.position.y = 1.55;
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const sx of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), eyeM); e.position.set(sx, 1.48, -0.27); g.add(e); }
  const arm = new THREE.Group(); arm.position.set(0.38, 1.05, 0);
  const forearm = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.5, 8), color); forearm.position.y = -0.2; arm.add(forearm);
  const racket = new THREE.Group(); racket.position.set(0, -0.45, -0.1);
  const handle = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), 0x333333); handle.position.y = -0.1; racket.add(handle);
  const frame = mesh(new THREE.TorusGeometry(0.18, 0.025, 8, 20), 0x222222); frame.position.y = -0.42; racket.add(frame);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.17, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); strings.position.y = -0.42; racket.add(strings);
  arm.add(racket);
  g.add(body, head, band, arm);
  g.userData = { arm };
  return g;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ad7ff);
  scene.fog = new THREE.Fog(0x9ad7ff, 60, 140);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f5a, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(8, 25, 10); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun);

  // Pasto alrededor, la cancha azul y las líneas.
  const grass = mesh(new THREE.PlaneGeometry(200, 200), 0x5fae4b, false); grass.rotation.x = -Math.PI / 2; grass.position.y = -0.01; scene.add(grass);
  const surround = mesh(new THREE.PlaneGeometry(HALF_W * 2 + 8, HALF_L * 2 + 10), 0x2f8f5b, false); surround.rotation.x = -Math.PI / 2; surround.position.y = 0; scene.add(surround);
  const court = mesh(new THREE.PlaneGeometry(HALF_W * 2, HALF_L * 2), 0x2f6fbf, false); court.rotation.x = -Math.PI / 2; court.position.y = 0.005; scene.add(court);
  const lineM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const line = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), lineM); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.01, z); scene.add(m); };
  for (const z of [-HALF_L, HALF_L]) line(HALF_W * 2 + 0.1, 0.1, 0, z);
  for (const x of [-HALF_W, HALF_W]) line(0.1, HALF_L * 2, x, 0);
  for (const z of [-6.4, 6.4]) line(HALF_W * 2, 0.08, 0, z);
  line(0.08, 12.8, 0, 0);
  // La red con sus postes.
  const netM = new THREE.MeshLambertMaterial({ color: 0x111111, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2 + 1, NET_H), netM); net.position.set(0, NET_H / 2, 0); scene.add(net);
  const tape = mesh(new THREE.BoxGeometry(HALF_W * 2 + 1, 0.06, 0.04), 0xffffff); tape.position.set(0, NET_H, 0); scene.add(tape);
  for (const x of [-HALF_W - 0.5, HALF_W + 0.5]) { const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, NET_H + 0.1, 8), 0x444444); post.position.set(x, (NET_H + 0.1) / 2, 0); scene.add(post); }
  // Tribunas simples a los costados.
  for (const sx of [-1, 1]) for (let i = 0; i < 4; i++) { const st = mesh(new THREE.BoxGeometry(2, 0.5 + i * 0.5, 30), [0xe0e0e0, 0xd0d0d0][i % 2]); st.position.set(sx * (HALF_W + 6 + i * 2), (0.5 + i * 0.5) / 2, 0); scene.add(st); }

  const players = [playerModel(0xff5a5f), playerModel(0x4aa0ff)];
  players[1].rotation.y = Math.PI;
  scene.add(...players);
  const ball = mesh(new THREE.SphereGeometry(0.11, 14, 10), 0xd8f040); scene.add(ball);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.14, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3 }));
  shadow.rotation.x = -Math.PI / 2; scene.add(shadow);

  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();

  // `view`: { rally, swing: [0..1, 0..1] (cuánto falta de la animación del golpe de cada uno), cpu }
  function draw(view) {
    const r = view.rally;
    for (const side of [0, 1]) {
      const p = r.players[side], m = players[side];
      m.position.set(p.x, 0, p.z);
      const s = view.swing[side] || 0;
      m.userData.arm.rotation.set(-0.3 - Math.sin(s * Math.PI) * 1.6, 0, side === 0 ? -0.2 - s * 0.8 : -0.2 - s * 0.8);
    }
    const b = r.ball;
    ball.position.set(b.x, b.y, b.z);
    shadow.position.set(b.x, 0.012, b.z);
    shadow.scale.setScalar(Math.max(0.4, 1 - b.y * 0.1));
    // Cámara detrás del lado cercano, alta, mirando hacia la red; sigue un poco a la pelota a lo ancho.
    camera.position.set(r.players[0].x * 0.3, 6.2, BASE_CAM);
    camera.lookAt(b.x * 0.2, 0, -2);
    renderer.render(scene, camera);
  }
  return { draw, resize, dispose() { renderer.dispose(); scene.traverse((o) => o.geometry?.dispose?.()); } };
}
const BASE_CAM = HALF_L + 8;
