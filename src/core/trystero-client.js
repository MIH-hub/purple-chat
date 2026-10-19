// core/trystero-client.js
// Trystero (реальный API) + сигналинг + typing + звонки

import { joinRoom } from 'trystero';
import { TRYSTERO_PASSWORD, APP_NAME } from './config.js';

export class SignalingService {
    constructor() {
        this.rooms = new Map();          // roomId -> room
        this.actions = new Map();        // roomId -> { send, recv }
        this.peers = new Map();          // roomId -> Set<peerId>
        this.listeners = new Map();      // event -> [callback]
        this.username = null;
        this.typingTimers = new Map();
    }

    setUser(username) {
        this.username = username;
    }

    // ============================================================
    // ПОДКЛЮЧЕНИЕ К КОМНАТЕ (с бесплатными STUN)
    // ============================================================
    joinRoom(roomId) {
        if (this.rooms.has(roomId)) return this.rooms.get(roomId);

        const iceServers = [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
        ];

        const room = joinRoom(
            { appId: APP_NAME, password: TRYSTERO_PASSWORD },
            roomId,
            { rtcConfig: { iceServers } }
        );

        this.rooms.set(roomId, room);
        this.peers.set(roomId, new Set());

        // --- peer events ---
        room.onPeerJoin((peerId) => {
            console.log(`👤 Peer joined ${roomId}: ${peerId}`);
            const set = this.peers.get(roomId) || new Set();
            set.add(peerId);
            this.peers.set(roomId, set);
            this.emit('peer-join', roomId, peerId);
        });

        room.onPeerLeave((peerId) => {
            console.log(`👋 Peer left ${roomId}: ${peerId}`);
            const set = this.peers.get(roomId) || new Set();
            set.delete(peerId);
            this.peers.set(roomId, set);
            this.emit('peer-leave', roomId, peerId);
        });

        // --- data actions ---
        const [sendMessage, getMessage] = room.makeAction('msg');
        const [sendTyping, getTyping] = room.makeAction('typing');

        this.actions.set(roomId, { sendMessage, sendTyping });

        getMessage((data, peerId) => {
            this.emit('message', roomId, data, peerId);
        });

        getTyping((data, peerId) => {
            if (data && data.from === this.username) return;
            this.emit('typing', roomId, data, peerId);
        });

        return room;
    }

    leaveRoom(roomId) {
        const room = this.rooms.get(roomId);
        if (room) {
            try { room.leave(); } catch (e) { console.warn('leaveRoom:', e); }
            this.rooms.delete(roomId);
            this.actions.delete(roomId);
            this.peers.delete(roomId);
            if (this.typingTimers.has(roomId)) {
                clearTimeout(this.typingTimers.get(roomId));
                this.typingTimers.delete(roomId);
            }
        }
    }

    // ============================================================
    // ОТПРАВКА
    // ============================================================
    sendMessage(roomId, data) {
        const actions = this.actions.get(roomId);
        if (!actions) return false;
        try {
            actions.sendMessage(data);
            return true;
        } catch (e) {
            console.warn('sendMessage:', e);
            return false;
        }
    }

    sendTyping(roomId, isTyping) {
        const actions = this.actions.get(roomId);
        if (!actions) return false;
        try {
            actions.sendTyping({
                from: this.username,
                isTyping: !!isTyping,
                timestamp: Date.now(),
            });
            return true;
        } catch (e) {
            console.warn('sendTyping:', e);
            return false;
        }
    }

    // ============================================================
    // ДОБАВЛЕНИЕ / ПОЛУЧЕНИЕ МЕДИА-ПОТОКОВ (ЗВОНКИ)
    // ============================================================
    addStream(roomId, stream) {
        const room = this.rooms.get(roomId);
        if (room) room.addStream(stream);
    }

    onPeerStream(roomId, callback) {
        const room = this.rooms.get(roomId);
        if (room) room.onPeerStream(callback);
    }

    // ============================================================
    // PEERS & EVENTS
    // ============================================================
    getPeers(roomId) {
        const set = this.peers.get(roomId);
        return set ? Array.from(set) : [];
    }

    on(event, callback) {
        if (!this.listeners.has(event)) this.listeners.set(event, []);
        const list = this.listeners.get(event);
        if (!list.includes(callback)) list.push(callback);
    }

    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const list = this.listeners.get(event);
        const i = list.indexOf(callback);
        if (i > -1) list.splice(i, 1);
    }

    emit(event, ...args) {
        if (!this.listeners.has(event)) return;
        for (const cb of this.listeners.get(event)) {
            try { cb(...args); } catch (e) { console.error('❌ Event handler error:', e); }
        }
    }
}

export const signaling = new SignalingService();