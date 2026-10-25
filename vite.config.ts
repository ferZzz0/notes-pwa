import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Когда собрана версия. В приложении — __BUILD_TIME__, а рядом с ним на
// сервере — version.json: настройки сравнивают их и показывают, дошло ли
// обновление. version.json не кэшируется (его нет в globPatterns ниже)
const BUILD_TIME = new Date().toISOString();

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(BUILD_TIME)
  },
  plugins: [
    react(),
    {
      name: 'version-file',
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ built: BUILD_TIME }) });
      }
    },
    // Делает сайт PWA: собирает service worker (Workbox) со списком всех
    // файлов сборки для офлайн-кэша и генерирует манифест. Версию кэша
    // вручную поднимать не нужно — список файлов с хэшами меняется сам.
    VitePWA({
      // Новую версию не включаем сами: показываем плашку (UpdatePrompt),
      // чтобы страница не перезагрузилась посреди набора заметки.
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        // Расширенные наборы символов шрифта (латиница с диакритикой и т.п.)
        // заранее не кэшируем: для русского и английского они не нужны,
        // браузер скачает их сам, только если такие символы встретятся.
        globIgnores: ['**/*-ext-*.woff2']
      },
      manifest: {
        id: '/',
        name: 'Заметки',
        short_name: 'Заметки',
        description: 'Заметки — устанавливаемое приложение, работает офлайн',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        // Ориентацию не фиксируем: в обеих всё работает одинаково
        background_color: '#fffdf6',
        theme_color: '#fffdf6',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
});
