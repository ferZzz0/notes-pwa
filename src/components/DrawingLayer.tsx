import { memo, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { inkBounds, isInk, packInk, simplifyInk, splitAtPageEdges, type DrawingOptions, type Ink, type InkBlock, type InkLine, type InkPoint, type Sheet, type Sheets } from '../drawing';
import { eraseStrokes } from '../inkEraser';
import { brushOpacity, brushPath, linePath, pencilDashes } from '../inkPaths';
import { InkSurface, sameView } from '../inkSurface';
import { newBlockId, type Block } from '../notes';
import type { Camera, DrawGesture, DrawSample, Rect, Size } from './Canvas';

const InkShape = memo(function InkShape({ brush, size, points, color }: Ink & { color: string }) {
  if (brush === 'brush') return <path d={brushPath({ brush, size, points })} fill={color} />;
  const opacity = brushOpacity(brush);
  if (points.length === 1) return <circle cx={points[0][0]} cy={points[0][1]} r={size / 2} fill={color} opacity={opacity} />;
  const line = linePath({ points });
  return (
    <g fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round">
      <path d={line} strokeWidth={size} opacity={opacity} />
      {brush === 'pencil' && (
        <path d={line} strokeWidth={size * 0.46} strokeDasharray={pencilDashes(size).join(' ')} opacity="0.56" />
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

const InkSheet = memo(function InkSheet({ blocks, side }: { blocks: InkBlock[]; side: Sheet }) {
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
  return <div className="item-clip ink-clip" data-clip={side}>
    <div className="ink-item" style={bounds}>
      <svg width={bounds.width} height={bounds.height} viewBox={`${bounds.left} ${bounds.top} ${bounds.width} ${bounds.height}`}>
        <g><SavedStrokes blocks={blocks} /></g>
      </svg>
    </div>
  </div>;
});

type Edit = (blocks: Block[]) => Block[];
export type DrawingHandle = {
  start: (point: DrawSample, scale: number, view: Rect) => DrawGesture;
  cancel: () => void;
  viewport: (cam: Camera, size: Size) => void;
};
type Props = {
  ref: Ref<DrawingHandle>;
  blocks: Block[];
  display: Sheets;
  drawing: boolean;
  options: DrawingOptions;
  onEdit: (change: Edit) => void;
};

// Только этот слой перерисовывается во время жеста. В историю и хранилище
// идёт один законченный шаг. Щипок или pointercancel отбрасывает черновик.
export function DrawingLayer({ ref, blocks, display, drawing, options, onEdit }: Props) {
  const [draft, setDraft] = useState<InkBlock[]>([]);
  const root = useRef<HTMLDivElement>(null);
  const bitmap = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const surface = useRef<InkSurface | null>(null);
  const viewport = useRef<{ view: Rect; scale: number } | null>(null);
  const warmTimer = useRef(0);
  const erasing = drawing && options.tool === 'eraser';
  const original = useMemo(() => blocks.filter(isInk), [blocks]);
  const sides = useMemo(() => ({ left: original.filter(b => b.x < 0), right: original.filter(b => b.x >= 0) }), [original]);
  const active = useRef<DrawGesture | null>(null);
  const prepare = useCallback((view: Rect, scale: number) => {
    clearTimeout(warmTimer.current);
    if (!erasing || !original.length || !bitmap.current || view.w <= 0 || view.h <= 0) return null;
    if (!surface.current) {
      const ctx = bitmap.current.getContext('2d');
      if (!ctx) return null;
      surface.current = new InkSurface(ctx, () => root.current?.removeAttribute('data-ink-surface'));
    }
    const ready = surface.current.prepare(original, view, scale);
    root.current?.toggleAttribute('data-ink-surface', ready);
    return ready ? surface.current : null;
  }, [erasing, original]);
  useLayoutEffect(() => {
    if (erasing && original.length && viewport.current) prepare(viewport.current.view, viewport.current.scale);
    else {
      root.current?.removeAttribute('data-ink-surface');
      surface.current?.dispose();
      surface.current = null;
    }
    return () => { clearTimeout(warmTimer.current); active.current?.cancel(); };
  }, [erasing, original, prepare]);
  useEffect(() => () => {
    active.current?.cancel();
    surface.current?.dispose();
    surface.current = null;
  }, []);
  useImperativeHandle(ref, () => ({
    cancel: () => active.current?.cancel(),
    viewport(cam, size) {
      const view = { x: -cam.x / cam.scale, y: -cam.y / cam.scale, w: size.w / cam.scale, h: size.h / cam.scale };
      const last = viewport.current;
      if (last && last.scale === cam.scale && sameView(last.view, view)) return;
      viewport.current = { view, scale: cam.scale };
      if (!erasing) return;
      active.current?.cancel();
      root.current?.removeAttribute('data-ink-surface');
      clearTimeout(warmTimer.current);
      warmTimer.current = window.setTimeout(() => prepare(view, cam.scale), 100);
    },
    start(first, scale, view) {
      active.current?.cancel();
      const { tool, colors, sizes } = options;
      const size = sizes[tool] / scale;
      const points: InkPoint[] = [], ids: string[] = [];
      let previous: DrawSample | undefined, frame = 0, open = true;
      let compactedUntil = 0, painted = 0;
      const ink = tool === 'eraser' ? prepare(view, scale) : null;
      const cursor = tool === 'eraser' ? tip.current : null;
      if (cursor) cursor.style.width = cursor.style.height = size + 'px';
      const compact = () => {
        if (points.length - compactedUntil < 128) return;
        const tail = simplifyInk(points.slice(compactedUntil), 0.16 / scale, size);
        points.length = compactedUntil;
        for (const p of tail) points.push(p);
        compactedUntil = points.length - 1;
      };
      const segments = (final: boolean) => {
        if (tool === 'eraser') return [];
        return splitAtPageEdges(points, display).map((part, i) => {
          if (final) part.points = simplifyInk(part.points, 0.38 / scale, size);
          return packInk(part, tool, size, colors[tool], ids[i] ??= newBlockId());
        });
      };
      const flush = () => {
        frame = 0;
        if (painted === points.length) return;
        ink?.erase(splitAtPageEdges(points.slice(Math.max(0, painted - 1)), display), size);
        compact();
        painted = points.length;
        if (tool !== 'eraser') setDraft(segments(false));
        else if (cursor) {
          const [x, y] = points[painted - 1];
          cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
          cursor.hidden = false;
        }
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
        if (!frame && painted < points.length) frame = requestAnimationFrame(flush);
      };
      const close = () => {
        open = false;
        cancelAnimationFrame(frame);
        active.current = null;
        if (cursor) cursor.hidden = true;
        if (tool !== 'eraser') setDraft([]);
      };
      const gesture = {
        move, cancel: () => { if (open) { close(); ink?.restore(); } },
        end: () => {
          if (!open) return;
          if (tool === 'eraser') {
            cancelAnimationFrame(frame);
            flush();
            const changes = eraseStrokes(original, splitAtPageEdges(points, display), size, scale);
            ink?.finish(changes);
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
    <div ref={root} className="page-side drawing-layer" aria-hidden="true">
      <InkSheet blocks={sides.left} side="left" />
      <InkSheet blocks={sides.right} side="right" />
      {erasing && <canvas ref={bitmap} className="ink-surface" width={1} height={1} />}
      {draft.map(b => (
        <div key={b.id} className="item-clip ink-clip" data-clip={b.x < 0 ? 'left' : 'right'}><InkItem block={b} /></div>
      ))}
      {erasing && <div ref={tip} className="eraser-tip" hidden />}
    </div>
  );
}
