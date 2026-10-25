import { useSyncExternalStore } from 'react';

// Телефон или планшет держат вертикально. Должен совпадать с медиазапросом
// вертикальной раскладки тетради в Notebook.css. Компьютеры (pointer: fine)
// сюда не попадают даже в узком окне.
const PORTRAIT_TOUCH = window.matchMedia('(orientation: portrait) and (pointer: coarse)');

function subscribe(onChange: () => void): () => void {
  PORTRAIT_TOUCH.addEventListener('change', onChange);
  return () => PORTRAIT_TOUCH.removeEventListener('change', onChange);
}

// Так решено для приложения: вертикально — только читать, писать — только
// горизонтально. Любое поле ввода должно появляться лишь при canWrite === true.
export function useCanWrite(): boolean {
  return !useSyncExternalStore(subscribe, () => PORTRAIT_TOUCH.matches);
}
