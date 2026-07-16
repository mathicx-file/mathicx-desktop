import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { assessDictionaryInfrastructure } from '../lib/infrastructure-assessment.mjs';

test('keeps static distribution until a measurable capacity trigger is reached', async (context) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mathicx-dictionary-gate-'));
  context.after(() => fs.rm(root, { recursive: true, force: true }));
  const dictionary = path.join(root, 'dictionary');
  const pages = path.join(root, 'pages');
  await fs.mkdir(dictionary);
  await fs.mkdir(pages);
  await fs.writeFile(path.join(dictionary, 'shard.json.gz'), Buffer.alloc(200));
  await fs.writeFile(path.join(pages, 'index.html'), Buffer.alloc(300));

  const current = await assessDictionaryInfrastructure({
    dictionaryRoot: dictionary,
    pagesRoot: pages,
    thresholds: { pagesMigrationBytes: 1_000, singleArtifactBytes: 500 },
  });
  assert.equal(current.decision, 'keep-static');
  assert.deepEqual(current.triggers, { pagesCapacity: false, largeArtifact: false });

  const exceeded = await assessDictionaryInfrastructure({
    dictionaryRoot: dictionary,
    pagesRoot: pages,
    thresholds: { pagesMigrationBytes: 250, singleArtifactBytes: 100 },
  });
  assert.equal(exceeded.decision, 'review-external-infrastructure');
  assert.deepEqual(exceeded.triggers, { pagesCapacity: true, largeArtifact: true });
});
