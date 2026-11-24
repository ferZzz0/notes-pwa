import { useRef, useState } from 'react';
import { loadSpreads, localDate, saveSpreads, type Block, type Source, type Spreads } from './notes';

const HISTORY_SIZE = 100;
const MERGE_MS = 1500;

// Блок без дат — для сравнения: изменилось ли в нём что-то, кроме них
const undated = (b: Block) => JSON.stringify({ ...b, day: undefined, edited: undefined });

// Даты блоков перед записью: новый или изменённый блок — день, когда
// появился (day), и сегодня как день последнего изменения (edited, если не
// тот же); остальные — как в прежней записи old
function stampDates(next: Spreads, old: Spreads): Spreads {
  const today = localDate();
  const before = new Map<string, { block: Block; created?: string }>();
  for (const sp of Object.values(old)) for (const block of sp.blocks) before.set(block.id, { block, created: sp.created });
  const out: Spreads = {};
  for (const [key, sp] of Object.entries(next)) {
    const blocks = sp.blocks.map(b => {
      const o = before.get(b.id);
      if (o?.block === b) return b;
      if (o && undated(o.block) === undated(b)) {
        return b.day === o.block.day && b.edited === o.block.edited ? b : { ...b, day: o.block.day, edited: o.block.edited };
      }
      const day = o?.block.day ?? b.day ?? o?.created ?? today;
      return { ...b, day, edited: day < today ? today : undefined };
    });
    out[Number(key)] = { ...sp, blocks };
  }
  return out;
}

type Change = Spreads | ((current: Spreads) => Spreads);
const applyChange = (change: Change, current: Spreads) => typeof change === 'function' ? change(current) : change;

const newHistory = (spread: number) => ({ spread, past: [] as string[], future: [] as string[], key: '', at: 0 });

// Три разных состояния: то, что видно (включая движение по палитре), последний
// законченный шаг для отмены и запись на диске. За последнюю отвечает notes.ts.
export function useNotebookDocument(source: Source, spread: number) {
  const [spreads, show] = useState(() => loadSpreads(source));
  const visible = useRef(spreads);
  const checkpoint = useRef<{ spreads: Spreads; json: string } | null>(null);
  checkpoint.current ??= { spreads, json: JSON.stringify(spreads) };
  const history = useRef(newHistory(spread));
  if (history.current.spread !== spread) history.current = newHistory(spread);

  // Жест и асинхронная вставка получают свежий лист даже между перерисовками.
  const preview = (change: Change) => {
    visible.current = applyChange(change, visible.current);
    show(visible.current);
  };

  // stamp=false для перестановки страниц: переехавшие записи сохраняют даты.
  const commit = (change: Change, key = '', stamp = true) => {
    const prev = checkpoint.current!;
    const next = applyChange(change, visible.current);
    const edited = stamp ? stampDates(next, prev.spreads) : next;
    const json = JSON.stringify(edited);
    if (json === prev.json) {
      preview(prev.spreads);
      return;
    }
    const h = history.current;
    const now = Date.now();
    if (!key || key !== h.key || now - h.at > MERGE_MS) {
      h.past.push(prev.json);
      if (h.past.length > HISTORY_SIZE) h.past.shift();
    }
    h.key = key;
    h.at = now;
    h.future = [];
    checkpoint.current = { spreads: edited, json };
    saveSpreads(source, edited, json);
    preview(edited);
  };

  const restore = (from: string[], to: string[]): Spreads | undefined => {
    const json = from.pop();
    if (json === undefined) return;
    to.push(checkpoint.current!.json);
    const next = JSON.parse(json) as Spreads;
    history.current.key = '';
    checkpoint.current = { spreads: next, json };
    saveSpreads(source, next, json);
    preview(next);
    return next;
  };

  return {
    spreads, preview, commit,
    current: () => visible.current,
    lastEdit: () => checkpoint.current!.spreads,
    canUndo: history.current.past.length > 0,
    canRedo: history.current.future.length > 0,
    undo: () => restore(history.current.past, history.current.future),
    redo: () => restore(history.current.future, history.current.past),
    keepHistoryOn: (target: number) => { history.current.spread = target; }
  };
}
