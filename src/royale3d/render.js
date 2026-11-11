// Royale 3D: el dibujo con Three.js. Se carga con `import()` recién al entrar a una partida (ver
// Royale3DGame.jsx): no lo importes desde nada que cargue la portada. Estilo «low poly»: colores lisos,
// caras planas y todo armado con código (sin imágenes ni modelos). No toca el estado del juego.
import * as THREE from 'three';
import { WORLD_R, heightAt } from './map.js';
import { cameraFor } from './sim.js';

const SKY = 0x9fd4f5;
const SEGMENTS = 110;

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

function terrainColor(h, out) {
  if (h < 0.55) out.set(h < -0.4 ? 0x2f7fa8 : 0xe8d49a);      // fondo y arena
  else if (h < 5.2) out.set(h < 1.4 ? 0x7cc15a : 0x62a845);    // pasto
  else out.set(h < 7 ? 0x8a8f86 : 0xdfe7ea);                    // roca y nieve
  return out;
}

function buildTerrain(seed) {
  const size = WORLD_R * 2 + 24;
  const geo = new THREE.PlaneGeometry(size, size, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = heightAt(seed, pos.getX(i), pos.getZ(i));
    pos.setY(i, h);
    terrainColor(h, c);
    // Un poquito de variación para que no se vea todo del mismo tono.
    const j = 0.94 + (Math.imul(i, 2654435761) >>> 0) % 1000 / 16666;
    colors.set([c.r * j, c.g * j, c.b * j], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
}

function buildForest(world) {
  const group = new THREE.Group();
  const dummy = new THREE.Object3D();
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.35, 0.5, 1, 6), mat(0x7a5230), world.trees.length || 1);
  const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 1, 7), mat(0x2f8f4e), (world.trees.length || 1) * 2);
  const c = new THREE.Color();
  world.trees.forEach((t, i) => {
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(t.x, t.y + t.h * 0.2, t.z);
    dummy.scale.set(1, t.h * 0.4, 1);
    dummy.updateMatrix();
    trunk.setMatrixAt(i, dummy.matrix);
    for (let k = 0; k < 2; k++) {
      const s = k === 0 ? 1 : 0.7;
      dummy.position.set(t.x, t.y + t.h * (k === 0 ? 0.55 : 0.82), t.z);
      dummy.scale.set(s * (0.8 + t.k * 0.3), t.h * 0.55 * s, s * (0.8 + t.k * 0.3));
      dummy.updateMatrix();
      leaves.setMatrixAt(i * 2 + k, dummy.matrix);
      leaves.setColorAt(i * 2 + k, c.set(k === 0 ? 0x2f8f4e : 0x3fa75c).offsetHSL(0, 0, (t.k - 0.5) * 0.08));
    }
  });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mat(0x8c8f91), world.rocks.length || 1);
  world.rocks.forEach((r, i) => {
    dummy.rotation.set(r.k * 6, r.k * 9, 0);
    dummy.position.set(r.x, r.y + r.h * 0.45, r.z);
    dummy.scale.set(r.r, r.h * 0.6, r.r);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  });
  group.add(trunk, leaves, rocks);
  for (const cab of world.cabins) {
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(cab.w, cab.h, cab.d), mat(0xd9b98a));
    walls.position.y = cab.h / 2 - 0.5;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(cab.w, cab.d) * 0.78, 2, 4), mat(0xb8442f));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = cab.h - 0.5 + 1;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.1), mat(0x5b3a22));
    door.position.set(0, 0.5, cab.d / 2 + 0.03);
    g.add(walls, roof, door);
    g.position.set(cab.x, cab.y, cab.z);
    group.add(g);
  }
  return group;
}

function nameTexture(text, color) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 34px Inter, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.75)';
  g.strokeText(text, 128, 34);
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeAvatar(name, color) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.34, 0.75, 3, 8), mat(color));
  body.position.y = 0.72;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(0xf1c9a0));
  head.position.y = 1.56;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(color));
  cap.position.y = 1.6;
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.7), mat(0x2c2f33));
  gun.position.set(0.3, 1.05, -0.4);
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name, '#ffffff'), depthTest: false, transparent: true }));
  tag.scale.set(2.2, 0.55, 1);
  tag.position.y = 2.35;
  tag.renderOrder = 10;
  g.add(body, head, cap, gun, tag);
  g.userData = { tag };
  return g;
}

export function createScene(canvas, seed, world) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 70, 190);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 400);
  camera.rotation.order = 'YXZ';

  scene.add(new THREE.HemisphereLight(0xdff1ff, 0x6b8f5a, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1d6, 1.6);
  sun.position.set(-60, 90, 40);
  scene.add(sun);

  scene.add(buildTerrain(seed), buildForest(world));
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshLambertMaterial({ color: 0x2f9bd1, transparent: true, opacity: 0.82 }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.05;
  scene.add(water);

  // La tormenta: una pared violeta que se achica.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(1, 1, 90, 72, 1, true),
    new THREE.MeshBasicMaterial({ color: 0x8a3cff, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: false }),
  );
  wall.position.y = 30;
  scene.add(wall);

  const avatars = new Map();
  const tracers = [];
  const tracerGeo = new THREE.BoxGeometry(0.035, 0.035, 1);
  const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true });

  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();

  return {
    resize,
    // Pone (o saca) el avatar de un jugador. `info`: { x, y, z, yaw, dead, self } o null.
    setAvatar(id, name, color, info) {
      let a = avatars.get(id);
      if (!info || info.dead) { if (a) a.visible = false; return; }
      if (!a) { a = makeAvatar(name, color); scene.add(a); avatars.set(id, a); }
      a.visible = true;
      a.position.set(info.x, info.y, info.z);
      a.rotation.y = info.yaw;
      a.userData.tag.visible = !info.self;
    },
    tracer(from, to) {
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      const len = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
      m.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      m.lookAt(to.x, to.y, to.z);
      m.scale.z = len;
      m.userData.age = 0;
      scene.add(m);
      tracers.push(m);
    },
    // Dibuja un cuadro: la cámara sigue a `focus` ({ x, y, z, yaw, pitch }); `storm` = { x, z, r }.
    draw(focus, storm, dt) {
      const { pos, dir } = cameraFor(world, focus);
      camera.position.set(pos.x, pos.y, pos.z);
      camera.rotation.set(Math.asin(dir.y), focus.yaw, 0);
      wall.position.x = storm.x; wall.position.z = storm.z;
      wall.scale.set(storm.r, 1, storm.r);
      for (let i = tracers.length - 1; i >= 0; i--) {
        const t = tracers[i];
        t.userData.age += dt;
        t.material.opacity = Math.max(0, 1 - t.userData.age / 0.14);
        if (t.userData.age > 0.14) { scene.remove(t); t.material.dispose(); tracers.splice(i, 1); }
      }
      renderer.render(scene, camera);
    },
    dispose() {
      renderer.dispose();
      scene.traverse((o) => { o.geometry?.dispose?.(); const m = o.material; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => { x.map?.dispose?.(); x.dispose(); }); });
    },
  };
}
