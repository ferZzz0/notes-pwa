import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { resetOnce } from './notes';
// Рукописный шрифт для тетради; файлы шрифта собираются в приложение,
// поэтому работают и офлайн
import '@fontsource-variable/caveat';
import './index.css';

// До того как тетрадь прочитает записи: разовая очистка, если она есть
resetOnce();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
