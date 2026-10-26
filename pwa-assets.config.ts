import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Настройки `npm run icons`: из public/icon.svg делает PNG-иконки PWA,
// apple-touch-icon и favicon.ico (кладёт их рядом, в public/).
// Для maskable (Android) и Apple фон заливаем цветом иконки без отступов:
// эти системы сами обрезают углы своей маской. Цвет — середина фона иконки
// (тёмное сливовое стекло).
const background = '#3f1750';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, padding: 0, resizeOptions: { background } },
    apple: { ...minimal2023Preset.apple, padding: 0, resizeOptions: { background } }
  },
  images: ['public/icon.svg']
});
