// services/messages.service.js
import { supabase } from '../core/supabase/client.js';
import { localDB } from '../core/db/local.js';
import {
    encryptMessage, decryptMessage,
    serializeCiphertext, deserializeCiphertext
} from '../core/crypto/chacha20.js';
import {
    hybridKeyExchange, kyberDecapsulate,
    deserializePublicKey
} from '../core/crypto/kyber.js';
import { signaling } from '../core/trystero-client.js';

export class MessagesService {
    constructor() {
        this.currentUser = null;
        this.sessionKeys = {};
        this.subscriptions = [];
    }

    setUser(user) {
        this.currentUser = user;
    }

    async setupSessionKeyAsSender(chatId, remotePublicKey) {
        const { sharedSecret, ciphertext } = hybridKeyExchange(remotePublicKey);
        this.sessionKeys[chatId] = sharedSecret;
        await localDB.saveKey({ id: `${chatId}_session`, chatId, keyType: 'session', keyData: Array.from(sharedSecret) });
        return { sharedSecret, ciphertext };
    }

    async setupSessionKeyAsReceiver(chatId, ciphertext) {
        const localUser = await localDB.getUser(this.currentUser.username);
        if (!localUser || !localUser.privateKeyKyber) throw new Error('Нет ключа ML-KEM');
        const sharedSecret = kyberDecapsulate(ciphertext, localUser.privateKeyKyber);
        this.sessionKeys[chatId] = sharedSecret;
        await localDB.saveKey({ id: `${chatId}_session`, chatId, keyType: 'session', keyData: Array.from(sharedSecret) });
        return sharedSecret;
    }

    async getSessionKey(chatId) {
        if (this.sessionKeys[chatId]) return this.sessionKeys[chatId];
        const key = await localDB.getKey(chatId, 'session');
        if (key) { this.sessionKeys[chatId] = new Uint8Array(key.keyData); return this.sessionKeys[chatId]; }
        return null;
    }

    // Хелпер для гарантированного получения ключа
    async _ensureKey(chatId) {
        let key = await this.getSessionKey(chatId);
        if (key) return { key, kyberCiphertext: null };

        const chat = await localDB.getChat(chatId);
        if (!chat) throw new Error('Чат не найден');

        if (chat.is_saved) {
            const localUser = await localDB.getUser(this.currentUser.username);
            const selfPublicKey = deserializePublicKey(localUser.public_key_kyber);
            const result = await this.setupSessionKeyAsSender(chatId, selfPublicKey);
            return { key: result.sharedSecret, kyberCiphertext: result.ciphertext };
        } else {
            const otherUser = chat.members.find(m => m !== this.currentUser.username);
            if (!otherUser) throw new Error('Нет собеседника');
            const { data } = await supabase.from('users').select('public_key_kyber').eq('username', otherUser).single();
            const remoteKey = deserializePublicKey(data.public_key_kyber);
            const result = await this.setupSessionKeyAsSender(chatId, remoteKey);
            return { key: result.sharedSecret, kyberCiphertext: result.ciphertext };
        }
    }

    async send(chatId, text) {
        if (!this.currentUser) throw new Error('Не авторизован');
        try {
            const { key, kyberCiphertext } = await this._ensureKey(chatId);
            const messageData = JSON.stringify({ text, timestamp: Date.now() });
            const { ciphertext, nonce } = await encryptMessage(new TextEncoder().encode(messageData), key);

            const { data, error } = await supabase.from('messages').insert({
                chat_id: chatId, sender: this.currentUser.username,
                ciphertext: serializeCiphertext(ciphertext), nonce: serializeCiphertext(nonce),
                kyber_ciphertext: kyberCiphertext ? serializeCiphertext(kyberCiphertext) : null,
                created_at: new Date().toISOString()
            }).select();
            if (error) throw error;

            const msg = data[0];
            await localDB.saveMessage({ id: msg.id, chatId, sender: msg.sender, text, timestamp: Date.parse(msg.created_at), encrypted: true });
            return msg;
        } catch (e) {
            console.error('Ошибка отправки:', e);
            throw e;
        }
    }

    async sendVoiceHybrid(chatId, audioBlob, duration) {
        if (!this.currentUser) throw new Error('Не авторизован');
        const chat = await localDB.getChat(chatId);
        const onlinePeers = signaling.getPeers(chatId);
        const otherMembers = chat.members.filter(m => m !== this.currentUser.username);
        const isEveryoneOnline = otherMembers.every(m => onlinePeers.includes(m));

        if (isEveryoneOnline && otherMembers.length > 0 && !chat.is_saved) {
            return await this.sendVoiceP2P(chatId, audioBlob, duration);
        }
        return await this.sendVoiceCloud(chatId, audioBlob, duration);
    }

    async sendVoiceP2P(chatId, audioBlob, duration) {
        const { key } = await this._ensureKey(chatId);
        const buffer = await audioBlob.arrayBuffer();
        const { ciphertext, nonce } = await encryptMessage(new Uint8Array(buffer), key);
        
        const payload = {
            id: `voice_${Date.now()}`, chatId, sender: this.currentUser.username,
            type: 'voice', ciphertext: serializeCiphertext(ciphertext), nonce: serializeCiphertext(nonce),
            duration: Math.round(duration), mimeType: audioBlob.type, timestamp: Date.now()
        };

        const sent = signaling.sendMessage(chatId, { type: 'voice-message', payload });
        if (!sent) throw new Error('P2P не удался');

        await localDB.saveMessage({ ...payload, voiceData: Array.from(new Uint8Array(buffer)), voiceMime: audioBlob.type, voiceDuration: duration });
        return payload;
    }

    async sendVoiceCloud(chatId, audioBlob, duration) {
        const { key } = await this._ensureKey(chatId);
        const buffer = await audioBlob.arrayBuffer();
        const { ciphertext, nonce } = await encryptMessage(new Uint8Array(buffer), key);

        const storagePath = `voices/${chatId}/${Date.now()}.enc`;
        const { error: uploadError } = await supabase.storage.from('media').upload(storagePath, ciphertext);
        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage.from('media').getPublicUrl(storagePath);
        
        const metaData = JSON.stringify({ type: 'voice', url: urlData.publicUrl, nonce: serializeCiphertext(nonce), duration: Math.round(duration) });
        const { ciphertext: metaCipher, nonce: metaNonce } = await encryptMessage(new TextEncoder().encode(metaData), key);

        const { data, error } = await supabase.from('messages').insert({
            chat_id: chatId, sender: this.currentUser.username,
            ciphertext: serializeCiphertext(metaCipher), nonce: serializeCiphertext(metaNonce),
            created_at: new Date().toISOString()
        }).select();
        if (error) throw error;

        const msg = data[0];
        const resultMsg = {
            id: msg.id, chatId, sender: this.currentUser.username, type: 'voice',
            voiceUrl: urlData.publicUrl, voiceNonce: serializeCiphertext(nonce), voiceDuration: duration,
            localBlob: audioBlob, timestamp: Date.parse(msg.created_at), encrypted: true
        };
        await localDB.saveMessage({ ...resultMsg, voiceData: Array.from(new Uint8Array(buffer)) });
        return resultMsg;
    }

    async downloadVoice(msg) {
        if (msg.localBlob) return msg.localBlob;
        if (msg.voiceData) return new Blob([new Uint8Array(msg.voiceData)], { type: 'audio/webm' });
        if (!msg.voiceUrl || !msg.voiceNonce) throw new Error('Нет данных');

        const key = await this.getSessionKey(msg.chatId);
        const res = await fetch(msg.voiceUrl);
        const cipherBuffer = await res.arrayBuffer();
        const plaintext = await decryptMessage(new Uint8Array(cipherBuffer), key, deserializeCiphertext(msg.voiceNonce));
        if (!plaintext) throw new Error('Ошибка расшифровки');
        
        const blob = new Blob([plaintext], { type: 'audio/webm' });
        msg.localBlob = blob;
        return blob;
    }

    async getMessages(chatId, limit = 50) {
        const { data, error } = await supabase.from('messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }).limit(limit);
        if (error) throw error;

        if (data && data.length > 0) {
            const decoder = new TextDecoder();
            const messages = [];
            for (const msg of data) {
                if (msg.kyber_ciphertext && !this.sessionKeys[chatId]) {
                    try { await this.setupSessionKeyAsReceiver(chatId, deserializeCiphertext(msg.kyber_ciphertext)); } catch (e) {}
                }
                const key = await this.getSessionKey(chatId);
                let decrypted = null;
                if (key && msg.ciphertext) {
                    try {
                        const plaintext = await decryptMessage(deserializeCiphertext(msg.ciphertext), key, deserializeCiphertext(msg.nonce));
                        if (plaintext) decrypted = JSON.parse(decoder.decode(plaintext));
                    } catch (e) {}
                }
                messages.push({
                    id: msg.id, chatId: msg.chat_id, sender: msg.sender,
                    text: decrypted?.text || null, voiceUrl: decrypted?.url || null,
                    voiceNonce: decrypted?.nonce || null, voiceDuration: decrypted?.duration || 0,
                    timestamp: Date.parse(msg.created_at), encrypted: !!msg.ciphertext
                });
            }
            const localMsgs = await localDB.getChatMessages(chatId, limit);
            for (const lv of localMsgs) {
                const exists = messages.find(m => m.id === lv.id);
                if (exists) { exists.voiceData = lv.voiceData; } else { messages.push(lv); }
            }
            messages.sort((a, b) => a.timestamp - b.timestamp);
            await localDB.saveMessages(messages);
            return messages;
        }
        return await localDB.getChatMessages(chatId, limit);
    }

    subscribe(chatId, callback) {
        const channel = supabase.channel(`messages-${chatId}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` }, async (payload) => {
            const msg = payload.new;
            const key = await this.getSessionKey(chatId);
            let decrypted = null;
            if (key && msg.ciphertext) {
                try {
                    const plaintext = await decryptMessage(deserializeCiphertext(msg.ciphertext), key, deserializeCiphertext(msg.nonce));
                    if (plaintext) decrypted = JSON.parse(new TextDecoder().decode(plaintext));
                } catch (e) {}
            }
            const message = {
                id: msg.id, chatId: msg.chat_id, sender: msg.sender,
                text: decrypted?.text || null, voiceUrl: decrypted?.url || null,
                voiceNonce: decrypted?.nonce || null, voiceDuration: decrypted?.duration || 0,
                timestamp: Date.parse(msg.created_at), encrypted: !!msg.ciphertext
            };
            await localDB.saveMessage(message);
            if (callback) callback(message);
        }).subscribe();
        this.subscriptions.push(channel);
        return channel;
    }

    async deleteMessage(messageId) {
        const { error } = await supabase.from('messages').delete().eq('id', messageId);
        if (error) throw error;
        await localDB.deleteMessage?.(messageId);
        return true;
    }

    async forwardMessage(message, targetChatId) {
        return this.send(targetChatId, message.text);
    }

    async sendTyping(chatId, isTyping) {
        signaling.sendTyping(chatId, isTyping);
    }
}

export const messagesService = new MessagesService();