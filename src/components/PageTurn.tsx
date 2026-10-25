import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Point, Rect } from './Canvas';
import './PageTurn.css';

type Props = {
  dir: 'next' | 'prev';
  // Переворачиваемая половина листа (мир): от корешка (x = 0) до края экрана
  sheet: Rect;
  // Лицо — страница, которую листаем, на своём месте; оборот — страница,
  // которая ляжет по другую сторону корешка, тоже на своём (конечном) месте
  front: ReactNode;
  back: ReactNode;
  onDone: () => void;
};

const DURATION = 850;
// Насколько поднимается уголок на полпути — доля меньшей стороны листа
const LIFT = 0.3;
// Ширина тени у сгиба (px мира): на открывшейся странице и на загибе
const CAST = 70;
const SHADE = 0.45; // доля ширины листа

// Плавно трогается и мягко ложится, но без долгой паузы в начале
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) ** 2);

// Часть многоугольника по одну сторону прямой (через m, нормаль n):
// side = 1 — где (p − m)·n ≥ 0, side = −1 — по другую сторону
function clipHalf(poly: Point[], m: Point, n: Point, side: 1 | -1): Point[] {
  const f = (p: Point) => side * ((p.x - m.x) * n.x + (p.y - m.y) * n.y);
  const out: Point[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length];
    const fa = f(a);
    const fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) {
      const k = fa / (fa - fb);
      out.push({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
    }
  });
  return out;
}

const polygon = (pts: Point[]) =>
  pts.length < 3 ? 'polygon(0 0, 0 0, 0 0)' : `polygon(${pts.map(p => `${p.x}px ${p.y}px`).join(', ')})`;

// Полоса тени вдоль прямой (через m, направление d): по центру темнее всего,
// к краям — на нет; лишнюю половину срезает многоугольник родителя
function placeStrip(el: HTMLElement, m: Point, d: Point, half: number, length: number) {
  el.style.width = `${2 * half}px`;
  el.style.height = `${length}px`;
  el.style.transform = `translate(${m.x - half}px, ${m.y - length / 2}px) rotate(${Math.atan2(-d.x, d.y)}rad)`;
}

// Перелистывание как у настоящей тетради: нижний внешний уголок страницы
// поднимается и по дуге уходит через корешок. Линия сгиба — серединный
// перпендикуляр между исходным и текущим положением уголка. Всё, что за ней,
// загнуто: там открывается страница под листом (её рисует сама тетрадь), а
// загиб — зеркало этой части через сгиб — показывает оборот страницы.
// Оборот лежит на своём конечном месте, поэтому на него действуют два
// отражения: через корешок и через сгиб — это поворот, одна матрица.
// Только плоские преобразования (clip-path и matrix), без 3D: одинаково
// выглядит при любой форме экрана и на iPhone.
export function PageTurn({ dir, sheet, front, back, onDone }: Props) {
  const frontRef = useRef<HTMLDivElement>(null);
  const castRef = useRef<HTMLDivElement>(null);
  const castLine = useRef<HTMLDivElement>(null);
  const flapRef = useRef<HTMLDivElement>(null);
  const flapShade = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  useLayoutEffect(() => {
    const s = dir === 'next' ? 1 : -1;
    const { w: W, h: H } = sheet;
    const lift = LIFT * Math.min(W, H);
    const corner = { x: s * W, y: H };
    const rect: Point[] = [
      { x: sheet.x, y: 0 },
      { x: sheet.x + W, y: 0 },
      { x: sheet.x + W, y: H },
      { x: sheet.x, y: H }
    ];
    const length = 3 * Math.hypot(W, H);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let frame = 0;

    const draw = (e: number) => {
      // Уголок: от своего места через корешок (с подъёмом) на другую сторону
      const p = { x: s * W * (1 - 2 * e), y: H - lift * Math.sin(Math.PI * e) };
      const n = { x: p.x - corner.x, y: p.y - corner.y };
      const len = Math.hypot(n.x, n.y);
      const flat = len < 0.5;
      const m = { x: (p.x + corner.x) / 2, y: (p.y + corner.y) / 2 };
      // Сгиб: направление вдоль него
      const d = flat ? { x: 0, y: 1 } : { x: -n.y / len, y: n.x / len };
      const kept = flat ? rect : clipHalf(rect, m, n, 1);
      const turned = flat ? [] : clipHalf(rect, m, n, -1);

      frontRef.current!.style.clipPath = polygon(kept);
      castRef.current!.style.clipPath = polygon(turned);
      // Оборот в своих координатах: загнутая часть, отражённая через корешок
      flapRef.current!.style.clipPath = polygon(turned.map(q => ({ x: -q.x, y: q.y })));
      // Отражение через корешок (x → −x), затем через сгиб (через m вдоль d)
      const a = 1 - 2 * d.x * d.x;
      const b = -2 * d.x * d.y;
      const c = 2 * d.x * d.y;
      const dd = 2 * d.y * d.y - 1;
      // Сдвиг: m − R·m, где R — отражение через сгиб
      const rx = (2 * d.x * d.x - 1) * m.x + 2 * d.x * d.y * m.y;
      const ry = 2 * d.x * d.y * m.x + (2 * d.y * d.y - 1) * m.y;
      flapRef.current!.style.transform = `matrix(${a}, ${b}, ${c}, ${dd}, ${m.x - rx}, ${m.y - ry})`;

      // Тени: на открывшейся странице у сгиба и на самом загибе (сгиб в его
      // координатах — тоже отражённый через корешок); сильнее всего на полпути
      const k = Math.sin(Math.PI * e);
      castRef.current!.style.opacity = String(k);
      placeStrip(castLine.current!, m, d, CAST, length);
      flapShade.current!.style.opacity = String(0.4 + 0.6 * k);
      placeStrip(flapShade.current!, { x: -m.x, y: m.y }, { x: -d.x, y: d.y }, SHADE * W, length);
    };

    const step = (now: number) => {
      const t = reduced ? 1 : Math.min(Math.max((now - start) / DURATION, 0), 1);
      draw(ease(t));
      if (t < 1) frame = requestAnimationFrame(step);
      else done.current();
    };
    draw(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  const backX = dir === 'next' ? -sheet.w : 0;
  return (
    <div className="page-turn" aria-hidden="true">
      <div ref={frontRef} className="page-turn-front">
        <div className="page-turn-paper" style={{ left: sheet.x, width: sheet.w, height: sheet.h }} />
        {front}
      </div>
      <div ref={castRef} className="page-turn-cast">
        <div ref={castLine} className="page-turn-strip page-turn-cast-line" />
      </div>
      <div ref={flapRef} className="page-turn-flap">
        <div className="page-turn-paper page-turn-back" style={{ left: backX, width: sheet.w, height: sheet.h }} />
        {back}
        <div ref={flapShade} className="page-turn-strip page-turn-flap-shade" />
      </div>
    </div>
  );
}
