import type { CSSProperties } from 'react';
import './Glitter.css';

// Количество искр задаёт ползунок, рисунок и ритм — id наклейки.
const MAX_SPARKS = 18;
const COLORS = ['#ffffff', '#fff3a8', '#ffd3f2', '#cdefff'];

// Псевдослучайные числа от seed (mulberry32)
function random(seed: string) {
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

// Искорка с центром (0, 0) и лучами длины 1
const SPARK = 'M0-1C.12-.12.12-.12 1 0 .12.12.12.12 0 1-.12.12-.12.12-1 0-.12-.12-.12-.12 0-1Z';

function position(rnd: () => number) {
  const x = 6 + rnd() * 88;
  const y = 6 + rnd() * 88;
  return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
}

// Один наблюдатель на лист и прокручиваемые меню. Искры за пределами
// видимой области остаются статичными.
let visibility: IntersectionObserver | undefined;
function observeGlitter(node: SVGSVGElement | null) {
  if (!node || typeof IntersectionObserver === 'undefined') return;
  visibility ??= new IntersectionObserver(entries => {
    for (const entry of entries) entry.target.toggleAttribute('data-offscreen', !entry.isIntersecting);
  });
  visibility.observe(node);
  return () => visibility?.unobserve(node);
}

export function Glitter({ seed, amount }: { seed: string; amount: number }) {
  const count = Math.round(Math.min(1, Math.max(0, amount)) * MAX_SPARKS);
  if (count === 0) return null;
  const rnd = random(seed);
  // Отдельная последовательность для следующих мест сохраняет исходный узор.
  const motion = random(`${seed}:twinkle`);
  const items = Array.from({ length: count }, (_, i) => {
    const first = position(rnd);
    const dot = rnd() < 0.3;
    const size = dot ? 1.2 + rnd() * 1.5 : 3.5 + rnd() * 6.5;
    const color = COLORS[Math.floor(rnd() * COLORS.length)];
    const turn = rnd() * 45;
    const cycle = 8400 + Math.round(motion() * 2800);
    const style = {
      '--glitter-a': first,
      '--glitter-b': position(motion),
      '--glitter-c': position(motion),
      '--glitter-d': position(motion),
      '--glitter-cycle': `${cycle}ms`,
      '--glitter-delay': `${-Math.round(rnd() * cycle)}ms`
    } as CSSProperties;
    return (
      <g key={i} fill={color} style={style}>
        {dot ? <circle r={size} /> : <path d={SPARK} transform={`rotate(${turn.toFixed(0)}) scale(${size.toFixed(2)})`} />}
      </g>
    );
  });
  return (
    <svg ref={observeGlitter} className="glitter" viewBox="0 0 100 100" aria-hidden="true">
      {items}
    </svg>
  );
}
