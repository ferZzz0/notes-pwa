import { useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type Ref } from 'react';
import './Canvas.css';

// «Камера»: точка мира (wx, wy) видна на экране в (x + wx·scale, y + wy·scale)
export type Camera = { x: number; y: number; scale: number };
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

export type CanvasHandle = {
  // Плавно вернуться к стартовому виду; промис — когда долетели
  goHome: () => Promise<void>;
  // Какая часть мира сейчас на экране
  visibleRect: () => Rect;
  // Плавно сдвинуть камеру на (dx, dy) экранных px
  panBy: (dx: number, dy: number) => void;
};

type Props = {
  ref?: Ref<CanvasHandle>;
  // Стартовый вид: точка мира (x, y) — середина верхнего края кадра; по
  // ширине помещается width px мира, но масштаб не мельче minScale
  home: { x: number; y: number; width: number; minScale: number };
  // Пока true, жесты не двигают камеру (например, во время переворота листа)
  locked?: boolean;
  // Рисуется под миром, в координатах экрана (например, бумага)
  background?: ReactNode;
  // Каждый кадр, когда камера сдвинулась
  onFrame?: (cam: Camera, size: Size) => void;
  // Когда камера замерла
  onSettle?: (cam: Camera, size: Size) => void;
  // Двойное касание по миру (не по полю ввода или кнопке) — точка мира
  onDoubleTap?: (p: Point) => void;
  children: ReactNode;
};

const FIT_PADDING = 16; // отступ от краёв экрана для стартового вида
const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5; // до 2.5 экранных px на px мира
// Верх мира (y = 0, верхний край листа) нельзя опустить ниже этой доли экрана
const MAX_TOP_GAP = 0.4;
const TAP_SLOP = 8; // сдвиг пальца, после которого это уже не тап, а перелёт
const DOUBLE_TAP_MS = 300;
const FRICTION = 0.94; // инерция: доля скорости, остающаяся за 16 мс
const MIN_SPEED = 0.02; // px/мс — медленнее инерция останавливается
const MAX_SPEED = 3; // px/мс — быстрее бросок не разгоняет

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const matches = (t: EventTarget | null, selector: string) => t instanceof Element && t.closest(selector) !== null;
const isEditable = (t: EventTarget | null) => matches(t, 'textarea, input, [contenteditable="true"]');
// По таким элементам тап и двойной тап — их собственные
const isInteractive = (t: EventTarget | null) => matches(t, 'textarea, input, button, a, [contenteditable="true"]');

// Бесконечное полотно, над которым «летают»: одним пальцем (или мышью)
// мир двигается, после броска скользит по инерции; щипок, Ctrl/⌘ + колесо
// или щипок на тачпаде — масштаб. Мир ограничен только сверху (y = 0).
// Все жесты обрабатываем сами (touch-action: none), а камеру пишем прямо в
// стиль — без перерисовки React на каждом кадре. Элементы с [data-no-pan]
// полотно не трогает: нажатие на них — их собственное.
export function Canvas({ ref, home, locked = false, background, onFrame, onSettle, onDoubleTap, children }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const insetsRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<CanvasHandle | null>(null);
  // Свежие пропсы для обработчиков, подписанных один раз
  const props = useRef({ home, locked, onFrame, onSettle, onDoubleTap });
  props.current = { home, locked, onFrame, onSettle, onDoubleTap };

  useImperativeHandle(
    ref,
    () => ({
      goHome: () => apiRef.current?.goHome() ?? Promise.resolve(),
      visibleRect: () => apiRef.current!.visibleRect(),
      panBy: (dx, dy) => apiRef.current?.panBy(dx, dy)
    }),
    []
  );

  useLayoutEffect(() => {
    const viewport = viewportRef.current!;
    const world = worldRef.current!;
    const insetsProbe = insetsRef.current!;

    let cam: Camera = { x: 0, y: 0, scale: 1 };
    let size: Size = { w: 0, h: 0 };
    let origin: Point = { x: 0, y: 0 };
    let frame = 0;
    let writeFrame = 0;
    let settleTimer = 0;
    let rasterScale = 0;

    // Мир всегда лежит на отдельном слое (will-change: transform в CSS):
    // перелёт и щипок только двигают и масштабируют готовую «картинку»,
    // без перерисовки. Камеру пишем в стиль раз в кадр, даже если за кадр
    // пришло несколько событий (при щипке — от каждого пальца).
    const write = () => {
      writeFrame = 0;
      world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
      props.current.onFrame?.(cam, size);
    };

    const flush = () => {
      cancelAnimationFrame(writeFrame);
      write();
    };

    // Чёткость текста после масштаба: «картинка» слоя осталась в старом
    // разрешении, поэтому, когда камера замерла, один раз пересоздаём слой
    // (снимаем и возвращаем will-change) — браузер перерисует его в новом
    // масштабе. На каждом кадре так делать нельзя — это и давало лаги.
    const settle = () => {
      props.current.onSettle?.(cam, size);
      if (cam.scale === rasterScale) return;
      rasterScale = cam.scale;
      world.style.willChange = 'auto';
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          world.style.willChange = '';
        })
      );
    };

    const apply = () => {
      if (!writeFrame) writeFrame = requestAnimationFrame(write);
      clearTimeout(settleTimer);
      settleTimer = window.setTimeout(settle, 200);
    };

    // Отступы от выреза камеры и «домашней полоски»: env() есть только в
    // CSS, поэтому читаем их с невидимого элемента
    const insets = () => {
      const s = getComputedStyle(insetsProbe);
      return {
        top: parseFloat(s.paddingTop),
        right: parseFloat(s.paddingRight),
        bottom: parseFloat(s.paddingBottom),
        left: parseFloat(s.paddingLeft)
      };
    };

    const homeCamera = (): Camera => {
      const { x, y, width, minScale } = props.current.home;
      const i = insets();
      const aw = size.w - i.left - i.right - 2 * FIT_PADDING;
      const scale = clamp(aw / width, minScale, MAX_SCALE);
      return { scale, x: size.w / 2 - x * scale, y: i.top + FIT_PADDING - y * scale };
    };

    const clampScale = (s: number) => clamp(s, MIN_SCALE, MAX_SCALE);

    // Над верхним краем мира — не дальше MAX_TOP_GAP экрана; вниз и в
    // стороны мир бесконечен
    const set = (c: Camera) => {
      cam = { scale: c.scale, x: c.x, y: Math.min(c.y, size.h * MAX_TOP_GAP) };
      apply();
    };

    // Масштаб вокруг точки экрана p: точка мира под ней остаётся на месте
    const zoomAt = (p: Point, scale: number) => {
      const s = clampScale(scale);
      set({ scale: s, x: p.x - ((p.x - cam.x) / cam.scale) * s, y: p.y - ((p.y - cam.y) / cam.scale) * s });
    };

    const stop = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };

    const animateTo = (to: Camera, duration = 320) =>
      new Promise<void>(resolve => {
        stop();
        const from = cam;
        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          const k = 1 - (1 - t) ** 3;
          set({
            x: from.x + (to.x - from.x) * k,
            y: from.y + (to.y - from.y) * k,
            scale: from.scale + (to.scale - from.scale) * k
          });
          if (t < 1) {
            frame = requestAnimationFrame(step);
          } else {
            frame = 0;
            flush();
            resolve();
          }
        };
        frame = requestAnimationFrame(step);
      });

    // Инерция после броска: скорость в px/мс постепенно гаснет
    const glide = (vx: number, vy: number) => {
      stop();
      const speed = Math.hypot(vx, vy);
      if (speed > MAX_SPEED) {
        vx *= MAX_SPEED / speed;
        vy *= MAX_SPEED / speed;
      }
      let last = performance.now();
      const step = (now: number) => {
        const dt = now - last;
        last = now;
        const decay = FRICTION ** (dt / 16);
        vx *= decay;
        vy *= decay;
        set({ ...cam, x: cam.x + vx * dt, y: cam.y + vy * dt });
        frame = Math.hypot(vx, vy) > MIN_SPEED ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    };

    const local = (clientX: number, clientY: number): Point => ({ x: clientX - origin.x, y: clientY - origin.y });
    const toWorld = (p: Point): Point => ({ x: (p.x - cam.x) / cam.scale, y: (p.y - cam.y) / cam.scale });

    apiRef.current = {
      goHome: () => animateTo(homeCamera()),
      visibleRect: () => ({ x: -cam.x / cam.scale, y: -cam.y / cam.scale, w: size.w / cam.scale, h: size.h / cam.scale }),
      panBy: (dx, dy) => void animateTo({ ...cam, x: cam.x + dx, y: cam.y + dy }, 250)
    };

    const resize = () => {
      const prev = size;
      size = { w: viewport.clientWidth, h: viewport.clientHeight };
      if (size.w === prev.w && size.h === prev.h) return;
      const r = viewport.getBoundingClientRect();
      origin = { x: r.left, y: r.top };
      if (prev.w === 0) {
        // Первый показ — начало листа, сразу, до первой отрисовки
        set(homeCamera());
        flush();
        return;
      }
      // Поворот экрана: точка мира в центре экрана остаётся в центре
      const c = toWorld({ x: prev.w / 2, y: prev.h / 2 });
      set({ scale: cam.scale, x: size.w / 2 - c.x * cam.scale, y: size.h / 2 - c.y * cam.scale });
    };

    // --- Пальцы и мышь ---

    const pointers = new Map<number, Point>();
    let downAt: Point = { x: 0, y: 0 };
    let moving = false; // жест стал перелётом/щипком, а не тапом
    let samples: { t: number; x: number; y: number }[] = [];
    let lastTap = { t: 0, x: 0, y: 0 };

    const firstTwo = () => [...pointers.values()].slice(0, 2) as [Point, Point];

    const beginMoving = () => {
      if (moving) return;
      moving = true;
      viewport.classList.add('is-panning');
      // Захватываем пальцы, только когда жест точно не тап: иначе тап по
      // тексту не поставил бы в него курсор
      for (const id of pointers.keys()) {
        try {
          viewport.setPointerCapture(id);
        } catch {
          // палец уже убран
        }
      }
    };

    const onDown = (e: PointerEvent) => {
      if (props.current.locked || matches(e.target, '[data-no-pan]')) return;
      // Мышью по тексту — выделение текста, а не перелёт
      if (e.pointerType === 'mouse' && (e.button !== 0 || isEditable(e.target))) return;
      stop();
      const p = local(e.clientX, e.clientY);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        downAt = p;
        moving = false;
        samples = [];
      } else {
        beginMoving();
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e.clientX, e.clientY);

      if (pointers.size === 1) {
        if (!moving && dist(p, downAt) < TAP_SLOP) return;
        beginMoving();
        pointers.set(e.pointerId, p);
        set({ ...cam, x: cam.x + p.x - prev.x, y: cam.y + p.y - prev.y });
        samples.push({ t: e.timeStamp, x: p.x, y: p.y });
        return;
      }

      // Два пальца: масштаб вокруг середины между ними + сдвиг вместе с ней
      const [a, b] = firstTwo();
      pointers.set(e.pointerId, p);
      const [a2, b2] = firstTwo();
      const before = mid(a, b);
      const after = mid(a2, b2);
      const d = dist(a, b);
      if (d > 0) zoomAt(before, cam.scale * (dist(a2, b2) / d));
      set({ ...cam, x: cam.x + after.x - before.x, y: cam.y + after.y - before.y });
    };

    const onUp = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      // Из щипка остался один палец — дальше он просто двигает мир
      if (pointers.size > 0) {
        samples = [];
        return;
      }
      viewport.classList.remove('is-panning');

      if (moving) {
        moving = false;
        // Бросок: скорость по движению за последние 100 мс
        const recent = samples.filter(s => e.timeStamp - s.t < 100);
        if (e.type === 'pointerup' && recent.length > 1) {
          const a = recent[0];
          const b = recent[recent.length - 1];
          const dt = b.t - a.t;
          if (dt > 0) glide((b.x - a.x) / dt, (b.y - a.y) / dt);
        }
        return;
      }

      // Это был тап
      if (e.type !== 'pointerup' || isInteractive(e.target)) return;
      // Тап по пустому месту убирает клавиатуру
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const p = local(e.clientX, e.clientY);
      if (e.timeStamp - lastTap.t < DOUBLE_TAP_MS && dist(p, lastTap) < 30) {
        lastTap = { t: 0, x: 0, y: 0 };
        flush(); // точка мира — по уже применённой камере
        props.current.onDoubleTap?.(toWorld(p));
      } else {
        lastTap = { t: e.timeStamp, x: p.x, y: p.y };
      }
    };

    // Колесо: Ctrl/⌘ (или щипок тачпада в Chrome/Edge) — масштаб,
    // иначе — сдвиг (прокрутка двумя пальцами по тачпаду)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (props.current.locked) return;
      stop();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? size.h : 1;
      if (e.ctrlKey || e.metaKey) {
        zoomAt(local(e.clientX, e.clientY), cam.scale * Math.exp(-e.deltaY * unit * 0.01));
      } else {
        set({ ...cam, x: cam.x - e.deltaX * unit, y: cam.y - e.deltaY * unit });
      }
    };

    // Safari: щипок на тачпаде Mac приходит только событиями gesture*;
    // на iPhone/iPad они дублируют pointer-события — там лишь не даём
    // Safari масштабировать саму страницу
    type GestureEvent = Event & { scale: number; clientX: number; clientY: number };
    let gestureBase = 1;
    const onGestureStart = (e: Event) => {
      e.preventDefault();
      gestureBase = cam.scale;
    };
    const onGestureChange = (e: Event) => {
      e.preventDefault();
      if (pointers.size > 0 || props.current.locked) return;
      const g = e as GestureEvent;
      zoomAt(local(g.clientX, g.clientY), gestureBase * g.scale);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove);
    viewport.addEventListener('pointerup', onUp);
    viewport.addEventListener('pointercancel', onUp);
    viewport.addEventListener('wheel', onWheel, { passive: false });
    viewport.addEventListener('gesturestart', onGestureStart);
    viewport.addEventListener('gesturechange', onGestureChange);

    return () => {
      stop();
      cancelAnimationFrame(writeFrame);
      clearTimeout(settleTimer);
      observer.disconnect();
      apiRef.current = null;
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onUp);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('gesturestart', onGestureStart);
      viewport.removeEventListener('gesturechange', onGestureChange);
    };
  }, []);

  return (
    <div ref={viewportRef} className="canvas">
      <div ref={insetsRef} className="canvas-insets" aria-hidden="true" />
      {background}
      <div ref={worldRef} className="canvas-world">
        {children}
      </div>
    </div>
  );
}
