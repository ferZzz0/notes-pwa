import { localDate, type PageData } from '../notes';
import './Page.css';

export type Side = 'left' | 'right';
export type FlipDir = 'next' | 'prev';

const dateFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' });

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return dateFormat.format(new Date(y, m - 1, d));
}

type Props = {
  number: number;
  side: Side;
  data?: PageData;
  // Лист «картинкой» — пока переворачивается: без поля ввода, уголков и
  // приближения двойным касанием
  face?: boolean;
  className?: string;
  onText?: (text: string) => void;
  onFlip?: (dir: FlipDir) => void;
};

// Один лист тетради. Первая страница — титульная, на остальных пишут.
// Вверху дата, когда на странице впервые написали (на пустой — сегодняшняя,
// бледно), как в школе. Загнутый уголок внизу у внешнего края листает.
export function Page({ number, side, data, face = false, className = '', onText, onFlip }: Props) {
  return (
    <section className={`page page-${side} ${className}`} data-zoom-target={face ? undefined : ''}>
      <span className="page-number">{number}</span>

      {number === 1 ? (
        <>
          <h1 className="page-title">Мои заметки</h1>
          <p className="page-muted">Пишите на любой странице — их сколько угодно.</p>
          <p className="page-muted">
            Тетрадь можно двигать и приближать пальцами, двойное касание — к листу и обратно.
          </p>
          <p className="page-muted">Загнутый уголок внизу листа — перелистнуть страницу.</p>
        </>
      ) : (
        <>
          <p className={data ? 'page-date' : 'page-date page-date-empty'}>
            {formatDate(data?.created ?? localDate())}
          </p>
          {face ? (
            <div className="note-text">{data?.text}</div>
          ) : (
            <textarea
              className="note-text"
              value={data?.text ?? ''}
              onChange={e => onText?.(e.target.value)}
              placeholder="Пишите здесь…"
              aria-label={`Страница ${number}`}
            />
          )}
        </>
      )}

      {!face && side === 'right' && (
        <button
          type="button"
          className="page-corner page-corner-next"
          data-no-pan
          aria-label="Следующая страница"
          onClick={() => onFlip?.('next')}
        />
      )}
      {!face && side === 'left' && number > 1 && (
        <button
          type="button"
          className="page-corner page-corner-prev"
          data-no-pan
          aria-label="Предыдущая страница"
          onClick={() => onFlip?.('prev')}
        />
      )}
    </section>
  );
}
