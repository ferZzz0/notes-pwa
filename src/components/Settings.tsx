import { useState } from 'react';
import { clearAll } from '../notes';
import './Settings.css';

const buildFormat = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

// Шестерёнка внизу экрана и панель настроек над ней. Пока там
// только отладка: когда собрана версия (видно, дошло ли обновление) и
// «Стереть все данные» — с подтверждением, потому что это навсегда.
// Панель закрывается повторным нажатием или касанием мимо неё.
export function Settings() {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const toggle = (next: boolean) => {
    setOpen(next);
    setConfirming(false);
  };

  return (
    <>
      <button
        type="button"
        className={open ? 'settings-button is-open' : 'settings-button'}
        aria-label="Настройки"
        aria-expanded={open}
        onClick={() => toggle(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1z" />
        </svg>
      </button>

      {open && (
        <>
          <div className="settings-backdrop" onClick={() => toggle(false)} />
          <div className="settings-panel" role="dialog" aria-label="Настройки">
            <p className="settings-title">Настройки</p>
            <p className="settings-section">Отладка</p>
            <p className="settings-note">Версия от {buildFormat.format(new Date(__BUILD_TIME__))}</p>
            {confirming ? (
              <div className="settings-confirm">
                <p className="settings-note">Все записи на этом устройстве удалятся навсегда, вернуть их будет нельзя.</p>
                <div className="settings-actions">
                  <button type="button" className="settings-danger" onClick={wipe}>
                    Стереть
                  </button>
                  <button type="button" onClick={() => setConfirming(false)}>
                    Отмена
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="settings-danger-outline" onClick={() => setConfirming(true)}>
                Стереть все данные
              </button>
            )}
          </div>
        </>
      )}
    </>
  );
}

// Стираем память и начинаем с чистого листа — перезапуском, чтобы ничего из
// уже открытой тетради не сохранилось заново
function wipe() {
  clearAll();
  location.reload();
}
