import fs from 'node:fs/promises';
import path from 'node:path';

import { createSearchIndexes, validateSearchIndexConfig } from './lib/search-indexes.mjs';
import { parseCliArgs, readJsonFile, writeDeterministicJson } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['package', 'output', 'report'],
  optional: ['config'],
});
const [packageData, configInput] = await Promise.all([
  readJsonFile(args.package),
  readJsonFile(args.config || 'scripts/dictionary/config/search-indexes.json'),
]);
const config = validateSearchIndexConfig(configInput);
const result = createSearchIndexes(packageData, config);
const outputRoot = path.resolve(args.output);

for (const indexKind of config.indexKinds) {
  const outputDir = path.join(outputRoot, indexKind);
  await fs.mkdir(outputDir, { recursive: true });
  const expectedFiles = new Set(result.shards
    .filter((shard) => shard.indexKind === indexKind)
    .map((shard) => `${shard.bucket}.json`));
  const existingFiles = await fs.readdir(outputDir, { withFileTypes: true });
  await Promise.all(existingFiles
    .filter((item) => item.isFile() && /^(?:[a-z0-9]{1,2}|_|u-[a-f0-9]{2,6})\.json$/u.test(item.name))
    .filter((item) => !expectedFiles.has(item.name))
    .map((item) => fs.unlink(path.join(outputDir, item.name))));
}

await Promise.all(result.shards.map((shard) => (
  writeDeterministicJson(path.join(outputRoot, shard.indexKind, `${shard.bucket}.json`), shard)
)));
await writeDeterministicJson(args.report, result.report);

console.log(`${result.report.distribution.totalShards} shards de indice gerados.`);
for (const [indexKind, summary] of Object.entries(result.report.indexes)) {
  console.log(`${indexKind}: ${summary.terms} termos, ${summary.entriesCovered} entradas cobertas.`);
}
