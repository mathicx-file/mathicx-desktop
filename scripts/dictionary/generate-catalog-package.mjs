import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { createGzip } from 'node:zlib';

import { normalizeBootstrapPackage } from './lib/pipeline-schema.mjs';
import { parseCliArgs, readJsonFile, writeDeterministicJson } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['jmdict', 'kanjidic2', 'output', 'report', 'version', 'tier'],
  optional: ['config'],
});
const config = await readJsonFile(args.config || 'scripts/dictionary/config/package-tiers.json');
const tier = config.tiers?.[args.tier];
if (!tier || !['core', 'full'].includes(args.tier)) {
  throw new TypeError(`Catalog tier must be core or full: ${args.tier}.`);
}
if (!/^\d{4}\.\d{2}\.\d{2}-\d+$/u.test(args.version)) {
  throw new TypeError('Catalog version must use YYYY.MM.DD-N.');
}

const [jmdict, kanjidic2] = await Promise.all([
  readJsonFile(args.jmdict),
  readJsonFile(args.kanjidic2),
]);
for (const [label, artifact] of [['JMdict', jmdict], ['KANJIDIC2', kanjidic2]]) {
  if (artifact?.selection?.mode !== tier.selectionMode) {
    throw new TypeError(`${label} import does not match ${args.tier} selection mode.`);
  }
}

const normalized = normalizeBootstrapPackage({
  id: tier.packageId,
  version: args.version,
  sources: [jmdict.metadata.source, kanjidic2.metadata.source],
  entries: jmdict.entries,
  kanji: kanjidic2.entries,
  translations: [],
  kanjiTranslations: [],
  strokeAssets: [],
});
const packageData = {
  ...normalized,
  tier: args.tier,
  installedByDefault: tier.installedByDefault === true,
  licensesPath: '../licenses.json',
  editorial: {
    status: 'source-language-only',
    portugueseFallback: 'english',
    reviewedTranslations: 0,
    draftTranslations: 0,
  },
};

await writeDeterministicJson(args.output, packageData);
const rawBytes = (await fs.stat(args.output)).size;
const temporaryGzip = `${args.output}.measure.gz`;
await pipeline(createReadStream(args.output), createGzip({ level: 9 }), createWriteStream(temporaryGzip));
const gzipBytes = (await fs.stat(temporaryGzip)).size;
await fs.rm(temporaryGzip, { force: true });

const report = {
  schemaVersion: 1,
  tier: args.tier,
  packageId: packageData.id,
  packageVersion: packageData.version,
  sourceVersions: Object.fromEntries(packageData.sources.map((source) => [source.id, source.version])),
  counts: {
    lexicalEntries: packageData.entries.length,
    commonLexicalEntries: packageData.entries.filter((entry) => entry.common).length,
    kanjiEntries: packageData.kanji.length,
    kanjiWithFrequency: packageData.kanji.filter((entry) => entry.frequency).length,
  },
  sizes: {
    jsonBytes: rawBytes,
    gzipBytes,
    compressionRatio: Number((gzipBytes / rawBytes).toFixed(4)),
  },
  publication: {
    ready: false,
    blocker: 'phase-15-sharding-and-owner-promotion-pending',
  },
};
await writeDeterministicJson(args.report, report);

console.log(`${args.tier}: ${report.counts.lexicalEntries} palavras, ${report.counts.kanjiEntries} kanji.`);
console.log(`JSON: ${rawBytes} bytes; gzip: ${gzipBytes} bytes.`);
console.log(`Saida: ${path.resolve(args.output)}`);
