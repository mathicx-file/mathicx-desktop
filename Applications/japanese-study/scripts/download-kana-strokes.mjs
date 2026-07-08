import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outputDir = path.join(rootDir, 'assets', 'strokes', 'kana');
const kanjiVgBase = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/';

async function main() {
  const codepoints = await collectKanaCodepoints();
  await mkdir(outputDir, { recursive: true });

  let downloaded = 0;
  let skipped = 0;
  const failed = [];

  for (const codepoint of codepoints) {
    const filename = codepoint.toLowerCase().padStart(5, '0') + '.svg';
    const url = kanjiVgBase + filename;

    try {
      const response = await fetch(url);
      if (!response.ok) {
        failed.push(`${filename}: HTTP ${response.status}`);
        continue;
      }

      const svg = await response.text();
      if (!svg.includes('<path')) {
        failed.push(`${filename}: SVG sem paths`);
        continue;
      }

      await writeFile(path.join(outputDir, filename), svg, 'utf8');
      downloaded++;
    } catch (error) {
      failed.push(`${filename}: ${error.message}`);
    }
  }

  console.log(`SVGs baixados: ${downloaded}`);
  console.log(`SVGs ignorados: ${skipped}`);
  if (failed.length) {
    console.error('Falhas:');
    failed.forEach(item => console.error(`- ${item}`));
    process.exitCode = 1;
  }
}

async function collectKanaCodepoints() {
  const files = ['hiragana.json', 'katakana.json'];
  const codepoints = new Set();

  for (const file of files) {
    const content = await readFile(path.join(rootDir, 'data', file), 'utf8');
    const records = JSON.parse(content);
    records.forEach(record => {
      String(record.unicode || '')
        .split('+')
        .map(part => part.trim().toLowerCase())
        .filter(Boolean)
        .forEach(part => codepoints.add(part));
    });
  }

  return [...codepoints].sort();
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
