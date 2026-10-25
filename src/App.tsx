import { Canvas } from './components/Canvas';
import { Notebook, PAGE_HEIGHT, PAGE_WIDTH } from './components/Notebook';
import { NotePage } from './components/NotePage';
import { UpdatePrompt } from './components/UpdatePrompt';
import './App.css';

// Сегодняшняя дата словами, как пишут вверху страницы в школьной тетради
const today = new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'long' }).format(new Date());

export default function App() {
  return (
    <div className="app-root">
      <Canvas worldWidth={PAGE_WIDTH * 2} worldHeight={PAGE_HEIGHT}>
        <Notebook
          left={
            <>
              <h1 className="page-title">Мои заметки</h1>
              <p className="page-muted">Пишите на правой странице.</p>
              <p className="page-muted">
                Тетрадь можно двигать и приближать пальцами, двойное касание — к листу и обратно.
              </p>
            </>
          }
          right={
            <>
              <p className="page-date">{today}</p>
              <NotePage />
            </>
          }
        />
      </Canvas>
      <UpdatePrompt />
    </div>
  );
}
