import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { after, before } from 'node:test';

import {
  buildPagesArtifact,
  validatePagesArtifact,
} from '../lib/pages-artifact.mjs';

const workspaceRoot = process.cwd();
const outputRoot = path.join(workspaceRoot, '.tmp-pages-artifact-test');
const dictionaryRoot = path.join(
  outputRoot,
  'Applications',
  'japanese-study',
  'data',
  'dictionary',
);

before(async () => {
  await buildPagesArtifact({ workspaceRoot, outputRoot });
});

after(async () => {
  await fs.rm(outputRoot, { recursive: true, force: true });
});

test('builds a minimal, versioned and valid Pages artifact', async () => {
  const result = await validatePagesArtifact({ outputRoot });
  assert.equal(result.valid, true);
  assert.ok(result.distributionArtifacts > 0);
  assert.equal(result.optionalPackageArtifacts, 1136);
  assert.ok(result.optionalPackageBytes > 33_000_000);

  await assert.rejects(fs.access(path.join(outputRoot, 'package.json')));
  await assert.rejects(fs.access(path.join(outputRoot, 'node_modules')));
  await assert.rejects(fs.access(path.join(outputRoot, 'src', 'firebase', 'firebase-config.local.js')));

  const release = JSON.parse(await fs.readFile(path.join(dictionaryRoot, 'releases', 'current.json'), 'utf8'));
  assert.equal(release.channel, 'stable');
  assert.equal(release.minimumAppVersion, '2.0.0');
  assert.match(release.manifest.path, new RegExp(release.dictionaryVersion.replaceAll('.', '\\.')));
  await fs.access(path.join(dictionaryRoot, 'releases', `${release.dictionaryVersion}.json`));
  const catalog = JSON.parse(await fs.readFile(path.join(dictionaryRoot, 'packages', 'catalog.json'), 'utf8'));
  assert.equal(catalog.dictionaryVersion, release.dictionaryVersion);
  assert.deepEqual(catalog.packages.map((item) => item.id), ['essential', 'core', 'full']);
  assert.deepEqual(catalog.packages.slice(1).map((item) => item.distributionRevision), [2, 2]);
});

test('rejects a compressed offline package artifact whose hash no longer matches', async () => {
  const catalog = JSON.parse(await fs.readFile(path.join(dictionaryRoot, 'packages', 'catalog.json'), 'utf8'));
  const manifestDescriptor = catalog.packages.find((item) => item.id === 'core').manifest;
  const manifest = JSON.parse(await fs.readFile(
    path.join(dictionaryRoot, ...manifestDescriptor.path.split('/')),
    'utf8',
  ));
  const artifactPath = path.join(dictionaryRoot, ...manifest.artifacts[0].path.split('/'));
  const original = await fs.readFile(artifactPath);

  try {
    await fs.appendFile(artifactPath, '\n');
    await assert.rejects(validatePagesArtifact({ outputRoot }), /hash|byte length|descriptor/i);
  } finally {
    await fs.writeFile(artifactPath, original);
  }
});

test('rejects a dictionary artifact whose content no longer matches its hash', async () => {
  const release = JSON.parse(await fs.readFile(path.join(dictionaryRoot, 'releases', 'current.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(dictionaryRoot, ...release.manifest.path.split('/')), 'utf8'));
  const routes = JSON.parse(await fs.readFile(
    path.join(dictionaryRoot, ...manifest.routes.entries.path.split('/')),
    'utf8',
  ));
  const shardPath = path.join(dictionaryRoot, ...Object.values(routes.buckets)[0].path.split('/'));
  const original = await fs.readFile(shardPath);

  try {
    await fs.appendFile(shardPath, '\n');
    await assert.rejects(
      validatePagesArtifact({ outputRoot }),
      /hash|byte length|descriptor/i,
    );
  } finally {
    await fs.writeFile(shardPath, original);
  }
});

test('rejects sensitive files added to the publication artifact', async () => {
  const forbiddenPath = path.join(outputRoot, '.env.production');
  try {
    await fs.writeFile(forbiddenPath, 'SECRET=not-for-pages\n');
    await assert.rejects(
      validatePagesArtifact({ outputRoot }),
      /Forbidden file in Pages artifact/,
    );
  } finally {
    await fs.rm(forbiddenPath, { force: true });
  }
});
