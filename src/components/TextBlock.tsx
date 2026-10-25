import { useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Block } from '../notes';
import {
  getRange,
  needsRebuild,
  needsSpan,
  parseRuns,
  renderRuns,
  runLook,
  runsOf,
  setRange,
  type Run,
  type TextRange
} from '../richText';
import { effectOf, fontClass, inkColor, stickerFill, stickerOf } from '../textStyle';
import './TextBlock.css';

// Поля вокруг текста (px мира): завитки рукописных букв выступают за
// границы строки. Блок сдвинут на эти поля назад (TextBlock.css), так что
// сам текст стоит ровно в (x, y)
export const BLEED_X = 12;
export const BLEED_Y = 6;
// У стикера поля шире — это сам стикер вокруг текста (TextBlock.css: .is-sticker)
const STICKER_PAD_X = 36;
// Пустая надпись всё равно шириной с короткое слово — есть куда поставить
// курсор; стикер — не меньше записки
const MIN_WIDTH = 140;
const STICKER_MIN_WIDTH = 230;

// Выделение, которое надо вернуть в надпись после того, как её содержимое
// построено заново (на выделенный кусок легло оформление) — по id
export const pendingRanges = new Map<string, TextRange>();

type Props = {
  block: Block;
  // Наибольшая ширина строк в px мира (у левой страницы — чтобы текст не
  // заходил за корешок); короче — по тексту
  width: number;
  // Текст «картинкой» (на листе, который переворачивается): не редактируется
  face?: boolean;
  // Надпись сейчас печатают: только тогда блок ловит касания (курсор,
  // выделение). Остальные касания — полотну: первое выбирает надпись,
  // второе открывает клавиатуру (Notebook)
  editing?: boolean;
  onContent?: (id: string, runs: Run[]) => void;
  onBlur?: (id: string) => void;
  onFocus?: (id: string, el: HTMLElement) => void;
  onInput?: (el: HTMLElement) => void;
};

// Надпись в любом месте листа, без рамок: шириной по тексту (не шире
// width), растёт вниз вместе с ним. Это редактируемый блок
// (contenteditable, только текст) — у кусков текста может быть своё
// оформление (richText.ts). Цвет, шрифт, эффект и маркер всей надписи — у
// блока, поворот и размер — вокруг его середины. У стикера под текстом —
// слой с его формой (.sticker-shape) такого же размера, поля вокруг текста шире.
//
// Содержимое блока React не рисует: его меняет сам браузер, пока печатают.
// Блок строится из кусков, только когда они изменились не от набора
// (оформление, отмена удаления, другая надпись) — тогда же возвращается
// курсор или выделение.
export function TextBlock({ block, width, face = false, editing = false, onContent, onBlur, onFocus, onInput }: Props) {
  const ed = useRef<HTMLDivElement>(null);
  const decor = useRef<HTMLDivElement>(null);
  // Что сейчас показано в блоке (куски и маркер надписи) — чтобы не строить заново
  const shown = useRef('');
  const composing = useRef(false);
  const sticker = block.kind === 'sticker' ? stickerOf(block.sticker) : null;
  const effect = effectOf(block.effect);
  const className = [
    'text-block',
    fontClass(block.font),
    sticker && `is-sticker sticker-${sticker}`,
    effect !== 'none' && `effect-${effect}`
  ]
    .filter(Boolean)
    .join(' ');
  const maxWidth = width + 2 * (sticker ? STICKER_PAD_X : BLEED_X);
  const minWidth = sticker ? STICKER_MIN_WIDTH : MIN_WIDTH;
  const runs = runsOf(block);
  const key = JSON.stringify([runs, block.marker ?? null]);

  // Содержимое — из кусков, если они изменились не от набора
  useLayoutEffect(() => {
    const el = ed.current;
    if (!el || key === shown.current) return;
    const focused = document.activeElement === el;
    const before = focused ? getRange(el) : null;
    shown.current = key;
    renderRuns(el, runs, block.marker);
    const range = pendingRanges.get(block.id) ?? before;
    pendingRanges.delete(block.id);
    if (focused && range) setRange(el, range);
  });

  // Форма стикера — такого же размера, как блок с текстом
  useLayoutEffect(() => {
    const el = ed.current;
    const bg = decor.current;
    if (!el || !bg) return;
    const fit = () => {
      bg.style.width = `${el.offsetWidth}px`;
      bg.style.height = `${el.offsetHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    return () => observer.disconnect();
  }, [sticker]);

  const rotate = block.rotate ?? 0;
  const scale = block.scale ?? 1;
  // Цвет — переменной: им же светятся и отбрасывают тень буквы (эффекты)
  const style = {
    left: block.x,
    top: block.y,
    maxWidth,
    minWidth,
    '--ink-color': inkColor(block.color),
    transform: rotate || scale !== 1 ? `rotate(${rotate}deg) scale(${scale})` : undefined,
    opacity: block.opacity
  } as CSSProperties;
  // Поворот и размер — ещё и в атрибутах: по ним Notebook меряет, сколько
  // места надпись занимает на листе
  const data = { 'data-rotate': rotate || undefined, 'data-scale': scale !== 1 ? scale : undefined };
  const shape = sticker && (
    <span className={`sticker-shape shape-${sticker}`} style={{ '--fill': stickerFill(block.sticker, block.fill) } as CSSProperties} />
  );

  if (face) {
    return (
      <div className={`${className} text-face`} style={style} {...data}>
        {shape}
        {runs.map((r, i) => {
          if (!needsSpan(r, block.marker)) return r.t;
          const look = runLook(r, block.marker);
          return (
            <span key={i} className={look.className} style={look.color ? ({ '--ink-color': look.color } as CSSProperties) : undefined}>
              {r.t}
            </span>
          );
        })}
      </div>
    );
  }

  // Прочитать набранное в куски; «посторонние» узлы (строки-<div>, <br>)
  // браузер вставляет на Enter — тогда построить заново, сохранив курсор
  const read = () => {
    const el = ed.current;
    if (!el || composing.current) return;
    const next = parseRuns(el);
    if (needsRebuild(el)) {
      const range = getRange(el);
      renderRuns(el, next, block.marker);
      if (range) setRange(el, range);
    }
    shown.current = JSON.stringify([next.length > 0 ? next : [], block.marker ?? null]);
    onContent?.(block.id, next);
    onInput?.(el);
  };

  return (
    <>
      {sticker && (
        <div ref={decor} className={`${className} text-decor`} style={style} aria-hidden="true">
          {shape}
        </div>
      )}
      <div
        ref={ed}
        className={editing ? `${className} is-editing` : className}
        style={style}
        data-block={block.id}
        {...data}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Запись"
        // Ошибки не подчёркиваем (просьба автора). iPhone подчёркивает ещё и
        // слова для автоисправления — его тоже выключаем
        spellCheck={false}
        autoCorrect="off"
        onInput={read}
        onCompositionStart={() => {
          composing.current = true;
        }}
        onCompositionEnd={() => {
          composing.current = false;
          read();
        }}
        onFocus={e => onFocus?.(block.id, e.currentTarget)}
        onBlur={() => onBlur?.(block.id)}
      />
    </>
  );
}
