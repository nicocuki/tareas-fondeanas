// La partida de Royale 3D en tiempo real: dibujo con Three.js, teclado y mouse, y la conexión con los demás.
//
// Mismo esquema que Pixel Royale y Bombardero: cada pantalla es dueña de su jugador (lo mueve, lleva su
// vida y avisa a la sala cuando muere) y manda su foto directo a los demás (WebRTC) o, si no se puede,
// por el servidor. **Los tiros los juzga la pantalla de quien tira** (con lo que ve en su pantalla: así
// pegar se siente justo) y viajan en la foto (`sh`); la pantalla de quien recibe el tiro es la que se
// resta la vida. Entre amigos alcanza; no es a prueba de trampas.
import React, { useEffect, useRef, useState } from 'react';
import { backend } from '../storage.js';
import { everyFrame } from '../ticker.js';
import { createMesh } from '../futbol/p2p.js';
import { STORM_PHASES, makeWorld, spawnPoint, stormAt, stormCenters } from './map.js';
import { MAG, STEP, aimShot, damageFor, finishReload, groundPlayer, hitscan, newPlayer, rayLength, startReload, stepPlayer, tryShoot } from './sim.js';
import { COLORS, alive as alivePlayers, findPlayer, stormSpeed } from './game.js';

const SEND_EVERY = 1 / 30;
const SERVER_EVERY = 1 / 15;
const EVENT_KEEP = 1.2;     // segundos que un disparo sigue viajando en las fotos
const GONE_AFTER = 12;      // sin fotos de alguien, el anfitrión lo da por muerto
const LAST_HIT_S = 8;       // cuánto tiempo después de un golpe cuenta como «lo mató»
const SENS = 0.0022;
const KEYS = { f: ['KeyW', 'ArrowUp'], b: ['KeyS', 'ArrowDown'], l: ['KeyA', 'ArrowLeft'], r: ['KeyD', 'ArrowRight'], jump: ['Space'], sprint: ['ShiftLeft', 'ShiftRight'] };
const r2 = (v) => Math.round(v * 100) / 100;
const r1 = (v) => Math.round(v * 10) / 10;

export default function Royale3DGame({ room, me, code, offset, onDispatch }) {
  const canvasRef = useRef(null);
  const miniRef = useRef(null);
  const roomRef = useRef(room);
  const dispatchRef = useRef(onDispatch);
  const offsetRef = useRef(offset);
  roomRef.current = room;
  dispatchRef.current = onDispatch;
  offsetRef.current = offset;
  const m = room.match;
  const [hud, setHud] = useState({ hp: 100, ammo: MAG, reloading: false, storm: null, left: 0, locked: false, dead: false, count: 0, hit: 0, outside: false, loading: true });
  const sim = useRef({
    input: { f: false, b: false, l: false, r: false, jump: false, sprint: false }, fire: false, reload: false,
    remotes: new Map(), seen: new Set(), lastSeen: new Map(), goneSent: new Set(), myShots: [], shotK: 0, lastBy: null, lastByAt: 0,
    hits: 0, sentAt: 0, serverAt: 0, watch: null,
  }).current;
  const serverNow = () => (Date.now() + offsetRef.current) / 1000;
  const matchN = m?.n;

  // ─── La isla y el jugador de esta partida ───────────────────────────────────
  useEffect(() => {
    const match = roomRef.current.match;
    if (!match) return undefined;
    const world = makeWorld(match.seed);
    const centers = stormCenters(match.seed);
    const index = Math.max(0, match.order.indexOf(me.id));
    const local = groundPlayer(match.seed, newPlayer(spawnPoint(match.seed, index, match.size, world)));
    Object.assign(sim, { world, centers, n: match.n, seed: match.seed, local, scene: null, remotes: new Map(), seen: new Set(), lastSeen: new Map(), goneSent: new Set(), myShots: [], shotK: 0, lastBy: null, hits: 0, mountedAt: performance.now() / 1000, watch: null });
    let dead = false;
    import('./render.js').then((mod) => {
      if (dead || !canvasRef.current) return;
      sim.scene = mod.createScene(canvasRef.current, match.seed, world);
      setHud((h) => ({ ...h, loading: false }));
    });
    return () => { dead = true; sim.scene?.dispose(); sim.scene = null; };
  }, [matchN, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Red ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const chan = backend.royale3dChannel(code);
    const onSnap = (id, raw) => {
      if (id === me.id || !raw) return;
      let snap = raw;
      if (typeof raw === 'string') { try { snap = JSON.parse(raw); } catch { return; } }
      if (snap.n !== sim.n || !sim.local) return;
      const prev = sim.remotes.get(id);
      sim.lastSeen.set(id, performance.now() / 1000);
      if (!prev || snap.t > prev.snap.t) {
        const jump = !prev || Math.hypot(snap.x - prev.x, snap.z - prev.z) > 6;
        sim.remotes.set(id, { snap, x: jump ? snap.x : prev.x, y: jump ? snap.y : prev.y, z: jump ? snap.z : prev.z, yaw: jump ? snap.yw : prev.yaw, pitch: snap.pt });
      }
      const now = serverNow();
      for (const ev of snap.sh || []) {
        const key = `${id}:${ev.k}`;
        if (sim.seen.has(key) || now - ev.t > EVENT_KEEP) continue;
        sim.seen.add(key);
        const o = { x: ev.o[0], y: ev.o[1], z: ev.o[2] };
        sim.scene?.tracer({ x: o.x + ev.d[0] * 1.2, y: o.y - 0.25 + ev.d[1] * 1.2, z: o.z + ev.d[2] * 1.2 }, { x: o.x + ev.d[0] * ev.l, y: o.y + ev.d[1] * ev.l, z: o.z + ev.d[2] * ev.l });
        // Si el tiro me da a mí, me resto la vida.
        const p = sim.local;
        if (ev.h && ev.h[0] === me.id && p && !p.dead && now * 1000 >= roomRef.current.match.startsAt) {
          p.hp -= damageFor(ev.h[1] === 1);
          sim.lastBy = id; sim.lastByAt = now;
        }
      }
    };
    const mesh = createMesh({ signaling: chan.signaling, myId: me.id, onMessage: onSnap });
    sim.mesh = mesh;
    sim.chan = chan;
    chan.leaveOnDisconnect(me.id).catch(() => {});
    const off = chan.subscribe(onSnap);
    return () => { off(); mesh?.close(); chan.remove(me.id).catch(() => {}); sim.mesh = null; sim.chan = null; };
  }, [code, me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Bucle principal ────────────────────────────────────────────────────────
  useEffect(() => {
    let last = performance.now() / 1000;
    let acc = 0;
    let hudAt = 0;
    let miniAt = 0;

    function shoot(now) {
      const p = sim.local;
      if (!tryShoot(p, now)) return;
      const { o, d } = aimShot(sim.world, p);
      const targets = [];
      for (const pl of alivePlayers(roomRef.current)) {
        const rem = sim.remotes.get(pl.id);
        if (pl.id !== me.id && rem && !rem.snap.dd) targets.push({ id: pl.id, x: rem.x, y: rem.y, z: rem.z });
      }
      const hit = hitscan(sim.world, o, d, targets);
      const len = hit ? hit.dist : rayLength(sim.world, o, d);
      const ev = { k: ++sim.shotK, t: now, o: [r2(o.x), r2(o.y), r2(o.z)], d: [r2(d.x), r2(d.y), r2(d.z)], l: r1(len), ...(hit ? { h: [hit.id, hit.head ? 1 : 0] } : {}) };
      sim.myShots.push(ev);
      sim.scene?.tracer({ x: o.x + d.x * 1.2, y: o.y - 0.25 + d.y * 1.2, z: o.z + d.z * 1.2 }, { x: o.x + d.x * len, y: o.y + d.y * len, z: o.z + d.z * len });
      if (hit) sim.hits += 1;
    }

    function step(now) {
      const r = roomRef.current;
      const match = r.match;
      const p = sim.local;
      if (!match || !p) return;
      const started = now * 1000 >= match.startsAt;
      if (!p.dead && r.phase === 'playing' && started) {
        stepPlayer(p, { ...sim.input, jump: sim.input.jump }, STEP, sim.world);
        finishReload(p, now);
        if (sim.reload) { startReload(p, now); sim.reload = false; }
        if (sim.fire) shoot(now);
        // La tormenta.
        const st = stormAt(match.seed, now - match.startsAt / 1000, stormSpeed(r), sim.centers);
        if (Math.hypot(p.x - st.x, p.z - st.z) > st.r) { p.hp -= st.dps * STEP; sim.outside = true; } else sim.outside = false;
        if (p.hp <= 0) {
          p.hp = 0; p.dead = true;
          const by = sim.lastBy && now - sim.lastByAt < LAST_HIT_S ? sim.lastBy : null;
          dispatchRef.current({ type: 'died', match: match.n, by, w: by ? 'player' : 'storm' });
        }
      }
    }

    function frame({ hidden } = {}) {
      const now = serverNow();
      const t = performance.now() / 1000;
      const dt = Math.min(0.1, t - last);
      last = t;
      const r = roomRef.current;
      const match = r.match;
      const p = sim.local;
      if (!match || !p) return;
      acc += dt;
      while (acc >= STEP) { step(now - acc + STEP); acc -= STEP; }
      sim.input.jump = false;

      // Mandar la foto.
      if (now - sim.sentAt >= SEND_EVERY) {
        sim.sentAt = now;
        sim.myShots = sim.myShots.filter((e) => now - e.t < EVENT_KEEP);
        const snap = { n: match.n, t: now, x: r2(p.x), y: r2(p.y), z: r2(p.z), yw: r2(p.yaw), pt: r2(p.pitch), hp: Math.round(p.hp), mv: p.moving ? 1 : 0, dd: p.dead ? 1 : 0, sh: sim.myShots };
        sim.mesh?.broadcast(snap);
        const others = r.players.filter((pl) => pl.id !== me.id);
        const needServer = !sim.mesh || others.some((pl) => !sim.mesh.isOpen(pl.id));
        if (needServer && now - sim.serverAt >= SERVER_EVERY && sim.chan) {
          sim.serverAt = now;
          sim.chan.publish(me.id, JSON.stringify(snap)).catch(() => {});
        }
        // El anfitrión da por muerto al que dejó de mandar fotos (pestaña cerrada sin salir).
        if (r.hostId === me.id && r.phase === 'playing' && now > match.startsAt / 1000 + GONE_AFTER) {
          for (const pl of alivePlayers(r)) {
            if (pl.id === me.id || sim.goneSent.has(pl.id)) continue;
            if (t - (sim.lastSeen.get(pl.id) ?? sim.mountedAt) > GONE_AFTER) { sim.goneSent.add(pl.id); dispatchRef.current({ type: 'died', target: pl.id, match: match.n }); }
          }
        }
      }

      // Los demás se acercan a su última foto.
      const k = Math.min(1, dt * 14);
      for (const rem of sim.remotes.values()) {
        rem.x += (rem.snap.x - rem.x) * k; rem.y += (rem.snap.y - rem.y) * k; rem.z += (rem.snap.z - rem.z) * k;
        let dy = rem.snap.yw - rem.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); rem.yaw += dy * k;
      }

      const st = stormAt(match.seed, Math.max(0, now - match.startsAt / 1000), stormSpeed(r), sim.centers);
      // A quién sigue la cámara: a uno mismo, o (si se murió) a alguien que siga en pie.
      let focus = p;
      if (p.dead) {
        const target = alivePlayers(r).find((pl) => pl.id === (sim.watch || '') && pl.id !== me.id) || alivePlayers(r).find((pl) => pl.id !== me.id);
        const rem = target && sim.remotes.get(target.id);
        if (rem) { sim.watch = target.id; focus = { x: rem.x, y: rem.y, z: rem.z, yaw: rem.yaw, pitch: rem.pitch || 0 }; }
      }

      if (!hidden && sim.scene) {
        for (const pl of r.players) {
          if (pl.id === me.id) { sim.scene.setAvatar(pl.id, pl.name, COLORS[pl.color], { x: p.x, y: p.y, z: p.z, yaw: p.yaw, dead: p.dead, self: true }); continue; }
          const rem = sim.remotes.get(pl.id);
          sim.scene.setAvatar(pl.id, pl.name, COLORS[pl.color], rem && pl.alive ? { x: rem.x, y: rem.y, z: rem.z, yaw: rem.yaw, dead: rem.snap.dd } : null);
        }
        sim.scene.draw(focus, st, dt);
      }

      if (t - hudAt > 0.1) {
        hudAt = t;
        const next = STORM_PHASES[Math.min(st.phase, STORM_PHASES.length - 1)];
        setHud({
          hp: Math.max(0, Math.ceil(p.hp)), ammo: p.ammo, reloading: now < p.reloadUntil, dead: p.dead, loading: !sim.scene,
          storm: { phase: st.phase, shrinking: st.shrinking, next: Math.ceil(st.next), r: Math.round(st.r), final: st.phase >= STORM_PHASES.length, dps: st.dps, target: next.r },
          count: Math.max(0, Math.ceil(match.startsAt / 1000 - now)), locked: document.pointerLockElement === canvasRef.current, hit: sim.hits, outside: Boolean(sim.outside),
        });
      }
      if (miniRef.current && t - miniAt > 0.15) { miniAt = t; drawMini(miniRef.current, sim, st, p); }
    }

    sim.frame = frame;
    const stop = everyFrame(frame);
    window.__royale3d = sim; // para manejar la partida desde un navegador automatizado
    return () => { stop(); if (window.__royale3d === sim) delete window.__royale3d; };
  }, [me.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Teclado y mouse ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const down = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      let used = true;
      if (named) sim.input[named[0]] = true;
      else if (e.code === 'KeyR') sim.reload = true;
      else used = false;
      if (used) e.preventDefault();
    };
    const up = (e) => {
      const named = Object.entries(KEYS).find(([, codes]) => codes.includes(e.code));
      if (named && named[0] !== 'jump') sim.input[named[0]] = false;
      if (named && named[0] === 'jump') sim.input.jump = false;
    };
    const move = (e) => {
      if (document.pointerLockElement !== canvas || !sim.local) return;
      sim.local.yaw -= e.movementX * SENS;
      sim.local.pitch = Math.max(-1.25, Math.min(1.25, sim.local.pitch - e.movementY * SENS));
    };
    const mdown = (e) => { if (e.button === 0 && document.pointerLockElement === canvas) sim.fire = true; };
    const mup = (e) => { if (e.button === 0) sim.fire = false; };
    const blur = () => { Object.keys(sim.input).forEach((k) => { sim.input[k] = false; }); sim.fire = false; };
    const resize = () => sim.scene?.resize();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('mousemove', move);
    window.addEventListener('mousedown', mdown);
    window.addEventListener('mouseup', mup);
    window.addEventListener('blur', blur);
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('mousemove', move);
      window.removeEventListener('mousedown', mdown); window.removeEventListener('mouseup', mup); window.removeEventListener('blur', blur); window.removeEventListener('resize', resize);
      if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const lock = () => { try { canvasRef.current?.requestPointerLock?.(); } catch {} };
  const mine = findPlayer(room, me.id);
  const aliveCount = alivePlayers(room).length;
  const feed = [...(m?.deaths || [])].slice(-4).reverse();
  const nameOf = (id) => findPlayer(room, id)?.name || '¿?';
  const stormText = !hud.storm ? '' : hud.storm.final ? 'Zona final' : hud.storm.shrinking ? `La tormenta se achica · ${hud.storm.next} s` : `La tormenta se cierra en ${hud.storm.next} s`;

  return (
    <div className="r3-stage" data-royale3d>
      <canvas ref={canvasRef} className="r3-canvas" data-royale3d-canvas onClick={lock} />
      <div className="r3-crosshair" aria-hidden="true" />
      {hud.hit > 0 && <div key={hud.hit} className="r3-hitmark" aria-hidden="true" />}
      <div className="r3-top">
        <span className="r3-pill" data-alive>👥 {aliveCount} en pie</span>
        <span className="r3-pill r3-storm" data-storm>🌀 {stormText}</span>
        <span className="r3-pill">🎯 {mine?.kills || 0}</span>
      </div>
      <div className="r3-feed" data-feed>
        {feed.map((d, i) => <p key={`${d.id}-${i}`}>{d.by ? <><b>{nameOf(d.by)}</b> eliminó a <b>{nameOf(d.id)}</b></> : d.w === 'storm' ? <><b>{nameOf(d.id)}</b> cayó en la tormenta</> : <><b>{nameOf(d.id)}</b> quedó afuera</>}</p>)}
      </div>
      <canvas ref={miniRef} className="r3-mini" width="150" height="150" aria-label="Mapa" />
      <div className="r3-bottom">
        <div className="r3-hp" data-hp={hud.hp}><i style={{ width: `${hud.hp}%` }} /><span>{hud.hp}</span></div>
        <div className="r3-ammo" data-ammo={hud.ammo}>{hud.reloading ? 'Recargando…' : `🔫 ${hud.ammo} / ${MAG}`}</div>
      </div>
      {hud.outside && !hud.dead && <div className="r3-warn">⚠ Estás en la tormenta: volvé a la zona segura</div>}
      {hud.loading && <div className="r3-center">Cargando la isla…</div>}
      {!hud.loading && hud.count > 0 && <div className="r3-center r3-count" data-count={hud.count}>{hud.count}</div>}
      {!hud.loading && hud.count === 0 && !hud.locked && !hud.dead && (
        <button type="button" className="r3-center r3-lock" onClick={lock}>Hacé clic para jugar<small>WASD moverte · mouse apuntar · clic disparar · Espacio saltar · Shift correr · R recargar · Esc soltar el mouse</small></button>
      )}
      {hud.dead && <div className="r3-center r3-dead" data-dead>Quedaste afuera<small>Mirás a alguien que sigue en pie…</small></div>}
    </div>
  );
}

// Mapa chico: la isla, la zona segura (círculo violeta) y la que viene (blanco), y vos.
function drawMini(cv, s, st, p) {
  const g = cv.getContext('2d');
  const W = cv.width, R = 80, k = (W / 2) / R;
  const X = (x) => W / 2 + x * k, Z = (z) => W / 2 + z * k;
  g.clearRect(0, 0, W, W);
  g.fillStyle = 'rgba(20,40,70,0.7)'; g.fillRect(0, 0, W, W);
  g.fillStyle = '#6fb552'; g.beginPath(); g.arc(W / 2, W / 2, 62 * k, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#a56cff'; g.lineWidth = 2; g.beginPath(); g.arc(X(st.x), Z(st.z), Math.max(1, st.r * k), 0, Math.PI * 2); g.stroke();
  const next = s.centers?.[st.phase + 1];
  if (next) { g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(X(next.x), Z(next.z), Math.max(1, next.r * k), 0, Math.PI * 2); g.stroke(); }
  if (p) {
    g.save(); g.translate(X(p.x), Z(p.z)); g.rotate(-p.yaw);
    g.fillStyle = p.dead ? '#888' : '#ffd23f'; g.beginPath(); g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(-4, 5); g.closePath(); g.fill();
    g.restore();
  }
}
