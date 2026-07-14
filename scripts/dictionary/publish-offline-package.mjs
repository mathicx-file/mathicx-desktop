import fs from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { createBrowsePages, createBrowseRoute } from './lib/browse-pages.mjs';
import { createArtifactDescriptor } from './lib/distribution-manifest.mjs';
import { SEARCH_INDEX_KINDS } from './lib/search-indexes.mjs';
import { parseCliArgs, readJsonFile, writeDeterministicJson } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['id', 'package', 'package-report', 'entry-report', 'index-report', 'entry-dir', 'index-dir', 'output'],
  optional: ['entry-config', 'index-config', 'browse-config', 'distribution-revision'],
});
const [packageData, packageReport, entryReport, indexReport, entryConfig, indexConfig, browseConfig] = await Promise.all([
  readJsonFile(args.package),
  readJsonFile(args['package-report']),
  readJsonFile(args['entry-report']),
  readJsonFile(args['index-report']),
  readJsonFile(args['entry-config'] || 'scripts/dictionary/config/sharding.json'),
  readJsonFile(args['index-config'] || 'scripts/dictionary/config/search-indexes.json'),
  readJsonFile(args['browse-config'] || 'scripts/dictionary/config/browse-pages.json'),
]);

const packageId = packageReport.packageId;
const version = packageReport.packageVersion;
assertIdentity(packageId, version, entryReport, indexReport);
if (packageData.id !== packageId || packageData.version !== version) {
  throw new TypeError('Offline package source targets a different package identity.');
}
const distributionRevision = positiveInteger(args['distribution-revision'] || 2, 'distribution revision');
const relativeRoot = `packages/${version}/${args.id}`;
const outputRoot = path.resolve(args.output);
const packageRoot = path.join(outputRoot, ...relativeRoot.split('/'));
await fs.rm(packageRoot, { recursive: true, force: true });
await fs.mkdir(packageRoot, { recursive: true });

const entryArtifacts = await compressDirectory({
  sourceRoot: path.resolve(args['entry-dir']),
  outputRoot,
  relativeRoot: `${relativeRoot}/entries`,
  kind: 'entry-shard',
  validate(payload, file) {
    if (payload.kind !== 'dictionary-entry-shard' || payload.packageId !== packageId
      || payload.dictionaryVersion !== version || `${payload.shardId}.json` !== file) {
      throw new TypeError(`Invalid entry shard candidate: ${file}`);
    }
  },
});
const indexArtifacts = Object.fromEntries(await Promise.all(SEARCH_INDEX_KINDS.map(async (indexKind) => (
  [indexKind, await compressDirectory({
    sourceRoot: path.resolve(args['index-dir'], indexKind),
    outputRoot,
    relativeRoot: `${relativeRoot}/indexes/${indexKind}`,
    kind: 'index-shard',
    allowMissing: indexReport.indexes?.[indexKind]?.shards === 0,
    validate(payload, file) {
      if (payload.kind !== 'dictionary-search-index-shard' || payload.indexKind !== indexKind
        || payload.packageId !== packageId || payload.dictionaryVersion !== version
        || `${payload.bucket}.json` !== file) {
        throw new TypeError(`Invalid ${indexKind} index shard candidate: ${file}`);
      }
    },
  })]
))));
const browseResult = createBrowsePages(packageData, browseConfig);
const browseArtifacts = await Promise.all(browseResult.pages.map(async (payload) => ({
  payload,
  descriptor: (await writeCompressedJson(
    outputRoot,
    `${relativeRoot}/browse/${payload.pageId}.json.gz`,
    payload,
    'browse-page',
  )).descriptor,
})));

if (entryArtifacts.length !== entryReport.routing.emittedShardCount) {
  throw new TypeError('Entry shard count differs from its validated report.');
}
for (const indexKind of SEARCH_INDEX_KINDS) {
  if (indexArtifacts[indexKind].length !== indexReport.indexes[indexKind].shards) {
    throw new TypeError(`${indexKind} shard count differs from its validated report.`);
  }
}

const entryRoute = {
  schemaVersion: 1,
  kind: 'dictionary-entry-routes',
  packageId,
  dictionaryVersion: version,
  routing: {
    strategy: entryConfig.strategy,
    prefixLength: entryConfig.prefixLength,
  },
  coverage: {
    shards: entryArtifacts.length,
    entries: packageReport.counts.lexicalEntries,
  },
  buckets: Object.fromEntries(entryArtifacts.map((item) => [item.bucket, item.descriptor])),
};
const indexRoutes = Object.fromEntries(SEARCH_INDEX_KINDS.map((indexKind) => {
  const report = indexReport.indexes[indexKind];
  return [indexKind, {
    schemaVersion: 1,
    kind: 'dictionary-search-routes',
    indexKind,
    packageId,
    dictionaryVersion: version,
    routing: indexConfig.routing[indexKind],
    normalization: {
      form: indexKind === 'written' ? 'NFKC' : 'NFKD',
      locale: indexKind === 'written' || indexKind === 'reading' ? 'ja-JP' : 'und',
    },
    coverage: {
      shards: report.shards,
      terms: report.terms,
      references: report.references,
    },
    buckets: Object.fromEntries(indexArtifacts[indexKind].map((item) => [item.bucket, item.descriptor])),
  }];
}));
const browseRoute = createBrowseRoute(packageData, browseArtifacts, browseConfig);

const routeArtifacts = [
  await writeCompressedJson(outputRoot, `${relativeRoot}/routes/entries.json.gz`, entryRoute, 'route'),
  ...await Promise.all(SEARCH_INDEX_KINDS.map((kind) => writeCompressedJson(
    outputRoot, `${relativeRoot}/routes/${kind}.json.gz`, indexRoutes[kind], 'route',
  ))),
  await writeCompressedJson(outputRoot, `${relativeRoot}/routes/browse.json.gz`, browseRoute, 'route'),
];
const manifest = {
  format: 'mathicx-japanese-dictionary-offline-package',
  schemaVersion: 1,
  id: args.id,
  packageId,
  dictionaryVersion: version,
  distributionRevision,
  encoding: 'gzip',
  routes: {
    entries: routeArtifacts[0].descriptor,
    indexes: Object.fromEntries(SEARCH_INDEX_KINDS.map((kind, index) => (
      [kind, routeArtifacts[index + 1].descriptor]
    ))),
    browse: routeArtifacts.at(-1).descriptor,
  },
  artifacts: [
    ...routeArtifacts.map((item) => item.descriptor),
    ...entryArtifacts.map((item) => item.descriptor),
    ...SEARCH_INDEX_KINDS.flatMap((kind) => indexArtifacts[kind].map((item) => item.descriptor)),
    ...browseArtifacts.map((item) => item.descriptor),
  ],
};
const manifestPath = `${relativeRoot}/manifest.json`;
await writeDeterministicJson(path.join(outputRoot, ...manifestPath.split('/')), manifest);
const manifestBytes = await fs.readFile(path.join(outputRoot, ...manifestPath.split('/')));
const manifestDescriptor = createArtifactDescriptor(manifestPath, manifestBytes);
const estimatedByteLength = manifestDescriptor.byteLength
  + manifest.artifacts.reduce((total, item) => total + item.byteLength, 0);

console.log(JSON.stringify({
  id: args.id,
  packageId,
  version,
  manifest: manifestDescriptor,
  artifacts: manifest.artifacts.length + 1,
  estimatedByteLength,
  entryCount: packageReport.counts.lexicalEntries,
  kanjiCount: packageReport.counts.kanjiEntries,
  distributionRevision,
  browsePages: browseArtifacts.length,
  browseBytes: browseArtifacts.reduce((total, item) => total + item.descriptor.byteLength, 0),
}, null, 2));

async function compressDirectory(options) {
  let files;
  try {
    files = (await fs.readdir(options.sourceRoot, { withFileTypes: true }))
      .filter((item) => item.isFile() && item.name.endsWith('.json'))
      .map((item) => item.name)
      .sort();
  } catch (error) {
    if (options.allowMissing && error?.code === 'ENOENT') return [];
    throw error;
  }
  const result = [];
  for (const file of files) {
    const source = await fs.readFile(path.join(options.sourceRoot, file));
    const payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(source));
    options.validate(payload, file);
    const bucket = file.slice(0, -'.json'.length);
    const outputPath = `${options.relativeRoot}/${file}.gz`;
    const descriptor = await writeCompressedBytes(options.outputRoot, outputPath, source, options.kind);
    result.push({ bucket, descriptor });
  }
  return result;
}

async function writeCompressedJson(outputRoot, relativePath, payload, kind) {
  const bytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { descriptor: await writeCompressedBytes(outputRoot, relativePath, bytes, kind) };
}

async function writeCompressedBytes(outputRoot, relativePath, bytes, kind) {
  const compressed = gzipSync(bytes, { level: 9, mtime: 0 });
  const target = path.join(outputRoot, ...relativePath.split('/'));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, compressed);
  return {
    ...createArtifactDescriptor(relativePath, compressed),
    kind,
    encoding: 'gzip',
  };
}

function assertIdentity(packageId, version, entryReport, indexReport) {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(args.id) || !packageId
    || !/^\d{4}\.\d{2}\.\d{2}-\d+$/u.test(version)) {
    throw new TypeError('Offline package identity is invalid.');
  }
  for (const report of [entryReport, indexReport]) {
    if (report.packageId !== packageId || report.dictionaryVersion !== version) {
      throw new TypeError('Offline package reports target different package identities.');
    }
  }
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new TypeError(`Invalid ${label}.`);
  return number;
}
