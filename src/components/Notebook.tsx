import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { pageImage } from '../exportPage';
import { copyImage, imagePng, importImage, keepImages, pixelSize } from '../images';
import {
  allImageIds,
  isBlank,
  isKept,
  loadClip,
  loadPage,
  loadSpreads,
  loadStyle,
  localDate,
  newBlockId,
  saveClip,
  savePage,
  saveSpreads,
  saveStyle,
  sideOf,
  spreadOf,
  type Block,
  type Clip,
  type LookLog,
  type PageLook,
  type Source,
  type Spread,
  type Spreads,
  type TextStyle
} from '../notes';
import { usePortrait } from '../orientation';
import {
  applyToRange,
  compactRuns,
  getRange,
  runsOf,
  runsText,
  setRange,
  stripStyle,
  textLength,
  styleAt,
  type Run,
  type RunStyle,
  type TextRange
} from '../richText';
import { markerOf, type StickerId } from '../textStyle';
import { isDark } from '../theme';
import { AddMenu } from './AddMenu';
import { ConfirmDialog } from './ConfirmDialog';
import { Canvas, type Camera, type CanvasHandle, type Fixed, type Grab, type Home, type Point, type Rect } from './Canvas';
import { ImageItem } from './ImageItem';
import { ImageToolbar } from './ImageToolbar';
import { PageSettings } from './PageSettings';
import { PageTurn } from './PageTurn';
import { Paper, type PaperDisplay, type PaperHandle } from './Paper';
import { Selection, type SelectionHandle } from './Selection';
import { BLEED_X, pendingRanges, STICKER_PAD_X, TextBlock } from './TextBlock';
import { LockedToolbar, LockIcon, TextToolbar } from './TextToolbar';
import './Notebook.css';

type FlipDir = 'next' | 'prev';
// Прочитанное из буфера обмена: картинка или текст
type Pasted = { file: File } | { text: string };

// Надпись или фото без id, дат, замка и служебного — чтобы сравнить со
// скопированным
function clipKey(x: Block | Clip): string {
  const { id: _id, day: _day, edited: _edited, locked: _locked, size: _size, ...rest } = x as Block & Clip;
  return JSON.stringify(rest);
}
type Side = 'left' | 'right';
// Переворот листа: разворот from → to; sheet — переворачиваемая половина
// листа в координатах мира: от корешка до края экрана, от верха листа до
// низа экрана
type Flip = { dir: FlipDir; from: number; to: number; sheet: Rect };

// Начало листа, оно же исходный размер листа — ровно экран (Canvas). По
// ширине экрана: разворот — две страницы по 850 px мира (как у настоящей
// тетради, 170 мм), корешок посередине; одна страница — 850 px, корешок у
// края экрана. Верх листа — у верха экрана. На узком экране масштаб не
// мельче 0.4 — чтобы текст читался.
const PAGE_WIDTH = 850;
const homeOf = (display: PaperDisplay): Home =>
  display === 'both'
    ? { x: 0, y: 0, width: 2 * PAGE_WIDTH, minScale: 0.4, align: 'center' }
    : { x: 0, y: 0, width: PAGE_WIDTH, minScale: 0.4, align: display === 'left' ? 'right' : 'left' };
// Верх листа не растёт; у одной страницы не растёт и край у корешка
const fixedOf = (display: PaperDisplay): Fixed =>
  display === 'both' ? { top: true } : display === 'left' ? { top: true, right: true } : { top: true, left: true };

const TEXT_WIDTH = 640;
const MIN_TEXT_WIDTH = 200;
const SPINE_GAP = 24; // текст левой страницы не подходит к корешку ближе
// Новый текст встаёт так, чтобы точка касания пришлась на первую строку
const NEW_TEXT_OFFSET = { x: 12, y: 30 };
// Касание и жест попадают в надпись и чуть рядом с ней (экранные px)
const TAP_PAD = 8;
const GRAB_PAD = 16;
// Размер надписи — от 0.4 до 4, фото уменьшается вчетверо сильнее (до 0.1 —
// просьба автора); поворот рядом с прямым углом и размер рядом с обычным
// «прилипают» к ним
const MIN_TEXT_SCALE = 0.4;
const MIN_PHOTO_SCALE = 0.1;
const MAX_TEXT_SCALE = 4;
// Размер шрифта новой надписи по зуму — в этих пределах
const MIN_TEXT_SIZE = 0.2;
const MAX_TEXT_SIZE = 3;
const SNAP_DEG = 4;
const SNAP_SCALE = 0.06;
// Перелистывание (мс): горизонтально — быстро (просьба автора: сначала в 5 раз
// быстрее прежних 850, потом вдвое медленнее этого), вертикально
// за ним ещё летит камера к новой странице
const TURN_MS = { spread: 340, single: 850 };
// Перелёт к началу листа перед перелистыванием (если лист приближен)
const TURN_HOME_MS = 200;
// Смахивание листает, если начато в этой доле экрана у края, к которому
// листаем (просьба автора: «с 1/3 экрана, ближней к странице»)
const TURN_EDGE = 1 / 3;
// Перед тем как открыть клавиатуру, строку с курсором поднимаем не ниже этой
// доли экрана, а лист удлиняем на столько (клавиатура iPhone с полосой над
// ней — до половины экрана и больше в горизонтали)
const CARET_ZONE = 0.3;
const KEYBOARD_GUESS = 0.6;
// Столько держим этот запас — пока клавиатура открывается
const TYPING_RESERVE_MS = 1000;
// Камера не двигалась столько (мс) — курсор в надписи ставим на место
const CARET_SETTLE_MS = 120;
// Ряд «Отменить» / «Вернуть» над панелью надписи: кнопка 40 + отступ 8 (px экрана)
const HISTORY_ROW = 48;
// Скопировали стикер (или надпись) без текста — в буфер обмена кладём эту
// невидимую метку: по ней вставка узнаёт скопированное
const EMPTY_CLIP_MARK = '\u2063';
// Примерная ширина вставленной надписи (мир) — чтобы поставить её посередине экрана
const PASTE_TEXT_WIDTH = 300;
// Столько после касания панели перемены выделения в надписи не считаем
const TOOLBAR_GRACE_MS = 700;
// Ручки выделения выступают за текст: касания ближе этого (px экрана) к
// надписи, в которой печатают и что-то выделено, — её
const HANDLE_PAD = 32;
// Новое фото — не шире этой доли видимой части листа и не выше этой
const PHOTO_SHARE = { w: 0.55, h: 0.6 };
// Примерный размер нового стикера (мир) — чтобы поставить его посередине экрана
const STICKER_SIZE = { w: 230, h: 210 };
// После касания «Вставить» в меню «+» ждём столько (мс), чтобы меню точно
// успело исчезнуть с экрана, — потом читаем буфер, и Safari показывает свою
// кнопку «Вставить» (пока она на экране, страница не перерисовывается, и
// рядом с ней оставалась наша — две кнопки, жалоба автора). Таймер короче
// секунды Safari ещё считает ответом на касание
const MENU_GONE_MS = 200;
// iPhone и iPad (iPad представляется компьютером Mac, но с сенсорным экраном)
const APPLE_TOUCH = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// «Отменить»: столько последних действий помним; набор в одной надписи с
// паузами короче MERGE_MS — одно действие
const HISTORY_SIZE = 100;
const MERGE_MS = 1500;

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });
const dayFormat = new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// Дата листа дня: «суббота, 25 октября 2026 г.» → без «г.»
function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dayFormat.format(new Date(y, m - 1, d)).replace(/\s*г\.$/, '');
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

// Дни с a по b (ГГГГ-ММ-ДД): «25 октября», «с 25 по 27 октября»,
// «с 30 октября по 2 ноября», в разные годы — с годами
function formatDays(a: string, b: string): string {
  if (a === b) return formatDate(a);
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  if (ya !== yb) return `с ${formatDate(a)} ${ya} по ${formatDate(b)} ${yb}`;
  return ma === mb ? `с ${da} по ${formatDate(b)}` : `с ${formatDate(a)} по ${formatDate(b)}`;
}

// Дата страницы side разворота: с первого по последний день, когда на ней
// что-то появлялось или менялось (day / edited у блоков; у старых записей —
// день разворота). Пустая страница — без даты
function pageDate(sp: Spread | undefined, side: Side): string | null {
  let first = '';
  let last = '';
  for (const b of sp?.blocks ?? []) {
    if (b.x < 0 !== (side === 'left') || isBlank(b)) continue;
    const from = b.day ?? sp?.created;
    if (!from) continue;
    const to = b.edited ?? from;
    if (!first || from < first) first = from;
    if (to > last) last = to;
  }
  return first ? formatDays(first, last) : null;
}

// Блок без дат — для сравнения: изменилось ли в нём что-то, кроме них
const undated = (b: Block) => JSON.stringify({ ...b, day: undefined, edited: undefined });

// Даты блоков перед записью: новый или изменённый блок — день, когда
// появился (day), и сегодня как день последнего изменения (edited, если не
// тот же); остальные — как в прежней записи old
function stampDates(next: Spreads, old: Spreads): Spreads {
  const today = localDate();
  const before = new Map<string, { block: Block; created?: string }>();
  for (const sp of Object.values(old)) for (const block of sp.blocks) before.set(block.id, { block, created: sp.created });
  const out: Spreads = {};
  for (const [key, sp] of Object.entries(next)) {
    const blocks = sp.blocks.map(b => {
      const o = before.get(b.id);
      if (o && undated(o.block) === undated(b)) {
        return b.day === o.block.day && b.edited === o.block.edited ? b : { ...b, day: o.block.day, edited: o.block.edited };
      }
      const day = o?.block.day ?? b.day ?? o?.created ?? today;
      return { ...b, day, edited: day < today ? today : undefined };
    });
    out[Number(key)] = { ...sp, blocks };
  }
  return out;
}

// Страница сама по себе — чтобы удалить лист или вставить новый (следующие
// сдвигаются, и левые страницы становятся правыми и наоборот): её надписи и
// фото в координатах правой страницы, её оформление и его история
type PageData = { blocks: Block[]; look?: PageLook; log?: LookLog };

// x на странице side → x на правой странице и обратно: левая [−850, 0)
// ложится на [0, 850), а то, что за её внешним краем (лист вырос наружу), —
// зеркально за внешний край правой
const toRightX = (x: number, side: Side) => (side === 'right' ? x : x >= -PAGE_WIDTH ? x + PAGE_WIDTH : -x);
const fromRightX = (x: number, side: Side) => (side === 'right' ? x : x < PAGE_WIDTH ? x - PAGE_WIDTH : -x);

// Развороты → страницы по порядку (с 0); пустые — пустые
function toPages(spreads: Spreads): PageData[] {
  const pages: PageData[] = [];
  for (const [key, sp] of Object.entries(spreads)) {
    const s = Number(key);
    for (const side of ['left', 'right'] as const) {
      const blocks = sp.blocks
        .filter(b => sideOfBlock(b) === side)
        // День разворота у старых записей — теперь день самого блока: он
        // может уехать на другой разворот
        .map(b => ({ ...b, x: toRightX(b.x, side), day: b.day ?? sp.created }));
      const look = sp.looks?.[side];
      const log = sp.lookLog?.[side];
      if (blocks.length > 0 || look || log) pages[2 * s + (side === 'left' ? 0 : 1)] = { blocks, look, log };
    }
  }
  return Array.from(pages, p => p ?? { blocks: [] });
}

function fromPages(pages: PageData[]): Spreads {
  const out: Spreads = {};
  pages.forEach((p, i) => {
    if (p.blocks.length === 0 && !p.look && !p.log) return;
    const side = sideOf(i + 1);
    const sp = (out[spreadOf(i + 1)] ??= { blocks: [] });
    sp.blocks.push(...p.blocks.map(b => ({ ...b, x: fromRightX(b.x, side) })));
    if (p.look) sp.looks = { ...sp.looks, [side]: p.look };
    if (p.log) sp.lookLog = { ...sp.lookLog, [side]: p.log };
  });
  return out;
}

// Сколько шагов оформления страницы помнит её «Отменить»
const LOOK_LOG_SIZE = 50;

// Оформление без пустых полей (пустое — как у приложения)
function cleanLook(look: PageLook): PageLook {
  const clean: PageLook = {};
  if (look.paper) clean.paper = look.paper;
  if (look.labels) clean.labels = look.labels;
  return clean;
}
const sameLook = (a: PageLook, b: PageLook) => JSON.stringify(cleanLook(a)) === JSON.stringify(cleanLook(b));

// Разворот, у страницы side которого оформление look (пустое — как у
// приложения: не храним) и история log (undefined — прежняя, null — убрать);
// разворот, где ничего не осталось, — убрать
function withLook(all: Spreads, s: number, side: Side, look: PageLook, log?: LookLog | null): Spreads {
  const cur = all[s] ?? { blocks: [] };
  const clean = cleanLook(look);
  const looks = { ...cur.looks, [side]: clean.paper || clean.labels ? clean : undefined };
  const logs = log === undefined ? cur.lookLog : { ...cur.lookLog, [side]: log ?? undefined };
  const sp: Spread = {
    ...cur,
    looks: looks.left || looks.right ? looks : undefined,
    lookLog: logs?.left || logs?.right ? logs : undefined
  };
  const next = { ...all, [s]: sp };
  if (!isKept(sp)) delete next[s];
  return next;
}

// Поля вокруг надписей и фото на картинке листа, если лист вырос (px мира)
const EXPORT_MARGIN = 40;
// Дольше картинки фото на экспорт не ждём (мс)
const IMAGE_WAIT_MS = 3000;

// Все фото в node загрузились (или прошло IMAGE_WAIT_MS): картинка фото
// читается из памяти не сразу, а потом ещё декодируется
async function imagesLoaded(node: HTMLElement): Promise<void> {
  const until = performance.now() + IMAGE_WAIT_MS;
  while (node.querySelectorAll('.item-image-photo:not(:has(> img))').length > 0 && performance.now() < until) {
    await new Promise(r => setTimeout(r, 50));
  }
  await Promise.all([...node.querySelectorAll('img')].map(img => img.decode().catch(() => {})));
}

const blurActive = () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
};

// Страница, на которой надпись или фото (левый край левее корешка — левая)
const sideOfBlock = (b: Block): Side => (b.x < 0 ? 'left' : 'right');

// Наибольшая ширина строк надписи: у левой страницы — не дальше корешка;
// своя ширина (ручка на рамке) — не шире этого предела
// Ширина строк по умолчанию — по размеру шрифта: мелкая надпись (на
// приближенном листе) переносится раньше и не уходит за экран
const widthLimitOf = (b: Block) => {
  const own = TEXT_WIDTH * (b.textSize ?? 1);
  return b.x < 0 ? Math.max(Math.min(MIN_TEXT_WIDTH, own), Math.min(own, -b.x - SPINE_GAP)) : own;
};
const maxWidthOf = (b: Block) => (b.kind !== 'image' && b.width ? Math.min(b.width, widthLimitOf(b)) : widthLimitOf(b));
// Уже этого (px мира) надпись ручкой не сжать
const MIN_WRAP_WIDTH = 120;

// Сколько места надпись занимает на листе (мир) — с поворотом и размером
// (TextBlock кладёт их в data-атрибуты); offset* — без них
function blockRect(el: HTMLElement): Rect {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const a = ((Number(el.dataset.rotate) || 0) * Math.PI) / 180;
  const k = Number(el.dataset.scale) || 1;
  const ex = ((Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a))) * k) / 2;
  const ey = ((Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a))) * k) / 2;
  const cx = el.offsetLeft + w / 2;
  const cy = el.offsetTop + h / 2;
  return { x: cx - ex, y: cy - ey, w: 2 * ex, h: 2 * ey };
}

// Надпись, стикер (их поле ввода) или фото на листе
const blockElement = (id: string) => document.querySelector<HTMLElement>(`.page-texts [data-block="${id}"]`);

// Редактируемая надпись (в ней печатают)
const isEditor = (el: Element | null): el is HTMLElement =>
  el instanceof HTMLElement && el.isContentEditable && el.classList.contains('text-block');

// Попадает ли точка мира в надпись — с её поворотом и размером и с запасом
// pad (px мира) вокруг
function hitBlock(el: HTMLElement, p: Point, pad: number): boolean {
  const w = el.offsetWidth;
  const h = el.offsetHeight;
  const a = (-(Number(el.dataset.rotate) || 0) * Math.PI) / 180;
  const k = Number(el.dataset.scale) || 1;
  const dx = p.x - (el.offsetLeft + w / 2);
  const dy = p.y - (el.offsetTop + h / 2);
  const lx = dx * Math.cos(a) - dy * Math.sin(a);
  const ly = dx * Math.sin(a) + dy * Math.cos(a);
  return Math.abs(lx) <= (w * k) / 2 + pad && Math.abs(ly) <= (h * k) / 2 + pad;
}

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const angleDeg = (a: Point, b: Point) => (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
// Угол в пределах (−180°, 180°]
const normalize = (deg: number) => {
  const d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};
const snapAngle = (deg: number) => {
  const right = Math.round(deg / 90) * 90;
  return Math.abs(deg - right) < SNAP_DEG ? normalize(right) : deg;
};

// Раскрытая тетрадь. Разворот s (с 0) — страницы 2s+1 (слева от корешка,
// x < 0) и 2s+2 (справа). Лист сначала по экрану и растёт на экран, когда
// текст подходит к краю (Canvas). Вертикально видно одну страницу,
// горизонтально — разворот.
// Двойное касание по бумаге — написать в этом месте. Касание по надписи
// выбирает её (рамка — Selection, внизу панель цвета и шрифта — TextToolbar),
// без клавиатуры; ещё одно касание по ней — печатать. Выбранную надпись
// двигают пальцем, а двумя пальцами ещё поворачивают и меняют размер (grab).
// Касание по бумаге снимает выбор.
// Листают стрелками внизу экрана (или на клавиатуре): камера летит к началу
// листа, и страница перелистывается — загибается с нижнего уголка и уходит
// через корешок (PageTurn). На одной странице
// к соседней странице того же разворота камера перелетает через корешок, а к
// другому развороту — переворот листа и перелёт вслед за ним.
// Лист дня (source — день из календаря) — одна страница в любой ориентации,
// вверху — дата; стрелки листают дни (onDay), а не страницы.
type Props = {
  source: Source;
  // Выйти в главное меню
  onMenu: () => void;
  // Лист дня: на день назад / вперёд
  onDay: (delta: number) => void;
};

export function Notebook({ source, onMenu, onDay }: Props) {
  const dayDate = source.kind === 'day' ? source.date : null;
  const canvas = useRef<CanvasHandle>(null);
  const paper = useRef<PaperHandle>(null);
  const selection = useRef<SelectionHandle>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const flipDone = useRef<(() => void) | null>(null);
  const [spreads, setSpreads] = useState(() => loadSpreads(source));
  // Записи прямо сейчас — для жеста, который длится дольше одной перерисовки
  const spreadsRef = useRef(spreads);
  spreadsRef.current = spreads;
  // Выбранная надпись (рамка и панель) и та, которую сейчас печатают
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Цвет и шрифт последней надписи — с ними начинается следующая
  const [style, setStyle] = useState(loadStyle);
  const [toolbarHeight, setToolbarHeight] = useState(0);
  // Текст надписи, когда в неё начали печатать (по id) — чтобы вернуть его,
  // если её стёрли целиком и передумали удалять
  const textBefore = useRef(new Map<string, { text: string; runs?: Run[] }>());
  // Надпись с текстом стёрли целиком: спрашиваем, удалить ли её
  const [erased, setErased] = useState<{ id: string; text: string; runs?: Run[] } | null>(null);
  // Выделение в надписи в начале нажатия на панель — до того, как касание его
  // сбросит; null — оформление ляжет на всю надпись
  const captured = useRef<TextRange | null>(null);
  // Оформление выделенного куска — список на панели отмечает его
  const [rangeStyle, setRangeStyle] = useState<RunStyle | null>(null);
  // Когда последний раз касались панели: выделение, которое iOS снимает от
  // этого касания, не в счёт
  const toolbarTouch = useRef(-Infinity);
  // Печатают (или вот-вот откроется клавиатура): лист заранее удлинён снизу
  const [typing, setTyping] = useState(false);
  // Открытая страница; на развороте — любая из двух его страниц
  const [page, setPage] = useState(() => loadPage(source));
  const portrait = usePortrait();
  // Вид меняется вслед за ориентацией, но после перелёта (см. эффект ниже);
  // у листа дня всегда одна страница
  const [singleView, setSingle] = useState(portrait);
  const single = dayDate !== null || singleView;
  const [flip, setFlip] = useState<Flip | null>(null);
  const [turning, setTurning] = useState(false);
  // Во время перехода видно обе страницы, и края одной страницы не мешают камере
  const [transit, setTransit] = useState(false);
  // Прямоугольник всего, что написано на видимых страницах (мир): по нему
  // лист растёт у краёв
  const [content, setContent] = useState<Rect | null>(null);
  // Загрузился шрифт — тексты перестроились: перерисовка, и замер ниже
  // проходит заново
  const [, setFontsLoaded] = useState(0);

  const spread = spreadOf(page);
  const side = sideOf(page);
  const display: PaperDisplay = single && !transit ? side : 'both';
  const home = homeOf(single ? side : 'both');
  // Надписи на видимых страницах открытого разворота
  const visibleBlocks = (spreads[spread]?.blocks ?? []).filter(
    b => display === 'both' || (display === 'left' ? b.x < 0 : b.x >= 0)
  );
  const selectedBlock = turning ? undefined : visibleBlocks.find(b => b.id === selected);

  // То, что сейчас записано в память, — от него считаются история и даты
  const saved = useRef<{ spreads: Spreads; json: string } | null>(null);
  saved.current ??= { spreads, json: JSON.stringify(spreads) };
  // «Отменить» / «Вернуть»: записи до и после действий (JSON) — только на
  // открытом развороте (перелистнули — история с начала, иначе отмена
  // меняла бы невидимую страницу). key и at — последнее действие: набор в
  // одной надписи подряд сливается в одно
  const history = useRef({ spread, past: [] as string[], future: [] as string[], key: '', at: 0 });
  if (history.current.spread !== spread) history.current = { spread, past: [], future: [], key: '', at: 0 };

  // Записать в память. Новые и изменённые блоки получают даты (stampDates),
  // прежняя запись уходит в историю; key — что за действие (одинаковые
  // подряд, с паузами короче MERGE_MS, — одно). Возвращает то, что записано.
  // stamp = false — даты не трогаем: листы сдвинули (удалили или вставили
  // лист), надписи переехали, но их никто не менял
  const persist = (next: Spreads, key = '', stamp = true): Spreads => {
    const prev = saved.current!;
    const stamped = stamp ? stampDates(next, prev.spreads) : next;
    const json = JSON.stringify(stamped);
    if (json === prev.json) return prev.spreads;
    const h = history.current;
    const now = Date.now();
    if (!key || key !== h.key || now - h.at > MERGE_MS) {
      h.past.push(prev.json);
      if (h.past.length > HISTORY_SIZE) h.past.shift();
    }
    h.key = key;
    h.at = now;
    h.future = [];
    saved.current = { spreads: stamped, json };
    saveSpreads(source, stamped);
    return stamped;
  };

  const commit = (next: Spreads, key?: string, stamp?: boolean) => setSpreads(persist(next, key, stamp));

  // Вернуть запись из истории (отмена / возврат)
  // Панель редактирования остаётся открытой (просьба автора), если то, что
  // выбрано, после отмены на листе есть; нет — выбор снимается
  const restore = (json: string) => {
    const next = JSON.parse(json) as Spreads;
    saved.current = { spreads: next, json };
    history.current.key = '';
    saveSpreads(source, next);
    setSpreads(next);
    captured.current = null;
    setRangeStyle(null);
    if (selected && !Object.values(next).some(s => s.blocks.some(b => b.id === selected))) deselect();
  };

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (prev === undefined) return;
    h.future.push(saved.current!.json);
    restore(prev);
  };

  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (next === undefined) return;
    h.past.push(saved.current!.json);
    restore(next);
  };

  // Картинки убранных фото стираются не сразу (удаление можно отменить), а
  // при следующем открытии тетради — все, которых нет ни на одном листе
  useEffect(() => {
    const ids = allImageIds();
    if (ids) void keepImages(ids);
  }, []);

  // Набранное в надписи — её куски (текст — их сумма)
  const setRuns = (id: string, runs: Run[]) => {
    const cur = spreads[spread];
    if (!cur) return;
    const text = runsText(runs);
    const blocks = cur.blocks.map(b => (b.id === id ? { ...b, text, runs: compactRuns(runs) } : b));
    commit({ ...spreads, [spread]: { ...cur, created: cur.created ?? (text ? localDate() : undefined), blocks } }, `text:${id}`);
  };

  // Убрать надпись, стикер или фото с листа (картинку фото — потом, см.
  // keepImages); пустой разворот не храним
  const removeBlock = (id: string) => {
    const cur = spreads[spread];
    if (!cur) return;
    const blocks = cur.blocks.filter(b => b.id !== id);
    const next = { ...spreads };
    if (isKept({ ...cur, blocks })) next[spread] = { ...cur, blocks };
    else delete next[spread];
    commit(next);
  };

  // Пустая надпись исчезает с листа (стикер остаётся). Новая, в которой так
  // ничего и не написали, — сразу; а ту, где был текст, стёрли целиком —
  // только после подтверждения (отмена возвращает текст)
  const dropIfEmpty = (id: string) => {
    // Из ввода вышли сами — на время списка на панели или перестановки слоя
    if (menuHold.current || reordering.current) return;
    panCaret.current = null;
    setFocused(f => (f === id ? null : f));
    setTyping(false);
    const b = spreads[spread]?.blocks.find(x => x.id === id);
    if (!b || !isBlank(b)) return;
    const before = textBefore.current.get(id);
    if (before?.text) setErased({ id, ...before });
    else removeBlock(id);
  };

  // Наверх / вниз среди всего на листе: порядок в списке — порядок слоёв
  // Если в надписи печатают — она остаётся в вводе: при перестановке в
  // документе элемент теряет фокус, и клавиатура пряталась (жалоба автора);
  // фокус и выделение возвращаем сразу, в том же нажатии (iOS иначе не
  // покажет клавиатуру)
  const reordering = useRef(false);
  const reorder = (id: string, dir: 'up' | 'down') => {
    const el = blockElement(id);
    const typingHere = !!el && document.activeElement === el;
    const range = typingHere ? getRange(el) : null;
    reordering.current = true;
    flushSync(() =>
      setSpreads(prev => {
        const cur = prev[spread];
        const b = cur?.blocks.find(x => x.id === id);
        if (!cur || !b) return prev;
        const rest = cur.blocks.filter(x => x.id !== id);
        return persist({ ...prev, [spread]: { ...cur, blocks: dir === 'up' ? [...rest, b] : [b, ...rest] } });
      })
    );
    reordering.current = false;
    const now = blockElement(id);
    if (!typingHere || !now || document.activeElement === now) return;
    now.focus({ preventScroll: true });
    if (range) setRange(now, range);
  };

  // Добавить на открытый разворот (стикер или фото) и выбрать
  const addBlock = (block: Block) => {
    const cur = spreads[spread] ?? { blocks: [] };
    flushSync(() => {
      commit({ ...spreads, [spread]: { ...cur, created: cur.created ?? localDate(), blocks: [...cur.blocks, block] } });
      setSelected(block.id);
    });
  };

  // Середина того, что сейчас видно на листе (мир)
  const viewCenter = (): Point => {
    const v = canvas.current!.visibleRect();
    return { x: v.x + v.w / 2, y: Math.max(0, v.y) + (v.y + v.h - Math.max(0, v.y)) / 2 };
  };

  // Стикер — посередине экрана, и сразу можно писать (фокус — прямо в
  // нажатии, иначе iOS не покажет клавиатуру)
  const addSticker = (sticker: StickerId) => {
    const c = viewCenter();
    const pos = place(STICKER_SIZE.w, c.x - STICKER_SIZE.w / 2, c.y - STICKER_SIZE.h / 2);
    const block: Block = {
      id: newBlockId(),
      kind: 'sticker',
      sticker,
      ...pos,
      text: '',
      // На красной ленте — белые буквы, на остальных — как у прошлой надписи
      ...(sticker === 'ribbon' ? { color: '#ffffff' } : style.color ? { color: style.color } : {}),
      ...(style.font && style.font !== 'hand' ? { font: style.font } : {})
    };
    addBlock(block);
    edit(block.id);
  };

  // Фото из галереи или буфера обмена: уменьшаем и сохраняем (images.ts),
  // ставим серединой в точку at (нет — посередине экрана), не шире и не
  // выше доли видимой части листа; маленькую картинку не растягиваем больше
  // её собственного размера на экране — она бы расплылась
  const addPhoto = async (file: File, at?: Point) => {
    const id = newBlockId();
    let ratio: number;
    let natural: number;
    try {
      ({ ratio, width: natural } = await importImage(file, id));
    } catch {
      alert('Не получилось открыть это фото');
      return;
    }
    const v = canvas.current!.visibleRect();
    const width = Math.round(Math.min(v.w * PHOTO_SHARE.w, (v.h * PHOTO_SHARE.h) / ratio, natural / camera.current.scale));
    const c = at ?? viewCenter();
    const pos = place(width, c.x - width / 2, c.y - (width * ratio) / 2);
    addBlock({ id: newBlockId(), kind: 'image', image: id, width, ratio, ...pos, text: '' });
  };

  // Новая надпись там, где коснулись (p, мир): текст начинается чуть левее
  // и выше пальца, на левой странице — не за корешком. Цвет и шрифт — как у
  // прошлой надписи
  // Размер шрифта — по зуму листа (просьба автора): на экране надпись
  // открывается обычной величины, а на листе приближенном она мельче,
  // на отдалённом — крупнее
  const newText = (p: Point, text = ''): Block => {
    const zoom = canvas.current?.zoom() ?? 1;
    const raw = Math.min(MAX_TEXT_SIZE, Math.max(MIN_TEXT_SIZE, 1 / zoom));
    const size = Math.abs(raw - 1) < SNAP_SCALE ? 1 : Math.round(raw * 100) / 100;
    return {
      id: newBlockId(),
      x: p.x < 0 ? Math.min(p.x - NEW_TEXT_OFFSET.x * size, -MIN_TEXT_WIDTH - SPINE_GAP) : Math.max(p.x - NEW_TEXT_OFFSET.x * size, 0),
      y: Math.max(0, p.y - NEW_TEXT_OFFSET.y * size),
      text,
      ...(style.color ? { color: style.color } : {}),
      ...(style.font && style.font !== 'hand' ? { font: style.font } : {}),
      ...(size !== 1 ? { textSize: size } : {})
    };
  };

  // Вставленный текст — новая выбранная надпись в точке p; если это текст
  // надписи, скопированной кнопкой «Копировать», — она сама, со всем
  // оформлением
  const pasteText = (text: string, p: Point) => {
    const t = text.replace(/\r\n?/g, '\n');
    if (!t.trim()) {
      alert('В буфере обмена нет ни текста, ни картинки');
      return;
    }
    const plain = newText(p, t);
    if (clip && clip.kind !== 'image' && clip.text === t) addBlock({ ...clip, id: plain.id, x: plain.x, y: plain.y, locked: undefined });
    else addBlock(plain);
  };

  // «Копировать» на панели: надпись, стикер или фото — со всем оформлением
  // в память приложения (вставка — «+» → «Вставить скопированное»); текст
  // надписи — ещё и в буфер обмена, для других приложений
  const [clip, setClip] = useState<Clip | null>(loadClip);
  // Галочка на «Копировать» — пока выбранное то же, что скопировано (с ним
  // ничего не делали; просьба автора)
  const copied = !!selectedBlock && !!clip && clipKey(selectedBlock) === clipKey(clip);
  const copySelected = () => {
    const b = selectedBlock;
    if (!b) return;
    // Копия — без замка (просьба автора): её сразу можно двигать и править
    const { id: _id, day: _day, edited: _edited, locked: _locked, ...rest } = b;
    saveClip(rest);
    setClip(rest);
    if (b.kind !== 'image') void navigator.clipboard?.writeText(b.text.trim() ? b.text : EMPTY_CLIP_MARK).catch(() => {});
    // Фото: картинку — в буфер обмена (вставка долгим нажатием тоже его
    // найдёт; запись — прямо в нажатии, картинка дочитывается потом), а её
    // размер — в скопированное, чтобы узнать её при вставке
    if (b.kind === 'image' && b.image) {
      const image = b.image;
      try {
        if (typeof ClipboardItem !== 'undefined') void navigator.clipboard?.write([new ClipboardItem({ 'image/png': imagePng(image) })]).catch(() => {});
      } catch {
        // Буфер обмена недоступен — вставить можно через «+»
      }
      void pixelSize(image).then(size => {
        if (!size) return;
        const withSize = { ...rest, size };
        saveClip(withSize);
        setClip(withSize);
      });
    }
  };

  // «Вставить скопированное»: посередине экрана, выбранным; у фото — своя
  // копия картинки
  const pasteClip = async (at = viewCenter()) => {
    const loaded = loadClip();
    if (!loaded) return;
    const { size: _size, locked: _locked, ...c } = loaded;
    let image = c.image;
    if (c.kind === 'image' && c.image) {
      image = newBlockId();
      if (!(await copyImage(c.image, image))) {
        alert('Картинки скопированного фото уже нет');
        return;
      }
    }
    const w = c.kind === 'image' ? (c.width ?? 500) : c.kind === 'sticker' ? STICKER_SIZE.w : PASTE_TEXT_WIDTH;
    const h = c.kind === 'image' ? w * (c.ratio ?? 0.75) : STICKER_SIZE.h;
    addBlock({ ...c, id: newBlockId(), image, ...place(w, at.x - w / 2, at.y - h / 2) });
  };

  // «Вставить» из своего пузырька: картинка из буфера обмена — фото, текст —
  // надпись, в точку нажатия p. Буфер читаем прямо в нажатии на кнопку —
  // иначе браузер не даст; iOS ещё покажет свою кнопку «Вставить», если
  // скопировано не здесь
  // Прочитать буфер обмена: картинка — файлом, иначе текст; null — пусто
  const readClipboard = async (): Promise<Pasted | null> => {
    const board = navigator.clipboard;
    if (typeof board.read !== 'function') {
      const text = await board.readText();
      return text.trim() ? { text } : null;
    }
    const items = await board.read();
    for (const item of items) {
      const type = item.types.find(t => t.startsWith('image/'));
      if (type) return { file: new File([await item.getType(type)], 'clipboard', { type }) };
    }
    const item = items.find(i => i.types.includes('text/plain'));
    const text = item ? await (await item.getType('text/plain')).text() : '';
    return text.trim() ? { text } : null;
  };

  // Вставить прочитанное в точку p: текст — надпись, картинка — фото. Если
  // это скопированное кнопкой «Копировать» (тот же текст / картинка того же
  // размера) — оно само, со всем оформлением
  const insertPasted = async (data: Pasted, p: Point) => {
    if ('text' in data && data.text === EMPTY_CLIP_MARK) {
      if (clip) await pasteClip(p);
      return;
    }
    if ('text' in data) {
      pasteText(data.text, p);
      return;
    }
    const size = clip?.kind === 'image' && clip.size ? await pixelSize(data.file) : null;
    if (size && clip?.size && size[0] === clip.size[0] && size[1] === clip.size[1]) await pasteClip(p);
    else await addPhoto(data.file, p);
  };

  // Отказ читать буфер (не разрешили доступ, на iPhone не нажали
  // «Вставить») — решение самого человека, о нём не говорим
  const clipboardFailed = (e: unknown) => {
    if (e instanceof DOMException && e.name === 'NotAllowedError') return;
    alert('Не получилось прочитать буфер обмена');
  };

  // «+» → «Вставить» (просьба автора: вставка только так, долгое нажатие на
  // листе ничего не вставляет): из буфера обмена — общего с другими
  // приложениями, — посередине экрана; скопированное здесь — со всем
  // оформлением. Буфер не прочитать (браузер не умеет) — то, что скопировано
  // здесь
  const pasteFromMenu = async () => {
    const p = viewCenter();
    try {
      const data = await readClipboard();
      if (data) await insertPasted(data, p);
      else alert('В буфере обмена нет ни текста, ни картинки');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'NotAllowedError') return;
      if (clip) await pasteClip(p);
      else clipboardFailed(e);
    }
  };

  // Есть ли что вставить (пункт «Вставить» в «+»). На iPhone не узнать:
  // Safari на каждое чтение скопированного в другом приложении показывает
  // свою кнопку — пункт есть всегда. Где разрешение читать буфер уже дано
  // (компьютер, Android), читаем его молча: пусто — пункта нет (просьба
  // автора). Не спросить молча — пункт есть
  const clipboardMayHaveContent = async (): Promise<boolean> => {
    if (APPLE_TOUCH) return true;
    try {
      const status = await navigator.permissions.query({ name: 'clipboard-read' as PermissionName });
      if (status.state !== 'granted') return true;
      return (await readClipboard()) !== null;
    } catch {
      return true;
    }
  };

  // Изменить надпись открытого разворота. Пока ведут пальцем по палитре —
  // без записи в память (save = false), в конце — с записью
  const patchBlock = (id: string, patch: Partial<Block>, save = true) =>
    setSpreads(prev => {
      const cur = prev[spread];
      if (!cur) return prev;
      const next = { ...prev, [spread]: { ...cur, blocks: cur.blocks.map(b => (b.id === id ? { ...b, ...patch } : b)) } };
      return save ? persist(next) : next;
    });

  // Куда можно поставить надпись шириной w (текст, мир) с левым верхним углом
  // (x, y): не выше верха листа и не через корешок — целиком на той
  // странице, где её середина (на одной странице — на ней)
  const place = (w: number, x: number, y: number) => {
    const left = display === 'left' || (display === 'both' && x + w / 2 < 0);
    return { x: left ? Math.min(x, -SPINE_GAP - w) : Math.max(x, 0), y: Math.max(0, y) };
  };

  // Выделенный кусок, на который ляжет оформление с панели, — следим за
  // выделением в надписи всё время (selectionchange). Касание панели на
  // iPhone может снять выделение — такие перемены (в течение
  // TOOLBAR_GRACE_MS после касания) не считаем: кусок остаётся прежним. Поставили курсор
  // без выделения (или ушли из надписи) — оформление снова на всю надпись
  const takeRange = (fromToolbar: boolean) => {
    const b = selectedBlock;
    const el = b && blockElement(b.id);
    const range = el && document.activeElement === el ? getRange(el) : null;
    const piece = range && range.end > range.start ? range : null;
    if (!piece && fromToolbar) return;
    captured.current = piece;
    setRangeStyle(piece && b ? styleAt(runsOf(b), piece.start) : null);
  };
  const captureRange = () => {
    toolbarTouch.current = performance.now();
    takeRange(true);
  };
  useEffect(() => {
    const onSelection = () => {
      if (menuHold.current) return;
      // Выделение сменилось сразу после касания панели, а саму надпись с тех
      // пор не трогали (ни пальцем, ни клавишей) — это сделал iPhone, не человек
      const sinceToolbar = performance.now() - toolbarTouch.current;
      if (sinceToolbar < TOOLBAR_GRACE_MS && textTouch.current < toolbarTouch.current) return;
      takeRange(false);
    };
    document.addEventListener('selectionchange', onSelection);
    return () => document.removeEventListener('selectionchange', onSelection);
  });
  // Когда последний раз касались надписи, в которой печатают, или нажимали
  // в ней клавишу
  const textTouch = useRef(-Infinity);
  useEffect(() => {
    const mark = (e: Event) => {
      if (e.target instanceof Element && e.target.closest('.text-block.is-editing')) textTouch.current = performance.now();
    };
    document.addEventListener('pointerdown', mark, true);
    document.addEventListener('keydown', mark, true);
    return () => {
      document.removeEventListener('pointerdown', mark, true);
      document.removeEventListener('keydown', mark, true);
    };
  }, []);
  // Другая надпись (или никакой) — прежний кусок не в счёт; надпись, из
  // ввода которой вышли на время списка, — как после обычного ухода из неё
  // (пустая — убрать)
  useEffect(() => {
    captured.current = null;
    setRangeStyle(null);
    const held = menuHold.current;
    menuHold.current = null;
    if (held?.el.dataset.block) dropIfEmpty(held.el.dataset.block);
  }, [selected]);

  // Оформление: на выделенный кусок, а без выделения — на всю надпись (и
  // тогда у кусков это свойство снимается); 'none' — убрать. Цвет и шрифт
  // всей надписи — ещё и для следующих надписей. Пока ведут пальцем по
  // палитре — без записи (save = false)
  const restyle = (id: string, patch: Partial<Record<keyof RunStyle, string>>, save = true) => {
    const range = captured.current;
    const keys = Object.keys(patch) as (keyof RunStyle)[];
    setSpreads(prev => {
      const cur = prev[spread];
      const b = cur?.blocks.find(x => x.id === id);
      if (!cur || !b) return prev;
      let nb: Block;
      if (range) {
        nb = { ...b, runs: compactRuns(applyToRange(runsOf(b), range, patch)) };
      } else {
        const whole: Record<string, unknown> = {};
        for (const k of keys) whole[k] = patch[k] === 'none' ? undefined : patch[k];
        nb = { ...b, ...whole, runs: compactRuns(stripStyle(runsOf(b), keys)) };
      }
      const next = { ...prev, [spread]: { ...cur, blocks: cur.blocks.map(x => (x.id === id ? nb : x)) } };
      return save ? persist(next) : next;
    });
    // Выделение вернётся после того, как надпись построится заново; список
    // на панели отмечает новое оформление куска
    if (range) {
      pendingRanges.set(id, range);
      setRangeStyle(prev => {
        const next: Record<string, unknown> = { ...prev };
        for (const k of keys) next[k] = patch[k] === 'none' ? undefined : patch[k];
        return next as RunStyle;
      });
    }
    if (!save || range || !(patch.color || patch.font)) return;
    const next: TextStyle = { ...style, ...(patch as TextStyle) };
    setStyle(next);
    saveStyle(next);
  };

  const deselect = () => {
    blurActive();
    setSelected(null);
  };

  // Ручка ширины строк на рамке — только если её показали кнопкой на панели
  // (просьба автора); выбрали надпись заново — снова скрыта
  const [gripOn, setGripOn] = useState(false);
  useEffect(() => setGripOn(false), [selected]);

  // Верхняя из видимых надписей в точке мира p
  // Всё, что в точке мира p, — сверху вниз (порядок в списке — порядок слоёв)
  const blocksAt = (p: Point) => {
    const pad = TAP_PAD / camera.current.scale;
    return [...visibleBlocks].reverse().filter(b => {
      const el = blockElement(b.id);
      return el !== null && hitBlock(el, p, pad);
    });
  };
  const blockAt = (p: Point): Block | undefined => blocksAt(p)[0];

  // Фокус в поле надписи — прямо в обработчике касания, иначе iOS не покажет
  // клавиатуру. Открывая её, iOS сдвигает весь экран, если поле окажется под
  // клавиатурой, — и в нашем закреплённом (position: fixed) приложении рисует
  // курсор не там, выше текста. Поэтому строку с курсором (он в конце текста)
  // заранее, сразу поднимаем в верх экрана — лист для этого удлинён на
  // клавиатуру (typing), — а фокус ставим без прокрутки
  const focusText = (el: HTMLElement, range?: TextRange) => {
    flushSync(() => setTyping(true));
    // Клавиатура к этому времени уже открыта (её место — keyboard) или её
    // нет вовсе (компьютер) — запас больше не нужен
    setTimeout(() => setTyping(false), TYPING_RESERVE_MS);
    const limit = window.innerHeight * CARET_ZONE;
    const bottom = el.getBoundingClientRect().bottom;
    if (bottom > limit) canvas.current?.jump(0, limit - bottom);
    el.focus({ preventScroll: true });
    const end = textLength(el);
    setRange(el, range ?? { start: end, end });
  };

  // Пока открыт список на панели (шрифт, эффект, цвет…), курсора и выделения
  // в надписи нет: iOS рисует их поверх всего, и списков тоже (жалоба
  // автора). Открыли список — надпись выходит из ввода (клавиатура
  // прячется, место — спискам), закрыли той же кнопкой — снова ввод, с тем
  // же выделением. Кусок для оформления (captured) при этом не меняется
  const menuHold = useRef<{ el: HTMLElement; range: TextRange } | null>(null);
  const onToolbarMenu = (open: boolean) => {
    if (open) {
      const el = document.activeElement;
      if (menuHold.current || !isEditor(el)) return;
      const end = textLength(el);
      menuHold.current = { el, range: getRange(el) ?? { start: end, end } };
      el.blur();
      return;
    }
    const held = menuHold.current;
    menuHold.current = null;
    if (held && held.el.isConnected && selectedBlock && held.el.dataset.block === selectedBlock.id) focusText(held.el, held.range);
  };

  // Печатать в надписи
  const edit = (id: string) => {
    if (spreads[spread]?.blocks.find(b => b.id === id)?.locked) return;
    const el = blockElement(id);
    if (isEditor(el)) focusText(el);
  };

  // Касание по листу: по надписи — выбрать её (клавиатура не открывается),
  // по уже выбранной — печатать в ней; мимо надписей — снять выбор
  // Несколько слоёв в одной точке — касания выбирают их по очереди сверху
  // вниз, после нижнего — снова верхний (просьба автора); одна надпись —
  // касание по выбранной открывает клавиатуру
  const onTap = (p: Point) => {
    if (turning) return;
    const hits = blocksAt(p);
    const i = hits.findIndex(b => b.id === selected);
    if (hits.length === 0) setSelected(null);
    else if (i < 0) setSelected(hits[0].id);
    else if (hits.length > 1) setSelected(hits[(i + 1) % hits.length].id);
    else edit(hits[0].id);
  };

  // Жест на выбранной надписи двигает её: один палец — перенос, два —
  // ещё поворот и размер вокруг точки между пальцами
  const grab = (screen: Point): Grab | null => {
    const b = selectedBlock;
    const el = b && blockElement(b.id);
    if (!b || !el || turning || b.locked) return null;
    const toWorld = (q: Point): Point => {
      const c = camera.current;
      return { x: (q.x - c.x) / c.scale, y: (q.y - c.y) / c.scale };
    };
    if (!hitBlock(el, toWorld(screen), GRAB_PAD / camera.current.scale)) return null;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    // Поля вокруг текста: от (x, y) блока до угла его рамки (у фото — 0)
    const padX = b.x - el.offsetLeft;
    const padY = b.y - el.offsetTop;
    // Пока жест идёт, двигается только сам элемент (и форма стикера под ним) —
    // прямо в DOM, без перерисовки всей тетради на каждое движение пальца (на
    // iPhone их до 120 в секунду — перенос дёргался); в состояние и память —
    // один раз, в конце. И только transform, на своём слое (will-change):
    // left/top перерисовывали элемент на каждом кадре — большое повёрнутое
    // фото сильно тормозило (жалоба автора)
    const decor = el.previousElementSibling instanceof HTMLElement && el.previousElementSibling.classList.contains('text-decor') ? el.previousElementSibling : null;
    const nodes = decor ? [el, decor] : [el];
    const left0 = b.x;
    const top0 = b.y;
    let moved: Partial<Block> | null = null;
    // final — жест кончился: на место через left/top, без сдвига и слоя
    const show = (m: Pick<Block, 'x' | 'y' | 'rotate' | 'scale'>, final = false) => {
      const rotate = m.rotate ?? 0;
      const scale = m.scale ?? 1;
      const turn = rotate || scale !== 1 ? `rotate(${rotate}deg) scale(${scale})` : '';
      const dx = final ? 0 : m.x - left0;
      const dy = final ? 0 : m.y - top0;
      for (const node of nodes) {
        if (final) {
          node.style.left = `${m.x}px`;
          node.style.top = `${m.y}px`;
          node.style.willChange = '';
        } else node.style.willChange = 'transform';
        node.style.transform = dx || dy ? `translate(${dx}px, ${dy}px) ${turn}` : turn;
      }
      if (dx || dy) {
        el.dataset.dx = String(dx);
        el.dataset.dy = String(dy);
      } else {
        delete el.dataset.dx;
        delete el.dataset.dy;
      }
      // Перешла на другую страницу — и обрезаться по корешку с другой стороны
      const clip = el.parentElement;
      if (clip?.classList.contains('item-clip')) clip.dataset.clip = m.x < 0 ? 'left' : 'right';
      // По ним меряют место на листе и ставят рамку
      if (rotate) el.dataset.rotate = String(rotate);
      else delete el.dataset.rotate;
      if (scale !== 1) el.dataset.scale = String(scale);
      else delete el.dataset.scale;
      selection.current?.update();
    };
    // Надпись и пальцы (мир), когда жест начался или пальцев стало больше/меньше
    let base: { pts: Point[]; block: Block } | null = null;
    const begin = (pts: Point[]) => {
      const now = spreadsRef.current[spread]?.blocks.find(x => x.id === b.id) ?? b;
      base = { pts: pts.map(toWorld), block: { ...now, ...moved } };
    };
    return {
      begin,
      move: pts => {
        if (!base || base.pts.length !== pts.length) return begin(pts);
        const p = pts.map(toWorld);
        const b0 = base.block;
        const s0 = b0.scale ?? 1;
        const r0 = b0.rotate ?? 0;
        let scale = s0;
        let rotate = r0;
        let from = base.pts[0];
        let to = p[0];
        if (p.length === 2) {
          const [a0, c0] = base.pts;
          const [a, c] = p;
          from = midpoint(a0, c0);
          to = midpoint(a, c);
          const minScale = b.kind === 'image' ? MIN_PHOTO_SCALE : MIN_TEXT_SCALE;
          scale = Math.min(MAX_TEXT_SCALE, Math.max(minScale, (s0 * distance(a, c)) / Math.max(distance(a0, c0), 1)));
          if (Math.abs(scale - 1) < SNAP_SCALE) scale = 1;
          rotate = snapAngle(normalize(r0 + angleDeg(a, c) - angleDeg(a0, c0)));
        }
        // Середина надписи идёт за пальцами — повёрнутая и растянутая вокруг них
        const k = scale / s0;
        const t = ((rotate - r0) * Math.PI) / 180;
        const dx = b0.x - padX + w / 2 - from.x;
        const dy = b0.y - padY + h / 2 - from.y;
        const cx = to.x + k * (dx * Math.cos(t) - dy * Math.sin(t));
        const cy = to.y + k * (dx * Math.sin(t) + dy * Math.cos(t));
        const pos = place(w - 2 * padX, cx - w / 2 + padX, cy - h / 2 + padY);
        moved = { ...pos, rotate: rotate || undefined, scale: scale !== 1 ? scale : undefined };
        show({ ...pos, rotate, scale });
      },
      end: () => {
        if (moved) {
          show({ x: moved.x!, y: moved.y!, rotate: moved.rotate, scale: moved.scale }, true);
          patchBlock(b.id, moved);
        }
        moved = null;
      }
    };
  };

  const onDoubleTap = (p: Point) => {
    // По надписи двойное касание — выбрать верхнюю и печатать (касания по
    // слоям могли выбрать другую); по фото — новая надпись прямо на нём
    // (просьба автора)
    const hit = blockAt(p);
    if (turning) return;
    if (hit && hit.kind !== 'image') {
      if (document.activeElement === blockElement(hit.id)) return;
      flushSync(() => setSelected(hit.id));
      edit(hit.id);
      return;
    }
    // Выше верха текста (полоса под вырезом камеры) или за корешком одной
    // страницы не пишем — просто к началу листа
    const tapSide: Side = p.x < 0 ? 'left' : 'right';
    if (p.y < 0 || (display !== 'both' && tapSide !== display)) {
      void canvas.current?.goHome();
      return;
    }
    const block = newText(p);
    const cur = spreads[spread] ?? { blocks: [] };
    // Поле должно появиться и получить фокус прямо в обработчике касания:
    // иначе iOS не покажет клавиатуру
    flushSync(() => {
      setSpreads({ ...spreads, [spread]: { ...cur, blocks: [...cur.blocks, block] } });
      setSelected(block.id);
    });
    edit(block.id);
  };

  // Ctrl+V / ⌘V (и «Вставить» в меню поля): картинка — фото на листе (в
  // надпись её не вставить), текст вне надписи — новая надпись посередине
  // экрана; в надпись текст вставляет сам браузер
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data || turning || erased) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea')) return;
      const inText = target?.closest('[contenteditable]:not([contenteditable="false"])');
      const file = [...data.files].find(f => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        void insertPasted({ file }, viewCenter());
        return;
      }
      const text = data.getData('text/plain');
      if (inText || !text.trim()) return;
      e.preventDefault();
      pasteText(text, viewCenter());
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  });

  // Клавиатура телефона закрывает низ экрана (видимая часть —
  // visualViewport), а над ней — панель надписи: если строка, где пишут,
  // оказалась под ними, сдвигаем лист
  const keepVisible = (el: HTMLElement) => {
    const vv = window.visualViewport;
    if (!vv) return;
    const r = el.getBoundingClientRect();
    // Над панелью — ещё и кнопки отмены
    const bar = (document.querySelector('.toolbar-history') ?? document.querySelector('.text-toolbar'))?.getBoundingClientRect();
    const top = vv.offsetTop + 24;
    const bottom = Math.min(vv.offsetTop + vv.height, bar ? bar.top : Infinity) - 24;
    // У длинного текста следим за низом, но не дальше 60% видимой высоты
    const watched = Math.min(r.bottom, r.top + vv.height * 0.6);
    const dy = watched > bottom ? bottom - watched : r.top < top ? top - r.top : 0;
    if (dy) void canvas.current?.panBy(0, dy).then(() => redrawCaret(el));
  };

  // Лист сдвинулся под полем ввода — iOS может оставить курсор на старом
  // месте; то же выделение заново заставляет его перерисоваться
  const redrawCaret = (el: HTMLElement) => {
    if (document.activeElement !== el || el.dataset.composing) return;
    const range = getRange(el);
    if (range) setRange(el, range);
  };

  // Лист двигают, пока печатают: iOS рисует курсор поверх страницы сам и
  // оставляет его на месте экрана, а не у текста (сдвиг листа — только
  // transform, для iOS текст «не двигался»; спрятать курсор цветом нельзя —
  // iOS его не подхватывает). Поэтому, пока лист двигают пальцами,
  // выделения в надписи нет вовсе (нет и курсора), а когда палец отпустили —
  // то же выделение снова, и курсор встаёт у текста. Надпись за экраном —
  // выделение ждёт, пока она вернётся (иначе iOS прокрутила бы к ней экран)
  const panCaret = useRef<{ el: HTMLElement; range: TextRange } | null>(null);
  const onScreen = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const vv = window.visualViewport;
    const top = vv?.offsetTop ?? 0;
    const bottom = top + (vv?.height ?? window.innerHeight);
    return r.bottom > top && r.top < bottom && r.right > 0 && r.left < window.innerWidth;
  };
  const restoreCaret = () => {
    const saved = panCaret.current;
    if (!saved) return;
    if (document.activeElement !== saved.el) {
      panCaret.current = null;
      return;
    }
    if (!onScreen(saved.el)) return;
    panCaret.current = null;
    setRange(saved.el, saved.range);
  };
  const onPanStart = () => {
    const el = document.activeElement;
    if (!isEditor(el) || panCaret.current) return;
    const range = getRange(el);
    if (!range) return;
    panCaret.current = { el, range };
    window.getSelection()?.removeAllRanges();
  };
  // Касания у надписи, в которой печатают, — её собственные: курсор,
  // выделение, лупа и ручки выделения (они выступают за текст, поэтому, пока
  // что-то выделено, — ещё и рядом с ней). Иначе палец на ручке двигал лист
  const nativeTouch = (target: EventTarget | null, x: number, y: number) => {
    const el = document.activeElement;
    if (!isEditor(el)) return false;
    if (target instanceof Node && el.contains(target)) return true;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return false;
    const r = el.getBoundingClientRect();
    return x > r.left - HANDLE_PAD && x < r.right + HANDLE_PAD && y > r.top - HANDLE_PAD && y < r.bottom + HANDLE_PAD;
  };

  // Лист сдвинулся сам (лист вернулся в границы, поднялась строка над
  // клавиатурой): когда замер — то же выделение заново
  const caretTimer = useRef(0);
  const followCaret = () => {
    const now = document.activeElement;
    if (!isEditor(now)) return;
    // Лист двигает само приложение (строка над клавиатурой, возврат в
    // границы), а печатать при этом можно — выделение не снимаем, а ставим
    // заново на каждом кадре: курсор идёт вместе с текстом
    if (!panCaret.current && onScreen(now)) redrawCaret(now);
    clearTimeout(caretTimer.current);
    caretTimer.current = window.setTimeout(() => {
      const el = document.activeElement;
      if (!isEditor(el)) return;
      if (panCaret.current) restoreCaret();
      else if (onScreen(el)) redrawCaret(el);
    }, CARET_SETTLE_MS);
  };

  // Высота открытой клавиатуры (экранные px): на неё лист временно
  // удлиняется снизу, чтобы строку можно было поднять над клавиатурой
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => {
      // iOS всё-таки сдвинул экран под клавиатуру — возвращаем: со сдвигом он
      // рисует курсор не на месте, а строку над клавиатурой и так держит keepVisible
      const el = document.activeElement;
      if ((vv.offsetTop > 0 || window.scrollY > 0) && isEditor(el)) window.scrollTo(0, 0);
      setKeyboard(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    };
    vv.addEventListener('resize', onChange);
    vv.addEventListener('scroll', onChange);
    return () => {
      vv.removeEventListener('resize', onChange);
      vv.removeEventListener('scroll', onChange);
    };
  }, []);

  // Клавиатура открылась (лист уже удлинён) — поднимаем строку над ней
  useEffect(() => {
    const el = document.activeElement;
    if (keyboard > 0 && isEditor(el)) keepVisible(el);
  }, [keyboard]);

  useEffect(() => {
    const onLoad = () => setFontsLoaded(n => n + 1);
    document.fonts.addEventListener('loadingdone', onLoad);
    void document.fonts.ready.then(onLoad);
    return () => document.fonts.removeEventListener('loadingdone', onLoad);
  }, []);

  // Меряем написанное на видимых страницах после каждой перерисовки (правка,
  // смена страницы, загрузка шрифта). Координаты элементов внутри стороны
  // разворота — это и есть координаты мира. Подсказки на первой странице
  // не в счёт: лист растёт только от того, что написал человек
  useLayoutEffect(() => {
    let r: Rect | null = null;
    for (const el of document.querySelectorAll<HTMLElement>('.canvas-world > .page-side :is(.text-block, .item-image)')) {
      const b = blockRect(el);
      r = r
        ? { x: Math.min(r.x, b.x), y: Math.min(r.y, b.y), w: Math.max(r.x + r.w, b.x + b.w) - Math.min(r.x, b.x), h: Math.max(r.y + r.h, b.y + b.h) - Math.min(r.y, b.y) }
        : b;
    }
    setContent(prev => (JSON.stringify(prev) === JSON.stringify(r) ? prev : r));
  });

  // Рамка выбранной надписи — по надписи после каждой перерисовки (текст,
  // перенос, поворот, шрифт); при движении камеры — в onFrame
  useLayoutEffect(() => selection.current?.update());

  // Повернули телефон: одна страница ↔ разворот, и новый вид сразу с начала
  // листа в стандартном размере (полотно и само так делает при смене размера
  // экрана — здесь ещё раз, уже с новым видом). Ждём кадр: flushSync нельзя
  // звать из эффекта
  useEffect(() => {
    if (portrait === singleView) return;
    const frame = requestAnimationFrame(() => {
      flushSync(() => setSingle(portrait));
      canvas.current?.showHome();
    });
    return () => cancelAnimationFrame(frame);
  }, [portrait]);

  // Перелистывание половины листа через корешок; промис — когда лист лёг
  const turnSheet = (dir: FlipDir, from: number, to: number) => {
    const v = canvas.current!.visibleRect();
    const w = dir === 'next' ? Math.max(v.x + v.w, 100) : Math.max(-v.x, 100);
    return new Promise<void>(resolve => {
      flipDone.current = resolve;
      setFlip({ dir, from, to, sheet: { x: dir === 'next' ? 0 : -w, y: 0, w, h: v.y + v.h } });
    });
  };

  // to — на эту страницу (а не на соседнюю); keepHistory — отмена остаётся
  // и на новом развороте (вставили лист и перелистнули к нему)
  const go = async (dir: FlipDir, to?: number, keepHistory = false) => {
    const step = dir === 'next' ? 1 : -1;
    // На развороте листаем разворотами (к левой странице следующего)
    const target = to ?? (single ? page + step : 2 * (spread + step) + 1);
    if (turning || target < 1) return;
    // Поле ввода сейчас уедет вместе с листом — убираем клавиатуру и выбор
    deselect();
    const targetSpread = spreadOf(target);
    const targetHome = homeOf(single ? sideOf(target) : 'both');
    flushSync(() => {
      setTurning(true);
      setTransit(true);
    });

    if (targetSpread !== spread) {
      await canvas.current?.goHome(undefined, TURN_HOME_MS);
      await turnSheet(dir, spread, targetSpread);
      if (keepHistory) history.current.spread = targetSpread;
      flushSync(() => {
        setFlip(null);
        setPage(target);
      });
    } else {
      flushSync(() => setPage(target));
    }
    // На одной странице — вслед за листом, к началу новой страницы
    if (single) await canvas.current?.goHome(targetHome);
    savePage(source, target);
    flushSync(() => {
      setTransit(false);
      setTurning(false);
    });
  };

  // Стрелка: в дневнике — перелистнуть, на листе дня — соседний день
  const turn = (dir: FlipDir) => {
    if (dayDate === null) {
      void go(dir);
      return;
    }
    deselect();
    onDay(dir === 'next' ? 1 : -1);
  };

  // --- Настройки листа (шестерёнка в нижнем ряду) ---
  // Открыта панель страницы n (с 1)
  const [pageMenu, setPageMenu] = useState<number | null>(null);
  const lookOf = (all: Spreads, n: number): PageLook => all[spreadOf(n)]?.looks?.[sideOf(n)] ?? {};
  const logOf = (all: Spreads, n: number): LookLog => all[spreadOf(n)]?.lookLog?.[sideOf(n)] ?? { past: [], future: [] };

  // Новое оформление страницы n — в запись, а прежнее (то, что записано, а
  // не показано, пока ведут по палитре) — в историю страницы
  const lookChanged = (all: Spreads, n: number, look: PageLook): Spreads => {
    const before = lookOf(saved.current!.spreads, n);
    if (sameLook(before, look)) return withLook(all, spreadOf(n), sideOf(n), look);
    const past = [...logOf(saved.current!.spreads, n).past, cleanLook(before)].slice(-LOOK_LOG_SIZE);
    return withLook(all, spreadOf(n), sideOf(n), look, { past, future: [] });
  };

  // Цвет бумаги или надписей страницы n: пока палец на палитре — только на
  // экране, отпустили — в запись и историю страницы
  const setLook = (n: number, patch: PageLook, final: boolean) =>
    setSpreads(prev => {
      const look = { ...lookOf(prev, n), ...patch };
      return final ? persist(lookChanged(prev, n, look)) : withLook(prev, spreadOf(n), sideOf(n), look);
    });

  // Оформление как у страницы from
  const copyLook = (n: number, from: number) => commit(lookChanged(spreads, n, lookOf(spreads, from)));

  // «Отменить» / «Вернуть» в настройках листа — только оформление этой
  // страницы, по её собственной истории (просьба автора)
  const lookUndo = (n: number) => {
    const log = logOf(spreads, n);
    const prev = log.past.at(-1);
    if (!prev) return;
    commit(withLook(spreads, spreadOf(n), sideOf(n), prev, { past: log.past.slice(0, -1), future: [...log.future, cleanLook(lookOf(spreads, n))] }));
  };
  const lookRedo = (n: number) => {
    const log = logOf(spreads, n);
    const next = log.future.at(-1);
    if (!next) return;
    commit(withLook(spreads, spreadOf(n), sideOf(n), next, { past: [...log.past, cleanLook(lookOf(spreads, n))], future: log.future.slice(0, -1) }));
  };

  // Убрать со страницы всё (оформление остаётся)
  const clearPage = (n: number) => {
    const s = spreadOf(n);
    const cur = spreads[s];
    if (!cur) return;
    const sp = { ...cur, blocks: cur.blocks.filter(b => sideOfBlock(b) !== sideOf(n)) };
    const next = { ...spreads, [s]: sp };
    if (!isKept(sp)) delete next[s];
    commit(next);
  };

  // Удалить страницу: следующие сдвигаются на её место (открыта остаётся
  // та же по номеру — теперь на ней следующая)
  const deletePage = (n: number) => {
    const pages = toPages(spreads);
    if (n > pages.length) return;
    pages.splice(n - 1, 1);
    commit(fromPages(pages), '', false);
  };

  // Экспорт страницы n картинкой: её копия — за экраном, без шестерёнки,
  // рамки и панелей (только бумага, номер, дата и то, что на ней). Размер —
  // лист в начале (экран) или больше, если лист вырос
  const [exporting, setExporting] = useState<number | null>(null);
  const exportNode = useRef<HTMLDivElement>(null);
  const exportPage = async (n: number): Promise<File> => {
    flushSync(() => setExporting(n));
    try {
      const node = exportNode.current!;
      await document.fonts.ready;
      await imagesLoaded(node);
      const sd = sideOf(n);
      let x0 = sd === 'left' ? -PAGE_WIDTH : 0;
      let x1 = sd === 'left' ? 0 : PAGE_WIDTH;
      let bottom = (window.innerHeight * PAGE_WIDTH * (single ? 1 : 2)) / window.innerWidth;
      for (const el of node.querySelectorAll<HTMLElement>(':is(.text-block, .item-image)')) {
        const r = blockRect(el);
        if (sd === 'left') x0 = Math.min(x0, r.x - EXPORT_MARGIN);
        else x1 = Math.max(x1, r.x + r.w + EXPORT_MARGIN);
        bottom = Math.max(bottom, r.y + r.h + EXPORT_MARGIN);
      }
      const w = Math.ceil(x1 - x0);
      const h = Math.ceil(bottom);
      node.style.width = `${w}px`;
      node.style.height = `${h}px`;
      (node.firstElementChild as HTMLElement).style.left = `${-x0}px`;
      const blob = await pageImage(node, w, h);
      return new File([blob], dayDate ? `${dayDate}.png` : `Лист ${n}.png`, { type: 'image/png' });
    } finally {
      setExporting(null);
    }
  };

  // Пустая страница после n (следующие сдвигаются дальше) — и к ней
  const insertPageAfter = (n: number) => {
    const pages = toPages(spreads);
    if (n < pages.length) {
      pages.splice(n, 0, { blocks: [] });
      commit(fromPages(pages), '', false);
    }
    void go('next', n + 1, true);
  };

  // Стрелки и PageUp/PageDown на клавиатуре, когда не печатаем; Ctrl/⌘+Z —
  // отменить, Ctrl/⌘+Shift+Z и Ctrl+Y — вернуть (в надписи — её собственные)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('textarea, input, [contenteditable]:not([contenteditable="false"])')) return;
      if ((e.ctrlKey || e.metaKey) && (e.code === 'KeyZ' || e.code === 'KeyY')) {
        e.preventDefault();
        if (turning) return;
        if (e.code === 'KeyY' || e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') turn('next');
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // «Отменить» / «Вернуть»: в нижнем ряду, а пока открыта панель надписи
  // или фото — над ней (просьба автора: видны и при редактировании)
  const historyButtons = (
    <>
      <button type="button" className="round-button" aria-label="Отменить" disabled={history.current.past.length === 0} onClick={undo}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
      </button>
      <button type="button" className="round-button" aria-label="Вернуть" disabled={history.current.future.length === 0} onClick={redo}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
        </svg>
      </button>
    </>
  );

  // Ручка ширины на рамке надписи или стикера (просьба автора: вставленное
  // длинное предложение растягивалось на весь лист и уже его было не
  // сделать): тянут — меняется ширина строк, текст переносится. Пока тянут
  // — только в DOM (max-width), в конце — в запись (width; отменяется)
  const resizeFrom = useRef<number | null>(null);
  const resizeWidth = (dx: number, dy: number, phase: 'start' | 'move' | 'end') => {
    const b = selectedBlock;
    const el = b && blockElement(b.id);
    if (!b || !el) return;
    const pad = 2 * (b.kind === 'sticker' ? STICKER_PAD_X : BLEED_X);
    if (phase === 'start') {
      resizeFrom.current = el.offsetWidth - pad;
      return;
    }
    if (resizeFrom.current === null) return;
    // Сдвиг пальца — вдоль строк надписи (она может быть повёрнута), в px мира
    const a = ((b.rotate ?? 0) * Math.PI) / 180;
    const along = (dx * Math.cos(a) + dy * Math.sin(a)) / (camera.current.scale * (b.scale ?? 1));
    const width = Math.round(Math.min(widthLimitOf(b), Math.max(MIN_WRAP_WIDTH, resizeFrom.current + along)));
    el.style.maxWidth = `${width + pad}px`;
    selection.current?.update();
    if (phase !== 'end') return;
    resizeFrom.current = null;
    patchBlock(b.id, { width });
  };

  // Замок на выбранной надписи, стикере или фото (просьба автора): закрытую
  // нельзя двигать, править и удалять — панель вместо кнопок пишет
  // «Закреплено». Закрыть и открыть — обычное действие (его можно отменить)
  const toggleLock = () => {
    const b = selectedBlock;
    if (!b) return;
    if (!b.locked) blurActive();
    patchBlock(b.id, { locked: b.locked ? undefined : true });
  };

  // Ряд над панелью надписи или фото: слева отмена и возврат, справа — замок
  // и «Копировать» (галочка — скопировано)
  const toolbarTop = (
    <>
      <div>{historyButtons}</div>
      <div>
        <button
          type="button"
          className={selectedBlock?.locked ? 'round-button is-locked' : 'round-button'}
          aria-label={selectedBlock?.locked ? 'Открыть замок' : 'Закрыть на замок'}
          aria-pressed={!!selectedBlock?.locked}
          onClick={toggleLock}
        >
          <LockIcon locked={!!selectedBlock?.locked} />
        </button>
        <button type="button" className="round-button" aria-label={copied ? 'Скопировано' : 'Копировать'} onClick={copySelected}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {copied ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M8.5 8.5h10v11h-10zM15.5 8.5v-4h-10v11h3" />}
          </svg>
        </button>
      </div>
    </>
  );

  // Под переворачиваемым листом со стороны, откуда листаем, — разворот, куда листаем
  const underLeft = flip?.dir === 'prev' ? flip.to : spread;
  const underRight = flip?.dir === 'next' ? flip.to : spread;

  // Сторона разворота; надписи на ней — только «картинкой», пока лист
  // перелистывается, а так они в своём слое (ниже)
  // Плашки, меню и кнопки — по цвету открытого листа (просьба автора): на
  // тёмном — тёмные (index.css: data-surface). На развороте — если тёмные
  // обе страницы
  const darkPaper = (display === 'both' ? (['left', 'right'] as const) : [side]).every(sd => isDark(spreads[spread]?.looks?.[sd]?.paper));
  useEffect(() => {
    const root = document.documentElement;
    if (darkPaper) root.dataset.surface = 'dark';
    else delete root.dataset.surface;
    return () => {
      delete root.dataset.surface;
    };
  }, [darkPaper]);

  // Строка состояния (полоса с часами и «островком» над листом) — цветом
  // открытой страницы (просьба автора). Это не часть страницы: iPhone красит
  // её по theme-color (index.html) и сам выбирает к ней тёмные или светлые
  // часы. Своего цвета нет — прежний, как у бумаги приложения
  const barColor = spreads[spread]?.looks?.[side]?.paper;
  useEffect(() => {
    if (!barColor) return;
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map(m => m.content);
    for (const m of metas) m.content = barColor;
    return () => metas.forEach((m, i) => (m.content = before[i]));
  }, [barColor]);

  const pageSide = (s: number, sd: Side) => (
    <PageSide
      spread={s}
      side={sd}
      blocks={flip ? (spreads[s]?.blocks ?? []) : []}
      date={pageDate(spreads[s], sd)}
      day={dayDate}
      look={spreads[s]?.looks?.[sd]}
    />
  );
  // Цвет бумаги — у страниц, что лежат на экране (и под переворачиваемой)
  const paperOf = (s: number, sd: Side) => spreads[s]?.looks?.[sd]?.paper;

  return (
    <>
      <Canvas
        ref={canvas}
        home={home}
        content={content}
        fixed={fixedOf(display)}
        bounded={!transit}
        // Снизу лист удлиняется только под открытую клавиатуру (и панель над
        // ней) и на миг перед тем, как она откроется; с одной панелью — нет:
        // лист не должен сдвигаться вниз (просьба автора)
        extraBottom={
          keyboard > 0
            ? keyboard + (selectedBlock ? toolbarHeight + 16 + HISTORY_ROW : 0)
            : typing
              ? Math.round(window.innerHeight * KEYBOARD_GUESS)
              : 0
        }
        locked={turning}
        background={<Paper ref={paper} display={display} left={paperOf(underLeft, 'left')} right={paperOf(underRight, 'right')} />}
        onFrame={(cam, size) => {
          const moved = cam.x !== camera.current.x || cam.y !== camera.current.y || cam.scale !== camera.current.scale;
          camera.current = cam;
          paper.current?.update(cam, size);
          selection.current?.update();
          if (moved) followCaret();
        }}
        onTap={onTap}
        onDoubleTap={onDoubleTap}
        onPanStart={onPanStart}
        onPanEnd={restoreCaret}
        nativeTouch={nativeTouch}
        // Пока печатают, лист без инерции — останавливается вместе с пальцем
        // (тогда и курсор встаёт на место сразу)
        inertia={focused === null}
        // Смахнули лист вбок — перелистнуть (стрелок нет — просьба автора),
        // если начали с той трети экрана, что ближе к странице, куда
        // листаем: дальше — с правой, назад — с левой (как берутся за край
        // страницы). Пока что-то выбрано, смахивание не листает
        onSwipe={(dir, start, width) => {
          const fromEdge = dir === 'next' ? start.x > width * (1 - TURN_EDGE) : start.x < width * TURN_EDGE;
          if (fromEdge && !turning && !selectedBlock) turn(dir);
        }}
        grab={grab}
      >
        {display !== 'right' && pageSide(underLeft, 'left')}
        {display !== 'left' && pageSide(underRight, 'right')}

        {/* Надписи видимых страниц — одним слоем (координаты мира), чтобы
            надпись, перенесённая через корешок, оставалась тем же полем ввода.
            Каждая — в обёртке, обрезающей её по корешку (item-clip) */}
        {!flip && (
          <div className="page-side page-texts">
            {visibleBlocks.map(b => (
              <div key={b.id} className="item-clip" data-clip={sideOfBlock(b)}>
                {b.kind === 'image' ? (
                  <ImageItem block={b} />
                ) : (
                  <TextBlock
                    block={b}
                    width={maxWidthOf(b)}
                    editing={focused === b.id}
                    onContent={setRuns}
                    onBlur={dropIfEmpty}
                    onFocus={(id, el) => {
                      // Снова печатают — список уже не держит надпись вне ввода
                      menuHold.current = null;
                      textBefore.current.set(id, { text: b.text, runs: b.runs });
                      setSelected(id);
                      setFocused(id);
                      setTimeout(() => keepVisible(el), 350);
                    }}
                    onInput={el => requestAnimationFrame(() => keepVisible(el))}
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {flip && (
          <PageTurn
            dir={flip.dir}
            sheet={flip.sheet}
            duration={single ? TURN_MS.single : TURN_MS.spread}
            // Линия корешка — 2 экранных px (Paper.css)
            spine={2 / camera.current.scale}
            onDone={() => {
              flipDone.current?.();
              flipDone.current = null;
            }}
            // Лицо — страница, которую листаем; оборот — та, что ляжет по
            // другую сторону корешка
            front={pageSide(flip.from, flip.dir === 'next' ? 'right' : 'left')}
            back={pageSide(flip.to, flip.dir === 'next' ? 'left' : 'right')}
            frontPaper={paperOf(flip.from, flip.dir === 'next' ? 'right' : 'left')}
            backPaper={paperOf(flip.to, flip.dir === 'next' ? 'left' : 'right')}
          />
        )}
      </Canvas>

      {erased && (
        <ConfirmDialog
          title="Удалить надпись?"
          note="Весь её текст стёрт."
          confirm="Удалить"
          cancel="Вернуть текст"
          onConfirm={() => {
            removeBlock(erased.id);
            setErased(null);
          }}
          onCancel={() => {
            patchBlock(erased.id, { text: erased.text, runs: erased.runs });
            setErased(null);
          }}
        />
      )}

      {pageMenu !== null && (
        <PageSettings
          key={pageMenu}
          page={dayDate ? null : pageMenu}
          pair={dayDate || single ? null : [2 * spread + 1, 2 * spread + 2]}
          onPage={setPageMenu}
          canUndo={logOf(spreads, pageMenu).past.length > 0}
          canRedo={logOf(spreads, pageMenu).future.length > 0}
          onUndo={() => lookUndo(pageMenu)}
          onRedo={() => lookRedo(pageMenu)}
          look={lookOf(spreads, pageMenu)}
          pages={toPages(spreads).length}
          onLook={(patch, final) => setLook(pageMenu, patch, final)}
          onCopyFrom={from => copyLook(pageMenu, from)}
          onClear={() => {
            clearPage(pageMenu);
            setPageMenu(null);
          }}
          onDelete={() => {
            deletePage(pageMenu);
            setPageMenu(null);
          }}
          onInsertAfter={() => {
            setPageMenu(null);
            insertPageAfter(pageMenu);
          }}
          onExport={() => exportPage(pageMenu)}
          onClose={() => setPageMenu(null)}
        />
      )}

      {/* Копия страницы для картинки (экспорт) — за экраном */}
      {exporting !== null && (
        <div
          ref={exportNode}
          className="page-export"
          aria-hidden="true"
          style={{ background: spreads[spreadOf(exporting)]?.looks?.[sideOf(exporting)]?.paper ?? 'var(--paper)' }}
        >
          <div className="page-export-origin">
            <PageSide
              spread={spreadOf(exporting)}
              side={sideOf(exporting)}
              blocks={spreads[spreadOf(exporting)]?.blocks ?? []}
              date={pageDate(spreads[spreadOf(exporting)], sideOf(exporting))}
              day={dayDate}
              look={spreads[spreadOf(exporting)]?.looks?.[sideOf(exporting)]}
            />
          </div>
        </div>
      )}

      {selectedBlock && (
        <>
          <Selection
            ref={selection}
            block={selectedBlock}
            camera={() => camera.current}
            onResize={gripOn && selectedBlock.kind !== 'image' && !selectedBlock.locked ? resizeWidth : undefined}
          />
          {selectedBlock.locked ? (
            <LockedToolbar history={toolbarTop} onDone={deselect} onHeight={setToolbarHeight} />
          ) : selectedBlock.kind === 'image' ? (
            <ImageToolbar
              block={selectedBlock}
              onPatch={patch => patchBlock(selectedBlock.id, patch)}
              onOpacity={(opacity, final) => patchBlock(selectedBlock.id, { opacity: opacity < 1 ? opacity : undefined }, final)}
              onLayer={dir => reorder(selectedBlock.id, dir)}
              onDelete={() => {
                removeBlock(selectedBlock.id);
                deselect();
              }}
              onDone={deselect}
              onHeight={setToolbarHeight}
              history={toolbarTop}
            />
          ) : (
            <TextToolbar
              block={selectedBlock}
              keyboard={keyboard}
              onColor={(color, final) => restyle(selectedBlock.id, { color }, final)}
              onFont={font => restyle(selectedBlock.id, { font })}
              onEffect={effect => restyle(selectedBlock.id, { effect })}
              onMarker={marker => restyle(selectedBlock.id, { marker })}
              onMarkerColor={(markerColor, final) =>
                restyle(
                  selectedBlock.id,
                  // Цвет выбрали без формы — маркер во всю высоту
                  markerOf(rangeStyle?.marker ?? selectedBlock.marker) === 'none' ? { markerColor, marker: 'highlight' } : { markerColor },
                  final
                )
              }
              onCapture={captureRange}
              rangeStyle={rangeStyle}
              history={toolbarTop}
              onMenu={onToolbarMenu}
              onSticker={(patch, save) => patchBlock(selectedBlock.id, patch, save)}
              onOpacity={(opacity, final) => patchBlock(selectedBlock.id, { opacity: opacity < 1 ? opacity : undefined }, final)}
              onLayer={dir => reorder(selectedBlock.id, dir)}
              grip={{ on: gripOn, onToggle: () => setGripOn(!gripOn) }}
              onDelete={() => {
                removeBlock(selectedBlock.id);
                deselect();
              }}
              onDone={deselect}
              onHeight={setToolbarHeight}
            />
          )}
        </>
      )}

      {/* Пока надпись выбрана, внизу — её панель: кнопки прячем */}
      {!turning && !selectedBlock && (
        <>
          {/* Ряд внизу: меню — ровно посередине экрана (просьба автора: два
              слева, два справа) */}
          <div className="bottom-center">
            {historyButtons}
            <button type="button" className="round-button" aria-label="Главное меню" onClick={onMenu}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5.5h6v6H4zM14 5.5h6v6h-6zM4 15.5h6v4H4zM14 15.5h6v4h-6z" />
              </svg>
            </button>
            {/* Лист — в стартовое положение: начало листа, обычный размер (просьба автора) */}
            <button type="button" className="round-button" aria-label="К началу листа" onClick={() => void canvas.current?.goHome()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {/* Домик (просьба автора) */}
                <path d="M3.5 11.5 12 4l8.5 7.5M6 9.5V20h4.5v-5.5h3V20H18V9.5" />
              </svg>
            </button>
            <AddMenu
              onPhoto={file => void addPhoto(file)}
              onSticker={addSticker}
              onPaste={() => window.setTimeout(() => void pasteFromMenu(), MENU_GONE_MS)}
              canPaste={clipboardMayHaveContent}
            />
          </div>
          {/* Настройки открытого листа — отдельно от ряда, в правом нижнем
              углу (просьба автора; отладка — в настройках главного меню) */}
          <button
            type="button"
            className="round-button page-settings-button"
            aria-label="Настройки листа"
            onClick={() => {
              deselect();
              setPageMenu(page);
            }}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1z" />
            </svg>
          </button>
        </>
      )}
    </>
  );
}

type PageSideProps = {
  spread: number;
  side: Side;
  // Надписи «картинкой» (пока лист перелистывается); иначе пусто
  blocks: Block[];
  // Дата страницы (pageDate); null — пустая, без даты
  date: string | null;
  // Лист дня (ГГГГ-ММ-ДД): вместо номера страницы — дата
  day: string | null;
  // Оформление страницы (настройки листа)
  look?: PageLook;
};

// Одна сторона разворота: номер страницы у корешка, дата, когда на развороте
// начали писать (на пустом — ничего: на новых листах только номер, просьба
// автора), надписи этой стороны (левая — x < 0). У листа дня вверху — его дата
function PageSide({ spread, side, blocks, date, day, look }: PageSideProps) {
  const number = 2 * spread + (side === 'left' ? 1 : 2);
  // Свой цвет номера и даты: номер — бледнее, как обычно. На тёмном листе
  // без своего цвета — светлые
  const ink = look?.labels ?? (isDark(look?.paper) ? 'color-mix(in srgb, var(--brand) 30%, #fff)' : undefined);
  const strong = ink ? { color: ink } : undefined;
  const muted = ink ? { color: `color-mix(in srgb, ${ink} 60%, transparent)` } : undefined;
  return (
    <div className="page-side">
      {day ? (
        <span className="page-day" style={strong}>
          {formatDay(day)}
        </span>
      ) : (
        <>
          <span className={`page-number page-number-${side}`} style={muted}>
            {number}
          </span>
          {date && (
            <span className={`page-date page-date-${side}`} style={strong}>
              {date}
            </span>
          )}
        </>
      )}
      <div className="item-clip" data-clip={side}>
        {blocks
          .filter(b => sideOfBlock(b) === side)
          .map(b =>
            b.kind === 'image' ? <ImageItem key={b.id} block={b} /> : <TextBlock key={b.id} block={b} width={maxWidthOf(b)} face />
          )}
      </div>
    </div>
  );
}
