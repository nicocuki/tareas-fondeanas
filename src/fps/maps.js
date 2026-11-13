// Fuego Cruzado: los mapas. Cada uno es una arena chica y cerrada, armada con los mismos sólidos que Royale 3D
// (`makeWorld` con un mapa propio), así sirven tal cual el movimiento, los choques y los tiros de `royale3d/sim.js`.
// Todo sale de la definición: no hay azar, y todas las pantallas arman el mismo mapa.
import { makeWorld } from '../royale3d/map.js';

export const FLOOR = 2;          // altura del piso de todas las arenas
const WALL_H = 7;                // las paredes del borde: no se ven por encima ni se saltan

// Cada mapa: medio ancho (hx) y medio largo (hz), un tinte de piso, lo que hay adentro (`build`), dónde aparece la
// gente (`spawns`) y dónde aparecen las armas (`guns`: arma y rareza).
export const MAPS = [
  {
    id: 'deposito',
    name: 'Depósito',
    blurb: 'Galpón de contenedores con pasarelas altas',
    hx: 22, hz: 22, tint: 'fps-concrete', wall: 'concrete',
    build(b) {
      // Contenedores en el medio, en cruz, con huecos para pasar.
      b.box(-7, -1.3, -1.5, 1.3, 2.6, 'container');
      b.box(1.5, -1.3, 7, 1.3, 2.6, 'containerB');
      b.box(-1.3, -8, 1.3, -3, 2.6, 'containerB');
      b.box(-1.3, 3, 1.3, 8, 2.6, 'container');
      b.box(-1.3, -8, 1.3, -5.5, 5.2, 'container', 2.6); // uno arriba de otro
      // Pasarelas a los costados, con rampa en cada punta.
      for (const sx of [-1, 1]) {
        const x0 = sx > 0 ? 15 : -19, x1 = sx > 0 ? 19 : -15;
        b.box(x0, -10, x1, 10, 2.6, 'metal');
        b.ramp(x0, x1, 10, 15, 2.6, 1 + 2);        // baja hacia +z: sube hacia -z
        b.ramp(x0, x1, -15, -10, 2.6, 1);          // sube hacia +z
        b.box(sx > 0 ? x0 : x1 - 0.3, -10, sx > 0 ? x0 + 0.3 : x1, 10, 3.6, 'metal', 2.6); // baranda del lado de adentro
      }
      // Cajas sueltas para cubrirse.
      for (const [x, z] of [[-10, -12], [10, 12], [-10, 12], [10, -12], [-6, 8], [6, -8], [-12, 0], [12, 0]]) b.crate(x, z, 1.2);
      b.crate(-10, -10.8, 1.2); b.crate(10, 10.8, 1.2); b.crate(-10, -12, 1.2, 1.2);
    },
    spawns: [[-19, -19], [19, 19], [-19, 19], [19, -19], [0, -19], [0, 19], [-12, -6], [12, 6]],
    guns: [['rifle', 1, 0, 0], ['sniper', 2, -17, 0], ['sniper', 2, 17, 0], ['smg', 1, -10, 6], ['smg', 1, 10, -6], ['shotgun', 1, 4, 4], ['shotgun', 1, -4, -4], ['revolver', 1, 0, 11], ['burst', 2, 0, -11]],
  },
  {
    id: 'pueblito',
    name: 'Pueblito',
    blurb: 'Casitas de adobe en el desierto, con arcos y callejones',
    hx: 26, hz: 20, tint: 'fps-sand', wall: 'sand',
    build(b) {
      // Casitas huecas con puerta (dos por lado) y techo plano para que no se vea desde arriba.
      b.hut(-15, -10, 8, 6, 's');
      b.hut(15, -10, 8, 6, 's');
      b.hut(-15, 10, 8, 6, 'n');
      b.hut(15, 10, 8, 6, 'n');
      b.hut(0, -13, 10, 6, 's');
      b.hut(0, 13, 10, 6, 'n');
      // Arcos y muros bajos en la calle del medio.
      for (const sx of [-1, 1]) {
        b.box(sx * 7 - 0.5, -4, sx * 7 + 0.5, -1.5, 3.2, 'sand');
        b.box(sx * 7 - 0.5, 1.5, sx * 7 + 0.5, 4, 3.2, 'sand');
        b.box(sx * 7 - 0.5, -4, sx * 7 + 0.5, 4, 3.8, 'sand', 3.2);
      }
      b.box(-2.5, -0.4, 2.5, 0.4, 1.1, 'sand');
      for (const [x, z] of [[-20, 5], [20, -5], [-10, 3], [10, -3], [-4, 6], [4, -6]]) b.crate(x, z, 1.2);
      b.cyl(-22, -16, 0.8, 2.4); b.cyl(22, 16, 0.8, 2.4);
    },
    spawns: [[-24, -18], [24, 18], [-23, 17], [23, -17], [-23, 0], [23, 0], [0, -6], [0, 6]],
    guns: [['rifle', 1, 0, 0], ['shotgun', 1, -15, -10], ['shotgun', 1, 15, 10], ['smg', 1, 15, -10], ['smg', 1, -15, 10], ['sniper', 2, 0, -13], ['burst', 2, 0, 13], ['revolver', 1, -20, 0], ['revolver', 1, 20, 0]],
  },
  {
    id: 'plaza',
    name: 'Plaza',
    blurb: 'Una plaza con fuente, columnas y dos torres en las esquinas',
    hx: 22, hz: 22, tint: 'fps-plaza', wall: 'brick',
    build(b) {
      // La fuente del medio y cuatro canteros bajos.
      b.cyl(0, 0, 2.6, 1.0, 'stone');
      b.cyl(0, 0, 0.6, 2.6, 'stone');
      for (const [x, z] of [[-7, -7], [7, 7], [-7, 7], [7, -7]]) b.box(x - 2, z - 0.5, x + 2, z + 0.5, 1.0, 'brick');
      // Columnas en anillo.
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; b.cyl(Math.cos(a) * 12, Math.sin(a) * 12, 0.6, 4, 'stone'); }
      // Dos torres en esquinas opuestas: plataforma alta con rampa y parapeto.
      for (const s of [-1, 1]) {
        const cx = s * 16, cz = s * 16;
        b.box(cx - 3, cz - 3, cx + 3, cz + 3, 3.2, 'brick');
        b.ramp(cx - 3, cx + 3, s > 0 ? cz - 9 : cz + 3, s > 0 ? cz - 3 : cz + 9, 3.2, s > 0 ? 1 : 3);
        b.box(cx - 3, s > 0 ? cz + 2.6 : cz - 3, cx + 3, s > 0 ? cz + 3 : cz - 2.6, 4.2, 'brick', 3.2);
        b.box(s > 0 ? cx + 2.6 : cx - 3, cz - 3, s > 0 ? cx + 3 : cx - 2.6, cz + 3, 4.2, 'brick', 3.2);
      }
      for (const [x, z] of [[-16, 6], [16, -6], [6, -16], [-6, 16], [-18, -12], [18, 12]]) b.crate(x, z, 1.3);
    },
    spawns: [[-20, -2], [20, 2], [2, -20], [-2, 20], [-20, 20], [20, -20], [-10, -18], [10, 18]],
    guns: [['sniper', 2, 16, 16], ['sniper', 2, -16, -16], ['rifle', 1, 0, 5], ['rifle', 1, 0, -5], ['shotgun', 1, -12, 0], ['shotgun', 1, 12, 0], ['smg', 1, 0, 14], ['smg', 1, 0, -14], ['burst', 2, -14, 14]],
  },
];
export const MAP_IDS = MAPS.map((m) => m.id);
export const mapById = (id) => MAPS.find((m) => m.id === id) || MAPS[0];

// Arma el mundo de un mapa. Las piezas no se rompen (hp 0), como en los shooters de arenas.
export function makeArena(id) {
  const def = mapById(id);
  const worldR = Math.max(def.hx, def.hz) + 8;
  return makeWorld(1, 'arena', {
    R: worldR, worldR,
    height: () => FLOOR,
    stamp(w) {
      const y = FLOOR;
      const b = {
        box: (x0, z0, x1, z1, h, mat = 'concrete', base = 0) => w.addBox(x0, x1, z0, z1, y + base - (base ? 0 : 0.5), y + h, { mat, hp: 0 }),
        crate: (x, z, s, base = 0) => w.addBox(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y + base, y + base + s, { mat: 'crate', hp: 0 }),
        cyl: (x, z, r, h, mat = 'stone') => { w.addCyl(x, z, r, y - 0.3, y + h, { mat, hp: 0 }); w.props.push({ k: 'pillar', x, z, y, r, h, mat }); },
        ramp: (x0, x1, z0, z1, rise, dir) => w.addRamp(x0, x1, z0, z1, y, rise, dir % 4, { mat: 'wood', hp: 0 }),
        // Una casita hueca: cuatro paredes, una puerta en el lado `door` y techo plano.
        hut: (cx, cz, ww, dd, door) => {
          const t = 0.4, h = 3.2, gap = 1.8;
          const x0 = cx - ww / 2, x1 = cx + ww / 2, z0 = cz - dd / 2, z1 = cz + dd / 2;
          const side = (sx0, sz0, sx1, sz1, horiz, here) => {
            if (!here) { b.box(sx0, sz0, sx1, sz1, h, 'plaster'); return; }
            const mid = horiz ? (sx0 + sx1) / 2 : (sz0 + sz1) / 2;
            if (horiz) { b.box(sx0, sz0, mid - gap / 2, sz1, h, 'plaster'); b.box(mid + gap / 2, sz0, sx1, sz1, h, 'plaster'); b.box(mid - gap / 2, sz0, mid + gap / 2, sz1, h, 'plaster', 2.4); } else { b.box(sx0, sz0, sx1, mid - gap / 2, h, 'plaster'); b.box(sx0, mid + gap / 2, sx1, sz1, h, 'plaster'); b.box(sx0, mid - gap / 2, sx1, mid + gap / 2, h, 'plaster', 2.4); }
          };
          side(x0, z0, x1, z0 + t, true, door === 'n');
          side(x0, z1 - t, x1, z1, true, door === 's');
          side(x0, z0 + t, x0 + t, z1 - t, false, door === 'o');
          side(x1 - t, z0 + t, x1, z1 - t, false, door === 'e');
          w.addBox(x0 - 0.3, x1 + 0.3, z0 - 0.3, z1 + 0.3, y + h, y + h + 0.3, { mat: 'sand', hp: 0, roof: true, gable: 0 });
        },
      };
      // El borde: cuatro paredes altas.
      const { hx, hz, wall } = def;
      w.addBox(-hx - 1, hx + 1, -hz - 1, -hz, y - 1, y + WALL_H, { mat: wall, hp: 0 });
      w.addBox(-hx - 1, hx + 1, hz, hz + 1, y - 1, y + WALL_H, { mat: wall, hp: 0 });
      w.addBox(-hx - 1, -hx, -hz, hz, y - 1, y + WALL_H, { mat: wall, hp: 0 });
      w.addBox(hx, hx + 1, -hz, hz, y - 1, y + WALL_H, { mat: wall, hp: 0 });
      def.build(b);
      w.places.push({ id: def.tint, name: def.name, x: 0, z: 0, r: Math.hypot(hx, hz) + 6, y });
    },
  });
}

// Las armas del mapa: cada una con su clave (`s0`, `s1`…), y si ya la agarró alguien, cuándo vuelve a aparecer.
export const GUN_RESPAWN_MS = 20000;
export const gunsOf = (id) => mapById(id).guns.map(([w, r, x, z], i) => ({ key: `s${i}`, w, r, x, z }));
export const gunReady = (took, key, now) => !took?.[key] || now - took[key] >= GUN_RESPAWN_MS;
