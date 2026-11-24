import { addCut, inkBounds, simplifyInk, type InkBlock, type InkLine, type InkPart } from './drawing';
import { cutEvidence } from './inkCoverage';
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

// Обходим штрихи один раз по упрощённой траектории всего жеста. Пока палец
// движется, бумага показывает одну маску на страницу, без правок отдельных штрихов.
export function eraseStrokes(blocks: InkBlock[], trace: InkPart[], size: number, scale: number) {
  const routes = trace.map(({ side, points }) => {
    const line = { size, points: simplifyInk(points, 0.25 / scale, size) };
    return { side, line, box: inkBounds(line) };
  });
  const replacements = new Map<string, InkBlock | null>();
  for (const b of blocks) {
    const cuts: InkLine[] = [], box = inkBounds(b.ink);
    const x = b.x + box.x, y = b.y + box.y;
    for (const route of routes) {
      const r = route.box;
      if ((b.x < 0) !== (route.side === 'left') || x > r.x + r.w || x + box.w < r.x || y > r.y + r.h || y + box.h < r.y) continue;
      const p = route.line.points;
      for (let i = 0; i < Math.max(1, p.length - 1); i++) addCut(b, p[i], p[i + 1] ?? p[i], size, cuts);
    }
    if (!cuts.length) continue;
    const result = inspectCut(b, cuts, scale);
    if (result === 'empty') replacements.set(b.id, null);
    if (result === 'partial') replacements.set(b.id, { ...b, ink: { ...b.ink, cuts: [...(b.ink.cuts ?? []), ...cuts] } });
  }
  return replacements;
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
  const { ink } = block;
  const resolution = Math.max(2 * scale, 4 / ink.size, 3 / cuts[0].size);
  const evidence = cutEvidence(block, cuts, resolution);
  if (typeof evidence === 'string') return evidence;
  if (!scratch) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = TILE;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
  }
  // Если браузер не дал временный холст, векторный вырез всё равно работает.
  if (!scratch) return 'partial';
  const ctx = scratch;
  const original = paint(ink, ink.brush === 'brush' ? brushPath(ink) : undefined);
  const previous = (ink.cuts ?? []).map(c => paint(c)), current = cuts.map(c => paint(c));
  let { changed, remains } = evidence;
  const bounds = inkBounds(ink), visited = new Set<string>();
  const inspect = (tx: number, ty: number) => {
    const key = tx + ',' + ty;
    if (visited.has(key)) return;
    visited.add(key);
    // Читаем только прямоугольник чернил в плитке: у точки и у тонкой линии
    // он бывает в десятки раз меньше всей плитки.
    const x = Math.max(0, Math.floor(bounds.x * resolution) - tx * TILE);
    const y = Math.max(0, Math.floor(bounds.y * resolution) - ty * TILE);
    const w = Math.min(TILE, Math.ceil((bounds.x + bounds.w) * resolution) - tx * TILE) - x;
    const h = Math.min(TILE, Math.ceil((bounds.y + bounds.h) * resolution) - ty * TILE) - y;
    if (w <= 0 || h <= 0) return;
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
    const before = ctx.getImageData(x, y, w, h).data;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, TILE, TILE);
    ctx.setTransform(resolution, 0, 0, resolution, -tx * TILE, -ty * TILE);
    ctx.globalCompositeOperation = 'source-over';
    for (const draw of current) draw(ctx);
    const mask = ctx.getImageData(x, y, w, h).data;
    ctx.restore();
    for (let i = 3; i < before.length; i += 4) {
      if (before[i] <= 127) continue;
      if (mask[i] > 127) changed = true;
      else remains = true;
      if (changed && remains) return;
    }
  };
  const step = TILE / resolution;
  if (!changed) {
    // Установить попадание можно только там, где прошёл ластик.
    for (const cut of cuts) for (const [tx, ty] of inkTiles(cut, step)) {
      inspect(tx, ty);
      if (changed && remains) return 'partial';
    }
    if (!changed) return 'miss';
  }
  for (const [tx, ty] of inkTiles(ink, step)) {
    inspect(tx, ty);
    if (remains) return 'partial';
  }
  return 'empty';
}
