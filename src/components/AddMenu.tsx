import { useEffect, useState, type CSSProperties } from 'react';
import { loadAddSection, loadGlitter, saveAddSection, saveGlitter, type AddSection } from '../notes';
import { DECAL_GROUPS, DECALS, DEFAULT_GLITTER, STICKERS, decalSrc, type DecalId, type StickerId } from '../textStyle';
import { Glitter } from './Glitter';
import { GlitterSlider } from './TextToolbar';
import './AddMenu.css';

type Props = {
  onPhoto: (file: File) => void;
  onSticker: (sticker: StickerId) => void;
  // Выбрали наклейку — дальше её наклеивают касаниями по листу; glitter —
  // сколько на ней блёсток (ползунок над наклейками)
  onDecal?: (decal: DecalId, glitter: number) => void;
  // «Вставить» из буфера обмена (зовётся сразу после того, как меню закрыли)
  onPaste?: () => void;
  // Есть ли что вставить: false — буфер точно пуст (тогда пункта нет)
  canPaste?: () => Promise<boolean>;
  // Выбрали брелок — дальше касания по листу его вешают (как наклейки)
  onCharm?: (decal: DecalId, glitter: number) => void;
  // Меню открылось или закрылось (пока открыто, другие нижние кнопки не нажимаются)
  onOpen?: (open: boolean) => void;
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
export function AddMenu({ onPhoto, onSticker, onDecal, onCharm, onPaste, canPaste, onOpen }: Props) {
  const [open, setOpen] = useState(false);
  useEffect(() => onOpen?.(open), [open]);
  // Буфер точно пуст — пункта «Вставить» нет (просьба автора); узнаём при
  // каждом открытии меню, а пока не узнали — пункт есть
  const [empty, setEmpty] = useState(false);
  // Блёстки новых наклеек — как выбрали в прошлый раз
  const [glitter, setGlitter] = useState(() => loadGlitter(DEFAULT_GLITTER));
  // «Стикеры», «Наклейки» и «Брелоки» сворачиваются (просьба автора),
  // развёрнут не больше одного; какой — запоминаем
  const [section, setSection] = useState<AddSection>(loadAddSection);
  // Наклейки сеткой по группам, над ними — ползунок блёсток (общий для
  // наклеек и брелоков); what — подпись кнопок, seed — приставка узора
  // блёсток (у брелка — свой, как на нём самом), pick — что делать с выбранной
  const decalGrid = (what: string, seed: string, pick: (id: DecalId) => void) => (
    <>
      <div className="add-glitter">
        <span>Блёстки</span>
        <GlitterSlider
          value={glitter}
          onPick={(v, final) => {
            setGlitter(v);
            if (final) saveGlitter(v);
          }}
        />
      </div>
      {DECAL_GROUPS.map(g => (
        <div key={g.id}>
          <p className="add-section">{g.label}</p>
          <div className="add-decals">
            {DECALS.filter(d => d.group === g.id).map(d => (
              <button
                key={d.id}
                type="button"
                className="add-decal"
                aria-label={`${what} «${d.label}»`}
                onClick={() => {
                  setOpen(false);
                  pick(d.id);
                }}
              >
                <img src={decalSrc(d.id)} alt="" draggable={false} />
                <Glitter seed={seed + d.id} amount={glitter} twinkle />
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
  const fold = (id: Exclude<AddSection, null>, label: string) => (
    <button
      type="button"
      className="add-fold"
      aria-expanded={section === id}
      onClick={() => {
        const next = section === id ? null : id;
        setSection(next);
        saveAddSection(next);
      }}
    >
      {label}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
  const toggle = () => {
    if (!open) {
      setEmpty(false);
      void canPaste?.().then(ok => setEmpty(!ok));
    }
    setOpen(!open);
  };

  return (
    <>
      <button
        type="button"
        className={open ? 'add-button round-button is-open' : 'add-button round-button'}
        aria-label="Добавить"
        aria-expanded={open}
        onClick={toggle}
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
            {onPaste && !empty && (
              <button
                type="button"
                className="add-paste"
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
            {fold('stickers', 'Стикеры')}
            {section === 'stickers' && (
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
            )}
            {/* Наклейки (просьба автора): картинки с блёстками; сколько
                блёсток — ползунком; выбрали — и касания по листу её
                наклеивают, пока не нажмут «×» над «+» */}
            {onDecal && fold('decals', 'Наклейки')}
            {onDecal && section === 'decals' && decalGrid('Наклейка', '', id => onDecal(id, glitter))}
            {/* Брелоки (просьба автора: «сколько угодно и в любое место»): та
                же наклейка, но на цепочке — вешают касаниями по листу, как
                наклейки, пока не нажмут «×»; качаются */}
            {onCharm && fold('charms', 'Брелоки')}
            {onCharm && section === 'charms' && (
              <>
                <p className="add-note">Наклейка на цепочке: выбери — и каждое касание листа повесит её туда (сколько угодно), закончить — «×» внизу. Качается от движения телефона; коснись брелка — двигать пальцем, блёстки, размер.</p>
                {decalGrid('Брелок', 'charm-', id => onCharm(id, glitter))}
              </>
            )}
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
