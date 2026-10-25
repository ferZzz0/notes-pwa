import { useState } from 'react';
import './NotePage.css';

// Пока одна заметка на правой странице, хранится в памяти телефона.
// У установленного на iPhone приложения своя память, отдельная от Safari.
const STORAGE_KEY = 'notes-pwa:draft';

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

// Текст заметки — рукописью прямо по клетке листа
export function NotePage() {
  const [text, setText] = useState(load);

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
