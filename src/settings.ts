// Настройки приложения в памяти телефона (localStorage)

export type Settings = {
  // Сколько листов на экране: разворот целиком или одна страница
  pages: 1 | 2;
};

const SETTINGS_KEY = 'notes-pwa:settings';
const DEFAULTS: Settings = { pages: 2 };

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<Settings>) : {};
    return { pages: saved.pages === 1 ? 1 : DEFAULTS.pages };
  } catch {
    return DEFAULTS;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Память недоступна (приватный режим) — настройки живут до перезагрузки
  }
}
