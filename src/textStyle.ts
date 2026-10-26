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
// Маркер на тексте: форма (классы .mark-* — TextBlock.css) и цвет —
// любой, с круговой палитры (просьба автора: «подробное изменение цвета и
// формы»). Раньше были готовые маркеры с цветом в имени — они ещё
// встречаются в записях и переводятся в форму и цвет (OLD_MARKERS)
export const MARKERS = [
  { id: 'none', label: 'Без маркера' },
  { id: 'highlight', label: 'Маркер' },
  { id: 'half', label: 'Половина' },
  { id: 'under', label: 'Полоса снизу' },
  { id: 'line', label: 'Линия' },
  { id: 'wavy', label: 'Волна' }
] as const;

// Цвет маркера, если его не выбирали
export const DEFAULT_MARKER_COLOR = '#ffd400';
const OLD_MARKERS: Record<string, [string, string]> = {
  yellow: ['highlight', '#ffdd00'],
  pink: ['highlight', '#ff6eb4'],
  green: ['highlight', '#5adc78'],
  blue: ['highlight', '#50beff'],
  'under-yellow': ['under', '#ffc800'],
  'under-red': ['under', '#e63c32'],
  wavy: ['wavy', '#e0483e'],
  // Убранные формы (просьба автора) — простая линия, цвет — свой
  double: ['line', ''],
  dotted: ['line', ''],
  dashed: ['line', '']
};

export type EffectId = (typeof EFFECTS)[number]['id'];
export type MarkerId = (typeof MARKERS)[number]['id'];

// Незнакомое значение — без эффекта / без маркера
export const effectOf = (id?: string): EffectId => EFFECTS.find(e => e.id === id)?.id ?? 'none';
export const markerOf = (id?: string): MarkerId => {
  const old = id ? OLD_MARKERS[id]?.[0] : undefined;
  return MARKERS.find(m => m.id === (old ?? id))?.id ?? 'none';
};

const HEX = /^#[0-9a-f]{6}$/i;

// Цвет маркера: выбранный, а у старого готового маркера — его цвет
export const markerColorOf = (id?: string, color?: string): string =>
  color && HEX.test(color) ? color : (id && OLD_MARKERS[id]?.[1]) || DEFAULT_MARKER_COLOR;

// Цвет надписи для CSS; незнакомое значение — обычные чернила
export const inkColor = (color?: string): string =>
  color && HEX.test(color) ? color : color && OLD_INKS[color] ? OLD_INKS[color] : 'var(--ink-default)';

// Незнакомый шрифт (из будущей версии или испорченный) — как по умолчанию
export const fontOf = (id?: string): FontId => FONTS.find(f => f.id === id)?.id ?? 'hand';
// Класс со шрифтом (TextBlock.css)
export const fontClass = (id?: string) => `font-${fontOf(id)}`;

const hex2 = (v: number) =>
  Math.round(Math.min(255, Math.max(0, v * 255)))
    .toString(16)
    .padStart(2, '0');

// Палитра чернил — от чёрного в середине к яркому на краю; палитра стикеров —
// от белого (стикеры обычно светлые)
export type WheelBase = 'dark' | 'light';

// Точка палитры → цвет: оттенок h (градусы), r — доля радиуса (0 — середина,
// 1 — яркий на краю). Это hsl(h, 100%, 50·r%) от чёрного или
// hsl(h, 100%, 100% − 50·r%) от белого
export function wheelColor(h: number, r: number, base: WheelBase = 'dark'): string {
  const k = (n: number) => (n + h / 30) % 12;
  const l = base === 'dark' ? r / 2 : 1 - r / 2;
  const a = Math.min(l, 1 - l); // насыщенность 100%
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return `#${hex2(f(0))}${hex2(f(8))}${hex2(f(4))}`;
}

// Где цвет на палитре: оттенок и доля радиуса (по светлоте). Цвета не с
// палитры (поблёклые) встают на ближайший оттенок
export function wheelPosition(color?: string, base: WheelBase = 'dark'): { h: number; r: number } {
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
  // max + min — удвоенная светлота
  return { h, r: Math.min(1, base === 'dark' ? max + min : 2 - (max + min)) };
}

// Готовые стикеры, на которых можно писать (TextBlock.css: .shape-*). У
// каждого свой цвет по умолчанию; цвет меняют на круговой палитре (от
// белого), а надпись на стикере настраивается как любая другая
export const STICKERS = [
  { id: 'note', label: 'Записка', fill: '#ffe45c' },
  { id: 'bubble', label: 'Реплика', fill: '#ffffff' },
  { id: 'cloud', label: 'Облачко', fill: '#dcecff' },
  { id: 'tag', label: 'Бирка', fill: '#f2d39b' },
  { id: 'ribbon', label: 'Лента', fill: '#e8566f' },
  { id: 'badge', label: 'Значок', fill: '#7fd1ae' },
  { id: 'tape', label: 'Скотч', fill: '#b9a7ef' }
] as const;


// Рамки фото (ImageItem.css: .frame-*) и фильтры (CSS filter)
export const FRAMES = [
  { id: 'none', label: 'Без рамки' },
  { id: 'white', label: 'Белая рамка' },
  { id: 'polaroid', label: 'Полароид' },
  { id: 'tape', label: 'На скотче' },
  { id: 'shadow', label: 'С тенью' },
  { id: 'round', label: 'Скруглённая' },
  { id: 'circle', label: 'Круг' }
] as const;

export const FILTERS = [
  { id: 'none', label: 'Без фильтра', css: 'none' },
  { id: 'mono', label: 'Чёрно-белый', css: 'grayscale(1)' },
  { id: 'sepia', label: 'Сепия', css: 'sepia(0.85)' },
  { id: 'vintage', label: 'Винтаж', css: 'sepia(0.35) contrast(1.1) saturate(0.8) brightness(1.05)' },
  { id: 'vivid', label: 'Ярче', css: 'saturate(1.5) contrast(1.08)' },
  { id: 'fade', label: 'Блёклый', css: 'saturate(0.6) brightness(1.1) contrast(0.9)' }
] as const;

export type StickerId = (typeof STICKERS)[number]['id'];
export type FrameId = (typeof FRAMES)[number]['id'];
export type FilterId = (typeof FILTERS)[number]['id'];

export const stickerOf = (id?: string): StickerId => STICKERS.find(s => s.id === id)?.id ?? 'note';
export const frameOf = (id?: string): FrameId => FRAMES.find(f => f.id === id)?.id ?? 'none';
export const filterOf = (id?: string): FilterId => FILTERS.find(f => f.id === id)?.id ?? 'none';
// Цвет стикера: свой или по умолчанию для этой формы
export const stickerFill = (sticker?: string, fill?: string): string =>
  fill && HEX.test(fill) ? fill : STICKERS.find(s => s.id === stickerOf(sticker))!.fill;
export const filterCss = (id?: string): string => FILTERS.find(f => f.id === filterOf(id))!.css;

// --- Светлые и тёмные тона (цвет листа и его надписей) ---
// Палитра-прямоугольник (TonePalette, просьба автора: «у светлых — только
// светлые цвета, у тёмных — только тёмные»): вправо — оттенок, вниз —
// светлота в пределах тона; под ней — полоска серых (слева направо — от
// светлого к тёмному в пределах тона; столбец серых у края палитры выглядел
// криво — жалоба автора). Светлые — от 96% до 74%,
// тёмные — от 28% до 6%: тёмный цвет любого оттенка остаётся тёмным и для
// isDark (theme.ts), светлый — светлым
export type Tone = 'light' | 'dark';
const TONE_L: Record<Tone, [number, number]> = { light: [0.96, 0.74], dark: [0.28, 0.06] };
const TONE_S: Record<Tone, number> = { light: 0.85, dark: 0.55 };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// hsl (h — градусы, s и l — доли) → [r, g, b] долями
function hslRgb(h: number, s: number, l: number): [number, number, number] {
  const a = s * Math.min(l, 1 - l);
  const k = (n: number) => (n + h / 30) % 12;
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)];
}

function hexHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
}

// Светлота тона по доле t (0 — самый светлый в тоне, 1 — самый тёмный)
const toneL = (t: number, tone: Tone) => TONE_L[tone][0] + (TONE_L[tone][1] - TONE_L[tone][0]) * clamp01(t);

// Точка палитры тона (x, y — доли ширины и высоты) → [r, g, b] долями
export const toneRgb = (x: number, y: number, tone: Tone) => hslRgb(clamp01(x) * 360, TONE_S[tone], toneL(y, tone));
// Точка полоски серых (x — доля ширины) → [r, g, b] долями
export function greyRgb(x: number, tone: Tone): [number, number, number] {
  const l = toneL(x, tone);
  return [l, l, l];
}

const rgbHex = (rgb: [number, number, number]) => `#${rgb.map(hex2).join('')}`;
export const toneColor = (x: number, y: number, tone: Tone) => rgbHex(toneRgb(x, y, tone));
export const greyColor = (x: number, tone: Tone) => rgbHex(greyRgb(x, tone));

// Где цвет: почти без цвета — на полоске серых (x — светлота), иначе на
// палитре (x — оттенок, y — светлота); за пределами тона — у края
export function tonePosition(color: string, tone: Tone): { grey: boolean; x: number; y: number } {
  const { h, s, l } = hexHsl(HEX.test(color) ? color : '#ffffff');
  const [l0, l1] = TONE_L[tone];
  const t = clamp01((l - l0) / (l1 - l0));
  return s < 0.12 ? { grey: true, x: t, y: 0.5 } : { grey: false, x: h / 360, y: t };
}

// Тот же оттенок (или серый) в другом тоне (переключатель «Светлые /
// Тёмные»): то же место — от тона from к тону to
export function toTone(color: string, from: Tone, to: Tone): string {
  const p = tonePosition(color, from);
  return p.grey ? greyColor(p.x, to) : toneColor(p.x, p.y, to);
}
