import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';

import {
  DICTIONARY_CACHE_DB_NAME,
  DICTIONARY_CACHE_STORES,
  DictionaryCacheRepository,
} from '../../../Applications/japanese-study/js/dictionary/dictionary-cache-repository.js';
import {
  DictionaryCacheInstaller,
  sha256Hex,
} from '../../../Applications/japanese-study/js/dictionary/dictionary-cache-installer.js';

test('creates the isolated public cache schema', async () => {
  const repository = createRepository('schema');
  const db = await repository.open();

  assert.notEqual(repository.dbName, 'JapaneseStudyDB');
  assert.deepEqual(
    [...db.objectStoreNames],
    Object.values(DICTIONARY_CACHE_STORES).sort(),
  );
  await repository.close();
});

test('installs only verified artifacts and promotes a complete version', async () => {
  const repository = createRepository('install');
  const fixture = await createDistribution('v1');
  const installer = createInstaller(repository, fixture.artifacts);

  const result = await installer.installAndPromote(fixture.manifest);
  const cached = await repository.getVersionArtifacts('v1');
  const state = await repository.getVersionState('v1');

  assert.equal(result.status, 'promoted');
  assert.equal(result.activeVersion, 'v1');
  assert.equal(result.previousVersion, null);
  assert.equal(cached.length, result.artifactCount);
  assert.equal(state.status, 'ready');
  assert.equal(state.artifactCount, result.artifactCount);
  assert.ok(cached.some((item) => item.kind === 'manifest'));
  await repository.close();
});

test('preserves the previous version and supports atomic rollback', async () => {
  const repository = createRepository('rollback');
  const first = await createDistribution('v1');
  const second = await createDistribution('v2');

  await createInstaller(repository, first.artifacts).installAndPromote(first.manifest);
  await createInstaller(repository, second.artifacts).installAndPromote(second.manifest);

  assert.deepEqual(await repository.getCacheState(), {
    activeVersion: 'v2',
    previousVersion: 'v1',
  });
  assert.ok((await repository.getVersionArtifacts('v1')).length > 0);

  assert.deepEqual(await repository.rollback(), {
    activeVersion: 'v1',
    previousVersion: 'v2',
  });
  assert.ok((await repository.getVersionArtifacts('v2')).length > 0);
  await repository.close();
});

test('rejects tampering without replacing the active version', async () => {
  const repository = createRepository('tamper');
  const first = await createDistribution('v1');
  const candidate = await createDistribution('v2');
  await createInstaller(repository, first.artifacts).installAndPromote(first.manifest);

  const tampered = new Map(candidate.artifacts);
  tampered.set(candidate.manifest.defaultPack.path, new TextEncoder().encode('tampered'));
  await assert.rejects(
    createInstaller(repository, tampered).installAndPromote(candidate.manifest),
    /size mismatch|hash mismatch/,
  );

  assert.deepEqual(await repository.getCacheState(), {
    activeVersion: 'v1',
    previousVersion: null,
  });
  assert.equal((await repository.getVersionArtifacts('v2')).length, 0);
  assert.equal((await repository.getFailures('v2'))[0].code, 'integrity-size');
  await repository.close();
});

test('resumes an interrupted candidate without promoting or downloading valid artifacts again', async () => {
  const repository = createRepository('resume');
  const active = await createDistribution('v1');
  const candidate = await createDistribution('v2');
  await createInstaller(repository, active.artifacts).installAndPromote(active.manifest);

  const requests = new Map();
  let interrupted = true;
  const installer = new DictionaryCacheInstaller({
    repository,
    loadArtifact: async (path) => {
      requests.set(path, (requests.get(path) || 0) + 1);
      if (interrupted && path === candidate.manifest.routes.indexes.reading.path) {
        throw new Error('simulated network interruption');
      }
      return candidate.artifacts.get(path);
    },
  });

  await assert.rejects(installer.downloadCandidate(candidate.manifest), /network interruption/);
  assert.equal((await repository.getVersionState('v2')).status, 'interrupted');
  assert.ok((await repository.getVersionArtifacts('v2')).length > 0);
  assert.equal((await repository.getCacheState()).activeVersion, 'v1');

  interrupted = false;
  const resumed = await installer.downloadCandidate(candidate.manifest);
  assert.equal(resumed.status, 'ready');
  assert.ok(resumed.reusedArtifacts > 0);
  assert.ok(resumed.downloadedArtifacts > 0);
  assert.equal(requests.get(candidate.manifest.defaultPack.path), 1);
  assert.equal((await repository.getCacheState()).activeVersion, 'v1');

  const promoted = await installer.promoteCandidate('v2', resumed);
  assert.equal(promoted.status, 'promoted');
  assert.deepEqual(await repository.getCacheState(), {
    activeVersion: 'v2',
    previousVersion: 'v1',
  });
  await repository.close();
});

test('records quota failures and keeps the rollback pair intact', async () => {
  const repository = createRepository('quota');
  const first = await createDistribution('v1');
  const second = await createDistribution('v2');
  const candidate = await createDistribution('v3');
  await createInstaller(repository, first.artifacts).installAndPromote(first.manifest);
  await createInstaller(repository, second.artifacts).installAndPromote(second.manifest);

  const originalPut = repository.putArtifact.bind(repository);
  repository.putArtifact = async (...args) => {
    if (args[0] === 'v3') {
      const error = new Error('Storage quota exhausted.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    return originalPut(...args);
  };

  await assert.rejects(
    createInstaller(repository, candidate.artifacts).installAndPromote(candidate.manifest),
    { name: 'QuotaExceededError' },
  );
  assert.deepEqual(await repository.getCacheState(), {
    activeVersion: 'v2',
    previousVersion: 'v1',
  });
  assert.equal((await repository.getFailures('v3'))[0].code, 'quota-exceeded');
  await repository.close();
});

test('does not overwrite active or rollback-protected versions', async () => {
  const repository = createRepository('protected');
  const first = await createDistribution('v1');
  const second = await createDistribution('v2');
  const firstInstaller = createInstaller(repository, first.artifacts);
  await firstInstaller.installAndPromote(first.manifest);
  await createInstaller(repository, second.artifacts).installAndPromote(second.manifest);

  await assert.rejects(firstInstaller.installAndPromote(first.manifest), /Cannot overwrite the rollback/);
  const activeResult = await createInstaller(repository, second.artifacts).installAndPromote(second.manifest);
  assert.equal(activeResult.status, 'already-active');
  assert.deepEqual(await repository.getCacheState(), {
    activeVersion: 'v2',
    previousVersion: 'v1',
  });
  await repository.close();
});

test('cleans only versions outside the active rollback pair after promotion', async () => {
  const repository = createRepository('version-cleanup');
  const first = await createDistribution('v1');
  const second = await createDistribution('v2');
  const third = await createDistribution('v3');
  await createInstaller(repository, first.artifacts).installAndPromote(first.manifest);
  await createInstaller(repository, second.artifacts).installAndPromote(second.manifest);
  await createInstaller(repository, third.artifacts).installAndPromote(third.manifest);

  const result = await repository.cleanupUnprotectedVersions();
  assert.deepEqual(result.removedVersions, ['v1']);
  assert.ok((await repository.getVersionArtifacts('v2')).length > 0);
  assert.ok((await repository.getVersionArtifacts('v3')).length > 0);
  assert.deepEqual(await repository.getCacheState(), {
    activeVersion: 'v3',
    previousVersion: 'v2',
  });
  await repository.close();
});

test('clears optional shards without removing the essential active package', async () => {
  const repository = createRepository('cleanup');
  const fixture = await createDistribution('v1');
  await createInstaller(repository, fixture.artifacts).installAndPromote(fixture.manifest);
  const before = await repository.getCacheUsage('v1');

  const cleanup = await repository.clearOptionalArtifacts('v1');
  const after = await repository.getCacheUsage('v1');

  assert.ok(cleanup.removedArtifacts > 0);
  assert.ok(cleanup.removedBytes > 0);
  assert.ok(after.artifacts < before.artifacts);
  assert.equal(after.byKind.pack.artifacts, 1);
  assert.equal(after.byKind.manifest.artifacts, 1);
  assert.equal(after.byKind.license.artifacts, 1);
  assert.equal(after.byKind.route.artifacts, 5);
  assert.equal(after.byKind['entry-shard'], undefined);
  assert.equal(after.byKind['index-shard'], undefined);
  assert.deepEqual(await repository.getCacheState(), {
    activeVersion: 'v1',
    previousVersion: null,
  });
  await repository.close();
});

function createRepository(label) {
  return new DictionaryCacheRepository({
    indexedDB,
    dbName: `${DICTIONARY_CACHE_DB_NAME}-${label}-${Date.now()}-${Math.random()}`,
  });
}

function createInstaller(repository, artifacts) {
  return new DictionaryCacheInstaller({
    repository,
    loadArtifact: async (path) => {
      const bytes = artifacts.get(path);
      if (!bytes) throw new Error(`Missing fixture artifact: ${path}`);
      return bytes;
    },
  });
}

async function createDistribution(version) {
  const artifacts = new Map();
  const artifact = async (path, payload) => {
    const bytes = new TextEncoder().encode(`${JSON.stringify(payload, null, 2)}\n`);
    const descriptor = {
      path,
      byteLength: bytes.byteLength,
      sha256: await sha256Hex(bytes),
    };
    artifacts.set(path, bytes);
    return descriptor;
  };

  const entryShard = await artifact(`shards/entries/${version}/00.json`, {
    schemaVersion: 1,
    dictionaryVersion: version,
    entries: [],
  });
  const indexShards = {};
  for (const kind of ['written', 'reading', 'romaji', 'pt']) {
    indexShards[kind] = await artifact(`indexes/${version}/${kind}/00.json`, {
      schemaVersion: 1,
      dictionaryVersion: version,
      indexKind: kind,
      terms: {},
    });
  }

  const entryRoute = await artifact(`routes/${version}/entries.json`, {
    schemaVersion: 1,
    kind: 'dictionary-entry-routes',
    dictionaryVersion: version,
    buckets: { '00': entryShard },
  });
  const indexRoutes = {};
  for (const kind of ['written', 'reading', 'romaji', 'pt']) {
    indexRoutes[kind] = await artifact(`routes/${version}/${kind}.json`, {
      schemaVersion: 1,
      kind: 'dictionary-search-routes',
      indexKind: kind,
      dictionaryVersion: version,
      buckets: { '00': indexShards[kind] },
    });
  }

  const defaultPack = await artifact(`packs/${version}.json`, {
    id: 'bootstrap-n5',
    version,
    entries: [],
  });
  const licenses = await artifact(`licenses-${version}.json`, {
    schemaVersion: 1,
    sources: [],
  });
  const manifest = {
    format: 'mathicx-japanese-dictionary',
    schemaVersion: 1,
    releaseStatus: 'staged',
    packageId: 'bootstrap-n5',
    dictionaryVersion: version,
    defaultPack,
    licenses,
    routes: {
      entries: entryRoute,
      indexes: indexRoutes,
    },
    runtime: {
      active: false,
      activeSource: 'legacy-json',
    },
  };
  return { manifest, artifacts };
}
