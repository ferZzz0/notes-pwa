import { useLayoutEffect, useRef, type ReactNode } from 'react';
import './Canvas.css';

type Props = {
  worldWidth: number;
  worldHeight: number;
  children: ReactNode;
};

// «Камера»: точка мира (wx, wy) видна на экране в (x + wx·scale, y + wy·scale)
type Camera = { x: number; y: number; scale: number };
type Rect = { x: number; y: number; w: number; h: number };
type Point = { x: number; y: number };

const FIT_PADDING = 16; // отступ вокруг, когда показываем что-то целиком
const MIN_ZOOM = 0.5; // отдалить можно вдвое дальше, чем «весь мир на экране»
const MAX_SCALE = 2.5; // приблизить — до 2.5 экранных px на px мира
const KEEP_VISIBLE = 80; // столько px мира всегда остаётся на экране
const TAP_SLOP = 8; // сдвиг пальца, после которого это уже не тап, а перелёт
const DOUBLE_TAP_MS = 300;
const FRICTION = 0.94; // инерция: доля скорости, остающаяся за 16 мс
const MIN_SPEED = 0.02; // px/мс — медленнее инерция останавливается
const MAX_SPEED = 3; // px/мс — быстрее бросок не разгоняет

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const isEditable = (t: EventTarget | null) =>
  t instanceof Element && t.closest('textarea, input, [contenteditable="true"]') !== null;

// Полотно, над которым «летают»: одним пальцем (или мышью по пустому месту)
// мир двигается, после броска скользит по инерции; щипок, Ctrl/⌘ + колесо
// или щипок на тачпаде — масштаб; двойное касание по [data-zoom-target]
// приближает к нему, повторное или по пустому месту — показывает мир
// целиком. Все жесты обрабатываем сами (touch-action: none), а камеру
// пишем прямо в стиль — без перерисовки React на каждом кадре.
// К листу двойное касание приближает «по ширине»: в горизонтали на
// телефоне лист и так упирается в высоту, и «целиком» не приблизило бы.
export function Canvas({ worldWidth, worldHeight, children }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const insetsRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current!;
    const world = worldRef.current!;
    const insetsProbe = insetsRef.current!;
    const worldRect: Rect = { x: 0, y: 0, w: worldWidth, h: worldHeight };

    let cam: Camera = { x: 0, y: 0, scale: 1 };
    let size = { w: 0, h: 0 };
    let origin: Point = { x: 0, y: 0 };
    let fitScale = 1;
    let frame = 0;
    let idleTimer = 0;
    let appliedScale = 0;

    const apply = () => {
      world.style.transform = `translate(${cam.x}px, ${cam.y}px) scale(${cam.scale})`;
      // Масштаб — в CSS-переменную --zoom: по ней мир рисует тонкие линии
      // (клетку) в один экранный пиксель при любом приближении
      if (cam.scale !== appliedScale) {
        appliedScale = cam.scale;
        world.style.setProperty('--zoom', String(cam.scale));
      }
      // Пока камера движется, мир — отдельный слой (плавно); когда замерла,
      // слой убираем, и браузер перерисовывает текст чётко в новом масштабе
      viewport.classList.add('is-moving');
      clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => viewport.classList.remove('is-moving'), 150);
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

    // Камера, при которой прямоугольник мира r виден целиком
    const fitTo = (r: Rect): Camera => {
      const i = insets();
      const aw = size.w - i.left - i.right - 2 * FIT_PADDING;
      const ah = size.h - i.top - i.bottom - 2 * FIT_PADDING;
      const scale = Math.min(aw / r.w, ah / r.h);
      return {
        scale,
        x: i.left + FIT_PADDING + (aw - r.w * scale) / 2 - r.x * scale,
        y: i.top + FIT_PADDING + (ah - r.h * scale) / 2 - r.y * scale
      };
    };

    // Камера, при которой r занимает всю ширину экрана, а его верх — у верха
    // экрана (как при чтении документа); невысокий r — по центру
    const fitWidth = (r: Rect): Camera => {
      const i = insets();
      const aw = size.w - i.left - i.right - 2 * FIT_PADDING;
      const ah = size.h - i.top - i.bottom - 2 * FIT_PADDING;
      const scale = Math.min(aw / r.w, MAX_SCALE);
      const top = r.h * scale > ah ? 0 : (ah - r.h * scale) / 2;
      return {
        scale,
        x: i.left + FIT_PADDING + (aw - r.w * scale) / 2 - r.x * scale,
        y: i.top + FIT_PADDING + top - r.y * scale
      };
    };

    const clampScale = (s: number) => clamp(s, fitScale * MIN_ZOOM, Math.max(MAX_SCALE, fitScale));

    // Мир нельзя увести за край экрана целиком
    const set = (c: Camera) => {
      const w = worldWidth * c.scale;
      const h = worldHeight * c.scale;
      const mx = Math.min(KEEP_VISIBLE, w);
      const my = Math.min(KEEP_VISIBLE, h);
      cam = { scale: c.scale, x: clamp(c.x, mx - w, size.w - mx), y: clamp(c.y, my - h, size.h - my) };
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

    const animateTo = (to: Camera, duration = 320) => {
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
        frame = t < 1 ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    };

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

    // Прямоугольник элемента в координатах мира
    const worldRectOf = (el: Element): Rect => {
      const r = el.getBoundingClientRect();
      const p = local(r.left, r.top);
      return { x: (p.x - cam.x) / cam.scale, y: (p.y - cam.y) / cam.scale, w: r.width / cam.scale, h: r.height / cam.scale };
    };

    const zoomToTarget = (target: EventTarget | null) => {
      const el = target instanceof Element ? target.closest('[data-zoom-target]') : null;
      const goal = el ? fitWidth(worldRectOf(el)) : fitTo(worldRect);
      // Уже приближены к этому листу — повторное касание показывает всё
      const already =
        Math.abs(goal.scale - cam.scale) / goal.scale < 0.05 &&
        Math.abs(goal.x - cam.x) < 20 &&
        Math.abs(goal.y - cam.y) < 20;
      animateTo(already ? fitTo(worldRect) : goal);
    };

    const resize = () => {
      const prev = size;
      size = { w: viewport.clientWidth, h: viewport.clientHeight };
      if (size.w === prev.w && size.h === prev.h) return;
      const r = viewport.getBoundingClientRect();
      origin = { x: r.left, y: r.top };
      fitScale = fitTo(worldRect).scale;
      if (prev.w === 0) {
        // Первый показ — мир целиком
        set(fitTo(worldRect));
        return;
      }
      // Поворот экрана: точка мира в центре экрана остаётся в центре
      const cx = (prev.w / 2 - cam.x) / cam.scale;
      const cy = (prev.h / 2 - cam.y) / cam.scale;
      const s = clampScale(cam.scale);
      set({ scale: s, x: size.w / 2 - cx * s, y: size.h / 2 - cy * s });
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
      // заметке не поставил бы в неё курсор
      for (const id of pointers.keys()) {
        try {
          viewport.setPointerCapture(id);
        } catch {
          // палец уже убран
        }
      }
    };

    const onDown = (e: PointerEvent) => {
      // Мышью по тексту заметки — выделение текста, а не перелёт
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

      // Это был тап; второй тап подряд — приблизить/показать всё
      if (e.type !== 'pointerup') return;
      const p = local(e.clientX, e.clientY);
      if (e.timeStamp - lastTap.t < DOUBLE_TAP_MS && dist(p, lastTap) < 30) {
        lastTap = { t: 0, x: 0, y: 0 };
        // Двойной тап по заметке выделяет слово — не мешаем
        if (!isEditable(e.target)) zoomToTarget(e.target);
      } else {
        lastTap = { t: e.timeStamp, x: p.x, y: p.y };
      }
    };

    // Колесо: Ctrl/⌘ (или щипок тачпада в Chrome/Edge) — масштаб,
    // иначе — сдвиг (прокрутка двумя пальцами по тачпаду)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
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
      if (pointers.size > 0) return;
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
      clearTimeout(idleTimer);
      observer.disconnect();
      viewport.removeEventListener('pointerdown', onDown);
      viewport.removeEventListener('pointermove', onMove);
      viewport.removeEventListener('pointerup', onUp);
      viewport.removeEventListener('pointercancel', onUp);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('gesturestart', onGestureStart);
      viewport.removeEventListener('gesturechange', onGestureChange);
    };
  }, [worldWidth, worldHeight]);

  return (
    <div ref={viewportRef} className="canvas">
      <div ref={insetsRef} className="canvas-insets" aria-hidden="true" />
      <div ref={worldRef} className="canvas-world" style={{ width: worldWidth, height: worldHeight }}>
        {children}
      </div>
    </div>
  );
}
