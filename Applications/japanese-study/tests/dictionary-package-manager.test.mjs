import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import { indexedDB } from 'fake-indexeddb';

import { sha256Hex } from '../js/dictionary/dictionary-cache-installer.js';
import { DictionaryCacheRepository } from '../js/dictionary/dictionary-cache-repository.js';
import {
  DictionaryPackageManager,
  validatePackageCatalog,
} from '../js/dictionary/dictionary-package-manager.js';

const encoder = new TextEncoder();
const dataUrl = new URL('https://dictionary.test/data/dictionary/');
const catalogUrl = new URL('packages/catalog.json', dataUrl);

test('validates the essential, core and full catalog contract', () => {
  const catalog = createCatalog();
  const normalized = validatePackageCatalog(catalog);

  assert.deepEqual(normalized.packages.map((item) => item.id), ['essential', 'core', 'full']);
  assert.equal(normalized.packages[0].required, true);
  assert.equal(normalized.packages[1].availability, 'planned');
  assert.throws(
    () => validatePackageCatalog({ ...catalog, packages: [catalog.packages[0], catalog.packages[0]] }),
    /duplicate dictionary package id/,
  );
});

test('installs, resumes and removes only optional package artifacts', async () => {
  const repository = createRepository('lifecycle');
  const fixture = await createAvailableFixture();
  let interrupt = true;
  const requests = new Map();
  const capacityChecks = [];
  const manager = new DictionaryPackageManager({
    repository,
    dataUrl,
    catalogUrl,
    crypto: webcrypto,
    storageManager: {
      assertCapacity: async (bytes, options) => capacityChecks.push({ bytes, options }),
    },
    fetchImpl: async (url) => {
      const path = relativePath(url);
      requests.set(path, (requests.get(path) || 0) + 1);
      if (interrupt && path === fixture.artifact.path) {
        return new Response('network unavailable', { status: 503 });
      }
      const bytes = fixture.files.get(path);
      return bytes ? new Response(bytes, { status: 200 }) : new Response('missing', { status: 404 });
    },
  });

  const personalDescriptor = await descriptor('personal/reference.json', { personal: true });
  await repository.putArtifact(fixture.version, personalDescriptor, personalDescriptor.bytes, 'entry-shard');
  await manager.loadCatalog();

  await assert.rejects(manager.install('core'), /HTTP 503/);
  assert.equal((await repository.getPackageState(fixture.version, 'core')).status, 'interrupted');
  assert.equal((await repository.getVersionArtifacts(fixture.version)).length, 2);

  interrupt = false;
  const installed = await manager.install('core');
  assert.equal(installed.status, 'ready');
  assert.equal(installed.reusedArtifacts, 1);
  assert.equal(capacityChecks.length, 4);
  assert.equal(capacityChecks[0].bytes, 1000);
  assert.deepEqual(capacityChecks[0].options, { version: fixture.version, packageId: 'core' });
  assert.equal((await manager.listPackages()).find((item) => item.id === 'core').installed, true);
  assert.equal(requests.get(fixture.manifestDescriptor.path), 2);

  const removed = await manager.remove('core');
  assert.equal(removed.removedArtifacts, 2);
  assert.equal(await repository.getPackageState(fixture.version, 'core'), null);
  const remaining = await repository.getVersionArtifacts(fixture.version);
  assert.deepEqual(remaining.map((item) => item.path), [personalDescriptor.path]);
  await repository.setPackageState(fixture.version, 'core', { status: 'ready' });
  await repository.deleteVersion(fixture.version);
  assert.equal(await repository.getPackageState(fixture.version, 'core'), null);
  await repository.close();
});

test('keeps the essential package installed and protected', async () => {
  const repository = createRepository('essential');
  const catalog = createCatalog();
  const manager = new DictionaryPackageManager({
    repository,
    dataUrl,
    catalogUrl,
    crypto: webcrypto,
    fetchImpl: async () => new Response(encoder.encode(`${JSON.stringify(catalog)}\n`), { status: 200 }),
  });
  const packages = await manager.loadCatalog();

  assert.equal(packages[0].status, 'online-only');
  assert.equal(packages[0].installed, true);
  assert.equal((await manager.install('essential')).status, 'included');
  await assert.rejects(manager.remove('essential'), /cannot be removed/);
  await repository.close();
});

test('reuses the cached catalog and reports essential offline readiness without network', async () => {
  const repository = createRepository('catalog-cache');
  const catalog = createCatalog();
  const online = new DictionaryPackageManager({
    repository,
    dataUrl,
    catalogUrl,
    crypto: webcrypto,
    fetchImpl: async () => new Response(encoder.encode(`${JSON.stringify(catalog)}\n`), { status: 200 }),
  });
  assert.equal((await online.loadCatalog())[0].catalogSource, 'network');

  await repository.setVersionState('2026.07.13-2', {
    status: 'ready',
    packageId: 'bootstrap-n5',
  });
  await repository.promoteVersion('2026.07.13-2');
  const offline = new DictionaryPackageManager({
    repository,
    dataUrl,
    catalogUrl,
    crypto: webcrypto,
    fetchImpl: async () => { throw new Error('offline'); },
  });
  const packages = await offline.loadCatalog();
  assert.equal(offline.catalogSource, 'cache');
  assert.equal(packages[0].status, 'offline-ready');
  assert.equal(packages[0].catalogSource, 'cache');
  await repository.close();
});

test('updates a package distribution revision while reusing unchanged artifacts', async () => {
  const repository = createRepository('distribution-revision');
  const first = await createAvailableFixture(1);
  const createManager = (fixture) => new DictionaryPackageManager({
    repository,
    dataUrl,
    catalogUrl,
    crypto: webcrypto,
    fetchImpl: async (url) => {
      const bytes = fixture.files.get(relativePath(url));
      return bytes ? new Response(bytes, { status: 200 }) : new Response('missing', { status: 404 });
    },
  });

  const initialManager = createManager(first);
  await initialManager.loadCatalog();
  assert.equal((await initialManager.install('core')).distributionRevision, 1);

  const second = await createAvailableFixture(2);
  const updateManager = createManager(second);
  const packages = await updateManager.loadCatalog();
  assert.equal(packages.find((item) => item.id === 'core').status, 'outdated');
  const updated = await updateManager.install('core');
  assert.equal(updated.distributionRevision, 2);
  assert.equal(updated.reusedArtifacts, 1);
  assert.equal(updated.downloadedArtifacts, 1);
  assert.equal((await repository.getPackageState(second.version, 'core')).status, 'ready');
  await repository.close();
});

function createRepository(label) {
  return new DictionaryCacheRepository({
    indexedDB,
    dbName: `MathicxPackageManager-${label}-${Date.now()}-${Math.random()}`,
  });
}

function createCatalog(overrides = {}) {
  return {
    format: 'mathicx-japanese-dictionary-package-catalog',
    schemaVersion: 1,
    dictionaryVersion: '2026.07.13-2',
    packages: [
      {
        id: 'essential',
        packageId: 'bootstrap-n5',
        name: 'Essential',
        description: 'Required package.',
        version: '2026.07.13-2',
        availability: 'included',
        required: true,
        estimatedByteLength: 100,
        entryCount: 44,
        kanjiCount: 10,
      },
      {
        id: 'core',
        packageId: 'core-common',
        name: 'Core',
        description: 'Common entries.',
        version: '2026.07.13-3',
        availability: 'planned',
        required: false,
        estimatedByteLength: 1000,
        entryCount: 30142,
        kanjiCount: 2136,
      },
      {
        id: 'full',
        packageId: 'full-jmdict-kanjidic2',
        name: 'Full',
        description: 'Complete entries.',
        version: '2026.07.13-3',
        availability: 'planned',
        required: false,
        estimatedByteLength: 2000,
        entryCount: 217856,
        kanjiCount: 13108,
      },
    ],
    ...overrides,
  };
}

async function createAvailableFixture(distributionRevision = 1) {
  const version = '2026.07.13-3';
  const artifact = await descriptor(`packages/${version}/core/entries.json`, { entries: [{ id: 'one' }] });
  const manifest = {
    format: 'mathicx-japanese-dictionary-offline-package',
    schemaVersion: 1,
    id: 'core',
    packageId: 'core-common',
    dictionaryVersion: version,
    distributionRevision,
    routes: {
      entries: {
        path: artifact.path,
        byteLength: artifact.byteLength,
        sha256: artifact.sha256,
        kind: 'route',
      },
      indexes: Object.fromEntries(['written', 'reading', 'romaji', 'pt'].map((kind) => [kind, {
        path: artifact.path,
        byteLength: artifact.byteLength,
        sha256: artifact.sha256,
        kind: 'route',
      }])),
    },
    artifacts: [{
      path: artifact.path,
      byteLength: artifact.byteLength,
      sha256: artifact.sha256,
      kind: 'route',
    }],
  };
  const manifestDescriptor = await descriptor(`packages/${version}/core/manifest.json`, manifest);
  const catalog = createCatalog();
  catalog.packages[1] = {
    ...catalog.packages[1],
    distributionRevision,
    availability: 'available',
    manifest: {
      path: manifestDescriptor.path,
      byteLength: manifestDescriptor.byteLength,
      sha256: manifestDescriptor.sha256,
    },
  };
  return {
    version,
    artifact,
    manifestDescriptor,
    files: new Map([
      ['packages/catalog.json', encoder.encode(`${JSON.stringify(catalog)}\n`)],
      [manifestDescriptor.path, manifestDescriptor.bytes],
      [artifact.path, artifact.bytes],
    ]),
  };
}

async function descriptor(path, payload) {
  const bytes = encoder.encode(`${JSON.stringify(payload)}\n`);
  return {
    path,
    byteLength: bytes.byteLength,
    sha256: await sha256Hex(bytes, webcrypto),
    bytes,
  };
}

function relativePath(url) {
  const pathname = new URL(url).pathname;
  const marker = '/data/dictionary/';
  return pathname.slice(pathname.indexOf(marker) + marker.length);
}
