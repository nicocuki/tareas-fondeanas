// Juegos Wii: el muñeco 3D de los personajes (Three.js). Lo usan Tenis Movido y Fondo Kart: cabeza redonda, pelo según el
// estilo, remera, pantalón y zapatillas del personaje (skins.js), armado con articulaciones (caderas, rodillas, torso,
// hombros, codos y muñecas). Mira hacia −z y su derecha es +x. Se carga con import(): no lo importes desde la portada.
import * as THREE from 'three';
import { skinById } from './skins.js';

const mats = new Map();
export function lambert(color) {
  const key = String(color);
  if (!mats.has(key)) mats.set(key, new THREE.MeshLambertMaterial({ color }));
  return mats.get(key);
}
export function part(geo, color, shadow = true) {
  const m = new THREE.Mesh(geo, lambert(color));
  m.castShadow = shadow; m.receiveShadow = true;
  return m;
}
// Un tramo que cuelga hacia −y desde su articulación; `userData.end` es la punta.
function seg(len, r, color) {
  const g = new THREE.Group();
  const m = part(new THREE.CylinderGeometry(r, r * 0.9, len, 10), color); m.position.y = -len / 2; g.add(m);
  g.add(part(new THREE.SphereGeometry(r * 1.05, 10, 8), color));
  const end = new THREE.Group(); end.position.y = -len; g.add(end);
  g.userData.end = end;
  return g;
}

function addHair(head, s) {
  const H = s.hair;
  const top = (thetaLen) => { const m = part(new THREE.SphereGeometry(0.315, 18, 10, 0, Math.PI * 2, 0, thetaLen), H); m.position.y = 0.02; head.add(m); return m; };
  switch (s.style) {
    case 'bald': {
      const ring = part(new THREE.TorusGeometry(0.27, 0.05, 6, 18, Math.PI * 1.3), H);
      ring.rotation.set(Math.PI / 2, 0, Math.PI * 0.85); ring.position.y = -0.02; head.add(ring);
      break;
    }
    case 'long': {
      top(Math.PI * 0.5);
      const back = part(new THREE.CapsuleGeometry(0.24, 0.36, 4, 10), H); back.position.set(0, -0.2, 0.12); back.scale.set(1.2, 1, 0.6); head.add(back);
      break;
    }
    case 'pony': {
      top(Math.PI * 0.45);
      const tail = part(new THREE.CapsuleGeometry(0.08, 0.3, 4, 8), H); tail.position.set(0, -0.08, 0.36); tail.rotation.x = 0.5; head.add(tail);
      break;
    }
    case 'bun': {
      top(Math.PI * 0.45);
      const bun = part(new THREE.SphereGeometry(0.14, 12, 10), H); bun.position.set(0, 0.3, 0.12); head.add(bun);
      break;
    }
    case 'curly': {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const c = part(new THREE.SphereGeometry(0.11, 8, 6), H);
        c.position.set(Math.cos(a) * 0.22, 0.14 + (i % 2) * 0.06, Math.sin(a) * 0.22 + 0.04); head.add(c);
      }
      top(Math.PI * 0.35);
      break;
    }
    case 'cap': {
      top(Math.PI * 0.42);
      const cap = part(new THREE.SphereGeometry(0.325, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.4), s.cap || '#1d4ed8'); cap.position.y = 0.04; head.add(cap);
      const brim = part(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, 0, Math.PI), s.cap || '#1d4ed8');
      brim.rotation.y = Math.PI / 2; brim.position.set(0, 0.12, -0.24); head.add(brim);
      break;
    }
    default: top(Math.PI * 0.42);
  }
}

// `skinId`: uno de skins.js. `band`: color de la vincha (el equipo en el tenis), opcional.
export function characterModel(skinId, band = null) {
  const s = skinById(skinId);
  const root = new THREE.Group();
  const hips = new THREE.Group(); hips.position.y = 0.86; root.add(hips);
  const pelvis = part(new THREE.SphereGeometry(0.2, 12, 10), s.pants); pelvis.scale.set(1.25, 0.7, 0.9); hips.add(pelvis);
  const legs = [-1, 1].map((sx) => {
    const thigh = seg(0.42, 0.075, s.pants); thigh.position.x = sx * 0.12; hips.add(thigh);
    const shin = seg(0.4, 0.065, s.pants); thigh.userData.end.add(shin);
    const foot = part(new THREE.BoxGeometry(0.13, 0.08, 0.26), s.shoes); foot.position.set(0, -0.02, -0.06);
    const ankle = new THREE.Group(); ankle.add(foot); shin.userData.end.add(ankle);
    return { thigh, shin, ankle, sx };
  });
  const torso = new THREE.Group(); hips.add(torso);
  const body = part(new THREE.CapsuleGeometry(0.25, 0.32, 6, 14), s.shirt); body.position.y = 0.36; body.scale.set(1, 1, 0.8); torso.add(body);
  const head = new THREE.Group(); head.position.y = 0.98; torso.add(head);
  head.add(part(new THREE.SphereGeometry(0.3, 18, 14), s.skin));
  addHair(head, s);
  if (band) { const b = part(new THREE.TorusGeometry(0.3, 0.04, 8, 22), band); b.rotation.x = Math.PI / 2; b.position.y = 0.08; head.add(b); }
  const eyeM = new THREE.MeshBasicMaterial({ color: 0x222222 });
  for (const sx of [-0.1, 0.1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), eyeM); e.position.set(sx, 0.02, -0.28); head.add(e); }
  const arms = [-1, 1].map((sx) => {
    const upper = seg(0.3, 0.06, s.shirt); upper.position.set(sx * 0.31, 0.6, 0); torso.add(upper);
    const fore = seg(0.27, 0.052, s.skin); upper.userData.end.add(fore);
    const hand = new THREE.Group(); fore.userData.end.add(hand);
    hand.add(part(new THREE.SphereGeometry(0.07, 10, 8), s.skin));
    return { upper, fore, hand };
  });
  root.userData = { hips, legs, torso, head, arms, skin: s, x: null, run: 0 };
  return root;
}

// Sentado al volante (Fondo Kart): rodillas para adelante, brazos al volante. `steer` de −1 a 1 gira los hombros y la cabeza.
export function seatPose(m, steer = 0, lean = 0) {
  const u = m.userData;
  u.hips.position.y = 0.42;
  u.legs.forEach(({ thigh, shin, ankle }) => { thigh.rotation.set(1.45, 0, 0); shin.rotation.set(-1.2, 0, 0); ankle.rotation.set(0.2, 0, 0); });
  u.torso.rotation.set(-0.12, 0, lean * 0.25, 'YXZ');
  u.head.rotation.set(0.1, -steer * 0.35, 0, 'YXZ');
  const [L, R] = u.arms;
  L.upper.rotation.set(1.05, 0, -0.15 - steer * 0.25, 'ZXY'); L.fore.rotation.set(0.6, 0, 0);
  R.upper.rotation.set(1.05, 0, 0.15 - steer * 0.25, 'ZXY'); R.fore.rotation.set(0.6, 0, 0);
}
