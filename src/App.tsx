import { UpdatePrompt } from './components/UpdatePrompt';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1>Заметки</h1>
      </header>

      <main className="app-main">
        <div className="empty">
          <p className="empty-title">Здесь пока пусто</p>
          <p className="empty-hint">Скоро здесь появятся ваши заметки</p>
        </div>
      </main>

      <UpdatePrompt />
    </div>
  );
}
