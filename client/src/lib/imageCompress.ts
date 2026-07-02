// Client-side photo compression before upload. Phone photos are 5–10 MB;
// resized to ≤1600px JPEG @0.85 they drop to a few hundred KB with no visible
// loss in chat. Only shrinks when it actually helps; any failure → original.
const MAX_DIM = 1600;

export async function maybeCompressImage(file: File): Promise<File> {
  const lossy = /^image\/(jpeg|webp)$/.test(file.type) && file.size > 300_000;
  // PNGs are usually screenshots — keep them lossless unless they're huge.
  const hugePng = file.type === "image/png" && file.size > 1_500_000;
  if (!lossy && !hugePng) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * scale));
    const h = Math.max(1, Math.round(bmp.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
