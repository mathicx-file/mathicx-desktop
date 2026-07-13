import fs from 'node:fs/promises';
import path from 'node:path';

import { validateSearchIndexes, validateSearchIndexConfig } from './lib/search-indexes.mjs';
import { parseCliArgs, readJsonFile } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['package', 'indexes', 'report'],
  optional: ['config'],
});
const [packageData, configInput, expectedReport] = await Promise.all([
  readJsonFile(args.package),
  readJsonFile(args.config || 'scripts/dictionary/config/search-indexes.json'),
  readJsonFile(args.report),
]);
const config = validateSearchIndexConfig(configInput);
const indexesRoot = path.resolve(args.indexes);
const files = [];
for (const indexKind of config.indexKinds) {
  const indexDir = path.join(indexesRoot, indexKind);
  const names = (await fs.readdir(indexDir, { withFileTypes: true }))
    .filter((item) => item.isFile() && /^(?:[a-z0-9_]|u-[a-f0-9]{2,6})\.json$/u.test(item.name))
    .map((item) => item.name)
    .sort();
  files.push(...names.map((name) => ({ indexKind, path: path.join(indexDir, name) })));
}
const shards = await Promise.all(files.map((item) => readJsonFile(item.path)));
const result = validateSearchIndexes(packageData, shards, config);
if (JSON.stringify(result.report) !== JSON.stringify(expectedReport)) {
  throw new TypeError('Search indexes report does not match the generated files.');
}

console.log('Indices de busca validados.');
console.log(JSON.stringify({
  dictionaryVersion: result.report.dictionaryVersion,
  totalShards: result.report.distribution.totalShards,
  indexes: result.report.indexes,
}, null, 2));
