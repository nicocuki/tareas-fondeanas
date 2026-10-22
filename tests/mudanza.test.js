import test from 'node:test';
import assert from 'node:assert/strict';
import { ROOTS, writeError } from '../worker/rules.js';
import { GAMES, gameById, playersProblem } from '../src/ui/games.js';

test('mudanza/{sala} solo acepta «juego/CÓDIGO» o null', () => {
  assert.ok(ROOTS.includes('mudanza'));
  assert.equal(writeError(['mudanza', 'ABCD'], 'u', 'cohetes/WXYZ', null), null);
  assert.equal(writeError(['mudanza', 'ABCD'], 'u', 'codigo-secreto/WXYZ', null), null);
  assert.equal(writeError(['mudanza', 'ABCD'], 'u', null, null), null);
  assert.ok(writeError(['mudanza', 'ABCD'], 'u', 'cohetes/wxyz', null));
  assert.ok(writeError(['mudanza', 'ABCD'], 'u', 'https://otro.sitio/WXYZ', null));
  assert.ok(writeError(['mudanza', 'ABCD'], 'u', { game: 'cohetes' }, null));
  assert.ok(writeError(['mudanza', 'ABCD', 'x'], 'u', 'cohetes/WXYZ', null));
});

test('cambiar de juego: cada juego con salas dice cuántos entran, y se explica por qué no se puede', () => {
  for (const g of GAMES.filter((x) => x.lobby !== false)) assert.ok(g.min >= 1 && g.max >= g.min, g.id);
  assert.equal(playersProblem(gameById('cohetes'), 5), null);
  assert.equal(playersProblem(gameById('nave'), 3), 'Hacen falta al menos 4 y son 3.');
  assert.equal(playersProblem(gameById('nave'), 11), 'Entran hasta 10 y son 11.');
  assert.equal(playersProblem(gameById('cafe-o-te'), 5), 'Es de 4 justos y son 5.');
  assert.equal(playersProblem(gameById('cafe-o-te'), 4), null);
  assert.equal(gameById('mvl').lobby, false, 'Mario vs Luigi no usa nuestras salas');
});
