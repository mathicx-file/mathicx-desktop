import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

import { sha256Hex } from '../js/dictionary/dictionary-cache-installer.js';
import { DictionaryCacheRepository } from '../js/dictionary/dictionary-cache-repository.js';
import { DictionaryStorageManager } from '../js/dictionary/dictionary-storage-manager.js';

const encoder = new TextEncoder();

test('separates dictionary cache usage from the browser origin estimate', async () => {
  const repository = createRepository('snapshot');
  await putFixture(repository, 'v1', 'essential.json', 120, null);
  await putFixture(repository, 'v2', 'core.json', 300, 'core');
  const manager = new DictionaryStorageManager({
    repository,
    minimumReserveBytes: 100,
    storage: {
      estimate: async () => ({ usage: 2000, quota: 10000 }),
      persisted: async () => true,
      persist: async () => true,
    },
  });

  const state = await manager.snapshot();
  assert.equal(state.dictionary.byteLength, 420);
  assert.equal(state.dictionary.byPackage.core.byteLength, 300);
  assert.deepEqual(state.estimate, {
    usage: 2000,
    quota: 10000,
    available: 8000,
    usageRatio: 0.2,
  });
  assert.equal(state.persisted, true);
  await repository.close();
});

test('subtracts resumable package bytes and rejects insufficient quota before download', async () => {
  const repository = createRepository('capacity');
  await putFixture(repository, 'v2', 'core-part.json', 300, 'core');
  const storage = {
    estimate: async () => ({ usage: 100, quota: 1000 }),
    persisted: async () => false,
  };
  const manager = new DictionaryStorageManager({ repository, storage, minimumReserveBytes: 100 });

  const accepted = await manager.assertCapacity(900, { version: 'v2', packageId: 'core' });
  assert.equal(accepted.cachedBytes, 300);
  assert.equal(accepted.additionalBytes, 600);
  assert.equal(accepted.canInstall, true);

  await assert.rejects(
    manager.assertCapacity(1200, { version: 'v2', packageId: 'core' }),
    (error) => error.name === 'QuotaExceededError'
      && error.code === 'dictionary-quota-preflight'
      && error.requiredBytes === 900,
  );
  await repository.close();
});

test('requests persistent storage only when the browser supports it', async () => {
  const repository = createRepository('persistence');
  let persisted = false;
  const manager = new DictionaryStorageManager({
    repository,
    storage: {
      estimate: async () => ({ usage: 0, quota: 1000 }),
      persisted: async () => persisted,
      persist: async () => { persisted = true; return true; },
    },
  });
  const granted = await manager.requestPersistence();
  assert.equal(granted.granted, true);
  assert.equal(granted.state.persisted, true);

  const unsupported = new DictionaryStorageManager({ repository, storage: {} });
  assert.deepEqual(
    await unsupported.requestPersistence(),
    { granted: false, supported: false, state: await unsupported.snapshot() },
  );
  await repository.close();
});

function createRepository(label) {
  return new DictionaryCacheRepository({
    indexedDB,
    dbName: `MathicxStorageManager-${label}-${Date.now()}-${Math.random()}`,
  });
}

async function putFixture(repository, version, name, byteLength, packageId) {
  const bytes = new Uint8Array(byteLength);
  const descriptor = {
    path: `fixtures/${version}/${name}`,
    byteLength,
    sha256: await sha256Hex(bytes, webcrypto),
  };
  await repository.putArtifact(version, descriptor, bytes, 'fixture', packageId);
}
