// Увеличенную картинку готовим один раз после щипка. При качании браузер
// поворачивает уже сглаженную текстуру вместе с цепочкой и искрами.
type CharmImage = { source: HTMLImageElement; width: number; visible: boolean };

const MIN_SCREEN_WIDTH = 128;
const RETINA_EDGE = 1280;
const MAX_EDGE = 2048;
const PIXEL_BUDGET = 25 * 1024 * 1024 / 4; // 25 МиБ на RGBA-пиксели

export class CharmTextures {
  private zoom = 1;
  private images = new Map<HTMLCanvasElement, CharmImage>();
  private observer?: IntersectionObserver;
  private timer?: number;
  private frame = 0;

  setZoom(scale: number) {
    if (scale === this.zoom) return;
    this.zoom = scale;
    if (this.images.size) this.schedule();
  }

  setWidth(surface: HTMLCanvasElement, width: number) {
    const image = this.images.get(surface);
    if (!image || image.width === width) return;
    image.width = width;
    this.schedule();
  }

  watch(surface: HTMLCanvasElement, source: HTMLImageElement) {
    const entry = { source, width: 0, visible: typeof IntersectionObserver === 'undefined' };
    this.images.set(surface, entry);
    if (!entry.visible) {
      this.observer ??= new IntersectionObserver(changes => {
        for (const change of changes) {
          const image = this.images.get(change.target as HTMLCanvasElement);
          if (image) image.visible = change.isIntersecting;
        }
        this.schedule();
      }, { rootMargin: '80px' });
      // Холст всегда занимает квадрат наклейки, даже пока он прозрачен.
      this.observer.observe(surface);
    }
    source.addEventListener('load', this.schedule);
    const lost = () => surface.removeAttribute('data-ready');
    surface.addEventListener('contextlost', lost);
    surface.addEventListener('contextrestored', this.schedule);
    return () => {
      this.observer?.unobserve(surface);
      this.images.delete(surface);
      source.removeEventListener('load', this.schedule);
      surface.removeEventListener('contextlost', lost);
      surface.removeEventListener('contextrestored', this.schedule);
      this.clear(surface);
      this.schedule();
      if (!this.images.size) {
        this.observer?.disconnect();
        this.observer = undefined;
      }
    };
  }

  private clear(surface: HTMLCanvasElement) {
    surface.removeAttribute('data-ready');
    if (surface.width) surface.width = surface.height = 0;
  }

  private schedule = () => {
    // На каждом промежуточном масштабе жеста остаётся предыдущая картинка.
    window.clearTimeout(this.timer);
    cancelAnimationFrame(this.frame);
    if (this.images.size) this.timer = window.setTimeout(this.prepare, 80);
  };

  private prepare = () => {
    const visible = [...this.images].filter(([surface, image]) => {
      if (image.visible && image.width * this.zoom >= MIN_SCREEN_WIDTH && image.source.complete && image.source.naturalWidth) return true;
      this.clear(surface);
      return false;
    });
    if (!visible.length) return;
    // Несколько наложенных брелоков делят общий запас памяти.
    const limit = Math.min(MAX_EDGE, Math.floor(Math.sqrt(PIXEL_BUDGET / visible.length) / 128) * 128);
    const draws: (() => void)[] = [];
    for (const [surface, { source, width }] of visible) {
      const screenWidth = width * this.zoom;
      // В крупном плане достаточно сглаживать до плотности экрана. Если
      // увеличили ещё и сам предмет, оставляем хотя бы пиксель на CSS-пиксель.
      const retina = Math.min(RETINA_EDGE, screenWidth * (window.devicePixelRatio || 1));
      const pixels = Math.max(screenWidth, retina);
      const edge = Math.min(limit, Math.ceil(pixels / 256) * 256);
      if (edge < Math.min(256, source.naturalWidth)) {
        this.clear(surface);
        continue;
      }
      surface.style.imageRendering = edge * 2 >= screenWidth ? 'pixelated' : 'auto';
      if (surface.width === edge && surface.hasAttribute('data-ready')) continue;
      draws.push(() => {
        surface.width = surface.height = edge;
        const ctx = surface.getContext('2d');
        if (!ctx || ctx.isContextLost?.()) {
          this.clear(surface);
          return;
        }
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, edge, edge);
        surface.setAttribute('data-ready', '');
      });
    }
    // Подготовка сразу нескольких рисунков не занимает весь кадр.
    const next = () => {
      draws.pop()?.();
      if (draws.length) this.frame = requestAnimationFrame(next);
    };
    next();
  };
}
