import fs from 'node:fs/promises';
import path from 'node:path';

import {
  createArtifactDescriptor,
  createDistributionManifest,
  createDistributionRoutes,
  validateRelativeArtifactPath,
} from './lib/distribution-manifest.mjs';
import { SEARCH_INDEX_KINDS } from './lib/search-indexes.mjs';
import { parseCliArgs, readJsonFile, writeDeterministicJson } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['package', 'entry-shards', 'indexes', 'routes', 'manifest'],
  optional: ['dictionary-root', 'licenses', 'entry-config', 'index-config'],
});
const dictionaryRoot = path.resolve(args['dictionary-root'] || 'Applications/japanese-study/data/dictionary');
const paths = {
  package: path.resolve(args.package),
  licenses: path.resolve(args.licenses || path.join(dictionaryRoot, 'licenses.json')),
  entryShards: path.resolve(args['entry-shards']),
  indexes: path.resolve(args.indexes),
  routes: path.resolve(args.routes),
  manifest: path.resolve(args.manifest),
};
const [packageData, entryConfig, indexConfig] = await Promise.all([
  readJsonFile(paths.package),
  readJsonFile(args['entry-config'] || 'scripts/dictionary/config/sharding.json'),
  readJsonFile(args['index-config'] || 'scripts/dictionary/config/search-indexes.json'),
]);
const entryArtifacts = await readPayloadArtifacts(paths.entryShards, /^[a-f0-9]{2}\.json$/u);
const indexArtifacts = [];
for (const indexKind of SEARCH_INDEX_KINDS) {
  indexArtifacts.push(...await readPayloadArtifacts(
    path.join(paths.indexes, indexKind),
    /^(?:[a-z0-9]{1,2}|_|u-[a-f0-9]{2,6})\.json$/u,
  ));
}
const routes = createDistributionRoutes({
  packageData, entryArtifacts, indexArtifacts, entryConfig, indexConfig,
});

await fs.mkdir(paths.routes, { recursive: true });
const routePaths = {
  entries: path.join(paths.routes, 'entries.json'),
  indexes: Object.fromEntries(SEARCH_INDEX_KINDS.map((kind) => [kind, path.join(paths.routes, `${kind}.json`)])),
};
await Promise.all([
  writeDeterministicJson(routePaths.entries, routes.entries),
  ...SEARCH_INDEX_KINDS.map((kind) => writeDeterministicJson(routePaths.indexes[kind], routes.indexes[kind])),
]);
const routeDescriptors = {
  entries: await descriptorForFile(routePaths.entries),
  indexes: Object.fromEntries(await Promise.all(SEARCH_INDEX_KINDS.map(async (kind) => (
    [kind, await descriptorForFile(routePaths.indexes[kind])]
  )))),
};
const manifest = createDistributionManifest({
  packageData,
  packDescriptor: await descriptorForFile(paths.package),
  licensesDescriptor: await descriptorForFile(paths.licenses),
  routeDescriptors,
});
await writeDeterministicJson(paths.manifest, manifest);

console.log('Routes e manifesto local gerados.');
console.log(JSON.stringify({
  dictionaryVersion: manifest.dictionaryVersion,
  releaseStatus: manifest.releaseStatus,
  entryRoutes: Object.keys(routes.entries.buckets).length,
  indexRoutes: Object.fromEntries(SEARCH_INDEX_KINDS.map((kind) => [kind, Object.keys(routes.indexes[kind].buckets).length])),
  manifest: relativePath(paths.manifest),
}, null, 2));

async function readPayloadArtifacts(directory, pattern) {
  const names = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((item) => item.isFile() && pattern.test(item.name))
    .map((item) => item.name)
    .sort();
  return Promise.all(names.map(async (name) => {
    const filePath = path.join(directory, name);
    const [payload, bytes] = await Promise.all([readJsonFile(filePath), fs.readFile(filePath)]);
    return { payload, descriptor: createArtifactDescriptor(relativePath(filePath), bytes) };
  }));
}

async function descriptorForFile(filePath) {
  return createArtifactDescriptor(relativePath(filePath), await fs.readFile(filePath));
}

function relativePath(filePath) {
  const relative = path.relative(dictionaryRoot, path.resolve(filePath)).split(path.sep).join('/');
  return validateRelativeArtifactPath(relative);
}
