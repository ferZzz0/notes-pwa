// Записи тетради в памяти телефона (localStorage). Разворот s (с 0) —
// страницы 2s+1 (левая) и 2s+2 (правая); у каждого разворота свой лист —
// вниз и в стороны от корешка (x = 0, левая страница — x < 0), он растёт
// вслед за текстом. Текст можно написать в любом месте листа — это блоки с
// координатами мира.
// Храним только развороты с текстом; у установленного на iPhone приложения
// память своя, отдельная от Safari.

import type { Run } from './richText';
import type { EffectId, FilterId, FontId, FrameId, MarkerId, StickerId } from './textStyle';

export type Block = {
  id: string;
  // Что это: надпись (kind нет), стикер с надписью, фото или наклейка
  kind?: 'sticker' | 'image' | 'decal';
  // Левый верхний угол в координатах мира (px; верх листа — y = 0): у
  // надписи и стикера — начало текста, у фото — угол рамки
  x: number;
  y: number;
  // Текст надписи или стикера (у фото — пусто)
  text: string;
  // Куски текста со своим оформлением (richText.ts); нет — весь текст
  // оформлен как вся надпись. Вместе куски — ровно text
  runs?: Run[];
  // Оформление; чего нет — то по умолчанию: синие чернила, рукописный
  // шрифт, без поворота, обычный размер. Цвет — #rrggbb (в старых записях —
  // имя чернил, textStyle.ts)
  color?: string;
  font?: FontId;
  // Эффект букв (свечение, тень…) и маркер на тексте; нет — без них
  effect?: EffectId;
  marker?: MarkerId;
  // Цвет маркера (#rrggbb; нет — у старых готовых маркеров их цвет, иначе жёлтый)
  markerColor?: string;
  // Поворот вокруг середины (градусы) и размер (1 — обычный)
  rotate?: number;
  scale?: number;
  // Размер шрифта надписи (1 — обычный): новая надпись на приближенном листе
  // мельче, на отдалённом — крупнее, чтобы на экране она была как обычно
  textSize?: number;
  // Непрозрачность надписи, стикера или фото — от 0.1 до 1 (нет — 1)
  opacity?: number;
  // Закрыто на замок: не двигается, не правится и не удаляется, пока замок
  // не открыть (кнопка над панелью)
  locked?: boolean;
  // Стикер: форма и цвет (#rrggbb; нет — цвет формы по умолчанию)
  sticker?: StickerId;
  fill?: string;
  // Фото: картинка в IndexedDB (images.ts), ширина (px мира), пропорции
  // (высота / ширина), рамка, фильтр. У надписи и стикера width — ширина
  // строк (по ней текст переносится; ручка на рамке), нет — по тексту, до
  // предела страницы
  image?: string;
  // Наклейка: какая (textStyle.ts: DECALS) и сколько на ней блёсток (0–1);
  // её размер — width (px мира)
  decal?: string;
  glitter?: number;
  width?: number;
  ratio?: number;
  frame?: FrameId;
  filter?: FilterId;
  // Фото отражено: flip — по горизонтали (слева направо), flipV — по
  // вертикали (вверх ногами)
  flip?: boolean;
  flipV?: boolean;
  // Когда появился на листе и когда его меняли последний раз (ГГГГ-ММ-ДД,
  // edited — только если не в тот же день): по ним дата страницы. У старых
  // записей их нет — тогда день разворота (created)
  day?: string;
  edited?: string;
};

// Пустая надпись (без текста, или только пробелы и переводы строки) — её
// убирают с листа; стикер и фото без текста остаются
export const isBlank = (b: Block) => !b.kind && !b.text.trim();

// Цвет и шрифт, выбранные последними, — с ними начинается новая надпись
export type TextStyle = { color?: string; font?: FontId };

// Брелок под островком iPhone (настройки листа, Charm.tsx): наклейка (id из
// DECALS), сколько на ней блёсток (0–1) и её размер (px экрана)
export type Charm = { decal: string; glitter: number; size: number };

// Оформление страницы (настройки листа): цвет бумаги и цвет её номера и
// даты (#rrggbb), брелок; нет — как у приложения
export type PageLook = { paper?: string; labels?: string; charm?: Charm };
// История оформления страницы — для «Отменить» / «Вернуть» в настройках
// листа (только этой страницы; хранится вместе с ней — просьба автора)
export type LookLog = { past: PageLook[]; future: PageLook[] };

export type Spread = {
  // Когда на развороте впервые написали — ГГГГ-ММ-ДД по местному времени
  created?: string;
  blocks: Block[];
  // Оформление левой и правой страниц и его история
  looks?: { left?: PageLook; right?: PageLook };
  lookLog?: { left?: LookLog; right?: LookLog };
};

// Есть ли у разворота что хранить: что-то на листе, своё оформление или его
// история
export const isKept = (s: Spread) =>
  s.blocks.some(b => !isBlank(b)) || !!(s.looks?.left || s.looks?.right || s.lookLog?.left || s.lookLog?.right);

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

// Стереть все записи и настройки на этом устройстве (кнопка в настройках):
// все ключи приложения — и известные, и с id дневника. Отметку о разовой
// очистке не трогаем — иначе она прошла бы ещё раз
export function clearAll(): void {
  try {
    for (const key of ALL_KEYS) localStorage.removeItem(key);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('notes-pwa:') && key !== RESET_KEY) localStorage.removeItem(key);
    }
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

// --- Дневники и листы дней ---
// Тетрадь открывает либо дневник (их несколько, у каждого имя), либо лист
// одного дня из календаря. У дневника свои развороты и открытая страница;
// у первого дневника — прежние ключи (записи, сделанные до дневников).
// Листы дней — все в одном ключе: { 'ГГГГ-ММ-ДД': разворот }, у дня один
// лист — правая страница разворота 0.
export type Source = { kind: 'notebook'; id: string } | { kind: 'day'; date: string };
// Что открыто: меню или тетрадь
export type View = { kind: 'menu' } | Source;
// Наклейка на обложке дневника: какая (textStyle.ts: DECALS), середина
// (x, y) и ширина (size) — доли обложки, поворот (градусы), блёстки (0–1)
export type CoverDecal = { id: string; decal: string; x: number; y: number; size: number; rotate?: number; glitter?: number };
// Дневник: имя, цвет обложки, её узор (textStyle.ts: COVER_DESIGNS) и наклейки
export type NotebookInfo = { id: string; name: string; color: string; design?: string; decals?: CoverDecal[] };

const NOTEBOOKS_KEY = 'notes-pwa:notebooks';
const DAYS_KEY = 'notes-pwa:days';
const VIEW_KEY = 'notes-pwa:view';
export const FIRST_NOTEBOOK = 'default';
// Страница листа дня (правая страница разворота 0)
export const DAY_PAGE = 2;
// Цвета обложек — по кругу для новых дневников
export const COVER_COLORS = ['#3b4a8c', '#b5523b', '#3f7d5c', '#8a5aa8', '#c48a2c', '#2f7f95', '#a8435f', '#5b5f66'];

const spreadsKey = (id: string) => (id === FIRST_NOTEBOOK ? SPREADS_KEY : `${SPREADS_KEY}:${id}`);
const pageKey = (id: string) => (id === FIRST_NOTEBOOK ? PAGE_KEY : `${PAGE_KEY}:${id}`);

export function loadNotebooks(): NotebookInfo[] {
  const list = read<NotebookInfo[] | null>(NOTEBOOKS_KEY, null);
  return Array.isArray(list) && list.length > 0 ? list : [{ id: FIRST_NOTEBOOK, name: 'Мой дневник', color: COVER_COLORS[0] }];
}

export function saveNotebooks(list: NotebookInfo[]): void {
  write(NOTEBOOKS_KEY, list);
}

// Стереть записи дневника; возвращает id его фото — их стирает images.ts
export function deleteNotebookData(id: string): string[] {
  const spreads = read<Spreads>(spreadsKey(id), {});
  try {
    localStorage.removeItem(spreadsKey(id));
    localStorage.removeItem(pageKey(id));
  } catch {
    // Память недоступна — стирать нечего
  }
  return Object.values(spreads).flatMap(s => s.blocks.map(b => b.image).filter((x): x is string => !!x));
}

// Метка запуска (sessionStorage живёт, пока приложение открыто, и
// переживает перезагрузку, но не новый запуск)
const SESSION_KEY = 'notes-pwa:session';

// Что открыть: новый запуск — главное меню (просьба автора: стартовый экран —
// меню); перезагрузка в том же запуске (например, поставилось обновление) —
// то, что было открыто
// Решается один раз (React в строгом режиме зовёт начальное состояние дважды)
let freshLaunch: boolean | null = null;
export function loadView(): View {
  if (freshLaunch === null) {
    try {
      freshLaunch = !sessionStorage.getItem(SESSION_KEY);
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // sessionStorage недоступен — как раньше, открытое
      freshLaunch = false;
    }
    // Меню и запоминаем: перезагрузка сейчас вернёт в него же
    if (freshLaunch) saveView({ kind: 'menu' });
  }
  if (freshLaunch) return { kind: 'menu' };
  const v = read<View | null>(VIEW_KEY, null);
  return v && (v.kind === 'menu' || v.kind === 'notebook' || v.kind === 'day') ? v : { kind: 'menu' };
}

export function saveView(view: View): void {
  write(VIEW_KEY, view);
}

const readDays = () => read<Record<string, Spread>>(DAYS_KEY, {});

// Дни, на листах которых что-то есть (для отметок в календаре)
export function daysWithNotes(): Set<string> {
  return new Set(
    Object.entries(readDays())
      .filter(([, s]) => s.blocks.some(b => !isBlank(b)))
      .map(([d]) => d)
  );
}

// id всех фото на всех листах (дневники и дни): остальные картинки в
// IndexedDB никому не нужны. null — память не прочитать, и тогда ничего не
// стираем
export function allImageIds(): Set<string> | null {
  const ids = new Set<string>();
  try {
    for (const key of Object.keys(localStorage)) {
      if (key !== SPREADS_KEY && !key.startsWith(`${SPREADS_KEY}:`) && key !== DAYS_KEY) continue;
      const spreads = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, Spread>;
      for (const s of Object.values(spreads)) for (const b of s.blocks ?? []) if (b.image) ids.add(b.image);
    }
  } catch {
    return null;
  }
  return ids;
}

export function loadSpreads(source: Source): Spreads {
  let spreads: Spreads;
  if (source.kind === 'day') {
    const day = readDays()[source.date];
    spreads = day ? { 0: day } : {};
  } else {
    spreads = read<Spreads>(spreadsKey(source.id), {});
    if (source.id === FIRST_NOTEBOOK) migrate(spreads);
  }
  // Пустые блоки могли остаться, если приложение закрыли, ничего не написав
  for (const s of Object.values(spreads)) s.blocks = s.blocks.filter(b => !isBlank(b));
  return spreads;
}

export function saveSpreads(source: Source, spreads: Spreads): void {
  if (source.kind === 'notebook') {
    write(spreadsKey(source.id), spreads);
    return;
  }
  const days = readDays();
  const day = spreads[0];
  if (day && isKept(day)) days[source.date] = day;
  else delete days[source.date];
  write(DAYS_KEY, days);
}

// Открытая страница (с 1) — чтобы после перезапуска вернуться туда же.
// Раньше хранили открытый разворот: разворот s — это страница 2s+1. У дня
// страница одна
export function loadPage(source: Source): number {
  if (source.kind === 'day') return DAY_PAGE;
  const page = read<number | null>(pageKey(source.id), null);
  if (Number.isInteger(page) && page! >= 1) return page!;
  const spread = source.id === FIRST_NOTEBOOK ? read<number>(OLD_SPREAD_KEY, 0) : 0;
  return Number.isInteger(spread) && spread >= 0 ? 2 * spread + 1 : 1;
}

export function savePage(source: Source, n: number): void {
  if (source.kind === 'notebook') write(pageKey(source.id), n);
}

// Скопированное кнопкой «Копировать»: надпись, стикер или фото со всем
// оформлением (без id и дат) — вставляется в любом дневнике и дне
// У фото — ещё размер картинки (px): по нему вставка из буфера обмена
// узнаёт, что там это самое фото
export type Clip = Omit<Block, 'id' | 'day' | 'edited'> & { size?: [number, number] };
const CLIP_KEY = 'notes-pwa:clip';

export function loadClip(): Clip | null {
  const c = read<Clip | null>(CLIP_KEY, null);
  return c && typeof c === 'object' && typeof c.text === 'string' ? c : null;
}

export function saveClip(clip: Clip): void {
  write(CLIP_KEY, clip);
}

// Какой раздел «+» развёрнут — «Стикеры» или «Наклейки» (только один)
const ADD_SECTION_KEY = 'notes-pwa:add-section';
export type AddSection = 'stickers' | 'decals' | null;
export function loadAddSection(): AddSection {
  const v = read<AddSection>(ADD_SECTION_KEY, null);
  return v === 'stickers' || v === 'decals' ? v : null;
}
export function saveAddSection(v: AddSection): void {
  write(ADD_SECTION_KEY, v);
}

// Блёстки новых наклеек — как выбрали в «+» последний раз
const GLITTER_KEY = 'notes-pwa:glitter';
export function loadGlitter(fallback: number): number {
  const v = read<number | null>(GLITTER_KEY, null);
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback;
}
export function saveGlitter(v: number): void {
  write(GLITTER_KEY, v);
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
