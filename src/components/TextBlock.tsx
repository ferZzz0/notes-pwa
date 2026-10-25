import { useEffect, useLayoutEffect, useRef } from 'react';
import type { Block } from '../notes';
import './TextBlock.css';

// Поля вокруг текста (px мира): завитки рукописных букв выступают за
// границы строки, и поле ввода обрезало бы их. Блок сдвинут на эти поля
// назад (TextBlock.css), так что сам текст стоит ровно в (x, y)
const BLEED_X = 12;

type Props = {
  block: Block;
  // Ширина строк в px мира (у левой страницы — чтобы текст не заходил за корешок)
  width: number;
  // Текст «картинкой» (на листе, который переворачивается): без поля ввода
  face?: boolean;
  onText?: (id: string, text: string) => void;
  onBlur?: (id: string) => void;
  onFocus?: (el: HTMLTextAreaElement) => void;
  onInput?: (el: HTMLTextAreaElement) => void;
};

// Текст в любом месте листа — рукописью, без рамок. Поле растёт вниз
// вместе с текстом; строки переносятся по ширине width.
export function TextBlock({ block, width, face = false, onText, onBlur, onFocus, onInput }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useLayoutEffect(fit, [block.text, width]);

  // Высоту, посчитанную до загрузки рукописного шрифта, пересчитываем:
  // со шрифтом строки переносятся иначе, и низ текста обрезался бы
  useEffect(() => {
    document.fonts.addEventListener('loadingdone', fit);
    void document.fonts.ready.then(fit);
    return () => document.fonts.removeEventListener('loadingdone', fit);
  }, []);

  const style = { left: block.x, top: block.y, width: width + 2 * BLEED_X };

  if (face) {
    return (
      <div className="text-block" style={style}>
        {block.text}
      </div>
    );
  }

  return (
    <textarea
      ref={ref}
      className="text-block"
      style={style}
      data-block={block.id}
      rows={1}
      value={block.text}
      aria-label="Запись"
      onChange={e => {
        onText?.(block.id, e.target.value);
        onInput?.(e.target);
      }}
      onFocus={e => onFocus?.(e.currentTarget)}
      onBlur={() => onBlur?.(block.id)}
    />
  );
}
