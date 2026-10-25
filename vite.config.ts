import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Делает сайт PWA: собирает service worker (Workbox) со списком всех
    // файлов сборки для офлайн-кэша и генерирует манифест. Версию кэша
    // вручную поднимать не нужно — список файлов с хэшами меняется сам.
    VitePWA({
      // Новую версию не включаем сами: показываем плашку (UpdatePrompt),
      // чтобы страница не перезагрузилась посреди набора заметки.
      registerType: 'prompt',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}']
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
        background_color: '#fbf8f3',
        theme_color: '#fbf8f3',
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
