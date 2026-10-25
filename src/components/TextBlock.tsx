import { useLayoutEffect, useRef } from 'react';
import type { Block } from '../notes';
import './TextBlock.css';

type Props = {
  block: Block;
  // Текст «картинкой» (на листе, который переворачивается): без поля ввода
  face?: boolean;
  onText?: (id: string, text: string) => void;
  onBlur?: (id: string) => void;
  onFocus?: (el: HTMLTextAreaElement) => void;
  onInput?: (el: HTMLTextAreaElement) => void;
};

// Текст в любом месте бесконечного листа — рукописью, без рамок. Поле
// растёт вниз вместе с текстом; ширина постоянная, строки переносятся.
export function TextBlock({ block, face = false, onText, onBlur, onFocus, onInput }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [block.text]);

  const style = { left: block.x, top: block.y };

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
