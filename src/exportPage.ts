// Экспорт листа картинкой (настройки листа → «Экспортировать»): страница
// рисуется в PNG через html-to-image (SVG с foreignObject → canvas), без
// элементов управления — Notebook отдаёт сюда отдельную копию страницы.

import { toBlob } from 'html-to-image';

// Больше пикселей холст в iOS Safari не выдержит (~16.7 млн)
const MAX_PIXELS = 16_000_000;
// Чёткость картинки: px картинки на px мира
const PIXEL_RATIO = 2;

// Шрифты листа, встроенные как data: URL. Только основные наборы букв
// (латиница и кириллица — их и подключаем, main.tsx): остальные наборы
// Caveat не кешируются, и без сети их не скачать
let fonts: Promise<string> | null = null;
// Буквы, по которым узнаём основные наборы: латинская «a» и русская «а»
const MAIN_LETTERS = [0x61, 0x430];

// Есть ли буква в unicode-range («U+0-FF, U+131, U+4??» — браузер пишет его
// по-своему, поэтому разбираем числа, а не ищем строку); нет диапазона — все
function covers(range: string, code: number): boolean {
  if (!range.trim()) return true;
  for (const m of range.matchAll(/U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/gi)) {
    const from = parseInt(m[1].replace(/\?/g, '0'), 16);
    const to = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'F'), 16);
    if (code >= from && code <= to) return true;
  }
  return false;
}

async function dataUrl(url: string): Promise<string> {
  const blob = await (await fetch(url)).blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function fontCSS(): Promise<string> {
  fonts ??= (async () => {
    const out: string[] = [];
    for (const sheet of [...document.styleSheets]) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of [...rules]) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        const range = rule.style.getPropertyValue('unicode-range');
        if (!MAIN_LETTERS.some(code => covers(range, code))) continue;
        let css = rule.cssText;
        for (const m of css.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
          if (m[1].startsWith('data:')) continue;
          try {
            css = css.replace(m[0], `url(${await dataUrl(new URL(m[1], sheet.href ?? document.baseURI).href)})`);
          } catch {
            // Файл шрифта не достать — буквы будут запасным шрифтом
          }
        }
        out.push(css);
      }
    }
    return out.join('\n');
  })();
  return fonts;
}

// Картинка узла node (width × height px мира). Safari рисует картинки и
// шрифты внутри SVG не с первого раза — первый проход прогревочный
export async function pageImage(node: HTMLElement, width: number, height: number): Promise<Blob> {
  const options = {
    width,
    height,
    pixelRatio: Math.min(PIXEL_RATIO, Math.sqrt(MAX_PIXELS / (width * height))),
    fontEmbedCSS: await fontCSS(),
    // Сама копия страницы спрятана за экраном — на картинке она на месте
    style: { position: 'relative', transform: 'none' }
  };
  await toBlob(node, options);
  const blob = await toBlob(node, options);
  if (!blob) throw new Error('Не получилось нарисовать лист');
  return blob;
}

// Сохранить картинку: на телефоне — через «Поделиться» (там «Сохранить
// изображение» — в Фото), на компьютере — загрузкой файла. Зовётся прямо в
// нажатии: иначе «Поделиться» не откроется
export async function saveImage(file: File): Promise<void> {
  const touch = navigator.maxTouchPoints > 0;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      // Закрыли «Поделиться» — ничего не сохраняем
      if (!(e instanceof DOMException && e.name === 'AbortError')) throw e;
    }
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
