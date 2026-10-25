import { useEffect, useState } from 'react';
import { saveImage } from '../exportPage';
import type { PageLook } from '../notes';
import type { WheelBase } from '../textStyle';
import { isDark } from '../theme';
import { ColorWheel } from './TextToolbar';
import './PageSettings.css';

// Размер палитры (px)
const WHEEL_SIZE = 150;

type Props = {
  // Номер листа; у листа дня — null
  page: number | null;
  look: PageLook;
  // Сколько листов в дневнике (для «как на листе…»)
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

// Настройки листа — шестерёнка в углу каждой страницы (просьба автора):
// цвет бумаги и цвет надписей листа (номер, дата) на круговой палитре,
// «как у приложения», оформление как у другого листа; очистить лист, удалить
// его (следующие сдвигаются назад), добавить пустой после (следующие —
// вперёд). У листа дня — только цвета и очистка
export function PageSettings({ page, look, pages, onLook, onCopyFrom, onClear, onDelete, onInsertAfter, onExport, onClose }: Props) {
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
  // Палитра от белого (светлые цвета) или от чёрного (тёмные): бумага
  // обычно светлая, надписи — тёмные; на тёмном листе — наоборот
  const [bases, setBases] = useState<Record<Target, WheelBase>>(() => ({
    paper: isDark(look.paper) ? 'dark' : 'light',
    labels: look.labels && !isDark(look.labels) ? 'light' : 'dark'
  }));
  const base = bases[target];

  return (
    <>
      <div className="page-settings-backdrop" onClick={onClose} />
      <div className="page-settings-panel" role="dialog" aria-label={page ? `Настройки листа ${page}` : 'Настройки листа'}>
        <p className="page-settings-title">{page ? `Лист ${page}` : 'Лист дня'}</p>

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
            <span className="page-settings-dot" style={{ background: look.labels ?? 'var(--page-ink)' }} />
            Номер и дата
          </button>
        </div>

        <div className="page-settings-color">
          <ColorWheel
            color={color}
            base={base}
            size={WHEEL_SIZE}
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
                  aria-checked={base === b}
                  className={base === b ? 'is-active' : undefined}
                  onClick={() => setBases({ ...bases, [target]: b })}
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

        {confirm ? (
          <div className="page-settings-confirm" role="alertdialog">
            <p>{confirm === 'clear' ? 'Убрать с листа всё, что на нём есть?' : 'Удалить лист? Следующие сдвинутся на его место.'}</p>
            <div>
              <button
                type="button"
                className="page-settings-danger"
                onClick={() => {
                  setConfirm(null);
                  if (confirm === 'clear') onClear();
                  else onDelete();
                }}
              >
                {confirm === 'clear' ? 'Очистить' : 'Удалить'}
              </button>
              <button type="button" onClick={() => setConfirm(null)}>
                Отмена
              </button>
            </div>
          </div>
        ) : (
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
        )}
      </div>
    </>
  );
}
