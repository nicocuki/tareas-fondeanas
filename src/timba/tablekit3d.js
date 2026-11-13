// La Timba 3D: lo que comparten todas las mesas. El teclado de apuesta (una sola pantalla dibujada con todas las teclas, y
// una caja invisible por tecla para tocarla), los botones grandes, el cartel de arriba, el paño, el croupier y las fichas.
//
// Cada cosa que se toca es una malla con `userData.btn = { scope: 'table', table, id, label }`: `render3d.js` la encuentra
// mirando por el centro de la pantalla y `TimbaGame.jsx` le pasa el `id` a `controls.js`.
import * as THREE from 'three';
import { KEYPAD, QUICK, isEnabled, isPicked, resultOf, shownAmount, statusOf } from './controls.js';
import { betLimits, limitsFor } from './games.js';
import { fmtMoney } from './game.js';
import { DIGITS, FONT, Screen, blob, box, canvasTexture, cyl, fitText, labelMaterial, roundRect, toon } from './models3d.js';

export const SURF = 0.9; // la altura de las mesas
export const BTN_COLORS = {
  green: ['#3ec85a', '#1f6a2e'], red: ['#e0525a', '#7a1f26'], blue: ['#4a8ae8', '#1f3a7a'], orange: ['#f0a03a', '#7a4a10'],
  gold: ['#f0c33c', '#7a5a10'], purple: ['#9a5ae8', '#3a1f6a'], cream: ['#f0e6d0', '#6a6050'],
};
export const ease = (u) => 1 - (1 - Math.max(0, Math.min(1, u))) ** 3;
export const smooth = (u) => { const x = Math.max(0, Math.min(1, u)); return x * x * (3 - 2 * x); };

// Una caja invisible para tocar algo dibujado en una pantalla (no gasta dibujo: el material no se ve).
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export function hitBox(w, h, d, btn) {
  const m = new THREE.Mesh(UNIT_BOX, HIDDEN);
  m.scale.set(w, h, d);
  m.userData.btn = btn;
  return m;
}

// ─── El teclado de apuesta ───────────────────────────────────────────────────
// Un atril inclinado con la pantalla arriba (mínimo, máximo, la apuesta en verde, el máximo que se puede) y debajo las
// teclas 1–9, C, 0, 000 y la columna de botones rápidos, como el del original.
const PW = 300; const PH = 380;
const PAD_W = 0.34; const PAD_H = 0.43;
const KEY_RECTS = (() => {
  const out = [];
  KEYPAD.forEach((k, i) => out.push({ id: `k:${k}`, label: k === 'C' ? 'BORRAR' : k, text: k, x: 12 + (i % 3) * 62, y: 128 + Math.floor(i / 3) * 62, w: 56, h: 56 }));
  QUICK.forEach(([k, text], i) => out.push({ id: `q:${k}`, label: text, text, x: 206, y: 128 + i * 62, w: 82, h: 56 }));
  return out;
})();

// El atril se apoya por el borde de adelante (el del jugador) y sube hacia atrás, con una cuña abajo: así nunca se mete
// adentro de la mesa ni de la máquina. `mount` lo ubica: (x, y, z) es el medio del borde de adelante, sobre la superficie.
const BODY_D = PAD_H + 0.06;
export class Keypad {
  constructor(tableId, kind) {
    this.kind = kind;
    this.group = new THREE.Group();   // el atril entero, apoyado en el piso de la mesa
    this.panel = new THREE.Group();   // la tapa inclinada, que gira sobre el borde de adelante
    this.group.add(this.panel);
    const inner = new THREE.Group();
    inner.position.set(0, 0.055, -BODY_D / 2);
    this.panel.add(inner);
    inner.add(box(PAD_W + 0.06, 0.05, BODY_D, toon(0x2a2236), 0, -0.03, 0));
    this.screen = new Screen(PAD_W, PAD_H, PW, PH, { glow: false });
    this.screen.mesh.rotation.x = -Math.PI / 2;
    this.screen.mesh.position.y = 0.0;
    inner.add(this.screen.mesh);
    this.buttons = KEY_RECTS.map((r) => {
      const hb = hitBox((r.w / PW) * PAD_W, 0.02, (r.h / PH) * PAD_H, { scope: 'table', table: tableId, id: r.id, label: r.label });
      hb.position.set(((r.x + r.w / 2) / PW - 0.5) * PAD_W, 0.01, ((r.y + r.h / 2) / PH - 0.5) * PAD_H);
      inner.add(hb);
      return hb;
    });
    this.mount({ x: 0, y: 0, z: 0 });
  }

  // Lo apoya con el borde de adelante en (x, y, z) y la tapa inclinada `tilt` (radianes) hacia el jugador.
  mount({ x, y, z, tilt = 0.55, scale = 1 }) {
    this.group.position.set(x, y, z);
    this.group.scale.setScalar(scale);
    this.panel.rotation.x = tilt;
    if (this.wedge) this.group.remove(this.wedge);
    const run = Math.cos(tilt) * BODY_D; const rise = Math.sin(tilt) * BODY_D + 0.01;
    const shape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(run, 0), new THREE.Vector2(run, rise)]);
    const geo = new THREE.ExtrudeGeometry(shape, { depth: PAD_W + 0.06, bevelEnabled: false });
    this.wedge = new THREE.Mesh(geo, toon(0x1a1622));
    this.wedge.rotation.y = Math.PI / 2;
    this.wedge.position.x = -(PAD_W + 0.06) / 2;
    this.group.add(this.wedge);
    return this;
  }

  update(ctx) {
    const { room, kind } = ctx;
    const day = room.day.n;
    const [lo, hi] = limitsFor(kind, day);
    const lim = betLimits(kind, room.money, day);
    const active = isEnabled('k:1', ctx.ui, ctx);
    const amount = shownAmount(ctx.ui, ctx);
    const over = active && (!lim || ctx.ui.amount > lim.max);
    const sig = `${lo}|${hi}|${lim?.max}|${amount}|${active}|${over}|${ctx.hover || ''}`;
    this.screen.draw(sig, (g, w, h) => {
      g.fillStyle = '#3a3048'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#0c0a12'; roundRect(g, 10, 10, w - 20, 108, 12); g.fill();
      fitText(g, `MÍN ${fmtMoney(lo)}  ·  MÁX ${fmtMoney(hi)}`, w / 2, 30, w - 40, 22, { font: DIGITS, color: '#cbb8ff' });
      fitText(g, fmtMoney(amount), w / 2, 68, w - 40, 52, { font: DIGITS, color: over ? '#ff5a5a' : active ? '#5aff7a' : '#9adca8', weight: '700' });
      fitText(g, `APUESTA MÁX ${fmtMoney(lim ? lim.max : 0)}`, w / 2, 102, w - 40, 18, { font: DIGITS, color: over ? '#ff5a5a' : '#ffd27a' });
      for (const r of KEY_RECTS) {
        const quick = r.id[0] === 'q';
        const clear = r.id === 'k:C';
        const hov = ctx.hover === r.id;
        g.fillStyle = 'rgba(0,0,0,0.45)'; roundRect(g, r.x + 2, r.y + 5, r.w, r.h, 10); g.fill();
        g.fillStyle = !active ? '#5a5462' : clear ? '#d8343a' : quick ? '#f0a83a' : '#ece4d8';
        if (hov && active) g.fillStyle = clear ? '#ff5a5a' : quick ? '#ffd27a' : '#ffffff';
        roundRect(g, r.x, r.y, r.w, r.h, 10); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.35)'; roundRect(g, r.x + 4, r.y + 3, r.w - 8, 10, 5); g.fill();
        fitText(g, r.text, r.x + r.w / 2, r.y + r.h / 2 + 2, r.w - 8, quick ? 24 : 30, { color: !active ? '#8a8494' : clear ? '#fff' : '#3a2a20' });
      }
    });
  }
}

// ─── Botones grandes ─────────────────────────────────────────────────────────
// Una tecla gorda de arcade con el texto arriba. `update(on, picked)` la apaga (gris) o la marca (brilla).
export function bigButton(tableId, id, label, color, w = 0.26, d = 0.13) {
  const [bg, dark] = BTN_COLORS[color] || BTN_COLORS.green;
  const side = toon(new THREE.Color(dark).getHex());
  const top = labelMaterial(label, bg, '#fff');
  const off = labelMaterial(label, '#4a4452', '#8a8494');
  const glow = labelMaterial(label, '#ffe27a', '#3a2a10');
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), [side, side, top, side, side, side]);
  m.userData.btn = { scope: 'table', table: tableId, id, label };
  m.userData.rest = 0;
  m.userData.set = (on, picked = false) => { m.material[2] = picked ? glow : on ? top : off; };
  const base = box(w + 0.04, 0.03, d + 0.04, toon(0x1a1622), 0, -0.03, 0);
  const g = new THREE.Group();
  g.add(base, m);
  m.position.y = 0.012;
  m.userData.rest = 0.012;
  g.userData.button = m;
  return g;
}

// ─── El cartel de la mesa ────────────────────────────────────────────────────
// Arriba de cada mesa: el nombre del juego, lo que pasa (o quién juega) y una línea más (totales, multiplicadores). Se ve
// de lejos, así cada uno sabe dónde se está jugando.
export class Sign {
  constructor(title, w = 1.5, h = 0.5, color = '#f0c33c') {
    this.title = title;
    this.color = color;
    this.screen = new Screen(w, h, 600, 200);
    this.group = new THREE.Group();
    this.group.add(box(w + 0.08, h + 0.08, 0.05, toon(0x14101c), 0, 0, -0.03), this.screen.mesh);
  }

  update(ctx, extra = '') {
    const st = statusOf(ctx.ui, ctx, ctx.mine ? '' : ctx.who);
    const tone = { win: '#5aff7a', lose: '#ff6a6a', push: '#ffd27a' }[st.tone] || '#ffffff';
    this.screen.draw(`${st.text}|${st.tone}|${extra}|${ctx.who}|${ctx.mine}`, (g, w, h) => {
      g.fillStyle = '#1c1433'; g.fillRect(0, 0, w, h);
      g.fillStyle = this.color; g.fillRect(0, 0, w, 70);
      fitText(g, this.title, w / 2, 38, w - 30, 54, { color: '#2a1608' });
      if (ctx.who && !ctx.mine) { g.fillStyle = ctx.whoColor || '#fff'; g.fillRect(14, 80, 12, 40); }
      fitText(g, st.text, w / 2, 112, w - 50, 40, { color: tone });
      if (extra) fitText(g, extra, w / 2, 164, w - 40, 32, { color: '#cbb8ff' });
    });
  }
}

// ─── Mesa, paño y croupier ───────────────────────────────────────────────────
// La mesa de casino: un pie, la tabla con el borde acolchado y el paño (dibujado con `draw`). Mira para +z (donde se para
// el jugador). Devuelve la mesa y el paño (para dibujar encima).
const felts = new Map();
export function casinoTable(w, d, { felt = '#1f7a3a', rail = 0x5a2a1a, draw = null, key = '' } = {}) {
  const g = new THREE.Group();
  const wood = toon(rail);
  g.add(box(w * 0.5, SURF - 0.12, d * 0.4, toon(0x2a1a14), 0, (SURF - 0.12) / 2, 0));
  g.add(box(w, 0.1, d, wood, 0, SURF - 0.07, 0));
  // el paño se dibuja una vez por clase de mesa (todas las de blackjack comparten el mismo)
  const fkey = `${key}|${felt}|${w}|${d}`;
  let tex = felts.get(fkey);
  if (!tex) {
    tex = canvasTexture(512, Math.round(512 * (d / w)), (c, cw, ch) => {
      c.fillStyle = felt; c.fillRect(0, 0, cw, ch);
      c.fillStyle = 'rgba(255,255,255,0.04)';
      for (let i = 0; i < 300; i++) c.fillRect(Math.random() * cw, Math.random() * ch, 2, 2);
      draw?.(c, cw, ch);
    });
    felts.set(fkey, tex);
  }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.14, d - 0.14), toon(0xffffff, { map: tex }));
  top.rotation.x = -Math.PI / 2;
  top.position.y = SURF - 0.015;
  g.add(top);
  const padded = toon(0x3a1a12);
  for (const s of [-1, 1]) {
    g.add(box(w, 0.06, 0.09, padded, 0, SURF - 0.01, s * (d / 2 - 0.045)));
    g.add(box(0.09, 0.06, d, padded, s * (w / 2 - 0.045), SURF - 0.01, 0));
  }
  return { group: g, top, tex };
}

// El croupier: un poroto con galera y moño, del otro lado de la mesa.
export function croupier(color = 0x3a3a52) {
  const c = blob(color, { hat: 'top', bow: true });
  c.rotation.y = 0;
  return c;
}

// Una pila de fichas (para mostrar lo apostado).
export function chipStack() {
  const g = new THREE.Group();
  const cols = [0xe0525a, 0x4a8ae8, 0x3ec85a, 0xf0c33c, 0x1a1622];
  for (let i = 0; i < 6; i++) {
    const c = cyl(0.04, 0.04, 0.012, toon(cols[i % cols.length]), (i % 2) * 0.004, 0.008 + i * 0.013, 0, 16);
    g.add(c);
  }
  g.userData.set = (amount) => {
    const n = amount <= 0 ? 0 : Math.min(6, 1 + Math.floor(Math.log10(Math.max(1, amount))));
    g.children.forEach((c, i) => { c.visible = i < n; });
  };
  return g;
}

// Una fila de botones grandes (los de `ACTIONS`) a lo ancho, centrados en `x`.
export function actionRow(tableId, actions, x = 0, gap = 0.3) {
  const g = new THREE.Group();
  const list = actions.map(([id, label, color], i) => {
    const b = bigButton(tableId, `a:${id}`, label, color);
    b.position.x = x + (i - (actions.length - 1) / 2) * gap;
    g.add(b);
    return b.userData.button;
  });
  return { group: g, buttons: list };
}

// Prende o apaga los botones según lo que se puede hacer.
export function refreshButtons(buttons, ctx) {
  for (const b of buttons) b.userData.set?.(isEnabled(b.userData.btn.id, ctx.ui, ctx), isPicked(b.userData.btn.id, ctx.ui, ctx));
}

// Dibuja un texto centrado en el paño (para títulos y reglas pintadas en la mesa).
export function feltText(c, text, x, y, maxW, size, color = 'rgba(255,240,200,0.85)') {
  fitText(c, text, x, y, maxW, size, { color, font: FONT });
}

// ─── Lo que flota en el aire ─────────────────────────────────────────────────
// Como en el original, los juegos no son del todo realistas: los números importantes (tu mano, la del croupier, lo que
// salió, el multiplicador, lo que ganaste) flotan en el aire, grandes y con borde oscuro, mirando siempre a la cámara.
// Se ven a través de todo (sin profundidad) y viven en el `detail` de la mesa, así de lejos no se dibujan.
export const TONES = { win: '#5aff7a', lose: '#ff5a5a', push: '#ffd23a', info: '#ffffff', gold: '#ffd23a', blue: '#7ad8ff' };
export class Floater {
  constructor(height = 0.2) {
    this.tex = canvasTexture(512, 200);
    this.g = this.tex.image.getContext('2d');
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthTest: false, depthWrite: false }));
    this.sprite.renderOrder = 20;
    this.sprite.userData.screen = this;
    this.h = height;
    this.sprite.scale.set((height * 512) / 200, height, 1);
    this.sprite.visible = false;
    this.sig = null;
    this.changedAt = -9;
    this.base = new THREE.Vector3();
  }

  at(x, y, z) { this.base.set(x, y, z); this.sprite.position.copy(this.base); return this; }

  // `text` vacío lo esconde. `label`: una palabra chica arriba («VOS», «CROUPIER»).
  set(text, { color = '#ffffff', label = '' } = {}, time = 0) {
    this.sprite.visible = Boolean(text);
    const sig = `${text}|${color}|${label}`;
    if (sig === this.sig) return;
    if (text && text !== this.lastText) this.changedAt = time;
    this.lastText = text;
    this.sig = sig;
    const g = this.g;
    g.clearRect(0, 0, 512, 200);
    if (!text) { this.tex.needsUpdate = true; return; }
    if (label) fitText(g, label, 256, 34, 480, 34, { color: '#e8e0ff', stroke: '#14101c', strokeW: 8 });
    g.shadowColor = color; g.shadowBlur = 18;
    fitText(g, text, 256, label ? 128 : 104, 490, label ? 120 : 140, { color: '#ffffff', stroke: '#14101c', strokeW: 14 });
    g.shadowBlur = 0;
    fitText(g, text, 256, label ? 128 : 104, 490, label ? 120 : 140, { color, stroke: '', strokeW: 0 });
    this.tex.needsUpdate = true;
  }

  // Cada cuadro: salta un poco al cambiar y flota subiendo y bajando.
  tick(time) {
    if (!this.sprite.visible) return;
    const k = time - this.changedAt;
    const pop = k < 0.4 ? 1 + Math.sin((k / 0.4) * Math.PI) * 0.35 : 1;
    this.sprite.scale.set((this.h * 512 * pop) / 200, this.h * pop, 1);
    this.sprite.position.set(this.base.x, this.base.y + Math.sin(time * 2.2 + this.base.x * 3) * 0.02, this.base.z);
  }

  dispose() { this.tex.dispose(); this.sprite.material.dispose(); }
}

// El resultado de la ronda (+$X verde, −$X rojo) flotando arriba de la mesa.
export function refreshResult(f, ctx) {
  const r = resultOf(ctx);
  f.set(r ? r.text : '', { color: TONES[r?.tone] || '#fff' }, ctx.time);
  f.tick(ctx.time);
}

// El holograma de las mesas de cartas: un marco celeste translúcido en el aire, entre el jugador y el croupier, donde
// flotan las manos (como en el original). Una sola textura para todas las mesas.
let holoTex = null;
export function holoPanel(w = 1.3, h = 0.8) {
  holoTex ||= canvasTexture(256, 160, (g, cw, ch) => {
    const grd = g.createLinearGradient(0, 0, 0, ch);
    grd.addColorStop(0, 'rgba(90,230,220,0.30)'); grd.addColorStop(1, 'rgba(60,160,200,0.10)');
    g.fillStyle = grd; roundRect(g, 4, 4, cw - 8, ch - 8, 22); g.fill();
    g.strokeStyle = 'rgba(140,255,240,0.85)'; g.lineWidth = 5; roundRect(g, 4, 4, cw - 8, ch - 8, 22); g.stroke();
    g.strokeStyle = 'rgba(140,255,240,0.25)'; g.lineWidth = 2;
    for (let y = 14; y < ch; y += 10) { g.beginPath(); g.moveTo(10, y); g.lineTo(cw - 10, y); g.stroke(); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: holoTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  m.renderOrder = 5;
  return m;
}
