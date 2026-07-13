import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createArtifactDescriptor,
  createDistributionManifest,
  createDistributionRoutes,
  validateRelativeArtifactPath,
  verifyDictionaryDistribution,
} from '../lib/distribution-manifest.mjs';
import { createEntryShards } from '../lib/entry-shards.mjs';
import { createSearchIndexes } from '../lib/search-indexes.mjs';

const HASH = 'a'.repeat(64);
const ENTRY_CONFIG = {
  schemaVersion: 1, strategy: 'sha256-id-prefix', prefixLength: 2, emitEmptyShards: false,
  idealCompressedBytes: { min: 50 * 1024, max: 250 * 1024 }, maxCompressedBytes: 500 * 1024,
};
const INDEX_CONFIG = {
  schemaVersion: 1,
  indexKinds: ['written', 'reading', 'romaji', 'pt'],
  romanization: {
    library: 'wanakana', version: '5.3.1', style: 'hepburn', upcaseKatakana: false,
    variants: ['canonical', 'compact-apostrophe'],
  },
  routing: {
    written: 'first-code-point-page-256', reading: 'hiragana-first-code-point',
    romaji: 'first-ascii-character', pt: 'first-ascii-character',
  },
  idealCompressedBytes: { min: 10 * 1024, max: 100 * 1024 }, maxCompressedBytes: 250 * 1024,
};

test('creates and verifies a staged manifest through every routed artifact', () => {
  const fixture = createFixture();
  const result = verifyDictionaryDistribution(fixture);
  assert.equal(result.valid, true);
  assert.equal(result.releaseStatus, 'staged');
  assert.equal(result.entryShards, fixture.entryArtifacts.length);
  assert.equal(result.indexShards, fixture.indexArtifacts.length);
  assert.equal(fixture.manifest.runtime.active, false);
});

test('rejects tampered files and incomplete routes', () => {
  const tampered = createFixture();
  const target = tampered.entryArtifacts[0].descriptor.path;
  tampered.artifacts.set(target, Buffer.from('tampered', 'utf8'));
  assert.throws(() => verifyDictionaryDistribution(tampered), /hash or size mismatch/);

  const incomplete = createFixture();
  delete incomplete.routes.entries.buckets[Object.keys(incomplete.routes.entries.buckets)[0]];
  assert.throws(() => verifyDictionaryDistribution(incomplete), /do not cover every bucket/);
});

test('rejects absolute and traversal artifact paths', () => {
  assert.throws(() => validateRelativeArtifactPath('../dictionary.json'), /Unsafe/);
  assert.throws(() => validateRelativeArtifactPath('/packs/bootstrap.json'), /Unsafe/);
  assert.throws(() => createArtifactDescriptor('routes/../pack.json', 'x'), /Unsafe/);
});

function createFixture() {
  const packageData = createPackage();
  const licenses = {
    schemaVersion: 1,
    dataLicense: 'CC-BY-SA-4.0',
    sources: [
      { id: 'jmdict', license: 'CC-BY-SA-4.0' },
      { id: 'mathicx-ptbr', license: 'CC-BY-SA-4.0' },
    ],
  };
  const entryArtifacts = createEntryShards(packageData, ENTRY_CONFIG).shards.map((payload) => artifact(
    payload, `shards/entries/${packageData.version}/${payload.shardId}.json`,
  ));
  const indexArtifacts = createSearchIndexes(packageData, INDEX_CONFIG).shards.map((payload) => artifact(
    payload, `indexes/${packageData.version}/${payload.indexKind}/${payload.bucket}.json`,
  ));
  const routes = createDistributionRoutes({
    packageData, entryArtifacts, indexArtifacts, entryConfig: ENTRY_CONFIG, indexConfig: INDEX_CONFIG,
  });
  const routeArtifacts = {
    entries: artifact(routes.entries, `routes/${packageData.version}/entries.json`),
    indexes: Object.fromEntries(INDEX_CONFIG.indexKinds.map((kind) => [
      kind, artifact(routes.indexes[kind], `routes/${packageData.version}/${kind}.json`),
    ])),
  };
  const packArtifact = artifact(packageData, 'packs/bootstrap-n5.json');
  const licensesArtifact = artifact(licenses, 'licenses.json');
  const manifest = createDistributionManifest({
    packageData,
    packDescriptor: packArtifact.descriptor,
    licensesDescriptor: licensesArtifact.descriptor,
    routeDescriptors: {
      entries: routeArtifacts.entries.descriptor,
      indexes: Object.fromEntries(INDEX_CONFIG.indexKinds.map((kind) => [kind, routeArtifacts.indexes[kind].descriptor])),
    },
  });
  const allArtifacts = [
    packArtifact, licensesArtifact, routeArtifacts.entries,
    ...Object.values(routeArtifacts.indexes), ...entryArtifacts, ...indexArtifacts,
  ];
  return {
    manifest, packageData, licenses, routes, entryArtifacts, indexArtifacts,
    artifacts: new Map(allArtifacts.map((item) => [item.descriptor.path, item.bytes])),
  };
}

function artifact(payload, path) {
  const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { payload, bytes, descriptor: createArtifactDescriptor(path, bytes) };
}

function createPackage() {
  return {
    id: 'bootstrap-n5', version: '2026.07.13-2',
    sources: [
      { id: 'jmdict', version: '2026-07-13', sha256: HASH },
      { id: 'mathicx-ptbr', version: 'test', sha256: HASH },
    ],
    entries: [
      {
        sourceEntryId: '1000000', writtenForms: ['水'], readings: ['みず'],
        senses: [{ englishGlosses: ['water'] }],
      },
      {
        sourceEntryId: '1000001', writtenForms: ['火'], readings: ['ひ'],
        senses: [{ englishGlosses: ['fire'] }],
      },
    ],
    translations: [
      {
        entryId: 'jmdict-1000000', senseId: 'jmdict-1000000:sense:1', language: 'pt-BR',
        glosses: ['água'], status: 'reviewed',
      },
      {
        entryId: 'jmdict-1000001', senseId: 'jmdict-1000001:sense:1', language: 'pt-BR',
        glosses: ['fogo'], status: 'reviewed',
      },
    ],
    kanji: [], kanjiTranslations: [], strokeAssets: [],
  };
}
