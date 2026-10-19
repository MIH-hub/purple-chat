// core/crypto/ed25519.js
// Ed25519 - цифровые подписи. Требует libsodium.

import { getSodium } from './sodium.js';

let isReady = false;
let initPromise = null;

export async function initEd25519() {
  if (isReady) return true;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await getSodium();
      isReady = true;
      console.log('Ed25519 инициализирован');
      return true;
    } catch (error) {
      console.error('Ed25519: libsodium не загружен', error);
      throw new Error('Ed25519 требует libsodium');
    }
  })();

  return initPromise;
}

function checkReady() {
  if (!isReady) throw new Error('Ed25519 не инициализирован. Вызовите initEd25519().');
}

export async function generateEd25519KeyPair() {
  checkReady();
  const sodium = await getSodium();
  return sodium.crypto_sign_keypair();
}

export async function signMessage(message, privateKey) {
  checkReady();
  const sodium = await getSodium();
  return sodium.crypto_sign_detached(message, privateKey);
}

export async function verifySignature(message, signature, publicKey) {
  checkReady();
  const sodium = await getSodium();
  return sodium.crypto_sign_verify_detached(signature, message, publicKey);
}

export function serializeSignature(signature) {
  return btoa(String.fromCharCode(...signature));
}

export function deserializeSignature(serialized) {
  const binary = atob(serialized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}