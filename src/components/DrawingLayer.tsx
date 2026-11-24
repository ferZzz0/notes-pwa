import { memo, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { inkBounds, isInk, packInk, simplifyInk, splitAtPageEdges, type DrawingOptions, type Ink, type InkBlock, type InkLine, type InkPart, type InkPoint, type Sheet, type Sheets } from '../drawing';
import { eraseStrokes } from '../inkEraser';
import { brushPath, linePath } from '../inkPaths';
import { newBlockId, type Block } from '../notes';
import type { DrawGesture, DrawSample, Rect } from './Canvas';

const InkShape = memo(function InkShape({ brush, size, points, color }: Ink & { color: string }) {
  if (brush === 'brush') return <path d={brushPath({ brush, size, points })} fill={color} />;
  const opacity = brush === 'marker' ? 0.43 : brush === 'pencil' ? 0.55 : 1;
  if (points.length === 1) return <circle cx={points[0][0]} cy={points[0][1]} r={size / 2} fill={color} opacity={opacity} />;
  const line = linePath({ points });
  return (
    <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <path d={line} strokeWidth={size} opacity={opacity} />
      {brush === 'pencil' && (
        <path d={line} strokeWidth={size * 0.46} strokeDasharray={`${size * 0.12} ${size * 0.55} ${size * 0.7} ${size * 0.32}`} opacity="0.56" />
      )}
    </g>
  );
});

const CutPath = memo(function CutPath({ cut }: { cut: InkLine }) {
  return cut.points.length === 1
    ? <circle cx={cut.points[0][0]} cy={cut.points[0][1]} r={cut.size / 2} fill="black" />
    : <path d={linePath(cut)} fill="none" stroke="black" strokeWidth={cut.size} strokeLinecap="round" strokeLinejoin="round" />;
});

const InkGraphic = memo(function InkGraphic({ block }: { block: InkBlock }) {
  const mask = useId();
  const { x, y, w, h } = inkBounds(block.ink);
  const { cuts, points, brush, size } = block.ink;
  const shape = <InkShape brush={brush} size={size} points={points} color={block.color!} />;
  return cuts?.length ? <>
    <defs><mask id={mask} maskUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
      <rect x={x} y={y} width={w} height={h} fill="white" />
      {cuts.map((cut, i) => <CutPath key={i} cut={cut} />)}
    </mask></defs>
    <g mask={`url(#${mask})`}>{shape}</g>
  </> : shape;
});

// Копия листа для перелистывания и PNG использует тот же векторный рисунок.
export const InkItem = memo(function InkItem({ block }: { block: InkBlock }) {
  const { x, y, w, h } = inkBounds(block.ink);
  return (
    <div className="ink-item" style={{ left: block.x + x, top: block.y + y, width: w, height: h }} aria-hidden="true">
      <svg width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`}>
        <InkGraphic block={block} />
      </svg>
    </div>
  );
});

const SavedStrokes = memo(function SavedStrokes({ blocks }: { blocks: InkBlock[] }) {
  return <>{blocks.map(b => <g key={b.id} transform={`translate(${b.x} ${b.y})`}><InkGraphic block={b} /></g>)}</>;
});

type EraserPreview = { paths: Record<Sheet, string>; at: InkPoint; size: number; view: Rect };

function erasePath(parts: InkPart[], side: Sheet) {
  return parts.filter(p => p.side === side).map(({ points }) => {
    const line = linePath({ points });
    return points.length === 1 ? line + 'l0 0' : line;
  }).join(' ');
}

function InkSheet({ blocks, side, eraser }: { blocks: InkBlock[]; side: Sheet; eraser: EraserPreview | null }) {
  const id = useId();
  const bounds = useMemo(() => {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const b of blocks) {
      const box = inkBounds(b.ink), x = b.x + box.x, y = b.y + box.y;
      left = Math.min(left, x); top = Math.min(top, y);
      right = Math.max(right, x + box.w); bottom = Math.max(bottom, y + box.h);
    }
    return { left, top, width: right - left, height: bottom - top };
  }, [blocks]);
  if (!blocks.length) return null;
  const active = eraser?.paths[side] ? eraser : null;
  const v = active?.view;
  return <div className="item-clip ink-clip" data-clip={side}>
    <div className="ink-item" style={bounds}>
      <svg width={bounds.width} height={bounds.height} viewBox={`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`}>
        {active && v && <defs><mask id={id} maskUnits="userSpaceOnUse" x={v.x} y={v.y} width={v.w} height={v.h}>
          <rect x={v.x} y={v.y} width={v.w} height={v.h} fill="white" />
          <path d={active.paths[side]} fill="none" stroke="black" strokeWidth={active.size} strokeLinecap="round" strokeLinejoin="round" />
        </mask></defs>}
        <g mask={active ? `url(#${id})` : undefined}><SavedStrokes blocks={blocks} /></g>
      </svg>
    </div>
  </div>;
}

type Edit = (blocks: Block[]) => Block[];
export type DrawingHandle = {
  start: (point: DrawSample, scale: number, view: Rect) => DrawGesture;
  cancel: () => void;
};
type Props = {
  ref: Ref<DrawingHandle>;
  blocks: Block[];
  display: Sheets;
  options: DrawingOptions;
  onEdit: (change: Edit) => void;
};

// Только этот слой перерисовывается во время жеста. В историю и хранилище
// идёт один законченный шаг. Щипок или pointercancel отбрасывает черновик.
export function DrawingLayer({ ref, blocks, display, options, onEdit }: Props) {
  const [draft, setDraft] = useState<InkBlock[]>([]);
  const [eraser, setEraser] = useState<EraserPreview | null>(null);
  const original = useMemo(() => blocks.filter(isInk), [blocks]);
  const sides = useMemo(() => ({ left: original.filter(b => b.x < 0), right: original.filter(b => b.x >= 0) }), [original]);
  const active = useRef<DrawGesture | null>(null);
  useEffect(() => () => active.current?.cancel(), []);
  useImperativeHandle(ref, () => ({
    cancel: () => active.current?.cancel(),
    start(first, scale, view) {
      active.current?.cancel();
      const { tool, colors, sizes } = options;
      const size = sizes[tool] / scale;
      const points: InkPoint[] = [], ids: string[] = [];
      let previous: DrawSample | undefined, frame = 0, open = true;
      let compactedUntil = 0;
      const segments = (final: boolean) => {
        if (tool === 'eraser') return [];
        return splitAtPageEdges(points, display).map((part, i) => {
          if (final) part.points = simplifyInk(part.points, 0.38 / scale, size);
          return packInk(part, tool, size, colors[tool], ids[i] ??= newBlockId());
        });
      };
      const move = (samples: DrawSample[]) => {
        if (!open) return;
        for (const sample of samples) {
          const dx = sample.x - (previous?.x ?? sample.x), dy = sample.y - (previous?.y ?? sample.y);
          if (previous && dx === 0 && dy === 0) continue;
          const p: InkPoint = [sample.x, sample.y];
          if (tool === 'brush') {
            // Стилус передаёт нажим. У пальца и мыши кончик сужается на быстрых движениях.
            const speed = Math.hypot(dx, dy) * scale / Math.max(1, sample.time - (previous?.time ?? sample.time));
            const last = points[points.length - 1]?.[2] ?? 0.45;
            p.push(sample.pressure === undefined ? last * 0.6 + 0.4 / (1 + speed) : 0.18 + 0.82 * sample.pressure);
          }
          points.push(p);
          previous = sample;
        }
        // Длинный непрерывный штрих не должен заново рисовать тысячи
        // практически совпадающих отсчётов стилуса на каждом кадре.
        if (points.length - compactedUntil >= 128) {
          const tail = simplifyInk(points.slice(compactedUntil), 0.16 / scale, size);
          points.length = compactedUntil;
          for (const p of tail) points.push(p);
          compactedUntil = points.length - 1;
        }
        if (!frame) frame = requestAnimationFrame(() => {
          frame = 0;
          if (tool === 'eraser' && previous) {
            const parts = splitAtPageEdges(points, display);
            setEraser({ paths: { left: erasePath(parts, 'left'), right: erasePath(parts, 'right') }, at: [previous.x, previous.y], size, view });
          } else setDraft(segments(false));
        });
      };
      const close = () => {
        open = false;
        cancelAnimationFrame(frame);
        active.current = null;
        if (tool === 'eraser') setEraser(null);
        else setDraft([]);
      };
      const gesture = {
        move, cancel: () => { if (open) close(); },
        end: () => {
          if (!open) return;
          if (tool === 'eraser') {
            const changes = eraseStrokes(original, splitAtPageEdges(points, display), size, scale);
            if (changes.size) onEdit(all => all.flatMap(b => {
              const next = changes.get(b.id);
              return next === null ? [] : [next ?? b];
            }));
          } else {
            const added = segments(true);
            if (added.length) onEdit(all => [...all, ...added]);
          }
          close();
        }
      };
      active.current = gesture;
      move([first]);
      return gesture;
    }
  }));

  return (
    <div className="page-side drawing-layer" aria-hidden="true">
      <InkSheet blocks={sides.left} side="left" eraser={eraser} />
      <InkSheet blocks={sides.right} side="right" eraser={eraser} />
      {draft.map(b => (
        <div key={b.id} className="item-clip ink-clip" data-clip={b.x < 0 ? 'left' : 'right'}><InkItem block={b} /></div>
      ))}
      {eraser && <div className="eraser-tip" style={{ left: eraser.at[0], top: eraser.at[1], width: eraser.size, height: eraser.size }} />}
    </div>
  );
}
