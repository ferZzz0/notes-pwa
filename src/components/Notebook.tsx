import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import {
  loadSpread,
  loadSpreads,
  localDate,
  newBlockId,
  saveSpread,
  saveSpreads,
  type Block,
  type Spreads
} from '../notes';
import { Canvas, type CanvasHandle, type Camera, type Point, type Rect, type Size } from './Canvas';
import { Paper, type PaperHandle } from './Paper';
import { TextBlock } from './TextBlock';
import './Notebook.css';

type FlipDir = 'next' | 'prev';
// Переворачиваемая половина листа в координатах мира: от корешка до края
// экрана, от верха листа до низа экрана
type Flip = { dir: FlipDir; sheet: Rect };
type Side = 'left' | 'right';

// Начало листа: корешок посередине, по ширине — две страницы по 850 px мира
// (как у настоящей тетради, 170 мм), сверху видно край листа на столе. На
// узком экране масштаб не мельче 0.4 — чтобы текст читался.
const HOME = { x: 0, y: -60, width: 1700, minScale: 0.4 };
// Новый текст встаёт так, чтобы точка касания пришлась на первую строку
const NEW_TEXT_OFFSET = { x: 12, y: 30 };

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

// Раскрытая тетрадь с бесконечными листами. Разворот s (с 0) — страницы
// 2s+1 и 2s+2; у разворота бесконечная бумага вниз и в стороны от корешка
// (левая страница — x < 0). Двойное касание по бумаге — написать в этом
// месте. Листают уголками в нижних углах экрана или стрелками: камера
// летит к началу листа, и половина листа переворачивается вокруг корешка;
// под ней уже лежит разворот, куда листаем.
export function Notebook() {
  const canvas = useRef<CanvasHandle>(null);
  const paper = useRef<PaperHandle>(null);
  const [spreads, setSpreads] = useState(loadSpreads);
  const [spread, setSpread] = useState(loadSpread);
  const [flip, setFlip] = useState<Flip | null>(null);
  const [turning, setTurning] = useState(false);
  const [farFromHome, setFarFromHome] = useState(false);

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
    // По столу над листом — к началу листа
    if (p.y < 0) {
      void canvas.current?.goHome();
      return;
    }
    const block: Block = {
      id: newBlockId(),
      x: p.x - NEW_TEXT_OFFSET.x,
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

  const startFlip = async (dir: FlipDir) => {
    if (turning || (dir === 'prev' && spread === 0)) return;
    // Поле ввода сейчас уедет вместе с листом — убираем клавиатуру
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setTurning(true);
    await canvas.current?.goHome();
    const v = canvas.current!.visibleRect();
    const w = dir === 'next' ? Math.max(v.x + v.w, 100) : Math.max(-v.x, 100);
    setFlip({ dir, sheet: { x: dir === 'next' ? 0 : -w, y: 0, w, h: v.y + v.h } });
  };

  const endFlip = () => {
    if (!flip) return;
    const next = spread + (flip.dir === 'next' ? 1 : -1);
    setSpread(next);
    saveSpread(next);
    setFlip(null);
    setTurning(false);
  };

  // Стрелки и PageUp/PageDown на клавиатуре, когда не печатаем
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('textarea, input, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') void startFlip('next');
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') void startFlip('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Кнопка «К началу листа» — когда край листа или корешок далеко за экраном
  const onSettle = (cam: Camera, size: Size) =>
    setFarFromHome(cam.y < -size.h * 0.5 || Math.abs(cam.x - size.w / 2) > size.w);

  const target = flip ? spread + (flip.dir === 'next' ? 1 : -1) : spread;
  // Под переворачиваемым листом со стороны, откуда листаем, — разворот, куда листаем
  const underLeft = flip?.dir === 'prev' ? target : spread;
  const underRight = flip?.dir === 'next' ? target : spread;

  const page = (s: number, side: Side, offsetX = 0) => (
    <PageSide
      spread={s}
      side={side}
      blocks={spreads[s]?.blocks ?? []}
      created={spreads[s]?.created}
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
        home={HOME}
        locked={turning}
        background={<Paper ref={paper} />}
        onFrame={(cam, size) => paper.current?.update(cam, size)}
        onSettle={onSettle}
        onDoubleTap={onDoubleTap}
      >
        {page(underLeft, 'left')}
        {page(underRight, 'right')}

        {flip && (
          <div
            className="flip-stage"
            style={{ height: flip.sheet.h, perspective: `${Math.max(flip.sheet.w, flip.sheet.h) * 2.5}px` }}
          >
            <div
              className={`flip flip-${flip.dir}`}
              style={{ left: flip.sheet.x, width: flip.sheet.w }}
              onAnimationEnd={e => {
                if (e.target === e.currentTarget) endFlip();
              }}
            >
              {/* Лицо — половина, которую листаем; оборот — та, что ляжет на
                  другую сторону. Сдвиг переводит координаты мира в координаты
                  стороны листа (её левый край — 0) */}
              <div className={`flip-face flip-front flip-face-${flip.dir === 'next' ? 'right' : 'left'}`}>
                {flip.dir === 'next' ? page(spread, 'right') : page(spread, 'left', flip.sheet.w)}
              </div>
              <div className={`flip-face flip-back flip-face-${flip.dir === 'next' ? 'left' : 'right'}`}>
                {flip.dir === 'next' ? page(target, 'left', flip.sheet.w) : page(target, 'right')}
              </div>
            </div>
          </div>
        )}

        <span className="staple staple-top" aria-hidden="true" />
        <span className="staple staple-bottom" aria-hidden="true" />
      </Canvas>

      {!turning && (
        <>
          <button
            type="button"
            className="flip-corner flip-corner-next"
            aria-label="Следующий лист"
            onClick={() => void startFlip('next')}
          />
          {spread > 0 && (
            <button
              type="button"
              className="flip-corner flip-corner-prev"
              aria-label="Предыдущий лист"
              onClick={() => void startFlip('prev')}
            />
          )}
          {farFromHome && (
            <button type="button" className="home-button" onClick={() => void canvas.current?.goHome()}>
              ↑ К началу листа
            </button>
          )}
        </>
      )}
    </>
  );
}

type PageSideProps = {
  spread: number;
  side: Side;
  blocks: Block[];
  created?: string;
  // Сторона «картинкой» — пока лист переворачивается
  face: boolean;
  // Сдвиг координат мира (для оборота переворачиваемого листа)
  offsetX: number;
  onText: (id: string, text: string) => void;
  onBlur: (id: string) => void;
  onFocus: (el: HTMLTextAreaElement) => void;
  onInput: (el: HTMLTextAreaElement) => void;
};

// Одна сторона разворота: номер страницы у корешка, дата (справа), тексты
// этой стороны (левая — x < 0), а на самой первой странице — подсказки
function PageSide({ spread, side, blocks, created, face, offsetX, onText, onBlur, onFocus, onInput }: PageSideProps) {
  const number = 2 * spread + (side === 'left' ? 1 : 2);
  return (
    <div className="page-side" style={offsetX ? { left: offsetX } : undefined}>
      <span className={`page-number page-number-${side}`}>{number}</span>
      {side === 'right' && (
        <span className={created ? 'page-date' : 'page-date page-date-empty'}>
          {formatDate(created ?? localDate())}
        </span>
      )}
      {spread === 0 && side === 'left' && (
        <div className="title-note">
          <h1>Мои заметки</h1>
          <p>Двойное касание по бумаге — написать в этом месте.</p>
          <p>Лист бесконечный: двигайте его пальцем во все стороны, приближайте двумя пальцами.</p>
          <p>Уголок внизу экрана — перелистнуть.</p>
        </div>
      )}
      {blocks
        .filter(b => (side === 'left' ? b.x < 0 : b.x >= 0))
        .map(b => (
          <TextBlock
            key={b.id}
            block={b}
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
