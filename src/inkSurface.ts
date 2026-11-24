import { inkBounds, type InkBlock, type InkBounds as Rect, type InkPart, type Sheet } from './drawing';
import { brushOpacity, paintLine, pencilDashes } from './inkPaths';

function intersect(a: Rect, b: Rect): Rect | undefined {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x, h = Math.min(a.y + a.h, b.y + b.h) - y;
  if (w > 0 && h > 0) return { x, y, w, h };
}

function union(a: Rect | undefined, b: Rect): Rect {
  if (!a) return b;
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

function worldBounds(b: InkBlock) {
  const box = inkBounds(b.ink);
  return { ...box, x: b.x + box.x, y: b.y + box.y };
}

function sheetRect(view: Rect, side: Sheet): Rect {
  const x = side === 'left' ? view.x : Math.max(0, view.x);
  const right = side === 'left' ? Math.min(0, view.x + view.w) : view.x + view.w;
  const y = Math.max(0, view.y);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, view.y + view.h - y) };
}

function clip(ctx: CanvasRenderingContext2D, r: Rect) {
  ctx.beginPath();
  ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip();
}

function paintStroke(ctx: CanvasRenderingContext2D, b: InkBlock) {
  const { ink } = b;
  ctx.lineCap = ctx.lineJoin = 'round';
  ctx.fillStyle = ctx.strokeStyle = b.color ?? '#000';
  ctx.globalAlpha = brushOpacity(ink.brush);
  paintLine(ctx, ink, ink.brush === 'brush');
  if (ink.brush === 'pencil' && ink.points.length > 1) {
    ctx.globalAlpha = 0.56;
    ctx.setLineDash(pencilDashes(ink.size));
    paintLine(ctx, ink, false, ink.size * 0.46);
    ctx.setLineDash([]);
  }
  ctx.globalAlpha = 1;
}

export const sameView = (a: Rect, b: Rect) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

function sameInk(before: InkBlock[], after: InkBlock[]) {
  return before === after || (before.length === after.length && after.every((b, i) => {
    const old = before[i];
    return b.ink === old.ink && b.x === old.x && b.y === old.y && b.color === old.color;
  }));
}

// Холст покрывает только видимые чернила. Векторы остаются в документе.
// Во время жеста изменяются только пиксели под новым отрезком ластика.
export class InkSurface {
  private blocks: InkBlock[] = [];
  private view: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private viewport?: Rect;
  private density = 1;
  private visible = false;
  private dirty?: Rect;
  private repairTimer = 0;

  constructor(private ctx: CanvasRenderingContext2D, private unavailable: () => void) {
    ctx.canvas.addEventListener('contextlost', this.invalidate);
  }

  private invalidate = () => {
    clearTimeout(this.repairTimer);
    this.visible = false;
    this.viewport = undefined;
    this.unavailable();
  };

  prepare(blocks: InkBlock[], view: Rect, scale: number) {
    const canvas = this.ctx.canvas;
    if (this.ctx.isContextLost?.()) return false;
    // Ограничиваем память экрана на больших планшетах и при Retina-зуме.
    const density = Math.min(scale * Math.min(2, devicePixelRatio), 4096 / Math.max(view.w, view.h), Math.sqrt(2_000_000 / (view.w * view.h)));
    if (this.viewport && sameView(this.viewport, view) && density === this.density && sameInk(this.blocks, blocks)) {
      this.blocks = blocks;
      return this.visible;
    }
    clearTimeout(this.repairTimer);
    this.dirty = undefined;
    this.blocks = blocks;
    this.viewport = view;
    this.density = density;
    let area: Rect | undefined;
    for (const b of blocks) {
      const r = intersect(worldBounds(b), sheetRect(view, b.x < 0 ? 'left' : 'right'));
      if (r) area = union(area, r);
    }
    if (!area) {
      canvas.width = canvas.height = 1;
      this.visible = false;
      return false;
    }
    const px = Math.floor((area.x - view.x) * density), py = Math.floor((area.y - view.y) * density);
    const w = Math.ceil((area.x + area.w - view.x) * density) - px;
    const h = Math.ceil((area.y + area.h - view.y) * density) - py;
    this.view = { x: view.x + px / density, y: view.y + py / density, w: w / density, h: h / density };
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    Object.assign(canvas.style, { left: this.view.x + 'px', top: this.view.y + 'px', width: this.view.w + 'px', height: this.view.h + 'px' });
    this.visible = true;
    this.repaint(this.view);
    return this.visible;
  }

  private repaint(region: Rect) {
    const { ctx, view, density: k } = this;
    // Целые границы пикселей: при локальной перерисовке сглаженный край
    // соседнего участка должен остаться той же плотности.
    const px = Math.floor((region.x - view.x) * k), py = Math.floor((region.y - view.y) * k);
    const pw = Math.ceil((region.x + region.w - view.x) * k) - px;
    const ph = Math.ceil((region.y + region.h - view.y) * k) - py;
    const redraw = { x: view.x + px / k, y: view.y + py / k, w: pw / k, h: ph / k };
    ctx.clearRect(px, py, pw, ph);
    let scratch: CanvasRenderingContext2D | null = null;
    ctx.save();
    clip(ctx, { x: px, y: py, w: pw, h: ph });
    ctx.setTransform(k, 0, 0, k, -view.x * k, -view.y * k);
    for (const b of this.blocks) {
      const sheet = sheetRect(view, b.x < 0 ? 'left' : 'right');
      const onSheet = intersect(worldBounds(b), sheet);
      const area = onSheet && intersect(onSheet, redraw);
      if (!area) continue;
      ctx.save();
      clip(ctx, sheet);
      if (b.ink.cuts?.length) {
        // Старые вырезы относятся только к своему штриху. Временный холст
        // переиспользуется, в него попадает только видимая часть штриха.
        scratch ??= document.createElement('canvas').getContext('2d');
        if (scratch) {
          const x = Math.floor((area.x - view.x) * k), y = Math.floor((area.y - view.y) * k);
          const w = Math.ceil((area.x + area.w - view.x) * k) - x, h = Math.ceil((area.y + area.h - view.y) * k) - y;
          if (scratch.canvas.width < w) scratch.canvas.width = w;
          if (scratch.canvas.height < h) scratch.canvas.height = h;
          scratch.clearRect(0, 0, w, h);
          scratch.save();
          scratch.setTransform(k, 0, 0, k, (b.x - view.x) * k - x, (b.y - view.y) * k - y);
          paintStroke(scratch, b);
          scratch.globalCompositeOperation = 'destination-out';
          scratch.fillStyle = scratch.strokeStyle = '#000';
          for (const cut of b.ink.cuts) paintLine(scratch, cut);
          scratch.restore();
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.drawImage(scratch.canvas, 0, 0, w, h, x, y, w, h);
        } else {
          // Если памяти под маску не хватило, на экране останутся векторы.
          this.invalidate();
          ctx.restore();
          break;
        }
      } else {
        ctx.translate(b.x, b.y);
        paintStroke(ctx, b);
      }
      ctx.restore();
    }
    ctx.restore();
    if (scratch) scratch.canvas.width = scratch.canvas.height = 1;
  }

  erase(parts: InkPart[], size: number) {
    const { ctx, view, density: k } = this;
    clearTimeout(this.repairTimer);
    ctx.save();
    ctx.setTransform(k, 0, 0, k, -view.x * k, -view.y * k);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.lineWidth = size;
    for (const { points, side } of parts) {
      const sheet = sheetRect(view, side);
      // Запас покрывает округление сохранённых точек и сглаживание.
      const area = intersect(inkBounds({ points, size: size + 4 / k + 0.4 }), sheet);
      if (!area) continue;
      this.dirty = union(this.dirty, area);
      ctx.save();
      clip(ctx, sheet);
      ctx.beginPath();
      const [x, y] = points[0];
      if (points.length === 1) {
        ctx.arc(x, y, size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.moveTo(x, y);
        for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  finish(changes: Map<string, InkBlock | null>) {
    if (changes.size) {
      this.blocks = this.blocks.flatMap(b => {
        const next = changes.get(b.id);
        if (next !== null) return [next ?? b];
        const removed = intersect(worldBounds(b), this.view);
        if (removed) this.dirty = union(this.dirty, removed);
        return [];
      });
    }
    // Соседние быстрые жесты используют уже готовые пиксели. Когда палец
    // отпущен, сверяем затронутый участок с точной сохранённой геометрией.
    this.repairTimer = window.setTimeout(() => this.restore(), 120);
  }

  restore() {
    clearTimeout(this.repairTimer);
    if (this.dirty) this.repaint(this.dirty);
    this.dirty = undefined;
  }

  dispose() {
    clearTimeout(this.repairTimer);
    this.ctx.canvas.removeEventListener('contextlost', this.invalidate);
    this.ctx.canvas.width = this.ctx.canvas.height = 1;
  }
}
