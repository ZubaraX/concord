// Lightweight, dependency-free i18n. The active language lives in the settings
// store (persisted), so switching it re-renders every component that uses the
// `useI18n()` hook. Keys missing from a language fall back to English, then to
// the key itself.
import { useSettings } from "../store/settings";

export const LANGUAGES = { en: "English", ru: "Русский" } as const;
export type Lang = keyof typeof LANGUAGES;

// English is the source of truth; every other language must provide the same
// keys (enforced by `Record<keyof typeof en, string>` below).
const en = {
  // Auth
  "auth.welcome": "Welcome back",
  "auth.createAccount": "Create an account",
  "auth.subtitle": "Your self-hosted home for voice, video and text.",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.username": "Username",
  "auth.login": "Log In",
  "auth.register": "Register",
  "auth.needAccount": "Need an account? Register",
  "auth.haveAccount": "Already have an account? Log in",
  "auth.loading": "Please wait…",

  // App chrome
  "app.connecting": "Connecting to Concord…",
  "nav.friends": "Friends",
  "nav.directMessages": "Direct Messages",
  "nav.searchOrStartDm": "Find or start a conversation",

  // Channels
  "channel.textChannels": "Text Channels",
  "channel.voiceChannels": "Voice Channels",
  "channel.createChannel": "Create Channel",
  "channel.pinnedMessages": "Pinned messages",
  "channel.welcomeTitle": "Welcome to #{name}!",
  "channel.welcomeDm": "This is the beginning of your direct message history with {name}.",
  "channel.welcomeChannel": "This is the start of the #{name} channel.",
  "chat.typingOne": "is typing…",
  "chat.typingMany": "are typing…",

  // Composer
  "composer.message": "Message #{name}",
  "composer.messageDm": "Message {name}",
  "composer.replyingTo": "Replying to {name}",
  "composer.uploadFile": "Upload a file",
  "composer.gif": "GIF",
  "composer.emoji": "Emoji",
  "composer.cancel": "Cancel",

  // Voice / call
  "voice.call": "Call",
  "voice.startCall": "Start / join voice call",
  "voice.leave": "Leave",
  "voice.disconnect": "Disconnect",
  "voice.mute": "Mute",
  "voice.unmute": "Unmute",
  "voice.deafen": "Deafen",
  "voice.camera": "Camera",
  "voice.cameraOff": "Cam Off",
  "voice.share": "Share",
  "voice.stopShare": "Stop Share",
  "voice.react": "React",
  "voice.inCall": "In call",
  "voice.connecting": "Connecting…",
  "voice.connected": "Voice Connected",

  // Members / profile
  "members.title": "Members",
  "members.online": "Online",
  "members.offline": "Offline",
  "profile.viewProfile": "View Profile",
  "profile.message": "Message",
  "profile.aboutMe": "About Me",
  "profile.pronouns": "Pronouns",
  "profile.memberSince": "Member Since",
  "profile.roles": "Roles",

  // Friends
  "friends.title": "Friends",
  "friends.all": "All",
  "friends.online": "Online",
  "friends.pending": "Pending",
  "friends.addFriend": "Add Friend",
  "friends.addPlaceholder": "Enter a username#0000",
  "friends.send": "Send Friend Request",
  "friends.accept": "Accept",
  "friends.decline": "Decline",
  "friends.remove": "Remove",
  "friends.empty": "No friends here yet.",

  // Settings
  "settings.title": "Settings",
  "settings.tab.profile": "My Profile",
  "settings.tab.voice": "Voice & Video",
  "settings.tab.app": "App / Connection",
  "settings.displayName": "Display name",
  "settings.avatarUrl": "Avatar URL",
  "settings.bannerUrl": "Banner image URL",
  "settings.bannerColor": "Banner / accent color",
  "settings.pronouns": "Pronouns",
  "settings.pronounsPlaceholder": "they/them, she/her, he/him…",
  "settings.customStatus": "Custom status",
  "settings.customStatusPlaceholder": "Playing something",
  "settings.status": "Status",
  "settings.accentColor": "Accent color",
  "settings.aboutMe": "About me",
  "settings.saveProfile": "Save Profile",
  "settings.saving": "Saving…",
  "settings.saved": "Saved ✓",
  "settings.serverUrl": "Server URL",
  "settings.saveServerUrl": "Save Server URL",
  "settings.logout": "Log Out",
  "settings.language": "Language",
  "settings.languageDesc": "Changes the language of the entire interface.",
  "settings.preview": "Preview",

  // Status names
  "status.ONLINE": "Online",
  "status.IDLE": "Idle",
  "status.DND": "Do Not Disturb",
  "status.OFFLINE": "Invisible",

  // Generic
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.create": "Create",
  "common.close": "Close",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.copy": "Copy",
  "common.reply": "Reply",
  "common.pin": "Pin",
  "common.unpin": "Unpin",
  "common.download": "Download",
  "common.openInBrowser": "Open in browser",
} as const;

const ru: Record<keyof typeof en, string> = {
  "auth.welcome": "С возвращением",
  "auth.createAccount": "Создать аккаунт",
  "auth.subtitle": "Ваш самостоятельный дом для голоса, видео и текста.",
  "auth.email": "Почта",
  "auth.password": "Пароль",
  "auth.username": "Имя пользователя",
  "auth.login": "Войти",
  "auth.register": "Зарегистрироваться",
  "auth.needAccount": "Нет аккаунта? Зарегистрируйтесь",
  "auth.haveAccount": "Уже есть аккаунт? Войдите",
  "auth.loading": "Подождите…",

  "app.connecting": "Подключение к Concord…",
  "nav.friends": "Друзья",
  "nav.directMessages": "Личные сообщения",
  "nav.searchOrStartDm": "Найти или начать беседу",

  "channel.textChannels": "Текстовые каналы",
  "channel.voiceChannels": "Голосовые каналы",
  "channel.createChannel": "Создать канал",
  "channel.pinnedMessages": "Закреплённые сообщения",
  "channel.welcomeTitle": "Добро пожаловать в #{name}!",
  "channel.welcomeDm": "Это начало вашей переписки с {name}.",
  "channel.welcomeChannel": "Это начало канала #{name}.",
  "chat.typingOne": "печатает…",
  "chat.typingMany": "печатают…",

  "composer.message": "Сообщение в #{name}",
  "composer.messageDm": "Сообщение для {name}",
  "composer.replyingTo": "Ответ для {name}",
  "composer.uploadFile": "Загрузить файл",
  "composer.gif": "GIF",
  "composer.emoji": "Эмодзи",
  "composer.cancel": "Отмена",

  "voice.call": "Позвонить",
  "voice.startCall": "Начать / войти в звонок",
  "voice.leave": "Выйти",
  "voice.disconnect": "Отключиться",
  "voice.mute": "Выкл. микрофон",
  "voice.unmute": "Вкл. микрофон",
  "voice.deafen": "Выкл. звук",
  "voice.camera": "Камера",
  "voice.cameraOff": "Выкл. камеру",
  "voice.share": "Демонстрация",
  "voice.stopShare": "Остановить",
  "voice.react": "Реакция",
  "voice.inCall": "В звонке",
  "voice.connecting": "Подключение…",
  "voice.connected": "Голос подключён",

  "members.title": "Участники",
  "members.online": "В сети",
  "members.offline": "Не в сети",
  "profile.viewProfile": "Открыть профиль",
  "profile.message": "Написать",
  "profile.aboutMe": "Обо мне",
  "profile.pronouns": "Местоимения",
  "profile.memberSince": "Участник с",
  "profile.roles": "Роли",

  "friends.title": "Друзья",
  "friends.all": "Все",
  "friends.online": "В сети",
  "friends.pending": "Ожидание",
  "friends.addFriend": "Добавить друга",
  "friends.addPlaceholder": "Введите username#0000",
  "friends.send": "Отправить запрос",
  "friends.accept": "Принять",
  "friends.decline": "Отклонить",
  "friends.remove": "Удалить",
  "friends.empty": "Здесь пока нет друзей.",

  "settings.title": "Настройки",
  "settings.tab.profile": "Мой профиль",
  "settings.tab.voice": "Голос и видео",
  "settings.tab.app": "Приложение / Подключение",
  "settings.displayName": "Отображаемое имя",
  "settings.avatarUrl": "Ссылка на аватар",
  "settings.bannerUrl": "Ссылка на баннер",
  "settings.bannerColor": "Цвет баннера / акцента",
  "settings.pronouns": "Местоимения",
  "settings.pronounsPlaceholder": "они/их, она/её, он/его…",
  "settings.customStatus": "Свой статус",
  "settings.customStatusPlaceholder": "Чем заняты",
  "settings.status": "Статус",
  "settings.accentColor": "Акцентный цвет",
  "settings.aboutMe": "Обо мне",
  "settings.saveProfile": "Сохранить профиль",
  "settings.saving": "Сохранение…",
  "settings.saved": "Сохранено ✓",
  "settings.serverUrl": "Адрес сервера",
  "settings.saveServerUrl": "Сохранить адрес",
  "settings.logout": "Выйти",
  "settings.language": "Язык",
  "settings.languageDesc": "Меняет язык всего интерфейса.",
  "settings.preview": "Пример",

  "status.ONLINE": "В сети",
  "status.IDLE": "Не активен",
  "status.DND": "Не беспокоить",
  "status.OFFLINE": "Невидимка",

  "common.cancel": "Отмена",
  "common.save": "Сохранить",
  "common.create": "Создать",
  "common.close": "Закрыть",
  "common.delete": "Удалить",
  "common.edit": "Изменить",
  "common.copy": "Копировать",
  "common.reply": "Ответить",
  "common.pin": "Закрепить",
  "common.unpin": "Открепить",
  "common.download": "Скачать",
  "common.openInBrowser": "Открыть в браузере",
};

const dicts: Record<Lang, Record<string, string>> = { en, ru };

export type TKey = keyof typeof en;

export function translate(lang: Lang, key: TKey, vars?: Record<string, string | number>): string {
  let s = dicts[lang]?.[key] ?? en[key] ?? (key as string);
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

/** Reactive translation hook — re-renders the component when the language changes. */
export function useI18n() {
  const lang = useSettings((s) => s.lang) as Lang;
  return {
    lang,
    t: (key: TKey, vars?: Record<string, string | number>) => translate(lang, key, vars),
  };
}
