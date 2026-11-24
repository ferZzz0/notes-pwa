import { distanceSquared, inkBounds, type InkBlock, type InkLine, type InkPoint } from './drawing.ts';

type CutResult = 'miss' | 'empty' | 'partial';
type Evidence = { changed: boolean; remains: boolean };

function contains(point: InkPoint, lines: InkLine[], padding: number) {
  for (const line of lines) {
    const box = inkBounds(line);
    const [x, y] = point;
    if (x < box.x - padding || x > box.x + box.w + padding || y < box.y - padding || y > box.y + box.h + padding) continue;
    const r = line.size / 2 + padding;
    if (r <= 0) continue;
    for (let i = 0; i < line.points.length; i++) {
      if (distanceSquared(point, line.points[i], line.points[i + 1] ?? line.points[i]) <= r * r) return true;
    }
  }
  return false;
}

// Две концевые окружности полностью внутри одной капсулы ластика —
// вся соединяющая их перемычка тоже внутри (капсула выпуклая).
function covered(line: InkLine, by: InkLine[]) {
  return line.points.every((a, i) => {
    const b = line.points[i + 1] ?? a;
    return by.some(mask => {
      const ra = (mask.size - line.size * (a[2] ?? 1)) / 2, rb = (mask.size - line.size * (b[2] ?? 1)) / 2;
      if (ra < 0 || rb < 0) return false;
      return mask.points.some((u, j) => {
        const v = mask.points[j + 1] ?? u;
        return distanceSquared(a, u, v) <= ra * ra && distanceSquared(b, u, v) <= rb * rb;
      });
    });
  });
}

// Для частичного выреза достаточно двух заведомо закрашенных точек:
// одну новый ластик закрыл, другую оставил. Пограничные случаи и полностью
// закрытые несколькими масками области проверяет точечный растровый тест.
export function cutEvidence(block: InkBlock, cuts: InkLine[], resolution: number): CutResult | Evidence {
  const { ink } = block;
  const old = ink.cuts ?? [];
  if (old.length && cuts.every(c => covered(c, old))) return 'miss';
  const margin = 0.75 / resolution;
  let changed = false, remains = false;
  const probe = (p: InkPoint, nib: number) => {
    if (nib <= margin || (block.x < 0 ? -1 : 1) * (block.x + p[0]) <= margin || block.y + p[1] <= margin || contains(p, old, margin)) return;
    if (!changed && contains(p, cuts, -margin)) changed = true;
    else if (!remains && !contains(p, cuts, margin)) remains = true;
  };
  const points = ink.points;
  // У длинных линий сначала пробуем точки по всей длине, включая оба конца.
  const stride = Math.max(1, Math.ceil((points.length - 1) / 96));
  for (let i = 0; ; i = Math.min(i + stride, points.length - 1)) {
    const p = points[i];
    probe(p, ink.size * (p[2] ?? 1) / 2);
    if (changed && remains) return 'partial';
    if (i === points.length - 1) break;
  }
  // У старого штриха вся видимая краска уже могла находиться под вырезами.
  // Убирать его из документа можно лишь после попадания в оставшиеся чернила.
  if (changed && !remains && covered(ink, cuts)) return 'empty';
  // У длинной прямой после упрощения могли остаться только концы.
  // Проверяем точку пересечения осей и проекцию ластика на отрезок.
  if (remains && !changed) {
    for (const cut of cuts) {
      const box = inkBounds(cut);
      for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        if (Math.max(a[0], b[0]) < box.x || Math.min(a[0], b[0]) > box.x + box.w ||
            Math.max(a[1], b[1]) < box.y || Math.min(a[1], b[1]) > box.y + box.h) continue;
        const dx = b[0] - a[0], dy = b[1] - a[1], dd = dx * dx + dy * dy;
        const nib = ink.size * Math.min(a[2] ?? 1, b[2] ?? 1) / 2;
        for (let j = 0; j < cut.points.length; j++) {
          const u = cut.points[j], v = cut.points[j + 1] ?? u;
          const x = u[0] - a[0], y = u[1] - a[1], ex = v[0] - u[0], ey = v[1] - u[1];
          const det = dx * ey - dy * ex;
          const crossing = det === 0 ? -1 : (x * ey - y * ex) / det;
          const t = crossing >= 0 && crossing <= 1 ? crossing : dd ? Math.max(0, Math.min(1, (x * dx + y * dy) / dd)) : 0;
          probe([a[0] + t * dx, a[1] + t * dy], nib);
          if (changed) return 'partial';
        }
      }
    }
  }
  return { changed, remains };
}
