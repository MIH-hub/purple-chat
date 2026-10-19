// core/crypto/kyber.js
// ML-KEM-768 (FIPS 203) через @noble/post-quantum.

import { ml_kem768 } from '@noble/post-quantum/ml-kem.js';
import { randomBytes } from '@noble/post-quantum/utils.js';

let isReady = false;
let initPromise = null;

export async function initKyber() {
    if (isReady) return true;
    if (initPromise) return initPromise;

    initPromise = (async () => {
        if (!ml_kem768 || typeof ml_kem768.keygen !== 'function') {
            throw new Error('ML-KEM-768 не загружен');
        }
        isReady = true;
        console.log('ML-KEM-768 (FIPS 203) инициализирован');
        return true;
    })();

    return initPromise;
}

function checkReady() {
    if (!isReady) throw new Error('ML-KEM не инициализирован. Вызовите initKyber().');
}

// Генерация ключевой пары
export function generateKyberKeyPair(seed) {
    checkReady();
    return ml_kem768.keygen(seed);
}

// Инкапсуляция: ОТПРАВИТЕЛЬ создаёт shared secret из публичного ключа ПОЛУЧАТЕЛЯ
// Возвращает { sharedSecret, ciphertext } — ciphertext надо передать получателю!
export function kyberEncapsulate(publicKey) {
    checkReady();
    return ml_kem768.encapsulate(publicKey);
}

// Декапсуляция: ПОЛУЧАТЕЛЬ восстанавливает тот же shared secret из ciphertext
export function kyberDecapsulate(ciphertext, secretKey) {
    checkReady();
    return ml_kem768.decapsulate(ciphertext, secretKey);
}

// Гибридный обмен (обёртка для совместимости)
export function hybridKeyExchange(remotePublicKey) {
    checkReady();
    const result = ml_kem768.encapsulate(remotePublicKey);
    return {
        sharedSecret: result.sharedSecret,
        ciphertext: result.cipherText
    };
}

export function generateRandomSeed() {
    return randomBytes(64);
}

export function serializePublicKey(publicKey) {
    if (!publicKey) return '';
    try {
        if (publicKey instanceof Uint8Array) {
            return btoa(String.fromCharCode(...publicKey));
        }
        return btoa(String.fromCharCode(...new Uint8Array(publicKey)));
    } catch (e) {
        console.warn('Ошибка сериализации ключа:', e);
        return '';
    }
}

export function deserializePublicKey(serialized) {
    if (!serialized) return null;
    try {
        const binary = atob(serialized);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch (e) {
        console.warn('Ошибка десериализации ключа:', e);
        return null;
    }
}

export function savePrivateKeys(username, kyberPrivate, ed25519Private) {
    try {
        const data = {
            kyber: kyberPrivate ? Array.from(kyberPrivate) : null,
            ed25519: ed25519Private ? Array.from(ed25519Private) : null
        };
        localStorage.setItem(`purple_keys_${username}`, JSON.stringify(data));
        return true;
    } catch (e) {
        console.warn('Ошибка сохранения ключей:', e);
        return false;
    }
}

export function loadPrivateKeys(username) {
    try {
        const data = localStorage.getItem(`purple_keys_${username}`);
        if (!data) return null;
        const parsed = JSON.parse(data);
        return {
            kyber: parsed.kyber ? new Uint8Array(parsed.kyber) : null,
            ed25519: parsed.ed25519 ? new Uint8Array(parsed.ed25519) : null
        };
    } catch (e) {
        console.warn('Ошибка загрузки ключей:', e);
        return null;
    }
}