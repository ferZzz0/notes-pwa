import { useLayoutEffect, useRef } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

// Как часто спрашивать сервер о новой версии. Браузер и сам проверяет её
// при каждом открытии, но установленное приложение может висеть открытым
// днями — тогда без этой проверки обновление не пришло бы.
const UPDATE_CHECK_MS = 60 * 60 * 1000;

// Регистрирует service worker и показывает плашки:
// «готово к работе офлайн» после первой установки и «доступна новая версия»,
// когда на сервере появилась свежая сборка.
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (registration) {
        setInterval(() => registration.update(), UPDATE_CHECK_MS);
      }
    }
  });
  const shown = offlineReady || needRefresh;
  const box = useRef<HTMLDivElement>(null);

  // Пока плашка видна, её высота с отступом — в --prompt-space: кнопки внизу
  // экрана (стрелки листания) поднимаются над ней, а не закрывают её
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    if (shown && box.current) root.setProperty('--prompt-space', `${box.current.offsetHeight + 12}px`);
    else root.removeProperty('--prompt-space');
    return () => {
      root.removeProperty('--prompt-space');
    };
  }, [shown, needRefresh]);

  if (!shown) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div ref={box} className="update-prompt" role="status">
      <span className="update-prompt-text">
        {needRefresh ? 'Доступна новая версия' : 'Приложение готово к работе офлайн'}
      </span>
      {needRefresh && (
        <button className="update-prompt-primary" onClick={() => updateServiceWorker()}>
          Обновить
        </button>
      )}
      <button onClick={close}>{needRefresh ? 'Позже' : 'Ок'}</button>
    </div>
  );
}
