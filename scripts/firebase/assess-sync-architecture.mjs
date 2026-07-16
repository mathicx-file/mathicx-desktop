import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { assessSyncArchitecture } from './lib/sync-architecture-assessment.mjs';

const metricsPath = readArgument('--metrics');
const metrics = metricsPath
  ? JSON.parse(await fs.readFile(path.resolve(process.cwd(), metricsPath), 'utf8'))
  : {};
const report = assessSyncArchitecture({ metrics });

console.log(JSON.stringify(report, null, 2));

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : '';
}
