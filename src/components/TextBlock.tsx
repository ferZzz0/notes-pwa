import { useLayoutEffect, useRef } from 'react';
import type { Block } from '../notes';
import './TextBlock.css';

type Props = {
  block: Block;
  // Ширина в px мира (у левой страницы — чтобы текст не заходил за корешок)
  width: number;
  // Текст «картинкой» (на листе, который переворачивается): без поля ввода
  face?: boolean;
  onText?: (id: string, text: string) => void;
  onBlur?: (id: string) => void;
  onFocus?: (el: HTMLTextAreaElement) => void;
  onInput?: (el: HTMLTextAreaElement) => void;
};

// Текст в любом месте бесконечного листа — рукописью, без рамок. Поле
// растёт вниз вместе с текстом; строки переносятся по ширине width.
export function TextBlock({ block, width, face = false, onText, onBlur, onFocus, onInput }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [block.text, width]);

  const style = { left: block.x, top: block.y, width };

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
