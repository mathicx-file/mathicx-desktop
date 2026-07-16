import assert from 'node:assert/strict';
import test from 'node:test';

import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;
globalThis.window = { indexedDB };

const { explorerProvider } = await import(`./fs-store.js?scope-test=${Date.now()}`);

test('keeps guest files separate from the default filesystem', async () => {
  explorerProvider.setScope('local');
  await explorerProvider.seed();
  const localFile = await explorerProvider.create({ type: 'doc', name: 'Conta.txt' });

  explorerProvider.setScope('guest-local-v1');
  await explorerProvider.seed();
  assert.equal(await explorerProvider.getById(localFile.id), undefined);
  assert.equal((await explorerProvider.search('Conta')).length, 0);

  const guestFile = await explorerProvider.create({ type: 'doc', name: 'Visitante.txt' });
  assert.equal((await explorerProvider.search('Visitante')).length, 1);

  await explorerProvider.clearCurrentScope();
  assert.equal(await explorerProvider.getById(guestFile.id), undefined);

  explorerProvider.setScope('local');
  assert.equal((await explorerProvider.getById(localFile.id))?.name, 'Conta.txt');
});
