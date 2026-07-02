// heic-convert ships no types. Minimal surface we use.
declare module "heic-convert" {
  export default function convert(options: {
    buffer: Buffer | Uint8Array;
    format: "JPEG" | "PNG";
    quality?: number; // 0..1, JPEG only
  }): Promise<Buffer>;
}
