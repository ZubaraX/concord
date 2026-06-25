// App version + changelog used by the "What's New" screen, which appears once
// after the app auto-updates to a newer build.

export function appVersion(): string {
  return window.concord?.version || __APP_VERSION__;
}

export interface ChangelogEntry {
  version: string;
  date: string;
  items: string[];
}

// Newest first. Add a new entry whenever you bump the version.
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.2.4",
    date: "2026-06-25",
    items: [
      "Авто-обновление при запуске: приложение само ставит новую версию и показывает, что изменилось",
      "Звонок (рингтон) на входящие звонки в личных сообщениях",
      "Пинг и уведомление, когда вас @упоминают (включая @everyone / @here)",
      "Обновление в фоне больше не прерывает активную сессию (ставится при выходе)",
    ],
  },
  {
    version: "0.2.2",
    date: "2026-06-25",
    items: ["Просторнее GIF-пикер: крупнее превью, отступы между гифками, подсветка выбора"],
  },
  {
    version: "0.2.1",
    date: "2026-06-25",
    items: [
      "Исправлен зависший статус «Connecting…» в голосе, когда вы одни в канале",
      "Звуки приложения: вход/выход в голос, мьют, новое сообщение (громкость в настройках)",
    ],
  },
  {
    version: "0.2.0",
    date: "2026-06-24",
    items: [
      "GIF-пикер (поиск через KLIPY)",
      "Непрочитанные сообщения и превью ссылок",
      "Просмотр чужого профиля, надёжная отправка и реакции",
    ],
  },
];

// Compare semantic versions "a.b.c". Returns >0 if a>b, 0 if equal, <0 if a<b.
export function cmpVersion(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Changelog entries strictly newer than `since`, up to and including the current version. */
export function changesSince(since: string): ChangelogEntry[] {
  const cur = appVersion();
  return CHANGELOG.filter(
    (e) => cmpVersion(e.version, since) > 0 && cmpVersion(e.version, cur) <= 0
  );
}
