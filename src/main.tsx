import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { resetOnce } from './notes';
import { applyBrand, loadBrand } from './theme';
// Рукописные шрифты для тетради; файлы шрифтов собираются в приложение,
// поэтому работают и офлайн. У дополнительных — только кириллица и латиница
import '@fontsource-variable/caveat';
import '@fontsource/marck-script/cyrillic-400.css';
import '@fontsource/marck-script/latin-400.css';
import '@fontsource/pangolin/cyrillic-400.css';
import '@fontsource/pangolin/latin-400.css';
import './index.css';

// До того как тетрадь прочитает записи: разовая очистка, если она есть
resetOnce();
// Свой цвет приложения — до первой отрисовки, чтобы не мелькал синий
applyBrand(loadBrand());

// Safari масштабирует страницу щипком даже вопреки meta viewport —
// жесты масштаба страницы глушим везде (у полотна масштаб свой)
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, e => e.preventDefault(), { passive: false });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
