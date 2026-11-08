"use client";

import { useRef, useState } from "react";

import { Icon } from "../icons";

export type GalleryPhoto = { id: string; width: number; height: number };

const photoUrl = (slug: string, id: string) => `/${slug}/fotos/${id}`;

// The Fotos tab: a two-column grid; a tap opens the photo full screen, where
// the client swipes (scroll snap) or uses the arrows to see the next one.
export function PhotoGallery({
  slug,
  clinicName,
  photos,
}: {
  slug: string;
  clinicName: string;
  photos: GalleryPhoto[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [current, setCurrent] = useState(0);

  function scrollToPhoto(index: number, behavior: ScrollBehavior) {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: index * track.clientWidth, behavior });
  }

  function open(index: number) {
    setCurrent(index);
    dialogRef.current?.showModal();
    // The track has a width only once the dialog is open.
    requestAnimationFrame(() => scrollToPhoto(index, "instant"));
  }

  function step(delta: number) {
    const next = Math.min(Math.max(current + delta, 0), photos.length - 1);
    scrollToPhoto(next, "smooth");
  }

  function onScroll() {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;
    setCurrent(Math.round(track.scrollLeft / track.clientWidth));
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-2" aria-label="Fotos">
        {photos.map((photo, index) => (
          <li key={photo.id}>
            <button
              type="button"
              onClick={() => open(index)}
              className="block aspect-square w-full overflow-hidden rounded-xl bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              aria-label={`Ver foto ${index + 1} de ${photos.length}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- served by the /fotos route handler */}
              <img
                src={photoUrl(slug, photo.id)}
                alt=""
                width={photo.width}
                height={photo.height}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </button>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        aria-label={`Fotos de ${clinicName}`}
        className="m-0 size-full max-h-none max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
      >
        <div className="flex size-full flex-col">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm tabular-nums" aria-live="polite">
              {current + 1} de {photos.length}
            </p>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="flex size-11 items-center justify-center rounded-full hover:bg-white/10"
              aria-label="Fechar"
            >
              <Icon name="close" className="size-6" />
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            <div
              ref={trackRef}
              onScroll={onScroll}
              className="flex size-full snap-x snap-mandatory [scrollbar-width:none] overflow-x-auto overscroll-contain"
            >
              {photos.map((photo, index) => (
                <div
                  key={photo.id}
                  className="flex size-full shrink-0 snap-center items-center justify-center p-2"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- served by the /fotos route handler */}
                  <img
                    src={photoUrl(slug, photo.id)}
                    alt={`Foto ${index + 1} de ${photos.length}`}
                    width={photo.width}
                    height={photo.height}
                    loading="lazy"
                    decoding="async"
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ))}
            </div>
            {photos.length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={current === 0}
                  className="absolute top-1/2 left-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 disabled:opacity-0"
                  aria-label="Foto anterior"
                >
                  <Icon name="chevronLeft" className="size-6" />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  disabled={current === photos.length - 1}
                  className="absolute top-1/2 right-2 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 disabled:opacity-0"
                  aria-label="Próxima foto"
                >
                  <Icon name="chevronRight" className="size-6" />
                </button>
              </>
            ) : null}
          </div>
        </div>
      </dialog>
    </>
  );
}
