// Arena Royale: el dibujo de la arena en un canvas 2D. Es solo dibujo (no toca el estado de la partida), así que acá
// sí se puede usar trigonometría y animaciones. Cada carta se arma con formas simples según su `look` (cards.js,
// descrito en docs/ARENA.md): cuerpo redondo, cabeza más chica, y el detalle que la distingue.
import { CARD_BY_ID } from './cards.js';
import { BAND, BRIDGES, BRIDGE_HALF, H, RIVER_Y, W } from './sim.js';

export const CELL = 28;                 // píxeles del canvas por casilla
export const TEAM_COLORS = ['#3b82f6', '#ef4444'];
const TEAM_DARK = ['#1e4fa8', '#a32121'];

// El que juega en el equipo 1 ve la arena dada vuelta, para tener siempre su lado abajo.
export const toView = (flip, x, y) => (flip ? [W - x, H - y] : [x, y]);
export const fromView = (flip, x, y) => (flip ? [W - x, H - y] : [x, y]);

function disc(ctx, x, y, r, fill, stroke) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function tri(ctx, ax, ay, bx, by, cx, cy, fill) {
  ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.lineTo(cx, cy); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill();
}

function line(ctx, x1, y1, x2, y2, color, width) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
}

// ─── Terreno ─────────────────────────────────────────────────────────────────
function drawTerrain(ctx, o) {
  const S = CELL;
  const { flip } = o;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      ctx.fillStyle = (x + y) % 2 ? '#6fae4f' : '#79b857';
      ctx.fillRect(x * S, y * S, S + 1, S + 1);
    }
  }
  // senderos hacia los puentes
  ctx.fillStyle = 'rgba(214, 190, 130, 0.55)';
  for (const bx of BRIDGES) {
    const [vx] = toView(flip, bx - BRIDGE_HALF, 0);
    const [vx2] = toView(flip, bx + BRIDGE_HALF, 0);
    ctx.fillRect(Math.min(vx, vx2) * S, 5 * S, Math.abs(vx2 - vx) * S, (H - 10) * S);
  }
  // río
  const top = (RIVER_Y - BAND) * S;
  const grad = ctx.createLinearGradient(0, top, 0, top + 2 * BAND * S);
  grad.addColorStop(0, '#3c8fd6'); grad.addColorStop(0.5, '#56a8ea'); grad.addColorStop(1, '#3c8fd6');
  ctx.fillStyle = grad;
  ctx.fillRect(0, top, W * S, 2 * BAND * S);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  for (let i = 0; i < 9; i++) {
    const x = ((i * 2.1 + (o.time * 0.6) % 2.1) % W) * S;
    ctx.beginPath(); ctx.moveTo(x, top + S * 0.7); ctx.quadraticCurveTo(x + S * 0.5, top + S * 0.35, x + S, top + S * 0.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + S, top + S * 1.5); ctx.quadraticCurveTo(x + S * 1.5, top + S * 1.15, x + S * 2, top + S * 1.5); ctx.stroke();
  }
  // puentes
  for (const bx of BRIDGES) {
    const [vx] = toView(flip, bx - BRIDGE_HALF, 0);
    const [vx2] = toView(flip, bx + BRIDGE_HALF, 0);
    const left = Math.min(vx, vx2) * S;
    const width = Math.abs(vx2 - vx) * S;
    ctx.fillStyle = '#a9743c'; ctx.fillRect(left, top - 4, width, 2 * BAND * S + 8);
    ctx.fillStyle = '#8f5f2e';
    for (let i = 0; i < 6; i++) ctx.fillRect(left, top - 4 + i * ((2 * BAND * S + 8) / 6), width, 2);
    ctx.fillStyle = '#5e3d1c'; ctx.fillRect(left, top - 4, 4, 2 * BAND * S + 8); ctx.fillRect(left + width - 4, top - 4, 4, 2 * BAND * S + 8);
  }
}

// La mitad (o el bolsillo) donde se puede poner una tropa, mientras se elige una carta.
function drawZone(ctx, st, o) {
  const S = CELL;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  const team = o.team;
  const yMin = team === 0 ? RIVER_Y + BAND + 0.5 : 0;
  const yMax = team === 0 ? H : RIVER_Y - BAND - 0.5;
  const rect = (x0, y0, x1, y1) => {
    const [ax, ay] = toView(o.flip, x0, y0);
    const [bx, by] = toView(o.flip, x1, y1);
    ctx.fillRect(Math.min(ax, bx) * S, Math.min(ay, by) * S, Math.abs(bx - ax) * S, Math.abs(by - ay) * S);
  };
  rect(0, yMin, W, yMax);
  for (const side of [0, 1]) {
    const down = st.towers.find((t) => t.team === 1 - team && t.kind === 'princess' && t.side === side)?.dead;
    if (!down) continue;
    const x0 = side === 0 ? 0 : W / 2;
    if (team === 0) rect(x0, RIVER_Y - 5, x0 + W / 2, RIVER_Y - BAND - 0.5); else rect(x0, RIVER_Y + BAND + 0.5, x0 + W / 2, RIVER_Y + 5);
  }
}

// ─── Torres ──────────────────────────────────────────────────────────────────
function hpBar(ctx, x, y, w, ratio, color) {
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, 6);
  ctx.fillStyle = color; ctx.fillRect(x - w / 2, y, Math.max(0, w * ratio), 4);
}

function drawTower(ctx, tw, o) {
  const S = CELL;
  const [vx, vy] = toView(o.flip, tw.x, tw.y);
  const x = vx * S;
  const y = vy * S;
  const r = tw.r * S;
  if (tw.dead) {
    disc(ctx, x, y, r * 0.8, '#6b6458'); disc(ctx, x - 6, y + 3, r * 0.3, '#857d6f'); disc(ctx, x + 8, y - 4, r * 0.25, '#4f4a40');
    return;
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.85, r * 1.05, r * 0.4, 0, 0, Math.PI * 2); ctx.fill();
  const king = tw.kind === 'king';
  ctx.fillStyle = king ? '#9a9486' : '#a8b0bd';
  ctx.beginPath(); ctx.roundRect(x - r * 0.85, y - r * 0.7, r * 1.7, r * 1.55, 6); ctx.fill();
  ctx.fillStyle = TEAM_DARK[tw.team];
  ctx.fillRect(x - r * 0.85, y - r * 0.15, r * 1.7, r * 0.3);
  ctx.fillStyle = king ? '#b9b3a4' : '#c4cbd6';
  for (let i = 0; i < 4; i++) ctx.fillRect(x - r * 0.85 + i * (r * 1.7 / 4) + 1, y - r * 0.95, r * 1.7 / 4 - 3, r * 0.3); // almenas
  ctx.fillStyle = TEAM_COLORS[tw.team];
  ctx.beginPath(); ctx.arc(x, y + r * 0.2, r * 0.42, Math.PI, 0); ctx.fill(); // puerta
  if (king) {
    ctx.fillStyle = '#f5c518';
    ctx.beginPath(); ctx.moveTo(x - r * 0.5, y - r * 1.0); ctx.lineTo(x - r * 0.5, y - r * 1.55); ctx.lineTo(x - r * 0.2, y - r * 1.25); ctx.lineTo(x, y - r * 1.7);
    ctx.lineTo(x + r * 0.2, y - r * 1.25); ctx.lineTo(x + r * 0.5, y - r * 1.55); ctx.lineTo(x + r * 0.5, y - r * 1.0); ctx.closePath(); ctx.fill();
    if (!tw.awake) { ctx.font = `${S * 0.7}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('💤', x + r * 0.9, y - r * 0.9); }
  }
  hpBar(ctx, x, y - r * 1.15 - (king ? r * 0.7 : 0), r * 1.9, tw.hp / tw.max, TEAM_COLORS[tw.team]);
  ctx.font = `bold ${S * 0.42}px sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
  const label = String(Math.ceil(tw.hp));
  const ty = y - r * 1.15 - (king ? r * 0.7 : 0) - 3;
  ctx.strokeText(label, x, ty); ctx.fillText(label, x, ty);
}

// ─── Tropas ──────────────────────────────────────────────────────────────────
function weapon(ctx, kind, x, y, s, swing, face) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swing);
  const f = face;
  switch (kind) {
    case 'sword': line(ctx, 0, 0, f * 0.2 * s, -1.5 * s, '#e4e8ee', 3); line(ctx, -f * 0.3 * s, -0.25 * s, f * 0.3 * s, -0.25 * s, '#c9a227', 3); break;
    case 'dagger': line(ctx, 0, 0, 0, -0.8 * s, '#f0d34a', 3); break;
    case 'bow': ctx.beginPath(); ctx.arc(0, -0.3 * s, 0.9 * s, -1.2, 1.2); ctx.strokeStyle = '#8a5a2b'; ctx.lineWidth = 3; ctx.stroke(); line(ctx, 0.5 * s, -1.05 * s, 0.5 * s, 0.45 * s, '#ddd', 1); break;
    case 'gun': line(ctx, -0.2 * s, 0, f * 1.4 * s, -0.5 * s, '#5a3b1e', 4); line(ctx, f * 0.9 * s, -0.35 * s, f * 1.7 * s, -0.6 * s, '#444', 2.5); break;
    case 'axe': line(ctx, 0, 0.3 * s, 0, -1.4 * s, '#7a4b22', 3); tri(ctx, 0, -1.4 * s, -0.7 * s, -1.0 * s, 0, -0.7 * s, '#d8dde5'); tri(ctx, 0, -1.4 * s, 0.7 * s, -1.0 * s, 0, -0.7 * s, '#d8dde5'); break;
    case 'hammer': line(ctx, 0, 0.3 * s, 0, -1.2 * s, '#7a4b22', 3); ctx.fillStyle = '#9aa0aa'; ctx.fillRect(-0.45 * s, -1.6 * s, 0.9 * s, 0.6 * s); break;
    case 'lance': line(ctx, 0, 0.5 * s, 0, -2.2 * s, '#caa24a', 3); tri(ctx, 0, -2.2 * s, 0.7 * s, -1.95 * s, 0, -1.7 * s, '#e0443a'); break;
    case 'wand': line(ctx, 0, 0.2 * s, 0.1 * s, -1.2 * s, '#7a4b22', 3); disc(ctx, 0.1 * s, -1.3 * s, 0.28 * s, '#ff9a2e'); break;
    case 'fists': disc(ctx, 0, -0.2 * s, 0.45 * s, '#e8a05a'); break;
    default: break;
  }
  ctx.restore();
}

// Cuánto hace que `u` pegó (en pasos), para el gesto del arma.
function sinceHit(st, u) {
  let best = Infinity;
  for (const e of st.ev) if (e.k === 'hit' && e.u === u.id) best = Math.min(best, st.tick - e.t);
  return best;
}

function drawChibi(ctx, st, u, d, x, y, o) {
  const look = d.look || {};
  const S = CELL;
  const r = u.r * S;
  const t = o.time;
  const fly = d.fly;
  const bob = Math.sin(t * 6 + u.id) * (fly ? 3 : 1.2);
  const face = u.team === o.team ? 1 : -1; // todos miran hacia arriba en pantalla; el arma va al costado
  const sinceH = sinceHit(st, u);
  const swing = sinceH < 5 ? Math.sin((sinceH / 5) * Math.PI) * 1.1 : 0;
  const by = y + bob;

  if (look.balloon) {
    const bx = x;
    const by2 = by - r * 1.5;
    line(ctx, bx - r * 0.6, by2 + r * 0.7, bx - r * 0.3, by + r * 0.3, '#7a4b22', 1.5);
    line(ctx, bx + r * 0.6, by2 + r * 0.7, bx + r * 0.3, by + r * 0.3, '#7a4b22', 1.5);
    ctx.fillStyle = '#7a4b22'; ctx.fillRect(bx - r * 0.35, by + r * 0.2, r * 0.7, r * 0.45);
    disc(ctx, bx, by + r * 0.95, r * 0.28, '#222');
    ctx.fillStyle = look.body; ctx.beginPath(); ctx.ellipse(bx, by2, r * 0.95, r * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(bx - r * 0.3, by2 - r * 0.3, r * 0.25, r * 0.4, -0.5, 0, Math.PI * 2); ctx.fill();
    disc(ctx, bx, by2 + r * 0.05, r * 0.38, look.head); disc(ctx, bx - r * 0.14, by2, r * 0.08, '#222'); disc(ctx, bx + r * 0.14, by2, r * 0.08, '#222');
    return;
  }

  if (look.mount) { // caballo o jabalí
    ctx.fillStyle = look.mount;
    ctx.beginPath(); ctx.ellipse(x, by + r * 0.25, r * 0.95, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
    disc(ctx, x, by - r * 0.55, r * 0.4, look.mount);
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(x - r * 0.7, by + r * 0.55, r * 0.22, r * 0.45 + Math.sin(t * 10 + u.id) * 2);
    ctx.fillRect(x + r * 0.48, by + r * 0.55, r * 0.22, r * 0.45 - Math.sin(t * 10 + u.id) * 2);
  }
  if (look.wings) {
    const flap = Math.sin(t * 14 + u.id) * 0.5;
    ctx.fillStyle = look.wings;
    ctx.beginPath(); ctx.ellipse(x - r * 0.95, by - r * 0.2, r * 0.7, r * 0.3, -0.5 + flap, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + r * 0.95, by - r * 0.2, r * 0.7, r * 0.3, 0.5 - flap, 0, Math.PI * 2); ctx.fill();
  }
  if (look.bigHair) disc(ctx, x, by - r * 0.7, r * 0.85, look.hair);
  // cuerpo y cabeza
  disc(ctx, x, by, r * 0.85, look.body, 'rgba(0,0,0,0.35)');
  if (look.belly) { ctx.fillStyle = look.belly; ctx.beginPath(); ctx.ellipse(x, by + r * 0.1, r * 0.45, r * 0.55, 0, 0, Math.PI * 2); ctx.fill(); }
  if (look.belt) { ctx.fillStyle = look.belt; ctx.fillRect(x - r * 0.8, by + r * 0.15, r * 1.6, r * 0.22); }
  const hy = by - r * 0.7;
  if (look.ears) { tri(ctx, x - r * 0.4, hy, x - r * 1.0, hy - r * 0.35, x - r * 0.4, hy - r * 0.3, look.head); tri(ctx, x + r * 0.4, hy, x + r * 1.0, hy - r * 0.35, x + r * 0.4, hy - r * 0.3, look.head); }
  if (look.hair && !look.bigHair) disc(ctx, x, hy - r * 0.12, r * 0.58, look.hair);
  disc(ctx, x, hy, r * 0.5, look.head || look.body, 'rgba(0,0,0,0.3)');
  if (look.beard) { ctx.fillStyle = look.beard; ctx.beginPath(); ctx.ellipse(x, hy + r * 0.32, r * 0.48, r * 0.36, 0, 0, Math.PI * 2); ctx.fill(); }
  if (look.mustache) { ctx.fillStyle = look.mustache; ctx.beginPath(); ctx.ellipse(x, hy + r * 0.18, r * 0.42, r * 0.13, 0, 0, Math.PI * 2); ctx.fill(); }
  disc(ctx, x - r * 0.17, hy - r * 0.03, r * 0.08, look.eyes || '#222'); disc(ctx, x + r * 0.17, hy - r * 0.03, r * 0.08, look.eyes || '#222');
  if (look.hat === 'helmet') { ctx.fillStyle = look.hatColor; ctx.beginPath(); ctx.arc(x, hy - r * 0.05, r * 0.55, Math.PI, 0); ctx.fill(); }
  if (look.hat === 'pointed') tri(ctx, x - r * 0.6, hy - r * 0.15, x + r * 0.6, hy - r * 0.15, x + r * 0.1, hy - r * 1.3, look.hatColor);
  if (look.hat === 'horns') { tri(ctx, x - r * 0.45, hy - r * 0.25, x - r * 0.2, hy - r * 0.3, x - r * 0.65, hy - r * 0.95, look.hatColor); tri(ctx, x + r * 0.45, hy - r * 0.25, x + r * 0.2, hy - r * 0.3, x + r * 0.65, hy - r * 0.95, look.hatColor); }
  weapon(ctx, look.weapon, x + r * 0.95 * face, by + r * 0.1, r * 0.8, swing * face, face);
}

function drawUnit(ctx, st, u, o) {
  const d = CARD_BY_ID[u.card];
  const S = CELL;
  const [vx, vy] = toView(o.flip, u.x, u.y);
  const x = vx * S;
  const y = vy * S;
  const r = u.r * S;
  const ghost = u.wait > 0;
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.55;
  // sombra y aro del equipo
  const lift = d.fly ? r * 1.1 : 0;
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(x, y + r * 0.7, r * 0.9, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = TEAM_COLORS[u.team]; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.ellipse(x, y + r * 0.6, r * 1.05, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
  if (u.bld) drawBuilding(ctx, st, u, d, x, y, o);
  else drawChibi(ctx, st, u, d, x, y - lift, o);
  ctx.restore();
  if (u.stun > 0) { ctx.font = `${S * 0.6}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('💫', x, y - r * 2.2 - lift); }
  if (d.charge && u.charge >= d.charge) { ctx.font = `${S * 0.5}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('💨', x, y + r * 0.9); }
  if (u.hp < u.max || u.bld) hpBar(ctx, x, y - r * 1.9 - lift, Math.max(r * 1.6, 22), Math.max(0, u.hp / u.max), TEAM_COLORS[u.team]);
}

function drawBuilding(ctx, st, u, d, x, y, o) {
  const S = CELL;
  const r = u.r * S;
  const look = d.look;
  ctx.fillStyle = look.base; ctx.beginPath(); ctx.roundRect(x - r, y - r * 0.2, r * 2, r * 0.95, 5); ctx.fill();
  disc(ctx, x - r * 0.65, y + r * 0.7, r * 0.3, '#3a2a1a'); disc(ctx, x + r * 0.65, y + r * 0.7, r * 0.3, '#3a2a1a');
  const tg = u.tg ? [...st.units, ...st.towers].find((e) => e.id === u.tg) : null;
  let ang = -Math.PI / 2;
  if (tg) { const [tx, ty] = toView(o.flip, tg.x, tg.y); ang = Math.atan2(ty * S - y, tx * S - x); }
  ctx.save();
  ctx.translate(x, y - r * 0.3);
  ctx.rotate(ang);
  ctx.fillStyle = look.body;
  if (look.weapon === 'cannon') { ctx.fillRect(0, -r * 0.28, r * 1.3, r * 0.56); disc(ctx, 0, 0, r * 0.5, look.body, '#111'); }
  else { ctx.fillRect(-r * 0.1, -r * 0.4, r * 1.2, r * 0.8); ctx.fillStyle = '#4b463d'; ctx.fillRect(r * 1.0, -r * 0.5, r * 0.3, r); }
  ctx.restore();
}

// ─── Efectos ─────────────────────────────────────────────────────────────────
function drawEffects(ctx, st, o) {
  const S = CELL;
  const frac = o.frac;
  for (const f of st.fx) { // hechizos que todavía no cayeron
    const [vx, vy] = toView(o.flip, f.x, f.y);
    const x = vx * S;
    const y = vy * S;
    const total = Math.max(1, f.at - f.t0);
    const k = Math.min(1, (st.tick - f.t0 + frac) / total);
    ctx.strokeStyle = f.style === 'zap' ? 'rgba(160,230,255,0.9)' : 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2; ctx.setLineDash([6, 5]);
    ctx.beginPath(); ctx.arc(x, y, f.r * S, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    if (f.style === 'fire') { disc(ctx, x, y - (1 - k) * S * 9, S * 0.55, '#ff9a2e'); disc(ctx, x, y - (1 - k) * S * 9, S * 0.3, '#ffe28a'); }
    if (f.style === 'arrows') for (let i = 0; i < 9; i++) { const ax = x + ((i * 37) % 11 - 5) * f.r * S / 6; const ay = y + ((i * 53) % 11 - 5) * f.r * S / 6 - (1 - k) * S * 8; line(ctx, ax, ay, ax - 1, ay - S * 0.7, '#e8c65a', 2); }
    if (f.style === 'bomb') disc(ctx, x, y - (1 - k) * S * 3, S * 0.3, '#222');
  }
  for (const e of st.ev) {
    const age = st.tick - e.t + frac;
    const [vx, vy] = toView(o.flip, e.x, e.y);
    const x = vx * S;
    const y = vy * S;
    if (e.k === 'boom') {
      const k = Math.min(1, age / 8);
      ctx.globalAlpha = 1 - k;
      if (e.style === 'zap') {
        ctx.strokeStyle = '#bff0ff'; ctx.lineWidth = 3;
        for (let i = 0; i < 6; i++) { const a = i * 1.047 + 0.3; const x2 = x + Math.cos(a) * e.r * S * (0.4 + k * 0.6); const y2 = y + Math.sin(a) * e.r * S * (0.4 + k * 0.6); line(ctx, x, y, x2, y2, '#bff0ff', 3); }
        disc(ctx, x, y, e.r * S * (0.3 + k * 0.7), 'rgba(160,230,255,0.25)');
      } else if (e.style === 'arrows') {
        disc(ctx, x, y, e.r * S, 'rgba(232,198,90,0.18)');
        for (let i = 0; i < 9; i++) { const ax = x + ((i * 37) % 11 - 5) * e.r * S / 6; const ay = y + ((i * 53) % 11 - 5) * e.r * S / 6; line(ctx, ax, ay, ax - 1, ay - S * 0.5, '#e8c65a', 2); }
      } else {
        disc(ctx, x, y, e.r * S * (0.35 + k * 0.65), e.style === 'bomb' ? 'rgba(255,140,40,0.7)' : 'rgba(255,150,40,0.75)');
        disc(ctx, x, y, e.r * S * (0.2 + k * 0.4), 'rgba(255,230,140,0.85)');
      }
      ctx.globalAlpha = 1;
    } else if (e.k === 'hit') {
      const [tx, ty] = toView(o.flip, e.x2, e.y2);
      const ranged = Math.abs(e.x - e.x2) + Math.abs(e.y - e.y2) > 1.8 || e.c === 'princess' || e.c === 'king';
      if (ranged && age < 4) {
        const k = age / 4;
        const px = x + (tx * S - x) * k;
        const py = y + (ty * S - y) * k;
        const color = e.c === 'mago' || e.c === 'bebe-dragon' ? '#ff8a2e' : e.c === 'mortero' ? '#555' : e.c === 'princess' || e.c === 'king' ? '#fff3a8' : '#e8d9a8';
        disc(ctx, px, py, e.c === 'mortero' ? 5 : 3.5, color);
      } else if (!ranged && age < 3) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(tx * S, ty * S, S * 0.45 + age * 3, 0.3, 2.6); ctx.stroke();
      }
    } else if (e.k === 'die') {
      const k = Math.min(1, age / 10);
      ctx.globalAlpha = 1 - k;
      disc(ctx, x - 5, y - k * 10, 6 + k * 8, '#d8d8d8'); disc(ctx, x + 6, y - k * 6, 5 + k * 6, '#bdbdbd');
      ctx.globalAlpha = 1;
    } else if (e.k === 'tdie') {
      const k = Math.min(1, age / 10);
      ctx.globalAlpha = 1 - k;
      disc(ctx, x, y, S * (1.5 + k * 2.5), 'rgba(255,150,40,0.7)'); disc(ctx, x, y, S * (0.8 + k * 1.2), 'rgba(255,235,150,0.85)');
      ctx.globalAlpha = 1;
    } else if (e.k === 'put') {
      const k = Math.min(1, age / 8);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = TEAM_COLORS[e.team]; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, S * (0.5 + k * 1.3), 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// ─── Todo junto ──────────────────────────────────────────────────────────────
// `o`: { flip, team, time (segundos), frac (0..1 entre pasos), hover: {x,y} | null, card: carta elegida | null, valid: bool }
export function draw(ctx, st, o) {
  const S = CELL;
  ctx.clearRect(0, 0, W * S, H * S);
  drawTerrain(ctx, o);
  if (o.card && o.card.kind !== 'spell') drawZone(ctx, st, o);
  for (const tw of st.towers) drawTower(ctx, tw, o);
  const sorted = [...st.units].sort((a, b) => (CARD_BY_ID[a.card].fly ? 1 : 0) - (CARD_BY_ID[b.card].fly ? 1 : 0) || (o.flip ? b.y - a.y : a.y - b.y) || a.id - b.id);
  for (const u of sorted) drawUnit(ctx, st, u, o);
  drawEffects(ctx, st, o);
  if (o.card && o.hover) { // la carta que vas a poner, en el lugar del mouse
    const [vx, vy] = toView(o.flip, o.hover.x, o.hover.y);
    const radius = (o.card.kind === 'spell' ? o.card.radius : Math.max(o.card.radius, 0.6)) * S;
    ctx.fillStyle = o.valid ? 'rgba(80,220,120,0.3)' : 'rgba(240,70,70,0.3)';
    ctx.strokeStyle = o.valid ? 'rgba(80,220,120,0.95)' : 'rgba(240,70,70,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(vx * S, vy * S, radius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.font = `${S * 0.9}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(o.card.emoji, vx * S, vy * S);
    ctx.textBaseline = 'alphabetic';
  }
}
