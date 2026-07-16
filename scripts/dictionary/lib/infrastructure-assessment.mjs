import fs from 'node:fs/promises';
import path from 'node:path';

export const DEFAULT_INFRASTRUCTURE_THRESHOLDS = Object.freeze({
  pagesMigrationBytes: 512 * 1024 * 1024,
  singleArtifactBytes: 50 * 1024 * 1024,
});

export async function assessDictionaryInfrastructure(options) {
  const thresholds = {
    ...DEFAULT_INFRASTRUCTURE_THRESHOLDS,
    ...(options?.thresholds || {}),
  };
  const dictionary = await measureTree(options?.dictionaryRoot);
  const pages = options?.pagesRoot ? await measureTree(options.pagesRoot) : null;
  const triggers = {
    pagesCapacity: Boolean(pages && pages.bytes >= thresholds.pagesMigrationBytes),
    largeArtifact: dictionary.largestBytes >= thresholds.singleArtifactBytes,
  };

  return {
    decision: Object.values(triggers).some(Boolean) ? 'review-external-infrastructure' : 'keep-static',
    measuredAt: new Date().toISOString(),
    thresholds,
    dictionary,
    pages,
    triggers,
    evidenceRequired: [
      'monthly-bandwidth',
      'search-latency-p95',
      'release-frequency',
      'active-editor-count',
    ],
  };
}

export async function measureTree(root) {
  if (!root) throw new TypeError('A directory path is required.');
  const absoluteRoot = path.resolve(root);
  const files = await listFiles(absoluteRoot);
  let bytes = 0;
  let largestBytes = 0;
  let largestPath = '';
  for (const file of files) {
    const stat = await fs.stat(file);
    bytes += stat.size;
    if (stat.size > largestBytes) {
      largestBytes = stat.size;
      largestPath = path.relative(absoluteRoot, file).replaceAll(path.sep, '/');
    }
  }
  return { root: absoluteRoot, files: files.length, bytes, largestBytes, largestPath };
}

async function listFiles(root) {
  const output = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const target = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(target));
    else if (entry.isFile()) output.push(target);
  }
  return output;
}
