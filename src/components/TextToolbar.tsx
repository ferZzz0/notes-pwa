import { useLayoutEffect, useRef, type MouseEvent } from 'react';
import type { Block } from '../notes';
import { FONTS, INKS, fontOf, inkOf, type FontId, type InkId } from '../textStyle';
import './TextToolbar.css';

type Props = {
  block: Block;
  // Высота открытой клавиатуры (экранные px): панель — над ней
  keyboard: number;
  onColor: (color: InkId) => void;
  onFont: (font: FontId) => void;
  onDelete: () => void;
  onDone: () => void;
  // Высота панели — чтобы лист можно было поднять над ней
  onHeight: (h: number) => void;
};

// Нажатие на панель не забирает фокус у поля ввода — клавиатура остаётся
const keepFocus = (e: MouseEvent) => e.preventDefault();

// Панель выбранной надписи внизу экрана (а при открытой клавиатуре — над
// ней): цвет чернил, шрифт, удалить, готово.
export function TextToolbar({ block, keyboard, onColor, onFont, onDelete, onDone, onHeight }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const color = inkOf(block.color);
  const font = fontOf(block.font);

  useLayoutEffect(() => {
    const el = ref.current!;
    const report = () => onHeight(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className="text-toolbar"
      role="toolbar"
      aria-label="Оформление надписи"
      style={keyboard > 0 ? { bottom: keyboard + 8 } : undefined}
      onMouseDown={keepFocus}
    >
      <div className="text-toolbar-group text-toolbar-inks">
        {INKS.map(ink => (
          <button
            key={ink.id}
            type="button"
            className={ink.id === color ? 'text-toolbar-ink is-active' : 'text-toolbar-ink'}
            style={{ color: ink.color }}
            aria-label={ink.label}
            aria-pressed={ink.id === color}
            onClick={() => onColor(ink.id)}
          />
        ))}
      </div>
      <div className="text-toolbar-group text-toolbar-fonts">
        {FONTS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`text-toolbar-font font-${f.id}${f.id === font ? ' is-active' : ''}`}
            aria-label={f.label}
            aria-pressed={f.id === font}
            onClick={() => onFont(f.id)}
          >
            Аа
          </button>
        ))}
      </div>
      <div className="text-toolbar-group text-toolbar-actions">
        <button type="button" className="text-toolbar-action" aria-label="Удалить надпись" onClick={onDelete}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
          </svg>
        </button>
        <button type="button" className="text-toolbar-action text-toolbar-done" aria-label="Готово" onClick={onDone}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}
