// Renders tools/logo.svg into client/build/icon.{png,ico} for electron-builder.
// Run from the repo root: `node tools/make-icon.mjs`
import sharp from "sharp";
import pngToIco from "png-to-ico";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const svg = readFileSync(new URL("./logo.svg", import.meta.url));
mkdirSync("client/build", { recursive: true });

// 1024px master PNG (Linux icon + general use).
await sharp(svg).resize(1024, 1024).png().toFile("client/build/icon.png");

// Multi-resolution Windows .ico.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const buffers = await Promise.all(
  sizes.map((s) => sharp(svg).resize(s, s).png().toBuffer())
);
writeFileSync("client/build/icon.ico", await pngToIco(buffers));

console.log("✅ wrote client/build/icon.png and client/build/icon.ico");
