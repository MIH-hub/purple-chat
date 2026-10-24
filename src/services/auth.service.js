// services/auth.service.js
import { supabase, setCurrentUser, getCurrentUser, setAccessToken } from '../core/supabase/client.js';
import { localDB } from '../core/db/local.js';
import { encryptEmail, decryptEmail, generateRecoveryKey, hashRecoveryKey, verifyRecoveryKey } from '../core/aegis.js';
import { initKyber, generateKyberKeyPair, serializePublicKey, savePrivateKeys, loadPrivateKeys } from '../core/crypto/kyber.js';
import { initChaCha20 } from '../core/crypto/chacha20.js';
import { initEd25519, generateEd25519KeyPair } from '../core/crypto/ed25519.js';
import { initArgon2, hashPassword, generateSalt, verifyPassword, serializeHash, serializeSalt } from '../core/crypto/argon2.js';

export class AuthService {
    constructor() { this.currentUser = null; this.initialized = false; this._initPromise = null; }

    async init() {
        if (this.initialized) return true;
        if (this._initPromise) return this._initPromise;
        this._initPromise = (async () => {
            await initKyber(); await initChaCha20(); await initEd25519(); await initArgon2();
            this.initialized = true;
            return true;
        })();
        return this._initPromise;
    }

    async _fetchToken(username) {
        try {
            const { data, error } = await supabase.functions.invoke('auth-token', { body: { username } });
            if (error) throw error;
            if (!data?.access_token) throw new Error('Токен не получен');
            setAccessToken(data.access_token);
            localStorage.setItem('purple_jwt', data.access_token);
            localStorage.setItem('purple_jwt_exp', String(Date.now() + data.expires_in * 1000));
            return data.access_token;
        } catch (error) { throw error; }
    }

    async register(username, name, password, email) {
        await this.init();
        try {
            const kyberKeys = generateKyberKeyPair();
            const ed25519Keys = await generateEd25519KeyPair();
            const kyberPrivate = kyberKeys.privateKey || kyberKeys.secretKey || new Uint8Array(32);
            const ed25519Private = ed25519Keys.privateKey || ed25519Keys.secretKey || new Uint8Array(64);
            savePrivateKeys(username, kyberPrivate, ed25519Private);

            const salt = await generateSalt();
            const passwordHash = await hashPassword(password, salt);
            let emailData = { encrypted: null, iv: null };
            if (email) emailData = await encryptEmail(email, password, salt);

            const recoveryKeyString = generateRecoveryKey();
            const recoveryKeyHash = await hashRecoveryKey(recoveryKeyString);

            const userData = {
                username, name: name || 'Аноним', email_encrypted: emailData.encrypted, email_iv: emailData.iv,
                recovery_key_hash: recoveryKeyHash, avatar: null, theme: 'violet-dark',
                status: 'online', online: true, last_seen: new Date().toISOString(), created_at: new Date().toISOString(),
                public_key_kyber: serializePublicKey(kyberKeys.publicKey),
                public_key_ed25519: serializePublicKey(ed25519Keys.publicKey),
                password_hash: serializeHash(passwordHash), password_salt: serializeSalt(salt)
            };

            const { error } = await supabase.from('users').insert(userData);
            if (error) throw error;

            await this._fetchToken(username);
            const { data: userData2, error: fetchError } = await supabase.from('users').select('*').eq('username', username).single();
            if (fetchError) throw fetchError;

            const user = userData2;
            this.currentUser = user; setCurrentUser(user);
            await localDB.saveUser({ ...user, privateKeyKyber: kyberPrivate, privateKeyEd25519: ed25519Private });
            return { user, recoveryKey: recoveryKeyString };
        } catch (error) { throw error; }
    }

    async login(username, password) {
        await this.init();
        try {
            const { data, error } = await supabase.from('users').select('*').eq('username', username);
            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Пользователь не найден');

            const user = data[0];
            if (!user.password_hash || !user.password_salt) throw new Error('Неверный формат пароля');

            const salt = new Uint8Array(atob(user.password_salt).split('').map(c => c.charCodeAt(0)));
            const storedHash = new Uint8Array(atob(user.password_hash).split('').map(c => c.charCodeAt(0)));

            const isValid = await verifyPassword(password, storedHash, salt);
            if (!isValid) throw new Error('Неверный пароль');

            const privateKeys = loadPrivateKeys(username);
            if (privateKeys) { user.privateKeyKyber = privateKeys.kyber; user.privateKeyEd25519 = privateKeys.ed25519; }

            await supabase.from('users').update({ online: true, last_seen: new Date().toISOString() }).eq('username', username);
            this.currentUser = user; setCurrentUser(user);
            await this._fetchToken(username);
            await localDB.saveUser(user);
            return user;
        } catch (error) { throw error; }
    }

    async recoverWithKey(username, recoveryKeyString) {
        try {
            const { data, error } = await supabase.from('users').select('*').eq('username', username);
            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Пользователь не найден');
            const user = data[0];
            const isValid = await verifyRecoveryKey(recoveryKeyString, user.recovery_key_hash);
            if (!isValid) throw new Error('Неверный Recovery Key');

            const privateKeys = loadPrivateKeys(username);
            if (privateKeys) { user.privateKeyKyber = privateKeys.kyber; user.privateKeyEd25519 = privateKeys.ed25519; }

            this.currentUser = user; setCurrentUser(user);
            await this._fetchToken(username);
            await localDB.saveUser(user);
            return user;
        } catch (error) { throw error; }
    }

    async logout() {
        if (this.currentUser) {
            try { await supabase.from('users').update({ online: false, last_seen: new Date().toISOString() }).eq('username', this.currentUser.username); } catch {}
        }
        this.currentUser = null; setCurrentUser(null); setAccessToken(null);
        localStorage.removeItem('purple_jwt'); localStorage.removeItem('purple_jwt_exp');
        return true;
    }

    async updateProfile(data) {
        if (!this.currentUser) throw new Error('Не авторизован');
        try {
            const { data: result, error } = await supabase.from('users').update(data).eq('username', this.currentUser.username).select();
            if (error) throw error;
            this.currentUser = { ...this.currentUser, ...result[0] };
            await localDB.saveUser(this.currentUser);
            return this.currentUser;
        } catch (error) { throw error; }
    }

    async getSession() {
        try {
            const allUsers = await localDB.getAllUsers();
            const localUser = allUsers.find(u => u.online === true);
            if (localUser) {
                const jwt = localStorage.getItem('purple_jwt');
                const exp = parseInt(localStorage.getItem('purple_jwt_exp') || '0');
                if (jwt && Date.now() < exp) {
                    setAccessToken(jwt); this.currentUser = localUser; setCurrentUser(localUser); return localUser;
                }
            }
            return null;
        } catch (error) { return null; }
    }

    getCurrentUser() { return this.currentUser || getCurrentUser(); }
}

export const authService = new AuthService();