import { useState } from 'react';
import { knownImageUrl } from '../images';
import type { Block } from '../notes';
import { FILTERS, FRAMES, filterOf, frameOf } from '../textStyle';
import { ConfirmDelete, LayerButtons, keepFocus, menuRoom, useToolbarHeight } from './TextToolbar';
import './TextToolbar.css';

type Props = {
  block: Block;
  onPatch: (patch: Partial<Block>) => void;
  onLayer: (dir: 'up' | 'down') => void;
  onDelete: () => void;
  onDone: () => void;
  onHeight: (h: number) => void;
};

type Menu = 'frame' | 'filter' | 'layer' | 'delete' | null;

// Панель выбранного фото — как у надписи (TextToolbar.css): рамка и фильтр
// (выпадающие списки), отразить, слой (наверх / вниз), удалить (с
// подтверждением), готово. Двигают, поворачивают и меняют размер фото
// пальцами, как надпись.
export function ImageToolbar({ block, onPatch, onLayer, onDelete, onDone, onHeight }: Props) {
  const ref = useToolbarHeight(onHeight);
  const [menu, setMenu] = useState<Menu>(null);
  const frame = frameOf(block.frame);
  const filter = filterOf(block.filter);
  const url = block.image ? knownImageUrl(block.image) : null;
  const room = menuRoom(0);
  const toggle = (m: Menu) => setMenu(menu === m ? null : m);

  return (
    <div ref={ref} className="text-toolbar" role="toolbar" aria-label="Фото" onMouseDown={keepFocus}>
      {menu === 'frame' && (
        <ul className="toolbar-menu" style={{ maxHeight: room }} role="listbox" aria-label="Рамка">
          {FRAMES.map(f => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={f.id === frame}
                className={`toolbar-menu-item${f.id === frame ? ' is-active' : ''}`}
                onClick={() => {
                  setMenu(null);
                  onPatch({ frame: f.id === 'none' ? undefined : f.id });
                }}
              >
                <span className={`toolbar-frame-preview frame-${f.id}`}>
                  <span />
                </span>
                {f.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu === 'filter' && (
        <ul className="toolbar-menu" style={{ maxHeight: room }} role="listbox" aria-label="Фильтр">
          {FILTERS.map(f => (
            <li key={f.id}>
              <button
                type="button"
                role="option"
                aria-selected={f.id === filter}
                className={`toolbar-menu-item${f.id === filter ? ' is-active' : ''}`}
                onClick={() => {
                  setMenu(null);
                  onPatch({ filter: f.id === 'none' ? undefined : f.id });
                }}
              >
                {url && <img className="toolbar-filter-preview" src={url} alt="" style={{ filter: f.css }} />}
                {f.label}
              </button>
            </li>
          ))}
        </ul>
      )}

      {menu === 'layer' && (
        <div className="toolbar-menu" role="dialog" aria-label="Слой">
          <LayerButtons
            onLayer={dir => {
              setMenu(null);
              onLayer(dir);
            }}
          />
        </div>
      )}

      {menu === 'delete' && <ConfirmDelete what="фото" onDelete={onDelete} onCancel={() => setMenu(null)} />}

      <button type="button" className={menu === 'frame' ? 'is-active' : undefined} aria-label="Рамка" onClick={() => toggle('frame')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h16v16H4zM8 8h8v8H8z" />
        </svg>
      </button>
      <button type="button" className={menu === 'filter' ? 'is-active' : undefined} aria-label="Фильтр" onClick={() => toggle('filter')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" style={{ fill: 'currentColor' }} />
        </svg>
      </button>
      <button
        type="button"
        className={block.flip ? 'is-active' : undefined}
        aria-label="Отразить"
        aria-pressed={!!block.flip}
        onClick={() => onPatch({ flip: block.flip ? undefined : true })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3v18M9 7l-5 5 5 5zM15 7l5 5-5 5z" />
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
