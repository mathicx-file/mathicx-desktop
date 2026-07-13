import fs from 'node:fs/promises';
import path from 'node:path';

import { validateBootstrapOutput } from './lib/bootstrap-package.mjs';
import { hashFileSha256, parseCliArgs, readJsonFile } from './lib/source-io.mjs';

const args = parseCliArgs(process.argv.slice(2), {
  required: ['package', 'report'],
  optional: ['licenses', 'max-bytes', 'app-root'],
});
const packagePath = path.resolve(args.package);
const [packageData, report, licenses, stat] = await Promise.all([
  readJsonFile(packagePath),
  readJsonFile(args.report),
  readJsonFile(args.licenses || 'Applications/japanese-study/data/dictionary/licenses.json'),
  fs.stat(packagePath),
]);
const result = validateBootstrapOutput(packageData, report, licenses, {
  byteLength: stat.size,
  maxBytes: args['max-bytes'] ? Number(args['max-bytes']) : undefined,
});
const appRoot = path.resolve(args['app-root'] || 'Applications/japanese-study');
await Promise.all(packageData.strokeAssets.map(async (asset) => {
  const assetPath = path.resolve(appRoot, asset.path);
  const actualHash = await hashFileSha256(assetPath);
  if (actualHash !== asset.sha256) throw new TypeError(`Stroke asset hash mismatch: ${asset.path}.`);
  const content = await fs.readFile(assetPath, 'utf8');
  if (!content.includes('KanjiVG') || !content.includes('creativecommons.org/licenses/by-sa/3.0')) {
    throw new TypeError(`Stroke asset attribution missing: ${asset.path}.`);
  }
}));

console.log('bootstrap-n5 validado.');
console.log(JSON.stringify({ ...result, strokeAssetsVerified: packageData.strokeAssets.length }, null, 2));
