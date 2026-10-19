// services/auth.service.js
import { supabase, setCurrentUser, getCurrentUser, setAccessToken } from '../core/supabase/client.js';
import { localDB } from '../core/db/local.js';
import { encryptEmail, decryptEmail, generateRecoveryKey, hashRecoveryKey, verifyRecoveryKey } from '../core/aegis.js';
import { 
    initKyber, generateKyberKeyPair, serializePublicKey, 
    savePrivateKeys, loadPrivateKeys 
} from '../core/crypto/kyber.js';
import { initChaCha20 } from '../core/crypto/chacha20.js';
import { initEd25519, generateEd25519KeyPair } from '../core/crypto/ed25519.js';
import { initArgon2, hashPassword, generateSalt, verifyPassword, serializeHash, serializeSalt } from '../core/crypto/argon2.js';

export class AuthService {
    constructor() {
        this.currentUser = null;
        this.initialized = false;
        this._initPromise = null;
    }

    async init() {
        if (this.initialized) return true;
        if (this._initPromise) return this._initPromise;

        this._initPromise = (async () => {
            try {
                await initKyber();
                await initChaCha20();
                await initEd25519();
                await initArgon2();
                this.initialized = true;
                console.log('🔐 Криптография инициализирована');
                return true;
            } catch (error) {
                console.error('❌ Ошибка инициализации криптографии:', error);
                throw error;
            }
        })();

        return this._initPromise;
    }

    async userExists(username) {
        try {
            const { data, error } = await supabase
                .from('users')
                .select('username')
                .eq('username', username);
            
            if (error) throw error;
            return data && data.length > 0;
        } catch (error) {
            console.error('Ошибка проверки пользователя:', error);
            return false;
        }
    }

    async _fetchToken(username) {
        try {
            const { data, error } = await supabase.functions.invoke('auth-token', {
                body: { username }
            });

            if (error) throw error;
            if (!data?.access_token) throw new Error('Токен не получен');

            setAccessToken(data.access_token);
            localStorage.setItem('purple_jwt', data.access_token);
            localStorage.setItem('purple_jwt_exp', String(Date.now() + data.expires_in * 1000));

            return data.access_token;
        } catch (error) {
            console.error('❌ Ошибка получения JWT:', error);
            throw error;
        }
    }

    // ============================================================
    // ОТПРАВКА КОДА НА EMAIL
    // ============================================================
    async sendEmailCode(username, email) {
        try {
            const { data, error } = await supabase.functions.invoke('send-email-code', {
                body: { username, email }
            });
            if (error) throw error;
            return data;
        } catch (error) {
            console.error('❌ Ошибка отправки кода:', error);
            throw error;
        }
    }

    // ============================================================
    // ПРОВЕРКА КОДА (без проверки срока — из-за таймзон)
    // ============================================================
    async verifyEmailCode(username, code) {
        try {
            const { data, error } = await supabase
                .from('email_verifications')
                .select('*')
                .eq('username', username)
                .eq('code', code)
                .single();

            if (error || !data) {
                console.error('Код не найден:', { username, code, error });
                throw new Error('Неверный код');
            }

            await supabase
                .from('email_verifications')
                .delete()
                .eq('id', data.id);

            return true;
        } catch (error) {
            console.error('❌ Ошибка проверки кода:', error);
            throw error;
        }
    }

    // ============================================================
    // РЕГИСТРАЦИЯ
    // ============================================================
    async register(username, name, password, email) {
        await this.init();

        try {
            const exists = await this.userExists(username);
            if (exists) throw new Error('Пользователь уже существует');

            const kyberKeys = generateKyberKeyPair();
            const ed25519Keys = await generateEd25519KeyPair();
            const kyberPrivate = kyberKeys.privateKey || kyberKeys.secretKey || new Uint8Array(32);
            const ed25519Private = ed25519Keys.privateKey || ed25519Keys.secretKey || new Uint8Array(64);
            savePrivateKeys(username, kyberPrivate, ed25519Private);

            const salt = await generateSalt();
            const passwordHash = await hashPassword(password, salt);

            let emailData = { encrypted: null, iv: null };
            if (email) {
                const saltBytes = new Uint8Array(atob(serializeSalt(salt)).split('').map(c => c.charCodeAt(0)));
                emailData = await encryptEmail(email, password, saltBytes);
            }

            const recoveryKeyString = generateRecoveryKey();
            const recoveryKeyHash = await hashRecoveryKey(recoveryKeyString);

            const userData = {
                username,
                name: name || 'Аноним',
                email_encrypted: emailData.encrypted,
                email_iv: emailData.iv,
                recovery_key_hash: recoveryKeyHash,
                avatar: null,
                theme: 'violet-dark',
                status: 'online',
                online: true,
                last_seen: new Date().toISOString(),
                created_at: new Date().toISOString(),
                public_key_kyber: serializePublicKey(kyberKeys.publicKey),
                public_key_ed25519: serializePublicKey(ed25519Keys.publicKey),
                password_hash: serializeHash(passwordHash),
                password_salt: serializeSalt(salt)
            };

            const { error } = await supabase
                .from('users')
                .insert(userData);

            if (error) throw error;

            await this._fetchToken(username);

            const { data: userData2, error: fetchError } = await supabase
                .from('users')
                .select('*')
                .eq('username', username)
                .single();

            if (fetchError) throw fetchError;

            const user = userData2;
            this.currentUser = user;
            setCurrentUser(user);

            await localDB.saveUser({
                ...user,
                privateKeyKyber: kyberPrivate,
                privateKeyEd25519: ed25519Private
            });

            return { user, recoveryKey: recoveryKeyString };
        } catch (error) {
            console.error('❌ Ошибка регистрации:', error);
            throw error;
        }
    }

    // ============================================================
    // ВХОД
    // ============================================================
    async login(username, password) {
        await this.init();

        try {
            const { data, error } = await supabase.from('users').select('*').eq('username', username);
            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Пользователь не найден');

            const user = data[0];

            const salt = user.password_salt ? 
                new Uint8Array(atob(user.password_salt).split('').map(c => c.charCodeAt(0))) :
                await generateSalt();
            const storedHash = user.password_hash ? 
                new Uint8Array(atob(user.password_hash).split('').map(c => c.charCodeAt(0))) :
                null;

            if (!storedHash) throw new Error('Неверный формат пароля');
            const isValid = await verifyPassword(password, storedHash, salt);
            if (!isValid) throw new Error('Неверный пароль');

            if (user.email_encrypted && user.email_iv) {
                try {
                    user.email = await decryptEmail(user.email_encrypted, user.email_iv, password, salt);
                } catch (e) {
                    console.warn('⚠️ Не удалось расшифровать email:', e);
                }
            }

            const privateKeys = loadPrivateKeys(username);
            if (privateKeys) {
                user.privateKeyKyber = privateKeys.kyber;
                user.privateKeyEd25519 = privateKeys.ed25519;
            }

            await supabase.from('users').update({ online: true, last_seen: new Date().toISOString() }).eq('username', username);

            this.currentUser = user;
            setCurrentUser(user);
            await this._fetchToken(username);
            await localDB.saveUser(user);
            return user;
        } catch (error) {
            console.error('❌ Ошибка входа:', error);
            throw error;
        }
    }

    // ============================================================
    // ВОССТАНОВЛЕНИЕ ПО RECOVERY KEY
    // ============================================================
    async recoverWithKey(username, recoveryKeyString) {
        try {
            const { data, error } = await supabase.from('users').select('*').eq('username', username);
            if (error) throw error;
            if (!data || data.length === 0) throw new Error('Пользователь не найден');

            const user = data[0];
            const isValid = await verifyRecoveryKey(recoveryKeyString, user.recovery_key_hash);
            
            if (!isValid) throw new Error('Неверный Recovery Key');

            this.currentUser = user;
            setCurrentUser(user);
            await this._fetchToken(username);
            
            return user;
        } catch (error) {
            console.error('❌ Ошибка восстановления:', error);
            throw error;
        }
    }

    async logout() {
        if (this.currentUser) {
            try {
                await supabase.from('users').update({ online: false, last_seen: new Date().toISOString() }).eq('username', this.currentUser.username);
            } catch (error) {
                console.warn('⚠️ Ошибка обновления статуса:', error);
            }
        }
        this.currentUser = null;
        setCurrentUser(null);
        setAccessToken(null);
        localStorage.removeItem('purple_jwt');
        localStorage.removeItem('purple_jwt_exp');
        return true;
    }

    async updateProfile(data) {
        if (!this.currentUser) throw new Error('Пользователь не авторизован');
        try {
            const { data: result, error } = await supabase.from('users').update(data).eq('username', this.currentUser.username).select();
            if (error) throw error;
            this.currentUser = { ...this.currentUser, ...result[0] };
            await localDB.saveUser(this.currentUser);
            return this.currentUser;
        } catch (error) {
            console.error('❌ Ошибка обновления профиля:', error);
            throw error;
        }
    }

    async getSession() {
        try {
            const allUsers = await localDB.getAllUsers();
            const localUser = allUsers.find(u => u.online === true);
            if (localUser) {
                const jwt = localStorage.getItem('purple_jwt');
                const exp = parseInt(localStorage.getItem('purple_jwt_exp') || '0');
                if (jwt && Date.now() < exp) {
                    setAccessToken(jwt);
                    this.currentUser = localUser;
                    setCurrentUser(localUser);
                    return localUser;
                }
                return null;
            }
            return null;
        } catch (error) {
            console.warn('⚠️ Ошибка проверки сессии:', error);
            return null;
        }
    }

    getCurrentUser() {
        return this.currentUser || getCurrentUser();
    }
}

export const authService = new AuthService();