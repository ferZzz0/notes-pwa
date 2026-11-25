import { memo, type CSSProperties } from 'react';
import './Glitter.css';

// Количество искр задаёт ползунок, рисунок и ритм — id наклейки.
const MAX_SPARKS = 18;
// Временно оставляем блёстки неподвижными и на предметах, и на обложках.
const ANIMATE_GLITTER = false;

// Псевдослучайные числа от seed (mulberry32)
export function glitterRandom(seed: string) {
  let h = 1779033703;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const position = (rnd: () => number) => [6 + rnd() * 88, 6 + rnd() * 88];

// Один наблюдатель на лист и прокручиваемые меню. Искры за пределами
// видимой области остаются статичными.
let visibility: IntersectionObserver | undefined;
function observeGlitter(node: Element | null) {
  if (!node || typeof IntersectionObserver === 'undefined') return;
  visibility ??= new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting);
  });
  visibility.observe(node);
  return () => visibility?.unobserve(node);
}

export const glitterMotionProps = ANIMATE_GLITTER ? { ref: observeGlitter, 'data-twinkle': '' } : {};

export const Glitter = memo(function Glitter({ seed, amount }: { seed: string; amount: number }) {
  const count = Math.round(Math.min(1, Math.max(0, amount)) * MAX_SPARKS);
  if (count === 0) return null;
  const rnd = glitterRandom(seed);
  // Отдельная последовательность для следующих мест сохраняет исходный узор.
  const motion = glitterRandom(`${seed}:twinkle`);
  const items = Array.from({ length: count }, (_, i) => {
    const first = position(rnd);
    const dot = rnd() < 0.3;
    const size = dot ? 1.2 + rnd() * 1.5 : 3.5 + rnd() * 6.5;
    const color = Math.floor(rnd() * 4);
    const turn = Math.round(rnd() * 45);
    // У прежней ячейки спрайта срезаны по 14 полностью прозрачных px с
    // каждого края. Центр, размер самой искры и ореол остаются на месте.
    const width = size * (dot ? 8 : 4) * 68 / 96;
    const place = ([x, y]: number[]) =>
      `translate(${(100 * x / width - 50).toFixed(2)}%, ${(100 * y / width - 50).toFixed(2)}%) rotate(${turn}deg)`;
    const cycle = 8400 + Math.round(motion() * 2800);
    const style = {
      width: width + '%', height: width + '%',
      backgroundPosition: `${color * 100 / 3}% ${dot ? 100 : 0}%`,
      '--glitter-a': place(first),
      '--glitter-b': place(position(motion)),
      '--glitter-c': place(position(motion)),
      '--glitter-d': place(position(motion)),
      '--glitter-cycle': `${cycle}ms`,
      '--glitter-delay': `${-Math.round(rnd() * cycle)}ms`
    } as CSSProperties;
    return <span key={i} style={style} />;
  });
  return (
    <span {...glitterMotionProps} className="glitter" aria-hidden="true">
      {items}
    </span>
  );
});
