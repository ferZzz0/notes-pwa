// Фото на листах. Картинки большие для localStorage (там около 5 МБ на
// всё), поэтому лежат в IndexedDB — файлом (Blob) по своему id, а на листе
// у надписи-фото только этот id и пропорции. Перед сохранением фото
// уменьшается: сторона не больше MAX_SIDE px — на листе больше не нужно, а
// память телефона не резиновая. PNG (и другие картинки с прозрачностью)
// остаются PNG, остальное — JPEG.

const DB_NAME = 'notes-pwa-images';
const STORE = 'images';
const MAX_SIDE = 1600;
const JPEG_QUALITY = 0.85;

let dbPromise: Promise<IDBDatabase> | null = null;

function db(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    d =>
      new Promise<T>((resolve, reject) => {
        const req = action(d.transaction(STORE, mode).objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// Ссылки на уже открытые картинки (object URL) — чтобы не читать их заново
const urls = new Map<string, string>();

// Ссылка на картинку для <img>; null — картинки нет (стёрта)
export async function imageUrl(id: string): Promise<string | null> {
  const known = urls.get(id);
  if (known) return known;
  const blob = await run<Blob | undefined>('readonly', s => s.get(id) as IDBRequest<Blob | undefined>).catch(() => undefined);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(id, url);
  return url;
}

// Уже открытая картинка — сразу, без ожидания (для перерисовки)
export const knownImageUrl = (id: string) => urls.get(id) ?? null;

export async function deleteImage(id: string): Promise<void> {
  const url = urls.get(id);
  if (url) URL.revokeObjectURL(url);
  urls.delete(id);
  await run('readwrite', s => s.delete(id)).catch(() => {});
}

// Стереть картинки, которых нет ни на одном листе: фото с листа убирают
// сразу, а картинку — потом (Notebook при открытии), чтобы удаление можно
// было отменить
export async function keepImages(ids: Set<string>): Promise<void> {
  const keys = await run<IDBValidKey[]>('readonly', s => s.getAllKeys()).catch((): IDBValidKey[] => []);
  for (const key of keys) if (typeof key === 'string' && !ids.has(key)) await deleteImage(key);
}

// Стереть все картинки (настройки → «Стереть все данные»)
export function clearImages(): Promise<void> {
  dbPromise?.then(d => d.close()).catch(() => {});
  dbPromise = null;
  return new Promise(resolve => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Не удалось открыть картинку'));
    };
    img.src = url;
  });
}

// Сохранить выбранное фото: уменьшить, записать, вернуть id и пропорции
// (высота / ширина). <img> сам поворачивает фото по EXIF, так что снимки
// с телефона не лягут боком
export async function importImage(file: File, id: string): Promise<{ ratio: number; width: number }> {
  const img = await loadImage(file);
  const k = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * k));
  const h = Math.max(1, Math.round(img.naturalHeight * k));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
  const transparent = /png|webp|gif|svg/.test(file.type);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      b => (b ? resolve(b) : reject(new Error('Не удалось сохранить картинку'))),
      transparent ? 'image/png' : 'image/jpeg',
      JPEG_QUALITY
    )
  );
  await run('readwrite', s => s.put(blob, id));
  urls.set(id, URL.createObjectURL(blob));
  // Просим браузер не вычищать память приложения сам, когда места мало
  void navigator.storage?.persist?.().catch(() => {});
  return { ratio: h / w, width: w };
}
