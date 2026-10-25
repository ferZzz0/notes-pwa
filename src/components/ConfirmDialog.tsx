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
