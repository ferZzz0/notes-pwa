import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { Block } from '../notes';
import {
  EFFECTS,
  FONTS,
  MARKERS,
  STICKER_FILLS,
  STICKERS,
  effectOf,
  fontOf,
  inkColor,
  markerOf,
  stickerFill,
  stickerOf,
  wheelColor,
  wheelPosition,
  type EffectId,
  type FontId,
  type MarkerId
} from '../textStyle';
import { StickerPreview } from './AddMenu';
import './TextToolbar.css';

type Props = {
  block: Block;
  // Высота открытой клавиатуры (экранные px): панель — над ней
  keyboard: number;
  // Цвет с палитры; final — палец отпустили (сохранить)
  onColor: (color: string, final: boolean) => void;
  onFont: (font: FontId) => void;
  onEffect: (effect: EffectId) => void;
  onMarker: (marker: MarkerId) => void;
  // Стикер: форма и цвет; слой — выше всех или ниже всех на листе
  onSticker: (patch: Partial<Block>) => void;
  onLayer: (dir: 'up' | 'down') => void;
  onDelete: () => void;
  onDone: () => void;
  // Высота панели — чтобы лист можно было поднять над ней
  onHeight: (h: number) => void;
};

// Что открыто над панелью
type Menu = 'color' | 'font' | 'effect' | 'marker' | 'sticker' | 'delete' | null;

// Нажатие на панель не забирает фокус у поля ввода — клавиатура остаётся
export const keepFocus = (e: MouseEvent) => e.preventDefault();

// Над панелью и под верхом экрана — столько места оставляем
const MENU_MARGIN = 96;
const WHEEL_SIZE = 180;

// Сколько места над панелью — с открытой клавиатурой его мало
export const menuRoom = (keyboard: number) => Math.max(120, window.innerHeight - keyboard - MENU_MARGIN);

// Панель сообщает свою высоту — чтобы лист можно было поднять над ней
export function useToolbarHeight(onHeight: (h: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const report = () => onHeight(el.offsetHeight);
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

// Подтверждение удаления над панелью
export function ConfirmDelete({ what, onDelete, onCancel }: { what: string; onDelete: () => void; onCancel: () => void }) {
  return (
    <div className="toolbar-menu toolbar-confirm" role="alertdialog" aria-label={`Удалить ${what}?`}>
      <p>Удалить {what}?</p>
      <div className="toolbar-confirm-actions">
        <button type="button" className="toolbar-confirm-delete" onClick={onDelete}>
          Удалить
        </button>
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
      </div>
    </div>
  );
}

// Наверх / вниз среди всего на листе
export function LayerButtons({ onLayer }: { onLayer: (dir: 'up' | 'down') => void }) {
  return (
    <div className="toolbar-layer">
      <button type="button" onClick={() => onLayer('up')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 20V8M6.5 13.5L12 8l5.5 5.5M5 4h14" />
        </svg>
        Наверх
      </button>
      <button type="button" onClick={() => onLayer('down')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4v12M6.5 10.5L12 16l5.5-5.5M5 20h14" />
        </svg>
        Вниз
      </button>
    </div>
  );
}

// Панель выбранной надписи или стикера внизу экрана (а при открытой
// клавиатуре — над ней): цвет текста (круговая палитра), шрифт и эффект
// (выпадающие списки), маркер (готовые варианты; только у надписи с
// текстом), у стикера — его форма, цвет и слой, удалить (с подтверждением),
// готово. Списки открываются над панелью, по одному.
export function TextToolbar(props: Props) {
  const { block, keyboard, onColor, onFont, onEffect, onMarker, onSticker, onLayer, onDelete, onDone, onHeight } = props;
  const ref = useToolbarHeight(onHeight);
  const [menu, setMenu] = useState<Menu>(null);
  const font = fontOf(block.font);
  const effect = effectOf(block.effect);
  const marker = markerOf(block.marker);
  const color = inkColor(block.color);
  const isSticker = block.kind === 'sticker';
  const fill = stickerFill(block.sticker, block.fill);
  const room = menuRoom(keyboard);

  const toggle = (m: Menu) => setMenu(menu === m ? null : m);
  // Кнопка, открывающая список
  const opener = (m: Exclude<Menu, null>, label: string, content: ReactNode, className = '') => (
    <button
      type="button"
      className={`${className}${menu === m ? ' is-active' : ''}`}
      aria-label={label}
      aria-expanded={menu === m}
      onClick={() => toggle(m)}
    >
      {content}
    </button>
  );
  const inkStyle = { '--ink-color': color } as CSSProperties;

  return (
    <div
      ref={ref}
      className="text-toolbar"
      role="toolbar"
      aria-label="Оформление надписи"
      style={keyboard > 0 ? { bottom: keyboard + 8 } : undefined}
      onMouseDown={keepFocus}
    >
      {menu === 'color' && <ColorWheel color={block.color} size={Math.min(WHEEL_SIZE, room - 20)} onPick={onColor} />}

      {menu === 'font' && (
        <ul className="toolbar-menu" style={{ maxHeight: room }} role="listbox" aria-label="Шрифт">
          {FONTS.map(f => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={f.id === font}
                className={`toolbar-menu-item toolbar-menu-font${f.id === font ? ' is-active' : ''}`}
                onClick={() => {
                  setMenu(null);
                  onFont(f.id);
                }}
              >
                <span className={`font-${f.id}`}>{f.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu === 'effect' && (
        <ul className="toolbar-menu" style={{ maxHeight: room }} role="listbox" aria-label="Эффект">
          {EFFECTS.map(e => (
            <li key={e.id}>
              <button
                type="button"
                role="option"
                aria-selected={e.id === effect}
                className={`toolbar-menu-item${e.id === effect ? ' is-active' : ''}`}
                onClick={() => {
                  setMenu(null);
                  onEffect(e.id);
                }}
              >
                <span className={`toolbar-menu-preview font-${font} effect-${e.id}`} style={inkStyle}>
                  Аа
                </span>
                {e.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu === 'marker' && (
        <ul className="toolbar-menu" style={{ maxHeight: room }} role="listbox" aria-label="Маркер">
          {MARKERS.map(m => (
            <li key={m.id}>
              <button
                type="button"
                role="option"
                aria-selected={m.id === marker}
                className={`toolbar-menu-item${m.id === marker ? ' is-active' : ''}`}
                onClick={() => {
                  setMenu(null);
                  onMarker(m.id);
                }}
              >
                <span className={`toolbar-menu-preview font-${font}`} style={inkStyle}>
                  <span className={`mark-${m.id}`}>текст</span>
                </span>
                {m.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu === 'sticker' && (
        <div className="toolbar-menu toolbar-sticker" style={{ maxHeight: room }} role="dialog" aria-label="Стикер">
          <div className="toolbar-sticker-shapes">
            {STICKERS.map(st => (
              <button
                key={st.id}
                type="button"
                aria-label={st.label}
                aria-pressed={st.id === stickerOf(block.sticker)}
                className={st.id === stickerOf(block.sticker) ? 'is-active' : undefined}
                onClick={() => onSticker({ sticker: st.id, fill: block.fill })}
              >
                <StickerPreview sticker={st.id} fill={fill} />
              </button>
            ))}
          </div>
          <div className="toolbar-sticker-fills">
            {STICKER_FILLS.map(c => (
              <button
                key={c}
                type="button"
                aria-label={`Цвет стикера ${c}`}
                className={c === fill ? 'is-active' : undefined}
                style={{ background: c }}
                onClick={() => onSticker({ fill: c })}
              />
            ))}
          </div>
          <LayerButtons onLayer={onLayer} />
        </div>
      )}

      {menu === 'delete' && (
        <ConfirmDelete what={isSticker ? 'стикер' : 'надпись'} onDelete={onDelete} onCancel={() => setMenu(null)} />
      )}

      {opener('color', 'Цвет', <span className="text-toolbar-swatch" style={{ '--color': color } as CSSProperties} />, 'text-toolbar-color')}
      {opener(
        'font',
        'Шрифт',
        <>
          <span className={`font-${font}`}>Аа</span>
          <Chevron />
        </>,
        'text-toolbar-font'
      )}
      {opener(
        'effect',
        'Эффект',
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 3.5l1.9 5.6 5.6 1.9-5.6 1.9L11 18.5l-1.9-5.6L3.5 11l5.6-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </svg>
      )}
      {block.text.trim() !== '' &&
        opener(
          'marker',
          'Маркер',
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M14.5 4.5l5 5-8 8-4-1-1-4zM6.5 12.5l5 5M4 20.5h7" />
          </svg>
        )}
      {isSticker &&
        opener(
          'sticker',
          'Стикер',
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 4.5h15v10l-5 5h-10zM19.5 14.5h-5v5" />
          </svg>
        )}
      {opener(
        'delete',
        isSticker ? 'Удалить стикер' : 'Удалить надпись',
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
        </svg>
      )}
      <button type="button" className="text-toolbar-done" aria-label="Готово" onClick={onDone}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
    </div>
  );
}

function Chevron() {
  return (
    <svg className="text-toolbar-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 14l5-5 5 5" />
    </svg>
  );
}

// Круговая палитра над панелью: по кругу — оттенок, от середины к краю — от
// чёрного к яркому (textStyle.ts: wheelColor). Цвет меняется, пока ведёшь
// пальцем; отметка — где цвет надписи сейчас.
function ColorWheel({ color, size, onPick }: { color?: string; size: number; onPick: (color: string, final: boolean) => void }) {
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
        style={{ width: size, height: size }}
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
