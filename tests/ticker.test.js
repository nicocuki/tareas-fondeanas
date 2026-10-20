import test from 'node:test';
import assert from 'node:assert/strict';
import { backgroundInterval, backgroundTimeout } from '../src/ticker.js';

test('ticker: sin Worker (Node) los relojes andan como setInterval y setTimeout', async () => {
  let ticks = 0, fired = 0, cancelled = 0;
  const stop = backgroundInterval(() => { ticks += 1; }, 10);
  backgroundTimeout(() => { fired += 1; }, 15);
  const cancel = backgroundTimeout(() => { cancelled += 1; }, 15);
  cancel();
  await new Promise((r) => setTimeout(r, 80));
  stop();
  const after = ticks;
  await new Promise((r) => setTimeout(r, 40));
  assert.ok(after >= 3, 'el intervalo corrió varias veces');
  assert.equal(ticks, after, 'cortado, no corre más');
  assert.equal(fired, 1);
  assert.equal(cancelled, 0);
});
