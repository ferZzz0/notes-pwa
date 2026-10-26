import './ConfirmDialog.css';

type Props = {
  title: string;
  note?: string;
  confirm: string;
  cancel: string;
  onConfirm: () => void;
  onCancel: () => void;
};

// Вопрос посреди экрана, пока на него не ответят: фон закрывает всё
// остальное (и стрелки). Касание мимо ничего не делает — нужно выбрать
// кнопку: вопрос часто появляется от касания по листу, и «клик» того же
// касания попал бы в фон и сразу ответил за человека.
export function ConfirmDialog({ title, note, confirm, cancel, onConfirm, onCancel }: Props) {
  return (
    <>
      <div className="confirm-backdrop" />
      <div className="confirm-dialog" role="alertdialog" aria-label={title}>
        <p className="confirm-title">{title}</p>
        {note && <p className="confirm-note">{note}</p>}
        <div className="confirm-actions">
          <button type="button" className="confirm-danger" onClick={onConfirm}>
            {confirm}
          </button>
          <button type="button" onClick={onCancel}>
            {cancel}
          </button>
        </div>
      </div>
    </>
  );
}

// Сообщение посреди экрана в оформлении приложения (вместо системного
// alert — просьба автора): значок, заголовок, пояснение и «Понятно». Тут
// нечего решать, поэтому закрывает и касание мимо
export function NoticeDialog({ icon, title, note, onClose }: { icon: 'clipboard' | 'photo'; title: string; note?: string; onClose: () => void }) {
  return (
    <>
      <div className="confirm-backdrop" onClick={onClose} />
      <div className="confirm-dialog is-notice" role="alertdialog" aria-label={title}>
        <span className="confirm-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            {icon === 'clipboard' ? (
              <>
                <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
                <path d="M9 4.5V4a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 4v.5V6H9z" />
                <path d="M9 11.5h6M9 15.5h4" />
              </>
            ) : (
              <>
                <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="m4 17 5-4.5 3.5 3 3-2.5 4.5 4" />
              </>
            )}
          </svg>
        </span>
        <p className="confirm-title">{title}</p>
        {note && <p className="confirm-note">{note}</p>}
        <div className="confirm-actions">
          <button type="button" className="confirm-primary" onClick={onClose}>
            Понятно
          </button>
        </div>
      </div>
    </>
  );
}
