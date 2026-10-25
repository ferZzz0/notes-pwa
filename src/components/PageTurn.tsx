import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import type { Point, Rect } from './Canvas';
import './PageTurn.css';

// Свой цвет бумаги — через --paper (у оборота он ещё и затемнён, PageTurn.css)
const paperVar = (color?: string) => (color ? ({ '--paper': color } as CSSProperties) : undefined);

type Props = {
  dir: 'next' | 'prev';
  // Переворачиваемая половина листа (мир): от корешка (x = 0) до края экрана
  sheet: Rect;
  // Лицо — страница, которую листаем, на своём месте; оборот — страница,
  // которая ляжет по другую сторону корешка, тоже на своём (конечном) месте
  front: ReactNode;
  back: ReactNode;
  // Сколько длится (мс)
  duration: number;
  // Толщина линии корешка (px мира): бумага листа её не закрывает, и линия
  // между страницами не становится тоньше, пока лист перелистывается
  spine: number;
  // Свой цвет бумаги у лица и оборота (настройки листа); нет — как у приложения
  frontPaper?: string;
  backPaper?: string;
  onDone: () => void;
};

// Насколько поднимается уголок на полпути — доля меньшей стороны листа
const LIFT = 0.3;
// Ширина тени на загибе — доля ширины листа (тень на открывшейся странице —
// в PageTurn.css)
const SHADE = 0.45;
// С самого начала сгиб уже чуть-чуть есть — иначе в первом кадре он нулевой
const MIN_E = 0.002;

// Мягко трогается и мягко ложится, без рывка посередине
const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

// Полоса тени (размер 2·half × length) вдоль прямой через m, направление d:
// по центру темнее всего, к краям — на нет; лишнюю половину срезает окно загиба
function placeStrip(el: HTMLElement, m: Point, d: Point, half: number, length: number) {
  el.style.transform = `translate(${m.x - half}px, ${m.y - length / 2}px) rotate(${Math.atan2(-d.x, d.y)}rad)`;
}

// Перелистывание как у настоящей тетради: нижний внешний уголок страницы
// поднимается и по дуге уходит через корешок. Линия сгиба — серединный
// перпендикуляр между исходным и текущим положением уголка. Всё, что за ней,
// загнуто: там открывается страница под листом (её рисует сама тетрадь), а
// загиб — зеркало этой части через сгиб — показывает оборот страницы.
// Оборот лежит на своём конечном месте, поэтому на него действуют два
// отражения: через корешок и через сгиб — это поворот, одна матрица.
//
// Чтобы было плавно и на iPhone, на каждом кадре меняются только transform и
// opacity готовых слоёв — их двигает видеокарта, ничего не перерисовывая.
// Срезать по линии сгиба помогает «окно»: квадрат с overflow: hidden, у
// которого одна сторона лежит на сгибе (повёрнут вдоль него), а внутри —
// обратный поворот, так что содержимое стоит на своём месте и только
// обрезано по сгибу. Лицо (несогнутая часть) и тень на открывшейся странице —
// в таких окнах внутри листа; загиб — в окне по эту сторону сгиба.
export function PageTurn({ dir, sheet, front, back, duration, spine, frontPaper, backPaper, onDone }: Props) {
  const frontWin = useRef<HTMLDivElement>(null);
  const frontInner = useRef<HTMLDivElement>(null);
  const castWin = useRef<HTMLDivElement>(null);
  const flapWin = useRef<HTMLDivElement>(null);
  const flapInner = useRef<HTMLDivElement>(null);
  const flapPage = useRef<HTMLDivElement>(null);
  const flapShade = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;

  const s = dir === 'next' ? 1 : -1;
  const { x: X0, w: W, h: H } = sheet;
  // Сторона окна: больше листа с запасом при любом наклоне сгиба
  const L = 4 * Math.max(W, H);
  // Оборот — на другой стороне корешка; его бумага — от линии корешка до края
  const backX = s === 1 ? -W : spine / 2;
  const pageW = W - spine / 2;

  useLayoutEffect(() => {
    const lift = LIFT * Math.min(W, H);
    const corner = { x: s * W, y: H };
    const length = 3 * Math.hypot(W, H);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    let frame = 0;
    // Размер полосы тени — один раз: на кадрах меняется только её положение
    flapShade.current!.style.width = `${2 * SHADE * W}px`;
    flapShade.current!.style.height = `${length}px`;

    // Окно: левая сторона — на сгибе (через m), внутрь — по направлению angle
    const win = (el: HTMLElement, m: Point, angle: number) => {
      el.style.transform = `translate(${m.x}px, ${m.y}px) rotate(${angle}rad) translate(0, ${-L / 2}px)`;
    };
    // Обратно: содержимое окна — на своём месте
    const unwin = (el: HTMLElement, m: Point, angle: number) => {
      el.style.transform = `translate(0, ${L / 2}px) rotate(${-angle}rad) translate(${-m.x}px, ${-m.y}px)`;
    };

    const draw = (eased: number) => {
      const e = Math.max(eased, MIN_E);
      // Уголок: от своего места через корешок (с подъёмом) на другую сторону
      const p = { x: s * W * (1 - 2 * e), y: H - lift * Math.sin(Math.PI * e) };
      const n = { x: p.x - corner.x, y: p.y - corner.y };
      const len = Math.hypot(n.x, n.y);
      const m = { x: (p.x + corner.x) / 2, y: (p.y + corner.y) / 2 };
      // Внутрь листа (к корешку) — несогнутая часть; вдоль сгиба — d
      const angle = Math.atan2(n.y, n.x);
      const d = { x: -n.y / len, y: n.x / len };
      // Лицо и тень — в координатах листа (его левый край — X0)
      const local = { x: m.x - X0, y: m.y };
      win(frontWin.current!, local, angle);
      unwin(frontInner.current!, local, angle);
      win(castWin.current!, local, angle + Math.PI);
      // Загиб: окно по эту сторону сгиба, внутри — оборот, отражённый через
      // корешок (x → −x) и затем через сгиб (через m вдоль d)
      win(flapWin.current!, m, angle);
      unwin(flapInner.current!, m, angle);
      const a = 1 - 2 * d.x * d.x;
      const b = -2 * d.x * d.y;
      const c = 2 * d.x * d.y;
      const dd = 2 * d.y * d.y - 1;
      // Сдвиг: m − R·m, где R — отражение через сгиб
      const rx = (2 * d.x * d.x - 1) * m.x + 2 * d.x * d.y * m.y;
      const ry = 2 * d.x * d.y * m.x + (2 * d.y * d.y - 1) * m.y;
      flapPage.current!.style.transform = `matrix(${a}, ${b}, ${c}, ${dd}, ${m.x - rx}, ${m.y - ry})`;

      // Тени: на открывшейся странице у сгиба и на самом загибе (сгиб в
      // координатах оборота — отражённый через корешок, от края его бумаги);
      // сильнее всего на полпути
      const k = Math.sin(Math.PI * e);
      castWin.current!.style.opacity = String(k);
      flapShade.current!.style.opacity = String(0.4 + 0.6 * k);
      placeStrip(flapShade.current!, { x: -m.x - backX, y: m.y }, { x: -d.x, y: d.y }, SHADE * W, length);
    };

    const step = (now: number) => {
      const t = reduced ? 1 : Math.min(Math.max((now - start) / duration, 0), 1);
      draw(ease(t));
      if (t < 1) frame = requestAnimationFrame(step);
      else done.current();
    };
    draw(0);
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  const winSize = { width: L, height: L };
  return (
    <div className="page-turn" aria-hidden="true">
      {/* Несогнутая часть и тень на открывшейся странице — только в пределах листа */}
      <div className="page-turn-sheet" style={{ left: X0, width: W, height: H }}>
        <div ref={frontWin} className="page-turn-window" style={winSize}>
          <div ref={frontInner} className="page-turn-inner">
            <div className="page-turn-paper" style={{ left: s === 1 ? spine / 2 : 0, width: pageW, height: H, ...paperVar(frontPaper) }} />
            {/* Страница — в координатах мира, а мы внутри листа (сдвиг X0) */}
            <div className="page-turn-content" style={{ left: -X0 }}>
              {front}
            </div>
          </div>
        </div>
        <div ref={castWin} className="page-turn-window page-turn-cast" style={winSize} />
      </div>
      {/* Загиб: оборот в окне по эту сторону сгиба */}
      <div ref={flapWin} className="page-turn-window" style={winSize}>
        <div ref={flapInner} className="page-turn-inner">
          <div ref={flapPage} className="page-turn-flap">
            <div className="page-turn-back" style={{ left: backX, width: pageW, height: H, ...paperVar(backPaper) }}>
              <div className="page-turn-content" style={{ left: -backX }}>
                {back}
              </div>
              <div ref={flapShade} className="page-turn-strip page-turn-flap-shade" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
