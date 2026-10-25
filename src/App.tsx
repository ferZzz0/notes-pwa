import { Notebook } from './components/Notebook';
import { RotateHint } from './components/RotateHint';
import { UpdatePrompt } from './components/UpdatePrompt';
import './App.css';

// Сегодняшняя дата словами, как пишут вверху страницы в школьной тетради
const today = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(new Date());

export default function App() {
  return (
    <>
      <Notebook
        left={
          <>
            <h1 className="page-title">Мои заметки</h1>
            <p className="page-muted">Пока пусто</p>
          </>
        }
        right={
          <>
            <p className="page-date">{today}</p>
            <p className="page-muted">Скоро здесь появятся ваши заметки</p>
          </>
        }
      />
      <RotateHint />
      <UpdatePrompt />
    </>
  );
}
