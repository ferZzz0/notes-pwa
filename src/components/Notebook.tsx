import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
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
  type Spreads
} from '../notes';
import { usePortrait } from '../orientation';
import type { FontId, InkId } from '../textStyle';
import { Canvas, type Camera, type CanvasHandle, type Fixed, type Home, type Point, type Rect } from './Canvas';
import { PageTurn } from './PageTurn';
import { Paper, type PaperDisplay, type PaperHandle } from './Paper';
import { Selection, type SelectionHandle } from './Selection';
import { Settings } from './Settings';
import { BLEED_X, TextBlock } from './TextBlock';
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

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

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

const blockElement = (id: string) => document.querySelector<HTMLTextAreaElement>(`.page-texts [data-block="${id}"]`);

// Раскрытая тетрадь. Разворот s (с 0) — страницы 2s+1 (слева от корешка,
// x < 0) и 2s+2 (справа). Лист сначала по экрану и растёт на экран, когда
// текст подходит к краю (Canvas). Вертикально видно одну страницу,
// горизонтально — разворот.
// Двойное касание по бумаге — написать в этом месте. Новая надпись и та,
// которой коснулись, выбраны: вокруг рамка с ручками (Selection), внизу —
// панель цвета и шрифта (TextToolbar); касание по бумаге снимает выбор.
// Листают стрелками внизу экрана (или на клавиатуре): камера летит к началу
// листа, и страница перелистывается — загибается с нижнего уголка и уходит
// через корешок (PageTurn). На одной странице
// к соседней странице того же разворота камера перелетает через корешок, а к
// другому развороту — переворот листа и перелёт вслед за ним.
export function Notebook() {
  const canvas = useRef<CanvasHandle>(null);
  const paper = useRef<PaperHandle>(null);
  const selection = useRef<SelectionHandle>(null);
  const camera = useRef<Camera>({ x: 0, y: 0, scale: 1 });
  const flipDone = useRef<(() => void) | null>(null);
  const [spreads, setSpreads] = useState(loadSpreads);
  // Выбранная надпись (рамка и панель) и та, которую сейчас печатают
  const [selected, setSelected] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  // Цвет и шрифт последней надписи — с ними начинается следующая
  const [style, setStyle] = useState(loadStyle);
  const [toolbarHeight, setToolbarHeight] = useState(0);
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
  // Надписи на видимых страницах открытого разворота
  const visibleBlocks = (spreads[spread]?.blocks ?? []).filter(
    b => display === 'both' || (display === 'left' ? b.x < 0 : b.x >= 0)
  );
  const selectedBlock = turning ? undefined : visibleBlocks.find(b => b.id === selected);

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

  // Убрать надпись с листа; разворот без текста не храним
  const removeBlock = (id: string) => {
    const cur = spreads[spread];
    if (!cur) return;
    const blocks = cur.blocks.filter(b => b.id !== id);
    const next = { ...spreads };
    if (blocks.some(b => b.text)) next[spread] = { ...cur, blocks };
    else delete next[spread];
    commit(next);
  };

  // Стёртый до пустоты текст исчезает с листа
  const dropIfEmpty = (id: string) => {
    setFocused(f => (f === id ? null : f));
    if (spreads[spread]?.blocks.find(b => b.id === id)?.text) return;
    removeBlock(id);
  };

  // Изменить надпись открытого разворота. Пока тащат ручку — без записи в
  // память (save = false), в конце — saveNow
  const patchBlock = (id: string, patch: Partial<Block>, save = true) =>
    setSpreads(prev => {
      const cur = prev[spread];
      if (!cur) return prev;
      const next = { ...prev, [spread]: { ...cur, blocks: cur.blocks.map(b => (b.id === id ? { ...b, ...patch } : b)) } };
      if (save) saveSpreads(next);
      return next;
    });

  const saveNow = () =>
    setSpreads(prev => {
      saveSpreads(prev);
      return prev;
    });

  // Перенос надписи: не выше верха листа и не через корешок — надпись целиком
  // на той странице, где её середина (на одной странице — на ней)
  const moveBlock = (id: string, x: number, y: number) => {
    const el = blockElement(id);
    const w = el ? el.offsetWidth - 2 * BLEED_X : 0;
    const left = display === 'left' || (display === 'both' && x + w / 2 < 0);
    patchBlock(id, { x: left ? Math.min(x, -SPINE_GAP - w) : Math.max(x, 0), y: Math.max(0, y) }, false);
  };

  // Цвет и шрифт — у надписи и для следующих
  const restyle = (id: string, patch: { color?: InkId; font?: FontId }) => {
    patchBlock(id, patch);
    const next = { ...style, ...patch };
    setStyle(next);
    saveStyle(next);
  };

  const deselect = () => {
    blurActive();
    setSelected(null);
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
      text: '',
      // Цвет и шрифт — как у прошлой надписи
      ...(style.color && style.color !== 'blue' ? { color: style.color } : {}),
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
    for (const el of document.querySelectorAll<HTMLElement>('.canvas-world > .page-side .text-block')) {
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

  // Повернули телефон: одна страница ↔ разворот, и новый вид сразу в полном
  // отдалении (полотно и само так делает при смене размера экрана — здесь
  // ещё раз, уже с новым видом). Ждём кадр: flushSync нельзя звать из эффекта
  useEffect(() => {
    if (portrait === single) return;
    const frame = requestAnimationFrame(() => {
      flushSync(() => setSingle(portrait));
      canvas.current?.overview();
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

  // Сторона разворота; надписи на ней — только «картинкой», пока лист
  // перелистывается, а так они в своём слое (ниже)
  const pageSide = (s: number, sd: Side) => (
    <PageSide
      spread={s}
      side={sd}
      blocks={flip ? (spreads[s]?.blocks ?? []) : []}
      created={spreads[s]?.created}
      showDate={sd === dateSide}
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
        onTap={() => setSelected(null)}
        onDoubleTap={onDoubleTap}
      >
        {display !== 'right' && pageSide(underLeft, 'left')}
        {display !== 'left' && pageSide(underRight, 'right')}

        {/* Надписи видимых страниц — одним слоем (координаты мира), чтобы
            надпись, перенесённая через корешок, оставалась тем же полем ввода */}
        {!flip && (
          <div className="page-side page-texts">
            {visibleBlocks.map(b => (
              <TextBlock
                key={b.id}
                block={b}
                width={maxWidthOf(b)}
                onText={setText}
                onBlur={dropIfEmpty}
                onFocus={(id, el) => {
                  setSelected(id);
                  setFocused(id);
                  setTimeout(() => keepVisible(el), 350);
                }}
                onInput={el => requestAnimationFrame(() => keepVisible(el))}
              />
            ))}
          </div>
        )}

        {flip && (
          <PageTurn
            dir={flip.dir}
            sheet={flip.sheet}
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

      {selectedBlock && (
        <>
          <Selection
            ref={selection}
            block={selectedBlock}
            focused={focused === selectedBlock.id}
            camera={() => camera.current}
            onMove={(x, y) => moveBlock(selectedBlock.id, x, y)}
            onTransform={(rotate, scale) =>
              patchBlock(selectedBlock.id, { rotate: rotate || undefined, scale: scale !== 1 ? scale : undefined }, false)
            }
            onEnd={saveNow}
            onEdit={() => {
              const el = blockElement(selectedBlock.id);
              if (!el) return;
              el.focus();
              el.setSelectionRange(el.value.length, el.value.length);
            }}
          />
          <TextToolbar
            block={selectedBlock}
            keyboard={keyboard}
            onColor={color => restyle(selectedBlock.id, { color })}
            onFont={font => restyle(selectedBlock.id, { font })}
            onDelete={() => {
              removeBlock(selectedBlock.id);
              deselect();
            }}
            onDone={deselect}
            onHeight={setToolbarHeight}
          />
        </>
      )}

      {/* Пока надпись выбрана, внизу — её панель: стрелки и шестерёнку прячем */}
      {!turning && !selectedBlock && (
        <>
          <Settings />
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
};

// Одна сторона разворота: номер страницы у корешка, дата, надписи этой
// стороны (левая — x < 0), а на самой первой странице — подсказки
function PageSide({ spread, side, blocks, created, showDate }: PageSideProps) {
  const number = 2 * spread + (side === 'left' ? 1 : 2);
  return (
    <div className="page-side">
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
          <p>Коснитесь надписи — её можно двигать, поворачивать, менять цвет и шрифт.</p>
          <p>Пишете у края — лист становится больше. Стрелки внизу — перелистнуть.</p>
        </div>
      )}
      {blocks
        .filter(b => (side === 'left' ? b.x < 0 : b.x >= 0))
        .map(b => (
          <TextBlock key={b.id} block={b} width={maxWidthOf(b)} face />
        ))}
    </div>
  );
}
