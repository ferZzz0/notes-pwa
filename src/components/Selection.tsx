import { useImperativeHandle, useRef, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type Ref } from 'react';
import type { Block } from '../notes';
import type { Camera, Point } from './Canvas';
import './Selection.css';

export type SelectionHandle = {
  // Камера сдвинулась или надпись изменилась — рамка встаёт по ней заново
  update: () => void;
};

type Props = {
  ref?: Ref<SelectionHandle>;
  block: Block;
  // Надпись сейчас печатают (открыта клавиатура)
  focused: boolean;
  camera: () => Camera;
  // Новый левый верхний угол надписи (мир) — Notebook не пускает её за корешок
  onMove: (x: number, y: number) => void;
  onTransform: (rotate: number, scale: number) => void;
  // Отпустили — сохранить
  onEnd: () => void;
  // Касание по выбранной надписи, которую сейчас не печатают, — печатать
  onEdit: () => void;
};

const TAP_SLOP = 8;
const MIN_SCALE = 0.4;
const MAX_SCALE = 4;
// Поворот рядом с прямым углом и размер рядом с обычным «прилипают» к ним
const SNAP_DEG = 4;
const SNAP_SCALE = 0.06;
// Рамка не меньше этого (экранные px), чтобы ручки не налезали друг на друга
const MIN_FRAME = { w: 104, h: 52 };

type Drag = {
  kind: 'move' | 'rotate' | 'scale';
  id: number;
  start: Point;
  block: Block;
  center: Point;
  moved: boolean;
};

const angleOf = (p: Point, c: Point) => (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
// Угол в пределах (−180°, 180°]
const normalize = (deg: number) => {
  const d = ((deg % 360) + 360) % 360;
  return d > 180 ? d - 360 : d;
};
const snapAngle = (deg: number) => {
  const right = Math.round(deg / 90) * 90;
  return Math.abs(deg - right) < SNAP_DEG ? normalize(right) : deg;
};

// Рамка выбранной надписи с ручками: слева сверху — перенести, справа
// сверху — повернуть, справа снизу — размер. Пока надпись не печатают, её
// можно и просто тащить за сам текст, а касание по нему — печатать дальше.
// Рамка — поверх полотна, в координатах экрана: ручки одного размера при
// любом масштабе. Встаёт по самой надписи (её поле ввода в .page-texts) при
// каждом кадре камеры и после каждой перерисовки (update).
export function Selection({ ref, block, focused, camera, onMove, onTransform, onEnd, onEdit }: Props) {
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  // Свежие пропсы для обработчиков жеста
  const props = useRef({ block, onMove, onTransform, onEnd, onEdit, camera });
  props.current = { block, onMove, onTransform, onEnd, onEdit, camera };

  const target = () => document.querySelector<HTMLTextAreaElement>(`.page-texts [data-block="${props.current.block.id}"]`);

  useImperativeHandle(
    ref,
    () => ({
      update() {
        const el = target();
        const f = frame.current;
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
        const w = Math.max(MIN_FRAME.w, el.offsetWidth * scale * cam.scale);
        const h = Math.max(MIN_FRAME.h, el.offsetHeight * scale * cam.scale);
        f.style.visibility = '';
        f.style.width = `${w}px`;
        f.style.height = `${h}px`;
        f.style.transform = `translate(${cx - w / 2}px, ${cy - h / 2}px) rotate(${rotate}deg)`;
      }
    }),
    []
  );

  const begin = (kind: Drag['kind']) => (e: ReactPointerEvent<HTMLElement>) => {
    if (drag.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const r = frame.current!.getBoundingClientRect();
    drag.current = {
      kind,
      id: e.pointerId,
      start: { x: e.clientX, y: e.clientY },
      block: props.current.block,
      center: { x: r.left + r.width / 2, y: r.top + r.height / 2 },
      moved: false
    };
  };

  const move = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const p = { x: e.clientX, y: e.clientY };
    if (!d.moved && Math.hypot(p.x - d.start.x, p.y - d.start.y) < TAP_SLOP) return;
    d.moved = true;
    const { block: b } = d;
    if (d.kind === 'move') {
      const s = props.current.camera().scale;
      props.current.onMove(b.x + (p.x - d.start.x) / s, b.y + (p.y - d.start.y) / s);
    } else if (d.kind === 'rotate') {
      const rotate = snapAngle(normalize((b.rotate ?? 0) + angleOf(p, d.center) - angleOf(d.start, d.center)));
      props.current.onTransform(rotate, b.scale ?? 1);
    } else {
      const from = Math.hypot(d.start.x - d.center.x, d.start.y - d.center.y);
      const to = Math.hypot(p.x - d.center.x, p.y - d.center.y);
      let scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, ((b.scale ?? 1) * to) / Math.max(from, 1)));
      if (Math.abs(scale - 1) < SNAP_SCALE) scale = 1;
      props.current.onTransform(b.rotate ?? 0, scale);
    }
  };

  const end = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (d.moved) props.current.onEnd();
    // Касание по тексту (а не по ручке) — печатать
    else if (e.type === 'pointerup' && d.kind === 'move' && e.currentTarget.classList.contains('selection-body')) props.current.onEdit();
  };

  const handlers = (kind: Drag['kind']) => ({
    onPointerDown: begin(kind),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    // Нажатие на рамку не забирает фокус у поля ввода — клавиатура остаётся
    onMouseDown: (e: ReactMouseEvent) => e.preventDefault()
  });

  return (
    <div className="selection-layer" aria-hidden="true">
      <div ref={frame} className={focused ? 'selection is-focused' : 'selection'}>
        <div className="selection-body" {...handlers('move')} />
        <div className="selection-handle selection-move" {...handlers('move')}>
          <svg viewBox="0 0 24 24">
            <path d="M12 3v18M3 12h18M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
          </svg>
        </div>
        <div className="selection-handle selection-rotate" {...handlers('rotate')}>
          <svg viewBox="0 0 24 24">
            <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4v4h-4" />
          </svg>
        </div>
        <div className="selection-handle selection-scale" {...handlers('scale')}>
          <svg viewBox="0 0 24 24">
            <path d="M13 5h6v6M11 19H5v-6M19 5l-6 6M5 19l6-6" />
          </svg>
        </div>
      </div>
    </div>
  );
}
