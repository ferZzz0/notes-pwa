// Основной цвет приложения: чернила интерфейса, номера страниц, кнопки,
// надписи без своего цвета. По умолчанию — синий; свой выбирают на круговой
// палитре в настройках главного меню (AppSettings). Оттенки — бледные, для
// тёмной темы — index.css получает из него (--brand), поэтому сохраняются.
// Хранится на устройстве; «Стереть все данные» возвращает синий.

const THEME_KEY = 'notes-pwa:theme';
export const DEFAULT_BRAND = '#24398c';
const HEX = /^#[0-9a-f]{6}$/i;

export function loadBrand(): string {
  try {
    const saved = JSON.parse(localStorage.getItem(THEME_KEY) ?? 'null') as { brand?: unknown } | null;
    return typeof saved?.brand === 'string' && HEX.test(saved.brand) ? saved.brand : DEFAULT_BRAND;
  } catch {
    return DEFAULT_BRAND;
  }
}

export function saveBrand(brand: string): void {
  try {
    if (brand === DEFAULT_BRAND) localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, JSON.stringify({ brand }));
  } catch {
    // Память недоступна — цвет до перезапуска
  }
}

// Показать цвет во всём приложении (сразу, без перерисовки React)
export function applyBrand(brand: string): void {
  document.documentElement.style.setProperty('--brand', brand);
}

// Тёмный ли цвет (#rrggbb): по яркости, как её видит глаз. На тёмном листе
// плашки и меню тёмные, а номер и дата — светлые
export function isDark(color: string | undefined): boolean {
  if (!color || !HEX.test(color)) return false;
  const [r, g, b] = [1, 3, 5].map(i => {
    const c = parseInt(color.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.2;
}
