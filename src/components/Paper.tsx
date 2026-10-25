import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import type { Camera, Rect, Size } from './Canvas';
import './Paper.css';

export type PaperHandle = {
  update: (cam: Camera, size: Size, bounds: Rect | null) => void;
};

// Что видно: весь разворот или одна страница (бумага обрывается у корешка)
export type PaperDisplay = 'both' | 'left' | 'right';

// Края, ушедшие за экран дальше этого, держим чуть за краем экрана
const OFFSCREEN = 60;

// Лист раскрытой тетради — фон полотна (Canvas), в координатах экрана.
// Бумага гладкая, поэтому это три слоя — лист, тень у сгиба и корешок,
// которые камера только сдвигает и растягивает (transform), ничего не
// перерисовывая. Лист — прямоугольник bounds из Canvas; во время перехода
// (bounds нет) — бесконечная бумага ниже верхнего края, у одной страницы —
// до корешка. Верхний край листа — y = 0 мира, корешок — x = 0.
export function Paper({ ref, display }: { ref?: Ref<PaperHandle>; display: PaperDisplay }) {
  const sheet = useRef<HTMLDivElement>(null);
  const fold = useRef<HTMLDivElement>(null);
  const spine = useRef<HTMLDivElement>(null);
  const last = useRef<{ cam: Camera; size: Size; bounds: Rect | null } | null>(null);
  const shown = useRef(display);
  shown.current = display;

  const update = (cam: Camera, size: Size, bounds: Rect | null) => {
    last.current = { cam, size, bounds };
    const sx = (wx: number) => cam.x + wx * cam.scale;
    const sy = (wy: number) => cam.y + wy * cam.scale;
    const spineX = sx(0);
    let l = -Infinity;
    let r = Infinity;
    let t = sy(0);
    let b = Infinity;
    if (bounds) {
      l = sx(bounds.x);
      r = sx(bounds.x + bounds.w);
      t = sy(bounds.y);
      b = sy(bounds.y + bounds.h);
    } else {
      if (shown.current === 'right') l = spineX;
      if (shown.current === 'left') r = spineX;
    }
    l = Math.max(l, -OFFSCREEN);
    r = Math.min(r, size.w + OFFSCREEN);
    t = Math.max(t, -OFFSCREEN);
    b = Math.min(b, size.h + OFFSCREEN);
    const w = Math.max(r - l, 0);
    const h = Math.max(b - t, 0);
    // Слои размером с экран, растянутые до нужного прямоугольника
    sheet.current!.style.transform = `translate(${l}px, ${t}px) scale(${w / size.w}, ${h / size.h})`;
    fold.current!.style.transform = `translate(${spineX}px, ${t}px) scale(${cam.scale}, ${h / size.h})`;
    spine.current!.style.transform = `translate(${spineX}px, ${t}px) scaleY(${h / size.h})`;
  };

  useImperativeHandle(ref, () => ({ update }), []);

  // Сменили, что видно, — перерисовываем по последнему положению камеры
  useLayoutEffect(() => {
    if (last.current) update(last.current.cam, last.current.size, last.current.bounds);
  }, [display]);

  return (
    <div className={`paper paper-${display}`} aria-hidden="true">
      <div ref={sheet} className="paper-sheet" />
      <div ref={fold} className="paper-fold" />
      <div ref={spine} className="paper-spine" />
    </div>
  );
}
