import { useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import type { NotebookInfo } from '../notes';
import { Calendar } from './Calendar';
import { ConfirmDialog } from './ConfirmDialog';
import { Settings } from './Settings';
import './MainMenu.css';

type Props = {
  notebooks: NotebookInfo[];
  onOpen: (id: string) => void;
  onDay: (date: string) => void;
  // Новый дневник; возвращает его id — сразу даём его назвать
  onCreate: () => string;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
};

// Поле имени дневника получает фокус прямо в нажатии — иначе iOS не покажет
// клавиатуру
const focusName = (id: string) => {
  const input = document.getElementById(`diary-name-${id}`);
  if (input instanceof HTMLInputElement) {
    input.focus();
    input.select();
  }
};

// Главное меню: дневники (обложки с именами; новый, переименовать,
// удалить) и календарь — касание по дню открывает лист этого дня.
// Горизонтально — две колонки, вертикально — одна под другой.
export function MainMenu({ notebooks, onOpen, onDay, onCreate, onRename, onDelete }: Props) {
  // Дневник, который сейчас называют, и тот, который хотят удалить
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<NotebookInfo | null>(null);

  // Начать называть дневник (новый — создаётся в том же нажатии)
  const startEditing = (pick: () => string) => {
    let id = '';
    flushSync(() => {
      id = pick();
      setEditing(id);
    });
    focusName(id);
  };

  const finish = (info: NotebookInfo, value: string) => {
    const name = value.trim();
    if (name && name !== info.name) onRename(info.id, name);
    setEditing(null);
  };

  return (
    <div className="main-menu">
      <div className="main-menu-content">
        <section className="main-menu-section">
          <h1>Дневники</h1>
          <div className="diaries">
            {notebooks.map(n => (
              <div key={n.id} className="diary" style={{ '--cover': n.color } as CSSProperties}>
                {editing === n.id ? (
                  <form
                    className="diary-cover diary-editing"
                    onSubmit={e => {
                      e.preventDefault();
                      finish(n, (e.currentTarget.elements.namedItem('name') as HTMLInputElement).value);
                    }}
                  >
                    <input
                      id={`diary-name-${n.id}`}
                      name="name"
                      className="diary-label diary-input"
                      defaultValue={n.name}
                      maxLength={40}
                      spellCheck={false}
                      autoCorrect="off"
                      enterKeyHint="done"
                      aria-label="Название дневника"
                      onBlur={e => finish(n, e.currentTarget.value)}
                    />
                    {notebooks.length > 1 && (
                      <button
                        type="button"
                        className="diary-delete"
                        // Нажатие не должно сначала закрыть поле (blur) и спрятать кнопку
                        onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setEditing(null);
                          setDeleting(n);
                        }}
                      >
                        Удалить дневник
                      </button>
                    )}
                  </form>
                ) : (
                  <>
                    <button type="button" className="diary-cover" onClick={() => onOpen(n.id)}>
                      <span className="diary-label">{n.name}</span>
                    </button>
                    <button
                      type="button"
                      className="diary-rename"
                      aria-label={`Переименовать «${n.name}»`}
                      onClick={() => startEditing(() => n.id)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            ))}
            <button type="button" className="diary-new" onClick={() => startEditing(onCreate)}>
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

      <div className="bottom-center">
        <Settings />
      </div>

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
