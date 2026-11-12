// La Timba 3D: lo que comparten todas las mesas. El teclado de apuesta (una sola pantalla dibujada con todas las teclas, y
// una caja invisible por tecla para tocarla), los botones grandes, el cartel de arriba, el paño, el croupier y las fichas.
//
// Cada cosa que se toca es una malla con `userData.btn = { scope: 'table', table, id, label }`: `render3d.js` la encuentra
// mirando por el centro de la pantalla y `TimbaGame.jsx` le pasa el `id` a `controls.js`.
import * as THREE from 'three';
import { KEYPAD, QUICK, isEnabled, isPicked, shownAmount, statusOf } from './controls.js';
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

export class Keypad {
  constructor(tableId, kind) {
    this.kind = kind;
    this.group = new THREE.Group();
    this.group.add(box(PAD_W + 0.06, 0.05, PAD_H + 0.06, toon(0x2a2236), 0, -0.03, 0));
    this.screen = new Screen(PAD_W, PAD_H, PW, PH, { glow: false });
    this.screen.mesh.rotation.x = -Math.PI / 2;
    this.screen.mesh.position.y = 0.0;
    this.group.add(this.screen.mesh);
    this.buttons = KEY_RECTS.map((r) => {
      const hb = hitBox((r.w / PW) * PAD_W, 0.02, (r.h / PH) * PAD_H, { scope: 'table', table: tableId, id: r.id, label: r.label });
      hb.position.set(((r.x + r.w / 2) / PW - 0.5) * PAD_W, 0.01, ((r.y + r.h / 2) / PH - 0.5) * PAD_H);
      this.group.add(hb);
      return hb;
    });
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
