// core/db/local.js
import Dexie from 'dexie';
import { encryptMessage, decryptMessage, serializeCiphertext, deserializeCiphertext, initChaCha20 } from '../crypto/chacha20.js';

const db = new Dexie('purple3000');
db.version(4).stores({
    users: 'username, online, last_seen',
    chats: 'id, updatedAt, is_saved',
    messages: 'id, chatId, timestamp, sender',
    keys: 'id, chatId, keyType',
    verifications: 'username',
});

const MASTER_KEY_STORAGE = 'purple_local_master_key';
let _masterKey = null;

async function getMasterKey() {
    if (_masterKey) return _masterKey;
    await initChaCha20();
    let keyB64 = localStorage.getItem(MASTER_KEY_STORAGE);
    if (!keyB64) {
        const randomBytes = crypto.getRandomValues(new Uint8Array(32));
        keyB64 = btoa(String.fromCharCode(...randomBytes));
        localStorage.setItem(MASTER_KEY_STORAGE, keyB64);
    }
    _masterKey = deserializeCiphertext(keyB64);
    return _masterKey;
}

async function encryptPayload(obj) {
    const key = await getMasterKey();
    const dataBytes = new TextEncoder().encode(JSON.stringify(obj));
    const { ciphertext, nonce } = await encryptMessage(dataBytes, key);
    return { _encrypted: true, data: serializeCiphertext(ciphertext), nonce: serializeCiphertext(nonce) };
}

async function decryptPayload(wrapper) {
    if (!wrapper || !wrapper._encrypted) return wrapper;
    try {
        const key = await getMasterKey();
        const plaintext = await decryptMessage(deserializeCiphertext(wrapper.data), key, deserializeCiphertext(wrapper.nonce));
        return plaintext ? JSON.parse(new TextDecoder().decode(plaintext)) : null;
    } catch { return null; }
}

export const localDB = {
    async saveUser(user) {
        const existing = await this.getUser(user.username);
        // Сохраняем ключи, если они были (п.20)
        const mergedUser = { ...existing, ...user };
        if (existing?.privateKeyKyber && !user.privateKeyKyber) mergedUser.privateKeyKyber = existing.privateKeyKyber;
        if (existing?.privateKeyEd25519 && !user.privateKeyEd25519) mergedUser.privateKeyEd25519 = existing.privateKeyEd25519;

        const wrapper = await encryptPayload(mergedUser);
        await db.users.put({ username: user.username, online: user.online, last_seen: user.last_seen, payload: wrapper });
    },
    async getUser(username) {
        const rec = await db.users.get(username);
        return rec ? (rec.payload ? await decryptPayload(rec.payload) : rec) : null;
    },
    async getAllUsers() {
        const recs = await db.users.toArray();
        return (await Promise.all(recs.map(r => r.payload ? decryptPayload(r.payload) : r))).filter(Boolean);
    },
    async saveChat(chat) {
        const wrapper = await encryptPayload(chat);
        await db.chats.put({ id: chat.id, is_saved: chat.is_saved, updatedAt: chat.updatedAt || Date.now(), payload: wrapper });
    },
    async saveChats(chats) {
        const toSave = await Promise.all(chats.map(async chat => {
            const wrapper = await encryptPayload(chat);
            return { id: chat.id, is_saved: chat.is_saved, updatedAt: chat.updatedAt || Date.now(), payload: wrapper };
        }));
        await db.chats.bulkPut(toSave);
    },
    async getChat(id) {
        const rec = await db.chats.get(id);
        return rec ? (rec.payload ? await decryptPayload(rec.payload) : rec) : null;
    },
    async getUserChats(username) {
        const recs = await db.chats.toArray();
        const chats = (await Promise.all(recs.map(r => r.payload ? decryptPayload(r.payload) : r))).filter(Boolean);
        return chats.filter(c => Array.isArray(c.members) && c.members.includes(username)).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    },
    async deleteChat(id) {
        await db.chats.delete(id);
        await db.messages.where('chatId').equals(id).delete();
    },
    async saveMessage(msg) {
        const wrapper = await encryptPayload(msg);
        await db.messages.put({ id: msg.id, chatId: msg.chatId, timestamp: msg.timestamp, sender: msg.sender, payload: wrapper });
    },
    async saveMessages(msgs) {
        const toSave = await Promise.all(msgs.map(async msg => {
            const wrapper = await encryptPayload(msg);
            return { id: msg.id, chatId: msg.chatId, timestamp: msg.timestamp, sender: msg.sender, payload: wrapper };
        }));
        await db.messages.bulkPut(toSave);
    },
    async getChatMessages(chatId, limit = 50) {
        const recs = await db.messages.where('chatId').equals(chatId).toArray();
        recs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
        const sliced = recs.slice(-limit);
        return (await Promise.all(sliced.map(r => r.payload ? decryptPayload(r.payload) : r))).filter(Boolean);
    },
    async deleteMessage(id) {
        await db.messages.delete(id);
    },
    async saveKey(key) {
        const wrapper = await encryptPayload(key);
        await db.keys.put({ id: key.id, chatId: key.chatId, keyType: key.keyType, payload: wrapper });
    },
    async getKey(chatId, keyType = 'session') {
        const all = await db.keys.where('chatId').equals(chatId).toArray();
        const match = all.find(k => k.keyType === keyType);
        return match ? (match.payload ? await decryptPayload(match.payload) : match) : null;
    },
    async saveVerification(v) {
        const wrapper = await encryptPayload(v);
        await db.verifications.put({ username: v.username, payload: wrapper });
    },
    async getVerification(username) {
        const rec = await db.verifications.get(username);
        return rec ? (rec.payload ? await decryptPayload(rec.payload) : rec) : null;
    },
};