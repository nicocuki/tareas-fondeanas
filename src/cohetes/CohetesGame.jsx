// La partida de Cohete Royale en tiempo real: dibujo, teclado y mouse, y la conexión con los demás.
//
// Mismo esquema que A los Tiros: cada pantalla es dueña de su tanque (lo mueve, decide cuánto daño le
// hacen y avisa a la sala cuando muere) y manda su foto directo a los demás (WebRTC) o, si no se
// puede, por el servidor. Los cohetes no viajan: la foto lleva los disparos de los últimos 1,5 s y
// cada pantalla los simula. **Dónde explota cada cohete lo decide la pantalla del que tiró** y lo
// manda en la foto (`ex`): así todas cavan el mismo cráter y cada una calcula el daño de su tanque.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { carve, makeTerrain, solid, waterY } from './terrain.js';
import {
  KILL_CREDIT, RECOIL, STEP, TANK_H, WEAPONS, blastOn, coinSpots, crateInfo, MAX_CRATES, muzzle, newTank, projectilesFor, spawnFor,
  stepProjectile, stepTank,
} from './sim.js';
import {
  burst, drawCoin, drawCrate, drawEffects, drawLabel, drawMinimap, drawProjectile, drawSky, drawTank, drawTerrain, drawWater,
  makeTerrainView, repaint, setWorld,
} from './render.js';
import { alive as alivePlayers, findPlayer, inGame } from './game.js';

const SEND_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 15;
const EVENT_KEEP = 2;        // segundos que un disparo o una explosión siguen viajando en las fotos
const GONE_AFTER = 10;       // sin fotos de alguien, el anfitrión lo da por muerto
const VIEW_W = 320;          // cuánto mundo entra a lo ancho
const KEYS = { left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], shoot: ['Space', 'KeyW', 'ArrowUp'] };

export default function CohetesGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const wrapRef = useRef(null);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const roomRef = useRef(room);
  roomRef.current = room;
  const dispatchRef = useRef(onDispatch);
  dispatchRef.current = onDispatch;
  const [hud, setHud] = useState({ hp: 100, weapon: 'rocket', ammo: 0, water: 0, dead: false, started: false, countdown: 0 });
  const [notice, setNotice] = useState('');

  const sim = useRef(null);
  if (!sim.current) {
    sim.current = {
      n: 0, t: null, view: null, coinSpots: [], crates: new Map(), local: null, remotes: new Map(), lastSeen: new Map(),
      projectiles: new Map(), seen: new Set(), myShots: [], myBooms: [], effects: [], particles: [], shake: 0, seq: 0,
      input: { left: false, right: false, shoot: false }, mouse: { x: 0, y: 0, in: false }, angle: -Math.PI / 4,
      sentAt: 0, serverAt: 0, deathSent: false, pendingCoins: new Set(), pendingCrates: new Set(), goneSent: new Set(), hudKey: '', mountedAt: 0,
    };
  }
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;

  // Partida nueva: la isla de la semilla, las monedas y cada uno en su lugar.
  const matchN = room.match?.n;
  useEffect(() => {
    const m = room.match;
    if (!m) return;
    const s = sim.current;
    s.n = m.n;
    s.t = makeTerrain(m.seed, m.size);
    s.view = makeTerrainView(s.t);
    s.coinSpots = coinSpots(s.t, m.seed);
    s.crates = new Map();
    const i = Math.max(0, m.order.indexOf(me.id));
    const sp = spawnFor(s.t, i, m.order.length);
    s.local = newTank(sp.x, sp.y);
    s.angle = sp.x < s.t.W / 2 ? -Math.PI / 4 : (-Math.PI * 3) / 4;
    s.remotes.clear(); s.lastSeen.clear(); s.projectiles.clear(); s.seen.clear();
    s.myShots = []; s.myBooms = []; s.effects = []; s.particles = [];
    s.deathSent = false; s.pendingCoins.clear(); s.pendingCrates.clear(); s.goneSent.clear();
    s.mountedAt = performance.now() / 1000;
  }, [matchN]); // eslint-disable-line react-hooks/exhaustive-deps

  // Una explosión (mía o de otro): cráter, efecto y, si me alcanza, daño y empujón.
  function explode(s, ex, now) {
    const key = `x:${ex.k}`;
    if (s.seen.has(key) || !s.t) return;
    s.seen.add(key);
    s.projectiles.delete(ex.k);
    const w = WEAPONS[ex.w] || WEAPONS.rocket;
    const box = carve(s.t, ex.x, ex.y, w.crater);
    if (box) repaint(s.view, s.t, box);
    s.effects.push({ x: ex.x, y: ex.y, r: w.radius * 0.8, age: 0 });
    burst(s.particles, ex.x, ex.y, { n: Math.round(w.crater * 1.4), speed: 60 + w.crater * 4 });
    const p = s.local;
    if (!p || p.dead) return;
    const hit = blastOn(p, ex);
    if (!hit) return;
    // La explosión del tiro propio empuja menos: si no, un tiro al piso te mandaba al cielo.
    const own = ex.o === me.id ? 0.6 : 1;
    p.vx += hit.vx * own;
    p.vy += hit.vy * own;
    s.shake = Math.max(s.shake, Math.min(1, hit.damage / 40));
    if (ex.o !== me.id) {
      p.hp -= hit.damage;
      p.lastBy = ex.o;
      p.lastHitAt = now;
      p.hurtUntil = performance.now() / 1000 + 0.15;
    }
  }

  // ─── Red ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.cohetesChannel(code);
    const s = sim.current;
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== s.n || !s.t) return;
      const prev = s.remotes.get(id);
      const t = performance.now() / 1000;
      s.lastSeen.set(id, t);
      if (!prev || snap.t > prev.snap.t) {
        if (prev && !prev.snap.d && snap.d) burst(s.particles, snap.x, snap.y - 4, { n: 40, colors: ['#ffcf4a', '#ff5a4f', '#555'], speed: 140, life: 1 });
        s.remotes.set(id, { snap, x: prev?.x ?? snap.x, y: prev?.y ?? snap.y, treads: (prev?.treads || 0) + Math.abs(snap.x - (prev?.snap.x ?? snap.x)) });
      }
      const now = serverNow();
      for (const shot of snap.sh || []) {
        if (s.seen.has(shot.k)) continue;
        s.seen.add(shot.k);
        for (const b of projectilesFor(shot, id)) {
          // Llega tarde: se adelanta hasta ahora (solo se ve; explota cuando llega su `ex`).
          const late = Math.min(0.5, Math.max(0, now - shot.t));
          for (let k = 0; k < late && !b.done; k += STEP) stepProjectile(b, STEP, s.t, []);
          if (!b.done) s.projectiles.set(b.k, b);
        }
      }
      for (const ex of snap.ex || []) explode(s, ex, now);
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
    let cam = { x: 0, y: 0, scale: 2, w: 1, h: 1 };

    function step(now) {
      const r = roomRef.current;
      const m = r.match;
      const p = s.local;
      if (!m || !p || !s.t) return;
      const started = now >= m.startsAt / 1000;
      const elapsed = now - m.startsAt / 1000;
      const mine = findPlayer(r, me.id);

      // Mi tanque.
      if (!p.dead) {
        const dir = started ? (s.input.right ? 1 : 0) - (s.input.left ? 1 : 0) : 0;
        stepTank(p, dir, STEP, s.t);
        // Disparar: el caño apunta al mouse y el tiro empuja para atrás.
        if (started && s.input.shoot && now >= p.readyAt) {
          const w = WEAPONS[p.weapon] || WEAPONS.rocket;
          const mz = muzzle(p, s.angle);
          const shot = { k: `${me.id}:${m.n}:${s.seq++}`, t: now, x: Math.round(mz.x * 10) / 10, y: Math.round(mz.y * 10) / 10, a: Math.round(s.angle * 1000) / 1000, w: p.weapon };
          s.seen.add(shot.k);
          for (const b of projectilesFor(shot, me.id)) s.projectiles.set(b.k, b);
          s.myShots.push(shot);
          const kick = p.weapon === 'laser' ? 0.4 : p.weapon === 'nuke' ? 1.5 : 1;
          p.vx -= Math.cos(s.angle) * RECOIL * kick;
          p.vy -= Math.sin(s.angle) * RECOIL * kick;
          p.readyAt = now + w.cooldown;
          if (p.weapon !== 'rocket' && --p.ammo <= 0) { p.weapon = 'rocket'; p.ammo = 0; }
        }
        // Agua o sin vida: afuera.
        const level = waterY(Math.max(0, elapsed), r.options.water);
        if (started && (p.y - 3 > level || p.hp <= 0 || p.y > s.t.H + 30)) {
          p.dead = true;
          burst(s.particles, p.x, p.y - 4, { n: 46, colors: ['#ffcf4a', '#ff5a4f', '#555'], speed: 150, life: 1 });
          if (!s.deathSent && mine?.alive) {
            s.deathSent = true;
            const by = p.lastBy && now - p.lastHitAt < KILL_CREDIT ? p.lastBy : null;
            dispatchRef.current({ type: 'died', match: m.n, by });
          }
        }
        // Monedas.
        if (started && !p.dead) {
          s.coinSpots.forEach((c, i) => {
            if (m.coins[i] || s.pendingCoins.has(i)) return;
            if (Math.hypot(c.x - p.x, c.y - (p.y - TANK_H / 2)) < 10) {
              s.pendingCoins.add(i);
              dispatchRef.current({ type: 'coin', match: m.n, i });
            }
          });
        }
      }

      // Cajas: caen en paracaídas cada tanto, cada pantalla las simula igual.
      for (let i = 0; i < MAX_CRATES; i++) {
        const info = crateInfo(i, m.seed, s.t.W);
        if (info.at > elapsed) break;
        if (m.crates[i]) { s.crates.delete(i); continue; }
        let c = s.crates.get(i);
        if (!c) { c = { x: info.x, y: -30, falling: true, weapon: info.weapon }; s.crates.set(i, c); }
        if (!solid(s.t, c.x, c.y + 0.5)) { c.y += (c.falling ? 45 : 160) * STEP; if (c.y > s.t.H + 40) s.crates.delete(i); }
        else c.falling = false;
        if (!p.dead && started && !s.pendingCrates.has(i) && Math.abs(c.x - p.x) < 12 && Math.abs(c.y - p.y) < 14) {
          s.pendingCrates.add(i);
          dispatchRef.current({ type: 'crate', match: m.n, i }).then((res) => {
            if (res?.committed && res.room?.match?.crates?.[i] === me.id) {
              p.weapon = info.weapon;
              p.ammo = WEAPONS[info.weapon].ammo;
              setNotice(`¡${WEAPONS[info.weapon].name}! (${p.ammo})`);
              setTimeout(() => setNotice(''), 1800);
            }
          });
        }
      }

      // Proyectiles: los míos deciden dónde explotan; los de otros solo se ven.
      const targets = [];
      for (const pl of alivePlayers(r)) {
        if (pl.id === me.id) continue;
        const v = s.remotes.get(pl.id);
        if (v && !v.snap.d) targets.push({ id: pl.id, x: v.x, y: v.y });
      }
      for (const b of s.projectiles.values()) {
        const mineShot = b.owner === me.id;
        const hit = stepProjectile(b, STEP, s.t, mineShot ? targets : []);
        if (hit && mineShot) {
          const ex = { k: b.k, x: Math.round(hit.x * 10) / 10, y: Math.round(hit.y * 10) / 10, w: b.w, o: me.id, t: now };
          s.myBooms.push(ex);
          explode(s, ex, now);
        }
      }
      for (const [k, b] of s.projectiles) if (b.done) s.projectiles.delete(k);
    }

    function frame({ hidden }) {
      const r = roomRef.current;
      const m = r.match;
      const t = performance.now() / 1000;
      acc = Math.min(acc + (t - last), 0.25);
      const dt = Math.min(0.05, t - last);
      last = t;
      const now = serverNow();
      while (acc >= STEP) { step(now - acc + STEP); acc -= STEP; }
      const p = s.local;
      if (!m || !p || !s.t) return;

      // Los demás: hacia su última foto, un poco adelantada.
      for (const v of s.remotes.values()) {
        const age = Math.min(0.1, Math.max(0, now - v.snap.t));
        const tx = v.snap.x + (v.snap.vx || 0) * age, ty = v.snap.y + (v.snap.vy || 0) * age;
        const k = Math.min(1, dt * 16);
        v.x += (tx - v.x) * k;
        v.y += (ty - v.y) * k;
        if (Math.hypot(tx - v.x, ty - v.y) > 40) { v.x = tx; v.y = ty; }
      }

      // Mandar la foto.
      if (now - s.sentAt >= SEND_EVERY) {
        s.sentAt = now;
        s.myShots = s.myShots.filter((e) => now - e.t < EVENT_KEEP);
        s.myBooms = s.myBooms.filter((e) => now - e.t < EVENT_KEEP);
        const snap = {
          n: m.n, t: now, x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10, vx: Math.round(p.vx), vy: Math.round(p.vy),
          a: Math.round(s.angle * 100) / 100, hp: Math.max(0, Math.round(p.hp)), d: p.dead ? 1 : 0, sh: s.myShots, ex: s.myBooms,
        };
        s.mesh?.broadcast(snap);
        const others = inGame(r).filter((pl) => pl.id !== me.id);
        const needServer = !s.mesh || others.some((pl) => !s.mesh.isOpen(pl.id));
        if (needServer && now - s.serverAt >= SERVER_EVERY && s.chan) {
          s.serverAt = now;
          s.chan.publish(me.id, JSON.stringify(snap)).catch(() => {});
        }
        // El anfitrión da por muerto al que dejó de mandar fotos (pestaña cerrada sin salir).
        if (r.hostId === me.id && r.phase === 'playing' && now > m.startsAt / 1000 + GONE_AFTER) {
          for (const pl of alivePlayers(r)) {
            if (pl.id === me.id || s.goneSent.has(pl.id)) continue;
            if (t - (s.lastSeen.get(pl.id) ?? s.mountedAt) > GONE_AFTER) { s.goneSent.add(pl.id); dispatchRef.current({ type: 'died', target: pl.id, match: m.n }); }
          }
        }
      }

      // Lo que muestra la pantalla de React (5 veces por segundo).
      const elapsed = now - m.startsAt / 1000;
      const key = [Math.round(p.hp), p.weapon, p.ammo, p.dead, elapsed >= 0, Math.ceil(-elapsed), Math.floor(elapsed / 5)].join('|');
      if (key !== s.hudKey) {
        s.hudKey = key;
        setHud({ hp: Math.max(0, Math.round(p.hp)), weapon: p.weapon, ammo: p.ammo, dead: p.dead, started: elapsed >= 0, countdown: Math.ceil(-elapsed), elapsed });
      }
      if (!hidden) draw(r, m, now, dt);
    }

    function draw(r, m, now, dt) {
      const canvas = canvasRef.current, wrap = wrapRef.current;
      if (!canvas || !wrap) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = Math.round(wrap.clientWidth * dpr), ch = Math.round(wrap.clientHeight * dpr);
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const ctx = canvas.getContext('2d');
      const p = s.local;
      // Cámara: sigue a mi tanque; muerto, al que me mató o a alguien vivo.
      let follow = p;
      if (p.dead) {
        const ids = [p.lastBy, ...alivePlayers(r).map((pl) => pl.id)];
        const v = ids.map((id) => s.remotes.get(id)).find((x) => x && !x.snap.d);
        if (v) follow = v;
      }
      const scale = cw / VIEW_W;
      const viewH = ch / scale;
      const tx = Math.max(VIEW_W / 2, Math.min(s.t.W - VIEW_W / 2, follow.x));
      const ty = Math.max(viewH / 2 - 60, Math.min(s.t.H - viewH / 2 + 20, follow.y - 30));
      cam = { x: cam.x ? cam.x + (tx - cam.x) * Math.min(1, dt * 6) : tx, y: cam.y ? cam.y + (ty - cam.y) * Math.min(1, dt * 6) : ty, scale, w: cw, h: ch };
      s.shake = Math.max(0, s.shake - dt * 2.5);
      const shaken = { ...cam, x: cam.x + (Math.random() - 0.5) * s.shake * 6, y: cam.y + (Math.random() - 0.5) * s.shake * 6 };

      // Apuntar: del tanque al mouse (en el mundo).
      if (s.mouse.in) {
        const wx = (s.mouse.x * dpr - cw / 2) / scale + cam.x;
        const wy = (s.mouse.y * dpr - ch / 2) / scale + cam.y;
        s.angle = Math.atan2(wy - (p.y - TANK_H * 0.7), wx - p.x);
      }

      const elapsed = Math.max(0, now - m.startsAt / 1000);
      const level = waterY(elapsed, r.options.water);
      drawSky(ctx, shaken, s.t, now);
      drawTerrain(ctx, shaken, s.view);
      setWorld(ctx, shaken);
      s.coinSpots.forEach((c, i) => { if (!m.coins[i] && !s.pendingCoins.has(i)) drawCoin(ctx, c, now); });
      for (const c of s.crates.values()) drawCrate(ctx, c);
      for (const pl of alivePlayers(r)) {
        if (pl.id === me.id) continue;
        const v = s.remotes.get(pl.id);
        if (!v || v.snap.d) continue;
        drawTank(ctx, { x: v.x, y: v.y, treads: v.treads }, pl.color, v.snap.a);
        drawLabel(ctx, v, pl.name, v.snap.hp, false);
      }
      const mine = findPlayer(r, me.id);
      if (!p.dead && mine) {
        drawTank(ctx, p, mine.color, s.angle, { hurt: (p.hurtUntil || 0) > performance.now() / 1000 ? 1 : 0 });
        drawLabel(ctx, p, mine.name, p.hp, true);
        // Mira: una línea punteada corta hacia donde va el tiro.
        const mz = muzzle(p, s.angle);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.setLineDash([2, 3]);
        ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.moveTo(mz.x, mz.y); ctx.lineTo(mz.x + Math.cos(s.angle) * 26, mz.y + Math.sin(s.angle) * 26); ctx.stroke();
        ctx.setLineDash([]);
      }
      for (const b of s.projectiles.values()) if (!b.done) drawProjectile(ctx, b);
      s.effects = s.effects.filter((e) => e.age < 0.4);
      s.particles = s.particles.filter((q) => q.age < q.life);
      drawEffects(ctx, s.effects, s.particles, dt);
      drawWater(ctx, shaken, s.t, level, now);

      const mini = miniRef.current;
      if (mini) {
        const dots = alivePlayers(r).map((pl) => {
          const v = pl.id === me.id ? p : s.remotes.get(pl.id);
          return v ? { x: v.x, y: v.y, color: pl.color, mine: pl.id === me.id } : null;
        }).filter(Boolean);
        drawMinimap(mini.getContext('2d'), mini.width, mini.height, s.view, s.t, level, dots);
      }
    }

    const stop = everyFrame(frame);
    window.__cohetes = s; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__cohetes === s) delete window.__cohetes; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ──────────────────────────────────────────────────────
  useEffect(() => {
    const s = sim.current;
    const set = (code, value) => {
      let used = false;
      for (const [name, codes] of Object.entries(KEYS)) if (codes.includes(code)) { s.input[name] = value; used = true; }
      return used;
    };
    const down = (e) => { if (e.target instanceof HTMLInputElement) return; if (set(e.code, true)) e.preventDefault(); };
    const up = (e) => set(e.code, false);
    const blur = () => Object.assign(s.input, { left: false, right: false, shoot: false });
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', blur); };
  }, []);

  function onPointer(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    Object.assign(sim.current.mouse, { x: e.clientX - rect.left, y: e.clientY - rect.top, in: true });
  }

  // ─── Pantalla ──────────────────────────────────────────────────────────────
  const m = room.match;
  const left = alivePlayers(room).length;
  const mine = findPlayer(room, me.id);
  const feed = (m?.deaths || []).slice(-5).reverse().map((d) => {
    const victim = findPlayer(room, d.id), by = d.by ? findPlayer(room, d.by) : null;
    return { k: d.id, text: by ? `${by.name} 💥 ${victim?.name || '¿?'}` : `${victim?.name || '¿?'} se hundió` };
  });
  const rising = hud.started && hud.elapsed > 15;
  return (
    <div className="ck-stage" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        className="ck-canvas"
        data-cohetes-canvas
        onPointerMove={onPointer}
        onPointerDown={(e) => { onPointer(e); if (e.button === 0) sim.current.input.shoot = true; e.currentTarget.setPointerCapture?.(e.pointerId); }}
        onPointerUp={(e) => { if (e.button === 0) sim.current.input.shoot = false; }}
        onContextMenu={(e) => e.preventDefault()}
      />
      <canvas ref={miniRef} className="ck-mini" width={260} height={72} />
      <div className="ck-top">
        <span className="ck-left" data-left>🤖 Quedan {left}</span>
        <span className="ck-coins">🪙 {mine?.coins || 0}</span>
        <span className="ck-kills">💥 {mine?.kills || 0}</span>
      </div>
      <ul className="ck-feed">{feed.map((f) => <li key={f.k}>{f.text}</li>)}</ul>
      {!hud.dead && (
        <div className="ck-bottom">
          <div className="ck-hp"><i style={{ width: `${hud.hp}%`, background: hud.hp > 35 ? '#7ad04f' : '#ff5a4f' }} /><span>{hud.hp}</span></div>
          <div className={`ck-weapon${hud.weapon !== 'rocket' ? ' is-special' : ''}`}>{WEAPONS[hud.weapon]?.name}{hud.weapon !== 'rocket' && ` ×${hud.ammo}`}</div>
        </div>
      )}
      {notice && <p className="ck-notice">{notice}</p>}
      {!hud.started && m && <div className="ck-countdown">{hud.countdown > 0 ? hud.countdown : '¡YA!'}</div>}
      {hud.started && hud.elapsed < 3 && <div className="ck-countdown is-go">¡YA!</div>}
      {rising && !hud.dead && hud.elapsed < 24 && <p className="ck-warning">🌊 ¡El agua empieza a subir!</p>}
      {hud.dead && mine && <div className="ck-dead"><strong>Quedaste afuera</strong><span>Puesto #{mine.place || left + 1} · mirando la partida</span></div>}
    </div>
  );
}
