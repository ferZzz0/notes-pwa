import { useEffect, useRef, useState } from 'react';
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
import { loadSettings, saveSettings, type Settings } from '../settings';
import { Canvas, type CanvasHandle, type Camera, type Edges, type Home, type Point, type Rect, type Size } from './Canvas';
import { Paper, type PaperDisplay, type PaperHandle } from './Paper';
import { SettingsButton } from './SettingsButton';
import { TextBlock } from './TextBlock';
import './Notebook.css';

type FlipDir = 'next' | 'prev';
type Side = 'left' | 'right';
// Переворот листа: разворот from → to; sheet — переворачиваемая половина
// листа в координатах мира: от корешка до края экрана, от верха листа до
// низа экрана
type Flip = { dir: FlipDir; from: number; to: number; sheet: Rect };

// Начало листа. Разворот: корешок посередине, по ширине — две страницы по
// 850 px мира (как у настоящей тетради, 170 мм). Одна страница: её середина
// посередине экрана. Край листа — на 64 px ниже верха экрана при любом
// масштабе: над ним, на столе, помещается шестерёнка настроек. На узком
// экране масштаб не мельче 0.4 — чтобы текст читался.
const PAGE_WIDTH = 850;
const homeOf = (display: PaperDisplay): Home =>
  display === 'both'
    ? { x: 0, y: 0, top: 64, width: 2 * PAGE_WIDTH, minScale: 0.4 }
    : { x: display === 'left' ? -PAGE_WIDTH / 2 : PAGE_WIDTH / 2, y: 0, top: 64, width: PAGE_WIDTH + 50, minScale: 0.4 };
// У одной страницы есть край у корешка, у разворота — только верхний
const edgesOf = (display: PaperDisplay): Edges =>
  display === 'both' ? { top: 0 } : display === 'left' ? { top: 0, right: 0 } : { top: 0, left: 0 };

const TEXT_WIDTH = 640;
const MIN_TEXT_WIDTH = 200;
const SPINE_GAP = 24; // текст левой страницы не подходит к корешку ближе
// Новый текст встаёт так, чтобы точка касания пришлась на первую строку
const NEW_TEXT_OFFSET = { x: 12, y: 30 };

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

const blurActive = () => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
};

// Раскрытая тетрадь с бесконечными листами. Разворот s (с 0) — страницы
// 2s+1 (слева от корешка, x < 0) и 2s+2 (справа); бумага бесконечна вниз и
// в стороны. В настройках — разворот целиком или одна страница. Двойное
// касание по бумаге — написать в этом месте. Листают стрелками внизу экрана
// (или на клавиатуре): на развороте камера летит к началу листа, и половина
// листа переворачивается вокруг корешка. На одной странице к соседней
// странице того же разворота камера перелетает через корешок, а к другому
// развороту — переворот листа и перелёт вслед за ним.
export function Notebook() {
  const canvas = useRef<CanvasHandle>(null);
  const paper = useRef<PaperHandle>(null);
  const flipDone = useRef<(() => void) | null>(null);
  const [spreads, setSpreads] = useState(loadSpreads);
  const [settings, setSettings] = useState(loadSettings);
  // Открытая страница; на развороте — любая из двух его страниц
  const [page, setPage] = useState(loadPage);
  const [flip, setFlip] = useState<Flip | null>(null);
  const [turning, setTurning] = useState(false);
  // Во время перехода видно обе страницы, даже в режиме одной
  const [transit, setTransit] = useState(false);
  const [farFromHome, setFarFromHome] = useState(false);

  const single = settings.pages === 1;
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
    // По столу над листом или за краем одной страницы — к началу листа
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

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const el = document.activeElement;
      if (el instanceof HTMLTextAreaElement && el.classList.contains('text-block')) keepVisible(el);
    };
    vv.addEventListener('resize', onResize);
    return () => vv.removeEventListener('resize', onResize);
  }, []);

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

  // Сменили, сколько листов на экране, — летим к началу нового вида (пока
  // летим, видно обе страницы и края одной страницы не мешают камере)
  const changeSettings = async (next: Settings) => {
    if (turning) return;
    blurActive();
    saveSettings(next);
    flushSync(() => {
      setSettings(next);
      setTurning(true);
      setTransit(true);
    });
    await canvas.current?.goHome();
    flushSync(() => {
      setTransit(false);
      setTurning(false);
    });
  };

  // Кнопка «К началу листа» — когда край листа или середина начала листа
  // далеко за экраном
  const onSettle = (cam: Camera, size: Size) =>
    setFarFromHome(cam.y < -size.h * 0.5 || Math.abs(cam.x + home.x * cam.scale - size.w / 2) > size.w);

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
        edges={edgesOf(display)}
        locked={turning}
        background={<Paper ref={paper} display={display} />}
        onFrame={(cam, size) => paper.current?.update(cam, size)}
        onSettle={onSettle}
        onDoubleTap={onDoubleTap}
      >
        {display !== 'right' && pageSide(underLeft, 'left')}
        {display !== 'left' && pageSide(underRight, 'right')}

        {flip && (
          <div
            className="flip-stage"
            style={{ height: flip.sheet.h, perspective: `${Math.max(flip.sheet.w, flip.sheet.h) * 2.5}px` }}
          >
            <div
              className={`flip flip-${flip.dir}`}
              style={{ left: flip.sheet.x, width: flip.sheet.w }}
              onAnimationEnd={e => {
                if (e.target !== e.currentTarget) return;
                flipDone.current?.();
                flipDone.current = null;
              }}
            >
              {/* Лицо — половина, которую листаем; оборот — та, что ляжет на
                  другую сторону. Сдвиг переводит координаты мира в координаты
                  стороны листа (её левый край — 0) */}
              <div className={`flip-face flip-front flip-face-${flip.dir === 'next' ? 'right' : 'left'}`}>
                {flip.dir === 'next' ? pageSide(flip.from, 'right') : pageSide(flip.from, 'left', flip.sheet.w)}
              </div>
              <div className={`flip-face flip-back flip-face-${flip.dir === 'next' ? 'left' : 'right'}`}>
                {flip.dir === 'next' ? pageSide(flip.to, 'left', flip.sheet.w) : pageSide(flip.to, 'right')}
              </div>
            </div>
          </div>
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
          {farFromHome && (
            <button type="button" className="home-button" onClick={() => void canvas.current?.goHome()}>
              ↑ К началу листа
            </button>
          )}
        </>
      )}
      <SettingsButton settings={settings} onChange={next => void changeSettings(next)} />
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
          <p>Лист бесконечный: двигайте его пальцем во все стороны, приближайте двумя пальцами.</p>
          <p>Стрелки внизу экрана — перелистнуть. Шестерёнка — настройки.</p>
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
