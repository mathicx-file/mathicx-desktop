import fs from 'node:fs/promises';
import path from 'node:path';

import {
  verifyArtifactDescriptor,
  verifyDictionaryDistribution,
  validateRelativeArtifactPath,
} from './lib/distribution-manifest.mjs';
import { validateEntryShards } from './lib/entry-shards.mjs';
import { SEARCH_INDEX_KINDS, validateSearchIndexes } from './lib/search-indexes.mjs';
import { assertNoMojibake, parseCliArgs, readJsonFile } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['manifest'],
  optional: ['dictionary-root', 'entry-config', 'index-config'],
});
const dictionaryRoot = path.resolve(args['dictionary-root'] || 'Applications/japanese-study/data/dictionary');
const [manifest, entryConfig, indexConfig] = await Promise.all([
  readJsonFile(args.manifest),
  readJsonFile(args['entry-config'] || 'scripts/dictionary/config/sharding.json'),
  readJsonFile(args['index-config'] || 'scripts/dictionary/config/search-indexes.json'),
]);
const artifacts = new Map();
const packageData = await readDescribedJson(manifest.defaultPack);
const licenses = await readDescribedJson(manifest.licenses);
const routes = {
  entries: await readDescribedJson(manifest.routes.entries),
  indexes: Object.fromEntries(await Promise.all(SEARCH_INDEX_KINDS.map(async (kind) => (
    [kind, await readDescribedJson(manifest.routes.indexes[kind])]
  )))),
};
const entryArtifacts = await Promise.all(Object.values(routes.entries.buckets).map(async (descriptor) => ({
  descriptor,
  payload: await readDescribedJson(descriptor),
})));
const indexArtifacts = [];
for (const kind of SEARCH_INDEX_KINDS) {
  indexArtifacts.push(...await Promise.all(Object.values(routes.indexes[kind].buckets).map(async (descriptor) => ({
    descriptor,
    payload: await readDescribedJson(descriptor),
  }))));
}

validateEntryShards(packageData, entryArtifacts.map((item) => item.payload), entryConfig);
validateSearchIndexes(packageData, indexArtifacts.map((item) => item.payload), indexConfig);
const result = verifyDictionaryDistribution({
  manifest, packageData, licenses, routes, entryArtifacts, indexArtifacts, artifacts,
});

console.log('Manifesto e cadeia de hashes validados.');
console.log(JSON.stringify(result, null, 2));

async function readDescribedJson(descriptor) {
  const filePath = safeResolve(descriptor.path);
  const bytes = await fs.readFile(filePath);
  verifyArtifactDescriptor(descriptor, bytes);
  artifacts.set(descriptor.path, bytes);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TypeError(`Dictionary artifact is not valid UTF-8: ${descriptor.path}.`, { cause: error });
  }
  assertNoMojibake(text, descriptor.path);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new TypeError(`Dictionary artifact is not valid JSON: ${descriptor.path}.`, { cause: error });
  }
}

function safeResolve(relativePath) {
  const safePath = validateRelativeArtifactPath(relativePath);
  const resolved = path.resolve(dictionaryRoot, ...safePath.split('/'));
  const prefix = `${dictionaryRoot}${path.sep}`.toLowerCase();
  if (!resolved.toLowerCase().startsWith(prefix)) {
    throw new TypeError(`Dictionary artifact escapes its root: ${relativePath}.`);
  }
  return resolved;
}
