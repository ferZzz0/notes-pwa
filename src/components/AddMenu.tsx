import { useState, type CSSProperties } from 'react';
import { STICKERS, type StickerId } from '../textStyle';
import './AddMenu.css';

type Props = {
  onPhoto: (file: File) => void;
  onSticker: (sticker: StickerId) => void;
  // «Вставить» из буфера обмена (зовётся сразу после того, как меню закрыли)
  onPaste?: () => void;
};

// Выбор фото: на каждое нажатие — новое поле выбора файла (в документе —
// иначе iOS его не откроет), после выбора или отмены его убираем. С одним
// постоянным полем iOS после отмены выбора открывал его снова: следующее
// нажатие на «+» вело в медиатеку, а не в меню
function pickPhoto(onPhoto: (file: File) => void) {
  for (const old of document.querySelectorAll('.add-input')) old.remove();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.className = 'add-input';
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) onPhoto(file);
  });
  input.addEventListener('cancel', () => input.remove());
  document.body.appendChild(input);
  // Открывается прямо из нажатия на кнопку — иначе iOS не покажет выбор
  input.click();
}

// «+» внизу экрана (рядом с шестерёнкой): добавить на лист фото из галереи
// (или снять) либо готовый стикер, на котором сразу можно писать.
export function AddMenu({ onPhoto, onSticker, onPaste }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={open ? 'add-button round-button is-open' : 'add-button round-button'}
        aria-label="Добавить"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {open && (
        <>
          <div className="add-backdrop" onClick={() => setOpen(false)} />
          <div className="add-panel" role="dialog" aria-label="Добавить">
            {/* Вставка — только здесь (просьба автора), из общего буфера
                обмена. Меню прячется уже под пальцем: пока Safari показывает
                свою кнопку «Вставить», страница не перерисовывается */}
            {onPaste && (
              <button
                type='button'
                className='add-paste'
                onPointerDown={e => {
                  // Прозрачностью, а не visibility: скрытое так не ловит касание
                  const panel = e.currentTarget.closest<HTMLElement>('.add-panel');
                  if (panel) panel.style.opacity = '0';
                }}
                // Касание сорвалось (повели пальцем — меню прокрутилось) — меню снова видно
                onPointerCancel={e => {
                  const panel = e.currentTarget.closest<HTMLElement>('.add-panel');
                  if (panel) panel.style.opacity = '';
                }}
                onClick={() => {
                  setOpen(false);
                  onPaste();
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M9 4.5h6v3H9zM7.5 6H5.5v14h13V6h-2" />
                </svg>
                <span>
                  Вставить
                  <small>из буфера обмена</small>
                </span>
              </button>
            )}
            <button
              type="button"
              className="add-photo"
              onClick={() => {
                setOpen(false);
                pickPhoto(onPhoto);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M4 6.5h16v12H4zM4 15.5l4.5-4.5 4 4 2.5-2.5 5 5" />
                <circle cx="15.5" cy="10" r="1.6" />
              </svg>
              Фото
            </button>
            <p className="add-section">Стикеры</p>
            <div className="add-stickers">
              {STICKERS.map(s => (
                <button
                  key={s.id}
                  type="button"
                  className="add-sticker"
                  onClick={() => {
                    setOpen(false);
                    onSticker(s.id);
                  }}
                >
                  <StickerPreview sticker={s.id} fill={s.fill} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}

// Маленький стикер для меню — та же форма, что на листе (TextBlock.css)
export function StickerPreview({ sticker, fill }: { sticker: StickerId; fill: string }) {
  return (
    <span className="sticker-preview">
      <span className={`sticker-shape shape-${sticker}`} style={{ '--fill': fill } as CSSProperties} />
    </span>
  );
}
