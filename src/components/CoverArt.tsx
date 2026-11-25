import { memo, useRef, type CSSProperties, type PointerEvent } from 'react';
import type { CoverDecal } from '../notes';
import { DEFAULT_GLITTER, decalSrc } from '../textStyle';
import { Glitter, glitterMotionProps, glitterRandom } from './Glitter';
import './CoverArt.css';

type Props = {
  decals?: CoverDecal[];
  // Окно блокнота: какая наклейка выбрана, выбрать и перетащить пальцем
  // (x, y — доли обложки; final — палец отпустили); в меню — без них
  selected?: number | null;
  onSelect?: (i: number) => void;
  onMove?: (i: number, x: number, y: number, final: boolean) => void;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const COVER_CYCLE = 7200;

// В каждом участке из четырёх ячеек есть по одной крупинке каждой фазы.
// Фазы затухают и загораются по очереди, равномерно по площади обложки.
export const CoverGlitter = memo(function CoverGlitter({ seed }: { seed: string }) {
  const rnd = glitterRandom(seed + ':cover');
  const groups = Array.from({ length: 4 }, () => ({ fine: '', bright: '' }));
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 5; col++) {
      const shift = Math.floor(rnd() * 4), direction = rnd() < 0.5 ? 1 : 3;
      const weight = rnd() < 0.35 ? 'bright' : 'fine';
      for (let cell = 0; cell < 4; cell++) {
        const x = (2 * col + cell % 2) * 10 + 2 + rnd() * 6;
        const y = (2 * row + Math.floor(cell / 2)) * 10 + 2 + rnd() * 6;
        groups[(shift + direction * cell) % 4][weight] += `M${x.toFixed(1)} ${y.toFixed(1)}h.02`;
      }
    }
  }
  const offset = Math.round(rnd() * COVER_CYCLE);
  return <svg {...glitterMotionProps} className="cover-glitter" aria-hidden="true" viewBox="0 0 100 140" preserveAspectRatio="none"
    fill="none" strokeLinecap="round">
    {groups.map((g, i) => <g key={i} style={{
      animationDuration: `${COVER_CYCLE}ms`, animationDelay: `-${offset + i * COVER_CYCLE / 8}ms`,
      '--cover-shift': `translate(${i % 2 ? 1.4 : -1.4}px, ${i < 2 ? 1.5 : -1.5}px)`
    } as CSSProperties}>
      <path d={g.fine} stroke="#fff1ce" strokeWidth="1.55" />
      <path d={g.bright} stroke="#fff" strokeWidth="2.15" />
    </g>)}
  </svg>;
});

// Наклейки на обложке блокнота (просьба автора: «лепить на обложку
// наклейки»): те же картинки с блёстками, что на листах; место и размер — в
// долях обложки, поэтому они одинаково ложатся и на маленькую обложку в
// меню, и на крупный образец в окне блокнота. Поверх наклейки с названием
export function CoverDecals({ decals, selected = null, onSelect, onMove }: Props) {
  const start = useRef<{ px: number; py: number; x: number; y: number } | null>(null);
  if (!decals?.length) return null;
  const editable = !!onSelect;
  const handlers = (i: number, d: CoverDecal) =>
    editable
      ? {
          onPointerDown: (e: PointerEvent<HTMLSpanElement>) => {
            e.stopPropagation();
            e.currentTarget.setPointerCapture(e.pointerId);
            start.current = { px: e.clientX, py: e.clientY, x: d.x, y: d.y };
            onSelect?.(i);
          },
          onPointerMove: (e: PointerEvent<HTMLSpanElement>) => move(e, i, false),
          onPointerUp: (e: PointerEvent<HTMLSpanElement>) => {
            move(e, i, true);
            start.current = null;
          }
        }
      : {};
  const move = (e: PointerEvent<HTMLSpanElement>, i: number, final: boolean) => {
    const s = start.current;
    const box = e.currentTarget.parentElement?.getBoundingClientRect();
    if (!s || !box || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    // Не за край обложки (просьба автора): середина — не ближе половины
    // наклейки к краю (по высоте — в долях высоты обложки)
    const d = decals?.[i];
    const hx = (d?.size ?? 0) / 2;
    const hy = (((d?.size ?? 0) / 2) * box.width) / box.height;
    const x = Math.min(1 - hx, Math.max(hx, s.x + (e.clientX - s.px) / box.width));
    const y = Math.min(1 - hy, Math.max(hy, s.y + (e.clientY - s.py) / box.height));
    onMove?.(i, clamp01(x), clamp01(y), final);
  };
  return (
    <span className={editable ? 'cover-decals is-editable' : 'cover-decals'} aria-hidden={!editable}>
      {decals.map((d, i) => (
        <span
          key={d.id}
          className={selected === i ? 'cover-decal is-selected' : 'cover-decal'}
          style={{ left: `${d.x * 100}%`, top: `${d.y * 100}%`, width: `${d.size * 100}%`, transform: `translate(-50%, -50%) rotate(${d.rotate ?? 0}deg)` }}
          {...handlers(i, d)}
        >
          <img src={decalSrc(d.decal)} alt="" draggable={false} />
          <Glitter seed={d.id} amount={d.glitter ?? DEFAULT_GLITTER} />
        </span>
      ))}
    </span>
  );
}

// Узор обложки: «Звёздное небо» заменила «Книжка с закладкой»
export const coverDesignOf = (design?: string) => (design === 'stars' ? 'book' : (design ?? 'plain'));
// Класс узора обложки (CoverArt.css: .design-*); однотонная — без класса
export const designClass = (design?: string) => {
  const d = coverDesignOf(design);
  return d !== 'plain' ? ` design-${d}` : '';
};
