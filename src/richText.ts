// Надпись с оформлением по кускам: текст — это куски (runs), у каждого
// может быть свой цвет, шрифт, эффект и маркер поверх оформления всей
// надписи. Стиль из панели ложится на выделенный кусок, а без выделения —
// на всю надпись (тогда у кусков это свойство снимается). Здесь — работа с
// кусками и с их видом в редактируемом блоке (contenteditable): построить
// его содержимое, прочитать обратно, найти и поставить выделение в символах.

import type { Block } from './notes';
import { effectOf, fontClass, inkColor, markerColorOf, markerOf, type EffectId, type FontId, type MarkerId } from './textStyle';

export type RunStyle = { color?: string; font?: FontId; effect?: EffectId; marker?: MarkerId; markerColor?: string };
export type Run = RunStyle & { t: string };
// Выделение в надписи: символы [start, end)
export type TextRange = { start: number; end: number };

const KEYS = ['color', 'font', 'effect', 'marker', 'markerColor'] as const;

const hasStyle = (r: RunStyle) => KEYS.some(k => r[k] !== undefined);
const sameStyle = (a: RunStyle, b: RunStyle) => KEYS.every(k => a[k] === b[k]);

export const runsText = (runs: Run[]) => runs.map(r => r.t).join('');

// Куски надписи (у старых надписей и надписей без оформления по кускам —
// один кусок со всем текстом)
export const runsOf = (b: Block): Run[] => normalize(b.runs && b.runs.length > 0 ? b.runs : [{ t: b.text }]);

// Соседние куски с одинаковым оформлением — один кусок; пустые — долой
export function normalize(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    if (!r.t) continue;
    const last = out[out.length - 1];
    if (last && sameStyle(last, r)) out[out.length - 1] = { ...last, t: last.t + r.t };
    else out.push({ ...r });
  }
  return out;
}

// Для хранения: без оформления по кускам — ничего (хватает текста)
export const compactRuns = (runs: Run[]): Run[] | undefined => {
  const n = normalize(runs);
  return n.some(hasStyle) ? n : undefined;
};

function splitAt(runs: Run[], pos: number): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const r of runs) {
    const end = at + r.t.length;
    if (pos > at && pos < end) {
      out.push({ ...r, t: r.t.slice(0, pos - at) }, { ...r, t: r.t.slice(pos - at) });
    } else out.push(r);
    at = end;
  }
  return out;
}

// Оформление patch — на символы [start, end); 'none' и undefined снимают
// свойство у куска (тогда действует оформление всей надписи)
export function applyToRange(runs: Run[], range: TextRange, patch: Partial<Record<keyof RunStyle, string | undefined>>): Run[] {
  let at = 0;
  const out = splitAt(splitAt(runs, range.start), range.end).map(r => {
    const from = at;
    at += r.t.length;
    if (from < range.start || at > range.end) return r;
    const next: Record<string, unknown> = { ...r };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || v === 'none') delete next[k];
      else next[k] = v;
    }
    return next as Run;
  });
  return normalize(out);
}

// Оформление куска, на котором стоит символ pos (для начала выделения)
export function styleAt(runs: Run[], pos: number): RunStyle {
  let at = 0;
  for (const r of runs) {
    at += r.t.length;
    if (pos < at) return r;
  }
  return runs[runs.length - 1] ?? {};
}

// Свойства keys — снять со всех кусков (оформление легло на всю надпись)
export function stripStyle(runs: Run[], keys: (keyof RunStyle)[]): Run[] {
  return normalize(
    runs.map(r => {
      const next: Record<string, unknown> = { ...r };
      for (const k of keys) delete next[k];
      return next as Run;
    })
  );
}

// --- Вид кусков ---

// Классы и встроенный стиль куска. Маркер всей надписи рисуется у каждого
// куска (маркер — фон строчного span, он должен быть у каждого); его цвет —
// mark (CSS --mark): свой у куска или у всей надписи
export function runLook(r: RunStyle, blockMarker?: string, blockMarkerColor?: string): { className: string; color?: string; mark?: string } {
  const classes = ['run'];
  if (r.font) classes.push(fontClass(r.font));
  if (r.effect && effectOf(r.effect) !== 'none') classes.push(`effect-${r.effect}`);
  const markerId = r.marker ?? blockMarker;
  const marker = markerOf(markerId);
  if (marker !== 'none') classes.push(`mark-${marker}`);
  return {
    className: classes.join(' '),
    color: r.color ? inkColor(r.color) : undefined,
    mark: marker !== 'none' ? markerColorOf(markerId, r.markerColor ?? blockMarkerColor) : undefined
  };
}

// Нужен ли куску свой span (иначе — просто текст)
export const needsSpan = (r: RunStyle, blockMarker?: string) => hasStyle(r) || markerOf(blockMarker) !== 'none';

// Содержимое редактируемого блока по кускам. Свойства самого куска — в
// data-атрибутах (по ним содержимое читается обратно); если текст кончается
// переводом строки, в конце — «пустой» <br>, иначе последней пустой строки
// не видно
export function renderRuns(el: HTMLElement, runs: Run[], blockMarker?: string, blockMarkerColor?: string): void {
  const nodes: Node[] = [];
  for (const r of runs) {
    if (!needsSpan(r, blockMarker)) {
      nodes.push(document.createTextNode(r.t));
      continue;
    }
    const span = document.createElement('span');
    const look = runLook(r, blockMarker, blockMarkerColor);
    span.className = look.className;
    if (look.color) span.style.setProperty('--ink-color', look.color);
    if (look.mark) span.style.setProperty('--mark', look.mark);
    for (const k of KEYS) if (r[k] !== undefined) span.dataset[k] = String(r[k]);
    span.textContent = r.t;
    nodes.push(span);
  }
  if (runsText(runs).endsWith('\n')) {
    const br = document.createElement('br');
    br.dataset.ghost = '1';
    nodes.push(br);
  }
  el.replaceChildren(...nodes);
}

const styleOf = (el: HTMLElement): RunStyle => {
  const s: Record<string, string> = {};
  for (const k of KEYS) if (el.dataset[k] !== undefined) s[k] = el.dataset[k]!;
  return s as RunStyle;
};

// Прочитать куски из редактируемого блока. Перевод строки браузер может
// вставить и как <br>, и как <div> — оба становятся «\n»
export function parseRuns(el: HTMLElement): Run[] {
  const out: Run[] = [];
  const endsWithBreak = () => runsText(out).endsWith('\n') || out.length === 0;
  const walk = (node: Node, style: RunStyle) => {
    node.childNodes.forEach(child => {
      if (child.nodeType === Node.TEXT_NODE) out.push({ ...style, t: child.textContent ?? '' });
      else if (child instanceof HTMLBRElement) {
        // <br> — единственное в строке-<div> — это пустая строка, а не ещё одна
        // <br> в самом конце браузер ставит сам — чтобы у пустого (или
        // кончающегося переводом строки) блока была строка для курсора
        const lonely = child.parentElement !== el && child.parentElement?.childNodes.length === 1;
        const trailing = child === el.lastChild;
        if (!child.dataset.ghost && !lonely && !trailing) out.push({ ...style, t: '\n' });
      } else if (child instanceof HTMLElement) {
        const line = child.tagName === 'DIV' || child.tagName === 'P';
        if (line && !endsWithBreak()) out.push({ ...style, t: '\n' });
        walk(child, { ...style, ...styleOf(child) });
      }
    });
  };
  walk(el, {});
  return normalize(out);
}

// Не наш ли «посторонний» узел (строки-<div>, <br>, вложенные span,
// форматирование) — тогда содержимое надо построить заново
export const needsRebuild = (el: HTMLElement) => el.querySelector('div, p, br:not([data-ghost]), span span, b, i, u, font') !== null;

// Позиция (символ) → место в DOM
function locate(el: HTMLElement, pos: number): [Node, number] {
  let at = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const len = n.textContent?.length ?? 0;
      if (pos <= at + len) return [n, pos - at];
      at += len;
    } else if (n instanceof HTMLBRElement && !n.dataset.ghost) {
      const parent = n.parentNode!;
      if (pos <= at) return [parent, Array.prototype.indexOf.call(parent.childNodes, n)];
      at += 1;
    }
  }
  return [el, el.childNodes.length];
}

// Длина текста от начала блока до места (node, offset)
function offsetOf(el: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(el, 0);
  range.setEnd(node, offset);
  const frag = range.cloneContents();
  let len = 0;
  const walker = document.createTreeWalker(frag, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) len += n.textContent?.length ?? 0;
    else if (n instanceof HTMLBRElement && !n.dataset.ghost) len += 1;
  }
  return len;
}

// Выделение (или курсор) в блоке — в символах; null — его нет в этом блоке
export function getRange(el: HTMLElement): TextRange | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!el.contains(r.startContainer) || !el.contains(r.endContainer)) return null;
  const a = offsetOf(el, r.startContainer, r.startOffset);
  const b = offsetOf(el, r.endContainer, r.endOffset);
  return { start: Math.min(a, b), end: Math.max(a, b) };
}

export function setRange(el: HTMLElement, range: TextRange): void {
  const sel = window.getSelection();
  if (!sel) return;
  const r = document.createRange();
  const [sn, so] = locate(el, range.start);
  const [en, eo] = locate(el, range.end);
  r.setStart(sn, so);
  r.setEnd(en, eo);
  sel.removeAllRanges();
  sel.addRange(r);
}

// Длина текста в блоке (для курсора в конце)
export const textLength = (el: HTMLElement) => offsetOf(el, el, el.childNodes.length);
