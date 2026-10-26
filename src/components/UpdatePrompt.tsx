import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

// Как часто спрашивать сервер о новой версии, пока приложение открыто.
// Браузер и сам проверяет её при каждом запуске, но установленное
// приложение может висеть открытым днями — тогда без этой проверки
// обновление не пришло бы.
const UPDATE_CHECK_MS = 60 * 60 * 1000;
// Пока заняты (печатают, открыта панель, палец на экране), новую версию
// не включаем — проверяем снова через столько
const BUSY_RETRY_MS = 1500;

// Сейчас можно перезагрузить страницу, ничего не оборвав: никто не печатает,
// не открыты панель, меню или список, палец не на экране. Записи и так
// сохраняются на каждое изменение, а открытое (блокнот, страница) после
// перезагрузки открывается снова
let pressed = 0;
function idle(): boolean {
  if (pressed > 0) return false;
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return false;
  return !document.querySelector('[role="dialog"], [role="alertdialog"], [role="toolbar"]');
}

// Регистрирует service worker и показывает плашку «готово к работе офлайн»
// после первой установки. Новая версия ставится САМА (просьба автора):
// скачалась — включаем и перезагружаем, как только приложение не занято
// (или сразу, если оно ушло в фон)
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh],
    updateServiceWorker
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => void registration.update().catch(() => {});
      setInterval(check, UPDATE_CHECK_MS);
      // Установленное на iPhone приложение при повторном открытии обычно
      // не запускается заново, а просыпается из фона — без запуска браузер
      // не проверяет обновление, а таймеры в фоне iOS замораживает.
      // Поэтому проверяем каждый раз, когда приложение снова на экране,
      // и когда вернулся интернет
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      window.addEventListener('online', check);
    }
  });

  useEffect(() => {
    const down = () => pressed++;
    const up = () => (pressed = Math.max(0, pressed - 1));
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);

  useEffect(() => {
    if (!needRefresh) return;
    let done = false;
    // Новая версия включается и сама перезагружает страницу. Но если
    // страница ещё не под управлением service worker'а (самый первый запуск),
    // новая версия уже включилась без ожидания — тогда просто перезагружаем
    const apply = () => {
      if (done) return;
      done = true;
      void updateServiceWorker(true).then(() => {
        if (!navigator.serviceWorker.controller) window.location.reload();
      });
    };
    const tryNow = () => {
      if (document.visibilityState === 'hidden' || idle()) apply();
    };
    tryNow();
    const timer = setInterval(tryNow, BUSY_RETRY_MS);
    document.addEventListener('visibilitychange', tryNow);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tryNow);
    };
  }, [needRefresh]);

  if (!offlineReady) return null;

  return (
    <div className="update-prompt" role="status">
      <span className="update-prompt-text">Приложение готово к работе офлайн</span>
      <button onClick={() => setOfflineReady(false)}>Ок</button>
    </div>
  );
}
