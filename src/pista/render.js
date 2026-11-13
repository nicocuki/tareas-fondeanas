// Pista Loca: el dibujo en 3D (Three.js, todo con código y sin imágenes). Se carga con import() recién al entrar a la
// partida: no lo importes desde nada que cargue la portada. Colores fijos, iguales en los dos temas.
import * as THREE from 'three';
import { PUSHER_DEPTH, barAngle, hammerAngle, pusherBox } from './courses.js';
import { HEIGHT } from './sim.js';

const toonCache = new Map();
function toon(color) {
  let m = toonCache.get(color);
  if (!m) { m = new THREE.MeshLambertMaterial({ color }); toonCache.set(color, m); }
  return m;
}
const box = (w, h, d, color) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color)); m.castShadow = true; m.receiveShadow = true; return m; };
const cyl = (r, l, color, seg = 14) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, l, seg), toon(color)); m.castShadow = true; m.receiveShadow = true; return m; };

// Franjas para pistones y barras.
function stripeTex(a, b) {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d'); g.fillStyle = a; g.fillRect(0, 0, 64, 64); g.fillStyle = b;
  for (let i = -64; i < 128; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 16, 0); g.lineTo(i + 80, 64); g.lineTo(i + 64, 64); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function checkerTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#111' : '#fff'; g.fillRect(i * 8, j * 8, 8, 8); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}

// El robotito: cuerpo de lata redondeado del color de cada uno, cabeza con visor y dos ojos de luz, antena con bolita.
export function robotModel(color) {
  const g = new THREE.Group();
  const c = new THREE.Color(color);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.42, 6, 14), toon(c.getHex()));
  body.position.y = 0.78; body.castShadow = true;
  const belly = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 14), toon(0xf5f5f5));
  belly.rotation.x = Math.PI / 2; belly.position.set(0, 0.72, -0.42);
  const head = new THREE.Group(); head.position.y = 1.32;
  const skull = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.46, 0.56), toon(new THREE.Color(color).offsetHSL(0, 0, 0.08).getHex()));
  skull.castShadow = true;
  const visor = box(0.5, 0.26, 0.04, 0x1d2333); visor.position.set(0, 0, -0.29);
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x7cf7ff });
  const eyeL = new THREE.Mesh(new THREE.CircleGeometry(0.055, 12), eyeM); eyeL.position.set(-0.12, 0.01, -0.315); eyeL.rotation.y = Math.PI;
  const eyeR = eyeL.clone(); eyeR.position.x = 0.12;
  const stick = cyl(0.025, 0.26, 0x9aa0a6, 6); stick.position.y = 0.35;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff4d4d })); ball.position.y = 0.5;
  head.add(skull, visor, eyeL, eyeR, stick, ball);
  const limb = (x, y, l, w) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = box(w, l, w, 0x6b7280); m.position.y = -l / 2; p.add(m); const end = box(w * 1.3, 0.12, w * 1.5, c.getHex()); end.position.y = -l; p.add(end); return p; };
  const armL = limb(-0.52, 1.0, 0.42, 0.13), armR = limb(0.52, 1.0, 0.42, 0.13);
  const legL = limb(-0.2, 0.38, 0.32, 0.16), legR = limb(0.2, 0.38, 0.32, 0.16);
  g.add(body, belly, head, armL, armR, legL, legR);
  g.userData = { head, armL, armR, legL, legR, body, ball };
  return g;
}

// Postura según lo que hace: correr (balanceo), en el aire, tirado de cabeza o aturdido.
function poseRobot(m, st, time) {
  const u = m.userData;
  const sw = st.moving && st.grounded ? Math.sin(st.run * 2.2) : 0;
  u.legL.rotation.x = sw * 0.8; u.legR.rotation.x = -sw * 0.8;
  u.armL.rotation.x = -sw * 0.9; u.armR.rotation.x = sw * 0.9;
  if (!st.grounded && !st.diving) { u.armL.rotation.x = u.armR.rotation.x = -2.6; u.legL.rotation.x = 0.4; u.legR.rotation.x = -0.3; }
  u.armL.rotation.z = st.stun ? 0.9 + Math.sin(time * 18) * 0.3 : 0;
  u.armR.rotation.z = st.stun ? -0.9 - Math.sin(time * 18) * 0.3 : 0;
  m.rotation.x = st.diving ? -1.35 : 0;
  m.position.y += st.diving ? 0.35 : 0;
  u.head.rotation.z = st.stun ? Math.sin(time * 12) * 0.35 : 0;
  u.body.position.y = 0.78 + (st.moving && st.grounded ? Math.abs(Math.sin(st.run * 2.2)) * 0.06 : 0);
  u.ball.material.color.setHex(st.stun ? (Math.floor(time * 10) % 2 ? 0xffff4d : 0xff4d4d) : 0xff4d4d);
}

function nameTag(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 34px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(text, 128, 32); g.fillStyle = color; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(2.2, 0.55, 1); s.renderOrder = 20;
  return s;
}

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd3ff);
  scene.fog = new THREE.Fog(0x8fd3ff, 70, 190);
  const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 400);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x7a8fb0, 1.25));
  const sun = new THREE.DirectionalLight(0xffffff, 1.7);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  scene.add(sun, sun.target);
  // El vacío de abajo: agua que brilla.
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshLambertMaterial({ color: 0x3fa7ff }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -18; scene.add(sea);
  // Nubes de algodón.
  const clouds = new THREE.Group();
  for (let i = 0; i < 26; i++) {
    const c = new THREE.Group();
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(2 + (k % 2), 10, 8), toon(0xffffff)); s.position.set(k * 2.2, (k % 2) * 0.8, (k % 3) * 0.6); c.add(s); }
    c.position.set(((i * 53) % 220) - 110, 14 + (i % 5) * 4, ((i * 97) % 260) - 180);
    clouds.add(c);
  }
  scene.add(clouds);

  let level = null, course = null;
  const tileMeshes = new Map(), bars = [], hammers = [], pushers = [];
  const robots = new Map();
  const stripes = stripeTex('#ffd23f', '#222'), redStripes = stripeTex('#ff4d4d', '#ffffff');

  function setCourse(c) {
    if (level) { scene.remove(level); level.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    course = c;
    level = new THREE.Group();
    tileMeshes.clear(); bars.length = 0; hammers.length = 0; pushers.length = 0;
    for (const p of c.platforms) {
      const w = p.x1 - p.x0, d = p.z1 - p.z0;
      const m = box(w, p.tile != null ? 0.5 : 1, d, p.color);
      m.position.set((p.x0 + p.x1) / 2, p.top - (p.tile != null ? 0.25 : 0.5), (p.z0 + p.z1) / 2);
      if (p.tile == null) { const rim = box(w + 0.12, 0.14, d + 0.12, 0xffffff); rim.position.set(m.position.x, p.top - 0.3, m.position.z); level.add(rim); }
      level.add(m);
      if (p.tile != null) tileMeshes.set(p.tile, { m, base: m.position.y, color: p.color });
    }
    for (const w of c.walls) { const m = box(w.x1 - w.x0, w.top + 1, w.z1 - w.z0, w.color); m.position.set((w.x0 + w.x1) / 2, (w.top - 1) / 2, (w.z0 + w.z1) / 2); level.add(m); }
    for (const b of c.bars) {
      const g = new THREE.Group(); g.position.set(b.x, (c.start?.top ?? 0), b.z);
      const post = cyl(0.45, b.h * 2 + 0.6, 0x2b2d42); post.position.y = b.h; g.add(post);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, b.r * 2, 14), new THREE.MeshLambertMaterial({ map: redStripes }));
      arm.rotation.z = Math.PI / 2; arm.position.y = b.h; arm.castShadow = true;
      g.add(arm);
      level.add(g); bars.push({ b, g });
    }
    for (const hm of c.hammers) {
      const frame = new THREE.Group(); frame.position.set(0, 0, hm.z);
      for (const sx of [-1, 1]) { const leg = box(0.4, 8.2, 0.4, 0x3d405b); leg.position.set(sx * 3.4, 4, 0); frame.add(leg); }
      const top = box(7.2, 0.5, 0.5, 0x3d405b); top.position.y = 8.1; frame.add(top);
      const pivot = new THREE.Group(); pivot.position.y = 1 + hm.L; frame.add(pivot);
      const arm = cyl(0.12, hm.L, 0x9aa0a6, 8); arm.position.y = -hm.L / 2; pivot.add(arm);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 2.2, 18), new THREE.MeshLambertMaterial({ map: stripes }));
      head.rotation.x = Math.PI / 2; head.position.y = -hm.L; head.castShadow = true; pivot.add(head);
      level.add(frame); hammers.push({ hm, pivot });
    }
    for (const p of c.pushers) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1.5, PUSHER_DEPTH), new THREE.MeshLambertMaterial({ map: stripes }));
      m.castShadow = true; level.add(m);
      const base = box(1.6, 2.2, PUSHER_DEPTH + 0.6, 0x3d405b); base.position.set(p.edge + p.side * 1.3, 0.6, p.z); level.add(base);
      pushers.push({ p, m });
    }
    if (c.finishZ != null) {
      const arch = new THREE.Group(); arch.position.z = c.finishZ;
      for (const sx of [-1, 1]) { const leg = box(0.6, 5, 0.6, 0xff4d8d); leg.position.set(sx * 6.4, 2.5, 0); arch.add(leg); }
      const banner = new THREE.Mesh(new THREE.BoxGeometry(13.4, 1.2, 0.3), new THREE.MeshLambertMaterial({ map: checkerTex() }));
      banner.position.y = 5; arch.add(banner);
      const line = new THREE.Mesh(new THREE.PlaneGeometry(13, 1), new THREE.MeshLambertMaterial({ map: checkerTex() }));
      line.rotation.x = -Math.PI / 2; line.position.y = 0.02; arch.add(line);
      level.add(arch);
    }
    scene.add(level);
  }

  function setRobot(id, st) {
    let r = robots.get(id);
    if (!st) { if (r) r.g.visible = false; return; }
    if (!r) { const g = robotModel(st.color); const tag = st.self ? null : nameTag(st.name, st.color); if (tag) { tag.position.y = 2.25; g.add(tag); } scene.add(g); r = { g }; robots.set(id, r); }
    r.g.visible = true;
    r.g.position.set(st.x, st.y, st.z);
    r.g.rotation.set(0, st.yaw, 0);
    poseRobot(r.g, st, performance.now() / 1000);
  }

  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  resize();

  let slow = 0, low = false;
  function draw(cam, t, broken, breaking) {
    const t0 = performance.now();
    camera.position.set(cam.x, cam.y, cam.z);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    sun.position.set(cam.tx + 20, cam.ty + 40, cam.tz + 15); sun.target.position.set(cam.tx, cam.ty, cam.tz);
    for (const { b, g } of bars) g.rotation.y = -barAngle(b, t);
    for (const { hm, pivot } of hammers) pivot.rotation.z = hammerAngle(hm, t);
    for (const { p, m } of pushers) { const bx = pusherBox(p, t); m.scale.x = bx.x1 - bx.x0; m.position.set((bx.x0 + bx.x1) / 2, 0.75, p.z); }
    for (const [id, tm] of tileMeshes) {
      if (broken.has(id)) { tm.m.position.y -= 0.6; tm.m.visible = tm.m.position.y > tm.base - 12; continue; }
      const k = breaking.get(id);
      tm.m.visible = true;
      if (k != null) { const left = k - t; tm.m.position.y = tm.base + Math.sin(t * 60) * 0.05; tm.m.material = toon(left < 0.2 ? 0xffffff : tm.color); } else { tm.m.position.y = tm.base; tm.m.material = toon(tm.color); }
    }
    clouds.position.x = Math.sin(t * 0.05) * 6;
    renderer.render(scene, camera);
    const ms = performance.now() - t0;
    if (!low) { slow = ms > 24 ? slow + 1 : Math.max(0, slow - 1); if (slow > 50) { low = true; renderer.shadowMap.enabled = false; sun.castShadow = false; renderer.setPixelRatio(1); resize(); } }
  }

  return {
    setCourse, setRobot, draw, resize,
    get course() { return course; },
    dispose() { renderer.dispose(); scene.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}
export { HEIGHT };
