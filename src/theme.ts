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
