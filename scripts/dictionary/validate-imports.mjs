import path from 'node:path';

import { validateImportArtifacts } from './lib/import-pipeline.mjs';
import { parseCliArgs, readJsonFile } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['jmdict', 'kanjidic2'],
  optional: ['selection'],
});
const [jmdict, kanjidic2, selection] = await Promise.all([
  readJsonFile(args.jmdict),
  readJsonFile(args.kanjidic2),
  readJsonFile(path.resolve(args.selection || 'scripts/dictionary/config/bootstrap-selection.json')),
]);
const report = validateImportArtifacts(jmdict, kanjidic2, selection);

console.log('Imports do dicionario validados.');
console.log(JSON.stringify(report, null, 2));
