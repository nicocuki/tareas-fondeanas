// Roba la bandera, sin React ni red: dónde aparece cada uno, y cuándo se llega a una bandera.
// Quién lleva cada bandera y el marcador viven en la sala (`room.match.flags` y `room.match.score`, ver game.js);
// acá solo está lo que decide cada pantalla con su propio tanque.
import { TANK_R, overlaps } from './sim.js';
import { TOP, solid } from './terrain.js';

export const RESPAWN_S = 4;        // lo que tarda en reaparecer el que lo eliminan
export const FLAG_REACH = 16;      // a qué distancia agarrás una bandera o la dejás en tu base
export const FLAG_RISE = 9;        // la bandera está parada un poco arriba de la plataforma

// Dónde está parada la bandera de una base.
export const flagPos = (base) => ({ x: base.x, y: base.y - FLAG_RISE });
export const nearFlag = (p, base, reach = FLAG_REACH) => { const f = flagPos(base); return Math.hypot(p.x - f.x, p.y - f.y) < reach; };

// Un lugar para aparecer: del lado de su equipo (el 0 a la izquierda, el 1 a la derecha), a una altura al azar, que
// no esté adentro de la tierra y que tenga suelo abajo (para que no se caiga al agua). Si no encuentra, arriba de su base.
export function spawnSpot(t, team, rand = Math.random) {
  const span = (t.W - 240) * 0.38;
  for (let i = 0; i < 90; i++) {
    const off = 130 + rand() * span;
    const x = team === 0 ? off : t.W - off;
    const y = TOP + 20 + rand() * (t.H - TOP - 260);
    if (overlaps(t, x, y, TANK_R + 8)) continue;
    for (let d = 8; d <= 220; d += 8) if (solid(t, x, y + d)) return { x, y };
  }
  const b = t.bases[team];
  return { x: b.x, y: b.y - 20 };
}

// Quién gana por puntos: 0, 1 o null si empatan.
export const leader = (score) => (score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null);
