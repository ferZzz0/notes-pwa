import type { Ink, InkLine } from './drawing';

export const linePath = (line: InkLine) => 'M' + line.points.map(([x, y]) => x + ' ' + y).join(' ');

// Диск в каждой точке и перемычки переменной ширины дают мягкое перо
// с круглыми стыками, даже если направление резко поменялось.
export function brushPath({ points, size }: Ink) {
  const path: string[] = [];
  const n = (v: number) => Math.round(v * 100) / 100;
  for (let i = 0; i < points.length; i++) {
    const [x, y, w = 1] = points[i], r = n(w * size / 2);
    path.push(`M${n(x - r)} ${y}a${r} ${r} 0 1 1 ${2 * r} 0a${r} ${r} 0 1 1 ${-2 * r} 0Z`);
    if (!i) continue;
    const [px, py, pw = 1] = points[i - 1], pr = pw * size / 2;
    const dx = x - px, dy = y - py, length = Math.hypot(dx, dy);
    if (!length) continue;
    const nx = -dy / length, ny = dx / length;
    path.push(`M${n(px + nx * pr)} ${n(py + ny * pr)}L${n(px - nx * pr)} ${n(py - ny * pr)} ${n(x - nx * r)} ${n(y - ny * r)} ${n(x + nx * r)} ${n(y + ny * r)}Z`);
  }
  return path.join('');
}
