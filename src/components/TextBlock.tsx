import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react';
import type { Block } from '../notes';
import { effectOf, fontClass, inkColor, markerOf } from '../textStyle';
import './TextBlock.css';

// Поля вокруг текста (px мира): завитки рукописных букв выступают за
// границы строки, и поле ввода обрезало бы их. Блок сдвинут на эти поля
// назад (TextBlock.css), так что сам текст стоит ровно в (x, y)
export const BLEED_X = 12;
export const BLEED_Y = 6;
// Пустая надпись всё равно шириной с короткое слово — есть куда поставить курсор
const MIN_WIDTH = 140;
// Запас под курсор в конце строки
const CARET = 4;

// Ширина текста по содержимому — по невидимой копии с теми же стилями
// (у поля ввода ширина сама по тексту не подстраивается)
let mirror: HTMLDivElement | null = null;

function textWidth(text: string, className: string, maxWidth: number): number {
  if (!mirror) {
    mirror = document.createElement('div');
    mirror.setAttribute('aria-hidden', 'true');
    document.body.append(mirror);
  }
  mirror.className = `${className} text-measure`;
  mirror.style.maxWidth = `${maxWidth}px`;
  mirror.textContent = text;
  return mirror.offsetWidth;
}

type Props = {
  block: Block;
  // Наибольшая ширина строк в px мира (у левой страницы — чтобы текст не
  // заходил за корешок); короче — по тексту
  width: number;
  // Текст «картинкой» (на листе, который переворачивается): без поля ввода
  face?: boolean;
  // Надпись сейчас печатают: только тогда поле ловит касания (курсор,
  // выделение). Остальные касания — полотну: первое выбирает надпись,
  // второе открывает клавиатуру (Notebook)
  editing?: boolean;
  onText?: (id: string, text: string) => void;
  onBlur?: (id: string) => void;
  onFocus?: (id: string, el: HTMLTextAreaElement) => void;
  onInput?: (el: HTMLTextAreaElement) => void;
};

// Надпись в любом месте листа, без рамок: шириной по тексту (не шире
// width), растёт вниз вместе с ним. Цвет, шрифт, поворот и размер — из
// блока; поворачивается и растёт вокруг своей середины. Маркер и эффекты
// с тенями (свечение, тень, объём) рисует слой под полем ввода (.text-decor):
// те же буквы, только прозрачные, — поле ввода обрезало бы тени по своему
// краю, а маркер должен лежать под буквами построчно.
export function TextBlock({ block, width, face = false, editing = false, onText, onBlur, onFocus, onInput }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const decor = useRef<HTMLDivElement>(null);
  const className = `text-block ${fontClass(block.font)}`;
  const maxWidth = width + 2 * BLEED_X;
  const effect = effectOf(block.effect);
  const marker = markerOf(block.marker);
  const effectClass = effect === 'none' ? '' : ` effect-${effect}`;
  // Контур — у самих букв; остальные эффекты — в слое под ними
  const hasDecor = marker !== 'none' || (effect !== 'none' && effect !== 'outline');

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.width = `${Math.min(maxWidth, Math.max(MIN_WIDTH, textWidth(el.value, className, maxWidth) + CARET))}px`;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    if (decor.current) {
      decor.current.style.width = el.style.width;
      decor.current.style.height = el.style.height;
    }
  };

  useLayoutEffect(fit, [block.text, block.font, width, hasDecor]);

  // Размер, посчитанный до загрузки шрифта, пересчитываем: со шрифтом строки
  // переносятся иначе, и низ текста обрезался бы
  const latestFit = useRef(fit);
  latestFit.current = fit;
  useEffect(() => {
    const onLoad = () => latestFit.current();
    document.fonts.addEventListener('loadingdone', onLoad);
    void document.fonts.ready.then(onLoad);
    return () => document.fonts.removeEventListener('loadingdone', onLoad);
  }, []);

  const rotate = block.rotate ?? 0;
  const scale = block.scale ?? 1;
  // Цвет — ещё и переменной: им светятся и отбрасывают тень прозрачные буквы слоя
  // под полем
  const style = {
    left: block.x,
    top: block.y,
    '--ink-color': inkColor(block.color),
    transform: rotate || scale !== 1 ? `rotate(${rotate}deg) scale(${scale})` : undefined
  } as CSSProperties;
  // Текст с маркером: маркер — фон строчного span, по строкам
  const marked = (text: string) => (marker === 'none' ? text : <span className={`mark-${marker}`}>{text}</span>);
  // Поворот и размер — ещё и в атрибутах: по ним Notebook меряет, сколько
  // места надпись занимает на листе
  const data = { 'data-rotate': rotate || undefined, 'data-scale': scale !== 1 ? scale : undefined };

  if (face) {
    return (
      <div className={`${className}${effectClass} text-face`} style={{ ...style, maxWidth }} {...data}>
        {marked(block.text)}
      </div>
    );
  }

  return (
    <>
      {hasDecor && (
        <div
          ref={decor}
          className={`${className}${effect === 'outline' ? '' : effectClass} text-decor`}
          style={style}
          aria-hidden="true"
        >
          {marked(block.text)}
        </div>
      )}
      <textarea
        ref={ref}
        className={`${className}${effect === 'outline' ? effectClass : ''}${editing ? ' is-editing' : ''}`}
        style={style}
        data-block={block.id}
        {...data}
        rows={1}
        value={block.text}
        aria-label="Запись"
        onChange={e => {
          onText?.(block.id, e.target.value);
          onInput?.(e.target);
        }}
        onFocus={e => onFocus?.(block.id, e.currentTarget)}
        onBlur={() => onBlur?.(block.id)}
      />
    </>
  );
}
