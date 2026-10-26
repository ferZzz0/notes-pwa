import './Glitter.css';

// Блёстки на наклейке (просьба автора): четырёхлучевые искорки и точки
// поверх картинки, сколько — от amount (0 — нет, 1 — много). Где какая —
// по seed (id наклейки): у каждой наклейки свой узор, и он не меняется от
// перерисовки. На листе неподвижные (мерцание перерисовывало бы весь лист),
// в меню (twinkle) — мерцают
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

export function Glitter({ seed, amount, twinkle = false }: { seed: string; amount: number; twinkle?: boolean }) {
  const count = Math.round(Math.min(1, Math.max(0, amount)) * MAX_SPARKS);
  if (count === 0) return null;
  const rnd = random(seed);
  const items = Array.from({ length: count }, (_, i) => {
    const x = 6 + rnd() * 88;
    const y = 6 + rnd() * 88;
    const dot = rnd() < 0.3;
    const size = dot ? 1.2 + rnd() * 1.5 : 3.5 + rnd() * 6.5;
    const color = COLORS[Math.floor(rnd() * COLORS.length)];
    const turn = rnd() * 45;
    const delay = (rnd() * 1.6).toFixed(2);
    return dot ? (
      <circle key={i} cx={x} cy={y} r={size} fill={color} style={twinkle ? { animationDelay: `${delay}s` } : undefined} />
    ) : (
      <path
        key={i}
        d={SPARK}
        fill={color}
        transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${turn.toFixed(0)}) scale(${size.toFixed(2)})`}
        style={twinkle ? { animationDelay: `${delay}s` } : undefined}
      />
    );
  });
  return (
    <svg className={twinkle ? 'glitter is-twinkling' : 'glitter'} viewBox="0 0 100 100" aria-hidden="true">
      {items}
    </svg>
  );
}
