import fs from 'node:fs/promises';
import path from 'node:path';

import { createEntryShards, validateShardingConfig } from './lib/entry-shards.mjs';
import { parseCliArgs, readJsonFile, writeDeterministicJson } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['package', 'output', 'report'],
  optional: ['config'],
});
const [packageData, configInput] = await Promise.all([
  readJsonFile(args.package),
  readJsonFile(args.config || 'scripts/dictionary/config/sharding.json'),
]);
const config = validateShardingConfig(configInput);
const result = createEntryShards(packageData, config);
const outputDir = path.resolve(args.output);
await fs.mkdir(outputDir, { recursive: true });

const expectedFiles = new Set(result.shards.map((shard) => `${shard.shardId}.json`));
const existingFiles = await fs.readdir(outputDir, { withFileTypes: true });
await Promise.all(existingFiles
  .filter((item) => item.isFile() && new RegExp(`^[a-f0-9]{${config.prefixLength}}\\.json$`).test(item.name))
  .filter((item) => !expectedFiles.has(item.name))
  .map((item) => fs.unlink(path.join(outputDir, item.name))));
await Promise.all(result.shards.map((shard) => (
  writeDeterministicJson(path.join(outputDir, `${shard.shardId}.json`), shard)
)));
await writeDeterministicJson(args.report, result.report);

console.log(`${result.shards.length} shards de entradas gerados.`);
console.log(`${result.report.coverage.lexicalEntries} entradas e ${result.report.coverage.lexicalTranslations} traducoes preservadas.`);
console.log(`${result.report.distribution.totalCompressedBytes} bytes comprimidos estimados.`);
