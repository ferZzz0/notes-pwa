import { Notebook } from './components/Notebook';
import { UpdatePrompt } from './components/UpdatePrompt';
import './App.css';

export default function App() {
  return (
    <div className="app-root">
      <Notebook />
      <UpdatePrompt />
    </div>
  );
}
