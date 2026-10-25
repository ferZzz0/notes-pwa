import { useState } from 'react';
import type { Settings } from '../settings';
import './SettingsButton.css';

type Props = {
  settings: Settings;
  onChange: (settings: Settings) => void;
};

// Шестерёнка в правом верхнем углу и панель настроек под ней.
// Панель закрывается повторным нажатием или касанием мимо неё.
export function SettingsButton({ settings, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={open ? 'settings-button is-open' : 'settings-button'}
        aria-label="Настройки"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1.08-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1.08 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 1 1 0 4h-.09c-.66 0-1.25.4-1.51 1z" />
        </svg>
      </button>

      {open && (
        <>
          <div className="settings-backdrop" onClick={() => setOpen(false)} />
          <div className="settings-panel" role="dialog" aria-label="Настройки">
            <p className="settings-title">Настройки</p>
            <div className="settings-row">
              <span>Листов на экране</span>
              <div className="settings-segments" role="radiogroup" aria-label="Листов на экране">
                {([1, 2] as const).map(n => (
                  <button
                    key={n}
                    type="button"
                    role="radio"
                    aria-checked={settings.pages === n}
                    className={settings.pages === n ? 'is-active' : undefined}
                    onClick={() => onChange({ ...settings, pages: n })}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
