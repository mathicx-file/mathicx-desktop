import fs from 'node:fs/promises';
import path from 'node:path';

import { generateBootstrapPackage } from './lib/bootstrap-package.mjs';
import {
  hashFileSha256,
  hashFilesSha256,
  parseCliArgs,
  readJsonFile,
  writeDeterministicJson,
} from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: [
    'jmdict', 'kanjidic2', 'output', 'report', 'version',
    'kanjivg-archive', 'kanjivg-version', 'project-version',
  ],
  optional: ['selection', 'dictionary', 'kanji', 'stroke-dir', 'review'],
});
const paths = {
  selection: path.resolve(args.selection || 'scripts/dictionary/config/bootstrap-selection.json'),
  dictionary: path.resolve(args.dictionary || 'Applications/japanese-study/data/dictionary.json'),
  kanji: path.resolve(args.kanji || 'Applications/japanese-study/data/kanji.json'),
  strokeDir: path.resolve(args['stroke-dir'] || 'Applications/japanese-study/assets/strokes/kanji'),
};
const [jmdict, kanjidic2, selection, legacyDictionary, legacyKanji, editorialReview] = await Promise.all([
  readJsonFile(args.jmdict),
  readJsonFile(args.kanjidic2),
  readJsonFile(paths.selection),
  readJsonFile(paths.dictionary),
  readJsonFile(paths.kanji),
  args.review ? readJsonFile(args.review) : Promise.resolve(null),
]);
const [kanjivgSha256, projectSha256, strokeAssets] = await Promise.all([
  hashFileSha256(args['kanjivg-archive']),
  hashFilesSha256([paths.dictionary, paths.kanji]),
  loadStrokeAssets(kanjidic2.entries, paths.strokeDir),
]);
const result = generateBootstrapPackage({
  jmdict,
  kanjidic2,
  selection,
  legacyDictionary,
  legacyKanji,
  version: args.version,
  kanjivgVersion: args['kanjivg-version'],
  kanjivgSha256,
  projectVersion: args['project-version'],
  projectSha256,
  strokeAssets,
  editorialReview,
});
await Promise.all([
  writeDeterministicJson(args.output, result.packageData),
  writeDeterministicJson(args.report, result.report),
]);

const outputSize = (await fs.stat(path.resolve(args.output))).size;
console.log(`bootstrap-n5: ${result.packageData.entries.length} palavras, ${result.packageData.kanji.length} kanji.`);
console.log(`Revisao: ${result.report.coverage.ambiguousWords} ambiguidades, ${result.packageData.editorial.draftTranslations} traducoes em rascunho.`);
console.log(`Tamanho: ${outputSize} bytes.`);

async function loadStrokeAssets(kanjiEntries, strokeDir) {
  return Promise.all(kanjiEntries.map(async (entry) => {
    const hex = entry.literal.codePointAt(0).toString(16).toLowerCase().padStart(5, '0');
    const fileName = `${hex}.svg`;
    const filePath = path.join(strokeDir, fileName);
    const content = await fs.readFile(filePath, 'utf8');
    if (!content.includes('KanjiVG') || !content.includes('creativecommons.org/licenses/by-sa/3.0')) {
      throw new TypeError(`${fileName} is missing KanjiVG attribution or license metadata.`);
    }
    return {
      literal: entry.literal,
      path: `assets/strokes/kanji/${fileName}`,
      sha256: await hashFileSha256(filePath),
      source: { id: 'kanjivg', version: args['kanjivg-version'], entryId: entry.codePoint },
    };
  }));
}
