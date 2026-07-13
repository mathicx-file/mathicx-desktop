import fs from 'node:fs/promises';
import path from 'node:path';

import { validateEntryShards, validateShardingConfig } from './lib/entry-shards.mjs';
import { parseCliArgs, readJsonFile } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['package', 'shards', 'report'],
  optional: ['config'],
});
const [packageData, configInput, expectedReport] = await Promise.all([
  readJsonFile(args.package),
  readJsonFile(args.config || 'scripts/dictionary/config/sharding.json'),
  readJsonFile(args.report),
]);
const config = validateShardingConfig(configInput);
const shardsDir = path.resolve(args.shards);
const shardPattern = new RegExp(`^[a-f0-9]{${config.prefixLength}}\\.json$`);
const files = (await fs.readdir(shardsDir, { withFileTypes: true }))
  .filter((item) => item.isFile() && shardPattern.test(item.name))
  .map((item) => item.name)
  .sort();
const shards = await Promise.all(files.map((fileName) => readJsonFile(path.join(shardsDir, fileName))));
const result = validateEntryShards(packageData, shards, config);
if (JSON.stringify(result.report) !== JSON.stringify(expectedReport)) {
  throw new TypeError('Entry shards report does not match the generated files.');
}

console.log('Shards de entradas validados.');
console.log(JSON.stringify({
  dictionaryVersion: result.report.dictionaryVersion,
  emittedShards: result.report.routing.emittedShardCount,
  lexicalEntries: result.report.coverage.lexicalEntries,
  maxCompressedBytes: result.report.distribution.maxCompressedBytes,
}, null, 2));
