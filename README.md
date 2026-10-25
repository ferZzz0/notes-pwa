# Заметки (PWA)

Приложение для заметок: устанавливается на телефон и компьютер как обычное
приложение (PWA) и работает офлайн. React 19 + TypeScript, собирает Vite,
офлайн-кэш и манифест делает vite-plugin-pwa (Workbox).

## Разработка

Нужен установленный Node.js.

```powershell
npm install        # один раз: ставит зависимости
npm run dev        # dev-сервер с мгновенной перезагрузкой (http://localhost:5173)
npm run check      # проверка типов TypeScript
npm run build      # production-сборка в dist/
npm run preview    # локальный просмотр production-сборки (http://localhost:4173)
npm run icons      # перегенерировать иконки из public/icon.svg
```

## Отладка

1. Запусти dev-сервер: `npm run dev` (оставь работать в терминале).
2. В VS Code нажми **F5** («Отладка (Chrome)») — откроется браузер с приложением.
   В списке конфигураций есть и вариант для Edge.
3. Точки останова ставь прямо в `src/**/*.tsx`.

Нюансы:

- В `npm run dev` service worker выключен, чтобы кэш не подсовывал старые
  файлы после правок. Офлайн-режим и плашку обновления проверяй через
  `npm run build` + `npm run preview` (http://localhost:4173).

## Как выкатить обновление

Версию кэша вручную поднимать не нужно: при каждой сборке service worker
получает новый список файлов с хэшами, и браузер сам замечает новую версию.
У пользователей появится плашка «Доступна новая версия» с кнопкой «Обновить».

Деплой на Cloudflare настраивается так же, как у zuma-pwa: подключи
репозиторий в Cloudflare Workers Builds, дальше каждый push в `main`
собирается и выкладывается сам (конфиг — `wrangler.jsonc`).

## Файлы

- `src/main.tsx` — запуск React-приложения
- `src/App.tsx`, `src/App.css` — главный экран
- `src/index.css` — общие стили и цвета темы (светлая и тёмная)
- `src/components/UpdatePrompt.tsx` — регистрация service worker'а и плашки
  «готово к работе офлайн» / «доступна новая версия»
- `index.html` — точка входа Vite
- `public/icon.svg` — исходник иконки; PNG и `favicon.ico` рядом с ним
  генерирует `npm run icons` (настройки в `pwa-assets.config.ts`)
- `vite.config.ts` — конфиг сборки и PWA (манифест, офлайн-кэш)
- `wrangler.jsonc` — конфиг деплоя на Cloudflare
