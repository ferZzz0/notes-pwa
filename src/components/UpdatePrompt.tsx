import { useRegisterSW } from 'virtual:pwa-register/react';
import './UpdatePrompt.css';

// Как часто спрашивать сервер о новой версии, пока приложение открыто.
// Браузер и сам проверяет её при каждом запуске, но установленное
// приложение может висеть открытым днями — тогда без этой проверки
// обновление не пришло бы.
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

  if (!offlineReady && !needRefresh) return null;

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  // Новая версия включается и сама перезагружает страницу. Но если
  // страница ещё не под управлением service worker'а (самый первый запуск),
  // новая версия уже включилась без ожидания — тогда просто перезагружаем
  const update = async () => {
    await updateServiceWorker();
    if (!navigator.serviceWorker.controller) window.location.reload();
  };

  return (
    <div className="update-prompt" role="status">
      <span className="update-prompt-text">
        {needRefresh ? 'Доступна новая версия' : 'Приложение готово к работе офлайн'}
      </span>
      {needRefresh && (
        <button className="update-prompt-primary" onClick={() => void update()}>
          Обновить
        </button>
      )}
      <button onClick={close}>{needRefresh ? 'Позже' : 'Ок'}</button>
    </div>
  );
}
