// La Timba 3D: las máquinas y los juegos con algo que se mueve (tragamonedas, rueda de la fortuna, rueda del dinero, crash,
// plinko, cruce del pingüino y carrera de patos). Mismo armado que las mesas de `tables3d.js`: `{ group, detail, buttons,
// update(ctx) }`, el jugador del lado +z y todo lo que se ve sale de la sala y de la hora del servidor.
import * as THREE from 'three';
import { ACTIONS, MWHEEL_NAMES, fmtX, phaseOf, statusOf, wheelLabel } from './controls.js';
import { DUCKS, NAMES, SLOT_SYMBOLS, WHEEL, slotsEval } from './games.js';
import { MWHEEL, MWHEEL_PAYS, MWHEEL_SPOTS, PENGUIN_CUBES, PLINKO_MULTS, PLINKO_ROWS, crashMultAt, crashPay, penguinMult } from './newgames.js';
import { SLOTS_MS, WHEEL_SPIN_MS, fmtMoney } from './game.js';
import { Keypad, SURF, Sign, actionRow, bigButton, casinoTable, ease, refreshButtons, smooth } from './tablekit3d.js';
import { DIGITS, Screen, ball, box, cyl, fitText, labelMaterial, plane, roundRect, toon } from './models3d.js';
import { UNIT } from './scenes.js';

// Un atril con el teclado y los botones (para las máquinas contra la pared): `x` y `z` relativos a la máquina.
function podium(spot, group, detail, { w, z, actions, rowX = -0.35, padX = 0.32, h = 1.0 }) {
  group.add(box(w, h - 0.05, 0.42, toon(0x2a1a2e), 0, (h - 0.05) / 2, z));
  group.add(box(w + 0.04, 0.05, 0.46, toon(0xd8a83a), 0, h - 0.02, z));
  const pad = new Keypad(spot.id, spot.kind);
  pad.group.position.set(padX, h + 0.08, z + 0.02);
  pad.group.rotation.x = 0.5;
  pad.group.scale.setScalar(1.2);
  detail.add(pad.group);
  const row = actionRow(spot.id, actions, rowX, 0.3);
  row.group.position.set(0, h + 0.03, z + 0.08);
  detail.add(row.group);
  return { pad, row };
}

function base(spot) {
  const W = spot.w * UNIT; const D = spot.h * UNIT;
  const group = new THREE.Group();
  const detail = new THREE.Group();
  group.add(detail);
  return { W, D, group, detail, buttons: [] };
}

// ─── Símbolos de la tragamonedas ─────────────────────────────────────────────
function drawSymbol(g, id, x, y, s) {
  const gold = '#f0c33c'; const deep = '#b8862a';
  g.save();
  g.translate(x, y);
  // el hexágono del fondo, como en el original
  g.fillStyle = '#1a2440'; g.strokeStyle = gold; g.lineWidth = s * 0.06;
  g.beginPath();
  for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + (i * Math.PI) / 3; g.lineTo(Math.cos(a) * s * 0.46, Math.sin(a) * s * 0.46); }
  g.closePath(); g.fill(); g.stroke();
  const r = s * 0.3;
  if (id === 'lotus') {
    g.fillStyle = gold;
    for (let i = -2; i <= 2; i++) { g.save(); g.rotate(i * 0.42); g.beginPath(); g.ellipse(0, -r * 0.35, r * 0.22, r * 0.62, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    g.fillStyle = deep; g.fillRect(-r * 0.7, r * 0.32, r * 1.4, r * 0.18);
  } else if (id === 'scarab') {
    g.fillStyle = gold; g.beginPath(); g.ellipse(0, r * 0.15, r * 0.48, r * 0.62, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(0, -r * 0.6, r * 0.3, r * 0.22, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = deep; g.lineWidth = r * 0.08; g.beginPath(); g.moveTo(0, -r * 0.4); g.lineTo(0, r * 0.75); g.stroke();
    g.strokeStyle = gold; g.lineWidth = r * 0.1;
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(sx * r * 0.4, -r * 0.1 + k * r * 0.35); g.lineTo(sx * r * 0.8, -r * 0.3 + k * r * 0.45); g.stroke(); }
  } else if (id === 'ankh') {
    g.strokeStyle = gold; g.lineWidth = r * 0.24;
    g.beginPath(); g.ellipse(0, -r * 0.5, r * 0.3, r * 0.4, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(0, -r * 0.1); g.lineTo(0, r * 0.9); g.moveTo(-r * 0.6, r * 0.05); g.lineTo(r * 0.6, r * 0.05); g.stroke();
  } else {
    g.fillStyle = '#f4f0e6'; g.beginPath(); g.ellipse(0, 0, r * 0.8, r * 0.42, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#3a9ae8'; g.beginPath(); g.arc(0, 0, r * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#14101c'; g.beginPath(); g.arc(0, 0, r * 0.15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = gold; g.lineWidth = r * 0.12;
    g.beginPath(); g.ellipse(0, 0, r * 0.84, r * 0.46, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(-r * 0.1, r * 0.4); g.lineTo(-r * 0.2, r * 0.9); g.moveTo(r * 0.2, r * 0.42); g.quadraticCurveTo(r * 0.6, r * 0.9, r * 0.2, r * 0.95); g.stroke();
  }
  g.restore();
}

// ─── Tragamonedas «La cámara de la momia» ────────────────────────────────────
function buildSlots(spot) {
  const b = base(spot);
  const { W, D, group, detail } = b;
  const body = toon(0x4a3a5a);
  // el mueble: abajo hasta la repisa, la torre con la pantalla atrás y el cartel arriba
  group.add(box(W, 1.0, D, body, 0, 0.5, 0));
  group.add(box(W, 1.35, 0.5, body, 0, 1.0 + 0.675, -D / 2 + 0.25));
  group.add(box(W + 0.04, 0.06, D + 0.04, toon(0x2a1a2e), 0, 1.0, 0));
  for (const s of [-1, 1]) group.add(box(0.06, 1.4, 0.54, toon(0xf06aa8, { glow: 0.7 }), s * (W / 2 + 0.01), 1.68, -D / 2 + 0.25));
  const marquee = plane(W - 0.06, 0.32, labelMaterial('LA CÁMARA DE LA MOMIA', '#3a0a10', '#ffd23a', { w: 512, h: 160, size: 64 }), 0, 2.2, -D / 2 + 0.5);
  group.add(marquee, box(W, 0.36, 0.1, toon(0x8a1a2a), 0, 2.2, -D / 2 + 0.44));
  const reels = new Screen(W - 0.24, W - 0.24, 384, 384);
  reels.mesh.position.set(0, 1.62, -D / 2 + 0.525);
  group.add(reels.mesh, box(W - 0.16, W - 0.16, 0.04, toon(0x14101c), 0, 1.62, -D / 2 + 0.49));
  const strip = new Screen(W - 0.12, 0.13, 400, 54);
  strip.mesh.position.set(0, 1.12, -D / 2 + 0.525);
  group.add(strip.mesh);
  const pad = new Keypad(spot.id, 'slots');
  pad.group.position.set(W / 2 - 0.2, 1.06, D / 2 - 0.22);
  pad.group.rotation.x = 0.4;
  pad.group.scale.setScalar(1.1);
  detail.add(pad.group);
  const spin = bigButton(spot.id, 'a:play', 'GIRAR', 'green', 0.28, 0.16);
  spin.position.set(-W / 2 + 0.2, 1.05, D / 2 - 0.2);
  detail.add(spin);
  b.buttons.push(...pad.buttons, spin.userData.button);
  const IDLE = [0, 1, 2, 3, 0, 1, 2, 3, 0];
  return {
    ...b,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('slots', t, ctx.room, ctx.now);
      const grid = t?.grid || IDLE;
      const result = t && ph.played && !ph.running ? slotsEval(grid) : null;
      const hit = new Set(result ? result.hits.flatMap((h) => h.cells) : []);
      const frame = ph.running ? Math.floor(ph.elapsed / 70) : -1;
      reels.draw(`${grid.join()}|${frame}|${[...hit].join()}|${Math.floor(ctx.time * 3) % 2}`, (g, w, h) => {
        g.fillStyle = '#0a0e1c'; g.fillRect(0, 0, w, h);
        const cs = w / 3;
        for (let i = 0; i < 9; i++) {
          const col = i % 3; const row = Math.floor(i / 3);
          const stopAt = SLOTS_MS * (0.4 + col * 0.2);
          const spinning = ph.running && ph.elapsed < stopAt;
          const sym = spinning ? (Math.floor(ph.elapsed / 70) * 5 + i * 3) % 4 : grid[i];
          const yOff = spinning ? ((ph.elapsed / 3) % cs) - cs / 2 : 0;
          if (hit.has(i) && Math.floor(ctx.time * 3) % 2) { g.fillStyle = 'rgba(255,220,80,0.35)'; g.fillRect(col * cs, row * cs, cs, cs); }
          drawSymbol(g, SLOT_SYMBOLS[sym].id, col * cs + cs / 2, row * cs + cs / 2 + yOff * 0.15, cs * 0.92);
        }
      });
      const st = statusOf(ctx.ui, ctx, ctx.mine ? '' : ctx.who);
      strip.draw(`${st.text}|${st.tone}`, (g, w, h) => {
        g.fillStyle = '#14101c'; g.fillRect(0, 0, w, h);
        fitText(g, st.text, w / 2, h / 2 + 2, w - 16, 30, { font: DIGITS, color: { win: '#5aff7a', lose: '#ff6a6a', push: '#ffd27a' }[st.tone] || '#ffe6a0' });
      });
      pad.update(ctx);
      refreshButtons([spin.userData.button], ctx);
    },
  };
}

// ─── Ruedas en la pared (fortuna y dinero) ───────────────────────────────────
function wheelTexture(values, colors, label) {
  const s = 768; const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const n = values.length; const seg = (Math.PI * 2) / n;
  g.fillStyle = '#3a2418'; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < n; i++) {
    const a0 = -Math.PI / 2 + i * seg; const a1 = a0 + seg;
    g.fillStyle = colors(values[i], i);
    g.beginPath(); g.moveTo(s / 2, s / 2); g.arc(s / 2, s / 2, s * 0.47, a0, a1); g.closePath(); g.fill();
    g.strokeStyle = '#f4e6b0'; g.lineWidth = 3; g.stroke();
    g.save(); g.translate(s / 2, s / 2); g.rotate(a0 + seg / 2);
    fitText(g, label(values[i]), s * 0.33, 0, s * 0.2, n > 30 ? 26 : 44, { color: '#fff', stroke: 'rgba(0,0,0,0.5)', strokeW: 5 });
    g.restore();
  }
  for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i * seg; g.fillStyle = '#f0c33c'; g.beginPath(); g.arc(s / 2 + Math.cos(a) * s * 0.485, s / 2 + Math.sin(a) * s * 0.485, 6, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#f0c33c'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.08, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#8a1d2a'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.05, 0, Math.PI * 2); g.fill();
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const WHEEL_COLORS = { again: '#4a4a6a', 0: '#c8303a', 0.1: '#e8602a', 0.25: '#f0a030', 0.5: '#a8b83a', 2: '#4a8a8a', 3: '#5a6aa8', 5: '#b04a7a' };
const MW_COLORS = { 1: '#4a6be8', 2: '#f0c33c', 5: '#e0525a', 10: '#3ec85a', 20: '#b46bf0', joker: '#14101c', logo: '#f08a3c' };
const texes = {};

function wallWheel(spot, { values, colors, label, title }) {
  const b = base(spot);
  const { W, D, group } = b;
  const R = 0.82;
  const cy = 2.05; const cz = -D / 2 + 0.12;
  group.add(cyl(R + 0.1, R + 0.1, 0.1, toon(0x5a3420), 0, cy, cz - 0.03, 40));
  group.children[group.children.length - 1].rotation.x = Math.PI / 2;
  const bulbs = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; const bl = ball(0.025, toon(0xffe6a0, { glow: 1.2 }), Math.cos(a) * (R + 0.06), cy + Math.sin(a) * (R + 0.06), cz + 0.03, 6); bulbs.push(bl); group.add(bl); }
  texes[title] ||= wheelTexture(values, colors, label);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(R, 64), toon(0xffffff, { map: texes[title] }));
  disc.position.set(0, cy, cz + 0.035);
  group.add(disc);
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 3), toon(0xf0c33c));
  pointer.position.set(0, cy + R + 0.04, cz + 0.08);
  pointer.rotation.z = Math.PI;
  group.add(pointer, box(0.1, 2.2, 0.1, toon(0x5a3420), 0, 1.0, cz - 0.08));
  const sign = new Sign(title, 1.4, 0.46);
  sign.group.position.set(0, cy + R + 0.48, cz);
  group.add(sign.group);
  return { ...b, disc, bulbs, sign };
}

// Cuánto gira la rueda en cada giro (en grados, para la derecha) para que el casillero `i` quede abajo de la flecha.
function wheelPlan(spins, seg) {
  let from = 0;
  return spins.map((i) => {
    const target = ((-(i + 0.5) * seg) % 360 + 360) % 360;
    const to = from + 360 * 3 + ((target - (from % 360) + 360) % 360);
    const step = { from, to };
    from = to;
    return step;
  });
}

function buildWheel(spot) {
  const seg = 360 / WHEEL.length;
  const w = wallWheel(spot, { values: WHEEL, colors: (v) => WHEEL_COLORS[v], label: wheelLabel, title: 'RUEDA DE LA FORTUNA' });
  const p = podium(spot, w.group, w.detail, { w: w.W - 0.1, z: w.D / 2 - 0.25, actions: ACTIONS.wheel, rowX: -0.38, padX: 0.33 });
  w.buttons.push(...p.pad.buttons, ...p.row.buttons);
  return {
    ...w,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('wheel', t, ctx.room, ctx.now);
      let angle = 0;
      if (t?.spins && ph.played) {
        const steps = wheelPlan(t.spins, seg);
        if (!ph.running) angle = steps[steps.length - 1].to;
        else {
          const k = Math.min(steps.length - 1, Math.floor(ph.elapsed / WHEEL_SPIN_MS));
          const u = Math.max(0, Math.min(1, (ph.elapsed - k * WHEEL_SPIN_MS) / (WHEEL_SPIN_MS - 600)));
          angle = steps[k].from + (steps[k].to - steps[k].from) * ease(u);
        }
      }
      w.disc.rotation.z = -(angle * Math.PI) / 180;
      w.bulbs.forEach((bl, i) => { bl.visible = ph.running ? (Math.floor(ctx.time * 8) + i) % 2 === 0 : (Math.floor(ctx.time * 2) + i) % 4 !== 0; });
      p.pad.update(ctx);
      refreshButtons(p.row.buttons, ctx);
      w.sign.update(ctx, 'Otra vez = gira de nuevo');
    },
  };
}

function buildMwheel(spot) {
  const seg = 360 / MWHEEL.length;
  const w = wallWheel(spot, { values: MWHEEL, colors: (v) => MW_COLORS[v], label: (v) => (v === 'joker' ? '★' : v === 'logo' ? 'T' : v), title: 'RUEDA DEL DINERO' });
  const p = podium(spot, w.group, w.detail, { w: w.W - 0.1, z: w.D / 2 - 0.25, actions: ACTIONS.mwheel, rowX: -0.45, padX: 0.36 });
  const spots = MWHEEL_SPOTS.map((s, i) => {
    const bb = bigButton(spot.id, `w:${s}`, `${MWHEEL_NAMES[s]} ×${String(MWHEEL_PAYS[s]).replace('.', ',')}`, 'cream', 0.2, 0.09);
    bb.position.set(-0.7 + i * 0.215, 1.03, w.D / 2 - 0.25 - 0.13);
    bb.userData.button.material[0] = toon(new THREE.Color(MW_COLORS[s]).getHex());
    w.detail.add(bb);
    return bb.userData.button;
  });
  w.buttons.push(...p.pad.buttons, ...p.row.buttons, ...spots);
  return {
    ...w,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('mwheel', t, ctx.room, ctx.now);
      let angle = 0;
      if (t && ph.played && t.seg !== undefined) {
        const target = ((-(t.seg + 0.5) * seg) % 360 + 360) % 360;
        const total = 360 * 4 + target;
        const u = ph.running ? Math.max(0, Math.min(1, ph.elapsed / Math.max(1, t.ms - 500))) : 1;
        angle = total * ease(u);
      }
      w.disc.rotation.z = -(angle * Math.PI) / 180;
      w.bulbs.forEach((bl, i) => { bl.visible = ph.running ? (Math.floor(ctx.time * 8) + i) % 2 === 0 : (Math.floor(ctx.time * 2) + i) % 4 !== 0; });
      p.pad.update(ctx);
      refreshButtons([...p.row.buttons, ...spots], ctx);
      w.sign.update(ctx, `Elegido: ${MWHEEL_NAMES[t && ph.busy ? t.spot : ctx.ui.mspot]}`);
    },
  };
}

// ─── Crash ───────────────────────────────────────────────────────────────────
function buildCrash(spot) {
  const b = base(spot);
  const { W, D, group, detail } = b;
  const table = casinoTable(W, D, { felt: '#1a1438', rail: 0x2a2a3a, key: 'crash' });
  group.add(table.group);
  const screen = new Screen(1.7, 0.95, 680, 380);
  screen.mesh.position.set(0, 1.75, -D / 2 + 0.2);
  group.add(screen.mesh, box(1.82, 1.07, 0.08, toon(0x14101c), 0, 1.75, -D / 2 + 0.15), box(0.12, 1.3, 0.12, toon(0x2a2a3a), 0, 0.65, -D / 2 + 0.12));
  const pad = new Keypad(spot.id, 'crash');
  pad.group.position.set(W / 2 - 0.36, SURF + 0.09, D / 2 - 0.3);
  pad.group.rotation.x = 0.5;
  pad.group.scale.setScalar(1.3);
  const row = actionRow(spot.id, ACTIONS.crash, -0.35, 0.32);
  row.group.position.set(0, SURF + 0.03, D / 2 - 0.15);
  detail.add(pad.group, row.group);
  const sign = new Sign('CRASH', 1.2, 0.4, '#ff6a6a');
  sign.group.position.set(0, 2.55, -D / 2 + 0.15);
  group.add(sign.group);
  b.buttons.push(...pad.buttons, ...row.buttons);
  return {
    ...b,
    update(ctx) {
      const t = ctx.t;
      const running = t && t.bet > 0 && !t.res;
      const elapsed = running ? ctx.now - t.at : 0;
      const raw = running ? crashMultAt(elapsed) : 100;
      const crashed = running && raw >= t.point;
      const mult = running ? Math.min(raw, t.point) : t?.res === 'win' ? t.cash : t?.bet > 0 ? t.point : 100;
      const lost = t?.res === 'lose' || crashed;
      const money = running ? crashPay(t.bet, mult) : t?.res === 'win' ? t.pay : 0;
      screen.draw(`${mult}|${lost}|${money}|${t?.bet > 0}|${running ? Math.floor(elapsed / 50) : 0}`, (g, w, h) => {
        g.fillStyle = lost && t?.bet ? '#2a0a14' : '#0e0a24'; g.fillRect(0, 0, w, h);
        g.strokeStyle = '#2a2a50'; g.lineWidth = 2;
        for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, (i * h) / 6); g.lineTo(w, (i * h) / 6); g.stroke(); }
        const reach = t?.bet > 0 ? 1 - 1 / (1 + (mult - 100) / 250) : 0;
        g.strokeStyle = lost ? '#ff4a4a' : '#4ee06a'; g.lineWidth = 8; g.beginPath();
        let ex = 40; let ey = h - 40;
        for (let i = 0; i <= 60; i++) {
          const u = (i / 60) * reach;
          ex = 40 + u * (w - 120); ey = h - 40 - (u ** 1.8) * (h - 120);
          if (i === 0) g.moveTo(ex, ey); else g.lineTo(ex, ey);
        }
        g.stroke();
        if (t?.bet > 0) {
          g.save(); g.translate(ex, ey); g.rotate(-0.6);
          if (lost) { g.fillStyle = '#ffb03a'; for (let i = 0; i < 8; i++) { g.rotate(Math.PI / 4); g.fillRect(-4, 10, 8, 26); } g.fillStyle = '#ff4a4a'; g.beginPath(); g.arc(0, 0, 16, 0, Math.PI * 2); g.fill(); } else {
            g.fillStyle = '#ffb03a'; g.fillRect(-40, -6, 14 + Math.random() * 10, 12);
            g.fillStyle = '#f4f0e6'; roundRect(g, -28, -12, 46, 24, 10); g.fill();
            g.fillStyle = '#e0525a'; g.beginPath(); g.moveTo(18, -12); g.lineTo(34, 0); g.lineTo(18, 12); g.fill();
            g.fillStyle = '#4fd8e8'; g.beginPath(); g.arc(2, 0, 6, 0, Math.PI * 2); g.fill();
          }
          g.restore();
        }
        fitText(g, `${(mult / 100).toFixed(2)}x`, w / 2, 70, w - 60, 96, { font: DIGITS, color: lost && t?.bet ? '#ff5a5a' : '#ffffff', weight: '700' });
        if (t?.bet > 0) fitText(g, fmtMoney(money), w / 2, 140, w - 60, 40, { font: DIGITS, color: '#5aff7a' });
        if (lost && t?.bet) fitText(g, '¡CHOCÓ!', w / 2, h / 2 + 40, w - 60, 80, { color: '#ff5a5a' });
      });
      pad.update(ctx);
      refreshButtons(row.buttons, ctx);
      sign.update(ctx, running ? `Llevás ${fmtMoney(money)}` : '');
    },
  };
}

// ─── Plinko ──────────────────────────────────────────────────────────────────
function buildPlinko(spot) {
  const b = base(spot);
  const { W, D, group, detail } = b;
  const BW = 1.5; const BH = 1.75; const bz = -D / 2 + 0.35; const by0 = 0.95;
  group.add(box(BW + 0.16, BH + 0.16, 0.12, toon(0x2a1a4a), 0, by0 + BH / 2, bz - 0.07), box(BW + 0.2, 0.95, 0.4, toon(0x2a1a2e), 0, 0.475, bz));
  group.add(plane(BW, BH, toon(0x1a1238), 0, by0 + BH / 2, bz - 0.005));
  const DX = 0.15; const DY = 0.155; const top = by0 + BH - 0.2;
  const pegMat = toon(0xf4e6b0, { glow: 0.3 });
  for (let r = 0; r < PLINKO_ROWS; r++) for (let k = 0; k <= r; k++) {
    const peg = cyl(0.012, 0.012, 0.06, pegMat, (k - r / 2) * DX, top - r * DY, bz + 0.02, 8);
    peg.rotation.x = Math.PI / 2;
    group.add(peg);
  }
  const binY = top - PLINKO_ROWS * DY - 0.02;
  const bins = PLINKO_MULTS.map((m, i) => {
    const color = m >= 5 ? '#e0525a' : m >= 2 ? '#f08a3c' : m >= 1 ? '#f0c33c' : '#4a6be8';
    const mesh = plane(DX - 0.012, 0.11, labelMaterial(String(m).replace('.', ','), color, '#fff', { w: 128, h: 96, size: 54 }), (i - PLINKO_ROWS / 2) * DX, binY, bz + 0.02);
    group.add(mesh);
    return mesh;
  });
  const bl = ball(0.032, toon(0xff5aa8, { glow: 0.5 }), 0, top + 0.12, bz + 0.05, 14);
  group.add(bl);
  const p = podium(spot, group, detail, { w: W - 0.4, z: D / 2 - 0.25, actions: ACTIONS.plinko, rowX: -0.35, padX: 0.4 });
  const sign = new Sign('PLINKO', 1.3, 0.42, '#ff6ab8');
  sign.group.position.set(0, by0 + BH + 0.4, bz - 0.05);
  group.add(sign.group);
  b.buttons.push(...p.pad.buttons, ...p.row.buttons);
  const xAt = (path, r) => (path.slice(0, r).reduce((a, c) => a + c, 0) - r / 2) * DX;
  return {
    ...b,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('plinko', t, ctx.room, ctx.now);
      const path = t && ph.played ? t.path || [] : [];
      let x = 0; let y = top + 0.12;
      if (path.length) {
        const u = ph.running ? Math.min(1, ph.elapsed / Math.max(1, t.ms - 300)) : 1;
        const s = u * PLINKO_ROWS;
        const r = Math.min(PLINKO_ROWS - 1, Math.floor(s));
        const f = u >= 1 ? 1 : s - r;
        x = xAt(path, r) + (xAt(path, r + 1) - xAt(path, r)) * smooth(f);
        y = top - r * DY + 0.06 - DY * f + Math.sin(f * Math.PI) * 0.05;
        if (u >= 1) { x = xAt(path, PLINKO_ROWS); y = binY + 0.08; }
      }
      bl.position.set(x, y, bz + 0.05);
      bins.forEach((m, i) => { m.scale.setScalar(t && !ph.running && ph.played && t.bin === i ? 1 + Math.abs(Math.sin(ctx.time * 6)) * 0.25 : 1); });
      p.pad.update(ctx);
      refreshButtons(p.row.buttons, ctx);
      sign.update(ctx, 'Las puntas pagan ×9');
    },
  };
}

// ─── Cruce del pingüino ──────────────────────────────────────────────────────
function penguinModel() {
  const g = new THREE.Group();
  const bodyM = toon(0x1a1a2a);
  const body = ball(0.12, bodyM, 0, 0.13, 0, 16);
  body.scale.set(1, 1.25, 0.95);
  const belly = ball(0.095, toon(0xf4f4f0), 0, 0.12, 0.04, 14);
  belly.scale.set(0.9, 1.15, 0.8);
  const head = ball(0.08, bodyM, 0, 0.29, 0, 14);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.06, 6), toon(0xf0a03a));
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.28, 0.09);
  g.add(body, belly, head, beak);
  for (const s of [-1, 1]) {
    g.add(ball(0.02, toon(0xffffff), s * 0.03, 0.31, 0.065, 8), ball(0.01, toon(0x14101c), s * 0.03, 0.31, 0.083, 6));
    g.add(box(0.05, 0.015, 0.07, toon(0xf0a03a), s * 0.04, 0.008, 0.02));
    const wing = ball(0.05, bodyM, s * 0.11, 0.14, 0, 10);
    wing.scale.set(0.35, 1, 0.7);
    g.add(wing);
  }
  return g;
}

function buildPenguin(spot) {
  const b = base(spot);
  const { W, D, group, detail } = b;
  const table = casinoTable(W, D, { felt: '#1a3a6a', rail: 0x6a8aa8, key: 'penguin' });
  group.add(table.group);
  const water = plane(W - 0.4, 0.6, toon(0x2a8ad8, { glow: 0.25 }), 0, SURF + 0.003, -0.22);
  water.rotation.x = -Math.PI / 2;
  group.add(water);
  const xs = Array.from({ length: PENGUIN_CUBES }, (_, i) => -1.35 + i * 0.3);
  const cubes = xs.map((x, i) => {
    const c = box(0.2, 0.12, 0.2, toon(i === 0 ? 0xe8f4ff : 0xbde4ff), x, SURF + 0.06, -0.22);
    group.add(c);
    const tag = plane(0.22, 0.09, labelMaterial(i === 0 ? 'SALIDA' : fmtX(penguinMult(i)), '#1a3a6a', '#fff', { w: 160, h: 64, size: 40 }), x, SURF + 0.005, -0.42);
    tag.rotation.x = -Math.PI / 2;
    detail.add(tag);
    return c;
  });
  const peng = penguinModel();
  group.add(peng);
  const pad = new Keypad(spot.id, 'penguin');
  pad.group.position.set(W / 2 - 0.36, SURF + 0.09, D / 2 - 0.3);
  pad.group.rotation.x = 0.5;
  pad.group.scale.setScalar(1.3);
  const row = actionRow(spot.id, ACTIONS.penguin, -0.5, 0.3);
  row.group.position.set(0, SURF + 0.03, D / 2 - 0.15);
  detail.add(pad.group, row.group);
  const sign = new Sign(NAMES.penguin.toUpperCase(), 1.5, 0.5, '#7ad4ff');
  sign.group.position.set(0, 2.2, -D / 2 - 0.05);
  group.add(sign.group);
  b.buttons.push(...pad.buttons, ...row.buttons);
  let from = 0; let to = 0; let moveAt = -9; let lastKey = '';
  return {
    ...b,
    update(ctx) {
      const t = ctx.t;
      const fell = t?.res === 'fall';
      const pos = t?.bet > 0 ? (fell ? t.pos + 1 : t.pos) : 0;
      const key = `${t?.n}|${pos}|${t?.res}|${t?.at}`;
      if (key !== lastKey) { from = to; to = pos; moveAt = ctx.time; lastKey = key; }
      const u = Math.min(1, (ctx.time - moveAt) / 0.45);
      const x = xs[from] + (xs[Math.min(to, xs.length - 1)] - xs[from]) * smooth(u);
      let y = SURF + 0.12 + Math.sin(u * Math.PI) * 0.18;
      if (fell && u >= 1) y = SURF + 0.12 - Math.min(0.25, (ctx.time - moveAt - 0.45) * 0.6);
      peng.position.set(x, y, -0.22);
      peng.rotation.y = -Math.PI / 2 + 0.3 + Math.sin(ctx.time * 2) * 0.1;
      peng.visible = !(fell && ctx.time - moveAt > 1.4);
      water.material = toon(0x2a8ad8, { glow: 0.25 + Math.sin(ctx.time * 2) * 0.05 });
      cubes.forEach((c, i) => { c.position.y = SURF + 0.06 + (fell && i === to && u >= 1 ? -0.1 : Math.sin(ctx.time * 1.5 + i) * 0.006); });
      pad.update(ctx);
      refreshButtons(row.buttons, ctx);
      sign.update(ctx, 'Cada salto: 50 % · ×1,5');
    },
  };
}

// ─── Carrera de patos ────────────────────────────────────────────────────────
const DUCK_COLORS = ['#f6d640', '#f08ab8', '#6ab4f0', '#7ad46a'];
function duckModel(color) {
  const g = new THREE.Group();
  const m = toon(new THREE.Color(color).getHex());
  g.add(box(0.11, 0.08, 0.08, m, 0, 0.05, 0), box(0.06, 0.07, 0.06, m, 0.04, 0.12, 0), box(0.04, 0.02, 0.03, toon(0xf0a03a), 0.085, 0.12, 0), box(0.03, 0.03, 0.05, m, -0.06, 0.08, 0));
  for (const s of [-1, 1]) g.add(box(0.012, 0.012, 0.005, toon(0x14101c), 0.06, 0.135, s * 0.031));
  return g;
}
const progress = (times, i, ms) => {
  const u = Math.max(0, Math.min(1, ms / times[i]));
  return u + 0.035 * Math.sin(u * Math.PI * (4 + i)) * (1 - u) * 2;
};

function buildDuck(spot) {
  const b = base(spot);
  const { W, D, group, detail } = b;
  const table = casinoTable(W, D, { felt: '#2a1a1a', rail: 0x7a2a2a, key: 'duck' });
  group.add(table.group);
  const x0 = -1.15; const x1 = 0.95; const laneW = 0.13; const z0 = -0.62;
  const track = new THREE.Group();
  track.add(box(x1 - x0 + 0.3, 0.06, laneW * 4 + 0.16, toon(0x5a3a2a), (x0 + x1) / 2, SURF + 0.03, z0 + laneW * 2));
  DUCK_COLORS.forEach((c, i) => track.add(box(x1 - x0 + 0.2, 0.012, laneW - 0.015, toon(new THREE.Color(c).multiplyScalar(0.55).getHex()), (x0 + x1) / 2, SURF + 0.066, z0 + laneW * (i + 0.5))));
  for (let i = 0; i < 8; i++) track.add(box(0.025, 0.014, laneW * 4 / 8, toon(i % 2 ? 0xffffff : 0x14101c), x1 + 0.02, SURF + 0.074, z0 + (i + 0.5) * (laneW * 4 / 8)));
  for (let i = 0; i < 14; i++) for (const zz of [z0 - 0.06, z0 + laneW * 4 + 0.06]) track.add(ball(0.018, toon(i % 2 ? 0xffe27a : 0x5aff7a, { glow: 0.6 }), x0 - 0.1 + i * ((x1 - x0 + 0.2) / 13), SURF + 0.08, zz, 6));
  group.add(track);
  // el granero con el cartel, a la izquierda (como en el original)
  group.add(box(0.5, 0.55, 0.6, toon(0x8a2a2a), x0 - 0.25, SURF + 0.3, z0 + laneW * 2), box(0.56, 0.06, 0.66, toon(0xf4e6d0), x0 - 0.25, SURF + 0.6, z0 + laneW * 2));
  const ducks = DUCK_COLORS.map((c, i) => { const d = duckModel(c); d.position.set(x0, SURF + 0.07, z0 + laneW * (i + 0.5)); group.add(d); return d; });
  const picks = DUCKS.map((name, i) => {
    const bb = bigButton(spot.id, `d:${i}`, name.toUpperCase(), 'cream', 0.22, 0.1);
    bb.userData.button.material[0] = toon(new THREE.Color(DUCK_COLORS[i]).getHex());
    bb.position.set(-0.95 + i * 0.25, SURF + 0.03, 0.2);
    detail.add(bb);
    return bb.userData.button;
  });
  const pad = new Keypad(spot.id, 'duck');
  pad.group.position.set(W / 2 - 0.36, SURF + 0.09, D / 2 - 0.3);
  pad.group.rotation.x = 0.5;
  pad.group.scale.setScalar(1.3);
  const row = actionRow(spot.id, ACTIONS.duck, -0.6, 0.3);
  row.group.position.set(0, SURF + 0.03, D / 2 - 0.15);
  detail.add(pad.group, row.group);
  const sign = new Sign('CARRERA DE PATOS', 1.6, 0.52, '#f08a3c');
  sign.group.position.set(-0.4, 2.2, -D / 2 - 0.05);
  group.add(sign.group);
  b.buttons.push(...pad.buttons, ...row.buttons, ...picks);
  return {
    ...b,
    update(ctx) {
      const t = ctx.t;
      const ph = phaseOf('duck', t, ctx.room, ctx.now);
      const ms = t && ph.played ? (ph.running ? ph.elapsed : Infinity) : 0;
      ducks.forEach((d, i) => {
        const p = t && ph.played && t.times ? Math.min(1, progress(t.times, i, ms)) : 0;
        d.position.x = x0 + (x1 - x0) * p;
        d.position.y = SURF + 0.07 + (ph.running ? Math.abs(Math.sin(ctx.time * 14 + i)) * 0.025 : 0);
        d.rotation.z = ph.running ? Math.sin(ctx.time * 14 + i) * 0.12 : 0;
        const won = t && ph.played && !ph.running && t.win === i;
        d.scale.setScalar(won ? 1.25 + Math.abs(Math.sin(ctx.time * 5)) * 0.15 : 1);
      });
      pad.update(ctx);
      refreshButtons([...row.buttons, ...picks], ctx);
      sign.update(ctx, `Paga ×3,8 · Elegido: ${DUCKS[t && (ph.busy || ph.shown) && Number.isInteger(t.pick) ? t.pick : ctx.ui.pick]}`);
    },
  };
}

const MACHINES = { slots: buildSlots, wheel: buildWheel, mwheel: buildMwheel, crash: buildCrash, plinko: buildPlinko, penguin: buildPenguin, duck: buildDuck };
export function buildMachine(spot) {
  return MACHINES[spot.kind](spot);
}
