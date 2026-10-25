import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  loadPage,
  loadSpreads,
  localDate,
  newBlockId,
  savePage,
  saveSpreads,
  sideOf,
  spreadOf,
  type Block,
  type Spreads
} from '../notes';
import { usePortrait } from '../orientation';
import { Canvas, type CanvasHandle, type Fixed, type Home, type Point, type Rect } from './Canvas';
import { Paper, type PaperDisplay, type PaperHandle } from './Paper';
import { TextBlock } from './TextBlock';
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
// Переворачиваемый лист — из полосок, каждая чуть поворачивается
// относительно соседней: так лист изгибается, как настоящая бумага.
// Полоски немного заходят друг на друга, чтобы между ними не светились швы
const FLIP_STRIPS = 6;
const FLIP_OVERLAP = 3;

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

const blurActive = () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
};

// Раскрытая тетрадь. Разворот s (с 0) — страницы 2s+1 (слева от корешка,
// x < 0) и 2s+2 (справа). Лист сначала по экрану и растёт на экран, когда
// текст подходит к краю (Canvas). Вертикально видно одну страницу,
// горизонтально — разворот.
// Двойное касание по бумаге — написать в этом месте. Листают стрелками внизу
// экрана (или на клавиатуре): камера летит к началу листа, и половина листа
// переворачивается вокруг корешка. На одной странице к соседней странице
// того же разворота камера перелетает через корешок, а к другому развороту —
// переворот листа и перелёт вслед за ним.
export function Notebook() {
  const canvas = useRef<CanvasHandle>(null);
  const paper = useRef<PaperHandle>(null);
  const flipDone = useRef<(() => void) | null>(null);
  const [spreads, setSpreads] = useState(loadSpreads);
  // Открытая страница; на развороте — любая из двух его страниц
  const [page, setPage] = useState(loadPage);
  const portrait = usePortrait();
  // Вид меняется вслед за ориентацией, но после перелёта (см. эффект ниже)
  const [single, setSingle] = useState(portrait);
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

  const commit = (next: Spreads) => {
    setSpreads(next);
    saveSpreads(next);
  };

  const setText = (id: string, text: string) => {
    const cur = spreads[spread];
    if (!cur) return;
    const blocks = cur.blocks.map(b => (b.id === id ? { ...b, text } : b));
    commit({ ...spreads, [spread]: { created: cur.created ?? (text ? localDate() : undefined), blocks } });
  };

  // Стёртый до пустоты текст исчезает с листа
  const dropIfEmpty = (id: string) => {
    const cur = spreads[spread];
    if (!cur || cur.blocks.find(b => b.id === id)?.text) return;
    const blocks = cur.blocks.filter(b => b.id !== id);
    const next = { ...spreads };
    if (blocks.some(b => b.text)) next[spread] = { ...cur, blocks };
    else delete next[spread];
    commit(next);
  };

  const onDoubleTap = (p: Point) => {
    if (turning) return;
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
      text: ''
    };
    const cur = spreads[spread] ?? { blocks: [] };
    // Поле должно появиться и получить фокус прямо в обработчике касания:
    // иначе iOS не покажет клавиатуру
    flushSync(() => setSpreads({ ...spreads, [spread]: { ...cur, blocks: [...cur.blocks, block] } }));
    document.querySelector<HTMLTextAreaElement>(`[data-block="${block.id}"]`)?.focus();
  };

  // Клавиатура телефона закрывает низ экрана (видимая часть —
  // visualViewport): если строка, где пишут, оказалась под ней, сдвигаем лист
  const keepVisible = (el: HTMLElement) => {
    const vv = window.visualViewport;
    if (!vv) return;
    const r = el.getBoundingClientRect();
    const top = vv.offsetTop + 24;
    const bottom = vv.offsetTop + vv.height - 24;
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
    for (const el of document.querySelectorAll<HTMLElement>('.canvas-world > .page-side .text-block')) {
      const x0 = el.offsetLeft;
      const y0 = el.offsetTop;
      const x1 = x0 + el.offsetWidth;
      const y1 = y0 + el.offsetHeight;
      r = r
        ? { x: Math.min(r.x, x0), y: Math.min(r.y, y0), w: Math.max(r.x + r.w, x1) - Math.min(r.x, x0), h: Math.max(r.y + r.h, y1) - Math.min(r.y, y0) }
        : { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    setContent(prev => (JSON.stringify(prev) === JSON.stringify(r) ? prev : r));
  });

  // Повернули телефон: одна страница ↔ разворот. Ждём кадр, чтобы полотно
  // узнало новый размер экрана, и летим к началу нового вида
  useEffect(() => {
    if (portrait === single) return;
    const frame = requestAnimationFrame(async () => {
      flushSync(() => {
        setTransit(true);
        setSingle(portrait);
      });
      await canvas.current?.goHome();
      flushSync(() => setTransit(false));
    });
    return () => cancelAnimationFrame(frame);
  }, [portrait]);

  // Переворот половины листа вокруг корешка; промис — когда лист лёг
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
    // Поле ввода сейчас уедет вместе с листом — убираем клавиатуру
    blurActive();
    const targetSpread = spreadOf(target);
    const targetHome = homeOf(single ? sideOf(target) : 'both');
    flushSync(() => {
      setTurning(true);
      setTransit(true);
    });

    if (targetSpread !== spread) {
      await canvas.current?.goHome();
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
    savePage(target);
    flushSync(() => {
      setTransit(false);
      setTurning(false);
    });
  };

  // Стрелки и PageUp/PageDown на клавиатуре, когда не печатаем
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('textarea, input, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') void go('next');
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') void go('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Под переворачиваемым листом со стороны, откуда листаем, — разворот, куда листаем
  const underLeft = flip?.dir === 'prev' ? flip.to : spread;
  const underRight = flip?.dir === 'next' ? flip.to : spread;
  // Дата разворота — на правой странице; на одной левой странице — на ней
  const dateSide: Side = display === 'left' ? 'left' : 'right';

  const pageSide = (s: number, sd: Side, offsetX = 0) => (
    <PageSide
      spread={s}
      side={sd}
      blocks={spreads[s]?.blocks ?? []}
      created={spreads[s]?.created}
      showDate={sd === dateSide}
      face={flip !== null}
      offsetX={offsetX}
      onText={setText}
      onBlur={dropIfEmpty}
      onFocus={el => setTimeout(() => keepVisible(el), 350)}
      onInput={el => requestAnimationFrame(() => keepVisible(el))}
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
        extraBottom={keyboard}
        locked={turning}
        background={<Paper ref={paper} display={display} />}
        onFrame={(cam, size) => paper.current?.update(cam, size)}
        onDoubleTap={onDoubleTap}
      >
        {display !== 'right' && pageSide(underLeft, 'left')}
        {display !== 'left' && pageSide(underRight, 'right')}

        {flip && (
          <FlipSheet
            flip={flip}
            onDone={() => {
              flipDone.current?.();
              flipDone.current = null;
            }}
            // Лицо листа — половина, которую листаем; оборот — та, что ляжет
            // на другую сторону. Сдвиг переводит координаты мира в
            // координаты листа (его левый край — 0)
            front={flip.dir === 'next' ? pageSide(flip.from, 'right') : pageSide(flip.from, 'left', flip.sheet.w)}
            back={flip.dir === 'next' ? pageSide(flip.to, 'left', flip.sheet.w) : pageSide(flip.to, 'right')}
          />
        )}
      </Canvas>

      {!turning && (
        <>
          {page > (single ? 1 : 2) && (
            <button type="button" className="page-arrow page-arrow-prev" aria-label="Назад" onClick={() => void go('prev')}>
              <ArrowIcon dir="prev" />
            </button>
          )}
          <button type="button" className="page-arrow page-arrow-next" aria-label="Дальше" onClick={() => void go('next')}>
            <ArrowIcon dir="next" />
          </button>
        </>
      )}
    </>
  );
}

type FlipSheetProps = {
  flip: Flip;
  front: ReactNode;
  back: ReactNode;
  onDone: () => void;
};

// Переворачиваемый лист. Сцена — у корешка, с перспективой. Лист собран из
// полосок, вложенных друг в друга: первая (у корешка) поворачивается на 180°,
// каждая следующая — ещё чуть-чуть относительно предыдущей. Поэтому внешний
// край листа поднимается первым, а ложась, немного отстаёт — лист изгибается.
// У каждой полоски лицо и оборот — свои куски тех же страниц. На страницах
// под листом — тени: от поднимающегося листа и от опускающегося.
function FlipSheet({ flip, front, back, onDone }: FlipSheetProps) {
  const { dir, sheet } = flip;
  const strip = sheet.w / FLIP_STRIPS;

  // Полоска i: шаг — strip, ширина — чуть больше (перекрытие); кусок
  // страницы в ней задаётся сдвигом от края, поэтому перекрытие его не сбивает
  const segment = (i: number): ReactNode => (
    <div
      className="flip-seg"
      style={{ width: strip + FLIP_OVERLAP, [dir === 'next' ? 'left' : 'right']: i === 0 ? 0 : strip } as CSSProperties}
      onAnimationEnd={
        i === 0
          ? e => {
              if (e.target === e.currentTarget) onDone();
            }
          : undefined
      }
    >
      {/* Кусок страницы: вся страница, сдвинутая так, чтобы в полоску попала
          её часть. У оборота куски идут в обратном порядке */}
      <div className="flip-face flip-front">
        <div
          className={`flip-face-page flip-face-${dir === 'next' ? 'right' : 'left'}`}
          style={{ width: sheet.w, [dir === 'next' ? 'left' : 'right']: -i * strip }}
        >
          {front}
        </div>
      </div>
      <div className="flip-face flip-back">
        <div
          className={`flip-face-page flip-face-${dir === 'next' ? 'left' : 'right'}`}
          style={{ width: sheet.w, [dir === 'next' ? 'right' : 'left']: -i * strip }}
        >
          {back}
        </div>
      </div>
      {i + 1 < FLIP_STRIPS && segment(i + 1)}
    </div>
  );

  return (
    <div
      className={`flip-stage flip-${dir}`}
      style={{ height: sheet.h, perspective: `${Math.max(sheet.w, sheet.h) * 2}px` }}
    >
      <div className="flip-cast flip-cast-under" style={{ width: sheet.w }} />
      <div className="flip-cast flip-cast-dest" style={{ width: sheet.w }} />
      <div className="flip" style={{ width: sheet.w }}>
        {segment(0)}
      </div>
    </div>
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
  blocks: Block[];
  created?: string;
  showDate: boolean;
  // Сторона «картинкой» — пока лист переворачивается
  face: boolean;
  // Сдвиг координат мира (для оборота переворачиваемого листа)
  offsetX: number;
  onText: (id: string, text: string) => void;
  onBlur: (id: string) => void;
  onFocus: (el: HTMLTextAreaElement) => void;
  onInput: (el: HTMLTextAreaElement) => void;
};

// Одна сторона разворота: номер страницы у корешка, дата, тексты этой
// стороны (левая — x < 0), а на самой первой странице — подсказки
function PageSide({ spread, side, blocks, created, showDate, face, offsetX, onText, onBlur, onFocus, onInput }: PageSideProps) {
  const number = 2 * spread + (side === 'left' ? 1 : 2);
  return (
    <div className="page-side" style={offsetX ? { left: offsetX } : undefined}>
      <span className={`page-number page-number-${side}`}>{number}</span>
      {showDate && (
        <span className={`page-date page-date-${side}${created ? '' : ' page-date-empty'}`}>
          {formatDate(created ?? localDate())}
        </span>
      )}
      {spread === 0 && side === 'left' && (
        <div className="title-note">
          <h1>Мои заметки</h1>
          <p>Двойное касание по бумаге — написать в этом месте.</p>
          <p>Лист — по экрану; пишете у края — лист становится больше. Приближайте двумя пальцами.</p>
          <p>Стрелки внизу экрана — перелистнуть. Вертикально видно одну страницу, горизонтально — разворот.</p>
        </div>
      )}
      {blocks
        .filter(b => (side === 'left' ? b.x < 0 : b.x >= 0))
        .map(b => (
          <TextBlock
            key={b.id}
            block={b}
            width={side === 'left' ? Math.max(MIN_TEXT_WIDTH, Math.min(TEXT_WIDTH, -b.x - SPINE_GAP)) : TEXT_WIDTH}
            face={face}
            onText={onText}
            onBlur={onBlur}
            onFocus={onFocus}
            onInput={onInput}
          />
        ))}
    </div>
  );
}
