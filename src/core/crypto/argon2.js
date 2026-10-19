// core/crypto/argon2.js
// Argon2id - KDF для паролей. Требует libsodium.

import { getSodium } from './sodium.js';

let isReady = false;
let initPromise = null;

export async function initArgon2() {
  if (isReady) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await getSodium();
      isReady = true;
      console.log('Argon2id инициализирован');
      return true;
    } catch (error) {
      console.error('Argon2id: libsodium не загружен, работа невозможна', error);
      throw new Error('Argon2id требует libsodium');
    }
  })();

  return initPromise;
}

function checkReady() {
  if (!isReady) throw new Error('Argon2id не инициализирован. Вызовите initArgon2().');
}

export async function hashPassword(password, salt) {
  checkReady();
  const sodium = await getSodium();

  if (!(salt instanceof Uint8Array) || salt.length !== sodium.crypto_pwhash_SALTBYTES) {
    throw new Error(`salt должен быть Uint8Array длиной ${sodium.crypto_pwhash_SALTBYTES}`);
  }

  return sodium.crypto_pwhash(
    32,
    password,
    salt,
    sodium.crypto_pwhash_OPSLIMIT_MODERATE,
    sodium.crypto_pwhash_MEMLIMIT_MODERATE,
    sodium.crypto_pwhash_ALG_ARGON2ID13
  );
}

export async function generateSalt() {
  checkReady();
  const sodium = await getSodium();
  return sodium.randombytes_buf(sodium.crypto_pwhash_SALTBYTES);
}

export async function verifyPassword(password, hash, salt) {
  checkReady();
  const sodium = await getSodium();
  const computedHash = await hashPassword(password, salt);
  const h1 = hash instanceof Uint8Array ? hash : new Uint8Array(hash);
  if (h1.length !== computedHash.length) return false;
  return sodium.memcmp(h1, computedHash);
}

export function serializeHash(hash) {
  return btoa(String.fromCharCode(...hash));
}

export function deserializeHash(serialized) {
  const binary = atob(serialized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function serializeSalt(salt) {
  return btoa(String.fromCharCode(...salt));
}

export function deserializeSalt(serialized) {
  const binary = atob(serialized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}