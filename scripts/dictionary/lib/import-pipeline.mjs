import path from 'node:path';

import { PIPELINE_SCHEMA_VERSION } from './pipeline-schema.mjs';
import { readJsonFile, readSourceSnapshot } from './source-io.mjs';
import { selectKanjiBootstrap, selectLexicalBootstrap } from './bootstrap-selection.mjs';
import { parseJmdictXml, parseKanjidic2Xml } from './xml-sources.mjs';

export async function importJmdictSnapshot(options) {
  const context = await loadImportContext(options, 'jmdict');
  const parsed = parseJmdictXml(context.snapshot.text, context.source);
  const selected = selectLexicalBootstrap(parsed, context.baseline);
  return createArtifact(context, parsed.length, selected);
}

export async function importKanjidic2Snapshot(options) {
  const context = await loadImportContext(options, 'kanjidic2');
  const parsed = parseKanjidic2Xml(context.snapshot.text, context.source);
  const selected = selectKanjiBootstrap(parsed, context.baseline);
  return createArtifact(context, parsed.length, selected);
}

export function validateImportArtifacts(jmdict, kanjidic2, selection) {
  validateArtifact(jmdict, 'jmdict');
  validateArtifact(kanjidic2, 'kanjidic2');
  if (jmdict.selection.unmatched.length) {
    throw new TypeError(`JMdict import has ${jmdict.selection.unmatched.length} unmatched baseline entries.`);
  }
  if (!selection.allowAmbiguousLexicalMatches && jmdict.selection.ambiguous.length) {
    throw new TypeError(`JMdict import has ${jmdict.selection.ambiguous.length} ambiguous baseline entries.`);
  }
  if (selection.requireAllKanjiMatches && kanjidic2.selection.unmatched.length) {
    throw new TypeError(`KANJIDIC2 import has ${kanjidic2.selection.unmatched.length} unmatched baseline entries.`);
  }
  return {
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    valid: true,
    sources: [jmdict.metadata.source, kanjidic2.metadata.source],
    counts: {
      lexicalEntries: jmdict.entries.length,
      kanjiEntries: kanjidic2.entries.length,
      lexicalAmbiguities: jmdict.selection.ambiguous.length,
    },
  };
}

async function loadImportContext(options, sourceId) {
  const version = String(options.version || '').trim();
  if (!version) throw new TypeError(`${sourceId} import requires a pinned version.`);
  if (!isIsoDate(version)) {
    throw new TypeError(`${sourceId} version must use a valid YYYY-MM-DD source date.`);
  }
  const selection = options.selection || await readJsonFile(options.selectionPath);
  if (selection.schemaVersion !== 1 || selection.packageId !== 'bootstrap-n5') {
    throw new TypeError('Unsupported bootstrap selection configuration.');
  }
  const baselinePath = sourceId === 'jmdict'
    ? selection.lexicalBaselinePath
    : selection.kanjiBaselinePath;
  const baseline = options.baseline || await readJsonFile(path.resolve(options.rootDir, baselinePath));
  const snapshot = options.snapshot || await readSourceSnapshot(options.inputPath, {
    expectedSha256: options.expectedSha256,
  });
  return {
    sourceId,
    source: { id: sourceId, version, sha256: snapshot.sha256 },
    selection,
    baseline,
    snapshot,
  };
}

function isIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function createArtifact(context, parsedCount, selected) {
  return {
    schemaVersion: PIPELINE_SCHEMA_VERSION,
    metadata: {
      source: context.source,
      snapshotFile: context.snapshot.fileName,
      compressed: context.snapshot.compressed,
      byteLength: context.snapshot.byteLength,
      parsedCount,
      selectedCount: selected.entries.length,
    },
    selection: selected.report,
    aliases: selected.aliases,
    entries: selected.entries,
  };
}

function validateArtifact(artifact, expectedSource) {
  if (!artifact || artifact.schemaVersion !== PIPELINE_SCHEMA_VERSION) {
    throw new TypeError(`${expectedSource} artifact has an unsupported schema.`);
  }
  if (artifact.metadata?.source?.id !== expectedSource) {
    throw new TypeError(`Expected ${expectedSource} import artifact.`);
  }
  if (!artifact.metadata.source.version) throw new TypeError(`${expectedSource} artifact has no source version.`);
  if (!/^[a-f0-9]{64}$/.test(artifact.metadata.source.sha256 || '')) {
    throw new TypeError(`${expectedSource} artifact has an invalid source hash.`);
  }
  if (!Array.isArray(artifact.entries) || !Array.isArray(artifact.aliases)) {
    throw new TypeError(`${expectedSource} artifact has invalid entry or alias lists.`);
  }
  const ids = artifact.entries.map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) throw new TypeError(`${expectedSource} artifact has duplicate IDs.`);
  if (artifact.metadata.selectedCount !== artifact.entries.length) {
    throw new TypeError(`${expectedSource} artifact count does not match its entries.`);
  }
}
