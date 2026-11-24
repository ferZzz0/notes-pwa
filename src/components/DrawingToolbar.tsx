import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { brushes, maxSize, type Brush, type DrawingOptions, type Tool } from '../drawing';
import { ColorWheel, StyleSection, ToolbarSlider, keepFocus, menuRoom, useToolbarHeight } from './TextToolbar';
import './DrawingToolbar.css';

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
  options: DrawingOptions; onChange: (next: DrawingOptions, final?: boolean) => void; history: ReactNode; onDone: () => void;
  onHeight: (height: number) => void;
}) {
  const panel = useToolbarHeight(onHeight);
  const [menu, setMenu] = useState<'brush' | 'size' | 'color' | null>(null);
  const { tool, sizes, colors } = options;
  const lastBrush = useRef<Brush>(tool === 'eraser' ? 'marker' : tool);
  const brush = tool === 'eraser' ? lastBrush.current : tool;
  const sizeLabel = tool === 'eraser' ? 'Размер ластика' : 'Толщина';
  const toggle = (next: NonNullable<typeof menu>) => setMenu(m => m === next ? null : next);
  const pick = (value: string, final = true) => onChange({ ...options, colors: { ...colors, [brush]: value } }, final);
  const select = (id: Brush) => {
    lastBrush.current = id;
    onChange({ ...options, tool: id });
  };
  useEffect(() => {
    if (!menu) return;
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !panel.current?.contains(e.target)) setMenu(null); };
    const escape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); setMenu(null); }
    };
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('keydown', escape, true);
    };
  }, [menu, panel]);
  return (
    <div ref={panel} className={menu ? 'text-toolbar drawing-toolbar has-menu' : 'text-toolbar drawing-toolbar'}
      role="toolbar" aria-label="Рисование" onMouseDown={keepFocus}>
      <div className="toolbar-history"><div>{history}</div></div>
      {menu === 'brush' && <div className="toolbar-menu" role="dialog" aria-label="Инструменты рисования">
        <div className="toolbar-choices drawing-brushes" role="group" aria-label="Кисти">
          {(Object.keys(brushes) as Brush[]).map(id => (
            <button key={id} type="button" className={id === tool ? 'is-active' : undefined} aria-pressed={id === tool} onClick={() => select(id)}>
              <svg viewBox="0 0 56 24" className="drawing-sample" aria-hidden="true" style={{ color: colors[id] }}>
                {id === 'brush'
                  ? <path fill="currentColor" stroke="none" d="M3 19C13 16 22 1 32 4S40 16 54 5C43 21 36 18 30 12S14 19 3 19Z" />
                  : <path d="M4 18C14 17 23 3 30 7S39 19 52 7" strokeWidth={id === 'marker' ? 8 : id === 'pen' ? 3 : 1.6}
                      opacity={id === 'marker' ? 0.5 : id === 'pencil' ? 0.75 : 1} strokeDasharray={id === 'pencil' ? '1 1.2' : undefined} />}
              </svg>
              <small>{brushes[id]}</small>
            </button>
          ))}
        </div>
      </div>}
      {menu === 'size' && <div className="toolbar-menu toolbar-opacity-pop" role="dialog" aria-label={sizeLabel}>
        <StyleSection title={sizeLabel}><ToolbarSlider label={sizeLabel} sizeTrack min={1} max={maxSize(tool)}
          value={sizes[tool]} unit=" px" onPick={(size, final) => onChange({ ...options, sizes: { ...sizes, [tool]: size } }, final)} /></StyleSection>
      </div>}
      {menu === 'color' && <div className="toolbar-menu drawing-palette" role="dialog" aria-label="Цвет штриха">
        <ColorWheel color={colors[brush]} size={Math.min(170, menuRoom(0) - 50)} onPick={pick} />
        <div className="drawing-swatches">
          {palette.map(([label, value]) => <button key={value} type="button" aria-label={label} title={label} aria-pressed={colors[brush] === value}
            onClick={() => pick(value)} style={{ '--color': value } as CSSProperties} />)}
          <label title="Свой цвет" className="drawing-custom">＋<input type="color" aria-label="Свой цвет" value={colors[brush]} onChange={e => pick(e.target.value)} /></label>
        </div>
      </div>}
      <button type="button" className="text-toolbar-color" title="Цвет" aria-label="Цвет" aria-haspopup="dialog" aria-expanded={menu === 'color'}
        disabled={tool === 'eraser'} onClick={() => toggle('color')}><span className="text-toolbar-swatch" style={{ '--color': colors[brush] } as CSSProperties} /></button>
      <button type="button" aria-label="Кисти" title={brushes[brush]} aria-haspopup="dialog" aria-expanded={menu === 'brush'}
        className={menu === 'brush' ? 'text-toolbar-font is-active' : 'text-toolbar-font'} onClick={() => { if (tool === 'eraser') select(brush); toggle('brush'); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{icons[brush]}</svg>
        <svg viewBox="0 0 24 24" className="text-toolbar-chevron" aria-hidden="true"><path d="m7 14 5-5 5 5" /></svg>
      </button>
      <button type="button" aria-label={sizeLabel} title={sizeLabel + ' · ' + sizes[tool] + ' px'} aria-haspopup="dialog" aria-expanded={menu === 'size'}
        className={menu === 'size' ? 'is-active' : undefined} onClick={() => toggle('size')}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 11h16" /><path d="M4 18h16" strokeWidth="4.5" /></svg>
      </button>
      <button type="button" aria-label="Ластик" title="Ластик" aria-pressed={tool === 'eraser'} className={tool === 'eraser' ? 'is-active' : undefined}
        onClick={() => { setMenu(null); lastBrush.current = brush; onChange({ ...options, tool: tool === 'eraser' ? brush : 'eraser' }); }}>
        <svg viewBox="0 0 24 24" aria-hidden="true">{icons.eraser}</svg>
      </button>
      <button type="button" className="text-toolbar-done" aria-label="Готово" title="Готово" onClick={onDone}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </button>
    </div>
  );
}
