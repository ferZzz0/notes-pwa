import type { ReactNode } from 'react';
import './Notebook.css';

type Props = {
  left: ReactNode;
  right: ReactNode;
};

// Раскрытая школьная тетрадь в клетку: обложка, два листа с полями,
// корешок со скрепками. Содержимое страниц передаётся снаружи.
export function Notebook({ left, right }: Props) {
  return (
    <div className="notebook-scene">
      <div className="notebook">
        <section className="page page-left">{left}</section>
        <section className="page page-right">{right}</section>
        <div className="notebook-spine" aria-hidden="true">
          <span className="staple" />
          <span className="staple" />
        </div>
      </div>
    </div>
  );
}
