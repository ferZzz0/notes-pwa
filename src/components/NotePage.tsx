import { useEffect, useState } from 'react';
import { useCanWrite } from '../orientation';
import './NotePage.css';

// Пока одна заметка на правой странице, хранится в памяти телефона.
// У установленного на iPhone приложения своя память, отдельная от Safari.
const STORAGE_KEY = 'notes-pwa:draft';
const HINT_MS = 4000;

function load(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function save(text: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, text);
  } catch {
    // Память недоступна (приватный режим) — текст живёт до перезагрузки
  }
}

// Текст заметки. В горизонтали — поле ввода, в вертикали — только чтение:
// поля ввода нет совсем, клавиатура не появится, а нажатие объясняет,
// как перейти в режим письма.
export function NotePage() {
  const canWrite = useCanWrite();
  const [text, setText] = useState(load);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(false), HINT_MS);
    return () => clearTimeout(timer);
  }, [hint]);

  if (canWrite) {
    return (
      <textarea
        className="note-text"
        value={text}
        onChange={e => {
          setText(e.target.value);
          save(e.target.value);
        }}
        placeholder="Пишите здесь…"
        aria-label="Заметка"
      />
    );
  }

  return (
    <>
      <div className="note-text" onClick={() => setHint(true)}>
        {text || <span className="note-empty">Пока пусто</span>}
      </div>
      {hint && (
        <p className="note-hint" role="status">
          Писать можно только в горизонтальном режиме: отключите блокировку поворота экрана
          и поверните телефон
        </p>
      )}
    </>
  );
}
