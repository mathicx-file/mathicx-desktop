import fs from 'node:fs';
import path from 'node:path';

const CP1252_TO_BYTE = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84],
  [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88],
  [0x2030, 0x89], [0x0160, 0x8a], [0x2039, 0x8b], [0x0152, 0x8c],
  [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
  [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b],
  [0x0153, 0x9c], [0x017e, 0x9e], [0x0178, 0x9f]
]);

const DEFAULT_PATHS = [
  'index.html',
  'manifest.js',
  'view.js',
  'README.md',
  'DOCUMENTATION.md',
  'js',
  'data',
  'tests'
];

const TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.txt'
]);

const MOJIBAKE_PATTERN = /(?:ÃƒÂ|Ã.|Â.|â[\u0080-\u00ff\u2018-\u201d\u2020\u2021\u20ac]+|ã[\u0080-\u00ff]+|\?ltimos|ð[\u0080-\u00ff]+|[\u0080-\u009f])/g;

const shouldFix = process.argv.includes('--fix');
const root = process.cwd();
const files = collectFiles(DEFAULT_PATHS);
const findings = [];

for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  const after = fixText(before);
  const remaining = findMojibake(after);

  if (shouldFix && after !== before) {
    fs.writeFileSync(file, after, 'utf8');
  }

  if (remaining.length) {
    findings.push({ file, samples: remaining.slice(0, 5) });
  }
}

if (findings.length) {
  console.error('Possiveis mojibakes encontrados:');
  for (const finding of findings) {
    console.error('- ' + path.relative(root, finding.file) + ': ' + finding.samples.join(' | '));
  }
  process.exit(1);
}

if (!shouldFix) {
  console.log('Nenhum mojibake conhecido encontrado.');
}

function fixText(text) {
  let current = text;
  for (let i = 0; i < 4; i += 1) {
    const next = current.replace(MOJIBAKE_PATTERN, value => repairMojibakeRun(value));
    if (next === current) return next;
    current = next;
  }
  return current;
}

function repairMojibakeRun(value) {
  const bytes = [];
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint <= 0xff) {
      bytes.push(codePoint);
    } else if (CP1252_TO_BYTE.has(codePoint)) {
      bytes.push(CP1252_TO_BYTE.get(codePoint));
    } else {
      return value;
    }
  }
  const repaired = Buffer.from(bytes).toString('utf8');
  return repaired.includes('\uFFFD') ? value : repaired;
}

function findMojibake(text) {
  const matches = text.match(MOJIBAKE_PATTERN) || [];
  return [...new Set(matches)];
}

function collectFiles(entries) {
  const results = [];
  for (const entry of entries) {
    const resolved = path.resolve(root, entry);
    if (!fs.existsSync(resolved)) continue;
    const stat = fs.statSync(resolved);
    if (stat.isDirectory()) {
      for (const child of fs.readdirSync(resolved)) {
        results.push(...collectFiles([path.join(entry, child)]));
      }
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(resolved))) {
      results.push(resolved);
    }
  }
  return results;
}
