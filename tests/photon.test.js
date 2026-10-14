import test from 'node:test';
import assert from 'node:assert/strict';
import { mvlTarget, photonTarget } from '../worker/photon.js';

test('puente de Photon: reenvía a los servidores de Photon con la misma ruta y consulta', () => {
  assert.equal(photonTarget('/api/photon/ns.photonengine.io/', '?libversion=5.1.15.0&app=097c581c'),
    'https://ns.photonengine.io/?libversion=5.1.15.0&app=097c581c');
  assert.equal(photonTarget('/api/photon/gcsp1022.exitgames.com/Master/', ''), 'https://gcsp1022.exitgames.com/Master/');
  assert.equal(photonTarget('/api/photon/GCSP1022.exitgames.com:19091/Game/', ''), 'https://gcsp1022.exitgames.com:19091/Game/');
  assert.equal(photonTarget('/api/photon/ns.photonengine.io', ''), 'https://ns.photonengine.io/');
});

test('puente de Photon: no sirve de proxy para cualquier otro sitio', () => {
  for (const host of ['example.com', 'photonengine.io.evil.com', 'evilexitgames.com', 'exitgames.com@evil.com', 'localhost', '127.0.0.1']) {
    assert.equal(photonTarget(`/api/photon/${host}/`, ''), null, host);
  }
  assert.equal(photonTarget('/api/photon/', ''), null);
});

test('puente de Mario vs Luigi: solo autenticación, novedades y avisos de desincronización', () => {
  assert.equal(mvlTarget('/api/mvl/auth/init', '?&args=0'), 'https://mariovsluigi.azurewebsites.net/auth/init?&args=0');
  assert.equal(mvlTarget('/api/mvl/news', ''), 'https://mariovsluigi.azurewebsites.net/news');
  assert.equal(mvlTarget('/api/mvl/news/all', ''), 'https://mariovsluigi.azurewebsites.net/news/all');
  assert.equal(mvlTarget('/api/mvl/desync', '?roomId=A'), 'https://mariovsluigi.azurewebsites.net/desync?roomId=A');
  assert.equal(mvlTarget('/api/mvl/discord', ''), null);
  assert.equal(mvlTarget('/api/mvl/../admin', ''), null);
});
