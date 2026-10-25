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
// камера двигает только корешок и тень у сгиба (x = 0 мира): это
// отдельные слои, которые получают лишь transform и не перерисовываются.
export function Paper({ ref, display }: { ref?: Ref<PaperHandle>; display: PaperDisplay }) {
  const fold = useRef<HTMLDivElement>(null);
  const spine = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      update(cam) {
        fold.current!.style.transform = `translateX(${cam.x}px) scaleX(${cam.scale})`;
        spine.current!.style.transform = `translateX(${cam.x}px)`;
      }
    }),
    []
  );

  return (
    <div className={`paper paper-${display}`} aria-hidden="true">
      <div ref={fold} className="paper-fold" />
      <div ref={spine} className="paper-spine" />
    </div>
  );
}
