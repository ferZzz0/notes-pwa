import { Canvas } from './components/Canvas';
import { Notebook, PAGE_HEIGHT, PAGE_WIDTH } from './components/Notebook';
import { UpdatePrompt } from './components/UpdatePrompt';
import './App.css';

export default function App() {
  return (
    <div className="app-root">
      <Canvas worldWidth={PAGE_WIDTH * 2} worldHeight={PAGE_HEIGHT}>
        <Notebook />
      </Canvas>
      <UpdatePrompt />
    </div>
  );
}
