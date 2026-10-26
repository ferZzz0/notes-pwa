import { useState, type ReactNode } from 'react';
import { knownImageUrl } from '../images';
import type { Block } from '../notes';
import { FILTERS, FRAMES, filterOf, frameOf } from '../textStyle';
import { ConfirmDelete, LayerButtons, OpacitySlider, StyleSection, keepFocus, menuRoom, useToolbarHeight } from './TextToolbar';
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
// один список (рамка, фильтр, прозрачность — просьба автора), слой (наверх /
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

  return (
    <div ref={ref} className="text-toolbar" role="toolbar" aria-label="Фото" onMouseDown={keepFocus}>
      {history && <div className="toolbar-history">{history}</div>}

      {menu === 'style' && (
        <div className="toolbar-menu toolbar-style" style={{ maxHeight: room }} role="dialog" aria-label="Оформление">
          <StyleSection title="Рамка">
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
          </StyleSection>
          <StyleSection title="Фильтр">
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
          </StyleSection>
          <StyleSection title="Прозрачность">
            <OpacitySlider value={block.opacity} onPick={onOpacity} />
          </StyleSection>
        </div>
      )}

      {menu === 'layer' && (
        <div className="toolbar-menu" role="dialog" aria-label="Слой">
          <LayerButtons onLayer={onLayer} />
        </div>
      )}

      {menu === 'delete' && <ConfirmDelete what="фото" onDelete={onDelete} onCancel={() => setMenu(null)} />}

      <button type="button" className={menu === 'style' ? 'is-active' : undefined} aria-label="Оформление" aria-expanded={menu === 'style'} onClick={() => toggle('style')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h16v16H4zM8 8h8v8H8z" />
        </svg>
      </button>
      <button type="button" className={menu === 'layer' ? 'is-active' : undefined} aria-label="Слой" onClick={() => toggle('layer')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 4l8.5 4.5L12 13 3.5 8.5zM3.5 12.5L12 17l8.5-4.5M3.5 16.5L12 21l8.5-4.5" />
        </svg>
      </button>
      <button type="button" className={menu === 'delete' ? 'is-active' : undefined} aria-label="Удалить фото" onClick={() => toggle('delete')}>
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
