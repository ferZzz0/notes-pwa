import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent, type ReactNode, type RefObject } from 'react';
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
  markerColorOf,
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
  // Цвет маркера с палитры; final — палец отпустили (сохранить)
  onMarkerColor: (color: string, final: boolean) => void;
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
  // Ручка ширины строк на рамке: показана ли и кнопка, которая её
  // показывает и прячет (нет — кнопки нет)
  grip?: { on: boolean; onToggle: () => void };
  onDelete: () => void;
  onDone: () => void;
  // Высота панели — чтобы лист можно было поднять над ней
  onHeight: (h: number) => void;
};

// Что открыто над панелью
type Menu = 'color' | 'style' | 'sticker' | 'layer' | 'delete' | null;

// Нажатие на панель не забирает фокус у поля ввода — клавиатура остаётся
export const keepFocus = (e: MouseEvent) => e.preventDefault();

// Над панелью и под верхом экрана — столько места оставляем
const MENU_MARGIN = 96;
const WHEEL_SIZE = 180;
const STICKER_WHEEL_SIZE = 150;
const MARKER_WHEEL_SIZE = 140;

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
// Бегунок ползунка (px; .opacity-thumb): его середина ходит от половины
// бегунка до края минус половина — на 0% и 100% он целиком на дорожке
// (жалоба автора: уходил за окошко)
const THUMB = 26;
// Доля дорожки под пальцем — в тех же пределах, что ходит бегунок
const trackShare = (e: PointerEvent<HTMLDivElement>) => {
  const r = e.currentTarget.getBoundingClientRect();
  return Math.min(1, Math.max(0, (e.clientX - r.left - THUMB / 2) / Math.max(1, r.width - THUMB)));
};
// Где бегунок при доле t
const thumbLeft = (t: number) => `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${t})`;

// Прозрачность надписи или фото: ползунок (свой, на касаниях, как палитра, —
// обычный ползунок забрал бы фокус у надписи и закрыл клавиатуру). Меняется,
// пока ведёшь пальцем; отпустили — сохранить
export function OpacitySlider({ value = 1, onPick }: { value?: number; onPick: (opacity: number, final: boolean) => void }) {
  const pick = (e: PointerEvent<HTMLDivElement>, final: boolean) => {
    const t = trackShare(e);
    onPick(Math.round((MIN_OPACITY + t * (1 - MIN_OPACITY)) * 20) / 20, final);
  };
  const percent = Math.round(value * 100);
  return (
    <div className="toolbar-opacity">
      <div
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
        <span className="opacity-thumb" style={{ left: thumbLeft((value - MIN_OPACITY) / (1 - MIN_OPACITY)) }} />
      </div>
      <span className="opacity-value">{percent}%</span>
    </div>
  );
}

// Сколько блёсток на наклейке (просьба автора: ползунком от «мало» к
// «много»): 0–1 шагом 5%, как прозрачность — свой ползунок на касаниях
export function GlitterSlider({ value, onPick }: { value: number; onPick: (v: number, final: boolean) => void }) {
  const pick = (e: PointerEvent<HTMLDivElement>, final: boolean) => {
    onPick(Math.round(trackShare(e) * 20) / 20, final);
  };
  return (
    <div className="toolbar-glitter">
      <span>мало</span>
      <div
        className="glitter-track"
        role="slider"
        tabIndex={0}
        aria-label="Блёстки"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pick(e, false);
        }}
        onPointerMove={e => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e, false);
        }}
        onPointerUp={e => pick(e, true)}
      >
        <span className="opacity-thumb" style={{ left: thumbLeft(value) }} />
      </div>
      <span>много</span>
    </div>
  );
}

// Раздел плашки над панелью: мелкий заголовок и его настройки
export function StyleSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="toolbar-section">
      <p className="toolbar-section-title">{title}</p>
      {children}
    </section>
  );
}

// Пункт каскадного списка: название, текущее значение (мелко) и настройки
export type CascadeItem = { id: string; label: string; value?: string; content: ReactNode };

// Каскадный список оформления (просьба автора): над панелью — короткий
// список пунктов (у надписи — шрифт, эффект, маркер, прозрачность; у фото —
// рамка, фильтр, прозрачность), касание пункта открывает справа от него
// второй список — настройки этого пункта. Пункты начинаются у левого края
// панели, а если справа не хватит места — левее, чтобы оба списка были на
// экране
const CASCADE_MARGIN = 12;
const CASCADE_WIDTH = 400;
export function CascadeMenu({ items, anchor, room, label }: { items: CascadeItem[]; anchor: RefObject<HTMLDivElement | null>; room: number; label: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const bar = anchor.current?.getBoundingClientRect();
  const width = Math.min(CASCADE_WIDTH, window.innerWidth - 2 * CASCADE_MARGIN);
  const left = bar ? Math.min(Math.max(CASCADE_MARGIN, bar.left), window.innerWidth - CASCADE_MARGIN - width) - bar.left : 0;
  const current = items.find(i => i.id === open);
  return (
    <div className="toolbar-cascade" style={{ left, width }} role="dialog" aria-label={label}>
      <ul className="toolbar-cascade-list" role="menu" style={{ maxHeight: room }}>
        {items.map(i => (
          <li key={i.id}>
            <button
              type="button"
              role="menuitem"
              aria-haspopup="true"
              aria-expanded={open === i.id}
              className={open === i.id ? 'is-active' : undefined}
              onClick={() => setOpen(open === i.id ? null : i.id)}
            >
              <span>
                {i.label}
                {i.value && <small>{i.value}</small>}
              </span>
              <svg className="toolbar-cascade-arrow" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      {current && (
        <div className="toolbar-cascade-sub" role="group" aria-label={current.label} style={{ maxHeight: room }}>
          {current.content}
        </div>
      )}
    </div>
  );
}

// Замок: закрыт или открыт
export function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d={locked ? 'M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5' : 'M8.5 10.5V8a3.5 3.5 0 0 1 6.9-.8'} />
    </svg>
  );
}

// Панель закрытой на замок надписи, стикера или фото: с ней ничего не
// сделать — только открыть замок (кнопка над панелью) или «Готово»
export function LockedToolbar({ history, onDone, onHeight }: { history: ReactNode; onDone: () => void; onHeight: (h: number) => void }) {
  const ref = useToolbarHeight(onHeight);
  return (
    <div ref={ref} className="text-toolbar" role="toolbar" aria-label="Закреплено" onMouseDown={keepFocus}>
      <div className="toolbar-history">{history}</div>
      <span className="toolbar-locked-note">
        <LockIcon locked />
        Закреплено
      </span>
      <button type="button" className="text-toolbar-done" aria-label="Готово" onClick={onDone}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
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
// клавиатуре — над ней): цвет текста (круговая палитра), «Аа» — каскадный
// список оформления (шрифт, эффект, маркер — на готовом тексте, прозрачность), у
// стикера — его форма, цвет и слой, у надписи — слой, ширина строк (ручка
// на рамке), удалить (с подтверждением), готово. Списки открываются над панелью, по одному.
export function TextToolbar(props: Props) {
  const { block, keyboard, onColor, onFont, onEffect, onMarker, onMarkerColor, onCapture, rangeStyle, history, onMenu, onSticker, onOpacity, onLayer, grip, onDelete, onDone, onHeight } = props;
  const ref = useToolbarHeight(onHeight);
  const [menu, setMenu] = useState<Menu>(null);
  const font = fontOf(rangeStyle?.font ?? block.font);
  const effect = effectOf(rangeStyle?.effect ?? block.effect);
  const marker = markerOf(rangeStyle?.marker ?? block.marker);
  const markColor = markerColorOf(rangeStyle?.marker ?? block.marker, rangeStyle?.markerColor ?? block.markerColor);
  const color = inkColor(rangeStyle?.color ?? block.color);
  const isSticker = block.kind === 'sticker';
  const fill = stickerFill(block.sticker, block.fill);
  const room = menuRoom(keyboard);

  // Список выводит надпись из ввода (onMenu) — кроме слоя: две кнопки над
  // панелью клавиатуре не мешают, и она остаётся (просьба автора)
  const toggle = (m: Menu) => {
    const next = menu === m ? null : m;
    setMenu(next);
    onMenu?.(next !== null && next !== 'layer');
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
      // Открыт список или подтверждение — ряд кнопок над панелью прячется:
      // он под ними, и его края выглядывали (жалоба автора)
      className={menu ? 'text-toolbar has-menu' : 'text-toolbar'}
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

      {/* «Аа» — каскадный список: шрифт, эффект, маркер (на готовом тексте),
          прозрачность; настройки пункта — справа (просьба автора). Выбор
          список не закрывает */}
      {menu === 'style' && (
        <CascadeMenu
          anchor={ref}
          room={room}
          label="Оформление"
          items={[
            {
              id: 'font',
              label: 'Шрифт',
              value: FONTS.find(f => f.id === font)?.label,
              content: (
                <div className="toolbar-options" role="radiogroup" aria-label="Шрифт">
                  {FONTS.map(f => (
                    <button key={f.id} type="button" role="radio" aria-checked={f.id === font} className={f.id === font ? 'is-active' : undefined} onClick={() => onFont(f.id)}>
                      <span className={`toolbar-font-sample font-${f.id}`}>{f.label}</span>
                    </button>
                  ))}
                </div>
              )
            },
            {
              id: 'effect',
              label: 'Эффект',
              value: EFFECTS.find(e => e.id === effect)?.label,
              content: (
                <div className="toolbar-options" role="radiogroup" aria-label="Эффект">
                  {EFFECTS.map(e => (
                    <button key={e.id} type="button" role="radio" aria-checked={e.id === effect} className={e.id === effect ? 'is-active' : undefined} onClick={() => onEffect(e.id)}>
                      <span className={`toolbar-choice-sample font-${font} effect-${e.id}`} style={inkStyle}>
                        Аа
                      </span>
                      {e.label}
                    </button>
                  ))}
                </div>
              )
            },
            ...(block.text.trim() !== ''
              ? [
                  {
                    id: 'marker',
                    label: 'Маркер',
                    value: MARKERS.find(m => m.id === marker)?.label,
                    content: (
                      <div className="toolbar-marker">
                        <div className="toolbar-choices" role="radiogroup" aria-label="Форма маркера">
                          {MARKERS.map(m => (
                            <button key={m.id} type="button" role="radio" aria-checked={m.id === marker} className={m.id === marker ? 'is-active' : undefined} onClick={() => onMarker(m.id)}>
                              <span className={`toolbar-choice-sample font-${font}`} style={inkStyle}>
                                <span className={`mark-${m.id}`} style={{ '--mark': markColor } as CSSProperties}>
                                  текст
                                </span>
                              </span>
                              <small>{m.label}</small>
                            </button>
                          ))}
                        </div>
                        <ColorWheel color={markColor} base="light" size={Math.min(MARKER_WHEEL_SIZE, room - 140)} label="Цвет маркера" onPick={onMarkerColor} />
                      </div>
                    )
                  }
                ]
              : []),
            {
              id: 'opacity',
              label: 'Прозрачность',
              value: `${Math.round((block.opacity ?? 1) * 100)}%`,
              content: <OpacitySlider value={block.opacity} onPick={onOpacity} />
            }
          ]}
        />
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

      {/* Слой — как у фото (просьба автора); у стикера он в меню «Стикер» */}
      {menu === 'layer' && (
        <div className="toolbar-menu" role="dialog" aria-label="Слой">
          <LayerButtons onLayer={onLayer} />
        </div>
      )}

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
        'style',
        'Оформление',
        <>
          <span className={`font-${font}`}>Аа</span>
          <Chevron />
        </>,
        'text-toolbar-font'
      )}
      {isSticker &&
        opener(
          'sticker',
          'Стикер',
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4.5 4.5h15v10l-5 5h-10zM19.5 14.5h-5v5" />
          </svg>
        )}
      {!isSticker &&
        opener(
          'layer',
          'Слой',
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
          </svg>
        )}
      {/* Ширина строк: показать или спрятать ручку на рамке (просьба автора;
          по умолчанию её нет) */}
      {grip && (
        <button
          type="button"
          className={grip.on ? 'is-active' : undefined}
          aria-label="Ширина строк"
          aria-pressed={grip.on}
          onClick={grip.onToggle}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 5v14M20 5v14M8 12h8M10.5 9.5 8 12l2.5 2.5M13.5 9.5 16 12l-2.5 2.5" />
          </svg>
        </button>
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
