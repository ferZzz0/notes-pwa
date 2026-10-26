import { useEffect, useRef, type CSSProperties } from 'react';
import type { Block } from '../notes';
import { DEFAULT_GLITTER, decalOf, decalSrc } from '../textStyle';
import { Glitter } from './Glitter';
import './Charm.css';

// Брелок (просьба автора: сначала — один под островком iPhone, потом «как
// стикеры, сколько угодно и в любое место»): наклейка на цепочке, подвешенная
// в точке листа и качающаяся, как маятник, — от тряски и наклона телефона
// (датчик движения), от касания и от перелистывания. Это вещь листа
// (Block, kind 'charm'): x, y — левый верхний угол цепочки с наклейкой в
// покое, точка подвеса — верх посередине (x + width/2, y); width — ширина
// наклейки (px мира). Цепочка у всех одна

// Цепочка (px мира, Charm.css): длина рисунка; наклейка заходит верхом на
// колечко на OVERLAP + 8% своей ширины — оно будто продето в неё
export const CHAIN_H = 120;
const OVERLAP = 9;
// Ширина наклейки (px мира): от и до; у нового брелка — CHARM_SIZE / зум (на
// экране всегда одинаковый, как новая наклейка)
export const CHARM_MIN = 80;
export const CHARM_MAX = 280;
export const CHARM_SIZE = 150;
// Высота брелка в покое — цепочка и наклейка
export const charmHeight = (w: number) => CHAIN_H + w - OVERLAP - 0.08 * w;

// Маятник: длина (м — с ней качается, как настоящий брелок чуть длиннее
// пальца), самый большой угол (рад — дальше цепочка не пускает,
// отскакивает), самая большая скорость (рад/с)
const LENGTH = 0.12;
// Брелок качался слишком охотно (просьба автора — дважды: «менее
// чувствительным»): затухание сильнее, скорость ниже, толчки слабее, а от
// ускорения самого телефона доходит только доля SHAKE; встряски слабее CALM
// (м/с²) — дрожь руки, шаги — не качают вовсе. Наклон — честный: сила
// тяжести (сглаженные показания, SMOOTH — доля нового показания) тянет в
// полную силу
const DAMPING = 3.4;
const MAX_ANGLE = 2.6;
const MAX_SPEED = 7;
const SHAKE = 0.15;
const CALM = 0.9;
const SMOOTH = 0.03;
const KICK = 1;
const TAP = 1.8;
// Появился (повесили, перелистнули к нему) — чуть качнулся (рад/с)
const APPEAR = 0.6;
const G = 9.81;

// Датчик: у iPhone accelerationIncludingGravity — сама сила тяжести (вниз:
// y < 0, когда телефон стоит), по стандарту и на Android — наоборот. Знак
// уточняем по показаниям: экран обычно держат верхом вверх
const APPLE = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Показания датчика (оси телефона: x — вправо, y — к его верху) в
// координатах экрана (x вправо, y вниз) с учётом поворота экрана:
// горизонтально верх телефона смотрит вбок (без этого брелок в
// горизонтальном режиме висел влево — жалоба автора). Поворот —
// window.orientation (iPhone: 90 — верх телефона слева, −90 — справа),
// иначе screen.orientation
function toScreen(dx: number, dy: number): [number, number] {
  const legacy = (window as { orientation?: unknown }).orientation;
  const turn = typeof legacy === 'number' ? legacy : (screen.orientation?.angle ?? 0);
  switch (((turn % 360) + 360) % 360) {
    case 90:
      return [-dy, -dx];
    case 180:
      return [-dx, dy];
    case 270:
      return [dy, dx];
    default:
      return [dx, -dy];
  }
}

// Датчик один на все брелоки: сила тяжести на экране (м/с², y вниз) с долей
// тряски. Брелоки подписываются (listen): показания пришли — wake
const motion = { gx: 0, gy: G, sign: APPLE ? 1 : -1, upright: 0, base: null as { x: number; y: number } | null };
const wakers = new Set<() => void>();
function onMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity;
  if (a?.x == null || a.y == null) return;
  // Показания (сила тяжести и ускорение самого телефона) в координатах экрана
  const [rx, ry] = toScreen(a.x, a.y);
  // Знак показаний: усреднённо они должны тянуть к низу экрана
  motion.upright += (ry - motion.upright) * 0.02;
  if (Math.abs(motion.upright) > 4) {
    const next = motion.upright > 0 ? 1 : -1;
    if (next !== motion.sign) motion.base = null;
    motion.sign = next;
  }
  const x = motion.sign * rx;
  const y = motion.sign * ry;
  // Сила тяжести — сглаженные показания; остальное — тряска: от неё только
  // доля SHAKE, и без дрожи руки (меньше CALM)
  const base = motion.base ? { x: motion.base.x + (x - motion.base.x) * SMOOTH, y: motion.base.y + (y - motion.base.y) * SMOOTH } : { x, y };
  motion.base = base;
  const sx = x - base.x;
  const sy = y - base.y;
  const shake = Math.hypot(sx, sy);
  const k = shake > CALM ? (SHAKE * (shake - CALM)) / shake : 0;
  motion.gx = base.x + sx * k;
  motion.gy = base.y + sy * k;
  for (const wake of wakers) wake();
}
function listen(wake: () => void) {
  if (wakers.size === 0) window.addEventListener('devicemotion', onMotion);
  wakers.add(wake);
  return () => {
    wakers.delete(wake);
    if (wakers.size === 0) window.removeEventListener('devicemotion', onMotion);
  };
}

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

// Разрешение на датчик движения: на iPhone его можно спросить только прямо
// из нажатия (выбрали брелок в «+», коснулись брелка). Где спрашивать не
// надо — ничего не делает
export function askMotion() {
  const ask = (window.DeviceMotionEvent as unknown as MotionPermission | undefined)?.requestPermission;
  if (typeof ask === 'function') void ask().catch(() => {});
}

// Качнуть брелок id (его коснулись); dir — в какую сторону
const pushers = new Map<string, (speed: number) => void>();
export function pokeCharm(id: string, dir = Math.random() < 0.5 ? -1 : 1) {
  pushers.get(id)?.(dir * TAP);
}

// face — «картинкой» (переворот листа, экспорт): висит отвесно, не качается.
// kick — сколько раз перелистывали: от каждого раза качается
export function CharmItem({ block, kick = 0, face = false }: { block: Block; kick?: number; face?: boolean }) {
  const swing = useRef<HTMLDivElement>(null);
  const push = useRef<((speed: number) => void) | null>(null);
  const size = block.width ?? CHARM_SIZE;
  const scale = block.scale ?? 1;

  useEffect(() => {
    const el = swing.current;
    if (face || !el) return;
    // Угол (рад, 0 — висит прямо вниз, по часовой — как rotate()) и скорость
    let angle = 0;
    let speed = 0;
    // При какой силе тяжести маятник остановился — сдвинулась заметно, снова качаем
    let restX = motion.gx;
    let restY = motion.gy;
    let frame = 0;
    let last = 0;

    const step = (h: number) => {
      // Ускорение груза вдоль дуги: проекция силы тяжести на касательную
      const along = -motion.gx * Math.cos(angle) - motion.gy * Math.sin(angle);
      speed += (along / LENGTH - DAMPING * speed) * h;
      speed = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, speed));
      angle += speed * h;
      if (Math.abs(angle) > MAX_ANGLE) {
        angle = Math.sign(angle) * MAX_ANGLE;
        speed = -speed * 0.4;
      }
    };
    const tick = (t: number) => {
      const dt = Math.min(0.05, last ? (t - last) / 1000 : 1 / 60);
      last = t;
      const n = Math.ceil(dt / (1 / 240));
      for (let i = 0; i < n; i++) step(dt / n);
      el.style.transform = `rotate(${angle}rad)`;
      // Успокоился там, куда тянет сила тяжести, — стоп до следующего толчка
      const rest = Math.atan2(-motion.gx, motion.gy);
      if (Math.abs(speed) < 0.01 && Math.abs(angle - rest) < 0.003) {
        frame = 0;
        restX = motion.gx;
        restY = motion.gy;
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };
    const stop = listen(() => {
      if (!frame && Math.hypot(motion.gx - restX, motion.gy - restY) > 0.3) run();
    });
    const pushIt = (v: number) => {
      speed += v;
      run();
    };
    push.current = pushIt;
    pushers.set(block.id, pushIt);
    // Появился — чуть качнулся
    speed = (Math.random() < 0.5 ? -1 : 1) * APPEAR;
    run();
    return () => {
      stop();
      cancelAnimationFrame(frame);
      if (pushers.get(block.id) === pushIt) pushers.delete(block.id);
      push.current = null;
    };
  }, [face, block.id]);

  // Перелистнули страницу — телефон «дёрнулся»
  useEffect(() => {
    if (kick) push.current?.((Math.random() < 0.5 ? -1 : 1) * KICK * (1 + 0.5 * Math.random()));
  }, [kick]);

  const style = {
    left: block.x,
    top: block.y,
    width: size,
    '--charm-size': `${size}px`,
    transform: scale !== 1 ? `scale(${scale})` : undefined,
    opacity: block.opacity
  } as CSSProperties;
  return (
    <div
      className="item-image item-charm"
      style={style}
      data-block={face ? undefined : block.id}
      data-scale={scale !== 1 ? scale : undefined}
      role="img"
      aria-label={`Брелок «${decalOf(block.decal).label}»`}
    >
      <div className={face ? 'charm-swing' : 'charm-swing is-live'} ref={swing}>
        <svg className="charm-chain" viewBox="0 0 20 56" aria-hidden="true">
          {/* Сверху — замкнутое кольцо (просьба автора), продетое в первое
              звено; точка подвеса — его верх */}
          <circle className="charm-clasp" cx="10" cy="4.6" r="3.6" />
          <g className="charm-links">
            <ellipse cx="10" cy="10" rx="2.4" ry="3.6" />
            <rect x="9.2" y="13" width="1.6" height="6.5" rx="0.8" />
            <ellipse cx="10" cy="22.5" rx="2.4" ry="3.6" />
            <rect x="9.2" y="25.5" width="1.6" height="6.5" rx="0.8" />
            <ellipse cx="10" cy="35" rx="2.4" ry="3.6" />
            <rect x="9.2" y="38" width="1.6" height="5" rx="0.8" />
          </g>
          <circle className="charm-ring" cx="10" cy="49" r="5.5" />
        </svg>
        <div className="charm-body">
          <img src={decalSrc(decalOf(block.decal).id)} alt="" draggable={false} />
          <Glitter seed={block.id} amount={block.glitter ?? DEFAULT_GLITTER} />
        </div>
      </div>
    </div>
  );
}
