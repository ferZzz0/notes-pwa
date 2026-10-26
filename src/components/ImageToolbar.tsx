import { useState, type ReactNode } from 'react';
import { knownImageUrl } from '../images';
import type { Block } from '../notes';
import { FILTERS, FRAMES, filterOf, frameOf } from '../textStyle';
import { CascadeMenu, ConfirmDelete, LayerButtons, OpacitySlider, keepFocus, menuRoom, useToolbarHeight } from './TextToolbar';
import './TextToolbar.css';

type Props = {
  block: Block;
  onPatch: (patch: Partial<Block>) => void;
  // Непрозрачность с ползунка; final — палец отпустили (сохранить)
  onOpacity: (opacity: number, final: boolean) => void;
  onLayer: (dir: 'up' | 'down') => void;
  onDelete: () => void;
  onDone: () => void;
  onHeight: (h: number) => void;
  // «Отменить» / «Вернуть» — над панелью
  history?: ReactNode;
};

type Menu = 'style' | 'layer' | 'delete' | null;

// Панель выбранного фото — как у надписи (TextToolbar.css): «Оформление» —
// каскадный список (рамка, фильтр, прозрачность — просьба автора), слой (наверх /
// вниз), удалить (с подтверждением), готово. Двигают, поворачивают и меняют размер фото
// пальцами, как надпись.
export function ImageToolbar({ block, onPatch, onOpacity, onLayer, onDelete, onDone, onHeight, history }: Props) {
  const ref = useToolbarHeight(onHeight);
  const [menu, setMenu] = useState<Menu>(null);
  const frame = frameOf(block.frame);
  const filter = filterOf(block.filter);
  const url = block.image ? knownImageUrl(block.image) : null;
  const room = menuRoom(0);
  const toggle = (m: Menu) => setMenu(menu === m ? null : m);

  const decal = block.kind === 'decal';
  return (
    <div ref={ref} className={menu ? 'text-toolbar has-menu' : 'text-toolbar'} role="toolbar" aria-label={decal ? 'Наклейка' : 'Фото'} onMouseDown={keepFocus}>
      {history && <div className="toolbar-history">{history}</div>}

      {/* Рамка, фильтр, прозрачность — каскадный список, как у надписи */}
      {/* У наклейки рамок и фильтров нет — только прозрачность */}
      {menu === 'style' && decal && (
        <div className="toolbar-menu toolbar-opacity-pop" role="dialog" aria-label="Прозрачность">
          <OpacitySlider value={block.opacity} onPick={onOpacity} />
        </div>
      )}

      {menu === 'style' && !decal && (
        <CascadeMenu
          anchor={ref}
          room={room}
          label="Оформление"
          items={[
            {
              id: 'frame',
              label: 'Рамка',
              value: FRAMES.find(f => f.id === frame)?.label,
              content: (
                <div className="toolbar-choices" role="radiogroup" aria-label="Рамка">
                  {FRAMES.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={f.id === frame}
                      className={f.id === frame ? 'is-active' : undefined}
                      onClick={() => onPatch({ frame: f.id === 'none' ? undefined : f.id })}
                    >
                      <span className={`toolbar-frame-preview frame-${f.id}`}>
                        <span />
                      </span>
                      <small>{f.label}</small>
                    </button>
                  ))}
                </div>
              )
            },
            {
              id: 'filter',
              label: 'Фильтр',
              value: FILTERS.find(f => f.id === filter)?.label,
              content: (
                <div className="toolbar-choices" role="radiogroup" aria-label="Фильтр">
                  {FILTERS.map(f => (
                    <button
                      key={f.id}
                      type="button"
                      role="radio"
                      aria-checked={f.id === filter}
                      className={f.id === filter ? 'is-active' : undefined}
                      onClick={() => onPatch({ filter: f.id === 'none' ? undefined : f.id })}
                    >
                      {url && <img className="toolbar-filter-preview" src={url} alt="" style={{ filter: f.css }} />}
                      <small>{f.label}</small>
                    </button>
                  ))}
                </div>
              )
            },
            {
              id: 'opacity',
              label: 'Прозрачность',
              value: `${Math.round((block.opacity ?? 1) * 100)}%`,
              content: <OpacitySlider value={block.opacity} onPick={onOpacity} />
            }
          ]}
        />
      )}

      {menu === 'layer' && (
        <div className="toolbar-menu" role="dialog" aria-label="Слой">
          <LayerButtons onLayer={onLayer} />
        </div>
      )}

      {menu === 'delete' && <ConfirmDelete what={decal ? 'наклейку' : 'фото'} onDelete={onDelete} onCancel={() => setMenu(null)} />}

      <button type="button" className={menu === 'style' ? 'is-active' : undefined} aria-label={decal ? 'Прозрачность' : 'Оформление'} aria-expanded={menu === 'style'} onClick={() => toggle('style')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {decal ? (
            <>
              <path d="M12 3.5c3.2 4.3 6 7.4 6 10.6a6 6 0 0 1-12 0c0-3.2 2.8-6.3 6-10.6z" />
              <path d="M6 14.1a6 6 0 0 0 12 0z" style={{ fill: 'currentColor', opacity: 0.45 }} />
            </>
          ) : (
            <path d="M4 4h16v16H4zM8 8h8v8H8z" />
          )}
        </svg>
      </button>
      <button type="button" className={menu === 'layer' ? 'is-active' : undefined} aria-label="Слой" onClick={() => toggle('layer')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
        </svg>
      </button>
      <button type="button" className={menu === 'delete' ? 'is-active' : undefined} aria-label={decal ? 'Удалить наклейку' : 'Удалить фото'} onClick={() => toggle('delete')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" />
        </svg>
      </button>
      <button type="button" className="text-toolbar-done" aria-label="Готово" onClick={onDone}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </button>
    </div>
  );
}
