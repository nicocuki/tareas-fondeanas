// La Timba 3D: las mesas de paño (blackjack, baccarat, mayor o menor, craps, ruleta, keno y buscaminas) y el armado de
// cualquier mesa (`buildTable`; las máquinas están en `machines3d.js`). Solo dibujo: todo lo que muestran sale de la sala
// (`room.tb[id]`) y de lo que se está escribiendo (`ui`), y las animaciones son las mismas en todas las pantallas porque
// dependen de la hora del servidor.
//
// Cada mesa devuelve `{ group, detail, buttons, update(ctx) }`. El origen es el centro de la mesa en el piso y el jugador se
// para del lado +z. `detail` es lo chico (cartas, teclas, fichas): se esconde de lejos para no gastar dibujo.
import * as THREE from 'three';
import { ACTIONS, ROULETTE_OUTSIDE, fmtX, phaseOf } from './controls.js';
import { NAMES, ROULETTE_WHEEL, colorOf } from './games.js';
import { handValue, isRed, rankOf, suitOf } from './bj.js';
import { KENO_DRAW, KENO_N, KENO_PAYS, MINES_OPTIONS, MINES_SIZE, handTotal, hiloOdds, hiloStepMult } from './newgames.js';
import { ROULETTE_MS } from './game.js';
import {
  Keypad, SURF, Sign, actionRow, bigButton, casinoTable, chipStack, croupier, ease, feltText, hitBox, refreshButtons, smooth,
} from './tablekit3d.js';
import { Screen, ball, box, cardMaterial, cardMesh, cyl, fitText, roundRect, toon } from './models3d.js';
import { buildMachine } from './machines3d.js';
import { UNIT } from './scenes.js';

// ─── Cartas que llegan volando ───────────────────────────────────────────────
// Una mano en la mesa: cada lugar recuerda qué carta tiene y cuándo apareció, y la carta vuela desde el zapato hasta su
// lugar. `faceUp` la da vuelta con una animación.
class HandView {
  constructor(parent, shoe, slot) {
    this.parent = parent;
    this.shoe = shoe;
    this.slot = slot; // (i) => { x, z, ry }
    this.cards = [];
  }

  sync(list, time, delays) {
    // list: [{ key, face: [rank, suit, red], up }]
    for (let i = 0; i < Math.max(list.length, this.cards.length); i++) {
      const want = list[i];
      let c = this.cards[i];
      if (!want) { if (c) c.mesh.visible = false; continue; }
      if (!c) { c = { mesh: cardMesh(), key: null }; this.parent.add(c.mesh); this.cards[i] = c; }
      if (c.key !== want.key) {
        c.key = want.key;
        c.spawn = time + (delays?.get(want.key) || 0);
        c.flip = want.up ? 1 : 0;
        c.mesh.userData.front.material = cardMaterial(...want.face);
      }
      c.mesh.visible = time >= c.spawn;
      c.flip += ((want.up ? 1 : 0) - c.flip) * 0.18;
      const s = this.slot(i);
      const u = ease((time - c.spawn) / 0.38);
      c.mesh.position.set(this.shoe.x + (s.x - this.shoe.x) * u, SURF + 0.004 + i * 0.0015 + Math.sin(u * Math.PI) * 0.12, this.shoe.z + (s.z - this.shoe.z) * u);
      c.mesh.rotation.set(0, (s.ry || 0) * u + (1 - u) * 0.6, Math.PI * (1 - c.flip));
    }
  }
}
const face = (c) => [rankOf(c), suitOf(c), isRed(c)];
const RANK13 = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const rankFace = (r) => [RANK13[r], '', false];

function shoeModel() {
  const g = new THREE.Group();
  g.add(box(0.2, 0.12, 0.32, toon(0x2a1a14), 0, 0.06, 0), box(0.16, 0.06, 0.04, toon(0xb8242e), 0, 0.12, 0.15));
  g.add(box(0.14, 0.02, 0.2, cardMaterial('back'), 0, 0.13, 0));
  return g;
}

// El armado de toda mesa de paño: la mesa, el croupier (si tiene), el teclado, los botones y el cartel.
function kit(spot, { felt, rail, draw, dealer = true, actions = ACTIONS[spot.kind], rowX = -0.5, title = NAMES[spot.kind].toUpperCase(), signColor } = {}) {
  const W = spot.w * UNIT; const D = spot.h * UNIT;
  const group = new THREE.Group();
  const detail = new THREE.Group();
  group.add(detail);
  const table = casinoTable(W, D, { felt, rail, draw, key: spot.kind });
  group.add(table.group);
  if (dealer) {
    const c = croupier([0x3a3a52, 0x5a3a2a, 0x2a4a5a, 0x4a2a4a][spot.id.length % 4]);
    c.position.set(0, 0, -D / 2 - 0.4);
    group.add(c);
    group.userData.croupier = c;
  }
  const pad = new Keypad(spot.id, spot.kind);
  pad.group.position.set(W / 2 - 0.36, SURF + 0.09, D / 2 - 0.3);
  pad.group.rotation.x = 0.5;
  pad.group.scale.setScalar(1.3);
  detail.add(pad.group);
  const row = actionRow(spot.id, actions, rowX, 0.3);
  row.group.position.set(0, SURF + 0.03, D / 2 - 0.15);
  detail.add(row.group);
  const sign = new Sign(title, 1.5, 0.5, signColor);
  sign.group.position.set(0, 2.45, -D / 2 - 0.1);
  group.add(sign.group);
  return { W, D, group, detail, pad, row, sign, top: table.top, buttons: [...pad.buttons, ...row.buttons] };
}

// Lo común de cada cuadro: el teclado, los botones y el cartel.
function refreshKit(k, ctx, extra = '') {
  k.pad.update(ctx);
  refreshButtons(k.row.buttons, ctx);
  k.sign.update(ctx, extra);
  const c = k.group.userData.croupier;
  if (c) c.rotation.y = Math.sin(ctx.time * 0.6 + k.W) * 0.15;
}

// ─── Blackjack ───────────────────────────────────────────────────────────────
function buildBj(spot) {
  const k = kit(spot, {
    draw: (c, w, h) => {
      c.strokeStyle = 'rgba(255,230,160,0.7)'; c.lineWidth = 4;
      c.beginPath(); c.arc(w / 2, -h * 0.35, h * 0.95, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
      feltText(c, 'BLACKJACK PAGA 3 A 2', w / 2, h * 0.36, w * 0.7, 30);
      feltText(c, 'EL CROUPIER SE PLANTA EN 17', w / 2, h * 0.47, w * 0.6, 18, 'rgba(255,240,200,0.6)');
      c.strokeStyle = 'rgba(255,240,200,0.8)'; c.lineWidth = 3;
      c.beginPath(); c.arc(w / 2, h * 0.79, 22, 0, Math.PI * 2); c.stroke();
    },
  });
  const shoe = shoeModel();
  shoe.position.set(-k.W / 2 + 0.45, SURF, -k.D / 2 + 0.38);
  shoe.rotation.y = 0.3;
  k.group.add(shoe);
  const from = { x: shoe.position.x, z: shoe.position.z };
  const player = new HandView(k.detail, from, (i) => ({ x: -0.18 + i * 0.1, z: 0.22 + i * 0.012, ry: -0.05 }));
  const dealer = new HandView(k.detail, from, (i) => ({ x: -0.18 + i * 0.1, z: -0.48, ry: 0.04 }));
  const chips = chipStack();
  chips.position.set(0, SURF, k.D / 2 - 0.42);
  k.detail.add(chips);
  let lastN = -1;
  return {
    ...k,
    update(ctx) {
      const t = ctx.t;
      const hand = t?.hand || [];
      const dl = t?.dealer || [];
      const delays = new Map();
      if (t && t.n !== lastN) { lastN = t.n; [`p0${t.n}`, `d0${t.n}`, `p1${t.n}`, `d1${t.n}`].forEach((key, i) => delays.set(key, i * 0.25)); }
      if (t?.phase === 'result') dl.slice(2).forEach((_, i) => delays.set(`d${i + 2}${t.n}`, 0.4 + i * 0.45));
      player.sync(hand.map((c, i) => ({ key: `p${i}${t.n}`, face: face(c), up: true })), ctx.time, delays);
      dealer.sync(dl.map((c, i) => ({ key: `d${i}${t.n}`, face: face(c), up: !(i === 1 && t.phase === 'play') })), ctx.time, delays);
      chips.userData.set(t?.bet || 0);
      let extra = '';
      if (hand.length) {
        const dv = t.phase === 'play' ? handValue([dl[0]]).total : handValue(dl).total;
        extra = `Croupier ${dv}  ·  Vos ${handValue(hand).total}  ·  Apuesta ${t.bet ? `$${t.bet}` : '-'}`;
      }
      refreshKit(k, ctx, extra);
    },
  };
}

// ─── Baccarat ────────────────────────────────────────────────────────────────
const BAC_AREAS = [['player', 'JUGADOR', '#2a5aa8', -0.85], ['tie', 'EMPATE ×9', '#2a8a4a', 0], ['banker', 'BANCO ×1,95', '#a8242e', 0.85]];
function buildBaccarat(spot) {
  const k = kit(spot, {
    felt: '#1a5a3a',
    draw: (c, w, h) => {
      feltText(c, 'BACCARAT', w / 2, h * 0.12, w * 0.4, 34);
      for (const [, label, color, x] of BAC_AREAS) {
        const cx = w / 2 + (x / 3.58) * w; const cy = h * 0.6;
        c.fillStyle = color; roundRect(c, cx - 60, cy - 28, 120, 56, 18); c.fill();
        c.strokeStyle = '#ffe6a0'; c.lineWidth = 3; c.stroke();
        fitText(c, label, cx, cy + 2, 110, 22, { color: '#fff' });
      }
      feltText(c, 'JUGADOR', w * 0.3, h * 0.3, 140, 18, 'rgba(255,240,200,0.6)');
      feltText(c, 'BANCO', w * 0.7, h * 0.3, 140, 18, 'rgba(255,240,200,0.6)');
    },
  });
  const areaW = (120 / 512) * (k.W - 0.14); const areaD = (56 / Math.round(512 * (k.D / k.W))) * (k.D - 0.14);
  const rings = [];
  for (const [side, label, , x] of BAC_AREAS) {
    const hb = hitBox(areaW, 0.03, areaD, { scope: 'table', table: spot.id, id: `b:${side}`, label });
    const z = (0.6 - 0.5) * (k.D - 0.14);
    hb.position.set(x, SURF + 0.01, z);
    k.detail.add(hb);
    k.buttons.push(hb);
    // el marco que marca lo elegido (cuatro tiras que brillan)
    const ring = new THREE.Group();
    const glow = toon(0xffe27a, { glow: 0.9 });
    ring.add(box(areaW + 0.04, 0.01, 0.02, glow, x, SURF, z - areaD / 2 - 0.02), box(areaW + 0.04, 0.01, 0.02, glow, x, SURF, z + areaD / 2 + 0.02));
    ring.add(box(0.02, 0.01, areaD + 0.04, glow, x - areaW / 2 - 0.02, SURF, z), box(0.02, 0.01, areaD + 0.04, glow, x + areaW / 2 + 0.02, SURF, z));
    k.detail.add(ring);
    rings.push({ ring, side, x, z });
  }
  const shoe = shoeModel();
  shoe.position.set(-k.W / 2 + 0.45, SURF, -k.D / 2 + 0.38);
  k.group.add(shoe);
  const from = { x: shoe.position.x, z: shoe.position.z };
  const hands = {
    p: new HandView(k.detail, from, (i) => ({ x: -0.95 + i * 0.15, z: -0.3, ry: i === 2 ? Math.PI / 2 : 0 })),
    b: new HandView(k.detail, from, (i) => ({ x: 0.6 + i * 0.15, z: -0.3, ry: i === 2 ? Math.PI / 2 : 0 })),
  };
  const chips = chipStack();
  k.detail.add(chips);
  return {
    ...k,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('baccarat', t, ctx.room, ctx.now);
      const seen = { p: [], b: [] };
      if (t && ph.played && t.p) {
        const order = [['p', 0], ['b', 0], ['p', 1], ['b', 1]];
        if (t.p.length > 2) order.push(['p', 2]);
        if (t.b.length > 2) order.push(['b', 2]);
        const dealt = ph.running ? Math.min(order.length, Math.max(0, Math.floor((ph.elapsed - 250) / 520) + 1)) : order.length;
        order.slice(0, dealt).forEach(([who, i]) => seen[who].push((who === 'p' ? t.p : t.b)[i]));
      }
      for (const who of ['p', 'b']) hands[who].sync(seen[who].map((r, i) => ({ key: `${who}${i}${t?.at}`, face: rankFace(r), up: true })), ctx.time);
      let pickedSide = ctx.ui.side;
      if (t && (ph.busy || ph.shown) && t.side) pickedSide = t.side;
      for (const r of rings) {
        r.ring.visible = r.side === pickedSide;
        if (r.side === pickedSide) chips.position.set(r.x, SURF, r.z);
      }
      chips.userData.set(t && ph.busy ? t.bet : 1);
      const extra = seen.p.length ? `Jugador ${handTotal(seen.p)}  ·  Banco ${seen.b.length ? handTotal(seen.b) : '-'}` : 'Jugador ×2 · Banco ×1,95 · Empate ×9';
      refreshKit(k, ctx, extra);
    },
  };
}

// ─── Mayor o menor ───────────────────────────────────────────────────────────
function buildHilo(spot) {
  const k = kit(spot, {
    felt: '#3a2a6a', rowX: -0.35,
    draw: (c, w, h) => {
      feltText(c, 'MAYOR O MENOR', w / 2, h * 0.14, w * 0.6, 36);
      feltText(c, 'SI SALE LA MISMA CARTA, SE PIERDE', w / 2, h * 0.7, w * 0.7, 18, 'rgba(255,240,200,0.6)');
    },
  });
  const big = cardMesh();
  big.scale.setScalar(2.3);
  big.position.set(-0.05, SURF + 0.21, -0.25);
  big.rotation.set(1.15, 0, 0);
  const easel = box(0.36, 0.02, 0.06, toon(0x2a1a14), -0.05, SURF + 0.01, -0.07);
  const prev = cardMesh();
  prev.position.set(-0.62, SURF + 0.004, -0.15);
  prev.rotation.y = 0.15;
  k.detail.add(big, easel, prev);
  let lastKey = '';
  let flipAt = -9;
  return {
    ...k,
    update(ctx) {
      const t = ctx.t;
      const card = t?.card || 0;
      const key = `${card}|${t?.n}|${t?.res}|${t?.at}`;
      if (key !== lastKey) { lastKey = key; flipAt = ctx.time; }
      const u = smooth((ctx.time - flipAt) / 0.3);
      big.userData.front.material = card ? cardMaterial(...rankFace(card)) : cardMaterial('back');
      big.rotation.set(1.15, 0, 0);
      big.scale.setScalar(2.3 * (0.8 + 0.2 * u));
      prev.visible = Boolean(t?.prev);
      if (t?.prev) prev.userData.front.material = cardMaterial(...rankFace(t.prev));
      const ph = phaseOf('hilo', t, ctx.room, ctx.now);
      let extra = '';
      if (t && ph.busy) {
        const hi = hiloOdds(card, 'hi'); const lo = hiloOdds(card, 'lo');
        extra = `MAYOR ${Math.round(hi * 100)}% ${hi > 0 ? fmtX(hiloStepMult(card, 'hi')) : ''}  ·  MENOR ${Math.round(lo * 100)}% ${lo > 0 ? fmtX(hiloStepMult(card, 'lo')) : ''}`;
      }
      refreshKit(k, ctx, extra);
    },
  };
}

// ─── Craps ───────────────────────────────────────────────────────────────────
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
let diceMats = null;
function dieMaterials() {
  if (diceMats) return diceMats;
  // el orden de las caras de BoxGeometry: +x, -x, +y, -y, +z, -z → 3, 4, 1, 6, 2, 5
  const make = (v) => {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#c8303a';
    for (const [x, y] of PIPS[v]) { g.beginPath(); g.arc(14 + x * 18, 14 + y * 18, 6, 0, Math.PI * 2); g.fill(); }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return toon(0xffffff, { map: tex });
  };
  diceMats = [3, 4, 1, 6, 2, 5].map(make);
  return diceMats;
}
// El giro que deja la cara `v` para arriba.
const UP = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };
export const ROLL_MS = 1300;

function buildCraps(spot) {
  const k = kit(spot, {
    felt: '#1f6a3a', rowX: -0.45,
    draw: (c, w, h) => {
      feltText(c, 'STREET CRAPS', w / 2, h * 0.14, w * 0.5, 34);
      [4, 5, 6, 8, 9, 10].forEach((n, i) => {
        const x = w * 0.2 + i * w * 0.12;
        c.strokeStyle = 'rgba(255,240,200,0.8)'; c.lineWidth = 3; c.strokeRect(x - 26, h * 0.26, 52, 46);
        fitText(c, String(n), x, h * 0.26 + 24, 44, 30, { color: '#fff4d0' });
      });
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(w * 0.06, h * 0.62, w * 0.88, h * 0.12);
      feltText(c, 'LÍNEA DE PASE · GANA 7 / 11 · PIERDE 2 / 3 / 12', w / 2, h * 0.68, w * 0.84, 20);
    },
  });
  const mats = dieMaterials();
  const dice = [0, 1].map(() => { const d = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.075), mats); k.detail.add(d); return d; });
  const rest = [[0.25, -0.18], [0.4, -0.1]];
  dice.forEach((d, i) => { d.position.set(rest[i][0], SURF + 0.038, rest[i][1]); });
  const puck = cyl(0.05, 0.05, 0.02, toon(0xffffff), 0, SURF + 0.01, 0, 18);
  const puckOff = cyl(0.05, 0.05, 0.02, toon(0x1a1622), -1.3, SURF + 0.01, -0.45, 18);
  k.detail.add(puck, puckOff);
  const chips = chipStack();
  chips.position.set(-0.2, SURF, (0.68 - 0.5) * (k.D - 0.14));
  k.detail.add(chips);
  let anim = null; // { at, dice }
  let lastN = -1;
  const api = {
    ...k,
    roll(values, time) { anim = { at: time, dice: values, local: true }; },
    rolling: () => Boolean(anim && anim.local && anim.at + ROLL_MS / 1000 > performance.now() / 1000),
    update(ctx) {
      const t = ctx.t;
      if (t && t.n !== lastN) {
        if (lastN >= 0 && t.dice.length && !(anim?.local && anim.dice.join() === t.dice.join())) anim = { at: ctx.time, dice: t.dice };
        lastN = t.n;
      }
      const shown = anim?.dice || t?.dice || [3, 4];
      dice.forEach((d, i) => {
        const u = anim ? (ctx.time - anim.at) / (ROLL_MS / 1000) : 1;
        const [rx, ry, rz] = UP[shown[i] || 1];
        if (u < 1) {
          const e = ease(u);
          d.position.set(-0.6 + (rest[i][0] + 0.6) * e, SURF + 0.038 + Math.abs(Math.sin(u * Math.PI * 3)) * 0.18 * (1 - u), 0.45 + (rest[i][1] - 0.45) * e);
          const spin = (1 - e) * 14;
          d.rotation.set(rx + spin * (1.2 + i * 0.3), ry + spin * 0.7, rz + spin * (0.9 - i * 0.2));
        } else {
          d.position.set(rest[i][0], SURF + 0.038, rest[i][1]);
          d.rotation.set(rx, ry, rz);
          if (anim && !anim.local) anim = null;
        }
      });
      if (anim?.local && ctx.time - anim.at > ROLL_MS / 1000 + 1.5) anim = null;
      const point = t?.point || 0;
      puck.visible = Boolean(point);
      puckOff.visible = !point;
      if (point) puck.position.set(-k.W / 2 + 0.07 + (0.2 + [4, 5, 6, 8, 9, 10].indexOf(point) * 0.12) * (k.W - 0.14), SURF + 0.012, -k.D / 2 + 0.07 + 0.26 * (k.D - 0.14) + 0.07);
      chips.userData.set(t && t.bet && !t.res ? t.bet : 0);
      const ph = phaseOf('craps', t, ctx.room, ctx.now);
      refreshKit(k, ctx, ph.busy ? (point ? `Punto: ${point}` : 'Primera tirada') : '');
    },
  };
  return api;
}

// ─── Ruleta ──────────────────────────────────────────────────────────────────
// El paño, en metros de la mesa: el 0 a la izquierda, tres filas de 12, las docenas y las de afuera.
const RL = { x0: -0.48, x1: 1.5, z0: -0.62, rowH: 0.15, zeroW: 0.14 };
RL.cw = (RL.x1 - RL.x0 - RL.zeroW) / 12;
function rouletteCells() {
  const out = [];
  out.push({ spot: 'n0', label: '0', x: RL.x0, z: RL.z0, w: RL.zeroW, d: RL.rowH * 3, color: '#2f8a3f' });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 12; c++) {
    const n = c * 3 + (3 - r);
    out.push({ spot: `n${n}`, label: String(n), x: RL.x0 + RL.zeroW + c * RL.cw, z: RL.z0 + r * RL.rowH, w: RL.cw, d: RL.rowH, color: colorOf(n) === 'red' ? '#c8303a' : '#1c1826' });
  }
  ROULETTE_OUTSIDE.slice(6).forEach(([spot, label], i) => out.push({ spot, label, x: RL.x0 + RL.zeroW + i * 4 * RL.cw, z: RL.z0 + 3 * RL.rowH, w: 4 * RL.cw, d: RL.rowH * 0.9, color: '#1f6a3a' }));
  ROULETTE_OUTSIDE.slice(0, 6).forEach(([spot, label], i) => out.push({ spot, label, x: RL.x0 + RL.zeroW + i * 2 * RL.cw, z: RL.z0 + 3.9 * RL.rowH, w: 2 * RL.cw, d: RL.rowH * 0.9, color: spot === 'red' ? '#c8303a' : spot === 'black' ? '#1c1826' : '#1f6a3a' }));
  return out;
}
const RCELLS = rouletteCells();
const RL_Z1 = RL.z0 + 4.8 * RL.rowH;

function rouletteLayoutTexture() {
  const W = RL.x1 - RL.x0; const D = RL_Z1 - RL.z0;
  const pw = 900; const ph = Math.round(pw * (D / W));
  const cv = document.createElement('canvas');
  cv.width = pw; cv.height = ph;
  const g = cv.getContext('2d');
  for (const c of RCELLS) {
    const x = ((c.x - RL.x0) / W) * pw; const y = ((c.z - RL.z0) / D) * ph; const w = (c.w / W) * pw; const h = (c.d / D) * ph;
    g.fillStyle = c.color; g.fillRect(x + 2, y + 2, w - 4, h - 4);
    g.strokeStyle = '#f4e6c0'; g.lineWidth = 3; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
    fitText(g, c.label, x + w / 2, y + h / 2 + 2, w - 8, c.spot[0] === 'n' ? 30 : 24, { color: '#fff' });
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function rouletteWheelTexture() {
  const s = 512; const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const N = ROULETTE_WHEEL.length;
  g.fillStyle = '#5a3420'; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < N; i++) {
    const n = ROULETTE_WHEEL[i];
    const a0 = (i / N) * Math.PI * 2; const a1 = ((i + 1) / N) * Math.PI * 2;
    g.fillStyle = { red: '#c8303a', black: '#1c1826', green: '#2f8a3f' }[colorOf(n)];
    g.beginPath(); g.arc(s / 2, s / 2, s * 0.47, a0, a1); g.arc(s / 2, s / 2, s * 0.3, a1, a0, true); g.closePath(); g.fill();
    g.strokeStyle = '#e8c070'; g.lineWidth = 2; g.stroke();
    const am = (a0 + a1) / 2;
    g.save(); g.translate(s / 2 + Math.cos(am) * s * 0.42, s / 2 + Math.sin(am) * s * 0.42); g.rotate(am + Math.PI / 2);
    fitText(g, String(n), 0, 0, 30, 22, { color: '#fff' });
    g.restore();
  }
  g.fillStyle = '#7a4a2a'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.3, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#e8c070'; g.lineWidth = 8;
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; g.beginPath(); g.moveTo(s / 2, s / 2); g.lineTo(s / 2 + Math.cos(a) * s * 0.28, s / 2 + Math.sin(a) * s * 0.28); g.stroke(); }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
let rouletteTex = null;

function buildRoulette(spot) {
  const k = kit(spot, { felt: '#1f7a3a', rowX: -0.55, actions: ACTIONS.roulette, draw: (c, w, h) => feltText(c, 'RULETA', w * 0.17, h * 0.92, 160, 26) });
  rouletteTex ||= { layout: rouletteLayoutTexture(), wheel: rouletteWheelTexture() };
  const layout = new THREE.Mesh(new THREE.PlaneGeometry(RL.x1 - RL.x0, RL_Z1 - RL.z0), toon(0xffffff, { map: rouletteTex.layout }));
  layout.rotation.x = -Math.PI / 2;
  layout.position.set((RL.x0 + RL.x1) / 2, SURF + 0.002, (RL.z0 + RL_Z1) / 2);
  k.group.add(layout);
  for (const c of RCELLS) {
    const hb = hitBox(c.w, 0.02, c.d, { scope: 'table', table: spot.id, id: `s:${c.spot}`, label: c.spot[0] === 'n' ? `NÚMERO ${c.label}` : c.label });
    hb.position.set(c.x + c.w / 2, SURF + 0.01, c.z + c.d / 2);
    k.detail.add(hb);
    k.buttons.push(hb);
  }
  // la rueda: un cuenco de madera, el anillo de casilleros que gira y la bolita
  const R = 0.46; const wx = -k.W / 2 + 0.58; const wz = -0.08;
  const bowl = cyl(R + 0.06, R + 0.02, 0.14, toon(0x4a2a18), wx, SURF + 0.05, wz, 36);
  const ringRim = cyl(R + 0.05, R + 0.05, 0.03, toon(0xd8a83a), wx, SURF + 0.13, wz, 36);
  const spin = new THREE.Group();
  spin.position.set(wx, SURF + 0.1, wz);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 48), toon(0xffffff, { map: rouletteTex.wheel }));
  disc.rotation.x = -Math.PI / 2;
  spin.add(disc, cyl(0.02, 0.06, 0.12, toon(0xd8a83a), 0, 0.06, 0, 12));
  for (let i = 0; i < 4; i++) { const arm = box(0.16, 0.012, 0.012, toon(0xd8a83a), Math.cos((i * Math.PI) / 2) * 0.08, 0.1, Math.sin((i * Math.PI) / 2) * 0.08); arm.rotation.y = -(i * Math.PI) / 2; spin.add(arm); }
  const bl = ball(0.017, toon(0xffffff), 0, 0.02, 0, 12);
  k.group.add(bowl, ringRim, spin, bl);
  const chips = chipStack();
  k.detail.add(chips);
  const N = ROULETTE_WHEEL.length;
  return {
    ...k,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('roulette', t, ctx.room, ctx.now);
      const el = ph.running ? ph.elapsed : ph.played ? t.ms : 0;
      const wheelRot = el * 0.0006 + ctx.time * (ph.running ? 0 : 0.2);
      spin.rotation.y = wheelRot;
      let bx; let bz; let br;
      if (t && ph.played) {
        const u = Math.min(1, el / ROULETTE_MS);
        const pocket = ((ROULETTE_WHEEL.indexOf(t.n) + 0.5) / N) * Math.PI * 2;
        const settle = ease(u);
        const ang = pocket - wheelRot + (1 - settle) * Math.PI * 2 * 7;
        const drop = Math.max(0, Math.min(1, (u - 0.55) / 0.35));
        br = R * (0.94 - 0.13 * drop * drop);
        bx = Math.cos(ang) * br; bz = Math.sin(ang) * br;
        if (!ph.running) { const a = pocket - wheelRot; bx = Math.cos(a) * R * 0.81; bz = Math.sin(a) * R * 0.81; }
      } else { bx = R * 0.81; bz = 0; const a = -wheelRot + 0.08; bx = Math.cos(a) * R * 0.81; bz = Math.sin(a) * R * 0.81; }
      bl.position.set(wx + bx, SURF + 0.115, wz + bz);
      const spotNow = t && (ph.busy || ph.shown) && t.spot ? t.spot : ctx.ui.spot;
      const cell = RCELLS.find((c) => c.spot === spotNow);
      if (cell) chips.position.set(cell.x + cell.w / 2, SURF + 0.004, cell.z + cell.d / 2);
      chips.userData.set(t && ph.busy ? t.bet : 1);
      refreshKit(k, ctx, ph.busy && t?.spot ? `Apostaste a ${spotNow[0] === 'n' ? `el ${spotNow.slice(1)}` : ROULETTE_OUTSIDE.find((o) => o[0] === spotNow)?.[1]}` : `Elegido: ${spotNow[0] === 'n' ? `el ${spotNow.slice(1)} (×36)` : ROULETTE_OUTSIDE.find((o) => o[0] === spotNow)?.[1]}`);
    },
  };
}

// ─── Keno ────────────────────────────────────────────────────────────────────
// 40 números en una pantalla grande sobre la mesa (8 × 5); cada uno se toca. Elegidos en amarillo, los que salen en azul y
// los aciertos en verde.
function gridBoard(spot, k, { cols, rows, x0, z0, w, d, prefix, label }) {
  const screen = new Screen(w, d, Math.round(160 * cols), Math.round(160 * rows * (d / w) * (cols / rows)), { glow: true });
  screen.mesh.rotation.x = -Math.PI / 2;
  screen.mesh.position.set(x0 + w / 2, SURF + 0.006, z0 + d / 2);
  k.group.add(screen.mesh, box(w + 0.05, 0.012, d + 0.05, toon(0x14101c), x0 + w / 2, SURF, z0 + d / 2));
  for (let i = 0; i < cols * rows; i++) {
    const c = i % cols; const r = Math.floor(i / cols);
    const hb = hitBox(w / cols, 0.02, d / rows, { scope: 'table', table: spot.id, id: `${prefix}:${i}`, label: label(i) });
    hb.position.set(x0 + (c + 0.5) * (w / cols), SURF + 0.015, z0 + (r + 0.5) * (d / rows));
    k.detail.add(hb);
    k.buttons.push(hb);
  }
  return screen;
}

function buildKeno(spot) {
  const k = kit(spot, { felt: '#2a1a5a', rowX: -0.4 });
  const screen = gridBoard(spot, k, { cols: 8, rows: 5, x0: -1.05, z0: -0.66, w: 1.6, d: 0.9, prefix: 'n', label: (i) => `NÚMERO ${i + 1}` });
  return {
    ...k,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('keno', t, ctx.room, ctx.now);
      const live = t && ph.played && (ph.busy || (t.picks && t.picks.join() === ctx.ui.picks.join()));
      const picks = live ? t.picks : ctx.ui.picks;
      const revealed = !live ? 0 : ph.running ? Math.min(KENO_DRAW, Math.floor((ph.elapsed / Math.max(1, t.ms - 500)) * KENO_DRAW) + 1) : KENO_DRAW;
      const drawn = live ? (t.draw || []).slice(0, revealed) : [];
      const sig = `${picks.join()}|${drawn.join()}|${ctx.hover || ''}|${ph.canBet}`;
      screen.draw(sig, (g, w, h) => {
        g.fillStyle = '#120c2a'; g.fillRect(0, 0, w, h);
        const cw = w / 8; const ch = h / 5;
        for (let i = 0; i < KENO_N; i++) {
          const x = (i % 8) * cw; const y = Math.floor(i / 8) * ch;
          const pick = picks.includes(i); const hit = drawn.includes(i);
          g.fillStyle = pick && hit ? '#3ec85a' : hit ? '#4a8ae8' : pick ? '#f0c33c' : ctx.hover === `n:${i}` ? '#5a4a8a' : '#2a2050';
          roundRect(g, x + 6, y + 6, cw - 12, ch - 12, 16); g.fill();
          fitText(g, String(i + 1), x + cw / 2, y + ch / 2 + 3, cw - 20, 64, { color: pick && !hit ? '#2a1a08' : '#fff' });
        }
      });
      const hits = drawn.filter((n) => picks.includes(n)).length;
      const pays = KENO_PAYS[picks.length] || [];
      const payLine = pays.map((p, h) => (p ? `${h}:${fmtX(p)}` : '')).filter(Boolean).slice(-4).join('  ');
      refreshKit(k, ctx, live && revealed ? `Salieron ${drawn.length}/${KENO_DRAW} · ${hits} aciertos` : picks.length ? `Elegiste ${picks.length} · paga ${payLine}` : 'Tocá los números de la pantalla');
    },
  };
}

// ─── Buscaminas ──────────────────────────────────────────────────────────────
function buildMines(spot) {
  const k = kit(spot, { felt: '#1a3a4a', rowX: -0.45 });
  const screen = gridBoard(spot, k, { cols: 5, rows: 5, x0: -0.95, z0: -0.7, w: 0.9, d: 0.9, prefix: 'c', label: (i) => `CASILLERO ${i + 1}` });
  const counts = MINES_OPTIONS.map((m, i) => {
    const b = bigButton(spot.id, `m:${m}`, `${m} ${m === 1 ? 'MINA' : 'MINAS'}`, 'purple', 0.26, 0.11);
    b.position.set(0.3, SURF + 0.03, -0.62 + i * 0.16);
    k.detail.add(b);
    k.buttons.push(b.userData.button);
    return b.userData.button;
  });
  return {
    ...k,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('mines', t, ctx.room, ctx.now);
      const open = t?.open || [];
      const over = t && t.bet > 0 && t.res;
      const mines = over ? t.mines : [];
      const sig = `${open.join()}|${mines.join()}|${t?.hit}|${ctx.hover || ''}|${ph.busy}`;
      screen.draw(sig, (g, w, h) => {
        g.fillStyle = '#0c1a22'; g.fillRect(0, 0, w, h);
        const cw = w / 5; const ch = h / 5;
        for (let i = 0; i < MINES_SIZE; i++) {
          const x = (i % 5) * cw; const y = Math.floor(i / 5) * ch;
          const isOpen = open.includes(i); const isMine = mines.includes(i); const boom = t?.hit === i;
          g.fillStyle = boom ? '#ff3a3a' : isMine ? '#7a2a3a' : isOpen ? '#1f6a4a' : ctx.hover === `c:${i}` && ph.busy ? '#6a5ab0' : '#3a3a7a';
          roundRect(g, x + 8, y + 8, cw - 16, ch - 16, 18); g.fill();
          if (isOpen) { g.fillStyle = '#5aff9a'; g.beginPath(); g.moveTo(x + cw / 2, y + 30); g.lineTo(x + cw - 34, y + ch / 2); g.lineTo(x + cw / 2, y + ch - 30); g.lineTo(x + 34, y + ch / 2); g.closePath(); g.fill(); g.fillStyle = '#d0ffe0'; g.fillRect(x + cw / 2 - 10, y + ch / 2 - 18, 10, 10); }
          if (isMine) { g.fillStyle = '#14101c'; g.beginPath(); g.arc(x + cw / 2, y + ch / 2 + 6, 30, 0, Math.PI * 2); g.fill(); g.fillStyle = '#ffb03a'; g.fillRect(x + cw / 2 + 14, y + ch / 2 - 34, 8, 16); }
        }
      });
      for (const b of counts) b.userData.set(!(t && ph.busy) && !ctx.room.day.over, Number(b.userData.btn.id.slice(2)) === (t && (ph.busy || over) ? t.count : ctx.ui.mines));
      refreshKit(k, ctx, `${t && (ph.busy || over) ? t.count : ctx.ui.mines} minas escondidas`);
    },
  };
}

// ─── Armar cualquier mesa ────────────────────────────────────────────────────
const BUILDERS = { bj: buildBj, baccarat: buildBaccarat, hilo: buildHilo, craps: buildCraps, roulette: buildRoulette, keno: buildKeno, mines: buildMines };

export function buildTable(spot) {
  const make = BUILDERS[spot.kind];
  const t = make ? make(spot) : buildMachine(spot);
  t.group.position.set((spot.x + spot.w / 2) * UNIT, 0, (spot.y + spot.h / 2) * UNIT);
  t.spot = spot;
  for (const b of t.buttons) b.userData.table = t;
  return t;
}
