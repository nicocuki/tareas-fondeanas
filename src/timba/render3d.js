// La Timba 3D: el dibujo con Three.js en primera persona. Se carga con `import()` recién al entrar a la partida (ver
// `TimbaGame.jsx`): no lo importes desde nada que cargue la portada. No toca el estado del juego: recibe en cada cuadro
// dónde está cada uno y la sala, y dice qué botón está mirando el jugador (`target`).
import * as THREE from 'three';
import { SCENES, UNIT, heightAt } from './scenes.js';
import { buildPlace } from './env3d.js';
import { buildTable } from './tables3d.js';
import { phaseOf, statusOf } from './controls.js';
import { Burst, animateBlob, blob, blobShadow, hands, nameTag } from './models3d.js';

const U = UNIT;
const EYE = 1.5;          // la altura de los ojos, parado
const REACH = 2.1;        // hasta dónde llega la mano (en metros)
const DETAIL_FAR = 11;    // de más lejos, lo chico de las mesas no se dibuja

export function createTimba3D(canvas, { color }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  let ratio = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(ratio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, 1, 0.04, 320);
  scene.add(camera);
  const myHands = hands(color);
  myHands.scale.setScalar(0.85);
  camera.add(myHands);
  const burst = new Burst(scene);
  const ray = new THREE.Raycaster();
  ray.far = REACH;
  // el recuadro que marca lo que estás por tocar
  const hl = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0xffe27a, depthTest: false, transparent: true }));
  hl.matrixAutoUpdate = false;
  hl.renderOrder = 10;
  hl.visible = false;
  scene.add(hl);

  let place = null;      // el lugar actual: { key, env, tables }
  const people = new Map(); // id → { g, tag, shadow }
  let target = null;     // lo que se está mirando: { btn, mesh, point }
  let poke = null;       // la mano yendo a apretar: { at, local }
  let shake = 0;
  let eyeH = null;       // la altura del piso debajo de la cámara, suavizada
  const lastTone = new Map();
  const slow = { n: 0, light: false };

  function resize() {
    const w = canvas.clientWidth || 1; const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function clearPlace() {
    if (!place) return;
    scene.remove(place.root);
    for (const l of place.env.lights) scene.remove(l);
    // las geometrías y materiales se comparten entre lugares; lo único propio de cada lugar son las pantallas
    place.root.traverse((o) => { o.userData.screen?.dispose(); });
    for (const p of people.values()) scene.remove(p.g);
    people.clear();
    burst.clear();
    place = null;
  }

  function setPlace(key, st) {
    if (place?.key === key) return;
    clearPlace();
    eyeH = null;
    const env = buildPlace(key, st);
    const root = new THREE.Group();
    root.add(env.group);
    const tables = [];
    for (const spot of SCENES[key]?.tables || []) {
      const t = buildTable(spot);
      root.add(t.group);
      tables.push(t);
    }
    scene.add(root);
    for (const l of env.lights) scene.add(l);
    scene.fog = env.fog ? new THREE.Fog(...env.fog) : null;
    scene.background = new THREE.Color(env.fog ? env.fog[0] : 0x0a0614);
    place = { key, env, tables, root, byId: new Map(tables.map((t) => [t.spot.id, t])) };
  }

  // Un jugador de los demás: el poroto de su color con su nombre arriba.
  function person(id, pl) {
    let p = people.get(id);
    if (!p) {
      const g = blob(new THREE.Color(pl.color).getHex(), { hat: pl.hat || '' });
      const tag = nameTag(pl.name, pl.color);
      tag.position.y = 1.75;
      g.add(tag, blobShadow());
      scene.add(g);
      p = { g, tag, phase: Math.random() * 3 };
      people.set(id, p);
    }
    return p;
  }

  // Dónde queda un punto del plano (x, y en unidades) en el mundo.
  const world = (x, y, h = 0) => new THREE.Vector3(x * U, h, y * U);

  // Un cuadro. `f` = { key, loc, me: { x, y, yaw, pitch, moving }, seat, others: [...], room, myId, uiFor, now, time, dt, env, hidden }
  function frame(f) {
    setPlace(f.key, f.env);
    const { env, tables } = place;
    // la cámara: parado en el piso, o sentado en la limusina
    const limoObj = env.limo;
    if (f.seat !== null && f.seat !== undefined && limoObj) {
      const s = limoObj.userData.seats[f.seat % 8];
      camera.position.set(limoObj.position.x + s.x, limoObj.userData.eyeY, limoObj.position.z + s.z);
    } else {
      // la altura del piso (tarimas, escaleras, terraza) se sigue con suavidad: subir una escalera no salta
      const floorH = heightAt(f.key, f.me.x, f.me.y);
      eyeH = eyeH === null || Math.abs(eyeH - floorH) > 1.5 ? floorH : eyeH + (floorH - eyeH) * Math.min(1, f.dt * 12);
      camera.position.copy(world(f.me.x, f.me.y, eyeH + EYE + (f.me.moving ? Math.abs(Math.sin(f.time * 9)) * 0.035 : 0)));
    }
    shake = f.env.moving ? 0.012 : shake * 0.9;
    if (shake > 0.001) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; }
    camera.rotation.set(f.me.pitch, f.me.yaw, 0, 'YXZ');
    camera.updateMatrixWorld();

    // los demás
    const seen = new Set();
    for (const o of f.others) {
      const p = person(o.id, o);
      seen.add(o.id);
      if (o.seat !== null && o.seat !== undefined && limoObj) {
        const s = limoObj.userData.seats[o.seat % 8];
        p.g.position.set(limoObj.position.x + s.x, limoObj.position.y + 0.38, limoObj.position.z + s.z);
        p.g.scale.setScalar(0.75);
        p.g.rotation.y = s.yaw;
      } else {
        p.g.position.copy(world(o.x, o.y, heightAt(f.key, o.x, o.y)));
        p.g.scale.setScalar(1);
        p.g.rotation.y = o.yaw + Math.PI;
      }
      animateBlob(p.g, f.time, o.moving, p.phase);
    }
    for (const [id, p] of people) if (!seen.has(id)) { scene.remove(p.g); people.delete(id); }

    // las mesas: cada una con lo suyo (de lejos, sin lo chico)
    const camPos = camera.position;
    const near = [];
    for (const t of tables) {
      const d = camPos.distanceTo(t.group.position);
      t.detail.visible = d < DETAIL_FAR;
      const state = f.room.tb[t.spot.id] || null;
      const owner = state ? f.room.players.find((pl) => pl.id === state.by) : null;
      const ctx = {
        kind: t.spot.kind, t: state, room: f.room, now: f.now, time: f.time, ui: f.uiFor(t.spot),
        mine: Boolean(state && state.by === f.myId), who: owner?.name || '', whoColor: owner?.color, hover: target?.btn.table === t.spot.id ? target.btn.id : '',
      };
      ctx.status = statusOf(ctx.ui, ctx, ctx.mine ? '' : ctx.who);
      if (d < 16 || t.spot.kind === 'wheel' || t.spot.kind === 'mwheel') t.update(ctx);
      if (d < 4.5) near.push(t);
      // monedas cuando gano en mi mesa
      if (ctx.mine) {
        const key = `${state.n ?? ''}|${state.at ?? ''}|${state.res ?? ''}|${state.paid ?? ''}`;
        const ph = phaseOf(t.spot.kind, state, f.room, f.now);
        if (ctx.status.tone === 'win' && ph.shown && lastTone.get(t.spot.id) !== key) { lastTone.set(t.spot.id, key); burst.coins(t.group.position.clone().add(new THREE.Vector3(0, 1.3, 0.3))); f.onWin?.(); }
      }
    }
    env.update(f.time, f.env);

    // qué botón estoy mirando (solo los de las mesas cercanas y los del lugar)
    target = null;
    if (!f.frozen) {
      const list = [...env.buttons];
      for (const t of near) list.push(...t.buttons);
      ray.setFromCamera({ x: 0, y: 0 }, camera);
      const hit = ray.intersectObjects(list, false)[0];
      if (hit) target = { btn: hit.object.userData.btn, mesh: hit.object, point: hit.point };
    }
    if (target) {
      const m = target.mesh;
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      const bb = m.geometry.boundingBox;
      const size = new THREE.Vector3(); const center = new THREE.Vector3();
      bb.getSize(size); bb.getCenter(center);
      hl.matrix.copy(m.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z)).multiply(new THREE.Matrix4().makeScale(size.x * 1.08 + 0.004, size.y * 1.4 + 0.004, size.z * 1.08 + 0.004));
      hl.material.opacity = 0.7 + Math.sin(f.time * 10) * 0.3;
      hl.visible = true;
    } else hl.visible = false;

    // las manos: se mueven al caminar y la derecha va a apretar
    const { left, right } = myHands.userData;
    const sway = f.me.moving ? Math.sin(f.time * 9) * 0.012 : Math.sin(f.time * 1.6) * 0.004;
    myHands.visible = f.seat === null || f.seat === undefined;
    left.position.set(-0.26, -0.3 + sway, -0.55);
    left.rotation.set(0.25, 0.25, 0.3);
    let rp = new THREE.Vector3(0.26, -0.3 - sway, -0.55);
    const aim = target ? 0.04 : 0;
    if (poke) {
      const k = (f.time - poke.at) / 0.28;
      if (k >= 1) poke = null;
      else {
        const out = k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65;
        rp = rp.lerp(poke.local, Math.max(0, Math.min(1, out)));
      }
    }
    right.position.copy(rp).add(new THREE.Vector3(-aim, aim, 0));
    right.rotation.set(0.25 - aim * 3, -0.25, -0.3);
    // los botones apretados vuelven a su lugar
    for (const t of near) for (const b of t.buttons) if (b.userData.pressedAt !== undefined && b.userData.rest !== undefined) {
      const k = f.time - b.userData.pressedAt;
      b.position.y = b.userData.rest - (k < 0.15 ? 0.018 : 0);
      if (k > 0.2) delete b.userData.pressedAt;
    }
    for (const b of env.buttons) if (b.userData.pressedAt !== undefined) {
      const k = f.time - b.userData.pressedAt;
      b.position.z = b.userData.rest + (k < 0.15 ? -0.015 : 0);
      if (k > 0.2) delete b.userData.pressedAt;
    }
    burst.step(f.dt);

    if (f.hidden) return;
    // si la compu no da abasto, se baja la resolución una vez
    if (f.dt > 0.034) slow.n += 1; else slow.n = Math.max(0, slow.n - 0.5);
    if (!slow.light && slow.n > 60) { slow.light = true; ratio = 1; renderer.setPixelRatio(1); resize(); }
    renderer.render(scene, camera);
  }

  // La mano aprieta lo que se está mirando.
  function press(time) {
    if (!target) return null;
    const local = camera.worldToLocal(target.point.clone());
    if (local.length() > 0.5) local.setLength(0.5);
    poke = { at: time, local: local.add(new THREE.Vector3(0, -0.04, 0.06)) };
    if (target.mesh.userData.rest !== undefined) target.mesh.userData.pressedAt = time;
    return target.btn;
  }

  function rollDice(tableId, dice, time) {
    place?.byId.get(tableId)?.roll?.(dice, time);
  }

  resize();
  return {
    frame, press, rollDice, resize,
    get target() { return target?.btn || null; },
    get light() { return slow.light; },
    debugTable: (id) => place?.byId.get(id) || null, // para los navegadores automatizados
    get info() { return { ...renderer.info.render, ratio }; },
    dispose() { clearPlace(); renderer.dispose(); },
  };
}
