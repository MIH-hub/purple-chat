// core/crypto/chacha20.js
// XChaCha20-Poly1305 IETF. Требует libsodium.

import { getSodium } from './sodium.js';

let isReady = false;
let initPromise = null;

export async function initChaCha20() {
  if (isReady) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await getSodium();
      isReady = true;
      console.log('XChaCha20-Poly1305 инициализирован');
      return true;
    } catch (error) {
      console.error('ChaCha20: libsodium не загружен', error);
      throw new Error('ChaCha20 требует libsodium');
    }
  })();

  return initPromise;
}

function checkReady() {
  if (!isReady) throw new Error('ChaCha20 не инициализирован. Вызовите initChaCha20().');
}

export async function generateChaCha20Key() {
  checkReady();
  const sodium = await getSodium();
  return sodium.crypto_aead_xchacha20poly1305_ietf_keygen();
}

export async function generateNonce() {
  checkReady();
  const sodium = await getSodium();
  return sodium.randombytes_buf(sodium.crypto_aead_xchacha20poly1305_ietf_NPUBBYTES);
}

export async function encryptChaCha20(message, key, nonce) {
  checkReady();
  const sodium = await getSodium();
  return sodium.crypto_aead_xchacha20poly1305_ietf_encrypt(
    message,
    null,
    null,
    nonce,
    key
  );
}

export async function decryptChaCha20(ciphertext, key, nonce) {
  checkReady();
  const sodium = await getSodium();
  return sodium.crypto_aead_xchacha20poly1305_ietf_decrypt(
    null,
    ciphertext,
    null,
    nonce,
    key
  );
}

export async function encryptMessage(message, key) {
  const nonce = await generateNonce();
  const ciphertext = await encryptChaCha20(message, key, nonce);
  return { ciphertext, nonce };
}

export async function decryptMessage(ciphertext, key, nonce) {
  try {
    return await decryptChaCha20(ciphertext, key, nonce);
  } catch (e) {
    console.warn('Ошибка расшифровки:', e);
    return null;
  }
}

// Безопасная сериализация (без переполнения стека)
export function serializeCiphertext(ciphertext) {
  if (!ciphertext) return '';
  const bytes = new Uint8Array(ciphertext);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// Безопасная десериализация
export function deserializeCiphertext(serialized) {
  if (!serialized) return new Uint8Array(0);
  try {
    const binary = atob(serialized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (e) {
    console.error('Ошибка десериализации:', e);
    return new Uint8Array(0);
  }
}