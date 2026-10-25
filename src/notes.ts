// Записи тетради в памяти телефона (localStorage). Страницы нумеруются с 1;
// храним только исписанные — пустых сколько угодно, тетрадь бесконечна.
// У установленного на iPhone приложения память своя, отдельная от Safari.

export type PageData = {
  text: string;
  // Когда на странице впервые написали — ГГГГ-ММ-ДД по местному времени
  created: string;
};

export type Pages = Record<number, PageData>;

const PAGES_KEY = 'notes-pwa:pages';
const SPREAD_KEY = 'notes-pwa:spread';
// Раньше была одна заметка — справа на первом развороте, то есть страница 2
const OLD_DRAFT_KEY = 'notes-pwa:draft';

// Сегодня — ГГГГ-ММ-ДД по местному времени (toISOString дал бы UTC,
// и после полуночи по Москве до трёх часов была бы вчерашняя дата)
export function localDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Память недоступна (приватный режим) — записи живут до перезагрузки
  }
}

export function loadPages(): Pages {
  const pages = read<Pages>(PAGES_KEY, {});
  try {
    const draft = localStorage.getItem(OLD_DRAFT_KEY);
    if (draft !== null) {
      if (draft && !pages[2]) pages[2] = { text: draft, created: localDate() };
      write(PAGES_KEY, pages);
      localStorage.removeItem(OLD_DRAFT_KEY);
    }
  } catch {
    // нет доступа к памяти — переносить нечего
  }
  return pages;
}

// Новый текст страницы n: сохраняет и возвращает обновлённые записи.
// Опустевшая страница снова считается чистой (и теряет дату).
export function savePageText(pages: Pages, n: number, text: string): Pages {
  const next = { ...pages };
  if (text) next[n] = { text, created: pages[n]?.created ?? localDate() };
  else delete next[n];
  write(PAGES_KEY, next);
  return next;
}

// Открытый разворот (с 0) — чтобы после перезапуска вернуться туда же
export function loadSpread(): number {
  const n = read<number>(SPREAD_KEY, 0);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export function saveSpread(n: number): void {
  write(SPREAD_KEY, n);
}
