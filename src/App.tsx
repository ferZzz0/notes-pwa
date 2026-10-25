import { Notebook } from './components/Notebook';
import { NotePage } from './components/NotePage';
import { UpdatePrompt } from './components/UpdatePrompt';
import { useCanWrite } from './orientation';
import './App.css';

// Сегодняшняя дата словами, как пишут вверху страницы в школьной тетради
const today = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(new Date());

export default function App() {
  const canWrite = useCanWrite();

  return (
    <div className="app-root">
      <Notebook
        left={
          <>
            <h1 className="page-title">Мои заметки</h1>
            <p className="page-muted">{canWrite ? 'Пишите на правой странице' : 'Режим чтения'}</p>
          </>
        }
        right={
          <>
            <p className="page-date">{today}</p>
            <NotePage />
          </>
        }
      />
      <UpdatePrompt />
    </div>
  );
}
