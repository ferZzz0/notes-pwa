// Экспорт листа картинкой (настройки листа → «Экспортировать»): страница
// рисуется в PNG через html-to-image (SVG с foreignObject → canvas), без
// элементов управления — Notebook отдаёт сюда отдельную копию страницы.

import { toSvg } from 'html-to-image';

// Больше пикселей холст в iOS Safari не выдержит (~16.7 млн)
const MAX_PIXELS = 16_000_000;
// Чёткость картинки: px картинки на px мира (лист 850 → 2550 px)
const PIXEL_RATIO = 3;

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

// Safari (на iPhone — любой браузер) догружает картинки внутри SVG уже после
// того, как его нарисовали: в первый раз фото на листе не было (жалоба
// автора). Поэтому SVG рисуем на холст несколько раз с паузами — то же
// изображение, уже с догруженными фото
const WEBKIT = /AppleWebKit/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Android/.test(navigator.userAgent);
const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const DRAWS = WEBKIT || IOS ? 5 : 1;
const DRAW_PAUSE_MS = 250;

const loadImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не получилось нарисовать лист'));
    img.src = src;
  });

// Картинка узла node (width × height px мира): html-to-image собирает SVG
// (стили, шрифты и фото внутри), рисуем его сами. SVG — сразу итогового
// размера (копия страницы в нём увеличена transform): iPhone иначе рисовал
// страницу в 1× и растягивал — картинка выходила мыльной (просьба автора:
// «экспорт более высокого качества»)
export async function pageImage(node: HTMLElement, width: number, height: number): Promise<Blob> {
  const ratio = Math.min(PIXEL_RATIO, Math.sqrt(MAX_PIXELS / (width * height)));
  const w = Math.round(width * ratio);
  const h = Math.round(height * ratio);
  const svg = await toSvg(node, {
    width: w,
    height: h,
    fontEmbedCSS: await fontCSS(),
    // Сама копия страницы спрятана за экраном — на картинке она на месте и
    // увеличена до итогового размера
    style: { position: 'relative', transform: `scale(${ratio})`, transformOrigin: '0 0', width: `${width}px`, height: `${height}px` }
  });
  const img = await loadImage(svg);
  await img.decode().catch(() => {});
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d')!;
  for (let i = 0; i < DRAWS; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, DRAW_PAUSE_MS));
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
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
