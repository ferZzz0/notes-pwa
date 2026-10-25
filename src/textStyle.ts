// Оформление надписей: цвет чернил и шрифт. У каждого шрифта свои размер и
// высота строки (TextBlock.css) — чтобы надписи разными шрифтами выглядели
// соразмерно. Рукописные шрифты собраны в приложение и работают офлайн, а
// печатные — системные (на iPhone они есть и с кириллицей).

// Цвет выбирают на круговой палитре (TextToolbar): по кругу — оттенок, от
// середины к краю — от чёрного к яркому. Хранится как #rrggbb; без цвета —
// обычные синие чернила (--ink). Раньше было шесть чернил с именами — они
// ещё встречаются в сохранённых записях.
const OLD_INKS: Record<string, string> = {
  blue: '#24398c',
  black: '#26262b',
  red: '#c0392b',
  green: '#22784a',
  violet: '#6b3fa0',
  orange: '#d0681c'
};
// Синие чернила по умолчанию (светлая тема) — для отметки на палитре
export const DEFAULT_INK = OLD_INKS.blue;

export const FONTS = [
  { id: 'hand', label: 'Рукописный' },
  { id: 'script', label: 'Каллиграфия' },
  { id: 'marker', label: 'Фломастер' },
  { id: 'print', label: 'Печатный' },
  { id: 'serif', label: 'С засечками' },
  { id: 'mono', label: 'Пишущая машинка' }
] as const;

export type FontId = (typeof FONTS)[number]['id'];

// Эффекты букв (TextBlock.css: .effect-*). Тени и свечение рисует слой под
// полем ввода — поле обрезало бы их по своему краю
export const EFFECTS = [
  { id: 'none', label: 'Без эффекта' },
  { id: 'glow', label: 'Свечение' },
  { id: 'shadow', label: 'Тень' },
  { id: 'emboss', label: 'Объём' },
  { id: 'outline', label: 'Контур' }
] as const;

// Маркер на готовом тексте — готовые варианты (TextBlock.css: .mark-*):
// выделение цветным маркером и подчёркивания. Рисуется построчно, под буквами
export const MARKERS = [
  { id: 'none', label: 'Без маркера' },
  { id: 'yellow', label: 'Жёлтый маркер' },
  { id: 'pink', label: 'Розовый маркер' },
  { id: 'green', label: 'Зелёный маркер' },
  { id: 'blue', label: 'Голубой маркер' },
  { id: 'under-yellow', label: 'Подчеркнуть жёлтым' },
  { id: 'under-red', label: 'Подчеркнуть красным' },
  { id: 'wavy', label: 'Подчеркнуть волной' }
] as const;

export type EffectId = (typeof EFFECTS)[number]['id'];
export type MarkerId = (typeof MARKERS)[number]['id'];

// Незнакомое значение — без эффекта / без маркера
export const effectOf = (id?: string): EffectId => EFFECTS.find(e => e.id === id)?.id ?? 'none';
export const markerOf = (id?: string): MarkerId => MARKERS.find(m => m.id === id)?.id ?? 'none';

const HEX = /^#[0-9a-f]{6}$/i;

// Цвет надписи для CSS; незнакомое значение — обычные чернила
export const inkColor = (color?: string): string =>
  color && HEX.test(color) ? color : color && OLD_INKS[color] ? OLD_INKS[color] : 'var(--ink)';

// Незнакомый шрифт (из будущей версии или испорченный) — как по умолчанию
export const fontOf = (id?: string): FontId => FONTS.find(f => f.id === id)?.id ?? 'hand';
// Класс со шрифтом (TextBlock.css)
export const fontClass = (id?: string) => `font-${fontOf(id)}`;

const hex2 = (v: number) =>
  Math.round(Math.min(255, Math.max(0, v * 255)))
    .toString(16)
    .padStart(2, '0');

// Точка палитры → цвет: оттенок h (градусы), r — доля радиуса (0 — чёрный в
// середине, 1 — яркий на краю). Это hsl(h, 100%, 50·r%)
export function wheelColor(h: number, r: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const l = r / 2;
  const a = l; // насыщенность 100%: a = l·min(1, 2 − 2l) = l при l ≤ ½
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${hex2(f(0))}${hex2(f(8))}${hex2(f(4))}`;
}

// Где цвет на палитре: оттенок и доля радиуса (по светлоте). Цвета не с
// палитры (поблёклые) встают на ближайший оттенок
export function wheelPosition(color?: string): { h: number; r: number } {
  const c = inkColor(color);
  const hex = HEX.test(c) ? c : DEFAULT_INK;
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, r: Math.min(1, max + min) };
}
