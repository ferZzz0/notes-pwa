import { useRef, type PointerEvent } from 'react';
import type { CoverDecal } from '../notes';
import { DEFAULT_GLITTER, decalSrc } from '../textStyle';
import { Glitter } from './Glitter';
import './CoverArt.css';

type Props = {
  decals?: CoverDecal[];
  // Окно дневника: какая наклейка выбрана, выбрать и перетащить пальцем
  // (x, y — доли обложки; final — палец отпустили); в меню — без них
  selected?: number | null;
  onSelect?: (i: number) => void;
  onMove?: (i: number, x: number, y: number, final: boolean) => void;
};

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Наклейки на обложке дневника (просьба автора: «лепить на обложку
// наклейки»): те же картинки с блёстками, что на листах; место и размер — в
// долях обложки, поэтому они одинаково ложатся и на маленькую обложку в
// меню, и на крупный образец в окне дневника. Поверх наклейки с названием
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
