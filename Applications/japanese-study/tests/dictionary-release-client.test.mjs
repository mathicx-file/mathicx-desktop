import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';

import {
  DictionaryReleaseClient,
  compareAppVersions,
  compareDictionaryVersions,
} from '../js/dictionary/dictionary-release-client.js';
import { sha256Hex } from '../js/dictionary/dictionary-cache-installer.js';
import { DictionaryUpdateManager } from '../js/dictionary/dictionary-update-manager.js';

const encoder = new TextEncoder();
const dataUrl = new URL('https://dictionary.test/data/dictionary/');
const releaseUrl = new URL('releases/current.json', dataUrl);

test('detects the current release without changing local state', async () => {
  const fixture = await createReleaseFixture();
  const requests = [];
  const client = createClient(fixture, requests);
  const result = await client.check({ activeVersion: fixture.release.dictionaryVersion });

  assert.equal(result.status, 'current');
  assert.equal(result.remoteVersion, '2026.07.13-2');
  assert.equal(result.manifest.packageId, 'bootstrap-n5');
  assert.equal(requests.length, 2);
  assert.ok(requests.every((request) => request.options.cache === 'no-store'));
});

test('classifies newer, older and incompatible releases', async () => {
  const fixture = await createReleaseFixture();
  const client = createClient(fixture, []);

  assert.equal((await client.check({ activeVersion: '2026.07.13-1' })).status, 'update-available');
  assert.equal((await client.check({ activeVersion: '2026.07.14-1' })).status, 'remote-older');

  const incompatible = await createReleaseFixture({ minimumAppVersion: '3.0.0' });
  const requests = [];
  const result = await createClient(incompatible, requests).check({ activeVersion: '2026.07.13-1' });
  assert.equal(result.status, 'incompatible');
  assert.equal(requests.length, 1);
});

test('rejects an invalid remote manifest without reporting an update', async () => {
  const fixture = await createReleaseFixture();
  fixture.files.set(fixture.release.manifest.path, encoder.encode('{"tampered":true}\n'));

  await assert.rejects(
    createClient(fixture, []).check({ activeVersion: '2026.07.13-1' }),
    /size mismatch|hash mismatch/,
  );
});

test('compares application and dictionary versions numerically', () => {
  assert.equal(compareAppVersions('2.10.0', '2.9.9'), 1);
  assert.equal(compareAppVersions('2.0.0', '2.0.0'), 0);
  assert.equal(compareDictionaryVersions('2026.07.13-10', '2026.07.13-2'), 1);
  assert.equal(compareDictionaryVersions('2026.07.12-9', '2026.07.13-1'), -1);
});

test('keeps check, candidate download and activation as separate operations', async () => {
  const calls = [];
  const capacityChecks = [];
  const releaseCheck = {
    status: 'update-available',
    remoteVersion: '2026.07.14-1',
    manifest: { dictionaryVersion: '2026.07.14-1' },
    release: { artifacts: { byteLength: 4096 } },
  };
  const repository = {
    getCacheState: async () => ({ activeVersion: '2026.07.13-2', previousVersion: null }),
    getVersionState: async () => null,
    cleanupUnprotectedVersions: async () => ({ removedVersions: [] }),
  };
  const installer = {
    downloadCandidate: async (manifest) => {
      calls.push(`download:${manifest.dictionaryVersion}`);
      return { status: 'ready', version: manifest.dictionaryVersion };
    },
    promoteCandidate: async (version) => {
      calls.push(`activate:${version}`);
      return { status: 'promoted', version };
    },
    rollback: async () => ({ activeVersion: '2026.07.13-2' }),
  };
  const manager = new DictionaryUpdateManager({
    repository,
    installer,
    storageManager: {
      assertCapacity: async (bytes, options) => capacityChecks.push({ bytes, options }),
    },
    releaseClient: { check: async () => releaseCheck },
    fetchImpl: async () => new Response('missing', { status: 404 }),
  });

  const checked = await manager.check('2026.07.13-2');
  assert.equal(checked.status, 'update-available');
  assert.deepEqual(calls, []);
  const candidate = await manager.downloadCandidate(checked);
  assert.equal(candidate.status, 'ready');
  assert.deepEqual(capacityChecks, [{
    bytes: releaseCheck.release.artifacts.byteLength,
    options: { version: releaseCheck.remoteVersion },
  }]);
  assert.deepEqual(calls, ['download:2026.07.14-1']);
  await manager.activateCandidate(candidate.version);
  assert.deepEqual(calls, ['download:2026.07.14-1', 'activate:2026.07.14-1']);
});

function createClient(fixture, requests) {
  return new DictionaryReleaseClient({
    dataUrl,
    releaseUrl,
    appVersion: '2.0.0',
    crypto: webcrypto,
    fetchImpl: async (url, options = {}) => {
      const parsed = new URL(url);
      requests.push({ url: parsed.href, options });
      const marker = '/data/dictionary/';
      const path = parsed.pathname.slice(parsed.pathname.indexOf(marker) + marker.length);
      const bytes = fixture.files.get(path);
      return bytes ? new Response(bytes, { status: 200 }) : new Response('missing', { status: 404 });
    },
  });
}

async function createReleaseFixture(options = {}) {
  const manifest = {
    format: 'mathicx-japanese-dictionary',
    schemaVersion: 1,
    packageId: 'bootstrap-n5',
    dictionaryVersion: '2026.07.13-2',
  };
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest)}\n`);
  const release = {
    format: 'mathicx-japanese-dictionary-pages-release',
    schemaVersion: 1,
    channel: 'stable',
    minimumAppVersion: options.minimumAppVersion || '2.0.0',
    packageId: manifest.packageId,
    dictionaryVersion: manifest.dictionaryVersion,
    manifest: {
      path: `manifests/${manifest.dictionaryVersion}.json`,
      byteLength: manifestBytes.byteLength,
      sha256: await sha256Hex(manifestBytes, webcrypto),
    },
    artifacts: { distribution: 1, byteLength: manifestBytes.byteLength },
  };
  return {
    release,
    files: new Map([
      ['releases/current.json', encoder.encode(`${JSON.stringify(release)}\n`)],
      [release.manifest.path, manifestBytes],
    ]),
  };
}
