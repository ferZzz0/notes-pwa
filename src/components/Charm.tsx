import { useEffect, useRef, type CSSProperties, type Ref } from 'react';
import type { Charm as CharmLook } from '../notes';
import { decalSrc } from '../textStyle';
import { Glitter } from './Glitter';
import './Charm.css';

// Брелок под островком iPhone (просьба автора): наклейка на цепочке висит
// сверху посередине экрана, пока телефон вертикально (горизонтально — у
// каждой страницы разворота свой, посередине её видимой части), и качается, как
// маятник: от тряски и наклона телефона (датчик движения), от касания и от
// перелистывания. Цепочка у всех одна; какая наклейка, сколько на ней блёсток
// и её размер — в настройках листа (PageLook.charm)

// Маятник: длина (м — с ней качается, как настоящий брелок чуть длиннее
// пальца), затухание (1/с), самый большой угол (рад — дальше цепочка не
// пускает, отскакивает)
const LENGTH = 0.12;
const DAMPING = 1.1;
const MAX_ANGLE = 2.6;
const MAX_SPEED = 25;
const G = 9.81;

// Размер брелка (px экрана): от и до, сначала. Сколько места сверху он
// занимает самое большее — цепочка (56 px) и самая большая наклейка: столько
// оставляет над собой панель настроек листа, чтобы брелок было видно, пока
// его настраивают
export const CHARM_MIN = 44;
export const CHARM_MAX = 120;
export const CHARM_SIZE = 72;
export const CHARM_ROOM = 56 + CHARM_MAX;

// Датчик: у iPhone accelerationIncludingGravity — сама сила тяжести (вниз:
// y < 0, когда телефон стоит), по стандарту и на Android — наоборот. Знак
// уточняем по показаниям: телефон обычно держат верхом вверх
const APPLE = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

// Разрешение на датчик движения: на iPhone его можно спросить только прямо
// из нажатия (выбрали брелок в настройках листа, коснулись брелка). Где
// спрашивать не надо — ничего не делает
export function askMotion() {
  const ask = (window.DeviceMotionEvent as unknown as MotionPermission | undefined)?.requestPermission;
  if (typeof ask === 'function') void ask().catch(() => {});
}

// ref — корень: Notebook ставит его посередине видимой части страницы
export function Charm({ charm, kick, ref }: { charm: CharmLook; kick: number; ref?: Ref<HTMLDivElement> }) {
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
      // Знак показаний: усреднённая вертикаль телефона должна тянуть вниз
      upright += (a.y - upright) * 0.02;
      if (Math.abs(upright) > 4) sign = upright < 0 ? 1 : -1;
      // Сила тяжести (с ускорением самого телефона) в координатах экрана
      gx = sign * a.x;
      gy = -sign * a.y;
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
    speed = 2;
    run();
    return () => {
      window.removeEventListener('devicemotion', onMotion);
      cancelAnimationFrame(frame);
      engine.current = null;
    };
  }, []);

  // Перелистнули страницу — телефон «дёрнулся»
  useEffect(() => {
    if (kick) engine.current?.push((Math.random() < 0.5 ? -1 : 1) * (3 + 2 * Math.random()));
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
          className="charm-body"
          aria-label="Брелок"
          onPointerDown={e => {
            // Касание — качнуть; на iPhone заодно спросить про датчик движения
            askMotion();
            const r = e.currentTarget.getBoundingClientRect();
            engine.current?.push(e.clientX < r.left + r.width / 2 ? 4 : -4);
          }}
        >
          <img src={decalSrc(charm.decal)} alt="" draggable={false} />
          <Glitter seed={`charm-${charm.decal}`} amount={charm.glitter} />
        </button>
      </div>
    </div>
  );
}
