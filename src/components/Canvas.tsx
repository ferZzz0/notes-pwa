import { useEffect, useImperativeHandle, useLayoutEffect, useRef, type ReactNode, type Ref } from 'react';
import './Canvas.css';

// «Камера»: точка мира (wx, wy) видна на экране в (x + wx·scale, y + wy·scale)
export type Camera = { x: number; y: number; scale: number };
export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; w: number; h: number };
export type Size = { w: number; h: number };

// Стартовый вид: по ширине экрана помещается width px мира (но масштаб не
// мельче minScale); точка мира (x, y) — у верха экрана (под вырезом камеры)
// и по горизонтали посередине, у левого или у правого края экрана (align)
export type Home = { x: number; y: number; width: number; minScale: number; align: 'center' | 'left' | 'right' };
// Какие края листа не растут вслед за текстом (верх листа, корешок)
export type Fixed = { top?: boolean; left?: boolean; right?: boolean };
// Жест, начатый на предмете в мире (выбранной надписи), двигает его, а не
// камеру. Пальцы — в экранных px полотна, один или два: begin — когда жест
// начался и когда пальцев стало больше или меньше, move — на каждом сдвиге
export type Grab = {
  begin: (pts: Point[]) => void;
  move: (pts: Point[]) => void;
  end: () => void;
};

export type CanvasHandle = {
  // Плавно перелететь к стартовому виду (или к указанному) за duration мс;
  // промис — когда долетели (сразу, если камера уже там)
  goHome: (home?: Home, duration?: number) => Promise<void>;
  // Сразу показать начало листа в стандартном размере (как после поворота экрана)
  showHome: () => void;
  // Какая часть мира сейчас на экране
  visibleRect: () => Rect;
  // Плавно сдвинуть камеру на (dx, dy) экранных px; промис — когда сдвинулась
  panBy: (dx: number, dy: number) => Promise<void>;
  // Сдвинуть сразу, без анимации, по свежим границам листа (их только что
  // поменяли пропсы — например, лист удлинили под клавиатуру)
  jump: (dx: number, dy: number) => void;
};

type Props = {
  ref?: Ref<CanvasHandle>;
  home: Home;
  // Лист: сначала ровно весь экран в стартовом виде (вместе с полосами
  // под вырезом и «домашней полоской»). Если содержимое (content — его
  // прямоугольник) подошло к краю ближе EDGE_ZONE экрана, в эту сторону
  // открывается ещё целый экран листа. Края из fixed не растут. Без bounded
  // камера летает свободно (переходы)
  content?: Rect | null;
  fixed?: Fixed;
  bounded?: boolean;
  // Временно добавить снизу столько экранных px (открытая клавиатура:
  // строку должно быть можно поднять над ней)
  extraBottom?: number;
  // Пока true, жесты не двигают камеру (например, во время переворота листа)
  locked?: boolean;
  // Рисуется под миром, в координатах экрана (например, бумага)
  background?: ReactNode;
  // Каждый кадр, когда камера сдвинулась
  onFrame?: (cam: Camera, size: Size) => void;
  // Касание по миру (не по полю ввода или кнопке) — точка мира; у двойного
  // касания приходит и на каждое из двух
  onTap?: (p: Point) => void;
  // Двойное касание по миру (не по полю ввода или кнопке) — точка мира
  onDoubleTap?: (p: Point) => void;
  // Палец лёг в точку p (экранные px полотна): если там то, что можно
  // двигать, — его жест (Grab), иначе null — тогда двигается камера
  grab?: (p: Point) => Grab | null;
  // Долгое нажатие на мир (палец стоит LONG_PRESS_MS; touch = true) или
  // правый клик — точка мира и точка экрана (px полотна); тапа после него нет
  onLongPress?: (world: Point, screen: Point, touch: boolean) => void;
  // Палец после долгого нажатия отпустили (activated — это touchend, ещё
  // «жест пользователя»: в нём браузер даёт читать буфер обмена) или касание
  // оборвалось (touchcancel — false)
  onLongPressEnd?: (activated: boolean) => void;
  // Смахнули лист вбок там, где он дальше не едет (лист по экрану или
  // камера упёрлась в его край): палец влево — 'next', вправо — 'prev';
  // start — где палец лёг (px полотна), width — ширина полотна
  onSwipe?: (dir: 'next' | 'prev', start: Point, width: number) => void;
  // Лист начали и закончили двигать пальцами (перелёт или щипок, не предмет);
  // конец — в отпускании пальца
  onPanStart?: () => void;
  onPanEnd?: () => void;
  // Скользит ли лист по инерции после броска (по умолчанию да)
  inertia?: boolean;
  // Касание (цель и точка в окне) — не полотна, а браузера: например, у
  // надписи, в которой печатают, — курсор, выделение, его ручки
  nativeTouch?: (target: EventTarget | null, clientX: number, clientY: number) => boolean;
  children: ReactNode;
};

const MIN_SCALE = 0.12;
const MAX_SCALE = 2.5; // до 2.5 экранных px на px мира
const EDGE_ZONE = 0.2; // содержимое ближе этой доли экрана к краю — лист растёт на экран
const TAP_SLOP = 8; // сдвиг пальца, после которого это уже не тап, а перелёт
const DOUBLE_TAP_MS = 300;
const LONG_PRESS_MS = 500;
// Смахивание: не короче SWIPE_PX (экранные px), быстрее SWIPE_MS, вбок в
// SWIPE_RATIO раз больше, чем вверх-вниз; лист за это время сдвинулся не
// больше чем на SWIPE_SLIP пути пальца (упёрся в край)
const SWIPE_PX = 50;
const SWIPE_MS = 700;
const SWIPE_RATIO = 1.5;
const SWIPE_SLIP = 0.25;
const FRICTION = 0.94; // инерция: доля скорости, остающаяся за 16 мс
const MIN_SPEED = 0.02; // px/мс — медленнее инерция останавливается
const MAX_SPEED = 3; // px/мс — быстрее бросок не разгоняет

const clamp = (v: number, min: number, max: number) => Math.min(Math.max(v, min), max);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const matches = (t: EventTarget | null, selector: string) => t instanceof Element && t.closest(selector) !== null;
const EDITABLE = 'textarea, input, [contenteditable]:not([contenteditable="false"])';
const isEditable = (t: EventTarget | null) => matches(t, EDITABLE);
// По таким элементам тап и двойной тап — их собственные
const isInteractive = (t: EventTarget | null) => matches(t, `${EDITABLE}, button, a`);

// Полотно, над которым «летают»: одним пальцем (или мышью) мир двигается,
// после броска скользит по инерции; щипок, Ctrl/⌘ + колесо или щипок на
// тачпаде — масштаб. Камера не выходит за лист (bounds): он всегда
// закрывает весь экран, отдалить дальше листа нельзя. Все жесты обрабатываем сами (touch-action: none), а
// камеру пишем прямо в стиль — без перерисовки React на каждом кадре.
// Элементы с [data-no-pan] полотно не трогает: нажатие на них — их собственное.
export function Canvas({
  ref,
  home,
  content = null,
  fixed = {},
  bounded = true,
  extraBottom = 0,
  locked = false,
  background,
  onFrame,
  onTap,
  onDoubleTap,
  grab,
  onLongPress,
  onLongPressEnd,
  onSwipe,
  onPanStart,
  onPanEnd,
  inertia = true,
  nativeTouch,
  children
}: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const insetsRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<(CanvasHandle & { reclamp: () => void }) | null>(null);
  // Свежие пропсы для обработчиков, подписанных один раз
  const props = useRef({ home, content, fixed, bounded, extraBottom, locked, onFrame, onTap, onDoubleTap, grab, onLongPress, onLongPressEnd, onSwipe, onPanStart, onPanEnd, inertia, nativeTouch });
  props.current = { home, content, fixed, bounded, extraBottom, locked, onFrame, onTap, onDoubleTap, grab, onLongPress, onLongPressEnd, onSwipe, onPanStart, onPanEnd, inertia, nativeTouch };

  useImperativeHandle(
    ref,
    () => ({
      goHome: (h, duration) => apiRef.current?.goHome(h, duration) ?? Promise.resolve(),
      showHome: () => apiRef.current?.showHome(),
      visibleRect: () => apiRef.current!.visibleRect(),
      panBy: (dx, dy) => apiRef.current?.panBy(dx, dy) ?? Promise.resolve(),
      jump: (dx, dy) => apiRef.current?.jump(dx, dy)
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
    // Отступы от выреза камеры и «домашней полоски»
    let ins = { top: 0, right: 0, bottom: 0, left: 0 };
    let bounds: Rect | null = null;
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

    // Размер экрана и отступы прямо сейчас (а не из последнего
    // ResizeObserver): при повороте телефона событие ориентации приходит
    // раньше, чем он. env() есть только в CSS — отступы читаем с невидимого
    // элемента
    const measure = () => {
      const prev = size;
      size = { w: viewport.clientWidth, h: viewport.clientHeight };
      const r = viewport.getBoundingClientRect();
      origin = { x: r.left, y: r.top };
      const s = getComputedStyle(insetsProbe);
      ins = {
        top: parseFloat(s.paddingTop),
        right: parseFloat(s.paddingRight),
        bottom: parseFloat(s.paddingBottom),
        left: parseFloat(s.paddingLeft)
      };
      return prev;
    };

    // Страница — по ширине безопасной зоны, верх текста — под вырезом;
    // бумага же покрывает и полосы под вырезом (computeBounds)
    const homeCamera = (h = props.current.home): Camera => {
      const { x, y, width, minScale, align } = h;
      const scale = clamp((size.w - ins.left - ins.right) / width, minScale, MAX_SCALE);
      const anchorX = align === 'left' ? ins.left : align === 'right' ? size.w - ins.right : size.w / 2;
      return { scale, x: anchorX - x * scale, y: ins.top - y * scale };
    };

    // Сколько целых шагов step нужно отодвинуть край edge, чтобы до
    // содержимого (его край — reach) оставалось не меньше EDGE_ZONE шага
    const steps = (edge: number, reach: number, step: number) =>
      Math.max(0, Math.ceil((reach + step * EDGE_ZONE - edge) / step));

    // Лист: весь экран в стартовом виде (и полосы под вырезом — тоже
    // бумага); в незакреплённые стороны — на столько экранов больше, чтобы
    // содержимое не подходило к краю ближе EDGE_ZONE экрана
    const computeBounds = (): Rect | null => {
      const { bounded, content, fixed, extraBottom } = props.current;
      if (!bounded || size.w === 0) return null;
      const h = homeCamera();
      const w = size.w / h.scale;
      const hh = size.h / h.scale;
      let x0 = -h.x / h.scale;
      let y0 = -h.y / h.scale;
      let x1 = x0 + w;
      let y1 = y0 + hh;
      if (content) {
        if (!fixed.left) x0 -= w * steps(-x0, -content.x, w);
        if (!fixed.right) x1 += w * steps(x1, content.x + content.w, w);
        if (!fixed.top) y0 -= hh * steps(-y0, -content.y, hh);
        y1 += hh * steps(y1, content.y + content.h, hh);
        // Лист — всегда той же формы, что экран (просьба автора): вырос вбок
        // — дорастает вниз на столько же экранов, и наоборот. Иначе
        // отдалить его не давала бы короткая сторона. Вбок — поровну в
        // свободные стороны (у разворота — в обе, корешок посередине)
        const n = Math.max(Math.round((x1 - x0) / w), Math.round((y1 - y0) / hh));
        const moreX = n * w - (x1 - x0);
        if (moreX > 0) {
          const share = fixed.left || fixed.right ? 1 : 0.5;
          if (!fixed.left) x0 -= moreX * share;
          if (!fixed.right) x1 += moreX * share;
        }
        const moreY = n * hh - (y1 - y0);
        if (moreY > 0) {
          if (fixed.top) y1 += moreY;
          else {
            y0 -= moreY / 2;
            y1 += moreY / 2;
          }
        }
      }
      y1 += extraBottom / cam.scale;
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    };

    // Отдалить можно, пока лист закрывает весь экран
    const minScale = () => (bounds ? Math.max(MIN_SCALE, size.w / bounds.w, size.h / bounds.h) : MIN_SCALE);

    const clampScale = (s: number) => clamp(s, minScale(), Math.max(MAX_SCALE, minScale()));

    // Камера не выходит за лист: его края не заходят внутрь экрана — за
    // листом никогда не видно ничего, кроме бумаги
    const set = (c: Camera) => {
      let { x, y } = c;
      const scale = bounds ? clampScale(c.scale) : c.scale;
      if (bounds) {
        const minX = size.w - (bounds.x + bounds.w) * scale;
        const maxX = -bounds.x * scale;
        x = minX > maxX ? (minX + maxX) / 2 : clamp(x, minX, maxX);
        const minY = size.h - (bounds.y + bounds.h) * scale;
        const maxY = -bounds.y * scale;
        y = minY > maxY ? maxY : clamp(y, minY, maxY);
      }
      cam = { scale, x, y };
      apply();
    };

    // Масштаб вокруг точки экрана p: точка мира под ней остаётся на месте
    const zoomAt = (p: Point, scale: number) => {
      const s = bounds ? clampScale(scale) : clamp(scale, MIN_SCALE, MAX_SCALE);
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
        // Уже на месте — не ждём (иначе перелистывание стояло бы впустую)
        if (Math.abs(to.x - from.x) < 0.5 && Math.abs(to.y - from.y) < 0.5 && Math.abs(to.scale - from.scale) < 1e-4) {
          set(to);
          flush();
          resolve();
          return;
        }
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
        const before = cam;
        set({ ...cam, x: cam.x + vx * dt, y: cam.y + vy * dt });
        // Упёрлись в край листа по оси — по ней скорость гасим сразу: иначе
        // «полёт» на месте шёл бы ещё секунду (и кадры — onFrame — тоже)
        if (cam.x === before.x) vx = 0;
        if (cam.y === before.y) vy = 0;
        frame = Math.hypot(vx, vy) > MIN_SPEED ? requestAnimationFrame(step) : 0;
      };
      frame = requestAnimationFrame(step);
    };

    const local = (clientX: number, clientY: number): Point => ({ x: clientX - origin.x, y: clientY - origin.y });
    const toWorld = (p: Point): Point => ({ x: (p.x - cam.x) / cam.scale, y: (p.y - cam.y) / cam.scale });

    apiRef.current = {
      goHome: (h, duration) => {
        measure();
        bounds = computeBounds();
        return animateTo(homeCamera(h), duration);
      },
      showHome: () => {
        measure();
        bounds = computeBounds();
        stop();
        set(homeCamera());
        flush();
      },
      visibleRect: () => ({ x: -cam.x / cam.scale, y: -cam.y / cam.scale, w: size.w / cam.scale, h: size.h / cam.scale }),
      panBy: (dx, dy) => animateTo({ ...cam, x: cam.x + dx, y: cam.y + dy }, 250),
      jump: (dx, dy) => {
        bounds = computeBounds();
        stop();
        set({ ...cam, x: cam.x + dx, y: cam.y + dy });
        flush();
      },
      // Лист изменился (вырос, уменьшился, закрылась клавиатура, переход
      // закончился) — камера плавно возвращается внутрь листа
      reclamp: () => {
        bounds = computeBounds();
        const from = cam;
        set(cam);
        const to = cam;
        if (Math.abs(to.x - from.x) + Math.abs(to.y - from.y) + Math.abs(to.scale - from.scale) * 100 > 2) {
          cam = from;
          void animateTo(to, 250);
        }
      }
    };

    const resize = () => {
      const prev = measure();
      if (size.w === prev.w && size.h === prev.h) return;
      bounds = computeBounds();
      if (prev.w === 0) {
        // Первый показ — начало листа, сразу, до первой отрисовки
        set(homeCamera());
        flush();
        return;
      }
      // Поворот экрана (и любое другое изменение размера) — всегда начало
      // листа в стандартном размере, даже если лист приблизили или он вырос
      // (просьба автора). На iPhone размер при повороте меняется в несколько
      // шагов, поэтому так — на каждом шаге
      stop();
      set(homeCamera());
      flush();
    };

    // --- Пальцы и мышь ---

    const pointers = new Map<number, Point>();
    let downAt: Point = { x: 0, y: 0 };
    let moving = false; // жест стал перелётом/щипком, а не тапом
    // Жест, отданный предмету в мире (первый палец лёг на него)
    let grabbed: Grab | null = null;
    // Касание по листу уже обработано — «мышиные» события, которые браузер
    // присылает после него (mousedown, click), глушим: mousedown по бумаге
    // снял бы фокус с поля, которое касание только что открыло (строку при
    // этом уже подняли над будущей клавиатурой, и под пальцем — бумага)
    let swallowMouse = false;
    let samples: { t: number; x: number; y: number }[] = [];
    let lastTap = { t: 0, x: 0, y: 0 };
    // Долгое нажатие: его таймер, сработало ли оно (тогда отпускание — не
    // тап) и сообщили ли уже, что палец отпустили
    let pressTimer = 0;
    let pressed = false;
    let pressEnded = false;
    // Для смахивания: когда лёг палец, где тогда была камера и было ли в
    // жесте больше одного пальца
    let downTime = 0;
    let downCamX = 0;
    let multi = false;

    const firstTwo = () => [...pointers.values()].slice(0, 2) as [Point, Point];

    const beginMoving = () => {
      clearTimeout(pressTimer);
      if (moving) return;
      moving = true;
      viewport.classList.add('is-panning');
      if (!grabbed) props.current.onPanStart?.();
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
      // Мышью по тексту — выделение текста, а не перелёт; пальцем у надписи,
      // в которой печатают, — тоже её (nativeTouch)
      if (e.pointerType === 'mouse' && (e.button !== 0 || isEditable(e.target))) return;
      if (e.pointerType !== 'mouse' && props.current.nativeTouch?.(e.target, e.clientX, e.clientY)) return;
      stop();
      const p = local(e.clientX, e.clientY);
      pointers.set(e.pointerId, p);
      if (pointers.size === 1) {
        downAt = p;
        moving = false;
        samples = [];
        flush(); // предмет ищут по уже применённой камере
        downTime = e.timeStamp;
        downCamX = cam.x;
        multi = false;
        grabbed = props.current.grab?.(p) ?? null;
        pressed = false;
        pressEnded = false;
        clearTimeout(pressTimer);
        // Мышью долгое нажатие — правый клик (ниже)
        if (!grabbed && e.pointerType !== 'mouse' && !isInteractive(e.target)) {
          pressTimer = window.setTimeout(() => {
            if (pointers.size !== 1 || moving || props.current.locked) return;
            pressed = true;
            flush();
            props.current.onLongPress?.(toWorld(downAt), downAt, true);
          }, LONG_PRESS_MS);
        }
      } else {
        multi = true;
        beginMoving();
        grabbed?.begin(firstTwo());
      }
    };

    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const p = local(e.clientX, e.clientY);

      // Жест предмета: камера стоит, пальцы двигают его
      if (grabbed) {
        if (pointers.size === 1 && !moving) {
          if (dist(p, downAt) < TAP_SLOP) return;
          beginMoving();
          grabbed.begin([downAt]);
        }
        pointers.set(e.pointerId, p);
        grabbed.move(pointers.size === 1 ? [p] : firstTwo());
        return;
      }

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
      // Из щипка остался один палец — дальше он просто двигает мир (или предмет)
      if (pointers.size > 0) {
        samples = [];
        if (grabbed && moving) grabbed.begin(firstTwo().slice(0, pointers.size));
        return;
      }
      viewport.classList.remove('is-panning');
      clearTimeout(pressTimer);

      // После долгого нажатия отпускание — не тап
      if (pressed) {
        grabbed = null;
        return;
      }

      if (moving && grabbed) {
        moving = false;
        grabbed.end();
        grabbed = null;
        return;
      }
      grabbed = null;

      if (moving) {
        moving = false;
        props.current.onPanEnd?.();
        // Смахнули вбок, а лист не поехал (упёрся) — перелистнуть, без инерции
        const end = local(e.clientX, e.clientY);
        const dx = end.x - downAt.x;
        const dy = end.y - downAt.y;
        if (
          e.type === 'pointerup' &&
          !multi &&
          Math.abs(dx) >= SWIPE_PX &&
          Math.abs(dx) > SWIPE_RATIO * Math.abs(dy) &&
          e.timeStamp - downTime < SWIPE_MS &&
          Math.abs(cam.x - downCamX) < Math.abs(dx) * SWIPE_SLIP &&
          props.current.onSwipe
        ) {
          props.current.onSwipe(dx < 0 ? 'next' : 'prev', downAt, size.w);
          return;
        }
        // Бросок: скорость по движению за последние 100 мс
        const recent = samples.filter(s => e.timeStamp - s.t < 100);
        if (props.current.inertia && e.type === 'pointerup' && recent.length > 1) {
          const a = recent[0];
          const b = recent[recent.length - 1];
          const dt = b.t - a.t;
          if (dt > 0) glide((b.x - a.x) / dt, (b.y - a.y) / dt);
        }
        return;
      }

      // Это был тап
      if (e.type !== 'pointerup' || isInteractive(e.target)) return;
      if (e.pointerType !== 'mouse') swallowMouse = true;
      // Тап по пустому месту убирает клавиатуру
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const p = local(e.clientX, e.clientY);
      flush(); // точка мира — по уже применённой камере
      // Одна и та же точка мира для обоих: касание может сразу сдвинуть лист
      // (открыть надпись и поднять её над клавиатурой)
      const w = toWorld(p);
      props.current.onTap?.(w);
      if (e.timeStamp - lastTap.t < DOUBLE_TAP_MS && dist(p, lastTap) < 30) {
        lastTap = { t: 0, x: 0, y: 0 };
        props.current.onDoubleTap?.(w);
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

    // Правый клик мышью — как долгое нажатие. Долгое нажатие пальцем
    // (Android шлёт и его) уже обработано таймером — только глушим меню
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (pointers.size > 0 || props.current.locked || isInteractive(e.target)) return;
      const p = local(e.clientX, e.clientY);
      flush();
      props.current.onLongPress?.(toWorld(p), p, false);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    viewport.addEventListener('pointerdown', onDown);
    viewport.addEventListener('pointermove', onMove);
    viewport.addEventListener('pointerup', onUp);
    viewport.addEventListener('pointercancel', onUp);
    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length > 0) return;
      if (pressed && !pressEnded) {
        pressEnded = true;
        e.preventDefault();
        props.current.onLongPressEnd?.(true);
        return;
      }
      if (!swallowMouse) return;
      swallowMouse = false;
      e.preventDefault();
    };
    viewport.addEventListener('touchend', onTouchEnd, { passive: false });
    const onTouchCancel = () => {
      if (!pressed || pressEnded) return;
      pressEnded = true;
      props.current.onLongPressEnd?.(false);
    };
    viewport.addEventListener('touchcancel', onTouchCancel);
    // Касание по бумаге — только наше: без этого iOS на долгом нажатии
    // включает свои лупу и меню и обрывает касание (touchcancel), и
    // отпускания пальца — где можно читать буфер обмена — уже не бывает.
    // В надписи, где печатают, касания свои (курсор, выделение, лупа); у
    // [data-no-pan] (кнопка на листе) — тоже: иначе не будет click
    const onTouchStart = (e: TouchEvent) => {
      if (matches(e.target, '[data-no-pan]')) return;
      const t = e.changedTouches[0];
      if (t && props.current.nativeTouch?.(e.target, t.clientX, t.clientY)) return;
      if (!isEditable(e.target)) e.preventDefault();
    };
    viewport.addEventListener('touchstart', onTouchStart, { passive: false });
    viewport.addEventListener('contextmenu', onContextMenu);
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
      viewport.removeEventListener('touchend', onTouchEnd);
      viewport.removeEventListener('touchcancel', onTouchCancel);
      viewport.removeEventListener('touchstart', onTouchStart);
      viewport.removeEventListener('contextmenu', onContextMenu);
      clearTimeout(pressTimer);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('gesturestart', onGestureStart);
      viewport.removeEventListener('gesturechange', onGestureChange);
    };
  }, []);

  // Лист изменился — пересчитываем его и возвращаем камеру внутрь
  const boundsKey = JSON.stringify({ home, content, fixed, bounded, extraBottom });
  useEffect(() => {
    apiRef.current?.reclamp();
  }, [boundsKey]);

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
