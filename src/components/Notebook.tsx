import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { importImage, keepImages } from '../images';
import {
  allImageIds,
  isBlank,
  loadPage,
  loadSpreads,
  loadStyle,
  localDate,
  newBlockId,
  savePage,
  saveSpreads,
  saveStyle,
  sideOf,
  spreadOf,
  type Block,
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
  type Run,
  type RunStyle,
  type TextRange
} from '../richText';
import type { StickerId } from '../textStyle';
import { AddMenu } from './AddMenu';
import { ConfirmDialog } from './ConfirmDialog';
import { Canvas, type Camera, type CanvasHandle, type Fixed, type Grab, type Home, type Point, type Rect } from './Canvas';
import { ImageItem } from './ImageItem';
import { ImageToolbar } from './ImageToolbar';
import { PageTurn } from './PageTurn';
import { Paper, type PaperDisplay, type PaperHandle } from './Paper';
import { Selection, type SelectionHandle } from './Selection';
import { Settings } from './Settings';
import { pendingRanges, TextBlock } from './TextBlock';
import { TextToolbar } from './TextToolbar';
import './Notebook.css';

type FlipDir = 'next' | 'prev';
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
// Размер надписи — от 0.4 до 4; поворот рядом с прямым углом и размер рядом
// с обычным «прилипают» к ним
const MIN_TEXT_SCALE = 0.4;
const MAX_TEXT_SCALE = 4;
const SNAP_DEG = 4;
const SNAP_SCALE = 0.06;
// Перелистывание (мс): горизонтально — быстро (просьба автора: сначала в 5 раз
// быстрее прежних 850, потом вдвое медленнее этого), вертикально
// за ним ещё летит камера к новой странице
const TURN_MS = { spread: 340, single: 850 };
// Перелёт к началу листа перед перелистыванием (если лист приближен)
const TURN_HOME_MS = 200;
// Перед тем как открыть клавиатуру, строку с курсором поднимаем не ниже этой
// доли экрана, а лист удлиняем на столько (клавиатура iPhone с полосой над
// ней — до половины экрана и больше в горизонтали)
const CARET_ZONE = 0.3;
const KEYBOARD_GUESS = 0.6;
// Столько держим этот запас — пока клавиатура открывается
const TYPING_RESERVE_MS = 1000;
// Новое фото — не шире этой доли видимой части листа и не выше этой
const PHOTO_SHARE = { w: 0.55, h: 0.6 };
// Примерный размер нового стикера (мир) — чтобы поставить его посередине экрана
const STICKER_SIZE = { w: 230, h: 210 };
// Пузырёк «Вставить» стоит над пальцем, если над ним столько места (px экрана)
const PASTE_ROOM = 90;
// iPhone и iPad (iPad представляется компьютером Mac, но с сенсорным экраном):
// читая буфер обмена, Safari сам показывает свою кнопку «Вставить», поэтому
// там вставляют системным меню (paste-layer), а не своим пузырьком
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// iPhone: столько ждём после долгого нажатия системное меню (поле под
// бумагой получает фокус); не дождались — показываем свой пузырёк
const NATIVE_MENU_WAIT = 600;
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

const blurActive = () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
};

// Наибольшая ширина строк надписи: у левой страницы — не дальше корешка
const maxWidthOf = (b: Block) => (b.x < 0 ? Math.max(MIN_TEXT_WIDTH, Math.min(TEXT_WIDTH, -b.x - SPINE_GAP)) : TEXT_WIDTH);

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
  // Печатают (или вот-вот откроется клавиатура): лист заранее удлинён снизу
  const [typing, setTyping] = useState(false);
  // Пузырёк «Вставить» после долгого нажатия: куда вставлять (мир) и где он
  // (экран)
  const [pasteMenu, setPasteMenu] = useState<{ world: Point; screen: Point } | null>(null);
  // iPhone: невидимое поле под бумагой (системное меню «Вставить» при
  // долгом нажатии) и точка этого нажатия — туда ляжет вставленное
  const pasteLayer = useRef<HTMLDivElement>(null);
  const pastePoint = useRef<Point | null>(null);
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
  // подряд, с паузами короче MERGE_MS, — одно). Возвращает то, что записано
  const persist = (next: Spreads, key = ''): Spreads => {
    const prev = saved.current!;
    const stamped = stampDates(next, prev.spreads);
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

  const commit = (next: Spreads, key?: string) => setSpreads(persist(next, key));

  // Вернуть запись из истории (отмена / возврат)
  const restore = (json: string) => {
    const next = JSON.parse(json) as Spreads;
    saved.current = { spreads: next, json };
    history.current.key = '';
    saveSpreads(source, next);
    setSpreads(next);
  };

  const undo = () => {
    deselect();
    const h = history.current;
    const prev = h.past.pop();
    if (prev === undefined) return;
    h.future.push(saved.current!.json);
    restore(prev);
  };

  const redo = () => {
    deselect();
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
    commit({ ...spreads, [spread]: { created: cur.created ?? (text ? localDate() : undefined), blocks } }, `text:${id}`);
  };

  // Убрать надпись, стикер или фото с листа (картинку фото — потом, см.
  // keepImages); пустой разворот не храним
  const removeBlock = (id: string) => {
    const cur = spreads[spread];
    if (!cur) return;
    const blocks = cur.blocks.filter(b => b.id !== id);
    const next = { ...spreads };
    if (blocks.some(b => !isBlank(b))) next[spread] = { ...cur, blocks };
    else delete next[spread];
    commit(next);
  };

  // Пустая надпись исчезает с листа (стикер остаётся). Новая, в которой так
  // ничего и не написали, — сразу; а ту, где был текст, стёрли целиком —
  // только после подтверждения (отмена возвращает текст)
  const dropIfEmpty = (id: string) => {
    setFocused(f => (f === id ? null : f));
    setTyping(false);
    const b = spreads[spread]?.blocks.find(x => x.id === id);
    if (!b || !isBlank(b)) return;
    const before = textBefore.current.get(id);
    if (before?.text) setErased({ id, ...before });
    else removeBlock(id);
  };

  // Наверх / вниз среди всего на листе: порядок в списке — порядок слоёв
  const reorder = (id: string, dir: 'up' | 'down') =>
    setSpreads(prev => {
      const cur = prev[spread];
      const b = cur?.blocks.find(x => x.id === id);
      if (!cur || !b) return prev;
      const rest = cur.blocks.filter(x => x.id !== id);
      return persist({ ...prev, [spread]: { ...cur, blocks: dir === 'up' ? [...rest, b] : [b, ...rest] } });
    });

  // Добавить на открытый разворот (стикер или фото) и выбрать
  const addBlock = (block: Block) => {
    const cur = spreads[spread] ?? { blocks: [] };
    flushSync(() => {
      commit({ ...spreads, [spread]: { created: cur.created ?? localDate(), blocks: [...cur.blocks, block] } });
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
  const newText = (p: Point, text = ''): Block => ({
    id: newBlockId(),
    x: p.x < 0 ? Math.min(p.x - NEW_TEXT_OFFSET.x, -MIN_TEXT_WIDTH - SPINE_GAP) : Math.max(p.x - NEW_TEXT_OFFSET.x, 0),
    y: Math.max(0, p.y - NEW_TEXT_OFFSET.y),
    text,
    ...(style.color ? { color: style.color } : {}),
    ...(style.font && style.font !== 'hand' ? { font: style.font } : {})
  });

  // Вставленный текст — новая выбранная надпись в точке p
  const pasteText = (text: string, p: Point) => {
    const t = text.replace(/\r\n?/g, '\n');
    if (!t.trim()) {
      alert('В буфере обмена нет ни текста, ни картинки');
      return;
    }
    addBlock(newText(p, t));
  };

  // «Вставить» из своего пузырька: картинка из буфера обмена — фото, текст —
  // надпись, в точку нажатия p. Буфер читаем прямо в нажатии на кнопку —
  // иначе браузер не даст; iOS ещё покажет свою кнопку «Вставить», если
  // скопировано не здесь
  const pasteAt = async (p: Point) => {
    setPasteMenu(null);
    const clip = navigator.clipboard;
    try {
      if (typeof clip.read !== 'function') {
        pasteText(await clip.readText(), p);
        return;
      }
      const items = await clip.read();
      for (const item of items) {
        const type = item.types.find(t => t.startsWith('image/'));
        if (type) {
          await addPhoto(new File([await item.getType(type)], 'clipboard', { type }), p);
          return;
        }
      }
      const item = items.find(i => i.types.includes('text/plain'));
      pasteText(item ? await (await item.getType('text/plain')).text() : '', p);
    } catch (e) {
      // Отказ (не разрешили доступ, на iPhone не нажали «Вставить») — это
      // решение самого человека, о нём не говорим
      if (e instanceof DOMException && e.name === 'NotAllowedError') return;
      alert('Не получилось прочитать буфер обмена');
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

  // Запомнить выделение в выбранной надписи (в начале нажатия на панель)
  const captureRange = () => {
    const el = selectedBlock && blockElement(selectedBlock.id);
    const range = el ? getRange(el) : null;
    captured.current = range && range.end > range.start ? range : null;
  };

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
    // Выделение вернётся после того, как надпись построится заново
    if (range) pendingRanges.set(id, range);
    if (!save || range || !(patch.color || patch.font)) return;
    const next: TextStyle = { ...style, ...(patch as TextStyle) };
    setStyle(next);
    saveStyle(next);
  };

  const deselect = () => {
    blurActive();
    setSelected(null);
  };

  // Верхняя из видимых надписей в точке мира p
  const blockAt = (p: Point) => {
    const pad = TAP_PAD / camera.current.scale;
    return [...visibleBlocks].reverse().find(b => {
      const el = blockElement(b.id);
      return el !== null && hitBlock(el, p, pad);
    });
  };

  // Фокус в поле надписи — прямо в обработчике касания, иначе iOS не покажет
  // клавиатуру. Открывая её, iOS сдвигает весь экран, если поле окажется под
  // клавиатурой, — и в нашем закреплённом (position: fixed) приложении рисует
  // курсор не там, выше текста. Поэтому строку с курсором (он в конце текста)
  // заранее, сразу поднимаем в верх экрана — лист для этого удлинён на
  // клавиатуру (typing), — а фокус ставим без прокрутки
  const focusText = (el: HTMLElement) => {
    flushSync(() => setTyping(true));
    // Клавиатура к этому времени уже открыта (её место — keyboard) или её
    // нет вовсе (компьютер) — запас больше не нужен
    setTimeout(() => setTyping(false), TYPING_RESERVE_MS);
    const limit = window.innerHeight * CARET_ZONE;
    const bottom = el.getBoundingClientRect().bottom;
    if (bottom > limit) canvas.current?.jump(0, limit - bottom);
    el.focus({ preventScroll: true });
    const end = textLength(el);
    setRange(el, { start: end, end });
  };

  // Печатать в надписи
  const edit = (id: string) => {
    const el = blockElement(id);
    if (isEditor(el)) focusText(el);
  };

  // Касание по листу: по надписи — выбрать её (клавиатура не открывается),
  // по уже выбранной — печатать в ней; мимо надписей — снять выбор
  const onTap = (p: Point) => {
    if (turning) return;
    const hit = blockAt(p);
    if (!hit) setSelected(null);
    else if (hit.id === selected) edit(hit.id);
    else setSelected(hit.id);
  };

  // Жест на выбранной надписи двигает её: один палец — перенос, два —
  // ещё поворот и размер вокруг точки между пальцами
  const grab = (screen: Point): Grab | null => {
    const b = selectedBlock;
    const el = b && blockElement(b.id);
    if (!b || !el || turning) return null;
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
    // один раз, в конце
    const decor = el.previousElementSibling instanceof HTMLElement && el.previousElementSibling.classList.contains('text-decor') ? el.previousElementSibling : null;
    let moved: Partial<Block> | null = null;
    const show = (m: Pick<Block, 'x' | 'y' | 'rotate' | 'scale'>) => {
      const rotate = m.rotate ?? 0;
      const scale = m.scale ?? 1;
      for (const node of decor ? [el, decor] : [el]) {
        node.style.left = `${m.x}px`;
        node.style.top = `${m.y}px`;
        node.style.transform = rotate || scale !== 1 ? `rotate(${rotate}deg) scale(${scale})` : '';
      }
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
          scale = Math.min(MAX_TEXT_SCALE, Math.max(MIN_TEXT_SCALE, (s0 * distance(a, c)) / Math.max(distance(a0, c0), 1)));
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
        if (moved) patchBlock(b.id, moved);
        moved = null;
      }
    };
  };

  const onDoubleTap = (p: Point) => {
    // По надписи двойное касание — выбрать и печатать (это сделали касания)
    if (turning || blockAt(p)) return;
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

  // Долгое нажатие на пустое место листа — пузырёк «Вставить». На iPhone
  // своего пузырька нет: палец лежит на невидимом поле под бумагой, и iOS
  // сама показывает на нём системное меню с «Вставить» (одну кнопку); если
  // меню так и не появилось (поле не получило фокус) — всё же свой пузырёк
  const onLongPress = (p: Point, screen: Point, touch: boolean) => {
    if (turning || blockAt(p)) return;
    // Поле под бумагой не трогаем — на нём сейчас откроется системное меню
    if (document.activeElement !== pasteLayer.current) blurActive();
    setSelected(null);
    if (!(IOS && touch && pasteLayer.current)) {
      setPasteMenu({ world: p, screen });
      return;
    }
    window.setTimeout(() => {
      if (document.activeElement !== pasteLayer.current) setPasteMenu({ world: p, screen });
    }, NATIVE_MENU_WAIT);
  };

  // Повернули экран — пузырёк уже не там, где нажимали
  useEffect(() => {
    if (!pasteMenu) return;
    const close = () => setPasteMenu(null);
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [pasteMenu]);

  // Ctrl+V / ⌘V (и «Вставить» в меню поля): картинка — фото на листе (в
  // надпись её не вставить), текст вне надписи — новая надпись посередине
  // экрана; в надпись текст вставляет сам браузер
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const data = e.clipboardData;
      if (!data || turning || erased) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, textarea')) return;
      // Системная «Вставить» на поле под бумагой (iPhone) — в точку долгого
      // нажатия; в само поле ничего не попадает
      const toLayer = target?.closest('[data-paste-layer]');
      const at = toLayer ? (pastePoint.current ?? undefined) : undefined;
      if (toLayer) {
        e.preventDefault();
        pasteLayer.current?.blur();
      }
      const inText = !toLayer && target?.closest('[contenteditable]:not([contenteditable="false"])');
      const file = [...data.files].find(f => f.type.startsWith('image/'));
      if (file) {
        e.preventDefault();
        void addPhoto(file, at);
        return;
      }
      const text = data.getData('text/plain');
      if (inText || !text.trim()) return;
      e.preventDefault();
      pasteText(text, at ?? viewCenter());
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
    const bar = document.querySelector('.text-toolbar')?.getBoundingClientRect();
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
    if (document.activeElement !== el) return;
    const range = getRange(el);
    if (range) setRange(el, range);
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

  const go = async (dir: FlipDir) => {
    const step = dir === 'next' ? 1 : -1;
    // На развороте листаем разворотами (к левой странице следующего)
    const target = single ? page + step : 2 * (spread + step) + 1;
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

  // Стрелки и PageUp/PageDown на клавиатуре, когда не печатаем; Ctrl/⌘+Z —
  // отменить, Ctrl/⌘+Shift+Z и Ctrl+Y — вернуть (в надписи — её собственные)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('textarea, input, [contenteditable]:not([contenteditable="false"]):not([data-paste-layer])')) return;
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

  // Под переворачиваемым листом со стороны, откуда листаем, — разворот, куда листаем
  const underLeft = flip?.dir === 'prev' ? flip.to : spread;
  const underRight = flip?.dir === 'next' ? flip.to : spread;

  // Сторона разворота; надписи на ней — только «картинкой», пока лист
  // перелистывается, а так они в своём слое (ниже)
  const pageSide = (s: number, sd: Side) => (
    <PageSide
      spread={s}
      side={sd}
      blocks={flip ? (spreads[s]?.blocks ?? []) : []}
      date={pageDate(spreads[s], sd)}
      day={dayDate}
    />
  );

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
            ? keyboard + (selectedBlock ? toolbarHeight + 16 : 0)
            : typing
              ? Math.round(window.innerHeight * KEYBOARD_GUESS)
              : 0
        }
        locked={turning}
        background={
          <>
            <Paper ref={paper} display={display} />
            {IOS && (
              // Невидимое поле под бумагой: долгое нажатие на нём — системное
              // меню iOS с «Вставить» (без клавиатуры: inputMode none);
              // остальные касания по нему Canvas считает касаниями по листу
              <div
                ref={pasteLayer}
                className="paste-layer"
                data-paste-layer
                contentEditable
                suppressContentEditableWarning
                inputMode="none"
                aria-hidden="true"
                // Точка касания — куда ляжет вставленное (iOS может забрать
                // долгое нажатие себе раньше, чем его заметит Canvas)
                onPointerDown={e => {
                  const c = camera.current;
                  pastePoint.current = { x: (e.clientX - c.x) / c.scale, y: (e.clientY - c.y) / c.scale };
                }}
                onInput={e => {
                  e.currentTarget.textContent = '';
                }}
              />
            )}
          </>
        }
        onFrame={(cam, size) => {
          camera.current = cam;
          paper.current?.update(cam, size);
          selection.current?.update();
        }}
        onTap={onTap}
        onDoubleTap={onDoubleTap}
        onLongPress={onLongPress}
        // Смахнули лист вбок — перелистнуть (стрелок нет — просьба автора);
        // пока что-то выбрано, смахивание не листает
        onSwipe={dir => {
          if (!turning && !selectedBlock && !pasteMenu) turn(dir);
        }}
        grab={grab}
      >
        {display !== 'right' && pageSide(underLeft, 'left')}
        {display !== 'left' && pageSide(underRight, 'right')}

        {/* Надписи видимых страниц — одним слоем (координаты мира), чтобы
            надпись, перенесённая через корешок, оставалась тем же полем ввода */}
        {!flip && (
          <div className="page-side page-texts">
            {visibleBlocks.map(b =>
              b.kind === 'image' ? (
                <ImageItem key={b.id} block={b} />
              ) : (
                <TextBlock
                  key={b.id}
                  block={b}
                  width={maxWidthOf(b)}
                  editing={focused === b.id}
                  onContent={setRuns}
                  onBlur={dropIfEmpty}
                  onFocus={(id, el) => {
                    textBefore.current.set(id, { text: b.text, runs: b.runs });
                    setSelected(id);
                    setFocused(id);
                    setTimeout(() => keepVisible(el), 350);
                  }}
                  onInput={el => requestAnimationFrame(() => keepVisible(el))}
                />
              )
            )}
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
          />
        )}
      </Canvas>

      {pasteMenu && (
        <>
          <div className="paste-backdrop" onPointerDown={() => setPasteMenu(null)} />
          <button
            type="button"
            // У верха экрана — под пальцем, а не над ним
            className={`paste-bubble${pasteMenu.screen.y < PASTE_ROOM ? ' is-below' : ''}`}
            style={{ left: `clamp(70px, ${pasteMenu.screen.x}px, calc(100% - 70px))`, top: pasteMenu.screen.y }}
            onClick={() => void pasteAt(pasteMenu.world)}
          >
            Вставить
          </button>
        </>
      )}

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

      {selectedBlock && (
        <>
          <Selection ref={selection} block={selectedBlock} camera={() => camera.current} />
          {selectedBlock.kind === 'image' ? (
            <ImageToolbar
              block={selectedBlock}
              onPatch={patch => patchBlock(selectedBlock.id, patch)}
              onLayer={dir => reorder(selectedBlock.id, dir)}
              onDelete={() => {
                removeBlock(selectedBlock.id);
                deselect();
              }}
              onDone={deselect}
              onHeight={setToolbarHeight}
            />
          ) : (
            <TextToolbar
              block={selectedBlock}
              keyboard={keyboard}
              onColor={(color, final) => restyle(selectedBlock.id, { color }, final)}
              onFont={font => restyle(selectedBlock.id, { font })}
              onEffect={effect => restyle(selectedBlock.id, { effect })}
              onMarker={marker => restyle(selectedBlock.id, { marker })}
              onCapture={captureRange}
              onSticker={(patch, save) => patchBlock(selectedBlock.id, patch, save)}
              onLayer={dir => reorder(selectedBlock.id, dir)}
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
          <div className="bottom-center">
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
            <button type="button" className="round-button" aria-label="Главное меню" onClick={onMenu}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5.5h6v6H4zM14 5.5h6v6h-6zM4 15.5h6v4H4zM14 15.5h6v4h-6z" />
              </svg>
            </button>
            <AddMenu onPhoto={file => void addPhoto(file)} onSticker={addSticker} />
            <Settings />
          </div>
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
};

// Одна сторона разворота: номер страницы у корешка, дата, когда на развороте
// начали писать (на пустом — ничего: на новых листах только номер, просьба
// автора), надписи этой стороны (левая — x < 0). У листа дня вверху — его дата
function PageSide({ spread, side, blocks, date, day }: PageSideProps) {
  const number = 2 * spread + (side === 'left' ? 1 : 2);
  return (
    <div className="page-side">
      {day ? (
        <span className="page-day">{formatDay(day)}</span>
      ) : (
        <>
          <span className={`page-number page-number-${side}`}>{number}</span>
          {date && <span className={`page-date page-date-${side}`}>{date}</span>}
        </>
      )}
      {blocks
        .filter(b => (side === 'left' ? b.x < 0 : b.x >= 0))
        .map(b => (
          b.kind === 'image' ? <ImageItem key={b.id} block={b} /> : <TextBlock key={b.id} block={b} width={maxWidthOf(b)} face />
        ))}
    </div>
  );
}
