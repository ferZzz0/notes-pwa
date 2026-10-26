import { useEffect, useRef, type CSSProperties, type Ref } from 'react';
import type { Charm as CharmLook } from '../notes';
import { decalSrc } from '../textStyle';
import { Glitter } from './Glitter';
import './Charm.css';

// Брелок под островком iPhone (просьба автора): наклейка на цепочке висит
// сверху посередине экрана, пока телефон вертикально (горизонтально — у
// каждой страницы разворота свой, посередине её видимой части), и качается, как
// маятник: от тряски и наклона телефона (датчик движения), от касания и от
// перелистывания. Цепочка у всех одна; какая наклейка — выбирают в «+»,
// сколько на ней блёсток и её размер — на панели брелка (касание по нему его
// выбирает); хранится у страницы (Spread.charms)

// Маятник: длина (м — с ней качается, как настоящий брелок чуть длиннее
// пальца), затухание (1/с), самый большой угол (рад — дальше цепочка не
// пускает, отскакивает), самая большая скорость (рад/с)
const LENGTH = 0.12;
// Брелок качался слишком охотно (просьба автора: «менее чувствительным»):
// затухание сильнее, скорость ниже, толчки слабее, а от ускорения самого
// телефона доходит только доля SHAKE; дрожь руки слабее CALM (м/с²) не
// качает вовсе. Наклон — честный: сила тяжести (сглаженные показания,
// SMOOTH — доля нового показания) тянет в полную силу
const DAMPING = 2.4;
const MAX_ANGLE = 2.6;
const MAX_SPEED = 10;
const SHAKE = 0.3;
const CALM = 0.5;
const SMOOTH = 0.06;
const KICK = 1.5;
const TAP = 2.5;
const G = 9.81;

// Размер брелка (px экрана): от и до, сначала
export const CHARM_MIN = 44;
export const CHARM_MAX = 120;
export const CHARM_SIZE = 72;

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

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

// Разрешение на датчик движения: на iPhone его можно спросить только прямо
// из нажатия (выбрали брелок в настройках листа, коснулись брелка). Где
// спрашивать не надо — ничего не делает
export function askMotion() {
  const ask = (window.DeviceMotionEvent as unknown as MotionPermission | undefined)?.requestPermission;
  if (typeof ask === 'function') void ask().catch(() => {});
}

// ref — корень: Notebook ставит его посередине видимой части страницы;
// selected — выбран (рамка), onSelect — коснулись
export function Charm({
  charm,
  kick,
  selected = false,
  onSelect,
  ref
}: {
  charm: CharmLook;
  kick: number;
  selected?: boolean;
  onSelect?: () => void;
  ref?: Ref<HTMLDivElement>;
}) {
  const swing = useRef<HTMLDivElement>(null);
  // Состояние маятника: угол (рад, 0 — висит прямо вниз, по часовой — как
  // rotate()), скорость, сила тяжести на экране (м/с², y вниз) и толчок
  const engine = useRef<{ push: (speed: number) => void } | null>(null);

  useEffect(() => {
    const el = swing.current;
    if (!el) return;
    let angle = 0;
    let speed = 0;
    let gx = 0;
    let gy = G;
    // При какой силе тяжести маятник остановился — сдвинулась заметно, снова качаем
    let restX = gx;
    let restY = gy;
    let sign = APPLE ? 1 : -1;
    let upright = 0;
    // Сглаженная сила тяжести (наклон телефона); null — ещё не было показаний
    let base: { x: number; y: number } | null = null;
    let frame = 0;
    let last = 0;

    const draw = () => {
      el.style.transform = `rotate(${angle}rad)`;
    };
    const step = (h: number) => {
      // Ускорение груза вдоль дуги: проекция силы тяжести на касательную
      const along = -gx * Math.cos(angle) - gy * Math.sin(angle);
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
      draw();
      // Успокоился там, куда тянет сила тяжести, — стоп до следующего толчка
      const rest = Math.atan2(-gx, gy);
      if (Math.abs(speed) < 0.01 && Math.abs(angle - rest) < 0.003) {
        frame = 0;
        restX = gx;
        restY = gy;
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    const run = () => {
      if (frame) return;
      last = 0;
      frame = requestAnimationFrame(tick);
    };

    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.accelerationIncludingGravity;
      if (a?.x == null || a.y == null) return;
      // Показания (сила тяжести и ускорение самого телефона) в координатах экрана
      const [rx, ry] = toScreen(a.x, a.y);
      // Знак показаний: усреднённо они должны тянуть к низу экрана
      upright += (ry - upright) * 0.02;
      if (Math.abs(upright) > 4) {
        const next = upright > 0 ? 1 : -1;
        if (next !== sign) base = null;
        sign = next;
      }
      const x = sign * rx;
      const y = sign * ry;
      // Сила тяжести — сглаженные показания; остальное — тряска: от неё только
      // доля SHAKE, и без дрожи руки (меньше CALM)
      base = base ? { x: base.x + (x - base.x) * SMOOTH, y: base.y + (y - base.y) * SMOOTH } : { x, y };
      const sx = x - base.x;
      const sy = y - base.y;
      const shake = Math.hypot(sx, sy);
      const k = shake > CALM ? (SHAKE * (shake - CALM)) / shake : 0;
      gx = base.x + sx * k;
      gy = base.y + sy * k;
      if (!frame && Math.hypot(gx - restX, gy - restY) > 0.3) run();
    };
    window.addEventListener('devicemotion', onMotion);
    engine.current = {
      push: v => {
        speed += v;
        run();
      }
    };
    // Появился — чуть качнулся
    speed = 1;
    run();
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      cancelAnimationFrame(frame);
      engine.current = null;
    };
  }, []);

  // Перелистнули страницу — телефон «дёрнулся»
  useEffect(() => {
    if (kick) engine.current?.push((Math.random() < 0.5 ? -1 : 1) * KICK * (1 + 0.5 * Math.random()));
  }, [kick]);

  return (
    <div ref={ref} className="charm" style={{ '--charm-size': `${charm.size}px` } as CSSProperties}>
      <div className="charm-swing" ref={swing}>
        <svg className="charm-chain" viewBox="0 0 20 56" aria-hidden="true">
          <path className="charm-clasp" d="M6 0v3a4 4 0 0 0 8 0V0" />
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
        <button
          type="button"
          className={selected ? 'charm-body is-selected' : 'charm-body'}
          aria-label="Брелок"
          onPointerDown={e => {
            // Касание — выбрать и качнуть; на iPhone заодно спросить про
            // датчик движения
            askMotion();
            const r = e.currentTarget.getBoundingClientRect();
            engine.current?.push(e.clientX < r.left + r.width / 2 ? TAP : -TAP);
            onSelect?.();
          }}
        >
          <img src={decalSrc(charm.decal)} alt="" draggable={false} />
          <Glitter seed={`charm-${charm.decal}`} amount={charm.glitter} />
        </button>
      </div>
    </div>
  );
}
