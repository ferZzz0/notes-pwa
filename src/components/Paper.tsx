import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import type { Camera, Size } from './Canvas';
import './Paper.css';

export type PaperHandle = {
  update: (cam: Camera, size: Size) => void;
};

// Что видно: весь разворот или одна страница (бумага обрывается у корешка)
export type PaperDisplay = 'both' | 'left' | 'right';

// Бесконечный лист раскрытой тетради — фон полотна (Canvas), в координатах
// экрана. Бумага гладкая, без клетки, поэтому её не нужно рисовать как
// бесконечную картинку: это три слоя — лист, тень у сгиба и корешок,
// которые камера только сдвигает (transform), ничего не перерисовывая.
// Верхний край листа — y = 0 мира, корешок — x = 0.
export function Paper({ ref, display }: { ref?: Ref<PaperHandle>; display: PaperDisplay }) {
  const sheet = useRef<HTMLDivElement>(null);
  const fold = useRef<HTMLDivElement>(null);
  const spine = useRef<HTMLDivElement>(null);
  const last = useRef<{ cam: Camera; size: Size } | null>(null);
  const shown = useRef(display);
  shown.current = display;

  const update = (cam: Camera, size: Size) => {
    last.current = { cam, size };
    // Экранные координаты верхнего края листа и корешка
    const top = cam.y;
    const spineX = cam.x;
    // Лист — два экрана в ширину и в высоту: его края не уезжают дальше
    // экрана за пределы видимого, так что бумага всегда закрывает всё, что
    // должна. Для одной страницы край листа — у корешка
    const sheetX =
      shown.current === 'right'
        ? Math.min(Math.max(spineX, -size.w), size.w)
        : shown.current === 'left'
          ? Math.min(Math.max(spineX, 0), 2 * size.w) - 2 * size.w
          : -size.w / 2;
    sheet.current!.style.transform = `translate(${sheetX}px, ${Math.max(top, -size.h)}px)`;
    const from = Math.max(top, 0);
    fold.current!.style.transform = `translate(${spineX}px, ${from}px) scaleX(${cam.scale})`;
    spine.current!.style.transform = `translate(${spineX}px, ${from}px)`;
  };

  useImperativeHandle(ref, () => ({ update }), []);

  // Сменили, что видно, — перерисовываем по последнему положению камеры
  useLayoutEffect(() => {
    if (last.current) update(last.current.cam, last.current.size);
  }, [display]);

  return (
    <div className={`paper paper-${display}`} aria-hidden="true">
      <div ref={sheet} className="paper-sheet" />
      <div ref={fold} className="paper-fold" />
      <div ref={spine} className="paper-spine" />
    </div>
  );
}
