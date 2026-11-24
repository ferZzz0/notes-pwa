import type { Brush, Ink, InkLine, InkPoint } from './drawing';

export const linePath = (line: Pick<InkLine, 'points'>) => 'M' + line.points.map(([x, y]) => x + ' ' + y).join(' ');
export const brushOpacity = (brush: Brush) => brush === 'marker' ? 0.43 : brush === 'pencil' ? 0.55 : 1;
export const pencilDashes = (size: number) => [size * 0.12, size * 0.55, size * 0.7, size * 0.32];

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

// Вырезы меняются, а исходные точки штриха остаются теми же. Готовый контур
// пригодится и при следующем стирании, и для точной проверки покрытия.
const paths = new WeakMap<InkPoint[], { size: number; brush: boolean; path: Path2D }>();
export function paintLine(ctx: CanvasRenderingContext2D, line: InkLine, brush = false, width = line.size) {
  const { points, size } = line;
  if (!points.length) return;
  let entry = paths.get(points);
  if (!entry || entry.size !== size || entry.brush !== brush) {
    let path: Path2D;
    if (brush) path = new Path2D(brushPath({ ...line, brush: 'brush' }));
    else {
      path = new Path2D();
      const [x, y] = points[0];
      if (points.length === 1) path.arc(x, y, size / 2, 0, 2 * Math.PI);
      else {
        path.moveTo(x, y);
        for (let i = 1; i < points.length; i++) path.lineTo(points[i][0], points[i][1]);
      }
    }
    entry = { size, brush, path };
    paths.set(points, entry);
  }
  if (brush || points.length === 1) ctx.fill(entry.path);
  else { ctx.lineWidth = width; ctx.stroke(entry.path); }
}
