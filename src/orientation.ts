import { useSyncExternalStore } from 'react';

// Телефон держат вертикально, и приложение нарисовано повёрнутым на 90°.
// Должен совпадать с медиазапросом поворота .app-root в App.css.
const PAINTED_ROTATION = window.matchMedia('(orientation: portrait) and (pointer: coarse)');

function subscribe(onChange: () => void): () => void {
  PAINTED_ROTATION.addEventListener('change', onChange);
  return () => PAINTED_ROTATION.removeEventListener('change', onChange);
}

// Писать можно только в настоящей горизонтали. В нарисованной клавиатура
// iOS выезжает боком, поэтому там приложение работает только на чтение.
// Любое поле ввода должно появляться лишь при canWrite === true.
export function useCanWrite(): boolean {
  return !useSyncExternalStore(subscribe, () => PAINTED_ROTATION.matches);
}
