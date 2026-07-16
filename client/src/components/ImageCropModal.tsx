import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";
import Modal from "./Modal";

// Pan + zoom cropper. The user drags the photo to reposition and uses the
// slider to zoom; on confirm we render the visible frame region to a canvas
// and hand back a JPEG File. `shape` picks the frame: a circle for avatars,
// a wide rectangle for banners.
export default function ImageCropModal({
  file,
  shape,
  onCancel,
  onCropped,
}: {
  file: File;
  shape: "circle" | "wide";
  onCancel: () => void;
  onCropped: (f: File) => void;
}) {
  const { t } = useI18n();
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);

  // Display frame size (px) and output resolution.
  const FRAME_W = shape === "circle" ? 260 : 300;
  const FRAME_H = shape === "circle" ? 260 : 112; // banner ≈ 2.66:1
  const OUT_W = shape === "circle" ? 512 : 1024;
  const OUT_H = shape === "circle" ? 512 : 384;

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Cover-fit base scale, then the user's zoom on top.
  const base = img ? Math.max(FRAME_W / img.naturalWidth, FRAME_H / img.naturalHeight) : 1;
  const scale = base * zoom;
  const drawnW = img ? img.naturalWidth * scale : 0;
  const drawnH = img ? img.naturalHeight * scale : 0;

  // Keep the image covering the frame (clamp the pan).
  function clamp(x: number, y: number) {
    const minX = FRAME_W - drawnW;
    const minY = FRAME_H - drawnH;
    return { x: Math.min(0, Math.max(minX, x)), y: Math.min(0, Math.max(minY, y)) };
  }

  useEffect(() => {
    // Re-center within bounds whenever zoom changes.
    setOffset((o) => clamp(o.x, o.y));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, img]);

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const nx = drag.current.ox + (e.clientX - drag.current.x);
    const ny = drag.current.oy + (e.clientY - drag.current.y);
    setOffset(clamp(nx, ny));
  };
  const onPointerUp = () => { drag.current = null; };

  function confirm() {
    if (!img) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUT_W;
    canvas.height = OUT_H;
    const ctx = canvas.getContext("2d")!;
    const k = OUT_W / FRAME_W; // frame → output scale
    ctx.drawImage(img, offset.x * k, offset.y * k, drawnW * k, drawnH * k);
    canvas.toBlob(
      (blob) => {
        if (!blob) return onCancel();
        onCropped(new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9
    );
  }

  return (
    <Modal title={t("crop.title")} onClose={onCancel}>
      <div className="flex flex-col items-center gap-4">
        <div
          ref={frameRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={`relative touch-none overflow-hidden bg-black ${shape === "circle" ? "rounded-full" : "rounded-lg"}`}
          style={{ width: FRAME_W, height: FRAME_H, cursor: "grab" }}
        >
          {img && (
            <img
              src={img.src}
              alt=""
              draggable={false}
              style={{
                position: "absolute",
                left: offset.x,
                top: offset.y,
                width: drawnW,
                height: drawnH,
                maxWidth: "none",
              }}
            />
          )}
        </div>

        <div className="flex w-full items-center gap-3">
          <span className="text-xs text-discord-muted">{t("crop.zoom")}</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="h-1.5 flex-1 accent-discord-accent"
          />
        </div>
        <p className="text-center text-xs text-discord-faint">{t("crop.hint")}</p>

        <div className="flex gap-2 self-end">
          <button onClick={onCancel} className="rounded px-4 py-2 text-sm text-discord-muted hover:bg-discord-hover hover:text-white">
            {t("common.cancel")}
          </button>
          <button onClick={confirm} className="rounded bg-discord-accent px-5 py-2 text-sm font-medium text-white hover:bg-discord-accentDark">
            {t("common.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
