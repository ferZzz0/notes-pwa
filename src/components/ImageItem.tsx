import { useEffect, useState, type CSSProperties } from 'react';
import { imageUrl, knownImageUrl } from '../images';
import type { Block } from '../notes';
import { filterCss, frameOf } from '../textStyle';
import './ImageItem.css';

// Ширина фото по умолчанию (px мира), если её почему-то нет
const DEFAULT_WIDTH = 500;

// Фото на листе: картинка из IndexedDB (images.ts) шириной block.width,
// высота — по пропорциям, в рамке (frame), с фильтром. Поворот и размер —
// вокруг середины, как у надписи; data-* — для выбора и замера (Notebook).
// Касания проходят к полотну.
export function ImageItem({ block }: { block: Block }) {
  const id = block.image ?? '';
  const [url, setUrl] = useState(() => knownImageUrl(id));

  useEffect(() => {
    if (url || !id) return;
    let alive = true;
    void imageUrl(id).then(u => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, [id]);

  const rotate = block.rotate ?? 0;
  const scale = block.scale ?? 1;
  const style = {
    left: block.x,
    top: block.y,
    width: block.width ?? DEFAULT_WIDTH,
    transform: rotate || scale !== 1 ? `rotate(${rotate}deg) scale(${scale})` : undefined
  } as CSSProperties;

  return (
    <div
      className={`item-image frame-${frameOf(block.frame)}`}
      style={style}
      data-block={block.id}
      data-rotate={rotate || undefined}
      data-scale={scale !== 1 ? scale : undefined}
    >
      <div className="item-image-photo" style={{ aspectRatio: `1 / ${block.ratio ?? 0.75}` }}>
        {url && (
          <img
            src={url}
            alt=""
            draggable={false}
            style={{ filter: filterCss(block.filter) }}
          />
        )}
      </div>
    </div>
  );
}
