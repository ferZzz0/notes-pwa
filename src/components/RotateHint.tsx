import './RotateHint.css';

// Приложение работает только горизонтально. Установленное приложение на
// Android поворачивается само (orientation в манифесте), а iOS этот ключ
// игнорирует, и запретить вертикаль из браузера там нельзя — поэтому в
// вертикали на сенсорных экранах закрываем всё этой подсказкой.
// Когда её показывать, решает CSS (RotateHint.css).
export function RotateHint() {
  return (
    <div className="rotate-hint" role="alert">
      <svg className="rotate-hint-phone" viewBox="0 0 48 48" aria-hidden="true">
        <rect x="14" y="4" width="20" height="40" rx="4" />
        <line x1="21" y1="39" x2="27" y2="39" />
      </svg>
      <p className="rotate-hint-title">Поверните телефон горизонтально</p>
      <p className="rotate-hint-text">Не поворачивается? Проверьте блокировку поворота экрана</p>
    </div>
  );
}
