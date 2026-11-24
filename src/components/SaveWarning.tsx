import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSaveProblem, retryPendingSaves, subscribeToSaveStatus, type SaveProblem } from '../noteStorage';
import './SaveWarning.css';

const reasons: Record<SaveProblem, string> = {
  full: 'Место для заметок закончилось.',
  unavailable: 'Не удалось записать изменения на устройство.',
  conflict: 'В другой вкладке уже сохранили другую версию.'
};

export function SaveWarning() {
  const problem = useSyncExternalStore(subscribeToSaveStatus, getSaveProblem);
  useEffect(() => {
    if (!problem) return;
    const guard = (event: BeforeUnloadEvent) => {
      if (!getSaveProblem()) return;
      event.preventDefault();
      event.returnValue = true;
    };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [problem]);

  return problem && <WarningMessage problem={problem} />;
}

function WarningMessage({ problem }: { problem: SaveProblem }) {
  const [tried, setTried] = useState(false);
  return (
    <aside className="save-warning" aria-label="Сохранение">
      <div role="alert">
        <strong>{tried ? 'Сохранить пока не удалось' : 'Изменения не сохранены'}</strong>
        <p>{reasons[problem]} Перед закрытием скопируй важный текст.</p>
      </div>
      <button type="button" onClick={() => {
        retryPendingSaves();
        setTried(true);
      }}>
        Повторить
      </button>
    </aside>
  );
}
