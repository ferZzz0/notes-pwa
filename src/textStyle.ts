// Оформление надписей: цвет чернил и шрифт. У каждого шрифта свои размер и
// высота строки (TextBlock.css) — чтобы надписи разными шрифтами выглядели
// соразмерно. Рукописные шрифты собраны в приложение и работают офлайн, а
// печатные — системные (на iPhone они есть и с кириллицей).

export const INKS = [
  { id: 'blue', label: 'Синие чернила', color: 'var(--ink)' },
  { id: 'black', label: 'Чёрные чернила', color: 'var(--ink-black)' },
  { id: 'red', label: 'Красные чернила', color: 'var(--ink-red)' },
  { id: 'green', label: 'Зелёные чернила', color: 'var(--ink-green)' },
  { id: 'violet', label: 'Фиолетовые чернила', color: 'var(--ink-violet)' },
  { id: 'orange', label: 'Оранжевые чернила', color: 'var(--ink-orange)' }
] as const;

export const FONTS = [
  { id: 'hand', label: 'Рукописный' },
  { id: 'script', label: 'Каллиграфия' },
  { id: 'marker', label: 'Фломастер' },
  { id: 'print', label: 'Печатный' },
  { id: 'serif', label: 'С засечками' },
  { id: 'mono', label: 'Пишущая машинка' }
] as const;

export type InkId = (typeof INKS)[number]['id'];
export type FontId = (typeof FONTS)[number]['id'];

// Незнакомое значение (из будущей версии или испорченное) — как по умолчанию
export const inkOf = (id?: string): InkId => INKS.find(i => i.id === id)?.id ?? 'blue';
export const fontOf = (id?: string): FontId => FONTS.find(f => f.id === id)?.id ?? 'hand';
export const inkColor = (id?: string): string => INKS.find(i => i.id === inkOf(id))!.color;
// Класс со шрифтом (TextBlock.css)
export const fontClass = (id?: string) => `font-${fontOf(id)}`;
