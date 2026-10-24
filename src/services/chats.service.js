// services/chats.service.js
import { supabase } from '../core/supabase/client.js';
import { localDB } from '../core/db/local.js';

export class ChatsService {
    constructor() { this.currentUser = null; this.subscriptions = []; }
    setUser(user) { this.currentUser = user; }

    async ensureSavedChat() {
        if (!this.currentUser) throw new Error('Пользователь не авторизован');
        try {
            // Исправлено на is true (п.12)
            const { data: existing } = await supabase.from('chats').select('*').eq('is_saved', true).contains('members', [this.currentUser.username]).limit(1);
            if (existing && existing.length > 0) return existing[0];

            const savedChat = { name: 'Избранное', type: 'saved', members: [this.currentUser.username], is_saved: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            const { data, error } = await supabase.from('chats').insert(savedChat).select();
            if (error) throw error;
            const chat = data[0];
            await localDB.saveChat({ ...chat, updatedAt: Date.now() });
            return chat;
        } catch (error) { throw error; }
    }

    async create(name, type, members) {
        if (!this.currentUser) throw new Error('Не авторизован');
        try {
            const chatData = { name, type, members: [...new Set([...members, this.currentUser.username])], is_saved: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
            const { data, error } = await supabase.from('chats').insert(chatData).select();
            if (error) throw error;
            const chat = data[0];
            await localDB.saveChat({ ...chat, updatedAt: Date.now() });
            return chat;
        } catch (error) { throw error; }
    }

    async getMyChats() {
        if (!this.currentUser) throw new Error('Не авторизован');
        try {
            const { data, error } = await supabase.from('chats').select('*').contains('members', [this.currentUser.username]).order('updated_at', { ascending: false });
            if (error) throw error;
            let chats = data || [];
            const hasSaved = chats.some(c => c.is_saved === true);
            if (!hasSaved) {
                const saved = await this.ensureSavedChat();
                chats.unshift(saved);
            }
            chats.sort((a, b) => { if (a.is_saved) return -1; if (b.is_saved) return 1; return new Date(b.updated_at) - new Date(a.updated_at); });
            if (chats.length > 0) await localDB.saveChats(chats.map(c => ({ ...c, updatedAt: Date.parse(c.updated_at) || Date.now() })));
            return chats;
        } catch (error) { return await localDB.getUserChats(this.currentUser.username); }
    }

    async delete(chatId) {
        try {
            const { error } = await supabase.from('chats').delete().eq('id', chatId);
            if (error) throw error;
            await localDB.deleteChat(chatId);
            return true;
        } catch (error) { throw error; }
    }

    subscribe(callback) {
        if (!this.currentUser) return null;
        this.unsubscribeAll();
        const channel = supabase.channel('chats-channel')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chats' }, async (payload) => {
                const chat = payload.new || payload.old;
                if (!chat) return;
                if (chat.members && !chat.members.includes(this.currentUser.username)) return;
                if (payload.eventType === 'DELETE') await localDB.deleteChat(chat.id);
                else await localDB.saveChat({ ...chat, updatedAt: Date.parse(chat.updated_at) || Date.now() });
                if (callback) callback(payload);
            }).subscribe();
        this.subscriptions.push(channel);
        return channel;
    }

    unsubscribeAll() {
        for (const channel of this.subscriptions) {
            try { supabase.removeChannel(channel).catch(() => {}); } catch {} // catch promise (п.7)
        }
        this.subscriptions = [];
    }
}

export const chatsService = new ChatsService();