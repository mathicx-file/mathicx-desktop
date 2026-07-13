import path from 'node:path';

import { buildPagesArtifact } from './lib/pages-artifact.mjs';

const outputArgument = readArgument('--output') || '_site';
const result = await buildPagesArtifact({ outputRoot: path.resolve(outputArgument) });

console.log('Artifact estatico do GitHub Pages preparado.');
console.log(JSON.stringify({
  output: path.relative(process.cwd(), result.outputRoot).split(path.sep).join('/'),
  files: result.fileCount,
  byteLength: result.byteLength,
  dictionaryVersion: result.dictionary.dictionaryVersion,
  distributionArtifacts: result.dictionary.artifacts.distribution,
}, null, 2));

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}
