import { memo, useEffect, useId, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { addCut, inkBounds, isInk, packInk, simplifyInk, splitAtPageEdges, type DrawingOptions, type Ink, type InkBlock, type InkLine, type InkPoint, type Sheets } from '../drawing';
import { inspectCut } from '../inkEraser';
import { brushPath, linePath } from '../inkPaths';
import { newBlockId, type Block } from '../notes';
import type { DrawGesture, DrawSample } from './Canvas';

function InkShape({ ink, color }: { ink: Ink; color: string }) {
  const { brush, size, points } = ink;
  if (brush === 'brush') return <path d={brushPath(ink)} fill={color} />;
  const opacity = brush === 'marker' ? 0.43 : brush === 'pencil' ? 0.55 : 1;
  if (points.length === 1) return <circle cx={points[0][0]} cy={points[0][1]} r={size / 2} fill={color} opacity={opacity} />;
  const line = linePath(ink);
  return (
    <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <path d={line} strokeWidth={size} opacity={opacity} />
      {brush === 'pencil' && (
        <path d={line} strokeWidth={size * 0.46} strokeDasharray={`${size * 0.12} ${size * 0.55} ${size * 0.7} ${size * 0.32}`} opacity="0.56" />
      )}
    </g>
  );
}

export const InkItem = memo(function InkItem({ block }: { block: InkBlock }) {
  const mask = useId();
  const { x, y, w, h } = inkBounds(block.ink);
  const cuts = block.ink.cuts;
  const shape = <InkShape ink={block.ink} color={block.color!} />;
  return (
    <div className="ink-item" style={{ left: block.x + x, top: block.y + y, width: w, height: h }} aria-hidden="true">
      <svg width={w} height={h} viewBox={`${x} ${y} ${w} ${h}`}>
        {cuts?.length ? <>
          <defs><mask id={mask} maskUnits="userSpaceOnUse" x={x} y={y} width={w} height={h}>
            <rect x={x} y={y} width={w} height={h} fill="white" />
            {cuts.map((c, i) => c.points.length === 1
              ? <circle key={i} cx={c.points[0][0]} cy={c.points[0][1]} r={c.size / 2} fill="black" />
              : <path key={i} d={linePath(c)} fill="none" stroke="black" strokeWidth={c.size} strokeLinecap="round" strokeLinejoin="round" />)}
          </mask></defs>
          <g mask={`url(#${mask})`}>{shape}</g>
        </> : shape}
      </svg>
    </div>
  );
});

type Edit = (blocks: Block[]) => Block[];
export type DrawingHandle = {
  start: (point: DrawSample, scale: number) => DrawGesture;
  cancel: () => void;
};
type Props = {
  ref: Ref<DrawingHandle>;
  blocks: Block[];
  display: Sheets;
  options: DrawingOptions;
  onEdit: (change: Edit) => void;
};
type Draft = { blocks: InkBlock[]; eraser?: { at: InkPoint; size: number } };

// Только этот слой перерисовывается во время жеста. В историю и хранилище
// идёт один законченный шаг. Щипок или pointercancel отбрасывает черновик.
export function DrawingLayer({ ref, blocks, display, options, onEdit }: Props) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const active = useRef<DrawGesture | null>(null);
  useEffect(() => () => active.current?.cancel(), []);
  useImperativeHandle(ref, () => ({
    cancel: () => active.current?.cancel(),
    start(first, scale) {
      active.current?.cancel();
      const { tool, colors, sizes } = options;
      const size = sizes[tool] / scale;
      const original = blocks.filter(isInk);
      const cuts = new Map<string, InkLine[]>();
      const withCuts = (block: InkBlock, extra: InkLine[]): InkBlock => ({
        ...block, ink: { ...block.ink, cuts: [...(block.ink.cuts ?? []), ...extra] }
      });
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
      const erase = (from: InkPoint, to: InkPoint) => {
        for (const part of splitAtPageEdges([from, to], display)) {
          for (const block of original) {
            if ((block.x < 0) !== (part.side === 'left')) continue;
            const extra = cuts.get(block.id) ?? [];
            if (addCut(block, part.points[0], part.points[part.points.length - 1], size, extra)) cuts.set(block.id, extra);
          }
        }
      };
      const move = (samples: DrawSample[]) => {
        if (!open) return;
        for (const sample of samples) {
          const dx = sample.x - (previous?.x ?? sample.x), dy = sample.y - (previous?.y ?? sample.y);
          if (previous && dx === 0 && dy === 0) continue;
          const p: InkPoint = [sample.x, sample.y];
          if (tool === 'eraser') {
            erase(previous ? [previous.x, previous.y] : p, p);
          } else {
            if (tool === 'brush') {
              // Стилус передаёт нажим. У пальца и мыши кончик сужается на быстрых движениях.
              const speed = Math.hypot(dx, dy) * scale / Math.max(1, sample.time - (previous?.time ?? sample.time));
              const last = points[points.length - 1]?.[2] ?? 0.45;
              p.push(sample.pressure === undefined ? last * 0.6 + 0.4 / (1 + speed) : 0.18 + 0.82 * sample.pressure);
            }
            points.push(p);
          }
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
            setDraft({ blocks: original.map(b => cuts.has(b.id) ? withCuts(b, cuts.get(b.id)!) : b), eraser: { at: [previous.x, previous.y], size } });
          } else setDraft({ blocks: [...original, ...segments(false)] });
        });
      };
      const close = () => {
        open = false;
        cancelAnimationFrame(frame);
        active.current = null;
        setDraft(null);
      };
      const gesture = {
        move, cancel: () => { if (open) close(); },
        end: () => {
          if (!open) return;
          if (tool === 'eraser') {
            const replacements = new Map<string, InkBlock[]>();
            for (const b of original) {
              const extra = cuts.get(b.id);
              if (!extra) continue;
              const compact = extra.map(c => ({ ...c, points: simplifyInk(c.points, 0.25 / scale, size) }));
              const hit = inspectCut(b, compact, scale);
              if (hit !== 'miss') replacements.set(b.id, hit === 'empty' ? [] : [withCuts(b, compact)]);
            }
            if (replacements.size) onEdit(all => all.flatMap(b => replacements.get(b.id) ?? [b]));
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
      {(draft?.blocks ?? blocks.filter(isInk)).map(b => (
        <div key={b.id} className="item-clip ink-clip" data-clip={b.x < 0 ? 'left' : 'right'}><InkItem block={b} /></div>
      ))}
      {draft?.eraser && <div className="eraser-tip" style={{ left: draft.eraser.at[0], top: draft.eraser.at[1], width: draft.eraser.size, height: draft.eraser.size }} />}
    </div>
  );
}
