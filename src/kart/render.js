// Fondo Kart: la pista y los karts en 3D (Three.js, todo con código, sin imágenes). Se carga con import() recién al
// empezar la carrera: no lo importes desde nada que cargue la portada. Colores fijos, iguales en los dos temas.
//
// `createRenderer(canvas, track, racers)` arma la pista con sus alturas (asfalto, cordones, paredes, terraplenes o
// pilares, túneles, rampas, pozos con agua o lava abajo, atajos), el paisaje de cada tema con sus cosas que se mueven
// (molinos, banderas, público, lava, carteles de neón), las cajas, las monedas y los obstáculos, y un kart por corredor
// con su personaje sentado. `draw(frame)` recibe dónde está cada cosa, la hora de la carrera y qué vistas dibujar: una
// (online) o hasta cuatro (local, pantalla partida).
import * as THREE from 'three';
import { characterModel, seatPose, lambert } from '../wii/character.js';
import { skinById } from '../wii/skins.js';
import { fwd } from './sim.js';
import { obstacleParts } from './tracks.js';

const THEMES = {
  valle: { sky: 0x8fd3ff, fog: [0xbfe6ff, 160, 520], ground: 0x63b84f, road: 0x55595f, wall: 0xf2f2f2, wall2: 0xe8423f, skirt: 0x7a5a3a, light: 1.25, sun: 1.5 },
  volcan: { sky: 0x2a0f12, fog: [0x3a1410, 110, 420], ground: null, road: 0x3c3a3e, wall: 0x6b6066, wall2: 0xff6a1a, skirt: 0x2f2628, lava: 0xff5a10, light: 0.85, sun: 1.1, hemi: 0x7a2a1c },
  neon: { sky: 0x0d0b2a, fog: [0x1a1240, 130, 480], ground: 0x24223a, road: 0x2e2f3a, wall: 0x14d0c8, wall2: 0xff4fa0, skirt: 0x3a3850, light: 0.8, sun: 0.9 },
};
const MT_COLORS = [0xffffff, 0x4ab4ff, 0xff9a3c, 0xc061ff];
const RAINBOW = [0xff3b5c, 0xff9a3c, 0xffe14a, 0x45e08a, 0x3fa7ff, 0xb061ff];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const mesh = (geo, color, shadow = true) => { const m = new THREE.Mesh(geo, lambert(color)); m.castShadow = shadow; m.receiveShadow = true; return m; };
const glow = (geo, color, opacity = 1) => new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity }));

function canvasTex(w, h, paint) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  paint(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function textSign(text, bg, fg, w = 512, h = 96) {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = `900 ${Math.round(h * 0.46)}px Inter, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 3);
  });
}

// ─── Geometría a lo largo de la pista ────────────────────────────────────────
// Una cinta de `from` a `to` (metros del centro), a `dy` sobre el asfalto. `keep(i)` dice qué muestras van (los pozos no).
function ribbon(track, from, to, dy, color, keep = () => true) {
  const S = track.samples, n = S.length;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const sm = S[i % n];
    for (const [side, lat] of [[0, from], [1, to]]) {
      pos.push(sm.x + sm.nx * lat, sm.y + dy, sm.z + sm.nz * lat);
      c.set(color(i % n, side)); col.push(c.r, c.g, c.b);
    }
    if (i < n && keep(i % n) && keep((i + 1) % n)) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
// Una cinta vertical a `lat` del centro, de `bottom` a `top` (relativos al asfalto, o absolutos con `abs`).
function vstrip(track, lat, bottom, top, color, keep = () => true, abs = false) {
  const S = track.samples, n = S.length;
  const pos = [], col = [], idx = [];
  const c = new THREE.Color();
  for (let i = 0; i <= n; i++) {
    const sm = S[i % n];
    const x = sm.x + sm.nx * lat, z = sm.z + sm.nz * lat;
    c.set(color(i % n));
    pos.push(x, abs ? bottom : sm.y + bottom, z, x, sm.y + top, z);
    col.push(c.r, c.g, c.b, c.r, c.g, c.b);
    if (i < n && keep(i % n) && keep((i + 1) % n)) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  m.receiveShadow = true;
  return m;
}
const nearCut = (track, x, z, pad) => track.cuts.some((c) => c.pts.some(([cx, cz]) => (cx - x) ** 2 + (cz - z) ** 2 < (c.w / 2 + pad) ** 2));

// Lo que se mueve en el paisaje: cada cosa con su función `tick(t)`.
function buildTrack(scene, track, th, movers) {
  const S = track.samples, n = S.length, half = track.half;
  const rainbow = (i) => track.kindAt[i] === 'rainbow';
  const keep = (i) => !track.gapAt[i];
  const vmat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const rmat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  // Asfalto (arcoíris en la ruta del cielo) y cordones a rayas.
  const roadCol = (i, side) => (rainbow(i) ? RAINBOW[(Math.floor(i / 5) + side * 3) % 6] : th.road);
  const road = new THREE.Mesh(ribbon(track, -half, half, 0.02, roadCol, keep), vmat); road.receiveShadow = true; scene.add(road);
  const rbRoad = new THREE.Mesh(ribbon(track, -half, half, 0.03, roadCol, (i) => keep(i) && rainbow(i)), rmat); scene.add(rbRoad);
  for (const sg of [-1, 1]) {
    const g = ribbon(track, sg > 0 ? half - 0.1 : -half - 1.1, sg > 0 ? half + 1.1 : -half + 0.1, 0.05, (i) => (rainbow(i) ? 0xffffff : Math.floor(i / 2) % 2 ? 0xe8423f : 0xffffff), keep);
    const m = new THREE.Mesh(g, vmat); m.receiveShadow = true; scene.add(m);
  }
  scene.add(new THREE.Mesh(ribbon(track, -0.15, 0.15, 0.04, (i) => (Math.floor(i / 3) % 2 ? th.road : 0xd8d8d8), (i) => keep(i) && !rainbow(i)), vmat));
  // Paredes donde la zona tiene pared, con un hueco en la boca de cada atajo.
  const wallKeep = (sg) => (i) => keep(i) && track.edgeAt[i] === 'wall' && !nearCut(track, S[i].x + S[i].nx * sg * (half + track.wallAt), S[i].z + S[i].nz * sg * (half + track.wallAt), 4);
  if (track.wallAt) for (const sg of [-1, 1]) scene.add(vstrip(track, sg * (half + track.wallAt + 0.3), 0, 1.1, (i) => (Math.floor(i / 4) % 2 ? th.wall : th.wall2), wallKeep(sg)));
  // Abajo del asfalto elevado: terraplén de tierra/roca, o pilares en los puentes y en la ciudad.
  const pillarZone = (i) => track.kindAt[i] === 'bridge' || track.kindAt[i] === 'roof' || track.theme === 'neon';
  const edgeLat = half + (track.wallAt || 1.2) + 0.4;
  for (const sg of [-1, 1]) scene.add(vstrip(track, sg * edgeLat, -3, 0, () => th.skirt, (i) => keep(i) && S[i].y > 0.4 && !pillarZone(i) && !rainbow(i), true));
  scene.add(new THREE.Mesh(ribbon(track, -edgeLat, edgeLat, -0.35, () => th.skirt, (i) => keep(i) && S[i].y > 0.4 && (pillarZone(i) || rainbow(i))), vmat));
  for (let i = 0; i < n; i += 10) {
    const sm = S[i];
    if (!keep(i) || sm.y < 2.5 || !(pillarZone(i) || rainbow(i))) continue;
    for (const sg of [-1, 1]) {
      const p = rainbow(i) ? glow(new THREE.CylinderGeometry(0.25, 0.25, sm.y, 6), RAINBOW[(i / 10) % 6 | 0], 0.6) : mesh(new THREE.BoxGeometry(1.2, sm.y, 1.2), 0x5a5870);
      p.position.set(sm.x + sm.nx * sg * (half - 1), sm.y / 2 - 0.4, sm.z + sm.nz * sg * (half - 1)); scene.add(p);
    }
  }
  // Túneles: arcos cada 6 m, techo y luces que pasan.
  const arcM = lambert(0x6b5a48);
  for (let i = 0; i < n; i += 4) {
    if (track.kindAt[i] !== 'tunnel') continue;
    const sm = S[i];
    const arc = new THREE.Mesh(new THREE.TorusGeometry(half + 2.2, 1.0, 6, 16, Math.PI), arcM);
    arc.position.set(sm.x, sm.y, sm.z); arc.rotation.y = Math.atan2(sm.tx, sm.tz) + Math.PI / 2; scene.add(arc);
    if (i % 12 === 0) { const l = glow(new THREE.SphereGeometry(0.35, 8, 6), 0xffe7a0); l.position.set(sm.x, sm.y + half + 1.6, sm.z); scene.add(l); }
  }
  scene.add(vstrip(track, 0, half + 2.6, half + 3.2, () => 0x5a4a3a, (i) => track.kindAt[i] === 'tunnel'));
  // Agua o lava abajo de los pozos de planeo, y la cinta de planeo con aros.
  for (const jp of track.jumps) {
    const sm = S[jp.i];
    const ramp = new THREE.Group();
    const col = jp.glide ? 0x3f8bff : 0xffb21a;
    const wedge = mesh(new THREE.BoxGeometry(track.width * 0.9, 0.4, 7), col);
    wedge.position.set(0, 0.7, 0); wedge.rotation.x = -0.18; ramp.add(wedge);
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(4, 5), new THREE.MeshBasicMaterial({ map: arrowTex(jp.glide ? '#9fd0ff' : '#fff2a0', jp.glide ? '#1f5fd8' : '#ff8a1a'), transparent: true }));
    arrow.rotation.set(-Math.PI / 2 - 0.18, 0, Math.PI); arrow.position.set(0, 0.95, 0); ramp.add(arrow);
    ramp.position.set(sm.x, sm.y, sm.z); ramp.rotation.y = Math.atan2(sm.tx, sm.tz); scene.add(ramp);
    if (jp.glide && jp.gap) {
      // Aros grandes por donde pasa el planeo (adorno) y el «agua» de abajo.
      for (let k = 18, r = 0; k < (jp.gap[1] - jp.i + n) % n; k += 22, r++) {
        const p = S[(jp.i + k) % n];
        const ring = glow(new THREE.TorusGeometry(6, 0.35, 8, 28), RAINBOW[r % 6], 0.8);
        ring.position.set(p.x, jp.y + 6 - r * 1.5, p.z); ring.rotation.y = Math.atan2(p.tx, p.tz); scene.add(ring);
        movers.push((t) => { ring.rotation.z = t * 0.6 + r; });
      }
    }
  }
  // Atajos: un camino de tierra con su acelerador.
  for (const c of track.cuts) {
    for (let k = 0; k < c.pts.length - 1; k++) {
      const [ax, az] = c.pts[k], [bx, bz] = c.pts[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const seg = mesh(new THREE.BoxGeometry(c.w, 0.1, len + c.w * 0.6), 0x8a6a3a, false);
      seg.position.set((ax + bx) / 2, c.y + 0.03, (az + bz) / 2); seg.rotation.y = Math.atan2(bx - ax, bz - az); scene.add(seg);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4, 1.3), new THREE.MeshBasicMaterial({ map: textSign('¡ATAJO!', '#ffd23f', '#1d2333', 256, 84), side: THREE.DoubleSide }));
    const [sx, sz] = c.pts[0]; sign.position.set(sx, c.y + 3.2, sz); scene.add(sign);
    movers.push((t) => { sign.rotation.y = t * 0.8; });
  }
  // Largada: línea a cuadros, arco con cartel, público que salta, banderas y globos.
  const s0 = S[0];
  const chk = canvasTex(256, 32, (g) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } });
  const start = new THREE.Mesh(new THREE.PlaneGeometry(track.width + 2, 2.4), new THREE.MeshLambertMaterial({ map: chk }));
  start.rotation.x = -Math.PI / 2; start.rotation.z = Math.atan2(s0.tx, s0.tz) + Math.PI / 2; start.position.set(s0.x, s0.y + 0.06, s0.z); scene.add(start);
  for (const sg of [-1, 1]) { const p = mesh(new THREE.BoxGeometry(0.7, 7, 0.7), 0x222222); p.position.set(s0.x + s0.nx * sg * (half + 1.5), s0.y + 3.5, s0.z + s0.nz * sg * (half + 1.5)); scene.add(p); }
  const banner = new THREE.Mesh(new THREE.BoxGeometry(track.width + 3.6, 1.6, 0.3), new THREE.MeshLambertMaterial({ map: textSign('FONDO KART', '#e8423f', '#ffffff') }));
  banner.position.set(s0.x, s0.y + 7, s0.z); banner.rotation.y = Math.atan2(s0.nx, s0.nz) + Math.PI / 2; scene.add(banner);
  const crowd = new THREE.Group(); scene.add(crowd);
  const r = rng(track.index * 31 + 7);
  for (let i = 4; i < 60; i += 2) for (const sg of [-1, 1]) for (let row = 0; row < 2; row++) {
    const sm = S[(n - 20 + i) % n], d = half + (track.wallAt || 2) + 3 + row * 1.6;
    const p = new THREE.Group();
    const body = mesh(new THREE.CapsuleGeometry(0.3, 0.5, 3, 6), [0xff5a5f, 0x3fa7ff, 0xffd23f, 0x45e08a, 0xb061ff][Math.floor(r() * 5)], false);
    body.position.y = 0.6 + row * 0.8; p.add(body);
    const head = mesh(new THREE.SphereGeometry(0.26, 8, 6), 0xf2c9a0, false); head.position.y = 1.25 + row * 0.8; p.add(head);
    p.position.set(sm.x + sm.nx * sg * d, sm.y, sm.z + sm.nz * sg * d); crowd.add(p);
    const ph = r() * 6, sp = 5 + r() * 4;
    movers.push((t) => { p.position.y = sm.y + Math.max(0, Math.sin(t * sp + ph)) * 0.4; });
  }
  for (let k = 0; k < 6; k++) {
    const sm = S[(n - 10 + k * 8) % n], sg = k % 2 ? 1 : -1;
    const bal = mesh(new THREE.SphereGeometry(1.1, 14, 10), RAINBOW[k % 6], false);
    const bx = sm.x + sm.nx * sg * (half + 8), bz = sm.z + sm.nz * sg * (half + 8), by = sm.y + 9 + k;
    scene.add(bal);
    movers.push((t) => { bal.position.set(bx + Math.sin(t * 0.5 + k) * 1.5, by + Math.sin(t * 0.9 + k) * 1.2, bz); });
  }
  // Carteles de cada zona: un cartel al costado con el nombre.
  track.zones.forEach((z, k) => {
    const sm = S[(z.i + 6) % n], sg = k % 2 ? 1 : -1, d = half + (track.wallAt || 2) + 2;
    const post = mesh(new THREE.CylinderGeometry(0.15, 0.15, 4, 6), 0x444444); post.position.set(sm.x + sm.nx * sg * d, sm.y + 2, sm.z + sm.nz * sg * d); scene.add(post);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.3), new THREE.MeshBasicMaterial({ map: textSign(z.name, '#1d2333', '#ffd23f', 640, 110), side: THREE.DoubleSide }));
    sign.position.set(post.position.x, sm.y + 4.4, post.position.z); sign.rotation.y = Math.atan2(sm.tx, sm.tz) + Math.PI; scene.add(sign);
  });
  // Aceleradores: flechas que se mueven.
  for (const p of track.pads) {
    const sm = S[p.i];
    const tex = arrowTex('#ffe14a', '#ff8a1a'); tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(1, 2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(p.r * 1.6, p.r * 2.4), new THREE.MeshBasicMaterial({ map: tex }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(sm.tx, sm.tz) + Math.PI;
    m.position.set(p.x, p.y + 0.07, p.z); scene.add(m);
    movers.push((t) => { tex.offset.y = -t * 1.5; });
  }
  scenery(scene, track, th, movers);
}

function arrowTex(fg, bg) {
  return canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    for (const y of [10, 60]) { g.beginPath(); g.moveTo(w / 2, y); g.lineTo(w - 14, y + 46); g.lineTo(w / 2, y + 30); g.lineTo(14, y + 46); g.closePath(); g.fill(); }
  });
}

// ─── El paisaje de cada pista ────────────────────────────────────────────────
function clearOf(track, x, z, gap) {
  const S = track.samples;
  for (let i = 0; i < S.length; i += 3) if ((S[i].x - x) ** 2 + (S[i].z - z) ** 2 < gap * gap) return false;
  return true;
}
function scenery(scene, track, th, movers) {
  const r = rng(track.index * 977 + 13);
  const S = track.samples;
  const gap = track.half + (track.wallAt || 2) + 5;
  const put = (count, build, minR = gap, spread = 120) => {
    let tries = 0, placed = 0;
    while (placed < count && tries++ < count * 14) {
      const sm = S[Math.floor(r() * track.count)];
      const side = r() < 0.5 ? -1 : 1, d = minR + r() * spread;
      const x = sm.x + sm.nx * side * d, z = sm.z + sm.nz * side * d;
      if (!clearOf(track, x, z, minR)) continue;
      const o = build(r, x, z); o.position.x = x; o.position.z = z; if (!o.userData.keepRot) o.rotation.y = r() * Math.PI * 2; scene.add(o); placed++;
    }
  };
  const tree = (rr) => { const g = new THREE.Group(); const h = 4 + rr() * 4; const t = mesh(new THREE.CylinderGeometry(0.35, 0.5, h * 0.5, 7), 0x7a4a26); t.position.y = h * 0.25; g.add(t); const l = mesh(new THREE.SphereGeometry(h * 0.38, 9, 7), rr() < 0.5 ? 0x3e9a3a : 0x52b847); l.position.y = h * 0.7; g.add(l); return g; };
  if (track.theme === 'valle') {
    const ground = mesh(new THREE.PlaneGeometry(1600, 1600), th.ground, false); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; ground.receiveShadow = true; scene.add(ground);
    // Cerros lejanos y el cerro del túnel.
    for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; const h = 50 + r() * 60; const m = mesh(new THREE.ConeGeometry(70 + r() * 40, h, 7), k % 2 ? 0x5a9a4a : 0x4a8a3c, false); m.position.set(Math.cos(a) * 520, h / 2 - 2, Math.sin(a) * 520); scene.add(m); }
    const tunnel = track.samples.filter((_, i) => track.kindAt[i] === 'tunnel');
    if (tunnel.length) { const mid = tunnel[Math.floor(tunnel.length / 2)]; const hill = mesh(new THREE.SphereGeometry(48, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a9a4a, false); hill.scale.y = 0.42; hill.position.set(mid.x - 40, -1, mid.z); scene.add(hill); }
    // El río debajo del salto, con agua que corre.
    const jp = track.jumps.find((j) => j.glide);
    if (jp) {
      const a = S[jp.gap[0]], b = S[jp.gap[1]], mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
      const water = canvasTex(128, 128, (g) => { g.fillStyle = '#2f8fd8'; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3; for (let y = 8; y < 128; y += 22) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(40, y - 8, 80, y + 8, 128, y); g.stroke(); } });
      water.wrapS = water.wrapT = THREE.RepeatWrapping; water.repeat.set(2, 16);
      const river = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(b.x - a.x, b.z - a.z) * 0.8, 900), new THREE.MeshLambertMaterial({ map: water }));
      river.rotation.x = -Math.PI / 2; river.position.set(mx, 0.06, mz); scene.add(river);
      const bank = mesh(new THREE.PlaneGeometry(Math.hypot(b.x - a.x, b.z - a.z) * 0.95, 900), 0xc8b06a, false); bank.rotation.x = -Math.PI / 2; bank.position.set(mx, 0.03, mz); scene.add(bank);
      movers.push((t) => { water.offset.y = t * 0.15; });
      // Botecitos que bajan por el río.
      for (let k = 0; k < 3; k++) {
        const boat = new THREE.Group(); const hull = mesh(new THREE.BoxGeometry(2, 0.8, 4.5), 0x9a5a2a); boat.add(hull);
        const sail = mesh(new THREE.ConeGeometry(1.4, 3.5, 3), 0xffffff); sail.position.y = 2.2; boat.add(sail); scene.add(boat);
        movers.push((t) => { boat.position.set(mx + (k - 1) * 12, 0.4 + Math.sin(t * 2 + k) * 0.15, mz + ((t * 6 + k * 300) % 900) - 450); });
      }
    }
    put(110, tree);
    put(60, (rr) => { const g = new THREE.Group(); const st = mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 5), 0x3f8a3a, false); st.position.y = 0.9; g.add(st); const f = mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.15, 10), 0xffd23f, false); f.rotation.x = Math.PI / 2.4; f.position.y = 1.8; g.add(f); const c = mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.18, 8), 0x6b3b1f, false); c.rotation.x = Math.PI / 2.4; c.position.set(0, 1.8, -0.02); g.add(c); void rr; return g; }, gap - 1, 25);
    // Molinos que giran.
    for (const [x, z] of track.deco?.windmills || []) {
      const g = new THREE.Group(); const tower = mesh(new THREE.CylinderGeometry(2, 3.2, 16, 8), 0xf2ead8); tower.position.y = 8; g.add(tower);
      const roof = mesh(new THREE.ConeGeometry(3, 4, 8), 0xb03a2e); roof.position.y = 18; g.add(roof);
      const hub = new THREE.Group(); hub.position.set(0, 15, -3.2); g.add(hub);
      for (let b = 0; b < 4; b++) { const blade = mesh(new THREE.BoxGeometry(1.4, 11, 0.2), 0xe8e0c8); blade.position.y = 5.5; const arm = new THREE.Group(); arm.rotation.z = (b * Math.PI) / 2; arm.add(blade); hub.add(arm); }
      g.position.set(x, 0, z); g.lookAt(0, 0, 0); scene.add(g);
      movers.push((t) => { hub.rotation.z = t * 1.2; });
    }
    // Banderines a lo largo de la recta.
    for (let i = 20; i < 70; i += 10) for (const sg of [-1, 1]) {
      const sm = S[i], d = track.half + track.wallAt + 1.5;
      const pole = mesh(new THREE.CylinderGeometry(0.08, 0.08, 4, 5), 0xffffff); pole.position.set(sm.x + sm.nx * sg * d, sm.y + 2, sm.z + sm.nz * sg * d); scene.add(pole);
      const flag = mesh(new THREE.PlaneGeometry(1.6, 1), (i / 10) % 2 ? 0xe8423f : 0x3fa7ff, false); flag.material = flag.material.clone(); flag.material.side = THREE.DoubleSide;
      flag.position.set(pole.position.x, sm.y + 3.5, pole.position.z); scene.add(flag);
      movers.push((t) => { flag.rotation.y = Math.sin(t * 4 + i) * 0.6; });
    }
  }
  if (track.theme === 'volcan') {
    const lavaM = new THREE.MeshBasicMaterial({ color: th.lava });
    const lava = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800), lavaM); lava.rotation.x = -Math.PI / 2; lava.position.y = -2; scene.add(lava);
    movers.push((t) => { lavaM.color.setHSL(0.04 + Math.sin(t * 1.3) * 0.012, 1, 0.5 + Math.sin(t * 2.1) * 0.05); });
    // El volcán: cono con cráter brillante y humo.
    const cone = mesh(new THREE.CylinderGeometry(55, 150, 34, 24, 1, true), 0x2a1f20, false); cone.position.y = 15; scene.add(cone);
    const crater = glow(new THREE.CircleGeometry(55, 24), 0xff7a1a); crater.rotation.x = -Math.PI / 2; crater.position.y = 31.5; scene.add(crater);
    movers.push((t) => { crater.material.color.setHSL(0.06, 1, 0.5 + Math.sin(t * 3) * 0.08); });
    for (let k = 0; k < 10; k++) {
      const puff = glow(new THREE.SphereGeometry(6, 8, 6), 0x5a4a4a, 0.5); scene.add(puff);
      movers.push((t) => { const c = (t * 0.25 + k / 10) % 1; puff.position.set(Math.sin(k) * 15, 34 + c * 70, Math.cos(k) * 15); puff.scale.setScalar(0.6 + c * 2); puff.material.opacity = 0.5 * (1 - c); });
    }
    // Rocas oscuras flotando en la lava, cristales que brillan.
    put(60, (rr) => { const m = mesh(new THREE.DodecahedronGeometry(2 + rr() * 6, 0), 0x2f2628); m.position.y = -1; return m; }, gap + 2, 150);
    put(30, (rr) => { const m = glow(new THREE.OctahedronGeometry(1 + rr() * 1.5, 0), rr() < 0.5 ? 0xff4fa0 : 0xff9a3c, 0.9); m.position.y = 0.5; return m; }, gap - 2, 25);
    // El castillo: murallas y torres con banderas.
    const [cx, cz] = track.deco?.castle || [0, 0];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2, x = cx + Math.cos(a) * 75, z = cz + Math.sin(a) * 75;
      if (!clearOf(track, x, z, track.half + 8)) continue;
      const tw = new THREE.Group(); const body = mesh(new THREE.CylinderGeometry(6, 7, 26, 10), 0x4a4046); body.position.y = 13; tw.add(body);
      const roof = mesh(new THREE.ConeGeometry(7.5, 10, 10), 0x8a2a2a); roof.position.y = 31; tw.add(roof);
      const win = glow(new THREE.BoxGeometry(1.5, 2.5, 0.3), 0xffb84a); win.position.set(0, 18, 6.9); tw.add(win);
      tw.position.set(x, -1, z); scene.add(tw);
      movers.push((t) => { win.material.color.setHSL(0.09, 1, 0.5 + Math.sin(t * 6 + k) * 0.1); });
    }
  }
  if (track.theme === 'neon') {
    const ground = mesh(new THREE.PlaneGeometry(1600, 1600), th.ground, false); ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; scene.add(ground);
    // Estrellas y luna.
    const geo = new THREE.BufferGeometry(); const pts = [];
    for (let i = 0; i < 1200; i++) { const a = r() * Math.PI * 2, b = r() * Math.PI * 0.45, d = 600; pts.push(Math.cos(a) * Math.cos(b) * d, 40 + Math.sin(b) * d, Math.sin(a) * Math.cos(b) * d); }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false })));
    const moon = glow(new THREE.SphereGeometry(30, 20, 14), 0xfff3c8); moon.position.set(-350, 240, -420); scene.add(moon);
    // Edificios con ventanas y franjas de neón que titilan.
    const neon = [0x14d0c8, 0xff4fa0, 0xffe14a, 0x7a8cff];
    const winTex = canvasTex(64, 128, (g) => { g.fillStyle = '#1b1934'; g.fillRect(0, 0, 64, 128); for (let y = 4; y < 128; y += 10) for (let x = 4; x < 64; x += 12) { g.fillStyle = Math.random() < 0.55 ? '#ffe7a0' : '#2a2850'; g.fillRect(x, y, 7, 6); } });
    put(110, (rr) => {
      const g = new THREE.Group(); const h = 14 + rr() * 50, w = 8 + rr() * 10;
      const tex = winTex.clone(); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(Math.round(w / 6), Math.round(h / 12)); tex.needsUpdate = true;
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), new THREE.MeshLambertMaterial({ map: tex })); b.position.y = h / 2; g.add(b);
      const strip = glow(new THREE.BoxGeometry(w + 0.2, 0.5, w + 0.2), neon[Math.floor(rr() * 4)]); strip.position.y = h * (0.4 + rr() * 0.5); g.add(strip);
      const ph = rr() * 10;
      movers.push((t) => { strip.visible = Math.sin(t * 3 + ph) > -0.85; });
      return g;
    }, gap + 1, 100);
    // Carteles gigantes.
    ['FONDO', 'TURBO', 'NEÓN', '¡DALE!'].forEach((txt, k) => {
      const sm = S[Math.floor((k + 0.5) / 4 * track.count)], d = track.half + 14;
      const board = new THREE.Mesh(new THREE.PlaneGeometry(16, 6), new THREE.MeshBasicMaterial({ map: textSign(txt, '#120f2a', ['#14d0c8', '#ff4fa0', '#ffe14a', '#7a8cff'][k]), side: THREE.DoubleSide }));
      board.position.set(sm.x + sm.nx * d, sm.y + 12, sm.z + sm.nz * d); board.rotation.y = Math.atan2(sm.tx, sm.tz) + Math.PI / 2; scene.add(board);
    });
    // Faroles a lo largo de la ciudad.
    for (let i = 0; i < track.count; i += 18) {
      if (track.kindAt[i] === 'rainbow' || track.gapAt[i]) continue;
      const sm = S[i], d = track.half + track.wallAt + 1;
      const p = mesh(new THREE.CylinderGeometry(0.12, 0.12, 5, 6), 0x444444); p.position.set(sm.x + sm.nx * d, sm.y + 2.5, sm.z + sm.nz * d); scene.add(p);
      const l = glow(new THREE.SphereGeometry(0.45, 8, 6), 0xfff1a0); l.position.set(p.position.x, sm.y + 5.1, p.position.z); scene.add(l);
    }
  }
}

// ─── Los karts ───────────────────────────────────────────────────────────────
function kartModel(skinId) {
  const s = skinById(skinId);
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const paint = new THREE.MeshLambertMaterial({ color: s.shirt });
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.35, 2.5), paint); chassis.position.y = 0.42; chassis.castShadow = true; body.add(chassis);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 0.7), paint); nose.position.set(0, 0.5, -1.35); nose.rotation.x = 0.25; nose.castShadow = true; body.add(nose);
  const bumper = mesh(new THREE.BoxGeometry(1.7, 0.22, 0.25), 0x222222); bumper.position.set(0, 0.32, -1.7); body.add(bumper);
  const seat = mesh(new THREE.BoxGeometry(0.9, 0.7, 0.25), 0x1d1d1d); seat.position.set(0, 0.85, 0.65); body.add(seat);
  const engine = mesh(new THREE.BoxGeometry(1.0, 0.45, 0.6), 0x555a60); engine.position.set(0, 0.75, 1.1); body.add(engine);
  const pipes = [];
  for (const sx of [-0.3, 0.3]) { const p = mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.5, 8), 0x999999); p.rotation.x = Math.PI / 2; p.position.set(sx, 0.75, 1.45); body.add(p); pipes.push(p); }
  const wheelSt = mesh(new THREE.TorusGeometry(0.18, 0.04, 6, 14), 0x222222); wheelSt.position.set(0, 1.05, -0.35); wheelSt.rotation.x = -0.9; body.add(wheelSt);
  const wheels = [];
  for (const [x, z, rr] of [[-0.85, -0.95, 0.32], [0.85, -0.95, 0.32], [-0.85, 0.95, 0.4], [0.85, 0.95, 0.4]]) {
    const w = new THREE.Group(); w.position.set(x, rr, z);
    const tire = mesh(new THREE.CylinderGeometry(rr, rr, 0.38, 14), 0x1b1b1b); tire.rotation.z = Math.PI / 2; w.add(tire);
    const hub = mesh(new THREE.CylinderGeometry(rr * 0.5, rr * 0.5, 0.4, 10), 0xd8d8d8); hub.rotation.z = Math.PI / 2; w.add(hub);
    body.add(w); wheels.push(w);
  }
  const driver = characterModel(skinId);
  driver.scale.setScalar(0.72); driver.position.set(0, 0.42, 0.35); seatPose(driver);
  body.add(driver);
  // Planeador: ala de tela con el color del personaje.
  const glider = new THREE.Group();
  const wingM = new THREE.MeshLambertMaterial({ color: s.shirt, side: THREE.DoubleSide });
  const wing = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.8), wingM); wing.rotation.x = -Math.PI / 2 + 0.25; wing.position.y = 2.6; glider.add(wing);
  const stripe = glow(new THREE.PlaneGeometry(4.6, 0.3), 0xffffff); stripe.material.side = THREE.DoubleSide; stripe.rotation.x = -Math.PI / 2 + 0.25; stripe.position.set(0, 2.62, 0.2); glider.add(stripe);
  for (const sx of [-1.6, 1.6]) { const rod = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4), 0x333333); rod.position.set(sx, 1.6, 0.2); rod.rotation.z = sx * 0.25; glider.add(rod); }
  glider.visible = false; body.add(glider);
  // Llamas del turbo y chispas del derrape.
  const flameM = new THREE.MeshBasicMaterial({ color: 0xffa63c, transparent: true, opacity: 0.85 });
  const flames = pipes.map((p) => { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 8), flameM); f.rotation.x = -Math.PI / 2; f.position.set(p.position.x, 0.75, 2.0); body.add(f); return f; });
  const sparkM = new THREE.MeshBasicMaterial({ color: 0x4ab4ff, transparent: true, opacity: 0.9 });
  const sparks = [-0.85, 0.85].map((x) => { const sp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), sparkM); sp.position.set(x, 0.2, 1.3); body.add(sp); return sp; });
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1.4, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; root.add(shadow);
  root.userData = { body, paint, base: new THREE.Color(s.shirt), wheels, driver, flames, flameM, sparks, sparkM, shadow, glider, spinA: 0, roll: 0, trickA: 0, squash: 0, wasAir: false };
  return root;
}

function makeTag(text, color) {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d');
  g.font = 'bold 30px Inter, sans-serif';
  const w = Math.min(248, g.measureText(text).width + 28);
  g.fillStyle = 'rgba(15,20,40,0.82)'; g.beginPath(); g.roundRect((256 - w) / 2, 6, w, 52, 12); g.fill();
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  s.scale.set(3.2, 0.8, 1); s.position.y = 2.6; s.renderOrder = 10;
  return s;
}

// ─── Ítems y obstáculos ──────────────────────────────────────────────────────
function shellModel(color) {
  const g = new THREE.Group();
  const dome = mesh(new THREE.SphereGeometry(0.55, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), color); dome.position.y = 0.15; g.add(dome);
  const rim = mesh(new THREE.TorusGeometry(0.55, 0.12, 6, 16), 0xffffff); rim.rotation.x = Math.PI / 2; rim.position.y = 0.15; g.add(rim);
  return g;
}
function shotModel(w) {
  if (w === 'verde') return shellModel(0x2fb84a);
  if (w === 'rojo') return shellModel(0xe8323a);
  if (w === 'azul') { const g = shellModel(0x2f6fff); for (const sx of [-1, 1]) { const wing = mesh(new THREE.BoxGeometry(1.2, 0.05, 0.5), 0xffffff); wing.position.set(sx * 0.8, 0.4, 0); wing.rotation.z = sx * 0.3; g.add(wing); } return g; }
  if (w === 'banana') { const g = new THREE.Group(); const b = mesh(new THREE.TorusGeometry(0.45, 0.16, 8, 14, Math.PI * 1.1), 0xffd93a); b.rotation.set(0, 0, Math.PI * 0.95); b.position.y = 0.45; g.add(b); return g; }
  if (w === 'bomba') { const g = new THREE.Group(); const b = mesh(new THREE.SphereGeometry(0.6, 14, 10), 0x1b1b1b); b.position.y = 0.6; g.add(b); const f = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 5), 0xc8a060); f.position.y = 1.3; g.add(f); const sp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffd23f })); sp.position.y = 1.5; g.add(sp); return g; }
  return mesh(new THREE.SphereGeometry(0.5, 8, 6), 0xffffff);
}
function obstacleModel(o, track) {
  const g = new THREE.Group();
  switch (o.type) {
    case 'cow': {
      const body = mesh(new THREE.BoxGeometry(1.4, 1.2, 2.6), 0xffffff); body.position.y = 1.4; g.add(body);
      for (const [x, z] of [[0.3, 0.6], [-0.4, -0.5], [0.2, -0.9]]) { const spot = mesh(new THREE.BoxGeometry(0.6, 0.62, 0.7), 0x1d1d1d); spot.position.set(x, 1.7, z); g.add(spot); }
      const head = mesh(new THREE.BoxGeometry(1, 0.9, 1), 0xffffff); head.position.set(0, 1.9, -1.6); g.add(head);
      const nose = mesh(new THREE.BoxGeometry(0.8, 0.45, 0.3), 0xff9aa8); nose.position.set(0, 1.7, -2.15); g.add(nose);
      for (const [x, z] of [[-0.5, 1], [0.5, 1], [-0.5, -1], [0.5, -1]]) { const leg = mesh(new THREE.BoxGeometry(0.3, 0.9, 0.3), 0xeeeeee); leg.position.set(x, 0.45, z); g.add(leg); }
      break;
    }
    case 'pendulum': {
      const post = new THREE.Group(); g.add(post);
      const beamL = track.half * 2 + 4;
      const beam = mesh(new THREE.BoxGeometry(beamL, 0.6, 0.6), 0x5a4a3a); beam.position.y = 9; post.add(beam);
      for (const sx of [-1, 1]) { const leg = mesh(new THREE.BoxGeometry(0.6, 9, 0.6), 0x5a4a3a); leg.position.set(sx * beamL / 2, 4.5, 0); post.add(leg); }
      const arm = new THREE.Group(); arm.position.y = 9; g.add(arm);
      const rope = mesh(new THREE.CylinderGeometry(0.08, 0.08, 7, 5), 0x333333); rope.position.y = -3.5; arm.add(rope);
      const ball = mesh(new THREE.SphereGeometry(1.5, 14, 10), track.theme === 'neon' ? 0xff4fa0 : 0x777777); ball.position.y = -7.5; arm.add(ball);
      g.userData.arm = arm; g.userData.fixed = true;
      break;
    }
    case 'boulder': { const b = mesh(new THREE.DodecahedronGeometry(2.6, 1), 0x6a5a4a); b.position.y = 2.6; g.add(b); g.userData.ball = b; break; }
    case 'car': {
      const col = [0xe8423f, 0x3fa7ff, 0xffd23f, 0x45e08a][o.k % 4];
      const body = mesh(new THREE.BoxGeometry(2, 0.9, 4), col); body.position.y = 0.8; g.add(body);
      const cab = mesh(new THREE.BoxGeometry(1.7, 0.8, 2), 0x1b1d2a); cab.position.set(0, 1.6, 0.2); g.add(cab);
      for (const z of [-1.95, 1.95]) for (const x of [-0.6, 0.6]) { const l = glow(new THREE.BoxGeometry(0.4, 0.2, 0.1), z < 0 ? 0xfff6c0 : 0xff2a2a); l.position.set(x, 0.9, z); g.add(l); }
      for (const z of [-1.3, 1.3]) for (const x of [-1, 1]) { const w = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.3, 10), 0x111111); w.rotation.z = Math.PI / 2; w.position.set(x, 0.4, z); g.add(w); }
      break;
    }
    case 'firebar': {
      const post = mesh(new THREE.CylinderGeometry(0.5, 0.7, 1.5, 8), 0x444444); post.position.y = 0.75; g.add(post);
      const arm = new THREE.Group(); arm.position.y = 1; g.add(arm);
      for (let f = 1; f <= 5; f++) { const b = glow(new THREE.SphereGeometry(0.75, 10, 8), f % 2 ? 0xffa63c : 0xff5a10); b.position.x = (f / 5) * (o.len || 0.85) * track.half; arm.add(b); }
      g.userData.arm = arm; g.userData.fixed = true;
      break;
    }
    case 'geyser': {
      const rim = mesh(new THREE.TorusGeometry(1.8, 0.5, 6, 14), 0x3a2a28); rim.rotation.x = Math.PI / 2; rim.position.y = 0.2; g.add(rim);
      const pool = glow(new THREE.CircleGeometry(1.6, 14), 0xff7a1a); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.15; g.add(pool);
      const jet = glow(new THREE.CylinderGeometry(1.2, 1.9, 1, 12, 1, true), 0xffa63c, 0.85); jet.material.side = THREE.DoubleSide; g.add(jet);
      g.userData.jet = jet;
      break;
    }
    case 'crusher': {
      const block = new THREE.Group(); g.add(block);
      const b = mesh(new THREE.BoxGeometry(4.2, 4.2, 4.2), 0x5a6070); b.position.y = 2.1; block.add(b);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (c) => { c.fillStyle = '#5a6070'; c.fillRect(0, 0, 64, 64); c.fillStyle = '#111'; c.fillRect(12, 18, 12, 10); c.fillRect(40, 18, 12, 10); c.fillRect(14, 42, 36, 8); }) }));
      face.position.set(0, 2.1, -2.12); face.rotation.y = Math.PI; block.add(face);
      const shadowM = new THREE.Mesh(new THREE.CircleGeometry(2.6, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false })); shadowM.rotation.x = -Math.PI / 2; shadowM.position.y = 0.05; g.add(shadowM);
      g.userData.block = block; g.userData.fixed = true;
      break;
    }
    default:
  }
  return g;
}

export function createRenderer(canvas, track, racers) {
  const th = THEMES[track.theme] || THEMES.valle;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(th.sky);
  if (th.fog) scene.fog = new THREE.Fog(...th.fog);
  scene.add(new THREE.HemisphereLight(0xffffff, th.ground ?? th.hemi ?? 0x222244, th.light));
  const sun = new THREE.DirectionalLight(track.theme === 'volcan' ? 0xffb080 : 0xffffff, th.sun);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 200 });
  scene.add(sun, sun.target);
  const movers = [];
  buildTrack(scene, track, th, movers);

  // Cajas de ítems: cubo transparente que gira, con «?».
  const qTex = canvasTex(128, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ff5ad1'); gr.addColorStop(0.5, '#ffe14a'); gr.addColorStop(1, '#4ab4ff'); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.85)'; g.font = 'bold 92px Inter, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('?', w / 2, h / 2 + 6); });
  const boxMat = new THREE.MeshLambertMaterial({ map: qTex, transparent: true, opacity: 0.85, emissive: 0x332244 });
  const boxes = track.boxes.map((b) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), boxMat); m.position.set(b.x, b.y + 1.3, b.z); m.castShadow = true; scene.add(m); return m; });
  // Monedas: discos dorados que giran.
  const coinM = new THREE.MeshLambertMaterial({ color: 0xffcc22, emissive: 0x664400 });
  const coinGeo = new THREE.CylinderGeometry(0.6, 0.6, 0.15, 16);
  const coins = track.coins.map((c) => { const m = new THREE.Mesh(coinGeo, coinM); m.rotation.x = Math.PI / 2; m.position.set(c.x, c.y, c.z); scene.add(m); return m; });
  // Obstáculos.
  const obs = track.obstacles.map((o) => { const m = obstacleModel(o, track); scene.add(m); return m; });

  const karts = new Map();
  for (const r of racers) {
    const m = kartModel(r.skin);
    m.userData.tag = makeTag(r.name, r.bot ? '#cfd6e6' : '#ffe14a');
    m.add(m.userData.tag);
    scene.add(m); karts.set(r.id, m);
  }
  const shots = new Map();
  const booms = [];
  // Humo del escape y polvo: un grupo fijo de partículas que se reusan.
  const puffs = [];
  const puffM = new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.5, depthWrite: false });
  for (let i = 0; i < 80; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.35, 6, 5), puffM.clone()); p.visible = false; scene.add(p); puffs.push({ m: p, age: 9, vx: 0, vy: 0, vz: 0 }); }
  let puffAt = 0;
  const puff = (x, y, z, color, vy = 1.2) => { const p = puffs[puffAt = (puffAt + 1) % puffs.length]; p.age = 0; p.m.position.set(x, y, z); p.m.material.color.setHex(color); p.m.visible = true; p.vx = (Math.random() - 0.5) * 1.5; p.vy = vy; p.vz = (Math.random() - 0.5) * 1.5; };
  const cams = [0, 1, 2, 3].map(() => ({ cam: new THREE.PerspectiveCamera(68, 1, 0.3, 1200), pos: null, look: new THREE.Vector3() }));

  function resize() {
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    renderer.setSize(w, h, false);
  }
  resize();
  window.addEventListener('resize', resize);

  let lastT = performance.now() / 1000;
  // frame: { t (segundos de carrera), lap (vuelta de quien mira, para los obstáculos de las fases), karts: [{ id, x, z, y, yaw,
  //          steer, drift, mt, boost, star, spin, shrink, fall, air, glide, trick }], shots, boxes: [bool], coins: [bool], booms, views }
  function draw(f) {
    const now = performance.now() / 1000, dt = Math.min(0.1, now - lastT); lastT = now;
    const t = f.t ?? now;
    for (const mv of movers) mv(t);
    for (const k of f.karts) {
      const m = karts.get(k.id); if (!m) continue;
      const u = m.userData;
      m.visible = !(k.fall > 0 && k.fall < 1.0);
      m.position.set(k.x, k.fall > 0 ? k.y - (1.3 - k.fall) * 8 : k.y, k.z);
      m.rotation.y = k.yaw + (k.drift ? k.drift * 0.32 : 0);
      u.tag.visible = !f.views.includes(k.id); // el nombre propio no tapa la pista
      u.spinA = k.spin > 0 ? u.spinA + dt * 14 : 0;
      // Pirueta: una vuelta entera en el aire; al caer, se aplasta un poco.
      u.trickA = k.trick ? Math.min(Math.PI * 2, u.trickA + dt * 14) : k.air ? u.trickA : 0;
      if (u.wasAir && !k.air) u.squash = 1;
      u.wasAir = Boolean(k.air);
      u.squash = Math.max(0, u.squash - dt * 4);
      u.body.rotation.set(k.glide ? -0.15 : 0, u.spinA, (k.drift ? -k.drift * 0.12 : -k.steer * 0.05) + (k.glide ? -k.steer * 0.35 : 0) + u.trickA);
      const sc = k.shrink > 0 ? 0.55 : 1;
      u.body.scale.set(sc * (1 + u.squash * 0.15), sc * (1 - u.squash * 0.25), sc * (1 + u.squash * 0.1));
      u.glider.visible = Boolean(k.glide);
      u.roll += (k.speed || 0) * dt * 2.5;
      u.wheels.forEach((w, i) => { w.rotation.x = -u.roll; if (i < 2) w.rotation.y = -k.steer * 0.45; });
      seatPose(u.driver, k.steer, k.drift);
      const boosting = k.boost > 0;
      u.flames.forEach((fl) => { fl.visible = boosting; fl.scale.set(1, 0.7 + Math.random() * 0.6, 1); });
      u.flameM.color.setHex(k.mt === 3 ? 0xc061ff : 0xffa63c);
      const showSparks = k.drift && k.mt > 0;
      u.sparks.forEach((sp) => { sp.visible = showSparks; sp.rotation.set(Math.random() * 6, Math.random() * 6, 0); sp.scale.setScalar(0.6 + Math.random() * 0.8); });
      u.sparkM.color.setHex(MT_COLORS[k.mt] || 0xffffff);
      if (k.star > 0) u.paint.color.setHSL((now * 3) % 1, 1, 0.55); else u.paint.color.copy(u.base);
      const ground = k.gy ?? k.y;
      u.shadow.position.y = ground - m.position.y + 0.05;
      u.shadow.scale.setScalar(1 / (1 + Math.max(0, k.y - ground) * 0.15));
      // Humo del escape (más con turbo) y chispas de colores derrapando.
      if (m.visible && !k.air && (k.speed || 0) > 4 && Math.random() < (boosting ? 0.9 : 0.25)) {
        const [fx, fz] = fwd(k.yaw);
        puff(k.x - fx * 2.2, k.y + 0.7, k.z - fz * 2.2, boosting ? 0xffb84a : 0xcccccc, boosting ? 2 : 1);
      }
      if (showSparks && Math.random() < 0.6) { const [fx, fz] = fwd(k.yaw); puff(k.x - fx * 1.4, k.y + 0.2, k.z - fz * 1.4, MT_COLORS[k.mt], 2.5); }
    }
    for (const p of puffs) {
      if (p.age > 1) { p.m.visible = false; continue; }
      p.age += dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(0.6 + p.age * 2); p.m.material.opacity = 0.5 * (1 - p.age);
    }
    // Proyectiles.
    const seen = new Set();
    for (const p of f.shots) {
      seen.add(p.key);
      let m = shots.get(p.key);
      if (!m) { m = shotModel(p.w); scene.add(m); shots.set(p.key, m); }
      m.position.set(p.x, p.y - 0.4, p.z);
      m.rotation.y = p.w === 'banana' ? 0 : now * 8;
    }
    for (const [key, m] of shots) if (!seen.has(key)) { scene.remove(m); shots.delete(key); }
    f.boxes.forEach((on, i) => { const b = boxes[i]; b.visible = on; b.rotation.set(now * 0.7, now * 1.1, 0); b.position.y = track.boxes[i].y + 1.3 + Math.sin(now * 2 + i) * 0.15; });
    (f.coins || []).forEach((on, i) => { const c = coins[i]; c.visible = on; c.rotation.z = now * 4 + i; c.position.y = track.coins[i].y + Math.sin(now * 3 + i) * 0.12; });
    // Obstáculos (los de una fase aparecen desde su vuelta).
    track.obstacles.forEach((o, i) => {
      const m = obs[i];
      m.visible = !o.lap || (f.lap || 1) >= o.lap;
      if (!m.visible) return;
      const parts = obstacleParts(track, o, t);
      const p0 = parts[0], u = m.userData;
      if (!p0) return;
      const base = track.samples[o.i];
      if (o.type === 'pendulum') { m.position.set(base.x, base.y, base.z); m.rotation.y = Math.atan2(base.tx, base.tz); u.arm.rotation.z = Math.asin(Math.max(-1, Math.min(1, p0.lat / 7.5))); }
      else if (o.type === 'firebar') { m.position.set(base.x, base.y, base.z); u.arm.rotation.y = -p0.ang; }
      else if (o.type === 'crusher') { m.position.set(p0.x, p0.y, p0.z); m.rotation.y = p0.yaw; u.block.position.y = p0.up * 7; }
      else if (o.type === 'geyser') { m.position.set(p0.x, p0.y, p0.z); u.jet.visible = p0.h > 0; u.jet.scale.set(1, Math.max(0.01, p0.h * 14), 1); u.jet.position.y = p0.h * 7; }
      else if (o.type === 'boulder') { m.position.set(p0.x, p0.y, p0.z); u.ball.rotation.x = -p0.roll; }
      else if (o.type === 'cow') { m.position.set(p0.x, p0.y, p0.z); m.rotation.y = Math.atan2(base.tx, base.tz) + (p0.ang > 0 ? Math.PI / 2 : -Math.PI / 2); m.position.y += Math.abs(Math.sin(t * 6)) * 0.15; }
      else { m.position.set(p0.x, p0.y, p0.z); if (p0.yaw != null) m.rotation.y = p0.yaw; }
    });
    // Explosiones: una esfera que crece y se desvanece.
    for (const b of f.booms) {
      if (booms.some((x) => x.key === b.key)) continue;
      const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: b.color || 0xffa63c, transparent: true, opacity: 0.8 }));
      m.position.set(b.x, (b.y ?? 0) + 1, b.z); scene.add(m); booms.push({ key: b.key, m, age: 0, r: b.r });
    }
    for (let i = booms.length - 1; i >= 0; i--) {
      const b = booms[i]; b.age += dt;
      b.m.scale.setScalar(b.r * Math.min(1, b.age * 4)); b.m.material.opacity = Math.max(0, 0.8 - b.age * 1.4);
      if (b.age > 0.6) { scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); booms.splice(i, 1); }
    }

    // Vistas: 1 entera, 2 lado a lado, 3 o 4 en cuadrícula.
    const w = canvas.clientWidth || 800, h = canvas.clientHeight || 450;
    const n = f.views.length;
    const cols = n > 1 ? 2 : 1, rows = n > 2 ? 2 : 1;
    renderer.setScissorTest(n > 1);
    if (n > 2) { renderer.setViewport(0, 0, w, h); renderer.setScissor(0, 0, w, h); renderer.setClearColor(0x000000); renderer.clear(); }
    f.views.forEach((id, k) => {
      const kart = f.karts.find((x) => x.id === id) || f.karts[0];
      const c = cams[k];
      const vw = w / cols, vh = h / rows;
      const vx = (k % cols) * vw, vy = (rows - 1 - Math.floor(k / cols)) * vh;
      if (kart) {
        const [fx, fz] = fwd(kart.yaw);
        const back = kart.fall > 0 ? 0 : kart.glide ? 9.5 : 7.5;
        const ky = kart.fall > 0 ? (kart.gy ?? kart.y) : kart.y;
        const want = new THREE.Vector3(kart.x - fx * back, ky + (kart.glide ? 4.5 : 3.4), kart.z - fz * back);
        if (!c.pos || c.pos.distanceTo(want) > 40) c.pos = want.clone();
        c.pos.lerp(want, Math.min(1, dt * 7));
        c.look.lerp(new THREE.Vector3(kart.x + fx * 5, ky + 1.1, kart.z + fz * 5), Math.min(1, dt * 10));
        c.cam.position.copy(c.pos); c.cam.lookAt(c.look);
        c.cam.fov += ((kart.boost > 0 ? 78 : kart.glide ? 74 : 68) - c.cam.fov) * Math.min(1, dt * 6);
        if (k === 0) { sun.position.set(kart.x + 30, ky + 60, kart.z + 20); sun.target.position.set(kart.x, ky, kart.z); }
      }
      c.cam.aspect = vw / vh; c.cam.updateProjectionMatrix();
      renderer.setViewport(vx, vy, vw, vh); renderer.setScissor(vx, vy, vw, vh);
      renderer.render(scene, c.cam);
    });
  }
  return {
    draw,
    resize,
    dispose() { window.removeEventListener('resize', resize); renderer.dispose(); scene.traverse((o) => { o.geometry?.dispose?.(); }); },
  };
}
