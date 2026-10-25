import { useEffect, useState } from 'react';
import { loadPages, loadSpread, savePageText, saveSpread } from '../notes';
import { Page, type FlipDir } from './Page';
import './Notebook.css';

// Лист школьной тетради — 170×205 мм. В мире полотна 5 px на мм,
// клетка 5 мм = 25 px (--cell в Notebook.css)
export const PAGE_WIDTH = 850;
export const PAGE_HEIGHT = 1025;

// Бесконечная раскрытая тетрадь в клетку — предмет фиксированного размера
// в мире Canvas. Разворот spread (с 0) — страницы 2·spread+1 и 2·spread+2;
// на экране всегда только он, сколько бы страниц ни было. Листают уголками
// листов или стрелками на клавиатуре. Переворот — 3D-анимация листа вокруг
// корешка; пока он идёт, под листом уже лежит разворот, куда листаем.
export function Notebook() {
  const [pages, setPages] = useState(loadPages);
  const [spread, setSpread] = useState(loadSpread);
  const [flip, setFlip] = useState<FlipDir | null>(null);

  const startFlip = (dir: FlipDir) => {
    if (flip || (dir === 'prev' && spread === 0)) return;
    // Поле ввода сейчас уедет вместе с листом — убираем клавиатуру
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setFlip(dir);
  };

  const endFlip = () => {
    const next = spread + (flip === 'next' ? 1 : -1);
    setSpread(next);
    saveSpread(next);
    setFlip(null);
  };

  // Стрелки и PageUp/PageDown на клавиатуре, когда не печатаем
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('textarea, input, [contenteditable="true"]')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') startFlip('next');
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') startFlip('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const left = 2 * spread + 1;
  const right = left + 1;
  // Пока лист переворачивается, под ним — страницы разворота, куда листаем
  const [underLeft, underRight] =
    flip === 'next' ? [left, right + 2] : flip === 'prev' ? [left - 2, right] : [left, right];

  const page = (n: number, side: 'left' | 'right') => (
    <Page
      key={n}
      number={n}
      side={side}
      data={pages[n]}
      face={flip !== null}
      onText={text => setPages(savePageText(pages, n, text))}
      onFlip={startFlip}
    />
  );

  return (
    <div className="notebook">
      {page(underLeft, 'left')}
      {page(underRight, 'right')}

      {flip && (
        <div
          className={`flip flip-${flip}`}
          onAnimationEnd={e => {
            if (e.target === e.currentTarget) endFlip();
          }}
        >
          {/* Лицевая сторона — страница, которую листаем; оборот — та, что
              откроется на другой стороне разворота */}
          <Page
            number={flip === 'next' ? right : left}
            side={flip === 'next' ? 'right' : 'left'}
            data={pages[flip === 'next' ? right : left]}
            face
            className="flip-face flip-front"
          />
          <Page
            number={flip === 'next' ? right + 1 : left - 1}
            side={flip === 'next' ? 'left' : 'right'}
            data={pages[flip === 'next' ? right + 1 : left - 1]}
            face
            className="flip-face flip-back"
          />
        </div>
      )}

      <div className="notebook-spine" aria-hidden="true">
        <span className="staple" />
        <span className="staple" />
      </div>
    </div>
  );
}
