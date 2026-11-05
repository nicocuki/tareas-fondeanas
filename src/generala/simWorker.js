// Generala: la física de cada tirada corre acá, en un Web Worker, y no en la página. Simular una tirada
// lleva ~45 ms (y la primera, con el motor frío, más de 150): hecha en la página, la pantalla se quedaba
// clavada justo en el momento de volcar el cubilete. Así la mesa sigue dibujando mientras tanto.
//
// Recibe { id, gesture, thrown } y contesta { id, result } (lo que devuelve `simulate`) o { id, error }.
import RAPIER from '@dimforge/rapier3d-deterministic-compat';
import { simulate } from './dice.js';

// Al arrancar se hace una tirada de práctica: deja el motor ya optimizado para la primera de verdad.
const ready = RAPIER.init().then(() => { simulate(RAPIER, { s: 1, x: 0, z: 50, a: 0, b: -1000, p: 50 }, [0, 1, 2, 3, 4]); });

self.onmessage = async ({ data }) => {
  const { id, gesture, thrown } = data;
  try {
    await ready;
    const result = simulate(RAPIER, gesture, thrown);
    self.postMessage({ id, result }, [result.frames.buffer]);
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
