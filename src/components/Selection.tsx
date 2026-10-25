import { useImperativeHandle, useRef, type Ref } from 'react';
import type { Block } from '../notes';
import type { Camera } from './Canvas';
import { LockIcon } from './TextToolbar';
import './Selection.css';

export type SelectionHandle = {
  // Камера сдвинулась или надпись изменилась — рамка встаёт по ней заново
  update: () => void;
};

type Props = {
  ref?: Ref<SelectionHandle>;
  block: Block;
  camera: () => Camera;
  // Ручка ширины на правом краю (надпись, стикер): сдвиг пальца от начала
  // (экранные px) и этап жеста; нет — ручки нет
  onResize?: (dx: number, dy: number, phase: 'start' | 'move' | 'end') => void;
};

// Запас рамки вокруг надписи (экранные px)
const PAD = 4;

// Рамка выбранной надписи — только видна, кнопок на ней нет: надпись
// двигают, поворачивают и меняют её размер пальцами (Notebook → Canvas.grab).
// Рамка — поверх полотна, в координатах экрана: тонкая при любом масштабе.
// Встаёт по самой надписи (её поле ввода в .page-texts) при каждом кадре
// камеры и после каждой перерисовки (update).
export function Selection({ ref, block, camera, onResize }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const start = useRef({ x: 0, y: 0 });
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
        // Поворот и размер — с самой надписи: пока её тащат пальцами, они
        // меняются прямо в DOM (Notebook.grab), раньше, чем в block
        const rotate = Number(el.dataset.rotate ?? 0);
        const scale = Number(el.dataset.scale ?? 1);
        // Пока тащат — сдвиг (translate, data-dx/dy): left/top стоят на месте
        const dx = Number(el.dataset.dx ?? 0);
        const dy = Number(el.dataset.dy ?? 0);
        // Середина надписи на экране; рамка — её размер с учётом масштаба
        const cx = cam.x + (el.offsetLeft + dx + el.offsetWidth / 2) * cam.scale;
        const cy = cam.y + (el.offsetTop + dy + el.offsetHeight / 2) * cam.scale;
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
      <div ref={frame} className="selection">
        {block.locked && (
          <span className="selection-lock">
            <LockIcon locked />
          </span>
        )}
        {onResize && (
          <span
            className="selection-grip"
            role="slider"
            aria-label="Ширина надписи"
            onPointerDown={e => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              start.current = { x: e.clientX, y: e.clientY };
              onResize(0, 0, 'start');
            }}
            onPointerMove={e => {
              if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
              onResize(e.clientX - start.current.x, e.clientY - start.current.y, 'move');
            }}
            onPointerUp={e => onResize(e.clientX - start.current.x, e.clientY - start.current.y, 'end')}
            onPointerCancel={e => onResize(e.clientX - start.current.x, e.clientY - start.current.y, 'end')}
          />
        )}
      </div>
    </div>
  );
}
