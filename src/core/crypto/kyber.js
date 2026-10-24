// core/crypto/kyber.js
import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes } from '@noble/post-quantum/utils.js';

let isReady = false;
let initPromise = null;

export async function initKyber() {
    if (isReady) return true;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        if (!ml_kem768 || typeof ml_kem768.keygen !== 'function') throw new Error('ML-KEM-768 не загружен');
        isReady = true;
        return true;
    })();
    return initPromise;
}

function checkReady() { if (!isReady) throw new Error('ML-KEM не инициализирован'); }

export function generateKyberKeyPair(seed) { checkReady(); return ml_kem768.keygen(seed); }

export function kyberEncapsulate(publicKey) { checkReady(); return ml_kem768.encapsulate(publicKey); }
export function kyberDecapsulate(ciphertext, secretKey) { checkReady(); return ml_kem768.decapsulate(ciphertext, secretKey); }

export function hybridKeyExchange(remotePublicKey) {
    checkReady();
    const result = ml_kem768.encapsulate(remotePublicKey);
    return { sharedSecret: result.sharedSecret, ciphertext: result.cipherText };
}

export function generateRandomSeed() { return randomBytes(64); }

export function serializePublicKey(publicKey) {
    if (!publicKey) return '';
    try {
        const bytes = publicKey instanceof Uint8Array ? publicKey : new Uint8Array(publicKey);
        let binary = '';
        const chunkSize = 8192; // Защита от переполнения стека (п.79)
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
    } catch (e) { return ''; }
}

export function deserializePublicKey(serialized) {
    if (!serialized) return null;
    try {
        const binary = atob(serialized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch (e) { return null; }
}

export function savePrivateKeys(username, kyberPrivate, ed25519Private) {
    try {
        const data = { kyber: Array.from(kyberPrivate), ed25519: Array.from(ed25519Private) };
        localStorage.setItem(`purple_keys_${username}`, JSON.stringify(data));
        return true;
    } catch (e) { return false; }
}

export function loadPrivateKeys(username) {
    try {
        const data = localStorage.getItem(`purple_keys_${username}`);
        if (!data) return null;
        const parsed = JSON.parse(data);
        return { kyber: new Uint8Array(parsed.kyber), ed25519: new Uint8Array(parsed.ed25519) };
    } catch (e) { return null; }
}