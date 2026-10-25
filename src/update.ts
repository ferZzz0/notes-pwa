// Обновление по кнопке в настройках (отладка) — в обход плашки «Доступна
// новая версия». Плашка появляется, только когда новая версия скачалась,
// пока приложение открыто; кнопка же сама спрашивает сервер, дожидается
// скачивания и включает новую версию, а по дороге говорит, что происходит.

// Сколько ждать скачивания новой версии: при торможении Cloudflare (README)
// оно может зависнуть
const INSTALL_TIMEOUT_MS = 60_000;
// Если страница ещё не под управлением service worker'а, смена версии не
// приходит событием — тогда перезагружаем через столько
const RELOAD_FALLBACK_MS = 3_000;

// Когда собрана версия, лежащая на сервере (version.json пишет сборка,
// vite.config.ts); null — сервер не ответил
export async function serverBuildTime(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = (await res.json()) as { built?: string };
    return data.built ?? null;
  } catch {
    return null;
  }
}

// Скачалась ли новая версия (лежит и ждёт)
export async function hasWaitingVersion(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.getRegistration();
  return Boolean(reg?.waiting);
}

const installed = (sw: ServiceWorker) =>
  new Promise<boolean>(resolve => {
    const timer = setTimeout(() => resolve(false), INSTALL_TIMEOUT_MS);
    const check = () => {
      if (sw.state === 'installed' || sw.state === 'activating' || sw.state === 'activated') {
        clearTimeout(timer);
        resolve(true);
      } else if (sw.state === 'redundant') {
        clearTimeout(timer);
        resolve(false);
      }
    };
    sw.addEventListener('statechange', check);
    check();
  });

// Проверить, скачать и включить новую версию. onStatus — что сейчас
// происходит (для панели настроек); в конце — перезагрузка или итог
export async function updateNow(onStatus: (text: string) => void): Promise<void> {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) {
    location.reload();
    return;
  }
  onStatus('Проверяю, есть ли новая версия…');
  try {
    await reg.update();
  } catch {
    onStatus('Сервер не ответил — нет интернета или мешает сеть.');
    return;
  }
  const sw = reg.installing ?? reg.waiting;
  if (!sw) {
    onStatus('У вас последняя версия.');
    return;
  }
  if (sw.state === 'installing') {
    onStatus('Скачиваю новую версию…');
    if (!(await installed(sw))) {
      onStatus('Не получилось скачать новую версию — похоже, мешает сеть. Попробуйте позже.');
      return;
    }
  }
  onStatus('Включаю новую версию…');
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  sw.postMessage({ type: 'SKIP_WAITING' });
  setTimeout(() => location.reload(), RELOAD_FALLBACK_MS);
}
