import path from 'node:path';

import { validatePagesArtifact } from './lib/pages-artifact.mjs';

const outputArgument = readArgument('--output') || '_site';
const result = await validatePagesArtifact({ outputRoot: path.resolve(outputArgument) });

console.log('Artifact estatico do GitHub Pages validado.');
console.log(JSON.stringify(result, null, 2));

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : '';
}
