// Последняя неудавшаяся запись каждого документа живёт до закрытия приложения.
// Блокнот, список блокнотов и каждый день можно сохранить повторно независимо.
export type SaveProblem = 'full' | 'unavailable' | 'conflict';

export type StoredRecord = {
  read: () => string | null;
  write: (json: string) => void;
};

export const localRecord = (key: string): StoredRecord => ({
  read: () => localStorage.getItem(key),
  write: json => localStorage.setItem(key, json)
});

type PendingSave = {
  json: string;
  original: string | null | undefined;
  record: StoredRecord;
  afterSave?: () => void;
  problem: SaveProblem;
};

const pending = new Map<string, PendingSave>();
const listeners = new Set<() => void>();
const unreadable = new Set<string>();

export const pendingJson = (key: string) => pending.get(key)?.json;
export const pendingKeys = () => pending.keys();

// Если чтение не удалось, пустой экран не означает пустой блокнот на диске.
export function readDocument<T>(key: string, fallback: T, record = localRecord(key)): T {
  const draft = pendingJson(key);
  if (draft !== undefined) return JSON.parse(draft) as T;
  try {
    const raw = record.read();
    const value = raw === null ? fallback : JSON.parse(raw) as T;
    unreadable.delete(key);
    return value;
  } catch {
    unreadable.add(key);
    return fallback;
  }
}

export function getSaveProblem(): SaveProblem | null {
  let problem: SaveProblem | null = null;
  for (const save of pending.values()) {
    if (save.problem === 'conflict') return 'conflict';
    if (problem !== 'full') problem = save.problem;
  }
  return problem;
}

export function subscribeToSaveStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notifyIfChanged(before: SaveProblem | null) {
  // Перенос старой записи может произойти в инициализаторе React.
  if (getSaveProblem() !== before) queueMicrotask(() => listeners.forEach(listener => listener()));
}

function readOriginal(record: StoredRecord) {
  try {
    return record.read();
  } catch {
    return undefined;
  }
}

function storageProblem(error: unknown): SaveProblem {
  const name = error instanceof DOMException ? error.name : '';
  return name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED' ? 'full' : 'unavailable';
}

export function saveRecord(key: string, json: string, record = localRecord(key), afterSave?: () => void): boolean {
  const before = getSaveProblem();
  const previous = pending.get(key);
  let problem: SaveProblem | null = null;
  try {
    if (unreadable.has(key)) {
      const stored = record.read();
      if (stored === null) record.write(json);
      else if (stored !== json) problem = 'unavailable';
    } else if (previous) {
      const stored = record.read();
      // После ошибки другая вкладка могла записать новую версию. При повторе
      // сохраняем обе версии: ту на диске и доступный здесь черновик.
      if (stored !== json && stored !== (previous.original ?? null)) problem = 'conflict';
      else if (stored !== json) record.write(json);
    } else {
      record.write(json);
    }
  } catch (error) {
    problem = storageProblem(error);
  }
  if (problem) {
    const original = previous ? previous.original : readOriginal(record);
    pending.set(key, { json, original, record, afterSave, problem });
  } else {
    pending.delete(key);
    unreadable.delete(key);
    afterSave?.();
  }
  notifyIfChanged(before);
  return problem === null;
}

export function retryPendingSaves(): void {
  for (const key of [...pending.keys()]) {
    const save = pending.get(key);
    if (save) saveRecord(key, save.json, save.record, save.afterSave);
  }
}

// Только после явного удаления блокнота или всех данных в настройках.
export function discardPending(key?: string): void {
  const before = getSaveProblem();
  if (key === undefined) {
    pending.clear();
    unreadable.clear();
  } else {
    pending.delete(key);
    unreadable.delete(key);
  }
  notifyIfChanged(before);
}
