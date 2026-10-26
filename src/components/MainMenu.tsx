import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { NotebookInfo } from '../notes';
import { Calendar } from './Calendar';
import { ConfirmDialog } from './ConfirmDialog';
import { AppSettings } from './AppSettings';
import { ColorWheel } from './TextToolbar';
import './MainMenu.css';

type Props = {
  notebooks: NotebookInfo[];
  onOpen: (id: string) => void;
  onDay: (date: string) => void;
  // Новый дневник; возвращает его — сразу даём его назвать
  onCreate: () => NotebookInfo;
  onRename: (id: string, name: string) => void;
  // Другой цвет обложки
  onRecolor: (id: string, color: string) => void;
  onDelete: (id: string) => void;
};

// Поле названия получает фокус прямо в нажатии — иначе iOS не покажет
// клавиатуру. Курсор — в конце названия, без выделения (просьба автора)
const focusName = () => {
  const input = document.getElementById('diary-name');
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
};

// Размер палитры цвета обложки (px)
const COVER_WHEEL_SIZE = 200;

// Главное меню: дневники (обложки с именами; новый, переименовать,
// удалить) и календарь — касание по дню открывает лист этого дня.
// Горизонтально — две колонки, вертикально — одна под другой.
export function MainMenu({ notebooks, onOpen, onDay, onCreate, onRename, onRecolor, onDelete }: Props) {
  // Дневник, который правят (окно поверх меню), его название в поле, и тот,
  // который хотят удалить
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<NotebookInfo | null>(null);
  const edited = notebooks.find(n => n.id === editing);
  // Всё меню помещается на экране — вверх-вниз оно не двигается (просьба
  // автора: иначе его можно было потянуть и оно «пружинило»)
  const menu = useRef<HTMLDivElement>(null);
  const [fits, setFits] = useState(true);
  useLayoutEffect(() => {
    const el = menu.current!;
    const check = () => setFits(el.scrollHeight <= el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

  // Окно дневника (просьба автора): карандаш — название в поле, обложка,
  // палитра цвета, «Удалить дневник». Новый дневник создаётся в том же
  // нажатии, и в поле сразу можно печатать
  const startEditing = (info: NotebookInfo, focus: boolean) => {
    flushSync(() => {
      setEditing(info.id);
      setDraft(info.name);
    });
    if (focus) focusName();
  };

  // Название — когда окно закрывают (пустое — прежнее)
  const finish = () => {
    const name = draft.trim();
    if (edited && name && name !== edited.name) onRename(edited.id, name);
    setEditing(null);
  };

  return (
    <div ref={menu} className={fits ? 'main-menu is-fit' : 'main-menu'}>
      <div className="main-menu-content">
        <section className="main-menu-section">
          <h1>Дневники</h1>
          <div className="diaries">
            {notebooks.map(n => (
              <div key={n.id} className="diary" style={{ '--cover': n.color } as CSSProperties}>
                <button type="button" className="diary-cover" onClick={() => onOpen(n.id)}>
                  <span className="diary-label">{n.name}</span>
                </button>
                <button type="button" className="diary-rename" aria-label={`Изменить «${n.name}»`} onClick={() => startEditing(n, false)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
                  </svg>
                </button>
              </div>
            ))}
            <button type="button" className="diary-new" onClick={() => startEditing(onCreate(), true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Новый дневник
            </button>
          </div>
        </section>

        <section className="main-menu-section">
          <h1>Календарь</h1>
          <Calendar onDay={onDay} />
        </section>
      </div>

      {/* Настройки приложения — справа вверху */}
      <AppSettings />

      {edited && (
        <>
          <div className="diary-color-backdrop" onClick={finish} />
          <div className="diary-color-panel" role="dialog" aria-label="Дневник">
            <input
              id="diary-name"
              className="diary-name-input"
              value={draft}
              maxLength={40}
              spellCheck={false}
              autoCorrect="off"
              enterKeyHint="done"
              aria-label="Название дневника"
              onChange={e => setDraft(e.target.value)}
              // Enter — название готово (клавиатура прячется, окно остаётся)
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
              }}
            />
            <div className="diary-color-preview" style={{ '--cover': edited.color } as CSSProperties}>
              <span className="diary-label">{draft.trim() || edited.name}</span>
            </div>
            <ColorWheel color={edited.color} size={COVER_WHEEL_SIZE} label="Цвет обложки" onPick={c => onRecolor(edited.id, c)} />
            <div className="diary-panel-actions">
              {notebooks.length > 1 && (
                <button
                  type="button"
                  className="diary-delete"
                  onClick={() => {
                    setEditing(null);
                    setDeleting(edited);
                  }}
                >
                  Удалить дневник
                </button>
              )}
              <button type="button" className="diary-color-done" onClick={finish}>
                Готово
              </button>
            </div>
          </div>
        </>
      )}

      {deleting && (
        <ConfirmDialog
          title={`Удалить «${deleting.name}»?`}
          note="Все его записи и фото удалятся навсегда."
          confirm="Удалить"
          cancel="Отмена"
          onConfirm={() => {
            onDelete(deleting.id);
            setDeleting(null);
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
