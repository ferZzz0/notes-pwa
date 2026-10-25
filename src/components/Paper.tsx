import { useImperativeHandle, useRef, type Ref } from 'react';
import type { Camera, Size } from './Canvas';
import './Paper.css';

export type PaperHandle = {
  update: (cam: Camera, size: Size) => void;
};

// Что видно: весь разворот или одна страница
export type PaperDisplay = 'both' | 'left' | 'right';

// Бумага листа — фон полотна (Canvas). Лист всегда закрывает весь экран
// (камера не выходит за него), поэтому сама бумага — просто цвет фона, а
// камера двигает только линию корешка (x = 0 мира): это отдельный слой,
// который получает лишь transform и не перерисовывается. Тени у сгиба нет —
// лист ровный.
export function Paper({ ref, display }: { ref?: Ref<PaperHandle>; display: PaperDisplay }) {
  const spine = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      update(cam) {
        spine.current!.style.transform = `translateX(${cam.x}px)`;
      }
    }),
    []
  );

  return (
    <div className={`paper paper-${display}`} aria-hidden="true">
      <div ref={spine} className="paper-spine" />
    </div>
  );
}
