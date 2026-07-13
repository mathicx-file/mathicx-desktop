import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const GZIP_MAGIC = Buffer.from([0x1f, 0x8b]);
const MOJIBAKE_PATTERN = /(?:\u00c3[\u0080-\u00ff]|\u00c2[\u0080-\u00ff]|[\u0080-\u009f]|\ufffd)/u;

export async function readSourceSnapshot(inputPath, options = {}) {
  const resolvedPath = path.resolve(inputPath);
  const raw = await fs.readFile(resolvedPath);
  const sha256 = createHash('sha256').update(raw).digest('hex');
  const expected = cleanHash(options.expectedSha256);
  if (expected && sha256 !== expected) {
    throw new TypeError(`SHA-256 mismatch for ${path.basename(resolvedPath)}.`);
  }

  const bytes = isGzip(raw) ? gunzipSync(raw) : raw;
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TypeError(`${path.basename(resolvedPath)} is not valid UTF-8.`, { cause: error });
  }
  text = text.replace(/^\uFEFF/u, '');
  assertNoMojibake(text, path.basename(resolvedPath));

  return Object.freeze({
    path: resolvedPath,
    fileName: path.basename(resolvedPath),
    compressed: isGzip(raw),
    byteLength: raw.byteLength,
    uncompressedByteLength: bytes.byteLength,
    sha256,
    text,
  });
}

export async function readJsonFile(filePath) {
  const text = await fs.readFile(path.resolve(filePath), 'utf8');
  assertNoMojibake(text, path.basename(filePath));
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new TypeError(`${path.basename(filePath)} is not valid JSON.`, { cause: error });
  }
}

export async function hashFileSha256(filePath) {
  const bytes = await fs.readFile(path.resolve(filePath));
  return createHash('sha256').update(bytes).digest('hex');
}

export async function hashFilesSha256(filePaths) {
  const files = [...filePaths].map((filePath) => path.resolve(filePath)).sort();
  const hash = createHash('sha256');
  for (const filePath of files) {
    const bytes = await fs.readFile(filePath);
    hash.update(path.basename(filePath));
    hash.update('\0');
    hash.update(String(bytes.byteLength));
    hash.update('\0');
    hash.update(bytes);
  }
  return hash.digest('hex');
}

export async function writeDeterministicJson(filePath, payload) {
  const resolvedPath = path.resolve(filePath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

export function assertNoMojibake(text, label = 'content') {
  if (MOJIBAKE_PATTERN.test(String(text))) {
    throw new TypeError(`${label} contains invalid UTF-8 or known mojibake sequences.`);
  }
}

export function parseCliArgs(argv, options = {}) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new TypeError(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new TypeError(`Missing value for --${key}.`);
    if (Object.hasOwn(result, key)) throw new TypeError(`Duplicate argument: --${key}.`);
    result[key] = value;
    index += 1;
  }
  for (const key of options.required || []) {
    if (!result[key]) throw new TypeError(`Missing required argument: --${key}.`);
  }
  const allowed = new Set([...(options.required || []), ...(options.optional || [])]);
  for (const key of Object.keys(result)) {
    if (!allowed.has(key)) throw new TypeError(`Unknown argument: --${key}.`);
  }
  return result;
}

function isGzip(bytes) {
  return bytes.length >= 2 && bytes[0] === GZIP_MAGIC[0] && bytes[1] === GZIP_MAGIC[1];
}

function cleanHash(value) {
  const hash = String(value || '').trim().toLowerCase();
  if (hash && !/^[a-f0-9]{64}$/.test(hash)) throw new TypeError('Expected SHA-256 must use 64 hex characters.');
  return hash;
}
