import { createEditorialReview, summarizeEditorialReview } from './lib/editorial-review.mjs';
import { parseCliArgs, readJsonFile, writeDeterministicJson } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['jmdict', 'kanjidic2', 'output', 'package-version', 'accepted-at'],
  optional: ['dictionary', 'kanji'],
});
const [jmdict, kanjidic2, legacyDictionary, legacyKanji] = await Promise.all([
  readJsonFile(args.jmdict),
  readJsonFile(args.kanjidic2),
  readJsonFile(args.dictionary || 'Applications/japanese-study/data/dictionary.json'),
  readJsonFile(args.kanji || 'Applications/japanese-study/data/kanji.json'),
]);
const review = createEditorialReview({
  jmdict,
  kanjidic2,
  legacyDictionary,
  legacyKanji,
  packageVersion: args['package-version'],
  acceptedAt: args['accepted-at'],
});
await writeDeterministicJson(args.output, review);

console.log('Revisao editorial hibrida preparada.');
console.log(JSON.stringify(summarizeEditorialReview(review), null, 2));
