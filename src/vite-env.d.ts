// Типы для того, что подставляет Vite: импорт .css и картинок, import.meta.env
/// <reference types="vite/client" />
// Типы виртуального модуля 'virtual:pwa-register/react' (регистрация service worker'а)
/// <reference types="vite-plugin-pwa/react" />

// Когда собрана версия (vite.config.ts → define)
declare const __BUILD_TIME__: string;
