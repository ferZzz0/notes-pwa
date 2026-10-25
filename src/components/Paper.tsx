import { useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import type { Camera, Size } from './Canvas';
import './Paper.css';

export type PaperHandle = {
  update: (cam: Camera, size: Size) => void;
};

// Что видно: весь разворот или одна страница
export type PaperDisplay = 'both' | 'left' | 'right';

type Props = {
  ref?: Ref<PaperHandle>;
  display: PaperDisplay;
  // Свой цвет бумаги левой и правой страниц (настройки листа); нет — как у
  // приложения
  left?: string;
  right?: string;
};

// Бумага листа — фон полотна (Canvas). Лист всегда закрывает весь экран
// (камера не выходит за него), поэтому сама бумага — просто цвет фона, а
// камера двигает только линию корешка (x = 0 мира): это отдельный слой,
// который получает лишь transform и не перерисовывается. Тени у сгиба нет —
// лист ровный. Если у страницы свой цвет — слой вдвое шире экрана, слева
// цвет левой страницы, справа правой, граница на корешке (не дальше краёв
// экрана); камера его тоже только двигает.
export function Paper({ ref, display, left, right }: Props) {
  const spine = useRef<HTMLDivElement>(null);
  const tint = useRef<HTMLDivElement>(null);
  const last = useRef<{ cam: Camera; size: Size } | null>(null);

  const place = () => {
    const l = last.current;
    if (!l) return;
    spine.current!.style.transform = `translateX(${l.cam.x}px)`;
    if (tint.current) tint.current.style.transform = `translateX(${Math.min(l.size.w, Math.max(0, l.cam.x)) - l.size.w}px)`;
  };

  useImperativeHandle(
    ref,
    () => ({
      update(cam, size) {
        last.current = { cam, size };
        place();
      }
    }),
    []
  );

  // Слой с цветом появился — сразу на место (камера могла и не двигаться)
  const tinted = !!(left || right);
  useLayoutEffect(place, [tinted]);

  return (
    <div className={`paper paper-${display}`} aria-hidden="true">
      {tinted && (
        <div
          ref={tint}
          className="paper-tint"
          style={{ background: `linear-gradient(to right, ${left ?? 'var(--paper)'} 50%, ${right ?? 'var(--paper)'} 50%)` }}
        />
      )}
      <div ref={spine} className="paper-spine" />
    </div>
  );
}
