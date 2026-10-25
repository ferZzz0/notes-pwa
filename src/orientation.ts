import { useSyncExternalStore } from 'react';

// Экран выше, чем шире: телефон держат вертикально (или узкое окно)
const PORTRAIT = window.matchMedia('(orientation: portrait)');

function subscribe(onChange: () => void): () => void {
  PORTRAIT.addEventListener('change', onChange);
  return () => PORTRAIT.removeEventListener('change', onChange);
}

// Вертикально тетрадь показывает одну страницу, горизонтально — разворот
export function usePortrait(): boolean {
  return useSyncExternalStore(subscribe, () => PORTRAIT.matches);
}
