import { useRef, type ChangeEvent } from "react";
import { ImagePlus, X } from "lucide-react";
import type { PendingComposerImage } from "./composerImageFiles";

export function ComposerImageInput({ images, disabled, onChoose, onRemove }: {
  images: PendingComposerImage[];
  disabled: boolean;
  onChoose: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const change = (event: ChangeEvent<HTMLInputElement>) => {
    onChoose([...event.target.files ?? []]);
    event.target.value = "";
  };
  return <>
    <input ref={inputRef} className="now-composer-image-input" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple onChange={change} tabIndex={-1} />
    <button type="button" className="now-icon-btn" aria-label="Add images" onClick={() => inputRef.current?.click()} disabled={disabled}>
      <ImagePlus aria-hidden="true" />
    </button>
    {images.length ? (
      <div className="now-composer-images" aria-label={`${images.length} attached ${images.length === 1 ? "image" : "images"}`}>
        {images.map((image) => (
          <figure key={image.id}>
            <img src={image.preview} alt={image.name} />
            <button type="button" aria-label={`Remove ${image.name}`} onClick={() => onRemove(image.id)} disabled={disabled}><X aria-hidden="true" /></button>
          </figure>
        ))}
      </div>
    ) : null}
  </>;
}
