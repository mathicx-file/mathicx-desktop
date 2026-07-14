import { createProtocolError } from './app-data-contract.js';
import {
  collectUnifiedBackup,
  validateUnifiedBackupPackage,
} from './unified-backup.js';

export const ENCRYPTED_BACKUP_FORMAT = 'mathicx-encrypted-backup';
export const ENCRYPTED_BACKUP_SCHEMA_VERSION = 1;
export const PBKDF2_ITERATIONS = 600_000;

const AES_KEY_LENGTH = 256;
const AES_TAG_LENGTH = 128;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const MIN_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 256;

export async function collectEncryptedBackup(host, apps, password, options = {}) {
  const unified = await collectUnifiedBackup(host, apps, {
    ...options,
    encrypted: true,
  });
  return encryptUnifiedBackup(unified, password, options);
}

export async function encryptUnifiedBackup(unifiedBackup, password, options = {}) {
  assertPassword(password);
  const validation = await validateUnifiedBackupPackage(unifiedBackup, options);
  if (!validation.ok || unifiedBackup.encrypted !== true) {
    throw createProtocolError('invalid-unified-backup', validation.errors.join(' ') || 'Backup is not marked for protected export.');
  }

  const cryptoImpl = getCrypto(options.cryptoImpl);
  const salt = cryptoImpl.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = cryptoImpl.getRandomValues(new Uint8Array(IV_BYTES));
  const exportedAt = unifiedBackup.exportedAt || new Date().toISOString();
  const encryption = {
    name: 'AES-GCM',
    keyLength: AES_KEY_LENGTH,
    tagLength: AES_TAG_LENGTH,
    iv: bytesToBase64(iv),
    kdf: {
      name: 'PBKDF2',
      hash: 'SHA-256',
      iterations: PBKDF2_ITERATIONS,
      salt: bytesToBase64(salt),
    },
  };
  const envelope = {
    format: ENCRYPTED_BACKUP_FORMAT,
    schemaVersion: ENCRYPTED_BACKUP_SCHEMA_VERSION,
    exportedAt,
    encrypted: true,
    encryption,
  };
  const key = await deriveKey(password, salt, cryptoImpl);
  const plaintext = new TextEncoder().encode(JSON.stringify(unifiedBackup));
  const ciphertext = await cryptoImpl.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    tagLength: AES_TAG_LENGTH,
    additionalData: additionalData(envelope),
  }, key, plaintext);

  return { ...envelope, ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}

export async function decryptUnifiedBackup(envelope, password, options = {}) {
  assertPassword(password);
  const envelopeValidation = validateEncryptedBackupEnvelope(envelope);
  if (!envelopeValidation.ok) {
    throw createProtocolError('invalid-encrypted-backup', envelopeValidation.errors.join(' '));
  }

  const cryptoImpl = getCrypto(options.cryptoImpl);
  const salt = base64ToBytes(envelope.encryption.kdf.salt);
  const iv = base64ToBytes(envelope.encryption.iv);
  const ciphertext = base64ToBytes(envelope.ciphertext);
  const key = await deriveKey(password, salt, cryptoImpl);
  let plaintext;
  try {
    plaintext = await cryptoImpl.subtle.decrypt({
      name: 'AES-GCM',
      iv,
      tagLength: AES_TAG_LENGTH,
      additionalData: additionalData(envelope),
    }, key, ciphertext);
  } catch {
    throw createProtocolError('invalid-password-or-corrupted-backup', 'Senha incorreta ou arquivo de backup corrompido.');
  }

  let unifiedBackup;
  try {
    unifiedBackup = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw createProtocolError('invalid-encrypted-backup', 'O conteudo descriptografado nao e um JSON valido.');
  }
  const validation = await validateUnifiedBackupPackage(unifiedBackup, options);
  if (!validation.ok || unifiedBackup.encrypted !== true) {
    throw createProtocolError('invalid-unified-backup', validation.errors.join(' ') || 'Conteudo protegido invalido.');
  }
  return unifiedBackup;
}

export function validateEncryptedBackupEnvelope(value) {
  const errors = [];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, errors: ['O backup protegido nao e um objeto valido.'] };
  }
  if (value.format !== ENCRYPTED_BACKUP_FORMAT) errors.push('Formato de backup protegido nao reconhecido.');
  if (value.schemaVersion !== ENCRYPTED_BACKUP_SCHEMA_VERSION) errors.push('Versao do backup protegido nao suportada.');
  if (value.encrypted !== true) errors.push('O arquivo nao esta marcado como criptografado.');
  const encryption = value.encryption || {};
  if (encryption.name !== 'AES-GCM' || encryption.keyLength !== AES_KEY_LENGTH || encryption.tagLength !== AES_TAG_LENGTH) {
    errors.push('Parametros AES-GCM invalidos.');
  }
  const kdf = encryption.kdf || {};
  if (kdf.name !== 'PBKDF2' || kdf.hash !== 'SHA-256' || kdf.iterations !== PBKDF2_ITERATIONS) {
    errors.push('Parametros PBKDF2 invalidos.');
  }
  if (!isBase64Bytes(encryption.iv, IV_BYTES)) errors.push('IV invalido.');
  if (!isBase64Bytes(kdf.salt, SALT_BYTES)) errors.push('Salt invalido.');
  if (!isBase64Bytes(value.ciphertext, 17, true)) errors.push('Ciphertext invalido.');
  return { ok: errors.length === 0, errors };
}

export function downloadEncryptedBackup(envelope, options = {}) {
  const validation = validateEncryptedBackupEnvelope(envelope);
  if (!validation.ok) throw createProtocolError('invalid-encrypted-backup', validation.errors.join(' '));
  const documentRef = options.documentRef || globalThis.document;
  const URLImpl = options.URLImpl || globalThis.URL;
  if (!documentRef?.createElement || !URLImpl?.createObjectURL) {
    throw new Error('File download is unavailable in this browser.');
  }
  const blob = new Blob([`${JSON.stringify(envelope, null, 2)}\n`], { type: 'application/json' });
  const url = URLImpl.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = url;
  link.download = options.fileName || createEncryptedBackupFileName(envelope.exportedAt);
  link.hidden = true;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URLImpl.revokeObjectURL(url), 0);
  return { fileName: link.download, byteLength: blob.size };
}

export function createEncryptedBackupFileName(exportedAt) {
  const date = new Date(exportedAt || Date.now());
  const safe = Number.isNaN(date.getTime()) ? new Date() : date;
  return `mathicx-backup-protected-${safe.toISOString().replace(/[:.]/g, '-').replace('Z', '')}.json`;
}

async function deriveKey(password, salt, cryptoImpl) {
  const material = await cryptoImpl.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return cryptoImpl.subtle.deriveKey({
    name: 'PBKDF2',
    salt,
    iterations: PBKDF2_ITERATIONS,
    hash: 'SHA-256',
  }, material, { name: 'AES-GCM', length: AES_KEY_LENGTH }, false, ['encrypt', 'decrypt']);
}

function additionalData(envelope) {
  return new TextEncoder().encode(JSON.stringify({
    format: envelope.format,
    schemaVersion: envelope.schemaVersion,
    exportedAt: envelope.exportedAt,
    encrypted: envelope.encrypted,
    encryption: envelope.encryption,
  }));
}

function assertPassword(password) {
  const length = [...String(password || '')].length;
  if (length < MIN_PASSWORD_LENGTH || length > MAX_PASSWORD_LENGTH) {
    throw createProtocolError('invalid-backup-password', `A senha deve ter entre ${MIN_PASSWORD_LENGTH} e ${MAX_PASSWORD_LENGTH} caracteres.`);
  }
}

function getCrypto(value) {
  const cryptoImpl = value || globalThis.crypto;
  if (!cryptoImpl?.getRandomValues || !cryptoImpl?.subtle) throw new Error('Web Crypto is unavailable.');
  return cryptoImpl;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function isBase64Bytes(value, expectedLength, minimum = false) {
  try {
    const bytes = base64ToBytes(String(value || ''));
    return minimum ? bytes.length >= expectedLength : bytes.length === expectedLength;
  } catch {
    return false;
  }
}
