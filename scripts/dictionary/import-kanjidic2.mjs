import path from 'node:path';

import { importKanjidic2Snapshot } from './lib/import-pipeline.mjs';
import { parseCliArgs, writeDeterministicJson } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['input', 'output', 'version'],
  optional: ['expected-sha256', 'selection'],
});
const rootDir = process.cwd();
const artifact = await importKanjidic2Snapshot({
  rootDir,
  inputPath: args.input,
  version: args.version,
  expectedSha256: args['expected-sha256'],
  selectionPath: path.resolve(args.selection || 'scripts/dictionary/config/bootstrap-selection.json'),
});
await writeDeterministicJson(args.output, artifact);

console.log(`KANJIDIC2: ${artifact.metadata.selectedCount}/${artifact.metadata.parsedCount} kanji selecionados.`);
console.log(`SHA-256: ${artifact.metadata.source.sha256}`);
console.log(`Saida: ${path.resolve(args.output)}`);
