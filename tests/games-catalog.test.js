import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, GAMES_3D, MENU_GAMES, categoryOf, gamesOf, searchGames } from '../src/ui/games.js';

test('portada: todos los juegos del menú tienen una categoría que existe, y los 3D van en Tareas 3D', () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const g of MENU_GAMES) assert.ok(ids.has(categoryOf(g)), g.id);
  assert.equal(CATEGORIES.reduce((n, c) => n + gamesOf(c.id).length, 0), MENU_GAMES.length, 'ninguno queda afuera ni repetido');
  assert.deepEqual(GAMES_3D.map((g) => g.id).sort(), ['fps', 'pista', 'royale3d', 'timba']);
  for (const c of CATEGORIES) assert.ok(gamesOf(c.id).length > 0, `${c.id} tiene juegos`);
});

test('portada: el buscador no distingue tildes ni mayúsculas y pone primero los que coinciden en el nombre', () => {
  assert.equal(searchGames('CODIGO')[0].id, 'codigo-secreto');
  assert.equal(searchGames('casino')[0].id, 'timba');
  assert.ok(searchGames('dados').some((g) => g.id === 'generala'));
  assert.ok(searchGames('mesa').some((g) => g.id === 'monopoly'), 'también busca por categoría');
  assert.equal(searchGames('').length, MENU_GAMES.length);
  assert.equal(searchGames('zarpadisimo xyz').length, 0);
});
