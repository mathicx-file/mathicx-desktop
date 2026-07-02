/**
 * mathicx-file · auth/crypto.js
 * Hash de senha com PBKDF2 via Web Crypto API (nativo do navegador).
 * Requer HTTPS (crypto.subtle é undefined em http:// não-localhost).
 *
 * PBKDF2 é o equivalente "nativo browser" do bcrypt: derivação de chave
 * iterada + salt por usuário. ~100k iterações torna brute-force lento.
 */

const ITERATIONS = 100_000;
const KEY_LEN = 32;          // 256 bits
const HASH_ALGO = 'SHA-256';

/** Gera um salt aleatório (ArrayBuffer de 16 bytes). */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** ArrayBuffer → string base64 (para armazenar/serializar). */
export function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** string base64 → Uint8Array. */
export function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Deriva o hash de uma senha.
 * @returns {Promise<{hash: string, salt: string, iterations: number}>} tudo em base64
 */
export async function hashPassword(password) {
  const salt = generateSalt();
  const hash = await _derive(password, salt, ITERATIONS);
  return {
    hash: bufToB64(hash),
    salt: bufToB64(salt),
    iterations: ITERATIONS,
  };
}

/**
 * Verifica uma senha contra (hash, salt) armazenados.
 * Comparação em tempo constante para evitar timing attacks.
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(password, storedHashB64, storedSaltB64, iterations = ITERATIONS) {
  const salt = b64ToBuf(storedSaltB64);
  const candidate = await _derive(password, salt, iterations);
  return _timingSafeEqual(bufToB64(candidate), storedHashB64);
}

/** Núcleo PBKDF2. */
async function _derive(password, salt, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
  );
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: HASH_ALGO },
    keyMaterial,
    KEY_LEN * 8
  );
}

/** Comparação constante (não early-return para mitigar timing leak). */
function _timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
