import { useState, type ReactNode } from 'react';
import type { Charm } from '../notes';
import { CHARM_MAX, CHARM_MIN } from './Charm';
import { ConfirmDelete, GlitterSlider, StyleSection, keepFocus, useToolbarHeight } from './TextToolbar';
import './TextToolbar.css';

type Props = {
  charm: Charm;
  // Блёстки и размер с ползунков; final — палец отпустили (сохранить)
  onGlitter: (glitter: number, final: boolean) => void;
  onSize: (size: number, final: boolean) => void;
  onDelete: () => void;
  onDone: () => void;
  onHeight: (h: number) => void;
  // «Отменить» / «Вернуть» — над панелью
  history: ReactNode;
};

type Menu = 'style' | 'delete' | null;

// Панель выбранного брелка — как у наклейки (TextToolbar.css): блёстки и
// размер, удалить (с подтверждением), готово
export function CharmToolbar({ charm, onGlitter, onSize, onDelete, onDone, onHeight, history }: Props) {
  const ref = useToolbarHeight(onHeight);
  const [menu, setMenu] = useState<Menu>(null);
  const toggle = (m: Menu) => setMenu(menu === m ? null : m);
  return (
    <div ref={ref} className={menu ? 'text-toolbar has-menu' : 'text-toolbar'} role="toolbar" aria-label="Брелок" onMouseDown={keepFocus}>
      <div className="toolbar-history">{history}</div>

      {menu === 'style' && (
        <div className="toolbar-menu toolbar-opacity-pop" role="dialog" aria-label="Блёстки и размер">
          <StyleSection title="Блёстки">
            <GlitterSlider value={charm.glitter} onPick={onGlitter} />
          </StyleSection>
          <StyleSection title="Размер">
            <GlitterSlider
              size
              value={(charm.size - CHARM_MIN) / (CHARM_MAX - CHARM_MIN)}
              onPick={(t, final) => onSize(Math.round(CHARM_MIN + t * (CHARM_MAX - CHARM_MIN)), final)}
            />
          </StyleSection>
        </div>
      )}

      {menu === 'delete' && <ConfirmDelete what="брелок" onDelete={onDelete} onCancel={() => setMenu(null)} />}

      <button type="button" className={menu === 'style' ? 'is-active' : undefined} aria-label="Блёстки и размер" aria-expanded={menu === 'style'} onClick={() => toggle('style')}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 3.5l1.9 5.6 5.6 1.9-5.6 1.9L11 18.5l-1.9-5.6L3.5 11l5.6-1.9zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
        </svg>
      </button>
      <button type="button" className={menu === 'delete' ? 'is-active' : undefined} aria-label="Удалить брелок" onClick={() => toggle('delete')}>
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
