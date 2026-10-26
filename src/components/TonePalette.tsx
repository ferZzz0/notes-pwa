import { useLayoutEffect, useRef, type PointerEvent } from 'react';
import { toneRgb, tonePosition, toneColor, type Tone } from '../textStyle';
import './TonePalette.css';

// Разрешение рисунка палитры (px холста; на экране он растянут по ширине)
const W = 240;
const H = 110;

// Палитра только светлых или только тёмных цветов (цвет листа и его
// надписей — просьба автора): вправо — оттенок, у правого края — серые,
// вниз — светлота в пределах тона (textStyle.ts: toneColor). Цвет меняется,
// пока ведёшь пальцем; отпустили — сохранить
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
  const canvas = useRef<HTMLCanvasElement>(null);

  // Рисуем по точкам — ровно те цвета, что получатся при касании
  useLayoutEffect(() => {
    const g = canvas.current!.getContext('2d');
    if (!g) return;
    const img = g.createImageData(W, H);
    for (let j = 0; j < H; j++) {
      for (let i = 0; i < W; i++) {
        const [r, gr, b] = toneRgb((i + 0.5) / W, (j + 0.5) / H, tone);
        const o = (j * W + i) * 4;
        img.data[o] = r * 255;
        img.data[o + 1] = gr * 255;
        img.data[o + 2] = b * 255;
        img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  }, [tone]);

  const pick = (e: PointerEvent<HTMLDivElement>, final: boolean) => {
    const r = e.currentTarget.getBoundingClientRect();
    onPick(toneColor((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height, tone), final);
  };
  const pos = color ? tonePosition(color, tone) : null;

  return (
    <div
      className="tone-palette"
      role="slider"
      aria-label={label}
      aria-valuetext={color}
      onPointerDown={e => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e, false);
      }}
      onPointerMove={e => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e, false);
      }}
      onPointerUp={e => pick(e, true)}
    >
      <canvas ref={canvas} width={W} height={H} />
      {pos && <span className="tone-mark" style={{ left: `${pos.x * 100}%`, top: `${pos.y * 100}%`, background: color }} />}
    </div>
  );
}
