import { useEffect, useState } from 'react';
import { clearImages } from '../images';
import { clearAll } from '../notes';
import { hasWaitingVersion, serverBuildTime, updateNow } from '../update';
import './Settings.css';

const buildFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const formatBuild = (iso: string) => buildFormat.format(new Date(iso));

// Отладка — свёрнутый раздел в настройках главного меню (раньше —
// шестерёнка внизу экрана; её место заняли настройки листа — просьба
// автора): какая версия у вас и какая на сервере, «Обновить» (на случай,
// если новая версия сама не поставилась) и «Стереть все данные» — с
// подтверждением, потому что это навсегда
export function DebugSection() {
  const [confirming, setConfirming] = useState(false);
  // Версия на сервере: undefined — ещё спрашиваем, null — сервер не ответил
  const [server, setServer] = useState<string | null | undefined>(undefined);
  const [waiting, setWaiting] = useState(false);
  // Что сейчас происходит с обновлением
  const [status, setStatus] = useState<string | null>(null);

  // Раздел открыли — узнаём, что на сервере и не скачана ли уже новая версия
  useEffect(() => {
    let alive = true;
    void serverBuildTime().then(t => alive && setServer(t));
    void hasWaitingVersion().then(w => alive && setWaiting(w));
    return () => {
      alive = false;
    };
  }, []);

  const newer = server && server !== __BUILD_TIME__;

  return (
    <div className="debug-section">
      <p className="debug-note">
        У вас — версия от {formatBuild(__BUILD_TIME__)}.
        <br />
        {server === undefined
          ? 'Спрашиваю сервер…'
          : server === null
            ? 'Сервер не ответил.'
            : newer
              ? `На сервере — новее, от ${formatBuild(server)}.`
              : 'На сервере — такая же.'}
        {waiting && (
          <>
            <br />
            Новая версия уже скачана.
          </>
        )}
      </p>
      {status && <p className="debug-status">{status}</p>}
      <button type="button" className="debug-update" disabled={status !== null && status.endsWith('…')} onClick={() => void updateNow(setStatus)}>
        Обновить
      </button>
      {confirming ? (
        <div className="debug-confirm">
          <p className="debug-note">Все записи на этом устройстве удалятся навсегда, вернуть их будет нельзя.</p>
          <div className="debug-actions">
            <button type="button" className="debug-danger" onClick={() => void wipe()}>
              Стереть
            </button>
            <button type="button" onClick={() => setConfirming(false)}>
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button type="button" className="debug-danger-outline" onClick={() => setConfirming(true)}>
          Стереть все данные
        </button>
      )}
    </div>
  );
}

// Стираем память (и фото) и начинаем с чистого листа — перезапуском, чтобы
// ничего из уже открытой тетради не сохранилось заново
async function wipe() {
  await clearImages();
  clearAll();
  location.reload();
}
