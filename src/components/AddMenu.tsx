import { useRef, useState, type CSSProperties } from 'react';
import { STICKERS, type StickerId } from '../textStyle';
import './AddMenu.css';

type Props = {
  onPhoto: (file: File) => void;
  onSticker: (sticker: StickerId) => void;
};

// «+» внизу экрана (рядом с шестерёнкой): добавить на лист фото из галереи
// (или снять) либо готовый стикер, на котором сразу можно писать.
export function AddMenu({ onPhoto, onSticker }: Props) {
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);

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
      {/* Выбор фото; открывается прямо из нажатия на кнопку — иначе iOS не покажет */}
      <input
        ref={input}
        className="add-input"
        type="file"
        accept="image/*"
        tabIndex={-1}
        aria-hidden="true"
        onChange={e => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) onPhoto(file);
        }}
      />

      {open && (
        <>
          <div className="add-backdrop" onClick={() => setOpen(false)} />
          <div className="add-panel" role="dialog" aria-label="Добавить">
            <button
              type="button"
              className="add-photo"
              onClick={() => {
                setOpen(false);
                input.current?.click();
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
