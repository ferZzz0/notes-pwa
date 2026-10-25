import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import type { Block } from '../notes';
import type { RunStyle } from '../richText';
import {
  EFFECTS,
  FONTS,
  MARKERS,
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
  type MarkerId,
  type WheelBase
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
  // Нажали на панель (и отпустили): запомнить выделение в надписи — касание
  // панели может его сбросить
  onCapture: () => void;
  // Оформление выделенного куска (нет — выделения нет): список отмечает его,
  // а не оформление всей надписи
  rangeStyle?: RunStyle | null;
  // «Отменить» / «Вернуть» — над панелью
  history?: ReactNode;
  // Открыли (true) или закрыли список над панелью — прямо в нажатии
  onMenu?: (open: boolean) => void;
  // Стикер: форма и цвет (save = false — пока ведут пальцем по палитре);
  // слой — выше всех или ниже всех на листе
  onSticker: (patch: Partial<Block>, save?: boolean) => void;
  // Непрозрачность с ползунка; final — палец отпустили (сохранить)
  onOpacity: (opacity: number, final: boolean) => void;
  onLayer: (dir: 'up' | 'down') => void;
  onDelete: () => void;
  onDone: () => void;
  // Высота панели — чтобы лист можно было поднять над ней
  onHeight: (h: number) => void;
};

// Что открыто над панелью
type Menu = 'color' | 'font' | 'effect' | 'marker' | 'sticker' | 'opacity' | 'delete' | null;

// Нажатие на панель не забирает фокус у поля ввода — клавиатура остаётся
export const keepFocus = (e: MouseEvent) => e.preventDefault();

// Над панелью и под верхом экрана — столько места оставляем
const MENU_MARGIN = 96;
const WHEEL_SIZE = 180;
const STICKER_WHEEL_SIZE = 150;

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

// Непрозрачность — от MIN_OPACITY до 1, шагом 5%
const MIN_OPACITY = 0.1;

// Прозрачность надписи или фото: ползунок над панелью (свой, на касаниях,
// как палитра, — обычный ползунок забрал бы фокус у надписи и закрыл
// клавиатуру). Меняется, пока ведёшь пальцем; отпустили — сохранить
export function OpacityMenu({ value = 1, onPick }: { value?: number; onPick: (opacity: number, final: boolean) => void }) {
  const track = useRef<HTMLDivElement>(null);
  const pick = (e: PointerEvent<HTMLDivElement>, final: boolean) => {
    const r = track.current!.getBoundingClientRect();
    const t = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    onPick(Math.round((MIN_OPACITY + t * (1 - MIN_OPACITY)) * 20) / 20, final);
  };
  const percent = Math.round(value * 100);
  return (
    <div className="toolbar-menu toolbar-opacity" role="dialog" aria-label="Прозрачность">
      <div
        ref={track}
        className="opacity-track"
        role="slider"
        tabIndex={0}
        aria-label="Непрозрачность"
        aria-valuemin={MIN_OPACITY * 100}
        aria-valuemax={100}
        aria-valuenow={percent}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e, false);
        }}
        onPointerMove={e => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e, false);
        }}
        onPointerUp={e => pick(e, true)}
        onKeyDown={e => {
          const step = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 0.05 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -0.05 : 0;
          if (!step) return;
          e.preventDefault();
          onPick(Math.round(Math.min(1, Math.max(MIN_OPACITY, value + step)) * 20) / 20, true);
        }}
      >
        <span className="opacity-thumb" style={{ left: `${((value - MIN_OPACITY) / (1 - MIN_OPACITY)) * 100}%` }} />
      </div>
      <span className="opacity-value">{percent}%</span>
    </div>
  );
}

// Значок прозрачности: капля, наполовину светлая
export function OpacityIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3.5c3.2 4.3 6 7.4 6 10.6a6 6 0 0 1-12 0c0-3.2 2.8-6.3 6-10.6z" />
      <path d="M6 14.1a6 6 0 0 0 12 0z" style={{ fill: 'currentColor', opacity: 0.45 }} />
    </svg>
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
// текстом), у стикера — его форма, цвет и слой, прозрачность (ползунок),
// удалить (с подтверждением), готово. Списки открываются над панелью, по одному.
export function TextToolbar(props: Props) {
  const { block, keyboard, onColor, onFont, onEffect, onMarker, onCapture, rangeStyle, history, onMenu, onSticker, onOpacity, onLayer, onDelete, onDone, onHeight } = props;
  const ref = useToolbarHeight(onHeight);
  const [menu, setMenu] = useState<Menu>(null);
  const font = fontOf(rangeStyle?.font ?? block.font);
  const effect = effectOf(rangeStyle?.effect ?? block.effect);
  const marker = markerOf(rangeStyle?.marker ?? block.marker);
  const color = inkColor(rangeStyle?.color ?? block.color);
  const isSticker = block.kind === 'sticker';
  const fill = stickerFill(block.sticker, block.fill);
  const room = menuRoom(keyboard);

  const toggle = (m: Menu) => {
    const next = menu === m ? null : m;
    setMenu(next);
    onMenu?.(next !== null);
  };
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
      onPointerDownCapture={onCapture}
      onPointerUpCapture={onCapture}
    >
      {history && <div className="toolbar-history">{history}</div>}

      {menu === 'color' && (
        <div className="color-wheel-pop">
          <ColorWheel color={rangeStyle?.color ?? block.color} size={Math.min(WHEEL_SIZE, room - 20)} onPick={onColor} />
        </div>
      )}

      {menu === 'font' && (
        <ul className="toolbar-menu" style={{ maxHeight: room }} role="listbox" aria-label="Шрифт">
          {FONTS.map(f => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={f.id === font}
                className={`toolbar-menu-item toolbar-menu-font${f.id === font ? ' is-active' : ''}`}
                onClick={() => onFont(f.id)}
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
                onClick={() => onEffect(e.id)}
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
                onClick={() => onMarker(m.id)}
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
          <ColorWheel
            color={fill}
            base="light"
            size={STICKER_WHEEL_SIZE}
            label="Цвет стикера"
            onPick={(c, final) => onSticker({ fill: c }, final)}
          />
          <LayerButtons onLayer={onLayer} />
        </div>
      )}

      {menu === 'opacity' && <OpacityMenu value={block.opacity} onPick={onOpacity} />}

      {menu === 'delete' && (
        <ConfirmDelete
          what={isSticker ? 'стикер' : 'надпись'}
          onDelete={onDelete}
          onCancel={() => {
            setMenu(null);
            onMenu?.(false);
          }}
        />
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
      {opener('opacity', 'Прозрачность', <OpacityIcon />)}
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

type WheelProps = {
  color?: string;
  // От чёрного (чернила) или от белого (стикеры) в середине
  base?: WheelBase;
  size: number;
  label?: string;
  onPick: (color: string, final: boolean) => void;
};

// Круговая палитра: по кругу — оттенок, от середины к краю — от чёрного (или
// белого) к яркому (textStyle.ts: wheelColor). Цвет меняется, пока ведёшь
// пальцем; отметка — где цвет сейчас.
export function ColorWheel({ color, base = 'dark', size, label = 'Палитра цвета', onPick }: WheelProps) {
  const wheel = useRef<HTMLDivElement>(null);
  const { h, r } = wheelPosition(color, base);
  const a = (h * Math.PI) / 180;

  const pick = (e: PointerEvent<HTMLDivElement>, final: boolean) => {
    const rect = wheel.current!.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = e.clientX - (rect.left + radius);
    const dy = e.clientY - (rect.top + radius);
    const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
    onPick(wheelColor(hue, Math.min(1, Math.hypot(dx, dy) / radius), base), final);
  };

  return (
    <div
      ref={wheel}
      className={base === 'light' ? 'color-wheel is-light' : 'color-wheel'}
      style={{ width: size, height: size }}
      role="slider"
      aria-label={label}
      aria-valuetext={color}
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
          background: base === 'light' ? color : inkColor(color)
        }}
      />
    </div>
  );
}
