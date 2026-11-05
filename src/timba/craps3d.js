// Los dados del craps, en 3D y con la misma física que la Generala (`generala/dice.js`, Rapier determinista en un
// Web Worker): se tira y lo que queda en el paño es lo que salió. Nadie «decide» qué sale. Si un dado queda montado
// (inclinado contra la pared) se vuelve a tirar. Este archivo y Three.js se cargan recién al sentarse en una mesa de craps.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { everyFrame } from '../ticker.js';
import { DIE, FACES, HALF, TRAY, mulberry32, simulate } from '../generala/dice.js';
import { faceTexture } from '../generala/table.js';

const DICE = 2;
const MAX_TRIES = 4;

// La física, en un Worker (calcular una tirada lleva decenas de ms y en la página trababa el dibujo). Si no hay Worker, la página.
class Physics {
  constructor() {
    this.jobs = new Map();
    this.next = 1;
    this.main = null;
    try {
      this.worker = new Worker(new URL('../generala/simWorker.js', import.meta.url), { type: 'module' });
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

// El gesto de una tirada (ver `cleanThrow`): semilla al azar, desde el frente de la bandeja hacia el fondo, con algo de desvío.
const randomThrow = () => ({ s: Math.floor(Math.random() * 4294967296), x: 0, z: 50, a: Math.round((Math.random() - 0.5) * 700), b: -1000, p: 45 + Math.floor(Math.random() * 50) });

export async function createDice(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#14101c');
  const camera = new THREE.PerspectiveCamera(30, 1, 1, 400);

  const lamp = new THREE.DirectionalLight('#fff3e0', 2.4);
  lamp.position.set(-12, 40, 16);
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(1024, 1024);
  Object.assign(lamp.shadow.camera, { left: -22, right: 22, top: 20, bottom: -20, near: 5, far: 100 });
  lamp.shadow.bias = -0.0008;
  scene.add(lamp, new THREE.HemisphereLight('#fff1dd', '#3a2a1e', 1.3));

  const { hx, hz, wall, thick } = TRAY;
  const flat = (color) => new THREE.MeshLambertMaterial({ color });
  const add = (mesh, cast = true) => { mesh.castShadow = cast; mesh.receiveShadow = true; scene.add(mesh); return mesh; };
  const felt = add(new THREE.Mesh(new THREE.PlaneGeometry(2 * hx, 2 * hz), flat('#a8242e')), false);
  felt.rotation.x = -Math.PI / 2;
  felt.position.y = 0.02;
  const wood = flat('#6a3a1a');
  const wallAt = (w, d, x, z) => { const m = add(new THREE.Mesh(new THREE.BoxGeometry(w, wall, d), wood)); m.position.set(x, wall / 2, z); };
  wallAt(thick, 2 * (hz + thick), -hx - thick / 2, 0);
  wallAt(thick, 2 * (hz + thick), hx + thick / 2, 0);
  wallAt(2 * hx, thick, 0, -hz - thick / 2);
  wallAt(2 * hx, thick, 0, hz + thick / 2);

  const dieGeo = new RoundedBoxGeometry(DIE, DIE, DIE, 3, 0.22);
  const mats = FACES.map((value) => new THREE.MeshPhongMaterial({ map: faceTexture(value), shininess: 55, specular: '#3a3a3a' }));
  const dice = Array.from({ length: DICE }, (_, i) => {
    const mesh = add(new THREE.Mesh(dieGeo, mats));
    mesh.position.set(-2 + i * 4, HALF, 3.5);
    return mesh;
  });

  const fit = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const d = Math.max(46 / camera.aspect, 28);
    camera.position.set(0, d * 0.84, d * 0.54);
    camera.lookAt(0, 0, 1);
    camera.updateProjectionMatrix();
  };
  const resizer = new ResizeObserver(fit);
  resizer.observe(canvas);
  fit();

  const physics = new Physics();
  let play = null; // la tirada que se está reproduciendo: { result, t0, done }
  const qa = new THREE.Quaternion();
  const qb = new THREE.Quaternion();
  const pose = (frames, count, f, k) => {
    const i0 = Math.min(count - 1, Math.floor(f));
    const i1 = Math.min(count - 1, i0 + 1);
    const u = f - i0;
    const at = (i) => (i * DICE + k) * 7;
    const a = at(i0);
    const b = at(i1);
    dice[k].position.set(frames[a] + (frames[b] - frames[a]) * u, frames[a + 1] + (frames[b + 1] - frames[a + 1]) * u, frames[a + 2] + (frames[b + 2] - frames[a + 2]) * u);
    qa.set(frames[a + 3], frames[a + 4], frames[a + 5], frames[a + 6]);
    qb.set(frames[b + 3], frames[b + 4], frames[b + 5], frames[b + 6]);
    dice[k].quaternion.slerpQuaternions(qa, qb, u);
  };
  const stop = everyFrame(({ hidden }) => {
    if (play) {
      const t = (performance.now() - play.t0) / 1000;
      const { result } = play;
      const f = Math.min(result.count - 1, t / result.dt);
      for (let k = 0; k < DICE; k++) {
        dice[k].visible = t >= result.release[k];
        pose(result.frames, result.count, f, k);
      }
      if (t >= result.seconds + 0.25 && !play.done) { play.done = true; play.finish(); }
    }
    if (!hidden) renderer.render(scene, camera);
  });

  let disposed = false;
  return {
    // Tira los dados y devuelve las dos caras. Si alguno queda montado, lo vuelve a tirar (con `onCocked` se avisa).
    async roll(onCocked) {
      for (let tries = 0; tries < MAX_TRIES && !disposed; tries++) {
        const result = await physics.simulate(randomThrow(), [0, 1]);
        if (disposed) break;
        await new Promise((resolve) => { play = { result, t0: performance.now(), done: false, finish: resolve }; });
        if (result.values.every((v) => v > 0)) return result.values;
        onCocked?.();
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      // Sin suerte después de varios intentos (no pasa): dos caras al azar.
      const rand = mulberry32(Date.now());
      return [1 + Math.floor(rand() * 6), 1 + Math.floor(rand() * 6)];
    },
    dispose() {
      disposed = true;
      stop();
      resizer.disconnect();
      physics.dispose();
      renderer.dispose();
    },
  };
}
