<div align="center">
  <h1>🟣 Purple Chat</h1>
  <p><b>Безопасный P2P-мессенджер нового поколения с пост-квантовым шифрованием</b></p>
  
  <!-- Кнопочки (Badges) -->
  <p>
    <img src="https://img.shields.io/badge/License-GPLv3-blue.svg" alt="License" />
    <img src="https://img.shields.io/badge/Version-1.0.0-purple.svg" alt="Version" />
    <img src="https://img.shields.io/badge/Security-E2EE-brightgreen.svg" alt="E2EE" />
  </p>
  <p>
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white" alt="WebRTC" />
    <img src="https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript" />
  </p>
</div>

<br />

> **Purple Chat** — это приватный децентрализованный мессенджер, разработанный для безопасного общения без компромиссов. Проект сочетает в себе скорость прямых P2P-соединений и надежность облачных технологий, обеспечивая при этом сквозное шифрование (E2EE) уровня Enterprise.

---

## ✨ Ключевые возможности

| Функция | Описание |
| :--- | :--- |
| 🔐 **Пост-квантовая криптография** | Гибридная схема на базе **ML-KEM-768** (FIPS 203) и **XChaCha20-Poly1305**. Защита от взлома даже квантовыми компьютерами. |
| ⚡ **Гибридная доставка данных** | Умный роутер сам решает: если собеседник онлайн — данные летят через **WebRTC** (напрямую). Если офлайн — в зашифрованное облако. |
| 🎙️ **Медиа и голосовые** | Запись голосовых сообщений (Opus), отправка фото и документов. Всё шифруется на устройстве. |
| 📞 **P2P Аудиозвонки** | Прямая передача звука между устройствами. Сервер-посредник не слышит ваш разговор. |
| 🛡️ **Zero-Knowledge** | Сервер видит только зашифрованный мусор. Ключи никогда не покидают ваше устройство. |
| 🎨 **15+ тем оформления** | От строгого Glassmorphism до ярких неоновых цветов. |

---

## 🏗 Архитектура и Безопасность

В основе проекта лежит принцип **нулевого разглашения (Zero-Knowledge)**. Даже если сервер будет взломан, злоумышленники не получат доступ к переписке.

| Слой | Технология | Назначение |
| :--- | :--- | :--- |
| **Обмен ключами** | `ML-KEM-768` | Пост-квантовая защита от перехвата |
| **Шифрование данных** | `XChaCha20-Poly1305` | Симметричное шифрование сообщений и файлов |
| **Локальная БД** | `IndexedDB + ChaCha20` | Защита кэша на устройстве (at-rest encryption) |
| **Хэширование паролей**| `Argon2id` | Защита от брутфорса и подбора |
| **Сеть** | `WebRTC / Trystero` | Прямая передача P2P (без сервера) |

---

## 🚀 Быстрый старт (Локальный запуск)

Для запуска проекта на своем компьютере вам понадобится **Node.js** (v18+) и аккаунт **Supabase**.

1. **Клонируйте репозиторий:**
   ```bash
   git clone https://github.com/MIH-hub/purple-chat.git
   cd purple-chat
Установите зависимости:

bash
npm install
Настройте переменные окружения:
Создайте файл .env в корне проекта и добавьте ваши ключи из панели Supabase (Project Settings -> API):

env
VITE_SUPABASE_URL=https://ваш_проект.supabase.co
VITE_SUPABASE_ANON_KEY=ваш_публичный_ключ
Запустите сервер разработки:

bash
npm run dev
🗺 Планы по развитию (Roadmap)
☑ Сквозное шифрование (E2EE) и пост-квантовые ключи
☑ Текстовые сообщения и отправка файлов
☑ Гибридный роутер (P2P + Облако)
☑ Аудиозвонки (WebRTC)
□ Внедрение Double Ratchet (Forward Secrecy)
□ Защита от MITM (Safety Numbers / Отпечатки ключей)
□ PIN-код для входа в приложение
📄 Лицензия
Этот проект распространяется под лицензией GNU General Public License v3.0.
Подробности смотрите в файле LICENSE.

<div align="center"> <i>Разработано с заботой о вашей приватности.</i> </div> ```
