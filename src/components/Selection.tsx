import { useImperativeHandle, useRef, type Ref } from 'react';
import type { Block } from '../notes';
import type { Camera } from './Canvas';
import './Selection.css';

export type SelectionHandle = {
  // Камера сдвинулась или надпись изменилась — рамка встаёт по ней заново
  update: () => void;
};

type Props = {
  ref?: Ref<SelectionHandle>;
  block: Block;
  camera: () => Camera;
};

// Запас рамки вокруг надписи (экранные px)
const PAD = 4;

// Рамка выбранной надписи — только видна, кнопок на ней нет: надпись
// двигают, поворачивают и меняют её размер пальцами (Notebook → Canvas.grab).
// Рамка — поверх полотна, в координатах экрана: тонкая при любом масштабе.
// Встаёт по самой надписи (её поле ввода в .page-texts) при каждом кадре
// камеры и после каждой перерисовки (update).
export function Selection({ ref, block, camera }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const props = useRef({ block, camera });
  props.current = { block, camera };

  useImperativeHandle(
    ref,
    () => ({
      update() {
        const f = frame.current;
        const el = document.querySelector<HTMLElement>(`.page-texts [data-block="${props.current.block.id}"]`);
        if (!f) return;
        if (!el) {
          f.style.visibility = 'hidden';
          return;
        }
        const cam = props.current.camera();
        const { rotate = 0, scale = 1 } = props.current.block;
        // Середина надписи на экране; рамка — её размер с учётом масштаба
        const cx = cam.x + (el.offsetLeft + el.offsetWidth / 2) * cam.scale;
        const cy = cam.y + (el.offsetTop + el.offsetHeight / 2) * cam.scale;
        const w = el.offsetWidth * scale * cam.scale + 2 * PAD;
        const h = el.offsetHeight * scale * cam.scale + 2 * PAD;
        f.style.visibility = '';
        f.style.width = `${w}px`;
        f.style.height = `${h}px`;
        f.style.transform = `translate(${cx - w / 2}px, ${cy - h / 2}px) rotate(${rotate}deg)`;
      }
    }),
    []
  );

  return (
    <div className="selection-layer" aria-hidden="true">
      <div ref={frame} className="selection" />
    </div>
  );
}
