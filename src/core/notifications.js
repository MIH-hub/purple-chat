// src/core/notifications.js
// Push-уведомления (Режим 1 — без сервера, пока вкладка открыта)

let permission = 'default';

// ============================================================
// ПРОВЕРКА ПОДДЕРЖКИ
// ============================================================
export function isSupported() {
    return 'Notification' in window;
}

// ============================================================
// ЗАПРОС РАЗРЕШЕНИЯ
// ============================================================
export async function requestPermission() {
    if (!isSupported()) {
        console.warn('⚠️ Уведомления не поддерживаются');
        return false;
    }

    try {
        const result = await Notification.requestPermission();
        permission = result;
        console.log('🔔 Разрешение на уведомления:', result);
        return result === 'granted';
    } catch (error) {
        console.error('❌ Ошибка запроса разрешения:', error);
        return false;
    }
}

// ============================================================
// ПРОВЕРКА, РАЗРЕШЕНЫ ЛИ УВЕДОМЛЕНИЯ
// ============================================================
export function isGranted() {
    if (!isSupported()) return false;
    return Notification.permission === 'granted';
}

// ============================================================
// ПОКАЗ УВЕДОМЛЕНИЯ
// ============================================================
export function showNotification(title, options = {}) {
    if (!isGranted()) {
        console.warn('⚠️ Уведомления не разрешены');
        return null;
    }

    const enabled = localStorage.getItem('purple_notifications') !== 'false';
    if (!enabled) return null;

    try {
        const notification = new Notification(title, {
            body: options.body || '',
            icon: options.icon || '/icon.png',
            badge: options.badge || '/icon.png',
            tag: options.tag || 'purple-message',
            silent: true,
            requireInteraction: false,
            ...options
        });

        notification.onclick = () => {
            window.focus();
            if (options.onClick) options.onClick();
            notification.close();
        };

        setTimeout(() => notification.close(), 5000);
        return notification;
    } catch (error) {
        console.error('❌ Ошибка показа уведомления:', error);
        return null;
    }
}

// ============================================================
// УВЕДОМЛЕНИЕ О НОВОМ СООБЩЕНИИ
// ============================================================
export function notifyNewMessage(senderName, text, chatId = null) {
    return showNotification(`💬 ${senderName}`, {
        body: text.length > 100 ? text.substring(0, 100) + '...' : text,
        tag: `chat-${chatId || 'unknown'}`,
        onClick: () => {
            if (chatId && window.__PURPLE?.openChat) {
                window.__PURPLE.openChat(chatId);
            }
        }
    });
}

// ============================================================
// НАСТРОЙКИ
// ============================================================
export function areNotificationsEnabled() {
    return localStorage.getItem('purple_notifications') !== 'false';
}

export function setNotificationsEnabled(enabled) {
    localStorage.setItem('purple_notifications', String(enabled));
    console.log('🔔 Уведомления:', enabled ? 'включены' : 'выключены');
}

export function initNotifications() {
    if (!isSupported()) {
        console.warn('⚠️ Уведомления не поддерживаются');
        return false;
    }
    permission = Notification.permission;
    console.log('🔔 Статус уведомлений:', permission);
    return permission === 'granted';
}