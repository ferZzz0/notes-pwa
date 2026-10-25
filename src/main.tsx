import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Рукописный шрифт для тетради; файлы шрифта собираются в приложение,
// поэтому работают и офлайн
import '@fontsource-variable/caveat';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
