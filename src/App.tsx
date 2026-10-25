import { useState } from 'react';
import { deleteImage } from './images';
import {
  COVER_COLORS,
  deleteNotebookData,
  loadNotebooks,
  loadView,
  localDate,
  newBlockId,
  saveNotebooks,
  saveView,
  type NotebookInfo,
  type View
} from './notes';
import { MainMenu } from './components/MainMenu';
import { Notebook } from './components/Notebook';
import { UpdatePrompt } from './components/UpdatePrompt';
import './App.css';

// День со сдвигом: ГГГГ-ММ-ДД ± n дней (по местному времени)
function shiftDay(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// Главный экран: меню (дневники и календарь) или открытая тетрадь — дневник
// или лист дня. Что было открыто, открывается и после перезапуска.
export default function App() {
  const [view, setViewState] = useState(loadView);
  const [notebooks, setNotebooksState] = useState(loadNotebooks);

  const setView = (next: View) => {
    setViewState(next);
    saveView(next);
  };
  const setNotebooks = (next: NotebookInfo[]) => {
    setNotebooksState(next);
    saveNotebooks(next);
  };

  // Открытый дневник могли удалить — тогда меню
  const open = view.kind === 'notebook' && !notebooks.some(n => n.id === view.id) ? { kind: 'menu' as const } : view;

  return (
    <div className="app-root">
      {open.kind === 'menu' ? (
        <MainMenu
          notebooks={notebooks}
          onOpen={id => setView({ kind: 'notebook', id })}
          onDay={date => setView({ kind: 'day', date })}
          onCreate={() => {
            const info = {
              id: newBlockId(),
              name: `Дневник ${notebooks.length + 1}`,
              color: COVER_COLORS[notebooks.length % COVER_COLORS.length]
            };
            setNotebooks([...notebooks, info]);
            return info.id;
          }}
          onRename={(id, name) => setNotebooks(notebooks.map(n => (n.id === id ? { ...n, name } : n)))}
          onRecolor={(id, color) => setNotebooks(notebooks.map(n => (n.id === id ? { ...n, color } : n)))}
          onDelete={id => {
            for (const image of deleteNotebookData(id)) void deleteImage(image);
            setNotebooks(notebooks.filter(n => n.id !== id));
          }}
        />
      ) : (
        <Notebook
          // Другой дневник или день — заново, со своими записями
          key={open.kind === 'day' ? `day:${open.date}` : open.id}
          source={open}
          onMenu={() => setView({ kind: 'menu' })}
          onDay={delta => setView({ kind: 'day', date: shiftDay(open.kind === 'day' ? open.date : localDate(), delta) })}
        />
      )}
      <UpdatePrompt />
    </div>
  );
}
