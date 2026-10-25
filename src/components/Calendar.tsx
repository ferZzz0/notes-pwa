import { useMemo, useState } from 'react';
import { daysWithNotes, localDate } from '../notes';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const monthFormat = new Intl.DateTimeFormat('ru', { month: 'long' });
const pad = (n: number) => String(n).padStart(2, '0');

// Месяц в календаре: дни с понедельника, сегодня выделено, у дней с
// записями — точка. Касание по дню открывает его лист (onDay).
export function Calendar({ onDay }: { onDay: (date: string) => void }) {
  const today = localDate();
  const [month, setMonth] = useState(() => {
    const [y, m] = today.split('-').map(Number);
    return { y, m: m - 1 };
  });
  const marked = useMemo(daysWithNotes, []);

  const first = new Date(month.y, month.m, 1);
  // Сколько пустых клеток до 1-го числа: неделя — с понедельника
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(month.y, month.m + 1, 0).getDate();
  const title = monthFormat.format(first);
  const shift = (delta: number) => {
    const d = new Date(month.y, month.m + delta, 1);
    setMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  return (
    <div className="calendar">
      <div className="calendar-head">
        <button type="button" aria-label="Предыдущий месяц" onClick={() => shift(-1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="calendar-title">
          {title[0].toUpperCase() + title.slice(1)} {month.y}
        </span>
        <button type="button" aria-label="Следующий месяц" onClick={() => shift(1)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
      <div className="calendar-grid">
        {WEEKDAYS.map((w, i) => (
          <span key={w} className={i >= 5 ? 'calendar-weekday is-weekend' : 'calendar-weekday'}>
            {w}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`empty-${i}`} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month.y}-${pad(month.m + 1)}-${pad(i + 1)}`;
          const weekend = (offset + i) % 7 >= 5;
          const classes = ['calendar-day', date === today && 'is-today', marked.has(date) && 'has-notes', weekend && 'is-weekend']
            .filter(Boolean)
            .join(' ');
          return (
            <button key={date} type="button" className={classes} onClick={() => onDay(date)}>
              {i + 1}
            </button>
          );
        })}
      </div>
    </div>
  );
}
