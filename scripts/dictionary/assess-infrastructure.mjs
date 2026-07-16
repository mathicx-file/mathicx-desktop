import path from 'node:path';

import { assessDictionaryInfrastructure } from './lib/infrastructure-assessment.mjs';

const root = process.cwd();
const result = await assessDictionaryInfrastructure({
  dictionaryRoot: process.argv[2] || path.join(root, 'Applications/japanese-study/data/dictionary'),
  pagesRoot: process.argv[3] || path.join(root, '_site'),
});

console.log(JSON.stringify(result, null, 2));
