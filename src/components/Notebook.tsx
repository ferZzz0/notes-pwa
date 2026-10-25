import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { deleteImage, importImage } from '../images';
import {
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
  type Spreads,
  type TextStyle
} from '../notes';
import { usePortrait } from '../orientation';
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
import { TextBlock } from './TextBlock';
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
// Новое фото — не шире этой доли видимой части листа и не выше этой
const PHOTO_SHARE = { w: 0.55, h: 0.6 };
// Примерный размер нового стикера (мир) — чтобы поставить его посередине экрана
const STICKER_SIZE = { w: 230, h: 210 };

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
  const textBefore = useRef(new Map<string, string>());
  // Надпись с текстом стёрли целиком: спрашиваем, удалить ли её
  const [erased, setErased] = useState<{ id: string; text: string } | null>(null);
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

  const commit = (next: Spreads) => {
    setSpreads(next);
    saveSpreads(source, next);
  };

  const setText = (id: string, text: string) => {
    const cur = spreads[spread];
    if (!cur) return;
    const blocks = cur.blocks.map(b => (b.id === id ? { ...b, text } : b));
    commit({ ...spreads, [spread]: { created: cur.created ?? (text ? localDate() : undefined), blocks } });
  };

  // Убрать надпись, стикер или фото с листа (у фото — и саму картинку);
  // пустой разворот не храним
  const removeBlock = (id: string) => {
    const cur = spreads[spread];
    if (!cur) return;
    const gone = cur.blocks.find(b => b.id === id);
    if (gone?.image) void deleteImage(gone.image);
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
    const b = spreads[spread]?.blocks.find(x => x.id === id);
    if (!b || !isBlank(b)) return;
    const before = textBefore.current.get(id);
    if (before) setErased({ id, text: before });
    else removeBlock(id);
  };

  // Наверх / вниз среди всего на листе: порядок в списке — порядок слоёв
  const reorder = (id: string, dir: 'up' | 'down') =>
    setSpreads(prev => {
      const cur = prev[spread];
      const b = cur?.blocks.find(x => x.id === id);
      if (!cur || !b) return prev;
      const rest = cur.blocks.filter(x => x.id !== id);
      const next = { ...prev, [spread]: { ...cur, blocks: dir === 'up' ? [...rest, b] : [b, ...rest] } };
      saveSpreads(source, next);
      return next;
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

  // Фото из галереи: уменьшаем и сохраняем (images.ts), ставим посередине
  // экрана — не шире и не выше доли видимой части листа
  const addPhoto = async (file: File) => {
    const id = newBlockId();
    let ratio: number;
    try {
      ({ ratio } = await importImage(file, id));
    } catch {
      alert('Не получилось открыть это фото');
      return;
    }
    const v = canvas.current!.visibleRect();
    const width = Math.round(Math.min(v.w * PHOTO_SHARE.w, (v.h * PHOTO_SHARE.h) / ratio));
    const c = viewCenter();
    const pos = place(width, c.x - width / 2, c.y - (width * ratio) / 2);
    addBlock({ id: newBlockId(), kind: 'image', image: id, width, ratio, ...pos, text: '' });
  };

  // Изменить надпись открытого разворота. Пока её тащат пальцами — без записи в
  // память (save = false), в конце — saveNow
  const patchBlock = (id: string, patch: Partial<Block>, save = true) =>
    setSpreads(prev => {
      const cur = prev[spread];
      if (!cur) return prev;
      const next = { ...prev, [spread]: { ...cur, blocks: cur.blocks.map(b => (b.id === id ? { ...b, ...patch } : b)) } };
      if (save) saveSpreads(source, next);
      return next;
    });

  const saveNow = () =>
    setSpreads(prev => {
      saveSpreads(source, prev);
      return prev;
    });

  // Куда можно поставить надпись шириной w (текст, мир) с левым верхним углом
  // (x, y): не выше верха листа и не через корешок — целиком на той
  // странице, где её середина (на одной странице — на ней)
  const place = (w: number, x: number, y: number) => {
    const left = display === 'left' || (display === 'both' && x + w / 2 < 0);
    return { x: left ? Math.min(x, -SPINE_GAP - w) : Math.max(x, 0), y: Math.max(0, y) };
  };

  // Цвет и шрифт — у надписи и для следующих; пока ведут пальцем по
  // палитре — без записи (save = false)
  const restyle = (id: string, patch: TextStyle, save = true) => {
    patchBlock(id, patch, save);
    if (!save) return;
    const next = { ...style, ...patch };
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

  // Печатать в надписи. Фокус — прямо в обработчике касания, иначе iOS не
  // покажет клавиатуру
  const edit = (id: string) => {
    const el = blockElement(id);
    if (!(el instanceof HTMLTextAreaElement)) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
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
    // Надпись и пальцы (мир), когда жест начался или пальцев стало больше/меньше
    let base: { pts: Point[]; block: Block } | null = null;
    const begin = (pts: Point[]) => {
      base = { pts: pts.map(toWorld), block: spreadsRef.current[spread]?.blocks.find(x => x.id === b.id) ?? b };
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
        patchBlock(b.id, { ...pos, rotate: rotate || undefined, scale: scale !== 1 ? scale : undefined }, false);
      },
      end: saveNow
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
    const block: Block = {
      id: newBlockId(),
      // Текст левой страницы не должен залезать за корешок
      x: tapSide === 'left' ? Math.min(p.x - NEW_TEXT_OFFSET.x, -MIN_TEXT_WIDTH - SPINE_GAP) : Math.max(p.x - NEW_TEXT_OFFSET.x, 0),
      y: Math.max(0, p.y - NEW_TEXT_OFFSET.y),
      text: '',
      // Цвет и шрифт — как у прошлой надписи
      ...(style.color ? { color: style.color } : {}),
      ...(style.font && style.font !== 'hand' ? { font: style.font } : {})
    };
    const cur = spreads[spread] ?? { blocks: [] };
    // Поле должно появиться и получить фокус прямо в обработчике касания:
    // иначе iOS не покажет клавиатуру
    flushSync(() => {
      setSpreads({ ...spreads, [spread]: { ...cur, blocks: [...cur.blocks, block] } });
      setSelected(block.id);
    });
    blockElement(block.id)?.focus();
  };

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
    if (watched > bottom) canvas.current?.panBy(0, bottom - watched);
    else if (r.top < top) canvas.current?.panBy(0, top - r.top);
  };

  // Высота открытой клавиатуры (экранные px): на неё лист временно
  // удлиняется снизу, чтобы строку можно было поднять над клавиатурой
  const [keyboard, setKeyboard] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => setKeyboard(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
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
    if (keyboard > 0 && el instanceof HTMLTextAreaElement && el.classList.contains('text-block')) keepVisible(el);
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

  // Стрелки и PageUp/PageDown на клавиатуре, когда не печатаем
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('textarea, input, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') turn('next');
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') turn('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Под переворачиваемым листом со стороны, откуда листаем, — разворот, куда листаем
  const underLeft = flip?.dir === 'prev' ? flip.to : spread;
  const underRight = flip?.dir === 'next' ? flip.to : spread;
  // Дата разворота — на правой странице; на одной левой странице — на ней
  const dateSide: Side = display === 'left' ? 'left' : 'right';

  // Сторона разворота; надписи на ней — только «картинкой», пока лист
  // перелистывается, а так они в своём слое (ниже)
  const pageSide = (s: number, sd: Side) => (
    <PageSide
      spread={s}
      side={sd}
      blocks={flip ? (spreads[s]?.blocks ?? []) : []}
      created={spreads[s]?.created}
      showDate={sd === dateSide}
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
        extraBottom={keyboard + (selectedBlock ? toolbarHeight + 16 : 0)}
        locked={turning}
        background={<Paper ref={paper} display={display} />}
        onFrame={(cam, size) => {
          camera.current = cam;
          paper.current?.update(cam, size);
          selection.current?.update();
        }}
        onTap={onTap}
        onDoubleTap={onDoubleTap}
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
                  onText={setText}
                  onBlur={dropIfEmpty}
                  onFocus={(id, el) => {
                    textBefore.current.set(id, b.text);
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
            patchBlock(erased.id, { text: erased.text });
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
              onEffect={effect => patchBlock(selectedBlock.id, { effect: effect === 'none' ? undefined : effect })}
              onMarker={marker => patchBlock(selectedBlock.id, { marker: marker === 'none' ? undefined : marker })}
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

      {/* Пока надпись выбрана, внизу — её панель: стрелки и кнопки прячем */}
      {!turning && !selectedBlock && (
        <>
          <div className="bottom-center">
            <button type="button" className="round-button" aria-label="Главное меню" onClick={onMenu}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 5.5h6v6H4zM14 5.5h6v6h-6zM4 15.5h6v4H4zM14 15.5h6v4h-6z" />
              </svg>
            </button>
            <AddMenu onPhoto={file => void addPhoto(file)} onSticker={addSticker} />
            <Settings />
          </div>
          {(dayDate !== null || page > (single ? 1 : 2)) && (
            <button
              type="button"
              className="page-arrow page-arrow-prev"
              aria-label={dayDate ? 'Предыдущий день' : 'Назад'}
              onClick={() => turn('prev')}
            >
              <ArrowIcon dir="prev" />
            </button>
          )}
          <button
            type="button"
            className="page-arrow page-arrow-next"
            aria-label={dayDate ? 'Следующий день' : 'Дальше'}
            onClick={() => turn('next')}
          >
            <ArrowIcon dir="next" />
          </button>
        </>
      )}
    </>
  );
}

function ArrowIcon({ dir }: { dir: FlipDir }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={dir === 'next' ? 'M9 5l7 7-7 7' : 'M15 5l-7 7 7 7'} />
    </svg>
  );
}

type PageSideProps = {
  spread: number;
  side: Side;
  // Надписи «картинкой» (пока лист перелистывается); иначе пусто
  blocks: Block[];
  created?: string;
  showDate: boolean;
  // Лист дня (ГГГГ-ММ-ДД): вместо номера страницы — дата
  day: string | null;
};

// Одна сторона разворота: номер страницы у корешка, дата, когда на развороте
// начали писать (на пустом — ничего: на новых листах только номер, просьба
// автора), надписи этой стороны (левая — x < 0). У листа дня вверху — его дата
function PageSide({ spread, side, blocks, created, showDate, day }: PageSideProps) {
  const number = 2 * spread + (side === 'left' ? 1 : 2);
  return (
    <div className="page-side">
      {day ? (
        <span className="page-day">{formatDay(day)}</span>
      ) : (
        <>
          <span className={`page-number page-number-${side}`}>{number}</span>
          {showDate && created && <span className={`page-date page-date-${side}`}>{formatDate(created)}</span>}
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
