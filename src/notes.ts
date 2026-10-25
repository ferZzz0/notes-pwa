// Записи тетради в памяти телефона (localStorage). Разворот s (с 0) —
// страницы 2s+1 (левая) и 2s+2 (правая); у каждого разворота свой лист —
// вниз и в стороны от корешка (x = 0, левая страница — x < 0), он растёт
// вслед за текстом. Текст можно написать в любом месте листа — это блоки с
// координатами мира.
// Храним только развороты с текстом; у установленного на iPhone приложения
// память своя, отдельная от Safari.

import type { EffectId, FilterId, FontId, FrameId, MarkerId, StickerId } from './textStyle';

export type Block = {
  id: string;
  // Что это: надпись (kind нет), стикер с надписью или фото
  kind?: 'sticker' | 'image';
  // Левый верхний угол в координатах мира (px; верх листа — y = 0): у
  // надписи и стикера — начало текста, у фото — угол рамки
  x: number;
  y: number;
  // Текст надписи или стикера (у фото — пусто)
  text: string;
  // Оформление; чего нет — то по умолчанию: синие чернила, рукописный
  // шрифт, без поворота, обычный размер. Цвет — #rrggbb (в старых записях —
  // имя чернил, textStyle.ts)
  color?: string;
  font?: FontId;
  // Эффект букв (свечение, тень…) и маркер на тексте; нет — без них
  effect?: EffectId;
  marker?: MarkerId;
  // Поворот вокруг середины (градусы) и размер (1 — обычный)
  rotate?: number;
  scale?: number;
  // Стикер: форма и цвет (#rrggbb; нет — цвет формы по умолчанию)
  sticker?: StickerId;
  fill?: string;
  // Фото: картинка в IndexedDB (images.ts), ширина (px мира), пропорции
  // (высота / ширина), рамка, фильтр, отражено ли по горизонтали
  image?: string;
  width?: number;
  ratio?: number;
  frame?: FrameId;
  filter?: FilterId;
  flip?: boolean;
};

// Пустая надпись (без текста) — её убирают с листа; стикер и фото без текста
// остаются
export const isBlank = (b: Block) => !b.kind && !b.text;

// Цвет и шрифт, выбранные последними, — с ними начинается новая надпись
export type TextStyle = { color?: string; font?: FontId };

export type Spread = {
  // Когда на развороте впервые написали — ГГГГ-ММ-ДД по местному времени
  created?: string;
  blocks: Block[];
};

export type Spreads = Record<number, Spread>;

const SPREADS_KEY = 'notes-pwa:spreads';
const PAGE_KEY = 'notes-pwa:page';
const OLD_SPREAD_KEY = 'notes-pwa:spread';
// Прежние форматы: текст на каждую страницу целиком, а ещё раньше — одна
// заметка (она была справа на первом развороте, то есть страница 2)
const OLD_PAGES_KEY = 'notes-pwa:pages';
const OLD_DRAFT_KEY = 'notes-pwa:draft';
const STYLE_KEY = 'notes-pwa:style';

// Разовая очистка: при первом запуске версии с новым RESET_ID устройство
// стирает все записи и запоминает это, так что записи, сделанные после,
// остаются. Нужна, чтобы стереть данные у всех пользователей сразу (их
// записи есть только на их устройствах). Стереть ещё раз — сменить RESET_ID.
// 2026-10-25 — по решению автора приложения (тестовые записи).
const RESET_ID = '2026-10-25';
const RESET_KEY = 'notes-pwa:reset';
// Все ключи приложения, включая прежние форматы и убранные настройки
const ALL_KEYS = [SPREADS_KEY, PAGE_KEY, OLD_SPREAD_KEY, OLD_PAGES_KEY, OLD_DRAFT_KEY, STYLE_KEY, 'notes-pwa:settings'];

// Стереть все записи и настройки на этом устройстве (кнопка в настройках).
// Отметку о разовой очистке не трогаем — иначе она прошла бы ещё раз
export function clearAll(): void {
  try {
    for (const key of ALL_KEYS) localStorage.removeItem(key);
  } catch {
    // Память недоступна — стирать нечего
  }
}

export function resetOnce(): void {
  try {
    if (localStorage.getItem(RESET_KEY) === RESET_ID) return;
    clearAll();
    localStorage.setItem(RESET_KEY, RESET_ID);
  } catch {
    // Память недоступна — стирать нечего
  }
}

// Сегодня — ГГГГ-ММ-ДД по местному времени (toISOString дал бы UTC,
// и после полуночи по Москве до трёх часов была бы вчерашняя дата)
export function localDate(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function newBlockId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
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

// Где окажется текст из прежней «страницы целиком» на нынешнем листе
const OLD_PAGE_X = { left: -700, right: 60 };
const OLD_PAGE_Y = 140;

function migrate(spreads: Spreads): void {
  try {
    const pages = read<Record<string, { text: string; created: string }>>(OLD_PAGES_KEY, {});
    const draft = localStorage.getItem(OLD_DRAFT_KEY);
    if (draft && !pages[2]) pages[2] = { text: draft, created: localDate() };
    const entries = Object.entries(pages);
    if (entries.length === 0 && draft === null) return;

    for (const [key, page] of entries) {
      const n = Number(key);
      if (!page.text) continue;
      const s = Math.floor((n - 1) / 2);
      const spread = spreads[s] ?? { blocks: [] };
      spread.blocks.push({
        id: newBlockId(),
        x: n % 2 === 1 ? OLD_PAGE_X.left : OLD_PAGE_X.right,
        y: OLD_PAGE_Y,
        text: page.text
      });
      if (!spread.created || page.created < spread.created) spread.created = page.created;
      spreads[s] = spread;
    }
    write(SPREADS_KEY, spreads);
    localStorage.removeItem(OLD_PAGES_KEY);
    localStorage.removeItem(OLD_DRAFT_KEY);
  } catch {
    // нет доступа к памяти — переносить нечего
  }
}

export function loadSpreads(): Spreads {
  const spreads = read<Spreads>(SPREADS_KEY, {});
  migrate(spreads);
  // Пустые блоки могли остаться, если приложение закрыли, ничего не написав
  for (const s of Object.values(spreads)) s.blocks = s.blocks.filter(b => !isBlank(b));
  return spreads;
}

export function saveSpreads(spreads: Spreads): void {
  write(SPREADS_KEY, spreads);
}

// Открытая страница (с 1) — чтобы после перезапуска вернуться туда же.
// Раньше хранили открытый разворот: разворот s — это страница 2s+1.
export function loadPage(): number {
  const page = read<number | null>(PAGE_KEY, null);
  if (Number.isInteger(page) && page! >= 1) return page!;
  const spread = read<number>(OLD_SPREAD_KEY, 0);
  return Number.isInteger(spread) && spread >= 0 ? 2 * spread + 1 : 1;
}

export function savePage(n: number): void {
  write(PAGE_KEY, n);
}

export function loadStyle(): TextStyle {
  return read<TextStyle>(STYLE_KEY, {});
}

export function saveStyle(style: TextStyle): void {
  write(STYLE_KEY, style);
}

// Разворот и сторона страницы n (с 1): нечётные — слева, чётные — справа
export const spreadOf = (n: number) => Math.floor((n - 1) / 2);
export const sideOf = (n: number): 'left' | 'right' => (n % 2 === 1 ? 'left' : 'right');
