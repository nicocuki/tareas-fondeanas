// La partida de Cubolandia en tiempo real: dibujo, teclado y mouse, el inventario y la conexión.
//
// Mismo esquema que Pixel Royale: cada pantalla es dueña de su jugador (lo mueve, decide cuánto daño
// le hacen y avisa a la sala cuando muere) y manda su foto directo a los demás (WebRTC) o, si no se
// puede, por el servidor. El mundo sale de la semilla en cada pantalla; lo que cambia (bloques rotos y
// puestos) viaja como eventos `ed` en las fotos, con la hora de cada cambio: gana el más nuevo. Además
// cada pantalla va repartiendo de a pedazos todo lo que sabe (`cs`), así el que se atrasa o recarga la
// página se pone al día. Los golpes entre jugadores los juzga la pantalla de la víctima. Los animales y
// los zombis los corre la pantalla del anfitrión (`mb`).
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import {
  ARMOR_SLOT_NAMES, B, BLOCKS, FUEL, HOTBAR, ITEMS, RECIPES, SMELT, SMELT_COST, SMELT_TIME, addItem, breakInfo, canCraft, count, craft, dropOf, itemName, maxStack, removeItem,
} from './blocks.js';
import { H, SEA, W, animalSpawns, at, makeWorld, spawnPoint } from './world.js';
import {
  ATTACK_GAP, ATTACK_REACH, LOCATOR_RANGE, MAX_HP, MOBS, PLAYER_H, PLAYER_W, REACH, STEP, attackDamage, clamp, computeLight, dayPhase, daylight, hash01, heldKey, hurt, inBox,
  locatorMarks, mineStep, newDrop, newMob, newPlayer, placeProblem, stepDrop, stepMob, stepPlayer, stepVitals, takeHit, wearTool,
} from './sim.js';
import {
  TILE, VIEW_W, burst, drawDrop, drawFloaters, drawGhostBlock, drawMob, drawParticles, drawPlayer, drawSky, drawTarget, drawWorld, itemIconUrl,
} from './render.js';
import { alive as alivePlayers, findPlayer, graceEnd, inGame } from './game.js';

const SEND_EVERY = 1 / 20;
const SERVER_EVERY = 1 / 12;
const EDIT_KEEP = 6;       // segundos que un bloque cambiado sigue viajando en cada foto
const EVENT_KEEP = 3;      // y los golpes, sueltos y demás
const GONE_AFTER = 15;     // sin fotos de alguien, el anfitrión lo da por muerto
const RESYNC_EVERY = 1.2;  // cada tanto se manda un pedazo del mundo cambiado
const CHUNK = 32;
const RESYNC_MAX = 140;
const KINDS = ['cow', 'pig', 'zombie'];
const KEYS = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], jump: ['KeyW', 'ArrowUp', 'Space'], sneak: ['ShiftLeft', 'ShiftRight'], sprint: ['ControlLeft', 'ControlRight'] };
const round1 = (v) => Math.round(v * 10) / 10;
const fmtTime = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;
const BLOCK_PARTICLES = {
  grass: ['#5da745', '#8a5a35'], dirt: ['#8a5a35', '#7a4a2b'], stone: ['#868686', '#7d7d7d'], cobble: ['#7b7b7b', '#5d5d5d'], sand: ['#e3d29a', '#d6c485'], gravel: ['#8a8581', '#6f6a66'],
  log: ['#6b4a2a', '#523720'], leaves: ['#3d8a3a', '#2c6a2c'], planks: ['#b8914f', '#8e6d36'], snow: ['#f2f7fb', '#dce8f2'], cactus: ['#2f7a35', '#1f5a26'], sandstone: ['#d9c78a', '#bfa965'],
  coal_ore: ['#868686', '#1d1d1d'], iron_ore: ['#868686', '#d8af93'], gold_ore: ['#868686', '#fcee4b'], diamond_ore: ['#868686', '#5decf5'], table: ['#8d5f2c', '#b8914f'], furnace: ['#868686', '#555'],
};

export function ItemIcon({ k, size = 32 }) {
  return <img className="mc-icon" src={itemIconUrl(k)} width={size} height={size} alt={itemName(k)} draggable={false} />;
}

// ¿Hay un bloque de ese tipo cerca? (para la mesa de crafteo y el horno)
function nearBlock(w, p, id, r) {
  const cx = Math.floor(p.x), cy = Math.floor(p.y - 1);
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) if (at(w, x, y) === id) return { x, y };
  return null;
}

export default function MineGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const cursorRef = useRef(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const roomRef = useRef(room);
  roomRef.current = room;
  const dispatchRef = useRef(onDispatch);
  dispatchRef.current = onDispatch;
  const [hud, setHud] = useState({ hp: MAX_HP, food: 20, air: 10, sel: 0, bar: [], armor: [null, null, null, null], pts: 0, dead: false, grace: 0, pvp: false, marks: [], clock: '', biome: '', coords: '' });
  const [ui, setUi] = useState(null); // null | 'inv' | 'furnace'
  const [, bump] = useState(0);
  const [notice, setNotice] = useState('');
  const [killLabel, setKillLabel] = useState('');
  const [banner, setBanner] = useState('');

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      n: 0, w: null, light: new Uint8Array(W * H), lightDirty: true, lightAt: 0, local: null, remotes: new Map(), lastSeen: new Map(), mobs: new Map(), drops: new Map(),
      edits: new Map(), seen: new Set(), seq: 0, dropSeq: 0, mobSeq: 0, input: { left: false, right: false, jump: false, sneak: false, sprint: false }, btn: { l: false, r: false }, rEdge: false,
      mouse: { x: 0, y: 0, in: false }, aim: { x: 0, y: 0 }, cam: { x: 0, y: 0 }, particles: [], floaters: [], shake: 0,
      myEdits: [], myHits: [], myMobHits: [], myDrops: [], myPicks: [], zHits: [], resyncAt: 0, resyncAdv: 0, sentAt: 0, serverAt: 0, snapN: 0, deathSent: false, goneSent: new Set(), mountedAt: 0,
      placeAt: 0, swingN: 0, acting: 0, hudAt: 0, pvpAnnounced: false, spawnAt: 0, hitFlash: 0, ui: null,
    };
  }
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;
  const flash = (text) => { setNotice(text); setTimeout(() => setNotice((n) => (n === text ? '' : n)), 2000); };

  // Partida nueva: el mundo de la semilla y cada uno en su lugar.
  const matchN = room.match?.n;
  useEffect(() => {
    const m = room.match;
    if (!m) return;
    const s = sim.current;
    s.n = m.n;
    s.w = makeWorld(m.seed);
    s.lightDirty = true;
    s.edits.clear(); s.seen.clear(); s.drops.clear(); s.remotes.clear(); s.lastSeen.clear(); s.particles = []; s.floaters = [];
    s.mobs = new Map(animalSpawns(s.w).map((a) => [a.id, { ...newMob(a.id, a.kind, a.x, a.y), tx: a.x, ty: a.y, walked: 0 }]));
    s.myEdits = []; s.myHits = []; s.myMobHits = []; s.myDrops = []; s.myPicks = []; s.zHits = [];
    const at0 = Math.max(0, m.order.indexOf(me.id));
    const sp = spawnPoint(s.w, at0, m.size);
    s.local = newPlayer(sp.x, sp.y);
    s.cam = { x: sp.x * TILE - VIEW_W / 2, y: sp.y * TILE - 120 };
    s.deathSent = false; s.goneSent.clear(); s.pvpAnnounced = false; s.mountedAt = performance.now() / 1000; s.seq = 0; s.dropSeq = 0;
    setUi(null);
    s.ui = null;
  }, [matchN]); // eslint-disable-line react-hooks/exhaustive-deps

  // «Eliminaste a X».
  const deaths = room.match?.deaths || [];
  const seenDeaths = useRef(0);
  useEffect(() => {
    for (const d of deaths.slice(seenDeaths.current)) {
      if (d.by === me.id && d.id !== me.id) {
        const text = `Eliminaste a ${findPlayer(room, d.id)?.name || '¿?'}`;
        setKillLabel(text);
        setTimeout(() => setKillLabel((l) => (l === text ? '' : l)), 2800);
      }
    }
    seenDeaths.current = deaths.length;
  }, [deaths.length]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { seenDeaths.current = 0; }, [matchN]);

  // ─── Cambios del mundo ──────────────────────────────────────────────────────
  // e = [x, y, bloque nuevo, hora (décimas de segundo), ¿suelta algo?]. `live`: ocurrió ahora (no es un repaso).
  function applyEdit(s, e, live) {
    if (!s.w || !Array.isArray(e) || e.length < 4) return;
    const [x, y, id, t, h] = e;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= W || y < 1 || y >= H - 1 || !BLOCKS[id]) return;
    const c = y * W + x;
    const prev = s.edits.get(c);
    if (prev && prev[3] > t) return;
    s.edits.set(c, e);
    const old = s.w.t[c];
    if (old === id) return;
    const key = `e${x},${y},${t}`;
    s.w.t[c] = id;
    s.lightDirty = true;
    if (!live || s.seen.has(key)) return;
    s.seen.add(key);
    if (id === B.air || BLOCKS[id].fluid) {
      const colors = BLOCK_PARTICLES[BLOCKS[old]?.key];
      if (colors) burst(s.particles, x + 0.5, y + 0.5, { n: 8, speed: 3, colors, life: 0.5 });
      const item = h ? dropOf(old, true, () => hash01(x, y, t)) : null;
      if (item && ITEMS[item]) s.drops.set(`b${x}_${y}_${t}`, newDrop(`b${x}_${y}_${t}`, item, 1, x + 0.5, y + 0.5, (hash01(y, t, x) - 0.5) * 3, -3));
    }
  }
  // Un cambio mío: se aplica acá y viaja en las próximas fotos.
  function commitEdit(s, m, x, y, id, harvest) {
    const t = Math.round((serverNow() - m.startsAt / 1000) * 10);
    const e = [x, y, id, t, harvest ? 1 : 0];
    applyEdit(s, e, true);
    s.myEdits.push({ e, at: serverNow() });
  }

  function addDropEvent(s, d) {
    if (!d || typeof d.k !== 'string' || s.seen.has(d.k) || !ITEMS[d.i] || !Number.isFinite(d.x) || !Number.isFinite(d.y)) return;
    s.seen.add(d.k);
    s.drops.set(d.k, newDrop(d.k, d.i, Math.min(64, Math.max(1, d.n | 0)), d.x, d.y, d.vx || 0, d.vy || -3, d.d));
  }
  // Tira algo y avisa a los demás en la foto.
  function throwDrop(s, m, key, n, x, y, vx, vy, d, wait = 1.2) {
    const ev = { k: `d${me.id}:${m.n}:${s.dropSeq++}`, i: key, n, x: round1(x), y: round1(y), vx: round1(vx), vy: round1(vy), d };
    addDropEvent(s, ev);
    const it = s.drops.get(ev.k);
    if (it) it.wait = serverNow() + wait;
    s.myDrops.push({ ...ev, at: serverNow() });
  }

  // Un golpe de otro jugador o un zombi: lo juzgo yo.
  function takeHitEvent(s, hit, fromId, isMob) {
    const p = s.local, now = serverNow();
    const m = roomRef.current.match;
    if (!p || p.dead || !m || s.seen.has(hit.k) || now < m.startsAt / 1000) return;
    s.seen.add(hit.k);
    if (!isMob) {
      if (now * 1000 < graceEnd(m)) return;                  // tregua: no hay PVP
      if (now - p.hurtAt < 0.45) return;                     // un respiro entre golpes
    }
    const d = clamp(Number(hit.d) || 1, 0.5, 14);
    const real = takeHit(p, d, isMob ? null : fromId, isMob ? 'zombie' : String(hit.w || '').slice(0, 24) || 'fist', now, Math.sign(hit.kx) || 1);
    s.hitFlash = 0.25;
    s.shake = Math.max(s.shake, 0.3);
    s.floaters.push({ x: p.x, y: p.y - 1.9, text: String(Math.round(real * 10) / 10), color: '#ff5a5f', age: 0 });
    burst(s.particles, p.x, p.y - 1, { n: 6, colors: ['#d93a3a', '#ff5a4f'], speed: 3, life: 0.4 });
    p.eat = null;
  }

  // Un bicho lastimado por alguien: lo decide el anfitrión.
  function hitMob(s, mh, now) {
    if (s.seen.has(mh.k)) return;
    s.seen.add(mh.k);
    const mob = s.mobs.get(mh.m);
    if (!mob) return;
    mob.hp -= clamp(Number(mh.d) || 1, 0.5, 14);
    mob.vx = (Math.sign(mh.kx) || 1) * 6;
    mob.vy = -5;
    mob.onGround = false;
    mob.fleeUntil = now + 4;
    mob.dir = Math.sign(mh.kx) || 1;
    if (mob.hp > 0) return;
    s.mobs.delete(mob.id);
    const m = roomRef.current.match;
    burst(s.particles, mob.x, mob.y - 0.6, { n: 14, colors: ['#e9edf2', '#c9ccd6', '#888'], speed: 3, life: 0.6 });
    for (const [key, lo, hi] of MOBS[mob.kind].drops) {
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (n > 0) throwDrop(s, m, key, n, mob.x, mob.y - 0.6, (Math.random() - 0.5) * 3, -4, undefined, 0);
    }
  }

  // ─── Red ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.mineChannel(code);
    const s = sim.current;
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== s.n || !s.w || !s.local) return;
      const prev = s.remotes.get(id);
      s.lastSeen.set(id, performance.now() / 1000);
      if (!prev || snap.t > prev.snap.t) {
        const jump = !prev || Math.hypot(snap.x - prev.x, snap.y - prev.y) > 12;
        const swung = prev && snap.sw !== prev.snap.sw;
        if (prev && !prev.snap.d && snap.d) burst(s.particles, snap.x, snap.y - 1, { n: 24, colors: ['#e0434f', '#e9edf2', '#555'], speed: 4, life: 0.9 });
        s.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, walked: (prev?.walked || 0) + Math.abs(snap.x - (prev?.snap.x ?? snap.x)), swingAt: swung ? serverNow() : prev?.swingAt || 0 });
      }
      for (const e of snap.ed || []) applyEdit(s, e, true);
      for (const e of snap.cs || []) applyEdit(s, e, false);
      for (const d of snap.dr || []) addDropEvent(s, d);
      for (const k of snap.pk || []) s.drops.delete(k);
      for (const h of snap.hi || []) if (h.to === me.id) takeHitEvent(s, h, id, false);
      const host = roomRef.current.hostId === me.id;
      if (host) for (const mh of snap.mh || []) hitMob(s, mh, serverNow());
      if (id === roomRef.current.hostId && !host) {
        for (const z of snap.mz || []) if (z.to === me.id) takeHitEvent(s, z, id, true);
        if (snap.mb) {
          const keep = new Set();
          for (const [mid, kind, x, y, hp, face] of snap.mb) {
            keep.add(mid);
            const mob = s.mobs.get(mid);
            if (mob) Object.assign(mob, { tx: x, ty: y, hp, face });
            else s.mobs.set(mid, { ...newMob(mid, KINDS[kind], x, y), tx: x, ty: y, hp, face, walked: 0 });
          }
          for (const k of [...s.mobs.keys()]) if (!keep.has(k)) s.mobs.delete(k);
        }
      }
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    s.mesh = mesh;
    s.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); s.mesh = null; s.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Bucle principal ────────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    let last = performance.now() / 1000;
    let acc = 0;
    const isHost = () => roomRef.current.hostId === me.id;
    const uiOpen = () => Boolean(s.ui);

    function aimUpdate() {
      const c = canvasRef.current;
      if (!c || !s.mouse.in) return;
      const rect = c.getBoundingClientRect();
      s.aim.x = (s.mouse.x / rect.width * c.width + s.cam.x) / TILE;
      s.aim.y = (s.mouse.y / rect.height * c.height + s.cam.y) / TILE;
    }
    s.aimUpdate = aimUpdate;

    // Qué hay bajo el mouse para pegarle: un jugador o un bicho.
    function entityAt(p, r) {
      const reach = (e) => Math.hypot(e.x - p.x, (e.y - 0.9) - (p.y - 0.9));
      for (const pl of alivePlayers(r)) {
        if (pl.id === me.id) continue;
        const v = s.remotes.get(pl.id);
        if (v && !v.snap.d && inBox(s.aim.x, s.aim.y, v, PLAYER_W + 0.3, PLAYER_H) && reach(v) <= ATTACK_REACH + 0.6) return { kind: 'player', id: pl.id, e: v };
      }
      for (const mob of s.mobs.values()) {
        const def = MOBS[mob.kind];
        if (inBox(s.aim.x, s.aim.y, mob, def.w + 0.2, def.h) && reach(mob) <= ATTACK_REACH + 0.6) return { kind: 'mob', id: mob.id, e: mob };
      }
      return null;
    }

    function attack(p, m, r, target, now) {
      if (now - p.atkAt < ATTACK_GAP) return;
      const key = heldKey(p);
      const falling = !p.onGround && p.vy > 1;
      const dmg = attackDamage(key, falling);
      const kx = Math.sign(target.e.x - p.x) || p.face;
      if (target.kind === 'player') {
        if (now * 1000 < graceEnd(m)) { if (now - (s.graceMsg || 0) > 2) { s.graceMsg = now; flash('🛡 Hay tregua: todavía no se puede pegar'); } return; }
        s.myHits.push({ k: `h${me.id}:${m.n}:${s.seq++}`, to: target.id, d: round1(dmg), kx, w: key || 'fist', at: now });
      } else {
        s.myMobHits.push({ k: `m${me.id}:${m.n}:${s.seq++}`, m: target.id, d: round1(dmg), kx, at: now });
        if (isHost()) hitMob(s, s.myMobHits[s.myMobHits.length - 1], now);
      }
      p.atkAt = now;
      s.swingN++;
      s.acting = now;
      if (key && ITEMS[key]?.tool) wearTool(p, ITEMS[key].tool === 'sword' ? 1 : 2);
      burst(s.particles, target.e.x, target.e.y - 1, { n: 5, colors: ['#ffffff', '#ffd23f'], speed: 3, life: 0.3 });
      s.floaters.push({ x: target.e.x, y: target.e.y - 2, text: String(round1(dmg)), color: '#ffd23f', age: 0 });
    }

    function placeOrUse(p, m, now) {
      const tx = Math.floor(s.aim.x), ty = Math.floor(s.aim.y);
      const key = heldKey(p);
      const it = key ? ITEMS[key] : null;
      const tile = at(s.w, tx, ty);
      const inReach = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - (p.y - 0.9)) <= REACH;
      // Mesa y horno: clic derecho (agachado, se pone el bloque).
      if (s.rEdge && inReach && !s.input.sneak && BLOCKS[tile]?.use) {
        if (BLOCKS[tile].use === 'table') { s.ui = 'inv'; setUi('inv'); } else { s.ui = 'furnace'; s.furnaceAt = { x: tx, y: ty }; setUi('furnace'); }
        s.rEdge = false;
        return;
      }
      if (!it) return;
      if (it.food) {
        if (p.food >= 20 && !it.heal) { if (s.rEdge) flash('Estás lleno'); return; }
        if (!p.eat) p.eat = { key, t: 0 };
        return;
      }
      if (key === 'bucket') {
        if (s.rEdge && inReach && (tile === B.water || tile === B.lava)) {
          commitEdit(s, m, tx, ty, B.air, false);
          const st = p.inv[p.sel]; st.n -= 1;
          if (st.n <= 0) p.inv[p.sel] = null;
          addItem(p.inv, tile === B.water ? 'water_bucket' : 'lava_bucket', 1);
          p.sel = Math.min(p.sel, HOTBAR - 1);
          s.acting = now;
        }
        return;
      }
      if (it.pour) {
        if (!s.rEdge || !inReach) return;
        const bad = placeProblem(s.w, p, tx, ty, B[it.pour]);
        if (bad && bad !== 'Tiene que apoyarse en algo') { flash(bad); return; }
        commitEdit(s, m, tx, ty, B[it.pour], false);
        p.inv[p.sel] = { i: 'bucket', n: 1 };
        s.acting = now;
        return;
      }
      if (it.block === undefined || now < s.placeAt) return;
      const bad = placeProblem(s.w, p, tx, ty, it.block);
      if (bad) { if (s.rEdge) flash(bad); return; }
      commitEdit(s, m, tx, ty, it.block, false);
      const st = p.inv[p.sel];
      st.n -= 1;
      if (st.n <= 0) p.inv[p.sel] = null;
      s.placeAt = now + 0.2;
      s.acting = now;
    }

    // Todo lo que depende del mouse, una vez por cuadro.
    function actions(dt, now) {
      const p = s.local, m = roomRef.current.match, r = roomRef.current;
      if (!p || !m || !s.w) return;
      if (p.dead || uiOpen()) { p.mine = null; p.eat = null; s.rEdge = false; s.btn.l = false; s.btn.r = false; return; }
      aimUpdate();
      const tx = Math.floor(s.aim.x), ty = Math.floor(s.aim.y);
      const inReach = Math.hypot(tx + 0.5 - p.x, ty + 0.5 - (p.y - 0.9)) <= REACH;
      if (s.btn.l) {
        const target = entityAt(p, r);
        if (target) { p.mine = null; attack(p, m, r, target, now); }
        else if (inReach) {
          const tile = at(s.w, tx, ty);
          if (tile !== B.air && !BLOCKS[tile].fluid) {
            s.acting = now;
            if (mineStep(s.w, p, tx, ty, dt)) {
              const info = breakInfo(tile, heldKey(p));
              commitEdit(s, m, tx, ty, B.air, info.drops);
              wearTool(p, 1);
              s.swingN++;
            }
          } else p.mine = null;
        } else p.mine = null;
      } else p.mine = null;
      if (s.btn.r) placeOrUse(p, m, now); else p.eat = null;
      s.rEdge = false;
      // Comer lleva un rato.
      if (p.eat) {
        if (heldKey(p) !== p.eat.key) p.eat = null;
        else {
          p.eat.t += dt;
          s.acting = now;
          if (p.eat.t >= 1.6) {
            const it = ITEMS[p.eat.key];
            removeItem(p.inv, p.eat.key, 1);
            p.food = Math.min(20, p.food + it.food);
            if (it.heal) p.hp = Math.min(MAX_HP, p.hp + it.heal);
            p.eat = null;
            burst(s.particles, p.x, p.y - 1.6, { n: 6, colors: ['#d4262c', '#f5d142'], speed: 2, life: 0.4 });
          }
        }
      }
    }

    // Recoger lo que está cerca.
    function pickups(p, m, now) {
      for (const [k, it] of s.drops) {
        stepDrop(s.w, it, STEP);
        if (it.age > 300) { s.drops.delete(k); continue; }
        if (p.dead || it.age < 0.45 || (it.wait && now < it.wait)) continue;
        if (Math.hypot(it.x - p.x, it.y - (p.y - 0.7)) > 1.5) continue;
        const left = addItem(p.inv, it.i, it.n, it.d);
        if (left === it.n) continue;
        s.drops.delete(k);
        s.myPicks.push({ k, at: now });
        if (left > 0) throwDrop(s, m, it.i, left, p.x, p.y - 1, 0, -3, it.d, 0.8);
      }
    }

    // El horno: sigue fundiendo mientras estés cerca.
    function furnaceTick(p, dt) {
      const j = p.smelt;
      if (!j) return;
      if (!nearBlock(s.w, p, B.furnace, 8)) { p.smelt = null; return; }
      if (count(p.inv, j.from) < 1) { p.smelt = null; return; }
      if (p.fuel < SMELT_COST) {
        const order = ['stick', 'planks', 'log', 'coal'];
        const fuelKey = order.find((k) => count(p.inv, k) > 0);
        if (!fuelKey) { p.smelt = null; flash('🔥 Sin combustible: usá carbón, troncos o tablones'); return; }
        removeItem(p.inv, fuelKey, 1);
        p.fuel += FUEL[fuelKey];
      }
      j.t += dt;
      if (j.t < SMELT_TIME) return;
      j.t = 0;
      removeItem(p.inv, j.from, 1);
      p.fuel -= SMELT_COST;
      addItem(p.inv, j.to, 1);
      j.left -= 1;
      if (j.left <= 0) p.smelt = null;
    }

    // Los animales y zombis (solo en la pantalla del anfitrión).
    function hostMobs(p, r, now, dt, t) {
      const targets = [];
      if (!p.dead) targets.push({ id: me.id, x: p.x, y: p.y - 0.9 });
      for (const pl of alivePlayers(r)) { const v = s.remotes.get(pl.id); if (pl.id !== me.id && v && !v.snap.d) targets.push({ id: pl.id, x: v.x, y: v.y - 0.9 }); }
      if (!targets.length) return;
      const near = (e) => targets.some((q) => Math.abs(q.x - e.x) < 70);
      for (const mob of s.mobs.values()) {
        if (!near(mob)) continue;
        const before = mob.x;
        stepMob(s.w, mob, STEP, now, Math.random, targets);
        mob.walked = (mob.walked || 0) + Math.abs(mob.x - before);
        if (MOBS[mob.kind].hostile) {
          const hit = targets.find((q) => Math.abs(q.x - mob.x) < 0.9 && Math.abs(q.y - (mob.y - 0.9)) < 1.4);
          if (hit && now - mob.atkAt > 1) {
            mob.atkAt = now;
            const ev = { k: `z${mob.id}:${Math.round(now * 10)}`, to: hit.id, d: MOBS.zombie.dmg, kx: Math.sign(hit.x - mob.x) || 1, at: now };
            if (hit.id === me.id) takeHitEvent(s, ev, null, true); else s.zHits.push(ev);
          }
        }
      }
      // Nacen zombis de noche y en las cuevas oscuras; mueren con el sol.
      s.spawnAt -= dt;
      const day = daylight(t);
      if (s.spawnAt <= 0) {
        s.spawnAt = 2.5;
        const zombies = [...s.mobs.values()].filter((q) => q.kind === 'zombie');
        if (zombies.length < 3 + targets.length * 2) {
          const q = targets[Math.floor(Math.random() * targets.length)];
          const cave = day > 0.4 || Math.random() < 0.3;
          const x = Math.floor(q.x + (Math.random() < 0.5 ? -1 : 1) * (cave ? 8 + Math.random() * 14 : 16 + Math.random() * 14));
          if (x > 3 && x < W - 3) {
            let y = cave ? Math.floor(q.y + (Math.random() - 0.3) * 14) : s.w.surf[x] - 1;
            if (cave) while (y < H - 4 && at(s.w, x, y + 1) === B.air) y++;
            const free = at(s.w, x, y) === B.air && at(s.w, x, y - 1) === B.air && at(s.w, x, y + 1) !== B.air && at(s.w, x, y + 1) !== B.water && at(s.w, x, y + 1) !== B.lava;
            const dark = cave ? s.light[y * W + x] <= 3 : day < 0.3 && s.w.surf[x] < SEA - 1;
            if (free && dark && !targets.some((tg) => Math.hypot(tg.x - x, tg.y - y) < 8)) {
              const id = `z${s.mobSeq++}${me.id.slice(0, 2)}`;
              s.mobs.set(id, { ...newMob(id, 'zombie', x + 0.5, y + 0.99), tx: x + 0.5, ty: y + 0.99, walked: 0 });
            }
          }
        }
      }
      if (day > 0.65) for (const [k, mob] of s.mobs) if (mob.kind === 'zombie' && s.light[Math.floor(mob.y - 1) * W + Math.floor(mob.x)] >= 14 && Math.random() < dt * 0.4) { s.mobs.delete(k); burst(s.particles, mob.x, mob.y - 1, { n: 10, colors: ['#ff8a1c', '#555'], speed: 3, life: 0.6 }); }
    }

    function step(now) {
      const r = roomRef.current;
      const m = r.match;
      const p = s.local;
      if (!m || !p || !s.w) return;
      if (p.dead) return;
      const input = uiOpen() ? { left: false, right: false, jump: false, sneak: false, sprint: false } : s.input;
      const ev = stepPlayer(s.w, p, input, STEP);
      if (ev.landed) {
        hurt(p, ev.landed, null, 'fall', now);
        s.shake = Math.max(s.shake, 0.3);
        s.floaters.push({ x: p.x, y: p.y - 1.9, text: String(ev.landed), color: '#ff5a5f', age: 0 });
      }
      stepVitals(s.w, p, STEP, now, Math.abs(p.vx) > 0.5);
      if (p.hp <= 0 && !p.dead) die(p, m, now);
    }

    // Morir: soltás todo y avisás a la sala.
    function die(p, m, now) {
      p.dead = true;
      p.hp = 0;
      p.mine = null; p.eat = null; p.cursor && addItem(p.inv, p.cursor.i, p.cursor.n);
      p.cursor = null;
      s.ui = null; setUi(null);
      burst(s.particles, p.x, p.y - 1, { n: 30, colors: ['#e0434f', '#e9edf2', '#555'], speed: 4, life: 1 });
      let a = 0;
      const toss = (key, n, d) => { a += 1.3; throwDrop(s, m, key, n, p.x, p.y - 1, Math.cos(a) * 3, -4 - (a % 2), d, 0.8); };
      for (const st of p.inv) if (st) toss(st.i, st.n, st.d);
      for (const k of p.armor) if (k) toss(k, 1);
      p.inv.fill(null);
      p.armor = [null, null, null, null];
      if (!s.deathSent) {
        s.deathSent = true;
        const recent = p.lastBy && now - p.lastHitAt < 8;
        dispatchRef.current({ type: 'died', match: m.n, by: recent ? p.lastBy : null, w: p.lastW || 'fall' });
      }
    }

    function frame({ hidden }) {
      const r = roomRef.current;
      const m = r.match;
      const t0 = performance.now() / 1000;
      acc = Math.min(acc + (t0 - last), 0.25);
      const dt = Math.min(0.05, t0 - last);
      last = t0;
      const now = serverNow();
      const p = s.local;
      if (!m || !p || !s.w) return;
      while (acc >= STEP) { step(now - acc + STEP); acc -= STEP; pickups(p, m, now); if (isHost()) hostMobs(p, r, now, STEP, Math.max(0, now - m.startsAt / 1000)); }
      actions(dt, now);
      furnaceTick(p, dt);
      const t = Math.max(0, now - m.startsAt / 1000); // el día arranca al empezar la partida

      // Los demás hacia su última foto; los bichos que no simulo, hacia lo que dijo el anfitrión.
      for (const v of s.remotes.values()) {
        const age = Math.min(0.1, Math.max(0, now - v.snap.t));
        const tx = v.snap.x + (v.snap.vx || 0) * age, ty = v.snap.y + (v.snap.vy || 0) * age;
        const k = Math.min(1, dt * 18);
        v.x += (tx - v.x) * k; v.y += (ty - v.y) * k;
      }
      if (!isHost()) for (const mob of s.mobs.values()) {
        const k = Math.min(1, dt * 10);
        const ox = mob.x;
        mob.x += ((mob.tx ?? mob.x) - mob.x) * k; mob.y += ((mob.ty ?? mob.y) - mob.y) * k;
        mob.walked = (mob.walked || 0) + Math.abs(mob.x - ox);
      }
      if (s.lightDirty && t0 - s.lightAt > 0.25) { s.lightDirty = false; s.lightAt = t0; computeLight(s.w, s.light); }

      // Mandar la foto.
      if (now - s.sentAt >= SEND_EVERY) {
        s.sentAt = now;
        s.snapN++;
        const fresh = (list, keep) => list.filter((q) => now - q.at < keep);
        s.myEdits = fresh(s.myEdits, EDIT_KEEP); s.myHits = fresh(s.myHits, EVENT_KEEP); s.myMobHits = fresh(s.myMobHits, EVENT_KEEP); s.myDrops = fresh(s.myDrops, EVENT_KEEP); s.myPicks = fresh(s.myPicks, EVENT_KEEP); s.zHits = fresh(s.zHits, EVENT_KEEP);
        const span = Math.max(0.001, now - (s.prevT ?? now - SEND_EVERY));
        const snap = {
          n: m.n, t: now, x: round1(p.x), y: round1(p.y), vx: Math.round((p.x - (s.prevX ?? p.x)) / span), vy: Math.round((p.y - (s.prevY ?? p.y)) / span),
          f: p.face, sn: p.sneak ? 1 : 0, hp: Math.max(0, Math.round(p.hp)), d: p.dead ? 1 : 0, h: heldKey(p) || '', ar: p.armor.map((k) => k || 0), sw: s.swingN, mv: Math.abs(p.vx) > 0.4 ? 1 : 0,
          ed: s.myEdits.map((q) => q.e), hi: s.myHits, mh: s.myMobHits, dr: s.myDrops, pk: s.myPicks.map((q) => q.k),
        };
        s.prevX = p.x; s.prevY = p.y; s.prevT = now;
        // Un pedazo del mundo cambiado, rotando: así todos terminan viendo lo mismo.
        if (now - s.resyncAt >= RESYNC_EVERY) {
          s.resyncAt = now;
          const c0 = Math.floor((s.resyncAdv++ % (W / CHUNK)) * CHUNK);
          const list = [];
          for (const e of s.edits.values()) if (e[0] >= c0 && e[0] < c0 + CHUNK) list.push(e);
          if (list.length) snap.cs = list.length > RESYNC_MAX ? list.slice(Math.floor(hash01(s.resyncAdv, 1, 1) * (list.length - RESYNC_MAX))).slice(0, RESYNC_MAX) : list;
        }
        if (isHost()) {
          if (s.snapN % 3 === 0) snap.mb = [...s.mobs.values()].map((q) => [q.id, KINDS.indexOf(q.kind), round1(q.x), round1(q.y), Math.round(q.hp), q.face >= 0 ? 1 : -1]);
          snap.mz = s.zHits;
        }
        s.mesh?.broadcast(snap);
        const players = inGame(r).filter((pl) => pl.id !== me.id);
        const needServer = !s.mesh || players.some((pl) => !s.mesh.isOpen(pl.id));
        if (needServer && now - s.serverAt >= SERVER_EVERY && s.chan) {
          s.serverAt = now;
          s.chan.publish(me.id, JSON.stringify(snap)).catch(() => {});
        }
        // El anfitrión da por muerto al que dejó de mandar fotos (pestaña cerrada sin salir).
        if (isHost() && r.phase === 'playing' && now > m.startsAt / 1000 + GONE_AFTER) {
          for (const pl of alivePlayers(r)) {
            if (pl.id === me.id || s.goneSent.has(pl.id)) continue;
            if (t0 - (s.lastSeen.get(pl.id) ?? s.mountedAt) > GONE_AFTER) { s.goneSent.add(pl.id); dispatchRef.current({ type: 'died', target: pl.id, match: m.n, w: 'left' }); }
          }
        }
      }

      // Lo que muestra la pantalla de React (unas 10 veces por segundo).
      if (t0 - s.hudAt > 0.1) {
        s.hudAt = t0;
        const pvp = now * 1000 >= graceEnd(m);
        if (pvp && !s.pvpAnnounced && t > 1) {
          s.pvpAnnounced = true;
          setBanner('⚔ ¡Terminó la tregua! Empieza el PVP');
          setTimeout(() => setBanner(''), 5000);
        }
        let marks = [];
        if (pvp && !p.dead) {
          const others = [];
          for (const pl of alivePlayers(r)) { const v = s.remotes.get(pl.id); if (pl.id !== me.id && v && !v.snap.d) others.push({ id: pl.id, x: v.x, y: v.y, sneak: v.snap.sn, color: pl.color, name: pl.name }); }
          marks = locatorMarks(p, others);
        }
        const pts = p.armor.reduce((a, k) => a + (ITEMS[k]?.pts || 0), 0);
        const ph = dayPhase(t);
        setHud({
          hp: Math.max(0, Math.ceil(p.hp * 10) / 10), food: p.food, air: Math.ceil(p.air), sel: p.sel, bar: p.inv.slice(0, HOTBAR).map((q) => q && { ...q }), armor: [...p.armor], pts, dead: p.dead,
          grace: Math.max(0, graceEnd(m) / 1000 - now), pvp, marks, clock: ph < 0.5 ? '☀' : '🌙', biome: s.w.biome[clamp(Math.floor(p.x), 0, W - 1)], coords: `${Math.floor(p.x)}, ${Math.floor(H - p.y)}`,
          eat: p.eat ? p.eat.t / 1.6 : 0, mine: p.mine ? p.mine.t / p.mine.need : 0, smelt: p.smelt ? { left: p.smelt.left, f: p.smelt.t / SMELT_TIME } : null, fuel: p.fuel, prep: Math.max(0, m.startsAt / 1000 - now),
        });
      }
      if (!hidden) draw(r, m, now, dt, t);
    }

    function draw(r, m, now, dt, t) {
      const canvas = canvasRef.current, wrap = wrapRef.current;
      if (!canvas || !wrap || !wrap.clientWidth) return;
      const VW = VIEW_W;
      const VH = Math.max(240, Math.min(480, Math.round((VW * wrap.clientHeight) / wrap.clientWidth)));
      if (canvas.width !== VW || canvas.height !== VH) { canvas.width = VW; canvas.height = VH; }
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = false;
      const p = s.local, w = s.w;
      const time = performance.now() / 1000;
      const day = daylight(t);

      let follow = p;
      if (p.dead) {
        const ids = [p.lastBy, ...alivePlayers(r).map((pl) => pl.id)];
        const v = ids.map((id) => s.remotes.get(id)).find((x) => x && !x.snap.d);
        if (v) follow = v;
      }
      const tx = follow.x * TILE - VW / 2, ty = (follow.y - 1) * TILE - VH / 2;
      const k = Math.min(1, dt * 9);
      s.cam.x += (tx - s.cam.x) * k;
      s.cam.y += (ty - s.cam.y) * k;
      s.shake = Math.max(0, s.shake - dt * 2.2);
      s.hitFlash = Math.max(0, s.hitFlash - dt);
      const cam = {
        x: Math.round(clamp(s.cam.x, -20, W * TILE - VW + 20) + (Math.random() - 0.5) * s.shake * 5),
        y: Math.round(clamp(s.cam.y, -80, H * TILE - VH + 20) + (Math.random() - 0.5) * s.shake * 5),
      };
      aimUpdate();

      drawSky(g, w, cam.y, VW, VH, day, dayPhase(t), time);
      drawWorld(g, w, s.light, cam, VW, VH, day, time, { x: follow.x, y: follow.y - 1 });

      // Lo que hay en el piso, los bichos y los jugadores.
      for (const it of s.drops.values()) drawDrop(g, it, cam, time);
      for (const mob of s.mobs.values()) {
        if (mob.x * TILE < cam.x - 40 || mob.x * TILE > cam.x + VW + 40) continue;
        drawMob(g, mob, cam, false);
      }
      for (const pl of inGame(r)) {
        if (pl.id === me.id) continue;
        const v = s.remotes.get(pl.id);
        if (!v) continue;
        const sn = v.snap;
        const dist = Math.hypot(v.x - follow.x, v.y - follow.y);
        drawPlayer(g, v, cam, {
          color: pl.color, face: sn.f, walked: v.walked, moving: Boolean(sn.mv), sneak: sn.sn, armor: (sn.ar || []).map((q) => q || null), held: sn.h || null,
          name: !sn.d && !sn.sn && dist < 22 ? pl.name : null, hp: sn.hp, dead: Boolean(sn.d), swing: now - v.swingAt < 0.3 ? (now - v.swingAt) / 0.3 : 0,
        });
      }
      const mine = findPlayer(r, me.id);
      if (mine && !p.dead) {
        drawPlayer(g, p, cam, {
          color: mine.color, face: p.face, walked: p.walked, moving: Math.abs(p.vx) > 0.4, sneak: p.sneak, armor: p.armor, held: heldKey(p),
          hurt: now - p.hurtAt < 0.4 && Math.floor(now * 30) % 2 === 0, swing: now - s.acting < 0.3 ? ((now - s.acting) / 0.3) : 0,
        });
      }

      // El bloque apuntado: el contorno, o el fantasma de lo que se va a poner.
      if (!p.dead && !s.ui && s.mouse.in) {
        const bx = Math.floor(s.aim.x), by = Math.floor(s.aim.y);
        const inReach = Math.hypot(bx + 0.5 - p.x, by + 0.5 - (p.y - 0.9)) <= REACH;
        const key = heldKey(p);
        const item = key ? ITEMS[key] : null;
        if (item?.block !== undefined && !item.food) {
          if (inReach && !placeProblem(w, p, bx, by, item.block)) drawGhostBlock(g, item.block, bx, by, cam, true);
          else drawTarget(g, bx, by, cam, false, 0);
        } else if (inReach && at(w, bx, by) !== B.air) drawTarget(g, bx, by, cam, true, p.mine ? p.mine.t / p.mine.need : 0);
        else drawTarget(g, bx, by, cam, inReach, 0);
      }
      s.particles = s.particles.filter((q) => q.age < q.life);
      drawParticles(g, s.particles, cam, dt);
      s.floaters = s.floaters.filter((f) => f.age < 0.9);
      drawFloaters(g, s.floaters, cam, dt);
      if (s.hitFlash > 0) { g.fillStyle = `rgba(220,30,40,${s.hitFlash * 1.2})`; g.fillRect(0, 0, VW, VH); }
    }

    const stop = everyFrame(frame);
    window.__mine = s; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__mine === s) delete window.__mine; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ──────────────────────────────────────────────────────
  const closeUi = () => {
    const s = sim.current, p = s.local;
    if (p?.cursor) { const left = addItem(p.inv, p.cursor.i, p.cursor.n, p.cursor.d); if (left > 0) throwDrop(s, roomRef.current.match, p.cursor.i, left, p.x, p.y - 1, p.face * 3, -3, p.cursor.d); p.cursor = null; }
    s.ui = null;
    setUi(null);
  };
  useEffect(() => {
    const s = sim.current;
    const down = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const p = s.local;
      let used = true;
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (named) s.input[named[0]] = true;
      else if (e.code === 'KeyE' || e.code === 'KeyI') { if (!e.repeat && p && !p.dead) { if (s.ui) closeUi(); else { s.ui = 'inv'; setUi('inv'); } } }
      else if (e.code === 'Escape') { if (s.ui) closeUi(); else used = false; }
      else if (e.code === 'KeyQ') {
        if (!e.repeat && p && !p.dead && !s.ui && p.inv[p.sel]) {
          const st = p.inv[p.sel];
          const all = e.ctrlKey;
          throwDrop(s, roomRef.current.match, st.i, all ? st.n : 1, p.x + p.face * 0.4, p.y - 1.2, p.face * 4, -2, st.d);
          st.n -= all ? st.n : 1;
          if (st.n <= 0) p.inv[p.sel] = null;
        }
      } else if (/^Digit[1-9]$/.test(e.code)) { if (p) p.sel = Number(e.code.slice(5)) - 1; }
      else used = false;
      if (used) e.preventDefault();
    };
    const up = (e) => { const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code)); if (named) s.input[named[0]] = false; };
    const blur = () => { Object.assign(s.input, { left: false, right: false, jump: false, sneak: false, sprint: false }); s.btn.l = false; s.btn.r = false; };
    const wheel = (e) => {
      if (!(e.target instanceof HTMLCanvasElement) || !s.local) return;
      s.local.sel = (s.local.sel + (e.deltaY > 0 ? 1 : -1) + HOTBAR) % HOTBAR;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    window.addEventListener('wheel', wheel, { passive: true });
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); window.removeEventListener('wheel', wheel); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function onPointer(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    Object.assign(sim.current.mouse, { x: e.clientX - rect.left, y: e.clientY - rect.top, in: true });
    sim.current.aimUpdate?.();
  }

  // ─── Inventario ───────────────────────────────────────────────────────────
  const s0 = sim.current;
  const p0 = s0.local;
  function clickSlot(list, i, e, armorIdx) {
    const p = s0.local;
    if (!p) return;
    const right = e.button === 2;
    const slot = list[i];
    const cur = p.cursor;
    if (armorIdx !== undefined && cur && ITEMS[cur.i]?.armor !== armorIdx) return;
    if (!cur) {
      if (!slot) return;
      if (right && typeof slot === 'object' && slot.n > 1) { const half = Math.ceil(slot.n / 2); p.cursor = { ...slot, n: half }; slot.n -= half; }
      else { p.cursor = typeof slot === 'string' ? { i: slot, n: 1 } : slot; list[i] = null; }
    } else if (!slot) {
      if (right && cur.n > 1) { list[i] = armorIdx !== undefined ? cur.i : { ...cur, n: 1 }; cur.n -= 1; }
      else { list[i] = armorIdx !== undefined ? cur.i : cur; p.cursor = null; }
    } else if (armorIdx !== undefined) {
      list[i] = cur.i; p.cursor = { i: slot, n: 1 };
    } else if (slot.i === cur.i && maxStack(cur.i) > 1) {
      const t = right ? Math.min(1, maxStack(cur.i) - slot.n) : Math.min(cur.n, maxStack(cur.i) - slot.n);
      slot.n += t; cur.n -= t;
      if (cur.n <= 0) p.cursor = null;
    } else { list[i] = cur; p.cursor = slot; }
    bump((v) => v + 1);
  }
  function doCraft(r) {
    const p = s0.local;
    if (craft(p.inv, r)) { bump((v) => v + 1); } else flash('No entra o te faltan cosas');
  }
  function startSmelt(f, all) {
    const p = s0.local;
    const n = all ? count(p.inv, f.from) : 1;
    if (n < 1) return;
    p.smelt = { from: f.from, to: f.to, left: n, t: 0 };
    bump((v) => v + 1);
  }

  // ─── Pantalla ──────────────────────────────────────────────────────────────
  const left = alivePlayers(room).length;
  const total = inGame(room).length;
  const mine = findPlayer(room, me.id);
  const feed = deaths.slice(-5).reverse().map((d) => ({ k: d.id, by: d.by ? findPlayer(room, d.by)?.name : null, w: d.w, victim: findPlayer(room, d.id)?.name || '¿?' }));
  const myDeath = deaths.find((d) => d.id === me.id);
  const myKiller = myDeath?.by ? findPlayer(room, myDeath.by) : null;
  const nearTable = Boolean(ui && p0 && s0.w && nearBlock(s0.w, p0, B.table, 5));
  const CAUSES = { fall: 'una caída', lava: 'lava', drown: 'ahogado', hunger: 'hambre', cactus: 'un cactus', zombie: 'un zombi', left: 'se fue', fist: 'los puños' };
  const causeText = (w) => (ITEMS[w] ? ITEMS[w].name : CAUSES[w] || '');
  const heartRow = Array.from({ length: 10 }, (_, i) => { const v = hud.hp - i * 2; return v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty'; });
  const foodRow = Array.from({ length: 10 }, (_, i) => { const v = hud.food - i * 2; return v >= 2 ? 'full' : v >= 1 ? 'half' : 'empty'; });
  return (
    <div className="mc-stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="mc-canvas"
        data-mine-canvas
        onPointerMove={onPointer}
        onPointerDown={(e) => { onPointer(e); if (e.button === 0) sim.current.btn.l = true; if (e.button === 2) { sim.current.btn.r = true; sim.current.rEdge = true; } e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerUp={(e) => { if (e.button === 0) sim.current.btn.l = false; if (e.button === 2) sim.current.btn.r = false; }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="mc-top">
        <span title="Bajas">☠ {mine?.kills || 0}</span>
        <span title="Quedan">👥 {left}/{total}</span>
        <span title="Hora">{hud.clock}</span>
        <span title="Posición (x, altura)">{hud.coords}</span>
      </div>
      {room.match?.mode === 'uhc' && (
        <p className={`mc-grace${hud.pvp ? ' is-pvp' : ''}`} data-grace>{hud.pvp ? '⚔ PVP activado' : `🛡 Tregua: el PVP empieza en ${fmtTime(hud.grace)}`}</p>
      )}
      {banner && <p className="mc-banner">{banner}</p>}
      <ul className="mc-feed">
        {feed.map((f) => (
          <li key={f.k}>{f.by ? <><b>{f.by}</b> <i>{causeText(f.w) || '→'}</i> {f.victim}</> : <>{f.victim} <i>{causeText(f.w) || '☠'}</i></>}</li>
        ))}
      </ul>
      {killLabel && <p className="mc-killed">☠ {killLabel}</p>}
      {hud.prep > 0 && <div className="mc-prep"><small>EL MUNDO ESTÁ LISTO</small>{Math.ceil(hud.prep)}<em>Picá árboles con el mouse (clic izquierdo mantenido), armá herramientas con E y encontrá a los demás… cuando termine la tregua.</em></div>}
      {!hud.dead && (
        <div className="mc-bottom">
          {hud.pvp && room.match?.mode === 'uhc' && (
            <div className="mc-locator" data-locator title="Barra localizadora: agacharte (Shift) te saca de las barras de los demás">
              <i className="mc-loc-me" />
              {hud.marks.map((mk) => (
                <span key={mk.id} className="mc-loc-dot" style={{ left: `${50 + mk.pos * 48}%`, background: mk.color, opacity: 1 - (mk.dist / LOCATOR_RANGE) * 0.6 }} title={`${mk.name} · ${Math.round(mk.dist)} bloques`}>
                  {mk.vert ? (mk.vert < 0 ? '▲' : '▼') : ''}
                </span>
              ))}
            </div>
          )}
          <div className="mc-status">
            <div className="mc-hearts" title="Vida">{heartRow.map((c, i) => <b key={i} className={`mc-heart is-${c}`}>♥</b>)}</div>
            {hud.pts > 0 && <div className="mc-armorpts" title="Armadura">🛡 {hud.pts}</div>}
            {hud.air < 10 && <div className="mc-air" title="Aire">{Array.from({ length: Math.max(0, hud.air) }, (_, i) => <b key={i}>○</b>)}</div>}
            <div className="mc-food" title="Hambre">{foodRow.map((c, i) => <b key={i} className={`mc-drum is-${c}`}>●</b>)}</div>
          </div>
          <div className="mc-hotbar" data-hotbar>
            {Array.from({ length: HOTBAR }, (_, i) => {
              const st = hud.bar[i];
              return (
                <button key={i} type="button" className={`mc-slot${hud.sel === i ? ' is-sel' : ''}`} data-slot={i + 1} title={st ? itemName(st.i) : ''} onClick={() => { if (sim.current.local) sim.current.local.sel = i; }}>
                  <small>{i + 1}</small>
                  {st && <ItemIcon k={st.i} size={30} />}
                  {st && st.n > 1 && <b>{st.n}</b>}
                  {st && ITEMS[st.i]?.dur && st.d < ITEMS[st.i].dur && <i className="mc-dur"><u style={{ width: `${(st.d / ITEMS[st.i].dur) * 100}%` }} /></i>}
                </button>
              );
            })}
          </div>
          {hud.eat > 0 && <i className="mc-eat"><b style={{ width: `${hud.eat * 100}%` }} /></i>}
        </div>
      )}
      {hud.smelt && <p className="mc-smelt">🔥 Fundiendo… faltan {hud.smelt.left}</p>}
      {notice && <p className="mc-notice">{notice}</p>}

      {ui && !hud.dead && p0 && (
        <div className="mc-ui" onContextMenu={(e) => e.preventDefault()} onMouseMove={(e) => { const r = wrapRef.current.getBoundingClientRect(); s0.mouseUi = { x: e.clientX - r.left - 15, y: e.clientY - r.top - 15 }; if (cursorRef.current) { cursorRef.current.style.left = `${s0.mouseUi.x}px`; cursorRef.current.style.top = `${s0.mouseUi.y}px`; } }}>
          <div className="mc-panel">
            <div className="mc-panel-head"><strong>{ui === 'furnace' ? '🔥 Horno' : nearTable ? '🛠 Inventario y mesa de crafteo' : '🎒 Inventario'}</strong><button type="button" className="mc-x" onClick={closeUi}>✕</button></div>
            <div className="mc-panel-body">
              <div className="mc-inv">
                <div className="mc-armor">
                  {p0.armor.map((k, i) => (
                    <button key={i} type="button" className="mc-slot is-armor" title={ARMOR_SLOT_NAMES[i]} onMouseDown={(e) => clickSlot(p0.armor, i, e, i)}>
                      {k ? <ItemIcon k={k} size={30} /> : <small>{ARMOR_SLOT_NAMES[i]}</small>}
                    </button>
                  ))}
                  <span className="mc-armor-pts">🛡 {hud.pts}</span>
                </div>
                <div className="mc-grid">
                  {[9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => {
                    const st = p0.inv[i];
                    return (
                      <button key={i} type="button" className={`mc-slot${i < HOTBAR ? ' is-bar' : ''}${i === 0 ? ' is-gap' : ''}`} title={st ? itemName(st.i) : ''} data-inv={i} onMouseDown={(e) => clickSlot(p0.inv, i, e)}>
                        {st && <ItemIcon k={st.i} size={30} />}
                        {st && st.n > 1 && <b>{st.n}</b>}
                        {st && ITEMS[st.i]?.dur && st.d < ITEMS[st.i].dur && <i className="mc-dur"><u style={{ width: `${(st.d / ITEMS[st.i].dur) * 100}%` }} /></i>}
                      </button>
                    );
                  })}
                </div>
                <p className="mc-tip">Clic izquierdo mueve la pila, clic derecho la parte o pone de a uno. <kbd>Q</kbd> tira lo que tenés en la mano.</p>
              </div>
              {ui === 'inv' ? (
                <div className="mc-recipes" data-recipes>
                  <h3>Fabricar {nearTable ? '' : <small>· acercate a una mesa para más</small>}</h3>
                  <ul>
                    {RECIPES.filter((r) => nearTable || !r.table).map((r) => {
                      const can = canCraft(p0.inv, r);
                      return (
                        <li key={r.out} className={can ? 'is-can' : ''}>
                          <ItemIcon k={r.out} size={28} />
                          <span><b>{itemName(r.out)}{r.n > 1 ? ` ×${r.n}` : ''}</b><small>{Object.entries(r.in).map(([k, n]) => <em key={k} className={count(p0.inv, k) >= n ? '' : 'is-lack'}>{n} {itemName(k).toLowerCase()}</em>)}</small></span>
                          <button type="button" className="tf-btn tf-btn-soft" disabled={!can} data-craft={r.out} onClick={() => doCraft(r)}>Hacer</button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="mc-recipes" data-furnace>
                  <h3>Fundir <small>· combustible: {Math.floor(p0.fuel / SMELT_COST)} fundiciones + lo que tengas en la mochila</small></h3>
                  <ul>
                    {SMELT.map((f) => {
                      const have = count(p0.inv, f.from);
                      return (
                        <li key={f.from} className={have ? 'is-can' : ''}>
                          <ItemIcon k={f.from} size={28} /><span className="mc-arrow">→</span><ItemIcon k={f.to} size={28} />
                          <span><b>{itemName(f.to)}</b><small><em className={have ? '' : 'is-lack'}>tenés {have} de {itemName(f.from).toLowerCase()}</em></small></span>
                          <button type="button" className="tf-btn tf-btn-soft" disabled={!have} data-smelt={f.from} onClick={() => startSmelt(f, false)}>×1</button>
                          <button type="button" className="tf-btn tf-btn-soft" disabled={!have} onClick={() => startSmelt(f, true)}>Todo</button>
                        </li>
                      );
                    })}
                  </ul>
                  <p className="mc-tip">Gasta carbón (8 fundiciones), troncos o tablones (1,5) o palos. Funde cuatro segundos por ítem mientras estés cerca del horno.</p>
                </div>
              )}
            </div>
          </div>
          {p0.cursor && <div className="mc-cursor" ref={cursorRef} style={{ left: s0.mouseUi?.x ?? 0, top: s0.mouseUi?.y ?? 0 }}><ItemIcon k={p0.cursor.i} size={30} />{p0.cursor.n > 1 && <b>{p0.cursor.n}</b>}</div>}
        </div>
      )}

      {hud.dead && mine && (
        <div className="mc-eliminated">
          <div className="mc-elim-text">
            <strong>¡ELIMINADO!</strong>
            <span>{myKiller ? <>por <b>{myKiller.name}</b>{myDeath.w && causeText(myDeath.w) ? <> con {causeText(myDeath.w)}</> : null}</> : causeText(myDeath?.w) ? `Murió por ${causeText(myDeath.w)}` : 'Quedaste afuera'}</span>
          </div>
          <div className="mc-elim-place"><strong>{mine.place || left + 1}</strong><small>de {total}</small></div>
        </div>
      )}
    </div>
  );
}
