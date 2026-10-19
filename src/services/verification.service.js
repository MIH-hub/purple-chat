// services/verification.service.js
import { supabase, callEdgeFunction } from '../core/supabase/client.js';
import { localDB } from '../core/db/local.js';
import { detectEnvironment, getFingerprint } from '../core/detection/client-detection.js';
import { runAIVerification } from '../core/ai/verification.js';

export class VerificationService {
    constructor() {
        this.currentUser = null;
        this.isVerified = false;
        this.verificationData = null;
    }

    setUser(user) {
        this.currentUser = user;
    }

    // Полная проверка
    async verify() {
        if (!this.currentUser) throw new Error('Пользователь не авторизован');

        try {
            // 1. Проверка окружения
            const envCheck = await detectEnvironment();
            if (envCheck.isSuspicious) {
                return {
                    verified: false,
                    reason: 'Обнаружена подозрительная среда',
                    details: envCheck
                };
            }

            // 2. AI проверка (если доступна)
            let aiResult = { passed: true, confidence: 1.0 };
            try {
                aiResult = await runAIVerification();
            } catch (error) {
                console.warn('AI верификация недоступна:', error);
            }

            if (!aiResult.passed) {
                return {
                    verified: false,
                    reason: 'AI проверка не пройдена',
                    details: aiResult
                };
            }

            // 3. Криптографический прооф
            const fingerprint = await getFingerprint();
            const proof = await this.generateProof(fingerprint);

            // 4. Отправка в Edge Function
            const result = await callEdgeFunction('verify-civilian', {
                username: this.currentUser.username,
                proof: proof,
                environment: envCheck,
                aiConfidence: aiResult.confidence
            });

            if (result && result.verified) {
                this.isVerified = true;
                this.verificationData = result;
                
                await localDB.saveVerification({
                    username: this.currentUser.username,
                    isVerified: true,
                    deviceHash: result.deviceHash,
                    verifiedAt: new Date().toISOString()
                });

                return { verified: true, data: result };
            }

            return { verified: false, reason: result?.reason || 'Верификация не пройдена' };
        } catch (error) {
            console.error('❌ Ошибка верификации:', error);
            return { verified: false, reason: error.message };
        }
    }

    // Генерация криптографического проофа
    async generateProof(fingerprint) {
        const nonceData = await callEdgeFunction('get-nonce', {
            username: this.currentUser.username
        });

        const nonce = nonceData.nonce;
        const timestamp = Date.now();

        const encoder = new TextEncoder();
        const data = encoder.encode(
            `${this.currentUser.username}:${nonce}:${timestamp}:${fingerprint}`
        );
        const hash = await crypto.subtle.digest('SHA-256', data);

        // Подписываем (если есть приватный ключ)
        let signature = null;
        const user = await localDB.getUser(this.currentUser.username);
        if (user && user.privateKeyEd25519) {
            try {
                const { signMessage } = await import('../core/crypto/ed25519.js');
                signature = await signMessage(new Uint8Array(hash), user.privateKeyEd25519);  // ← FIX
            } catch (error) {
                console.warn('Ошибка подписи:', error);
            }
        }

        return {
            nonce,
            timestamp,
            hash: btoa(String.fromCharCode(...new Uint8Array(hash))),
            signature: signature ? btoa(String.fromCharCode(...signature)) : null,
            fingerprint
        };
    }

    // Проверить статус верификации
    async checkVerificationStatus(username) {
        try {
            const local = await localDB.getVerification(username);
            if (local && local.isVerified) {
                return local;
            }

            const { data, error } = await supabase
                .from('verified_users')
                .select('*')
                .eq('user_id', username)
                .single();

            if (error) throw error;
            return data;
        } catch (error) {
            console.warn('Ошибка проверки статуса:', error);
            return null;
        }
    }

    getVerificationStatus() {
        return {
            isVerified: this.isVerified,
            data: this.verificationData
        };
    }
}

export const verificationService = new VerificationService();