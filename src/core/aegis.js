// src/core/aegis.js
import { supabase } from './supabase/client.js';

// ============================================================
// КЛЮЧ ОТ ПАРОЛЯ (для шифрования email)
// ============================================================
export async function deriveEncryptionKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    
    return await crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// ============================================================
// ШИФРОВАНИЕ EMAIL
// ============================================================
export async function encryptEmail(email, password, salt) {
    const key = await deriveEncryptionKey(password, salt);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    
    const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        encoder.encode(email)
    );
    
    return {
        encrypted: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
        iv: btoa(String.fromCharCode(...iv))
    };
}

export async function decryptEmail(encryptedBase64, ivBase64, password, salt) {
    try {
        const key = await deriveEncryptionKey(password, salt);
        const encrypted = new Uint8Array(atob(encryptedBase64).split('').map(c => c.charCodeAt(0)));
        const iv = new Uint8Array(atob(ivBase64).split('').map(c => c.charCodeAt(0)));
        
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encrypted
        );
        
        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.warn('Не удалось расшифровать email:', e);
        return null;
    }
}

// ============================================================
// RECOVERY KEY
// ============================================================
export function generateRecoveryKey() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let key = '';
    for (let i = 0; i < 16; i++) {
        if (i > 0 && i % 4 === 0) key += '-';
        key += chars[Math.floor(Math.random() * chars.length)];
    }
    return key;
}

export async function hashRecoveryKey(recoveryKey) {
    const encoder = new TextEncoder();
    const hash = await crypto.subtle.digest('SHA-256', encoder.encode(recoveryKey));
    return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function verifyRecoveryKey(recoveryKey, storedHash) {
    const hash = await hashRecoveryKey(recoveryKey);
    return hash === storedHash;
}