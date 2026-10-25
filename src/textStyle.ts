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
