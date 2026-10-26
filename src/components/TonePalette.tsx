import { useLayoutEffect, useRef, type PointerEvent } from 'react';
import { greyColor, greyRgb, toneColor, tonePosition, toneRgb, type Tone } from '../textStyle';
import './TonePalette.css';

// Разрешение рисунков (px холста; на экране они растянуты по ширине)
const W = 240;
const H = 110;
const GREY_H = 8;
// Шарик-отметка (px; .tone-mark): на краях он целиком на рисунке, не
// вылезает (жалоба автора)
const MARK = 24;
const inset = (t: number) => `calc(${MARK / 2}px + (100% - ${MARK}px) * ${t})`;

// Нарисовать холст по точкам — ровно те цвета, что получатся при касании
function paint(canvas: HTMLCanvasElement, rgb: (x: number, y: number) => [number, number, number]) {
  const g = canvas.getContext('2d');
  if (!g) return;
  const { width: w, height: h } = canvas;
  const img = g.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const c = rgb((i + 0.5) / w, (j + 0.5) / h);
      const o = (j * w + i) * 4;
      img.data[o] = c[0] * 255;
      img.data[o + 1] = c[1] * 255;
      img.data[o + 2] = c[2] * 255;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

// Касание и ведение пальцем по рисунку: точка (доли ширины и высоты) → цвет;
// отпустили — final
function track(pick: (x: number, y: number) => string, onPick: (color: string, final: boolean) => void) {
  const at = (e: PointerEvent<HTMLElement>, final: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    // Середина шарика ходит в пределах рисунка минус половина шарика
    onPick(pick((e.clientX - r.left - MARK / 2) / Math.max(1, r.width - MARK), (e.clientY - r.top - MARK / 2) / Math.max(1, r.height - MARK)), final);
  };
  return {
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      at(e, false);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) at(e, false);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => at(e, true)
  };
}

// Палитра только светлых или только тёмных цветов (цвет листа и его
// надписей — просьба автора): вправо — оттенок, вниз — светлота в пределах
// тона (textStyle.ts: toneColor); под ней — полоска серых, от светлого к
// тёмному. Цвет меняется, пока ведёшь пальцем; отпустили — сохранить
export function TonePalette({
  color,
  tone,
  label,
  onPick
}: {
  color?: string;
  tone: Tone;
  label: string;
  onPick: (color: string, final: boolean) => void;
}) {
  const hues = useRef<HTMLCanvasElement>(null);
  const greys = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    paint(hues.current!, (x, y) => toneRgb(x, y, tone));
    paint(greys.current!, x => greyRgb(x, tone));
  }, [tone]);

  const pos = color ? tonePosition(color, tone) : null;
  const mark = (grey: boolean) =>
    pos &&
    pos.grey === grey && (
      <span
        className="tone-mark"
        style={{ left: inset(pos.x), top: grey ? '50%' : inset(pos.y), background: color }}
      />
    );

  return (
    <div className="tone-palette">
      <div className="tone-hues" role="slider" aria-label={label} aria-valuetext={color} {...track((x, y) => toneColor(x, y, tone), onPick)}>
        <canvas ref={hues} width={W} height={H} />
        {mark(false)}
      </div>
      <div className="tone-greys" role="slider" aria-label={`${label}: серые`} aria-valuetext={color} {...track(x => greyColor(x, tone), onPick)}>
        <canvas ref={greys} width={W} height={GREY_H} />
        {mark(true)}
      </div>
    </div>
  );
}
