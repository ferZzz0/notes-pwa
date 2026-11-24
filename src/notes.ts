// Записи тетради в памяти телефона (localStorage). Разворот s (с 0) —
// страницы 2s+1 (левая) и 2s+2 (правая); у каждого разворота свой лист —
// вниз и в стороны от корешка (x = 0, левая страница — x < 0), он растёт
// вслед за текстом. Текст можно написать в любом месте листа — это блоки с
// координатами мира.
// Храним только развороты с текстом; у установленного на iPhone приложения
// память своя, отдельная от Safari.

import type { Run } from './richText';
import { defaultDrawing, maxSize, type DrawingOptions, type Ink, type Tool } from './drawing.ts';
import type { EffectId, FilterId, FontId, FrameId, MarkerId, StickerId } from './textStyle';
import { discardPending, getSaveProblem, localRecord, pendingJson, pendingKeys, readDocument, saveRecord, type StoredRecord } from './noteStorage.ts';

export type Block = {
  id: string;
  // Что это: надпись (kind нет), стикер с надписью, фото, наклейка или
  // брелок (наклейка на цепочке, качается — Charm.tsx) или штрих
  kind?: 'sticker' | 'image' | 'decal' | 'charm' | 'ink';
  // Векторные точки штриха относительно (x, y), чтобы он переезжал со страницей
  ink?: Ink;
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
  // Наклейка и брелок: какая наклейка (textStyle.ts: DECALS) и сколько на
  // ней блёсток (0–1); её размер — width (px мира)
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

// Оформление страницы (настройки листа): цвет бумаги и цвет её номера и
// даты (#rrggbb); нет — как у приложения
export type PageLook = { paper?: string; labels?: string };
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

// Старые версии узнают эту отметку. Оставляем её и при откате приложения:
// отсутствие отметки больше не повод удалять чьи-либо записи при запуске.
const LEGACY_RESET_ID = '2026-10-25';
const RESET_KEY = 'notes-pwa:reset';
// Все ключи приложения, включая прежние форматы и убранные настройки
const ALL_KEYS = [SPREADS_KEY, PAGE_KEY, OLD_SPREAD_KEY, OLD_PAGES_KEY, OLD_DRAFT_KEY, STYLE_KEY, 'notes-pwa:settings'];

// Стереть все записи и настройки на этом устройстве (кнопка в настройках):
// все ключи приложения — и известные, и с id блокнота. Отметку о разовой
// очистке не трогаем — иначе она прошла бы ещё раз
export function clearAll(): void {
  discardPending();
  removedNotebooks.clear();
  legacySources = null;
  try {
    for (const key of ALL_KEYS) localStorage.removeItem(key);
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('notes-pwa:') && key !== RESET_KEY) localStorage.removeItem(key);
    }
  } catch {
    // Память недоступна — стирать нечего
  }
}

export function keepLegacyResetMarker(): void {
  try {
    if (localStorage.getItem(RESET_KEY) === null) localStorage.setItem(RESET_KEY, LEGACY_RESET_ID);
  } catch {
    // Метка нужна только прежним версиям приложения.
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

// Положение и настройки интерфейса сохраняются по возможности. Они не
// влияют на состояние записи самих блокнотов и листов.
function writePreference(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Настройка действует до закрытия приложения.
  }
}

const DRAWING_KEY = 'notes-pwa:drawing';
export function loadDrawingOptions(): DrawingOptions {
  const saved = read<Partial<DrawingOptions> | null>(DRAWING_KEY, null);
  const sizes = { ...defaultDrawing.sizes }, colors = { ...defaultDrawing.colors };
  for (const key of Object.keys(sizes) as Tool[]) {
    const size = saved?.sizes?.[key];
    if (size !== undefined && Number.isInteger(size) && size >= 1 && size <= maxSize(key)) sizes[key] = size;
    const color = key === 'eraser' ? undefined : saved?.colors?.[key];
    if (key !== 'eraser' && color && /^#[0-9a-f]{6}$/i.test(color)) colors[key] = color;
  }
  const tool = saved?.tool && Object.hasOwn(sizes, saved.tool) ? saved.tool : defaultDrawing.tool;
  return { tool, sizes, colors };
}

export function saveDrawingOptions(options: DrawingOptions): void {
  writePreference(DRAWING_KEY, options);
}

// Где окажется текст из прежней «страницы целиком» на нынешнем листе
const OLD_PAGE_X = { left: -700, right: 60 };
const OLD_PAGE_Y = 140;

let legacySources: { pages: string | null; draft: string | null } | null = null;

// Исходники переноса удаляем только после успешной записи в формате разворотов.
function finishMigration(): void {
  if (!legacySources) return;
  try {
    if (legacySources.pages !== null && localStorage.getItem(OLD_PAGES_KEY) === legacySources.pages) localStorage.removeItem(OLD_PAGES_KEY);
    if (legacySources.draft !== null && localStorage.getItem(OLD_DRAFT_KEY) === legacySources.draft) localStorage.removeItem(OLD_DRAFT_KEY);
    legacySources = null;
  } catch {
    // Новая копия уже записана. При следующем открытии те же id не задвоятся.
  }
}

function migrate(spreads: Spreads): void {
  try {
    const rawPages = localStorage.getItem(OLD_PAGES_KEY);
    const draft = localStorage.getItem(OLD_DRAFT_KEY);
    if (rawPages === null && draft === null) return;
    const pages = JSON.parse(rawPages ?? '{}') as Record<string, { text: string; created: string }>;
    const entries = Object.entries(pages).map(([key, page]) => ({ n: Number(key), id: `legacy-page-${key}`, ...page }));
    // На некоторых устройствах остались оба формата. Разный текст на
    // странице 2 и в черновике сохраняем отдельными надписями.
    if (draft && draft !== pages[2]?.text) entries.push({ n: 2, id: 'legacy-draft', text: draft, created: localDate() });
    if (entries.length === 0 && draft === null) return;

    if (entries.some(p => !Number.isInteger(p.n) || p.n < 1 || typeof p.text !== 'string')) return;
    const existing = new Set(Object.values(spreads).flatMap(s => s.blocks.map(b => b.id)));
    for (const page of entries) {
      const { n, id } = page;
      if (!page.text) continue;
      const s = Math.floor((n - 1) / 2);
      const spread = spreads[s] ?? { blocks: [] };
      if (existing.has(id)) continue;
      spread.blocks.push({
        id,
        x: n % 2 === 1 ? OLD_PAGE_X.left : OLD_PAGE_X.right,
        y: OLD_PAGE_Y + (id === 'legacy-draft' && pages[2]?.text ? 100 : 0),
        text: page.text
      });
      if (!spread.created || page.created < spread.created) spread.created = page.created;
      spreads[s] = spread;
    }
    legacySources = { pages: rawPages, draft };
    saveSpreads({ kind: 'notebook', id: FIRST_NOTEBOOK }, spreads);
  } catch {
    // нет доступа к памяти — переносить нечего
  }
}

// --- Блокноти и листы дней ---
// Тетрадь открывает либо блокнот (их несколько, у каждого имя), либо лист
// одного дня из календаря. У блокнота свои развороты и открытая страница;
// у первого блокнота — прежние ключи (записи, сделанные до блокнотов).
// Листы дней — все в одном ключе: { 'ГГГГ-ММ-ДД': разворот }, у дня один
// лист — правая страница разворота 0.
export type Source = { kind: 'notebook'; id: string } | { kind: 'day'; date: string };
// Что открыто: меню или тетрадь
export type View = { kind: 'menu' } | Source;
// Наклейка на обложке блокнота: какая (textStyle.ts: DECALS), середина
// (x, y) и ширина (size) — доли обложки, поворот (градусы), блёстки (0–1)
export type CoverDecal = { id: string; decal: string; x: number; y: number; size: number; rotate?: number; glitter?: number };
// Блокнот: имя, цвет обложки, её узор (textStyle.ts: COVER_DESIGNS) и наклейки
export type NotebookInfo = { id: string; name: string; color: string; design?: string; decals?: CoverDecal[] };

const NOTEBOOKS_KEY = 'notes-pwa:notebooks';
const DAYS_KEY = 'notes-pwa:days';
const VIEW_KEY = 'notes-pwa:view';
export const FIRST_NOTEBOOK = 'default';
// Страница листа дня (правая страница разворота 0)
export const DAY_PAGE = 2;
// Цвета обложек — по кругу для новых блокнотов
export const COVER_COLORS = ['#3b4a8c', '#b5523b', '#3f7d5c', '#8a5aa8', '#c48a2c', '#2f7f95', '#a8435f', '#5b5f66'];

const spreadsKey = (id: string) => (id === FIRST_NOTEBOOK ? SPREADS_KEY : `${SPREADS_KEY}:${id}`);
const pageKey = (id: string) => (id === FIRST_NOTEBOOK ? PAGE_KEY : `${PAGE_KEY}:${id}`);

// Раньше это были «дневники»: имена, которые давало само приложение, —
// «Мой дневник», «Дневник N» — теперь «Мой блокнот», «Блокнот N» (просьба
// автора); свои имена не трогаем
const renamed = (name: string) => (name === 'Мой дневник' ? 'Мой блокнот' : name.replace(/^Дневник (\d+)$/, 'Блокнот $1'));

export function loadNotebooks(): NotebookInfo[] {
  const list = readDocument<NotebookInfo[] | null>(NOTEBOOKS_KEY, null);
  return Array.isArray(list) && list.length > 0
    ? list.map(n => ({ ...n, name: renamed(n.name) }))
    : [{ id: FIRST_NOTEBOOK, name: 'Мой блокнот', color: COVER_COLORS[0] }];
}

const removedNotebooks = new Set<string>();

export function saveNotebooks(list: NotebookInfo[], removedId?: string): void {
  if (removedId !== undefined) removedNotebooks.add(removedId);
  saveRecord(NOTEBOOKS_KEY, JSON.stringify(list), localRecord(NOTEBOOKS_KEY), () => {
    // Сначала сохранить список. Если запись не удалась, у прежнего блокнота
    // остаются и листы, и фотографии. Повтор завершит подтверждённое удаление.
    for (const id of removedNotebooks) {
      if (!list.some(n => n.id === id)) {
        discardPending(spreadsKey(id));
        try {
          localStorage.removeItem(spreadsKey(id));
          localStorage.removeItem(pageKey(id));
          if (id === FIRST_NOTEBOOK) {
            localStorage.removeItem(OLD_PAGES_KEY);
            localStorage.removeItem(OLD_DRAFT_KEY);
            legacySources = null;
          }
        } catch {
          // Лучше оставить лишнюю копию. При следующей записи списка повторим.
          continue;
        }
      }
      removedNotebooks.delete(id);
    }
  });
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
  writePreference(VIEW_KEY, view);
}

// На диске все дни по-прежнему в одном ключе. На повторной попытке меняем
// только свою дату в свежих данных, сохраняя остальные дни из других вкладок.
const dayPrefix = `${DAYS_KEY}:`;
function storedDays(): Record<string, Spread> {
  const days = JSON.parse(localStorage.getItem(DAYS_KEY) ?? '{}');
  if (!days || Array.isArray(days) || typeof days !== 'object') throw new Error('Не удалось прочитать календарь');
  return days;
}

function dayRecord(date: string): StoredRecord {
  return {
    read() {
      const day = storedDays()[date];
      return day ? JSON.stringify(day) : null;
    },
    write(json) {
      const days = storedDays();
      if (json === 'null') {
        if (!(date in days)) return;
        delete days[date];
      } else {
        days[date] = JSON.parse(json) as Spread;
      }
      localStorage.setItem(DAYS_KEY, JSON.stringify(days));
    }
  };
}

// Дни, на листах которых что-то есть (для отметок в календаре)
export function daysWithNotes(): Set<string> {
  const marked = new Set<string>();
  try {
    for (const [date, day] of Object.entries(storedDays())) {
      if (day.blocks.some(b => !isBlank(b))) marked.add(date);
    }
  } catch {
    // Если календарь не прочитался, доступны отметки из черновиков.
  }
  for (const key of pendingKeys()) {
    if (!key.startsWith(dayPrefix)) continue;
    const day = JSON.parse(pendingJson(key)!) as Spread | null;
    const date = key.slice(dayPrefix.length);
    if (day?.blocks.some(b => !isBlank(b))) marked.add(date);
    else marked.delete(date);
  }
  return marked;
}

// id всех фото на всех листах (блокноти и дни): остальные картинки в
// IndexedDB никому не нужны. null — память не прочитать, и тогда ничего не
// стираем
export function allImageIds(): Set<string> | null {
  // На листе в памяти могут быть новые фото, а на диске — ещё старые.
  if (getSaveProblem()) return null;
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

// Брелок прежнего вида (один на страницу): наклейка, блёстки, размер (px экрана)
type OldCharm = { decal: string; glitter: number; size: number };

export function loadSpreads(source: Source): Spreads {
  let spreads: Spreads;
  if (source.kind === 'day') {
    const day = readDocument<Spread | null>(dayPrefix + source.date, null, dayRecord(source.date));
    spreads = day ? { 0: day } : {};
  } else {
    spreads = readDocument<Spreads>(spreadsKey(source.id), {});
    if (source.id === FIRST_NOTEBOOK && pendingJson(SPREADS_KEY) === undefined) migrate(spreads);
  }
  // Пустые блоки могли остаться, если приложение закрыли, ничего не написав
  for (const s of Object.values(spreads)) s.blocks = s.blocks.filter(b => !isBlank(b));
  // Брелок недолго был один на страницу, на экране под островком: в
  // оформлении страницы (looks.*.charm), потом отдельно (charms) — теперь
  // это вещь листа: повешен у верха посередине своей страницы, размер
  // (тогда — px экрана) — примерно в px мира
  for (const s of Object.values(spreads) as (Spread & { charms?: Partial<Record<'left' | 'right', OldCharm>> })[]) {
    for (const side of ['left', 'right'] as const) {
      const look = s.looks?.[side] as (PageLook & { charm?: OldCharm }) | undefined;
      const old = s.charms?.[side] ?? look?.charm;
      if (look?.charm) delete look.charm;
      if (look && !look.paper && !look.labels) delete s.looks![side];
      if (!old) continue;
      const width = Math.round(old.size * 2.1);
      s.blocks.push({ id: newBlockId(), kind: 'charm', decal: old.decal, glitter: old.glitter, text: '', width, x: (side === 'left' ? -425 : 425) - width / 2, y: 0 });
    }
    delete s.charms;
    if (s.looks && !s.looks.left && !s.looks.right) delete s.looks;
  }
  return spreads;
}

export function saveSpreads(source: Source, spreads: Spreads, json?: string): void {
  if (source.kind === 'notebook') {
    const key = spreadsKey(source.id);
    saveRecord(key, json ?? JSON.stringify(spreads), localRecord(key), source.id === FIRST_NOTEBOOK ? finishMigration : undefined);
    return;
  }
  const day = spreads[0];
  saveRecord(dayPrefix + source.date, JSON.stringify(day && isKept(day) ? day : null), dayRecord(source.date));
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
  if (source.kind === 'notebook') writePreference(pageKey(source.id), n);
}

// Скопированное кнопкой «Копировать»: надпись, стикер или фото со всем
// оформлением (без id и дат) — вставляется в любом блокноте и дне
// У фото — ещё размер картинки (px): по нему вставка из буфера обмена
// узнаёт, что там это самое фото
export type Clip = Omit<Block, 'id' | 'day' | 'edited'> & { size?: [number, number] };
const CLIP_KEY = 'notes-pwa:clip';

export function loadClip(): Clip | null {
  const c = read<Clip | null>(CLIP_KEY, null);
  return c && typeof c === 'object' && typeof c.text === 'string' ? c : null;
}

export function saveClip(clip: Clip): void {
  writePreference(CLIP_KEY, clip);
}

// Какой раздел «+» развёрнут — «Стикеры», «Наклейки» или «Брелоки» (только один)
const ADD_SECTION_KEY = 'notes-pwa:add-section';
export type AddSection = 'stickers' | 'decals' | 'charms' | null;
export function loadAddSection(): AddSection {
  const v = read<AddSection>(ADD_SECTION_KEY, null);
  return v === 'stickers' || v === 'decals' || v === 'charms' ? v : null;
}
export function saveAddSection(v: AddSection): void {
  writePreference(ADD_SECTION_KEY, v);
}

// Блёстки новых наклеек — как выбрали в «+» последний раз
const GLITTER_KEY = 'notes-pwa:glitter';
export function loadGlitter(fallback: number): number {
  const v = read<number | null>(GLITTER_KEY, null);
  return typeof v === 'number' && v >= 0 && v <= 1 ? v : fallback;
}
export function saveGlitter(v: number): void {
  writePreference(GLITTER_KEY, v);
}

export function loadStyle(): TextStyle {
  return read<TextStyle>(STYLE_KEY, {});
}

export function saveStyle(style: TextStyle): void {
  writePreference(STYLE_KEY, style);
}

// Разворот и сторона страницы n (с 1): нечётные — слева, чётные — справа
export const spreadOf = (n: number) => Math.floor((n - 1) / 2);
export const sideOf = (n: number): 'left' | 'right' => (n % 2 === 1 ? 'left' : 'right');
