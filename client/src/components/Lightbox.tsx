import { useEffect, useState } from "react";
import { useLightbox } from "../store/lightbox";
import { useI18n } from "../lib/i18n";
import { DownloadIcon, ExternalLinkIcon, XIcon } from "./Icons";

// Full-screen in-app image viewer. Click the backdrop or press Esc to close;
// click the image to toggle between fit-to-screen and actual size (zoom).
export default function Lightbox() {
  const { src, alt, close } = useLightbox();
  const { t } = useI18n();
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    setZoom(false);
    if (!src) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, close]);

  if (!src) return null;

  const filename = alt || src.split("/").pop() || "image";

  return (
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 backdrop-blur-sm"
      onClick={close}
    >
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-3 px-4 py-3 text-discord-text"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="min-w-0 truncate text-sm text-discord-muted">{filename}</span>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={src}
            download={filename}
            className="flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
            onClick={(e) => e.stopPropagation()}
          >
            <DownloadIcon size={14} /> {t("common.download")}
          </a>
          <button
            onClick={() => window.open(src, "_blank")}
            className="flex items-center gap-1.5 rounded bg-white/10 px-3 py-1.5 text-xs hover:bg-white/20"
          >
            <ExternalLinkIcon size={14} /> {t("common.openInBrowser")}
          </button>
          <button
            onClick={close}
            className="flex items-center rounded bg-white/10 px-2.5 py-1.5 text-xs hover:bg-white/20"
            aria-label="Close"
          >
            <XIcon size={15} />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={src}
          alt={filename}
          onClick={(e) => {
            e.stopPropagation();
            setZoom((z) => !z);
          }}
          className={
            zoom
              ? "max-w-none cursor-zoom-out"
              : "max-h-full max-w-full cursor-zoom-in object-contain"
          }
        />
      </div>
    </div>
  );
}
