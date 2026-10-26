import { useEffect, useState } from 'react';
import { saveImage } from '../exportPage';
import type { PageLook } from '../notes';
import { toTone, type Tone } from '../textStyle';
import { isDark, loadBrand } from '../theme';
import { ConfirmDialog } from './ConfirmDialog';
import { TonePalette } from './TonePalette';
import './PageSettings.css';

// Бумага «как у приложения» (index.css: --paper) — от неё считается её
// тёмный вариант
const DEFAULT_PAPER = '#fffdf6';

type Props = {
  // Номер листа; у листа дня — null
  page: number | null;
  // На развороте — его две страницы: какую настраивать, выбирают вверху
  pair: [number, number] | null;
  onPage: (page: number) => void;
  // «Отменить» и «Вернуть» — оформление только этой страницы, по её
  // собственной истории (хранится вместе с листом — просьба автора)
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  look: PageLook;
  // Сколько листов в блокноте (для «как на листе…»)
  pages: number;
  // Цвет бумаги или надписей; final — палец отпустили (сохранить)
  onLook: (patch: PageLook, final: boolean) => void;
  onCopyFrom: (page: number) => void;
  onClear: () => void;
  onDelete: () => void;
  onInsertAfter: () => void;
  // Нарисовать лист картинкой (файл PNG)
  onExport: () => Promise<File>;
  onClose: () => void;
};

type Target = 'paper' | 'labels';
type Confirm = 'clear' | 'delete' | null;
// Экспорт: рисуем; готово (картинка и её адрес для превью); не вышло
type Shot = 'busy' | 'error' | { file: File; url: string } | null;

// Настройки листа — шестерёнка в нижнем ряду (просьба автора):
// цвет бумаги и цвет надписей листа (номер, дата) на палитре светлых или
// тёмных цветов,
// «как у приложения», оформление как у другого листа; очистить лист, удалить
// его (следующие сдвигаются назад), добавить пустой после (следующие —
// вперёд). У листа дня — только цвета и очистка
export function PageSettings({
  page,
  pair,
  onPage,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  look,
  pages,
  onLook,
  onCopyFrom,
  onClear,
  onDelete,
  onInsertAfter,
  onExport,
  onClose
}: Props) {
  const [target, setTarget] = useState<Target>('paper');
  const [shot, setShot] = useState<Shot>(null);
  // Превью больше не нужно — его адрес освобождаем
  useEffect(
    () => () => {
      if (shot && typeof shot === 'object') URL.revokeObjectURL(shot.url);
    },
    [shot]
  );
  // Экспорт (просьба автора): лист картинкой, без кнопок и рамок; сохранить —
  // вторым нажатием («Поделиться» открывается только прямо из нажатия, а
  // рисование занимает время)
  const startExport = async () => {
    setShot('busy');
    try {
      const file = await onExport();
      setShot({ file, url: URL.createObjectURL(file) });
    } catch {
      setShot('error');
    }
  };
  const [confirm, setConfirm] = useState<Confirm>(null);
  const others = Array.from({ length: Math.max(pages, page ?? 0) }, (_, i) => i + 1).filter(n => n !== page);
  const [from, setFrom] = useState(others[0] ?? 0);
  const color = target === 'paper' ? look.paper : look.labels;
  // Какие цвета на палитре — светлые или тёмные (просьба автора: только
  // такие). Бумага обычно светлая, надписи — тёмные; на тёмном листе —
  // наоборот
  const [tones, setTones] = useState<Record<Target, Tone>>(() => ({
    paper: isDark(look.paper) ? 'dark' : 'light',
    labels: look.labels && !isDark(look.labels) ? 'light' : 'dark'
  }));
  const tone = tones[target];
  // Переключили — и выбранный цвет сразу становится светлым или тёмным того
  // же оттенка (без своего — тот, что как у приложения)
  const switchTone = (next: Tone) => {
    setTones({ ...tones, [target]: next });
    const current = color ?? (target === 'paper' ? DEFAULT_PAPER : loadBrand());
    const now: Tone = isDark(current) ? 'dark' : 'light';
    if (now === next) return;
    const c = toTone(current, now, next);
    onLook(target === 'paper' ? { paper: c } : { labels: c }, true);
  };

  return (
    <>
      <div className="page-settings-backdrop" onClick={onClose} />
      <div className="page-settings-panel" role="dialog" aria-label={page ? `Настройки листа ${page}` : 'Настройки листа'}>
        <div className="page-settings-head">
          {pair ? (
            <div className="page-settings-pages" role="tablist" aria-label="Какой лист">
              {pair.map(n => (
                <button key={n} type="button" role="tab" aria-selected={n === page} className={n === page ? 'is-active' : undefined} onClick={() => onPage(n)}>
                  Лист {n}
                </button>
              ))}
            </div>
          ) : (
            <p className="page-settings-title">{page ? `Лист ${page}` : 'Лист дня'}</p>
          )}
          <div className="page-settings-history">
            <button type="button" className="round-button" aria-label="Отменить оформление" disabled={!canUndo} onClick={onUndo}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
            </button>
            <button type="button" className="round-button" aria-label="Вернуть оформление" disabled={!canRedo} onClick={onRedo}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 14 5-5-5-5" />
                <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
              </svg>
            </button>
          </div>
        </div>

        <div className="page-settings-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={target === 'paper'}
            className={target === 'paper' ? 'is-active' : undefined}
            onClick={() => setTarget('paper')}
          >
            <span className="page-settings-dot" style={{ background: look.paper ?? 'var(--paper)' }} />
            Цвет листа
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={target === 'labels'}
            className={target === 'labels' ? 'is-active' : undefined}
            onClick={() => setTarget('labels')}
          >
            <span className="page-settings-dot" style={{ background: look.labels ?? (isDark(look.paper) ? 'color-mix(in srgb, var(--brand) 30%, #fff)' : 'var(--page-ink)') }} />
            Номер и дата
          </button>
        </div>

        <div className="page-settings-color">
          <TonePalette
            color={color}
            tone={tone}
            label={target === 'paper' ? 'Цвет листа' : 'Цвет номера и даты'}
            onPick={(c, final) => onLook(target === 'paper' ? { paper: c } : { labels: c }, final)}
          />
          <div className="page-settings-side">
            <div className="page-settings-base" role="radiogroup" aria-label="Какие цвета на палитре">
              {(['light', 'dark'] as const).map(b => (
                <button
                  key={b}
                  type="button"
                  role="radio"
                  aria-checked={tone === b}
                  className={tone === b ? 'is-active' : undefined}
                  onClick={() => switchTone(b)}
                >
                  {b === 'light' ? 'Светлые' : 'Тёмные'}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="page-settings-reset"
              disabled={!color}
              onClick={() => onLook(target === 'paper' ? { paper: undefined } : { labels: undefined }, true)}
            >
              Как у приложения
            </button>
          </div>
        </div>

        {page !== null && others.length > 0 && (
          <div className="page-settings-copy">
            <span>Как на листе</span>
            <select value={from} aria-label="Лист, с которого скопировать оформление" onChange={e => setFrom(Number(e.target.value))}>
              {others.map(n => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onCopyFrom(from)}>
              Скопировать
            </button>
          </div>
        )}

        <div className="page-settings-export">
          {shot && typeof shot === 'object' ? (
            <>
              <img src={shot.url} alt="Лист картинкой" />
              <div>
                <button type="button" className="page-settings-primary" onClick={() => void saveImage(shot.file).catch(() => setShot('error'))}>
                  Сохранить
                </button>
                <button type="button" onClick={() => setShot(null)}>
                  Отмена
                </button>
              </div>
            </>
          ) : (
            <button type="button" disabled={shot === 'busy'} onClick={() => void startExport()}>
              {shot === 'busy' ? 'Рисую лист…' : shot === 'error' ? 'Не получилось — ещё раз' : 'Экспортировать'}
            </button>
          )}
        </div>

        <div className="page-settings-actions">
          {page !== null && (
            <button type="button" onClick={onInsertAfter}>
              Добавить лист после
            </button>
          )}
          <button type="button" onClick={() => setConfirm('clear')}>
            Очистить лист
          </button>
          {page !== null && (
            <button type="button" className="page-settings-danger-outline" onClick={() => setConfirm('delete')}>
              Удалить лист
            </button>
          )}
        </div>
      </div>

      {/* Подтверждение — окном посреди экрана, как у удаления (просьба автора) */}
      {confirm && (
        <ConfirmDialog
          title={confirm === 'clear' ? (page ? `Очистить лист ${page}?` : 'Очистить лист?') : `Удалить лист ${page}?`}
          note={confirm === 'clear' ? 'С листа уберётся всё, что на нём есть.' : 'Следующие листы сдвинутся на его место.'}
          confirm={confirm === 'clear' ? 'Очистить' : 'Удалить'}
          cancel="Отмена"
          onConfirm={() => {
            setConfirm(null);
            if (confirm === 'clear') onClear();
            else onDelete();
          }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}
