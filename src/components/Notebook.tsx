import type { ReactNode } from 'react';
import './Notebook.css';

// Лист школьной тетради — 170×205 мм. В мире полотна 5 px на мм,
// клетка 5 мм = 25 px (--cell в Notebook.css)
export const PAGE_WIDTH = 850;
export const PAGE_HEIGHT = 1025;

type Props = {
  left: ReactNode;
  right: ReactNode;
};

// Раскрытая школьная тетрадь в клетку: два листа и корешок со скрепками.
// Это предмет фиксированного размера в мире Canvas; содержимое страниц
// передаётся снаружи. Листы — цели двойного касания (data-zoom-target).
export function Notebook({ left, right }: Props) {
  return (
    <div className="notebook">
      <section className="page page-left" data-zoom-target>
        {left}
      </section>
      <section className="page page-right" data-zoom-target>
        {right}
      </section>
      <div className="notebook-spine" aria-hidden="true">
        <span className="staple" />
        <span className="staple" />
      </div>
    </div>
  );
}
