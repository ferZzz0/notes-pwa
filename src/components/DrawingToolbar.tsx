import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { brushes, maxSize, type DrawingOptions, type Tool } from '../drawing';
import './DrawingToolbar.css';

const tools = { ...brushes, eraser: 'Ластик' };
const icons: Record<Tool, ReactNode> = {
  marker: <path transform="rotate(40 12 12)" d="M8.5 13V4A1.5 1.5 0 0 1 10 2.5h4A1.5 1.5 0 0 1 15.5 4v9L14 16h-4ZM8.5 13h7M10 16v5l4-1.5V16" />,
  pencil: <path d="m4 20 1.3-5L16.9 3.4a1.5 1.5 0 0 1 2.1 0L20.6 5a1.5 1.5 0 0 1 0 2.1L9 18.7 4 20Zm1.3-5 3.7 3.7M14.7 5.6l3.7 3.7M7.2 16.8l9.3-9.3" />,
  pen: <><path d="m5 19 2-7 7.5-7.5 4 4L11 16l-6 3Zm2-7 4 4M14.5 4.5l1.6-1.6a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2l-1.6 1.6M4.8 19.2l-1.3 1.3" /><path d="m19 8 1.5 1.5-4 4" /></>,
  brush: <><path d="M10 13c2-4.1 6.5-8.3 10-10-1 4.4-4.4 9.1-8.2 12.2Z" /><path d="M10.2 13c-2.8-.7-4.3 1.2-4.6 3.3-.2 1.5-.8 2.6-2.6 3.3 3.2 1.4 7.1.8 8.5-1.6.7-1.4.7-2.7.2-3.4" /></>,
  eraser: <><path d="m4.2 13.4 8.9-9a1.8 1.8 0 0 1 2.5 0l4.1 4.1a1.8 1.8 0 0 1 0 2.5l-8.1 8.1H8.9l-4.7-4.5a.9.9 0 0 1 0-1.2ZM8 9.7l6.5 6.5M10.5 19.1h10" /></>
};
const palette = [
  ['Чернильный', '#294579'], ['Графитовый', '#555562'], ['Розовый', '#d76682'],
  ['Золотистый', '#edb52e'], ['Зелёный', '#338476'], ['Белый', '#ffffff']
] as const;

export function DrawingToolbar({ options, onChange, history, onHeight, onDone }: {
  options: DrawingOptions; onChange: (next: DrawingOptions) => void; history: ReactNode; onDone: () => void;
  onHeight: (height: number) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const measure = () => onHeight(window.innerHeight - panel.current!.getBoundingClientRect().top);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel.current!);
    return () => observer.disconnect();
  }, [onHeight]);
  const { tool, sizes, colors } = options;
  const color = tool === 'eraser' ? undefined : colors[tool];
  const pick = (value: string) => {
    if (tool !== 'eraser') onChange({ ...options, colors: { ...colors, [tool]: value } });
  };
  return (
    <div ref={panel} className="drawing-toolbar" role="toolbar" aria-label="Рисование">
      <div className="drawing-tools">
        {(Object.keys(tools) as Tool[]).map(id => (
          <button key={id} type="button" aria-pressed={id === tool} onClick={() => onChange({ ...options, tool: id })}>
            <svg viewBox="0 0 24 24" aria-hidden="true">{icons[id]}</svg>
            {tools[id]}
          </button>
        ))}
      </div>
      <div className="drawing-width">
        <label htmlFor="drawing-size">{tool === 'eraser' ? 'Размер ластика' : 'Толщина'}</label>
        <input id="drawing-size" type="range" min="1" max={maxSize(tool)} value={sizes[tool]} onChange={e =>
          onChange({ ...options, sizes: { ...sizes, [tool]: Number(e.target.value) } })} />
        <output htmlFor="drawing-size">{sizes[tool]} px</output>
      </div>
      <div className="drawing-actions">
        {color && <div className="drawing-colors" role="group" aria-label="Цвет штриха">
          {palette.map(([label, value]) => (
            <button key={value} type="button" aria-label={label} title={label} aria-pressed={value === color}
              onClick={() => pick(value)}><i style={{ backgroundColor: value }} /></button>
          ))}
          <label className="drawing-custom" title="Свой цвет" style={{ color }}>
            <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="3" /><path d="M6 10h8m-4-4v8" fill="none" stroke="var(--ink)" strokeWidth="1.5" /></svg>
            <input type="color" aria-label="Свой цвет" value={color} onChange={e => pick(e.target.value)} />
          </label>
        </div>}
        <div className="drawing-history">{history}</div>
        <button type="button" className="drawing-done" onClick={onDone}>Готово</button>
      </div>
    </div>
  );
}
