import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  allImageIds, clearAll, daysWithNotes, keepLegacyResetMarker, loadNotebooks,
  loadPage, loadSpreads, saveNotebooks, savePage, saveSpreads
} from '../src/notes.ts';
import { getSaveProblem, retryPendingSaves } from '../src/noteStorage.ts';

const first = { kind: 'notebook', id: 'default' };
const second = { kind: 'notebook', id: 'second' };
const page = date => ({ kind: 'day', date });
const spreads = text => ({ 0: { blocks: [{ id: 'block', x: 10, y: 20, text }] } });
const bookKey = 'notes-pwa:spreads';
const daysKey = 'notes-pwa:days';
const catalogKey = 'notes-pwa:notebooks';
const blocked = new Map();

class MemoryStorage {
  getItem(key) { return this[key] ?? null; }
  setItem(key, value) {
    if (blocked.has(key)) throw new DOMException('Storage write failed', blocked.get(key));
    this[key] = String(value);
  }
  removeItem(key) { delete this[key]; }
}

beforeEach(() => {
  blocked.clear();
  Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true });
  clearAll();
});

test('opening an existing installation preserves its original keys and image references, even without a reset marker', () => {
  const original = {
    0: { created: '2026-10-20', blocks: [{ id: 'pic', kind: 'image', image: 'old-photo', x: 0, y: 10, text: '' }],
      looks: { right: { paper: '#291230' } }, lookLog: { right: { past: [{}], future: [] } } }
  };
  const books = [{ id: 'default', name: 'Учёба', color: '#111111' }, { id: 'second', name: 'Дом', color: '#222222' }];
  const existing = {
    [bookKey]: JSON.stringify(original), [bookKey + ':second']: JSON.stringify(spreads('Другая тетрадь')),
    [daysKey]: JSON.stringify({ '2026-10-22': spreads('День')[0] }), [catalogKey]: JSON.stringify(books),
    'notes-pwa:page': '4', 'notes-pwa:theme': '{"brand":"#346791"}'
  };
  Object.assign(localStorage, existing);
  blocked.set('notes-pwa:reset', 'QuotaExceededError');
  keepLegacyResetMarker();
  assert.deepEqual(loadSpreads(first), original);
  assert.deepEqual(loadNotebooks(), books);
  assert.deepEqual(loadSpreads(second), spreads('Другая тетрадь'));
  assert.deepEqual(loadSpreads(page('2026-10-22')), spreads('День'));
  assert.equal(loadPage(first), 4);
  assert.deepEqual(allImageIds(), new Set(['old-photo']));
  assert.deepEqual({ ...localStorage }, existing);
  blocked.clear();
  keepLegacyResetMarker();
  assert.deepEqual({ ...localStorage }, { ...existing, 'notes-pwa:reset': '2026-10-25' });
});

test('quota failure keeps the last disk copy and the latest editable draft across navigation and partial retries', () => {
  saveSpreads(first, spreads('Сохранено'));
  blocked.set(bookKey, 'QuotaExceededError');
  blocked.set(bookKey + ':second', 'QuotaExceededError');
  saveSpreads(first, spreads('Черновик 1'));
  saveSpreads(first, spreads('Черновик 2'));
  saveSpreads(second, spreads('Во второй тетради'));
  savePage(second, 3);
  assert.equal(getSaveProblem(), 'full');
  assert.equal(localStorage.getItem(bookKey), JSON.stringify(spreads('Сохранено')));
  assert.deepEqual(loadSpreads(first), spreads('Черновик 2'));
  assert.equal(allImageIds(), null);
  blocked.delete(bookKey);
  retryPendingSaves();
  assert.equal(localStorage.getItem(bookKey), JSON.stringify(spreads('Черновик 2')));
  assert.equal(localStorage.getItem(bookKey + ':second'), null);
  assert.equal(getSaveProblem(), 'full');
  blocked.clear();
  saveSpreads(second, spreads('Последняя правка'));
  assert.equal(getSaveProblem(), null);
  assert.deepEqual(loadSpreads(second), spreads('Последняя правка'));
});

test('retry merges edited and cleared calendar days with unrelated dates saved in another tab', () => {
  const a = page('2026-11-01'), b = page('2026-11-02'), c = page('2026-11-03');
  saveSpreads(a, spreads('Запись 1'));
  blocked.set(daysKey, 'QuotaExceededError');
  saveSpreads(a, {});
  saveSpreads(b, spreads('Запись 2'));
  assert.deepEqual(loadSpreads(a), {});
  assert.deepEqual(loadSpreads(b), spreads('Запись 2'));
  assert.deepEqual(daysWithNotes(), new Set([b.date]));
  const disk = JSON.parse(localStorage.getItem(daysKey));
  assert.deepEqual(disk, { [a.date]: spreads('Запись 1')[0] });
  disk[c.date] = spreads('Из другой вкладки')[0];
  blocked.clear();
  localStorage.setItem(daysKey, JSON.stringify(disk));
  retryPendingSaves();
  assert.deepEqual(JSON.parse(localStorage.getItem(daysKey)), { [b.date]: spreads('Запись 2')[0], [c.date]: spreads('Из другой вкладки')[0] });
  assert.equal(getSaveProblem(), null);
});

test('legacy sources survive a failed migration and a fresh mount, then are removed only after the edited copy is durable', () => {
  const oldPages = '{"1":{"text":"Старая страница","created":"2026-10-14"}}';
  localStorage.setItem('notes-pwa:pages', oldPages);
  localStorage.setItem('notes-pwa:draft', 'Прежний черновик');
  blocked.set(bookKey, 'QuotaExceededError');
  const migrated = loadSpreads(first);
  assert.deepEqual(loadSpreads(first), migrated);
  assert.equal(migrated[0].blocks.length, 2);
  assert.equal(migrated[0].blocks[0].text, 'Старая страница');
  assert.equal(migrated[0].blocks[1].text, 'Прежний черновик');
  migrated[0].blocks[0].text += ' с правкой';
  saveSpreads(first, migrated);
  assert.equal(localStorage.getItem('notes-pwa:pages'), oldPages);
  assert.equal(localStorage.getItem('notes-pwa:draft'), 'Прежний черновик');
  assert.equal(localStorage.getItem(bookKey), null);
  blocked.clear();
  retryPendingSaves();
  assert.deepEqual(loadSpreads(first), migrated);
  assert.equal(localStorage.getItem('notes-pwa:pages'), null);
  assert.equal(localStorage.getItem('notes-pwa:draft'), null);
});

test('retry over a newer version in another tab keeps both the disk version and the local draft', () => {
  saveSpreads(first, spreads('До изменений'));
  blocked.set(bookKey, 'QuotaExceededError');
  saveSpreads(first, spreads('Здесь'));
  blocked.clear();
  localStorage.setItem(bookKey, JSON.stringify(spreads('В другой вкладке')));
  retryPendingSaves();
  assert.equal(getSaveProblem(), 'conflict');
  assert.deepEqual(loadSpreads(first), spreads('Здесь'));
  assert.equal(localStorage.getItem(bookKey), JSON.stringify(spreads('В другой вкладке')));
});

test('distinct legacy text on page two and in the single-note draft both survive an upgrade', () => {
  localStorage.setItem('notes-pwa:pages', '{"2":{"text":"На странице","created":"2026-10-14"}}');
  localStorage.setItem('notes-pwa:draft', 'Отдельный черновик');
  const migrated = loadSpreads(first);
  assert.deepEqual(migrated[0].blocks.map(b => b.text), ['На странице', 'Отдельный черновик']);
  assert.deepEqual(loadSpreads(first), migrated);
});

test('a confirmed notebook deletion is deferred until the catalog is saved and never revives a queued notebook', () => {
  const books = [{ id: 'default', name: 'Оставить', color: '#000000' }, { id: 'second', name: 'Удалить', color: '#ffffff' }];
  saveNotebooks(books);
  saveSpreads(second, spreads('На диске'));
  blocked.set(catalogKey, 'QuotaExceededError');
  blocked.set(bookKey + ':second', 'QuotaExceededError');
  saveNotebooks([books[0]], 'second');
  saveSpreads(second, spreads('В памяти'));
  assert.deepEqual(loadNotebooks(), [books[0]]);
  assert.equal(localStorage.getItem(catalogKey), JSON.stringify(books));
  assert.equal(localStorage.getItem(bookKey + ':second'), JSON.stringify(spreads('На диске')));
  blocked.clear();
  retryPendingSaves();
  assert.equal(getSaveProblem(), null);
  assert.equal(localStorage.getItem(bookKey + ':second'), null);
  assert.deepEqual(loadSpreads(second), {});
});

test('other storage errors keep the draft and unreadable calendar data is never replaced with an empty calendar', () => {
  blocked.set(bookKey, 'SecurityError');
  saveSpreads(first, spreads('Набранный текст'));
  assert.equal(getSaveProblem(), 'unavailable');
  assert.deepEqual(loadSpreads(first), spreads('Набранный текст'));
  localStorage.setItem(daysKey, 'broken json');
  saveSpreads(page('2026-11-24'), spreads('Ещё одна запись'));
  blocked.clear();
  retryPendingSaves();
  assert.equal(getSaveProblem(), 'unavailable');
  assert.equal(localStorage.getItem(daysKey), 'broken json');
});

test('editing after a failed read never overwrites the original notebook with the empty fallback', () => {
  const original = '{"0":{"blocks":';
  localStorage.setItem(bookKey, original);
  assert.deepEqual(loadSpreads(first), {});
  saveSpreads(first, spreads('Новые правки'));
  retryPendingSaves();
  assert.equal(getSaveProblem(), 'unavailable');
  assert.equal(localStorage.getItem(bookKey), original);
  assert.deepEqual(loadSpreads(first), spreads('Новые правки'));
});
