import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { loadGlitter, newBlockId, type CoverDecal, type NotebookInfo } from '../notes';
import { COVER_DESIGNS, DECALS, DEFAULT_GLITTER, decalSrc } from '../textStyle';
import { CoverDecals, coverDesignOf, designClass } from './CoverArt';
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
  // Обложка: цвет, узор, наклейки
  onChange: (id: string, patch: Partial<NotebookInfo>) => void;
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
export function MainMenu({ notebooks, onOpen, onDay, onCreate, onRename, onChange, onDelete }: Props) {
  // Дневник, который правят (окно поверх меню), его название в поле, и тот,
  // который хотят удалить
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [deleting, setDeleting] = useState<NotebookInfo | null>(null);
  const edited = notebooks.find(n => n.id === editing);
  // Окно дневника: вкладка и наклейка на обложке, которую правят
  const [tab, setTab] = useState<'color' | 'design' | 'decals'>('color');
  const [picked, setPicked] = useState<number | null>(null);
  const decals = edited?.decals ?? [];
  const setDecals = (next: CoverDecal[]) => edited && onChange(edited.id, { decals: next.length ? next : undefined });
  const patchDecal = (i: number, patch: Partial<CoverDecal>) => setDecals(decals.map((d, j) => (j === i ? { ...d, ...patch } : d)));
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
      setTab('color');
      setPicked(null);
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
                <button type="button" className={`diary-cover${designClass(n.design)}`} onClick={() => onOpen(n.id)}>
                  <span className="diary-label">{n.name}</span>
                  <CoverDecals decals={n.decals} />
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
            {/* Обложка-образец: на ней видно всё сразу, наклейки двигают
                пальцем прямо по ней */}
            <div className={`diary-color-preview${designClass(edited.design)}`} style={{ '--cover': edited.color } as CSSProperties}>
              <span className="diary-label">{draft.trim() || edited.name}</span>
              <CoverDecals
                decals={decals}
                selected={tab === 'decals' ? picked : null}
                onSelect={i => {
                  setTab('decals');
                  setPicked(i);
                }}
                onMove={(i, x, y) => patchDecal(i, { x, y })}
              />
            </div>
            {/* Обложку настраивают (просьба автора): цвет, узор, наклейки */}
            <div className="diary-tabs" role="tablist">
              {(
                [
                  ['color', 'Цвет'],
                  ['design', 'Дизайн'],
                  ['decals', 'Наклейки']
                ] as const
              ).map(([id, label]) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'is-active' : undefined} onClick={() => setTab(id)}>
                  {label}
                </button>
              ))}
            </div>
            {tab === 'color' && <ColorWheel color={edited.color} size={COVER_WHEEL_SIZE} label="Цвет обложки" onPick={c => onChange(edited.id, { color: c })} />}
            {tab === 'design' && (
              <div className="diary-designs" role="radiogroup" aria-label="Дизайн обложки">
                {COVER_DESIGNS.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    role="radio"
                    aria-checked={coverDesignOf(edited.design) === d.id}
                    className={coverDesignOf(edited.design) === d.id ? 'is-active' : undefined}
                    onClick={() => onChange(edited.id, { design: d.id === 'plain' ? undefined : d.id })}
                  >
                    <span className={`cover-swatch${designClass(d.id)}`} style={{ '--cover': edited.color } as CSSProperties} />
                    {d.label}
                  </button>
                ))}
              </div>
            )}
            {tab === 'decals' && (
              <>
                {picked !== null && decals[picked] ? (
                  <div className="diary-decal-tools">
                    <button type="button" aria-label="Меньше" onClick={() => patchDecal(picked, { size: Math.max(0.12, decals[picked].size - 0.06) })}>
                      −
                    </button>
                    <button type="button" aria-label="Больше" onClick={() => patchDecal(picked, { size: Math.min(0.9, decals[picked].size + 0.06) })}>
                      +
                    </button>
                    <button type="button" aria-label="Повернуть" onClick={() => patchDecal(picked, { rotate: ((decals[picked].rotate ?? 0) + 15) % 360 })}>
                      ↻
                    </button>
                    <button
                      type="button"
                      className="diary-delete"
                      onClick={() => {
                        setDecals(decals.filter((_, j) => j !== picked));
                        setPicked(null);
                      }}
                    >
                      Убрать
                    </button>
                  </div>
                ) : (
                  <p className="diary-hint">Нажмите наклейку — она появится на обложке; её можно передвинуть пальцем</p>
                )}
                <div className="diary-decal-grid">
                  {DECALS.map(d => (
                    <button
                      key={d.id}
                      type="button"
                      aria-label={`На обложку: «${d.label}»`}
                      onClick={() => {
                        const next: CoverDecal = {
                          id: newBlockId(),
                          decal: d.id,
                          x: 0.3 + Math.random() * 0.45,
                          y: 0.25 + Math.random() * 0.55,
                          size: 0.36,
                          rotate: Math.round(Math.random() * 30 - 15),
                          glitter: loadGlitter(DEFAULT_GLITTER)
                        };
                        setDecals([...decals, next]);
                        setPicked(decals.length);
                      }}
                    >
                      <img src={decalSrc(d.id)} alt="" draggable={false} />
                    </button>
                  ))}
                </div>
              </>
            )}
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
