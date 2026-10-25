import { useState } from 'react';
import { loadStyle, saveStyle } from '../notes';
import { DEFAULT_BRAND, applyBrand, loadBrand, saveBrand } from '../theme';
import { DebugSection } from './Settings';
import { ColorWheel } from './TextToolbar';
import './AppSettings.css';

// Размер палитры (px)
const WHEEL_SIZE = 150;

// Настройки приложения — шестерёнка справа вверху главного меню. В них цвет
// приложения (внизу — свёрнутая отладка: версия, «Обновить», стереть
// данные): круговая
// палитра, как у надписей; цвет меняется во всём приложении, пока ведёшь
// пальцем, и запоминается, когда отпустил. «Как было» — снова синий.
// Выбранный цвет — ещё и цвет новых надписей (с ним начинается следующая;
// уже написанные не меняются)
export function AppSettings() {
  const [open, setOpen] = useState(false);
  const [brand, setBrand] = useState(loadBrand);

  const pick = (color: string, final: boolean) => {
    setBrand(color);
    applyBrand(color);
    if (!final) return;
    saveBrand(color);
    saveStyle({ ...loadStyle(), color });
  };

  return (
    <>
      <button
        type="button"
        className={open ? 'app-settings-button round-button is-open' : 'app-settings-button round-button'}
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
          <div className="app-settings-backdrop" onClick={() => setOpen(false)} />
          <div className="app-settings-panel" role="dialog" aria-label="Настройки">
            <p className="app-settings-title">Цвет приложения</p>
            <div className="app-settings-color">
              <ColorWheel color={brand} size={WHEEL_SIZE} label="Цвет приложения" onPick={pick} />
              <div className="app-settings-sample" aria-hidden="true">
                <span className="app-settings-sample-hand">Пример</span>
                <span className="app-settings-sample-muted">1 2 3</span>
                <span className="app-settings-sample-tint" />
              </div>
            </div>
            <button type="button" className="app-settings-reset" disabled={brand === DEFAULT_BRAND} onClick={() => pick(DEFAULT_BRAND, true)}>
              Как было
            </button>
            <details className="app-settings-debug">
              <summary>Версия и отладка</summary>
              <DebugSection />
            </details>
          </div>
        </>
      )}
    </>
  );
}
