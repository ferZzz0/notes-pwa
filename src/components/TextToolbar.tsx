import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import type { Block } from '../notes';
import { FONTS, fontOf, inkColor, wheelColor, wheelPosition, type FontId } from '../textStyle';
import './TextToolbar.css';

type Props = {
  block: Block;
  // Высота открытой клавиатуры (экранные px): панель — над ней
  keyboard: number;
  // Цвет с палитры; final — палец отпустили (сохранить)
  onColor: (color: string, final: boolean) => void;
  onFont: (font: FontId) => void;
  onDelete: () => void;
  onDone: () => void;
  // Высота панели — чтобы лист можно было поднять над ней
  onHeight: (h: number) => void;
};

// Нажатие на панель не забирает фокус у поля ввода — клавиатура остаётся
const keepFocus = (e: MouseEvent) => e.preventDefault();

// Панель выбранной надписи внизу экрана (а при открытой клавиатуре — над
// ней): цвет (кнопка открывает круговую палитру), шрифт, удалить, готово.
export function TextToolbar({ block, keyboard, onColor, onFont, onDelete, onDone, onHeight }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [palette, setPalette] = useState(false);
  const font = fontOf(block.font);
  const color = inkColor(block.color);

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
      {palette && <ColorWheel color={block.color} onPick={onColor} />}
      <button
        type="button"
        className={palette ? 'text-toolbar-color is-active' : 'text-toolbar-color'}
        aria-label="Цвет"
        aria-expanded={palette}
        onClick={() => setPalette(!palette)}
      >
        <span style={{ '--color': color } as CSSProperties} />
      </button>
      <div className="text-toolbar-group">
        {FONTS.map(f => (
          <button
            key={f.id}
            type="button"
            className={`text-toolbar-font font-${f.id}${f.id === font ? ' is-active' : ''}`}
            aria-label={f.label}
            aria-pressed={f.id === font}
            onClick={() => {
              setPalette(false);
              onFont(f.id);
            }}
          >
            Аа
          </button>
        ))}
      </div>
      <div className="text-toolbar-group">
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

// Круговая палитра над панелью: по кругу — оттенок, от середины к краю — от
// чёрного к яркому (textStyle.ts: wheelColor). Цвет меняется, пока ведёшь
// пальцем; отметка — где цвет надписи сейчас.
function ColorWheel({ color, onPick }: { color?: string; onPick: (color: string, final: boolean) => void }) {
  const wheel = useRef<HTMLDivElement>(null);
  const { h, r } = wheelPosition(color);
  const a = (h * Math.PI) / 180;

  const pick = (e: PointerEvent<HTMLDivElement>, final: boolean) => {
    const rect = wheel.current!.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = e.clientX - (rect.left + radius);
    const dy = e.clientY - (rect.top + radius);
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    onPick(wheelColor(hue, Math.min(1, Math.hypot(dx, dy) / radius)), final);
  };

  return (
    <div className="color-wheel-pop">
      <div
        ref={wheel}
        className="color-wheel"
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e, false);
        }}
        onPointerMove={e => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e, false);
        }}
        onPointerUp={e => pick(e, true)}
      >
        <span
          className="color-wheel-mark"
          style={{
            left: `${50 + 50 * r * Math.cos(a)}%`,
            top: `${50 + 50 * r * Math.sin(a)}%`,
            background: inkColor(color)
          }}
        />
      </div>
    </div>
  );
}
