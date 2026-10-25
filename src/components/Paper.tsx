import { useImperativeHandle, useRef, type Ref } from 'react';
import type { Camera, Size } from './Canvas';
import './Paper.css';

export type PaperHandle = {
  update: (cam: Camera, size: Size) => void;
};

// Бесконечный лист раскрытой тетради — фон полотна (Canvas), в координатах
// экрана. Бумага гладкая, без клетки, поэтому её не нужно рисовать как
// бесконечную картинку: это три слоя — лист, тень у сгиба и корешок,
// которые камера только сдвигает (transform), ничего не перерисовывая.
// Верхний край листа — y = 0 мира, корешок — x = 0.
export function Paper({ ref }: { ref?: Ref<PaperHandle> }) {
  const sheet = useRef<HTMLDivElement>(null);
  const fold = useRef<HTMLDivElement>(null);
  const spine = useRef<HTMLDivElement>(null);

  useImperativeHandle(
    ref,
    () => ({
      update(cam, size) {
        // Экранные координаты верхнего края листа и корешка
        const top = cam.y;
        const spineX = cam.x;
        // Лист высотой в два экрана: его край не уезжает выше одного экрана,
        // так что бумага всегда закрывает всё ниже края
        sheet.current!.style.transform = `translateY(${Math.max(top, -size.h)}px)`;
        const from = Math.max(top, 0);
        fold.current!.style.transform = `translate(${spineX}px, ${from}px) scaleX(${cam.scale})`;
        spine.current!.style.transform = `translate(${spineX}px, ${from}px)`;
      }
    }),
    []
  );

  return (
    <div className="paper" aria-hidden="true">
      <div ref={sheet} className="paper-sheet" />
      <div ref={fold} className="paper-fold" />
      <div ref={spine} className="paper-spine" />
    </div>
  );
}
