import type { Block } from './notes';

export const brushes = { marker: 'Маркер', pencil: 'Карандаш', pen: 'Ручка', brush: 'Кисть' } as const;
export type Brush = keyof typeof brushes;
export type Tool = Brush | 'eraser';
export type Sheet = 'left' | 'right';
export type Sheets = Sheet | 'both';
// Третье число — доля толщины кисти в этой точке. Другим инструментам хватает x и y.
export type InkPoint = [number, number, number?];
export type InkLine = { size: number; points: InkPoint[] };
export type Ink = InkLine & { brush: Brush; cuts?: InkLine[] };
export type InkBlock = Block & { kind: 'ink'; ink: Ink };
export const isInk = (b: Block): b is InkBlock => b.kind === 'ink' && !!b.ink?.points.length;

export const defaultDrawing = {
  tool: 'marker' as Tool,
  sizes: { marker: 16, pencil: 3, pen: 4, brush: 12, eraser: 24 },
  colors: { marker: '#edb52e', pencil: '#555562', pen: '#294579', brush: '#97618b' }
};
export type DrawingOptions = typeof defaultDrawing;
export const maxSize = (tool: Tool) => tool === 'eraser' ? 64 : 40;
const round = (n: number) => Math.round(n * 10) / 10;
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
const samePosition = (a: InkPoint, b: InkPoint) => a[0] === b[0] && a[1] === b[1];

function interpolate(a: InkPoint, b: InkPoint, t: number): InkPoint {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const p: InkPoint = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (a[2] !== undefined && b[2] !== undefined) p.push(a[2] + (b[2] - a[2]) * t);
  return p;
}

type Interval = [number, number];
// Часть отрезка, на которой координата start + delta * t попадает в [min, max].
function clipAxis(range: Interval, start: number, delta: number, min: number, max: number): boolean {
  if (delta === 0) return start >= min && start <= max;
  const a = (min - start) / delta;
  const b = (max - start) / delta;
  range[0] = Math.max(range[0], Math.min(a, b));
  range[1] = Math.min(range[1], Math.max(a, b));
  return range[0] <= range[1];
}

export type InkPart = { side: Sheet; points: InkPoint[] };

// У каждой страницы свои штрихи даже тогда, когда одно движение пересекло
// корешок. После вставки или удаления страницы половинки уедут со своим листом.
export function splitAtPageEdges(points: InkPoint[], display: Sheets): InkPart[] {
  const result: InkPart[] = [];
  if (points.length === 0) return result;
  for (const side of ['left', 'right'] as const) {
    if (display !== 'both' && display !== side) continue;
    let part: InkPoint[] | undefined;
    for (let i = 0; i < Math.max(1, points.length - 1); i++) {
      const a = points[i], b = points[i + 1] ?? a;
      const t: Interval = [0, 1];
      if ((side === 'left' && display === 'both' && a[0] === 0 && b[0] === 0) ||
          !clipAxis(t, a[1], b[1] - a[1], 0, Infinity) ||
          !clipAxis(t, a[0], b[0] - a[0], side === 'left' ? -Infinity : 0, side === 'left' ? 0 : Infinity) ||
          (t[0] === t[1] && points.length > 1)) {
        part = undefined;
        continue;
      }
      const start = interpolate(a, b, t[0]), end = interpolate(a, b, t[1]);
      if (!part || !samePosition(part[part.length - 1], start)) {
        part = [start];
        result.push({ side, points: part });
      }
      if (!samePosition(part[part.length - 1], end)) part.push(end);
      if (t[1] < 1) part = undefined;
    }
  }
  return result;
}

// Убираем лишние отсчёты до записи в localStorage. Ошибка ограничена в
// экранных пикселях, в том числе для изменения нажима на прямой линии.
export function simplifyInk(points: InkPoint[], tolerance: number, size: number): InkPoint[] {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  const last = points.length - 1;
  keep[0] = keep[last] = 1;
  const pending: Interval[] = [[0, last]];
  while (pending.length) {
    const [start, end] = pending.pop()!;
    const a = points[start], b = points[end];
    const dx = b[0] - a[0], dy = b[1] - a[1], length = dx * dx + dy * dy;
    let split = -1, error = tolerance * tolerance;
    for (let i = start + 1; i < end; i++) {
      const p = points[i];
      const t = length ? clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length) : 0;
      const dw = ((p[2] ?? 1) - ((a[2] ?? 1) + ((b[2] ?? 1) - (a[2] ?? 1)) * t)) * size / 2;
      const offset = (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2 + dw * dw;
      if (offset > error) { error = offset; split = i; }
    }
    if (split >= 0) {
      keep[split] = 1;
      pending.push([start, split], [split, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

export function packInk(part: InkPart, brush: Brush, size: number, color: string, id: string): InkBlock {
  let x = Infinity, y = Infinity;
  for (const p of part.points) { x = Math.min(x, p[0]); y = Math.min(y, p[1]); }
  x = part.side === 'left' ? Math.min(-0.1, round(x)) : Math.max(0, round(x));
  y = round(y);
  const points = part.points.map(([px, py, width]): InkPoint => {
    const local: InkPoint = [round(px - x), round(py - y)];
    if (width !== undefined) local.push(Math.round(width * 100) / 100);
    return local;
  });
  return { id, kind: 'ink', text: '', x, y, color, ink: { brush, size: round(size), points } };
}

const boundsCache = new WeakMap<Ink, { x: number; y: number; w: number; h: number }>();
export function inkBounds(ink: Ink) {
  const cached = boundsCache.get(ink);
  if (cached) return cached;
  let x = Infinity, y = Infinity, right = -Infinity, bottom = -Infinity;
  for (const p of ink.points) {
    x = Math.min(x, p[0]); y = Math.min(y, p[1]);
    right = Math.max(right, p[0]); bottom = Math.max(bottom, p[1]);
  }
  const pad = ink.size / 2 + 1;
  const bounds = { x: x - pad, y: y - pad, w: right - x + 2 * pad, h: bottom - y + 2 * pad };
  boundsCache.set(ink, bounds);
  return bounds;
}

function distanceSquared(p: InkPoint, a: InkPoint, b: InkPoint) {
  const dx = b[0] - a[0], dy = b[1] - a[1], length2 = dx * dx + dy * dy;
  const t = length2 ? clamp01(((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length2) : 0;
  return (p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2;
}

function touches(a: InkPoint, b: InkPoint, u: InkPoint, v: InkPoint, radius: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1], ex = v[0] - u[0], ey = v[1] - u[1];
  const det = dx * ey - dy * ex;
  if (det) {
    const x = u[0] - a[0], y = u[1] - a[1];
    const t = (x * ey - y * ex) / det, s = (x * dy - y * dx) / det;
    if (t >= 0 && t <= 1 && s >= 0 && s <= 1) return true;
  }
  const r2 = radius * radius;
  return distanceSquared(a, u, v) <= r2 || distanceSquared(b, u, v) <= r2 ||
    distanceSquared(u, a, b) <= r2 || distanceSquared(v, a, b) <= r2;
}

// Собирать след ластика только у тех штрихов, до которых он мог дотронуться.
// Отверстия в рисунке задаём векторами: узкий ластик может прорезать широкую линию вдоль.
export function addCut(block: InkBlock, from: InkPoint, to: InkPoint, size: number, cuts: InkLine[]): boolean {
  const { ink, x, y } = block;
  const radius = size / 2;
  const box = inkBounds(ink);
  if (Math.max(from[0], to[0]) + radius < x + box.x || Math.min(from[0], to[0]) - radius > x + box.x + box.w ||
      Math.max(from[1], to[1]) + radius < y + box.y || Math.min(from[1], to[1]) - radius > y + box.y + box.h) return false;
  const u: InkPoint = [round(from[0] - x), round(from[1] - y)], v: InkPoint = [round(to[0] - x), round(to[1] - y)];
  for (let i = 0; i < Math.max(1, ink.points.length - 1); i++) {
    const a = ink.points[i], b = ink.points[i + 1] ?? a;
    const nib = ink.size * Math.max(a[2] ?? 1, b[2] ?? 1) / 2;
    if (!touches(a, b, u, v, radius + nib)) continue;
    let last = cuts[cuts.length - 1];
    if (!last || !samePosition(u, last.points[last.points.length - 1])) {
      last = { size: round(size), points: [u] };
      cuts.push(last);
    }
    if (!samePosition(u, v)) last.points.push(v);
    return true;
  }
  return false;
}
