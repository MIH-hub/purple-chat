// core/supabase/client.js
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('❌ VITE_SUPABASE_URL или VITE_SUPABASE_ANON_KEY не заданы в .env');
}

// ============================================================
// СВОЙ JWT (не Clerk!)
// ============================================================
let accessToken = null;

export function setAccessToken(token) {
    accessToken = token;
}

export function getAccessToken() {
    return accessToken;
}

// ============================================================
// SUPABASE CLIENT
// ============================================================
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => accessToken
});

// ============================================================
// ТЕКУЩИЙ ПОЛЬЗОВАТЕЛЬ (кэш)
// ============================================================
let currentUser = null;

export function setCurrentUser(user) {
    currentUser = user;
}

export function getCurrentUser() {
    return currentUser;
}

// ============================================================
// ОБЁРТКИ С ОБРАБОТКОЙ ОШИБОК
// ============================================================

export async function query(table, options = {}) {
    try {
        let q = supabase.from(table);
        q = options.select ? q.select(options.select) : q.select('*');
        
        if (options.filter) {
            for (const [key, value] of Object.entries(options.filter)) {
                q = q.eq(key, value);
            }
        }
        if (options.contains) {
            for (const [key, value] of Object.entries(options.contains)) {
                q = q.contains(key, value);
            }
        }
        if (options.order) {
            const { column, ascending = true } = options.order;
            q = q.order(column, { ascending });
        }
        if (options.limit) q = q.limit(options.limit);
        
        const { data, error } = await q;
        if (error) throw error;
        return data;
    } catch (error) {
        console.error('❌ Supabase query error:', error);
        throw error;
    }
}

export async function insert(table, data) {
    try {
        const { data: result, error } = await supabase.from(table).insert(data).select();
        if (error) throw error;
        return result;
    } catch (error) {
        console.error('❌ Supabase insert error:', error);
        throw error;
    }
}

export async function update(table, data, filter) {
    try {
        let q = supabase.from(table).update(data);
        for (const [key, value] of Object.entries(filter)) {
            q = q.eq(key, value);
        }
        const { data: result, error } = await q.select();
        if (error) throw error;
        return result;
    } catch (error) {
        console.error('❌ Supabase update error:', error);
        throw error;
    }
}

export async function remove(table, filter) {
    try {
        let q = supabase.from(table).delete();
        for (const [key, value] of Object.entries(filter)) {
            q = q.eq(key, value);
        }
        const { error } = await q;
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('❌ Supabase delete error:', error);
        throw error;
    }
}

export function subscribeToChanges(table, filter, event, callback) {
    const channel = supabase.channel(`${table}-changes-${Date.now()}`);
    let changeFilter = { event, schema: 'public', table };
    if (filter) changeFilter.filter = filter;
    channel.on('postgres_changes', changeFilter, (payload) => callback(payload.new));
    channel.subscribe();
    return channel;
}

export async function callEdgeFunction(name, body) {
    try {
        const { data, error } = await supabase.functions.invoke(name, { body });
        if (error) throw error;
        return data;
    } catch (error) {
        console.error(`❌ Edge function ${name} error:`, error);
        throw error;
    }
}