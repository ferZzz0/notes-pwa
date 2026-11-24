import type { InkBlock, InkLine } from './drawing';
import { brushPath, linePath } from './inkPaths';

const TILE = 128;
let scratch: CanvasRenderingContext2D | null = null;

function paint(line: InkLine, outline?: string) {
  const path = new Path2D(outline ?? linePath(line));
  const dot = line.points.length === 1;
  if (dot && !outline) path.arc(line.points[0][0], line.points[0][1], line.size / 2, 0, 2 * Math.PI);
  return (ctx: CanvasRenderingContext2D) => {
    if (dot || outline) ctx.fill(path);
    else { ctx.lineWidth = line.size; ctx.stroke(path); }
  };
}

// Проверяем только плитки вдоль линии. Даже у очень длинного диагонального
// штриха временный холст занимает 128 × 128, независимо от размера страницы.
function* inkTiles({ points, size }: InkLine, step: number) {
  const seen = new Set<string>();
  const pad = size / 2;
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[i];
    const count = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) / step));
    for (let j = 0; j < count; j++) {
      const x = a[0] + (b[0] - a[0]) * j / count, y = a[1] + (b[1] - a[1]) * j / count;
      const ex = a[0] + (b[0] - a[0]) * (j + 1) / count, ey = a[1] + (b[1] - a[1]) * (j + 1) / count;
      for (let tx = Math.floor((Math.min(x, ex) - pad) / step); tx <= Math.floor((Math.max(x, ex) + pad) / step); tx++) {
        for (let ty = Math.floor((Math.min(y, ey) - pad) / step); ty <= Math.floor((Math.max(y, ey) + pad) / step); ty++) {
          const key = tx + ',' + ty;
          if (seen.has(key)) continue;
          seen.add(key);
          yield [tx, ty];
        }
      }
    }
  }
}

// Рисунок и вырезы хранятся векторами. Только при отпускании ластика
// проверяем покрытие: проход по уже пустому месту не создаёт шага истории,
// а полностью стёртый штрих можно освободить вместе со всеми его вырезами.
export function inspectCut(block: InkBlock, cuts: InkLine[], scale: number): 'miss' | 'partial' | 'empty' {
  if (!scratch) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
  }
  // Если браузер не дал временный холст, векторный вырез всё равно работает.
  if (!scratch) return 'partial';
  const ctx = scratch, { ink } = block;
  const resolution = Math.max(2 * scale, 4 / ink.size, 3 / cuts[0].size);
  const original = paint(ink, ink.brush === 'brush' ? brushPath(ink) : undefined);
  const previous = (ink.cuts ?? []).map(c => paint(c)), current = cuts.map(c => paint(c));
  let changed = false, remains = false;
  for (const [tx, ty] of inkTiles(ink, TILE / resolution)) {
    ctx.save();
    ctx.clearRect(0, 0, TILE, TILE);
    // На самой бумаге видна только своя сторона корешка и область ниже верха.
    const spine = -block.x * resolution - tx * TILE, top = Math.max(0, -block.y * resolution - ty * TILE);
    ctx.beginPath();
    const left = block.x < 0 ? 0 : Math.max(0, spine);
    const right = block.x < 0 ? Math.min(TILE, spine) : TILE;
    ctx.rect(left, top, Math.max(0, right - left), Math.max(0, TILE - top));
    ctx.clip();
    ctx.setTransform(resolution, 0, 0, resolution, -tx * TILE, -ty * TILE);
    ctx.lineCap = ctx.lineJoin = 'round';
    original(ctx);
    ctx.globalCompositeOperation = 'destination-out';
    for (const draw of previous) draw(ctx);
    const before = ctx.getImageData(0, 0, TILE, TILE).data;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.setTransform(resolution, 0, 0, resolution, -tx * TILE, -ty * TILE);
    ctx.globalCompositeOperation = 'source-over';
    for (const draw of current) draw(ctx);
    const mask = ctx.getImageData(0, 0, TILE, TILE).data;
    ctx.restore();
    for (let i = 3; i < before.length; i += 4) {
      if (before[i] <= 127) continue;
      if (mask[i] > 127) changed = true;
      else remains = true;
      if (changed && remains) return 'partial';
    }
  }
  return changed && !remains ? 'empty' : changed ? 'partial' : 'miss';
}
